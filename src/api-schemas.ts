import { z } from 'zod';

// Base schemas for common data structures
export const PlaySchema = z.object({
  timestamp: z.string(),
  end_timestamp: z.string().optional(),
  play_id: z.number()
});

export const DoublePlaySchema = z.object({
  artist: z.string(),
  title: z.string(),
  plays: z.array(PlaySchema),
  dj: z.string().optional(),
  show: z.string().optional(),
  duration: z.number().optional(),
  classification: z.enum(['legitimate', 'partial', 'mistake']).optional()
});

export const ScanStatsSchema = z.object({
  totalScanTimeMs: z.number(),
  totalApiRequests: z.number(),
  lastScanDuration: z.number(),
  lastScanRequests: z.number(),
  lastScanTime: z.string(),
  scanDirection: z.enum(['forward', 'backward', 'mixed'])
});

export const ScanningProgressSchema = z.object({
  currentScanType: z.enum(['forward', 'backward', 'idle']),
  currentChunkStart: z.string().nullable(),
  currentChunkEnd: z.string().nullable(),
  progressPercentage: z.number(),
  queueLength: z.number(),
  requests: z.object({
    total: z.number(),
    forward: z.number(),
    backward: z.number()
  }),
  currentRetryCount: z.number(),
  isRunning: z.boolean(),
  historicalScanStopDate: z.string().optional()
});

export const MemoryUsageSchema = z.object({
  rss: z.number(),
  heapUsed: z.number(),
  heapTotal: z.number(),
  external: z.number()
});

export const SystemInfoSchema = z.object({
  nodeVersion: z.string(),
  platform: z.string(),
  architecture: z.string(),
  memoryUsage: MemoryUsageSchema,
  loadAverage: z.array(z.number()).nullable(),
  cpuCount: z.number()
});

export const KEXPApiHealthSchema = z.object({
  isHealthy: z.boolean(),
  consecutiveFailures: z.number(),
  lastFailureTime: z.string().nullable()
});

export const ScannerInfoSchema = z.object({
  earliestScanDate: z.string(),
  latestScanDate: z.string(),
  totalDoublePlays: z.number(),
  scanDuration: z.number(),
  avgDoublePlaysPerDay: z.number(),
  dataFileExists: z.boolean()
});

// API Response Schemas
export const HealthResponseSchema = z.object({
  status: z.enum(['starting', 'running', 'stopped', 'error']),
  uptime: z.number(),
  startTime: z.string(),
  lastScanTime: z.string().nullable(),
  lastError: z.string().nullable(),
  retrievalStatus: z.string(),
  scanner: ScannerInfoSchema,
  scanningProgress: ScanningProgressSchema.nullable(),
  kexpApi: KEXPApiHealthSchema,
  system: SystemInfoSchema,
  api: z.object({
    version: z.string(),
    timestamp: z.string()
  })
});

export const TimeRangeSchema = z.object({
  earliest: z.string(),
  latest: z.string(),
  durationDays: z.number()
});

export const MetadataSchema = z.object({
  generatedAt: z.string(),
  retrievalStatus: z.string(),
  kexpApiHealth: z.object({
    isHealthy: z.boolean(),
    consecutiveFailures: z.number()
  }),
  timeRange: TimeRangeSchema
});

export const DoubleePlaysResponseSchema = z.object({
  startTime: z.string(),
  endTime: z.string(),
  totalCount: z.number(),
  retrievalStatus: z.string(),
  doublePlays: z.array(DoublePlaySchema),
  metadata: MetadataSchema
});

export const PaginatedResponseSchema = z.object({
  page: z.number(),
  limit: z.number(),
  totalCount: z.number(),
  totalPages: z.number(),
  hasNext: z.boolean(),
  hasPrevious: z.boolean(),
  doublePlays: z.array(DoublePlaySchema),
  timeRange: z.object({
    earliest: z.string(),
    latest: z.string()
  })
});

export const ArtistStatSchema = z.object({
  artist: z.string(),
  count: z.number()
});

export const DJStatSchema = z.object({
  dj: z.string(),
  count: z.number()
});

export const ShowStatSchema = z.object({
  show: z.string(),
  count: z.number()
});

export const TimespanSchema = z.object({
  start: z.string(),
  end: z.string(),
  days: z.number()
});

export const SummarySchema = z.object({
  totalDoublePlays: z.number(),
  uniqueArtists: z.number(),
  uniqueDJs: z.number(),
  uniqueShows: z.number(),
  timespan: TimespanSchema
});

export const StatsResponseSchema = z.object({
  summary: SummarySchema,
  topArtists: z.array(ArtistStatSchema),
  topDJs: z.array(DJStatSchema),
  topShows: z.array(ShowStatSchema),
  playCountDistribution: z.record(z.string(), z.number()),
  generatedAt: z.string()
});

export const ApiInfoResponseSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  endpoints: z.record(z.string(), z.string()),
  timestamp: z.string()
});

export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  availableEndpoints: z.array(z.string()).optional()
});

// Query parameter schemas
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10)
});

// Type exports for use in TypeScript
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type DoubleePlaysResponse = z.infer<typeof DoubleePlaysResponseSchema>;
export type PaginatedResponse = z.infer<typeof PaginatedResponseSchema>;
export type StatsResponse = z.infer<typeof StatsResponseSchema>;
export type ApiInfoResponse = z.infer<typeof ApiInfoResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
export type DoublePlay = z.infer<typeof DoublePlaySchema>;
export type ScanStats = z.infer<typeof ScanStatsSchema>;
export type ScanningProgress = z.infer<typeof ScanningProgressSchema>;