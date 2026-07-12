/**
 * Pure math tests for the dashboard timeline layout. The React component
 * on top is a thin renderer; the geometry lives here so it can be
 * verified without a DOM or a browser.
 */

import {
  AXIS_HEIGHT,
  CANVAS_LEFT_PAD,
  CANVAS_RIGHT_PAD,
  CANVAS_TOP_PAD,
  LANE_GAP,
  LANE_HEIGHT,
  MIN_BAR_WIDTH,
  formatTick,
  layoutTimeline,
  makeTicks,
  pickTickStep,
} from '../timelineLayout';
import type { PageNode, TabNode, VisitNode } from '../../../database/graph/types';
import type { TimelineVisit } from '../timelineLayout';

function makeVisit(id: string, at_time: number, ended_at: number | null): VisitNode {
  return { id, type: 'Visit', recorded_at: at_time, at_time, ended_at, focus_intervals: [], transition: 'link' };
}
function makeTab(id: string, browser_tab_id: number, opened_at: number): TabNode {
  return { id, type: 'Tab', recorded_at: opened_at, opened_at, closed_at: null, browser_tab_id };
}
function makePage(id: string, url: string, title: string): PageNode {
  return {
    id, type: 'Page', recorded_at: 0,
    normalized_url: url, raw_url_first_seen: url, title,
    first_seen: 0, last_seen: 0, visit_count: 1,
  };
}

describe('pickTickStep', () => {
  it('picks the smallest step whose count fits when the range is small', () => {
    expect(pickTickStep(10_000, 10)).toBe(1_000); // 10 s / 1 s = 10 ticks
  });

  it('escalates to bigger steps as the range grows', () => {
    expect(pickTickStep(60 * 60_000, 6)).toBe(10 * 60_000);
    expect(pickTickStep(24 * 3600_000, 6)).toBe(6 * 3600_000);
  });

  it('never returns a step smaller than the smallest ladder rung', () => {
    expect(pickTickStep(0, 10)).toBe(1_000);
    expect(pickTickStep(-1, 10)).toBe(1_000);
  });
});

describe('formatTick', () => {
  it('shows month/day when step >= 1 day', () => {
    // 2024-06-15T00:00:00Z. Rendered in local TZ; we assert only the
    // slash-separated shape and both fields fall in valid ranges.
    const label = formatTick(new Date('2024-06-15T12:00:00Z').getTime(), 86400_000);
    expect(label).toMatch(/^\d{1,2}\/\d{1,2}$/);
  });

  it('shows HH:MM at minute granularity', () => {
    const label = formatTick(new Date('2024-06-15T13:07:00Z').getTime(), 60_000);
    expect(label).toMatch(/^\d{2}:\d{2}$/);
  });

  it('adds seconds when step is sub-minute', () => {
    const label = formatTick(new Date('2024-06-15T13:07:42Z').getTime(), 1_000);
    expect(label).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});

describe('makeTicks', () => {
  it('emits ticks aligned to the step across the range', () => {
    const width = 500;
    const step = 60_000;
    const tFrom = 1_000_000;
    const tTo = tFrom + 4 * step;
    const timeToX = (t: number) => ((t - tFrom) / (tTo - tFrom)) * width;

    const ticks = makeTicks(tFrom, tTo, width, 5, timeToX);

    // step=60 000 requires "at most 5" ticks over a 4-step range -> we
    // should hit tFrom, tFrom+step*1..*4. First aligned tick may skip
    // tFrom itself unless tFrom % step === 0; assert monotonic x.
    expect(ticks.length).toBeGreaterThan(0);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]!.x).toBeGreaterThan(ticks[i - 1]!.x);
      expect(ticks[i]!.t - ticks[i - 1]!.t).toBe(step);
    }
  });

  it('returns no ticks when the range is empty', () => {
    expect(makeTicks(1, 0, 100, 5, (t) => t)).toEqual([]);
  });
});

