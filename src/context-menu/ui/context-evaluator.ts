/**
 * Menu Context Evaluator
 * Evaluates context rules for dynamic menu item visibility
 */

import {
  MenuContextEvaluator,
  ContextEvaluationResult,
  OrganizedMenuItem,
  MenuGroup,
  MenuRenderContext,
  ContextRule,
  ContextRuleType
} from './types';

/**
 * Custom rule evaluator function type
 */
type CustomRuleEvaluator = (rule: ContextRule, context: MenuRenderContext) => boolean;

/**
 * Menu context evaluator implementation
 */
export class MenuContextEvaluatorImpl implements MenuContextEvaluator {
  private customEvaluators = new Map<string, CustomRuleEvaluator>();

  constructor() {
    // Register default evaluators
    this.registerDefaultEvaluators();
  }

  /**
   * Evaluate context rules for an item
   */
  evaluateItem(item: OrganizedMenuItem, context: MenuRenderContext): ContextEvaluationResult {
    if (!item.contextRules || item.contextRules.length === 0) {
      return {
        visible: true,
        enabled: true,
        matchedRules: [],
        failedRules: []
      };
    }

    const matchedRules: ContextRule[] = [];
    const failedRules: ContextRule[] = [];
    let visible = true;
    let enabled = true;

    for (const rule of item.contextRules) {
      try {
        const ruleMatches = this.evaluateRule(rule, context);

        if (ruleMatches) {
          matchedRules.push(rule);

          // Apply rule effects
          switch (rule.condition) {
            case 'hide_when':
              visible = false;
              break;
            case 'disable_when':
              enabled = false;
              break;
            case 'show_when':
              // This rule matched, so continue showing
              break;
            case 'enable_when':
              // This rule matched, so continue enabling
              break;
          }
        } else {
          failedRules.push(rule);

          // Apply rule effects for non-matching rules
          switch (rule.condition) {
            case 'show_when':
              visible = false;
              break;
            case 'enable_when':
              enabled = false;
              break;
            case 'hide_when':
              // Rule didn't match, so don't hide
              break;
            case 'disable_when':
              // Rule didn't match, so don't disable
              break;
          }
        }
      } catch (error) {
        console.warn(`Error evaluating context rule for item '${item.id}':`, error);
        failedRules.push(rule);
      }
    }

    return {
      visible,
      enabled,
      matchedRules,
      failedRules
    };
  }

  /**
   * Evaluate context rules for a group
   */
  evaluateGroup(group: MenuGroup, context: MenuRenderContext): ContextEvaluationResult {
    // Groups have simpler context evaluation
    // For now, just check basic visibility and context matching
    
    let visible = group.visible;
    let enabled = group.enabled;

    // Check context compatibility
    if (group.contexts && group.contexts.length > 0) {
      const currentContext = this.determineCurrentContext(context);
      if (!group.contexts.includes('all') && !group.contexts.includes(currentContext)) {
        visible = false;
      }
    }

    return {
      visible,
      enabled,
      matchedRules: [],
      failedRules: []
    };
  }

  /**
   * Check if a context rule matches
   */
  evaluateRule(rule: ContextRule, context: MenuRenderContext): boolean {
    try {
      // Check for custom evaluator
      const customEvaluator = this.customEvaluators.get(rule.type);
      if (customEvaluator) {
        return customEvaluator(rule, context);
      }

      // Use built-in evaluators
      switch (rule.type) {
        case 'url':
          return this.evaluateUrlRule(rule, context);
        case 'domain':
          return this.evaluateDomainRule(rule, context);
        case 'tab_count':
          return this.evaluateTabCountRule(rule, context);
        case 'selection_exists':
          return this.evaluateSelectionRule(rule, context);
        case 'media_type':
          return this.evaluateMediaTypeRule(rule, context);
        case 'page_type':
          return this.evaluatePageTypeRule(rule, context);
        case 'extension_context':
          return this.evaluateExtensionContextRule(rule, context);
        case 'user_setting':
          return this.evaluateUserSettingRule(rule, context);
        case 'feature_enabled':
          return this.evaluateFeatureEnabledRule(rule, context);
        default:
          console.warn(`Unknown context rule type: ${rule.type}`);
          return true; // Default to showing if rule type is unknown
      }
    } catch (error) {
      console.warn(`Error evaluating context rule:`, error);
      return false;
    }
  }

