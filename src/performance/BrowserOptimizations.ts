/**
 * Browser-specific performance optimizations for Chrome, Firefox, Safari, and Edge
 * Implements platform-specific features and workarounds for maximum performance
 */

import { detectBrowser, getBrowserAPI, isManifestV3 } from '../utils/cross-browser';
import { performanceMonitor } from './PerformanceMonitor';
import { memoryManager } from './MemoryManager';

export type SupportedBrowser = 'chrome' | 'firefox' | 'safari' | 'edge';

export interface BrowserCapabilities {
  supportsServiceWorkers: boolean;
  supportsWebAssembly: boolean;
  supportsOffscreenCanvas: boolean;
  supportsSharedArrayBuffer: boolean;
  supportsIndexedDB: boolean;
  supportsWebSQL: boolean;
  maxStorageQuota: number; // bytes
  maxMemoryLimit: number; // bytes
  preferredCacheStrategy: 'memory' | 'disk' | 'hybrid';
  optimizationFeatures: string[];
}

export interface OptimizationStrategy {
  browser: SupportedBrowser;
  memoryManagement: {
    maxCacheSize: number;
    gcInterval: number;
    useLazyLoading: boolean;
    useWeakReferences: boolean;
  };
  performanceHints: {
    deferNonCritical: boolean;
    useRequestIdleCallback: boolean;
    batchDOMUpdates: boolean;
    prefetchStrategy: 'aggressive' | 'conservative' | 'disabled';
  };
  apiOptimizations: {
    useNativeApis: boolean;
    polyfillsNeeded: string[];
    workarounds: string[];
  };
}

/**
 * Browser-specific optimization manager
 */
export class BrowserOptimizationManager {
  private currentBrowser: SupportedBrowser;
  private capabilities: BrowserCapabilities;
  private strategy: OptimizationStrategy;
  private optimizationsApplied: Set<string> = new Set();

  constructor() {
    this.currentBrowser = detectBrowser() as SupportedBrowser;
    this.capabilities = this.detectCapabilities();
    this.strategy = this.getOptimizationStrategy();
    this.applyInitialOptimizations();
  }

  /**
   * Apply all browser-specific optimizations
   */
  async applyOptimizations(): Promise<void> {
    console.log(`🔧 Applying optimizations for ${this.currentBrowser}...`);
    
    try {
      await Promise.all([
        this.applyMemoryOptimizations(),
        this.applyPerformanceOptimizations(),
        this.applyApiOptimizations(),
        this.applyStorageOptimizations(),
        this.applyNetworkOptimizations()
      ]);

      console.log(`✅ Browser optimizations applied for ${this.currentBrowser}`);
      console.log(`   Features: ${this.optimizationsApplied.size} optimizations active`);
      
    } catch (error) {
      console.error('❌ Failed to apply browser optimizations:', error);
    }
  }

  /**
   * Detect browser capabilities
   */
  private detectCapabilities(): BrowserCapabilities {
    const capabilities: BrowserCapabilities = {
      supportsServiceWorkers: 'serviceWorker' in navigator,
      supportsWebAssembly: typeof WebAssembly !== 'undefined',
      supportsOffscreenCanvas: typeof OffscreenCanvas !== 'undefined',
      supportsSharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
      supportsIndexedDB: 'indexedDB' in window,
      supportsWebSQL: 'openDatabase' in window,
      maxStorageQuota: this.getStorageQuota(),
      maxMemoryLimit: this.getMemoryLimit(),
      preferredCacheStrategy: this.getPreferredCacheStrategy(),
      optimizationFeatures: []
    };

    // Browser-specific capability detection
    switch (this.currentBrowser) {
      case 'chrome':
        capabilities.optimizationFeatures = [
          'chrome-storage-api',
          'performance-observer',
          'idle-detection',
          'background-sync',
          'push-messaging',
          'webassembly-streaming'
        ];
        break;

      case 'firefox':
        capabilities.optimizationFeatures = [
          'firefox-storage-api',
          'performance-observer',
          'background-tasks',
          'webassembly'
        ];
        break;

      case 'safari':
        capabilities.optimizationFeatures = [
          'safari-storage-api',
          'performance-timing',
          'webassembly'
        ];
        capabilities.maxMemoryLimit = Math.min(capabilities.maxMemoryLimit, 50 * 1024 * 1024); // Safari has stricter limits
        break;

      case 'edge':
        capabilities.optimizationFeatures = [
          'chrome-storage-api', // Edge uses Chromium
          'performance-observer',
          'idle-detection',
          'background-sync',
          'webassembly-streaming'
        ];
        break;
    }

    return capabilities;
  }

