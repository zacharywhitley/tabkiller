/**
 * TabKiller pilot server — one file, no framework.
 *
 * Endpoints:
 *   POST /events  — accepts either a single BrowsingEvent JSON object
 *                   or a JSON array of them; UPSERTs by id.
 *   GET  /        — HTML dashboard: last 100 events plus counters.
 *   GET  /events  — JSON dump of the last 100 events.
 *   GET  /health  — plaintext "ok".
 *
 * Storage: better-sqlite3 in a single file (default ./tabkiller.db).
 * Duplicates are dropped via INSERT OR IGNORE keyed on event id, so
 * the extension can safely resend after a restart.
 */

import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '127.0.0.1';
const DB_PATH = process.env.DB_PATH ?? './tabkiller.db';

const db = new DatabaseSync(DB_PATH);
db.exec(`PRAGMA journal_mode = WAL;`);
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id           TEXT PRIMARY KEY,
    type         TEXT NOT NULL,
    timestamp    INTEGER NOT NULL,
    tab_id       INTEGER,
    window_id    INTEGER,
    url          TEXT,
    title        TEXT,
    session_id   TEXT,
    body         TEXT NOT NULL,
    received_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
  CREATE INDEX IF NOT EXISTS idx_events_tab ON events(tab_id);
`);

const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO events
    (id, type, timestamp, tab_id, window_id, url, title, session_id, body, received_at)
  VALUES
    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const beginStmt = db.prepare('BEGIN');
const commitStmt = db.prepare('COMMIT');
const rollbackStmt = db.prepare('ROLLBACK');

function insertMany(rows: EventRow[]): number {
  if (rows.length === 0) return 0;
  beginStmt.run();
  try {
    let inserted = 0;
    for (const row of rows) {
      const info = insertStmt.run(
        row.id,
        row.type,
        row.timestamp,
        row.tab_id,
        row.window_id,
        row.url,
        row.title,
        row.session_id,
        row.body,
        row.received_at,
      );
      if (info.changes > 0) inserted++;
    }
    commitStmt.run();
    return inserted;
  } catch (err) {
    rollbackStmt.run();
    throw err;
  }
}

const listStmt = db.prepare(`
  SELECT id, type, timestamp, tab_id, window_id, url, title
  FROM events
  ORDER BY timestamp DESC
  LIMIT 100
`);
const countStmt = db.prepare(`SELECT COUNT(*) AS n FROM events`);
const countsByTypeStmt = db.prepare(`
  SELECT type, COUNT(*) AS n FROM events GROUP BY type ORDER BY n DESC
