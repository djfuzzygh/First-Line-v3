/**
 * Property-Based Test: AI Request Logging
 * 
 * Property 32: AI Request Logging
 * 
 * **Validates: Requirements 14.7**
 * 
 * For any AI Engine invocation, the request and response should be logged
 * in a Decision entity linked to the encounter.
 * 
 * Feature: firstline-triage-platform, Property 32: AI Request Logging
 */

import * as fc from 'fast-check';
import { TriageService } from '../services/triage.service';
import { DynamoDBService } from '../services/dynamodb.service';
import { BedrockService } from '../services/bedrock.service';
import { DangerSignDetector } from '../services/danger-sign-detector.service';
import { RuleEngine } from '../services/rule-engine.service';
import { Encounter, Channel } from '../models';
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

describe('Property 32: AI Request Logging', () => {
  let triageService: TriageService;
  let dynamoDBService: DynamoDBService;
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
    mockDynamoDBSend = jest.fn().mockImplementation((command) => {
      // Capture put operations
      if (command.constructor.name === 'PutItemCommand') {
        putCalls.push(command.input);
      }
      return Promise.resolve({});
    });

    (DynamoDBClient as jest.Mock).mockImplementation(() => ({
      send: mockDynamoDBSend,
    }));

    // Create services
    dynamoDBService = new DynamoDBService({
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

  it('should log Decision entity for every AI Engine invocation', () => {
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

          // Mock Bedrock response
          const mockAIResponse = {
            riskTier: 'YELLOW',
            dangerSigns: [],
            uncertainty: 'MEDIUM',
            recommendedNextSteps: ['Seek care within 24 hours'],
            watchOuts: ['Worsening symptoms'],
            referralRecommended: true,
            disclaimer: 'Consult a healthcare professional',
            reasoning: 'Test reasoning for logging',
          };

          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: JSON.stringify(mockAIResponse) }],
            })),
          };

          mockBedrockSend.mockResolvedValue(mockBedrockResponse);

          // Perform triage
          await triageService.performTriage(encounter.EncounterId, followupResponses);

          // Find Decision entity in put calls
          const decisionPuts = putCalls.filter(call => {
            const typeAttr = call.Item?.Type;
            return typeAttr && (typeAttr.S === 'Decision' || typeAttr === 'Decision');
          });

          // Should have exactly one Decision entity logged
          expect(decisionPuts.length).toBeGreaterThanOrEqual(1);

          const decisionPut = decisionPuts[0];
          const item = decisionPut.Item;

          // Verify Decision entity structure
          expect(item.Type.S || item.Type).toBe('Decision');
          expect(item.PK.S || item.PK).toContain('ENC#');
          expect(item.SK.S || item.SK).toContain('DECISION');

          // Verify AI model is logged
          expect(item.AiModel).toBeDefined();

          // Verify raw response is logged
          expect(item.RawResponse).toBeDefined();
          const rawResponse = item.RawResponse.S || item.RawResponse;
          expect(rawResponse).toContain('riskTier');
          expect(rawResponse).toContain(mockAIResponse.reasoning);

          // Verify processing time is logged
          expect(item.ProcessingTimeMs).toBeDefined();
          const processingTime = parseInt(item.ProcessingTimeMs.N || item.ProcessingTimeMs);
          expect(processingTime).toBeGreaterThanOrEqual(0);

          // Verify timestamp is logged
          expect(item.Timestamp).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should link Decision entity to the correct encounter', () => {
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
            uncertainty: 'LOW',
            recommendedNextSteps: ['Rest at home'],
            watchOuts: ['Worsening symptoms'],
            referralRecommended: false,
            disclaimer: 'Consult a healthcare professional',
            reasoning: 'Test reasoning',
          };

          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: JSON.stringify(mockAIResponse) }],
            })),
          };

          mockBedrockSend.mockResolvedValue(mockBedrockResponse);

          await triageService.performTriage(encounter.EncounterId);

          // Find Decision entity
          const decisionPuts = putCalls.filter(call => {
            const typeAttr = call.Item?.Type;
            return typeAttr && (typeAttr.S === 'Decision' || typeAttr === 'Decision');
          });

          expect(decisionPuts.length).toBeGreaterThanOrEqual(1);

          const decisionPut = decisionPuts[0];
          const item = decisionPut.Item;

          // Verify PK matches encounter
          const pk = item.PK.S || item.PK;
          expect(pk).toBe(`ENC#${encounter.EncounterId}`);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should log complete AI response in RawResponse field', () => {
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
            riskTier: 'YELLOW',
            dangerSigns: ['test danger sign'],
            uncertainty: 'HIGH',
            recommendedNextSteps: ['Test step 1', 'Test step 2'],
            watchOuts: ['Test watch out'],
            referralRecommended: true,
            disclaimer: 'Test disclaimer',
            reasoning: reasoning,
          };

          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: JSON.stringify(mockAIResponse) }],
            })),
          };

          mockBedrockSend.mockResolvedValue(mockBedrockResponse);

          await triageService.performTriage(encounter.EncounterId);

          const decisionPuts = putCalls.filter(call => {
            const typeAttr = call.Item?.Type;
            return typeAttr && (typeAttr.S === 'Decision' || typeAttr === 'Decision');
          });

          expect(decisionPuts.length).toBeGreaterThanOrEqual(1);

          const decisionPut = decisionPuts[0];
          const item = decisionPut.Item;

          const rawResponse = item.RawResponse.S || item.RawResponse;
          const parsedResponse = JSON.parse(rawResponse);

          // Verify all fields are logged
          expect(parsedResponse.riskTier).toBe(mockAIResponse.riskTier);
          expect(parsedResponse.dangerSigns).toEqual(mockAIResponse.dangerSigns);
          expect(parsedResponse.uncertainty).toBe(mockAIResponse.uncertainty);
          expect(parsedResponse.recommendedNextSteps).toEqual(mockAIResponse.recommendedNextSteps);
          expect(parsedResponse.watchOuts).toEqual(mockAIResponse.watchOuts);
          expect(parsedResponse.referralRecommended).toBe(mockAIResponse.referralRecommended);
          expect(parsedResponse.disclaimer).toBe(mockAIResponse.disclaimer);
          expect(parsedResponse.reasoning).toBe(reasoning);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should log processing time for AI invocations', () => {
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
            uncertainty: 'LOW',
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

          const startTime = Date.now();
          await triageService.performTriage(encounter.EncounterId);
          const endTime = Date.now();

          const decisionPuts = putCalls.filter(call => {
            const typeAttr = call.Item?.Type;
            return typeAttr && (typeAttr.S === 'Decision' || typeAttr === 'Decision');
          });

          expect(decisionPuts.length).toBeGreaterThanOrEqual(1);

          const decisionPut = decisionPuts[0];
          const item = decisionPut.Item;

          const processingTime = parseInt(item.ProcessingTimeMs.N || item.ProcessingTimeMs);

          // Processing time should be reasonable (between 0 and total elapsed time)
          expect(processingTime).toBeGreaterThanOrEqual(0);
          expect(processingTime).toBeLessThanOrEqual(endTime - startTime + 100); // +100ms tolerance
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should not log Decision entity when danger signs trigger immediate RED', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        fc.oneof(
          fc.constant('unconscious'),
          fc.constant('having a seizure'),
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

          await triageService.performTriage(dangerEncounter.EncounterId);

          // Should NOT have Decision entity (danger sign bypasses AI)
          const decisionPuts = putCalls.filter(call => {
            const typeAttr = call.Item?.Type;
            return typeAttr && (typeAttr.S === 'Decision' || typeAttr === 'Decision');
          });

          expect(decisionPuts.length).toBe(0);

          // Should have TriageResult with RED
          const triagePuts = putCalls.filter(call => {
            const typeAttr = call.Item?.Type;
            return typeAttr && (typeAttr.S === 'TriageResult' || typeAttr === 'TriageResult');
          });

          expect(triagePuts.length).toBeGreaterThanOrEqual(1);
        }
      ),
      { numRuns: 50 }
    );
  });
});
