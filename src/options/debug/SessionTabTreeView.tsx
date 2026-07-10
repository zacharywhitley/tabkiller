/**
 * Session Tab-Tree View — SVG rendering of a session's tab tree.
 *
 * Input is the result of `tabTreeForTag` or `tabTreeForSession`
 * (an array of `TabTreeSession` bundles). Each bundle draws one tree
 * with tabs as columns, visits stacked chronologically, and cubic-
 * bezier arrows from parent tab to child tab.
 *
 * Purpose: fast visual sanity check that the graph ingest / query
 * layer really captured what the developer's day looked like.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  ARROW_STROKE_WIDTH,
  COLUMN_HEADER_HEIGHT,
  layoutTabTree,
} from './tabTreeLayout';
import type { TabTreeSession } from '../../database/graph/queries';
import type { VisitBox } from './tabTreeLayout';

interface Props {
  data: TabTreeSession[];
}

const CONTAINER_STYLE: React.CSSProperties = {
  border: '1px solid #ddd',
  background: '#fafafa',
  overflow: 'auto',
  maxHeight: 600,
};

const EMPTY_STYLE: React.CSSProperties = {
  padding: 16,
  color: '#666',
  fontStyle: 'italic',
};

const SESSION_HEADER_STYLE: React.CSSProperties = {
  padding: '8px 12px',
  background: '#eee',
  borderBottom: '1px solid #ddd',
  fontWeight: 600,
  fontSize: 12,
};

const TOOLTIP_STYLE: React.CSSProperties = {
  position: 'fixed',
  pointerEvents: 'none',
  background: 'rgba(20, 20, 20, 0.95)',
  color: '#fff',
  padding: '6px 8px',
  fontSize: 11,
  borderRadius: 4,
  maxWidth: 360,
  zIndex: 1000,
  lineHeight: 1.4,
  wordBreak: 'break-all',
};

function fmtInstant(ms: number): string {
  const d = new Date(ms);
  const iso = d.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}Z`;
}

interface HoverState {
  box: VisitBox;
  x: number;
  y: number;
}

export const SessionTabTreeView: React.FC<Props> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div style={EMPTY_STYLE} data-testid="tk-tab-tree-empty">
        No sessions found for the given query.
      </div>
    );
  }

  return (
    <div>
      {data.map((bundle, idx) => (
        <SessionTabTreeCard key={`${bundle.session.id}-${idx}`} bundle={bundle} />
      ))}
    </div>
  );
};

const SessionTabTreeCard: React.FC<{ bundle: TabTreeSession }> = ({ bundle }) => {
  const layout = useMemo(() => layoutTabTree(bundle), [bundle]);
  const [hover, setHover] = useState<HoverState | null>(null);

  const onBoxEnter = useCallback((box: VisitBox) => (event: React.MouseEvent) => {
    setHover({ box, x: event.clientX, y: event.clientY });
  }, []);

  const onBoxMove = useCallback((event: React.MouseEvent) => {
    setHover((prev) => (prev ? { ...prev, x: event.clientX, y: event.clientY } : prev));
  }, []);

  const onBoxLeave = useCallback(() => setHover(null), []);

  const onBoxClick = useCallback((box: VisitBox) => () => {
    if (!box.url) return;
    window.open(box.url, '_blank', 'noopener');
  }, []);

  const totalVisits = layout.boxes.length;
  const sessionLabel =
    bundle.session.title != null && bundle.session.title.trim() !== ''
      ? bundle.session.title
      : bundle.session.id;

  const header = (
    <div style={SESSION_HEADER_STYLE} data-testid="tk-tab-tree-session-header">
      Session {sessionLabel} — {bundle.tabs.length} tab
      {bundle.tabs.length === 1 ? '' : 's'}, {totalVisits} visit
      {totalVisits === 1 ? '' : 's'} · started {fmtInstant(bundle.session.started_at)}
      {bundle.session.ended_at != null
        ? ` · ended ${fmtInstant(bundle.session.ended_at)}`
        : ' · still active'}
    </div>
  );

  if (totalVisits === 0) {
    return (
      <div style={CONTAINER_STYLE}>
        {header}
        <div style={EMPTY_STYLE} data-testid="tk-tab-tree-no-visits">
          Session has no visits.
        </div>
      </div>
    );
  }

  return (
    <div style={CONTAINER_STYLE} data-testid="tk-tab-tree-card">
      {header}
      <svg
        role="img"
        aria-label={`Tab tree for session ${sessionLabel}`}
        width={layout.canvas.width}
        height={layout.canvas.height}
        viewBox={`0 0 ${layout.canvas.width} ${layout.canvas.height}`}
        style={{ display: 'block' }}
      >
        <defs>
          <marker
            id="tk-tab-tree-arrow-head"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#555" />
          </marker>
        </defs>

        {layout.tabColumns.map((col) => (
          <g key={col.tab_id}>
            <rect
              x={col.x}
              y={16}
              width={col.width}
              height={COLUMN_HEADER_HEIGHT}
              fill="#f0f0f0"
              stroke="#ccc"
            />
            <text
              x={col.x + col.width / 2}
              y={16 + COLUMN_HEADER_HEIGHT / 2 + 4}
              textAnchor="middle"
              fontSize="12"
              fontFamily="ui-monospace, Menlo, monospace"
              fill="#222"
            >
              {col.header}
            </text>
          </g>
        ))}

        {layout.arrows.map((arrow) => (
          <path
            key={`${arrow.from_tab_id}-${arrow.to_tab_id}`}
            d={arrow.path}
            fill="none"
            stroke="#555"
            strokeWidth={ARROW_STROKE_WIDTH}
            markerEnd="url(#tk-tab-tree-arrow-head)"
            data-testid="tk-tab-tree-opener-arrow"
          />
        ))}

        {layout.boxes.map((box) => (
          <g
            key={box.visit_id}
            onMouseEnter={onBoxEnter(box)}
            onMouseMove={onBoxMove}
            onMouseLeave={onBoxLeave}
            onClick={onBoxClick(box)}
            style={{ cursor: box.url ? 'pointer' : 'default' }}
            data-testid="tk-tab-tree-visit-box"
          >
            <rect
              x={box.x}
              y={box.y}
              width={box.width}
              height={box.height}
              fill={box.color.fill}
              stroke={box.color.border}
              strokeWidth={1}
              rx={3}
            />
            <text
              x={box.x + 8}
              y={box.y + 16}
              fontSize="11"
              fontFamily="system-ui, sans-serif"
              fill={box.color.text}
              style={{ pointerEvents: 'none' }}
            >
              {truncate(box.title, 26)}
            </text>
            {box.height >= 32 && (
              <text
                x={box.x + 8}
                y={box.y + 30}
                fontSize="10"
                fontFamily="ui-monospace, Menlo, monospace"
                fill={box.color.text}
                opacity={0.7}
                style={{ pointerEvents: 'none' }}
              >
                {fmtInstant(box.at_time)}
              </text>
            )}
          </g>
        ))}
      </svg>

      {hover && (
        <div
          style={{ ...TOOLTIP_STYLE, left: hover.x + 12, top: hover.y + 12 }}
          data-testid="tk-tab-tree-tooltip"
        >
          <div style={{ marginBottom: 4, fontWeight: 600 }}>{hover.box.title}</div>
          <div style={{ opacity: 0.85 }}>{hover.box.url || '(no url)'}</div>
          <div style={{ marginTop: 4, opacity: 0.7 }}>
            at_time: {fmtInstant(hover.box.at_time)}
          </div>
          <div style={{ opacity: 0.7 }}>
            ended_at:{' '}
            {hover.box.ended_at != null ? fmtInstant(hover.box.ended_at) : '—'}
          </div>
        </div>
      )}
    </div>
  );
};

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export default SessionTabTreeView;
