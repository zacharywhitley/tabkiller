/**
 * Top-level layout for the graph-viewer dashboard.
 *
 * Sidebar with the four views on the left, main content area on the
 * right. Selected view + selected session are persisted in
 * `sessionStorage` so a reload doesn't lose context, and the URL is
 * unchanged (this is a chrome-extension page, not routed).
 *
 * Light/dark themed via `prefers-color-scheme` — mirrors the pattern
 * the existing `standalone.tsx` debug shell uses.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { SessionBrowser } from './SessionBrowser';
import { TimelineView } from './TimelineView';
import { NodeGraphView } from './NodeGraphView';
import { PageSearch } from './PageSearch';

export type ViewName = 'sessions' | 'timeline' | 'graph' | 'search';

export interface DashboardSelection {
  view: ViewName;
  sessionId: string | null;
  pageId: string | null;
}

const STORAGE_KEY = 'tabkiller.dashboard.state';

const VIEWS: ReadonlyArray<{ id: ViewName; label: string }> = [
  { id: 'sessions', label: 'Sessions' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'graph', label: 'Graph' },
  { id: 'search', label: 'Search' },
];

const styles = `
  html, body { margin: 0; padding: 0; height: 100%; background: #f6f7f8; color: #111; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  #root { height: 100%; }
  .tk-dash { display: flex; height: 100vh; overflow: hidden; }
  .tk-dash__nav { width: 200px; background: #eceef1; border-right: 1px solid #d5d8dd; padding: 16px 0; box-sizing: border-box; display: flex; flex-direction: column; }
  .tk-dash__brand { padding: 0 16px 12px; font-weight: 700; font-size: 13px; color: #333; letter-spacing: 0.03em; text-transform: uppercase; }
  .tk-dash__navbtn { display: block; width: 100%; text-align: left; padding: 10px 16px; background: transparent; border: none; color: #222; font-size: 14px; cursor: pointer; border-left: 3px solid transparent; }
  .tk-dash__navbtn:hover { background: rgba(0,0,0,0.04); }
  .tk-dash__navbtn.is-active { background: rgba(0,0,0,0.06); border-left-color: #4a76c4; font-weight: 600; }
  .tk-dash__main { flex: 1; overflow: auto; padding: 20px 24px 40px; box-sizing: border-box; }
  .tk-dash__error { color: #b1231d; background: #fbe3e1; border: 1px solid #eaa8a4; padding: 10px 12px; border-radius: 4px; font-size: 13px; margin: 8px 0 16px; }
  .tk-dash__scope { display: inline-block; padding: 4px 10px; background: #dfe8f7; color: #274168; border-radius: 12px; font-size: 12px; margin-right: 8px; }
  .tk-dash__scope button { background: transparent; border: none; color: inherit; margin-left: 6px; cursor: pointer; font-weight: 600; }
  @media (prefers-color-scheme: dark) {
    html, body { background: #1c1d1f; color: #eaeaea; }
    .tk-dash__nav { background: #26282c; border-right-color: #3a3d42; }
    .tk-dash__brand { color: #c7c9cd; }
    .tk-dash__navbtn { color: #dadada; }
    .tk-dash__navbtn:hover { background: rgba(255,255,255,0.05); }
    .tk-dash__navbtn.is-active { background: rgba(255,255,255,0.08); border-left-color: #7ea3d9; }
    .tk-dash__error { color: #ff9c9c; background: #3a1e1c; border-color: #5c2b28; }
    .tk-dash__scope { background: #2f3e5b; color: #cdd9ec; }
  }
`;

function loadSelection(): DashboardSelection {
  const fallback: DashboardSelection = { view: 'sessions', sessionId: null, pageId: null };
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<DashboardSelection>;
    return {
      view: (VIEWS.some((v) => v.id === parsed.view) ? parsed.view : 'sessions') as ViewName,
      sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : null,
      pageId: typeof parsed.pageId === 'string' ? parsed.pageId : null,
    };
  } catch {
    return fallback;
  }
}

function saveSelection(selection: DashboardSelection): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
  } catch {
    // sessionStorage full or unavailable — a reload will land on Sessions,
    // which is the safest default. No user-visible consequence.
  }
}

export const DashboardShell: React.FC = () => {
  const [selection, setSelection] = useState<DashboardSelection>(() => loadSelection());

  useEffect(() => {
    saveSelection(selection);
  }, [selection]);

  const onNavClick = useCallback(
    (view: ViewName) => () => {
      setSelection((prev) => ({ ...prev, view }));
    },
    [],
  );

  const gotoTimelineForSession = useCallback((sessionId: string) => {
    setSelection({ view: 'timeline', sessionId, pageId: null });
  }, []);

  const gotoTimelineForPage = useCallback((pageId: string) => {
    setSelection({ view: 'timeline', sessionId: null, pageId });
  }, []);

  const clearSessionScope = useCallback(() => {
    setSelection((prev) => ({ ...prev, sessionId: null, pageId: null }));
  }, []);

  return (
    <>
      <style>{styles}</style>
      <div className="tk-dash">
        <nav className="tk-dash__nav" aria-label="Views">
          <div className="tk-dash__brand">TabKiller</div>
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              className={`tk-dash__navbtn${selection.view === v.id ? ' is-active' : ''}`}
              onClick={onNavClick(v.id)}
              data-testid={`tk-dash-nav-${v.id}`}
            >
              {v.label}
            </button>
          ))}
        </nav>
        <main className="tk-dash__main" data-testid="tk-dash-main">
          {selection.view === 'sessions' && (
            <SessionBrowser onOpenSession={gotoTimelineForSession} />
          )}
          {selection.view === 'timeline' && (
            <TimelineView
              scopeSessionId={selection.sessionId}
              scopePageId={selection.pageId}
              onClearScope={clearSessionScope}
            />
          )}
          {selection.view === 'graph' && <NodeGraphView />}
          {selection.view === 'search' && (
            <PageSearch onOpenPageTimeline={gotoTimelineForPage} />
          )}
        </main>
      </div>
    </>
  );
};

export default DashboardShell;
