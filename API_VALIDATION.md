# API Runtime Type Validation

This document describes the runtime type validation system implemented using Zod for all API endpoints exposed to the frontend.

## Overview

All API endpoints now use runtime validation to ensure:
- **Type Safety**: All responses match their declared schemas
- **Data Integrity**: Invalid data is caught before being sent to clients
- **Error Handling**: Validation failures result in proper error responses
- **Developer Experience**: TypeScript types are automatically inferred from Zod schemas

## Validated Endpoints

### 1. `/api/health` - Health Status
**Schema**: `HealthResponseSchema`
**Type**: `HealthResponse`

Returns comprehensive system health information including:
- Scanner status and uptime
- Scanning progress data (current chunk, progress percentage, queue status)
- KEXP API health status
- System metrics (memory, CPU, load average)
- API version information

### 2. `/api/double-plays` - All Double Plays
**Schema**: `DoubleePlaysResponseSchema`  
**Type**: `DoubleePlaysResponse`

Returns complete dataset with metadata:
- All double play entries with duration and classification
- Total count and retrieval status
- Metadata including generation time and API health
- Time range coverage information

### 3. `/api/double-plays/paginated` - Paginated Double Plays
**Schema**: `PaginatedResponseSchema`
**Type**: `PaginatedResponse`
**Query Validation**: `PaginationQuerySchema`

Returns paginated results with navigation:
- Query parameters validated: `page` (≥1), `limit` (1-100)
- Pagination metadata (hasNext, hasPrevious, totalPages)
- Double play entries for current page
- Time range information

### 4. `/api/stats` - Statistics
**Schema**: `StatsResponseSchema`
**Type**: `StatsResponse`

Returns analytical data:
- Summary statistics (total plays, unique artists/DJs/shows)
- Top artists, DJs, and shows (ranked by play count)
- Play count distribution
- Time span coverage

### 5. `/api` - API Information
**Schema**: `ApiInfoResponseSchema`
**Type**: `ApiInfoResponse`

Returns API metadata:
- API name, version, description
- Available endpoint descriptions
- Generation timestamp

### Error Responses
**Schema**: `ErrorResponseSchema`
**Type**: `ErrorResponse`

All error responses use consistent structure:
- Error message and optional details
- Available endpoints for 404 errors
- Proper HTTP status codes

## Key Features

### Runtime Validation
```typescript
// All responses are validated before sending
this.sendValidatedResponse(res, data, Schema, statusCode);

// Query parameters are validated
const params = this.validateQueryParams<Type>(req.query, Schema);
```

### Type Safety
```typescript
// TypeScript types are automatically inferred from Zod schemas
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
```

### Error Handling
- Validation failures log detailed errors for debugging
- Clients receive clean, consistent error responses
- Invalid query parameters result in 400 Bad Request
- Internal validation failures result in 500 Internal Server Error

### Query Parameter Validation
- Automatic type coercion (string '10' → number 10)
- Range validation (page ≥ 1, limit 1-100)
- Default values applied when parameters are missing

## Example Usage

### Valid Pagination Request
```http
GET /api/double-plays/paginated?page=2&limit=25
```

### Invalid Pagination Request
```http
GET /api/double-plays/paginated?page=0&limit=200
# Returns 400 Bad Request with error details
```

### Response Structure
All successful responses are guaranteed to match their schemas:

```json
{
  "page": 2,
  "limit": 25,
  "totalCount": 150,
  "totalPages": 6,
  "hasNext": true,
  "hasPrevious": true,
  "doublePlays": [...],
  "timeRange": {
    "earliest": "2025-07-14T20:12:25.959Z",
    "latest": "2025-08-30T15:12:39.298Z"
  }
}
```

## Benefits

1. **Frontend Reliability**: Clients can trust API response structures
2. **Development Safety**: Catch data structure issues at runtime
3. **Debugging**: Detailed validation error logs for troubleshooting
4. **Documentation**: Schemas serve as living API documentation
5. **Type Consistency**: Shared types between frontend and backend
6. **Automatic Validation**: No need to manually check response structures

## Testing

Run the validation test suite:
```bash
bun run scripts/test-api-validation.ts
```

This tests all schemas with valid and invalid data to ensure proper validation behavior.