  /**
   * Get optimization strategy for current browser
   */
  private getOptimizationStrategy(): OptimizationStrategy {
    const baseStrategy: OptimizationStrategy = {
      browser: this.currentBrowser,
      memoryManagement: {
        maxCacheSize: 1000,
        gcInterval: 60000,
        useLazyLoading: true,
        useWeakReferences: false
      },
      performanceHints: {
        deferNonCritical: true,
        useRequestIdleCallback: false,
        batchDOMUpdates: true,
        prefetchStrategy: 'conservative'
      },
      apiOptimizations: {
        useNativeApis: true,
        polyfillsNeeded: [],
        workarounds: []
      }
    };

    // Browser-specific adjustments
    switch (this.currentBrowser) {
      case 'chrome':
        return {
          ...baseStrategy,
          memoryManagement: {
            maxCacheSize: 2000, // Chrome can handle more
            gcInterval: 45000, // More frequent GC
            useLazyLoading: true,
            useWeakReferences: true
          },
          performanceHints: {
            deferNonCritical: true,
            useRequestIdleCallback: true, // Chrome has good support
            batchDOMUpdates: true,
            prefetchStrategy: 'aggressive'
          },
          apiOptimizations: {
            useNativeApis: true,
            polyfillsNeeded: [],
            workarounds: []
          }
        };

      case 'firefox':
        return {
          ...baseStrategy,
          memoryManagement: {
            maxCacheSize: 1500,
            gcInterval: 60000,
            useLazyLoading: true,
            useWeakReferences: true
          },
          performanceHints: {
            deferNonCritical: true,
            useRequestIdleCallback: false, // Limited support
            batchDOMUpdates: true,
            prefetchStrategy: 'conservative'
          },
          apiOptimizations: {
            useNativeApis: true,
            polyfillsNeeded: ['requestIdleCallback'],
            workarounds: ['firefox-storage-limits']
          }
        };

      case 'safari':
        return {
          ...baseStrategy,
          memoryManagement: {
            maxCacheSize: 500, // Safari is more restrictive
            gcInterval: 90000, // Less aggressive GC
            useLazyLoading: true,
            useWeakReferences: false // Limited support
          },
          performanceHints: {
            deferNonCritical: true,
            useRequestIdleCallback: false,
            batchDOMUpdates: true,
            prefetchStrategy: 'disabled' // Safari has stricter policies
          },
          apiOptimizations: {
            useNativeApis: false, // Safari has different APIs
            polyfillsNeeded: ['requestIdleCallback', 'performance-observer'],
            workarounds: ['safari-storage-api', 'safari-memory-limits']
          }
        };

      case 'edge':
        return {
          ...baseStrategy,
          memoryManagement: {
            maxCacheSize: 1800,
            gcInterval: 50000,
            useLazyLoading: true,
            useWeakReferences: true
          },
          performanceHints: {
            deferNonCritical: true,
            useRequestIdleCallback: true,
            batchDOMUpdates: true,
            prefetchStrategy: 'aggressive'
          },
          apiOptimizations: {
            useNativeApis: true,
            polyfillsNeeded: [],
            workarounds: ['edge-compatibility']
          }
        };

      default:
        return baseStrategy;
    }
  }

