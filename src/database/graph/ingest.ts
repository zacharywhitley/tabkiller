/**
 * Graph ingest pipeline. Drains events from the `LocalEventStore` outbox,
 * transforms them via the per-event-type functions in `transformers.ts`,
 * and applies the resulting `GraphWriteBatch` atomically to the
 * `GraphStore`.
 *
 * Ownership:
 *   - Opener buffer: `Map<browserTabId, { openerVisitId, expiresAt }>`
 *     populated by `tab_created` and consumed by the child tab's first
 *     `navigation_committed`.
 *   - Search buffer: same shape, populated when a navigation lands on a
 *     recognised search-results URL and consumed by the tab's next
 *     `navigation_committed` to emit `arrived_via`.
 *   - `currentlyFocusedVisitId`: pointer into the visit whose trailing
 *     focus interval should close on the next `focus_transition`.
 *   - `currentSessionId`: pointer into the active Session, so navigation
 *     transformers can emit `in_session` edges.
 *   - `latestVisitByTab`: last committed Visit id per browser tab. Also
 *     tracked by the service worker; both copies stay in sync because
 *     navigation transforms happen in outbox order.
 *
 * Drain concurrency: only one drain runs at a time. `drainSoon()`
 * debounces to ~500ms so hot writes coalesce.
 */

import type { LocalEventStore } from '../../storage/LocalEventStore';
import type { BrowsingEvent } from '../../shared/types';
import type { GraphStore } from './store';
import type {
  DomainNode,
  IntervalEdge,
  PageNode,
  SearchQueryNode,
  SessionNode,
  TabNode,
  TagNode,
  VisitNode,
  WindowNode,
} from './types';
import { transformEvent, type IngestContext } from './transformers';

/**
 * Buffered opener/search entries expire after this many milliseconds. A
 * miss after expiry drops the edge silently — the user opened the child
 * tab a long time ago and the graph does not attempt to re-associate it.
 */
const BUFFER_EXPIRY_MS = 60_000;

const DRAIN_SOON_DEBOUNCE_MS = 500;

export const GRAPH_INGEST_ALARM_NAME = 'graph-ingest';

interface BufferedEntry {
  value: string;
  expiresAt: number;
}

export interface GraphIngestOptions {
  outbox: LocalEventStore;
  graph: GraphStore;
  /** Injectable clock — tests use a fake to avoid setTimeout tangles. */
  now?: () => number;
  /** Injectable debounce timer — tests replace with synchronous scheduler. */
  scheduleDebounced?: (fn: () => void, ms: number) => void;
}

export class GraphIngest {
  private readonly outbox: LocalEventStore;
  private readonly graph: GraphStore;
  private readonly now: () => number;
  private readonly scheduleDebounced: (fn: () => void, ms: number) => void;

  private draining = false;
  private drainScheduled = false;
  private lastDrainAt = 0;

  // Ingest-owned in-memory state. Not persisted — the outbox is the
  // source of truth and drain reads always start from an outbox pointer.
  private readonly openerBuffer = new Map<number, BufferedEntry>();
  private readonly searchBuffer = new Map<number, BufferedEntry>();
  private latestVisitByTab = new Map<number, string>();
  private currentlyFocusedVisitId: string | null = null;
  private currentSessionId: string | null = null;

  constructor(options: GraphIngestOptions) {
    this.outbox = options.outbox;
    this.graph = options.graph;
    this.now = options.now ?? Date.now;
    this.scheduleDebounced = options.scheduleDebounced
      ?? ((fn, ms) => { setTimeout(fn, ms); });
  }

