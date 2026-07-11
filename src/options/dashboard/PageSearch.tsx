/**
 * Page Search — case-insensitive substring match over Page nodes.
 *
 * Query filters against title, normalized_url, and raw_url_first_seen
 * via the `pagesMatching` primitive. Results show title, domain badge,
 * visit count, and first/last seen. Click a hit to open its Timeline
 * scoped to that Page.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { openGraphStoreForDebug } from '../debug/index';
import { pagesMatching } from '../../database/graph/queries';
import type { PageNode } from '../../database/graph/types';
import { colorForDomain, hostnameOf } from './domainColor';

interface Props {
  onOpenPageTimeline: (pageId: string) => void;
}

const DEBOUNCE_MS = 120;
const MAX_RESULTS = 200;

const styles: Record<string, React.CSSProperties> = {
  header: { marginTop: 0, fontSize: 18, marginBottom: 12 },
  input: { width: '100%', padding: '8px 10px', fontSize: 14, border: '1px solid #ccd0d5', borderRadius: 4, boxSizing: 'border-box', background: 'transparent', color: 'inherit' },
  counts: { fontSize: 12, opacity: 0.7, marginTop: 6, marginBottom: 12 },
  row: { display: 'flex', gap: 12, alignItems: 'center', padding: '10px 12px', marginBottom: 6, background: 'var(--tk-card-bg, #fff)', border: '1px solid var(--tk-card-border, #dcdfe4)', borderRadius: 6, cursor: 'pointer' },
  title: { fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  meta: { fontSize: 11, opacity: 0.7, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  center: { flex: 1, minWidth: 0 },
  badge: { fontSize: 11, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap' },
  count: { fontSize: 12, opacity: 0.75, whiteSpace: 'nowrap' },
  empty: { padding: 20, textAlign: 'center', opacity: 0.7 },
};

const darkOverrides = `
  @media (prefers-color-scheme: dark) {
    .tk-ps__row { background: #26282c !important; border-color: #3a3d42 !important; }
    .tk-ps__input { border-color: #55575c !important; }
  }
`;

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const PageSearch: React.FC<Props> = ({ onOpenPageTimeline }) => {
  const [query, setQuery] = useState<string>('');
  const [results, setResults] = useState<PageNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(async () => {
      if (query.trim() === '') {
        setResults(null);
        return;
      }
      try {
        const g = await openGraphStoreForDebug();
        const hits = await pagesMatching(g, query);
        if (!cancelled) setResults(hits);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }, DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [query]);

  const onQueryChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
    setError(null);
  }, []);

  const onRowClick = useCallback((pageId: string) => () => {
    onOpenPageTimeline(pageId);
  }, [onOpenPageTimeline]);

  const displayed = results ? results.slice(0, MAX_RESULTS) : null;

  return (
    <>
      <style>{darkOverrides}</style>
      <h2 style={styles.header}>Search</h2>
      <input
        className="tk-ps__input"
        style={styles.input}
        type="text"
        placeholder="Search titles and URLs…"
        value={query}
        onChange={onQueryChange}
        autoFocus
        data-testid="tk-ps-input"
      />
      {error && <div className="tk-dash__error">{error}</div>}
      {results !== null && (
        <div style={styles.counts}>
          {results.length} match{results.length === 1 ? '' : 'es'}
          {results.length > MAX_RESULTS ? ` (showing first ${MAX_RESULTS})` : ''}
        </div>
      )}
      {results === null && query.trim() === '' && (
        <div style={styles.empty}>Type to search page titles and URLs.</div>
      )}
      {results !== null && results.length === 0 && (
        <div style={styles.empty}>No pages match "{query}".</div>
      )}
      {displayed?.map((p) => {
        const url = p.raw_url_first_seen || p.normalized_url;
        const domain = hostnameOf(url);
        const color = colorForDomain(domain);
        const title = p.title.trim() !== '' ? p.title : url;
        return (
          <div
            key={p.id}
            className="tk-ps__row"
            style={styles.row}
            onClick={onRowClick(p.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') onOpenPageTimeline(p.id); }}
            data-testid="tk-ps-result"
          >
            <span
              style={{ ...styles.badge, background: color.fill, color: color.text, border: `1px solid ${color.border}` }}
              title={domain}
            >
              {domain}
            </span>
            <div style={styles.center}>
              <div style={styles.title} title={title}>{title}</div>
              <div style={styles.meta}>
                {url} · first {formatDate(p.first_seen)} · last {formatDate(p.last_seen)}
              </div>
            </div>
            <span style={styles.count}>
              {p.visit_count} visit{p.visit_count === 1 ? '' : 's'}
            </span>
          </div>
        );
      })}
    </>
  );
};

export default PageSearch;
