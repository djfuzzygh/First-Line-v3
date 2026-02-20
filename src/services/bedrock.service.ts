/**
 * BedrockService
 * 
 * Handles AI-powered triage assessment using Amazon Bedrock.
 * Implements prompt template caching, token management, and timeout handling.
 * 
 * Requirements: 3.1, 3.2, 4.1, 4.3, 14.1, 14.3, 15.2
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelCommandInput,
} from '@aws-sdk/client-bedrock-runtime';
import { AIProvider } from './ai-provider.interface';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { AIResponse, Encounter, TriageLevel, UncertaintyLevel } from '../models';

/**
 * Configuration for Bedrock service
 */
export interface BedrockConfig {
  modelId: string;
  region: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  temperature: number;
  timeoutMs: number;
  promptTemplateBucket?: string;
  promptTemplateKey?: string;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: BedrockConfig = {
  modelId: process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0',
  region: process.env.AWS_REGION || 'us-east-1',
  maxInputTokens: 2000,
  maxOutputTokens: 500,
  temperature: 0.3,
  timeoutMs: 30000,
  promptTemplateBucket: process.env.PROMPT_TEMPLATE_BUCKET,
  promptTemplateKey: process.env.PROMPT_TEMPLATE_KEY || 'prompts/triage-template.txt',
};

/**
 * Default prompt template (used as fallback)
 * Requirements: 14.3
 */
const DEFAULT_PROMPT_TEMPLATE = `You are a medical triage assistant. Based on the patient information provided, generate a triage assessment.

Patient Information:
- Age: {age}
- Sex: {sex}
- Chief Complaint: {symptoms}
- Follow-up Responses: {followup}
- Vital Signs: {vitals}

Guidelines:
- Apply WHO clinical guidelines
- Consider local health protocols: {protocols}
- Use non-diagnostic language
- Assign risk tier: RED (urgent), YELLOW (semi-urgent), or GREEN (non-urgent)
- Identify danger signs
- Provide safe care instructions
- Always recommend clinician confirmation

Respond ONLY with valid JSON in this exact format:
{
  "riskTier": "RED|YELLOW|GREEN",
  "dangerSigns": ["sign1", "sign2"],
  "uncertainty": "LOW|MEDIUM|HIGH",
  "recommendedNextSteps": ["step1", "step2"],
  "watchOuts": ["warning1", "warning2"],
  "referralRecommended": true|false,
  "disclaimer": "string",
  "reasoning": "string"
}`;

/**
 * Lambda global scope cache for prompt template
 * Loaded once at cold start and reused across invocations
 * Requirements: 14.3
 */
let cachedPromptTemplate: string | null = null;

/**
 * Load prompt template from S3
 * Requirements: 14.3
 * 
 * @param bucket - S3 bucket name
 * @param key - S3 object key
 * @param region - AWS region
 * @returns Prompt template string
 */
async function loadTemplateFromS3(bucket: string, key: string, region: string): Promise<string> {
  const s3Client = new S3Client({ region });

  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const response = await s3Client.send(command);

    if (!response.Body) {
      throw new Error('Empty response body from S3');
    }

    const template = await response.Body.transformToString();
    console.log(`Loaded prompt template from S3: s3://${bucket}/${key}`);
    return template;
  } catch (error) {
    console.error(`Failed to load template from S3: ${error}`);
    throw error;
  }
}

/**
 * Initialize prompt template cache at Lambda cold start
 * Tries to load from: 1) Environment variable, 2) S3, 3) Default template
 * Requirements: 14.3
 * 
 * @param config - Bedrock configuration
 * @returns Cached prompt template
 */
async function initializePromptTemplate(config: BedrockConfig): Promise<string> {
  // Return cached template if already loaded
  if (cachedPromptTemplate !== null) {
    return cachedPromptTemplate;
  }

  // Priority 1: Load from environment variable
  if (process.env.PROMPT_TEMPLATE) {
    cachedPromptTemplate = process.env.PROMPT_TEMPLATE;
    console.log('Loaded prompt template from environment variable');
    return cachedPromptTemplate;
  }

  // Priority 2: Load from S3
  if (config.promptTemplateBucket && config.promptTemplateKey) {
    try {
      cachedPromptTemplate = await loadTemplateFromS3(
        config.promptTemplateBucket,
        config.promptTemplateKey,
        config.region
      );
      return cachedPromptTemplate;
    } catch (error) {
      console.warn('Failed to load template from S3, falling back to default template');
    }
  }

  // Priority 3: Use default template
  cachedPromptTemplate = DEFAULT_PROMPT_TEMPLATE;
  console.log('Using default prompt template');
  return cachedPromptTemplate;
}

/**
 * BedrockService class
 * Provides AI-powered triage assessment using Amazon Bedrock
 */
export class BedrockService implements AIProvider {
  private client: BedrockRuntimeClient;
  private config: BedrockConfig;
  private promptTemplate: Promise<string>;

