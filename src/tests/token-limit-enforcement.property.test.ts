/**
 * Property-Based Test: Token Limit Enforcement
 * 
 * Property 33: Token Limit Enforcement
 * 
 * **Validates: Requirements 15.2**
 * 
 * For any AI Engine invocation, the input prompt should be truncated if necessary
 * to stay within 2000 tokens, and the output should be limited to 500 tokens.
 * 
 * Feature: firstline-triage-platform, Property 33: Token Limit Enforcement
 */

import * as fc from 'fast-check';
import { BedrockService } from '../services/bedrock.service';
import { Encounter, Channel } from '../models';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';

// Mock AWS SDK
jest.mock('@aws-sdk/client-bedrock-runtime');

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/**
 * Generate encounters with varying symptom lengths
 */
const encounterWithLongSymptomsArb = (): fc.Arbitrary<Encounter> =>
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
    // Generate very long symptom descriptions (up to 10000 characters)
    Symptoms: fc.string({ minLength: 100, maxLength: 10000 }),
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
 * Generate very long follow-up responses
 */
const longFollowupResponsesArb = (): fc.Arbitrary<string[]> =>
  fc.array(
    fc.string({ minLength: 100, maxLength: 2000 }),
    { minLength: 0, maxLength: 10 }
  );

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 33: Token Limit Enforcement', () => {
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

  it('should truncate input prompts exceeding 2000 tokens', () => {
    fc.assert(
      fc.asyncProperty(
        encounterWithLongSymptomsArb(),
        longFollowupResponsesArb(),
        async (encounter, followupResponses) => {
          // Mock successful Bedrock response
          const mockResponse = {
            riskTier: 'YELLOW',
            dangerSigns: [],
            uncertainty: 'MEDIUM',
            recommendedNextSteps: ['Seek care within 24 hours'],
            watchOuts: ['Worsening symptoms'],
            referralRecommended: true,
            disclaimer: 'Consult a healthcare professional',
            reasoning: 'Test reasoning',
          };

          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: JSON.stringify(mockResponse) }],
            })),
          };

          mockSend.mockResolvedValue(mockBedrockResponse);

          // Invoke the service
          await service.invokeModel(encounter, followupResponses);

          // Verify that send was called
          expect(mockSend).toHaveBeenCalledTimes(1);

          // Get the actual request body sent to Bedrock
          const callArgs = mockSend.mock.calls[0][0];
          const requestBody = JSON.parse(callArgs.input.body);
          const prompt = requestBody.messages[0].content;

          // Estimate token count (1 token ≈ 4 characters)
          const estimatedTokens = Math.ceil(prompt.length / 4);

          // Verify token limit is enforced (with some tolerance for estimation)
          // Should be at or below 2000 tokens
          expect(estimatedTokens).toBeLessThanOrEqual(2000);

          // If original content was very long, verify truncation occurred
          const totalInputLength = 
            encounter.Symptoms.length + 
            followupResponses.join('').length;
          
          if (totalInputLength > 8000) { // 2000 tokens * 4 chars
            // Should contain truncation marker
            expect(prompt).toContain('[truncated]');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should enforce max output tokens of 500 in Bedrock request', () => {
    fc.assert(
      fc.asyncProperty(
        encounterWithLongSymptomsArb(),
        async (encounter) => {
          const mockResponse = {
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
              content: [{ text: JSON.stringify(mockResponse) }],
            })),
          };

          mockSend.mockResolvedValue(mockBedrockResponse);

          await service.invokeModel(encounter);

          // Verify that send was called
          expect(mockSend).toHaveBeenCalledTimes(1);

          // Get the actual request body
          const callArgs = mockSend.mock.calls[0][0];
          const requestBody = JSON.parse(callArgs.input.body);

          // Verify max_tokens is set to 500
          expect(requestBody.max_tokens).toBe(500);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not truncate prompts under 2000 tokens', () => {
    fc.assert(
      fc.asyncProperty(
        fc.record({
          PK: fc.uuid().map(id => `ENC#${id}`),
          SK: fc.constant('METADATA'),
          Type: fc.constant('Encounter' as const),
          EncounterId: fc.uuid(),
          Channel: fc.constant('app' as Channel),
          Timestamp: fc.date().map(d => d.toISOString()),
          Status: fc.constant('in_progress' as const),
          Demographics: fc.record({
            age: fc.integer({ min: 0, max: 120 }),
            sex: fc.constant('M' as const),
            location: fc.string({ minLength: 3, maxLength: 20 }),
          }),
          // Short symptoms (well under token limit)
          Symptoms: fc.string({ minLength: 10, maxLength: 200 }),
          Vitals: fc.constant(undefined),
          OfflineCreated: fc.boolean(),
          GSI1PK: fc.string(),
          GSI1SK: fc.string(),
          TTL: fc.integer({ min: 1000000000, max: 2000000000 }),
        }),
        async (encounter) => {
          const mockResponse = {
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
              content: [{ text: JSON.stringify(mockResponse) }],
            })),
          };

          mockSend.mockResolvedValue(mockBedrockResponse);

          await service.invokeModel(encounter);

          // Get the actual request body
          const callArgs = mockSend.mock.calls[0][0];
          const requestBody = JSON.parse(callArgs.input.body);
          const prompt = requestBody.messages[0].content;

          // Should NOT contain truncation marker for short prompts
          expect(prompt).not.toContain('[truncated]');
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should handle edge case of exactly 2000 tokens', () => {
    fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 7900, max: 8100 }).chain(length =>
          fc.record({
            PK: fc.uuid().map(id => `ENC#${id}`),
            SK: fc.constant('METADATA'),
            Type: fc.constant('Encounter' as const),
            EncounterId: fc.uuid(),
            Channel: fc.constant('app' as Channel),
            Timestamp: fc.date().map(d => d.toISOString()),
            Status: fc.constant('in_progress' as const),
            Demographics: fc.record({
              age: fc.constant(30),
              sex: fc.constant('M' as const),
              location: fc.constant('Test Location'),
            }),
            // Generate symptoms that result in ~2000 tokens (8000 chars)
            Symptoms: fc.stringOf(fc.char(), { minLength: length, maxLength: length }),
            Vitals: fc.constant(undefined),
            OfflineCreated: fc.boolean(),
            GSI1PK: fc.string(),
            GSI1SK: fc.string(),
            TTL: fc.integer({ min: 1000000000, max: 2000000000 }),
          })
        ),
        async (encounter) => {
          const mockResponse = {
            riskTier: 'YELLOW',
            dangerSigns: [],
            uncertainty: 'MEDIUM',
            recommendedNextSteps: ['Seek care'],
            watchOuts: ['Symptoms worsening'],
            referralRecommended: true,
            disclaimer: 'Consult a healthcare professional',
            reasoning: 'Test reasoning',
          };

          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: JSON.stringify(mockResponse) }],
            })),
          };

          mockSend.mockResolvedValue(mockBedrockResponse);

          await service.invokeModel(encounter);

          const callArgs = mockSend.mock.calls[0][0];
          const requestBody = JSON.parse(callArgs.input.body);
          const prompt = requestBody.messages[0].content;

          const estimatedTokens = Math.ceil(prompt.length / 4);

          // Should be at or just under the limit
          expect(estimatedTokens).toBeLessThanOrEqual(2000);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should preserve token limits across different encounter types', () => {
    fc.assert(
      fc.asyncProperty(
        encounterWithLongSymptomsArb(),
        fc.oneof(
          fc.constant('app' as Channel),
          fc.constant('voice' as Channel),
          fc.constant('ussd' as Channel),
          fc.constant('sms' as Channel)
        ),
        async (encounter, channel) => {
          const modifiedEncounter = { ...encounter, Channel: channel };

          const mockResponse = {
            riskTier: 'YELLOW',
            dangerSigns: [],
            uncertainty: 'MEDIUM',
            recommendedNextSteps: ['Seek care'],
            watchOuts: ['Symptoms worsening'],
            referralRecommended: true,
            disclaimer: 'Consult a healthcare professional',
            reasoning: 'Test reasoning',
          };

          const mockBedrockResponse = {
            body: new TextEncoder().encode(JSON.stringify({
              content: [{ text: JSON.stringify(mockResponse) }],
            })),
          };

          mockSend.mockResolvedValue(mockBedrockResponse);

          await service.invokeModel(modifiedEncounter);

          const callArgs = mockSend.mock.calls[0][0];
          const requestBody = JSON.parse(callArgs.input.body);

          // Verify limits are enforced regardless of channel
          expect(requestBody.max_tokens).toBe(500);
          
          const prompt = requestBody.messages[0].content;
          const estimatedTokens = Math.ceil(prompt.length / 4);
          expect(estimatedTokens).toBeLessThanOrEqual(2000);
        }
      ),
      { numRuns: 100 }
    );
  });
});
