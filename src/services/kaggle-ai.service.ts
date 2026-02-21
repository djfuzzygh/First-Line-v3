import { AIProvider, AIProviderConfig } from './ai-provider.interface';
import { AIResponse, Encounter } from '../models';

type KaggleInferenceResponse = {
  riskTier?: string;
  risk_tier?: string;
  referralRecommended?: boolean;
  referral_recommended?: boolean;
  recommendedNextSteps?: string[];
  recommended_next_steps?: string[];
  watchOuts?: string[];
  watch_outs?: string[];
  dangerSigns?: string[];
  danger_signs?: string[];
  uncertainty?: string;
  disclaimer?: string;
  reasoning?: string;
};

export class KaggleAIService implements AIProvider {
  private config: AIProviderConfig;
  private endpoint: string;

  constructor(config: Partial<AIProviderConfig>) {
    this.config = {
      provider: 'kaggle',
      modelId: config.modelId || process.env.KAGGLE_MODEL_NAME || 'medgemma-kaggle',
      endpoint: config.endpoint || process.env.KAGGLE_INFER_URL || '',
      maxInputTokens: config.maxInputTokens || 2000,
      maxOutputTokens: config.maxOutputTokens || 500,
      temperature: config.temperature || 0.2,
      timeoutMs: config.timeoutMs || 30000,
    };

    this.endpoint = this.config.endpoint || '';
  }

  async invokeModel(prompt: string): Promise<string> {
    if (!this.endpoint) {
      return JSON.stringify({
        riskTier: 'YELLOW',
        reasoning: 'Kaggle endpoint not configured; returned local fallback.',
      });
    }

    const response = await this.callKaggle({
      prompt,
      symptoms: prompt.slice(0, 4000),
    });
    return JSON.stringify(response);
  }

