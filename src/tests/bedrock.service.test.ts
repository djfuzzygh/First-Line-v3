/**
 * Unit tests for BedrockService
 * 
 * Tests specific examples and edge cases for Bedrock AI integration
 */

import { BedrockService } from '../services/bedrock.service';
import { Encounter, AIResponse } from '../models';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

// Mock AWS SDK
jest.mock('@aws-sdk/client-bedrock-runtime');

describe('BedrockService', () => {
  let service: BedrockService;
  let mockSend: jest.Mock;

  const mockEncounter: Encounter = {
    PK: 'ENC#test-123',
    SK: 'METADATA',
    Type: 'Encounter',
    EncounterId: 'test-123',
    Channel: 'app',
    Timestamp: '2024-01-01T00:00:00Z',
    Status: 'in_progress',
    Demographics: {
      age: 35,
      sex: 'M',
      location: 'Test City',
    },
    Symptoms: 'Severe headache for 2 days',
    Vitals: {
      temperature: 37.5,
      pulse: 80,
      bloodPressure: '120/80',
      respiratoryRate: 16,
    },
    OfflineCreated: false,
    GSI1PK: 'DATE#2024-01-01',
    GSI1SK: 'CHANNEL#app#TIME#2024-01-01T00:00:00Z',
    TTL: 1704067200,
  };

  const mockAIResponse: AIResponse = {
    riskTier: 'YELLOW',
    dangerSigns: [],
    uncertainty: 'LOW',
    recommendedNextSteps: [
      'Seek medical evaluation within 24 hours',
      'Monitor symptoms closely',
    ],
    watchOuts: ['Symptoms getting worse', 'Vision changes'],
    referralRecommended: true,
    disclaimer: 'This assessment should be confirmed by a qualified healthcare professional.',
    reasoning: 'Moderate headache lasting 2 days warrants medical evaluation.',
  };

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

  describe('invokeModel', () => {
    it('should successfully invoke Bedrock and return parsed response', async () => {
      // Mock successful Bedrock response
      const mockBedrockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [
            {
              text: JSON.stringify(mockAIResponse),
            },
          ],
        })),
      };

      mockSend.mockResolvedValue(mockBedrockResponse);

      const result = await service.invokeModel(mockEncounter);

      expect(result).toEqual(mockAIResponse);
      expect(mockSend).toHaveBeenCalledTimes(1);
      
      // Verify the command was called with correct structure
      const callArg = mockSend.mock.calls[0][0];
      expect(callArg).toBeInstanceOf(InvokeModelCommand);
    });

    it('should include follow-up responses in prompt', async () => {
      const mockBedrockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{ text: JSON.stringify(mockAIResponse) }],
        })),
      };

      mockSend.mockResolvedValue(mockBedrockResponse);

      const followupResponses = ['Pain is 8/10', 'No vision changes'];
      const result = await service.invokeModel(mockEncounter, followupResponses);

      expect(result).toEqual(mockAIResponse);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should handle encounter without vitals', async () => {
      const encounterNoVitals = { ...mockEncounter, Vitals: undefined };
      
      const mockBedrockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{ text: JSON.stringify(mockAIResponse) }],
        })),
      };

      mockSend.mockResolvedValue(mockBedrockResponse);

      const result = await service.invokeModel(encounterNoVitals);

      expect(result).toEqual(mockAIResponse);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should timeout after configured duration', async () => {
      // Create service with short timeout
      const shortTimeoutService = new BedrockService({
        timeoutMs: 100,
      });

      // Mock slow Bedrock response
      mockSend.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 200))
      );

      await expect(shortTimeoutService.invokeModel(mockEncounter))
        .rejects
        .toThrow('Bedrock invocation timed out after 100ms');
    });

    it('should throw error for invalid JSON response', async () => {
      const mockBedrockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{ text: 'not valid json' }],
        })),
      };

      mockSend.mockResolvedValue(mockBedrockResponse);

      await expect(service.invokeModel(mockEncounter))
        .rejects
        .toThrow('Invalid JSON response from Bedrock');
    });

    it('should throw error for missing required fields', async () => {
      const incompleteResponse = {
        riskTier: 'YELLOW',
        dangerSigns: [],
        // Missing other required fields
      };

      const mockBedrockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{ text: JSON.stringify(incompleteResponse) }],
        })),
      };

      mockSend.mockResolvedValue(mockBedrockResponse);

      await expect(service.invokeModel(mockEncounter))
        .rejects
        .toThrow('Missing required field in AI response');
    });

    it('should throw error for invalid riskTier value', async () => {
      const invalidResponse = {
        ...mockAIResponse,
        riskTier: 'INVALID',
      };

      const mockBedrockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{ text: JSON.stringify(invalidResponse) }],
        })),
      };

      mockSend.mockResolvedValue(mockBedrockResponse);

      await expect(service.invokeModel(mockEncounter))
        .rejects
        .toThrow('Invalid riskTier value');
    });

    it('should throw error for invalid uncertainty value', async () => {
      const invalidResponse = {
        ...mockAIResponse,
        uncertainty: 'INVALID',
      };

      const mockBedrockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{ text: JSON.stringify(invalidResponse) }],
        })),
      };

      mockSend.mockResolvedValue(mockBedrockResponse);

      await expect(service.invokeModel(mockEncounter))
        .rejects
        .toThrow('Invalid uncertainty value');
    });

    it('should throw error when dangerSigns is not an array', async () => {
      const invalidResponse = {
        ...mockAIResponse,
        dangerSigns: 'not an array',
      };

      const mockBedrockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{ text: JSON.stringify(invalidResponse) }],
        })),
      };

      mockSend.mockResolvedValue(mockBedrockResponse);

      await expect(service.invokeModel(mockEncounter))
        .rejects
        .toThrow('dangerSigns must be an array');
    });

    it('should throw error when referralRecommended is not boolean', async () => {
      const invalidResponse = {
        ...mockAIResponse,
        referralRecommended: 'yes',
      };

      const mockBedrockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{ text: JSON.stringify(invalidResponse) }],
        })),
      };

      mockSend.mockResolvedValue(mockBedrockResponse);

      await expect(service.invokeModel(mockEncounter))
        .rejects
        .toThrow('referralRecommended must be a boolean');
    });

    it('should handle Bedrock API errors', async () => {
      mockSend.mockRejectedValue(new Error('Bedrock API error'));

      await expect(service.invokeModel(mockEncounter))
        .rejects
        .toThrow('Bedrock API error');
    });

    it('should truncate long prompts to token limit', async () => {
      // Create encounter with very long symptoms
      const longSymptoms = 'a'.repeat(10000); // ~2500 tokens
      const longEncounter = {
        ...mockEncounter,
        Symptoms: longSymptoms,
      };

      const mockBedrockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{ text: JSON.stringify(mockAIResponse) }],
        })),
      };

      mockSend.mockResolvedValue(mockBedrockResponse);

      const result = await service.invokeModel(longEncounter);

      expect(result).toEqual(mockAIResponse);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should include custom protocols in prompt', async () => {
      const mockBedrockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{ text: JSON.stringify(mockAIResponse) }],
        })),
      };

      mockSend.mockResolvedValue(mockBedrockResponse);

      const customProtocols = 'Local malaria screening protocol';
      const result = await service.invokeModel(mockEncounter, [], customProtocols);

      expect(result).toEqual(mockAIResponse);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('countTokens', () => {
    it('should estimate token counts correctly', () => {
      const prompt = 'This is a test prompt';
      const response = 'This is a test response';

      const result = service.countTokens(prompt, response);

      // Rough estimate: 1 token ≈ 4 characters
      expect(result.inputTokens).toBe(Math.ceil(prompt.length / 4));
      expect(result.outputTokens).toBe(Math.ceil(response.length / 4));
    });

    it('should handle empty strings', () => {
      const result = service.countTokens('', '');

      expect(result.inputTokens).toBe(0);
      expect(result.outputTokens).toBe(0);
    });

    it('should handle long text', () => {
      const longText = 'a'.repeat(1000);
      const result = service.countTokens(longText, longText);

      expect(result.inputTokens).toBe(250); // 1000 / 4
      expect(result.outputTokens).toBe(250);
    });
  });
});