  /**
   * Prime in-memory pointers from the graph before the first drain. Lets
   * the pipeline resume after a service-worker restart without losing the
   * "which session is active" and "which visits are active" state.
   */
  async initialize(): Promise<void> {
    // Latest un-ended Session, if any.
    const sessions = await this.graph.nodesOfType<SessionNode>('Session');
    const activeSessions = sessions.filter((s) => s.ended_at === null);
    if (activeSessions.length > 0) {
      activeSessions.sort((a, b) => b.started_at - a.started_at);
      this.currentSessionId = activeSessions[0].id;
    }

    // Latest Visit per browser tab, so navigation_committed transforms can
    // resolve navigated_from. We reconstruct this from the graph rather
    // than trusting the service worker's runtime map — the ingest may be
    // started fresh in a test with no service worker at all.
    const visits = await this.graph.nodesOfType<VisitNode>('Visit');
    const visitByTab = new Map<number, VisitNode>();
    for (const visit of visits) {
      const tabEdges = await this.graph.outInterval(visit.id, 'in_tab');
      for (const edge of tabEdges) {
        const tab = await this.graph.getNode<TabNode>(edge.to_id);
        if (!tab) continue;
        const current = visitByTab.get(tab.browser_tab_id);
        if (!current || current.at_time < visit.at_time) {
          visitByTab.set(tab.browser_tab_id, visit);
        }
      }
    }
    for (const [browserTabId, visit] of visitByTab) {
      this.latestVisitByTab.set(browserTabId, visit.id);
    }
  }