  async generateTriageAssessment(
    encounter: Encounter,
    followupResponses: string[],
    protocols: string
  ): Promise<AIResponse> {
    const symptoms = [
      encounter.Symptoms,
      followupResponses.join('; '),
      protocols ? `Protocols: ${protocols.slice(0, 600)}` : '',
    ]
      .filter(Boolean)
      .join(' | ');

    const payload = {
      symptoms,
      age: encounter.Demographics.age,
      sex: encounter.Demographics.sex,
      location: encounter.Demographics.location,
      followupResponses,
    };

    const raw = this.endpoint ? await this.callKaggle(payload) : this.localFallback(symptoms);
    return this.normalizeTriage(raw, symptoms);
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
    // Use MedGemma for intake normalization when endpoint is available
    if (this.endpoint) {
      try {
        const raw = await this.callKaggle({
          task: 'normalize_intake',
          symptoms,
          age: demographics.age,
          sex: demographics.sex,
        });
        const parsed = raw as Record<string, unknown>;
        if (parsed.primaryComplaint || parsed.primary_complaint) {
          return {
            primaryComplaint: String(parsed.primaryComplaint || parsed.primary_complaint || 'General complaint'),
            duration: String(parsed.duration || 'Unknown'),
            severity: String(parsed.severity || 'Moderate'),
            extractedSymptoms: Array.isArray(parsed.extractedSymptoms || parsed.extracted_symptoms)
              ? (parsed.extractedSymptoms || parsed.extracted_symptoms) as string[]
              : [],
          };
        }
      } catch (error) {
        console.warn('MedGemma intake normalization failed, using heuristic fallback:', error);
      }
    }

    // Heuristic fallback only when MedGemma is unavailable
    const normalized = symptoms.trim();
    const lower = normalized.toLowerCase();
    const severity =
      lower.includes('severe') || lower.includes('worst') ? 'Severe' : lower.includes('mild') ? 'Mild' : 'Moderate';

    return {
      primaryComplaint: normalized.split(/[,.]/)[0] || 'General complaint',
      duration: 'Unknown',
      severity,
      extractedSymptoms: normalized
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 6),
    };
  }

  async generateFollowupQuestions(
    symptoms: string,
    demographics: { age: number; sex: string }
  ): Promise<string[]> {
    // Use MedGemma for follow-up question generation when endpoint is available
    if (this.endpoint) {
      try {
        const raw = await this.callKaggle({
          task: 'generate_followup',
          symptoms,
          age: demographics.age,
          sex: demographics.sex,
        });
        const parsed = raw as Record<string, unknown>;
        const questions = parsed.questions || parsed.followupQuestions || parsed.followup_questions;
        if (Array.isArray(questions) && questions.length >= 2) {
          return (questions as string[]).slice(0, 5);
        }
      } catch (error) {
        console.warn('MedGemma followup generation failed, using heuristic fallback:', error);
      }
    }

    // Heuristic fallback only when MedGemma is unavailable
    const lower = symptoms.toLowerCase();
    const base = [
      'How long have these symptoms been present?',
      'Are the symptoms getting better, worse, or staying the same?',
      'Have you taken any medication for this?',
    ];

    if (lower.includes('breath') || lower.includes('chest')) {
      base.push('Do you have trouble breathing right now?');
    } else if (lower.includes('fever')) {
      base.push('Have you measured your temperature?');
    } else {
      base.push('Are you able to drink fluids and keep food down?');
    }

    return base.slice(0, 5);
  }

  async generateReferralSummary(encounter: Encounter, triageResult: AIResponse): Promise<string> {
    // Use MedGemma for referral summary generation when endpoint is available
    if (this.endpoint) {
      try {
        const raw = await this.callKaggle({
          task: 'generate_referral',
          symptoms: encounter.Symptoms,
          age: encounter.Demographics.age,
          sex: encounter.Demographics.sex,
          location: encounter.Demographics.location,
          riskTier: triageResult.riskTier,
          dangerSigns: triageResult.dangerSigns,
        });
        const parsed = raw as Record<string, unknown>;
        const summary = parsed.summary || parsed.referralSummary || parsed.referral_summary;
        if (typeof summary === 'string' && summary.length > 20) {
          return summary;
        }
      } catch (error) {
        console.warn('MedGemma referral summary failed, using template fallback:', error);
      }
    }

    // Template fallback only when MedGemma is unavailable
    return [
      `Patient: ${encounter.Demographics.age}yo ${encounter.Demographics.sex}`,
      `Location: ${encounter.Demographics.location}`,
      `Symptoms: ${encounter.Symptoms}`,
      `Risk Tier: ${triageResult.riskTier}`,
      `Reasoning: ${triageResult.reasoning}`,
    ].join('\n');
  }

  private async callKaggle(payload: Record<string, unknown>): Promise<KaggleInferenceResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (process.env.KAGGLE_API_KEY) {
        headers.Authorization = `Bearer ${process.env.KAGGLE_API_KEY}`;
      }

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Kaggle inference failed (${response.status}): ${errorText.slice(0, 300)}`);
      }

      return (await response.json()) as KaggleInferenceResponse;
    } finally {
      clearTimeout(timeout);
    }
  }

  private localFallback(symptoms: string): KaggleInferenceResponse {
    const lower = symptoms.toLowerCase();
    const red = lower.includes('chest pain') || lower.includes('cannot breathe') || lower.includes('unconscious');
    const yellow = !red && (lower.includes('fever') || lower.includes('vomit') || lower.includes('pain'));

    if (red) {
      return {
        riskTier: 'RED',
        referralRecommended: true,
        recommendedNextSteps: ['Seek emergency care immediately'],
        watchOuts: ['Worsening breathing', 'Loss of consciousness'],
        dangerSigns: ['critical symptom pattern'],
        uncertainty: 'LOW',
        disclaimer: 'Demo triage fallback; not a diagnosis.',
        reasoning: 'Critical keywords detected in symptoms.',
      };
    }
    if (yellow) {
      return {
        riskTier: 'YELLOW',
        referralRecommended: true,
        recommendedNextSteps: ['Visit a clinic within 24 hours', 'Monitor symptoms'],
        watchOuts: ['New danger signs', 'Persistent fever'],
        dangerSigns: [],
        uncertainty: 'MEDIUM',
        disclaimer: 'Demo triage fallback; not a diagnosis.',
        reasoning: 'Moderate-risk keywords detected in symptoms.',
      };
    }
    return {
      riskTier: 'GREEN',
      referralRecommended: false,
      recommendedNextSteps: ['Home care and monitor symptoms'],
      watchOuts: ['If symptoms worsen, seek care'],
      dangerSigns: [],
      uncertainty: 'MEDIUM',
      disclaimer: 'Demo triage fallback; not a diagnosis.',
      reasoning: 'No high-risk keywords detected in symptoms.',
    };
  }

  private normalizeTriage(raw: KaggleInferenceResponse, symptoms: string): AIResponse {
    const risk = String(raw.riskTier || raw.risk_tier || 'YELLOW').toUpperCase();
    const normalizedRisk = risk === 'RED' || risk === 'GREEN' ? risk : 'YELLOW';
    const uncertainty = String(raw.uncertainty || 'MEDIUM').toUpperCase();
    const normalizedUncertainty =
      uncertainty === 'LOW' || uncertainty === 'HIGH' ? uncertainty : 'MEDIUM';

    return {
      riskTier: normalizedRisk,
      dangerSigns: raw.dangerSigns || raw.danger_signs || [],
      uncertainty: normalizedUncertainty as AIResponse['uncertainty'],
      recommendedNextSteps: raw.recommendedNextSteps || raw.recommended_next_steps || ['Seek medical evaluation'],
      watchOuts: raw.watchOuts || raw.watch_outs || ['Symptoms getting worse'],
      referralRecommended: Boolean(raw.referralRecommended ?? raw.referral_recommended ?? normalizedRisk !== 'GREEN'),
      disclaimer: raw.disclaimer || 'This is not a diagnosis. Seek professional medical care.',
      reasoning: raw.reasoning || `Kaggle inference route used for symptoms: ${symptoms.slice(0, 120)}`,
    };
  }
}
