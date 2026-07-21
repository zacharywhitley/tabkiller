/**
 * One-shot graph migrations that run from the service-worker init path.
 *
 * Every migration is guarded by a version marker in chrome.storage.local
 * so it runs at most once per install. Add new migrations by appending
 * an entry to the exported runner and bumping the version key it writes
 * — never edit an existing one, because installs that already ran the
 * old form would silently skip the new form.
 *
 * Failure policy: migrations must be fail-open. A throw here should not
 * block the SW from booting; callers wrap in try/catch and log. That's
 * the whole reason the version marker is set only on success — a
 * transient IDB failure that aborts mid-migration should get another
 * shot next boot.
 */
import { GraphStore } from './store';
import type { SessionNode } from './types';

/**
 * Minimal chrome.storage.local surface the migration touches. Kept
 * narrow so tests can pass a plain object without stubbing the whole
 * chrome API.
 */
export interface MigrationStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export const SESSION_CLEANUP_VERSION_KEY = 'tk:sessionCleanupVersion';
export const SESSION_CLEANUP_VERSION = 1;

export interface SessionRestoreCleanupResult {
  deleted: number;
  closed: number;
  kept: number;
  skipped: boolean;
}

/**
 * Purge stale `session_restore` Session nodes left behind before
 * SessionEmitter learned to persist across SW wakes (commit cd18cf4).
 *
 * For each session detected_by === 'session_restore':
 *   - No `in_session` edges point at it: delete the node. It was pure
 *     noise; the wake fired, no visits landed, then MV3 tore the SW
 *     down again.
 *   - It has edges but `ended_at` is null: close it. Deleting would
 *     orphan real visits — so cap `ended_at` at the latest edge's
 *     valid_to (or now() if every edge is still open).
 *   - It has edges and is already closed: leave it alone.
 *
 * Runs at most once per install; the version marker in
 * chrome.storage.local flips to 1 on success so subsequent boots
 * return immediately.
 */
export async function runSessionRestoreCleanup(
  graph: GraphStore,
  storage: MigrationStorage,
): Promise<SessionRestoreCleanupResult> {
  const marker = await storage.get(SESSION_CLEANUP_VERSION_KEY);
  const current = marker[SESSION_CLEANUP_VERSION_KEY];
  if (typeof current === 'number' && current >= SESSION_CLEANUP_VERSION) {
    return { deleted: 0, closed: 0, kept: 0, skipped: true };
  }

  const now = Date.now();
  const sessions = await graph.nodesOfType<SessionNode>('Session');

  let deleted = 0;
  let closed = 0;
  let kept = 0;

  for (const s of sessions) {
    if (s.detected_by !== 'session_restore') continue;

    const edges = await graph.inInterval(s.id, 'in_session');
    if (edges.length === 0) {
      await graph.deleteNode(s.id);
      deleted += 1;
      continue;
    }

    if (s.ended_at != null) {
      // Already closed — leave alone so the graph history stays intact.
      kept += 1;
      continue;
    }

    // Cap ended_at at the latest edge's valid_to. If every edge is still
    // open (valid_to === null), fall back to now(): the session has real
    // activity attached and we don't want to invent a bogus zero.
    let latest: number | null = null;
    for (const e of edges) {
      if (e.valid_to == null) continue;
      if (latest == null || e.valid_to > latest) latest = e.valid_to;
    }
    const endedAt = latest ?? now;

    await graph.writeBatch({
      nodes: [{ ...s, recorded_at: now, ended_at: endedAt }],
    });
    closed += 1;
  }

  await storage.set({ [SESSION_CLEANUP_VERSION_KEY]: SESSION_CLEANUP_VERSION });

  console.log(
    `TabKiller session_restore cleanup: deleted=${deleted}, closed=${closed}, kept=${kept}`,
  );

  return { deleted, closed, kept, skipped: false };
}
