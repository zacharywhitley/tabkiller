/**
 * Tests for FocusEmitter — normalized focus-transition state machine.
 *
 * Verifies:
 * - Chrome dual-fire (windows.onFocusChanged + tabs.onActivated for the same
 *   effective focus target) produces exactly one emission.
 * - Firefox WINDOW_ID_NONE blip during window switching produces a null
 *   transition and then a new-visit transition (state-based dedup emits on
 *   real state changes only).
 * - notifyVisitChange for the focused tab emits a new transition; for a
 *   non-focused tab is a no-op.
 * - A window focus change to a window with no resolvable active tab emits
 *   a null transition.
 * - Same-visit transitions (both tabs have null resolution, or same visit)
 *   are deduped.
 */

import { FocusEmitter, FocusTransition } from '../FocusEmitter';

const WINDOW_ID_NONE = -1;

function makeMockBrowser(activeTabsByWindow: Record<number, { id: number }[]> = {}) {
  const activatedListeners: Array<(info: { tabId: number; windowId: number }) => void> = [];
  const focusChangedListeners: Array<(windowId: number) => void> = [];

  return {
    api: {
      tabs: {
        onActivated: {
          addListener: (fn: (info: { tabId: number; windowId: number }) => void) => {
            activatedListeners.push(fn);
          },
          removeListener: (fn: (info: { tabId: number; windowId: number }) => void) => {
            const idx = activatedListeners.indexOf(fn);
            if (idx >= 0) activatedListeners.splice(idx, 1);
          }
        },
        query: jest.fn(async ({ windowId }: { active: boolean; windowId: number }) => {
          return activeTabsByWindow[windowId] ?? [];
        })
      },
      windows: {
        WINDOW_ID_NONE,
        onFocusChanged: {
          addListener: (fn: (windowId: number) => void) => {
            focusChangedListeners.push(fn);
          },
          removeListener: (fn: (windowId: number) => void) => {
            const idx = focusChangedListeners.indexOf(fn);
            if (idx >= 0) focusChangedListeners.splice(idx, 1);
          }
        }
      }
    },
    fireTabActivated: async (info: { tabId: number; windowId: number }) => {
      for (const l of activatedListeners) await l(info);
    },
    fireWindowFocusChanged: async (windowId: number) => {
      for (const l of focusChangedListeners) await l(windowId);
    },
    activatedListeners,
    focusChangedListeners
  };
}