  /**
   * Add custom rule evaluator
   */
  addCustomEvaluator(type: string, evaluator: CustomRuleEvaluator): void {
    this.customEvaluators.set(type, evaluator);
  }

  // Private helper methods

  private registerDefaultEvaluators(): void {
    // Register advanced context evaluators
    this.addCustomEvaluator('time_range', this.evaluateTimeRangeRule.bind(this));
    this.addCustomEvaluator('tab_state', this.evaluateTabStateRule.bind(this));
    this.addCustomEvaluator('window_state', this.evaluateWindowStateRule.bind(this));
    this.addCustomEvaluator('browser_info', this.evaluateBrowserInfoRule.bind(this));
    this.addCustomEvaluator('session_state', this.evaluateSessionStateRule.bind(this));
    this.addCustomEvaluator('performance', this.evaluatePerformanceRule.bind(this));
  }

  private determineCurrentContext(context: MenuRenderContext): string {
    // Determine the current browser context based on the render context
    if (context.pageUrl) {
      if (context.pageUrl.startsWith('chrome-extension://') || 
          context.pageUrl.startsWith('moz-extension://')) {
        return 'browser_action';
      }
      return 'page';
    }
    return 'all';
  }

  private evaluateUrlRule(rule: ContextRule, context: MenuRenderContext): boolean {
    if (!context.pageUrl || !rule.value) {
      return false;
    }

    const url = context.pageUrl;
    const pattern = rule.value;

    switch (rule.operator) {
      case 'equals':
        return url === pattern;
      case 'contains':
        return url.includes(pattern);
      case 'startsWith':
        return url.startsWith(pattern);
      case 'endsWith':
        return url.endsWith(pattern);
      case 'matches':
        try {
          const regex = new RegExp(pattern);
          return regex.test(url);
        } catch {
          return false;
        }
      case 'exists':
        return !!url;
      default:
        return url.includes(pattern);
    }
  }

  private evaluateDomainRule(rule: ContextRule, context: MenuRenderContext): boolean {
    if (!context.pageUrl || !rule.value) {
      return false;
    }

    try {
      const url = new URL(context.pageUrl);
      const domain = url.hostname;
      const pattern = rule.value;

      switch (rule.operator) {
        case 'equals':
          return domain === pattern;
        case 'contains':
          return domain.includes(pattern);
        case 'startsWith':
          return domain.startsWith(pattern);
        case 'endsWith':
          return domain.endsWith(pattern);
        case 'matches':
          try {
            const regex = new RegExp(pattern);
            return regex.test(domain);
          } catch {
            return false;
          }
        case 'exists':
          return !!domain;
        default:
          return domain.includes(pattern);
      }
    } catch {
      return false;
    }
  }

  private evaluateTabCountRule(rule: ContextRule, context: MenuRenderContext): boolean {
    const tabCount = context.tabCount || 0;
    const threshold = rule.value || 0;

    switch (rule.operator) {
      case 'equals':
        return tabCount === threshold;
      default:
        return tabCount >= threshold;
    }
  }

  private evaluateSelectionRule(rule: ContextRule, context: MenuRenderContext): boolean {
    const hasSelection = !!(context.selectionText && context.selectionText.trim().length > 0);
    
    switch (rule.operator) {
      case 'exists':
        return hasSelection;
      default:
        return hasSelection;
    }
  }

