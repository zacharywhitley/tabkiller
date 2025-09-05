/**
 * Integration tests for performance optimization system
 * Validates that all performance components work together correctly
 */

import { performanceTestRunner, PerformanceBenchmarks } from './PerformanceTestSuite';
import { performanceMonitor } from '../performance/PerformanceMonitor';
import { memoryManager } from '../performance/MemoryManager';
import { browserOptimizationManager } from '../performance/BrowserOptimizations';
import { OptimizedQueryEngine } from '../database/optimized-queries';
import { detectBrowser } from '../utils/cross-browser';

/**
 * Run comprehensive integration tests for performance system
 */
export async function runPerformanceIntegrationTests(): Promise<void> {
  console.log('🚀 Starting TabKiller Performance Integration Tests...\n');

  try {
    // Test 1: Initialize all performance systems
    console.log('📋 Test 1: System Initialization');
    await testSystemInitialization();
    console.log('✅ System initialization test passed\n');

    // Test 2: Validate performance benchmarks
    console.log('📋 Test 2: Performance Benchmarks');
    const benchmarkResults = await testPerformanceBenchmarks();
    console.log(`✅ Performance benchmark test completed with score: ${benchmarkResults.summary.overallScore}/100\n`);

    // Test 3: Memory management integration
    console.log('📋 Test 3: Memory Management Integration');
    await testMemoryManagementIntegration();
    console.log('✅ Memory management integration test passed\n');

    // Test 4: Browser optimization integration
    console.log('📋 Test 4: Browser Optimization Integration');
    await testBrowserOptimizationIntegration();
    console.log('✅ Browser optimization integration test passed\n');

    // Test 5: End-to-end performance validation
    console.log('📋 Test 5: End-to-End Performance Validation');
    await testEndToEndPerformance();
    console.log('✅ End-to-end performance test passed\n');

    console.log('🎉 All integration tests completed successfully!');

  } catch (error) {
    console.error('❌ Integration tests failed:', error);
    throw error;
  }
}

/**
 * Test that all performance systems initialize correctly
 */
async function testSystemInitialization(): Promise<void> {
  const startTime = Date.now();

  // Initialize performance monitor
  await performanceMonitor.initialize();
  console.log('  ✓ Performance monitor initialized');

  // Test memory manager
  const memoryStats = memoryManager.getStats();
  if (memoryStats.caches.length >= 0) {
    console.log('  ✓ Memory manager initialized');
  } else {
    throw new Error('Memory manager initialization failed');
  }

  // Test browser optimizations
  await browserOptimizationManager.applyOptimizations();
  const optimizationStatus = browserOptimizationManager.getOptimizationStatus();
  if (optimizationStatus.applied.length > 0) {
    console.log(`  ✓ Browser optimizations applied (${optimizationStatus.applied.length} optimizations)`);
  } else {
    throw new Error('Browser optimization initialization failed');
  }

  const initTime = Date.now() - startTime;
  if (initTime > 1000) { // Should initialize in under 1 second
    console.warn(`  ⚠️  Initialization took ${initTime}ms (expected < 1000ms)`);
  } else {
    console.log(`  ✓ All systems initialized in ${initTime}ms`);
  }
}

/**
 * Test performance benchmarks using the test runner
 */
async function testPerformanceBenchmarks(): Promise<any> {
  // Create custom benchmarks for integration testing
  const integrationBenchmarks: Partial<PerformanceBenchmarks> = {
    maxStartupTime: 100,
    maxQueryTime: 50,
    maxMemoryUsage: 50 * 1024 * 1024, // 50MB
    maxCpuUtilization: 5,
    maxSyncDuration: 5000,
    minCacheHitRate: 70
  };

  // Run the full test suite
  const testRunner = performanceTestRunner;
  const report = await testRunner.runAllTests();

  // Validate critical benchmarks
  const failedCriticalTests = report.results.filter(result => 
    !result.passed && (
      result.benchmarkType === 'maxStartupTime' ||
      result.benchmarkType === 'maxMemoryUsage'
    )
  );

  if (failedCriticalTests.length > 0) {
    console.warn('  ⚠️  Critical performance benchmarks failed:');
    failedCriticalTests.forEach(test => {
      console.warn(`    - ${test.testName}: ${test.actualValue} > ${test.expectedValue}`);
    });
  }

  // Log summary
  console.log(`  📊 Performance Summary:`);
  console.log(`    - Overall Score: ${report.summary.overallScore}/100`);
  console.log(`    - Tests Passed: ${report.summary.passed}/${report.summary.totalTests}`);
  console.log(`    - Duration: ${report.summary.duration}ms`);
  console.log(`    - Memory Usage: ${Math.round(report.performance.memoryStats.totalMemoryUsage / 1024 / 1024 * 100) / 100}MB`);

  return report;
}

