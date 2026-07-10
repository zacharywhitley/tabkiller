/**
 * Debug helpers for the options page.
 *
 * Everything in this file is gated behind a developer-only flag —
 * `localStorage.TABKILLER_DEBUG === '1'`. Users never see it.
 *
 * How the developer enables the panel:
 *
 *   1. Open the options page in the browser.
 *   2. Open DevTools, and in the Console run:
 *
 *        localStorage.TABKILLER_DEBUG = '1'
 *
 *   3. Reload the options page. The GraphQueryPanel appears.
 *
 * To hide it again:  `delete localStorage.TABKILLER_DEBUG; location.reload();`
 */

import { DATABASE_NAME, DATABASE_VERSION } from '../../session/storage/schema';
import { GraphStore } from '../../database/graph/store';

const DEBUG_FLAG_KEY = 'TABKILLER_DEBUG';
const DEBUG_FLAG_ENABLED = '1';

export function isDebugPanelEnabled(): boolean {
  if (typeof globalThis === 'undefined') return false;
  const ls = (globalThis as { localStorage?: Storage }).localStorage;
  if (!ls) return false;
  try {
    return ls.getItem(DEBUG_FLAG_KEY) === DEBUG_FLAG_ENABLED;
  } catch {
    return false;
  }
}

/**
 * Open a read-only handle to the shared TabKiller IndexedDB and wrap it
 * in a `GraphStore`. The database is expected to have been initialized by
 * the background service worker; if it hasn't, the graph object stores
 * will be missing and the panel surfaces an error to the developer.
 *
 * We deliberately do NOT construct a `SessionStorageEngine` here — it
 * runs maintenance tasks on initialize that we do not want a debug panel
 * to trigger.
 */
export function openGraphStoreForDebug(): Promise<GraphStore> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => {
      reject(new Error(`Failed to open ${DATABASE_NAME}: ${request.error?.message ?? 'unknown error'}`));
    };
    request.onblocked = () => {
      reject(new Error(`Open of ${DATABASE_NAME} is blocked by another connection`));
    };
    request.onsuccess = () => {
      const db = request.result;
      if (
        !db.objectStoreNames.contains('graph_nodes') ||
        !db.objectStoreNames.contains('graph_edges')
      ) {
        db.close();
        reject(
          new Error(
            'Graph object stores not found. The background service worker must run once to initialize the schema.',
          ),
        );
        return;
      }
      resolve(new GraphStore(db));
    };
  });
}
