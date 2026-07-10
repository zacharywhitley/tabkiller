// Standalone debug page. Bypasses the pre-existing options-page provider
// stack (SessionProvider / SettingsProvider / etc.) which has an unrelated
// runtime bug at the time this file was written. The graph query panel has
// no dependency on those providers, so it can render happily on its own.

import React from 'react';
import { createRoot } from 'react-dom/client';
import { GraphQueryPanel } from './GraphQueryPanel';

const styles = `
  html, body { margin: 0; padding: 0; background: #f6f7f8; color: #111; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .debug-shell { max-width: 1200px; margin: 24px auto; padding: 0 16px 48px; }
  .debug-shell h1 { font-size: 20px; margin: 0 0 4px; }
  .debug-shell .subtitle { color: #555; font-size: 13px; margin: 0 0 20px; }
  @media (prefers-color-scheme: dark) {
    html, body { background: #1c1d1f; color: #eaeaea; }
    .debug-shell .subtitle { color: #a8a8a8; }
  }
`;

function DebugShell() {
  return (
    <>
      <style>{styles}</style>
      <div className="debug-shell">
        <h1>TabKiller Graph Query Debug</h1>
        <p className="subtitle">
          Standalone panel. Reads directly from IndexedDB via <code>openGraphStoreForDebug</code>.
          Does not touch the shipping options-page UI.
        </p>
        <GraphQueryPanel />
      </div>
    </>
  );
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Debug root element not found');
}
createRoot(container).render(<DebugShell />);