  /**
   * Create a new BedrockService instance
   * Initializes prompt template cache at construction
   * Requirements: 14.3
   * 
   * @param config - Optional configuration overrides
   */
  constructor(config: Partial<BedrockConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.client = new BedrockRuntimeClient({
      region: this.config.region,
    });

    // Initialize prompt template cache (async, but cached for subsequent calls)
    this.promptTemplate = initializePromptTemplate(this.config);
  }

  /**
   * Build the prompt from template with encounter data
   * Requirements: 14.3
   * 
   * @param encounter - Patient encounter data
   * @param followupResponses - Array of follow-up question responses
   * @param protocols - Local health protocols (optional)
   * @returns Formatted prompt string
   */
  private async buildPrompt(
    encounter: Encounter,
    followupResponses: string[] = [],
    protocols: string = 'Standard WHO guidelines'
  ): Promise<string> {
    // Wait for template to be loaded (cached after first call)
    const template = await this.promptTemplate;

    const vitalsStr = encounter.Vitals
      ? Object.entries(encounter.Vitals)
        .filter(([_, value]) => value !== undefined)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ')
      : 'Not provided';

    const followupStr = followupResponses.length > 0
      ? followupResponses.join('; ')
      : 'None';

    return template
      .replace('{age}', encounter.Demographics.age.toString())
      .replace('{sex}', encounter.Demographics.sex)
      .replace('{symptoms}', encounter.Symptoms)
      .replace('{followup}', followupStr)
      .replace('{vitals}', vitalsStr)
      .replace('{protocols}', protocols);
  }

  /**
   * Estimate token count (rough approximation: 1 token ≈ 4 characters)
   * 
   * @param text - Text to count tokens for
   * @returns Estimated token count
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Truncate text to fit within token limit
   * Requirements: 15.2
   * 
   * @param text - Text to truncate
   * @param maxTokens - Maximum allowed tokens
   * @returns Truncated text
   */
  private truncateToTokenLimit(text: string, maxTokens: number): string {
    const estimatedTokens = this.estimateTokens(text);

    if (estimatedTokens <= maxTokens) {
      return text;
    }

    // Calculate character limit (4 chars per token)
    const maxChars = maxTokens * 4;
    return text.substring(0, maxChars) + '... [truncated]';
  }

  /**
   * Parse and validate JSON response from Bedrock
   * Requirements: 3.2, 4.6, 14.4
   * 
   * @param rawResponse - Raw JSON string from Bedrock
   * @returns Parsed and validated AIResponse
   * @throws Error if JSON is invalid or missing required fields
   */
  private parseResponse(rawResponse: string): AIResponse {
    let parsed: any;

    try {
      parsed = JSON.parse(rawResponse);
    } catch (error) {
      throw new Error(`Invalid JSON response from Bedrock: ${error}`);
    }

    // Validate required fields
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
      if (!(field in parsed)) {
        throw new Error(`Missing required field in AI response: ${field}`);
      }
    }

    // Validate riskTier value
    const validTiers: TriageLevel[] = ['RED', 'YELLOW', 'GREEN'];
    if (!validTiers.includes(parsed.riskTier)) {
      throw new Error(`Invalid riskTier value: ${parsed.riskTier}`);
    }

    // Validate uncertainty value
    const validUncertainty: UncertaintyLevel[] = ['LOW', 'MEDIUM', 'HIGH'];
    if (!validUncertainty.includes(parsed.uncertainty)) {
      throw new Error(`Invalid uncertainty value: ${parsed.uncertainty}`);
    }

    // Validate array fields
    if (!Array.isArray(parsed.dangerSigns)) {
      throw new Error('dangerSigns must be an array');
    }
    if (!Array.isArray(parsed.recommendedNextSteps)) {
      throw new Error('recommendedNextSteps must be an array');
    }
    if (!Array.isArray(parsed.watchOuts)) {
      throw new Error('watchOuts must be an array');
    }

    // Validate boolean field
    if (typeof parsed.referralRecommended !== 'boolean') {
      throw new Error('referralRecommended must be a boolean');
    }

