/**
 * TabKiller Popup Script
 * Handles the popup UI interactions and communication with background script
 */

import { messaging } from '../utils/cross-browser';
import {
  Message,
  MessageResponse,
  BrowsingSession,
  ExtensionSettings,
  TabInfo
} from '../shared/types';

class PopupController {
  private currentSession: BrowsingSession | null = null;
  // private settings: ExtensionSettings | null = null;
  private stats = {
    activeTabs: 0,
    totalSessions: 0,
    todaysPages: 0
  };

  constructor() {
    this.initialize();
  }

  /**
   * Initialize the popup
   */
  private async initialize(): Promise<void> {
    try {
      console.log('TabKiller popup initializing...');

      // Set up event listeners
      this.setupEventListeners();

      // Load initial data
      await this.loadInitialData();

      // Update UI
      this.updateUI();

      console.log('TabKiller popup initialized successfully');
    } catch (error) {
      console.error('Failed to initialize TabKiller popup:', error);
      this.showError('Failed to initialize popup');
    }
  }

  /**
   * Set up all event listeners
   */
  private setupEventListeners(): void {
    // Primary action buttons
    const createSessionBtn = document.getElementById('create-session-btn');
    const saveSessionBtn = document.getElementById('save-session-btn');
    const captureTabsBtn = document.getElementById('capture-tabs-btn');
    const viewHistoryBtn = document.getElementById('view-history-btn');
    const exportDataBtn = document.getElementById('export-data-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const viewAllSessionsBtn = document.getElementById('view-all-sessions-btn');

    // Modal elements
    const sessionModal = document.getElementById('session-modal');
    const modalOverlay = document.getElementById('modal-overlay');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const sessionForm = document.getElementById('session-form') as HTMLFormElement;
    const cancelSessionBtn = document.getElementById('cancel-session-btn');

    // Add event listeners
    createSessionBtn?.addEventListener('click', () => this.showCreateSessionModal());
    saveSessionBtn?.addEventListener('click', () => this.saveCurrentSession());
    captureTabsBtn?.addEventListener('click', () => this.captureTabs());
    viewHistoryBtn?.addEventListener('click', () => this.viewHistory());
    exportDataBtn?.addEventListener('click', () => this.exportData());
    settingsBtn?.addEventListener('click', () => this.openSettings());
    viewAllSessionsBtn?.addEventListener('click', () => this.viewAllSessions());

    // Modal events
    modalOverlay?.addEventListener('click', () => this.hideCreateSessionModal());
    modalCloseBtn?.addEventListener('click', () => this.hideCreateSessionModal());
    cancelSessionBtn?.addEventListener('click', () => this.hideCreateSessionModal());
    sessionForm?.addEventListener('submit', (e) => this.handleSessionFormSubmit(e));

    // Keyboard events
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && sessionModal?.style.display === 'block') {
        this.hideCreateSessionModal();
      }
    });
  }

  /**
   * Load initial data from background script
   */
  private async loadInitialData(): Promise<void> {
    try {
      // Get extension status
      const statusResponse = await this.sendMessage('get-status');
      if (statusResponse.success && statusResponse.data) {
        const status = statusResponse.data as any;
        this.stats.activeTabs = status.activeTabs || 0;
        // this.settings = status.settings;
        
        // Update browser info
        this.updateBrowserInfo(status.browser, status.manifestVersion);
      }

      // Get current session
      const sessionResponse = await this.sendMessage('get-current-session');
      if (sessionResponse.success && sessionResponse.data) {
        this.currentSession = sessionResponse.data as BrowsingSession;
      }

      // Get settings
      const settingsResponse = await this.sendMessage('get-settings');
      if (settingsResponse.success && settingsResponse.data) {
        // this.settings = settingsResponse.data as ExtensionSettings;
      }

      // Load additional stats (placeholder for now)
      this.stats.totalSessions = 0; // Will be implemented with storage
      this.stats.todaysPages = 0; // Will be implemented with history tracking
    } catch (error) {
      console.error('Error loading initial data:', error);
    }
  }

  /**
   * Update the entire UI based on current state
   */
  private updateUI(): void {
    this.updateStatusIndicator();
    this.updateCurrentSession();
    this.updateStats();
    this.updateRecentSessions();
  }

  /**
   * Update status indicator
   */
  private updateStatusIndicator(): void {
    const statusDot = document.querySelector('.tk-popup__status-dot');
    const statusText = document.querySelector('.tk-popup__status-text');

    if (statusDot && statusText) {
      statusDot.className = 'tk-popup__status-dot tk-popup__status-dot--active';
      statusText.textContent = 'Active';
    }
  }

  /**
   * Update current session display
   */
  private updateCurrentSession(): void {
    const sessionContainer = document.getElementById('current-session');
    const saveSessionBtn = document.getElementById('save-session-btn') as HTMLButtonElement;

    if (!sessionContainer) return;

    if (this.currentSession) {
      sessionContainer.innerHTML = `
        <div class="tk-session-info__active">
          <span class="tk-session-info__tag">${this.escapeHtml(this.currentSession.tag)}</span>
          <span class="tk-session-info__meta">
            ${this.currentSession.tabs.length} tabs • 
            ${this.formatDate(this.currentSession.createdAt)}
          </span>
          ${this.currentSession.metadata.notes ? 
            `<span class="tk-session-info__notes">${this.escapeHtml(this.currentSession.metadata.notes)}</span>` : 
            ''
          }
        </div>
      `;
      
      if (saveSessionBtn) {
        saveSessionBtn.disabled = false;
      }
    } else {
      sessionContainer.innerHTML = `
        <div class="tk-session-info__placeholder">
          No active session
        </div>
      `;
      
      if (saveSessionBtn) {
        saveSessionBtn.disabled = true;
      }
    }
  }

  /**
   * Update statistics display
   */
  private updateStats(): void {
    const activeTabsCount = document.getElementById('active-tabs-count');
    const totalSessionsCount = document.getElementById('total-sessions-count');
    const todaysPagesCount = document.getElementById('todays-pages-count');

    if (activeTabsCount) activeTabsCount.textContent = this.stats.activeTabs.toString();
    if (totalSessionsCount) totalSessionsCount.textContent = this.stats.totalSessions.toString();
    if (todaysPagesCount) todaysPagesCount.textContent = this.stats.todaysPages.toString();
  }

  /**
   * Update recent sessions display
   */
  private updateRecentSessions(): void {
    const recentSessions = document.getElementById('recent-sessions');
    
    if (!recentSessions) return;

    // Placeholder for now - will be implemented with session storage
    recentSessions.innerHTML = `
      <div class="tk-session-list__placeholder">
        No recent sessions
      </div>
    `;
  }

  /**
   * Update browser info in footer
   */
  private updateBrowserInfo(browser: string, manifestVersion: number): void {
    const browserInfo = document.getElementById('browser-info');
    if (browserInfo) {
      browserInfo.textContent = `${browser.charAt(0).toUpperCase() + browser.slice(1)} MV${manifestVersion}`;
    }
  }

  /**
   * Show create session modal
   */
  private showCreateSessionModal(): void {
    const modal = document.getElementById('session-modal');
    if (modal) {
      modal.style.display = 'flex';
      
      // Focus on the tag input
      const tagInput = document.getElementById('session-tag') as HTMLInputElement;
      if (tagInput) {
        setTimeout(() => tagInput.focus(), 100);
      }
    }
  }

  /**
   * Hide create session modal
   */
  private hideCreateSessionModal(): void {
    const modal = document.getElementById('session-modal');
    const form = document.getElementById('session-form') as HTMLFormElement;
    
    if (modal) {
      modal.style.display = 'none';
    }
    
    if (form) {
      form.reset();
    }
  }

  /**
   * Handle session form submission
   */
  private async handleSessionFormSubmit(event: Event): Promise<void> {
    event.preventDefault();
    
    const form = event.target as HTMLFormElement;
    const formData = new FormData(form);
    const tag = formData.get('tag') as string;
    const notes = formData.get('notes') as string;

    if (!tag.trim()) {
      this.showError('Session tag is required');
      return;
    }

    try {
      const response = await this.sendMessage('create-session', { 
        tag: tag.trim(),
        notes: notes.trim() || undefined
      });

      if (response.success && response.data) {
        this.currentSession = response.data as BrowsingSession;
        this.updateCurrentSession();
        this.hideCreateSessionModal();
        this.showSuccess('Session created successfully');
      } else {
        this.showError(response.error || 'Failed to create session');
      }
    } catch (error) {
      console.error('Error creating session:', error);
      this.showError('Failed to create session');
    }
  }

  /**
   * Save current session
   */
  private async saveCurrentSession(): Promise<void> {
    if (!this.currentSession) return;

    try {
      // This would typically update the session with latest tab information
      const response = await this.sendMessage('update-session', this.currentSession);
      
      if (response.success) {
        this.showSuccess('Session saved successfully');
      } else {
        this.showError(response.error || 'Failed to save session');
      }
    } catch (error) {
      console.error('Error saving session:', error);
      this.showError('Failed to save session');
    }
  }

  /**
   * Capture current tabs
   */
  private async captureTabs(): Promise<void> {
    try {
      const response = await this.sendMessage('capture-tabs');
      
      if (response.success && response.data) {
        const tabs = response.data as TabInfo[];
        this.stats.activeTabs = tabs.length;
        this.updateStats();
        this.showSuccess(`Captured ${tabs.length} tabs`);
      } else {
        this.showError(response.error || 'Failed to capture tabs');
      }
    } catch (error) {
      console.error('Error capturing tabs:', error);
      this.showError('Failed to capture tabs');
    }
  }

  /**
   * View browsing history
   */
  private viewHistory(): void {
    // This would open a full history view
    // For now, just open a new tab with placeholder content
    chrome.tabs.create({ url: chrome.runtime.getURL('history/history.html') });
    window.close();
  }

  /**
   * Export data
   */
  private async exportData(): Promise<void> {
    try {
      const response = await this.sendMessage('export-data');
      
      if (response.success && response.data) {
        // Create and download a file with the exported data
        const dataStr = JSON.stringify(response.data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `tabkiller-export-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        URL.revokeObjectURL(url);
        this.showSuccess('Data exported successfully');
      } else {
        this.showError(response.error || 'Failed to export data');
      }
    } catch (error) {
      console.error('Error exporting data:', error);
      this.showError('Failed to export data');
    }
  }

  /**
   * Open settings
   */
  private openSettings(): void {
    // This would open a settings page
    chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') });
    window.close();
  }

  /**
   * View all sessions
   */
  private viewAllSessions(): void {
    // This would open a sessions management page
    chrome.tabs.create({ url: chrome.runtime.getURL('sessions/sessions.html') });
    window.close();
  }

  /**
   * Send message to background script
   */
  private async sendMessage(type: string, payload?: any): Promise<MessageResponse> {
    const message: Message = { type, payload };
    return messaging.sendMessage<MessageResponse>(message);
  }

  /**
   * Show success message
   */
  private showSuccess(message: string): void {
    // This would show a toast notification or similar
    console.log('Success:', message);
  }

  /**
   * Show error message
   */
  private showError(message: string): void {
    // This would show a toast notification or similar
    console.error('Error:', message);
    
    // For now, just show an alert
    alert(`Error: ${message}`);
  }

  /**
   * Escape HTML content
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Format date for display
   */
  private formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});