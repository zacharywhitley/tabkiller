/**
 * Gantt view — a temporal combination of the Tabs and Graph views.
 *
 * Y layout: one row per Window (with a lifetime band across the whole
 * timeline), then one row per Tab inside that Window. X coordinates are
 * time, same as the Node Graph. Each Window and Tab renders as a
 * horizontal bar from `opened_at` to `closed_at` (or the right edge of
 * the range for still-open items). Each Visit renders as a small dot at
 * `at_time` on its Tab's bar.
 *
 * Tabs without captured visits are omitted, same rule as the Node
 * Graph — a bar with no dots reads as noise and adds row height for
 * containers we can't tell you anything about. The toolbar exposes the
 * "N tabs / M open" ratio so the mismatch stays legible.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { openGraphStoreForDebug } from '../debug/index';
import { openTabsGrouped, windowsWithVisitsBetween } from '../../database/graph/queries';
import type { WindowTabVisitWindow } from '../../database/graph/queries';
import type { PageNode, TabNode, VisitNode, WindowNode } from '../../database/graph/types';
import { colorForDomain, hostnameOf } from './domainColor';
import type { GraphStore } from '../../database/graph/store';

const DEFAULT_WINDOW_MS = 0; // 0 = auto-fit
const CANVAS_PADDING = 40;
const AXIS_HEIGHT = 24;
const WINDOW_HEADER_HEIGHT = 22;
const TAB_ROW_HEIGHT = 22;
const WINDOW_GAP = 10;
const BAR_HEIGHT = 12;
const TAB_BAR_HEIGHT = 10;
const VISIT_DOT_R = 3;

// Left pane label layout mirrors the Node Graph.
const DEFAULT_LABEL_PANE_WIDTH = 300;
const MIN_LABEL_PANE_WIDTH = 140;
const MAX_LABEL_PANE_WIDTH = 720;
const SPLITTER_WIDTH = 4;
const LABEL_PANE_WIDTH_STORAGE_KEY = 'tabkiller.dashboard.gantt.labelPaneWidth';
const TIMELINE_ZOOM = 2;

interface TabRow {
  tab: TabNode;
  y: number;
  x1: number;
  x2: number;
  labelDomain: string;
  labelPath: string;
  color: ReturnType<typeof colorForDomain>;
  visits: Array<{ visit: VisitNode; page: PageNode | null; cx: number; color: ReturnType<typeof colorForDomain> }>;
}

interface OpenerEdge {
  key: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  path: string;
}

interface WindowRow {
  window: WindowNode;
  y: number;
  height: number;
  x1: number;
  x2: number;
  tabs: TabRow[];
}

interface Layout {
  windows: WindowRow[];
  width: number;
  height: number;
  ticks: Array<{ x: number; label: string }>;
}

function urlPath(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const p = (parsed.pathname || '') + (parsed.search || '');
    if (p === '' || p === '/') return '/';
    return p.length > 60 ? p.slice(0, 57) + '…' : p;
  } catch {
    return '';
  }
}

function computeLayout(
  data: WindowTabVisitWindow[],
  timelineWidth: number,
  windowStart: number,
  windowEnd: number,
  nowMs: number,
): Layout {
  const usableWidth = Math.max(200, timelineWidth - 2 * CANVAS_PADDING);
  const range = Math.max(1, windowEnd - windowStart);
  const timeToX = (t: number) =>
    CANVAS_PADDING + ((t - windowStart) / range) * usableWidth;
  const clampX = (t: number) =>
    Math.max(CANVAS_PADDING, Math.min(CANVAS_PADDING + usableWidth, timeToX(t)));

  const windows: WindowRow[] = [];
  let yCursor = AXIS_HEIGHT + CANVAS_PADDING;

  for (const w of data) {
    const winY = yCursor;
    const winX1 = clampX(w.window.opened_at);
    const winX2 = clampX(w.window.closed_at ?? Math.max(nowMs, windowEnd));

    const tabRows: TabRow[] = [];
    let rowCursor = winY + WINDOW_HEADER_HEIGHT;
    for (const t of w.tabs) {
      const tabY = rowCursor + TAB_ROW_HEIGHT / 2;

      // Pick the tab's dominant page for the label: use the most recent
      // visit's page. It's the closest analogue to "what's this tab
      // showing right now" without an extra query.
      let latestVisit: { visit: VisitNode; page: PageNode | null } | null = null;
      for (const v of t.visits) {
        if (!latestVisit || v.visit.at_time > latestVisit.visit.at_time) {
          latestVisit = v;
        }
      }
      const labelUrl =
        latestVisit?.page?.raw_url_first_seen ||
        latestVisit?.page?.normalized_url ||
        '';
      const labelDomain = labelUrl ? hostnameOf(labelUrl) : '(no page)';
      const labelPath = labelUrl ? urlPath(labelUrl) || '/' : '';
      const tabColor = colorForDomain(labelDomain);

      const x1 = clampX(t.tab.opened_at);
      const x2 = clampX(t.tab.closed_at ?? Math.max(nowMs, windowEnd));

      const visitDots = t.visits.map(({ visit, page }) => {
        const vUrl = page?.raw_url_first_seen || page?.normalized_url || '';
        const domain = vUrl ? hostnameOf(vUrl) : labelDomain;
        return {
          visit,
          page,
          cx: timeToX(visit.at_time),
          color: colorForDomain(domain),
        };
      });

      tabRows.push({
        tab: t.tab,
        y: tabY,
        x1,
        x2,
        labelDomain,
        labelPath,
        color: tabColor,
        visits: visitDots,
      });
      rowCursor += TAB_ROW_HEIGHT;
    }

    const bandHeight = rowCursor - winY;
    windows.push({
      window: w.window,
      y: winY,
      height: bandHeight,
      x1: winX1,
      x2: winX2,
      tabs: tabRows,
    });
    yCursor += bandHeight + WINDOW_GAP;
  }

  const ticks: Layout['ticks'] = [];
  const tickCount = 4;
  for (let i = 0; i <= tickCount; i++) {
    const t = windowStart + (i / tickCount) * (windowEnd - windowStart);
    ticks.push({
      x: timeToX(t),
      label: new Date(t).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    });
  }

  const height = yCursor + CANVAS_PADDING;
  return { windows, width: timelineWidth, height, ticks };
}

const RANGE_OPTIONS: ReadonlyArray<{ label: string; ms: number }> = [
  { label: 'Auto-fit', ms: 0 },
  { label: 'Last 1h', ms: 60 * 60 * 1000 },
  { label: 'Last 6h', ms: 6 * 60 * 60 * 1000 },
  { label: 'Last 24h', ms: 24 * 60 * 60 * 1000 },
  { label: 'Last 7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: 'Last 30d', ms: 30 * 24 * 60 * 60 * 1000 },
];

const styles: Record<string, React.CSSProperties> = {
  header: { marginTop: 0, fontSize: 18, marginBottom: 8 },
  toolbar: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' },
  select: { padding: '4px 8px', fontSize: 12 },
  root: { display: 'flex', flexDirection: 'column', width: '100%' },
  canvasOuter: {
    background: 'var(--tk-canvas-bg, #fff)',
    border: '1px solid #ccd0d5',
    width: '100%',
    overflowY: 'auto',
    overflowX: 'hidden',
    height: 'calc(100vh - 100px)',
  },
  canvasRow: { display: 'flex', minHeight: '100%' },
  splitter: {
    width: SPLITTER_WIDTH,
    flexShrink: 0,
    background: '#e5e7ea',
    cursor: 'col-resize',
    userSelect: 'none',
  },
  splitterActive: { background: '#4a76c4' },
  timelinePane: {
    flex: 1,
    minWidth: 0,
    overflowX: 'auto',
    overflowY: 'hidden',
    cursor: 'grab',
    userSelect: 'none',
  },
  timelinePaneDragging: { cursor: 'grabbing' },
  tooltip: {
    position: 'fixed',
    pointerEvents: 'none',
    background: 'rgba(20,20,20,0.95)',
    color: '#fff',
    padding: '6px 8px',
    fontSize: 11,
    borderRadius: 4,
    maxWidth: 360,
    zIndex: 1000,
    lineHeight: 1.4,
    wordBreak: 'break-all',
  },
  empty: { padding: 20, textAlign: 'center', opacity: 0.7 },
};

const darkOverrides = `
  @media (prefers-color-scheme: dark) {
    .tk-gantt__canvas-outer { background: #26282c !important; border-color: #3a3d42 !important; }
    .tk-gantt__label-pane { background: #23262b !important; }
    .tk-gantt__splitter { background: #3a3d42 !important; }
    .tk-gantt__splitter--active { background: #4b8fed !important; }
    .tk-gantt__axis { fill: #b0b3b7 !important; }
    .tk-gantt__lane-label { fill: #a8abb0 !important; }
    .tk-gantt__winlabel { fill: #dadde0 !important; }
    .tk-gantt__winband { fill: rgba(255,255,255,0.03) !important; }
  }
`;

interface Hover {
  kind: 'visit' | 'tab' | 'window';
  title: string;
  detail: string[];
  x: number;
  y: number;
}

async function walkOpenerEdges(
  g: GraphStore,
  visitIds: string[],
  visitPosById: Map<string, { cx: number; cy: number }>,
): Promise<OpenerEdge[]> {
  const edges: OpenerEdge[] = [];
  for (const id of visitIds) {
    const outs = await g.outPoint(id, 'opened_from');
    for (const e of outs) {
      const child = visitPosById.get(id);
      const parent = visitPosById.get(e.to_id);
      if (!child || !parent) continue;
      // Drop a straight vertical line at the child visit's at_time
      // (= the moment the new tab was opened). It starts on the
      // parent tab's row at that same X and lands on the child dot.
      // Previously we drew a Bezier arc from the parent visit's own
      // at_time — for opener chains the parent visit is usually the
      // one that fired the tab-open, which anchors on the parent
      // tab's opened_at, so the arrow appeared to leave from the
      // beginning of the parent tab bar instead of from where the
      // new tab was actually spawned.
      const path = `M ${child.cx} ${parent.cy} L ${child.cx} ${child.cy}`;
      edges.push({
        key: `opened_from::${id}->${e.to_id}`,
        fromX: child.cx,
        fromY: parent.cy,
        toX: child.cx,
        toY: child.cy,
        path,
      });
    }
  }
  return edges;
}

export const GanttView: React.FC = () => {
  const [rangeMs, setRangeMs] = useState<number>(DEFAULT_WINDOW_MS);
  const [data, setData] = useState<WindowTabVisitWindow[] | null>(null);
  const [openerEdges, setOpenerEdges] = useState<OpenerEdge[]>([]);
  const [openTabCount, setOpenTabCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState<number>(1000);
  const [hover, setHover] = useState<Hover | null>(null);
  const [windowRange, setWindowRange] = useState<[number, number]>(() => {
    const t = Date.now();
    return [t - DEFAULT_WINDOW_MS, t];
  });
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setData(null);
      setOpenerEdges([]);
      setError(null);
      try {
        const g = await openGraphStoreForDebug();
        const t = Date.now();
        const initialFrom = rangeMs === 0 ? t - 30 * 24 * 60 * 60 * 1000 : t - rangeMs;
        let result = await windowsWithVisitsBetween(g, initialFrom, t);
        let from = initialFrom;
        if (rangeMs === 0) {
          let earliest = Number.POSITIVE_INFINITY;
          for (const w of result) {
            if (w.window.opened_at < earliest) earliest = w.window.opened_at;
            for (const tab of w.tabs) {
              if (tab.tab.opened_at < earliest) earliest = tab.tab.opened_at;
              for (const { visit } of tab.visits) {
                if (visit.at_time < earliest) earliest = visit.at_time;
              }
            }
          }
          if (earliest === Number.POSITIVE_INFINITY) {
            from = 0;
            result = await windowsWithVisitsBetween(g, from, t);
          } else {
            const span = Math.max(60_000, t - earliest);
            from = earliest - span * 0.02;
          }
        }
        if (cancelled) return;
        const openNow = await openTabsGrouped(g);
        if (cancelled) return;
        const openTotal = openNow.reduce((n, w) => n + w.tabs.length, 0);
        setOpenTabCount(openTotal);
        setData(result);
        setWindowRange([from, t]);
        setNowMs(t);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rangeMs]);

  useEffect(() => {
    const measure = () => {
      const main = document.querySelector('.tk-dash__main');
      if (main) setWidth(Math.max(400, main.clientWidth - 48));
    };
    measure();
    globalThis.addEventListener('resize', measure);
    return () => globalThis.removeEventListener('resize', measure);
  }, []);

  const [labelPaneWidth, setLabelPaneWidth] = useState<number>(() => {
    try {
      const raw = globalThis.localStorage?.getItem(LABEL_PANE_WIDTH_STORAGE_KEY);
      const parsed = raw ? Number.parseInt(raw, 10) : NaN;
      if (
        Number.isFinite(parsed) &&
        parsed >= MIN_LABEL_PANE_WIDTH &&
        parsed <= MAX_LABEL_PANE_WIDTH
      ) {
        return parsed;
      }
    } catch {
      // fall through
    }
    return DEFAULT_LABEL_PANE_WIDTH;
  });
  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(
        LABEL_PANE_WIDTH_STORAGE_KEY,
        String(labelPaneWidth),
      );
    } catch {
      // ignore
    }
  }, [labelPaneWidth]);

  const canvasRowRef = React.useRef<HTMLDivElement | null>(null);
  const splitterDragStateRef = React.useRef<{ startX: number; startWidth: number } | null>(null);
  const [splitterDragging, setSplitterDragging] = useState(false);
  const onSplitterMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      splitterDragStateRef.current = { startX: e.clientX, startWidth: labelPaneWidth };
      setSplitterDragging(true);
      e.preventDefault();
    },
    [labelPaneWidth],
  );
  useEffect(() => {
    if (!splitterDragging) return;
    const onMove = (e: MouseEvent) => {
      const drag = splitterDragStateRef.current;
      if (!drag) return;
      const next = drag.startWidth + (e.clientX - drag.startX);
      const clamped = Math.max(MIN_LABEL_PANE_WIDTH, Math.min(MAX_LABEL_PANE_WIDTH, next));
      setLabelPaneWidth(clamped);
    };
    const onUp = () => {
      splitterDragStateRef.current = null;
      setSplitterDragging(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [splitterDragging]);

  const timelineViewportWidth = Math.max(400, width - labelPaneWidth - SPLITTER_WIDTH);
  const timelineSvgWidth = timelineViewportWidth * TIMELINE_ZOOM;

  const layout = useMemo(() => {
    if (!data) return null;
    return computeLayout(data, timelineSvgWidth, windowRange[0], windowRange[1], nowMs);
  }, [data, timelineSvgWidth, windowRange, nowMs]);

  useEffect(() => {
    if (!layout) return;
    let cancelled = false;
    (async () => {
      const posById = new Map<string, { cx: number; cy: number }>();
      const ids: string[] = [];
      for (const w of layout.windows) {
        for (const row of w.tabs) {
          for (const v of row.visits) {
            posById.set(v.visit.id, { cx: v.cx, cy: row.y });
            ids.push(v.visit.id);
          }
        }
      }
      try {
        const g = await openGraphStoreForDebug();
        const es = await walkOpenerEdges(g, ids, posById);
        if (!cancelled) setOpenerEdges(es);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [layout]);

  const timelinePaneRef = React.useRef<HTMLDivElement | null>(null);
  const dragStateRef = React.useRef<{ startX: number; startScroll: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const onTimelineMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const pane = timelinePaneRef.current;
    if (!pane) return;
    dragStateRef.current = { startX: e.clientX, startScroll: pane.scrollLeft };
    setDragging(true);
  }, []);
  const onTimelineMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    const pane = timelinePaneRef.current;
    if (!drag || !pane) return;
    pane.scrollLeft = drag.startScroll - (e.clientX - drag.startX);
  }, []);
  const endDrag = useCallback(() => {
    dragStateRef.current = null;
    setDragging(false);
  }, []);

  const onRangeChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      setRangeMs(Number(event.target.value));
    },
    [],
  );

  const onVisitEnter = useCallback(
    (v: TabRow['visits'][number]) => (event: React.MouseEvent) => {
      const url = v.page?.raw_url_first_seen || v.page?.normalized_url || '';
      setHover({
        kind: 'visit',
        title: v.page?.title || url || '(no page)',
        detail: [
          `visited at ${new Date(v.visit.at_time).toLocaleString()}`,
          `transition: ${v.visit.transition}`,
          url,
        ],
        x: event.clientX,
        y: event.clientY,
      });
    },
    [],
  );
  const onTabBarEnter = useCallback(
    (row: TabRow, w: WindowNode) => (event: React.MouseEvent) => {
      const openedFmt = new Date(row.tab.opened_at).toLocaleString();
      const closedFmt =
        row.tab.closed_at != null
          ? new Date(row.tab.closed_at).toLocaleString()
          : 'still open';
      setHover({
        kind: 'tab',
        title: `Tab #${row.tab.browser_tab_id} · ${row.labelDomain}${row.labelPath}`,
        detail: [
          `window #${w.browser_window_id}`,
          `opened ${openedFmt}`,
          `closed ${closedFmt}`,
          `${row.visits.length} visit${row.visits.length === 1 ? '' : 's'}`,
        ],
        x: event.clientX,
        y: event.clientY,
      });
    },
    [],
  );
  const onWindowBarEnter = useCallback(
    (row: WindowRow) => (event: React.MouseEvent) => {
      const openedFmt = new Date(row.window.opened_at).toLocaleString();
      const closedFmt =
        row.window.closed_at != null
          ? new Date(row.window.closed_at).toLocaleString()
          : 'still open';
      setHover({
        kind: 'window',
        title: `Window #${row.window.browser_window_id}`,
        detail: [
          `opened ${openedFmt}`,
          `closed ${closedFmt}`,
          `${row.tabs.length} tab${row.tabs.length === 1 ? '' : 's'}`,
        ],
        x: event.clientX,
        y: event.clientY,
      });
    },
    [],
  );
  const onHoverMove = useCallback((event: React.MouseEvent) => {
    setHover((prev) => (prev ? { ...prev, x: event.clientX, y: event.clientY } : prev));
  }, []);
  const onHoverLeave = useCallback(() => setHover(null), []);
  const onVisitClick = useCallback((v: TabRow['visits'][number]) => () => {
    const url = v.page?.raw_url_first_seen || v.page?.normalized_url;
    if (url) globalThis.open(url, '_blank', 'noopener');
  }, []);

  const totalVisits =
    data?.reduce((n, w) => n + w.tabs.reduce((m, t) => m + t.visits.length, 0), 0) ?? 0;
  const totalTabs = data?.reduce((n, w) => n + w.tabs.length, 0) ?? 0;

  return (
    <div style={styles.root}>
      <style>{darkOverrides}</style>
      <h2 style={styles.header}>Gantt</h2>
      <div style={styles.toolbar}>
        <label htmlFor="tk-gantt-range" style={{ fontSize: 12 }}>Range</label>
        <select
          id="tk-gantt-range"
          style={styles.select}
          value={rangeMs}
          onChange={onRangeChange}
        >
          {RANGE_OPTIONS.map((r) => (
            <option key={r.ms} value={r.ms}>{r.label}</option>
          ))}
        </select>
        <span style={{ fontSize: 12, opacity: 0.7 }}>
          {data
            ? `${data.length} windows · ${totalTabs} tabs (${openTabCount} open) · ${totalVisits} visits · ${openerEdges.length} opener links`
            : ''}
        </span>
      </div>

      {error && <div className="tk-dash__error">{error}</div>}
      {data === null && !error && <div style={styles.empty}>Loading…</div>}
      {data && data.length === 0 && (
        <div style={styles.empty}>No windows in this range.</div>
      )}

      {layout && data && data.length > 0 && (
        <div className="tk-gantt__canvas-outer" style={styles.canvasOuter}>
          <div ref={canvasRowRef} style={styles.canvasRow}>
            <svg
              className="tk-gantt__label-pane"
              width={labelPaneWidth}
              height={layout.height}
              style={{
                width: labelPaneWidth,
                flexShrink: 0,
                background: 'var(--tk-labelpane-bg, #fafbfc)',
              }}
            >
              {layout.windows.map((w) => (
                <g key={w.window.id}>
                  <rect
                    className="tk-gantt__winband"
                    x={0}
                    y={w.y}
                    width={labelPaneWidth}
                    height={w.height}
                    fill="rgba(0,0,0,0.03)"
                  />
                  <text
                    className="tk-gantt__winlabel"
                    x={8}
                    y={w.y + 14}
                    fontSize={11}
                    fontWeight={600}
                    fill="#4a4d52"
                  >
                    Window #{w.window.browser_window_id}
                    {w.window.closed_at != null ? ' (closed)' : ''} · {w.tabs.length} tab{w.tabs.length === 1 ? '' : 's'}
                  </text>
                  {w.tabs.map((row) => (
                    <text
                      key={`${row.tab.id}-label`}
                      className="tk-gantt__lane-label"
                      x={22}
                      y={row.y + 4}
                      fontSize={10}
                      fill="#3f4147"
                      fontFamily="ui-monospace, Menlo, monospace"
                      style={{ pointerEvents: 'none' }}
                    >
                      {row.labelDomain}
                      {row.labelPath && row.labelPath !== '/' ? row.labelPath : ''}
                      {row.tab.closed_at != null ? ' ✕' : ''}
                    </text>
                  ))}
                </g>
              ))}
            </svg>

            <div
              className={`tk-gantt__splitter${splitterDragging ? ' tk-gantt__splitter--active' : ''}`}
              style={{ ...styles.splitter, ...(splitterDragging ? styles.splitterActive : {}) }}
              onMouseDown={onSplitterMouseDown}
              data-testid="tk-gantt-splitter"
              title="Drag to resize"
            />

            <div
              ref={timelinePaneRef}
              style={{
                ...styles.timelinePane,
                ...(dragging ? styles.timelinePaneDragging : {}),
              }}
              onMouseDown={onTimelineMouseDown}
              onMouseMove={onTimelineMouseMove}
              onMouseUp={endDrag}
              onMouseLeave={endDrag}
            >
              <svg width={layout.width} height={layout.height} data-testid="tk-gantt-svg">
                <defs>
                  <marker
                    id="tk-gantt-arrow"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#666" />
                  </marker>
                </defs>
                {layout.ticks.map((t) => (
                  <text
                    key={t.x}
                    className="tk-gantt__axis"
                    x={t.x}
                    y={16}
                    fontSize={10}
                    fill="#6b6f75"
                    fontFamily="ui-monospace, Menlo, monospace"
                    textAnchor="middle"
                  >
                    {t.label}
                  </text>
                ))}

                {openerEdges.map((e) => (
                  <path
                    key={e.key}
                    d={e.path}
                    fill="none"
                    stroke="#888"
                    strokeWidth={1.2}
                    strokeDasharray="4 3"
                    markerEnd="url(#tk-gantt-arrow)"
                    opacity={0.7}
                  />
                ))}

                {layout.windows.map((w) => (
                  <g key={`${w.window.id}-window`}>
                    <rect
                      className="tk-gantt__winband"
                      x={0}
                      y={w.y}
                      width={layout.width}
                      height={w.height}
                      fill="rgba(0,0,0,0.03)"
                    />
                    <rect
                      x={w.x1}
                      y={w.y + (WINDOW_HEADER_HEIGHT - BAR_HEIGHT) / 2}
                      width={Math.max(2, w.x2 - w.x1)}
                      height={BAR_HEIGHT}
                      rx={2}
                      fill="#4a76c4"
                      opacity={0.55}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={onWindowBarEnter(w)}
                      onMouseMove={onHoverMove}
                      onMouseLeave={onHoverLeave}
                      data-testid="tk-gantt-window-bar"
                    />
                    {w.tabs.map((row) => (
                      <g key={`${row.tab.id}-row`}>
                        <rect
                          x={row.x1}
                          y={row.y - TAB_BAR_HEIGHT / 2}
                          width={Math.max(2, row.x2 - row.x1)}
                          height={TAB_BAR_HEIGHT}
                          rx={2}
                          fill={row.color.fill}
                          stroke={row.color.border}
                          strokeWidth={1}
                          opacity={0.85}
                          style={{ cursor: 'pointer' }}
                          onMouseEnter={onTabBarEnter(row, w.window)}
                          onMouseMove={onHoverMove}
                          onMouseLeave={onHoverLeave}
                          data-testid="tk-gantt-tab-bar"
                        />
                        {row.visits.map((v) => (
                          <circle
                            key={v.visit.id}
                            cx={v.cx}
                            cy={row.y}
                            r={VISIT_DOT_R}
                            fill={v.color.border}
                            stroke="#fff"
                            strokeWidth={0.75}
                            style={{ cursor: 'pointer' }}
                            onMouseEnter={onVisitEnter(v)}
                            onMouseMove={onHoverMove}
                            onMouseLeave={onHoverLeave}
                            onClick={onVisitClick(v)}
                            data-testid="tk-gantt-visit"
                          />
                        ))}
                      </g>
                    ))}
                  </g>
                ))}
              </svg>
            </div>
          </div>
        </div>
      )}

      {hover && (
        <div style={{ ...styles.tooltip, left: hover.x + 12, top: hover.y + 12 }}>
          <div style={{ marginBottom: 4, fontWeight: 600 }}>{hover.title}</div>
          {hover.detail.map((line, i) => (
            <div key={i} style={{ opacity: 0.85 }}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
};

export default GanttView;
