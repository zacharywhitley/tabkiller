/**
 * Session Browser — scrollable list of sessions newest first.
 *
 * Each row shows started-relative time (with absolute tooltip),
 * duration, distinct-page count, total visit count, tag chips, and up
 * to three page titles as a subtitle. Clicking a row navigates to the
 * Timeline view scoped to that session. The tab-tree pop-up (⧉ button)
 * reuses the existing `SessionTabTreeView` component so we don't
 * duplicate its rendering logic.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { openGraphStoreForDebug } from '../debug/index';
import { recentSessions, tabTreeForSession } from '../../database/graph/queries';
import type { RecentSessionRow, TabTreeSession } from '../../database/graph/queries';
import { SessionTabTreeView } from '../debug/SessionTabTreeView';

const RECENT_LIMIT = 200;

interface Props {
  onOpenSession: (sessionId: string) => void;
}

const styles: Record<string, React.CSSProperties> = {
  // The dashboard main pane is flex-column with overflow:auto and forces
  // min-height:0 on every direct child. Returning a bare fragment made
  // every row a separate flex item, so once the content exceeded the
  // pane height flex-shrink squashed the row heights while the text
  // inside didn't shrink — cards overlapped their neighbors.
  root: { display: 'flex', flexDirection: 'column', minHeight: 0, width: '100%' },
  header: { marginTop: 0, fontSize: 18, marginBottom: 12, flexShrink: 0 },
  card: { display: 'flex', gap: 12, alignItems: 'flex-start', padding: 12, marginBottom: 8, background: 'var(--tk-card-bg, #fff)', border: '1px solid var(--tk-card-border, #dcdfe4)', borderRadius: 6, cursor: 'pointer', flexShrink: 0 },
  meta: { flex: 1, minWidth: 0 },
  headline: { display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 4 },
  relative: { fontSize: 14, fontWeight: 600 },
  duration: { fontSize: 12, opacity: 0.75 },
  counts: { fontSize: 12, opacity: 0.75, marginRight: 8 },
  titles: { fontSize: 12, opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  chips: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 },
  chip: { fontSize: 11, background: '#e0edda', color: '#2a4a1a', padding: '2px 8px', borderRadius: 12 },
  actionBtn: { border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, padding: 4, color: 'inherit', flexShrink: 0 },
  empty: { padding: 20, textAlign: 'center', opacity: 0.7 },
  treeShell: { marginTop: 8, marginBottom: 8, background: 'rgba(0,0,0,0.03)', padding: 8, borderRadius: 4 },
};

const darkOverrides = `
  @media (prefers-color-scheme: dark) {
    .tk-sb__card { background: #26282c !important; border-color: #3a3d42 !important; }
    .tk-sb__chip { background: #2f4830 !important; color: #cde3c9 !important; }
    .tk-sb__tree-shell { background: rgba(255,255,255,0.05) !important; }
  }
`;

function formatRelative(ms: number, now: number): string {
  const delta = Math.max(0, now - ms);
  const s = Math.floor(delta / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remS = s % 60;
  if (m < 60) return remS === 0 ? `${m}m` : `${m}m ${remS}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM === 0 ? `${h}h` : `${h}h ${remM}m`;
}

function formatAbsolute(ms: number): string {
  return new Date(ms).toLocaleString();
}

export const SessionBrowser: React.FC<Props> = ({ onOpenSession }) => {
  const [rows, setRows] = useState<RecentSessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedTree, setExpandedTree] = useState<TabTreeSession[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const store = await openGraphStoreForDebug();
        const data = await recentSessions(store, RECENT_LIMIT);
        if (!cancelled) {
          setRows(data);
          setNow(Date.now());
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const onRowClick = useCallback((sessionId: string) => () => {
    onOpenSession(sessionId);
  }, [onOpenSession]);

  const onTreeClick = useCallback((sessionId: string) => async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (expandedId === sessionId) {
      setExpandedId(null);
      setExpandedTree(null);
      return;
    }
    try {
      const store = await openGraphStoreForDebug();
      const tree = await tabTreeForSession(store, sessionId);
      setExpandedId(sessionId);
      setExpandedTree(tree);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [expandedId]);

  if (error) {
    return (
      <div style={styles.root}>
        <h2 style={styles.header}>Sessions</h2>
        <div className="tk-dash__error">{error}</div>
      </div>
    );
  }

  if (rows === null) {
    return (
      <div style={styles.root}>
        <h2 style={styles.header}>Sessions</h2>
        <div style={styles.empty}>Loading…</div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div style={styles.root}>
        <h2 style={styles.header}>Sessions</h2>
        <div style={styles.empty}>No sessions captured yet. Browse for a bit and reload.</div>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      <style>{darkOverrides}</style>
      <h2 style={styles.header}>Sessions ({rows.length})</h2>
      {rows.map((row) => {
        const isExpanded = expandedId === row.session.id;
        const durationMs = (row.session.ended_at ?? now) - row.session.started_at;
        const subtitle = row.first_page_titles.join(' · ');
        const label = row.session.title && row.session.title.trim() !== ''
          ? row.session.title
          : `Session ${row.session.id.slice(0, 8)}`;
        return (
          <div key={row.session.id}>
            <div
              className="tk-sb__card"
              style={styles.card}
              onClick={onRowClick(row.session.id)}
              data-testid="tk-sb-row"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') onOpenSession(row.session.id); }}
            >
              <div style={styles.meta}>
                <div style={styles.headline}>
                  <span
                    style={styles.relative}
                    title={formatAbsolute(row.session.started_at)}
                  >
                    {formatRelative(row.session.started_at, now)}
                  </span>
                  <span style={styles.duration}>
                    · {row.session.ended_at != null ? formatDuration(durationMs) : 'in progress'}
                  </span>
                  <span style={styles.counts}>
                    · {row.page_count} page{row.page_count === 1 ? '' : 's'} · {row.visit_count} visit{row.visit_count === 1 ? '' : 's'}
                  </span>
                </div>
                <div style={styles.titles} title={subtitle}>
                  {label}{subtitle ? ` — ${subtitle}` : ''}
                </div>
                {row.tags.length > 0 && (
                  <div style={styles.chips}>
                    {row.tags.map((t) => (
                      <span key={t.id} className="tk-sb__chip" style={styles.chip}>{t.label || t.slug}</span>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                style={styles.actionBtn}
                onClick={onTreeClick(row.session.id)}
                aria-label="Toggle tab tree"
                title="Tab tree"
              >
                {isExpanded ? '▾' : '⌗'}
              </button>
            </div>
            {isExpanded && expandedTree && (
              <div className="tk-sb__tree-shell" style={styles.treeShell}>
                <SessionTabTreeView data={expandedTree} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default SessionBrowser;
