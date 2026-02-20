/**
 * Property-Based Test: Symptom Input Acceptance
 * 
 * Property 5: Symptom Input Acceptance
 * 
 * For any free-text or voice symptom input, the system should accept and store
 * the chief complaint in the encounter record.
 * 
 * **Validates: Requirements 2.2**
 * 
 * Feature: firstline-triage-platform, Property 5: Symptom Input Acceptance
 */

import * as fc from 'fast-check';
import { handler } from '../handlers/encounter-handler';
import { DynamoDBClient, PutItemCommand, GetItemCommand, QueryCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { APIGatewayProxyEvent } from 'aws-lambda';

describe('Property 5: Symptom Input Acceptance', () => {
  const dynamoMock = mockClient(DynamoDBClient);

  beforeEach(() => {
    dynamoMock.reset();
    // Mock successful DynamoDB operations
    dynamoMock.on(PutItemCommand).resolves({});
    dynamoMock.on(GetItemCommand).resolves({});
    dynamoMock.on(QueryCommand).resolves({ Items: [] });
    dynamoMock.on(UpdateItemCommand).resolves({});
  });

  /**
   * Generator for valid symptom descriptions
   * Includes various formats: short, long, with punctuation, medical terms, etc.
   */
  const symptomTextArbitrary = fc.oneof(
    // Short symptom descriptions
    fc.constantFrom(
      'fever',
      'cough',
      'headache',
      'stomach pain',
      'chest pain',
      'dizziness',
      'nausea'
    ),
    // Medium length descriptions
    fc.constantFrom(
      'I have a fever and cough',
      'My head hurts badly',
      'I feel dizzy and weak',
      'I have been vomiting',
      'My stomach hurts a lot',
      'I have chest pain when breathing',
      'I cannot sleep due to pain'
    ),
    // Longer, more detailed descriptions
    fc.constantFrom(
      'I have had a high fever for three days with body aches',
      'I am experiencing severe headache with sensitivity to light',
      'I have been coughing for a week and now have chest pain',
      'My child has fever, cough, and difficulty breathing',
      'I feel very weak and have lost my appetite',
      'I have sharp pain in my abdomen that comes and goes',
      'I am pregnant and experiencing severe headache and blurred vision'
    ),
    // Symptoms with special characters and punctuation
    fc.string({ minLength: 5, maxLength: 500 })
      .filter(s => s.trim().length >= 5)
      .map(s => s.replace(/[^\w\s.,!?'-]/g, ''))
  );

  /**
   * Generator for complete encounter request with symptoms
   */
  const encounterWithSymptomsArbitrary = fc.record({
    channel: fc.constantFrom('app', 'voice', 'ussd', 'sms'),
    age: fc.integer({ min: 0, max: 120 }),
    sex: fc.constantFrom('M', 'F', 'O'),
    location: fc.string({ minLength: 3, maxLength: 100 }),
    symptoms: symptomTextArbitrary,
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

  it('should accept and store free-text symptom input during encounter creation', async () => {
    await fc.assert(
      fc.asyncProperty(
        encounterWithSymptomsArbitrary,
        async (requestData) => {
          // Arrange: Create API Gateway event for encounter creation
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

          // Assert: Request should succeed
          expect(response.statusCode).toBe(201);
          
          const body = JSON.parse(response.body);
          expect(body.encounterId).toBeDefined();
          expect(body.timestamp).toBeDefined();
          expect(body.status).toBe('created');

          // Verify DynamoDB was called to store the encounter
          const putCalls = dynamoMock.commandCalls(PutItemCommand);
          expect(putCalls.length).toBeGreaterThan(0);

          // Verify the stored data contains the symptom input
          const storedItem = putCalls[putCalls.length - 1].args[0].input.Item;
          expect(storedItem).toBeDefined();
          
          const { unmarshall } = require('@aws-sdk/util-dynamodb');
          const storedData = unmarshall(storedItem!);
          
          // Requirement 2.2: System SHALL accept free-text or voice input describing the chief complaint
          expect(storedData.Symptoms).toBeDefined();
          expect(storedData.Symptoms).toBe(requestData.symptoms);
          expect(typeof storedData.Symptoms).toBe('string');
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should accept symptom input via POST /encounters/{id}/symptoms endpoint', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        symptomTextArbitrary,
        async (encounterId, symptoms) => {
          // Mock that the encounter exists - need to mock QueryCommand for getEncounter
          const existingEncounter = {
            Items: [
              {
                PK: { S: `ENC#${encounterId}` },
                SK: { S: 'METADATA' },
                Type: { S: 'Encounter' },
                EncounterId: { S: encounterId },
                Channel: { S: 'app' },
                Status: { S: 'created' },
                Demographics: {
                  M: {
                    age: { N: '30' },
                    sex: { S: 'M' },
                    location: { S: 'Test Location' },
                  },
                },
                Timestamp: { S: new Date().toISOString() },
              },
            ],
          };

          dynamoMock.on(QueryCommand).resolves(existingEncounter);

          // Arrange: Create API Gateway event for adding symptoms
          const event: APIGatewayProxyEvent = {
            httpMethod: 'POST',
            path: `/encounters/${encounterId}/symptoms`,
            pathParameters: { id: encounterId },
            body: JSON.stringify({ symptoms }),
            headers: {},
            multiValueHeaders: {},
            isBase64Encoded: false,
            queryStringParameters: null,
            multiValueQueryStringParameters: null,
            stageVariables: null,
            requestContext: {} as any,
            resource: '',
          };

          // Act: Call handler
          const response = await handler(event);

          // Assert: Request should succeed
          expect(response.statusCode).toBe(200);
          
          const body = JSON.parse(response.body);
          expect(body.encounterId).toBe(encounterId);
          expect(body.message).toContain('successfully');

          // Verify DynamoDB update was called
          const updateCalls = dynamoMock.commandCalls(UpdateItemCommand);
          expect(updateCalls.length).toBeGreaterThan(0);

          // Verify the symptoms were stored in the update
          const updateCall = updateCalls[updateCalls.length - 1].args[0].input;
          expect(updateCall).toBeDefined();
          
          // The UpdateItemCommand uses ExpressionAttributeValues
          const { unmarshall } = require('@aws-sdk/util-dynamodb');
          const attributeValues = updateCall.ExpressionAttributeValues;
          expect(attributeValues).toBeDefined();
          
          // Find the symptom value in the attribute values
          const values = unmarshall(attributeValues!);
          const symptomValue = Object.values(values).find(v => v === symptoms);
          
          // Requirement 2.2: System SHALL accept and store symptom input
          expect(symptomValue).toBe(symptoms);
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should accept symptom input from all channel types', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('app', 'voice', 'ussd', 'sms'),
        symptomTextArbitrary.filter(s => s.trim().length >= 5), // Ensure non-empty symptoms
        fc.integer({ min: 0, max: 120 }),
        fc.constantFrom('M', 'F', 'O'),
        fc.string({ minLength: 3, maxLength: 100 }).filter(s => s.trim().length >= 3), // Ensure non-empty location
        async (channel, symptoms, age, sex, location) => {
          // Arrange: Create encounter request from specific channel
          const requestData = {
            channel,
            age,
            sex,
            location,
            symptoms,
            offlineCreated: false,
          };

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

          // Assert: Request should succeed regardless of channel
          expect(response.statusCode).toBe(201);

          // Verify symptoms were stored
          const putCalls = dynamoMock.commandCalls(PutItemCommand);
          expect(putCalls.length).toBeGreaterThan(0);

          const storedItem = putCalls[putCalls.length - 1].args[0].input.Item;
          const { unmarshall } = require('@aws-sdk/util-dynamodb');
          const storedData = unmarshall(storedItem!);
          
          // Requirement 2.2: System SHALL accept symptoms from any channel (app, voice, ussd, sms)
          expect(storedData.Channel).toBe(channel);
          expect(storedData.Symptoms).toBe(symptoms);
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should preserve symptom text exactly as provided without modification', async () => {
    await fc.assert(
      fc.asyncProperty(
        encounterWithSymptomsArbitrary,
        async (requestData) => {
          // Arrange: Create encounter with specific symptom text
          const originalSymptoms = requestData.symptoms;
          
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

          // Assert: Symptoms should be stored exactly as provided
          expect(response.statusCode).toBe(201);

          const putCalls = dynamoMock.commandCalls(PutItemCommand);
          const storedItem = putCalls[putCalls.length - 1].args[0].input.Item;
          const { unmarshall } = require('@aws-sdk/util-dynamodb');
          const storedData = unmarshall(storedItem!);
          
          // Requirement 2.2: System should store symptoms without modification
          expect(storedData.Symptoms).toBe(originalSymptoms);
          expect(storedData.Symptoms.length).toBe(originalSymptoms.length);
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should reject encounter creation when symptoms are missing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          channel: fc.constantFrom('app', 'voice', 'ussd', 'sms'),
          age: fc.integer({ min: 0, max: 120 }),
          sex: fc.constantFrom('M', 'F', 'O'),
          location: fc.string({ minLength: 3, maxLength: 100 }),
          // Note: symptoms field is intentionally omitted
        }),
        async (requestData) => {
          // Arrange: Create request without symptoms
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
          expect(body.error.message).toContain('symptoms');
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should reject symptom input that is not a string', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          channel: fc.constantFrom('app', 'voice', 'ussd', 'sms'),
          age: fc.integer({ min: 0, max: 120 }),
          sex: fc.constantFrom('M', 'F', 'O'),
          location: fc.string({ minLength: 3, maxLength: 100 }),
          symptoms: fc.oneof(
            fc.constant(null),
            fc.constant(undefined),
            fc.integer(),
            fc.boolean(),
            fc.array(fc.string()),
            fc.object()
          ),
        }),
        async (requestData) => {
          // Arrange: Create request with non-string symptoms
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
          expect(body.error.message).toContain('symptoms');
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);
});
