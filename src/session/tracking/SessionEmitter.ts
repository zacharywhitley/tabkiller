/**
 * SessionEmitter — writes `session_started` and `session_ended` outbox
 * events for the graph ingest pipeline.
 *
 * The heavier `SessionDetectionEngine` (from the user-interface epic)
 * runs a full signal-fusion / pattern-learning pipeline. That is
 * overkill for the graph capture layer, which needs three things:
 *
 *   1. Every SW session boundary is materialized as a `session_started`
 *      + eventual `session_ended` event pair the graph transformer can
 *      consume.
 *   2. The transformer's `ctx.currentSessionId()` is populated so
 *      `navigation_committed` can emit the `in_session` interval edge.
 *   3. Idle boundaries are detected without asking for a new manifest
 *      permission (`chrome.idle` is not currently granted).
 *
 * We derive idleness from the same outbox activity we're already
 * writing — every capture entry calls `noteActivity()` and the emitter
 * decides whether the gap exceeds the idle threshold. A gap ≥ threshold
 * closes the previous session (ended_at = last activity) and opens a
 * new one (started_at = current activity, detected_by = 'idle').
 *
 * SW startup: emit `session_started` immediately with
 * `detected_by = 'session_restore'`. If a previous session was still
 * open in the graph, the ingest's `initialize()` already primed
 * `currentSessionId`; the transformer treats the new emission as a
 * fresh session in a new-boundary sense, which matches user intent
 * ("a new browser start is a new session").
 */

import type { BrowsingEvent } from '../../shared/types';
import type { LocalEventStore } from '../../storage/LocalEventStore';

/**
 * Default idle gap that triggers a new session. Fifteen minutes matches
 * the informal "I got up and came back" threshold most users describe.
 */
export const DEFAULT_IDLE_GAP_MS = 15 * 60 * 1000;

export type SessionDetectedBy =
  | 'idle'
  | 'domain_shift'
  | 'manual'
  | 'session_restore';

/**
 * Persistence for the currently-open session across service-worker
 * teardowns. Injectable so tests can substitute an in-memory impl
 * (or `null` to disable persistence entirely and get the pre-fix
 * behaviour).
 */
export interface SessionPersistence {
  load(): Promise<CurrentSession | null>;
  save(session: CurrentSession): Promise<void>;
  clear(): Promise<void>;
}

export interface SessionEmitterOptions {
  outbox: LocalEventStore;
  /** Injectable clock for deterministic tests. Defaults to Date.now. */
  now?: () => number;
  /** Idle-gap threshold in ms. Defaults to 15 minutes. */
  idleGapMs?: number;
  /** Callback invoked after every emit so callers can drain the outbox. */
  onEmit?: () => void;
  /**
   * Persistence for the current session across SW wakes. Omit for tests
   * that want the pre-persistence behaviour; the SW wires the
   * chrome.storage.local-backed impl exported below.
   */
  persistence?: SessionPersistence | null;
  /**
   * Debounce for save() calls fired from noteActivity(). Defaults to 30s
   * so a tight loop of capture events doesn't hammer chrome.storage.
   */
  activityPersistDebounceMs?: number;
}

interface CurrentSession {
  eventId: string;
  startedAt: number;
  lastActivityAt: number;
  detectedBy: SessionDetectedBy;
}

const DEFAULT_ACTIVITY_PERSIST_DEBOUNCE_MS = 30 * 1000;

/**
 * chrome.storage.local-backed session persistence. Used by the
 * service worker so wake-up adopts the in-flight session instead of
 * opening a new session_restore session on every wake.
 */
export const chromeStorageSessionPersistence: SessionPersistence = {
  async load() {
    try {
      const res = await chrome.storage.local.get('tk:currentSession');
      const val = (res as Record<string, unknown>)['tk:currentSession'];
      if (
        val && typeof val === 'object' &&
        typeof (val as CurrentSession).eventId === 'string' &&
        typeof (val as CurrentSession).startedAt === 'number' &&
        typeof (val as CurrentSession).lastActivityAt === 'number'
      ) {
        return val as CurrentSession;
      }
      return null;
    } catch {
      return null;
    }
  },
  async save(session: CurrentSession) {
    try {
      await chrome.storage.local.set({ 'tk:currentSession': session });
    } catch {
      // storage failure is non-fatal — we lose persistence
      // correctness this wake but keep working.
    }
  },
  async clear() {
    try {
      await chrome.storage.local.remove('tk:currentSession');
    } catch {
      // ignore
    }
  },
};

