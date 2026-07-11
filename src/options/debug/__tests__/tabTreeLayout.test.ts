/**
 * Layout-only tests. The renderer is a thin SVG wrapper; the geometry
 * and color assignment live in `tabTreeLayout.ts` so they can be
 * exercised without a DOM.
 */

import {
  BOX_HEIGHT,
  BOX_WIDTH,
  CANVAS_PADDING,
  COLUMN_HEADER_HEIGHT,
  COLUMN_WIDTH,
  DOMAIN_PALETTE,
  MIN_BOX_HEIGHT,
  ROW_GAP,
  colorForDomain,
  hostnameOf,
  layoutTabTree,
} from '../tabTreeLayout';
import type {
  PageNode,
  SessionNode,
  TabNode,
  VisitNode,
} from '../../../database/graph/types';
import type { TabTreeSession, TabTreeTab } from '../../../database/graph/queries';

// ---- Fixture builders ----

function makeSession(id: string): SessionNode {
  return {
    id,
    type: 'Session',
    recorded_at: 0,
    started_at: 0,
    ended_at: null,
    detected_by: 'manual',
    title: null,
  };
}

function makeTab(id: string, browser_tab_id: number, opened_at: number): TabNode {
  return {
    id,
    type: 'Tab',
    recorded_at: opened_at,
    opened_at,
    closed_at: null,
    browser_tab_id,
  };
}

function makeVisit(id: string, at_time: number, ended_at: number | null = null): VisitNode {
  return {
    id,
    type: 'Visit',
    recorded_at: at_time,
    at_time,
    ended_at,
    focus_intervals: [],
    transition: 'link',
  };
}

function makePage(id: string, url: string, title: string): PageNode {
  return {
    id,
    type: 'Page',
    recorded_at: 0,
    normalized_url: url,
    raw_url_first_seen: url,
    title,
    first_seen: 0,
    last_seen: 0,
    visit_count: 1,
  };
}

function tabEntry(
  tab: TabNode,
  parent_tab_id: string | null,
  visits: Array<{ visit: VisitNode; page: PageNode | null }>,
): TabTreeTab {
  return { tab, parent_tab_id, visits };
}

function bundle(tabs: TabTreeTab[]): TabTreeSession {
  return { session: makeSession('s1'), tabs };
}

// ---- Deterministic domain color ----

describe('colorForDomain', () => {
  it('is deterministic — same hostname → same palette entry across calls', () => {
    const a = colorForDomain('example.com');
    const b = colorForDomain('example.com');
    expect(a).toBe(b);
    expect(DOMAIN_PALETTE).toContain(a);
  });

  it('normalizes case so mixed-case hostnames get the same color', () => {
    expect(colorForDomain('News.YCombinator.com')).toBe(
      colorForDomain('news.ycombinator.com'),
    );
  });

  it('empty hostname is still a legal input (fallback for missing pages)', () => {
    expect(DOMAIN_PALETTE).toContain(colorForDomain(''));
  });
});

describe('hostnameOf', () => {
  it('returns the hostname for a well-formed URL', () => {
    expect(hostnameOf('https://news.ycombinator.com/item?id=1')).toBe('news.ycombinator.com');
  });

  it('falls back to the input when parsing fails', () => {
    expect(hostnameOf('not-a-url')).toBe('not-a-url');
  });
});

// ---- Layout: single tab ----

describe('layoutTabTree — single tab', () => {
  it('places one column, N boxes stacked vertically inside it', () => {
    const t1 = makeTab('t1', 101, 0);
    const p1 = makePage('p1', 'https://news.ycombinator.com/', 'Hacker News');
    const p2 = makePage('p2', 'https://github.com/', 'GitHub');
    const visits = [
      { visit: makeVisit('v1', 100), page: p1 },
      { visit: makeVisit('v2', 200), page: p2 },
    ];

    const layout = layoutTabTree(bundle([tabEntry(t1, null, visits)]));

    expect(layout.tabColumns).toHaveLength(1);
    expect(layout.tabColumns[0]!.tab_id).toBe('t1');
    expect(layout.tabColumns[0]!.visit_count).toBe(2);

    expect(layout.boxes).toHaveLength(2);
    expect(layout.boxes[0]!.visit_id).toBe('v1');
    expect(layout.boxes[0]!.title).toBe('Hacker News');
    expect(layout.boxes[0]!.width).toBe(BOX_WIDTH);
    expect(layout.boxes[0]!.height).toBe(BOX_HEIGHT);

    // Visits stack top-to-bottom.
    expect(layout.boxes[1]!.y).toBeGreaterThan(layout.boxes[0]!.y);
    expect(layout.boxes[1]!.y - layout.boxes[0]!.y).toBe(BOX_HEIGHT + ROW_GAP);

    // No opener arrows for a lone tab.
    expect(layout.arrows).toEqual([]);

    // Canvas is wide enough for one column + padding.
    expect(layout.canvas.width).toBe(CANVAS_PADDING * 2 + COLUMN_WIDTH);
  });

  it('falls back to normalized URL as title when page has no title', () => {
    const t1 = makeTab('t1', 101, 0);
    const p1 = makePage('p1', 'https://untitled.example/', '');
    const layout = layoutTabTree(
      bundle([tabEntry(t1, null, [{ visit: makeVisit('v1', 100), page: p1 }])]),
    );
    expect(layout.boxes[0]!.title).toBe('https://untitled.example/');
  });

  it('uses "(no page)" as title when the page is missing entirely', () => {
    const t1 = makeTab('t1', 101, 0);
    const layout = layoutTabTree(
      bundle([tabEntry(t1, null, [{ visit: makeVisit('v1', 100), page: null }])]),
    );
    expect(layout.boxes[0]!.title).toBe('(no page)');
    expect(layout.boxes[0]!.domain).toBe('');
    expect(DOMAIN_PALETTE).toContain(layout.boxes[0]!.color);
  });
});

