/**
 * Developer-only panel for exercising the graph query API against real
 * captured data. Not shipped to end users — rendered by `OptionsApp` only
 * when `isDebugPanelEnabled()` returns true.
 *
 * Purpose: after a day of actual browsing, the developer can pick a
 * primitive, punch in parameters, and inspect the raw JSON result. It's
 * the manual real-day validation harness for issue #53.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { openGraphStoreForDebug } from './index';
import {
  causalPredecessors,
  pagesOpenedFromDomain,
  tabTreeForTag,
  visitFocusedAt,
  visitsInTagPredatingTag,
  visitsOnScreenBetween,
} from '../../database/graph/queries';
import type { GraphStore } from '../../database/graph/store';

type QueryName =
  | 'pagesOpenedFromDomain'
  | 'visitFocusedAt'
  | 'visitsInTagPredatingTag'
  | 'causalPredecessors'
  | 'visitsOnScreenBetween'
  | 'tabTreeForTag';

interface QueryDescriptor {
  name: QueryName;
  label: string;
  fields: ReadonlyArray<{ key: string; label: string; placeholder: string }>;
  run: (g: GraphStore, params: Record<string, string>) => Promise<unknown>;
}

function requireNumber(params: Record<string, string>, key: string): number {
  const raw = params[key];
  if (raw == null || raw.trim() === '') {
    throw new Error(`Missing required parameter: ${key}`);
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`Parameter ${key} must be a finite number (got: ${raw})`);
  }
  return n;
}

function requireString(params: Record<string, string>, key: string): string {
  const raw = params[key];
  if (raw == null || raw.trim() === '') {
    throw new Error(`Missing required parameter: ${key}`);
  }
  return raw.trim();
}

const QUERIES: ReadonlyArray<QueryDescriptor> = [
  {
    name: 'pagesOpenedFromDomain',
    label: 'pagesOpenedFromDomain(hostname, from, to)',
    fields: [
      { key: 'hostname', label: 'hostname', placeholder: 'news.ycombinator.com' },
      { key: 'from', label: 'from (ms epoch)', placeholder: '0' },
      { key: 'to', label: 'to (ms epoch)', placeholder: String(Date.now()) },
    ],
    run: (g, p) =>
      pagesOpenedFromDomain(g, requireString(p, 'hostname'), requireNumber(p, 'from'), requireNumber(p, 'to')),
  },
  {
    name: 'visitFocusedAt',
    label: 'visitFocusedAt(t)',
    fields: [{ key: 't', label: 't (ms epoch)', placeholder: String(Date.now()) }],
    run: (g, p) => visitFocusedAt(g, requireNumber(p, 't')),
  },
  {
    name: 'visitsInTagPredatingTag',
    label: 'visitsInTagPredatingTag(tagSlug)',
    fields: [{ key: 'tagSlug', label: 'tagSlug', placeholder: 'wasted-time' }],
    run: (g, p) => visitsInTagPredatingTag(g, requireString(p, 'tagSlug')),
  },
  {
    name: 'causalPredecessors',
    label: 'causalPredecessors(visitId, windowMs)',
    fields: [
      { key: 'visitId', label: 'visitId', placeholder: 'v_abc123' },
      { key: 'windowMs', label: 'windowMs', placeholder: '3600000' },
    ],
    run: (g, p) => causalPredecessors(g, requireString(p, 'visitId'), requireNumber(p, 'windowMs')),
  },
  {
    name: 'visitsOnScreenBetween',
    label: 'visitsOnScreenBetween(tFrom, tTo)',
    fields: [
      { key: 'tFrom', label: 'tFrom (ms epoch)', placeholder: '0' },
      { key: 'tTo', label: 'tTo (ms epoch)', placeholder: String(Date.now()) },
    ],
    run: (g, p) => visitsOnScreenBetween(g, requireNumber(p, 'tFrom'), requireNumber(p, 'tTo')),
  },
  {
    name: 'tabTreeForTag',
    label: 'tabTreeForTag(tagSlug)',
    fields: [{ key: 'tagSlug', label: 'tagSlug', placeholder: 'react-research' }],
    run: (g, p) => tabTreeForTag(g, requireString(p, 'tagSlug')),
  },
];

const PANEL_STYLE: React.CSSProperties = {
  border: '1px dashed #888',
  padding: 12,
  margin: 12,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 12,
  background: '#fdfdfd',
};

const RESULT_STYLE: React.CSSProperties = {
  background: '#111',
  color: '#eee',
  padding: 12,
  overflow: 'auto',
  maxHeight: 400,
  whiteSpace: 'pre-wrap',
};

const FIELD_ROW_STYLE: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '160px 1fr',
  alignItems: 'center',
  gap: 8,
  marginBottom: 4,
};

export const GraphQueryPanel: React.FC = () => {
  const [selected, setSelected] = useState<QueryName>(QUERIES[0]!.name);
  const [params, setParams] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const descriptor = useMemo(
    () => QUERIES.find((q) => q.name === selected) ?? QUERIES[0]!,
    [selected],
  );

  const onSelect = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelected(event.target.value as QueryName);
    setParams({});
    setResult('');
    setError(null);
  }, []);

  const onFieldChange = useCallback(
    (key: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setParams((prev) => ({ ...prev, [key]: event.target.value }));
    },
    [],
  );

  const onRun = useCallback(async () => {
    setRunning(true);
    setError(null);
    setResult('');
    try {
      const store = await openGraphStoreForDebug();
      const value = await descriptor.run(store, params);
      setResult(JSON.stringify(value, null, 2));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [descriptor, params]);

  return (
    <section style={PANEL_STYLE} data-testid="tk-graph-query-panel">
      <h2 style={{ marginTop: 0, fontSize: 14 }}>Graph Query Debug Panel</h2>
      <p style={{ marginTop: 0, color: '#666' }}>
        Developer-only. Set <code>localStorage.TABKILLER_DEBUG = &apos;1&apos;</code> to show this
        panel; delete the key to hide it.
      </p>

      <div style={FIELD_ROW_STYLE}>
        <label htmlFor="tk-graph-query-select">Query</label>
        <select
          id="tk-graph-query-select"
          value={selected}
          onChange={onSelect}
          disabled={running}
        >
          {QUERIES.map((q) => (
            <option key={q.name} value={q.name}>
              {q.label}
            </option>
          ))}
        </select>
      </div>

      {descriptor.fields.map((f) => (
        <div key={f.key} style={FIELD_ROW_STYLE}>
          <label htmlFor={`tk-graph-query-field-${f.key}`}>{f.label}</label>
          <input
            id={`tk-graph-query-field-${f.key}`}
            type="text"
            placeholder={f.placeholder}
            value={params[f.key] ?? ''}
            onChange={onFieldChange(f.key)}
            disabled={running}
          />
        </div>
      ))}

      <div style={{ marginTop: 8 }}>
        <button type="button" onClick={onRun} disabled={running}>
          {running ? 'Running...' : 'Run'}
        </button>
      </div>

      {error != null && (
        <div style={{ color: '#c00', marginTop: 8 }} data-testid="tk-graph-query-error">
          Error: {error}
        </div>
      )}

      {result !== '' && (
        <pre style={{ ...RESULT_STYLE, marginTop: 8 }} data-testid="tk-graph-query-result">
          {result}
        </pre>
      )}
    </section>
  );
};

export default GraphQueryPanel;
