/**
 * Property-Based Test: AI JSON Output Validation
 * 
 * Property 8: AI JSON Output Validation
 * 
 * **Validates: Requirements 3.2, 4.6, 14.4**
 * 
 * For any AI Engine response, it should be valid JSON containing all required fields:
 * riskTier, dangerSigns, uncertainty, recommendedNextSteps, watchOuts, 
 * referralRecommended, and disclaimer.
 * 
 * Feature: firstline-triage-platform, Property 8: AI JSON Output Validation
 */

import * as fc from 'fast-check';
import { BedrockService } from '../services/bedrock.service';
import { Encounter, AIResponse, TriageLevel, UncertaintyLevel, Channel } from '../models';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';

// Mock AWS SDK
jest.mock('@aws-sdk/client-bedrock-runtime');

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

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
 * Generate valid AI responses
 */
const validAIResponseArb = (): fc.Arbitrary<AIResponse> =>
  fc.record({
    riskTier: triageLevelArb(),
    dangerSigns: fc.array(fc.string({ minLength: 3, maxLength: 50 }), { maxLength: 5 }),
    uncertainty: uncertaintyLevelArb(),
    recommendedNextSteps: fc.array(fc.string({ minLength: 10, maxLength: 100 }), { minLength: 1, maxLength: 5 }),
    watchOuts: fc.array(fc.string({ minLength: 10, maxLength: 100 }), { minLength: 1, maxLength: 5 }),
    referralRecommended: fc.boolean(),
    disclaimer: fc.string({ minLength: 20, maxLength: 200 }),
    reasoning: fc.string({ minLength: 20, maxLength: 300 }),
  });

/**
 * Generate encounter data for testing
 */
