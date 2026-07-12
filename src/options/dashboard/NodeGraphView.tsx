/**
 * Node Graph view — visits placed in Tab lanes nested under Window bands.
 *
 * Y layout is a two-tier hierarchy: each Window is a horizontal band, and
 * within a band each of that Window's Tabs gets its own row. Every Visit
 * lands as a node at (its at_time, its Tab's row). Edges are the causal
 * arrows between visits: `navigated_from` (solid, intra-tab) and
 * `opened_from` (dashed, cross-tab).
 *
 * Deliberately Visit-nodes, not Page-nodes: a Page can be visited in many
 * Tabs and the whole point of this view is to *see* which Tab held it.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { openGraphStoreForDebug } from '../debug/index';
import { windowsWithVisitsBetween } from '../../database/graph/queries';
import type {
  WindowTabVisitWindow,
} from '../../database/graph/queries';
import type { PageNode, TabNode, VisitNode, WindowNode } from '../../database/graph/types';
import { colorForDomain, hostnameOf } from './domainColor';

const DEFAULT_WINDOW_MS = 0; // 0 = auto-fit
const CANVAS_PADDING = 40;
const AXIS_HEIGHT = 24;
const NODE_R = 5;
const PAGE_LANE_HEIGHT = 20;
const TAB_HEADER_HEIGHT = 18;
const TAB_GAP = 4;
const WINDOW_HEADER_HEIGHT = 22;
const WINDOW_GAP = 10;
const PAGE_LABEL_INDENT = 44;
// Left-pane columns for labels (fixed; do not scroll horizontally).
const LABEL_PANE_WIDTH = 420;
const DOMAIN_COL_X = PAGE_LABEL_INDENT;
const PATH_COL_X = PAGE_LABEL_INDENT + 160;
// Default zoom: timeline pane is this multiple of its container width so it
// is naturally horizontally scrollable / pan-draggable out of the gate.
const TIMELINE_ZOOM = 2;
// Vertical layout uses flex — the canvas grows to fill whatever the
// dashboard main pane has after the panel title and toolbar. No fragile
// vh math.

interface VisitNodeShape {
  visit: VisitNode;
  page: PageNode | null;
  cx: number;
  cy: number;
  color: ReturnType<typeof colorForDomain>;
  domain: string;
  tabId: string;
  windowId: string;
}

interface EdgeShape {
  key: string;
  from_id: string;
  to_id: string;
  kind: 'navigated_from' | 'opened_from';
  path: string;
}

interface PageLane {
  laneKey: string;
  domainKey: string;
  labelY: number;
  y: number;
  path: string;
  isDomainHeader: boolean;
  visitCount: number;
}

interface TabBand {
  tab: TabNode;
  y: number;
  height: number;
  labelY: number;
  pageLanes: PageLane[];
}

interface WindowBand {
  window: WindowNode;
  y: number;
  height: number;
  labelY: number;
  tabs: TabBand[];
}

interface Layout {
  nodes: VisitNodeShape[];
  edges: EdgeShape[];
  windows: WindowBand[];
  width: number;
  height: number;
  ticks: Array<{ x: number; label: string }>;
}

function shortLabel(rawUrl: string, title: string | null | undefined): string {
  const path = urlPath(rawUrl);
  const preferred = path || title || rawUrl;
  return preferred.length > 44 ? preferred.slice(0, 41) + '…' : preferred;
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
): Layout {
  const usableWidth = Math.max(200, timelineWidth - 2 * CANVAS_PADDING);
  const range = Math.max(1, windowEnd - windowStart);
  // X coords in the timeline SVG are RELATIVE to the timeline pane (which
  // scrolls independently of the label pane), NOT to the combined canvas.
  const timeToX = (t: number) => CANVAS_PADDING + ((t - windowStart) / range) * usableWidth;

  const nodesById = new Map<string, VisitNodeShape>();
  const nodes: VisitNodeShape[] = [];
  const windows: WindowBand[] = [];

  let yCursor = AXIS_HEIGHT + CANVAS_PADDING;
  for (const w of data) {
    const winY = yCursor;
    const winLabelY = winY + 14;
    let tabCursor = winY + WINDOW_HEADER_HEIGHT;
    const tabBands: TabBand[] = [];
    for (const t of w.tabs) {
      const tabY = tabCursor;
      const tabLabelY = tabY + 12;

      // Within a Tab: one row per unique Page, grouped by domain.
      // Sort key = (domain, first-visit-time-in-this-tab).
      // The FIRST row of each domain group carries the domain label as
      // its left indent; subsequent rows in the same domain leave the
      // domain-label column blank so pages read as a visual cluster.
      type Bucket = {
        laneKey: string;
        domainKey: string;
        path: string;
        firstSeenInTab: number;
        visits: { visit: VisitNode; page: PageNode | null }[];
      };
      const buckets = new Map<string, Bucket>();
      for (const { visit, page } of t.visits) {
        const url = page?.raw_url_first_seen || page?.normalized_url || '';
        const domain = url ? hostnameOf(url) : '(no page)';
        const path = urlPath(url) || '/';
        const laneKey = `${domain}::${path}`;
        let bucket = buckets.get(laneKey);
        if (!bucket) {
          bucket = {
            laneKey,
            domainKey: domain,
            path,
            firstSeenInTab: visit.at_time,
            visits: [],
          };
          buckets.set(laneKey, bucket);
        }
        bucket.visits.push({ visit, page });
        bucket.firstSeenInTab = Math.min(bucket.firstSeenInTab, visit.at_time);
      }
      const orderedBuckets = Array.from(buckets.values()).sort((a, b) => {
        if (a.domainKey !== b.domainKey) return a.domainKey < b.domainKey ? -1 : 1;
        return a.firstSeenInTab - b.firstSeenInTab;
      });

      const pageLanes: PageLane[] = [];
      const laneStartY = tabY + TAB_HEADER_HEIGHT;
      let seenDomain: string | null = null;
      for (let i = 0; i < orderedBuckets.length; i++) {
        const bucket = orderedBuckets[i];
        const laneY = laneStartY + i * PAGE_LANE_HEIGHT + PAGE_LANE_HEIGHT / 2;
        const isDomainHeader = bucket.domainKey !== seenDomain;
        seenDomain = bucket.domainKey;
        pageLanes.push({
          laneKey: bucket.laneKey,
          domainKey: bucket.domainKey,
          path: bucket.path,
          isDomainHeader,
          y: laneY,
          labelY: laneY + 3,
          visitCount: bucket.visits.length,
        });
        for (const { visit, page } of bucket.visits) {
          const node: VisitNodeShape = {
            visit,
            page,
            cx: timeToX(visit.at_time),
            cy: laneY,
            color: colorForDomain(bucket.domainKey),
            domain: bucket.domainKey,
            tabId: t.tab.id,
            windowId: w.window.id,
          };
          nodes.push(node);
          nodesById.set(visit.id, node);
        }
      }

      const tabHeight = TAB_HEADER_HEIGHT + orderedBuckets.length * PAGE_LANE_HEIGHT;
      tabBands.push({
        tab: t.tab,
        y: tabY,
        height: tabHeight,
        labelY: tabLabelY,
        pageLanes,
      });
      tabCursor += tabHeight + TAB_GAP;
    }
    const bandHeight = tabCursor - winY;
    windows.push({
      window: w.window,
      y: winY,
      height: bandHeight,
      labelY: winLabelY,
      tabs: tabBands,
    });
    yCursor += bandHeight + WINDOW_GAP;
  }

  // Edges: walk every visit's navigated_from and opened_from. Both point at
  // the parent visit; render as a curve from the child (source of the edge
  // record) to the parent (target).
  const edges: EdgeShape[] = [];
  for (const w of data) {
    for (const t of w.tabs) {
      for (const { visit } of t.visits) {
        const child = nodesById.get(visit.id);
        if (!child) continue;
        // navigated_from and opened_from edges live on graph_edges; the
        // WindowTabVisit query doesn't return them because they aren't
        // owned by the window/tab tree — they're relationships between
        // visits. Since ingestion may run this view against a huge graph,
        // we pull edges lazily via node metadata... except the query
        // shape has to be denormalized to include them, so we defer the
        // walk to the fetch layer via a follow-up query pass in the
        // component. See `walkVisitEdges` below.
        void child;
      }
    }
  }

  const ticks: Layout['ticks'] = [];
  const tickCount = 4;
  for (let i = 0; i <= tickCount; i++) {
    const t = windowStart + (i / tickCount) * (windowEnd - windowStart);
    ticks.push({
      x: timeToX(t),
      label: new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    });
  }

  const height = yCursor + CANVAS_PADDING;
  return { nodes, edges, windows, width: timelineWidth, height, ticks };
}

// ms: 0 sentinel = auto-fit to earliest visit in the data.
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
  // Outer scroll wrapper: vertical scroll wraps both panes so they scroll
  // vertically in sync.
  // NodeGraphView is a flex column that fills its parent (.tk-dash__main
  // is itself a flex column, so `flex: 1` chains through). The h2 and
  // toolbar keep their natural heights, and `canvasOuter` takes flex: 1
  // to consume everything that's left down to the bottom of the pane.
  root: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
  },
  canvasOuter: {
    background: 'var(--tk-canvas-bg, #fff)',
    border: '1px solid #ccd0d5',
    width: '100%',
    display: 'flex',
    overflowY: 'auto',
    overflowX: 'hidden',
    flex: 1,
    minHeight: 0,
  },
  labelPane: {
    width: LABEL_PANE_WIDTH,
    flexShrink: 0,
    borderRight: '1px solid #e5e7ea',
    background: 'var(--tk-labelpane-bg, #fafbfc)',
  },
  timelinePane: {
    flex: 1,
    minWidth: 0,
    overflowX: 'auto',
    overflowY: 'hidden',
    cursor: 'grab',
    userSelect: 'none',
  },
  timelinePaneDragging: { cursor: 'grabbing' },
  tooltip: { position: 'fixed', pointerEvents: 'none', background: 'rgba(20,20,20,0.95)', color: '#fff', padding: '6px 8px', fontSize: 11, borderRadius: 4, maxWidth: 360, zIndex: 1000, lineHeight: 1.4, wordBreak: 'break-all' },
  empty: { padding: 20, textAlign: 'center', opacity: 0.7 },
};

const darkOverrides = `
  @media (prefers-color-scheme: dark) {
    .tk-ng__canvas-outer { background: #26282c !important; border-color: #3a3d42 !important; }
    .tk-ng__label-pane { background: #23262b !important; border-right-color: #3a3d42 !important; }
    .tk-ng__axis { fill: #b0b3b7 !important; }
    .tk-ng__lane-label { fill: #a8abb0 !important; }
    .tk-ng__nodelabel { fill: #cdd0d5 !important; }
    .tk-ng__winlabel { fill: #dadde0 !important; }
    .tk-ng__winband { fill: rgba(255,255,255,0.03) !important; }
    .tk-ng__edge { stroke: #6a6d72 !important; }
  }
`;

interface Hover { node: VisitNodeShape; x: number; y: number }

/**
 * Walk `navigated_from` + `opened_from` from every visit in the layout to
 * build the edge list. Runs in the component (not the layout) because it
 * needs live IDB reads that the pure layout function doesn't have.
 */
