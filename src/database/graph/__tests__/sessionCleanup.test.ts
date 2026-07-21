/**
 * Tests for the one-shot session_restore cleanup migration.
 *
 * Uses real fake-indexeddb (no mock services). Each test opens its own
 * uniquely-named database and passes an in-memory storage double so
 * the version-marker semantics are exercised end-to-end.
 */

// jsdom 26 does not expose `structuredClone`, but fake-indexeddb needs
// it for its clone-on-insertion pass. Mirror the shim used by the
// other graph tests.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodeV8 = require('node:v8') as typeof import('node:v8');
if (typeof (globalThis as { structuredClone?: unknown }).structuredClone !== 'function') {
  (globalThis as unknown as { structuredClone: (value: unknown) => unknown }).structuredClone = (
    value: unknown,
  ) => nodeV8.deserialize(nodeV8.serialize(value));
}

import 'fake-indexeddb/auto';

import {
  DATABASE_NAME,
  DATABASE_VERSION,
  STORE_NAMES,
  createStoreConfig,
} from '../../../session/storage/schema';
import { GraphStore } from '../store';
import {
  SESSION_CLEANUP_VERSION,
  SESSION_CLEANUP_VERSION_KEY,
  runSessionRestoreCleanup,
  type MigrationStorage,
} from '../migrations';
import type { IntervalEdge, SessionNode, VisitNode } from '../types';

const T0 = 1_700_000_000_000;

let dbSuffix = 0;
async function freshStore(): Promise<GraphStore> {
  dbSuffix += 1;
  const uniqueName = `${DATABASE_NAME}_migrations_test_${Date.now()}_${dbSuffix}`;
  const db = await openFreshDatabase(uniqueName);
  return new GraphStore(db);
}

function openFreshDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const storeName of Object.values(STORE_NAMES)) {
        if (!db.objectStoreNames.contains(storeName)) {
          const cfg = createStoreConfig(storeName);
          const store = db.createObjectStore(storeName, cfg.options as IDBObjectStoreParameters);
          for (const idx of cfg.indexes) {
            store.createIndex(idx.name, idx.keyPath, idx.options);
          }
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function fakeStorage(initial: Record<string, unknown> = {}): MigrationStorage & {
  raw: Map<string, unknown>;
} {
  const raw = new Map<string, unknown>(Object.entries(initial));
  return {
    raw,
    async get(key: string) {
      return raw.has(key) ? { [key]: raw.get(key) } : {};
    },
    async set(items: Record<string, unknown>) {
      for (const [k, v] of Object.entries(items)) raw.set(k, v);
    },
  };
}

function session(
  id: string,
  detected_by: SessionNode['detected_by'],
  started_at: number,
  ended_at: number | null,
): SessionNode {
  return {
    id,
    type: 'Session',
    recorded_at: started_at,
    started_at,
    ended_at,
    detected_by,
    title: null,
  };
}

function visit(id: string, at_time: number, ended_at: number | null): VisitNode {
  return {
    id,
    type: 'Visit',
    recorded_at: at_time,
    at_time,
    ended_at,
    focus_intervals: [],
    transition: 'link',
  };
}

function inSessionEdge(
  id: string,
  visitId: string,
  sessionId: string,
  valid_from: number,
  valid_to: number | null,
): IntervalEdge {
  return {
    id,
    kind: 'interval',
    type: 'in_session',
    from_id: visitId,
    to_id: sessionId,
    recorded_at: valid_from,
    valid_from,
    valid_to,
  };
}

describe('runSessionRestoreCleanup', () => {
  it('deletes session_restore sessions with no in_session edges', async () => {
    const graph = await freshStore();
    const orphan = session('s_orphan', 'session_restore', T0, null);
    await graph.putNode(orphan);

    const storage = fakeStorage();
    const result = await runSessionRestoreCleanup(graph, storage);

    expect(result).toEqual({ deleted: 1, closed: 0, kept: 0, skipped: false });
    expect(await graph.getNode('s_orphan')).toBeUndefined();
    expect(storage.raw.get(SESSION_CLEANUP_VERSION_KEY)).toBe(SESSION_CLEANUP_VERSION);
  });

  it('closes session_restore sessions that have edges but ended_at=null', async () => {
    const graph = await freshStore();
    const open = session('s_open', 'session_restore', T0, null);
    const v = visit('v1', T0 + 100, T0 + 500);
    await graph.writeBatch({
      nodes: [open, v],
      edges: [inSessionEdge('e1', 'v1', 's_open', T0 + 100, T0 + 500)],
    });

    const storage = fakeStorage();
    const result = await runSessionRestoreCleanup(graph, storage);

    expect(result).toEqual({ deleted: 0, closed: 1, kept: 0, skipped: false });
    const after = await graph.getNode<SessionNode>('s_open');
    expect(after).toBeDefined();
    // Cap at the latest edge's valid_to, not now().
    expect(after!.ended_at).toBe(T0 + 500);
  });

  it('falls back to now() when every in_session edge is still open', async () => {
    const graph = await freshStore();
    const open = session('s_all_open', 'session_restore', T0, null);
    const v = visit('v1', T0 + 100, null);
    await graph.writeBatch({
      nodes: [open, v],
      edges: [inSessionEdge('e1', 'v1', 's_all_open', T0 + 100, null)],
    });

    const before = Date.now();
    const storage = fakeStorage();
    const result = await runSessionRestoreCleanup(graph, storage);
    const after = Date.now();

    expect(result).toEqual({ deleted: 0, closed: 1, kept: 0, skipped: false });
    const closed = await graph.getNode<SessionNode>('s_all_open');
    expect(closed!.ended_at).not.toBeNull();
    expect(closed!.ended_at!).toBeGreaterThanOrEqual(before);
    expect(closed!.ended_at!).toBeLessThanOrEqual(after);
  });

  it('leaves non-session_restore sessions alone', async () => {
    const graph = await freshStore();
    const idle = session('s_idle', 'idle', T0, null);
    const manual = session('s_manual', 'manual', T0, T0 + 1000);
    const domain = session('s_domain', 'domain_shift', T0, null);
    await graph.writeBatch({ nodes: [idle, manual, domain] });

    const storage = fakeStorage();
    const result = await runSessionRestoreCleanup(graph, storage);

    expect(result).toEqual({ deleted: 0, closed: 0, kept: 0, skipped: false });
    expect(await graph.getNode('s_idle')).toEqual(idle);
    expect(await graph.getNode('s_manual')).toEqual(manual);
    expect(await graph.getNode('s_domain')).toEqual(domain);
  });

  it('keeps session_restore sessions that already have ended_at set', async () => {
    const graph = await freshStore();
    const done = session('s_done', 'session_restore', T0, T0 + 5000);
    const v = visit('v1', T0 + 100, T0 + 500);
    await graph.writeBatch({
      nodes: [done, v],
      edges: [inSessionEdge('e1', 'v1', 's_done', T0 + 100, T0 + 500)],
    });

    const storage = fakeStorage();
    const result = await runSessionRestoreCleanup(graph, storage);

    expect(result).toEqual({ deleted: 0, closed: 0, kept: 1, skipped: false });
    expect(await graph.getNode<SessionNode>('s_done')).toEqual(done);
  });

  it('is idempotent — a second call short-circuits on the version marker', async () => {
    const graph = await freshStore();
    const orphan = session('s_orphan', 'session_restore', T0, null);
    await graph.putNode(orphan);

    const storage = fakeStorage();
    const first = await runSessionRestoreCleanup(graph, storage);
    expect(first).toEqual({ deleted: 1, closed: 0, kept: 0, skipped: false });

    // Second run: even if a new orphan appears, the migration must not
    // touch it — the marker says "we already did this".
    await graph.putNode(session('s_orphan_2', 'session_restore', T0 + 10, null));

    const second = await runSessionRestoreCleanup(graph, storage);
    expect(second).toEqual({ deleted: 0, closed: 0, kept: 0, skipped: true });
    expect(await graph.getNode('s_orphan_2')).toBeDefined();
  });

  it('handles a mixed graph in a single pass', async () => {
    const graph = await freshStore();
    const orphan = session('s_orphan', 'session_restore', T0, null);
    const openWithEdges = session('s_open', 'session_restore', T0, null);
    const alreadyClosed = session('s_done', 'session_restore', T0, T0 + 5000);
    const idle = session('s_idle', 'idle', T0, null);

    const v1 = visit('v1', T0 + 100, T0 + 200);
    const v2 = visit('v2', T0 + 300, T0 + 400);

    await graph.writeBatch({
      nodes: [orphan, openWithEdges, alreadyClosed, idle, v1, v2],
      edges: [
        inSessionEdge('e1', 'v1', 's_open', T0 + 100, T0 + 200),
        inSessionEdge('e2', 'v2', 's_done', T0 + 300, T0 + 400),
      ],
    });

    const storage = fakeStorage();
    const result = await runSessionRestoreCleanup(graph, storage);

    expect(result).toEqual({ deleted: 1, closed: 1, kept: 1, skipped: false });
    expect(await graph.getNode('s_orphan')).toBeUndefined();
    expect((await graph.getNode<SessionNode>('s_open'))!.ended_at).toBe(T0 + 200);
    expect(await graph.getNode<SessionNode>('s_done')).toEqual(alreadyClosed);
    expect(await graph.getNode<SessionNode>('s_idle')).toEqual(idle);
  });

  it('sets the version marker even when there is nothing to clean', async () => {
    const graph = await freshStore();
    const storage = fakeStorage();

    const result = await runSessionRestoreCleanup(graph, storage);

    expect(result).toEqual({ deleted: 0, closed: 0, kept: 0, skipped: false });
    expect(storage.raw.get(SESSION_CLEANUP_VERSION_KEY)).toBe(SESSION_CLEANUP_VERSION);
  });
});
