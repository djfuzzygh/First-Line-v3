# ErrorHandler Utility

Centralized error handling utility for FirstLine Healthcare Triage Platform Lambda functions.

## Overview

The `ErrorHandler` class provides:
- **Consistent error response format** across all API endpoints
- **CloudWatch logging** with structured log entries
- **Request ID tracking** for debugging and tracing
- **Type-safe error codes** using TypeScript enums
- **Automatic status code mapping** for different error types

## Features

### 1. Standardized Error Response Format

All errors follow this structure:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "User-friendly error message",
    "details": "Technical details for debugging (optional)",
    "requestId": "uuid-v4",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

### 2. Request ID Tracking

Every response includes an `X-Request-ID` header for tracking requests across Lambda invocations and services.

### 3. CloudWatch Logging

Errors are automatically logged to CloudWatch with:
- Structured JSON format
- Appropriate log level (ERROR for 5xx, WARN for 4xx)
- Request ID for correlation
- Timestamp and error details

### 4. Error Types

Supported error types with automatic status code mapping:

| Error Type | HTTP Status | Use Case |
|------------|-------------|----------|
| `VALIDATION_ERROR` | 400 | Invalid input data |
| `AUTHENTICATION_ERROR` | 401 | Missing or invalid credentials |
| `AUTHORIZATION_ERROR` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `ALREADY_EXISTS` | 409 | Duplicate resource |
| `RATE_LIMIT_ERROR` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `AI_ENGINE_ERROR` | 503 | AI service unavailable |
| `DATABASE_ERROR` | 503 | Database connection failed |
| `EXTERNAL_SERVICE_ERROR` | 503 | External service unavailable |
| `TIMEOUT_ERROR` | 504 | Request timeout |

## Usage

### Basic Usage

```typescript
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ErrorHandler, ErrorType, getRequestIdFromEvent } from '../utils/error-handler';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  // Create ErrorHandler instance with request ID from event
  const errorHandler = new ErrorHandler(getRequestIdFromEvent(event));

  try {
    // Your business logic here
    const data = { result: 'success' };
    
    // Return success response
    return errorHandler.createSuccessResponse(data);
  } catch (error) {
    // Handle unexpected errors
    return errorHandler.handleUnexpectedError(error, 'processing request');
  }
};
```

### Validation Errors

```typescript
const errorHandler = new ErrorHandler(getRequestIdFromEvent(event));

// Validate input
if (!body.age || typeof body.age !== 'number') {
  return errorHandler.createErrorResponse(
    ErrorType.VALIDATION_ERROR,
    'Invalid input',
    'Age must be a number between 0 and 150'
  );
}
```

### Not Found Errors

```typescript
const encounter = await getEncounter(encounterId);
if (!encounter) {
  return errorHandler.createErrorResponse(
    ErrorType.NOT_FOUND,
    'Encounter not found',
    `Encounter with ID ${encounterId} does not exist`
  );
}
```

### Service Errors

```typescript
try {
  const result = await callAIService();
} catch (error) {
  return errorHandler.createErrorResponse(
    ErrorType.AI_ENGINE_ERROR,
    'AI service unavailable',
    'The AI engine is currently unavailable. Please try again later.'
  );
}
```

### Quick Errors (Static Method)

For simple cases where you don't need an instance:

```typescript
if (!apiKey) {
  return ErrorHandler.createQuickError(
    ErrorType.AUTHENTICATION_ERROR,
    'Authentication required',
    'API key is missing'
  );
}
```

### Success Responses

```typescript
// Default 200 status
return errorHandler.createSuccessResponse({ id: '123', status: 'active' });

// Custom status code (e.g., 201 for created)
return errorHandler.createSuccessResponse(
  { encounterId: 'enc-123' },
  201
);
```

### Unexpected Errors

```typescript
try {
  // Complex business logic
} catch (error) {
  // Automatically logs error with stack trace and returns 500 response
  return errorHandler.handleUnexpectedError(error, 'processing triage');
}
```

## API Reference

### Constructor

```typescript
new ErrorHandler(requestId?: string)
```

Creates a new ErrorHandler instance. If `requestId` is not provided, generates a new UUID.

