#!/usr/bin/env bun

import { 
  HealthResponseSchema,
  DoubleePlaysResponseSchema,
  PaginatedResponseSchema,
  StatsResponseSchema,
  ApiInfoResponseSchema,
  ErrorResponseSchema,
  PaginationQuerySchema
} from '../src/api-schemas';

console.log('🧪 Testing Zod API Schema Validation\n');

// Test valid pagination query
console.log('1. Testing pagination query validation:');
try {
  const validQuery = PaginationQuerySchema.parse({ page: '2', limit: '20' });
  console.log('✅ Valid query:', validQuery);
} catch (error) {
  console.log('❌ Validation failed:', error);
}

try {
  const invalidQuery = PaginationQuerySchema.parse({ page: '0', limit: '200' });
  console.log('❌ Invalid query should have failed:', invalidQuery);
} catch (error) {
  console.log('✅ Invalid query correctly rejected');
}

// Test API info response
console.log('\n2. Testing API info response:');
const apiInfoData = {
  name: 'KEXP Double Play Scanner API',
  version: '1.0.0',
  description: 'REST API for KEXP double play data and scanner health',
  endpoints: {
    '/api/health': 'Scanner health and status information',
    '/api/double-plays': 'All double plays data'
  },
  timestamp: new Date().toISOString()
};

try {
  const validApiInfo = ApiInfoResponseSchema.parse(apiInfoData);
  console.log('✅ API info response validation passed');
} catch (error) {
  console.log('❌ API info validation failed:', error);
}

// Test error response
console.log('\n3. Testing error response:');
const errorData = {
  error: 'Test error',
  message: 'This is a test error message'
};

try {
  const validError = ErrorResponseSchema.parse(errorData);
  console.log('✅ Error response validation passed');
} catch (error) {
  console.log('❌ Error validation failed:', error);
}

// Test double play structure
console.log('\n4. Testing double play data:');
const doublePlayData = {
  artist: 'Test Artist',
  title: 'Test Song',
  plays: [
    {
      timestamp: '2025-07-29T09:29:38-07:00',
      end_timestamp: '2025-07-29T09:33:56-07:00',
      play_id: 123456
    },
    {
      timestamp: '2025-07-29T09:33:56-07:00',
      end_timestamp: '2025-07-29T09:38:07-07:00',
      play_id: 123457
    }
  ],
  dj: 'Test DJ',
  show: 'Test Show',
  duration: 258,
  classification: 'legitimate' as const
};

try {
  const { DoublePlaySchema } = await import('../src/api-schemas');
  const validDoublePlay = DoublePlaySchema.parse(doublePlayData);
  console.log('✅ Double play validation passed');
} catch (error) {
  console.log('❌ Double play validation failed:', error);
}

console.log('\n🎉 All validation tests completed!');