function generateEventId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export class SessionEmitter {
  private readonly outbox: LocalEventStore;
  private readonly now: () => number;
  private readonly idleGapMs: number;
  private readonly onEmit: () => void;
  private readonly persistence: SessionPersistence | null;
  private readonly activityPersistDebounceMs: number;
  // Last time we persisted lastActivityAt; keeps the noteActivity
  // hot path from hammering chrome.storage on every capture event.
  private lastPersistAt = 0;

  private currentSession: CurrentSession | null = null;

  constructor(options: SessionEmitterOptions) {
    this.outbox = options.outbox;
    this.now = options.now ?? Date.now;
    this.idleGapMs = options.idleGapMs ?? DEFAULT_IDLE_GAP_MS;
    this.onEmit = options.onEmit ?? (() => {});
    this.persistence = options.persistence ?? null;
    this.activityPersistDebounceMs =
      options.activityPersistDebounceMs ?? DEFAULT_ACTIVITY_PERSIST_DEBOUNCE_MS;
  }

  /**
   * Start a fresh session. Called on SW init with
   * `detected_by = 'session_restore'`. Safe to call more than once —
   * the second call closes the first session cleanly then opens a new
   * one.
   *
   * If a `persistence` was supplied and it has a stored session, we
   * ADOPT it as our currentSession without emitting a new
   * session_started event. This is the whole point of the persistence
   * layer: MV3 tears down the service worker constantly and this
   * would otherwise open a session_restore session on every wake.
   * The natural noteActivity() path handles the idle-gap case if the
   * SW was down long enough — it closes the resumed session at its
   * lastActivityAt and opens a new one with detected_by='idle'.
   */
  async start(detectedBy: SessionDetectedBy = 'session_restore'): Promise<string> {
    if (this.persistence) {
      const resumed = await this.persistence.load();
      if (resumed) {
        this.currentSession = { ...resumed };
        this.lastPersistAt = this.now();
        return resumed.eventId;
      }
    }
    if (this.currentSession) {
      await this.endCurrent(this.now());
    }
    return this.openNew(this.now(), detectedBy);
  }

  /**
   * Note that a capture event just landed. If the gap since the last
   * activity exceeds the idle threshold, close the previous session
   * (at last-activity time) and open a new one (at now, detected_by
   * = 'idle'). Otherwise just advance the last-activity pointer.
   *
   * Idempotent w.r.t. bootstrap: if no session is open yet, this
   * opens one — useful when a peer emitter has not yet primed the
   * state (e.g. tests that skip `start()`).
   */
  async noteActivity(timestamp: number): Promise<void> {
    if (!this.currentSession) {
      await this.openNew(timestamp, 'session_restore');
      return;
    }

    const gap = timestamp - this.currentSession.lastActivityAt;
    if (gap >= this.idleGapMs) {
      const boundary = this.currentSession.lastActivityAt;
      await this.endCurrent(boundary);
      await this.openNew(timestamp, 'idle');
      return;
    }

    this.currentSession.lastActivityAt = timestamp;
    // Debounced persistence — a busy capture stream would otherwise
    // hit chrome.storage on every event. 30s of stale lastActivityAt
    // is inconsequential vs. a 15-minute idle threshold.
    if (
      this.persistence &&
      timestamp - this.lastPersistAt >= this.activityPersistDebounceMs
    ) {
      this.lastPersistAt = timestamp;
      void this.persistence.save({ ...this.currentSession });
    }
  }

  /**
   * End the current session at the specified timestamp. Used by the
   * SW shutdown path or by the manual "end session" action.
   */
  async endManual(timestamp: number): Promise<void> {
    if (!this.currentSession) return;
    await this.endCurrent(timestamp);
  }

  /**
   * The session_started event id for the currently open session, or
   * `null` if none is open. Callers use this to correlate manual tag
   * applications with a specific session.
   */
  currentSessionEventId(): string | null {
    return this.currentSession?.eventId ?? null;
  }

  private async openNew(timestamp: number, detectedBy: SessionDetectedBy): Promise<string> {
    const eventId = generateEventId('session');
    const event: BrowsingEvent = {
      id: eventId,
      timestamp,
      type: 'session_started',
      sessionId: '',
      metadata: {
        detectedBy,
      },
    };
    await this.outbox.storeEvent(event);
    this.currentSession = {
      eventId,
      startedAt: timestamp,
      lastActivityAt: timestamp,
      detectedBy,
    };
    if (this.persistence) {
      this.lastPersistAt = timestamp;
      void this.persistence.save({ ...this.currentSession });
    }
    this.onEmit();
    return eventId;
  }

  private async endCurrent(timestamp: number): Promise<void> {
    if (!this.currentSession) return;
    const event: BrowsingEvent = {
      id: generateEventId('sessend'),
      timestamp,
      type: 'session_ended',
      sessionId: '',
      metadata: {
        sessionNodeId: `session_${this.currentSession.eventId}`,
      },
    };
    await this.outbox.storeEvent(event);
    this.currentSession = null;
    if (this.persistence) {
      void this.persistence.clear();
    }
    this.onEmit();
  }
}
