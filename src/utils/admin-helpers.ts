/**
 * Admin Handler Helper Utilities
 * Provides common utilities for admin handlers
 */

import { APIGatewayProxyResult } from 'aws-lambda';
import { ErrorHandler, ErrorType } from './error-handler';

/**
 * Create a standardized error response for admin handlers
 */
export function handleError(error: any, context?: string): APIGatewayProxyResult {
  const errorHandler = new ErrorHandler();
  return errorHandler.handleUnexpectedError(error, context);
}

/**
 * Create a success response
 */
export function createSuccessResponse(data: any, statusCode: number = 200): APIGatewayProxyResult {
  const errorHandler = new ErrorHandler();
  return errorHandler.createSuccessResponse(data, statusCode);
}

/**
 * Create an error response
 */
export function createErrorResponse(
  errorType: ErrorType,
  message: string,
  details?: string
): APIGatewayProxyResult {
  const errorHandler = new ErrorHandler();
  return errorHandler.createErrorResponse(errorType, message, details);
}
