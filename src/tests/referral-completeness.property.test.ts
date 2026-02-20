/**
 * Property-Based Test: Referral Summary Completeness
 * 
 * Property 19: Referral Summary Completeness
 * 
 * For any generated referral summary, it should include demographics, symptoms,
 * follow-up responses, vital signs (if available), and triage assessment.
 * 
 * **Validates: Requirements 7.1**
 * 
 * Feature: firstline-triage-platform, Property 19: Referral Summary Completeness
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
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';

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

describe('Property 19: Referral Summary Completeness', () => {
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
    // Mock DynamoDB put
    dynamoMock.on(PutItemCommand).resolves({});

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

  it('should include all required fields in referral summary content', async () => {
    await fc.assert(
      fc.asyncProperty(
        completeEncounterDataArbitrary,
        fc.constantFrom('pdf', 'sms'),
        fc.string({ minLength: 5, maxLength: 20 }),
        async (encounterData, format, destination) => {
          const { encounter, followups, triage } = encounterData;

          // Mock getEncounter to return complete data
          jest.spyOn(dynamoDBService, 'getEncounter').mockResolvedValue({
            encounter,
            followups,
            triage,
            referral: null,
            decision: null,
          });

          // Act: Generate referral
          const result = await referralService.generateReferral({
            encounterId: encounter.EncounterId,
            format: format as 'pdf' | 'sms',
            destination,
          });

          // Assert: Referral was created
          expect(result.referralId).toBeDefined();
          expect(typeof result.referralId).toBe('string');

          // Get the stored referral content from the mock
          const putCalls = dynamoMock.commandCalls(PutItemCommand);
          expect(putCalls.length).toBeGreaterThan(0);

          const storedReferral = putCalls[putCalls.length - 1].args[0].input.Item;
          expect(storedReferral).toBeDefined();
          if (!storedReferral) return; // Type guard

          // The Item is marshalled, so we need to unmarshall it
          const { unmarshall } = require('@aws-sdk/util-dynamodb');
          const content = unmarshall(storedReferral).Content as string;
          expect(content).toBeDefined();

          // Assert: Demographics are included (Requirement 7.1)
          expect(content).toContain(encounter.Demographics.age.toString());
          expect(content).toContain(encounter.Demographics.sex);
          expect(content).toContain(encounter.Demographics.location);

          // Assert: Symptoms are included (Requirement 7.1)
          expect(content).toContain(encounter.Symptoms);

          // Assert: Follow-up responses are included if present (Requirement 7.1)
          // Note: SMS format may not include all followups due to length constraints
          if (followups.length > 0 && format === 'pdf') {
            followups.forEach(followup => {
              const hasFollowupData = 
                content.includes(followup.Question) || 
                content.includes(followup.Response);
              expect(hasFollowupData).toBe(true);
            });
          }

          // Assert: Vital signs are included if available (Requirement 7.1)
          // Note: SMS format may not include vitals due to length constraints
          if (encounter.Vitals && format === 'pdf') {
            const vitals = encounter.Vitals;
            if (vitals.temperature !== undefined) {
              expect(content).toContain(vitals.temperature.toString());
            }
            if (vitals.pulse !== undefined) {
              expect(content).toContain(vitals.pulse.toString());
            }
            if (vitals.bloodPressure !== undefined) {
              expect(content).toContain(vitals.bloodPressure);
            }
            if (vitals.respiratoryRate !== undefined) {
              expect(content).toContain(vitals.respiratoryRate.toString());
            }
          }

          // Assert: Triage assessment is included (Requirement 7.1)
          expect(content).toContain(triage.RiskTier);
          
          // For PDF format, check for more details
          if (format === 'pdf') {
            expect(content).toContain(triage.Uncertainty);
          }
          
          // Recommended next steps should be included
          triage.RecommendedNextSteps.forEach(step => {
            expect(content).toContain(step);
          });

          // Assert: Disclaimer is included (for PDF format)
          if (format === 'pdf') {
            expect(content).toContain(triage.Disclaimer);
          }
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);
});
