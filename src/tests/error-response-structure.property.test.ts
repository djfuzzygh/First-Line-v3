/**
 * Property-Based Test: Error Response Structure
 * 
 * Property 35: Error Response Structure
 * 
 * For any failed API request, the system should return a user-friendly error
 * message with a consistent structure including error code, message, and request ID.
 * 
 * **Validates: Requirements 17.2**
 * 
 * Feature: firstline-triage-platform, Property 35: Error Response Structure
 */

import * as fc from 'fast-check';
import { ErrorHandler, ErrorType } from '../utils/error-handler';

describe('Property 35: Error Response Structure', () => {
  /**
   * Generator for all possible error types
   */
  const errorTypeArbitrary = fc.constantFrom(
    ErrorType.VALIDATION_ERROR,
    ErrorType.NOT_FOUND,
    ErrorType.ALREADY_EXISTS,
    ErrorType.AUTHENTICATION_ERROR,
    ErrorType.AUTHORIZATION_ERROR,
    ErrorType.AI_ENGINE_ERROR,
    ErrorType.DATABASE_ERROR,
    ErrorType.EXTERNAL_SERVICE_ERROR,
    ErrorType.INTERNAL_ERROR,
    ErrorType.RATE_LIMIT_ERROR,
    ErrorType.TIMEOUT_ERROR
  );

  /**
   * Generator for error messages
   */
  const errorMessageArbitrary = fc.oneof(
    fc.string({ minLength: 1, maxLength: 200 }),
    fc.constantFrom(
      'Invalid input provided',
      'Resource not found',
      'Authentication failed',
      'Service temporarily unavailable',
      'Request timeout',
      'Rate limit exceeded'
    )
  );

  /**
   * Generator for optional error details
   */
  const errorDetailsArbitrary = fc.option(
    fc.oneof(
      fc.string({ minLength: 1, maxLength: 500 }),
      fc.constantFrom(
        'Age must be a positive number',
        'Encounter ID does not exist',
        'Invalid API key format',
        'DynamoDB connection timeout',
        'Bedrock API unavailable'
      )
    ),
    { nil: undefined }
  );

  /**
   * Generator for request IDs
   */
  const requestIdArbitrary = fc.option(
    fc.oneof(
      fc.uuid(),
      fc.string({ minLength: 10, maxLength: 50 })
    ),
    { nil: undefined }
  );

  it('should always include required fields in error response', async () => {
    await fc.assert(
      fc.asyncProperty(
        errorTypeArbitrary,
        errorMessageArbitrary,
        errorDetailsArbitrary,
        requestIdArbitrary,
        async (errorType, message, details, requestId) => {
          // Arrange: Create ErrorHandler with optional request ID
          const handler = requestId ? new ErrorHandler(requestId) : new ErrorHandler();

          // Act: Create error response
          const response = handler.createErrorResponse(errorType, message, details);

          // Assert: Response structure
          expect(response).toBeDefined();
          expect(response.statusCode).toBeGreaterThanOrEqual(400);
          expect(response.statusCode).toBeLessThan(600);
          expect(response.headers).toBeDefined();
          expect(response.body).toBeDefined();

          // Parse body
          const body = JSON.parse(response.body);

          // Requirement 17.2: Error response MUST have consistent structure
          expect(body.error).toBeDefined();
          expect(body.error.code).toBeDefined();
          expect(body.error.message).toBeDefined();
          expect(body.error.requestId).toBeDefined();
          expect(body.error.timestamp).toBeDefined();

          // Verify field types
          expect(typeof body.error.code).toBe('string');
          expect(typeof body.error.message).toBe('string');
          expect(typeof body.error.requestId).toBe('string');
          expect(typeof body.error.timestamp).toBe('string');

          // Verify code matches error type
          expect(body.error.code).toBe(errorType);

          // Verify message matches input
          expect(body.error.message).toBe(message);

          // Verify details if provided
          if (details !== undefined) {
            expect(body.error.details).toBe(details);
          }

          // Verify request ID matches if provided
          if (requestId) {
            expect(body.error.requestId).toBe(requestId);
          }

          // Verify timestamp is valid ISO8601
          const timestamp = new Date(body.error.timestamp);
          expect(timestamp.toISOString()).toBe(body.error.timestamp);
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should include X-Request-ID header in all error responses', async () => {
    await fc.assert(
      fc.asyncProperty(
        errorTypeArbitrary,
        errorMessageArbitrary,
        requestIdArbitrary,
        async (errorType, message, requestId) => {
          // Arrange
          const handler = requestId ? new ErrorHandler(requestId) : new ErrorHandler();

          // Act
          const response = handler.createErrorResponse(errorType, message);

          // Assert: X-Request-ID header must be present
          expect(response.headers).toBeDefined();
          expect(response.headers!['X-Request-ID']).toBeDefined();
          expect(typeof response.headers!['X-Request-ID']).toBe('string');

          // Verify it matches the request ID in the body
          const body = JSON.parse(response.body);
          expect(response.headers!['X-Request-ID']).toBe(body.error.requestId);

          // If request ID was provided, verify it matches
          if (requestId) {
            expect(response.headers!['X-Request-ID']).toBe(requestId);
          }
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should return appropriate HTTP status codes for different error types', async () => {
    await fc.assert(
      fc.asyncProperty(
        errorTypeArbitrary,
        errorMessageArbitrary,
        async (errorType, message) => {
          // Arrange
          const handler = new ErrorHandler();

          // Act
          const response = handler.createErrorResponse(errorType, message);

          // Assert: Status code should match error type
          const expectedStatusCodes: Record<ErrorType, number> = {
            [ErrorType.VALIDATION_ERROR]: 400,
            [ErrorType.NOT_FOUND]: 404,
            [ErrorType.ALREADY_EXISTS]: 409,
            [ErrorType.AUTHENTICATION_ERROR]: 401,
            [ErrorType.AUTHORIZATION_ERROR]: 403,
            [ErrorType.AI_ENGINE_ERROR]: 503,
            [ErrorType.DATABASE_ERROR]: 503,
            [ErrorType.EXTERNAL_SERVICE_ERROR]: 503,
            [ErrorType.INTERNAL_ERROR]: 500,
            [ErrorType.RATE_LIMIT_ERROR]: 429,
            [ErrorType.TIMEOUT_ERROR]: 504,
          };

          expect(response.statusCode).toBe(expectedStatusCodes[errorType]);
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should handle unexpected errors with consistent structure', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          // Error instances
          fc.string({ minLength: 1, maxLength: 200 }).map(msg => new Error(msg)),
          // String errors
          fc.string({ minLength: 1, maxLength: 200 }),
          // Number errors
          fc.integer(),
          // Object errors
          fc.record({
            message: fc.string(),
            code: fc.string()
          })
        ),
        fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
        requestIdArbitrary,
        async (error, context, requestId) => {
          // Arrange
          const handler = requestId ? new ErrorHandler(requestId) : new ErrorHandler();

          // Act
          const response = handler.handleUnexpectedError(error, context);

          // Assert: Should have consistent error structure
          expect(response.statusCode).toBe(500);
          
          const body = JSON.parse(response.body);
          
          // Requirement 17.2: All errors must have consistent structure
          expect(body.error).toBeDefined();
          expect(body.error.code).toBe(ErrorType.INTERNAL_ERROR);
          expect(body.error.message).toBeDefined();
          expect(body.error.requestId).toBeDefined();
          expect(body.error.timestamp).toBeDefined();
          expect(body.error.details).toBeDefined();

          // Verify timestamp is valid
          const timestamp = new Date(body.error.timestamp);
          expect(timestamp.toISOString()).toBe(body.error.timestamp);

          // Verify headers
          expect(response.headers!['X-Request-ID']).toBe(body.error.requestId);
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should maintain structure consistency across multiple error creations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            errorType: errorTypeArbitrary,
            message: errorMessageArbitrary,
            details: errorDetailsArbitrary
          }),
          { minLength: 2, maxLength: 10 }
        ),
        requestIdArbitrary,
        async (errorConfigs, requestId) => {
          // Arrange: Create single handler instance
          const handler = requestId ? new ErrorHandler(requestId) : new ErrorHandler();

          // Act: Create multiple error responses
          const responses = errorConfigs.map(config =>
            handler.createErrorResponse(config.errorType, config.message, config.details)
          );

          // Assert: All responses should have same request ID
          const requestIds = responses.map(r => {
            const body = JSON.parse(r.body);
            return body.error.requestId;
          });

          // All request IDs should be the same (from the same handler instance)
          const uniqueRequestIds = new Set(requestIds);
          expect(uniqueRequestIds.size).toBe(1);

          // If request ID was provided, all should match it
          if (requestId) {
            requestIds.forEach(id => expect(id).toBe(requestId));
          }

          // All responses should have consistent structure
          responses.forEach(response => {
            const body = JSON.parse(response.body);
            expect(body.error).toHaveProperty('code');
            expect(body.error).toHaveProperty('message');
            expect(body.error).toHaveProperty('requestId');
            expect(body.error).toHaveProperty('timestamp');
          });
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should include CORS headers in error responses', async () => {
    await fc.assert(
      fc.asyncProperty(
        errorTypeArbitrary,
        errorMessageArbitrary,
        async (errorType, message) => {
          // Arrange
          const handler = new ErrorHandler();

          // Act
          const response = handler.createErrorResponse(errorType, message);

          // Assert: CORS headers should be present
          expect(response.headers).toBeDefined();
          expect(response.headers!['Content-Type']).toBe('application/json');
          expect(response.headers!['Access-Control-Allow-Origin']).toBe('*');
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should generate unique request IDs when not provided', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 20 }),
        errorTypeArbitrary,
        errorMessageArbitrary,
        async (count, errorType, message) => {
          // Arrange & Act: Create multiple handlers without request ID
          const handlers = Array.from({ length: count }, () => new ErrorHandler());
          const responses = handlers.map(h => h.createErrorResponse(errorType, message));

          // Assert: All request IDs should be unique
          const requestIds = responses.map(r => {
            const body = JSON.parse(r.body);
            return body.error.requestId;
          });

          const uniqueRequestIds = new Set(requestIds);
          expect(uniqueRequestIds.size).toBe(count);

          // All should be valid UUIDs or non-empty strings
          requestIds.forEach(id => {
            expect(id).toBeDefined();
            expect(typeof id).toBe('string');
            expect(id.length).toBeGreaterThan(0);
          });
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should preserve error details in response structure', async () => {
    await fc.assert(
      fc.asyncProperty(
        errorTypeArbitrary,
        errorMessageArbitrary,
        fc.string({ minLength: 1, maxLength: 500 }),
        async (errorType, message, details) => {
          // Arrange
          const handler = new ErrorHandler();

          // Act
          const response = handler.createErrorResponse(errorType, message, details);

          // Assert: Details should be preserved
          const body = JSON.parse(response.body);
          expect(body.error.details).toBe(details);
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should allow custom status code override while maintaining structure', async () => {
    await fc.assert(
      fc.asyncProperty(
        errorTypeArbitrary,
        errorMessageArbitrary,
        fc.integer({ min: 400, max: 599 }),
        async (errorType, message, customStatusCode) => {
          // Arrange
          const handler = new ErrorHandler();

          // Act
          const response = handler.createErrorResponse(
            errorType,
            message,
            undefined,
            customStatusCode
          );

          // Assert: Custom status code should be used
          expect(response.statusCode).toBe(customStatusCode);

          // But structure should remain consistent
          const body = JSON.parse(response.body);
          expect(body.error).toHaveProperty('code');
          expect(body.error).toHaveProperty('message');
          expect(body.error).toHaveProperty('requestId');
          expect(body.error).toHaveProperty('timestamp');
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should create quick errors with consistent structure', async () => {
    await fc.assert(
      fc.asyncProperty(
        errorTypeArbitrary,
        errorMessageArbitrary,
        errorDetailsArbitrary,
        async (errorType, message, details) => {
          // Act: Use static helper method
          const response = ErrorHandler.createQuickError(errorType, message, details);

          // Assert: Should have same structure as instance method
          expect(response.statusCode).toBeGreaterThanOrEqual(400);
          expect(response.statusCode).toBeLessThan(600);

          const body = JSON.parse(response.body);
          
          // Requirement 17.2: Consistent structure
          expect(body.error).toBeDefined();
          expect(body.error.code).toBe(errorType);
          expect(body.error.message).toBe(message);
          expect(body.error.requestId).toBeDefined();
          expect(body.error.timestamp).toBeDefined();

          if (details !== undefined) {
            expect(body.error.details).toBe(details);
          }

          // Verify headers
          expect(response.headers!['X-Request-ID']).toBe(body.error.requestId);
          expect(response.headers!['Content-Type']).toBe('application/json');
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);
});
