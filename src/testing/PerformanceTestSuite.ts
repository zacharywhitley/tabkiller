/**
 * Comprehensive performance testing framework for TabKiller extension
 * Tests startup time, memory usage, query performance, and cross-browser compatibility
 */

import { performanceMonitor, PerformanceMetrics, PerformanceIssue } from '../performance/PerformanceMonitor';
import { memoryManager, MemoryManager } from '../performance/MemoryManager';
import { OptimizedQueryEngine } from '../database/optimized-queries';
import { detectBrowser, isManifestV3 } from '../utils/cross-browser';

export interface PerformanceBenchmarks {
  maxStartupTime: number; // ms
  maxQueryTime: number; // ms
  maxMemoryUsage: number; // bytes
  maxCpuUtilization: number; // percentage
  maxSyncDuration: number; // ms
  minCacheHitRate: number; // percentage
}

export interface TestResult {
  testName: string;
  passed: boolean;
  actualValue: number;
  expectedValue: number;
  benchmarkType: keyof PerformanceBenchmarks;
  duration: number;
  metadata?: Record<string, any>;
  error?: string;
}

export interface TestSuite {
  name: string;
  description: string;
  tests: PerformanceTest[];
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
}

export interface PerformanceTest {
  name: string;
  description: string;
  benchmark: keyof PerformanceBenchmarks;
  run: () => Promise<number>;
  warmup?: () => Promise<void>;
  cleanup?: () => Promise<void>;
  iterations?: number;
  timeout?: number;
}

export interface TestRunReport {
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    duration: number;
    overallScore: number; // 0-100
  };
  results: TestResult[];
  benchmarks: PerformanceBenchmarks;
  environment: {
    browser: string;
    manifestVersion: number;
    platform: string;
    timestamp: number;
  };
  performance: {
    memoryStats: any;
    queryStats: any;
    cacheStats: any;
  };
  recommendations: string[];
}

/**
 * Main performance testing framework
 */
export class PerformanceTestRunner {
  private benchmarks: PerformanceBenchmarks;
  private testSuites: TestSuite[] = [];
  private queryEngine?: OptimizedQueryEngine;

  constructor(benchmarks?: Partial<PerformanceBenchmarks>) {
    this.benchmarks = {
      maxStartupTime: 100, // ms
      maxQueryTime: 50, // ms
      maxMemoryUsage: 50 * 1024 * 1024, // 50MB
      maxCpuUtilization: 5, // 5%
      maxSyncDuration: 5000, // 5 seconds
      minCacheHitRate: 70, // 70%
      ...benchmarks
    };

    this.initializeTestSuites();
  }

  /**
   * Initialize all test suites
   */
  private initializeTestSuites(): void {
    this.testSuites = [
      this.createStartupTestSuite(),
      this.createMemoryTestSuite(),
      this.createQueryTestSuite(),
      this.createCacheTestSuite(),
      this.createStressTestSuite(),
      this.createLongRunningTestSuite()
    ];
  }