  private evaluateMediaTypeRule(rule: ContextRule, context: MenuRenderContext): boolean {
    if (!context.mediaType || !rule.value) {
      return false;
    }

    const mediaType = context.mediaType;
    const expectedType = rule.value;

    switch (rule.operator) {
      case 'equals':
        return mediaType === expectedType;
      case 'contains':
        return mediaType.includes(expectedType);
      case 'startsWith':
        return mediaType.startsWith(expectedType);
      case 'exists':
        return !!mediaType;
      default:
        return mediaType === expectedType;
    }
  }

  private evaluatePageTypeRule(rule: ContextRule, context: MenuRenderContext): boolean {
    if (!context.pageUrl || !rule.value) {
      return false;
    }

    const url = context.pageUrl;
    const expectedPageType = rule.value;

    // Determine page type from URL
    let pageType = 'regular';
    
    if (url.startsWith('chrome-extension://') || url.startsWith('moz-extension://')) {
      pageType = 'extension';
    } else if (url.startsWith('chrome://') || url.startsWith('about:')) {
      pageType = 'internal';
    } else if (url.startsWith('file://')) {
      pageType = 'local';
    } else if (url.startsWith('https://') || url.startsWith('http://')) {
      pageType = 'web';
    }

    switch (rule.operator) {
      case 'equals':
        return pageType === expectedPageType;
      case 'exists':
        return !!pageType;
      default:
        return pageType === expectedPageType;
    }
  }

  private evaluateExtensionContextRule(rule: ContextRule, context: MenuRenderContext): boolean {
    // Check if we're in an extension context
    const isExtensionContext = context.browserType === 'extension' ||
                              (context.pageUrl && (
                                context.pageUrl.startsWith('chrome-extension://') ||
                                context.pageUrl.startsWith('moz-extension://')
                              ));

    switch (rule.operator) {
      case 'exists':
        return isExtensionContext;
      default:
        return isExtensionContext;
    }
  }

  private evaluateUserSettingRule(rule: ContextRule, context: MenuRenderContext): boolean {
    if (!context.userSettings || !rule.value) {
      return false;
    }

    const settingPath = rule.value;
    const settingValue = this.getNestedProperty(context.userSettings, settingPath);

    switch (rule.operator) {
      case 'equals':
        return settingValue === (rule.value || true);
      case 'exists':
        return settingValue !== undefined && settingValue !== null;
      default:
        return !!settingValue;
    }
  }

  private evaluateFeatureEnabledRule(rule: ContextRule, context: MenuRenderContext): boolean {
    if (!context.userSettings || !rule.value) {
      return false;
    }

    const featureName = rule.value;
    
    // Check in nested settings structure
    const menuSettings = context.userSettings.ui?.menu;
    const generalSettings = context.userSettings.general;
    const privacySettings = context.userSettings.privacy;

    // Feature-specific checks
    switch (featureName) {
      case 'contextMenus':
        return menuSettings?.enableContextMenus !== false;
      
      case 'sessions':
        return generalSettings?.autoStartSessions !== false;
      
      case 'notifications':
        return generalSettings?.enableNotifications !== false;
      
      case 'analytics':
        return generalSettings?.enableAnalytics === true;
      
      case 'browserSync':
        return generalSettings?.enableBrowserSync !== false;
      
      case 'ssbSync':
        return privacySettings?.enableSSBSync === true;
      
      case 'dataEncryption':
        return privacySettings?.encryptData !== false;
      
      case 'incognito':
        return !privacySettings?.excludeIncognito;
      
      case 'shortcuts':
        return menuSettings?.showShortcuts !== false;
      
      case 'icons':
        return menuSettings?.showIcons !== false;
      
      case 'submenus':
        return menuSettings?.enableSubmenus !== false;
      
      default:
        // Generic feature check
        const features = context.userSettings.features || {};
        return features[featureName] === true;
    }
  }

