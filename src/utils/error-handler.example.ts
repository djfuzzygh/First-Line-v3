/**
 * Example: How to use ErrorHandler in Lambda functions
 * 
 * This file demonstrates how to refactor existing handlers to use
 * the centralized ErrorHandler utility for consistent error handling,
 * CloudWatch logging, and request ID tracking.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ErrorHandler, ErrorType, getRequestIdFromEvent } from './error-handler';

/**
 * EXAMPLE 1: Basic Lambda handler with ErrorHandler
 */
export const basicHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  // Extract or generate request ID from event
  const requestId = getRequestIdFromEvent(event);
  const errorHandler = new ErrorHandler(requestId);

  try {
    // Your business logic here
    const data = { message: 'Success' };
    
    // Return success response with request ID tracking
    return errorHandler.createSuccessResponse(data);
  } catch (error) {
    // Handle unexpected errors
    return errorHandler.handleUnexpectedError(error, 'processing request');
  }
};

/**
 * EXAMPLE 2: Handler with validation errors
 */
export const validationHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const errorHandler = new ErrorHandler(getRequestIdFromEvent(event));

  try {
    const body = JSON.parse(event.body || '{}');

    // Validate required fields
    if (!body.age || typeof body.age !== 'number') {
      return errorHandler.createErrorResponse(
        ErrorType.VALIDATION_ERROR,
        'Invalid input',
        'Age must be a number'
      );
    }

    if (!body.name || typeof body.name !== 'string') {
      return errorHandler.createErrorResponse(
        ErrorType.VALIDATION_ERROR,
        'Invalid input',
        'Name is required and must be a string'
      );
    }

    // Process valid data
    const result = { id: '123', ...body };
    return errorHandler.createSuccessResponse(result, 201);
  } catch (error) {
    return errorHandler.handleUnexpectedError(error, 'validating input');
  }
};

/**
 * EXAMPLE 3: Handler with different error types
 */
export const multiErrorHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const errorHandler = new ErrorHandler(getRequestIdFromEvent(event));

  try {
    const resourceId = event.pathParameters?.id;

    // Not found error
    if (!resourceId) {
      return errorHandler.createErrorResponse(
        ErrorType.NOT_FOUND,
        'Resource not found',
        'Resource ID is required'
      );
    }

    // Simulate checking if resource exists
    const resourceExists = false; // Replace with actual check
    if (!resourceExists) {
      return errorHandler.createErrorResponse(
        ErrorType.NOT_FOUND,
        'Resource not found',
        `Resource with ID ${resourceId} does not exist`
      );
    }

    // Simulate checking if resource already processed
    const alreadyProcessed = true; // Replace with actual check
    if (alreadyProcessed) {
      return errorHandler.createErrorResponse(
        ErrorType.ALREADY_EXISTS,
        'Resource already processed',
        `Resource ${resourceId} has already been processed`
      );
    }

    // Success case
    return errorHandler.createSuccessResponse({ resourceId, status: 'processed' });
  } catch (error) {
    return errorHandler.handleUnexpectedError(error, 'processing resource');
  }
};

/**
 * EXAMPLE 4: Handler with external service errors
 */
export const externalServiceHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const errorHandler = new ErrorHandler(getRequestIdFromEvent(event));

  try {
    // Simulate calling external AI service
    try {
      // const aiResult = await callAIService();
      throw new Error('AI service timeout');
    } catch (aiError) {
      return errorHandler.createErrorResponse(
        ErrorType.AI_ENGINE_ERROR,
        'AI service unavailable',
        'The AI engine is currently unavailable. Please try again later.'
      );
    }

    // Simulate database error
    try {
      // const dbResult = await database.query();
      throw new Error('Connection refused');
    } catch (dbError) {
      return errorHandler.createErrorResponse(
        ErrorType.DATABASE_ERROR,
        'Database error',
        'Unable to connect to database'
      );
    }

    return errorHandler.createSuccessResponse({ result: 'success' });
  } catch (error) {
    return errorHandler.handleUnexpectedError(error, 'calling external services');
  }
};

/**
 * EXAMPLE 5: Using static helper for quick errors
 */
export const quickErrorHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  // For simple cases where you don't need request ID tracking
  // or just want a quick error response
  
  const apiKey = event.headers?.['X-API-Key'];
  if (!apiKey) {
    return ErrorHandler.createQuickError(
      ErrorType.AUTHENTICATION_ERROR,
      'Authentication required',
      'API key is missing'
    );
  }

  // Continue with normal processing...
  const errorHandler = new ErrorHandler(getRequestIdFromEvent(event));
  return errorHandler.createSuccessResponse({ authenticated: true });
};

/**
 * EXAMPLE 6: Refactored encounter handler (partial)
 * Shows how to refactor the existing encounter-handler.ts
 */
export const refactoredEncounterHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const errorHandler = new ErrorHandler(getRequestIdFromEvent(event));

  try {
    const method = event.httpMethod;
    const path = event.path;

    // Route to appropriate handler
    if (method === 'POST' && path === '/encounters') {
      return await handleCreateEncounter(event, errorHandler);
    } else {
      return errorHandler.createErrorResponse(
        ErrorType.NOT_FOUND,
        'Endpoint not found',
        `No handler for ${method} ${path}`
      );
    }
  } catch (error) {
    return errorHandler.handleUnexpectedError(error, 'handling request');
  }
};

async function handleCreateEncounter(
  event: APIGatewayProxyEvent,
  errorHandler: ErrorHandler
): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');

    // Validation
    if (!body.age || typeof body.age !== 'number') {
      return errorHandler.createErrorResponse(
        ErrorType.VALIDATION_ERROR,
        'Invalid input',
        'Age is required and must be a number'
      );
    }

    // Business logic
    const encounterId = 'enc-123'; // Replace with actual logic
    
    return errorHandler.createSuccessResponse(
      {
        encounterId,
        timestamp: new Date().toISOString(),
        status: 'created',
      },
      201
    );
  } catch (error) {
    return errorHandler.handleUnexpectedError(error, 'creating encounter');
  }
}

/**
 * MIGRATION GUIDE:
 * 
 * To migrate existing handlers to use ErrorHandler:
 * 
 * 1. Import ErrorHandler utilities:
 *    import { ErrorHandler, ErrorType, getRequestIdFromEvent } from '../utils/error-handler';
 * 
 * 2. Create ErrorHandler instance at the start of your handler:
 *    const errorHandler = new ErrorHandler(getRequestIdFromEvent(event));
 * 
 * 3. Replace all createErrorResponse() calls with errorHandler.createErrorResponse():
 *    OLD: return createErrorResponse(400, 'VALIDATION_ERROR', 'Invalid input');
 *    NEW: return errorHandler.createErrorResponse(ErrorType.VALIDATION_ERROR, 'Invalid input');
 * 
 * 4. Replace success responses with errorHandler.createSuccessResponse():
 *    OLD: return { statusCode: 200, headers: {...}, body: JSON.stringify(data) };
 *    NEW: return errorHandler.createSuccessResponse(data);
 * 
 * 5. Use handleUnexpectedError() in catch blocks:
 *    OLD: catch (error) { console.error(error); return createErrorResponse(...); }
 *    NEW: catch (error) { return errorHandler.handleUnexpectedError(error, 'context'); }
 * 
 * 6. Remove old createErrorResponse() helper function
 * 
 * 7. Remove manual console.error() calls (ErrorHandler logs automatically)
 * 
 * Benefits:
 * - Consistent error format across all handlers
 * - Automatic CloudWatch logging with structured format
 * - Request ID tracking for debugging
 * - Type-safe error codes
 * - Less boilerplate code
 */