async function walkVisitEdges(
  visitIds: string[],
  nodesById: Map<string, VisitNodeShape>,
): Promise<EdgeShape[]> {
  const g = await openGraphStoreForDebug();
  const edges: EdgeShape[] = [];
  for (const id of visitIds) {
    for (const kind of ['navigated_from', 'opened_from'] as const) {
      const outEdges = await g.outPoint(id, kind);
      for (const e of outEdges) {
        const from = nodesById.get(id);
        const to = nodesById.get(e.to_id);
        if (!from || !to) continue;
        const midX = (from.cx + to.cx) / 2;
        const midY = from.cy === to.cy ? from.cy - 20 : (from.cy + to.cy) / 2;
        const path = `M ${from.cx} ${from.cy} Q ${midX} ${midY}, ${to.cx} ${to.cy}`;
        edges.push({ key: `${kind}::${id}->${e.to_id}`, from_id: id, to_id: e.to_id, kind, path });
      }
    }
  }
  return edges;
}

export const NodeGraphView: React.FC = () => {
  const [rangeMs, setRangeMs] = useState<number>(DEFAULT_WINDOW_MS);
  const [data, setData] = useState<WindowTabVisitWindow[] | null>(null);
  const [edges, setEdges] = useState<EdgeShape[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState<number>(1000);
  const [hover, setHover] = useState<Hover | null>(null);
  const [windowRange, setWindowRange] = useState<[number, number]>(() => {
    const t = Date.now();
    return [t - DEFAULT_WINDOW_MS, t];
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setData(null);
      setEdges([]);
      setError(null);
      try {
        const g = await openGraphStoreForDebug();
        const t = Date.now();
        // Auto-fit (rangeMs === 0): first ask over a wide window (30d),
        // then shrink tFrom to the earliest visit at_time in the result so
        // every dot lands on-screen. If nothing is in 30d, extend to the
        // full graph.
        const initialFrom = rangeMs === 0 ? t - 30 * 24 * 60 * 60 * 1000 : t - rangeMs;
        let result = await windowsWithVisitsBetween(g, initialFrom, t);
        let from = initialFrom;
        if (rangeMs === 0) {
          let earliest = Number.POSITIVE_INFINITY;
          for (const w of result) {
            for (const tab of w.tabs) {
              for (const { visit } of tab.visits) {
                if (visit.at_time < earliest) earliest = visit.at_time;
              }
            }
          }
          if (earliest === Number.POSITIVE_INFINITY) {
            // Nothing in 30d — try the whole history.
            from = 0;
            result = await windowsWithVisitsBetween(g, from, t);
          } else {
            // Pad the earliest edge by 2% of the span so the leftmost dots
            // aren't glued to the axis edge.
            const span = Math.max(60_000, t - earliest);
            from = earliest - span * 0.02;
          }
        }
        if (cancelled) return;
        setData(result);
        setWindowRange([from, t]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
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

  // Timeline pane width is (viewport minus label pane) × zoom multiplier.
  // Makes the SVG wider than its container so it naturally scrolls and
  // drag-to-pan feels correct out of the box.
  const timelineViewportWidth = Math.max(400, width - LABEL_PANE_WIDTH);
  const timelineSvgWidth = timelineViewportWidth * TIMELINE_ZOOM;

  const layout = useMemo(() => {
    if (!data) return null;
    return computeLayout(data, timelineSvgWidth, windowRange[0], windowRange[1]);
  }, [data, timelineSvgWidth, windowRange]);

  // Drag-to-pan on the timeline pane.
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

  useEffect(() => {
    if (!layout) return;
    let cancelled = false;
    (async () => {
      const nodesById = new Map(layout.nodes.map((n) => [n.visit.id, n]));
      const ids = layout.nodes.map((n) => n.visit.id);
      try {
        const es = await walkVisitEdges(ids, nodesById);
        if (!cancelled) setEdges(es);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [layout]);

  const onRangeChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setRangeMs(Number(event.target.value));
  }, []);

  const onNodeEnter = useCallback((n: VisitNodeShape) => (event: React.MouseEvent) => {
    setHover({ node: n, x: event.clientX, y: event.clientY });
  }, []);
  const onNodeMove = useCallback((event: React.MouseEvent) => {
    setHover((prev) => (prev ? { ...prev, x: event.clientX, y: event.clientY } : prev));
  }, []);
  const onNodeLeave = useCallback(() => setHover(null), []);
  const onNodeClick = useCallback((n: VisitNodeShape) => () => {
    const url = n.page?.raw_url_first_seen || n.page?.normalized_url;
    if (url) globalThis.open(url, '_blank', 'noopener');
  }, []);

  const totalVisits = data?.reduce((n, w) => n + w.tabs.reduce((m, t) => m + t.visits.length, 0), 0) ?? 0;
  const totalTabs = data?.reduce((n, w) => n + w.tabs.length, 0) ?? 0;

  return (
    <div style={styles.root}>
      <style>{darkOverrides}</style>
      <h2 style={styles.header}>Graph</h2>
      <div style={styles.toolbar}>
        <label htmlFor="tk-ng-range" style={{ fontSize: 12 }}>Range</label>
        <select id="tk-ng-range" style={styles.select} value={rangeMs} onChange={onRangeChange}>
          {RANGE_OPTIONS.map((r) => (
            <option key={r.ms} value={r.ms}>{r.label}</option>
          ))}
        </select>
        <span style={{ fontSize: 12, opacity: 0.7 }}>
          {data ? `${data.length} windows · ${totalTabs} tabs · ${totalVisits} visits · ${edges.length} edges` : ''}
        </span>
      </div>

      {error && <div className="tk-dash__error">{error}</div>}
      {data === null && !error && <div style={styles.empty}>Loading…</div>}
      {data && data.length === 0 && (
        <div style={styles.empty}>No windows in this range.</div>
      )}

      {layout && data && data.length > 0 && (
        <div className="tk-ng__canvas-outer" style={styles.canvasOuter}>
          {/* Left pane: window / tab / domain / path labels, fixed width,
              no horizontal scroll — stays visible while the timeline pans. */}
          <svg
            className="tk-ng__label-pane"
            width={LABEL_PANE_WIDTH}
            height={layout.height}
            style={styles.labelPane}
          >
            {layout.windows.map((w) => (
              <g key={w.window.id}>
                <rect
                  className="tk-ng__winband"
                  x={0}
                  y={w.y}
                  width={LABEL_PANE_WIDTH}
                  height={w.height}
                  fill="rgba(0,0,0,0.03)"
                />
                <text
                  className="tk-ng__winlabel"
                  x={8}
                  y={w.labelY}
                  fontSize={11}
                  fontWeight={600}
                  fill="#4a4d52"
                >
                  Window #{w.window.browser_window_id}
                  {w.window.closed_at != null ? ' (closed)' : ''} · {w.tabs.length} tab{w.tabs.length === 1 ? '' : 's'}
                </text>
              </g>
            ))}

            {layout.windows.flatMap((w) =>
              w.tabs.map((t) => (
                <text
                  key={`${w.window.id}-${t.tab.id}-tab`}
                  className="tk-ng__lane-label"
                  x={22}
                  y={t.labelY}
                  fontSize={11}
                  fontWeight={600}
                  fill="#5e6167"
                  fontFamily="ui-monospace, Menlo, monospace"
                  style={{ pointerEvents: 'none' }}
                >
                  Tab #{t.tab.browser_tab_id}
                  {t.tab.closed_at != null ? ' ✕' : ''} · {t.pageLanes.length} page{t.pageLanes.length === 1 ? '' : 's'}
                </text>
              )),
            )}

            {layout.windows.flatMap((w) =>
              w.tabs.flatMap((t) =>
                t.pageLanes.flatMap((p) => [
                  p.isDomainHeader ? (
                    <text
                      key={`${w.window.id}-${t.tab.id}-${p.laneKey}-dom`}
                      className="tk-ng__lane-label"
                      x={DOMAIN_COL_X}
                      y={p.labelY}
                      fontSize={10}
                      fontWeight={600}
                      fill="#5c6066"
                      fontFamily="ui-monospace, Menlo, monospace"
                      style={{ pointerEvents: 'none' }}
                    >
                      {p.domainKey}
                    </text>
                  ) : null,
                  <text
                    key={`${w.window.id}-${t.tab.id}-${p.laneKey}-path`}
                    className="tk-ng__nodelabel"
                    x={PATH_COL_X}
                    y={p.labelY}
                    fontSize={10}
                    fill="#3f4147"
                    fontFamily="ui-monospace, Menlo, monospace"
                    style={{ pointerEvents: 'none' }}
                  >
                    {p.path}
                    {p.visitCount > 1 ? ` (${p.visitCount})` : ''}
                  </text>,
                ]),
              ),
            )}
          </svg>

          {/* Right pane: time axis, edges, visit dots. Wider than the
              container so it scrolls horizontally; click-and-drag to pan. */}
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
            <svg width={layout.width} height={layout.height} data-testid="tk-ng-svg">
              <defs>
                <marker id="tk-ng-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#666" />
                </marker>
              </defs>

              {layout.ticks.map((t) => (
                <text
                  key={t.x}
                  className="tk-ng__axis"
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

              {/* Window band backgrounds so the alternating stripe reads
                  across the timeline the same way it does across the label
                  pane. */}
              {layout.windows.map((w) => (
                <rect
                  key={`${w.window.id}-timeline-band`}
                  className="tk-ng__winband"
                  x={0}
                  y={w.y}
                  width={layout.width}
                  height={w.height}
                  fill="rgba(0,0,0,0.03)"
                />
              ))}

              {edges.map((e) => (
                <path
                  key={e.key}
                  className="tk-ng__edge"
                  d={e.path}
                  fill="none"
                  stroke="#888"
                  strokeWidth={1.2}
                  strokeDasharray={e.kind === 'opened_from' ? '4 3' : undefined}
                  markerEnd="url(#tk-ng-arrow)"
                  opacity={0.7}
                />
              ))}

              {layout.nodes.map((n) => (
                <circle
                  key={n.visit.id}
                  cx={n.cx}
                  cy={n.cy}
                  r={NODE_R}
                  fill={n.color.fill}
                  stroke={n.color.border}
                  strokeWidth={1.25}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={onNodeEnter(n)}
                  onMouseMove={onNodeMove}
                  onMouseLeave={onNodeLeave}
                  onClick={onNodeClick(n)}
                  data-testid="tk-ng-node"
                />
              ))}
            </svg>
          </div>
        </div>
      )}

      {hover && (
        <div style={{ ...styles.tooltip, left: hover.x + 12, top: hover.y + 12 }}>
          <div style={{ marginBottom: 4, fontWeight: 600 }}>
            {hover.node.page?.title || hover.node.page?.normalized_url || '(no page)'}
          </div>
          <div style={{ opacity: 0.85 }}>{hover.node.page?.raw_url_first_seen}</div>
          <div style={{ marginTop: 4, opacity: 0.7 }}>domain: {hover.node.domain}</div>
          <div style={{ opacity: 0.7 }}>visited at: {new Date(hover.node.visit.at_time).toLocaleString()}</div>
          <div style={{ opacity: 0.7 }}>transition: {hover.node.visit.transition}</div>
        </div>
      )}
    </div>
  );
};

export default NodeGraphView;