### Methods

#### `createErrorResponse()`

```typescript
createErrorResponse(
  errorType: ErrorType,
  message: string,
  details?: string,
  statusCode?: number
): APIGatewayProxyResult
```

Creates a standardized error response with automatic logging.

**Parameters:**
- `errorType`: Error type from `ErrorType` enum
- `message`: User-friendly error message
- `details`: Optional technical details for debugging
- `statusCode`: Optional custom status code (overrides default)

**Returns:** API Gateway proxy result with error response

#### `handleUnexpectedError()`

```typescript
handleUnexpectedError(
  error: unknown,
  context?: string
): APIGatewayProxyResult
```

Handles unexpected errors and converts them to standardized responses.

**Parameters:**
- `error`: The caught error (any type)
- `context`: Optional context about where the error occurred

**Returns:** API Gateway proxy result with 500 error response

#### `createSuccessResponse()`

```typescript
createSuccessResponse(
  data: any,
  statusCode: number = 200
): APIGatewayProxyResult
```

Creates a success response with request ID tracking.

**Parameters:**
- `data`: Response data (will be JSON stringified)
- `statusCode`: HTTP status code (default: 200)

**Returns:** API Gateway proxy result with success response

#### `getRequestId()`

```typescript
getRequestId(): string
```

Returns the current request ID.

### Static Methods

#### `createQuickError()`

```typescript
static createQuickError(
  errorType: ErrorType,
  message: string,
  details?: string
): APIGatewayProxyResult
```

Creates an error response without creating an ErrorHandler instance.

### Helper Functions

#### `getRequestIdFromEvent()`

```typescript
getRequestIdFromEvent(event: any): string
```

Extracts request ID from API Gateway event or generates a new one.

**Priority:**
1. `event.requestContext.requestId`
2. `event.headers['X-Request-ID']`
3. `event.headers['x-request-id']`
4. Generate new UUID

## Migration Guide

To migrate existing handlers:

### Before

```typescript
function createErrorResponse(
  statusCode: number,
  errorCode: string,
  message: string,
  details?: string
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({
      error: {
        code: errorCode,
        message,
        details,
        requestId: uuidv4(),
        timestamp: new Date().toISOString(),
      },
    }),
  };
}

export const handler = async (event) => {
  try {
    // logic
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    };
  } catch (error) {
    console.error('Error:', error);
    return createErrorResponse(500, 'INTERNAL_ERROR', 'Error occurred');
  }
};
```

### After

```typescript
import { ErrorHandler, ErrorType, getRequestIdFromEvent } from '../utils/error-handler';

export const handler = async (event) => {
  const errorHandler = new ErrorHandler(getRequestIdFromEvent(event));
  
  try {
    // logic
    return errorHandler.createSuccessResponse(data);
  } catch (error) {
    return errorHandler.handleUnexpectedError(error, 'processing request');
  }
};
```

## Benefits

1. **Consistency**: All errors follow the same format across all handlers
2. **Maintainability**: Centralized error handling logic
3. **Debugging**: Request ID tracking and structured logging
4. **Type Safety**: TypeScript enums prevent typos in error codes
5. **Less Boilerplate**: Reduces repetitive error handling code
6. **Automatic Logging**: No need to manually log errors

## CloudWatch Log Format

Errors are logged with this structure:

```json
{
  "level": "ERROR",
  "requestId": "abc-123",
  "errorType": "VALIDATION_ERROR",
  "message": "Invalid input",
  "details": "Age must be a number",
  "statusCode": 400,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

This structured format makes it easy to:
- Search logs by request ID
- Filter by error type
- Create CloudWatch metrics and alarms
- Debug issues across multiple Lambda invocations

## Testing

The ErrorHandler includes comprehensive unit tests covering:
- Error response structure
- Status code mapping
- CloudWatch logging
- Request ID tracking
- Success responses
- Unexpected error handling

Run tests:
```bash
npm test -- error-handler.test.ts
```

## Requirements

Validates **Requirement 17.2**: Error Handling and Reliability
- Consistent error response structure
- CloudWatch logging integration
- Request ID tracking
- User-friendly error messages