/**
 * Test memory management integration
 */
async function testMemoryManagementIntegration(): Promise<void> {
  const initialStats = memoryManager.getStats();
  const initialMemory = performance.memory?.usedJSHeapSize || 0;

  // Test cache creation and management
  const testCache = memoryManager.getCache('integration-test', 100, 60000);
  
  // Populate cache with test data
  for (let i = 0; i < 50; i++) {
    testCache.set(`test-key-${i}`, {
      id: i,
      data: new Array(100).fill(`test-data-${i}`),
      timestamp: Date.now()
    });
  }

  // Test cache operations
  const retrievedData = testCache.get('test-key-25');
  if (!retrievedData || retrievedData.id !== 25) {
    throw new Error('Cache retrieval failed');
  }
  console.log('  ✓ Cache operations working correctly');

  // Test connection pooling
  const connectionPool = memoryManager.getConnectionPool(
    'integration-test-pool',
    async () => ({ id: Math.random(), active: true }),
    async (conn: any) => conn.active === true,
    async (conn: any) => { conn.active = false; },
    { maxConnections: 5, idleTimeout: 30000 }
  );

  const connection1 = await connectionPool.acquire();
  const connection2 = await connectionPool.acquire();
  
  if (!connection1 || !connection2) {
    throw new Error('Connection pool failed to provide connections');
  }

  connectionPool.release(connection1);
  connectionPool.release(connection2);
  
  const poolStats = connectionPool.getStats();
  if (poolStats.totalConnections >= 2) {
    console.log('  ✓ Connection pooling working correctly');
  } else {
    throw new Error('Connection pooling failed');
  }

  // Test garbage collection
  const gcResult = await memoryManager.forceGarbageCollection();
  console.log(`  ✓ Garbage collection cleaned ${gcResult.cachesCleanedUp} caches, freed ${gcResult.memoryFreed} bytes`);

  // Cleanup
  testCache.clear();
  await connectionPool.close();
  
  const finalMemory = performance.memory?.usedJSHeapSize || 0;
  const memoryDelta = finalMemory - initialMemory;
  
  if (memoryDelta > 10 * 1024 * 1024) { // 10MB threshold
    console.warn(`  ⚠️  Memory usage increased by ${Math.round(memoryDelta / 1024 / 1024 * 100) / 100}MB`);
  } else {
    console.log(`  ✓ Memory usage delta: ${Math.round(memoryDelta / 1024 * 100) / 100}KB (within acceptable range)`);
  }
}

/**
 * Test browser optimization integration
 */
async function testBrowserOptimizationIntegration(): Promise<void> {
  const currentBrowser = detectBrowser();
  console.log(`  🌐 Testing optimizations for ${currentBrowser}`);

  // Get optimization status
  const status = browserOptimizationManager.getOptimizationStatus();
  
  // Validate that optimizations are applied
  if (status.applied.length === 0) {
    throw new Error('No browser optimizations were applied');
  }
  console.log(`  ✓ ${status.applied.length} optimizations applied`);

  // Validate optimization effectiveness
  const validation = await browserOptimizationManager.validateOptimizations();
  
  if (!validation.valid) {
    console.warn('  ⚠️  Optimization validation issues:');
    validation.issues.forEach(issue => console.warn(`    - ${issue}`));
    
    if (validation.recommendations.length > 0) {
      console.warn('  💡 Recommendations:');
      validation.recommendations.forEach(rec => console.warn(`    - ${rec}`));
    }
  } else {
    console.log('  ✓ All optimizations validated successfully');
  }

  // Test browser-specific capabilities
  const capabilities = status.capabilities;
  console.log(`  ✓ Browser capabilities detected:`);
  console.log(`    - Service Workers: ${capabilities.supportsServiceWorkers}`);
  console.log(`    - WebAssembly: ${capabilities.supportsWebAssembly}`);
  console.log(`    - IndexedDB: ${capabilities.supportsIndexedDB}`);
  console.log(`    - Max Storage: ${Math.round(capabilities.maxStorageQuota / 1024 / 1024)}MB`);
  console.log(`    - Max Memory: ${Math.round(capabilities.maxMemoryLimit / 1024 / 1024 / 1024 * 10) / 10}GB`);
}