const encounterArb = (): fc.Arbitrary<Encounter> =>
  fc.record({
    PK: fc.string({ minLength: 10, maxLength: 50 }).map(id => `ENC#${id}`),
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
    Status: fc.oneof(
      fc.constant('created' as const),
      fc.constant('in_progress' as const),
      fc.constant('completed' as const)
    ),
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

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 8: AI JSON Output Validation', () => {
  let service: BedrockService;
  let mockSend: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockSend = jest.fn();
    (BedrockRuntimeClient as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));

    service = new BedrockService({
      modelId: 'test-model',
      region: 'us-east-1',
      maxInputTokens: 2000,
      maxOutputTokens: 500,
      temperature: 0.3,
      timeoutMs: 30000,
    });
  });

  it('should successfully parse valid AI responses with all required fields', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        validAIResponseArb(),
        async (encounter, aiResponse) => {
          // Mock Bedrock to return the generated AI response
          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [
                {
                  text: JSON.stringify(aiResponse),
                },
              ],
            })),
          };

          mockSend.mockResolvedValue(mockBedrockResponse);

          // Invoke the service
          const result = await service.invokeModel(encounter);

          // Verify all required fields are present
          expect(result).toHaveProperty('riskTier');
          expect(result).toHaveProperty('dangerSigns');
          expect(result).toHaveProperty('uncertainty');
          expect(result).toHaveProperty('recommendedNextSteps');
          expect(result).toHaveProperty('watchOuts');
          expect(result).toHaveProperty('referralRecommended');
          expect(result).toHaveProperty('disclaimer');
          expect(result).toHaveProperty('reasoning');

          // Verify field types
          expect(['RED', 'YELLOW', 'GREEN']).toContain(result.riskTier);
          expect(Array.isArray(result.dangerSigns)).toBe(true);
          expect(['LOW', 'MEDIUM', 'HIGH']).toContain(result.uncertainty);
          expect(Array.isArray(result.recommendedNextSteps)).toBe(true);
          expect(Array.isArray(result.watchOuts)).toBe(true);
          expect(typeof result.referralRecommended).toBe('boolean');
          expect(typeof result.disclaimer).toBe('string');
          expect(typeof result.reasoning).toBe('string');

          // Verify the result matches the input
          expect(result).toEqual(aiResponse);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject responses missing riskTier field', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        validAIResponseArb(),
        async (encounter, aiResponse) => {
          // Remove riskTier field
          const { riskTier, ...incompleteResponse } = aiResponse;

          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: JSON.stringify(incompleteResponse) }],
            })),
          };

          mockSend.mockResolvedValue(mockBedrockResponse);

          // Should throw error for missing field
          await expect(service.invokeModel(encounter))
            .rejects
            .toThrow('Missing required field in AI response: riskTier');
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should reject responses missing dangerSigns field', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        validAIResponseArb(),
        async (encounter, aiResponse) => {
          const { dangerSigns, ...incompleteResponse } = aiResponse;

          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: JSON.stringify(incompleteResponse) }],
            })),
          };

          mockSend.mockResolvedValue(mockBedrockResponse);

          await expect(service.invokeModel(encounter))
            .rejects
            .toThrow('Missing required field in AI response: dangerSigns');
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should reject responses missing uncertainty field', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        validAIResponseArb(),
        async (encounter, aiResponse) => {
          const { uncertainty, ...incompleteResponse } = aiResponse;

          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: JSON.stringify(incompleteResponse) }],
            })),
          };

          mockSend.mockResolvedValue(mockBedrockResponse);

          await expect(service.invokeModel(encounter))
            .rejects
            .toThrow('Missing required field in AI response: uncertainty');
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should reject responses missing recommendedNextSteps field', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        validAIResponseArb(),
        async (encounter, aiResponse) => {
          const { recommendedNextSteps, ...incompleteResponse } = aiResponse;

          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: JSON.stringify(incompleteResponse) }],
            })),
          };

          mockSend.mockResolvedValue(mockBedrockResponse);

          await expect(service.invokeModel(encounter))
            .rejects
            .toThrow('Missing required field in AI response: recommendedNextSteps');
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should reject responses with invalid riskTier values', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        validAIResponseArb(),
        fc.string().filter(s => !['RED', 'YELLOW', 'GREEN'].includes(s)),
        async (encounter, aiResponse, invalidTier) => {
          const invalidResponse = { ...aiResponse, riskTier: invalidTier };

          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: JSON.stringify(invalidResponse) }],
            })),
          };

          mockSend.mockResolvedValue(mockBedrockResponse);

          await expect(service.invokeModel(encounter))
            .rejects
            .toThrow('Invalid riskTier value');
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should reject responses with invalid uncertainty values', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        validAIResponseArb(),
        fc.string().filter(s => !['LOW', 'MEDIUM', 'HIGH'].includes(s)),
        async (encounter, aiResponse, invalidUncertainty) => {
          const invalidResponse = { ...aiResponse, uncertainty: invalidUncertainty };

          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: JSON.stringify(invalidResponse) }],
            })),
          };

          mockSend.mockResolvedValue(mockBedrockResponse);

          await expect(service.invokeModel(encounter))
            .rejects
            .toThrow('Invalid uncertainty value');
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should reject responses where dangerSigns is not an array', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        validAIResponseArb(),
        fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
        async (encounter, aiResponse, nonArrayValue) => {
          const invalidResponse = { ...aiResponse, dangerSigns: nonArrayValue };

          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: JSON.stringify(invalidResponse) }],
            })),
          };

          mockSend.mockResolvedValue(mockBedrockResponse);

          await expect(service.invokeModel(encounter))
            .rejects
            .toThrow('dangerSigns must be an array');
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should reject responses where recommendedNextSteps is not an array', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        validAIResponseArb(),
        fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
        async (encounter, aiResponse, nonArrayValue) => {
          const invalidResponse = { ...aiResponse, recommendedNextSteps: nonArrayValue };

          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: JSON.stringify(invalidResponse) }],
            })),
          };

          mockSend.mockResolvedValue(mockBedrockResponse);

          await expect(service.invokeModel(encounter))
            .rejects
            .toThrow('recommendedNextSteps must be an array');
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should reject responses where watchOuts is not an array', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        validAIResponseArb(),
        fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
        async (encounter, aiResponse, nonArrayValue) => {
          const invalidResponse = { ...aiResponse, watchOuts: nonArrayValue };

          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: JSON.stringify(invalidResponse) }],
            })),
          };

          mockSend.mockResolvedValue(mockBedrockResponse);

          await expect(service.invokeModel(encounter))
            .rejects
            .toThrow('watchOuts must be an array');
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should reject responses where referralRecommended is not a boolean', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        validAIResponseArb(),
        fc.oneof(fc.string(), fc.integer(), fc.constant(null)),
        async (encounter, aiResponse, nonBooleanValue) => {
          const invalidResponse = { ...aiResponse, referralRecommended: nonBooleanValue };

          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: JSON.stringify(invalidResponse) }],
            })),
          };

          mockSend.mockResolvedValue(mockBedrockResponse);

          await expect(service.invokeModel(encounter))
            .rejects
            .toThrow('referralRecommended must be a boolean');
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should reject completely invalid JSON responses', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        fc.string({ minLength: 1 }).filter(s => {
          try {
            JSON.parse(s);
            return false;
          } catch {
            return true;
          }
        }),
        async (encounter, invalidJson) => {
          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: invalidJson }],
            })),
          };

          mockSend.mockResolvedValue(mockBedrockResponse);

          await expect(service.invokeModel(encounter))
            .rejects
            .toThrow(/Invalid JSON response from Bedrock/);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should handle valid responses with empty arrays', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        validAIResponseArb(),
        async (encounter, aiResponse) => {
          // Create response with empty arrays (which is valid)
          const responseWithEmptyArrays = {
            ...aiResponse,
            dangerSigns: [],
            recommendedNextSteps: ['At least one step required'],
            watchOuts: ['At least one watch out'],
          };

          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: JSON.stringify(responseWithEmptyArrays) }],
            })),
          };

          mockSend.mockResolvedValue(mockBedrockResponse);

          const result = await service.invokeModel(encounter);

          expect(result.dangerSigns).toEqual([]);
          expect(Array.isArray(result.dangerSigns)).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should validate all required fields are present regardless of encounter type', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        validAIResponseArb(),
        async (encounter, aiResponse) => {
          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: JSON.stringify(aiResponse) }],
            })),
          };

          mockSend.mockResolvedValue(mockBedrockResponse);

          const result = await service.invokeModel(encounter);

          // Verify all 8 required fields
          const requiredFields = [
            'riskTier',
            'dangerSigns',
            'uncertainty',
            'recommendedNextSteps',
            'watchOuts',
            'referralRecommended',
            'disclaimer',
            'reasoning',
          ];

          for (const field of requiredFields) {
            expect(result).toHaveProperty(field);
            expect(result[field as keyof AIResponse]).not.toBeUndefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle responses with follow-up responses included', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        validAIResponseArb(),
        fc.array(fc.string({ minLength: 5, maxLength: 100 }), { maxLength: 5 }),
        async (encounter, aiResponse, followupResponses) => {
          // Clear mock for each property test run
          mockSend.mockClear();
          
          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: JSON.stringify(aiResponse) }],
            })),
          };

          mockSend.mockResolvedValue(mockBedrockResponse);

          const result = await service.invokeModel(encounter, followupResponses);

          // Should still validate all fields correctly
          expect(result).toEqual(aiResponse);
          expect(mockSend).toHaveBeenCalledTimes(1);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should handle responses with custom protocols included', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        validAIResponseArb(),
        fc.string({ minLength: 10, maxLength: 200 }),
        async (encounter, aiResponse, protocols) => {
          // Clear mock for each property test run
          mockSend.mockClear();
          
          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: JSON.stringify(aiResponse) }],
            })),
          };

          mockSend.mockResolvedValue(mockBedrockResponse);

          const result = await service.invokeModel(encounter, [], protocols);

          // Should still validate all fields correctly
          expect(result).toEqual(aiResponse);
          expect(mockSend).toHaveBeenCalledTimes(1);
        }
      ),
      { numRuns: 50 }
    );
  });
});
