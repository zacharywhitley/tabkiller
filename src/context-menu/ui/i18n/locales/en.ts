/**
 * English translations for context menu
 */

import { TranslationData } from '../types';

export const enTranslations: TranslationData = {
  locale: 'en',
  version: '1.0.0',
  lastUpdated: '2025-01-01',
  translations: {
    menu: {
      // Menu groups
      groups: {
        navigation: 'Navigation',
        tabs: 'Tab Management',
        sessions: 'Session Management',
        bookmarks: 'Bookmarks',
        settings: 'Settings',
        tools: 'Tools',
        help: 'Help',
        custom: 'Custom'
      },

      // Menu items
      items: {
        // Navigation items
        'open-popup': 'Open TabKiller',
        'show-history': 'Show History',
        'show-sessions': 'Show Sessions',
        'show-bookmarks': 'Show Bookmarks',

        // Tab management
        'capture-tabs': 'Capture All Tabs',
        'save-tab': 'Save This Tab',
        'close-tab': 'Close Tab',
        'restore-tab': 'Restore Tab',
        'duplicate-tab': 'Duplicate Tab',
        'pin-tab': 'Pin Tab',
        'unpin-tab': 'Unpin Tab',
        'move-tab-to-window': 'Move to New Window',

        // Session management
        'start-session': 'Start New Session',
        'end-session': 'End Current Session',
        'save-session': 'Save Session',
        'restore-session': 'Restore Session',
        'tag-session': 'Tag Session',
        'export-session': 'Export Session',

        // Bookmarks
        'bookmark-page': 'Bookmark This Page',
        'bookmark-tabs': 'Bookmark All Tabs',
        'organize-bookmarks': 'Organize Bookmarks',
        'import-bookmarks': 'Import Bookmarks',

        // Settings
        'open-settings': 'Open Settings',
        'general-settings': 'General Settings',
        'privacy-settings': 'Privacy Settings',
        'ui-settings': 'UI Settings',
        'storage-settings': 'Storage Settings',
        'keyboard-shortcuts': 'Keyboard Shortcuts',

        // Tools
        'search-history': 'Search History',
        'export-data': 'Export Data',
        'import-data': 'Import Data',
        'clean-storage': 'Clean Storage',
        'backup-data': 'Backup Data',

        // Help
        'user-guide': 'User Guide',
        'keyboard-help': 'Keyboard Shortcuts Help',
        'report-issue': 'Report Issue',
        'about': 'About TabKiller'
      },

      // Descriptions for menu items
      descriptions: {
        'open-popup': 'Open the TabKiller popup window',
        'show-history': 'View your browsing history and captured tabs',
        'show-sessions': 'View and manage your browsing sessions',
        'capture-tabs': 'Capture all currently open tabs for later reference',
        'start-session': 'Begin tracking a new browsing session',
        'end-session': 'Stop tracking the current browsing session',
        'bookmark-page': 'Add this page to your bookmarks',
        'open-settings': 'Open TabKiller settings and configuration',
        'search-history': 'Search through your browsing history',
        'user-guide': 'Open the user guide and help documentation'
      },

      // Keyboard shortcuts display
      shortcuts: {
        ctrl: 'Ctrl',
        alt: 'Alt',
        shift: 'Shift',
        meta: 'Meta',
        cmd: 'Cmd',
        enter: 'Enter',
        escape: 'Esc',
        space: 'Space',
        tab: 'Tab',
        backspace: 'Backspace',
        delete: 'Delete',
        'arrow-up': '↑',
        'arrow-down': '↓',
        'arrow-left': '←',
        'arrow-right': '→'
      },

      // Context-aware labels
      contextual: {
        // Based on selection
        'with-selection': 'with selected text',
        'without-selection': 'no text selected',
        
        // Based on page type
        'on-web-page': 'on web page',
        'on-extension-page': 'on extension page',
        'on-local-file': 'on local file',
        'on-internal-page': 'on browser page',

        // Based on media
        'with-image': 'with image',
        'with-video': 'with video',
        'with-audio': 'with audio',
        'with-link': 'with link'
      },

      // Error messages
      errors: {
        'menu-creation-failed': 'Failed to create context menu',
        'permission-denied': 'Permission denied for context menu access',
        'feature-unavailable': 'This feature is not available in the current context',
        'context-not-supported': 'Context menus are not supported in this browser'
      },

      // Success messages
      success: {
        'menu-created': 'Context menu created successfully',
        'settings-updated': 'Menu settings updated successfully',
        'shortcut-registered': 'Keyboard shortcut registered successfully',
        'customization-saved': 'Menu customization saved successfully'
      }
    }
  }
};