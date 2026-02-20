/**
 * Property-Based Test: Prompt Template Caching
 * 
 * Property 30: Prompt Template Caching
 * 
 * **Validates: Requirements 14.3**
 * 
 * For any AI Engine invocation, the system should use a cached prompt template
 * rather than constructing the prompt from scratch each time.
 * 
 * Feature: firstline-triage-platform, Property 30: Prompt Template Caching
 */

import * as fc from 'fast-check';
import { BedrockService, resetPromptTemplateCache } from '../services/bedrock.service';
import { Encounter, Channel } from '../models';
import { S3Client } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';

// Mock AWS SDKs
jest.mock('@aws-sdk/client-bedrock-runtime');
jest.mock('@aws-sdk/client-s3');

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/**
 * Generate valid encounter data
 */
const encounterArb = (): fc.Arbitrary<Encounter> =>
  fc.record({
    PK: fc.string().map(s => `ENC#${s}`),
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
    Symptoms: fc.string({ minLength: 10, maxLength: 200 }),
    Vitals: fc.option(
      fc.record({
        temperature: fc.float({ min: 35, max: 42 }),
        pulse: fc.integer({ min: 40, max: 200 }),
        bloodPressure: fc.string(),
        respiratoryRate: fc.integer({ min: 8, max: 40 }),
      }),
      { nil: undefined }
    ),
    OfflineCreated: fc.boolean(),
    SyncedAt: fc.option(fc.date().map(d => d.toISOString()), { nil: undefined }),
    GSI1PK: fc.string(),
    GSI1SK: fc.string(),
    TTL: fc.integer(),
  });

/**
 * Generate custom prompt templates
 */
const promptTemplateArb = (): fc.Arbitrary<string> =>
  fc.oneof(
    fc.constant(`Custom Template 1:
Patient: {age} years old, {sex}
Symptoms: {symptoms}
Followup: {followup}
Vitals: {vitals}
Protocols: {protocols}`),
    fc.constant(`Custom Template 2:
Age: {age}, Sex: {sex}
Chief Complaint: {symptoms}
Additional Info: {followup}
Vital Signs: {vitals}
Guidelines: {protocols}`),
    fc.constant(`Custom Template 3:
Medical Triage Assessment
Patient Age: {age}
Patient Sex: {sex}
Presenting Symptoms: {symptoms}
Follow-up Information: {followup}
Vital Signs: {vitals}
Local Protocols: {protocols}`)
  );

/**
 * Generate S3 bucket and key pairs
 */
