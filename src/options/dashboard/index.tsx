// Dashboard entry. Bypasses the shipping options-page provider stack
// (which has a pre-existing runtime bug) exactly the way `debug.html`
// does, so this page reads IndexedDB directly via `openGraphStoreForDebug`.

import React from 'react';
import { createRoot } from 'react-dom/client';
import { DashboardShell } from './DashboardShell';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Dashboard root element not found');
}
createRoot(container).render(<DashboardShell />);
