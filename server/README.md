# TabKiller pilot server

Reversible pilot for the "thin extension + central server" architecture.
The extension optionally POSTs every captured `BrowsingEvent` here as
a shadow write; the graph in the extension stays intact so you can
throw the server away with no code change if the shape doesn't work.

- One file, one dependency-free runtime (`node:sqlite`, requires Node
  22+ with `--experimental-sqlite`; stable in Node 24+).
- `POST /events` upserts by `event.id` (safe to resend).
- `GET /` renders the last 100 events.
- No auth. Bind to `127.0.0.1` only — never expose to a network.

## Run

```bash
cd server
npm install
npm start
```

Server listens on `http://127.0.0.1:8787` and writes to `./tabkiller.db`
in the working directory.

Overrides via env:

```bash
PORT=9000 HOST=127.0.0.1 DB_PATH=./tabkiller.db npm start
```

Watch mode (auto-restart on file change):

```bash
npm run dev
```

## Point the extension at it

Set `shipTo` in the extension's stored settings. From the extension's
service-worker console:

```javascript
chrome.storage.local.get('settings', ({ settings }) => {
  chrome.storage.local.set({
    settings: { ...settings, shipTo: 'http://127.0.0.1:8787' },
  });
});
```

Reload the extension (`chrome://extensions` → the round-arrow icon).
On next SW boot you should see:

```
TabKiller shipping enabled → http://127.0.0.1:8787
```

Every subsequent capture event will be POSTed to `/events`. Load
`http://127.0.0.1:8787/` to watch them arrive.

To disable shipping, set `shipTo` back to `undefined` (or empty
string) and reload the extension.

## Endpoints

| Method | Path       | Purpose                                                             |
| ------ | ---------- | ------------------------------------------------------------------- |
| POST   | `/events`  | Body: one event or `[events]`. Returns `{received, inserted, duplicates, skipped}`. |
| GET    | `/events`  | JSON: last 100 events.                                              |
| GET    | `/`        | HTML dashboard (last 100 events + per-type counters).               |
| GET    | `/health`  | Plaintext `ok`.                                                     |

## Schema

```sql
CREATE TABLE events (
  id           TEXT PRIMARY KEY,   -- BrowsingEvent.id, dedup key
  type         TEXT NOT NULL,      -- tab_created, navigation_committed, ...
  timestamp    INTEGER NOT NULL,   -- ms since epoch
  tab_id       INTEGER,            -- browser tab id (nullable for session events)
  window_id    INTEGER,            -- browser window id
  url          TEXT,
  title        TEXT,
  session_id   TEXT,
  body         TEXT NOT NULL,      -- JSON of the full event, for future queries
  received_at  INTEGER NOT NULL    -- server clock, ms since epoch
);
```

The `body` column keeps the whole event so we can pull new fields into
columns later without re-fetching from the extension.

## What this pilot is NOT

- No auth, no HTTPS. Localhost only.
- No retry on the extension side — if the server is down, events are
  simply not shipped (they still land in the extension's local graph).
- No graph reconstruction on the server. Just an event log so we can
  see the shape and volume of what we'd need to store.
