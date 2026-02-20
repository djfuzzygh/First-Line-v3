/**
 * Property-Based Test: Referral Persistence
 * 
 * Property 21: Referral Persistence
 * 
 * For any generated referral summary, it should be stored in the encounter record
 * and be retrievable by encounter ID.
 * 
 * **Validates: Requirements 7.5**
 * 
 * Feature: firstline-triage-platform, Property 21: Referral Persistence
 */

import * as fc from 'fast-check';
import { ReferralService } from '../services/referral.service';
import { DynamoDBService } from '../services/dynamodb.service';
import { 
  Encounter, 
  Followup, 
  TriageResult, 
  TriageLevel, 
  UncertaintyLevel
} from '../models';
import { DynamoDBClient, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { marshall } from '@aws-sdk/util-dynamodb';

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
      // Emit data and end events
      setImmediate(() => {
        mockDoc.emit('data', Buffer.from('mock-pdf'));
        mockDoc.emit('end');
      });
    });
    return mockDoc;
  });
});

describe('Property 21: Referral Persistence', () => {
  let referralService: ReferralService;
  let dynamoDBService: DynamoDBService;
  const dynamoMock = mockClient(DynamoDBClient);
  const s3Mock = mockClient(S3Client);

  beforeEach(() => {
    dynamoMock.reset();
    s3Mock.reset();
    
    dynamoDBService = new DynamoDBService({ 
      tableName: 'test-table', 
      region: 'us-east-1' 
    });
    
    referralService = new ReferralService({
      dynamoDBService,
      s3BucketName: 'test-bucket',
      region: 'us-east-1',
    });

    // Mock S3 upload
    s3Mock.on(PutObjectCommand).resolves({});

    // Mock the private generatePDF method to avoid pdfkit issues
    jest.spyOn(referralService as any, 'generatePDF').mockResolvedValue(Buffer.from('mock-pdf-content'));
    // Mock the private uploadToS3 method
    jest.spyOn(referralService as any, 'uploadToS3').mockResolvedValue('https://mock-url.com/referral.pdf');
  });

  /**
   * Generator for complete encounter data with followups and triage
   */
  const completeEncounterDataArbitrary = fc.record({
    encounter: fc.record({
      PK: fc.uuid().map(id => `ENC#${id}`),
      SK: fc.constant('METADATA'),
      Type: fc.constant('Encounter' as const),
      EncounterId: fc.uuid(),
      Channel: fc.constantFrom('app', 'voice', 'ussd', 'sms'),
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
        fc.constantFrom('app', 'voice', 'ussd', 'sms'),
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

  it('should store referral in encounter record and be retrievable by encounter ID', async () => {
    await fc.assert(
      fc.asyncProperty(
        completeEncounterDataArbitrary,
        fc.constantFrom('pdf', 'sms'),
        fc.string({ minLength: 5, maxLength: 20 }),
        async (encounterData, format, destination) => {
          const { encounter, followups, triage } = encounterData;
          const encounterId = encounter.EncounterId;

          // Track stored referral data
          let storedReferral: any = null;

          // Mock DynamoDB put to capture the stored referral
          dynamoMock.on(PutItemCommand).callsFake((input) => {
            const item = input.Item;
            if (item && item.Type && item.Type.S === 'Referral') {
              storedReferral = item;
            }
            return Promise.resolve({});
          });

          // Mock getEncounter for initial referral generation
          jest.spyOn(dynamoDBService, 'getEncounter').mockResolvedValueOnce({
            encounter,
            followups,
            triage,
            referral: null,
            decision: null,
          });

          // Act: Generate referral
          const result = await referralService.generateReferral({
            encounterId,
            format: format as 'pdf' | 'sms',
            destination,
          });

          // Assert: Referral was created and has an ID
          expect(result.referralId).toBeDefined();
          expect(typeof result.referralId).toBe('string');
          expect(result.referralId.length).toBeGreaterThan(0);

          // Assert: Referral was stored in DynamoDB (Requirement 7.5)
          expect(storedReferral).not.toBeNull();
          expect(storedReferral).toBeDefined();

          // Assert: Stored referral has correct structure
          expect(storedReferral.PK).toBeDefined();
          expect(storedReferral.PK.S).toBe(`ENC#${encounterId}`);
          expect(storedReferral.SK).toBeDefined();
          expect(storedReferral.SK.S).toBe('REFERRAL');
          expect(storedReferral.Type).toBeDefined();
          expect(storedReferral.Type.S).toBe('Referral');

          // Assert: Stored referral contains the referral ID
          expect(storedReferral.ReferralId).toBeDefined();
          expect(storedReferral.ReferralId.S).toBe(result.referralId);

          // Assert: Stored referral contains format
          expect(storedReferral.Format).toBeDefined();
          expect(storedReferral.Format.S).toBe(format);

          // Assert: Stored referral contains destination
          expect(storedReferral.Destination).toBeDefined();
          expect(storedReferral.Destination.S).toBe(destination);

          // Assert: Stored referral contains content
          expect(storedReferral.Content).toBeDefined();
          expect(storedReferral.Content.S).toBeDefined();
          expect(storedReferral.Content.S.length).toBeGreaterThan(0);

          // Assert: Stored referral contains timestamp
          expect(storedReferral.SentAt).toBeDefined();
          expect(storedReferral.SentAt.S).toBeDefined();

          // Assert: If PDF format, document URL should be stored
          if (format === 'pdf') {
            expect(storedReferral.DocumentUrl).toBeDefined();
            expect(storedReferral.DocumentUrl.S).toBeDefined();
            expect(result.documentUrl).toBeDefined();
          }

          // Now test retrieval: Mock getEncounter to return the stored referral
          const { unmarshall } = require('@aws-sdk/util-dynamodb');
          const unmarshalledReferral = unmarshall(storedReferral);

          // Mock DynamoDB query to return all encounter items including the referral
          dynamoMock.on(QueryCommand).resolves({
            Items: [
              marshall(encounter, { removeUndefinedValues: true }),
              ...followups.map(f => marshall(f, { removeUndefinedValues: true })),
              marshall(triage, { removeUndefinedValues: true }),
              storedReferral, // The stored referral
            ],
          });

          // Act: Retrieve encounter with referral
          const retrievedData = await dynamoDBService.getEncounter(encounterId);

          // Assert: Referral is retrievable by encounter ID (Requirement 7.5)
          expect(retrievedData.referral).not.toBeNull();
          expect(retrievedData.referral).toBeDefined();

          // Assert: Retrieved referral matches stored referral
          expect(retrievedData.referral!.PK).toBe(`ENC#${encounterId}`);
          expect(retrievedData.referral!.SK).toBe('REFERRAL');
          expect(retrievedData.referral!.Type).toBe('Referral');
          expect(retrievedData.referral!.ReferralId).toBe(result.referralId);
          expect(retrievedData.referral!.Format).toBe(format);
          expect(retrievedData.referral!.Destination).toBe(destination);
          expect(retrievedData.referral!.Content).toBeDefined();
          expect(retrievedData.referral!.Content.length).toBeGreaterThan(0);
          expect(retrievedData.referral!.SentAt).toBeDefined();

          // Assert: Retrieved referral content matches stored content
          expect(retrievedData.referral!.Content).toBe(unmarshalledReferral.Content);

          // Assert: If PDF, document URL is retrievable
          if (format === 'pdf') {
            expect(retrievedData.referral!.DocumentUrl).toBeDefined();
            expect(retrievedData.referral!.DocumentUrl).toBe(unmarshalledReferral.DocumentUrl);
          }

          // Assert: Referral is linked to the correct encounter
          expect(retrievedData.encounter).not.toBeNull();
          expect(retrievedData.encounter!.EncounterId).toBe(encounterId);

          // Assert: All encounter data is still accessible alongside the referral
          expect(retrievedData.triage).not.toBeNull();
          expect(retrievedData.followups).toBeDefined();
          expect(retrievedData.followups.length).toBe(followups.length);
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);
});
