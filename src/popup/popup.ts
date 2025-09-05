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
  TabInfo,
  SearchResult,
  SessionTag,
  PopupState
} from '../shared/types';
import { createSearchInput, SearchInput } from '../components/ui/SearchInput';
import { createTagManager, TagManager } from '../components/ui/TagManager';
import { Toast } from '../components/ui/Toast';

class PopupController {
  private currentSession: BrowsingSession | null = null;
  // private settings: ExtensionSettings | null = null;
  private stats = {
    activeTabs: 0,
    totalSessions: 0,
    todaysPages: 0
  };
  
  // UI Components
  private searchInput: SearchInput | null = null;
  private sessionTagManager: TagManager | null = null;
  private currentSessionTagManager: TagManager | null = null;
  private availableTags: SessionTag[] = [];

  constructor() {
    this.initialize();
  }

  /**
   * Initialize the popup
   */
  private async initialize(): Promise<void> {
    try {
      console.log('TabKiller popup initializing...');

      // Initialize UI components
      this.initializeUIComponents();

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
   * Initialize UI components
   */
  private initializeUIComponents(): void {
    try {
      // Initialize search input
      const searchContainer = document.getElementById('search-container');
      if (searchContainer) {
        this.searchInput = createSearchInput({
          id: 'history-search',
          placeholder: 'Search your browsing history...',
          showFilters: true,
          onSearch: (query, filters) => this.handleSearch(query, filters),
          onResultSelect: (result) => this.handleSearchResultSelect(result)
        });
        searchContainer.appendChild(this.searchInput.getElement());
      }

      // Load available tags
      this.loadAvailableTags();

    } catch (error) {
      console.error('Failed to initialize UI components:', error);
    }
  }

  /**
   * Load available tags from storage
   */
  private async loadAvailableTags(): Promise<void> {
    try {
      const response = await this.sendMessage('get-tags');
      if (response.success && response.data) {
        this.availableTags = response.data as SessionTag[];
      }
    } catch (error) {
      console.error('Failed to load available tags:', error);
    }
  }

  /**
   * Handle search query
   */
  private async handleSearch(query: string, filters: any): Promise<void> {
    try {
      const response = await this.sendMessage('search-history', { query, filters });
      if (response.success && response.data) {
        const results = response.data as SearchResult[];
        this.searchInput?.setResults(results);
      } else {
        this.searchInput?.setError('Search failed');
      }
    } catch (error) {
      console.error('Search error:', error);
      this.searchInput?.setError('Search failed');
    }
  }

  /**
   * Handle search result selection
   */
  private handleSearchResultSelect(result: SearchResult): void {
    // Open the selected result in a new tab or restore session
    if (result.type === 'session' && result.metadata.sessionId) {
      this.restoreSession(result.metadata.sessionId);
    } else if (result.url) {
      chrome.tabs.create({ url: result.url });
      window.close();
    }
  }

  /**
   * Restore a session
   */
  private async restoreSession(sessionId: string): Promise<void> {
    try {
      const response = await this.sendMessage('restore-session', { sessionId });
      if (response.success) {
        Toast.success('Session restored', 'All tabs have been restored');
        window.close();
      } else {
        Toast.error('Restore failed', response.error || 'Could not restore session');
      }
    } catch (error) {
      console.error('Error restoring session:', error);
      Toast.error('Restore failed', 'An unexpected error occurred');
    }
  }

  /**
   * Set up all event listeners
   */
  private setupEventListeners(): void {
    // Primary action buttons
    const createSessionBtn = document.getElementById('create-session-btn');
    const saveSessionBtn = document.getElementById('save-session-btn');
    const tagSessionBtn = document.getElementById('tag-session-btn');
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

    // Tag modal elements
    const tagModal = document.getElementById('tag-modal');
    const tagModalOverlay = document.getElementById('tag-modal-overlay');
    const tagModalCloseBtn = document.getElementById('tag-modal-close-btn');
    const tagModalCancelBtn = document.getElementById('tag-modal-cancel-btn');
    const tagModalSaveBtn = document.getElementById('tag-modal-save-btn');

    // Add event listeners
    createSessionBtn?.addEventListener('click', () => this.showCreateSessionModal());
    saveSessionBtn?.addEventListener('click', () => this.saveCurrentSession());
    tagSessionBtn?.addEventListener('click', () => this.showTagModal());
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

    // Tag modal events
    tagModalOverlay?.addEventListener('click', () => this.hideTagModal());
    tagModalCloseBtn?.addEventListener('click', () => this.hideTagModal());
    tagModalCancelBtn?.addEventListener('click', () => this.hideTagModal());
    tagModalSaveBtn?.addEventListener('click', () => this.saveSessionTags());

    // Keyboard events
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (sessionModal?.style.display === 'block') {
          this.hideCreateSessionModal();
        } else if (tagModal?.style.display === 'block') {
          this.hideTagModal();
        }
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
    const tagSessionBtn = document.getElementById('tag-session-btn') as HTMLButtonElement;

    if (!sessionContainer) return;

    if (this.currentSession) {
      // Display session tags
      const sessionTags = this.getCurrentSessionTagIds();
      const tagsDisplay = sessionTags.length > 0 
        ? sessionTags.map(tagId => {
            const tag = this.availableTags.find(t => t.id === tagId);
            return tag ? tag.name : tagId;
          }).join(', ')
        : 'No tags';

      sessionContainer.innerHTML = `
        <div class="tk-session-info__active">
          <span class="tk-session-info__name">${this.escapeHtml(this.currentSession.tag)}</span>
          <span class="tk-session-info__tags">Tags: ${tagsDisplay}</span>
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
      
      if (tagSessionBtn) {
        tagSessionBtn.disabled = false;
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
      
      if (tagSessionBtn) {
        tagSessionBtn.disabled = true;
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
      // Initialize tag manager if not already done
      if (!this.sessionTagManager) {
        const tagContainer = document.getElementById('session-tags');
        if (tagContainer) {
          this.sessionTagManager = createTagManager({
            id: 'session-tag-manager',
            placeholder: 'Add tags for this session...',
            existingTags: this.availableTags,
            onTagCreate: async (tagName) => this.createNewTag(tagName)
          });
          tagContainer.appendChild(this.sessionTagManager.getElement());
        }
      }

      modal.style.display = 'flex';
      
      // Focus on the session name input
      const nameInput = document.getElementById('session-name') as HTMLInputElement;
      if (nameInput) {
        setTimeout(() => nameInput.focus(), 100);
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

    // Clear tag manager
    this.sessionTagManager?.clearTags();
  }

  /**
   * Show tag management modal
   */
  private showTagModal(): void {
    if (!this.currentSession) return;

    const modal = document.getElementById('tag-modal');
    if (modal) {
      // Initialize current session tag manager if not already done
      if (!this.currentSessionTagManager) {
        const tagContainer = document.getElementById('current-session-tags');
        if (tagContainer) {
          this.currentSessionTagManager = createTagManager({
            id: 'current-session-tag-manager',
            placeholder: 'Manage session tags...',
            existingTags: this.availableTags,
            selectedTags: this.getCurrentSessionTagIds(),
            onTagCreate: async (tagName) => this.createNewTag(tagName)
          });
          tagContainer.appendChild(this.currentSessionTagManager.getElement());
        }
      } else {
        // Update with current session tags
        this.currentSessionTagManager.setTags(this.getCurrentSessionTagIds());
      }

      // Update session analytics
      this.updateSessionAnalytics();

      modal.style.display = 'flex';
    }
  }

  /**
   * Hide tag management modal
   */
  private hideTagModal(): void {
    const modal = document.getElementById('tag-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  /**
   * Save session tags
   */
  private async saveSessionTags(): Promise<void> {
    if (!this.currentSession || !this.currentSessionTagManager) return;

    try {
      const selectedTags = this.currentSessionTagManager.getTags();
      
      const response = await this.sendMessage('update-session-tags', {
        sessionId: this.currentSession.id,
        tags: selectedTags
      });

      if (response.success) {
        // Update current session with new tags
        if (response.data) {
          this.currentSession = response.data as BrowsingSession;
          this.updateCurrentSession();
        }
        
        this.hideTagModal();
        Toast.success('Tags updated', 'Session tags have been saved');
      } else {
        Toast.error('Save failed', response.error || 'Could not update tags');
      }
    } catch (error) {
      console.error('Error saving session tags:', error);
      Toast.error('Save failed', 'An unexpected error occurred');
    }
  }

  /**
   * Get current session tag IDs
   */
  private getCurrentSessionTagIds(): string[] {
    if (!this.currentSession) return [];
    
    // Extract tag IDs from session metadata
    // This would depend on how tags are stored in the session
    return this.currentSession.metadata?.tags || [];
  }

  /**
   * Update session analytics display
   */
  private updateSessionAnalytics(): void {
    if (!this.currentSession) return;

    const durationElement = document.getElementById('analytics-duration');
    const pagesElement = document.getElementById('analytics-pages');
    const domainsElement = document.getElementById('analytics-domains');

    if (durationElement) {
      const duration = Date.now() - this.currentSession.createdAt;
      durationElement.textContent = this.formatDuration(duration);
    }

    if (pagesElement) {
      pagesElement.textContent = this.currentSession.tabs.length.toString();
    }

    if (domainsElement) {
      const uniqueDomains = new Set(this.currentSession.tabs.map(tab => 
        new URL(tab.url).hostname
      ));
      domainsElement.textContent = uniqueDomains.size.toString();
    }
  }

  /**
   * Create a new tag
   */
  private async createNewTag(tagName: string): Promise<SessionTag> {
    try {
      const response = await this.sendMessage('create-tag', { name: tagName });
      
      if (response.success && response.data) {
        const newTag = response.data as SessionTag;
        this.availableTags.push(newTag);
        return newTag;
      } else {
        throw new Error(response.error || 'Failed to create tag');
      }
    } catch (error) {
      console.error('Error creating tag:', error);
      throw error;
    }
  }

  /**
   * Format duration for display
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Handle session form submission
   */
  private async handleSessionFormSubmit(event: Event): Promise<void> {
    event.preventDefault();
    
    const form = event.target as HTMLFormElement;
    const formData = new FormData(form);
    const name = formData.get('name') as string;
    const notes = formData.get('notes') as string;
    const isPrivate = formData.get('private') === 'on';

    if (!name.trim()) {
      Toast.error('Session name required', 'Please enter a name for this session');
      return;
    }

    try {
      // Get selected tags from tag manager
      const tags = this.sessionTagManager?.getTags() || [];

      const response = await this.sendMessage('create-session', { 
        name: name.trim(),
        tags: tags,
        notes: notes.trim() || undefined,
        isPrivate: isPrivate
      });

      if (response.success && response.data) {
        this.currentSession = response.data as BrowsingSession;
        this.updateCurrentSession();
        this.hideCreateSessionModal();
        Toast.success('Session created', 'New browsing session started successfully');
      } else {
        Toast.error('Creation failed', response.error || 'Failed to create session');
      }
    } catch (error) {
      console.error('Error creating session:', error);
      Toast.error('Creation failed', 'An unexpected error occurred');
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
  private showSuccess(message: string, details?: string): void {
    Toast.success(message, details);
  }

  /**
   * Show error message
   */
  private showError(message: string, details?: string): void {
    Toast.error(message, details);
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