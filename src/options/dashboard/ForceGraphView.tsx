/**
 * Radial page network.
 *
 * Time-agnostic view: nodes are unique Pages, arranged around a
 * single circle grouped into arcs by domain (github.com pages sit in
 * the "github wedge," docs.google.com pages in the "docs wedge," and
 * so on). Cross-domain edges cross the ring interior; intra-domain
 * edges are short chords. Clusters are structural — no force sim
 * needs to reveal them, they're laid out that way.
 *
 * Deterministic layout — no simulation loop, positions are stable
 * the moment the query returns. Named ForceGraphView still because
 * the tab wiring depends on the module name, but the sim is gone.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { openGraphStoreForDebug } from '../debug/index';
import { pageTransitionGraph } from '../../database/graph/queries';
import type { PageGraph, PageGraphEdge, PageGraphNode } from '../../database/graph/queries';
import { colorForDomain } from './domainColor';

const RANGE_OPTIONS: ReadonlyArray<{ label: string; ms: number }> = [
  { label: 'Last 1h', ms: 60 * 60 * 1000 },
  { label: 'Last 6h', ms: 6 * 60 * 60 * 1000 },
  { label: 'Last 24h', ms: 24 * 60 * 60 * 1000 },
  { label: 'Last 7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: 'Last 30d', ms: 30 * 24 * 60 * 60 * 1000 },
  { label: 'All', ms: 0 },
];
const DEFAULT_RANGE_MS = 24 * 60 * 60 * 1000;

// Layout constants.
const NODE_MIN_R = 4;
const NODE_MAX_R = 18;
const DOMAIN_MIN_R = 10;
const DOMAIN_MAX_R = 30;
const NODE_STROKE = 1.2;
const DOMAIN_STROKE = 2;
const EDGE_MIN_OPACITY = 0.14;
const EDGE_MAX_OPACITY = 0.72;
// No angular gap between wedges — the thick separator lines and the
// colored fills carry the boundary now.
const DOMAIN_GAP_FRACTION = 0;
// Pie-slice fill opacity — subtle enough that transition edges and
// nodes stay foreground; strong enough that wedges read.
const WEDGE_FILL_OPACITY = 0.14;
const WEDGE_SEPARATOR_WIDTH = 2;
const WEDGE_SEPARATOR_COLOR = '#c8ccd1';
const WEDGE_SEPARATOR_COLOR_DARK = '#4a4d52';
// Two concentric rings — inner for the per-domain aggregate node,
// outer for the individual pages inside each domain's wedge.
const OUTER_RING_FRACTION = 0.78;
const INNER_RING_FRACTION = 0.34;
// Domain label sits this far outside the outer ring.
const LABEL_RADIUS_OFFSET = 22;

interface PositionedNode {
  id: string;
  x: number;
  y: number;
  r: number;
  page: PageGraphNode;
  domain: string;
  angle: number;
}

interface DomainNode {
  domain: string;
  x: number;
  y: number;
  r: number;
  midAngle: number;
  startAngle: number;
  endAngle: number;
  pageCount: number;
  totalVisits: number;
  color: ReturnType<typeof colorForDomain>;
}

interface PositionedEdge {
  source: PositionedNode;
  target: PositionedNode;
  weight: number;
  kind: PageGraphEdge['kind'];
}

interface DomainLabel {
  domain: string;
  x: number;
  y: number;
  textAnchor: 'start' | 'middle' | 'end';
  count: number;
  color: ReturnType<typeof colorForDomain>;
}

interface Layout {
  nodes: PositionedNode[];
  domainNodes: DomainNode[];
  edges: PositionedEdge[];
  labels: DomainLabel[];
  center: { x: number; y: number };
  outerRadius: number;
  innerRadius: number;
  // Wedge fill radius — a hair past the page ring so page nodes
  // sit on the boundary rather than outside it.
  wedgeRadius: number;
}

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', width: '100%', minHeight: 0 },
  header: { marginTop: 0, fontSize: 18, marginBottom: 8 },
  toolbar: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' },
  select: { padding: '4px 8px', fontSize: 12 },
  canvas: {
    position: 'relative',
    background: 'var(--tk-canvas-bg, #fff)',
    border: '1px solid #ccd0d5',
    height: 'calc(100vh - 160px)',
    minHeight: 400,
    overflow: 'hidden',
    userSelect: 'none',
    cursor: 'grab',
  },
  canvasDragging: { cursor: 'grabbing' },
  svg: { display: 'block', touchAction: 'none' },
  tooltip: {
    position: 'fixed', pointerEvents: 'none',
    background: 'rgba(20,20,20,0.95)', color: '#fff',
    padding: '6px 8px', fontSize: 11, borderRadius: 4, maxWidth: 360,
    zIndex: 1000, lineHeight: 1.4, wordBreak: 'break-all',
  },
  empty: { padding: 20, textAlign: 'center', opacity: 0.7 },
};

const darkOverrides = `
  @media (prefers-color-scheme: dark) {
    .tk-fg__canvas { background: #26282c !important; border-color: #3a3d42 !important; }
    .tk-fg__edge--nav { stroke: #7ea3d9 !important; }
    .tk-fg__edge--open { stroke: #e2a24d !important; }
    .tk-fg__node-stroke { stroke: rgba(255,255,255,0.35) !important; }
    .tk-fg__ring { stroke: #3a3d42 !important; }
    .tk-fg__wedge-sep { stroke: ${WEDGE_SEPARATOR_COLOR_DARK} !important; }
    .tk-fg__domlabel { fill: #cdd0d5 !important; }
  }
`;

function scaleRadius(count: number, maxCount: number, minR: number, maxR: number): number {
  if (maxCount <= 1) return minR + (maxR - minR) * 0.2;
  const t = Math.min(1, Math.log(1 + count) / Math.log(1 + maxCount));
  return minR + t * (maxR - minR);
}

function computeLayout(graph: PageGraph, width: number, height: number): Layout {
  const cx = width / 2;
  const cy = height / 2;
  const outerRadius = Math.max(60, (Math.min(width, height) / 2) * OUTER_RING_FRACTION);
  const innerRadius = Math.max(30, (Math.min(width, height) / 2) * INNER_RING_FRACTION);
  const maxPageCount = graph.nodes.reduce((m, n) => Math.max(m, n.visit_count), 1);

  const byDomain = new Map<string, PageGraphNode[]>();
  for (const n of graph.nodes) {
    const key = n.domain || '(no domain)';
    const bucket = byDomain.get(key);
    if (bucket) bucket.push(n);
    else byDomain.set(key, [n]);
  }
  const domainOrder = Array.from(byDomain.keys()).sort((a, b) => {
    const la = byDomain.get(a)!.length;
    const lb = byDomain.get(b)!.length;
    if (la !== lb) return lb - la;
    return a.localeCompare(b);
  });
  for (const d of domainOrder) {
    byDomain.get(d)!.sort((a, b) => b.visit_count - a.visit_count);
  }

  const total = graph.nodes.length;
  const domainCount = domainOrder.length;
  const gapAngle = domainCount > 1
    ? (DOMAIN_GAP_FRACTION * Math.PI * 2) / domainCount
    : 0;
  const usableAngle = Math.PI * 2 - gapAngle * domainCount;
  const anglePerNode = usableAngle / Math.max(1, total);

  // Domain totals for the inner-ring node sizing.
  const domainTotals = domainOrder.map((d) =>
    byDomain.get(d)!.reduce((acc, n) => acc + n.visit_count, 0),
  );
  const maxDomainTotal = domainTotals.reduce((m, v) => Math.max(m, v), 1);

  const positioned: PositionedNode[] = [];
  const domainNodes: DomainNode[] = [];
  const labels: DomainLabel[] = [];
  // Start at -π/2 so the first wedge is at the top of the ring.
  let angle = -Math.PI / 2;

  // Distribute the full circle to domains proportionally to page
  // count. Each domain's angular slot is ((pages_in_domain / total)
  // * 2π); pages inside sit at slot midpoints.
  domainOrder.forEach((domain, idx) => {
    const bucket = byDomain.get(domain)!;
    const domainAngle = (bucket.length / Math.max(1, total)) * usableAngle;
    const startAngle = angle;
    for (let i = 0; i < bucket.length; i++) {
      const node = bucket[i]!;
      // Center each page in its slot within the domain's arc.
      const perNode = domainAngle / bucket.length;
      const nodeAngle = startAngle + perNode * (i + 0.5);
      positioned.push({
        id: node.page.id,
        x: cx + Math.cos(nodeAngle) * outerRadius,
        y: cy + Math.sin(nodeAngle) * outerRadius,
        r: scaleRadius(node.visit_count, maxPageCount, NODE_MIN_R, NODE_MAX_R),
        page: node,
        domain,
        angle: nodeAngle,
      });
    }
    const endAngle = startAngle + domainAngle;
    angle = endAngle;
    const midAngle = (startAngle + endAngle) / 2;
    const totalVisits = domainTotals[idx]!;
    const color = colorForDomain(domain);

    domainNodes.push({
      domain,
      x: cx + Math.cos(midAngle) * innerRadius,
      y: cy + Math.sin(midAngle) * innerRadius,
      r: scaleRadius(totalVisits, maxDomainTotal, DOMAIN_MIN_R, DOMAIN_MAX_R),
      midAngle,
      startAngle,
      endAngle,
      pageCount: bucket.length,
      totalVisits,
      color,
    });

    const labelRadius = outerRadius + LABEL_RADIUS_OFFSET;
    const lx = cx + Math.cos(midAngle) * labelRadius;
    const ly = cy + Math.sin(midAngle) * labelRadius;
    const cosMid = Math.cos(midAngle);
    const textAnchor: DomainLabel['textAnchor'] =
      cosMid > 0.3 ? 'start' : cosMid < -0.3 ? 'end' : 'middle';
    labels.push({
      domain,
      x: lx,
      y: ly,
      textAnchor,
      count: bucket.length,
      color,
    });
    angle += gapAngle;
  });

  const byId = new Map(positioned.map((n) => [n.id, n]));
  const edges: PositionedEdge[] = [];
  for (const e of graph.edges) {
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (!s || !t) continue;
    edges.push({ source: s, target: t, weight: e.weight, kind: e.kind });
  }

  return {
    nodes: positioned,
    domainNodes,
    edges,
    labels,
    center: { x: cx, y: cy },
    outerRadius,
    innerRadius,
    wedgeRadius: outerRadius + NODE_MAX_R + 4,
  };
}

// SVG pie-slice path from (cx, cy) center out to radius r, sweeping
// [startAngle, endAngle] in radians. Handles the >180° arc-flag case.
function pieSlicePath(
  cx: number, cy: number, r: number, startAngle: number, endAngle: number,
): string {
  const x1 = cx + Math.cos(startAngle) * r;
  const y1 = cy + Math.sin(startAngle) * r;
  const x2 = cx + Math.cos(endAngle) * r;
  const y2 = cy + Math.sin(endAngle) * r;
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

interface Hover { node: PositionedNode; x: number; y: number }

export const ForceGraphView: React.FC = () => {
  const [rangeMs, setRangeMs] = useState<number>(DEFAULT_RANGE_MS);
  const [graph, setGraph] = useState<PageGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 1000, h: 600 });
  const [hover, setHover] = useState<Hover | null>(null);

  const canvasRef = useRef<HTMLDivElement | null>(null);

  // Pan / zoom.
  const [viewport, setViewport] = useState<{ x: number; y: number; k: number }>(
    { x: 0, y: 0, k: 1 },
  );
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; startVx: number; startVy: number } | null>(null);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize({ w: Math.max(300, rect.width), h: Math.max(300, rect.height) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setGraph(null);
      setError(null);
      try {
        const g = await openGraphStoreForDebug();
        const now = Date.now();
        const opts = rangeMs > 0 ? { since: now - rangeMs, until: now } : {};
        const result = await pageTransitionGraph(g, opts);
        if (!cancelled) setGraph(result);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [rangeMs]);

  const layout = useMemo(() => {
    if (!graph) return null;
    return computeLayout(graph, size.w, size.h);
  }, [graph, size.w, size.h]);

  // Reset viewport when the layout regenerates (new range, new size).
  useEffect(() => {
    setViewport({ x: 0, y: 0, k: 1 });
  }, [rangeMs, size.w, size.h]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, startVx: viewport.x, startVy: viewport.y };
    setDragging(true);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }, [viewport]);
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setViewport((v) => ({ ...v, x: drag.startVx + (e.clientX - drag.startX), y: drag.startVy + (e.clientY - drag.startY) }));
  }, []);
  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    setDragging(false);
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }, []);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      setViewport((v) => {
        const nextK = Math.max(0.2, Math.min(4, v.k * (e.deltaY > 0 ? 1 / 1.15 : 1.15)));
        const ratio = nextK / v.k;
        return { k: nextK, x: cx - ratio * (cx - v.x), y: cy - ratio * (cy - v.y) };
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const onNodeEnter = useCallback((n: PositionedNode) => (event: React.MouseEvent) => {
    setHover({ node: n, x: event.clientX, y: event.clientY });
  }, []);
  const onNodeMove = useCallback((event: React.MouseEvent) => {
    setHover((prev) => (prev ? { ...prev, x: event.clientX, y: event.clientY } : prev));
  }, []);
  const onNodeLeave = useCallback(() => setHover(null), []);
  const onNodeClick = useCallback((n: PositionedNode) => () => {
    const url = n.page.page.raw_url_first_seen || n.page.page.normalized_url;
    if (url) globalThis.open(url, '_blank', 'noopener');
  }, []);

  const onRangeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setRangeMs(Number(e.target.value));
  }, []);

  const maxWeight = useMemo(() => {
    if (!layout) return 1;
    return layout.edges.reduce((m, e) => Math.max(m, e.weight), 1);
  }, [layout]);

  const nodeCount = graph?.nodes.length ?? 0;
  const edgeCount = graph?.edges.length ?? 0;
  const domainCount = layout?.labels.length ?? 0;

  return (
    <div style={styles.root}>
      <style>{darkOverrides}</style>
      <h2 style={styles.header}>Network</h2>
      <div style={styles.toolbar}>
        <label htmlFor="tk-fg-range" style={{ fontSize: 12 }}>Range</label>
        <select id="tk-fg-range" style={styles.select} value={rangeMs} onChange={onRangeChange}>
          {RANGE_OPTIONS.map((r) => (
            <option key={r.ms} value={r.ms}>{r.label}</option>
          ))}
        </select>
        <span style={{ fontSize: 12, opacity: 0.7 }}>
          {graph ? `${nodeCount} pages · ${domainCount} domains · ${edgeCount} transitions` : ''}
        </span>
        <span style={{ fontSize: 12, opacity: 0.5, marginLeft: 'auto' }}>drag = pan · wheel = zoom · click a node = open</span>
      </div>
      {error && <div className="tk-dash__error">{error}</div>}
      <div
        ref={canvasRef}
        className="tk-fg__canvas"
        style={{ ...styles.canvas, ...(dragging ? styles.canvasDragging : {}) }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {graph === null && !error && <div style={styles.empty}>Loading…</div>}
        {graph && graph.nodes.length === 0 && (
          <div style={styles.empty}>No captured pages in this range yet.</div>
        )}
        {layout && (
          <svg width={size.w} height={size.h} style={styles.svg}>
            <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.k})`}>
              {/* Pie-slice fills — one per domain wedge, tinted with
                  the domain's color at low opacity so the transition
                  edges + nodes still dominate visually but the
                  grouping is obvious at a glance. */}
              {layout.domainNodes.map((d) => (
                <path
                  key={`w:${d.domain}`}
                  d={pieSlicePath(layout.center.x, layout.center.y, layout.wedgeRadius, d.startAngle, d.endAngle)}
                  fill={d.color.fill}
                  fillOpacity={WEDGE_FILL_OPACITY}
                  stroke="none"
                />
              ))}
              {/* Thick separator lines at each wedge boundary — the
                  same boundaries the pie fills carry, but crisp. */}
              {layout.domainNodes.map((d) => {
                const x = layout.center.x + Math.cos(d.startAngle) * layout.wedgeRadius;
                const y = layout.center.y + Math.sin(d.startAngle) * layout.wedgeRadius;
                return (
                  <line
                    key={`s:${d.domain}`}
                    className="tk-fg__wedge-sep"
                    x1={layout.center.x}
                    y1={layout.center.y}
                    x2={x}
                    y2={y}
                    stroke={WEDGE_SEPARATOR_COLOR}
                    strokeWidth={WEDGE_SEPARATOR_WIDTH}
                    strokeLinecap="round"
                  />
                );
              })}
              {/* Edges under nodes so labels sit on top. */}
              {layout.edges.map((e, i) => {
                const w = e.weight;
                const opacity = EDGE_MIN_OPACITY + (EDGE_MAX_OPACITY - EDGE_MIN_OPACITY) *
                  (Math.log(1 + w) / Math.log(1 + maxWeight));
                return (
                  <line
                    key={`e${i}`}
                    className={e.kind === 'opened_from' ? 'tk-fg__edge--open' : 'tk-fg__edge--nav'}
                    x1={e.source.x}
                    y1={e.source.y}
                    x2={e.target.x}
                    y2={e.target.y}
                    stroke={e.kind === 'opened_from' ? '#c66a2c' : '#4a76c4'}
                    strokeWidth={1 + Math.min(3, Math.log(1 + w))}
                    opacity={opacity}
                  />
                );
              })}
              {layout.nodes.map((n) => {
                const color = colorForDomain(n.domain);
                return (
                  <circle
                    key={n.id}
                    cx={n.x}
                    cy={n.y}
                    r={n.r}
                    fill={color.fill}
                    stroke={color.border}
                    strokeWidth={NODE_STROKE}
                    className="tk-fg__node-stroke"
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={onNodeEnter(n)}
                    onMouseMove={onNodeMove}
                    onMouseLeave={onNodeLeave}
                    onClick={onNodeClick(n)}
                  />
                );
              })}
              {/* Domain aggregate nodes on the inner ring — heavier
                  stroke so they read as a different tier than the
                  pages on the outer ring. */}
              {layout.domainNodes.map((d) => (
                <circle
                  key={`d:${d.domain}`}
                  cx={d.x}
                  cy={d.y}
                  r={d.r}
                  fill={d.color.fill}
                  stroke={d.color.border}
                  strokeWidth={DOMAIN_STROKE}
                  className="tk-fg__node-stroke"
                  style={{ pointerEvents: 'none' }}
                />
              ))}
              {layout.labels.map((l) => (
                <text
                  key={l.domain}
                  className="tk-fg__domlabel"
                  x={l.x}
                  y={l.y}
                  fontSize={11}
                  fontFamily="ui-monospace, Menlo, monospace"
                  fill="#4a4d52"
                  textAnchor={l.textAnchor}
                  dominantBaseline="middle"
                  style={{ pointerEvents: 'none' }}
                >
                  {l.domain} · {l.count}
                </text>
              ))}
            </g>
          </svg>
        )}
      </div>
      {hover && (
        <div style={{ ...styles.tooltip, left: hover.x + 12, top: hover.y + 12 }}>
          <div style={{ marginBottom: 4, fontWeight: 600 }}>
            {hover.node.page.page.title || hover.node.page.page.normalized_url || '(no page)'}
          </div>
          <div style={{ opacity: 0.85 }}>{hover.node.page.page.raw_url_first_seen}</div>
          <div style={{ marginTop: 4, opacity: 0.7 }}>
            {hover.node.domain || '(no domain)'} · {hover.node.page.visit_count} visit{hover.node.page.visit_count === 1 ? '' : 's'}
          </div>
        </div>
      )}
    </div>
  );
};

export default ForceGraphView;
