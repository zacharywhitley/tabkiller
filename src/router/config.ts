/**
 * Router Configuration for TabKiller Extension
 * Defines routes and navigation structure for different extension contexts
 */

import { ExtensionRouterConfig, NavigationItem } from './types';
import React from 'react';

// Lazy imports for popup pages
const HomePage = React.lazy(() => import('../ui/popup/pages').then(m => ({ default: m.HomePage })));
const SessionsPage = React.lazy(() => import('../ui/popup/pages').then(m => ({ default: m.SessionsPage })));
const QuickActionsPage = React.lazy(() => import('../ui/popup/pages').then(m => ({ default: m.QuickActionsPage })));

// Lazy imports for options pages
const OptionsOverview = React.lazy(() => import('../ui/options/pages/index').then(m => ({ default: m.OptionsOverview })));
const GeneralSettings = React.lazy(() => import('../ui/options/pages/index').then(m => ({ default: m.GeneralSettings })));
const TrackingSettings = React.lazy(() => import('../ui/options/pages/index').then(m => ({ default: m.TrackingSettings })));
const SessionSettings = React.lazy(() => import('../ui/options/pages/index').then(m => ({ default: m.SessionSettings })));
const PrivacySettings = React.lazy(() => import('../ui/options/pages/index').then(m => ({ default: m.PrivacySettings })));
const SyncSettings = React.lazy(() => import('../ui/options/pages/index').then(m => ({ default: m.SyncSettings })));
const AdvancedSettings = React.lazy(() => import('../ui/options/pages/index').then(m => ({ default: m.AdvancedSettings })));
const AboutPage = React.lazy(() => import('../ui/options/pages/index').then(m => ({ default: m.AboutPage })));

// Lazy imports for history pages
const HistoryOverview = React.lazy(() => import('../ui/history/pages/index').then(m => ({ default: m.HistoryOverview })));
const BrowseHistory = React.lazy(() => import('../ui/history/pages/index').then(m => ({ default: m.BrowseHistory })));
const SessionHistory = React.lazy(() => import('../ui/history/pages/index').then(m => ({ default: m.SessionHistory })));
const SearchHistory = React.lazy(() => import('../ui/history/pages/index').then(m => ({ default: m.SearchHistory })));
const AnalyticsPage = React.lazy(() => import('../ui/history/pages/index').then(m => ({ default: m.AnalyticsPage })));
const TimelinePage = React.lazy(() => import('../ui/history/pages/index').then(m => ({ default: m.TimelinePage })));
const ExportPage = React.lazy(() => import('../ui/history/pages/index').then(m => ({ default: m.ExportPage })));

/**
 * Popup Routes Configuration
 * Routes available in the popup context (limited scope)
 */
export const POPUP_ROUTES_CONFIG: ExtensionRouterConfig = {
  context: 'popup',
  basePath: '/',
  defaultRoute: '/',
  fallbackRoute: '/',
  enableDeepLinking: false, // Popups typically don't support deep linking
  enableBreadcrumbs: false, // Limited space in popup
  routes: [
    {
      path: '/',
      component: HomePage,
      title: 'TabKiller',
      description: 'Main popup interface',
      showInNavigation: false
    },
    {
      path: '/sessions',
      component: SessionsPage,
      title: 'Sessions',
      description: 'View and manage sessions',
      showInNavigation: true,
      icon: '📚'
    },
    {
      path: '/quick-actions',
      component: QuickActionsPage,
      title: 'Quick Actions',
      description: 'Perform quick actions',
      showInNavigation: true,
      icon: '⚡'
    }
  ]
};

/**
 * Options Routes Configuration
 * Full-featured routing for the options page
 */