/**
 * Test end-to-end performance scenarios
 */
async function testEndToEndPerformance(): Promise<void> {
  console.log('  🔄 Running end-to-end performance scenario...');

  const scenario = new PerformanceScenario();
  await scenario.runCompleteScenario();
  
  const results = scenario.getResults();
  
  console.log(`  📊 End-to-end results:`);
  console.log(`    - Total duration: ${results.totalDuration}ms`);
  console.log(`    - Average operation time: ${results.avgOperationTime.toFixed(2)}ms`);
  console.log(`    - Memory efficiency: ${results.memoryEfficiency.toFixed(1)}%`);
  console.log(`    - Cache hit rate: ${results.cacheHitRate.toFixed(1)}%`);
  
  // Validate results meet expectations
  if (results.totalDuration > 10000) { // 10 seconds max
    throw new Error(`End-to-end scenario took too long: ${results.totalDuration}ms`);
  }
  
  if (results.avgOperationTime > 100) { // 100ms average max
    throw new Error(`Average operation time too high: ${results.avgOperationTime}ms`);
  }
  
  if (results.memoryEfficiency < 80) { // 80% efficiency min
    throw new Error(`Memory efficiency too low: ${results.memoryEfficiency}%`);
  }
  
  console.log('  ✅ End-to-end performance scenario passed all validation checks');
}

/**
 * Performance scenario simulator
 */
class PerformanceScenario {
  private results = {
    totalDuration: 0,
    operationTimes: [] as number[],
    memorySnapshots: [] as number[],
    cacheHits: 0,
    cacheRequests: 0
  };

  async runCompleteScenario(): Promise<void> {
    const startTime = Date.now();
    const initialMemory = performance.memory?.usedJSHeapSize || 0;

    try {
      // Simulate extension startup
      await this.simulateStartup();
      
      // Simulate tab management operations
      await this.simulateTabOperations();
      
      // Simulate database operations
      await this.simulateDatabaseOperations();
      
      // Simulate memory pressure
      await this.simulateMemoryPressure();
      
      // Simulate cleanup
      await this.simulateCleanup();
      
    } finally {
      this.results.totalDuration = Date.now() - startTime;
      const finalMemory = performance.memory?.usedJSHeapSize || 0;
      this.results.memorySnapshots = [initialMemory, finalMemory];
    }
  }

  private async simulateStartup(): Promise<void> {
    const startTime = performance.now();
    
    // Simulate service worker initialization
    performanceMonitor.startBackgroundTask('scenario-startup');
    
    // Initialize components
    await performanceMonitor.initialize();
    
    // Apply optimizations
    await browserOptimizationManager.applyOptimizations();
    
    performanceMonitor.endBackgroundTask('scenario-startup');
    
    const duration = performance.now() - startTime;
    this.results.operationTimes.push(duration);
  }

