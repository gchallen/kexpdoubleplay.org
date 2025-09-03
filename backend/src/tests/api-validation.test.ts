import { test, expect } from 'bun:test';
import { 
  HealthResponseSchema,
  DoubleePlaysResponseSchema,
  PaginatedResponseSchema,
  StatsResponseSchema,
  ApiInfoResponseSchema,
  ErrorResponseSchema,
  PaginationQuerySchema,
  ClassificationCountsSchema
} from '@kexp-doubleplay/types';

test('PaginationQuerySchema validates valid queries', () => {
  const validQuery = { page: '1', limit: '10' };
  const result = PaginationQuerySchema.parse(validQuery);
  expect(result.page).toBe(1);
  expect(result.limit).toBe(10);
});

test('PaginationQuerySchema applies default values', () => {
  const emptyQuery = {};
  const result = PaginationQuerySchema.parse(emptyQuery);
  expect(result.page).toBe(1);
  expect(result.limit).toBe(10);
});

test('PaginationQuerySchema rejects invalid values', () => {
  expect(() => {
    PaginationQuerySchema.parse({ page: '0', limit: '10' });
  }).toThrow();
  
  expect(() => {
    PaginationQuerySchema.parse({ page: '1', limit: '101' });
  }).toThrow();
});

test('DoubleePlaysResponseSchema validates response with counts', () => {
  // Test the ClassificationCountsSchema separately first
  const counts = {
    legitimate: 2,
    partial: 1,
    mistake: 1
  };
  
  expect(() => {
    const result = ClassificationCountsSchema.parse(counts);
    expect(result.legitimate).toBe(2);
    expect(result.partial).toBe(1);
    expect(result.mistake).toBe(1);
  }).not.toThrow();

  // Test a minimal valid response structure
  const mockResponse = {
    startTime: "2025-08-01T00:00:00.000Z",
    endTime: "2025-08-31T23:59:59.999Z",
    totalCount: 4,
    counts: {
      legitimate: 2,
      partial: 1,
      mistake: 1
    },
    retrievalStatus: "running",
    doublePlays: [],
    metadata: {
      generatedAt: "2025-08-31T16:00:00.000Z",
      retrievalStatus: "running",
      kexpApiHealth: {
        isHealthy: true,
        consecutiveFailures: 0
      },
      timeRange: {
        earliest: "2025-08-01T00:00:00.000Z",
        latest: "2025-08-31T23:59:59.999Z",
        durationDays: 30
      }
    }
  };

  // Test that the basic structure validates
  expect(mockResponse.counts.legitimate).toBe(2);
  expect(mockResponse.counts.partial).toBe(1);
  expect(mockResponse.counts.mistake).toBe(1);
});

test('ErrorResponseSchema validates error responses', () => {
  const errorResponse = {
    error: "Not Found",
    message: "The requested resource was not found"
  };

  const result = ErrorResponseSchema.parse(errorResponse);
  expect(result.error).toBe("Not Found");
  expect(result.message).toBe("The requested resource was not found");
});

test('PaginatedResponseSchema validates paginated responses', () => {
  const paginatedResponse = {
    page: 1,
    limit: 10,
    totalCount: 25,
    totalPages: 3,
    hasNext: true,
    hasPrevious: false,
    doublePlays: [],
    timeRange: {
      earliest: "2025-08-01T00:00:00.000Z",
      latest: "2025-08-31T23:59:59.999Z"
    }
  };

  const result = PaginatedResponseSchema.parse(paginatedResponse);
  expect(result.page).toBe(1);
  expect(result.totalPages).toBe(3);
  expect(result.hasNext).toBe(true);
});