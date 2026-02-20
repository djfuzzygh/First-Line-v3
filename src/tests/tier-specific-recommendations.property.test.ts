/**
 * Property-Based Test: Tier-Specific Recommendations
 * 
 * Property 16: RED Tier Emergency Recommendations
 * Property 17: YELLOW Tier Timely Care Recommendations
 * Property 18: GREEN Tier Home Care Recommendations
 * 
 * **Validates: Requirements 6.4, 6.5, 6.6**
 * 
 * For any triage result with RED level, the recommended next steps should include
 * language about immediate emergency care or hospital referral.
 * 
 * For any triage result with YELLOW level, the recommended next steps should include
 * language about seeking clinical evaluation within 24 hours.
 * 
 * For any triage result with GREEN level, the recommended next steps should include
 * home care guidance and warning signs to watch for.
 * 
 * Feature: firstline-triage-platform, Properties 16, 17, 18: Tier-Specific Recommendations
 */

import * as fc from 'fast-check';
import { TriageService } from '../services/triage.service';
import { DynamoDBService } from '../services/dynamodb.service';
import { BedrockService } from '../services/bedrock.service';
import { DangerSignDetector } from '../services/danger-sign-detector.service';
import { RuleEngine } from '../services/rule-engine.service';
import { Encounter, Channel, TriageLevel, UncertaintyLevel } from '../models';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

// Mock AWS SDKs
jest.mock('@aws-sdk/client-bedrock-runtime');
jest.mock('@aws-sdk/client-dynamodb');

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

const encounterArb = (): fc.Arbitrary<Encounter> =>
  fc.record({
    PK: fc.uuid().map(id => `ENC#${id}`),
    SK: fc.constant('METADATA'),
    Type: fc.constant('Encounter' as const),
    EncounterId: fc.uuid(),
    Channel: fc.oneof(
      fc.constant('app' as Channel),
      fc.constant('voice' as Channel),
      fc.constant('ussd' as Channel),
      fc.constant('sms' as Channel)
    ),
    Timestamp: fc.date().map(d => d.toISOString()),
    Status: fc.constant('in_progress' as const),
    Demographics: fc.record({
      age: fc.integer({ min: 0, max: 120 }),
      sex: fc.oneof(
        fc.constant('M' as const),
        fc.constant('F' as const),
        fc.constant('O' as const)
      ),
      location: fc.string({ minLength: 3, maxLength: 50 }),
    }),
    Symptoms: fc.string({ minLength: 10, maxLength: 500 }),
    Vitals: fc.option(
      fc.record({
        temperature: fc.float({ min: 35, max: 42, noNaN: true }),
        pulse: fc.integer({ min: 40, max: 200 }),
        bloodPressure: fc.string({ minLength: 5, maxLength: 10 }),
        respiratoryRate: fc.integer({ min: 8, max: 40 }),
      }),
      { nil: undefined }
    ),
    OfflineCreated: fc.boolean(),
    GSI1PK: fc.string(),
    GSI1SK: fc.string(),
    TTL: fc.integer({ min: 1000000000, max: 2000000000 }),
  });

const followupResponsesArb = (): fc.Arbitrary<string[]> =>
  fc.array(
    fc.string({ minLength: 5, maxLength: 200 }),
    { minLength: 0, maxLength: 5 }
  );

// ============================================================================
// Property Tests
// ============================================================================

