/**
 * Tab Load view — how many tabs and windows are open right now, is the
 * count trending up or down, and where do the tabs sit.
 *
 * Layout:
 *   - Three stat cards: total tabs / total windows / trend (last 6h)
 *   - Sparkline-style SVG of tab count over the selected range
 *   - Per-window list of currently open tabs with their current page
 *
 * "Currently open" is graph-derived (Tab.closed_at == null). If the SW
 * missed a close event these can be stale — see progress notes.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { openGraphStoreForDebug } from '../debug/index';
import { openCountsBetween, openTabsGrouped } from '../../database/graph/queries';
import type {
  OpenCountsSample,
  OpenWindowGroup,
} from '../../database/graph/queries';

const RANGE_OPTIONS: ReadonlyArray<{ label: string; ms: number }> = [
  { label: '1h', ms: 60 * 60 * 1000 },
  { label: '6h', ms: 6 * 60 * 60 * 1000 },
  { label: '24h', ms: 24 * 60 * 60 * 1000 },
  { label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
];

const REFRESH_MS = 10 * 1000;
const SAMPLES = 90;

const styles: Record<string, React.CSSProperties> = {
  header: { marginTop: 0, fontSize: 18, marginBottom: 12 },
  stats: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 },
  statCard: { padding: 14, background: 'var(--tk-card-bg, #fff)', border: '1px solid var(--tk-card-border, #dcdfe4)', borderRadius: 6 },
  statLabel: { fontSize: 11, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  statValue: { fontSize: 28, fontWeight: 600 },
  statTrend: { fontSize: 12, opacity: 0.75, marginTop: 4 },
  chartShell: { padding: 12, background: 'var(--tk-card-bg, #fff)', border: '1px solid var(--tk-card-border, #dcdfe4)', borderRadius: 6, marginBottom: 20 },
  chartHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  chartTitle: { fontSize: 14, fontWeight: 600 },
  rangePicker: { display: 'flex', gap: 4 },
  rangeBtn: { border: '1px solid var(--tk-card-border, #dcdfe4)', background: 'transparent', color: 'inherit', padding: '2px 10px', fontSize: 12, borderRadius: 4, cursor: 'pointer' },
  rangeBtnActive: { background: 'var(--tk-active, #316dca)', color: '#fff', borderColor: 'var(--tk-active, #316dca)' },
  windowGroup: { padding: 12, background: 'var(--tk-card-bg, #fff)', border: '1px solid var(--tk-card-border, #dcdfe4)', borderRadius: 6, marginBottom: 10 },
  windowHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  windowTitle: { fontSize: 13, fontWeight: 600 },
  windowMeta: { fontSize: 11, opacity: 0.65 },
  tabRow: { display: 'flex', gap: 8, padding: '4px 0', fontSize: 12, borderTop: '1px solid var(--tk-row-border, #f0f1f3)' },
  tabTitle: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  tabAge: { opacity: 0.6, flexShrink: 0 },
  empty: { padding: 20, textAlign: 'center', opacity: 0.7 },
};

const darkOverrides = `
  @media (prefers-color-scheme: dark) {
    :root { --tk-card-bg: #23262b; --tk-card-border: #363a41; --tk-row-border: #2a2d33; --tk-active: #4b8fed; }
  }
`;

function fmtRelative(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function trendLabel(samples: OpenCountsSample[]): { label: string; symbol: string } {
  if (samples.length < 2) return { label: '—', symbol: '·' };
  const first = samples[0].tab_count;
  const last = samples[samples.length - 1].tab_count;
  const delta = last - first;
  if (delta === 0) return { label: 'stable', symbol: '→' };
  if (delta > 0) return { label: `+${delta}`, symbol: '↗' };
  return { label: `${delta}`, symbol: '↘' };
}

interface ChartProps {
  samples: OpenCountsSample[];
  width: number;
  height: number;
}

const Chart: React.FC<ChartProps> = ({ samples, width, height }) => {
  const pad = { l: 32, r: 8, t: 8, b: 20 };
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;

  if (samples.length === 0) {
    return (
      <svg width={width} height={height} role="img">
        <text x={width / 2} y={height / 2} textAnchor="middle" fontSize="12" opacity="0.6">no data</text>
      </svg>
    );
  }
  const maxCount = Math.max(1, ...samples.map((s) => s.tab_count));
  const minTime = samples[0].at;
  const maxTime = samples[samples.length - 1].at;
  const range = Math.max(1, maxTime - minTime);
  const xOf = (t: number) => pad.l + ((t - minTime) / range) * iw;
  const yOf = (c: number) => pad.t + ih - (c / maxCount) * ih;

  const linePath = samples
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${xOf(s.at).toFixed(1)} ${yOf(s.tab_count).toFixed(1)}`)
    .join(' ');
  const areaPath =
    linePath +
    ` L ${xOf(maxTime).toFixed(1)} ${(pad.t + ih).toFixed(1)}` +
    ` L ${xOf(minTime).toFixed(1)} ${(pad.t + ih).toFixed(1)} Z`;

  const yTicks = [0, Math.round(maxCount / 2), maxCount];
  return (
    <svg width={width} height={height} role="img" aria-label="Open tab count over time">
      {yTicks.map((v) => (
        <g key={v}>
          <line
            x1={pad.l}
            y1={yOf(v)}
            x2={pad.l + iw}
            y2={yOf(v)}
            stroke="var(--tk-card-border, #dcdfe4)"
            strokeWidth="0.5"
          />
          <text x={pad.l - 4} y={yOf(v) + 3} textAnchor="end" fontSize="10" opacity="0.7">{v}</text>
        </g>
      ))}
      <path d={areaPath} fill="var(--tk-active, #316dca)" opacity="0.15" />
      <path d={linePath} fill="none" stroke="var(--tk-active, #316dca)" strokeWidth="1.5" />
      <text x={pad.l} y={height - 4} fontSize="10" opacity="0.7">{new Date(minTime).toLocaleString()}</text>
      <text x={pad.l + iw} y={height - 4} textAnchor="end" fontSize="10" opacity="0.7">now</text>
    </svg>
  );
};

export const TabLoadView: React.FC = () => {
  const [rangeMs, setRangeMs] = useState<number>(RANGE_OPTIONS[1].ms);
  const [samples, setSamples] = useState<OpenCountsSample[]>([]);
  const [groups, setGroups] = useState<OpenWindowGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState<number>(0);

  const refresh = useCallback(async () => {
    try {
      const g = await openGraphStoreForDebug();
      const now = new Date().getTime();
      const [s, r] = await Promise.all([
        openCountsBetween(g, now - rangeMs, now, SAMPLES),
        openTabsGrouped(g),
      ]);
      setSamples(s);
      setGroups(r);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [rangeMs]);

  useEffect(() => {
    refresh();
    const id = window.setInterval(() => setRefreshTick((n) => n + 1), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (refreshTick > 0) refresh();
  }, [refreshTick, refresh]);

  const now = samples[samples.length - 1];
  const trend = useMemo(() => trendLabel(samples), [samples]);
  const totalTabs = now?.tab_count ?? groups.reduce((n, g) => n + g.tabs.length, 0);
  const totalWindows = now?.window_count ?? groups.length;

  return (
    <div>
      <style>{darkOverrides}</style>
      <h2 style={styles.header}>Tabs</h2>

      {error && (
        <div style={{ color: '#c00', marginBottom: 12 }} data-testid="tab-load-error">
          Error: {error}
        </div>
      )}

      <div style={styles.stats}>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Open tabs</div>
          <div style={styles.statValue}>{totalTabs}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Open windows</div>
          <div style={styles.statValue}>{totalWindows}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Trend (this range)</div>
          <div style={styles.statValue}>
            {trend.symbol} <span style={{ fontSize: 20, opacity: 0.85 }}>{trend.label}</span>
          </div>
        </div>
      </div>

      <div style={styles.chartShell}>
        <div style={styles.chartHeader}>
          <div style={styles.chartTitle}>Open tab count</div>
          <div style={styles.rangePicker}>
            {RANGE_OPTIONS.map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => setRangeMs(o.ms)}
                style={{
                  ...styles.rangeBtn,
                  ...(rangeMs === o.ms ? styles.rangeBtnActive : {}),
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <Chart samples={samples} width={860} height={180} />
      </div>

      {groups.length === 0 ? (
        <div style={styles.empty}>No open windows tracked yet. Browse for a minute and reload.</div>
      ) : (
        groups.map(({ window, tabs }) => (
          <div key={window.id} style={styles.windowGroup}>
            <div style={styles.windowHeader}>
              <div style={styles.windowTitle}>
                Window #{window.browser_window_id} · {tabs.length} tab{tabs.length === 1 ? '' : 's'}
              </div>
              <div style={styles.windowMeta}>opened {fmtRelative(Date.now() - window.opened_at)} ago</div>
            </div>
            {tabs.map(({ tab, current_page }) => (
              <div key={tab.id} style={styles.tabRow}>
                <div style={styles.tabTitle}>
                  {current_page?.title || current_page?.normalized_url || `(tab ${tab.browser_tab_id})`}
                </div>
                <div style={styles.tabAge}>{fmtRelative(Date.now() - tab.opened_at)}</div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
};
