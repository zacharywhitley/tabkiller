/**
 * Pure layout for the Session Tab-Tree view.
 *
 * Given the shape returned by `tabTreeForTag` / `tabTreeForSession`
 * (one `TabTreeSession`), produce absolute box positions, arrow paths,
 * and canvas dimensions. Deliberately DOM-free so it can be unit-tested
 * with plain Jest — the React component is a thin renderer on top.
 *
 * The domain-color palette (`DOMAIN_PALETTE`, `colorForDomain`) lives in
 * `../dashboard/domainColor.ts` so the dashboard's timeline / node-graph
 * views share the exact same hue per domain as this tab-tree layout.
 */

import {
  DOMAIN_PALETTE,
  colorForDomain,
  hostnameOf,
  type DomainColor,
} from '../dashboard/domainColor';
import type { TabTreeSession, TabTreeTab } from '../../database/graph/queries';

// Column geometry. `COLUMN_WIDTH` includes the box AND the horizontal
// gutter between columns; `BOX_WIDTH` is the actual visit-box width.
export const COLUMN_WIDTH = 200;
export const BOX_WIDTH = 180;
export const BOX_HEIGHT = 44;
export const MIN_BOX_HEIGHT = 32;
export const COLUMN_HEADER_HEIGHT = 44;
export const CANVAS_PADDING = 16;
export const ROW_GAP = 6;
export const ARROW_STROKE_WIDTH = 1.5;

// Re-exports so callers importing from this module keep working after
// the palette moved out. The tab-tree unit tests reach in via these.
export { DOMAIN_PALETTE, colorForDomain, hostnameOf };
export type { DomainColor };

// ---- Layout output types ----

export interface VisitBox {
  visit_id: string;
  page_id: string | null;
  tab_id: string;
  title: string;
  url: string;
  domain: string;
  color: DomainColor;
  at_time: number;
  ended_at: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TabColumn {
  tab_id: string;
  browser_tab_id: number;
  opened_at: number;
  closed_at: number | null;
  x: number;
  width: number;
  header: string;
  visit_count: number;
}

export interface OpenerArrow {
  from_tab_id: string;
  to_tab_id: string;
  from_x: number;
  from_y: number;
  to_x: number;
  to_y: number;
  path: string;
}

export interface TabTreeLayout {
  boxes: VisitBox[];
  arrows: OpenerArrow[];
  tabColumns: TabColumn[];
  canvas: { width: number; height: number };
}

// ---- Layout function ----

// Deterministic per-column visit height: shrink boxes as visits pile up
// so a 200-visit tab stays scrollable but readable. Never shrink below
// MIN_BOX_HEIGHT — beyond that the SVG grows tall and the container
// scrolls vertically.
function boxHeightFor(visitCount: number): number {
  if (visitCount <= 8) return BOX_HEIGHT;
  const shrunk = Math.max(MIN_BOX_HEIGHT, BOX_HEIGHT - (visitCount - 8) * 1);
  return shrunk;
}

export function layoutTabTree(bundle: TabTreeSession): TabTreeLayout {
  const tabs = bundle.tabs;
  const columnY0 = CANVAS_PADDING + COLUMN_HEADER_HEIGHT;

  const tabColumns: TabColumn[] = [];
  const boxes: VisitBox[] = [];
  let maxBottom = columnY0;

  tabs.forEach((tab: TabTreeTab, columnIndex: number) => {
    const columnX = CANVAS_PADDING + columnIndex * COLUMN_WIDTH;
    const boxX = columnX + (COLUMN_WIDTH - BOX_WIDTH) / 2;
    const height = boxHeightFor(tab.visits.length);

    tabColumns.push({
      tab_id: tab.tab.id,
      browser_tab_id: tab.tab.browser_tab_id,
      opened_at: tab.tab.opened_at,
      closed_at: tab.tab.closed_at,
      x: columnX,
      width: COLUMN_WIDTH,
      header: `tab ${tab.tab.browser_tab_id}`,
      visit_count: tab.visits.length,
    });

    tab.visits.forEach((entry, rowIndex) => {
      const url = entry.page?.raw_url_first_seen ?? '';
      const normalized = entry.page?.normalized_url ?? '';
      const domain = url ? hostnameOf(url) : normalized ? hostnameOf(normalized) : '';
      const rawTitle = entry.page?.title ?? '';
      const title = rawTitle.trim() !== '' ? rawTitle : (normalized || url || '(no page)');

      const y = columnY0 + rowIndex * (height + ROW_GAP);
      const bottom = y + height;
      if (bottom > maxBottom) maxBottom = bottom;

      boxes.push({
        visit_id: entry.visit.id,
        page_id: entry.page?.id ?? null,
        tab_id: tab.tab.id,
        title,
        url: url || normalized,
        domain,
        color: colorForDomain(domain),
        at_time: entry.visit.at_time,
        ended_at: entry.visit.ended_at,
        x: boxX,
        y,
        width: BOX_WIDTH,
        height,
      });
    });
  });

  const arrows: OpenerArrow[] = [];
  const tabIndexById = new Map(tabColumns.map((c, i) => [c.tab_id, i]));
  const firstBoxByTabId = new Map<string, VisitBox>();
  for (const box of boxes) {
    if (!firstBoxByTabId.has(box.tab_id)) firstBoxByTabId.set(box.tab_id, box);
  }

  for (const tab of tabs) {
    if (!tab.parent_tab_id) continue;
    const parentIdx = tabIndexById.get(tab.parent_tab_id);
    const childIdx = tabIndexById.get(tab.tab.id);
    if (parentIdx == null || childIdx == null) continue;

    const parentColumn = tabColumns[parentIdx]!;
    const childFirstBox = firstBoxByTabId.get(tab.tab.id);
    if (!childFirstBox) continue;

    const fromX = parentColumn.x + parentColumn.width / 2;
    const fromY = CANVAS_PADDING + COLUMN_HEADER_HEIGHT / 2;
    const toX = childFirstBox.x + childFirstBox.width / 2;
    const toY = childFirstBox.y;

    // Cubic bezier: horizontal midpoint control handles bend the curve
    // out through the header band so the arrow reads as "spawned from
    // parent tab" rather than "flew through the middle of the boxes".
    const midY = fromY + Math.max(20, (toY - fromY) / 2);
    const path = `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`;

    arrows.push({
      from_tab_id: tab.parent_tab_id,
      to_tab_id: tab.tab.id,
      from_x: fromX,
      from_y: fromY,
      to_x: toX,
      to_y: toY,
      path,
    });
  }

  const canvasWidth =
    tabs.length === 0
      ? CANVAS_PADDING * 2 + COLUMN_WIDTH
      : CANVAS_PADDING * 2 + tabs.length * COLUMN_WIDTH;
  const canvasHeight = maxBottom + CANVAS_PADDING;

  return {
    boxes,
    arrows,
    tabColumns,
    canvas: { width: canvasWidth, height: canvasHeight },
  };
}
