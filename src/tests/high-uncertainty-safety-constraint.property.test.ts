/**
 * Property-Based Test: High Uncertainty Safety Constraint
 * 
 * Property 13: High Uncertainty Safety Constraint
 * 
 * **Validates: Requirements 4.5**
 * 
 * For any triage assessment where the AI Engine reports HIGH uncertainty,
 * the system should not assign GREEN triage level.
 * 
 * Feature: firstline-triage-platform, Property 13: High Uncertainty Safety Constraint
 */

import * as fc from 'fast-check';
import { TriageService } from '../services/triage.service';
import { DynamoDBService } from '../services/dynamodb.service';
import { BedrockService } from '../services/bedrock.service';
import { DangerSignDetector } from '../services/danger-sign-detector.service';
import { RuleEngine } from '../services/rule-engine.service';
import { Encounter, Channel, TriageLevel } from '../models';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

// Mock AWS SDKs
jest.mock('@aws-sdk/client-bedrock-runtime');
jest.mock('@aws-sdk/client-dynamodb');

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/**
 * Generate valid encounters without danger signs
 */
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
    // Symptoms without danger signs
    Symptoms: fc.string({ minLength: 10, maxLength: 500 }).filter(s => 
      !s.match(/unconscious|seizure|can't breathe|heavy bleeding|severe chest pain|severe abdominal pain|pregnancy.*bleeding/i)
    ),
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

/**
 * Generate follow-up responses
 */
const followupResponsesArb = (): fc.Arbitrary<string[]> =>
  fc.array(
    fc.string({ minLength: 5, maxLength: 200 }),
    { minLength: 0, maxLength: 5 }
  );

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 13: High Uncertainty Safety Constraint', () => {
  let triageService: TriageService;
  let mockBedrockSend: jest.Mock;
  let mockDynamoDBSend: jest.Mock;
  let putCalls: any[];

  beforeEach(() => {
    jest.clearAllMocks();
    putCalls = [];

    // Mock Bedrock
    mockBedrockSend = jest.fn();
    (BedrockRuntimeClient as jest.Mock).mockImplementation(() => ({
      send: mockBedrockSend,
    }));

    // Mock DynamoDB
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

  it('should never assign GREEN when uncertainty is HIGH', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        followupResponsesArb(),
        async (encounter, followupResponses) => {
          // Mock DynamoDB get to return the encounter
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

          // Mock AI to return GREEN with HIGH uncertainty
          const mockAIResponse = {
            riskTier: 'GREEN',
            dangerSigns: [],
            uncertainty: 'HIGH',
            recommendedNextSteps: ['Rest at home'],
            watchOuts: ['Worsening symptoms'],
            referralRecommended: false,
            disclaimer: 'Consult a healthcare professional',
            reasoning: 'Symptoms appear mild but confidence is low',
          };

          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: JSON.stringify(mockAIResponse) }],
            })),
          };

          mockBedrockSend.mockResolvedValue(mockBedrockResponse);

          // Perform triage
          const result = await triageService.performTriage(
            encounter.EncounterId,
            followupResponses
          );

          // Should NOT be GREEN when uncertainty is HIGH
          expect(result.RiskTier).not.toBe('GREEN');
          
          // Should be upgraded to YELLOW
          expect(result.RiskTier).toBe('YELLOW');
          
          // Uncertainty should still be HIGH
          expect(result.Uncertainty).toBe('HIGH');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should allow GREEN when uncertainty is LOW or MEDIUM', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        fc.oneof(
          fc.constant('LOW' as const),
          fc.constant('MEDIUM' as const)
        ),
        async (encounter, uncertainty) => {
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

          // Mock AI to return GREEN with LOW or MEDIUM uncertainty
          const mockAIResponse = {
            riskTier: 'GREEN',
            dangerSigns: [],
            uncertainty: uncertainty,
            recommendedNextSteps: ['Rest at home'],
            watchOuts: ['Worsening symptoms'],
            referralRecommended: false,
            disclaimer: 'Consult a healthcare professional',
            reasoning: 'Symptoms appear mild',
          };

          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: JSON.stringify(mockAIResponse) }],
            })),
          };

          mockBedrockSend.mockResolvedValue(mockBedrockResponse);

          const result = await triageService.performTriage(encounter.EncounterId);

          // Should allow GREEN when uncertainty is not HIGH
          expect(result.RiskTier).toBe('GREEN');
          expect(result.Uncertainty).toBe(uncertainty);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not affect RED or YELLOW assignments with HIGH uncertainty', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        fc.oneof(
          fc.constant('RED' as TriageLevel),
          fc.constant('YELLOW' as TriageLevel)
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

          // Mock AI to return RED or YELLOW with HIGH uncertainty
          const mockAIResponse = {
            riskTier: tier,
            dangerSigns: [],
            uncertainty: 'HIGH',
            recommendedNextSteps: ['Seek medical care'],
            watchOuts: ['Worsening symptoms'],
            referralRecommended: true,
            disclaimer: 'Consult a healthcare professional',
            reasoning: 'Symptoms concerning but confidence is low',
          };

          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: JSON.stringify(mockAIResponse) }],
            })),
          };

          mockBedrockSend.mockResolvedValue(mockBedrockResponse);

          const result = await triageService.performTriage(encounter.EncounterId);

          // RED and YELLOW should not be affected by HIGH uncertainty
          expect(result.RiskTier).toBe(tier);
          expect(result.Uncertainty).toBe('HIGH');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should upgrade GREEN to YELLOW and preserve reasoning', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        fc.string({ minLength: 20, maxLength: 200 }),
        async (encounter, reasoning) => {
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
            uncertainty: 'HIGH',
            recommendedNextSteps: ['Rest'],
            watchOuts: ['Worsening'],
            referralRecommended: false,
            disclaimer: 'Test',
            reasoning: reasoning,
          };

          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: JSON.stringify(mockAIResponse) }],
            })),
          };

          mockBedrockSend.mockResolvedValue(mockBedrockResponse);

          const result = await triageService.performTriage(encounter.EncounterId);

          // Should be upgraded to YELLOW
          expect(result.RiskTier).toBe('YELLOW');

          // Reasoning should mention the safety constraint
          expect(result.Reasoning).toContain(reasoning);
          expect(result.Reasoning).toContain('Safety constraint applied');
          expect(result.Reasoning).toContain('upgraded from GREEN to YELLOW');
          expect(result.Reasoning).toContain('HIGH uncertainty');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should apply constraint consistently across all channels', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        fc.oneof(
          fc.constant('app' as Channel),
          fc.constant('voice' as Channel),
          fc.constant('ussd' as Channel),
          fc.constant('sms' as Channel)
        ),
        async (encounter, channel) => {
          const channelEncounter = { ...encounter, Channel: channel };

          mockDynamoDBSend.mockImplementation((command) => {
            if (command.constructor.name === 'GetItemCommand') {
              return Promise.resolve({
                Item: {
                  PK: { S: channelEncounter.PK },
                  SK: { S: channelEncounter.SK },
                  Type: { S: 'Encounter' },
                  EncounterId: { S: channelEncounter.EncounterId },
                  Channel: { S: channelEncounter.Channel },
                  Timestamp: { S: channelEncounter.Timestamp },
                  Status: { S: channelEncounter.Status },
                  Demographics: {
                    M: {
                      age: { N: channelEncounter.Demographics.age.toString() },
                      sex: { S: channelEncounter.Demographics.sex },
                      location: { S: channelEncounter.Demographics.location },
                    },
                  },
                  Symptoms: { S: channelEncounter.Symptoms },
                  OfflineCreated: { BOOL: channelEncounter.OfflineCreated },
                  GSI1PK: { S: channelEncounter.GSI1PK },
                  GSI1SK: { S: channelEncounter.GSI1SK },
                  TTL: { N: channelEncounter.TTL.toString() },
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
            uncertainty: 'HIGH',
            recommendedNextSteps: ['Rest'],
            watchOuts: ['Worsening'],
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

          const result = await triageService.performTriage(channelEncounter.EncounterId);

          // Should apply constraint regardless of channel
          expect(result.RiskTier).toBe('YELLOW');
          expect(result.Uncertainty).toBe('HIGH');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should update recommendations when upgrading from GREEN to YELLOW', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        async (encounter) => {
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
            uncertainty: 'HIGH',
            recommendedNextSteps: ['Rest at home', 'Drink fluids'],
            watchOuts: ['Mild worsening'],
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

          const result = await triageService.performTriage(encounter.EncounterId);

          // Should have YELLOW-appropriate recommendations
          const stepsText = result.RecommendedNextSteps.join(' ').toLowerCase();
          expect(stepsText).toMatch(/24 hours|within.*day|clinic|healthcare facility/i);

          // Should recommend referral for YELLOW
          expect(result.ReferralRecommended).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });
});
