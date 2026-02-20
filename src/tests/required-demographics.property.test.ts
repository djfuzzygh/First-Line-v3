/**
 * Property-Based Test: Required Demographics Collection
 * 
 * Property 4: Required Demographics Collection
 * 
 * For any encounter, the system should collect age, sex, and location before
 * proceeding to triage, and should not store personal name fields by default.
 * 
 * **Validates: Requirements 2.1, 12.10, 16.4**
 * 
 * Feature: firstline-triage-platform, Property 4: Required Demographics Collection
 */

import * as fc from 'fast-check';
import { handler } from '../handlers/encounter-handler';
import { DynamoDBClient, PutItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { APIGatewayProxyEvent } from 'aws-lambda';

describe('Property 4: Required Demographics Collection', () => {
  const dynamoMock = mockClient(DynamoDBClient);

  beforeEach(() => {
    dynamoMock.reset();
    // Mock successful DynamoDB operations
    dynamoMock.on(PutItemCommand).resolves({});
    dynamoMock.on(GetItemCommand).resolves({});
  });

  /**
   * Generator for complete encounter creation request
   */
  const validEncounterRequestArbitrary = fc.record({
    channel: fc.constantFrom('app', 'voice', 'ussd', 'sms'),
    age: fc.integer({ min: 0, max: 120 }),
    sex: fc.constantFrom('M', 'F', 'O'),
    location: fc.string({ minLength: 3, maxLength: 100 }),
    symptoms: fc.string({ minLength: 5, maxLength: 500 }),
    vitals: fc.option(
      fc.record({
        temperature: fc.float({ min: 35, max: 42, noNaN: true }),
        pulse: fc.integer({ min: 40, max: 200 }),
        bloodPressure: fc.constant('120/80'),
        respiratoryRate: fc.integer({ min: 8, max: 40 }),
      }),
      { nil: undefined }
    ),
    offlineCreated: fc.boolean(),
  });

  it('should require age, sex, and location for encounter creation', async () => {
    await fc.assert(
      fc.asyncProperty(
        validEncounterRequestArbitrary,
        async (requestData) => {
          // Arrange: Create API Gateway event
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

          // Assert: Request should succeed with valid demographics
          expect(response.statusCode).toBe(201);
          
          const body = JSON.parse(response.body);
          expect(body.encounterId).toBeDefined();
          expect(body.timestamp).toBeDefined();
          expect(body.status).toBe('created');

          // Verify DynamoDB was called to store the encounter
          const putCalls = dynamoMock.commandCalls(PutItemCommand);
          expect(putCalls.length).toBeGreaterThan(0);

          // Verify the stored data contains demographics
          const storedItem = putCalls[putCalls.length - 1].args[0].input.Item;
          expect(storedItem).toBeDefined();
          
          const { unmarshall } = require('@aws-sdk/util-dynamodb');
          const storedData = unmarshall(storedItem!);
          
          // Requirement 2.1: System SHALL request age, sex, and location
          expect(storedData.Demographics).toBeDefined();
          expect(storedData.Demographics.age).toBe(requestData.age);
          expect(storedData.Demographics.sex).toBe(requestData.sex);
          expect(storedData.Demographics.location).toBe(requestData.location);
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should reject encounter creation when age is missing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          channel: fc.constantFrom('app', 'voice', 'ussd', 'sms'),
          sex: fc.constantFrom('M', 'F', 'O'),
          location: fc.string({ minLength: 3, maxLength: 100 }),
          symptoms: fc.string({ minLength: 5, maxLength: 500 }),
        }),
        async (requestData) => {
          // Arrange: Create request without age
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
          expect(body.error.message).toContain('age');
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should reject encounter creation when sex is missing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          channel: fc.constantFrom('app', 'voice', 'ussd', 'sms'),
          age: fc.integer({ min: 0, max: 120 }),
          location: fc.string({ minLength: 3, maxLength: 100 }),
          symptoms: fc.string({ minLength: 5, maxLength: 500 }),
        }),
        async (requestData) => {
          // Arrange: Create request without sex
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
          expect(body.error.message).toContain('sex');
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should reject encounter creation when location is missing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          channel: fc.constantFrom('app', 'voice', 'ussd', 'sms'),
          age: fc.integer({ min: 0, max: 120 }),
          sex: fc.constantFrom('M', 'F', 'O'),
          symptoms: fc.string({ minLength: 5, maxLength: 500 }),
        }),
        async (requestData) => {
          // Arrange: Create request without location
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
          expect(body.error.message).toContain('location');
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should not store personal name fields by default', async () => {
    await fc.assert(
      fc.asyncProperty(
        validEncounterRequestArbitrary,
        fc.string({ minLength: 2, maxLength: 50 }), // Generate a name
        async (requestData, personalName) => {
          // Arrange: Create request with a name field (which should be ignored)
          const requestWithName = {
            ...requestData,
            name: personalName,
            firstName: personalName.split(' ')[0],
            lastName: personalName.split(' ')[1] || 'Doe',
            fullName: personalName,
          };

          const event: APIGatewayProxyEvent = {
            httpMethod: 'POST',
            path: '/encounters',
            body: JSON.stringify(requestWithName),
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

          // Assert: Request should succeed
          expect(response.statusCode).toBe(201);

          // Verify DynamoDB was called
          const putCalls = dynamoMock.commandCalls(PutItemCommand);
          expect(putCalls.length).toBeGreaterThan(0);

          // Verify the stored data does NOT contain name fields
          const storedItem = putCalls[putCalls.length - 1].args[0].input.Item;
          expect(storedItem).toBeDefined();
          
          const { unmarshall } = require('@aws-sdk/util-dynamodb');
          const storedData = unmarshall(storedItem!);
          
          // Requirements 12.10, 16.4: System SHALL not store personal names by default
          expect(storedData.name).toBeUndefined();
          expect(storedData.firstName).toBeUndefined();
          expect(storedData.lastName).toBeUndefined();
          expect(storedData.fullName).toBeUndefined();
          expect(storedData.Demographics.name).toBeUndefined();
          expect(storedData.Demographics.firstName).toBeUndefined();
          expect(storedData.Demographics.lastName).toBeUndefined();
          expect(storedData.Demographics.fullName).toBeUndefined();

          // But demographics should still be present
          expect(storedData.Demographics).toBeDefined();
          expect(storedData.Demographics.age).toBe(requestData.age);
          expect(storedData.Demographics.sex).toBe(requestData.sex);
          expect(storedData.Demographics.location).toBe(requestData.location);
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should validate that age is within valid range', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          channel: fc.constantFrom('app', 'voice', 'ussd', 'sms'),
          age: fc.oneof(
            fc.integer({ min: -100, max: -1 }), // Negative ages
            fc.integer({ min: 151, max: 999 })  // Ages over 150
          ),
          sex: fc.constantFrom('M', 'F', 'O'),
          location: fc.string({ minLength: 3, maxLength: 100 }),
          symptoms: fc.string({ minLength: 5, maxLength: 500 }),
        }),
        async (requestData) => {
          // Arrange: Create request with invalid age
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
          expect(body.error.message).toContain('age');
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should validate that sex is one of the allowed values', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          channel: fc.constantFrom('app', 'voice', 'ussd', 'sms'),
          age: fc.integer({ min: 0, max: 120 }),
          sex: fc.string({ minLength: 1, maxLength: 10 }).filter(s => !['M', 'F', 'O'].includes(s)),
          location: fc.string({ minLength: 3, maxLength: 100 }),
          symptoms: fc.string({ minLength: 5, maxLength: 500 }),
        }),
        async (requestData) => {
          // Arrange: Create request with invalid sex
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
          expect(body.error.message).toContain('sex');
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);
});
