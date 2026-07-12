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
import { openTabsGrouped, windowsWithVisitsBetween } from '../../database/graph/queries';
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
// Left-pane label columns. LABEL_PANE_WIDTH is user-adjustable (drag the
// splitter between the panes; persisted to localStorage). Column x
// offsets are relative to the left edge and stay fixed as the pane
// grows/shrinks — path labels that exceed the pane clip, hover on a
// dot to see the full URL.
const DEFAULT_LABEL_PANE_WIDTH = 300;
const MIN_LABEL_PANE_WIDTH = 140;
const MAX_LABEL_PANE_WIDTH = 720;
const DOMAIN_COL_X = PAGE_LABEL_INDENT;
const PATH_COL_X = PAGE_LABEL_INDENT + 100;
const SPLITTER_WIDTH = 4;
const LABEL_PANE_WIDTH_STORAGE_KEY = 'tabkiller.dashboard.graph.labelPaneWidth';
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
  root: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
  },
  canvasOuter: {
    background: 'var(--tk-canvas-bg, #fff)',
    border: '1px solid #ccd0d5',
    width: '100%',
    // Plain block with overflow-y auto so tall content scrolls
    // internally. A `display: flex` container here would compress
    // children and defeat the overflow.
    overflowY: 'auto',
    overflowX: 'hidden',
    height: 'calc(100vh - 100px)',
  },
  // Inner flex row lives inside canvasOuter — its height is set by its
  // children (the two tall SVGs) so canvasOuter's overflow-y actually
  // sees content taller than itself and scrolls.
  canvasRow: {
    display: 'flex',
    minHeight: '100%',
  },
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
  tooltip: { position: 'fixed', pointerEvents: 'none', background: 'rgba(20,20,20,0.95)', color: '#fff', padding: '6px 8px', fontSize: 11, borderRadius: 4, maxWidth: 360, zIndex: 1000, lineHeight: 1.4, wordBreak: 'break-all' },
  empty: { padding: 20, textAlign: 'center', opacity: 0.7 },
};

