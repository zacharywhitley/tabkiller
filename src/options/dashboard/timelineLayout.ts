/**
 * Pure timeline math for the dashboard Timeline view.
 *
 * The view is a horizontal time axis with visits drawn as bars whose
 * y-lane is their owning tab. The whole thing is a linear scale — five
 * lines of `x = (t - t0) / (t1 - t0) * width` — so we don't need d3.
 *
 * Layout and axis-tick generation live here so the React component is
 * a thin renderer and the geometry is unit-testable without a DOM.
 */

import type { PageNode, TabNode, VisitNode } from '../../database/graph/types';
import {
  colorForDomain,
  hostnameOf,
  type DomainColor,
} from './domainColor';

export interface TimelineVisit {
  visit: VisitNode;
  page: PageNode | null;
  tab: TabNode | null;
}

export interface TimelineBar {
  visit_id: string;
  page_id: string | null;
  tab_id: string;
  lane: number;
  at_time: number;
  ended_at: number;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  url: string;
  domain: string;
  color: DomainColor;
}

export interface TimelineLane {
  tab_id: string;
  lane_index: number;
  y: number;
  height: number;
  label: string;
}

export interface TimelineTick {
  t: number;
  x: number;
  label: string;
}

export interface TimelineLayout {
  bars: TimelineBar[];
  lanes: TimelineLane[];
  ticks: TimelineTick[];
  canvas: { width: number; height: number };
  timeToX: (t: number) => number;
  xToTime: (x: number) => number;
}

export const AXIS_HEIGHT = 28;
export const LANE_HEIGHT = 20;
export const LANE_GAP = 2;
export const CANVAS_TOP_PAD = 4;
export const CANVAS_LEFT_PAD = 4;
export const CANVAS_RIGHT_PAD = 4;
export const MIN_BAR_WIDTH = 2;

// Human-friendly tick step. Picks the largest step from the ladder
// below whose target-count of ticks is at most `desired`. Coarser than
// d3's precision — dashboard-scale accuracy is enough.
const TICK_STEPS_MS: readonly number[] = [
  1_000, 5_000, 10_000, 30_000,
  60_000, 5 * 60_000, 10 * 60_000, 30 * 60_000,
  3600_000, 3 * 3600_000, 6 * 3600_000, 12 * 3600_000,
  86400_000, 7 * 86400_000,
];

export function pickTickStep(rangeMs: number, desired: number): number {
  if (rangeMs <= 0 || desired <= 0) return TICK_STEPS_MS[0]!;
  for (const step of TICK_STEPS_MS) {
    if (rangeMs / step <= desired) return step;
  }
  return TICK_STEPS_MS[TICK_STEPS_MS.length - 1]!;
}

