import { z } from 'zod';

// Classification counts schema
export const ClassificationCountsSchema = z.object({
  legitimate: z.number().int().min(0),
  partial: z.number().int().min(0), 
  mistake: z.number().int().min(0),
  total: z.number().int().min(0)
});

// Double plays response schema
export const DoubleePlaysResponseSchema = z.object({
  startTime: z.string(),
  endTime: z.string(),
  totalCount: z.number().int().min(0),
  counts: ClassificationCountsSchema,
  retrievalStatus: z.string(),
  doublePlays: z.array(z.any()), // Using any for now to avoid defining the full schema
  metadata: z.object({
    generatedAt: z.string(),
    retrievalStatus: z.string(),
    kexpApiHealth: z.object({
      isHealthy: z.boolean(),
      consecutiveFailures: z.number().int().min(0)
    }),
    timeRange: z.object({
      earliest: z.string(),
      latest: z.string(),
      durationDays: z.number().int().min(0)
    })
  })
});

// Health response schema (simplified for now)
export const HealthResponseSchema = z.any();

// Paginated response schema
export const PaginatedResponseSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1).max(100),
  totalCount: z.number().int().min(0),
  totalPages: z.number().int().min(0),
  hasNext: z.boolean(),
  hasPrevious: z.boolean(),
  doublePlays: z.array(z.any()),
  timeRange: z.object({
    earliest: z.string(),
    latest: z.string()
  })
});

// Stats response schema
export const StatsResponseSchema = z.any();

// API info response schema
export const ApiInfoResponseSchema = z.any();

// Error response schema
export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  availableEndpoints: z.array(z.string()).optional()
});

// Pagination query schema
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10)
});

// Type exports
export type ClassificationCounts = z.infer<typeof ClassificationCountsSchema>;
export type DoubleePlaysResponse = z.infer<typeof DoubleePlaysResponseSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type PaginatedResponse = z.infer<typeof PaginatedResponseSchema>;
export type StatsResponse = z.infer<typeof StatsResponseSchema>;
export type ApiInfoResponse = z.infer<typeof ApiInfoResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;