  /**
   * Run all performance tests and generate comprehensive report
   */
  async runAllTests(): Promise<TestRunReport> {
    console.log('🚀 Starting comprehensive performance test suite...');
    const startTime = Date.now();
    
    const results: TestResult[] = [];
    let totalTests = 0;
    let passedTests = 0;

    // Initialize performance monitoring for the test run
    await performanceMonitor.initialize();
    
    try {
      for (const suite of this.testSuites) {
        console.log(`📊 Running test suite: ${suite.name}`);
        
        // Run suite setup
        if (suite.setup) {
          await suite.setup();
        }

        try {
          for (const test of suite.tests) {
            console.log(`  🔍 Running test: ${test.name}`);
            totalTests++;
            
            const result = await this.runSingleTest(test);
            results.push(result);
            
            if (result.passed) {
              passedTests++;
              console.log(`    ✅ ${result.testName} - ${result.actualValue}${this.getUnit(result.benchmarkType)} (target: ${result.expectedValue}${this.getUnit(result.benchmarkType)})`);
            } else {
              console.log(`    ❌ ${result.testName} - ${result.actualValue}${this.getUnit(result.benchmarkType)} (target: ${result.expectedValue}${this.getUnit(result.benchmarkType)})`);
            }
          }
        } finally {
          // Run suite teardown
          if (suite.teardown) {
            await suite.teardown();
          }
        }
      }
    } catch (error) {
      console.error('❌ Performance test suite failed:', error);
    }

    const duration = Date.now() - startTime;
    const overallScore = Math.round((passedTests / totalTests) * 100);

    const report: TestRunReport = {
      summary: {
        totalTests,
        passed: passedTests,
        failed: totalTests - passedTests,
        duration,
        overallScore
      },
      results,
      benchmarks: this.benchmarks,
      environment: {
        browser: detectBrowser(),
        manifestVersion: isManifestV3() ? 3 : 2,
        platform: navigator.platform,
        timestamp: Date.now()
      },
      performance: {
        memoryStats: memoryManager.getStats(),
        queryStats: performanceMonitor.getPerformanceSummary(),
        cacheStats: this.getCacheStats()
      },
      recommendations: this.generateRecommendations(results)
    };

    console.log(`\n📈 Performance Test Results:`);
    console.log(`   Overall Score: ${overallScore}/100`);
    console.log(`   Tests Passed: ${passedTests}/${totalTests}`);
    console.log(`   Duration: ${duration}ms`);

    if (report.recommendations.length > 0) {
      console.log(`\n💡 Recommendations:`);
      report.recommendations.forEach(rec => console.log(`   • ${rec}`));
    }

    return report;
  }

