/**
 * Property-Based Test: Incomplete Data Validation
 * 
 * Property 6: Incomplete Data Validation
 * 
 * For any encounter with missing required fields (age, sex, or symptoms), 
 * the system should prompt for the missing fields before allowing triage to proceed.
 * 
 * **Validates: Requirements 2.6**
 * 
 * Feature: firstline-triage-platform, Property 6: Incomplete Data Validation
 */

import * as fc from 'fast-check';
import { handler } from '../handlers/encounter-handler';
import { DynamoDBClient, PutItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { APIGatewayProxyEvent } from 'aws-lambda';

describe('Property 6: Incomplete Data Validation', () => {
  const dynamoMock = mockClient(DynamoDBClient);

  beforeEach(() => {
    dynamoMock.reset();
    // Mock successful DynamoDB operations
    dynamoMock.on(PutItemCommand).resolves({});
    dynamoMock.on(GetItemCommand).resolves({});
  });

  /**
   * Generator for incomplete encounter data (missing one or more required fields)
   */
  const incompleteEncounterArbitrary = fc.oneof(
    // Missing age
    fc.record({
      channel: fc.constantFrom('app', 'voice', 'ussd', 'sms'),
      sex: fc.constantFrom('M', 'F', 'O'),
      location: fc.string({ minLength: 3, maxLength: 100 }),
      symptoms: fc.string({ minLength: 5, maxLength: 500 }),
      missingField: fc.constant('age'),
    }),
    // Missing sex
    fc.record({
      channel: fc.constantFrom('app', 'voice', 'ussd', 'sms'),
      age: fc.integer({ min: 0, max: 120 }),
      location: fc.string({ minLength: 3, maxLength: 100 }),
      symptoms: fc.string({ minLength: 5, maxLength: 500 }),
      missingField: fc.constant('sex'),
    }),
    // Missing location
    fc.record({
      channel: fc.constantFrom('app', 'voice', 'ussd', 'sms'),
      age: fc.integer({ min: 0, max: 120 }),
      sex: fc.constantFrom('M', 'F', 'O'),
      symptoms: fc.string({ minLength: 5, maxLength: 500 }),
      missingField: fc.constant('location'),
    }),
    // Missing symptoms
    fc.record({
      channel: fc.constantFrom('app', 'voice', 'ussd', 'sms'),
      age: fc.integer({ min: 0, max: 120 }),
      sex: fc.constantFrom('M', 'F', 'O'),
      location: fc.string({ minLength: 3, maxLength: 100 }),
      missingField: fc.constant('symptoms'),
    }),
    // Missing multiple fields (age and sex)
    fc.record({
      channel: fc.constantFrom('app', 'voice', 'ussd', 'sms'),
      location: fc.string({ minLength: 3, maxLength: 100 }),
      symptoms: fc.string({ minLength: 5, maxLength: 500 }),
      missingField: fc.constant('age,sex'),
    }),
    // Missing multiple fields (age and symptoms)
    fc.record({
      channel: fc.constantFrom('app', 'voice', 'ussd', 'sms'),
      sex: fc.constantFrom('M', 'F', 'O'),
      location: fc.string({ minLength: 3, maxLength: 100 }),
      missingField: fc.constant('age,symptoms'),
    })
  );

  it('should reject encounter creation when required fields are missing', async () => {
    await fc.assert(
      fc.asyncProperty(
        incompleteEncounterArbitrary,
        async (requestData) => {
          // Arrange: Create API Gateway event with incomplete data
          const { missingField, ...incompleteData } = requestData;
          
          const event: APIGatewayProxyEvent = {
            httpMethod: 'POST',
            path: '/encounters',
            body: JSON.stringify(incompleteData),
            headers: {},
            multiValueHeaders: {},
            isBase64Encoded: false,
            pathParameters: null,
            queryStringParameters: null,
            multiValueQueryStringParameters: null,
            stageVariables: null,
            requestContext: {} as any,
            resource: '',
          };

          // Act: Call handler
          const response = await handler(event);

          // Assert: Request should fail with validation error
          // Requirement 2.6: System SHALL prompt for required fields before proceeding
          expect(response.statusCode).toBe(400);
          
          const body = JSON.parse(response.body);
          expect(body.error).toBeDefined();
          expect(body.error.code).toBe('VALIDATION_ERROR');
          expect(body.error.message).toBeDefined();
          
          // Verify the error message mentions the missing field(s)
          const errorMessage = body.error.message.toLowerCase();
          const missingFields = missingField.split(',');
          
          // At least one of the missing fields should be mentioned in the error
          const mentionsMissingField = missingFields.some(field => 
            errorMessage.includes(field.toLowerCase())
          );
          expect(mentionsMissingField).toBe(true);

          // Verify that no data was stored in DynamoDB
          const putCalls = dynamoMock.commandCalls(PutItemCommand);
          expect(putCalls.length).toBe(0);
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should reject encounter creation when age is invalid type', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          channel: fc.constantFrom('app', 'voice', 'ussd', 'sms'),
          age: fc.oneof(
            fc.constant(null),
            fc.constant(undefined),
            fc.constant(''),
            fc.string({ minLength: 1, maxLength: 10 }),
            fc.constant({}),
            fc.constant([])
          ),
          sex: fc.constantFrom('M', 'F', 'O'),
          location: fc.string({ minLength: 3, maxLength: 100 }),
          symptoms: fc.string({ minLength: 5, maxLength: 500 }),
        }),
        async (requestData) => {
          // Arrange: Create request with invalid age type
          const event: APIGatewayProxyEvent = {
            httpMethod: 'POST',
            path: '/encounters',
            body: JSON.stringify(requestData),
            headers: {},
            multiValueHeaders: {},
            isBase64Encoded: false,
            pathParameters: null,
            queryStringParameters: null,
            multiValueQueryStringParameters: null,
            stageVariables: null,
            requestContext: {} as any,
            resource: '',
          };

          // Act: Call handler
          const response = await handler(event);

          // Assert: Request should fail with validation error
          expect(response.statusCode).toBe(400);
          
          const body = JSON.parse(response.body);
          expect(body.error).toBeDefined();
          expect(body.error.code).toBe('VALIDATION_ERROR');
          expect(body.error.message.toLowerCase()).toContain('age');
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should reject encounter creation when symptoms is empty or whitespace', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          channel: fc.constantFrom('app', 'voice', 'ussd', 'sms'),
          age: fc.integer({ min: 0, max: 120 }),
          sex: fc.constantFrom('M', 'F', 'O'),
          location: fc.string({ minLength: 3, maxLength: 100 }),
          symptoms: fc.oneof(
            fc.constant(''),
            fc.constant('   '),
            fc.constant('\t'),
            fc.constant('\n')
          ),
        }),
        async (requestData) => {
          // Arrange: Create request with empty/whitespace symptoms
          const event: APIGatewayProxyEvent = {
            httpMethod: 'POST',
            path: '/encounters',
            body: JSON.stringify(requestData),
            headers: {},
            multiValueHeaders: {},
            isBase64Encoded: false,
            pathParameters: null,
            queryStringParameters: null,
            multiValueQueryStringParameters: null,
            stageVariables: null,
            requestContext: {} as any,
            resource: '',
          };

          // Act: Call handler
          const response = await handler(event);

          // Assert: Request should fail with validation error
          expect(response.statusCode).toBe(400);
          
          const body = JSON.parse(response.body);
          expect(body.error).toBeDefined();
          expect(body.error.code).toBe('VALIDATION_ERROR');
          expect(body.error.message.toLowerCase()).toContain('symptoms');
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should reject encounter creation when location is empty or whitespace', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          channel: fc.constantFrom('app', 'voice', 'ussd', 'sms'),
          age: fc.integer({ min: 0, max: 120 }),
          sex: fc.constantFrom('M', 'F', 'O'),
          location: fc.oneof(
            fc.constant(''),
            fc.constant('   '),
            fc.constant('\t'),
            fc.constant('\n')
          ),
          symptoms: fc.string({ minLength: 5, maxLength: 500 }),
        }),
        async (requestData) => {
          // Arrange: Create request with empty/whitespace location
          const event: APIGatewayProxyEvent = {
            httpMethod: 'POST',
            path: '/encounters',
            body: JSON.stringify(requestData),
            headers: {},
            multiValueHeaders: {},
            isBase64Encoded: false,
            pathParameters: null,
            queryStringParameters: null,
            multiValueQueryStringParameters: null,
            stageVariables: null,
            requestContext: {} as any,
            resource: '',
          };

          // Act: Call handler
          const response = await handler(event);

          // Assert: Request should fail with validation error
          expect(response.statusCode).toBe(400);
          
          const body = JSON.parse(response.body);
          expect(body.error).toBeDefined();
          expect(body.error.code).toBe('VALIDATION_ERROR');
          expect(body.error.message.toLowerCase()).toContain('location');
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should reject encounter creation when channel is missing or invalid', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          channel: fc.oneof(
            fc.constant(null),
            fc.constant(undefined),
            fc.constant(''),
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => !['app', 'voice', 'ussd', 'sms'].includes(s))
          ),
          age: fc.integer({ min: 0, max: 120 }),
          sex: fc.constantFrom('M', 'F', 'O'),
          location: fc.string({ minLength: 3, maxLength: 100 }),
          symptoms: fc.string({ minLength: 5, maxLength: 500 }),
        }),
        async (requestData) => {
          // Arrange: Create request with invalid channel
          const event: APIGatewayProxyEvent = {
            httpMethod: 'POST',
            path: '/encounters',
            body: JSON.stringify(requestData),
            headers: {},
            multiValueHeaders: {},
            isBase64Encoded: false,
            pathParameters: null,
            queryStringParameters: null,
            multiValueQueryStringParameters: null,
            stageVariables: null,
            requestContext: {} as any,
            resource: '',
          };

          // Act: Call handler
          const response = await handler(event);

          // Assert: Request should fail with validation error
          expect(response.statusCode).toBe(400);
          
          const body = JSON.parse(response.body);
          expect(body.error).toBeDefined();
          expect(body.error.code).toBe('VALIDATION_ERROR');
          expect(body.error.message.toLowerCase()).toContain('channel');
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should provide clear error messages indicating which fields are missing', async () => {
    await fc.assert(
      fc.asyncProperty(
        incompleteEncounterArbitrary,
        async (requestData) => {
          // Arrange: Create API Gateway event with incomplete data
          const { missingField, ...incompleteData } = requestData;
          
          const event: APIGatewayProxyEvent = {
            httpMethod: 'POST',
            path: '/encounters',
            body: JSON.stringify(incompleteData),
            headers: {},
            multiValueHeaders: {},
            isBase64Encoded: false,
            pathParameters: null,
            queryStringParameters: null,
            multiValueQueryStringParameters: null,
            stageVariables: null,
            requestContext: {} as any,
            resource: '',
          };

          // Act: Call handler
          const response = await handler(event);

          // Assert: Error response should have proper structure
          expect(response.statusCode).toBe(400);
          
          const body = JSON.parse(response.body);
          expect(body.error).toBeDefined();
          expect(body.error.code).toBe('VALIDATION_ERROR');
          expect(body.error.message).toBeDefined();
          expect(body.error.requestId).toBeDefined();
          expect(body.error.timestamp).toBeDefined();
          
          // Verify error message is user-friendly and specific
          const errorMessage = body.error.message;
          expect(errorMessage.length).toBeGreaterThan(0);
          expect(errorMessage).toMatch(/missing|invalid|required/i);
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);
});
