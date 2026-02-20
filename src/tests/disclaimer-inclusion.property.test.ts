/**
 * Property-Based Test: Disclaimer Inclusion
 * 
 * Property 15: Disclaimer Inclusion
 * 
 * **Validates: Requirements 6.3**
 * 
 * For any triage result, the system should include a disclaimer recommending
 * clinician confirmation.
 * 
 * Feature: firstline-triage-platform, Property 15: Disclaimer Inclusion
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

/**
 * Generate valid encounters
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

/**
 * Generate valid triage levels
 */
const triageLevelArb = (): fc.Arbitrary<TriageLevel> =>
  fc.oneof(
    fc.constant('RED' as TriageLevel),
    fc.constant('YELLOW' as TriageLevel),
    fc.constant('GREEN' as TriageLevel)
  );

/**
 * Generate valid uncertainty levels
 */
const uncertaintyLevelArb = (): fc.Arbitrary<UncertaintyLevel> =>
  fc.oneof(
    fc.constant('LOW' as UncertaintyLevel),
    fc.constant('MEDIUM' as UncertaintyLevel),
    fc.constant('HIGH' as UncertaintyLevel)
  );

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

describe('Property 15: Disclaimer Inclusion', () => {
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

  it('should include disclaimer in all triage results', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        triageLevelArb(),
        uncertaintyLevelArb(),
        followupResponsesArb(),
        async (encounter, tier, uncertainty, followupResponses) => {
          // Filter out HIGH uncertainty with GREEN (would be upgraded)
          if (uncertainty === 'HIGH' && tier === 'GREEN') {
            tier = 'YELLOW';
          }

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

          // Mock AI response with valid disclaimer
          const mockAIResponse = {
            riskTier: tier,
            dangerSigns: [],
            uncertainty: uncertainty,
            recommendedNextSteps: ['Test step'],
            watchOuts: ['Test watch out'],
            referralRecommended: tier !== 'GREEN',
            disclaimer: 'This assessment should be confirmed by a qualified healthcare professional.',
            reasoning: 'Test reasoning',
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

          // Verify disclaimer is present
          expect(result.Disclaimer).toBeDefined();
          expect(result.Disclaimer).not.toBe('');
          expect(typeof result.Disclaimer).toBe('string');
          expect(result.Disclaimer.length).toBeGreaterThan(10);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should include disclaimer even when AI fails', () => {
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

          // Mock Bedrock to fail (should fall back to Rule Engine)
          mockBedrockSend.mockRejectedValue(new Error('Bedrock unavailable'));

          const result = await triageService.performTriage(encounter.EncounterId);

          // Should still have disclaimer from Rule Engine
          expect(result.Disclaimer).toBeDefined();
          expect(result.Disclaimer).not.toBe('');
          expect(result.Disclaimer.length).toBeGreaterThan(10);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should include disclaimer for danger sign cases', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        fc.oneof(
          fc.constant('unconscious'),
          fc.constant('seizure'),
          fc.constant('can\'t breathe'),
          fc.constant('heavy bleeding'),
          fc.constant('severe chest pain')
        ),
        async (encounter, dangerSign) => {
          // Modify encounter to include danger sign
          const dangerEncounter = {
            ...encounter,
            Symptoms: `Patient is ${dangerSign} and needs help`,
          };

          mockDynamoDBSend.mockImplementation((command) => {
            if (command.constructor.name === 'GetItemCommand') {
              return Promise.resolve({
                Item: {
                  PK: { S: dangerEncounter.PK },
                  SK: { S: dangerEncounter.SK },
                  Type: { S: 'Encounter' },
                  EncounterId: { S: dangerEncounter.EncounterId },
                  Channel: { S: dangerEncounter.Channel },
                  Timestamp: { S: dangerEncounter.Timestamp },
                  Status: { S: dangerEncounter.Status },
                  Demographics: {
                    M: {
                      age: { N: dangerEncounter.Demographics.age.toString() },
                      sex: { S: dangerEncounter.Demographics.sex },
                      location: { S: dangerEncounter.Demographics.location },
                    },
                  },
                  Symptoms: { S: dangerEncounter.Symptoms },
                  OfflineCreated: { BOOL: dangerEncounter.OfflineCreated },
                  GSI1PK: { S: dangerEncounter.GSI1PK },
                  GSI1SK: { S: dangerEncounter.GSI1SK },
                  TTL: { N: dangerEncounter.TTL.toString() },
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

          const result = await triageService.performTriage(dangerEncounter.EncounterId);

          // Should have disclaimer even for danger sign RED cases
          expect(result.Disclaimer).toBeDefined();
          expect(result.Disclaimer).not.toBe('');
          expect(result.RiskTier).toBe('RED');
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should provide default disclaimer when AI returns empty disclaimer', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        triageLevelArb(),
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

          // Mock AI response with empty disclaimer
          const mockAIResponse = {
            riskTier: tier,
            dangerSigns: [],
            uncertainty: 'LOW',
            recommendedNextSteps: ['Test'],
            watchOuts: ['Test'],
            referralRecommended: true,
            disclaimer: '', // Empty disclaimer
            reasoning: 'Test',
          };

          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: JSON.stringify(mockAIResponse) }],
            })),
          };

          mockBedrockSend.mockResolvedValue(mockBedrockResponse);

          const result = await triageService.performTriage(encounter.EncounterId);

          // Should have default disclaimer
          expect(result.Disclaimer).toBeDefined();
          expect(result.Disclaimer).not.toBe('');
          expect(result.Disclaimer.length).toBeGreaterThan(20);
          expect(result.Disclaimer.toLowerCase()).toContain('healthcare professional');
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should include disclaimer across all channels', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        triageLevelArb(),
        fc.oneof(
          fc.constant('app' as Channel),
          fc.constant('voice' as Channel),
          fc.constant('ussd' as Channel),
          fc.constant('sms' as Channel)
        ),
        async (encounter, tier, channel) => {
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
            riskTier: tier,
            dangerSigns: [],
            uncertainty: 'MEDIUM',
            recommendedNextSteps: ['Test'],
            watchOuts: ['Test'],
            referralRecommended: true,
            disclaimer: 'Consult a healthcare professional',
            reasoning: 'Test',
          };

          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: JSON.stringify(mockAIResponse) }],
            })),
          };

          mockBedrockSend.mockResolvedValue(mockBedrockResponse);

          const result = await triageService.performTriage(channelEncounter.EncounterId);

          // Should have disclaimer regardless of channel
          expect(result.Disclaimer).toBeDefined();
          expect(result.Disclaimer).not.toBe('');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should include meaningful disclaimer content', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        triageLevelArb(),
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
            referralRecommended: true,
            disclaimer: 'This is for informational purposes. Seek professional medical advice.',
            reasoning: 'Test',
          };

          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: JSON.stringify(mockAIResponse) }],
            })),
          };

          mockBedrockSend.mockResolvedValue(mockBedrockResponse);

          const result = await triageService.performTriage(encounter.EncounterId);

          // Disclaimer should contain key phrases about professional confirmation
          const disclaimerLower = result.Disclaimer.toLowerCase();
          const hasRelevantContent = 
            disclaimerLower.includes('professional') ||
            disclaimerLower.includes('healthcare') ||
            disclaimerLower.includes('medical') ||
            disclaimerLower.includes('clinician') ||
            disclaimerLower.includes('doctor');

          expect(hasRelevantContent).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
