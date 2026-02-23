/**
 * AI Provider Factory
 * 
 * Creates the appropriate AI provider based on configuration
 */

import { AIProviderConfig } from './ai-provider.interface';
import { BedrockService } from './bedrock.service';
import { VertexAIService } from './vertexai.service';
import { KaggleAIService } from './kaggle-ai.service';
import { HuggingFaceAIService } from './huggingface-ai.service';

export class AIProviderFactory {
  static create(config?: Partial<AIProviderConfig>): any {
    // Default to HuggingFace (publicly accessible, competition-compliant)
    // Fallback order: HuggingFace → Kaggle → VertexAI → Bedrock
    const provider = config?.provider || process.env.AI_PROVIDER || 'huggingface';

    switch (provider) {
      case 'bedrock':
        return new BedrockService({
          modelId: config?.modelId || process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0',
          region: config?.region || process.env.AWS_REGION || 'us-east-1',
          maxInputTokens: config?.maxInputTokens || 2000,
          maxOutputTokens: config?.maxOutputTokens || 500,
          temperature: config?.temperature || 0.3,
          timeoutMs: config?.timeoutMs || 30000,
        });

      case 'vertexai':
        return new VertexAIService({
          modelId: config?.modelId || process.env.VERTEXAI_MODEL_ID || 'medgemma-4b-it',
          projectId: config?.projectId || process.env.GCP_PROJECT_ID,
          region: config?.region || process.env.GCP_REGION || 'us-central1',
          maxInputTokens: config?.maxInputTokens || 2000,
          maxOutputTokens: config?.maxOutputTokens || 500,
          temperature: config?.temperature || 0.3,
          timeoutMs: config?.timeoutMs || 30000,
        });

      case 'kaggle':
        return new KaggleAIService({
          modelId: config?.modelId || process.env.KAGGLE_MODEL_NAME || 'medgemma-kaggle',
          endpoint: config?.endpoint || process.env.KAGGLE_INFER_URL || '',
          maxInputTokens: config?.maxInputTokens || 2000,
          maxOutputTokens: config?.maxOutputTokens || 500,
          temperature: config?.temperature || 0.2,
          timeoutMs: config?.timeoutMs || 120000,
        });

      case 'huggingface':
        return new HuggingFaceAIService({
          modelId: config?.modelId || process.env.HF_MODEL_ID || 'google/medgemma-4b-it',
          endpoint: config?.endpoint || process.env.HF_INFER_URL || '',
          apiKey: config?.apiKey || process.env.HF_API_TOKEN || '',
          maxInputTokens: config?.maxInputTokens || 2000,
          maxOutputTokens: config?.maxOutputTokens || 500,
          temperature: config?.temperature || 0.2,
          timeoutMs: config?.timeoutMs || 60000,
        });

      default:
        throw new Error(`Unsupported AI provider: ${provider}`);
    }
  }
}
