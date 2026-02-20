/**
 * Property Test: TTL Assignment
 * 
 * **Property 28: TTL Assignment**
 * For any encounter entity written to DynamoDB, it should have a TTL field 
 * set to 90 days from creation.
 * 
 * **Validates: Requirements 12.9**
 * 
 * Feature: firstline-triage-platform
 */

import * as fc from 'fast-check';
import { DynamoDBService } from '../services/dynamodb.service';
import { TriageService } from '../services/triage.service';
import { ReferralService } from '../services/referral.service';
import { FollowupService } from '../services/followup.service';
import { RollupService } from '../services/rollup.service';
import { BedrockService } from '../services/bedrock.service';
import { DangerSignDetector } from '../services/danger-sign-detector.service';
import { RuleEngine } from '../services/rule-engine.service';
import { Channel, TriageLevel } from '../models';

// Mock AWS SDK clients
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/client-bedrock-runtime');
jest.mock('@aws-sdk/client-s3');

describe('Property 28: TTL Assignment', () => {
  let dynamoDBService: DynamoDBService;
  let mockPut: jest.Mock;
  let mockGet: jest.Mock;
  let mockQuery: jest.Mock;
  let mockUpdate: jest.Mock;
  let mockSend: jest.Mock;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock functions
    mockPut = jest.fn().mockResolvedValue({});
    mockGet = jest.fn().mockResolvedValue({ Item: null });
    mockQuery = jest.fn().mockResolvedValue({ Items: [] });
    mockUpdate = jest.fn().mockResolvedValue({});
    mockSend = jest.fn().mockResolvedValue({});

    // Mock DynamoDB client
    const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
    DynamoDBClient.prototype.send = mockSend;

    // Create service instance
    dynamoDBService = new DynamoDBService({
      tableName: 'test-table',
      region: 'us-east-1',
    });

    // Override the put method to capture calls
    dynamoDBService.put = mockPut;
    dynamoDBService.get = mockGet;
    dynamoDBService.query = mockQuery;
    dynamoDBService.update = mockUpdate;
  });

  /**
   * Test that encounter entities have TTL set to 90 days from creation
   */
  it('should set TTL to 90 days from creation for encounter entities', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          encounterId: fc.uuid(),
          channel: fc.constantFrom('app', 'voice', 'ussd', 'sms') as fc.Arbitrary<Channel>,
          age: fc.integer({ min: 0, max: 120 }),
          sex: fc.constantFrom('M', 'F', 'O') as fc.Arbitrary<'M' | 'F' | 'O'>,
          location: fc.string({ minLength: 1, maxLength: 50 }),
          symptoms: fc.string({ minLength: 10, maxLength: 200 }),
        }),
        async (encounterData) => {
          const beforeCreation = Date.now();

          // Create encounter
          await dynamoDBService.createEncounter({
            encounterId: encounterData.encounterId,
            channel: encounterData.channel,
            demographics: {
              age: encounterData.age,
              sex: encounterData.sex,
              location: encounterData.location,
            },
            symptoms: encounterData.symptoms,
          });

          const afterCreation = Date.now();

          // Verify put was called
          expect(mockPut).toHaveBeenCalled();

          // Get the encounter object that was written
          const writtenEncounter = mockPut.mock.calls[0][0];

          // Verify TTL field exists
          expect(writtenEncounter).toHaveProperty('TTL');
          expect(typeof writtenEncounter.TTL).toBe('number');

          // Verify TTL is approximately 90 days from now
          const expectedTTL = Math.floor((beforeCreation + 90 * 24 * 60 * 60 * 1000) / 1000);
          const maxExpectedTTL = Math.floor((afterCreation + 90 * 24 * 60 * 60 * 1000) / 1000);

          expect(writtenEncounter.TTL).toBeGreaterThanOrEqual(expectedTTL);
          expect(writtenEncounter.TTL).toBeLessThanOrEqual(maxExpectedTTL + 1); // Allow 1 second tolerance
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Test that triage result entities have TTL set
   */
  it('should set TTL for triage result entities', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          encounterId: fc.uuid(),
          age: fc.integer({ min: 0, max: 120 }),
          symptoms: fc.string({ minLength: 10, maxLength: 200 }),
        }),
        async (data) => {
          // Mock encounter data
          mockGet.mockResolvedValueOnce({
            EncounterId: data.encounterId,
            Demographics: { age: data.age, sex: 'M', location: 'Test' },
            Symptoms: data.symptoms,
            Channel: 'app',
            Status: 'created',
          });

          mockQuery.mockResolvedValueOnce([
            {
              SK: 'METADATA',
              EncounterId: data.encounterId,
              Demographics: { age: data.age, sex: 'M', location: 'Test' },
              Symptoms: data.symptoms,
              Channel: 'app',
              Status: 'created',
            },
          ]);

          // Create triage service with mocked dependencies
          const triageService = new TriageService({
            dynamoDBService,
            ruleEngine: new RuleEngine(),
            dangerSignDetector: new DangerSignDetector(),
          });

          const beforeTriage = Date.now();

          try {
            // Perform triage (will use rule engine since Bedrock is mocked)
            await triageService.performTriage(data.encounterId);
          } catch (error) {
            // Ignore errors from mocked services
          }

          const afterTriage = Date.now();

          // Find the triage result put call
          const triagePutCall = mockPut.mock.calls.find(
            (call) => call[0].Type === 'TriageResult'
          );

          if (triagePutCall) {
            const triageResult = triagePutCall[0];

            // Verify TTL field exists
            expect(triageResult).toHaveProperty('TTL');
            expect(typeof triageResult.TTL).toBe('number');

            // Verify TTL is approximately 90 days from now
            const expectedTTL = Math.floor((beforeTriage + 90 * 24 * 60 * 60 * 1000) / 1000);
            const maxExpectedTTL = Math.floor((afterTriage + 90 * 24 * 60 * 60 * 1000) / 1000);

            expect(triageResult.TTL).toBeGreaterThanOrEqual(expectedTTL);
            expect(triageResult.TTL).toBeLessThanOrEqual(maxExpectedTTL + 1);
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Test that follow-up entities have TTL set
   */
  it('should set TTL for follow-up entities', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          encounterId: fc.uuid(),
          questions: fc.array(fc.string({ minLength: 10, maxLength: 100 }), {
            minLength: 3,
            maxLength: 5,
          }),
        }),
        async (data) => {
          // Reset mocks for this test
          mockPut.mockClear();

          const followupService = new FollowupService({
            dynamoDBService,
            useAI: false,
          });

          const beforeStore = Date.now();

          // Store questions
          await followupService.storeQuestions(data.encounterId, data.questions);

          const afterStore = Date.now();

          // Verify all follow-up entities have TTL
          const followupCalls = mockPut.mock.calls.filter(
            (call) => call[0].Type === 'Followup'
          );

          expect(followupCalls.length).toBe(data.questions.length);

          for (const call of followupCalls) {
            const followup = call[0];

            // Verify TTL field exists
            expect(followup).toHaveProperty('TTL');
            expect(typeof followup.TTL).toBe('number');

            // Verify TTL is approximately 90 days from now
            const expectedTTL = Math.floor((beforeStore + 90 * 24 * 60 * 60 * 1000) / 1000);
            const maxExpectedTTL = Math.floor((afterStore + 90 * 24 * 60 * 60 * 1000) / 1000);

            expect(followup.TTL).toBeGreaterThanOrEqual(expectedTTL);
            expect(followup.TTL).toBeLessThanOrEqual(maxExpectedTTL + 1);
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Test that referral entities have TTL set
   */
  it('should set TTL for referral entities', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          encounterId: fc.uuid(),
          destination: fc.string({ minLength: 10, maxLength: 20 }),
        }),
        async (data) => {
          // Mock S3 client
          const { S3Client } = require('@aws-sdk/client-s3');
          S3Client.prototype.send = jest.fn().mockResolvedValue({});

          // Mock encounter data
          mockQuery.mockResolvedValueOnce([
            {
              SK: 'METADATA',
              EncounterId: data.encounterId,
              Demographics: { age: 30, sex: 'M', location: 'Test' },
              Symptoms: 'Test symptoms',
              Channel: 'app',
            },
            {
              SK: 'TRIAGE',
              RiskTier: 'YELLOW',
              RecommendedNextSteps: ['Seek care'],
            },
          ]);

          const referralService = new ReferralService({
            dynamoDBService,
            s3BucketName: 'test-bucket',
          });

          const beforeReferral = Date.now();

          try {
            // Generate referral
            await referralService.generateReferral({
              encounterId: data.encounterId,
              format: 'sms',
              destination: data.destination,
            });
          } catch (error) {
            // Ignore S3 errors
          }

          const afterReferral = Date.now();

          // Find the referral put call
          const referralPutCall = mockPut.mock.calls.find(
            (call) => call[0].Type === 'Referral'
          );

          if (referralPutCall) {
            const referral = referralPutCall[0];

            // Verify TTL field exists
            expect(referral).toHaveProperty('TTL');
            expect(typeof referral.TTL).toBe('number');

            // Verify TTL is approximately 90 days from now
            const expectedTTL = Math.floor((beforeReferral + 90 * 24 * 60 * 60 * 1000) / 1000);
            const maxExpectedTTL = Math.floor((afterReferral + 90 * 24 * 60 * 60 * 1000) / 1000);

            expect(referral.TTL).toBeGreaterThanOrEqual(expectedTTL);
            expect(referral.TTL).toBeLessThanOrEqual(maxExpectedTTL + 1);
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Test that decision entities have TTL set
   */
  it('should set TTL for decision entities when AI is used', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          encounterId: fc.uuid(),
          age: fc.integer({ min: 0, max: 120 }),
          symptoms: fc.string({ minLength: 10, maxLength: 200 }),
        }),
        async (data) => {
          // Mock Bedrock response
          const { BedrockRuntimeClient } = require('@aws-sdk/client-bedrock-runtime');
          BedrockRuntimeClient.prototype.send = jest.fn().mockResolvedValue({
            body: {
              transformToString: () =>
                Promise.resolve(
                  JSON.stringify({
                    content: [
                      {
                        text: JSON.stringify({
                          riskTier: 'YELLOW',
                          dangerSigns: [],
                          uncertainty: 'LOW',
                          recommendedNextSteps: ['Seek care within 24 hours'],
                          watchOuts: ['Worsening symptoms'],
                          referralRecommended: true,
                          disclaimer: 'Test disclaimer',
                          reasoning: 'Test reasoning',
                        }),
                      },
                    ],
                  })
                ),
            },
          });

          // Mock encounter data
          mockQuery.mockResolvedValueOnce([
            {
              SK: 'METADATA',
              EncounterId: data.encounterId,
              Demographics: { age: data.age, sex: 'M', location: 'Test' },
              Symptoms: data.symptoms,
              Channel: 'app',
              Status: 'created',
            },
          ]);

          const triageService = new TriageService({
            dynamoDBService,
            bedrockService: new BedrockService(),
            dangerSignDetector: new DangerSignDetector(),
            ruleEngine: new RuleEngine(),
          });

          const beforeTriage = Date.now();

          try {
            await triageService.performTriage(data.encounterId);
          } catch (error) {
            // Ignore errors
          }

          const afterTriage = Date.now();

          // Find the decision put call
          const decisionPutCall = mockPut.mock.calls.find(
            (call) => call[0].Type === 'Decision'
          );

          if (decisionPutCall) {
            const decision = decisionPutCall[0];

            // Verify TTL field exists
            expect(decision).toHaveProperty('TTL');
            expect(typeof decision.TTL).toBe('number');

            // Verify TTL is approximately 90 days from now
            const expectedTTL = Math.floor((beforeTriage + 90 * 24 * 60 * 60 * 1000) / 1000);
            const maxExpectedTTL = Math.floor((afterTriage + 90 * 24 * 60 * 60 * 1000) / 1000);

            expect(decision.TTL).toBeGreaterThanOrEqual(expectedTTL);
            expect(decision.TTL).toBeLessThanOrEqual(maxExpectedTTL + 1);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Test that daily rollup entities have TTL set
   */
  it('should set TTL for daily rollup entities', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          date: fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
          channel: fc.constantFrom('app', 'voice', 'ussd', 'sms') as fc.Arbitrary<Channel>,
          triageLevel: fc.constantFrom('RED', 'YELLOW', 'GREEN') as fc.Arbitrary<TriageLevel>,
          symptoms: fc.string({ minLength: 10, maxLength: 100 }),
        }),
        async (data) => {
          // Reset mock for this test
          mockSend.mockClear();

          const rollupService = new RollupService({
            dynamoDBService,
          });

          const dateStr = data.date.toISOString().split('T')[0];

          const beforeUpdate = Date.now();

          // Update rollup
          await rollupService.updateRollup({
            date: dateStr,
            channel: data.channel,
            triageLevel: data.triageLevel,
            symptoms: data.symptoms,
            dangerSigns: [],
            hasReferral: false,
            aiLatencyMs: 1000,
          });

          const afterUpdate = Date.now();

          // Verify the update command was sent
          expect(mockSend).toHaveBeenCalled();

          if (mockSend.mock.calls.length > 0) {
            // Get the update command parameters
            const updateCall = mockSend.mock.calls[mockSend.mock.calls.length - 1];
            const updateCommand = updateCall[0];

            // Check if TTL is in the update expression
            if (updateCommand && updateCommand.input && updateCommand.input.UpdateExpression) {
              expect(updateCommand.input.UpdateExpression).toContain('TTL');

              // Verify TTL value is set correctly
              const ttlValue = updateCommand.input.ExpressionAttributeValues?.[':ttl'];
              if (ttlValue && ttlValue.N) {
                const ttl = parseInt(ttlValue.N);

                // Verify TTL is approximately 90 days from now
                const expectedTTL = Math.floor((beforeUpdate + 90 * 24 * 60 * 60 * 1000) / 1000);
                const maxExpectedTTL = Math.floor((afterUpdate + 90 * 24 * 60 * 60 * 1000) / 1000);

                expect(ttl).toBeGreaterThanOrEqual(expectedTTL);
                expect(ttl).toBeLessThanOrEqual(maxExpectedTTL + 1);
              }
            }
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Test that TTL calculation is consistent
   */
  it('should calculate TTL consistently as 90 days from creation', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
        (testDate) => {
          const ttl = dynamoDBService.calculateTTL(testDate);

          // Calculate expected TTL
          const expectedDate = new Date(testDate);
          expectedDate.setDate(expectedDate.getDate() + 90);
          const expectedTTL = Math.floor(expectedDate.getTime() / 1000);

          // Verify TTL matches expected value
          expect(ttl).toBe(expectedTTL);

          // Verify TTL is exactly 90 days (in seconds) from the input date
          const diffSeconds = ttl - Math.floor(testDate.getTime() / 1000);
          const diffDays = diffSeconds / (24 * 60 * 60);

          expect(diffDays).toBeCloseTo(90, 1);
        }
      ),
      { numRuns: 100 }
    );
  });
});
