import React from 'react';
import { createRoot } from 'react-dom/client';
import { PopupApp } from './components/PopupApp';

/**
 * TabKiller Popup Entry Point
 * Initializes and renders the React popup application
 */

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('root');
  
  if (!container) {
    console.error('TabKiller popup: Root element not found');
    return;
  }

  const root = createRoot(container);
  
  try {
    console.log('TabKiller popup: Initializing React app');
    root.render(<PopupApp />);
    console.log('TabKiller popup: React app rendered successfully');
  } catch (error) {
    console.error('TabKiller popup: Failed to render React app:', error);
    
    // Fallback HTML content
    container.innerHTML = `
      <div class="tk-error-fallback">
        <h2>TabKiller Popup</h2>
        <p>There was an error loading the popup interface.</p>
        <button onclick="window.location.reload()">Reload</button>
      </div>
    `;
  }
});