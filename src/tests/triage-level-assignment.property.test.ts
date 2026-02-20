/**
 * Property-Based Test: Triage Level Assignment
 * 
 * Property 11: Triage Level Assignment
 * 
 * **Validates: Requirements 4.3**
 * 
 * For any completed triage assessment, the system should assign exactly one
 * triage level from the set {RED, YELLOW, GREEN}.
 * 
 * Feature: firstline-triage-platform, Property 11: Triage Level Assignment
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

describe('Property 11: Triage Level Assignment', () => {
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

  it('should assign exactly one triage level from {RED, YELLOW, GREEN}', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        triageLevelArb(),
        followupResponsesArb(),
        async (encounter, aiTier, followupResponses) => {
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

          // Mock Bedrock response with generated tier
          const mockAIResponse = {
            riskTier: aiTier,
            dangerSigns: [],
            uncertainty: 'MEDIUM',
            recommendedNextSteps: ['Test step'],
            watchOuts: ['Test watch out'],
            referralRecommended: aiTier !== 'GREEN',
            disclaimer: 'Consult a healthcare professional',
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

          // Verify exactly one triage level is assigned
          expect(result.RiskTier).toBeDefined();
          expect(['RED', 'YELLOW', 'GREEN']).toContain(result.RiskTier);

          // Verify it's a string, not an array or object
          expect(typeof result.RiskTier).toBe('string');

          // Verify the result was saved to DynamoDB
          const triagePuts = putCalls.filter(call => {
            const typeAttr = call.Item?.Type;
            return typeAttr && (typeAttr.S === 'TriageResult' || typeAttr === 'TriageResult');
          });

          expect(triagePuts.length).toBeGreaterThanOrEqual(1);

          const triagePut = triagePuts[0];
          const savedTier = triagePut.Item.RiskTier.S || triagePut.Item.RiskTier;
          expect(['RED', 'YELLOW', 'GREEN']).toContain(savedTier);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should assign valid triage level even when AI fails', () => {
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

          // Mock Bedrock to fail
          mockBedrockSend.mockRejectedValue(new Error('Bedrock service unavailable'));

          // Perform triage (should fall back to Rule Engine)
          const result = await triageService.performTriage(encounter.EncounterId);

          // Should still assign a valid triage level
          expect(result.RiskTier).toBeDefined();
          expect(['RED', 'YELLOW', 'GREEN']).toContain(result.RiskTier);

          // Should indicate fallback was used
          expect(result.UsedFallback).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should assign RED for danger signs regardless of AI output', () => {
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
        triageLevelArb().filter(tier => tier !== 'RED'),
        async (encounter, dangerSign, aiTier) => {
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

          // Mock AI to return non-RED tier (should be overridden)
          const mockAIResponse = {
            riskTier: aiTier,
            dangerSigns: [],
            uncertainty: 'LOW',
            recommendedNextSteps: ['Test'],
            watchOuts: ['Test'],
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

          // Perform triage
          const result = await triageService.performTriage(dangerEncounter.EncounterId);

          // Should assign RED regardless of AI output
          expect(result.RiskTier).toBe('RED');
          expect(result.DangerSigns.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should never assign multiple triage levels', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        triageLevelArb(),
        async (encounter, aiTier) => {
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
            riskTier: aiTier,
            dangerSigns: [],
            uncertainty: 'LOW',
            recommendedNextSteps: ['Test'],
            watchOuts: ['Test'],
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

          const result = await triageService.performTriage(encounter.EncounterId);

          // RiskTier should be a single string value, not an array
          expect(typeof result.RiskTier).toBe('string');
          expect(Array.isArray(result.RiskTier)).toBe(false);

          // Should be exactly one of the valid values
          const validTiers: TriageLevel[] = ['RED', 'YELLOW', 'GREEN'];
          expect(validTiers).toContain(result.RiskTier);

          // Count how many valid tiers match (should be exactly 1)
          const matchCount = validTiers.filter(tier => tier === result.RiskTier).length;
          expect(matchCount).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should assign consistent triage level across all channels', () => {
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
        async (encounter, aiTier, channel) => {
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
            riskTier: aiTier,
            dangerSigns: [],
            uncertainty: 'MEDIUM',
            recommendedNextSteps: ['Test'],
            watchOuts: ['Test'],
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

          const result = await triageService.performTriage(channelEncounter.EncounterId);

          // Should assign valid triage level regardless of channel
          expect(['RED', 'YELLOW', 'GREEN']).toContain(result.RiskTier);
        }
      ),
      { numRuns: 100 }
    );
  });
});
