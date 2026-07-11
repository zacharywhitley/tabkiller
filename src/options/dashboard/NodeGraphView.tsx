/**
 * Node graph view — temporally-anchored Pages + inter-Page transitions.
 *
 * Layout rules (see also the epic brief):
 *   - X coord = normalized `first_seen` mapped linearly to the visible
 *     window (leftward = older).
 *   - Y coord = bucketed domain lane. Same domain -> same lane so a
 *     Page's vertical position stays stable across visits.
 *   - Radius ~ sqrt(visit_count) so a Page visited 100x is ~3x wider
 *     than one visited 10x, not 10x wider.
 *   - Edges = cubic curve between two node centers with an arrow head.
 *     `navigated_from` = solid; `opened_from` = dashed.
 *
 * Deliberately not a force layout: pure force on temporal data is
 * pretty but useless. Anchoring by time keeps the "when" legible.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { openGraphStoreForDebug } from '../debug/index';
import { pagesAndTransitionsBetween } from '../../database/graph/queries';
import type {
  PageTransition,
  PagesAndTransitionsResult,
} from '../../database/graph/queries';
import type { PageNode } from '../../database/graph/types';
import { colorForDomain, hostnameOf } from './domainColor';

const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000; // last 24h
const CANVAS_PADDING = 40;
const AXIS_HEIGHT = 24;
const MIN_R = 6;
const MAX_R = 22;

interface Node {
  page: PageNode;
  cx: number;
  cy: number;
  r: number;
  color: ReturnType<typeof colorForDomain>;
  domain: string;
}

interface Edge {
  from_id: string;
  to_id: string;
  kind: PageTransition['kind'];
  count: number;
  path: string;
}

interface Layout {
  nodes: Node[];
  edges: Edge[];
  laneLabels: Array<{ y: number; label: string }>;
  width: number;
  height: number;
  ticks: Array<{ x: number; label: string }>;
}

// Short per-node label for the SVG. Prefer the URL path so pages that share
// a domain are visually distinct. Fall back to the page title, then a
// domain-only string if the URL is unparseable.
function pageLabelFor(rawUrl: string, title: string | null | undefined): string {
  let path = '';
  try {
    const parsed = new URL(rawUrl);
    path = (parsed.pathname || '') + (parsed.search || '');
    if (path === '/' || path === '') path = '';
  } catch {
    // fallthrough
  }
  const preferred = path || title || rawUrl;
  return preferred.length > 44 ? preferred.slice(0, 41) + '…' : preferred;
}

function bucketDomains(pages: PageNode[]): Map<string, number> {
  const domains = new Set<string>();
  for (const p of pages) {
    const url = p.raw_url_first_seen || p.normalized_url;
    domains.add(hostnameOf(url));
  }
  const ordered = Array.from(domains).sort();
  const laneByDomain = new Map<string, number>();
  ordered.forEach((d, i) => laneByDomain.set(d, i));
  return laneByDomain;
}

function computeLayout(
  data: PagesAndTransitionsResult,
  width: number,
  windowStart: number,
  windowEnd: number,
): Layout {
  const laneByDomain = bucketDomains(data.pages);
  const laneCount = Math.max(1, laneByDomain.size);
  const laneHeight = 60;
  const laneY0 = AXIS_HEIGHT + CANVAS_PADDING;
  const usableWidth = Math.max(200, width - 2 * CANVAS_PADDING);
  const range = Math.max(1, windowEnd - windowStart);
  const timeToX = (t: number) => CANVAS_PADDING + ((t - windowStart) / range) * usableWidth;

  const maxCount = data.pages.reduce((m, p) => Math.max(m, p.visit_count), 1);

  const nodes: Node[] = data.pages
    .filter((p) => p.first_seen >= windowStart && p.first_seen <= windowEnd)
    .map((p) => {
      const url = p.raw_url_first_seen || p.normalized_url;
      const domain = hostnameOf(url);
      const lane = laneByDomain.get(domain) ?? 0;
      const r = MIN_R + (MAX_R - MIN_R) * Math.sqrt(p.visit_count / maxCount);
      return {
        page: p,
        cx: timeToX(p.first_seen),
        cy: laneY0 + lane * laneHeight + laneHeight / 2,
        r,
        color: colorForDomain(domain),
        domain,
      };
    });

  const nodeById = new Map(nodes.map((n) => [n.page.id, n]));
  const edges: Edge[] = [];
  for (const t of data.transitions) {
    const a = nodeById.get(t.from_page_id);
    const b = nodeById.get(t.to_page_id);
    if (!a || !b) continue;
    const midX = (a.cx + b.cx) / 2;
    const midY = a.cy === b.cy ? a.cy - 30 : (a.cy + b.cy) / 2;
    const path = `M ${a.cx} ${a.cy} Q ${midX} ${midY}, ${b.cx} ${b.cy}`;
    edges.push({
      from_id: t.from_page_id,
      to_id: t.to_page_id,
      kind: t.kind,
      count: t.count,
      path,
    });
  }

  const laneLabels: Layout['laneLabels'] = [];
  for (const [domain, lane] of laneByDomain) {
    laneLabels.push({ y: laneY0 + lane * laneHeight + laneHeight / 2, label: domain });
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

  const height = laneY0 + laneCount * laneHeight + CANVAS_PADDING;
  return { nodes, edges, laneLabels, width, height, ticks };
}

const RANGE_OPTIONS: ReadonlyArray<{ label: string; ms: number }> = [
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
  canvas: { background: 'var(--tk-canvas-bg, #fff)', border: '1px solid #ccd0d5', width: '100%', overflow: 'auto' },
  tooltip: { position: 'fixed', pointerEvents: 'none', background: 'rgba(20,20,20,0.95)', color: '#fff', padding: '6px 8px', fontSize: 11, borderRadius: 4, maxWidth: 360, zIndex: 1000, lineHeight: 1.4, wordBreak: 'break-all' },
  empty: { padding: 20, textAlign: 'center', opacity: 0.7 },
};

const darkOverrides = `
  @media (prefers-color-scheme: dark) {
    .tk-ng__canvas { background: #26282c !important; border-color: #3a3d42 !important; }
    .tk-ng__axis { fill: #b0b3b7 !important; }
    .tk-ng__lane-label { fill: #a8abb0 !important; }
    .tk-ng__nodelabel { fill: #cdd0d5 !important; }
    .tk-ng__edge { stroke: #5f6266 !important; }
  }
`;

interface Hover { node: Node; x: number; y: number }

export const NodeGraphView: React.FC = () => {
  const [rangeMs, setRangeMs] = useState<number>(DEFAULT_WINDOW_MS);
  const [data, setData] = useState<PagesAndTransitionsResult | null>(null);
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
      setError(null);
      try {
        const g = await openGraphStoreForDebug();
        const t = Date.now();
        const from = t - rangeMs;
        const result = await pagesAndTransitionsBetween(g, from, t);
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

  const layout = useMemo(() => {
    if (!data) return null;
    return computeLayout(data, width, windowRange[0], windowRange[1]);
  }, [data, width, windowRange]);

  const onRangeChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setRangeMs(Number(event.target.value));
  }, []);

  const onNodeEnter = useCallback((n: Node) => (event: React.MouseEvent) => {
    setHover({ node: n, x: event.clientX, y: event.clientY });
  }, []);
  const onNodeMove = useCallback((event: React.MouseEvent) => {
    setHover((prev) => (prev ? { ...prev, x: event.clientX, y: event.clientY } : prev));
  }, []);
  const onNodeLeave = useCallback(() => setHover(null), []);
  const onNodeClick = useCallback((n: Node) => () => {
    const url = n.page.raw_url_first_seen || n.page.normalized_url;
    if (url) globalThis.open(url, '_blank', 'noopener');
  }, []);

  return (
    <>
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
          {data ? `${data.pages.length} pages · ${data.transitions.length} transitions` : ''}
        </span>
      </div>

      {error && <div className="tk-dash__error">{error}</div>}

      {data === null && !error && <div style={styles.empty}>Loading…</div>}

      {data && data.pages.length === 0 && (
        <div style={styles.empty}>No pages in this window.</div>
      )}

      {layout && data && data.pages.length > 0 && (
        <div className="tk-ng__canvas" style={styles.canvas}>
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

            {layout.laneLabels.map((lane) => (
              <text
                key={lane.label}
                className="tk-ng__lane-label"
                x={4}
                y={lane.y + 4}
                fontSize={10}
                fill="#8a8d92"
                fontFamily="ui-monospace, Menlo, monospace"
                style={{ pointerEvents: 'none' }}
              >
                {lane.label}
              </text>
            ))}

            {layout.edges.map((e) => (
              <path
                key={`${e.kind}-${e.from_id}-${e.to_id}`}
                className="tk-ng__edge"
                d={e.path}
                fill="none"
                stroke="#888"
                strokeWidth={Math.min(3, 0.75 + Math.log2(e.count + 1))}
                strokeDasharray={e.kind === 'opened_from' ? '4 3' : undefined}
                markerEnd="url(#tk-ng-arrow)"
                opacity={0.7}
              />
            ))}

            {layout.nodes.map((n) => (
              <g
                key={n.page.id}
                onMouseEnter={onNodeEnter(n)}
                onMouseMove={onNodeMove}
                onMouseLeave={onNodeLeave}
                onClick={onNodeClick(n)}
                style={{ cursor: 'pointer' }}
                data-testid="tk-ng-node"
              >
                <circle
                  cx={n.cx}
                  cy={n.cy}
                  r={n.r}
                  fill={n.color.fill}
                  stroke={n.color.border}
                  strokeWidth={1.5}
                />
                <text
                  x={n.cx + n.r + 4}
                  y={n.cy + 3}
                  fontSize={10}
                  fill="#3f4147"
                  className="tk-ng__nodelabel"
                  style={{ pointerEvents: 'none' }}
                >
                  {pageLabelFor(n.page.raw_url_first_seen || n.page.normalized_url, n.page.title)}
                </text>
              </g>
            ))}
          </svg>
        </div>
      )}

      {hover && (
        <div style={{ ...styles.tooltip, left: hover.x + 12, top: hover.y + 12 }}>
          <div style={{ marginBottom: 4, fontWeight: 600 }}>
            {hover.node.page.title || hover.node.page.normalized_url}
          </div>
          <div style={{ opacity: 0.85 }}>{hover.node.page.raw_url_first_seen}</div>
          <div style={{ marginTop: 4, opacity: 0.7 }}>domain: {hover.node.domain}</div>
          <div style={{ opacity: 0.7 }}>visits: {hover.node.page.visit_count}</div>
          <div style={{ opacity: 0.7 }}>first_seen: {new Date(hover.node.page.first_seen).toLocaleString()}</div>
        </div>
      )}
    </>
  );
};

export default NodeGraphView;
