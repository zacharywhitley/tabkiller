/**
 * Timeline view.
 *
 * Horizontal time axis, visits as bars, y-lane = owning tab. Two modes:
 *
 *   - Scoped:   `scopeSessionId` set — show every Visit in that Session.
 *               Initial window auto-fits [session.started_at, ended_at ?? now].
 *   - Scoped:   `scopePageId` set — show every Visit of that Page.
 *               Initial window auto-fits earliest..latest visit.
 *   - Global:   neither set — show the last 60 minutes across every visit.
 *
 * Pan: drag horizontally. Zoom: scroll wheel (time-axis only). "Now"
 * button snaps the right edge of the window to the current instant.
 *
 * All the geometry lives in `timelineLayout.ts`; this file wires state,
 * data-fetching, and interaction to that pure engine.
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { openGraphStoreForDebug } from '../debug/index';
import {
  sessionsOverlappingWindow,
  visitsInSession,
  visitsOnScreenBetween,
} from '../../database/graph/queries';
import type { SessionInWindow } from '../../database/graph/queries';
import type { GraphStore } from '../../database/graph/store';
import type { PageNode, SessionNode, TabNode, VisitNode } from '../../database/graph/types';
import {
  AXIS_HEIGHT,
  layoutTimeline,
  type TimelineBar,
  type TimelineVisit,
} from './timelineLayout';

const GLOBAL_WINDOW_MS = 60 * 60 * 1000;
const MIN_WINDOW_MS = 1_000;
const MAX_WINDOW_MS = 30 * 24 * 3600 * 1_000;

interface Props {
  scopeSessionId: string | null;
  scopePageId: string | null;
  onClearScope: () => void;
}

interface FetchResult {
  rows: TimelineVisit[];
  session: SessionNode | null;
  page: PageNode | null;
  suggestedWindow: [number, number] | null;
}

async function fetchVisitsForPage(
  g: GraphStore,
  pageId: string,
): Promise<{ visits: VisitNode[]; page: PageNode | null }> {
  const page = (await g.getNode<PageNode>(pageId)) ?? null;
  if (!page) return { visits: [], page: null };
  const visits: VisitNode[] = [];
  for (const edge of await g.inInterval(pageId, 'of_page')) {
    const v = await g.getNode<VisitNode>(edge.from_id);
    if (v) visits.push(v);
  }
  visits.sort((a, b) => a.at_time - b.at_time);
  return { visits, page };
}

async function attachTabs(
  g: GraphStore,
  visits: VisitNode[],
): Promise<TimelineVisit[]> {
  const rows: TimelineVisit[] = [];
  for (const v of visits) {
    const pageEdge = (await g.outInterval(v.id, 'of_page'))[0];
    const page = pageEdge ? (await g.getNode<PageNode>(pageEdge.to_id)) ?? null : null;
    const tabEdge = (await g.outInterval(v.id, 'in_tab'))[0];
    const tab = tabEdge ? (await g.getNode<TabNode>(tabEdge.to_id)) ?? null : null;
    rows.push({ visit: v, page, tab });
  }
  return rows;
}

async function loadTimelineData(
  scopeSessionId: string | null,
  scopePageId: string | null,
  globalWindow: [number, number],
): Promise<FetchResult> {
  const g = await openGraphStoreForDebug();

  if (scopeSessionId) {
    const session = (await g.getNode<SessionNode>(scopeSessionId)) ?? null;
    const rows = (await visitsInSession(g, scopeSessionId)).map<TimelineVisit>((r) => ({
      visit: r.visit, page: r.page, tab: r.tab,
    }));
    const suggested: [number, number] | null = session
      ? [session.started_at, session.ended_at ?? Date.now()]
      : null;
    return { rows, session, page: null, suggestedWindow: suggested };
  }

  if (scopePageId) {
    const { visits, page } = await fetchVisitsForPage(g, scopePageId);
    const rows = await attachTabs(g, visits);
    if (visits.length === 0) {
      return { rows, session: null, page, suggestedWindow: null };
    }
    const first = visits[0]!.at_time;
    const last = visits[visits.length - 1]!.ended_at ?? Date.now();
    return { rows, session: null, page, suggestedWindow: [first, last] };
  }

  const rowsRaw = await visitsOnScreenBetween(g, globalWindow[0], globalWindow[1]);
  const rows = await attachTabs(g, rowsRaw.map((r) => r.visit));
  return { rows, session: null, page: null, suggestedWindow: null };
}

function padWindow(a: number, b: number): [number, number] {
  if (b <= a) return [a - 1_000, a + 1_000];
  const pad = Math.max(1_000, Math.floor((b - a) * 0.05));
  return [a - pad, b + pad];
}

const styles: Record<string, React.CSSProperties> = {
  header: { marginTop: 0, fontSize: 18, marginBottom: 8 },
  toolbar: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' },
  btn: { padding: '4px 10px', fontSize: 12, cursor: 'pointer', background: 'transparent', border: '1px solid #999', color: 'inherit', borderRadius: 3 },
  canvasWrap: { position: 'relative', height: 'calc(100vh - 160px)', minHeight: 300, background: 'var(--tk-canvas-bg, #fff)', border: '1px solid #ccd0d5', overflow: 'hidden' },
  svg: { display: 'block' },
  tooltip: { position: 'fixed', pointerEvents: 'none', background: 'rgba(20,20,20,0.95)', color: '#fff', padding: '6px 8px', fontSize: 11, borderRadius: 4, maxWidth: 360, zIndex: 1000, lineHeight: 1.4, wordBreak: 'break-all' },
  empty: { padding: 20, textAlign: 'center', opacity: 0.7 },
};

const darkOverrides = `
  @media (prefers-color-scheme: dark) {
    .tk-tl__canvas { background: #26282c !important; border-color: #3a3d42 !important; }
    .tk-tl__axis-line { stroke: #4a4d52 !important; }
    .tk-tl__axis-label { fill: #b0b3b7 !important; }
    .tk-tl__lane-line { stroke: #35383d !important; }
    .tk-tl__lane-label { fill: #a8abb0 !important; }
    .tk-tl__session-start, .tk-tl__session-end { stroke: #4b8fed !important; }
    .tk-tl__session-chip { fill: #7ea3d9 !important; }
    .tk-tl__btn { border-color: #55575c !important; }
  }
`;

interface HoverState { bar: TimelineBar; x: number; y: number }

export const TimelineView: React.FC<Props> = ({ scopeSessionId, scopePageId, onClearScope }) => {
  const [rows, setRows] = useState<TimelineVisit[] | null>(null);
  const [session, setSession] = useState<SessionNode | null>(null);
  const [page, setPage] = useState<PageNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [viewWindow, setViewWindow] = useState<[number, number]>(() => {
    const t = Date.now();
    return [t - GLOBAL_WINDOW_MS, t];
  });
  const [hover, setHover] = useState<HoverState | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 1000, h: 400 });
  const [sessions, setSessions] = useState<SessionInWindow[]>([]);
  const dragRef = useRef<{ startX: number; startFrom: number; startTo: number } | null>(null);

  useLayoutEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize({ w: Math.max(200, rect.width), h: Math.max(200, rect.height) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setRows(null);
      setError(null);
      try {
        const t = Date.now();
        const initialGlobal: [number, number] = [t - GLOBAL_WINDOW_MS, t];
        const result = await loadTimelineData(scopeSessionId, scopePageId, initialGlobal);
        if (cancelled) return;
        setRows(result.rows);
        setSession(result.session);
        setPage(result.page);
        setNow(Date.now());
        if (result.suggestedWindow) setViewWindow(padWindow(result.suggestedWindow[0], result.suggestedWindow[1]));
        else setViewWindow(initialGlobal);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [scopeSessionId, scopePageId]);

  // Session boundaries that intersect the current view window.
  // Re-queried when the window pans/zooms; simple linear scan on
  // Session nodes so it doesn't stall the render.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const g = await openGraphStoreForDebug();
        const rows = await sessionsOverlappingWindow(g, viewWindow[0], viewWindow[1]);
        if (!cancelled) setSessions(rows);
      } catch {
        // Non-fatal — sessions are decoration, not primary content.
      }
    })();
    return () => { cancelled = true; };
  }, [viewWindow]);

  const layout = useMemo(() => layoutTimeline({
    rows: rows ?? [],
    tFrom: viewWindow[0],
    tTo: viewWindow[1],
    now,
    viewportWidth: size.w,
    viewportHeight: size.h,
    desiredTicks: Math.max(4, Math.floor(size.w / 100)),
  }), [rows, viewWindow, now, size]);

  // Wheel-zoom. React registers `onWheel` as a passive listener
  // (React 17+), which turns preventDefault into a no-op and logs
  // "Unable to preventDefault inside passive event listener". Attach
  // a native non-passive wheel listener on the canvas wrap instead.
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wheelHandlerRef = useRef<(event: WheelEvent) => void>(() => {});
  wheelHandlerRef.current = (event: WheelEvent) => {
    if (!svgRef.current) return;
    event.preventDefault();
    const rect = svgRef.current.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const anchor = layout.xToTime(localX);
    const factor = event.deltaY > 0 ? 1.2 : 1 / 1.2;
    const nextRange = Math.min(MAX_WINDOW_MS, Math.max(MIN_WINDOW_MS, (viewWindow[1] - viewWindow[0]) * factor));
    const leftFraction = (anchor - viewWindow[0]) / (viewWindow[1] - viewWindow[0]);
    const newFrom = anchor - leftFraction * nextRange;
    const newTo = newFrom + nextRange;
    setViewWindow([newFrom, newTo]);
  };
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e: WheelEvent) => wheelHandlerRef.current(e);
    svg.addEventListener('wheel', handler, { passive: false });
    return () => svg.removeEventListener('wheel', handler);
  }, [rows]);

  const onMouseDown = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    dragRef.current = { startX: event.clientX, startFrom: viewWindow[0], startTo: viewWindow[1] };
  }, [viewWindow]);

  const onMouseMove = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const dx = event.clientX - dragRef.current.startX;
    const range = dragRef.current.startTo - dragRef.current.startFrom;
    const deltaT = -(dx / size.w) * range;
    setViewWindow([dragRef.current.startFrom + deltaT, dragRef.current.startTo + deltaT]);
  }, [size]);

  const onMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const onBarEnter = useCallback((bar: TimelineBar) => (event: React.MouseEvent) => {
    setHover({ bar, x: event.clientX, y: event.clientY });
  }, []);
  const onBarMoveOverBar = useCallback((event: React.MouseEvent) => {
    setHover((prev) => (prev ? { ...prev, x: event.clientX, y: event.clientY } : prev));
  }, []);
  const onBarLeave = useCallback(() => setHover(null), []);
  const onBarClick = useCallback((bar: TimelineBar) => () => {
    if (!bar.url) return;
    globalThis.open(bar.url, '_blank', 'noopener');
  }, []);

  const onNow = useCallback(() => {
    const range = viewWindow[1] - viewWindow[0];
    const t = Date.now();
    setNow(t);
    setViewWindow([t - range, t]);
  }, [viewWindow]);

  const modeLabel = scopeSessionId
    ? (session?.title && session.title.trim() !== '' ? session.title : `Session ${scopeSessionId.slice(0, 8)}`)
    : scopePageId
      ? (page?.title || page?.normalized_url || `Page ${scopePageId.slice(0, 8)}`)
      : 'Last 60 minutes';

  // Rendered-vs-fetched breakdown so silent filtering
  // (reload drop, out-of-window drop) is visible in the toolbar.
  // Otherwise "the timeline only shows one entry" is impossible to
  // tell apart from "the query only returned one visit."
  const fetchedCount = rows?.length ?? 0;
  const reloadCount = rows?.filter((r) => r.visit.transition === 'reload').length ?? 0;
  const renderedBars = layout.bars.length;
  const renderedLanes = layout.lanes.length;

  return (
    <>
      <style>{darkOverrides}</style>
      <h2 style={styles.header}>Timeline</h2>
      <div style={styles.toolbar}>
        {(scopeSessionId || scopePageId) ? (
          <span className="tk-dash__scope">
            {modeLabel}
            <button type="button" onClick={onClearScope}>×</button>
          </span>
        ) : (
          <span style={{ fontSize: 12, opacity: 0.7 }}>Global mode — last 60 min</span>
        )}
        <button type="button" className="tk-tl__btn" style={styles.btn} onClick={onNow}>Now</button>
        <span style={{ fontSize: 12, opacity: 0.7 }}>
          {fetchedCount} fetched · {renderedBars} shown · {renderedLanes} lanes
          {reloadCount > 0 ? ` · ${reloadCount} reload${reloadCount === 1 ? '' : 's'} dropped` : ''}
        </span>
        <span style={{ fontSize: 12, opacity: 0.7, marginLeft: 'auto' }}>
          {new Date(viewWindow[0]).toLocaleString()} → {new Date(viewWindow[1]).toLocaleString()}
        </span>
      </div>
      {error && <div className="tk-dash__error">{error}</div>}

      <div
        ref={canvasRef}
        className="tk-tl__canvas"
        style={styles.canvasWrap}
        data-testid="tk-tl-canvas"
      >
        {rows === null ? (
          <div style={styles.empty}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={styles.empty}>No visits in this window.</div>
        ) : (
          <svg
            ref={svgRef}
            style={styles.svg}
            width={size.w}
            height={layout.canvas.height}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            data-testid="tk-tl-svg"
          >
            {/* Session boundary rules — drawn under the axis so the
                axis line and ticks sit on top of them. Solid rule at
                started_at, dashed rule at ended_at (dashed marks the
                inferred boundary; still-open sessions have no
                closing rule). A tag/title chip sits just below the
                axis so the session is identifiable by name. */}
            {sessions.map((s) => {
              const startX = layout.timeToX(s.session.started_at);
              const startInView =
                s.session.started_at >= viewWindow[0] &&
                s.session.started_at <= viewWindow[1];
              const endX = s.session.ended_at != null
                ? layout.timeToX(s.session.ended_at) : null;
              const endInView = s.session.ended_at != null &&
                s.session.ended_at >= viewWindow[0] &&
                s.session.ended_at <= viewWindow[1];
              const chip = s.tags.map((t) => t.label || t.slug).join(', ')
                || s.session.title
                || `session ${s.session.id.slice(0, 6)}`;
              return (
                <g key={`session:${s.session.id}`}>
                  {startInView && (
                    <>
                      <line
                        className="tk-tl__session-start"
                        x1={startX} x2={startX}
                        y1={AXIS_HEIGHT}
                        y2={layout.canvas.height}
                        stroke="#7ea3d9"
                        strokeWidth={1.5}
                        opacity={0.55}
                      />
                      <text
                        className="tk-tl__session-chip"
                        x={startX + 4}
                        y={AXIS_HEIGHT + 12}
                        fontSize={10}
                        fill="#4a76c4"
                        fontFamily="ui-monospace, Menlo, monospace"
                        style={{ pointerEvents: 'none' }}
                      >
                        ▸ {chip}
                      </text>
                    </>
                  )}
                  {endInView && endX != null && (
                    <line
                      className="tk-tl__session-end"
                      x1={endX} x2={endX}
                      y1={AXIS_HEIGHT}
                      y2={layout.canvas.height}
                      stroke="#7ea3d9"
                      strokeWidth={1.5}
                      strokeDasharray="3 3"
                      opacity={0.45}
                    />
                  )}
                </g>
              );
            })}

            <line
              className="tk-tl__axis-line"
              x1={0}
              x2={size.w}
              y1={AXIS_HEIGHT - 0.5}
              y2={AXIS_HEIGHT - 0.5}
              stroke="#c8ccd1"
              strokeWidth={1}
            />
            {layout.ticks.map((tick) => (
              <g key={tick.t}>
                <line
                  className="tk-tl__axis-line"
                  x1={tick.x}
                  x2={tick.x}
                  y1={AXIS_HEIGHT - 6}
                  y2={AXIS_HEIGHT - 0.5}
                  stroke="#c8ccd1"
                  strokeWidth={1}
                />
                <text
                  className="tk-tl__axis-label"
                  x={tick.x + 3}
                  y={AXIS_HEIGHT - 8}
                  fontSize={10}
                  fill="#6b6f75"
                  fontFamily="ui-monospace, Menlo, monospace"
                >
                  {tick.label}
                </text>
              </g>
            ))}

            {layout.lanes.map((lane) => (
              <g key={lane.tab_id}>
                <line
                  className="tk-tl__lane-line"
                  x1={0}
                  x2={size.w}
                  y1={lane.y - 0.5}
                  y2={lane.y - 0.5}
                  stroke="#e7e9ec"
                  strokeWidth={1}
                />
                <text
                  className="tk-tl__lane-label"
                  x={4}
                  y={lane.y + lane.height / 2 + 3}
                  fontSize={9}
                  fill="#8a8d92"
                  fontFamily="ui-monospace, Menlo, monospace"
                  style={{ pointerEvents: 'none' }}
                >
                  {lane.label}
                </text>
              </g>
            ))}

            {layout.bars.map((bar) => (
              <g
                key={bar.visit_id}
                onMouseEnter={onBarEnter(bar)}
                onMouseMove={onBarMoveOverBar}
                onMouseLeave={onBarLeave}
                onClick={onBarClick(bar)}
                style={{ cursor: bar.url ? 'pointer' : 'default' }}
                data-testid="tk-tl-bar"
              >
                <rect
                  x={bar.x}
                  y={bar.y}
                  width={bar.width}
                  height={bar.height}
                  fill={bar.color.fill}
                  stroke={bar.color.border}
                  strokeWidth={0.5}
                  rx={2}
                />
                {bar.width > 60 && (
                  <text
                    x={bar.x + 4}
                    y={bar.y + bar.height / 2 + 3}
                    fontSize={10}
                    fill={bar.color.text}
                    fontFamily="system-ui, sans-serif"
                    style={{ pointerEvents: 'none' }}
                  >
                    {truncate(bar.title, Math.max(1, Math.floor(bar.width / 6)))}
                  </text>
                )}
              </g>
            ))}
          </svg>
        )}
      </div>

      {hover && (
        <div style={{ ...styles.tooltip, left: hover.x + 12, top: hover.y + 12 }}>
          <div style={{ marginBottom: 4, fontWeight: 600 }}>{hover.bar.title}</div>
          <div style={{ opacity: 0.85 }}>{hover.bar.url || '(no url)'}</div>
          <div style={{ marginTop: 4, opacity: 0.7 }}>at: {new Date(hover.bar.at_time).toLocaleString()}</div>
          <div style={{ opacity: 0.7 }}>
            for: {formatDurationMs(hover.bar.ended_at - hover.bar.at_time)}
          </div>
        </div>
      )}
    </>
  );
};

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`;
}

function formatDurationMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remS = s % 60;
  if (m < 60) return remS === 0 ? `${m}m` : `${m}m ${remS}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM === 0 ? `${h}h` : `${h}h ${remM}m`;
}

export default TimelineView;
