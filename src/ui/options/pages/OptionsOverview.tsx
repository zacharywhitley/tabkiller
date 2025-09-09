/**
 * Options Overview Page
 * Landing page for the options interface
 */

import React from 'react';
import { Navigation } from '../../../router';

export const OptionsOverview: React.FC = () => {
  return (
    <div className="tk-options-page tk-options-overview">
      <header className="tk-options-page__header">
        <h1 className="tk-options-page__title">TabKiller Settings</h1>
        <p className="tk-options-page__description">
          Configure your TabKiller extension settings and preferences
        </p>
      </header>

      <main className="tk-options-page__content">
        <div className="tk-options-overview__navigation">
          <Navigation vertical={true} />
        </div>
        
        <div className="tk-options-overview__sections">
          <section className="tk-overview-section">
            <h2>Quick Start</h2>
            <p>Get started with TabKiller by configuring these essential settings:</p>
            <ul>
              <li>Enable tracking to start recording your browsing history</li>
              <li>Configure session management for automatic organization</li>
              <li>Set up privacy preferences to control data collection</li>
            </ul>
          </section>

          <section className="tk-overview-section">
            <h2>Recent Activity</h2>
            <p>Extension is ready to track your browsing activity.</p>
          </section>
        </div>
      </main>
    </div>
  );
};