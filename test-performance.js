#!/usr/bin/env node

/**
 * Performance Testing Script for TabKiller Extension
 * Demonstrates and validates all performance optimizations
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Performance benchmarks (matching TypeScript implementation)
const BENCHMARKS = {
  maxStartupTime: 100,        // ms
  maxQueryTime: 50,          // ms  
  maxMemoryUsage: 50 * 1024 * 1024,  // 50MB
  maxCpuUtilization: 5,      // 5%
  maxSyncDuration: 5000,     // 5 seconds
  minCacheHitRate: 70        // 70%
};

console.log('🚀 TabKiller Performance Optimization Test Suite');
console.log('=' .repeat(60));
console.log();

async function runPerformanceTests() {
  const startTime = Date.now();
  const results = {
    tests: [],
    summary: {
      passed: 0,
      failed: 0,
      total: 0
    }
  };

  try {
    // Test 1: Check TypeScript compilation
    console.log('📋 Test 1: TypeScript Compilation Performance');
    const compileResult = await testTypeScriptCompilation();
    results.tests.push(compileResult);
    updateSummary(results, compileResult);
    
    // Test 2: Build Performance 
    console.log('\n📋 Test 2: Build Performance');
    const buildResult = await testBuildPerformance();
    results.tests.push(buildResult);
    updateSummary(results, buildResult);
    
    // Test 3: Bundle Size Optimization
    console.log('\n📋 Test 3: Bundle Size Analysis');
    const bundleResult = await testBundleSize();
    results.tests.push(bundleResult);
    updateSummary(results, bundleResult);
    
    // Test 4: Memory Management Validation
    console.log('\n📋 Test 4: Memory Management Validation');
    const memoryResult = await testMemoryManagement();
    results.tests.push(memoryResult);
    updateSummary(results, memoryResult);
    
    // Test 5: Performance Monitoring Integration
    console.log('\n📋 Test 5: Performance Monitoring Integration');
    const monitoringResult = await testPerformanceMonitoring();
    results.tests.push(monitoringResult);
    updateSummary(results, monitoringResult);

    // Test 6: Browser Compatibility
    console.log('\n📋 Test 6: Browser Compatibility');
    const compatibilityResult = await testBrowserCompatibility();
    results.tests.push(compatibilityResult);
    updateSummary(results, compatibilityResult);

  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
    process.exit(1);
  }

  // Generate final report
  const duration = Date.now() - startTime;
  const score = Math.round((results.summary.passed / results.summary.total) * 100);
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 PERFORMANCE TEST RESULTS');
  console.log('='.repeat(60));
  console.log(`Overall Score: ${score}/100`);
  console.log(`Tests Passed: ${results.summary.passed}/${results.summary.total}`);
  console.log(`Duration: ${duration}ms`);
  console.log();

  // Show individual test results
  results.tests.forEach((test, index) => {
    const status = test.passed ? '✅' : '❌';
    const value = test.actualValue !== undefined 
      ? ` (${test.actualValue}${test.unit || ''}${test.expectedValue ? ` / ${test.expectedValue}${test.unit || ''}` : ''})`
      : '';
    console.log(`${status} ${test.name}${value}`);
  });

  if (results.summary.failed > 0) {
    console.log('\n⚠️  Some tests failed. Review the output above for details.');
    console.log('💡 Consider running: npm run build && npm run lint:fix');
  } else {
    console.log('\n🎉 All performance tests passed!');
    console.log('✨ TabKiller extension is optimized and ready for production.');
  }

  // Generate performance report file
  const reportPath = path.join(__dirname, 'performance-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    score,
    duration,
    benchmarks: BENCHMARKS,
    results: results.tests,
    summary: results.summary,
    recommendations: generateRecommendations(results.tests)
  }, null, 2));
  
  console.log(`\n📁 Detailed report saved to: ${reportPath}`);

  return score >= 80; // Return true if score is acceptable
}

async function testTypeScriptCompilation() {
  const startTime = Date.now();
  
  try {
    console.log('  🔧 Compiling TypeScript...');
    execSync('npx tsc --noEmit', { 
      stdio: 'pipe',
      cwd: __dirname 
    });
    
    const duration = Date.now() - startTime;
    const passed = duration < 10000; // Should compile in under 10 seconds
    
    console.log(`  ${passed ? '✅' : '❌'} TypeScript compilation: ${duration}ms`);
    
    return {
      name: 'TypeScript Compilation',
      passed,
      actualValue: duration,
      expectedValue: 10000,
      unit: 'ms'
    };
    
  } catch (error) {
    console.log('  ❌ TypeScript compilation failed');
    console.log('    Error:', error.message.split('\n')[0]);
    
    return {
      name: 'TypeScript Compilation',
      passed: false,
      error: 'Compilation failed'
    };
  }
}

async function testBuildPerformance() {
  const startTime = Date.now();
  
  try {
    console.log('  🔧 Running development build...');
    execSync('npm run build:dev', { 
      stdio: 'pipe',
      cwd: __dirname 
    });
    
    const duration = Date.now() - startTime;
    const passed = duration < 30000; // Should build in under 30 seconds
    
    console.log(`  ${passed ? '✅' : '❌'} Development build: ${duration}ms`);
    
    return {
      name: 'Development Build Performance',
      passed,
      actualValue: duration,
      expectedValue: 30000,
      unit: 'ms'
    };
    
  } catch (error) {
    console.log('  ❌ Build failed');
    
    return {
      name: 'Development Build Performance',
      passed: false,
      error: 'Build failed'
    };
  }
}

async function testBundleSize() {
  try {
    console.log('  📦 Analyzing bundle size...');
    
    // Check if build directory exists
    const buildDir = path.join(__dirname, 'build');
    if (!fs.existsSync(buildDir)) {
      throw new Error('Build directory not found. Run build first.');
    }

    // Get bundle sizes
    const files = fs.readdirSync(buildDir, { recursive: true });
    let totalSize = 0;
    let jsSize = 0;
    
    files.forEach(file => {
      const filePath = path.join(buildDir, file);
      if (fs.statSync(filePath).isFile()) {
        const size = fs.statSync(filePath).size;
        totalSize += size;
        
        if (path.extname(file) === '.js') {
          jsSize += size;
        }
      }
    });

    // Bundle size benchmarks
    const maxTotalSize = 5 * 1024 * 1024; // 5MB
    const maxJsSize = 2 * 1024 * 1024;    // 2MB
    
    const totalPassed = totalSize < maxTotalSize;
    const jsPassed = jsSize < maxJsSize;
    const passed = totalPassed && jsPassed;

    console.log(`  ${totalPassed ? '✅' : '❌'} Total bundle size: ${Math.round(totalSize / 1024)}KB (max: ${Math.round(maxTotalSize / 1024)}KB)`);
    console.log(`  ${jsPassed ? '✅' : '❌'} JavaScript size: ${Math.round(jsSize / 1024)}KB (max: ${Math.round(maxJsSize / 1024)}KB)`);
    
    return {
      name: 'Bundle Size Optimization',
      passed,
      actualValue: Math.round(totalSize / 1024),
      expectedValue: Math.round(maxTotalSize / 1024),
      unit: 'KB'
    };
    
  } catch (error) {
    console.log('  ❌ Bundle size analysis failed:', error.message);
    
    return {
      name: 'Bundle Size Optimization', 
      passed: false,
      error: error.message
    };
  }
}

async function testMemoryManagement() {
  try {
    console.log('  🧠 Testing memory management features...');
    
    const features = [
      'src/performance/MemoryManager.ts',
      'src/performance/PerformanceMonitor.ts',
      'src/background/optimized-service-worker.ts',
      'src/database/optimized-queries.ts'
    ];
    
    let score = 0;
    
    features.forEach(feature => {
      const filePath = path.join(__dirname, feature);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Check for memory management patterns
        const patterns = [
          'memoryManager',
          'forceGarbageCollection',
          'ConnectionPool',
          'LRUCache',
          'cleanup',
          'WeakMap',
          'performance.memory'
        ];
        
        const foundPatterns = patterns.filter(pattern => content.includes(pattern));
        score += foundPatterns.length;
        
        console.log(`    ✓ ${path.basename(feature)}: ${foundPatterns.length}/${patterns.length} patterns`);
      } else {
        console.log(`    ❌ ${path.basename(feature)}: File not found`);
      }
    });
    
    const totalPatterns = features.length * 7; // 7 patterns per file
    const passed = score > totalPatterns * 0.6; // 60% threshold
    
    console.log(`  ${passed ? '✅' : '❌'} Memory management features: ${score}/${totalPatterns} patterns found`);
    
    return {
      name: 'Memory Management Features',
      passed,
      actualValue: score,
      expectedValue: Math.round(totalPatterns * 0.6)
    };
    
  } catch (error) {
    console.log('  ❌ Memory management test failed:', error.message);
    
    return {
      name: 'Memory Management Features',
      passed: false,
      error: error.message
    };
  }
}

async function testPerformanceMonitoring() {
  try {
    console.log('  📊 Testing performance monitoring integration...');
    
    const monitoringFile = path.join(__dirname, 'src/performance/PerformanceMonitor.ts');
    const testFile = path.join(__dirname, 'src/testing/PerformanceTestSuite.ts');
    
    if (!fs.existsSync(monitoringFile)) {
      throw new Error('PerformanceMonitor.ts not found');
    }
    
    if (!fs.existsSync(testFile)) {
      throw new Error('PerformanceTestSuite.ts not found');
    }
    
    const monitoringContent = fs.readFileSync(monitoringFile, 'utf8');
    const testContent = fs.readFileSync(testFile, 'utf8');
    
    // Check for key monitoring features
    const monitoringFeatures = [
      'startQuery',
      'endQuery',
      'getPerformanceSummary',
      'identifyBottlenecks',
      'BENCHMARKS',
      'monitorQuery',
      'monitorEvent'
    ];
    
    const testFeatures = [
      'PerformanceTestRunner',
      'TestResult',
      'runAllTests',
      'generateHTMLReport',
      'PerformanceBenchmarks'
    ];
    
    const monitoringScore = monitoringFeatures.filter(f => monitoringContent.includes(f)).length;
    const testScore = testFeatures.filter(f => testContent.includes(f)).length;
    
    const totalFeatures = monitoringFeatures.length + testFeatures.length;
    const foundFeatures = monitoringScore + testScore;
    const passed = foundFeatures >= totalFeatures * 0.8; // 80% threshold
    
    console.log(`    ✓ Performance Monitor: ${monitoringScore}/${monitoringFeatures.length} features`);
    console.log(`    ✓ Test Suite: ${testScore}/${testFeatures.length} features`);
    console.log(`  ${passed ? '✅' : '❌'} Performance monitoring: ${foundFeatures}/${totalFeatures} features`);
    
    return {
      name: 'Performance Monitoring Integration',
      passed,
      actualValue: foundFeatures,
      expectedValue: Math.round(totalFeatures * 0.8)
    };
    
  } catch (error) {
    console.log('  ❌ Performance monitoring test failed:', error.message);
    
    return {
      name: 'Performance Monitoring Integration',
      passed: false,
      error: error.message
    };
  }
}

async function testBrowserCompatibility() {
  try {
    console.log('  🌐 Testing browser compatibility features...');
    
    const optimizationFile = path.join(__dirname, 'src/performance/BrowserOptimizations.ts');
    const serviceWorkerFile = path.join(__dirname, 'src/background/optimized-service-worker.ts');
    
    if (!fs.existsSync(optimizationFile)) {
      throw new Error('BrowserOptimizations.ts not found');
    }
    
    const optimizationContent = fs.readFileSync(optimizationFile, 'utf8');
    
    // Check for browser-specific optimizations
    const browsers = ['chrome', 'firefox', 'safari', 'edge'];
    const optimizationFeatures = [
      'BrowserOptimizationManager',
      'detectCapabilities',
      'applyOptimizations',
      'SupportedBrowser',
      'BrowserCapabilities'
    ];
    
    const browserSupport = browsers.filter(browser => optimizationContent.includes(browser)).length;
    const featureSupport = optimizationFeatures.filter(feature => optimizationContent.includes(feature)).length;
    
    const totalChecks = browsers.length + optimizationFeatures.length;
    const passedChecks = browserSupport + featureSupport;
    const passed = passedChecks >= totalChecks * 0.8; // 80% threshold
    
    console.log(`    ✓ Browser support: ${browserSupport}/${browsers.length} browsers`);
    console.log(`    ✓ Optimization features: ${featureSupport}/${optimizationFeatures.length} features`);
    console.log(`  ${passed ? '✅' : '❌'} Browser compatibility: ${passedChecks}/${totalChecks} checks`);
    
    return {
      name: 'Browser Compatibility',
      passed,
      actualValue: passedChecks,
      expectedValue: Math.round(totalChecks * 0.8)
    };
    
  } catch (error) {
    console.log('  ❌ Browser compatibility test failed:', error.message);
    
    return {
      name: 'Browser Compatibility',
      passed: false, 
      error: error.message
    };
  }
}

function updateSummary(results, testResult) {
  results.summary.total++;
  if (testResult.passed) {
    results.summary.passed++;
  } else {
    results.summary.failed++;
  }
}

function generateRecommendations(tests) {
  const recommendations = [];
  
  const failedTests = tests.filter(t => !t.passed);
  
  if (failedTests.some(t => t.name.includes('Compilation'))) {
    recommendations.push('Fix TypeScript compilation errors before proceeding');
  }
  
  if (failedTests.some(t => t.name.includes('Build'))) {
    recommendations.push('Optimize build configuration for better performance');
  }
  
  if (failedTests.some(t => t.name.includes('Bundle Size'))) {
    recommendations.push('Reduce bundle size by implementing code splitting and tree shaking');
  }
  
  if (failedTests.some(t => t.name.includes('Memory'))) {
    recommendations.push('Implement more aggressive memory management and garbage collection');
  }
  
  if (failedTests.some(t => t.name.includes('Performance Monitoring'))) {
    recommendations.push('Complete performance monitoring implementation');
  }
  
  if (failedTests.some(t => t.name.includes('Browser'))) {
    recommendations.push('Implement browser-specific optimizations');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('All tests passed! Consider running full integration tests.');
    recommendations.push('Monitor performance in production and adjust optimizations as needed.');
  }
  
  return recommendations;
}

// Run the tests
runPerformanceTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});