// ---- Layout: multi-tab with opener chain ----

describe('layoutTabTree — multi-tab with opener chain', () => {
  it('draws an arrow from the parent tab column into the child tab first-visit', () => {
    const t1 = makeTab('t1', 101, 0);
    const t2 = makeTab('t2', 102, 500);
    const p1 = makePage('p1', 'https://news.ycombinator.com/', 'HN');
    const p2 = makePage('p2', 'https://github.com/x/y', 'x/y');
    const p3 = makePage('p3', 'https://github.com/a/b', 'a/b');

    const bundleInput = bundle([
      tabEntry(t1, null, [
        { visit: makeVisit('v1', 100), page: p1 },
        { visit: makeVisit('v2', 300), page: p2 },
      ]),
      // Same shape the query returns for the fixture: t2 spawned from t1.
      tabEntry(t2, 't1', [{ visit: makeVisit('v3', 500), page: p3 }]),
    ]);

    const layout = layoutTabTree(bundleInput);

    expect(layout.tabColumns.map((c) => c.tab_id)).toEqual(['t1', 't2']);
    expect(layout.arrows).toHaveLength(1);
    const arrow = layout.arrows[0]!;
    expect(arrow.from_tab_id).toBe('t1');
    expect(arrow.to_tab_id).toBe('t2');

    // Arrow ends at the first visit of the child column.
    const t2FirstBox = layout.boxes.find((b) => b.tab_id === 't2')!;
    expect(arrow.to_x).toBe(t2FirstBox.x + t2FirstBox.width / 2);
    expect(arrow.to_y).toBe(t2FirstBox.y);

    // Path is a valid SVG cubic-bezier `M ... C ...`.
    expect(arrow.path.startsWith('M ')).toBe(true);
    expect(arrow.path).toMatch(/ C /);

    // Canvas grows with column count.
    expect(layout.canvas.width).toBe(CANVAS_PADDING * 2 + 2 * COLUMN_WIDTH);
  });

  it('skips arrows whose parent tab is not in the current bundle', () => {
    const t2 = makeTab('t2', 102, 500);
    const p3 = makePage('p3', 'https://github.com/a/b', 'a/b');
    const layout = layoutTabTree(
      bundle([tabEntry(t2, 't_missing', [{ visit: makeVisit('v3', 500), page: p3 }])]),
    );
    expect(layout.arrows).toEqual([]);
  });
});

// ---- Layout: dense session ----

describe('layoutTabTree — dense session (200 visits)', () => {
  it('shrinks per-box height but never below the minimum, canvas grows tall', () => {
    const t1 = makeTab('t1', 101, 0);
    const visits: TabTreeTab['visits'] = [];
    for (let i = 0; i < 200; i++) {
      visits.push({
        visit: makeVisit(`v${i}`, i * 1000),
        page: makePage(`p${i}`, `https://d${i}.example/`, `Page ${i}`),
      });
    }

    const layout = layoutTabTree(bundle([tabEntry(t1, null, visits)]));

    expect(layout.boxes).toHaveLength(200);
    for (const box of layout.boxes) {
      expect(box.height).toBeGreaterThanOrEqual(MIN_BOX_HEIGHT);
      expect(box.height).toBeLessThanOrEqual(BOX_HEIGHT);
    }

    // Every box strictly below the previous one — nothing overlaps.
    for (let i = 1; i < layout.boxes.length; i++) {
      expect(layout.boxes[i]!.y).toBeGreaterThan(layout.boxes[i - 1]!.y);
    }

    // Canvas taller than a viewport — the developer's container must scroll.
    expect(layout.canvas.height).toBeGreaterThan(200 * MIN_BOX_HEIGHT);
  });
});

// ---- Layout: empty ----

describe('layoutTabTree — empty session', () => {
  it('returns no boxes or arrows and a non-zero canvas footprint', () => {
    const layout = layoutTabTree(bundle([]));
    expect(layout.boxes).toEqual([]);
    expect(layout.arrows).toEqual([]);
    expect(layout.tabColumns).toEqual([]);
    expect(layout.canvas.width).toBeGreaterThan(0);
    expect(layout.canvas.height).toBeGreaterThanOrEqual(
      CANVAS_PADDING * 2 + COLUMN_HEADER_HEIGHT,
    );
  });
});
