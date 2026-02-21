/**
 * AI Provider Interface
 * 
 * Abstraction layer for different AI providers (AWS Bedrock, Google Vertex AI, etc.)
 */

import { AIResponse, Encounter } from '../models';

export interface AIProviderConfig {
  provider: 'bedrock' | 'vertexai' | 'openai' | 'kaggle' | 'huggingface';
  modelId: string;
  region?: string;
  apiKey?: string;
  projectId?: string;
  endpoint?: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  temperature: number;
  timeoutMs: number;
}

export interface AIProvider {
  /**
   * Invoke the AI model with a prompt
   */
  invokeModel(prompt: string): Promise<string>;

  /**
   * Generate triage assessment
   */
  generateTriageAssessment(
    encounter: Encounter,
    followupResponses: string[],
    protocols: string
  ): Promise<AIResponse>;

  /**
   * Normalize raw symptoms and extract entities
   */
  normalizeIntake(
    symptoms: string,
    demographics: { age: number; sex: string }
  ): Promise<{
    primaryComplaint: string;
    duration: string;
    severity: string;
    extractedSymptoms: string[];
  }>;

  /**
   * Generate follow-up questions
   */
  generateFollowupQuestions(
    symptoms: string,
    demographics: { age: number; sex: string }
  ): Promise<string[]>;

  /**
   * Generate referral summary
   */
  generateReferralSummary(
    encounter: Encounter,
    triageResult: AIResponse
  ): Promise<string>;
}