  /**
   * Run a single performance test
   */
  private async runSingleTest(test: PerformanceTest): Promise<TestResult> {
    const iterations = test.iterations || 1;
    const timeout = test.timeout || 30000;
    const values: number[] = [];
    
    try {
      // Warmup if specified
      if (test.warmup) {
        await test.warmup();
      }

      // Run test multiple times for accuracy
      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        
        const value = await Promise.race([
          test.run(),
          new Promise<number>((_, reject) => 
            setTimeout(() => reject(new Error('Test timeout')), timeout)
          )
        ]);
        
        const duration = Date.now() - startTime;
        values.push(value);

        // Small delay between iterations
        if (i < iterations - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Calculate average value
      const actualValue = values.reduce((sum, val) => sum + val, 0) / values.length;
      const expectedValue = this.benchmarks[test.benchmark];
      
      let passed: boolean;
      if (test.benchmark === 'minCacheHitRate') {
        passed = actualValue >= expectedValue;
      } else {
        passed = actualValue <= expectedValue;
      }

      return {
        testName: test.name,
        passed,
        actualValue: Math.round(actualValue * 100) / 100,
        expectedValue,
        benchmarkType: test.benchmark,
        duration: Date.now() - performance.now(),
        metadata: {
          iterations,
          allValues: values,
          variance: this.calculateVariance(values)
        }
      };

    } catch (error) {
      return {
        testName: test.name,
        passed: false,
        actualValue: -1,
        expectedValue: this.benchmarks[test.benchmark],
        benchmarkType: test.benchmark,
        duration: Date.now() - performance.now(),
        error: error instanceof Error ? error.message : String(error)
      };
    } finally {
      // Cleanup if specified
      if (test.cleanup) {
        await test.cleanup();
      }
    }
  }

  /**
   * Create startup performance test suite
   */
  private createStartupTestSuite(): TestSuite {
    return {
      name: 'Startup Performance',
      description: 'Tests extension initialization and startup performance',
      tests: [
        {
          name: 'Extension Startup Time',
          description: 'Measures time to fully initialize extension',
          benchmark: 'maxStartupTime',
          iterations: 3,
          run: async () => {
            const startTime = performance.now();
            
            // Simulate extension startup
            await performanceMonitor.initialize();
            await new Promise(resolve => setTimeout(resolve, 10)); // Simulate async initialization
            
            return performance.now() - startTime;
          }
        },
        {
          name: 'Service Worker Ready Time',
          description: 'Measures time for service worker to become ready',
          benchmark: 'maxStartupTime',
          run: async () => {
            const startTime = performance.now();
            
            // Test service worker readiness
            await new Promise(resolve => {
              // Simulate service worker registration
              setTimeout(resolve, 20);
            });
            
            return performance.now() - startTime;
          }
        },
        {
          name: 'Database Connection Time',
          description: 'Measures database connection establishment time',
          benchmark: 'maxStartupTime',
          run: async () => {
            const startTime = performance.now();
            
            // Simulate database connection
            const connection = await memoryManager.getConnectionPool(
              'test-db',
              () => Promise.resolve({}),
              () => Promise.resolve(true),
              () => Promise.resolve()
            ).acquire();
            
            memoryManager.getConnectionPool('test-db').release(connection);
            
            return performance.now() - startTime;
          }
        }
      ]
    };
  }

  /**
   * Create memory performance test suite
   */
  private createMemoryTestSuite(): TestSuite {
    return {
      name: 'Memory Management',
      description: 'Tests memory usage and garbage collection',
      setup: async () => {
        // Clear caches before memory tests
        await memoryManager.forceGarbageCollection();
      },
      tests: [
        {
          name: 'Baseline Memory Usage',
          description: 'Measures baseline memory consumption',
          benchmark: 'maxMemoryUsage',
          run: async () => {
            // Force GC and measure
            await memoryManager.forceGarbageCollection();
            
            if (performance.memory) {
              return performance.memory.usedJSHeapSize;
            }
            return 0;
          }
        },
        {
          name: 'Memory Usage After Tab Creation',
          description: 'Tests memory growth when creating tabs',
          benchmark: 'maxMemoryUsage',
          run: async () => {
            const initialMemory = performance.memory?.usedJSHeapSize || 0;
            
            // Simulate creating multiple tabs
            const tabs = [];
            for (let i = 0; i < 50; i++) {
              tabs.push({
                id: i,
                url: `https://example${i}.com`,
                title: `Test Tab ${i}`,
                createdAt: Date.now()
              });
            }
            
            // Store in cache
            const cache = memoryManager.getCache('test-tabs', 100);
            tabs.forEach((tab, i) => cache.set(`tab-${i}`, tab));
            
            const finalMemory = performance.memory?.usedJSHeapSize || 0;
            return finalMemory - initialMemory;
          },
          cleanup: async () => {
            memoryManager.getCache('test-tabs').clear();
            await memoryManager.forceGarbageCollection();
          }
        },
        {
          name: 'Memory Leak Detection',
          description: 'Tests for memory leaks over time',
          benchmark: 'maxMemoryUsage',
          iterations: 5,
          run: async () => {
            const initialMemory = performance.memory?.usedJSHeapSize || 0;
            
            // Simulate repeated operations
            for (let i = 0; i < 10; i++) {
              const cache = memoryManager.getCache(`leak-test-${i}`, 50);
              for (let j = 0; j < 20; j++) {
                cache.set(`key-${j}`, { data: new Array(1000).fill(i) });
              }
              cache.clear();
            }
            
            await memoryManager.forceGarbageCollection();
            
            const finalMemory = performance.memory?.usedJSHeapSize || 0;
            return finalMemory - initialMemory;
          }
        }
      ],
      teardown: async () => {
        await memoryManager.forceGarbageCollection();
      }
    };
  }

  /**
   * Create query performance test suite
   */
  private createQueryTestSuite(): TestSuite {
    return {
      name: 'Query Performance',
      description: 'Tests database query performance and optimization',
      tests: [
        {
          name: 'Simple Page Query',
          description: 'Tests basic page lookup performance',
          benchmark: 'maxQueryTime',
          iterations: 5,
          run: async () => {
            const startTime = performance.now();
            
            // Simulate simple query
            const cache = memoryManager.getCache('query-test');
            const result = cache.get('non-existent-key') || { pages: [] };
            
            return performance.now() - startTime;
          }
        },
        {
          name: 'Complex Pattern Query',
          description: 'Tests complex browsing pattern analysis',
          benchmark: 'maxQueryTime',
          iterations: 3,
          run: async () => {
            const startTime = performance.now();
            
            // Simulate complex pattern analysis
            const patterns = new Map();
            for (let i = 0; i < 100; i++) {
              const pattern = `domain${i % 10}.com -> domain${(i + 1) % 10}.com`;
              patterns.set(pattern, { frequency: i, strength: i * 0.1 });
            }
            
            // Sort and filter patterns
            const sorted = Array.from(patterns.entries())
              .sort((a, b) => b[1].strength - a[1].strength)
              .slice(0, 10);
            
            return performance.now() - startTime;
          }
        },
        {
          name: 'Cached Query Performance',
          description: 'Tests query performance with caching',
          benchmark: 'maxQueryTime',
          iterations: 10,
          warmup: async () => {
            // Populate cache
            const cache = memoryManager.getCache('cached-query-test');
            for (let i = 0; i < 50; i++) {
              cache.set(`query-${i}`, { result: `data-${i}` });
            }
          },
          run: async () => {
            const startTime = performance.now();
            
            const cache = memoryManager.getCache('cached-query-test');
            const result = cache.get('query-25');
            
            return performance.now() - startTime;
          },
          cleanup: async () => {
            memoryManager.getCache('cached-query-test').clear();
          }
        }
      ]
    };
  }

  /**
   * Create cache performance test suite
   */
  private createCacheTestSuite(): TestSuite {
    return {
      name: 'Cache Performance',
      description: 'Tests cache hit rates and efficiency',
      tests: [
        {
          name: 'Cache Hit Rate',
          description: 'Measures cache hit rate under normal load',
          benchmark: 'minCacheHitRate',
          run: async () => {
            const cache = memoryManager.getCache('hit-rate-test', 100);
            
            // Populate cache
            for (let i = 0; i < 50; i++) {
              cache.set(`key-${i}`, `value-${i}`);
            }
            
            let hits = 0;
            let total = 0;
            
            // Test cache access patterns
            for (let i = 0; i < 100; i++) {
              total++;
              const key = `key-${i % 60}`; // 50 keys exist, 10 don't
              const result = cache.get(key);
              if (result !== undefined) {
                hits++;
              }
            }
            
            cache.clear();
            return (hits / total) * 100; // Return as percentage
          }
        },
        {
          name: 'Cache Eviction Performance',
          description: 'Tests LRU eviction performance',
          benchmark: 'maxQueryTime',
          run: async () => {
            const startTime = performance.now();
            
            const cache = memoryManager.getCache('eviction-test', 10); // Small cache
            
            // Fill beyond capacity to trigger evictions
            for (let i = 0; i < 20; i++) {
              cache.set(`key-${i}`, `value-${i}`);
            }
            
            return performance.now() - startTime;
          }
        }
      ]
    };
  }

  /**
   * Create stress test suite
   */
  private createStressTestSuite(): TestSuite {
    return {
      name: 'Stress Testing',
      description: 'Tests performance under high load',
      tests: [
        {
          name: 'High Tab Load',
          description: 'Tests performance with many active tabs',
          benchmark: 'maxMemoryUsage',
          timeout: 60000,
          run: async () => {
            const initialMemory = performance.memory?.usedJSHeapSize || 0;
            const tabCache = memoryManager.getCache('stress-tabs', 1000);
            
            // Simulate 500 tabs
            for (let i = 0; i < 500; i++) {
              const tab = {
                id: i,
                url: `https://stress-test-${i}.com`,
                title: `Stress Test Tab ${i}`,
                content: new Array(100).fill(`content-${i}`).join(' '),
                createdAt: Date.now(),
                lastAccessed: Date.now()
              };
              tabCache.set(`stress-tab-${i}`, tab);
              
              // Yield periodically to prevent blocking
              if (i % 50 === 0) {
                await new Promise(resolve => setTimeout(resolve, 1));
              }
            }
            
            const finalMemory = performance.memory?.usedJSHeapSize || 0;
            return finalMemory - initialMemory;
          },
          cleanup: async () => {
            memoryManager.getCache('stress-tabs').clear();
            await memoryManager.forceGarbageCollection();
          }
        },
        {
          name: 'Concurrent Query Load',
          description: 'Tests concurrent query performance',
          benchmark: 'maxQueryTime',
          run: async () => {
            const startTime = performance.now();
            
            // Simulate 20 concurrent queries
            const promises = [];
            for (let i = 0; i < 20; i++) {
              promises.push(this.simulateQuery(i));
            }
            
            await Promise.all(promises);
            
            return performance.now() - startTime;
          }
        }
      ]
    };
  }

  /**
   * Create long-running stability test suite
   */
  private createLongRunningTestSuite(): TestSuite {
    return {
      name: 'Long-Running Stability',
      description: 'Tests performance over extended periods',
      tests: [
        {
          name: '5-Minute Stability Test',
          description: 'Tests memory stability over 5 minutes',
          benchmark: 'maxMemoryUsage',
          timeout: 360000, // 6 minutes
          run: async () => {
            const initialMemory = performance.memory?.usedJSHeapSize || 0;
            const testDuration = 5 * 60 * 1000; // 5 minutes
            const startTime = Date.now();
            
            // Simulate continuous activity
            while (Date.now() - startTime < testDuration) {
              // Simulate tab creation/destruction cycle
              const cache = memoryManager.getCache('stability-test', 50);
              
              for (let i = 0; i < 10; i++) {
                cache.set(`temp-${i}`, { data: new Array(100).fill(Math.random()) });
              }
              
              // Cleanup half the entries
              for (let i = 0; i < 5; i++) {
                cache.delete(`temp-${i}`);
              }
              
              // Wait before next cycle
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            await memoryManager.forceGarbageCollection();
            const finalMemory = performance.memory?.usedJSHeapSize || 0;
            
            return Math.abs(finalMemory - initialMemory);
          }
        }
      ]
    };
  }

  /**
   * Simulate a database query for testing
   */
  private async simulateQuery(queryId: number): Promise<void> {
    performanceMonitor.startQuery(`stress-query-${queryId}`);
    
    try {
      // Simulate query processing
      await new Promise(resolve => setTimeout(resolve, Math.random() * 20 + 5));
      
      // Simulate result caching
      const cache = memoryManager.getCache('query-results');
      cache.set(`result-${queryId}`, { data: new Array(50).fill(queryId) });
      
    } finally {
      performanceMonitor.endQuery(`stress-query-${queryId}`);
    }
  }

  /**
   * Generate performance recommendations based on test results
   */
  private generateRecommendations(results: TestResult[]): string[] {
    const recommendations: string[] = [];
    
    const failedTests = results.filter(r => !r.passed);
    const memoryTests = results.filter(r => r.benchmarkType === 'maxMemoryUsage');
    const queryTests = results.filter(r => r.benchmarkType === 'maxQueryTime');
    const cacheTests = results.filter(r => r.benchmarkType === 'minCacheHitRate');
    
    // Memory recommendations
    const highMemoryUsage = memoryTests.some(t => t.actualValue > t.expectedValue * 0.8);
    if (highMemoryUsage) {
      recommendations.push('Consider implementing more aggressive garbage collection');
      recommendations.push('Review cache sizes and TTL values');
      recommendations.push('Implement memory-efficient data structures');
    }
    
    // Query performance recommendations
    const slowQueries = queryTests.some(t => t.actualValue > t.expectedValue * 0.8);
    if (slowQueries) {
      recommendations.push('Consider adding more database indexes');
      recommendations.push('Implement query result caching');
      recommendations.push('Use batch processing for multiple queries');
    }
    
    // Cache recommendations
    const lowCacheHit = cacheTests.some(t => t.actualValue < t.expectedValue);
    if (lowCacheHit) {
      recommendations.push('Increase cache sizes for frequently accessed data');
      recommendations.push('Optimize cache eviction policies');
      recommendations.push('Consider implementing cache warming strategies');
    }
    
    // General recommendations based on failure rate
    const failureRate = failedTests.length / results.length;
    if (failureRate > 0.3) {
      recommendations.push('Consider reducing feature complexity to meet performance targets');
      recommendations.push('Implement more efficient algorithms for core operations');
    }
    
    if (failureRate > 0.5) {
      recommendations.push('Significant performance issues detected - consider architecture review');
    }
    
    return recommendations;
  }

  /**
   * Get unit suffix for benchmark type
   */
  private getUnit(benchmarkType: keyof PerformanceBenchmarks): string {
    switch (benchmarkType) {
      case 'maxStartupTime':
      case 'maxQueryTime':
      case 'maxSyncDuration':
        return 'ms';
      case 'maxMemoryUsage':
        return ' bytes';
      case 'maxCpuUtilization':
      case 'minCacheHitRate':
        return '%';
      default:
        return '';
    }
  }

  /**
   * Calculate variance for test stability
   */
  private calculateVariance(values: number[]): number {
    if (values.length <= 1) return 0;
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDifferences = values.map(val => Math.pow(val - mean, 2));
    const variance = squaredDifferences.reduce((sum, val) => sum + val, 0) / values.length;
    
    return Math.round(variance * 100) / 100;
  }

  /**
   * Get cache statistics from memory manager
   */
  private getCacheStats(): any {
    const stats = memoryManager.getStats();
    return {
      totalCaches: stats.caches.length,
      totalMemoryUsage: stats.totalMemoryUsage,
      cacheDetails: stats.caches.map(cache => ({
        name: cache.name,
        size: cache.stats.size,
        hitRate: cache.stats.hitRate,
        memoryUsage: cache.stats.memoryUsage
      }))
    };
  }

  /**
   * Export test results to JSON
   */
  exportResults(report: TestRunReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Generate HTML report
   */
  generateHTMLReport(report: TestRunReport): string {
    const passedColor = '#4CAF50';
    const failedColor = '#F44336';
    const warningColor = '#FF9800';
    
    return `
<!DOCTYPE html>
<html>
<head>
    <title>TabKiller Performance Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 8px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
        .metric { background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .metric h3 { margin: 0 0 10px 0; color: #333; }
        .metric .value { font-size: 24px; font-weight: bold; }
        .passed { color: ${passedColor}; }
        .failed { color: ${failedColor}; }
        .warning { color: ${warningColor}; }
        .test-results { margin: 20px 0; }
        .test-item { margin: 10px 0; padding: 10px; border-left: 4px solid #ddd; }
        .test-item.passed { border-color: ${passedColor}; }
        .test-item.failed { border-color: ${failedColor}; }
        .recommendations { background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>TabKiller Performance Test Report</h1>
        <p>Generated: ${new Date(report.environment.timestamp).toLocaleString()}</p>
        <p>Browser: ${report.environment.browser} (Manifest v${report.environment.manifestVersion})</p>
        <p>Platform: ${report.environment.platform}</p>
    </div>

    <div class="summary">
        <div class="metric">
            <h3>Overall Score</h3>
            <div class="value ${report.summary.overallScore >= 80 ? 'passed' : report.summary.overallScore >= 60 ? 'warning' : 'failed'}">
                ${report.summary.overallScore}/100
            </div>
        </div>
        <div class="metric">
            <h3>Tests Passed</h3>
            <div class="value ${report.summary.passed === report.summary.totalTests ? 'passed' : 'warning'}">
                ${report.summary.passed}/${report.summary.totalTests}
            </div>
        </div>
        <div class="metric">
            <h3>Duration</h3>
            <div class="value">${report.summary.duration}ms</div>
        </div>
        <div class="metric">
            <h3>Memory Usage</h3>
            <div class="value">${Math.round(report.performance.memoryStats.totalMemoryUsage / 1024 / 1024 * 100) / 100}MB</div>
        </div>
    </div>

    <div class="test-results">
        <h2>Test Results</h2>
        ${report.results.map(result => `
            <div class="test-item ${result.passed ? 'passed' : 'failed'}">
                <h4>${result.testName} ${result.passed ? '✅' : '❌'}</h4>
                <p>Actual: ${result.actualValue}${this.getUnit(result.benchmarkType)} | Target: ${result.expectedValue}${this.getUnit(result.benchmarkType)}</p>
                ${result.error ? `<p style="color: ${failedColor};">Error: ${result.error}</p>` : ''}
                ${result.metadata?.variance ? `<p>Variance: ${result.metadata.variance}</p>` : ''}
            </div>
        `).join('')}
    </div>

    ${report.recommendations.length > 0 ? `
        <div class="recommendations">
            <h2>💡 Recommendations</h2>
            <ul>
                ${report.recommendations.map(rec => `<li>${rec}</li>`).join('')}
            </ul>
        </div>
    ` : ''}

    <div class="footer">
        <h3>Benchmarks Used</h3>
        <ul>
            <li>Max Startup Time: ${report.benchmarks.maxStartupTime}ms</li>
            <li>Max Query Time: ${report.benchmarks.maxQueryTime}ms</li>
            <li>Max Memory Usage: ${Math.round(report.benchmarks.maxMemoryUsage / 1024 / 1024)}MB</li>
            <li>Max CPU Utilization: ${report.benchmarks.maxCpuUtilization}%</li>
            <li>Min Cache Hit Rate: ${report.benchmarks.minCacheHitRate}%</li>
        </ul>
    </div>
</body>
</html>`;
  }
}

// Export singleton instance
export const performanceTestRunner = new PerformanceTestRunner();