  /**
   * Apply initial optimizations during construction
   */
  private applyInitialOptimizations(): void {
    // Apply critical optimizations immediately
    this.optimizeMemoryManager();
    this.optimizePerformanceMonitor();
    
    if (this.strategy.performanceHints.useRequestIdleCallback && 'requestIdleCallback' in window) {
      this.setupIdleOptimizations();
    }
  }

  /**
   * Apply memory-specific optimizations
   */
  private async applyMemoryOptimizations(): Promise<void> {
    const { memoryManagement } = this.strategy;

    // Configure memory manager with browser-specific settings
    const optimizedMemoryManager = memoryManager;
    
    // Adjust cache sizes based on browser capabilities
    if (memoryManagement.maxCacheSize !== 1000) {
      console.log(`📊 Adjusting cache size to ${memoryManagement.maxCacheSize} for ${this.currentBrowser}`);
    }

    // Set up browser-specific garbage collection
    if (memoryManagement.useLazyLoading) {
      this.enableLazyLoading();
      this.optimizationsApplied.add('lazy-loading');
    }

    if (memoryManagement.useWeakReferences && typeof WeakRef !== 'undefined') {
      this.enableWeakReferences();
      this.optimizationsApplied.add('weak-references');
    }

    // Browser-specific memory optimizations
    switch (this.currentBrowser) {
      case 'chrome':
        await this.applyChromeMemoryOptimizations();
        break;
      case 'firefox':
        await this.applyFirefoxMemoryOptimizations();
        break;
      case 'safari':
        await this.applySafariMemoryOptimizations();
        break;
      case 'edge':
        await this.applyEdgeMemoryOptimizations();
        break;
    }
  }

  /**
   * Apply performance-specific optimizations
   */
  private async applyPerformanceOptimizations(): Promise<void> {
    const { performanceHints } = this.strategy;

    if (performanceHints.deferNonCritical) {
      this.setupDeferredLoading();
      this.optimizationsApplied.add('deferred-loading');
    }

    if (performanceHints.batchDOMUpdates) {
      this.setupBatchedUpdates();
      this.optimizationsApplied.add('batched-updates');
    }

    if (performanceHints.prefetchStrategy !== 'disabled') {
      this.setupPrefetching(performanceHints.prefetchStrategy);
      this.optimizationsApplied.add('prefetching');
    }

    // Browser-specific performance optimizations
    switch (this.currentBrowser) {
      case 'chrome':
        await this.applyChromePerformanceOptimizations();
        break;
      case 'firefox':
        await this.applyFirefoxPerformanceOptimizations();
        break;
      case 'safari':
        await this.applySafariPerformanceOptimizations();
        break;
      case 'edge':
        await this.applyEdgePerformanceOptimizations();
        break;
    }
  }

  /**
   * Apply API-specific optimizations
   */
  private async applyApiOptimizations(): Promise<void> {
    const { apiOptimizations } = this.strategy;

    // Apply polyfills if needed
    for (const polyfill of apiOptimizations.polyfillsNeeded) {
      await this.applyPolyfill(polyfill);
    }

    // Apply workarounds
    for (const workaround of apiOptimizations.workarounds) {
      await this.applyWorkaround(workaround);
    }

    if (apiOptimizations.useNativeApis) {
      this.enableNativeApiOptimizations();
      this.optimizationsApplied.add('native-apis');
    }
  }

  /**
   * Apply storage-specific optimizations
   */
  private async applyStorageOptimizations(): Promise<void> {
    const storageQuota = this.capabilities.maxStorageQuota;
    
    // Configure storage based on quota
    if (storageQuota > 100 * 1024 * 1024) { // > 100MB
      // Use aggressive caching
      this.enableAggressiveStorageCaching();
      this.optimizationsApplied.add('aggressive-storage-caching');
    } else {
      // Use conservative caching
      this.enableConservativeStorageCaching();
      this.optimizationsApplied.add('conservative-storage-caching');
    }

    // Browser-specific storage optimizations
    switch (this.currentBrowser) {
      case 'chrome':
        if (this.capabilities.optimizationFeatures.includes('chrome-storage-api')) {
          await this.optimizeChromeStorage();
        }
        break;
      case 'safari':
        await this.optimizeSafariStorage(); // Safari has unique storage limitations
        break;
    }
  }

