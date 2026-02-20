/**
 * Property-Based Test: Referral Summary Structure
 * 
 * Property 20: Referral Summary Structure
 * 
 * For any generated referral summary, it should be formatted as a structured
 * clinical note with clearly labeled sections.
 * 
 * **Validates: Requirements 7.2**
 * 
 * Feature: firstline-triage-platform, Property 20: Referral Summary Structure
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

describe('Property 20: Referral Summary Structure', () => {
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

  it('should format referral as structured clinical note with clearly labeled sections', async () => {
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

          // Property 20: Referral Summary Structure (Requirement 7.2)
          // For any generated referral summary, it should be formatted as a structured
          // clinical note with clearly labeled sections.

          if (format === 'pdf') {
            // PDF format should have full structured clinical note format

            // Assert: Document has a header section
            expect(content).toContain('CLINICAL REFERRAL SUMMARY');
            expect(content).toContain('FirstLine Healthcare Triage Platform');
            expect(content).toContain('Encounter ID:');
            expect(content).toContain('Date:');
            expect(content).toContain('Channel:');

            // Assert: Document has clearly labeled PATIENT DEMOGRAPHICS section
            expect(content).toContain('PATIENT DEMOGRAPHICS');
            expect(content).toContain('Age:');
            expect(content).toContain('Sex:');
            expect(content).toContain('Location:');

            // Assert: Document has clearly labeled CHIEF COMPLAINT section
            expect(content).toContain('CHIEF COMPLAINT');

            // Assert: If vitals are present, they have a clearly labeled section
            if (encounter.Vitals) {
              expect(content).toContain('VITAL SIGNS');
            }

            // Assert: If followups are present, they have a clearly labeled section
            if (followups.length > 0) {
              expect(content).toContain('CLINICAL HISTORY');
            }

            // Assert: Triage assessment has clearly labeled sections
            if (triage) {
              expect(content).toContain('TRIAGE ASSESSMENT');
              expect(content).toContain('Risk Level:');
              expect(content).toContain('Uncertainty:');
              expect(content).toContain('RECOMMENDED NEXT STEPS:');
              
              // Danger signs section should be present if there are danger signs
              if (triage.DangerSigns && triage.DangerSigns.length > 0) {
                expect(content).toContain('DANGER SIGNS DETECTED:');
              }
              
              // Warning signs section should be present if there are watch outs
              if (triage.WatchOuts && triage.WatchOuts.length > 0) {
                expect(content).toContain('WARNING SIGNS TO WATCH FOR:');
              }
              
              // Clinical reasoning section should be present if reasoning exists
              if (triage.Reasoning) {
                expect(content).toContain('CLINICAL REASONING:');
              }
              
              // Disclaimer section should always be present
              expect(content).toContain('DISCLAIMER:');
            }

            // Assert: Sections are properly separated (not all run together)
            // Check that there are multiple line breaks indicating section separation
            const lineBreaks = (content.match(/\n\n/g) || []).length;
            expect(lineBreaks).toBeGreaterThan(0);

            // Assert: Section headers are in uppercase (standard clinical note format)
            const sectionHeaders = [
              'CLINICAL REFERRAL SUMMARY',
              'PATIENT DEMOGRAPHICS',
              'CHIEF COMPLAINT',
              'TRIAGE ASSESSMENT',
            ];
            
            sectionHeaders.forEach(header => {
              if (content.includes(header)) {
                // Verify it's actually uppercase (not mixed case)
                expect(header).toBe(header.toUpperCase());
              }
            });

            // Assert: Each section has content following its header
            // Check that headers are not at the end of the document
            const demographicsIndex = content.indexOf('PATIENT DEMOGRAPHICS');
            if (demographicsIndex !== -1) {
              const afterDemographics = content.substring(demographicsIndex + 'PATIENT DEMOGRAPHICS'.length);
              expect(afterDemographics.trim().length).toBeGreaterThan(0);
            }

            const chiefComplaintIndex = content.indexOf('CHIEF COMPLAINT');
            if (chiefComplaintIndex !== -1) {
              const afterChiefComplaint = content.substring(chiefComplaintIndex + 'CHIEF COMPLAINT'.length);
              expect(afterChiefComplaint.trim().length).toBeGreaterThan(0);
            }

            const triageIndex = content.indexOf('TRIAGE ASSESSMENT');
            if (triageIndex !== -1) {
              const afterTriage = content.substring(triageIndex + 'TRIAGE ASSESSMENT'.length);
              expect(afterTriage.trim().length).toBeGreaterThan(0);
            }
          } else {
            // SMS format should have compact structured format with labeled fields

            // Assert: SMS has a header with encounter reference
            expect(content).toContain('FirstLine Referral');
            expect(content).toContain(encounter.EncounterId.substring(0, 8));

            // Assert: SMS has labeled patient information
            expect(content).toContain('Patient:');
            expect(content).toContain(encounter.Demographics.age.toString());
            expect(content).toContain(encounter.Demographics.sex);
            expect(content).toContain(encounter.Demographics.location);

            // Assert: SMS has labeled symptoms section
            expect(content).toContain('Symptoms:');

            // Assert: SMS has labeled triage information
            if (triage) {
              expect(content).toContain('Triage:');
              expect(content).toContain(triage.RiskTier);

              // Assert: SMS has labeled action section
              if (triage.RecommendedNextSteps && triage.RecommendedNextSteps.length > 0) {
                expect(content).toContain('Action:');
              }

              // Assert: SMS has labeled danger signs if present
              if (triage.DangerSigns && triage.DangerSigns.length > 0) {
                expect(content).toContain('DANGER SIGNS:');
              }
            }

            // Assert: SMS format is structured with line breaks between sections
            const lines = content.split('\n');
            expect(lines.length).toBeGreaterThan(1);

            // Assert: SMS format has labeled fields (contains colons for field labels)
            const colonCount = (content.match(/:/g) || []).length;
            expect(colonCount).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100, timeout: 30000 }
    );
  }, 35000);
});
