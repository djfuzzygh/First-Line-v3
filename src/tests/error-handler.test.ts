/**
 * Unit tests for ErrorHandler utility class
 * Tests error response formatting, CloudWatch logging, and request ID tracking
 */

import { ErrorHandler, ErrorType, getRequestIdFromEvent } from '../utils/error-handler';

describe('ErrorHandler', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    // Spy on console methods to verify logging
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    // Restore console methods
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should generate a request ID if not provided', () => {
      const handler = new ErrorHandler();
      const requestId = handler.getRequestId();

      expect(requestId).toBeDefined();
      expect(typeof requestId).toBe('string');
      expect(requestId.length).toBeGreaterThan(0);
    });

    it('should use provided request ID', () => {
      const customRequestId = 'test-request-123';
      const handler = new ErrorHandler(customRequestId);

      expect(handler.getRequestId()).toBe(customRequestId);
    });
  });

  describe('createErrorResponse', () => {
    it('should create error response with correct structure', () => {
      const handler = new ErrorHandler('test-request-id');
      const response = handler.createErrorResponse(
        ErrorType.VALIDATION_ERROR,
        'Invalid input',
        'Age must be a positive number'
      );

      expect(response.statusCode).toBe(400);
      expect(response.headers).toEqual({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-Request-ID': 'test-request-id',
      });

      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('Invalid input');
      expect(body.error.details).toBe('Age must be a positive number');
      expect(body.error.requestId).toBe('test-request-id');
      expect(body.error.timestamp).toBeDefined();
    });

    it('should use correct status codes for different error types', () => {
      const handler = new ErrorHandler();

      const testCases = [
        { type: ErrorType.VALIDATION_ERROR, expectedStatus: 400 },
        { type: ErrorType.AUTHENTICATION_ERROR, expectedStatus: 401 },
        { type: ErrorType.AUTHORIZATION_ERROR, expectedStatus: 403 },
        { type: ErrorType.NOT_FOUND, expectedStatus: 404 },
        { type: ErrorType.ALREADY_EXISTS, expectedStatus: 409 },
        { type: ErrorType.RATE_LIMIT_ERROR, expectedStatus: 429 },
        { type: ErrorType.INTERNAL_ERROR, expectedStatus: 500 },
        { type: ErrorType.AI_ENGINE_ERROR, expectedStatus: 503 },
        { type: ErrorType.DATABASE_ERROR, expectedStatus: 503 },
        { type: ErrorType.EXTERNAL_SERVICE_ERROR, expectedStatus: 503 },
        { type: ErrorType.TIMEOUT_ERROR, expectedStatus: 504 },
      ];

      testCases.forEach(({ type, expectedStatus }) => {
        const response = handler.createErrorResponse(type, 'Test message');
        expect(response.statusCode).toBe(expectedStatus);
      });
    });

    it('should allow custom status code override', () => {
      const handler = new ErrorHandler();
      const response = handler.createErrorResponse(
        ErrorType.VALIDATION_ERROR,
        'Custom error',
        undefined,
        418 // I'm a teapot
      );

      expect(response.statusCode).toBe(418);
    });

    it('should log errors to CloudWatch', () => {
      const handler = new ErrorHandler('test-request-id');
      handler.createErrorResponse(
        ErrorType.INTERNAL_ERROR,
        'Server error',
        'Database connection failed'
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error:',
        expect.objectContaining({
          level: 'ERROR',
          requestId: 'test-request-id',
          errorType: ErrorType.INTERNAL_ERROR,
          message: 'Server error',
          details: 'Database connection failed',
          statusCode: 500,
        })
      );
    });

    it('should use console.warn for 4xx errors', () => {
      const handler = new ErrorHandler();
      handler.createErrorResponse(
        ErrorType.VALIDATION_ERROR,
        'Bad request'
      );

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Client error:',
        expect.objectContaining({
          level: 'WARN',
          errorType: ErrorType.VALIDATION_ERROR,
        })
      );
    });

    it('should use console.error for 5xx errors', () => {
      const handler = new ErrorHandler();
      handler.createErrorResponse(
        ErrorType.DATABASE_ERROR,
        'Database error'
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error:',
        expect.objectContaining({
          level: 'ERROR',
          errorType: ErrorType.DATABASE_ERROR,
        })
      );
    });
  });

  describe('handleUnexpectedError', () => {
    it('should handle Error instances', () => {
      const handler = new ErrorHandler('test-request-id');
      const error = new Error('Something went wrong');
      const response = handler.handleUnexpectedError(error, 'processing request');

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toBe('An error occurred while processing request');
      expect(body.error.details).toBe('Something went wrong');
      expect(body.error.requestId).toBe('test-request-id');
    });

    it('should handle non-Error objects', () => {
      const handler = new ErrorHandler();
      const response = handler.handleUnexpectedError('String error');

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error.details).toBe('String error');
    });

    it('should log unexpected errors with stack trace', () => {
      const handler = new ErrorHandler('test-request-id');
      const error = new Error('Test error');
      handler.handleUnexpectedError(error, 'testing');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Unexpected error:',
        expect.objectContaining({
          requestId: 'test-request-id',
          context: 'testing',
          message: 'Test error',
          stack: expect.any(String),
        })
      );
    });

    it('should work without context parameter', () => {
      const handler = new ErrorHandler();
      const error = new Error('Test error');
      const response = handler.handleUnexpectedError(error);

      const body = JSON.parse(response.body);
      expect(body.error.message).toBe('An internal error occurred');
    });
  });

  describe('createSuccessResponse', () => {
    it('should create success response with request ID', () => {
      const handler = new ErrorHandler('test-request-id');
      const data = { result: 'success', value: 42 };
      const response = handler.createSuccessResponse(data);

      expect(response.statusCode).toBe(200);
      expect(response.headers).toEqual({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-Request-ID': 'test-request-id',
      });

      const body = JSON.parse(response.body);
      expect(body).toEqual(data);
    });

    it('should allow custom status code', () => {
      const handler = new ErrorHandler();
      const response = handler.createSuccessResponse({ created: true }, 201);

      expect(response.statusCode).toBe(201);
    });
  });

  describe('createQuickError', () => {
    it('should create error response without instance', () => {
      const response = ErrorHandler.createQuickError(
        ErrorType.NOT_FOUND,
        'Resource not found',
        'Encounter ID does not exist'
      );

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toBe('Resource not found');
      expect(body.error.details).toBe('Encounter ID does not exist');
      expect(body.error.requestId).toBeDefined();
    });
  });

  describe('getRequestIdFromEvent', () => {
    it('should extract request ID from requestContext', () => {
      const event = {
        requestContext: {
          requestId: 'context-request-id',
        },
      } as any;

      const requestId = getRequestIdFromEvent(event);
      expect(requestId).toBe('context-request-id');
    });

    it('should extract request ID from headers (capitalized)', () => {
      const event = {
        headers: {
          'X-Request-ID': 'header-request-id',
        },
      } as any;

      const requestId = getRequestIdFromEvent(event);
      expect(requestId).toBe('header-request-id');
    });

    it('should extract request ID from headers (lowercase)', () => {
      const event = {
        headers: {
          'x-request-id': 'lowercase-header-id',
        },
      } as any;

      const requestId = getRequestIdFromEvent(event);
      expect(requestId).toBe('lowercase-header-id');
    });

    it('should generate new UUID if no request ID found', () => {
      const event = {} as any;
      const requestId = getRequestIdFromEvent(event);

      expect(requestId).toBeDefined();
      expect(typeof requestId).toBe('string');
      expect(requestId.length).toBeGreaterThan(0);
    });

    it('should prioritize requestContext over headers', () => {
      const event = {
        requestContext: {
          requestId: 'context-id',
        },
        headers: {
          'X-Request-ID': 'header-id',
        },
      } as any;

      const requestId = getRequestIdFromEvent(event);
      expect(requestId).toBe('context-id');
    });
  });

  describe('error response format consistency', () => {
    it('should always include all required fields', () => {
      const handler = new ErrorHandler();
      const response = handler.createErrorResponse(
        ErrorType.VALIDATION_ERROR,
        'Test error'
      );

      const body = JSON.parse(response.body);
      expect(body.error).toHaveProperty('code');
      expect(body.error).toHaveProperty('message');
      expect(body.error).toHaveProperty('requestId');
      expect(body.error).toHaveProperty('timestamp');
    });

    it('should format timestamp as ISO8601', () => {
      const handler = new ErrorHandler();
      const response = handler.createErrorResponse(
        ErrorType.INTERNAL_ERROR,
        'Test'
      );

      const body = JSON.parse(response.body);
      const timestamp = body.error.timestamp;

      // Verify it's a valid ISO8601 timestamp
      expect(new Date(timestamp).toISOString()).toBe(timestamp);
    });

    it('should include X-Request-ID header in all responses', () => {
      const handler = new ErrorHandler('test-id');
      
      const errorResponse = handler.createErrorResponse(
        ErrorType.INTERNAL_ERROR,
        'Error'
      );
      expect(errorResponse.headers!['X-Request-ID']).toBe('test-id');

      const successResponse = handler.createSuccessResponse({ data: 'test' });
      expect(successResponse.headers!['X-Request-ID']).toBe('test-id');
    });
  });
});