  private getNestedProperty(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  // Advanced context rule evaluators

  private evaluateTimeRangeRule(rule: ContextRule, context: MenuRenderContext): boolean {
    if (!rule.value) return false;
    
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay(); // 0 = Sunday
    
    const timeRange = rule.value;
    
    if (typeof timeRange === 'string') {
      // Simple hour range like "09-17" for business hours
      const [start, end] = timeRange.split('-').map(h => parseInt(h, 10));
      if (start && end) {
        return currentHour >= start && currentHour <= end;
      }
    } else if (typeof timeRange === 'object') {
      // Complex time range with days and hours
      const { days, startHour, endHour } = timeRange;
      
      if (days && !days.includes(currentDay)) {
        return false;
      }
      
      if (startHour !== undefined && endHour !== undefined) {
        return currentHour >= startHour && currentHour <= endHour;
      }
    }
    
    return true;
  }

  private evaluateTabStateRule(rule: ContextRule, context: MenuRenderContext): boolean {
    if (!rule.value) return false;
    
    const tabState = rule.value;
    
    switch (tabState) {
      case 'multiple':
        return context.tabCount > 1;
      case 'single':
        return context.tabCount === 1;
      case 'many':
        return context.tabCount > 5;
      case 'few':
        return context.tabCount <= 5;
      default:
        return true;
    }
  }

  private evaluateWindowStateRule(rule: ContextRule, context: MenuRenderContext): boolean {
    if (!rule.value || typeof window === 'undefined') return false;
    
    const windowState = rule.value;
    
    switch (windowState) {
      case 'focused':
        return document.hasFocus();
      case 'visible':
        return document.visibilityState === 'visible';
      case 'fullscreen':
        return document.fullscreenElement !== null;
      case 'maximized':
        return window.screen.availWidth === window.outerWidth && 
               window.screen.availHeight === window.outerHeight;
      default:
        return true;
    }
  }

  private evaluateBrowserInfoRule(rule: ContextRule, context: MenuRenderContext): boolean {
    if (!rule.value) return false;
    
    const browserInfo = rule.value;
    const userAgent = navigator.userAgent.toLowerCase();
    
    switch (browserInfo) {
      case 'chrome':
        return userAgent.includes('chrome') && !userAgent.includes('edge');
      case 'firefox':
        return userAgent.includes('firefox');
      case 'safari':
        return userAgent.includes('safari') && !userAgent.includes('chrome');
      case 'edge':
        return userAgent.includes('edge');
      case 'mobile':
        return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
      case 'desktop':
        return !/android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
      default:
        return userAgent.includes(browserInfo);
    }
  }

  private evaluateSessionStateRule(rule: ContextRule, context: MenuRenderContext): boolean {
    if (!rule.value || !context.userSettings) return false;
    
    const sessionState = rule.value;
    const sessionSettings = context.userSettings.general;
    
    switch (sessionState) {
      case 'active':
        // This would need to be provided by session context
        return sessionSettings?.autoStartSessions === true;
      case 'tracking_enabled':
        return sessionSettings?.autoStartSessions !== false;
      case 'sync_enabled':
        return context.userSettings.privacy?.enableSSBSync === true;
      default:
        return true;
    }
  }

  private evaluatePerformanceRule(rule: ContextRule, context: MenuRenderContext): boolean {
    if (!rule.value || typeof performance === 'undefined') return false;
    
    const perfRule = rule.value;
    
    switch (perfRule) {
      case 'low_memory':
        // Estimate based on available memory (if supported)
        const memory = (navigator as any).deviceMemory;
        return memory && memory <= 4; // 4GB or less
        
      case 'slow_connection':
        const connection = (navigator as any).connection;
        if (connection) {
          return connection.effectiveType === 'slow-2g' || 
                 connection.effectiveType === '2g' ||
                 connection.downlink < 1;
        }
        return false;
        
      case 'high_cpu':
        // This would need more sophisticated measurement
        return false; // Placeholder
        
      case 'battery_low':
        const battery = (navigator as any).battery;
        if (battery) {
          return battery.level < 0.2; // Less than 20%
        }
        return false;
        
      default:
        return true;
    }
  }
}

/**
 * Create a new menu context evaluator
 */
export function createMenuContextEvaluator(): MenuContextEvaluator {
  return new MenuContextEvaluatorImpl();
}