`);

// node:sqlite binds JS values directly; nulls map to SQL NULL.
// The row shape here mirrors the parameter list, in order.
interface EventRow {
  id: string;
  type: string;
  timestamp: number;
  tab_id: number | null;
  window_id: number | null;
  url: string | null;
  title: string | null;
  session_id: string | null;
  body: string;
  received_at: number;
}

interface BrowsingEventInput {
  id?: unknown;
  type?: unknown;
  timestamp?: unknown;
  tabId?: unknown;
  windowId?: unknown;
  url?: unknown;
  title?: unknown;
  sessionId?: unknown;
}

function toRow(raw: unknown, receivedAt: number): EventRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as BrowsingEventInput;
  if (typeof e.id !== 'string' || typeof e.type !== 'string' || typeof e.timestamp !== 'number') {
    return null;
  }
  return {
    id: e.id,
    type: e.type,
    timestamp: e.timestamp,
    tab_id: typeof e.tabId === 'number' ? e.tabId : null,
    window_id: typeof e.windowId === 'number' ? e.windowId : null,
    url: typeof e.url === 'string' ? e.url : null,
    title: typeof e.title === 'string' ? e.title : null,
    session_id: typeof e.sessionId === 'string' ? e.sessionId : null,
    body: JSON.stringify(raw),
    received_at: receivedAt,
  };
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

const CORS_HEADERS: http.OutgoingHttpHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c] as string));
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { ...CORS_HEADERS, 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function html(res: http.ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body);
}

function renderDashboard(): string {
  const total = (countStmt.get() as { n: number }).n;
  const byType = countsByTypeStmt.all() as Array<{ type: string; n: number }>;
  const events = listStmt.all() as Array<{
    id: string;
    type: string;
    timestamp: number;
    tab_id: number | null;
    window_id: number | null;
    url: string | null;
    title: string | null;
  }>;

  const typeChips = byType
    .map((r) => `<span class="chip"><b>${escape(r.type)}</b> ${r.n}</span>`)
    .join('');

  const rows = events
    .map((e) => {
      const when = new Date(e.timestamp).toISOString().slice(11, 19);
      const day = new Date(e.timestamp).toISOString().slice(0, 10);
      const label = e.title || e.url || '';
      return `<tr>
        <td class="dim">${escape(day)}</td>
        <td>${escape(when)}</td>
        <td class="type">${escape(e.type)}</td>
        <td class="num">${e.tab_id ?? ''}</td>
        <td class="num">${e.window_id ?? ''}</td>
        <td class="url" title="${escape(e.url ?? '')}">${escape(label)}</td>
      </tr>`;
    })
    .join('');

  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<title>TabKiller pilot server</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 20px; color: #222; background: #fafbfc; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { color: #666; font-size: 12px; margin-bottom: 12px; }
  .chips { margin: 8px 0 16px; display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { background: #eef1f5; padding: 3px 8px; border-radius: 12px; font-size: 11px; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; background: #fff; border: 1px solid #ddd; }
  th, td { text-align: left; padding: 5px 10px; border-bottom: 1px solid #f0f0f0; }
  th { background: #f0f2f5; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; }
  td.dim { color: #888; }
  td.type { font-family: ui-monospace, Menlo, monospace; color: #4a76c4; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; color: #666; }
  td.url { max-width: 500px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @media (prefers-color-scheme: dark) {
    body { background: #1c1d1f; color: #eaeaea; }
    .chip { background: #2f3238; color: #dadde0; }
    table { background: #26282c; border-color: #3a3d42; }
    th { background: #2a2d31; color: #cdd0d5; }
    th, td { border-color: #34363a; }
    td.dim { color: #888; }
    td.type { color: #7ea3d9; }
  }
</style>
</head><body>
<h1>TabKiller pilot</h1>
<div class="sub">${total} events stored · showing last 100 · <a href="/events">JSON</a> · <a href="/health">health</a></div>
<div class="chips">${typeChips}</div>
<table>
  <thead><tr>
    <th>date</th><th>time</th><th>type</th><th>tab</th><th>win</th><th>url / title</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
</body></html>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  try {
    if (req.method === 'POST' && url.pathname === '/events') {
      const raw = await readBody(req);
      const parsed = JSON.parse(raw);
      const inputs = Array.isArray(parsed) ? parsed : [parsed];
      const now = Date.now();
      const rows: EventRow[] = [];
      let skipped = 0;
      for (const input of inputs) {
        const row = toRow(input, now);
        if (row) rows.push(row);
        else skipped++;
      }
      const inserted = rows.length > 0 ? insertMany(rows) : 0;
      json(res, 200, {
        received: inputs.length,
        inserted,
        duplicates: rows.length - inserted,
        skipped,
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/events') {
      const events = listStmt.all();
      json(res, 200, { events });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }

    if (req.method === 'GET' && url.pathname === '/') {
      html(res, 200, renderDashboard());
      return;
    }

    res.writeHead(404, CORS_HEADERS);
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('request failed:', req.method, url.pathname, message);
    json(res, 500, { error: message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`TabKiller pilot server listening on http://${HOST}:${PORT}`);
  console.log(`  db: ${DB_PATH}`);
  console.log(`  post events → http://${HOST}:${PORT}/events`);
  console.log(`  dashboard    → http://${HOST}:${PORT}/`);
});