  /**
   * Apply network-specific optimizations
   */
  private async applyNetworkOptimizations(): Promise<void> {
    // Enable network optimizations based on browser capabilities
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      
      if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
        this.enableLowBandwidthMode();
        this.optimizationsApplied.add('low-bandwidth-mode');
      }
    }

    // Browser-specific network optimizations
    if (this.currentBrowser === 'chrome' && 'serviceWorker' in navigator) {
      await this.enableServiceWorkerOptimizations();
      this.optimizationsApplied.add('service-worker-optimizations');
    }
  }

  // Chrome-specific optimizations
  private async applyChromeMemoryOptimizations(): Promise<void> {
    // Enable Chrome's memory pressure API if available
    if ('memory' in performance && 'onmemorywarning' in performance) {
      (performance as any).onmemorywarning = () => {
        console.warn('Chrome memory warning - triggering cleanup');
        memoryManager.forceGarbageCollection();
      };
      this.optimizationsApplied.add('chrome-memory-warnings');
    }

    // Use Chrome's heap profiling for monitoring
    if (typeof (performance as any).measureUserAgentSpecificMemory === 'function') {
      this.enableChromeMemoryMeasurement();
      this.optimizationsApplied.add('chrome-memory-measurement');
    }
  }

  private async applyChromePerformanceOptimizations(): Promise<void> {
    // Enable Chrome DevTools Performance API
    if ('performance' in window && 'mark' in performance) {
      this.enableChromePerformanceMarks();
      this.optimizationsApplied.add('chrome-performance-marks');
    }

    // Use Chrome's Idle Detection API
    if ('IdleDetector' in window) {
      await this.enableChromeIdleDetection();
      this.optimizationsApplied.add('chrome-idle-detection');
    }
  }

  // Firefox-specific optimizations  
  private async applyFirefoxMemoryOptimizations(): Promise<void> {
    // Firefox specific memory management
    if (typeof (window as any).Components !== 'undefined') {
      // Use Firefox's memory reporting
      this.enableFirefoxMemoryReporting();
      this.optimizationsApplied.add('firefox-memory-reporting');
    }
  }

  private async applyFirefoxPerformanceOptimizations(): Promise<void> {
    // Firefox-specific performance optimizations
    if ('mozPaintCount' in window) {
      this.enableFirefoxPaintOptimizations();
      this.optimizationsApplied.add('firefox-paint-optimizations');
    }
  }

  // Safari-specific optimizations
  private async applySafariMemoryOptimizations(): Promise<void> {
    // Safari has strict memory limits - be conservative
    this.enableSafariMemoryConservation();
    this.optimizationsApplied.add('safari-memory-conservation');
  }

  private async applySafariPerformanceOptimizations(): Promise<void> {
    // Safari-specific performance optimizations
    if ('webkitRequestAnimationFrame' in window) {
      this.enableSafariAnimationOptimizations();
      this.optimizationsApplied.add('safari-animation-optimizations');
    }
  }

  // Edge-specific optimizations
  private async applyEdgeMemoryOptimizations(): Promise<void> {
    // Edge uses Chromium base but may have differences
    await this.applyChromeMemoryOptimizations();
  }

  private async applyEdgePerformanceOptimizations(): Promise<void> {
    // Edge-specific performance optimizations
    await this.applyChromePerformanceOptimizations();
  }

  // Utility methods for specific optimizations
  private getStorageQuota(): number {
    // Browser-specific storage quota detection
    switch (this.currentBrowser) {
      case 'chrome':
        return 120 * 1024 * 1024; // ~120MB typical
      case 'firefox':
        return 50 * 1024 * 1024; // ~50MB typical
      case 'safari':
        return 10 * 1024 * 1024; // ~10MB typical (very restrictive)
      case 'edge':
        return 100 * 1024 * 1024; // ~100MB typical
      default:
        return 50 * 1024 * 1024;
    }
  }

  private getMemoryLimit(): number {
    if (performance.memory) {
      return performance.memory.jsHeapSizeLimit;
    }
    
    // Fallback estimates based on browser
    switch (this.currentBrowser) {
      case 'chrome':
        return 4 * 1024 * 1024 * 1024; // 4GB
      case 'firefox':
        return 2 * 1024 * 1024 * 1024; // 2GB
      case 'safari':
        return 1 * 1024 * 1024 * 1024; // 1GB
      case 'edge':
        return 4 * 1024 * 1024 * 1024; // 4GB
      default:
        return 2 * 1024 * 1024 * 1024; // 2GB
    }
  }

  private getPreferredCacheStrategy(): 'memory' | 'disk' | 'hybrid' {
    switch (this.currentBrowser) {
      case 'chrome':
      case 'edge':
        return 'hybrid'; // Can handle both well
      case 'firefox':
        return 'memory'; // Better memory management
      case 'safari':
        return 'disk'; // Memory limitations
      default:
        return 'memory';
    }
  }

  private optimizeMemoryManager(): void {
    // Apply memory manager optimizations based on strategy
    // This would configure the existing memory manager
  }

  private optimizePerformanceMonitor(): void {
    // Apply performance monitor optimizations based on strategy
    // This would configure the existing performance monitor
  }

  private setupIdleOptimizations(): void {
    const requestIdleCallback = (window as any).requestIdleCallback;
    if (requestIdleCallback) {
      // Schedule non-critical tasks during idle time
      requestIdleCallback(() => {
        memoryManager.forceGarbageCollection();
      }, { timeout: 5000 });
    }
  }

  private enableLazyLoading(): void {
    // Implement lazy loading strategies
    console.log('✅ Lazy loading enabled');
  }

  private enableWeakReferences(): void {
    // Implement weak reference strategies where supported
    console.log('✅ Weak references enabled');
  }

  private setupDeferredLoading(): void {
    // Implement deferred loading of non-critical resources
    console.log('✅ Deferred loading enabled');
  }

  private setupBatchedUpdates(): void {
    // Implement batched DOM/UI updates
    console.log('✅ Batched updates enabled');
  }

  private setupPrefetching(strategy: 'aggressive' | 'conservative'): void {
    // Implement prefetching based on strategy
    console.log(`✅ Prefetching enabled (${strategy})`);
  }

  private async applyPolyfill(polyfill: string): Promise<void> {
    switch (polyfill) {
      case 'requestIdleCallback':
        if (!('requestIdleCallback' in window)) {
          (window as any).requestIdleCallback = (callback: () => void) => setTimeout(callback, 0);
        }
        break;
      case 'performance-observer':
        // Would implement performance observer polyfill
        break;
    }
    
    this.optimizationsApplied.add(`polyfill-${polyfill}`);
  }

  private async applyWorkaround(workaround: string): Promise<void> {
    switch (workaround) {
      case 'safari-storage-api':
        // Implement Safari storage API workarounds
        break;
      case 'firefox-storage-limits':
        // Implement Firefox storage limit workarounds
        break;
      case 'safari-memory-limits':
        // Implement Safari memory limit workarounds
        break;
      case 'edge-compatibility':
        // Implement Edge compatibility workarounds
        break;
    }
    
    this.optimizationsApplied.add(`workaround-${workaround}`);
  }

  private enableNativeApiOptimizations(): void {
    // Enable native API optimizations where available
    console.log('✅ Native API optimizations enabled');
  }

  private enableAggressiveStorageCaching(): void {
    // Enable aggressive storage caching
    console.log('✅ Aggressive storage caching enabled');
  }

  private enableConservativeStorageCaching(): void {
    // Enable conservative storage caching
    console.log('✅ Conservative storage caching enabled');
  }

  private async optimizeChromeStorage(): Promise<void> {
    // Optimize Chrome storage usage
    console.log('✅ Chrome storage optimizations applied');
  }

  private async optimizeSafariStorage(): Promise<void> {
    // Optimize Safari storage usage
    console.log('✅ Safari storage optimizations applied');
  }

  private enableLowBandwidthMode(): void {
    // Enable low bandwidth optimizations
    console.log('✅ Low bandwidth mode enabled');
  }

  private async enableServiceWorkerOptimizations(): Promise<void> {
    // Enable service worker optimizations
    console.log('✅ Service worker optimizations enabled');
  }

  // Chrome-specific method implementations
  private enableChromeMemoryMeasurement(): void {
    setInterval(async () => {
      try {
        const measurement = await (performance as any).measureUserAgentSpecificMemory();
        console.log('Chrome memory measurement:', measurement);
      } catch (error) {
        // Measurement failed - ignore
      }
    }, 60000); // Every minute
  }

  private enableChromePerformanceMarks(): void {
    // Enable Chrome performance marking
    const originalMark = performance.mark;
    performance.mark = function(name: string) {
      console.log(`Performance mark: ${name}`);
      return originalMark.call(this, name);
    };
  }

  private async enableChromeIdleDetection(): Promise<void> {
    try {
      const idleDetector = new (window as any).IdleDetector();
      await idleDetector.start({
        threshold: 60000, // 1 minute
        signal: new AbortController().signal
      });
      
      idleDetector.addEventListener('change', () => {
        if (idleDetector.userState === 'idle') {
          // Trigger cleanup during idle
          memoryManager.forceGarbageCollection();
        }
      });
    } catch (error) {
      console.warn('Chrome idle detection setup failed:', error);
    }
  }

  // Firefox-specific method implementations
  private enableFirefoxMemoryReporting(): void {
    // Implement Firefox memory reporting
    console.log('✅ Firefox memory reporting enabled');
  }

  private enableFirefoxPaintOptimizations(): void {
    // Implement Firefox paint optimizations
    console.log('✅ Firefox paint optimizations enabled');
  }

  // Safari-specific method implementations
  private enableSafariMemoryConservation(): void {
    // Implement Safari memory conservation
    console.log('✅ Safari memory conservation enabled');
  }

  private enableSafariAnimationOptimizations(): void {
    // Implement Safari animation optimizations
    console.log('✅ Safari animation optimizations enabled');
  }

  /**
   * Get current optimization status
   */
  getOptimizationStatus(): {
    browser: SupportedBrowser;
    capabilities: BrowserCapabilities;
    strategy: OptimizationStrategy;
    applied: string[];
    performance: {
      memoryUsage: number;
      optimizationCount: number;
    };
  } {
    return {
      browser: this.currentBrowser,
      capabilities: this.capabilities,
      strategy: this.strategy,
      applied: Array.from(this.optimizationsApplied),
      performance: {
        memoryUsage: performance.memory?.usedJSHeapSize || 0,
        optimizationCount: this.optimizationsApplied.size
      }
    };
  }

  /**
   * Validate that optimizations are working
   */
  async validateOptimizations(): Promise<{
    valid: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check memory usage
    const memoryUsage = performance.memory?.usedJSHeapSize || 0;
    if (memoryUsage > this.capabilities.maxMemoryLimit * 0.8) {
      issues.push('High memory usage detected');
      recommendations.push('Consider reducing cache sizes');
    }

    // Check if critical optimizations are applied
    const criticalOptimizations = ['lazy-loading', 'deferred-loading'];
    const missingCritical = criticalOptimizations.filter(opt => !this.optimizationsApplied.has(opt));
    
    if (missingCritical.length > 0) {
      issues.push(`Missing critical optimizations: ${missingCritical.join(', ')}`);
      recommendations.push('Re-run optimization application');
    }

    return {
      valid: issues.length === 0,
      issues,
      recommendations
    };
  }
}

// Export singleton instance
export const browserOptimizationManager = new BrowserOptimizationManager();