/**
 * Developer-only tag form.
 *
 * Sends `apply-tag` / `remove-tag` runtime messages to the background
 * service worker, which appends the corresponding `tag_applied` /
 * `tag_removed` events to the outbox. The graph ingest pipeline drains
 * them into `Tag` nodes and `tagged_with` edges — the developer can
 * then confirm the wiring by running `tabTreeForTag(slug)` in the
 * neighbouring query panel and seeing a non-empty result.
 *
 * Not a shipping UI. The real tagging surface (multi-select, tag
 * hierarchy, etc.) will land elsewhere.
 */

import React, { useCallback, useState } from 'react';

interface ChromeLike {
  runtime?: {
    sendMessage?: (message: unknown) => Promise<unknown>;
  };
}

interface Feedback {
  kind: 'success' | 'error';
  text: string;
}

const PANEL_STYLE: React.CSSProperties = {
  border: '1px dashed #888',
  padding: 12,
  margin: 12,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 12,
  background: '#fdfdfd',
};

const FIELD_ROW_STYLE: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '160px 1fr',
  alignItems: 'center',
  gap: 8,
  marginBottom: 4,
};

async function sendMessage(message: unknown): Promise<unknown> {
  const bridge = (globalThis as unknown as { chrome?: ChromeLike }).chrome
    ?? (globalThis as unknown as { browser?: ChromeLike }).browser;
  const send = bridge?.runtime?.sendMessage;
  if (!send) {
    throw new Error('chrome.runtime.sendMessage unavailable — is this page loaded outside the extension context?');
  }
  return send(message);
}

interface MessageResponseShape {
  success: boolean;
  data?: unknown;
  error?: string;
}

function unwrap(response: unknown): unknown {
  const r = response as MessageResponseShape | undefined;
  if (!r) throw new Error('no response from service worker');
  if (!r.success) throw new Error(r.error ?? 'unknown service-worker error');
  return r.data;
}

export const TagForm: React.FC = () => {
  const [sessionNodeId, setSessionNodeId] = useState('');
  const [slug, setSlug] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const onLoadCurrent = useCallback(async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const data = unwrap(await sendMessage({ type: 'get-current-session-id' }));
      if (typeof data === 'string' && data.length > 0) {
        setSessionNodeId(data);
        setFeedback({ kind: 'success', text: `Loaded current session: ${data}` });
      } else {
        setFeedback({ kind: 'error', text: 'No session is currently open in the SW.' });
      }
    } catch (e) {
      setFeedback({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }, []);

  const onApply = useCallback(async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const data = unwrap(await sendMessage({
        type: 'apply-tag',
        payload: {
          slug: slug.trim(),
          label: label.trim() || undefined,
          sessionNodeId: sessionNodeId.trim() || undefined,
        },
      })) as { eventId?: string; sessionNodeId?: string; slug?: string };
      setFeedback({
        kind: 'success',
        text: `Applied "${data.slug}" to ${data.sessionNodeId} (event ${data.eventId}). Wait ~500ms then Run tabTreeForTag(${data.slug}).`,
      });
    } catch (e) {
      setFeedback({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }, [slug, label, sessionNodeId]);

  const onRemove = useCallback(async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const data = unwrap(await sendMessage({
        type: 'remove-tag',
        payload: {
          slug: slug.trim(),
          sessionNodeId: sessionNodeId.trim() || undefined,
        },
      })) as { eventId?: string; sessionNodeId?: string; slug?: string };
      setFeedback({
        kind: 'success',
        text: `Requested removal of "${data.slug}" from ${data.sessionNodeId} (event ${data.eventId}).`,
      });
    } catch (e) {
      setFeedback({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }, [slug, sessionNodeId]);

  return (
    <section style={PANEL_STYLE} data-testid="tk-tag-form">
      <h2 style={{ marginTop: 0, fontSize: 14 }}>Developer Tag Form</h2>
      <p style={{ marginTop: 0, color: '#666' }}>
        Applies <code>tag_applied</code> / <code>tag_removed</code> events to the outbox via the
        service worker. Not a shipping UI — used to verify the tag wiring.
      </p>

      <div style={FIELD_ROW_STYLE}>
        <label htmlFor="tk-tag-form-session">sessionNodeId</label>
        <input
          id="tk-tag-form-session"
          type="text"
          placeholder="session_<eventId>"
          value={sessionNodeId}
          onChange={(e) => setSessionNodeId(e.target.value)}
          disabled={busy}
        />
      </div>

      <div style={FIELD_ROW_STYLE}>
        <label htmlFor="tk-tag-form-slug">slug</label>
        <input
          id="tk-tag-form-slug"
          type="text"
          placeholder="react-research"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          disabled={busy}
        />
      </div>

      <div style={FIELD_ROW_STYLE}>
        <label htmlFor="tk-tag-form-label">label (optional)</label>
        <input
          id="tk-tag-form-label"
          type="text"
          placeholder="React Research"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          disabled={busy}
        />
      </div>

      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <button type="button" onClick={onLoadCurrent} disabled={busy}>
          Load current session
        </button>
        <button type="button" onClick={onApply} disabled={busy || !slug.trim()}>
          Apply tag
        </button>
        <button type="button" onClick={onRemove} disabled={busy || !slug.trim()}>
          Remove tag
        </button>
      </div>

      {feedback && (
        <div
          style={{
            marginTop: 8,
            color: feedback.kind === 'error' ? '#c00' : '#080',
          }}
          data-testid="tk-tag-form-feedback"
        >
          {feedback.text}
        </div>
      )}
    </section>
  );
};

export default TagForm;