describe('FocusEmitter', () => {
  let mockNow: number;

  const advance = (ms: number) => {
    mockNow += ms;
  };

  const captured: FocusTransition[] = [];
  const capture = (event: FocusTransition) => {
    captured.push(event);
  };

  beforeEach(() => {
    mockNow = 1_000;
    captured.length = 0;
  });

  it('emits a single "gained focus" event when both onFocusChanged and onActivated fire for the same tab (Chrome dual-fire)', async () => {
    const visits = new Map<number, string>([[42, 'visit_v1']]);
    const mock = makeMockBrowser({ 7: [{ id: 42 }] });

    const emitter = new FocusEmitter({
      resolveVisitForTab: (tabId) => visits.get(tabId) ?? null,
      now: () => mockNow,
      browser: mock.api as any
    });
    emitter.onFocusTransition(capture);
    emitter.start();

    // Chrome fires onFocusChanged first, then onActivated for the same tab.
    await mock.fireWindowFocusChanged(7);
    advance(5);
    await mock.fireTabActivated({ tabId: 42, windowId: 7 });

    expect(captured).toEqual([{ at: 1_000, focused_visit: 'visit_v1', focused_tab_id: 42 }]);
  });

  it('emits two transitions across Firefox WINDOW_ID_NONE blip: one null and one new-visit', async () => {
    const visits = new Map<number, string>([[10, 'visit_a'], [20, 'visit_b']]);
    const mock = makeMockBrowser({ 1: [{ id: 10 }], 2: [{ id: 20 }] });

    const emitter = new FocusEmitter({
      resolveVisitForTab: (tabId) => visits.get(tabId) ?? null,
      now: () => mockNow,
      browser: mock.api as any
    });
    emitter.onFocusTransition(capture);
    emitter.start();

    // Start focused on window 1 / tab 10.
    await mock.fireWindowFocusChanged(1);
    expect(captured).toEqual([{ at: 1_000, focused_visit: 'visit_a', focused_tab_id: 10 }]);

    // Firefox switches windows: NONE blip, then new window focused.
    advance(10);
    await mock.fireWindowFocusChanged(WINDOW_ID_NONE);
    advance(30);
    await mock.fireWindowFocusChanged(2);

    expect(captured).toEqual([
      { at: 1_000, focused_visit: 'visit_a', focused_tab_id: 10 },
      { at: 1_010, focused_visit: null, focused_tab_id: null },
      { at: 1_040, focused_visit: 'visit_b', focused_tab_id: 20 }
    ]);
  });

  it('emits null when the browser fully loses focus (WINDOW_ID_NONE)', async () => {
    const visits = new Map<number, string>([[99, 'visit_x']]);
    const mock = makeMockBrowser({ 3: [{ id: 99 }] });

    const emitter = new FocusEmitter({
      resolveVisitForTab: (tabId) => visits.get(tabId) ?? null,
      now: () => mockNow,
      browser: mock.api as any
    });
    emitter.onFocusTransition(capture);
    emitter.start();

    await mock.fireTabActivated({ tabId: 99, windowId: 3 });
    advance(50);
    await mock.fireWindowFocusChanged(WINDOW_ID_NONE);

    expect(captured).toEqual([
      { at: 1_000, focused_visit: 'visit_x', focused_tab_id: 99 },
      { at: 1_050, focused_visit: null, focused_tab_id: null }
    ]);
  });

  it('does not double-emit when the same tab is re-activated', async () => {
    const visits = new Map<number, string>([[5, 'visit_same']]);
    const mock = makeMockBrowser({ 1: [{ id: 5 }] });

    const emitter = new FocusEmitter({
      resolveVisitForTab: (tabId) => visits.get(tabId) ?? null,
      now: () => mockNow,
      browser: mock.api as any
    });
    emitter.onFocusTransition(capture);
    emitter.start();

    await mock.fireTabActivated({ tabId: 5, windowId: 1 });
    await mock.fireTabActivated({ tabId: 5, windowId: 1 });
    await mock.fireTabActivated({ tabId: 5, windowId: 1 });

    expect(captured).toEqual([{ at: 1_000, focused_visit: 'visit_same', focused_tab_id: 5 }]);
  });

  it('deduplicates when switching to a tab whose resolved visit is the same (e.g. both have no committed navigation)', async () => {
    // Two brand-new tabs, neither has a webNavigation.onCommitted event yet.
    const visits = new Map<number, string>();
    const mock = makeMockBrowser();

    const emitter = new FocusEmitter({
      resolveVisitForTab: (tabId) => visits.get(tabId) ?? null,
      now: () => mockNow,
      browser: mock.api as any
    });
    emitter.onFocusTransition(capture);
    emitter.start();

    // Start with nothing focused → activate tab A (no visit) → activate tab B (no visit).
    await mock.fireTabActivated({ tabId: 100, windowId: 1 });
    advance(20);
    await mock.fireTabActivated({ tabId: 200, windowId: 1 });

    // No emissions: the focused visit was null and remains null throughout.
    expect(captured).toEqual([]);
  });

  it('notifyVisitChange emits a new transition when the currently focused tab gets a new visit', async () => {
    const visits = new Map<number, string>([[42, 'visit_old']]);
    const mock = makeMockBrowser({ 1: [{ id: 42 }] });

    const emitter = new FocusEmitter({
      resolveVisitForTab: (tabId) => visits.get(tabId) ?? null,
      now: () => mockNow,
      browser: mock.api as any
    });
    emitter.onFocusTransition(capture);
    emitter.start();

    await mock.fireTabActivated({ tabId: 42, windowId: 1 });
    expect(captured).toEqual([{ at: 1_000, focused_visit: 'visit_old', focused_tab_id: 42 }]);

    // Simulate the webNavigation.onCommitted flow: visit map updates, then
    // notifyVisitChange fires. Emitter should re-emit with the new visit id.
    advance(500);
    visits.set(42, 'visit_new');
    await emitter.notifyVisitChange(42, 'visit_new');

    expect(captured).toEqual([
      { at: 1_000, focused_visit: 'visit_old', focused_tab_id: 42 },
      { at: 1_500, focused_visit: 'visit_new', focused_tab_id: 42 }
    ]);
  });

  it('notifyVisitChange is a no-op for a non-focused tab', async () => {
    const visits = new Map<number, string>([[42, 'visit_focused']]);
    const mock = makeMockBrowser({ 1: [{ id: 42 }] });

    const emitter = new FocusEmitter({
      resolveVisitForTab: (tabId) => visits.get(tabId) ?? null,
      now: () => mockNow,
      browser: mock.api as any
    });
    emitter.onFocusTransition(capture);
    emitter.start();

    await mock.fireTabActivated({ tabId: 42, windowId: 1 });
    expect(captured).toHaveLength(1);

    advance(100);
    // Some other, unfocused, background tab gets a navigation.
    await emitter.notifyVisitChange(99, 'visit_unrelated');

    expect(captured).toHaveLength(1);
  });

  it('emits null when window focus targets a window whose active tab cannot be resolved', async () => {
    // Window 42 exists but has no active tab in our mock query result.
    const visits = new Map<number, string>();
    const mock = makeMockBrowser({});

    const emitter = new FocusEmitter({
      resolveVisitForTab: (tabId) => visits.get(tabId) ?? null,
      now: () => mockNow,
      browser: mock.api as any
    });
    emitter.onFocusTransition(capture);
    emitter.start();

    // Set up a real focus first so we can observe transitions.
    visits.set(1, 'visit_start');
    await emitter.handleTabActivated({ tabId: 1, windowId: 999 });
    expect(captured).toEqual([{ at: 1_000, focused_visit: 'visit_start', focused_tab_id: 1 }]);

    advance(30);
    await mock.fireWindowFocusChanged(42);

    expect(captured).toEqual([
      { at: 1_000, focused_visit: 'visit_start', focused_tab_id: 1 },
      { at: 1_030, focused_visit: null, focused_tab_id: null }
    ]);
  });

  it('stop() removes both browser listeners', () => {
    const mock = makeMockBrowser();
    const emitter = new FocusEmitter({
      resolveVisitForTab: () => null,
      now: () => mockNow,
      browser: mock.api as any
    });
    emitter.start();
    expect(mock.activatedListeners).toHaveLength(1);
    expect(mock.focusChangedListeners).toHaveLength(1);

    emitter.stop();
    expect(mock.activatedListeners).toHaveLength(0);
    expect(mock.focusChangedListeners).toHaveLength(0);
  });

  it('start() is idempotent — a second call does not double-register listeners', () => {
    const mock = makeMockBrowser();
    const emitter = new FocusEmitter({
      resolveVisitForTab: () => null,
      now: () => mockNow,
      browser: mock.api as any
    });
    emitter.start();
    emitter.start();
    expect(mock.activatedListeners).toHaveLength(1);
    expect(mock.focusChangedListeners).toHaveLength(1);
  });

  it('unsubscribe returned by onFocusTransition stops delivery to that handler', async () => {
    const visits = new Map<number, string>([[1, 'v1'], [2, 'v2']]);
    const mock = makeMockBrowser();
    const emitter = new FocusEmitter({
      resolveVisitForTab: (tabId) => visits.get(tabId) ?? null,
      now: () => mockNow,
      browser: mock.api as any
    });
    const unsubscribe = emitter.onFocusTransition(capture);
    emitter.start();

    await emitter.handleTabActivated({ tabId: 1, windowId: 1 });
    expect(captured).toHaveLength(1);

    unsubscribe();
    advance(50);
    await emitter.handleTabActivated({ tabId: 2, windowId: 1 });
    expect(captured).toHaveLength(1);
  });
});