  /**
   * Drain the outbox: transform every pending event and write the resulting
   * batch atomically. Errors during a single event's transform or write are
   * logged and the event stays in the outbox for retry on the next drain.
   * Subsequent events in the same drain still process.
   */
  async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      const batches = await this.outbox.pendingBatches();
      const drainedIds: string[] = [];
      for (const batch of batches) {
        for (const event of batch.events) {
          try {
            await this.applyEvent(event);
            drainedIds.push(event.id);
          } catch (error) {
            console.warn('graph ingest: event transform failed, leaving in outbox', {
              eventId: event.id,
              type: event.type,
              error: error instanceof Error ? error.message : String(error),
            });
            // Do NOT push to drainedIds — the event retries next tick.
          }
        }
      }
      if (drainedIds.length > 0) {
        await this.outbox.markDrained(drainedIds);
      }
      this.lastDrainAt = this.now();
    } finally {
      this.draining = false;
    }
  }

  /**
   * Debounced drain kick. Called from the service worker after every event
   * append so hot writes don't wait for the alarm; multiple calls within
   * ~500ms coalesce into a single drain.
   */
  drainSoon(): void {
    if (this.drainScheduled) return;
    this.drainScheduled = true;
    this.scheduleDebounced(() => {
      this.drainScheduled = false;
      void this.drain();
    }, DRAIN_SOON_DEBOUNCE_MS);
  }

  /**
   * Trigger a drain from a `chrome.alarms` handler. Kept as a distinct
   * entry so tests can dispatch alarms without touching setTimeout.
   */
  async runAlarm(): Promise<void> {
    await this.drain();
  }

  // ---- Per-event pipeline ----

  private async applyEvent(event: BrowsingEvent): Promise<void> {
    const context = this.makeContext();
    const batch = await transformEvent(event, context);

    if ((batch.nodes && batch.nodes.length > 0) || (batch.edges && batch.edges.length > 0)) {
      await this.graph.writeBatch(batch);
    }

    // Side-effects after a successful write. `navigation_committed` updates
    // the tab -> latest visit pointer — otherwise the very same drain's
    // subsequent focus_transition for the same tab would resolve to the
    // wrong visit.
    if (event.type === 'navigation_committed' && event.tabId !== undefined) {
      this.latestVisitByTab.set(event.tabId, `visit_${event.id}`);
    }
  }

  private makeContext(): IngestContext {
    return {
      now: () => this.now(),

      previousVisitInTab: (browserTabId) => this.latestVisitByTab.get(browserTabId) ?? null,
      consumeOpenerBuffer: (browserTabId) => this.consumeBuffer(this.openerBuffer, browserTabId),
      putOpenerBuffer: (browserTabId, openerVisitId) => this.putBuffer(this.openerBuffer, browserTabId, openerVisitId),
      consumeSearchBuffer: (browserTabId) => this.consumeBuffer(this.searchBuffer, browserTabId),
      putSearchBuffer: (browserTabId, searchQueryId) => this.putBuffer(this.searchBuffer, browserTabId, searchQueryId),
      currentSessionId: () => this.currentSessionId,
      setCurrentSessionId: (id) => { this.currentSessionId = id; },
      currentlyFocusedVisitId: () => this.currentlyFocusedVisitId,
      setCurrentlyFocusedVisitId: (id) => { this.currentlyFocusedVisitId = id; },

      findPage: (normalizedUrl) => this.findNode<PageNode>(
        () => this.graph.nodeByPageUrl(normalizedUrl),
        'Page',
      ),
      findDomain: (hostname) => this.findNode<DomainNode>(
        () => this.graph.nodeByDomainHostname(hostname),
        'Domain',
      ),
      findTag: (slug) => this.findNode<TagNode>(
        () => this.graph.nodeByTagSlug(slug),
        'Tag',
      ),
      findVisit: (visitId) => this.graph.getNode<VisitNode>(visitId),
      findSession: (sessionId) => this.graph.getNode<SessionNode>(sessionId),
      findWindow: (windowId) => this.graph.getNode<WindowNode>(windowId),
      findSearchQuery: (searchQueryId) => this.graph.getNode<SearchQueryNode>(searchQueryId),
      findTabByBrowserTabId: (browserTabId) => this.findNode<TabNode>(
        () => this.graph.nodeByBrowserTabId(browserTabId),
        'Tab',
      ),

      activeIntervalEdgesFromVisit: async (visitId) => {
        const [ofPage, inTab, inSession] = await Promise.all([
          this.graph.outInterval(visitId, 'of_page'),
          this.graph.outInterval(visitId, 'in_tab'),
          this.graph.outInterval(visitId, 'in_session'),
        ]);
        return [...ofPage, ...inTab, ...inSession];
      },
      activeInSessionEdgesForSession: async (sessionId) => this.graph.inInterval(sessionId, 'in_session'),
      activeInWindowEdgeForTab: async (tabId) => {
        const edges = await this.graph.outInterval(tabId, 'in_window');
        return edges[0];
      },
      activeVisits: async () => {
        const visits = await this.graph.nodesOfType<VisitNode>('Visit');
        return visits.filter((v) => v.ended_at === null);
      },

      warn: (message, ctx) => {
        // Structured log; console.warn accepts a string + arbitrary payload.
        console.warn(`graph ingest: ${message}`, ctx);
      },
    };
  }

  /**
   * The store's identity-index lookups (nodeByPageUrl, etc.) return
   * `AnyNode | undefined`. Narrow to the expected node type; drop
   * mismatches on the floor — that would only happen if two node types
   * shared a keyPath, which the schema forbids.
   */
  private async findNode<T extends { type: string }>(
    lookup: () => Promise<{ type: string } | undefined>,
    expectedType: string,
  ): Promise<T | undefined> {
    const node = await lookup();
    if (!node) return undefined;
    if (node.type !== expectedType) return undefined;
    return node as T;
  }

  private putBuffer(buffer: Map<number, BufferedEntry>, key: number, value: string): void {
    this.pruneExpired(buffer);
    buffer.set(key, { value, expiresAt: this.now() + BUFFER_EXPIRY_MS });
  }

  private consumeBuffer(buffer: Map<number, BufferedEntry>, key: number): string | null {
    this.pruneExpired(buffer);
    const entry = buffer.get(key);
    if (!entry) return null;
    buffer.delete(key);
    return entry.value;
  }

  private pruneExpired(buffer: Map<number, BufferedEntry>): void {
    const now = this.now();
    for (const [key, entry] of buffer) {
      if (entry.expiresAt <= now) buffer.delete(key);
    }
  }

  // ---- Test-only accessors ----

  /** For tests: the last time `drain()` completed. Zero until the first drain. */
  getLastDrainAt(): number {
    return this.lastDrainAt;
  }
}
