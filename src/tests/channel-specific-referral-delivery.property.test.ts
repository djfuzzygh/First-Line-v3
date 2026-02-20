/**
 * Property-Based Test: Channel-Specific Referral Delivery
 * 
 * Property 22: Channel-Specific Referral Delivery
 * 
 * For any referral generated via voice or USSD/SMS channels, the system should
 * send the referral via SMS to the specified destination.
 * 
 * **Validates: Requirements 7.4**
 * 
 * Feature: firstline-triage-platform, Property 22: Channel-Specific Referral Delivery
 */

import * as fc from 'fast-check';
import { 
  Encounter, 
  Followup, 
  TriageResult, 
  TriageLevel, 
  UncertaintyLevel,
  Channel
} from '../models';
import { DynamoDBClient, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { mockClient } from 'aws-sdk-client-mock';
import { marshall } from '@aws-sdk/util-dynamodb';
import { APIGatewayProxyEvent } from 'aws-lambda';

// Mock ReferralService before importing handler
const mockGenerateReferral = jest.fn();

jest.mock('../services/referral.service', () => {
  return {
    ReferralService: jest.fn().mockImplementation(() => {
      return {
        generateReferral: mockGenerateReferral,
      };
    }),
  };
});

// Mock pdfkit to avoid dynamic import issues
jest.mock('pdfkit', () => {
  return jest.fn().mockImplementation(() => {
    const EventEmitter = require('events');
    const mockDoc = new EventEmitter();
    mockDoc.fontSize = jest.fn().mockReturnThis();
    mockDoc.font = jest.fn().mockReturnThis();
    mockDoc.text = jest.fn().mockReturnThis();
    mockDoc.moveDown = jest.fn().mockReturnThis();
    mockDoc.end = jest.fn().mockImplementation(() => {
      setImmediate(() => {
        mockDoc.emit('data', Buffer.from('mock-pdf'));
        mockDoc.emit('end');
      });
    });
    return mockDoc;
  });
});

// Import handler after mocking
import { handler } from '../handlers/referral-handler';

describe('Property 22: Channel-Specific Referral Delivery', () => {
  const dynamoMock = mockClient(DynamoDBClient);
  const s3Mock = mockClient(S3Client);
  const snsMock = mockClient(SNSClient);

  beforeEach(() => {
    dynamoMock.reset();
    s3Mock.reset();
    snsMock.reset();
    jest.clearAllMocks();

    // Set environment variables
    process.env.TABLE_NAME = 'test-table';
    process.env.REFERRAL_BUCKET_NAME = 'test-bucket';
    process.env.AWS_REGION = 'us-east-1';

    // Mock S3 upload
    s3Mock.on(PutObjectCommand).resolves({});
    
    // Mock DynamoDB put
    dynamoMock.on(PutItemCommand).resolves({});
    
    // Mock SNS publish
    snsMock.on(PublishCommand).resolves({
      MessageId: 'mock-message-id',
    });

    // Setup default mock for generateReferral
    mockGenerateReferral.mockImplementation(async (options) => {
      const referralId = 'mock-referral-id';
      const format = options.format;
      
      return {
        referralId,
        documentUrl: format === 'pdf' ? 'https://mock-url.com/referral.pdf' : undefined,
        smsSent: format === 'sms',
      };
    });
  });

  /**
   * Generator for complete encounter data with followups and triage
   * Specifically for voice, USSD, and SMS channels
   */
  const voiceOrSMSEncounterDataArbitrary = fc.record({
    encounter: fc.record({
      PK: fc.uuid().map(id => `ENC#${id}`),
      SK: fc.constant('METADATA'),
      Type: fc.constant('Encounter' as const),
      EncounterId: fc.uuid(),
      Channel: fc.constantFrom('voice', 'ussd', 'sms') as fc.Arbitrary<Channel>,
      Timestamp: fc.date().map(d => d.toISOString()),
      Status: fc.constantFrom('created', 'in_progress', 'completed') as fc.Arbitrary<'created' | 'in_progress' | 'completed'>,
      Demographics: fc.record({
        age: fc.integer({ min: 0, max: 120 }),
        sex: fc.constantFrom('M', 'F', 'O'),
        location: fc.oneof(
          fc.constant('Nairobi, Kenya'),
          fc.constant('Lagos, Nigeria'),
          fc.constant('Kampala, Uganda')
        ),
      }),
      Symptoms: fc.oneof(
        fc.constant('I have a cough and fever'),
        fc.constant('I have stomach pain'),
        fc.constant('I have a headache'),
        fc.constant('I have severe chest pain')
      ),
      Vitals: fc.option(
        fc.record({
          temperature: fc.float({ min: 35, max: 42, noNaN: true }),
          pulse: fc.integer({ min: 40, max: 200 }),
          bloodPressure: fc.constant('120/80'),
          respiratoryRate: fc.integer({ min: 8, max: 40 }),
        }),
        { nil: undefined }
      ),
      OfflineCreated: fc.boolean(),
      SyncedAt: fc.option(fc.date().map(d => d.toISOString()), { nil: undefined }),
      GSI1PK: fc.date().map(d => `DATE#${d.toISOString().split('T')[0]}`),
      GSI1SK: fc.tuple(
        fc.constantFrom('voice', 'ussd', 'sms'),
        fc.date().map(d => d.toISOString())
      ).map(([ch, ts]) => `CHANNEL#${ch}#TIME#${ts}`),
      TTL: fc.integer({ min: Math.floor(Date.now() / 1000), max: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60 }),
    }) as fc.Arbitrary<Encounter>,
    followups: fc.array(
      fc.record({
        PK: fc.uuid().map(id => `ENC#${id}`),
        SK: fc.integer({ min: 0, max: 5 }).map(seq => `FOLLOWUP#${seq}`),
        Type: fc.constant('Followup' as const),
        Question: fc.constant('How long have you had these symptoms?'),
        Response: fc.constant('For 3 days'),
        Timestamp: fc.date().map(d => d.toISOString()),
      }) as fc.Arbitrary<Followup>,
      { minLength: 0, maxLength: 3 }
    ),
    triage: fc.record({
      PK: fc.uuid().map(id => `ENC#${id}`),
      SK: fc.constant('TRIAGE'),
      Type: fc.constant('TriageResult' as const),
      RiskTier: fc.constantFrom('RED', 'YELLOW', 'GREEN') as fc.Arbitrary<TriageLevel>,
      DangerSigns: fc.array(fc.constant('severe chest pain'), { minLength: 0, maxLength: 2 }),
      Uncertainty: fc.constantFrom('LOW', 'MEDIUM', 'HIGH') as fc.Arbitrary<UncertaintyLevel>,
      RecommendedNextSteps: fc.array(fc.constant('Seek immediate emergency care'), { minLength: 1, maxLength: 3 }),
      WatchOuts: fc.array(fc.constant('Worsening symptoms'), { minLength: 0, maxLength: 3 }),
      ReferralRecommended: fc.boolean(),
      Disclaimer: fc.constant('This assessment is not a diagnosis. Please consult with a healthcare professional for proper medical evaluation.'),
      Reasoning: fc.string({ minLength: 20, maxLength: 100 }),
      AiLatencyMs: fc.integer({ min: 100, max: 5000 }),
      UsedFallback: fc.boolean(),
      Timestamp: fc.date().map(d => d.toISOString()),
    }) as fc.Arbitrary<TriageResult>,
  });

  /**
   * Generator for app channel encounters (should NOT send SMS)
   */
  const appEncounterDataArbitrary = fc.record({
    encounter: fc.record({
      PK: fc.uuid().map(id => `ENC#${id}`),
      SK: fc.constant('METADATA'),
      Type: fc.constant('Encounter' as const),
      EncounterId: fc.uuid(),
      Channel: fc.constant('app') as fc.Arbitrary<Channel>,
      Timestamp: fc.date().map(d => d.toISOString()),
      Status: fc.constantFrom('created', 'in_progress', 'completed') as fc.Arbitrary<'created' | 'in_progress' | 'completed'>,
      Demographics: fc.record({
        age: fc.integer({ min: 0, max: 120 }),
        sex: fc.constantFrom('M', 'F', 'O'),
        location: fc.oneof(
          fc.constant('Nairobi, Kenya'),
          fc.constant('Lagos, Nigeria'),
          fc.constant('Kampala, Uganda')
        ),
      }),
      Symptoms: fc.oneof(
        fc.constant('I have a cough and fever'),
        fc.constant('I have stomach pain'),
        fc.constant('I have a headache')
      ),
      Vitals: fc.option(
        fc.record({
          temperature: fc.float({ min: 35, max: 42, noNaN: true }),
          pulse: fc.integer({ min: 40, max: 200 }),
          bloodPressure: fc.constant('120/80'),
          respiratoryRate: fc.integer({ min: 8, max: 40 }),
        }),
        { nil: undefined }
      ),
      OfflineCreated: fc.boolean(),
      SyncedAt: fc.option(fc.date().map(d => d.toISOString()), { nil: undefined }),
      GSI1PK: fc.date().map(d => `DATE#${d.toISOString().split('T')[0]}`),
      GSI1SK: fc.tuple(
        fc.constant('app'),
        fc.date().map(d => d.toISOString())
      ).map(([ch, ts]) => `CHANNEL#${ch}#TIME#${ts}`),
      TTL: fc.integer({ min: Math.floor(Date.now() / 1000), max: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60 }),
    }) as fc.Arbitrary<Encounter>,
    followups: fc.array(
      fc.record({
        PK: fc.uuid().map(id => `ENC#${id}`),
        SK: fc.integer({ min: 0, max: 5 }).map(seq => `FOLLOWUP#${seq}`),
        Type: fc.constant('Followup' as const),
        Question: fc.constant('How long have you had these symptoms?'),
        Response: fc.constant('For 3 days'),
        Timestamp: fc.date().map(d => d.toISOString()),
      }) as fc.Arbitrary<Followup>,
      { minLength: 0, maxLength: 3 }
    ),
    triage: fc.record({
      PK: fc.uuid().map(id => `ENC#${id}`),
      SK: fc.constant('TRIAGE'),
      Type: fc.constant('TriageResult' as const),
      RiskTier: fc.constantFrom('RED', 'YELLOW', 'GREEN') as fc.Arbitrary<TriageLevel>,
      DangerSigns: fc.array(fc.constant('severe chest pain'), { minLength: 0, maxLength: 2 }),
      Uncertainty: fc.constantFrom('LOW', 'MEDIUM', 'HIGH') as fc.Arbitrary<UncertaintyLevel>,
      RecommendedNextSteps: fc.array(fc.constant('Seek immediate emergency care'), { minLength: 1, maxLength: 3 }),
      WatchOuts: fc.array(fc.constant('Worsening symptoms'), { minLength: 0, maxLength: 3 }),
      ReferralRecommended: fc.boolean(),
      Disclaimer: fc.constant('This assessment is not a diagnosis. Please consult with a healthcare professional for proper medical evaluation.'),
      Reasoning: fc.string({ minLength: 20, maxLength: 100 }),
      AiLatencyMs: fc.integer({ min: 100, max: 5000 }),
      UsedFallback: fc.boolean(),
      Timestamp: fc.date().map(d => d.toISOString()),
    }) as fc.Arbitrary<TriageResult>,
  });

  it('should send SMS for voice or USSD/SMS channels', async () => {
    await fc.assert(
      fc.asyncProperty(
        voiceOrSMSEncounterDataArbitrary,
        fc.integer({ min: 1000000000, max: 9999999999 }).map(n => `+1${n}`), // Phone number with 10 digits
        async (encounterData, phoneNumber) => {
          const { encounter, followups, triage } = encounterData;
          const encounterId = encounter.EncounterId;

          // Mock DynamoDB query to return encounter data
          dynamoMock.on(QueryCommand).resolves({
            Items: [
              marshall(encounter, { removeUndefinedValues: true }),
              ...followups.map(f => marshall(f, { removeUndefinedValues: true })),
              marshall(triage, { removeUndefinedValues: true }),
            ],
          });

          // Create API Gateway event
          const event: APIGatewayProxyEvent = {
            httpMethod: 'POST',
            path: `/encounters/${encounterId}/referral`,
            pathParameters: { id: encounterId },
            body: JSON.stringify({
              destination: phoneNumber,
            }),
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

          // Assert: Response is successful
          expect(response.statusCode).toBe(200);

          const responseBody = JSON.parse(response.body);

          // Assert: Format is SMS for voice/USSD/SMS channels (Requirement 7.4)
          expect(responseBody.format).toBe('sms');

          // Assert: SMS was sent (Requirement 7.4)
          expect(responseBody.smsSent).toBe(true);

          // Assert: Destination matches the provided phone number
          expect(responseBody.destination).toBe(phoneNumber);

          // Assert: SNS PublishCommand was called (Requirement 7.4)
          const snsPublishCalls = snsMock.commandCalls(PublishCommand);
          expect(snsPublishCalls.length).toBeGreaterThan(0);

          // Assert: SMS was sent to the correct phone number
          const lastSNSCall = snsPublishCalls[snsPublishCalls.length - 1];
          expect(lastSNSCall.args[0].input.PhoneNumber).toBe(phoneNumber);

          // Assert: SMS message contains referral information
          const smsMessage = lastSNSCall.args[0].input.Message;
          expect(smsMessage).toBeDefined();
          expect(typeof smsMessage).toBe('string');
          expect(smsMessage!.length).toBeGreaterThan(0);

          // Assert: SMS message contains key referral data
          expect(smsMessage).toContain('FirstLine Referral');
          expect(smsMessage).toContain(encounter.EncounterId.substring(0, 8));
          expect(smsMessage).toContain(encounter.Demographics.age.toString());
          expect(smsMessage).toContain(encounter.Demographics.sex);
          expect(smsMessage).toContain(triage.RiskTier);

          // Assert: ReferralService.generateReferral was called with SMS format
          expect(mockGenerateReferral).toHaveBeenCalledWith(
            expect.objectContaining({
              encounterId,
              format: 'sms',
              destination: phoneNumber,
            })
          );
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should NOT send SMS for app channel (should generate PDF instead)', async () => {
    await fc.assert(
      fc.asyncProperty(
        appEncounterDataArbitrary,
        fc.string({ minLength: 5, maxLength: 20 }), // Facility identifier
        async (encounterData, facilityId) => {
          const { encounter, followups, triage } = encounterData;
          const encounterId = encounter.EncounterId;

          // Mock DynamoDB query to return encounter data
          dynamoMock.on(QueryCommand).resolves({
            Items: [
              marshall(encounter, { removeUndefinedValues: true }),
              ...followups.map(f => marshall(f, { removeUndefinedValues: true })),
              marshall(triage, { removeUndefinedValues: true }),
            ],
          });

          // Create API Gateway event
          const event: APIGatewayProxyEvent = {
            httpMethod: 'POST',
            path: `/encounters/${encounterId}/referral`,
            pathParameters: { id: encounterId },
            body: JSON.stringify({
              destination: facilityId,
            }),
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

          // Assert: Response is successful
          expect(response.statusCode).toBe(200);

          const responseBody = JSON.parse(response.body);

          // Assert: Format is PDF for app channel (NOT SMS)
          expect(responseBody.format).toBe('pdf');

          // Assert: SMS was NOT sent for app channel
          expect(responseBody.smsSent).toBe(false);

          // Assert: Document URL is provided for PDF format
          expect(responseBody.documentUrl).toBeDefined();

          // Assert: SNS PublishCommand was NOT called for app channel
          const snsPublishCalls = snsMock.commandCalls(PublishCommand);
          expect(snsPublishCalls.length).toBe(0);

          // Assert: ReferralService.generateReferral was called with PDF format
          expect(mockGenerateReferral).toHaveBeenCalledWith(
            expect.objectContaining({
              encounterId,
              format: 'pdf',
              destination: facilityId,
            })
          );
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);

  it('should include all required information in SMS message', async () => {
    await fc.assert(
      fc.asyncProperty(
        voiceOrSMSEncounterDataArbitrary,
        fc.integer({ min: 1000000000, max: 9999999999 }).map(n => `+1${n}`), // Phone number with 10 digits
        async (encounterData, phoneNumber) => {
          const { encounter, followups, triage } = encounterData;
          const encounterId = encounter.EncounterId;

          // Mock DynamoDB query to return encounter data
          dynamoMock.on(QueryCommand).resolves({
            Items: [
              marshall(encounter, { removeUndefinedValues: true }),
              ...followups.map(f => marshall(f, { removeUndefinedValues: true })),
              marshall(triage, { removeUndefinedValues: true }),
            ],
          });

          // Create API Gateway event
          const event: APIGatewayProxyEvent = {
            httpMethod: 'POST',
            path: `/encounters/${encounterId}/referral`,
            pathParameters: { id: encounterId },
            body: JSON.stringify({
              destination: phoneNumber,
            }),
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

          // Assert: Response is successful
          expect(response.statusCode).toBe(200);

          // Assert: SNS was called
          const snsPublishCalls = snsMock.commandCalls(PublishCommand);
          expect(snsPublishCalls.length).toBeGreaterThan(0);

          const smsMessage = snsPublishCalls[snsPublishCalls.length - 1].args[0].input.Message!;

          // Assert: SMS contains patient demographics
          expect(smsMessage).toContain(encounter.Demographics.age.toString());
          expect(smsMessage).toContain(encounter.Demographics.sex);
          expect(smsMessage).toContain(encounter.Demographics.location);

          // Assert: SMS contains symptoms
          expect(smsMessage).toContain('Symptoms:');

          // Assert: SMS contains triage level
          expect(smsMessage).toContain('Triage:');
          expect(smsMessage).toContain(triage.RiskTier);

          // Assert: SMS contains recommended action
          expect(smsMessage).toContain('Action:');
          expect(smsMessage).toContain(triage.RecommendedNextSteps[0]);

          // Assert: SMS contains danger signs if present
          if (triage.DangerSigns && triage.DangerSigns.length > 0) {
            expect(smsMessage).toContain('DANGER SIGNS:');
          }

          // Assert: SMS respects length constraints (max 480 characters for 3 SMS messages)
          expect(smsMessage.length).toBeLessThanOrEqual(480);
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);
});