describe('layoutTimeline', () => {
  const tab1 = makeTab('t1', 101, 0);
  const tab2 = makeTab('t2', 102, 100);
  const pHn = makePage('p_hn', 'https://news.ycombinator.com/', 'Hacker News');
  const pGh = makePage('p_gh', 'https://github.com/foo/bar', 'foo/bar');

  it('assigns lanes to tabs in first-seen order and stacks bars accordingly', () => {
    const rows: TimelineVisit[] = [
      // Order shouldn't matter for lane assignment — earliest at_time
      // wins the top lane. Give t2 an earlier at_time and it should
      // land on lane 0.
      { visit: makeVisit('v2', 500, 900), page: pGh, tab: tab2 },
      { visit: makeVisit('v1', 100, 400), page: pHn, tab: tab1 },
    ];

    const layout = layoutTimeline({
      rows,
      tFrom: 0,
      tTo: 1000,
      now: 2000,
      viewportWidth: 1000,
      viewportHeight: 200,
      desiredTicks: 5,
    });

    expect(layout.lanes).toHaveLength(2);
    // t1's first visit is at 100; t2's is at 500 -> t1 gets lane 0.
    const t1Lane = layout.lanes.find((l) => l.tab_id === 't1')!;
    const t2Lane = layout.lanes.find((l) => l.tab_id === 't2')!;
    expect(t1Lane.lane_index).toBe(0);
    expect(t2Lane.lane_index).toBe(1);
    expect(t1Lane.y).toBe(AXIS_HEIGHT + CANVAS_TOP_PAD);
    expect(t2Lane.y).toBe(AXIS_HEIGHT + CANVAS_TOP_PAD + LANE_HEIGHT + LANE_GAP);

    const barV1 = layout.bars.find((b) => b.visit_id === 'v1')!;
    const barV2 = layout.bars.find((b) => b.visit_id === 'v2')!;
    expect(barV1.lane).toBe(0);
    expect(barV2.lane).toBe(1);
    expect(barV1.height).toBe(LANE_HEIGHT);
  });

  it('linear-maps at_time -> x with the requested tFrom/tTo range', () => {
    const rows: TimelineVisit[] = [
      { visit: makeVisit('v1', 0, 500), page: pHn, tab: tab1 },
      { visit: makeVisit('v2', 500, 1000), page: pGh, tab: tab1 },
    ];
    const width = 1000;
    const usable = width - CANVAS_LEFT_PAD - CANVAS_RIGHT_PAD;

    const layout = layoutTimeline({
      rows,
      tFrom: 0,
      tTo: 1000,
      now: 2000,
      viewportWidth: width,
      viewportHeight: 100,
      desiredTicks: 5,
    });

    expect(layout.timeToX(0)).toBe(CANVAS_LEFT_PAD);
    expect(layout.timeToX(1000)).toBe(CANVAS_LEFT_PAD + usable);
    // Midpoint sanity.
    expect(layout.timeToX(500)).toBeCloseTo(CANVAS_LEFT_PAD + usable / 2, 5);

    // xToTime is the inverse.
    expect(layout.xToTime(layout.timeToX(500))).toBeCloseTo(500, 5);

    // Bar geometry follows.
    const barV1 = layout.bars.find((b) => b.visit_id === 'v1')!;
    expect(barV1.x).toBe(CANVAS_LEFT_PAD);
    expect(barV1.width).toBeCloseTo(usable / 2, 5);
  });

  it('substitutes `now` for a null ended_at so still-open visits get a width', () => {
    const rows: TimelineVisit[] = [
      { visit: makeVisit('v_open', 100, null), page: pHn, tab: tab1 },
    ];

    const layout = layoutTimeline({
      rows,
      tFrom: 0,
      tTo: 1000,
      now: 900,
      viewportWidth: 1000,
      viewportHeight: 100,
      desiredTicks: 5,
    });

    const bar = layout.bars[0]!;
    expect(bar.ended_at).toBe(900);
    expect(bar.width).toBeGreaterThan(MIN_BAR_WIDTH);
  });

  it('clips bars whose interval overhangs the viewport window on either side', () => {
    const rows: TimelineVisit[] = [
      // Fully before window — must be dropped.
      { visit: makeVisit('v_before', -500, -400), page: pHn, tab: tab1 },
      // Overhangs left — clipped so bar starts at tFrom.
      { visit: makeVisit('v_left', -100, 100), page: pHn, tab: tab1 },
      // Overhangs right — clipped so bar ends at tTo.
      { visit: makeVisit('v_right', 900, 1100), page: pGh, tab: tab1 },
      // Fully after — must be dropped.
      { visit: makeVisit('v_after', 1200, 1400), page: pHn, tab: tab1 },
    ];

    const layout = layoutTimeline({
      rows,
      tFrom: 0,
      tTo: 1000,
      now: 2000,
      viewportWidth: 1000,
      viewportHeight: 100,
      desiredTicks: 5,
    });

    const ids = layout.bars.map((b) => b.visit_id).sort();
    expect(ids).toEqual(['v_left', 'v_right']);

    const barLeft = layout.bars.find((b) => b.visit_id === 'v_left')!;
    expect(barLeft.x).toBe(CANVAS_LEFT_PAD);

    const barRight = layout.bars.find((b) => b.visit_id === 'v_right')!;
    const usable = 1000 - CANVAS_LEFT_PAD - CANVAS_RIGHT_PAD;
    // Right edge should land at tFrom + usable width -> canvas_left_pad + usable.
    expect(barRight.x + barRight.width).toBeCloseTo(CANVAS_LEFT_PAD + usable, 3);
  });

  it('always gives every bar at least MIN_BAR_WIDTH so instantaneous visits stay visible', () => {
    const rows: TimelineVisit[] = [
      { visit: makeVisit('v_tick', 500, 500), page: pHn, tab: tab1 },
    ];
    const layout = layoutTimeline({
      rows, tFrom: 0, tTo: 1000, now: 2000,
      viewportWidth: 1000, viewportHeight: 100, desiredTicks: 5,
    });
    expect(layout.bars[0]!.width).toBe(MIN_BAR_WIDTH);
  });

  it('drops lanes for tabs whose visits are entirely outside the window', () => {
    // tab1 has one visit inside [0,1000], tab2's visit is entirely
    // before the window. tab2 should not get a lane; if it did, the
    // row list would grow without bound as history accumulates and
    // scrolling would leave dead rows for off-screen tabs.
    const tabOffscreen: TabNode = {
      ...tab1,
      id: 'tab_offscreen',
      browser_tab_id: 999,
      opened_at: -1000,
      closed_at: -500,
    };
    const rows: TimelineVisit[] = [
      { visit: makeVisit('v_in', 200, 400), page: pHn, tab: tab1 },
      { visit: makeVisit('v_out', -900, -600), page: pHn, tab: tabOffscreen },
    ];
    const layout = layoutTimeline({
      rows, tFrom: 0, tTo: 1000, now: 2000,
      viewportWidth: 1000, viewportHeight: 100, desiredTicks: 5,
    });
    const laneTabs = layout.lanes.map((l) => l.tab_id).sort();
    expect(laneTabs).toEqual([tab1.id]);
    expect(layout.bars.map((b) => b.visit_id)).toEqual(['v_in']);
  });

  it('emits axis ticks over the window at the layout-selected step', () => {
    const layout = layoutTimeline({
      rows: [],
      tFrom: 0,
      tTo: 60_000,
      now: 60_000,
      viewportWidth: 600,
      viewportHeight: 100,
      desiredTicks: 6,
    });
    expect(layout.ticks.length).toBeGreaterThan(0);
    for (const t of layout.ticks) {
      expect(t.t).toBeGreaterThanOrEqual(0);
      expect(t.t).toBeLessThanOrEqual(60_000);
    }
  });
});