const darkOverrides = `
  @media (prefers-color-scheme: dark) {
    .tk-ng__canvas-outer { background: #26282c !important; border-color: #3a3d42 !important; }
    .tk-ng__label-pane { background: #23262b !important; }
    .tk-ng__splitter { background: #3a3d42 !important; }
    .tk-ng__splitter--active { background: #4b8fed !important; }
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
        // Cubic Bezier with horizontal tangents at both endpoints —
        // reads like an arctan transition between the two rows: flat
        // near the endpoints, curved in the middle. The two control
        // points sit at the horizontal midpoint, one on each row's Y,
        // which puts the tangent horizontal at both dots.
        // For the same-row case the S-curve would collapse to a
        // straight line right along the lane, so we arc up and over
        // with a small elevation instead.
        const midX = (from.cx + to.cx) / 2;
        const path = from.cy === to.cy
          ? `M ${from.cx} ${from.cy} C ${from.cx} ${from.cy - 18}, ${to.cx} ${to.cy - 18}, ${to.cx} ${to.cy}`
          : `M ${from.cx} ${from.cy} C ${midX} ${from.cy}, ${midX} ${to.cy}, ${to.cx} ${to.cy}`;
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
  const [openTabCount, setOpenTabCount] = useState<number>(0);
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
        const openNow = await openTabsGrouped(g);
        if (cancelled) return;
        const openTotal = openNow.reduce((n, w) => n + w.tabs.length, 0);
        setOpenTabCount(openTotal);
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

  // Label pane width is user-adjustable via a drag splitter between the
  // two panes. Persisted to localStorage so it survives reloads.
  const [labelPaneWidth, setLabelPaneWidth] = useState<number>(() => {
    try {
      const raw = globalThis.localStorage?.getItem(LABEL_PANE_WIDTH_STORAGE_KEY);
      const parsed = raw ? Number.parseInt(raw, 10) : NaN;
      if (Number.isFinite(parsed) && parsed >= MIN_LABEL_PANE_WIDTH && parsed <= MAX_LABEL_PANE_WIDTH) {
        return parsed;
      }
    } catch {
      // localStorage disabled — fall through to default
    }
    return DEFAULT_LABEL_PANE_WIDTH;
  });
  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(LABEL_PANE_WIDTH_STORAGE_KEY, String(labelPaneWidth));
    } catch {
      // ignore
    }
  }, [labelPaneWidth]);

  // Splitter drag state.
  const canvasRowRef = React.useRef<HTMLDivElement | null>(null);
  const splitterDragStateRef = React.useRef<{ startX: number; startWidth: number } | null>(null);
  const [splitterDragging, setSplitterDragging] = useState(false);
  const onSplitterMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    splitterDragStateRef.current = { startX: e.clientX, startWidth: labelPaneWidth };
    setSplitterDragging(true);
    e.preventDefault();
  }, [labelPaneWidth]);
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

  // Timeline pane width is (viewport minus label pane) × zoom multiplier.
  // Makes the SVG wider than its container so it naturally scrolls and
  // drag-to-pan feels correct out of the box.
  const timelineViewportWidth = Math.max(400, width - labelPaneWidth - SPLITTER_WIDTH);
  const timelineSvgWidth = timelineViewportWidth * TIMELINE_ZOOM;

  // Visible slice of the timeline based on horizontal scroll. Rows for
  // pages whose visits are entirely off-screen drop out — the graph is
  // visit-centric so an empty page-lane isn't useful. Null until the
  // pane has mounted; the layout falls back to full data until then.
  const [visibleWindow, setVisibleWindow] = useState<[number, number] | null>(null);

  const visibleData = useMemo(() => {
    if (!data) return null;
    if (!visibleWindow) return data;
    const [vFrom, vTo] = visibleWindow;
    // Graph is visit-centric — the only thing we draw per visit is
    // one dot at at_time. Filter by at_time falling inside the
    // visible window: a visit that started before the window and is
    // still open would have a lifetime overlap, but its dot would
    // render off-screen and leave the tab row occupying space with
    // nothing visible in it.
    const out: WindowTabVisitWindow[] = [];
    for (const w of data) {
      const tabs: typeof w.tabs = [];
      for (const t of w.tabs) {
        const visits = t.visits.filter(
          (v) => v.visit.at_time >= vFrom && v.visit.at_time <= vTo,
        );
        if (visits.length === 0) continue;
        tabs.push({ ...t, visits });
      }
      if (tabs.length === 0) continue;
      out.push({ ...w, tabs });
    }
    return out;
  }, [data, visibleWindow]);

  const layout = useMemo(() => {
    if (!visibleData) return null;
    return computeLayout(visibleData, timelineSvgWidth, windowRange[0], windowRange[1]);
  }, [visibleData, timelineSvgWidth, windowRange]);

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

  // Track scroll position → time window. See GanttView for the shape
  // of this effect; the two are intentionally identical because both
  // views share the label-pane-plus-scroll-timeline structure.
  useEffect(() => {
    if (!data) return;
    const pane = timelinePaneRef.current;
    if (!pane) return;
    let raf: number | null = null;
    const compute = () => {
      if (timelineSvgWidth <= 0) return;
      const total = windowRange[1] - windowRange[0];
      const from = windowRange[0] + (pane.scrollLeft / timelineSvgWidth) * total;
      const to = windowRange[0] + ((pane.scrollLeft + pane.clientWidth) / timelineSvgWidth) * total;
      setVisibleWindow([from, to]);
    };
    compute();
    const onScroll = () => {
      if (raf != null) return;
      raf = requestAnimationFrame(() => {
        compute();
        raf = null;
      });
    };
    pane.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      pane.removeEventListener('scroll', onScroll);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [data, timelineSvgWidth, windowRange]);

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
          {data
            ? `${data.length} windows · ${totalTabs} of ${openTabCount} open tabs shown · ${totalVisits} visits · ${edges.length} edges`
            : ''}
        </span>
      </div>

      {error && <div className="tk-dash__error">{error}</div>}
      {data === null && !error && <div style={styles.empty}>Loading…</div>}
      {data && data.length === 0 && (
        <div style={styles.empty}>No windows in this range.</div>
      )}

      {layout && data && data.length > 0 && (
        <div
          className="tk-ng__canvas-outer"
          style={styles.canvasOuter}
        >
        <div ref={canvasRowRef} style={styles.canvasRow}>
          {/* Left pane: window / tab / domain / path labels, user-resizable
              width, no horizontal scroll — stays visible while the timeline
              pans. */}
          <svg
            className="tk-ng__label-pane"
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
                  className="tk-ng__winband"
                  x={0}
                  y={w.y}
                  width={labelPaneWidth}
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

          {/* Drag splitter between the two panes. */}
          <div
            className={`tk-ng__splitter${splitterDragging ? ' tk-ng__splitter--active' : ''}`}
            style={{ ...styles.splitter, ...(splitterDragging ? styles.splitterActive : {}) }}
            onMouseDown={onSplitterMouseDown}
            data-testid="tk-ng-splitter"
            title="Drag to resize"
          />

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
                  strokeWidth={2}
                  strokeDasharray={e.kind === 'opened_from' ? '4 3' : undefined}
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
