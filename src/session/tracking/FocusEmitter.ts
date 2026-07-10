/**
 * FocusEmitter - normalized focus-transition stream.
 *
 * Owns both tabs.onActivated and windows.onFocusChanged subscriptions and
 * emits a single stream of focus transitions. Deduplicates the Chrome
 * dual-fire pattern (windows.onFocusChanged + tabs.onActivated firing for
 * the same effective focus target) so downstream code never sees two
 * "gained focus" events for the same visit.
 *
 * Emission contract: exactly one FocusTransition per underlying transition
 * of the focused Visit. If a state change does not alter the focused Visit
 * id (e.g. Chrome's second dual-fire event for the same tab, or switching
 * to a tab that has no committed navigation yet when the previous focused
 * tab also had none) no event is emitted.
 *
 * Visit resolution: the emitter does not track navigations itself. It
 * delegates to a caller-supplied `resolveVisitForTab(tabId)` callback,
 * which returns the outbox event id of the most recent
 * webNavigation.onCommitted for that tab (or null if no navigation has
 * committed yet for that tab).
 *
 * When a new navigation commits on the currently focused tab, callers
 * invoke `notifyVisitChange(tabId, visitId)` so the emitter can re-emit
 * with the new visit id.
 */

import browserPolyfill from 'webextension-polyfill';
import { getBrowserAPI } from '../../utils/cross-browser';

type Browser = typeof browserPolyfill;
type TabActivateInfo = browserPolyfill.Tabs.OnActivatedActiveInfoType;

export interface FocusTransition {
  at: number;
  focused_visit: string | null;
}

export type FocusTransitionHandler = (event: FocusTransition) => void | Promise<void>;

export interface FocusEmitterOptions {
  /**
   * Resolve the durable visit id for a tab. Returns the outbox event id of
   * the most recent webNavigation.onCommitted for the given tab, or null if
   * no navigation has committed yet.
   */
  resolveVisitForTab: (tabId: number) => string | null;
  /**
   * Provides a monotonic timestamp in ms. Injectable for deterministic tests.
   * Defaults to Date.now.
   */
  now?: () => number;
  /**
   * Browser API. Defaults to the cross-browser polyfill.
   */
  browser?: Browser;
}

export class FocusEmitter {
  private readonly resolveVisitForTab: (tabId: number) => string | null;
  private readonly now: () => number;
  private readonly browser: Browser;

  private handlers: FocusTransitionHandler[] = [];
  private removeListeners: Array<() => void> = [];

  private focusedTabId: number | null = null;
  private focusedVisitId: string | null = null;
  private started = false;

  constructor(options: FocusEmitterOptions) {
    this.resolveVisitForTab = options.resolveVisitForTab;
    this.now = options.now ?? Date.now;
    this.browser = options.browser ?? (getBrowserAPI() as Browser);
  }

  onFocusTransition(handler: FocusTransitionHandler): () => void {
    this.handlers.push(handler);
    return () => {
      const idx = this.handlers.indexOf(handler);
      if (idx >= 0) this.handlers.splice(idx, 1);
    };
  }

  start(): void {
    if (this.started) return;

    const onActivated = (info: TabActivateInfo) => {
      void this.handleTabActivated(info);
    };
    this.browser.tabs.onActivated.addListener(onActivated);
    this.removeListeners.push(() => this.browser.tabs.onActivated.removeListener(onActivated));

    const onFocusChanged = (windowId: number) => {
      void this.handleWindowFocusChanged(windowId);
    };
    this.browser.windows.onFocusChanged.addListener(onFocusChanged);
    this.removeListeners.push(() => this.browser.windows.onFocusChanged.removeListener(onFocusChanged));

    this.started = true;
  }

  stop(): void {
    for (const remove of this.removeListeners) {
      try { remove(); } catch { /* listener may have been already removed */ }
    }
    this.removeListeners = [];
    this.started = false;
  }

  /**
   * Direct entry for tabs.onActivated. Public so tests can drive the state
   * machine deterministically.
   */
  async handleTabActivated(info: TabActivateInfo): Promise<void> {
    const visitId = this.resolveVisitForTab(info.tabId);
    await this.transitionTo(info.tabId, visitId);
  }

  /**
   * Direct entry for windows.onFocusChanged. Public so tests can drive the
   * state machine deterministically.
   */
  async handleWindowFocusChanged(windowId: number): Promise<void> {
    if (windowId === this.browser.windows.WINDOW_ID_NONE) {
      await this.transitionTo(null, null);
      return;
    }

    const activeTabs = await this.browser.tabs.query({ active: true, windowId });
    const active = activeTabs[0];
    if (!active || active.id === undefined) {
      // Window is focused but has no active tab we can resolve. Treat this
      // as "focus is on nothing we can name" — a null transition.
      await this.transitionTo(null, null);
      return;
    }

    const visitId = this.resolveVisitForTab(active.id);
    await this.transitionTo(active.id, visitId);
  }

  /**
   * Called by callers when a new navigation commits on a tab. If that tab
   * is currently focused, this re-emits with the new visit id.
   */
  async notifyVisitChange(tabId: number, visitId: string): Promise<void> {
    if (this.focusedTabId !== tabId) return;
    if (this.focusedVisitId === visitId) return;

    this.focusedVisitId = visitId;
    await this.emit({ at: this.now(), focused_visit: visitId });
  }

  private async transitionTo(tabId: number | null, visitId: string | null): Promise<void> {
    // Dedup rule: emit only when the focused *visit* changes. Same-visit
    // dual-fire (Chrome's onFocusChanged + onActivated for the same tab)
    // therefore produces exactly one emission — the first one to arrive.
    if (this.focusedVisitId === visitId && this.focusedTabId === tabId) return;
    if (this.focusedVisitId === visitId) {
      // Tab id changed but resolved visit didn't (e.g. both tabs have no
      // committed navigation yet, so both resolve to null). Update internal
      // tab pointer but don't emit — downstream cares about visits.
      this.focusedTabId = tabId;
      return;
    }

    this.focusedTabId = tabId;
    this.focusedVisitId = visitId;
    await this.emit({ at: this.now(), focused_visit: visitId });
  }

  private async emit(event: FocusTransition): Promise<void> {
    for (const handler of this.handlers) {
      await handler(event);
    }
  }
}
