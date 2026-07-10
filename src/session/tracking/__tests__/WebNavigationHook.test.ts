/**
 * Tests for the webNavigation.onCommitted capture path in the background
 * service worker.
 *
 * Verifies:
 * - The listener is registered with the http/https scheme filter.
 * - A committed navigation on the top frame produces an outbox event whose
 *   payload includes tabId, url, transitionType, transitionQualifiers,
 *   frameId, and a timestamp.
 * - Sub-frame navigations (frameId != 0) are ignored — they are not
 *   user-visible visits.
 * - The tab -> latest visit id index is updated on every top-frame
 *   commit, so subsequent focus transitions and opener resolutions can
 *   name the durable Visit.
 * - Failure to append to the outbox does not update the visit index.
 *
 * The test loads the same LocalEventStore that the production code uses
 * (no mock service). We spy on storeEvent so we can inspect the emitted
 * events without exercising the whole batch/persist pipeline.
 */

import { BrowsingEvent } from '../../../shared/types';

type CommittedDetails = chrome.webNavigation.WebNavigationTransitionCallbackDetails;
type CommittedListener = (details: CommittedDetails) => void | Promise<void>;
type CommittedFilter = chrome.events.UrlFilter[] | undefined;

interface RegisteredCommittedHook {
  listener: CommittedListener;
  filter?: { url?: CommittedFilter };
}

let registeredCommittedHook: RegisteredCommittedHook | undefined;
let addListenerCalls: Array<{ listener: CommittedListener; filter?: { url?: CommittedFilter } }> = [];

const focusEmitterInstances: Array<{
  handlers: Array<(t: any) => Promise<void>>;
  notifyVisitChange: jest.Mock;
  onFocusTransition: jest.Mock;
  start: jest.Mock;
}> = [];

jest.mock('../../../utils/cross-browser', () => {
  const noopListener = { addListener: jest.fn(), removeListener: jest.fn() };
  return {
    getBrowserAPI: () => ({
      webNavigation: {
        onCommitted: {
          addListener: (listener: CommittedListener, filter?: { url?: CommittedFilter }) => {
            registeredCommittedHook = { listener, filter };
            addListenerCalls.push({ listener, filter });
          }
        }
      },
      tabs: {
        onCreated: noopListener,
        onUpdated: noopListener,
        onRemoved: noopListener,
        onActivated: noopListener,
        query: jest.fn(async () => [])
      },
      windows: {
        WINDOW_ID_NONE: -1,
        onCreated: noopListener,
        onRemoved: noopListener,
        onFocusChanged: noopListener
      },
      runtime: {
        onStartup: noopListener,
        onInstalled: noopListener
      },
      contextMenus: {
        create: jest.fn(),
        onClicked: noopListener
      }
    }),
    detectBrowser: () => 'chrome',
    isManifestV3: () => true,
    tabs: {
      getAll: jest.fn(async () => []),
      onCreated: noopListener,
      onUpdated: noopListener,
      onRemoved: noopListener,
      onActivated: noopListener
    },
    storage: {
      get: jest.fn(async () => ({})),
      set: jest.fn(async () => undefined),
      remove: jest.fn(async () => undefined),
      clear: jest.fn(async () => undefined)
    },
    messaging: {
      sendMessage: jest.fn(),
      onMessage: noopListener
    },
    history: {
      onVisited: noopListener
    }
  };
});

// Stub out the database integration so we don't touch IndexedDB.
jest.mock('../../../database/integration', () => ({
  initializeDatabaseIntegration: jest.fn(async () => undefined),
  getDatabaseIntegration: () => ({
    handleTabCreated: jest.fn(async () => undefined),
    handleNavigation: jest.fn(async () => undefined),
    createSession: jest.fn(async () => undefined),
    getDashboardData: jest.fn(async () => ({})),
    searchHistory: jest.fn(async () => ({ pages: [], sessions: [] })),
    getBrowsingPatterns: jest.fn(async () => []),
    getHealthStatus: jest.fn(async () => ({ initialized: true }))
  })
}));

// Stub FocusEmitter — its own tests cover the state machine. Here we only
// need it to not blow up when instantiated and to let us assert that the
// service worker wires notifyVisitChange after each committed navigation.
jest.mock('../FocusEmitter', () => {
  return {
    FocusEmitter: jest.fn().mockImplementation(() => {
      const inst = {
        handlers: [] as Array<(t: any) => Promise<void>>,
        notifyVisitChange: jest.fn(async () => undefined),
        onFocusTransition: jest.fn(function (this: any, h: any) {
          inst.handlers.push(h);
          return () => {};
        }),
        start: jest.fn()
      };
      focusEmitterInstances.push(inst);
      return inst;
    })
  };
});