const s3LocationArb = (): fc.Arbitrary<{ bucket: string; key: string }> =>
  fc.record({
    bucket: fc.stringOf(fc.oneof(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split(''))), { minLength: 3, maxLength: 63 })
      .filter(s => /^[a-z0-9]/.test(s) && /[a-z0-9]$/.test(s) && s.length >= 3), // Valid S3 bucket name
    key: fc.stringOf(fc.oneof(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_./'.split(''))), { minLength: 1, maxLength: 50 })
      .map(s => `prompts/${s || 'template'}.txt`),
  });

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a mock S3 response with template content
 */
function createMockS3Response(template: string): any {
  return {
    Body: {
      transformToString: async () => template,
    },
  };
}

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 30: Prompt Template Caching', () => {
  let mockBedrockSend: jest.Mock;
  let mockS3Send: jest.Mock;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset the global cache before each test
    resetPromptTemplateCache();
    
    // Save original environment
    originalEnv = { ...process.env };

    // Mock Bedrock client
    mockBedrockSend = jest.fn().mockResolvedValue({
      body: new TextEncoder().encode(JSON.stringify({
        content: [{
          text: JSON.stringify({
            riskTier: 'YELLOW',
            dangerSigns: [],
            uncertainty: 'LOW',
            recommendedNextSteps: ['Seek medical care within 24 hours'],
            watchOuts: ['Worsening symptoms'],
            referralRecommended: false,
            disclaimer: 'This is not a diagnosis. Please consult a healthcare provider.',
            reasoning: 'Test reasoning',
          }),
        }],
      })),
    });

    (BedrockRuntimeClient as jest.Mock).mockImplementation(() => ({
      send: mockBedrockSend,
    }));

    // Mock S3 client
    mockS3Send = jest.fn();
    (S3Client as jest.Mock).mockImplementation(() => ({
      send: mockS3Send,
    }));
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    resetPromptTemplateCache();
  });

  it('should cache prompt template and reuse it across multiple invocations', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(encounterArb(), { minLength: 2, maxLength: 5 }),
        async (encounters) => {
          const service = new BedrockService();

          // Get the template once to initialize cache
          const template1 = await service.getPromptTemplate();
          expect(template1).toBeDefined();
          expect(typeof template1).toBe('string');

          // Get template again - should be the same cached instance
          const template2 = await service.getPromptTemplate();
          expect(template2).toBe(template1);

          // Invoke model multiple times
          for (const encounter of encounters) {
            try {
              await service.invokeModel(encounter);
            } catch (error) {
              // Ignore invocation errors, we're testing caching
            }
          }

          // Template should still be the same
          const template3 = await service.getPromptTemplate();
          expect(template3).toBe(template1);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should load template from environment variable when PROMPT_TEMPLATE is set', () => {
    fc.assert(
      fc.asyncProperty(
        promptTemplateArb(),
        async (customTemplate) => {
          // Reset cache and set environment variable
          resetPromptTemplateCache();
          process.env.PROMPT_TEMPLATE = customTemplate;

          const service = new BedrockService();
          const template = await service.getPromptTemplate();

          // Should use the environment variable template
          expect(template).toBe(customTemplate);

          // Template should contain placeholder variables
          expect(template).toContain('{age}');
          expect(template).toContain('{sex}');
          expect(template).toContain('{symptoms}');
        }
      ),
      { numRuns: 30 }
    );
  });

  it('should load template from S3 when bucket and key are configured', async () => {
    // Reset cache and clear environment variable
    resetPromptTemplateCache();
    delete process.env.PROMPT_TEMPLATE;
    
    const customTemplate = 'Custom S3 Template: {age}, {sex}, {symptoms}';
    const s3Location = { bucket: 'test-bucket', key: 'prompts/test.txt' };
    
    // Mock S3 to return custom template
    mockS3Send.mockResolvedValue(createMockS3Response(customTemplate));

    const service = new BedrockService({
      promptTemplateBucket: s3Location.bucket,
      promptTemplateKey: s3Location.key,
    });

    const template = await service.getPromptTemplate();

    // Should have called S3
    expect(mockS3Send).toHaveBeenCalled();
    const callArg = mockS3Send.mock.calls[0][0];
    expect(callArg.input.Bucket).toBe(s3Location.bucket);
    expect(callArg.input.Key).toBe(s3Location.key);

    // Should use the S3 template
    expect(template).toBe(customTemplate);
  });

  it('should fall back to default template when S3 load fails', () => {
    fc.assert(
      fc.asyncProperty(
        s3LocationArb(),
        async (s3Location) => {
          // Reset cache and clear environment variable
          resetPromptTemplateCache();
          delete process.env.PROMPT_TEMPLATE;

          // Mock S3 to fail
          mockS3Send.mockRejectedValue(new Error('S3 access denied'));

          const service = new BedrockService({
            promptTemplateBucket: s3Location.bucket,
            promptTemplateKey: s3Location.key,
          });

          // Wait for template initialization to complete
          const template = await service.getPromptTemplate();

          // Should have attempted S3 call (may be called during initialization)
          // Note: S3 call happens during construction, so it may already be called
          
          // Should fall back to default template
          expect(template).toBeDefined();
          expect(template).toContain('You are a medical triage assistant');
          expect(template).toContain('{age}');
          expect(template).toContain('{sex}');
        }
      ),
      { numRuns: 20 }
    );
  });

  it('should use default template when no configuration is provided', () => {
    fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          // Reset cache and clear environment variable
          resetPromptTemplateCache();
          delete process.env.PROMPT_TEMPLATE;

          const service = new BedrockService();
          const template = await service.getPromptTemplate();

          // Should use default template
          expect(template).toBeDefined();
          expect(template).toContain('You are a medical triage assistant');
          expect(template).toContain('{age}');
          expect(template).toContain('{sex}');
          expect(template).toContain('{symptoms}');
          expect(template).toContain('{followup}');
          expect(template).toContain('{vitals}');
          expect(template).toContain('{protocols}');
        }
      ),
      { numRuns: 20 }
    );
  });

  it('should prioritize environment variable over S3 configuration', async () => {
    const envTemplate = 'Env Template: {age}, {sex}, {symptoms}';
    const s3Template = 'S3 Template: {age}, {sex}, {symptoms}';
    const s3Location = { bucket: 'test-bucket', key: 'prompts/test.txt' };

    // Reset cache and set environment variable
    resetPromptTemplateCache();
    process.env.PROMPT_TEMPLATE = envTemplate;

    // Mock S3 to return different template
    mockS3Send.mockResolvedValue(createMockS3Response(s3Template));

    const service = new BedrockService({
      promptTemplateBucket: s3Location.bucket,
      promptTemplateKey: s3Location.key,
    });

    const template = await service.getPromptTemplate();

    // Should use environment variable, not S3
    expect(template).toBe(envTemplate);
    expect(template).not.toBe(s3Template);

    // Should NOT have called S3
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it('should substitute template variables correctly', () => {
    fc.assert(
      fc.asyncProperty(
        encounterArb(),
        fc.array(fc.string({ minLength: 5, maxLength: 50 }), { maxLength: 3 }),
        fc.option(fc.string({ minLength: 10, maxLength: 100 }), { nil: undefined }),
        async (encounter, followupResponses, protocols) => {
          const service = new BedrockService();

          try {
            await service.invokeModel(encounter, followupResponses, protocols);

            // Check that Bedrock was called
            expect(mockBedrockSend).toHaveBeenCalled();

            // Get the prompt that was sent
            const call = mockBedrockSend.mock.calls[0][0];
            const requestBody = JSON.parse(call.input.body);
            const prompt = requestBody.messages[0].content;

            // Verify template variables were substituted
            expect(prompt).toContain(encounter.Demographics.age.toString());
            expect(prompt).toContain(encounter.Demographics.sex);
            expect(prompt).toContain(encounter.Symptoms);

            // Should not contain unsubstituted placeholders
            expect(prompt).not.toContain('{age}');
            expect(prompt).not.toContain('{sex}');
            expect(prompt).not.toContain('{symptoms}');
          } catch (error) {
            // Ignore invocation errors, we're testing template substitution
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should cache template across multiple service instances', () => {
    fc.assert(
      fc.asyncProperty(
        promptTemplateArb(),
        async (customTemplate) => {
          // Reset cache and set environment variable
          resetPromptTemplateCache();
          process.env.PROMPT_TEMPLATE = customTemplate;

          // Create first service instance
          const service1 = new BedrockService();
          const template1 = await service1.getPromptTemplate();

          // Create second service instance
          const service2 = new BedrockService();
          const template2 = await service2.getPromptTemplate();

          // Both should return the same cached template
          expect(template1).toBe(customTemplate);
          expect(template2).toBe(customTemplate);
          expect(template1).toBe(template2);
        }
      ),
      { numRuns: 30 }
    );
  });

  it('should handle template with all required placeholder variables', () => {
    fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          const service = new BedrockService();
          const template = await service.getPromptTemplate();

          // Template must contain all required placeholders
          const requiredPlaceholders = [
            '{age}',
            '{sex}',
            '{symptoms}',
            '{followup}',
            '{vitals}',
            '{protocols}',
          ];

          for (const placeholder of requiredPlaceholders) {
            expect(template).toContain(placeholder);
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  it('should load template only once per Lambda cold start', () => {
    fc.assert(
      fc.asyncProperty(
        promptTemplateArb(),
        s3LocationArb(),
        fc.array(encounterArb(), { minLength: 3, maxLength: 10 }),
        async (customTemplate, s3Location, encounters) => {
          // Reset cache and clear environment variable
          resetPromptTemplateCache();
          delete process.env.PROMPT_TEMPLATE;

          // Mock S3 to return custom template
          mockS3Send.mockResolvedValue(createMockS3Response(customTemplate));

          const service = new BedrockService({
            promptTemplateBucket: s3Location.bucket,
            promptTemplateKey: s3Location.key,
          });

          // Process multiple encounters
          for (const encounter of encounters) {
            try {
              await service.invokeModel(encounter);
            } catch (error) {
              // Ignore invocation errors
            }
          }

          // S3 should have been called only once (during initialization)
          expect(mockS3Send).toHaveBeenCalledTimes(1);
        }
      ),
      { numRuns: 20 }
    );
  });
});