describe('Properties 16, 17, 18: Tier-Specific Recommendations', () => {
  let triageService: TriageService;
  let mockBedrockSend: jest.Mock;
  let mockDynamoDBSend: jest.Mock;
  let putCalls: any[];

  beforeEach(() => {
    jest.clearAllMocks();
    putCalls = [];

    mockBedrockSend = jest.fn();
    (BedrockRuntimeClient as jest.Mock).mockImplementation(() => ({
      send: mockBedrockSend,
    }));

    mockDynamoDBSend = jest.fn();
    (DynamoDBClient as jest.Mock).mockImplementation(() => ({
      send: mockDynamoDBSend,
    }));

    const dynamoDBService = new DynamoDBService({
      tableName: 'test-table',
      region: 'us-east-1',
    });

    const bedrockService = new BedrockService({
      modelId: 'test-model',
      region: 'us-east-1',
      maxInputTokens: 2000,
      maxOutputTokens: 500,
      temperature: 0.3,
      timeoutMs: 30000,
    });

    triageService = new TriageService({
      dynamoDBService,
      bedrockService,
      dangerSignDetector: new DangerSignDetector(),
      ruleEngine: new RuleEngine(),
    });
  });

  it('Property 16: RED tier should include emergency care recommendations', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        followupResponsesArb(),
        async (encounter, followupResponses) => {
          mockDynamoDBSend.mockImplementation((command) => {
            if (command.constructor.name === 'GetItemCommand') {
              return Promise.resolve({
                Item: {
                  PK: { S: encounter.PK },
                  SK: { S: encounter.SK },
                  Type: { S: 'Encounter' },
                  EncounterId: { S: encounter.EncounterId },
                  Channel: { S: encounter.Channel },
                  Timestamp: { S: encounter.Timestamp },
                  Status: { S: encounter.Status },
                  Demographics: {
                    M: {
                      age: { N: encounter.Demographics.age.toString() },
                      sex: { S: encounter.Demographics.sex },
                      location: { S: encounter.Demographics.location },
                    },
                  },
                  Symptoms: { S: encounter.Symptoms },
                  OfflineCreated: { BOOL: encounter.OfflineCreated },
                  GSI1PK: { S: encounter.GSI1PK },
                  GSI1SK: { S: encounter.GSI1SK },
                  TTL: { N: encounter.TTL.toString() },
                },
              });
            }
            if (command.constructor.name === 'PutItemCommand') {
              putCalls.push(command.input);
            }
            if (command.constructor.name === 'UpdateItemCommand') {
              return Promise.resolve({});
            }
            return Promise.resolve({});
          });

          const mockAIResponse = {
            riskTier: 'RED',
            dangerSigns: ['test danger'],
            uncertainty: 'LOW',
            recommendedNextSteps: ['Go to hospital'],
            watchOuts: ['Worsening'],
            referralRecommended: true,
            disclaimer: 'Test',
            reasoning: 'Test',
          };

          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: JSON.stringify(mockAIResponse) }],
            })),
          };

          mockBedrockSend.mockResolvedValue(mockBedrockResponse);

          const result = await triageService.performTriage(
            encounter.EncounterId,
            followupResponses
          );

          expect(result.RiskTier).toBe('RED');

          const stepsText = result.RecommendedNextSteps.join(' ').toLowerCase();
          const hasEmergencyLanguage = 
            stepsText.includes('immediate') ||
            stepsText.includes('emergency') ||
            stepsText.includes('hospital') ||
            stepsText.includes('urgent');

          expect(hasEmergencyLanguage).toBe(true);
          expect(result.ReferralRecommended).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 17: YELLOW tier should include 24-hour care recommendations', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        followupResponsesArb(),
        async (encounter, followupResponses) => {
          mockDynamoDBSend.mockImplementation((command) => {
            if (command.constructor.name === 'GetItemCommand') {
              return Promise.resolve({
                Item: {
                  PK: { S: encounter.PK },
                  SK: { S: encounter.SK },
                  Type: { S: 'Encounter' },
                  EncounterId: { S: encounter.EncounterId },
                  Channel: { S: encounter.Channel },
                  Timestamp: { S: encounter.Timestamp },
                  Status: { S: encounter.Status },
                  Demographics: {
                    M: {
                      age: { N: encounter.Demographics.age.toString() },
                      sex: { S: encounter.Demographics.sex },
                      location: { S: encounter.Demographics.location },
                    },
                  },
                  Symptoms: { S: encounter.Symptoms },
                  OfflineCreated: { BOOL: encounter.OfflineCreated },
                  GSI1PK: { S: encounter.GSI1PK },
                  GSI1SK: { S: encounter.GSI1SK },
                  TTL: { N: encounter.TTL.toString() },
                },
              });
            }
            if (command.constructor.name === 'PutItemCommand') {
              putCalls.push(command.input);
            }
            if (command.constructor.name === 'UpdateItemCommand') {
              return Promise.resolve({});
            }
            return Promise.resolve({});
          });

          const mockAIResponse = {
            riskTier: 'YELLOW',
            dangerSigns: [],
            uncertainty: 'MEDIUM',
            recommendedNextSteps: ['See doctor soon'],
            watchOuts: ['Worsening'],
            referralRecommended: true,
            disclaimer: 'Test',
            reasoning: 'Test',
          };

          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: JSON.stringify(mockAIResponse) }],
            })),
          };

          mockBedrockSend.mockResolvedValue(mockBedrockResponse);

          const result = await triageService.performTriage(
            encounter.EncounterId,
            followupResponses
          );

          expect(result.RiskTier).toBe('YELLOW');

          const stepsText = result.RecommendedNextSteps.join(' ').toLowerCase();
          const has24HourLanguage = 
            stepsText.includes('24 hours') ||
            stepsText.includes('24 hour') ||
            stepsText.includes('within') ||
            stepsText.includes('today') ||
            stepsText.includes('tomorrow') ||
            stepsText.includes('clinic') ||
            stepsText.includes('healthcare facility');

          expect(has24HourLanguage).toBe(true);
          expect(result.ReferralRecommended).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 18: GREEN tier should include home care recommendations', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        followupResponsesArb(),
        async (encounter, followupResponses) => {
          mockDynamoDBSend.mockImplementation((command) => {
            if (command.constructor.name === 'GetItemCommand') {
              return Promise.resolve({
                Item: {
                  PK: { S: encounter.PK },
                  SK: { S: encounter.SK },
                  Type: { S: 'Encounter' },
                  EncounterId: { S: encounter.EncounterId },
                  Channel: { S: encounter.Channel },
                  Timestamp: { S: encounter.Timestamp },
                  Status: { S: encounter.Status },
                  Demographics: {
                    M: {
                      age: { N: encounter.Demographics.age.toString() },
                      sex: { S: encounter.Demographics.sex },
                      location: { S: encounter.Demographics.location },
                    },
                  },
                  Symptoms: { S: encounter.Symptoms },
                  OfflineCreated: { BOOL: encounter.OfflineCreated },
                  GSI1PK: { S: encounter.GSI1PK },
                  GSI1SK: { S: encounter.GSI1SK },
                  TTL: { N: encounter.TTL.toString() },
                },
              });
            }
            if (command.constructor.name === 'PutItemCommand') {
              putCalls.push(command.input);
            }
            if (command.constructor.name === 'UpdateItemCommand') {
              return Promise.resolve({});
            }
            return Promise.resolve({});
          });

          const mockAIResponse = {
            riskTier: 'GREEN',
            dangerSigns: [],
            uncertainty: 'LOW',
            recommendedNextSteps: ['Rest at home'],
            watchOuts: ['Worsening symptoms'],
            referralRecommended: false,
            disclaimer: 'Test',
            reasoning: 'Test',
          };

          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: JSON.stringify(mockAIResponse) }],
            })),
          };

          mockBedrockSend.mockResolvedValue(mockBedrockResponse);

          const result = await triageService.performTriage(
            encounter.EncounterId,
            followupResponses
          );

          expect(result.RiskTier).toBe('GREEN');

          const stepsText = result.RecommendedNextSteps.join(' ').toLowerCase();
          const hasHomeCareLanguage = 
            stepsText.includes('home') ||
            stepsText.includes('rest') ||
            stepsText.includes('monitor') ||
            stepsText.includes('hydrat');

          expect(hasHomeCareLanguage).toBe(true);
          expect(result.WatchOuts.length).toBeGreaterThan(0);
          expect(result.ReferralRecommended).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should provide watch-outs for all tiers', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        fc.oneof(
          fc.constant('RED' as TriageLevel),
          fc.constant('YELLOW' as TriageLevel),
          fc.constant('GREEN' as TriageLevel)
        ),
        async (encounter, tier) => {
          mockDynamoDBSend.mockImplementation((command) => {
            if (command.constructor.name === 'GetItemCommand') {
              return Promise.resolve({
                Item: {
                  PK: { S: encounter.PK },
                  SK: { S: encounter.SK },
                  Type: { S: 'Encounter' },
                  EncounterId: { S: encounter.EncounterId },
                  Channel: { S: encounter.Channel },
                  Timestamp: { S: encounter.Timestamp },
                  Status: { S: encounter.Status },
                  Demographics: {
                    M: {
                      age: { N: encounter.Demographics.age.toString() },
                      sex: { S: encounter.Demographics.sex },
                      location: { S: encounter.Demographics.location },
                    },
                  },
                  Symptoms: { S: encounter.Symptoms },
                  OfflineCreated: { BOOL: encounter.OfflineCreated },
                  GSI1PK: { S: encounter.GSI1PK },
                  GSI1SK: { S: encounter.GSI1SK },
                  TTL: { N: encounter.TTL.toString() },
                },
              });
            }
            if (command.constructor.name === 'PutItemCommand') {
              putCalls.push(command.input);
            }
            if (command.constructor.name === 'UpdateItemCommand') {
              return Promise.resolve({});
            }
            return Promise.resolve({});
          });

          const mockAIResponse = {
            riskTier: tier,
            dangerSigns: [],
            uncertainty: 'LOW',
            recommendedNextSteps: ['Test'],
            watchOuts: ['Test watch out'],
            referralRecommended: tier !== 'GREEN',
            disclaimer: 'Test',
            reasoning: 'Test',
          };

          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: JSON.stringify(mockAIResponse) }],
            })),
          };

          mockBedrockSend.mockResolvedValue(mockBedrockResponse);

          const result = await triageService.performTriage(encounter.EncounterId);

          expect(result.WatchOuts).toBeDefined();
          expect(Array.isArray(result.WatchOuts)).toBe(true);
          expect(result.WatchOuts.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should set referral recommendation appropriately by tier', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        fc.oneof(
          fc.constant('RED' as TriageLevel),
          fc.constant('YELLOW' as TriageLevel),
          fc.constant('GREEN' as TriageLevel)
        ),
        async (encounter, tier) => {
          mockDynamoDBSend.mockImplementation((command) => {
            if (command.constructor.name === 'GetItemCommand') {
              return Promise.resolve({
                Item: {
                  PK: { S: encounter.PK },
                  SK: { S: encounter.SK },
                  Type: { S: 'Encounter' },
                  EncounterId: { S: encounter.EncounterId },
                  Channel: { S: encounter.Channel },
                  Timestamp: { S: encounter.Timestamp },
                  Status: { S: encounter.Status },
                  Demographics: {
                    M: {
                      age: { N: encounter.Demographics.age.toString() },
                      sex: { S: encounter.Demographics.sex },
                      location: { S: encounter.Demographics.location },
                    },
                  },
                  Symptoms: { S: encounter.Symptoms },
                  OfflineCreated: { BOOL: encounter.OfflineCreated },
                  GSI1PK: { S: encounter.GSI1PK },
                  GSI1SK: { S: encounter.GSI1SK },
                  TTL: { N: encounter.TTL.toString() },
                },
              });
            }
            if (command.constructor.name === 'PutItemCommand') {
              putCalls.push(command.input);
            }
            if (command.constructor.name === 'UpdateItemCommand') {
              return Promise.resolve({});
            }
            return Promise.resolve({});
          });

          const mockAIResponse = {
            riskTier: tier,
            dangerSigns: [],
            uncertainty: 'LOW',
            recommendedNextSteps: ['Test'],
            watchOuts: ['Test'],
            referralRecommended: tier !== 'GREEN',
            disclaimer: 'Test',
            reasoning: 'Test',
          };

          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: JSON.stringify(mockAIResponse) }],
            })),
          };

          mockBedrockSend.mockResolvedValue(mockBedrockResponse);

          const result = await triageService.performTriage(encounter.EncounterId);

          if (tier === 'RED' || tier === 'YELLOW') {
            expect(result.ReferralRecommended).toBe(true);
          } else {
            expect(result.ReferralRecommended).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
