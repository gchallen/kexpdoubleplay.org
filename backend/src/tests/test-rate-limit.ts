#!/usr/bin/env tsx
// Quick test to measure KEXP API response times and find optimal rate limits
// Usage: bun src/tests/test-rate-limit.ts

import { KEXPApi } from '../api';
import { config } from '../config';
import logger from '../logger';
import moment from 'moment';

interface TestResult {
  delay: number;
  requests: number;
  avgResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  errors: number;
  totalTime: number;
}

async function testRateLimit(delayMs: number, requestCount: number = 10): Promise<TestResult> {
  console.log(`\n🔍 Testing rate limit: ${delayMs}ms delay, ${requestCount} requests`);
  
  // Temporarily override the rate limit for this test
  const originalDelay = config.rateLimitDelay;
  (config as any).rateLimitDelay = delayMs;
  
  const api = new KEXPApi();
  const responseTimes: number[] = [];
  let errors = 0;
  const startTime = Date.now();
  
  // Use a recent time range that should have data
  const endTime = moment().subtract(1, 'hour');
  const startTimeForRequest = endTime.clone().subtract(1, 'hour');
  
  for (let i = 0; i < requestCount; i++) {
    try {
      const requestStart = Date.now();
      
      // Make a realistic API request
      await api.getPlays(startTimeForRequest, endTime);
      
      const requestEnd = Date.now();
      const responseTime = requestEnd - requestStart - delayMs; // Subtract our artificial delay
      responseTimes.push(responseTime);
      
      process.stdout.write('.');
    } catch (error) {
      errors++;
      process.stdout.write('✗');
      logger.debug('API request failed during rate limit test', {
        error: error instanceof Error ? error.message : error,
        requestNumber: i + 1
      });
    }
  }
  
  const totalTime = Date.now() - startTime;
  
  // Restore original rate limit
  (config as any).rateLimitDelay = originalDelay;
  
  const result: TestResult = {
    delay: delayMs,
    requests: requestCount,
    avgResponseTime: responseTimes.length > 0 ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : 0,
    minResponseTime: responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
    maxResponseTime: responseTimes.length > 0 ? Math.max(...responseTimes) : 0,
    errors,
    totalTime
  };
  
  console.log(` (${totalTime}ms total)`);
  
  return result;
}

async function runRateLimitTests() {
  console.log('🚀 KEXP API Rate Limit Testing');
  console.log('================================\n');
  
  // Test different rate limits from aggressive to conservative
  const testDelays = [100, 250, 500, 750, 1000, 1500]; // Current default is 1000ms
  const results: TestResult[] = [];
  
  for (const delay of testDelays) {
    try {
      const result = await testRateLimit(delay);
      results.push(result);
      
      // Show immediate results
      console.log(`  ✅ Avg response: ${result.avgResponseTime}ms, Errors: ${result.errors}/${result.requests}`);
      
      // Brief pause between test batches
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`  ❌ Test failed for ${delay}ms delay:`, error instanceof Error ? error.message : error);
    }
  }
  
  // Summary
  console.log('\n📊 Results Summary:');
  console.log('==================');
  console.log('Delay\t| Avg RT\t| Min RT\t| Max RT\t| Errors\t| Total Time');
  console.log('------|-------|-------|-------|-------|-------');
  
  let recommendedDelay = 1000; // Default fallback
  
  results.forEach(r => {
    console.log(`${r.delay}ms\t| ${r.avgResponseTime}ms\t\t| ${r.minResponseTime}ms\t\t| ${r.maxResponseTime}ms\t\t| ${r.errors}/${r.requests}\t| ${r.totalTime}ms`);
    
    // Recommend the fastest delay with no errors
    if (r.errors === 0 && r.delay < recommendedDelay) {
      recommendedDelay = r.delay;
    }
  });
  
  console.log('\n💡 Recommendations:');
  console.log('==================');
  
  const currentDelay = config.rateLimitDelay;
  const errorFreeResults = results.filter(r => r.errors === 0);
  
  if (errorFreeResults.length > 0) {
    const fastestSafe = Math.min(...errorFreeResults.map(r => r.delay));
    console.log(`✅ Fastest safe delay: ${fastestSafe}ms (current: ${currentDelay}ms)`);
    
    if (fastestSafe < currentDelay) {
      const speedup = Math.round(((currentDelay / fastestSafe) - 1) * 100);
      console.log(`🚀 You could speed up by ${speedup}% using ${fastestSafe}ms delay`);
      console.log(`📝 Set RATE_LIMIT_DELAY=${fastestSafe} in your .env file`);
    } else {
      console.log(`⚠️  Current delay (${currentDelay}ms) is already optimal`);
    }
  } else {
    console.log(`❌ All tests had errors - KEXP API might be under heavy load`);
    console.log(`💡 Keep current delay (${currentDelay}ms) or increase it`);
  }
  
  // Show potential time savings for backward scans
  if (errorFreeResults.length > 0) {
    const fastestSafe = Math.min(...errorFreeResults.map(r => r.delay));
    const currentTotalTime = results.find(r => r.delay === currentDelay)?.totalTime || 0;
    const fastestTotalTime = results.find(r => r.delay === fastestSafe)?.totalTime || 0;
    
    if (currentTotalTime > 0 && fastestTotalTime > 0) {
      const timeSaved = currentTotalTime - fastestTotalTime;
      console.log(`⏱️  Time saved per 10 requests: ${timeSaved}ms`);
      
      // Extrapolate for backward scanning
      const requestsFor7Days = Math.ceil((7 * 24) / config.maxHoursPerRequest) * 2; // Rough estimate
      const potentialSavings = Math.round((timeSaved / 10) * requestsFor7Days / 1000 / 60);
      console.log(`📈 Estimated time saved for 7-day backfill: ~${potentialSavings} minutes`);
    }
  }
}

// Run the test
if (require.main === module) {
  runRateLimitTests().catch(error => {
    console.error('Rate limit test failed:', error);
    process.exit(1);
  });
}