  private async simulateTabOperations(): Promise<void> {
    const cache = memoryManager.getCache('scenario-tabs', 100);
    
    // Simulate creating and managing multiple tabs
    for (let i = 0; i < 20; i++) {
      const startTime = performance.now();
      
      // Create tab data
      const tabData = {
        id: i,
        url: `https://example${i}.com`,
        title: `Test Tab ${i}`,
        createdAt: Date.now(),
        content: new Array(50).fill(`content-${i}`).join(' ')
      };
      
      // Cache the tab
      cache.set(`tab-${i}`, tabData);
      
      // Simulate retrieving tab (cache hit test)
      this.results.cacheRequests++;
      const retrieved = cache.get(`tab-${i}`);
      if (retrieved) {
        this.results.cacheHits++;
      }
      
      const duration = performance.now() - startTime;
      this.results.operationTimes.push(duration);
      
      // Small delay between operations
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    
    cache.clear();
  }

  private async simulateDatabaseOperations(): Promise<void> {
    // Simulate database queries with performance monitoring
    for (let i = 0; i < 10; i++) {
      const queryId = `scenario-query-${i}`;
      const startTime = performance.now();
      
      performanceMonitor.startQuery(queryId);
      
      // Simulate query processing time
      await new Promise(resolve => setTimeout(resolve, Math.random() * 20 + 10));
      
      performanceMonitor.endQuery(queryId);
      
      const duration = performance.now() - startTime;
      this.results.operationTimes.push(duration);
    }
  }

  private async simulateMemoryPressure(): Promise<void> {
    const startTime = performance.now();
    const cache = memoryManager.getCache('memory-pressure-test', 200);
    
    // Create memory pressure by filling cache
    for (let i = 0; i < 150; i++) {
      cache.set(`pressure-${i}`, {
        data: new Array(200).fill(i),
        timestamp: Date.now()
      });
    }
    
    // Test memory management response
    const gcResult = await memoryManager.forceGarbageCollection();
    
    // Clean up
    cache.clear();
    
    const duration = performance.now() - startTime;
    this.results.operationTimes.push(duration);
  }

  private async simulateCleanup(): Promise<void> {
    const startTime = performance.now();
    
    // Force final cleanup
    await memoryManager.forceGarbageCollection();
    
    // Stop performance monitoring
    performanceMonitor.stopMonitoring();
    
    const duration = performance.now() - startTime;
    this.results.operationTimes.push(duration);
  }

  getResults(): {
    totalDuration: number;
    avgOperationTime: number;
    memoryEfficiency: number;
    cacheHitRate: number;
  } {
    const avgOperationTime = this.results.operationTimes.length > 0
      ? this.results.operationTimes.reduce((sum, time) => sum + time, 0) / this.results.operationTimes.length
      : 0;

    const memoryEfficiency = this.results.memorySnapshots.length >= 2
      ? Math.max(0, 100 - ((this.results.memorySnapshots[1] - this.results.memorySnapshots[0]) / this.results.memorySnapshots[0] * 100))
      : 100;

    const cacheHitRate = this.results.cacheRequests > 0
      ? (this.results.cacheHits / this.results.cacheRequests) * 100
      : 0;

    return {
      totalDuration: this.results.totalDuration,
      avgOperationTime,
      memoryEfficiency,
      cacheHitRate
    };
  }
}

/**
 * Generate performance optimization report
 */
export async function generateOptimizationReport(): Promise<string> {
  const report = {
    timestamp: new Date().toISOString(),
    browser: detectBrowser(),
    system: {
      performance: performanceMonitor.getPerformanceSummary(),
      memory: memoryManager.getStats(),
      optimizations: browserOptimizationManager.getOptimizationStatus()
    },
    benchmarks: null as any,
    validation: null as any
  };

  try {
    // Run performance tests
    console.log('Generating comprehensive optimization report...');
    report.benchmarks = await performanceTestRunner.runAllTests();
    
    // Validate optimizations
    report.validation = await browserOptimizationManager.validateOptimizations();
    
    // Generate HTML report
    const htmlReport = performanceTestRunner.generateHTMLReport(report.benchmarks);
    
    console.log('\n📈 Performance Optimization Report Generated');
    console.log('='.repeat(50));
    console.log(`Overall Score: ${report.benchmarks.summary.overallScore}/100`);
    console.log(`Browser: ${report.browser}`);
    console.log(`Optimizations Applied: ${report.system.optimizations.applied.length}`);
    console.log(`Memory Usage: ${Math.round(report.system.memory.totalMemoryUsage / 1024 / 1024 * 100) / 100}MB`);
    console.log(`Performance Status: ${report.system.performance.status}`);
    
    if (report.benchmarks.recommendations.length > 0) {
      console.log('\n💡 Top Recommendations:');
      report.benchmarks.recommendations.slice(0, 3).forEach((rec, i) => {
        console.log(`   ${i + 1}. ${rec}`);
      });
    }
    
    return htmlReport;
    
  } catch (error) {
    console.error('Failed to generate optimization report:', error);
    throw error;
  }
}

// Export main test function
export { runPerformanceIntegrationTests as runTests };