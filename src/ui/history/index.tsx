import React from 'react';
import { createRoot } from 'react-dom/client';
import { HistoryApp } from './components/HistoryApp';

/**
 * TabKiller History Entry Point
 * Initializes and renders the React history/browsing data application
 */

// Initialize history page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('root');
  
  if (!container) {
    console.error('TabKiller history: Root element not found');
    return;
  }

  const root = createRoot(container);
  
  try {
    console.log('TabKiller history: Initializing React app');
    root.render(<HistoryApp />);
    console.log('TabKiller history: React app rendered successfully');
  } catch (error) {
    console.error('TabKiller history: Failed to render React app:', error);
    
    // Fallback HTML content
    container.innerHTML = `
      <div class="tk-error-fallback">
        <h2>TabKiller History</h2>
        <p>There was an error loading the history interface.</p>
        <button onclick="window.location.reload()">Reload</button>
      </div>
    `;
  }
});