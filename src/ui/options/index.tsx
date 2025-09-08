import React from 'react';
import { createRoot } from 'react-dom/client';
import { OptionsApp } from './components/OptionsApp';

/**
 * TabKiller Options Entry Point
 * Initializes and renders the React options/settings application
 */

// Initialize options page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('root');
  
  if (!container) {
    console.error('TabKiller options: Root element not found');
    return;
  }

  const root = createRoot(container);
  
  try {
    console.log('TabKiller options: Initializing React app');
    root.render(<OptionsApp />);
    console.log('TabKiller options: React app rendered successfully');
  } catch (error) {
    console.error('TabKiller options: Failed to render React app:', error);
    
    // Fallback HTML content
    container.innerHTML = `
      <div class="tk-error-fallback">
        <h2>TabKiller Options</h2>
        <p>There was an error loading the options interface.</p>
        <button onclick="window.location.reload()">Reload</button>
      </div>
    `;
  }
});