function stubOutboxWrite(stored: BrowsingEvent[], throwOn?: (e: BrowsingEvent) => boolean) {
  // Load the isolated module registry's copy of LocalEventStore and stub its
  // prototype's storeEvent. jest.isolateModules creates a fresh module
  // graph — the LocalEventStore class the service worker instantiates is
  // NOT the one imported at the top of this file, so we must spy inside
  // the isolated scope.
  let SpyStore: any;
  jest.isolateModules(() => {
    SpyStore = require('../../../storage/LocalEventStore').LocalEventStore;
    SpyStore.prototype.storeEvent = jest.fn(async function (this: any, e: BrowsingEvent) {
      if (throwOn && throwOn(e)) throw new Error('outbox write failed');
      stored.push(e);
    });
    SpyStore.prototype.initialize = jest.fn(async () => undefined);
    require('../../../background/service-worker');
  });
  // Let the top-level `backgroundService.initialize()` promise settle before
  // we assert on side effects. queueMicrotask() over setImmediate — the
  // latter isn't defined in jsdom under recent Node runtimes.
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('webNavigation.onCommitted capture', () => {
  beforeEach(() => {
    registeredCommittedHook = undefined;
    addListenerCalls = [];
    focusEmitterInstances.length = 0;
    jest.clearAllMocks();
  });

  it('registers a listener with an http/https scheme filter', async () => {
    const stored: BrowsingEvent[] = [];
    await stubOutboxWrite(stored);

    expect(addListenerCalls).toHaveLength(1);
    const call = addListenerCalls[0];
    expect(call.filter).toEqual({ url: [{ schemes: ['http', 'https'] }] });
    expect(typeof call.listener).toBe('function');
  });

  it('appends an outbox event with tabId, url, transitionType, and timestamp on a top-frame navigation', async () => {
    const stored: BrowsingEvent[] = [];
    await stubOutboxWrite(stored);
    expect(registeredCommittedHook).toBeDefined();

    await registeredCommittedHook!.listener({
      tabId: 42,
      frameId: 0,
      parentFrameId: -1,
      timeStamp: 1_700_000_000_000,
      url: 'https://example.com/article',
      transitionType: 'typed',
      transitionQualifiers: ['from_address_bar']
    } as CommittedDetails);

    const navEvents = stored.filter((e) => e.type === 'navigation_committed');
    expect(navEvents).toHaveLength(1);

    const [event] = navEvents;
    expect(event.tabId).toBe(42);
    expect(event.url).toBe('https://example.com/article');
    expect(event.timestamp).toBe(1_700_000_000_000);
    expect(event.metadata.transitionType).toBe('typed');
    expect(event.metadata.transitionQualifiers).toEqual(['from_address_bar']);
    expect(event.metadata.frameId).toBe(0);
    expect(typeof event.id).toBe('string');
    expect(event.id.length).toBeGreaterThan(0);
  });

  it('ignores sub-frame navigations (frameId != 0)', async () => {
    const stored: BrowsingEvent[] = [];
    await stubOutboxWrite(stored);

    await registeredCommittedHook!.listener({
      tabId: 42,
      frameId: 1,
      parentFrameId: 0,
      timeStamp: 1_700_000_000_000,
      url: 'https://ads.example.com/frame',
      transitionType: 'auto_subframe',
      transitionQualifiers: []
    } as CommittedDetails);

    expect(stored.filter((e) => e.type === 'navigation_committed')).toHaveLength(0);
  });

  it('notifies FocusEmitter of the new visit id after each top-frame commit', async () => {
    const stored: BrowsingEvent[] = [];
    await stubOutboxWrite(stored);
    expect(focusEmitterInstances).toHaveLength(1);

    await registeredCommittedHook!.listener({
      tabId: 7,
      frameId: 0,
      parentFrameId: -1,
      timeStamp: 1_700_000_000_000,
      url: 'https://a.example/',
      transitionType: 'link',
      transitionQualifiers: []
    } as CommittedDetails);

    const emittedVisit = stored.find((e) => e.type === 'navigation_committed');
    expect(emittedVisit).toBeDefined();
    const notify = focusEmitterInstances[0].notifyVisitChange as jest.Mock;
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(7, emittedVisit!.id);
  });

  it('does not update the visit index (nor notify the emitter) if the outbox write fails', async () => {
    const stored: BrowsingEvent[] = [];
    await stubOutboxWrite(stored, (e) => e.type === 'navigation_committed');

    await registeredCommittedHook!.listener({
      tabId: 99,
      frameId: 0,
      parentFrameId: -1,
      timeStamp: 1_700_000_000_000,
      url: 'https://z.example/',
      transitionType: 'reload',
      transitionQualifiers: []
    } as CommittedDetails);

    const notify = focusEmitterInstances[0].notifyVisitChange as jest.Mock;
    expect(notify).not.toHaveBeenCalled();
  });
});