export function formatTick(t: number, stepMs: number): string {
  const d = new Date(t);
  if (stepMs >= 86400_000) {
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (stepMs >= 60_000) return `${hh}:${mm}`;
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function makeTicks(
  tFrom: number,
  tTo: number,
  width: number,
  desiredCount: number,
  timeToX: (t: number) => number,
): TimelineTick[] {
  if (tTo <= tFrom || width <= 0) return [];
  const step = pickTickStep(tTo - tFrom, desiredCount);
  const first = Math.ceil(tFrom / step) * step;
  const out: TimelineTick[] = [];
  for (let t = first; t <= tTo; t += step) {
    out.push({ t, x: timeToX(t), label: formatTick(t, step) });
  }
  return out;
}

// Sort tabs by first-seen visit at_time so the earliest tab is lane 0
// (top). Stable within a lane by at_time asc.
function computeLaneAssignment(
  rows: TimelineVisit[],
): { laneByTabId: Map<string, number>; tabById: Map<string, TabNode | null> } {
  const firstSeenByTab = new Map<string, number>();
  const tabById = new Map<string, TabNode | null>();
  for (const row of rows) {
    const tabId = row.tab?.id ?? '(no-tab)';
    tabById.set(tabId, row.tab);
    const prior = firstSeenByTab.get(tabId);
    if (prior == null || row.visit.at_time < prior) {
      firstSeenByTab.set(tabId, row.visit.at_time);
    }
  }
  const ordered = Array.from(firstSeenByTab.entries()).sort((a, b) => a[1] - b[1]);
  const laneByTabId = new Map<string, number>();
  ordered.forEach(([tabId], idx) => laneByTabId.set(tabId, idx));
  return { laneByTabId, tabById };
}

export interface LayoutInput {
  rows: TimelineVisit[];
  tFrom: number;
  tTo: number;
  now: number;
  viewportWidth: number;
  viewportHeight: number;
  desiredTicks: number;
}

export function layoutTimeline(input: LayoutInput): TimelineLayout {
  const {
    rows,
    tFrom,
    tTo,
    now,
    viewportWidth,
    viewportHeight,
    desiredTicks,
  } = input;

  const usableWidth = Math.max(1, viewportWidth - CANVAS_LEFT_PAD - CANVAS_RIGHT_PAD);
  const range = Math.max(1, tTo - tFrom);
  const timeToX = (t: number) => CANVAS_LEFT_PAD + ((t - tFrom) / range) * usableWidth;
  const xToTime = (x: number) => tFrom + ((x - CANVAS_LEFT_PAD) / usableWidth) * range;

  const { laneByTabId, tabById } = computeLaneAssignment(rows);
  const laneCount = laneByTabId.size;

  const lanes: TimelineLane[] = [];
  const lanesY0 = AXIS_HEIGHT + CANVAS_TOP_PAD;
  Array.from(laneByTabId.entries())
    .sort((a, b) => a[1] - b[1])
    .forEach(([tabId, laneIndex]) => {
      const tab = tabById.get(tabId) ?? null;
      lanes.push({
        tab_id: tabId,
        lane_index: laneIndex,
        y: lanesY0 + laneIndex * (LANE_HEIGHT + LANE_GAP),
        height: LANE_HEIGHT,
        label: tab ? `tab ${tab.browser_tab_id}` : 'tab ?',
      });
    });

  const bars: TimelineBar[] = [];
  for (const row of rows) {
    const tabId = row.tab?.id ?? '(no-tab)';
    const lane = laneByTabId.get(tabId);
    if (lane == null) continue;

    const start = row.visit.at_time;
    const end = row.visit.ended_at ?? now;
    if (end < tFrom || start > tTo) continue;

    const xStart = timeToX(Math.max(start, tFrom));
    const xEnd = timeToX(Math.min(end, tTo));
    const width = Math.max(MIN_BAR_WIDTH, xEnd - xStart);
    const y = lanesY0 + lane * (LANE_HEIGHT + LANE_GAP);

    const url = row.page?.raw_url_first_seen ?? row.page?.normalized_url ?? '';
    const domain = url ? hostnameOf(url) : '';
    const rawTitle = row.page?.title ?? '';
    const title = rawTitle.trim() !== ''
      ? rawTitle
      : (row.page?.normalized_url ?? '(no page)');

    bars.push({
      visit_id: row.visit.id,
      page_id: row.page?.id ?? null,
      tab_id: tabId,
      lane,
      at_time: start,
      ended_at: end,
      x: xStart,
      y,
      width,
      height: LANE_HEIGHT,
      title,
      url,
      domain,
      color: colorForDomain(domain),
    });
  }

  const canvasHeight = Math.max(
    viewportHeight,
    lanesY0 + laneCount * (LANE_HEIGHT + LANE_GAP) + CANVAS_TOP_PAD,
  );

  const ticks = makeTicks(tFrom, tTo, usableWidth, desiredTicks, timeToX);

  return {
    bars,
    lanes,
    ticks,
    canvas: { width: viewportWidth, height: canvasHeight },
    timeToX,
    xToTime,
  };
}