export const OPTIONS_ROUTES_CONFIG: ExtensionRouterConfig = {
  context: 'options',
  basePath: '/options',
  defaultRoute: '/options/general',
  fallbackRoute: '/options/general',
  enableDeepLinking: true,
  enableBreadcrumbs: true,
  routes: [
    {
      path: '/options',
      component: OptionsOverview,
      title: 'Settings Overview',
      description: 'TabKiller settings overview',
      showInNavigation: false
    },
    {
      path: '/options/general',
      component: GeneralSettings,
      title: 'General',
      description: 'General extension settings',
      showInNavigation: true,
      icon: '⚙️'
    },
    {
      path: '/options/tracking',
      component: TrackingSettings,
      title: 'Tracking',
      description: 'Page and tab tracking settings',
      showInNavigation: true,
      icon: '📊'
    },
    {
      path: '/options/sessions',
      component: SessionSettings,
      title: 'Sessions',
      description: 'Session management settings',
      showInNavigation: true,
      icon: '📁'
    },
    {
      path: '/options/privacy',
      component: PrivacySettings,
      title: 'Privacy',
      description: 'Privacy and security settings',
      showInNavigation: true,
      icon: '🔒'
    },
    {
      path: '/options/sync',
      component: SyncSettings,
      title: 'Sync',
      description: 'Synchronization settings',
      showInNavigation: true,
      icon: '🔄'
    },
    {
      path: '/options/advanced',
      component: AdvancedSettings,
      title: 'Advanced',
      description: 'Advanced configuration options',
      showInNavigation: true,
      icon: '🔧'
    },
    {
      path: '/options/about',
      component: AboutPage,
      title: 'About',
      description: 'About TabKiller extension',
      showInNavigation: true,
      icon: 'ℹ️'
    }
  ]
};

/**
 * History Routes Configuration
 * Comprehensive routing for the history viewer
 */
export const HISTORY_ROUTES_CONFIG: ExtensionRouterConfig = {
  context: 'history',
  basePath: '/history',
  defaultRoute: '/history/browse',
  fallbackRoute: '/history/browse',
  enableDeepLinking: true,
  enableBreadcrumbs: true,
  routes: [
    {
      path: '/history',
      component: HistoryOverview,
      title: 'History Overview',
      description: 'Browsing history overview',
      showInNavigation: false
    },
    {
      path: '/history/browse',
      component: BrowseHistory,
      title: 'Browse',
      description: 'Browse browsing history',
      showInNavigation: true,
      icon: '🌐'
    },
    {
      path: '/history/sessions',
      component: SessionHistory,
      title: 'Sessions',
      description: 'View saved sessions',
      showInNavigation: true,
      icon: '📚'
    },
    {
      path: '/history/search',
      component: SearchHistory,
      title: 'Search',
      description: 'Search through history',
      showInNavigation: true,
      icon: '🔍'
    },
    {
      path: '/history/analytics',
      component: AnalyticsPage,
      title: 'Analytics',
      description: 'Browsing analytics and insights',
      showInNavigation: true,
      icon: '📈'
    },
    {
      path: '/history/timeline',
      component: TimelinePage,
      title: 'Timeline',
      description: 'Timeline view of browsing history',
      showInNavigation: true,
      icon: '📅'
    },
    {
      path: '/history/export',
      component: ExportPage,
      title: 'Export',
      description: 'Export history data',
      showInNavigation: true,
      icon: '📤'
    }
  ]
};

/**
 * Get router configuration for specific context
 */
export function getRouterConfig(context: string): ExtensionRouterConfig {
  switch (context) {
    case 'popup':
      return POPUP_ROUTES_CONFIG;
    case 'options':
      return OPTIONS_ROUTES_CONFIG;
    case 'history':
      return HISTORY_ROUTES_CONFIG;
    default:
      throw new Error(`Unknown extension context: ${context}`);
  }
}

/**
 * Get navigation items for specific context
 */
export function getNavigationItems(context: string): NavigationItem[] {
  const config = getRouterConfig(context);
  
  return config.routes
    .filter(route => route.showInNavigation)
    .map(route => ({
      id: route.path.replace(/[^a-zA-Z0-9]/g, '-'),
      label: route.title || route.path,
      path: route.path,
      icon: route.icon,
      description: route.description
    }));
}

/**
 * Extension-specific navigation helpers
 */
export const EXTENSION_NAVIGATION = {
  /**
   * Open options page from popup
   */
  openOptions: (section?: string) => {
    const url = chrome.runtime.getURL('options.html') + (section ? `#/options/${section}` : '');
    chrome.tabs.create({ url });
  },

  /**
   * Open history page from popup
   */
  openHistory: (view?: string) => {
    const url = chrome.runtime.getURL('history.html') + (view ? `#/history/${view}` : '');
    chrome.tabs.create({ url });
  },

  /**
   * Navigate within popup (limited)
   */
  navigatePopup: (path: string) => {
    // Popup navigation is handled by React Router internally
    // This is mainly for consistency with other contexts
    window.location.hash = path;
  }
};