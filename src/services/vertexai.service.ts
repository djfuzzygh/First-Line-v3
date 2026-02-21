/**
 * VertexAI Service
 * 
 * Google Vertex AI provider implementation (MedGemma support)
 */

import { AIProvider, AIProviderConfig } from './ai-provider.interface';
import { AIResponse, Encounter, TriageLevel, UncertaintyLevel } from '../models';

export class VertexAIService implements AIProvider {
  private config: AIProviderConfig;
  private endpoint: string;

  constructor(config: Partial<AIProviderConfig>) {
    this.config = {
      provider: 'vertexai',
      modelId: config.modelId || 'medgemma-2b',
      projectId: config.projectId || process.env.GCP_PROJECT_ID || '',
      region: config.region || process.env.GCP_REGION || 'us-central1',
      maxInputTokens: config.maxInputTokens || 2000,
      maxOutputTokens: config.maxOutputTokens || 500,
      temperature: config.temperature || 0.3,
      timeoutMs: config.timeoutMs || 30000,
    };

    // Vertex AI endpoint
    this.endpoint = `https://${this.config.region}-aiplatform.googleapis.com/v1/projects/${this.config.projectId}/locations/${this.config.region}/publishers/google/models/${this.config.modelId}:predict`;
  }

  async invokeModel(prompt: string): Promise<string> {
    try {
      // Get access token from Google Cloud
      const accessToken = await this.getAccessToken();

      // Enforce request timeout using AbortController
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs || 30000);

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instances: [
            {
              prompt: prompt,
            },
          ],
          parameters: {
            temperature: this.config.temperature,
            maxOutputTokens: this.config.maxOutputTokens,
            topK: 40,
            topP: 0.95,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Vertex AI API error: ${response.statusText}`);
      }

      const data: any = await response.json();
      return data.predictions[0].content || '';
    } catch (error) {
      console.error('Error invoking Vertex AI model:', error);
      throw error;
    }
  }

  async generateTriageAssessment(
    encounter: Encounter,
    followupResponses: string[],
    protocols: string
  ): Promise<AIResponse> {
    const prompt = this.buildTriagePrompt(encounter, followupResponses, protocols);
    const response = await this.invokeModel(prompt);
    return this.parseTriageResponse(response);
  }

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
    return this.parseNormalizationResponse(response);
  }

  async generateFollowupQuestions(
    symptoms: string,
    demographics: { age: number; sex: string }
  ): Promise<string[]> {
    const prompt = `As a medical triage assistant, generate 3-5 follow-up questions for a patient with the following information:

Age: ${demographics.age}
Sex: ${demographics.sex}
Chief Complaint: ${symptoms}

Generate questions that will help assess severity and urgency. Return ONLY a JSON array of question strings.

Example format: ["Question 1?", "Question 2?", "Question 3?"]`;

    const response = await this.invokeModel(prompt);
    return this.parseQuestionsResponse(response);
  }

  async generateReferralSummary(
    encounter: Encounter,
    triageResult: AIResponse
  ): Promise<string> {
    const prompt = `Generate a concise referral summary for healthcare providers:

Patient: ${encounter.Demographics.age}yo ${encounter.Demographics.sex}
Chief Complaint: ${encounter.Symptoms}
Triage Level: ${triageResult.riskTier}
Danger Signs: ${triageResult.dangerSigns.join(', ')}

Create a professional summary for the receiving clinician (2-3 paragraphs).`;

    return await this.invokeModel(prompt);
  }

  private buildTriagePrompt(
    encounter: Encounter,
    followupResponses: string[],
    protocols: string
  ): string {
    return `You are a medical triage assistant using WHO clinical guidelines. Assess this patient:

Patient Information:
- Age: ${encounter.Demographics.age}
- Sex: ${encounter.Demographics.sex}
- Location: ${encounter.Demographics.location}
- Chief Complaint: ${encounter.Symptoms}
- Follow-up Responses: ${followupResponses.join('; ')}
- Local Protocols: ${protocols}

Assign risk tier (RED/YELLOW/GREEN), identify danger signs, and provide recommendations.

Respond ONLY with valid JSON:
{
  "riskTier": "RED|YELLOW|GREEN",
  "dangerSigns": ["sign1", "sign2"],
  "uncertainty": "LOW|MEDIUM|HIGH",
  "recommendedNextSteps": ["step1", "step2"],
  "watchOuts": ["warning1", "warning2"],
  "referralRecommended": true|false,
  "disclaimer": "This is not a diagnosis. Seek professional medical care.",
  "reasoning": "Brief clinical reasoning"
}`;
  }

  private parseTriageResponse(response: string): AIResponse {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        riskTier: parsed.riskTier as TriageLevel,
        dangerSigns: parsed.dangerSigns || [],
        uncertainty: parsed.uncertainty as UncertaintyLevel,
        recommendedNextSteps: parsed.recommendedNextSteps || [],
        watchOuts: parsed.watchOuts || [],
        referralRecommended: parsed.referralRecommended || false,
        disclaimer: parsed.disclaimer || 'This is not a diagnosis. Seek professional medical care.',
        reasoning: parsed.reasoning || '',
      };
    } catch (error) {
      console.error('Error parsing triage response:', error);
      throw new Error('Failed to parse AI response');
    }
  }

  private parseNormalizationResponse(response: string): {
    primaryComplaint: string;
    duration: string;
    severity: string;
    extractedSymptoms: string[];
  } {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        primaryComplaint: parsed.primaryComplaint || 'Unknown',
        duration: parsed.duration || 'Unknown',
        severity: parsed.severity || 'Unknown',
        extractedSymptoms: parsed.extractedSymptoms || [],
      };
    } catch (error) {
      console.error('Error parsing normalization response:', error);
      return {
        primaryComplaint: 'Extraction failed',
        duration: 'Unknown',
        severity: 'Unknown',
        extractedSymptoms: [],
      };
    }
  }

  private parseQuestionsResponse(response: string): string[] {
    try {
      // Extract JSON array from response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('No JSON array found in response');
      }

      const questions = JSON.parse(jsonMatch[0]);
      return Array.isArray(questions) ? questions : [];
    } catch (error) {
      console.error('Error parsing questions response:', error);
      return [];
    }
  }

  private async getAccessToken(): Promise<string> {
    // Check for environment variable token first (for testing)
    const envToken = process.env.GCP_ACCESS_TOKEN;
    if (envToken) {
      return envToken;
    }

    // Prefer inline service-account JSON when provided in env.
    const serviceAccountJson =
      process.env.GCP_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      return await this.generateServiceAccountToken(serviceAccount);
    }

    // Try metadata service (Cloud Run/GCE/GKE with workload identity)
    try {
      const response = await fetch(
        'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
        {
          headers: { 'Metadata-Flavor': 'Google' },
        }
      );
      if (response.ok) {
        const data: any = await response.json();
        if (data?.access_token) {
          return data.access_token;
        }
      }
    } catch {
      // Continue to optional fallback below.
    }

    // Optional legacy fallback: pull GCP credentials from AWS Secrets Manager.
    if (process.env.USE_AWS_SECRETS_MANAGER_FOR_GCP === 'true') {
      try {
        const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
        const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });
        const response = await client.send(
          new GetSecretValueCommand({
            SecretId: process.env.GCP_SECRET_ID || 'firstline/gcp-service-account',
          })
        );

        if (!response.SecretString) {
          throw new Error('No secret value found');
        }

        const serviceAccount = JSON.parse(response.SecretString);
        return await this.generateServiceAccountToken(serviceAccount);
      } catch (error) {
        console.error('Error getting GCP credentials via AWS Secrets Manager fallback:', error);
      }
    }

    throw new Error(
      'No GCP access token available. Configure GCP_ACCESS_TOKEN, GCP_SERVICE_ACCOUNT_JSON, or workload identity.'
    );
  }

  private async generateServiceAccountToken(serviceAccount: any): Promise<string> {
    // Create JWT for service account authentication
    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 3600; // 1 hour

    const header = {
      alg: 'RS256',
      typ: 'JWT',
      kid: serviceAccount.private_key_id,
    };

    const payload = {
      iss: serviceAccount.client_email,
      sub: serviceAccount.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: expiry,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
    };

    // Import crypto for signing
    const crypto = await import('crypto');

    // Encode header and payload
    const base64UrlEncode = (obj: any) => {
      return Buffer.from(JSON.stringify(obj))
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
    };

    const encodedHeader = base64UrlEncode(header);
    const encodedPayload = base64UrlEncode(payload);
    const signatureInput = `${encodedHeader}.${encodedPayload}`;

    // Sign with private key
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signatureInput);
    const signature = sign.sign(serviceAccount.private_key, 'base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    const jwt = `${signatureInput}.${signature}`;

    // Exchange JWT for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      throw new Error(`Failed to get access token: ${error}`);
    }

    const tokenData: any = await tokenResponse.json();
    return tokenData.access_token;
  }
}
