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

export interface SessionEmitterOptions {
  outbox: LocalEventStore;
  /** Injectable clock for deterministic tests. Defaults to Date.now. */
  now?: () => number;
  /** Idle-gap threshold in ms. Defaults to 15 minutes. */
  idleGapMs?: number;
  /** Callback invoked after every emit so callers can drain the outbox. */
  onEmit?: () => void;
}

interface CurrentSession {
  eventId: string;
  startedAt: number;
  lastActivityAt: number;
  detectedBy: SessionDetectedBy;
}

function generateEventId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export class SessionEmitter {
  private readonly outbox: LocalEventStore;
  private readonly now: () => number;
  private readonly idleGapMs: number;
  private readonly onEmit: () => void;

  private currentSession: CurrentSession | null = null;

  constructor(options: SessionEmitterOptions) {
    this.outbox = options.outbox;
    this.now = options.now ?? Date.now;
    this.idleGapMs = options.idleGapMs ?? DEFAULT_IDLE_GAP_MS;
    this.onEmit = options.onEmit ?? (() => {});
  }

  /**
   * Start a fresh session. Called on SW init with
   * `detected_by = 'session_restore'`. Safe to call more than once —
   * the second call closes the first session cleanly then opens a new
   * one.
   */
  async start(detectedBy: SessionDetectedBy = 'session_restore'): Promise<string> {
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
    this.onEmit();
  }
}
