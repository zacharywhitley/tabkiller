/**
 * Force-directed page graph.
 *
 * Time-agnostic view: nodes are unique Pages, edges are aggregated
 * page-to-page transitions (navigated_from = solid blue, opened_from
 * = solid amber). Clusters emerge naturally around related domains
 * (github.com pages pull toward each other because they link to each
 * other), which is the whole point of the view — see "topics" and
 * "hubs" you'd never spot on a time axis.
 *
 * The layout is a small Verlet-integrated force sim that runs in a
 * requestAnimationFrame loop. No external force-graph library —
 * ~50 lines of physics, easier to tune when we want to change the
 * feel (spring stiffness, cluster tightness, hub gravity, etc.).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { openGraphStoreForDebug } from '../debug/index';
import { pageTransitionGraph } from '../../database/graph/queries';
import type { PageGraph, PageGraphEdge, PageGraphNode } from '../../database/graph/queries';
import { colorForDomain } from './domainColor';

// ---- Range picker: same shape as the other timeline views so the UX
// feels consistent. Time-agnostic layout, but time-scoped data.

const RANGE_OPTIONS: ReadonlyArray<{ label: string; ms: number }> = [
  { label: 'Last 1h', ms: 60 * 60 * 1000 },
  { label: 'Last 6h', ms: 6 * 60 * 60 * 1000 },
  { label: 'Last 24h', ms: 24 * 60 * 60 * 1000 },
  { label: 'Last 7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: 'Last 30d', ms: 30 * 24 * 60 * 60 * 1000 },
  { label: 'All', ms: 0 },
];
const DEFAULT_RANGE_MS = 24 * 60 * 60 * 1000;

// ---- Force sim tuning ----
const SIM_ITERATIONS = 600;
const REPULSE_K = 3800;      // Coulomb strength (per pair)
const SPRING_K = 0.02;       // Hooke strength (per edge)
const SPRING_REST = 90;      // desired edge length in px
const CENTER_K = 0.008;      // pull toward center each step
const DAMPING = 0.85;
const MAX_SPEED = 25;

// ---- Node/edge visual constants ----
const NODE_MIN_R = 4;
const NODE_MAX_R = 22;
const NODE_STROKE = 1.2;
const EDGE_MIN_OPACITY = 0.18;
const EDGE_MAX_OPACITY = 0.75;

interface SimNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  page: PageGraphNode;
}

interface SimEdge {
  source: SimNode;
  target: SimNode;
  weight: number;
  kind: PageGraphEdge['kind'];
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
  }
`;

function scaleRadius(count: number, maxCount: number): number {
  if (maxCount <= 1) return NODE_MIN_R + 3;
  const t = Math.min(1, Math.log(1 + count) / Math.log(1 + maxCount));
  return NODE_MIN_R + t * (NODE_MAX_R - NODE_MIN_R);
}

function initSim(graph: PageGraph, width: number, height: number): {
  nodes: SimNode[];
  edges: SimEdge[];
} {
  const maxCount = graph.nodes.reduce((m, n) => Math.max(m, n.visit_count), 1);
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.max(80, Math.min(width, height) / 3);
  // Init on a circle so the sim untangles predictably (random init
  // tangles bad enough that a first-pass viewer sees a hairball).
  const nodes: SimNode[] = graph.nodes.map((n, i) => {
    const theta = (i / Math.max(1, graph.nodes.length)) * Math.PI * 2;
    return {
      id: n.page.id,
      x: cx + Math.cos(theta) * r,
      y: cy + Math.sin(theta) * r,
      vx: 0,
      vy: 0,
      r: scaleRadius(n.visit_count, maxCount),
      page: n,
    };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: SimEdge[] = [];
  for (const e of graph.edges) {
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (!s || !t) continue;
    edges.push({ source: s, target: t, weight: e.weight, kind: e.kind });
  }
  return { nodes, edges };
}

function stepSim(nodes: SimNode[], edges: SimEdge[], cx: number, cy: number): void {
  // Repulsion — O(n^2). Fine for a few hundred nodes; if we outgrow
  // this a quadtree implementation would be the next step.
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i]!;
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j]!;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist2 = dx * dx + dy * dy || 0.01;
      const force = REPULSE_K / dist2;
      const dist = Math.sqrt(dist2);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }
  }
  // Attraction along edges (Hooke's law).
  for (const e of edges) {
    const dx = e.target.x - e.source.x;
    const dy = e.target.y - e.source.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
    const strength = SPRING_K * Math.log(1 + e.weight);
    const displacement = dist - SPRING_REST;
    const fx = (dx / dist) * displacement * strength;
    const fy = (dy / dist) * displacement * strength;
    e.source.vx += fx;
    e.source.vy += fy;
    e.target.vx -= fx;
    e.target.vy -= fy;
  }
  // Center gravity + integrate + clamp + damp.
  for (const n of nodes) {
    n.vx += (cx - n.x) * CENTER_K;
    n.vy += (cy - n.y) * CENTER_K;
    const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
    if (speed > MAX_SPEED) {
      n.vx = (n.vx / speed) * MAX_SPEED;
      n.vy = (n.vy / speed) * MAX_SPEED;
    }
    n.x += n.vx;
    n.y += n.vy;
    n.vx *= DAMPING;
    n.vy *= DAMPING;
  }
}

interface Hover { node: SimNode; x: number; y: number }

export const ForceGraphView: React.FC = () => {
  const [rangeMs, setRangeMs] = useState<number>(DEFAULT_RANGE_MS);
  const [graph, setGraph] = useState<PageGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 1000, h: 600 });
  const [hover, setHover] = useState<Hover | null>(null);
  const [_tick, setTick] = useState(0);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const simRef = useRef<{ nodes: SimNode[]; edges: SimEdge[] } | null>(null);
  const framesLeftRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  // Pan / zoom state.
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

  // Init sim whenever graph or canvas size changes.
  useEffect(() => {
    if (!graph) {
      simRef.current = null;
      return;
    }
    simRef.current = initSim(graph, size.w, size.h);
    framesLeftRef.current = SIM_ITERATIONS;
    setViewport({ x: 0, y: 0, k: 1 });
    // Kick the RAF loop.
    if (rafRef.current == null) {
      const tick = () => {
        if (!simRef.current || framesLeftRef.current <= 0) {
          rafRef.current = null;
          return;
        }
        // Two physics steps per frame keeps convergence brisk without
        // stealing the whole animation budget.
        stepSim(simRef.current.nodes, simRef.current.edges, size.w / 2, size.h / 2);
        stepSim(simRef.current.nodes, simRef.current.edges, size.w / 2, size.h / 2);
        framesLeftRef.current -= 2;
        setTick((t) => t + 1);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [graph, size.w, size.h]);

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

  // Wheel-zoom. Attach non-passive so we can preventDefault (same
  // dance as TimelineView).
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
        // Zoom about the pointer position.
        const ratio = nextK / v.k;
        return { k: nextK, x: cx - ratio * (cx - v.x), y: cy - ratio * (cy - v.y) };
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const onNodeEnter = useCallback((n: SimNode) => (event: React.MouseEvent) => {
    setHover({ node: n, x: event.clientX, y: event.clientY });
  }, []);
  const onNodeMove = useCallback((event: React.MouseEvent) => {
    setHover((prev) => (prev ? { ...prev, x: event.clientX, y: event.clientY } : prev));
  }, []);
  const onNodeLeave = useCallback(() => setHover(null), []);
  const onNodeClick = useCallback((n: SimNode) => () => {
    const url = n.page.page.raw_url_first_seen || n.page.page.normalized_url;
    if (url) globalThis.open(url, '_blank', 'noopener');
  }, []);

  const onRangeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setRangeMs(Number(e.target.value));
  }, []);

  const maxWeight = useMemo(() => {
    if (!simRef.current) return 1;
    return simRef.current.edges.reduce((m, e) => Math.max(m, e.weight), 1);
  }, [simRef.current, _tick]);

  const nodeCount = graph?.nodes.length ?? 0;
  const edgeCount = graph?.edges.length ?? 0;

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
          {graph ? `${nodeCount} pages · ${edgeCount} transitions` : ''}
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
        {simRef.current && (
          <svg width={size.w} height={size.h} style={styles.svg}>
            <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.k})`}>
              {simRef.current.edges.map((e, i) => {
                const w = e.weight;
                const opacity = EDGE_MIN_OPACITY + (EDGE_MAX_OPACITY - EDGE_MIN_OPACITY) * (Math.log(1 + w) / Math.log(1 + maxWeight));
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
              {simRef.current.nodes.map((n) => {
                const color = colorForDomain(n.page.domain);
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
            {hover.node.page.domain || '(no domain)'} · {hover.node.page.visit_count} visit{hover.node.page.visit_count === 1 ? '' : 's'}
          </div>
        </div>
      )}
    </div>
  );
};

export default ForceGraphView;
