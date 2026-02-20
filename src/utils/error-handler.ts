/**
 * ErrorHandler Utility Class
 * Provides centralized error handling with consistent error response formatting,
 * CloudWatch logging, and request ID tracking across Lambda invocations.
 * 
 * Requirements: 17.2
 */

import { APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';

/**
 * Standard error response structure
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: string;
    requestId: string;
    timestamp: string;
  };
}

/**
 * Error types supported by the system
 */
export enum ErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  AI_ENGINE_ERROR = 'AI_ENGINE_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
}

/**
 * HTTP status codes for different error types
 */
const ERROR_STATUS_CODES: Record<ErrorType, number> = {
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

/**
 * ErrorHandler class for centralized error handling
 */
export class ErrorHandler {
  private requestId: string;

  /**
   * Create a new ErrorHandler instance
   * @param requestId - Optional request ID for tracking (generates new UUID if not provided)
   */
  constructor(requestId?: string) {
    this.requestId = requestId || uuidv4();
  }

  /**
   * Get the current request ID
   */
  getRequestId(): string {
    return this.requestId;
  }

  /**
   * Create a standardized error response
   * @param errorType - Type of error from ErrorType enum
   * @param message - User-friendly error message
   * @param details - Optional technical details for debugging
   * @param statusCode - Optional custom status code (overrides default for error type)
   * @returns APIGatewayProxyResult with formatted error
   */
  createErrorResponse(
    errorType: ErrorType,
    message: string,
    details?: string,
    statusCode?: number
  ): APIGatewayProxyResult {
    const status = statusCode || ERROR_STATUS_CODES[errorType];
    const errorResponse: ErrorResponse = {
      error: {
        code: errorType,
        message,
        details,
        requestId: this.requestId,
        timestamp: new Date().toISOString(),
      },
    };

    // Log error to CloudWatch
    this.logError(errorType, message, details, status);

    return {
      statusCode: status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-Request-ID': this.requestId,
      },
      body: JSON.stringify(errorResponse),
    };
  }

  /**
   * Handle unexpected errors and convert to standardized response
   * @param error - The caught error
   * @param context - Optional context about where the error occurred
   * @returns APIGatewayProxyResult with formatted error
   */
  handleUnexpectedError(
    error: unknown,
    context?: string
  ): APIGatewayProxyResult {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    const message = context
      ? `An error occurred while ${context}`
      : 'An internal error occurred';

    // Log full error details to CloudWatch
    console.error('Unexpected error:', {
      requestId: this.requestId,
      context,
      message: errorMessage,
      stack: errorStack,
      timestamp: new Date().toISOString(),
    });

    return this.createErrorResponse(
      ErrorType.INTERNAL_ERROR,
      message,
      errorMessage
    );
  }

  /**
   * Log error to CloudWatch with structured format
   * @param errorType - Type of error
   * @param message - Error message
   * @param details - Optional details
   * @param statusCode - HTTP status code
   */
  private logError(
    errorType: ErrorType,
    message: string,
    details?: string,
    statusCode?: number
  ): void {
    const logEntry = {
      level: this.getLogLevel(statusCode || 500),
      requestId: this.requestId,
      errorType,
      message,
      details,
      statusCode,
      timestamp: new Date().toISOString(),
    };

    // Use appropriate console method based on severity
    if (statusCode && statusCode >= 500) {
      console.error('Error:', logEntry);
    } else if (statusCode && statusCode >= 400) {
      console.warn('Client error:', logEntry);
    } else {
      console.log('Error:', logEntry);
    }
  }

  /**
   * Determine log level based on status code
   */
  private getLogLevel(statusCode: number): string {
    if (statusCode >= 500) return 'ERROR';
    if (statusCode >= 400) return 'WARN';
    return 'INFO';
  }

  /**
   * Create a success response with request ID tracking
   * @param data - Response data
   * @param statusCode - HTTP status code (default: 200)
   * @returns APIGatewayProxyResult with formatted success response
   */
  createSuccessResponse(
    data: any,
    statusCode: number = 200
  ): APIGatewayProxyResult {
    return {
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-Request-ID': this.requestId,
      },
      body: JSON.stringify(data),
    };
  }

  /**
   * Static helper to create error response without instance
   * Useful for quick error responses without creating an ErrorHandler instance
   */
  static createQuickError(
    errorType: ErrorType,
    message: string,
    details?: string
  ): APIGatewayProxyResult {
    const handler = new ErrorHandler();
    return handler.createErrorResponse(errorType, message, details);
  }
}

/**
 * Helper function to extract request ID from API Gateway event
 * @param event - API Gateway event
 * @returns Request ID from event or generates new one
 */
export function getRequestIdFromEvent(event: any): string {
  return (
    event.requestContext?.requestId ||
    event.headers?.['X-Request-ID'] ||
    event.headers?.['x-request-id'] ||
    uuidv4()
  );
}