    return parsed as AIResponse;
  }

  /**
   * Invoke Bedrock model with timeout handling
   * Requirements: 3.1, 3.2, 4.1, 14.1, 14.3, 15.2
   * 
   * @param encounter - Patient encounter data
   * @param prompt - The prompt string to send to the model
   * @returns Raw text response from the Bedrock model
   * @throws Error if Bedrock invocation fails or times out
   */
  async invokeModel(prompt: string): Promise<string> {
    const startTime = Date.now();

    // Prepare Bedrock request
    const requestBody = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: this.config.maxOutputTokens,
      temperature: this.config.temperature,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    };

    const input: InvokeModelCommandInput = {
      modelId: this.config.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody),
    };

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Bedrock invocation timed out after ${this.config.timeoutMs}ms`));
      }, this.config.timeoutMs);
    });

    try {
      // Race between Bedrock invocation and timeout
      const command = new InvokeModelCommand(input);
      const response = await Promise.race([
        this.client.send(command),
        timeoutPromise,
      ]);

      // Parse response body
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      // Extract text content from Claude response format
      const textContent = responseBody.content?.[0]?.text;
      if (!textContent) {
        throw new Error('No text content in Bedrock response');
      }

      const endTime = Date.now();
      const latency = endTime - startTime;
      console.log(`Bedrock invocation completed in ${latency}ms`);

      return textContent;
    } catch (error) {
      const endTime = Date.now();
      const latency = endTime - startTime;
      console.error(`Bedrock invocation failed after ${latency}ms:`, error);
      throw error;
    }
  }

  /**
   * Generate a triage assessment based on encounter data.
   * Requirements: 3.1, 3.2, 4.1, 14.1, 14.3, 15.2
   * 
   * @param encounter - Patient encounter data
   * @param followupResponses - Array of follow-up question responses
   * @param protocols - Local health protocols (optional)
   * @returns AI-generated triage assessment
   * @throws Error if Bedrock invocation fails or times out
   */
  async generateTriageAssessment(
    encounter: Encounter,
    followupResponses: string[],
    protocols: string
  ): Promise<AIResponse> {
    // Build and truncate prompt to token limit (uses cached template)
    let prompt = await this.buildPrompt(encounter, followupResponses, protocols);
    prompt = this.truncateToTokenLimit(prompt, this.config.maxInputTokens);

    const response = await this.invokeModel(prompt);
    return this.parseResponse(response);
  }

  /**
   * Normalize and structure patient intake information.
   * Requirements: 14.5
   * 
   * @param symptoms - Raw symptom description from patient intake
   * @param demographics - Patient age and sex
   * @returns Structured intake information
   */
  async normalizeIntake(
    symptoms: string,
    demographics: { age: number; sex: string }
  ): Promise<{
    primaryComplaint: string;
    duration: string;
    severity: string;
    extractedSymptoms: string[];
  }> {
    const prompt = `As a medical intake assistant, normalize and structure the following patient symptoms.
    
    Patient: ${demographics.age}yo ${demographics.sex}
    Raw Symptoms: ${symptoms}
    
    Extract the following entities and return as JSON:
    - primaryComplaint: The main medical issue
    - duration: How long it has been occurring
    - severity: Scale of 1-10 or Mild/Moderate/Severe
    - extractedSymptoms: List of individual symptoms identified
    
    Respond ONLY with JSON:
    {
      "primaryComplaint": "string",
      "duration": "string",
      "severity": "string",
      "extractedSymptoms": ["symptom1", "symptom2"]
    }`;

    const response = await this.invokeModel(prompt);
    try {
      const parsed = JSON.parse(response);
      return {
        primaryComplaint: parsed.primaryComplaint || 'Unknown',
        duration: parsed.duration || 'Unknown',
        severity: parsed.severity || 'Unknown',
        extractedSymptoms: parsed.extractedSymptoms || [],
      };
    } catch (e) {
      console.error('Failed to parse normalizeIntake response:', e);
      return {
        primaryComplaint: 'Extraction failed',
        duration: 'Unknown',
        severity: 'Unknown',
        extractedSymptoms: [],
      };
    }
  }

  /**
   * Generate follow-up questions for a patient based on initial symptoms.
   * Requirements: 14.6
   * 
   * @param symptoms - Patient's initial symptoms
   * @param demographics - Patient age and sex
   * @returns Array of follow-up questions
   */
  async generateFollowupQuestions(
    symptoms: string,
    demographics: { age: number; sex: string }
  ): Promise<string[]> {
    const prompt = `Generate 3-5 follow-up questions for a ${demographics.age}yo ${demographics.sex} with: ${symptoms}. Return as JSON array.`;
    const response = await this.invokeModel(prompt);
    try {
      return JSON.parse(response);
    } catch (e) {
      console.error('Failed to parse generateFollowupQuestions response:', e);
      return [];
    }
  }

  /**
   * Generate a referral summary for a patient.
   * Requirements: 14.7
   * 
   * @param encounter - Patient encounter data
   * @param triageResult - The AI-generated triage assessment
   * @returns A summary string suitable for referral
   */
  async generateReferralSummary(
    encounter: Encounter,
    triageResult: AIResponse
  ): Promise<string> {
    const prompt = `Generate a referral summary for a ${encounter.Demographics.age}yo with ${encounter.Symptoms}. Triage: ${triageResult.riskTier}.`;
    return await this.invokeModel(prompt);
  }

  /**
   * Count tokens in prompt and response
   * Requirements: 15.2
   * 
   * @param prompt - Input prompt text
   * @param response - Output response text
   * @returns Object with input and output token counts
   */
  countTokens(prompt: string, response: string): { inputTokens: number; outputTokens: number } {
    return {
      inputTokens: this.estimateTokens(prompt),
      outputTokens: this.estimateTokens(response),
    };
  }

  /**
   * Get the cached prompt template
   * Requirements: 14.3
   * 
   * @returns The cached prompt template string
   */
  async getPromptTemplate(): Promise<string> {
    return this.promptTemplate;
  }
}

/**
 * Reset the cached prompt template (for testing purposes)
 * Requirements: 14.3
 */
export function resetPromptTemplateCache(): void {
  cachedPromptTemplate = null;
}
