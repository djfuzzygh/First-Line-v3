import { AIProvider, AIProviderConfig } from './ai-provider.interface';
import { AIResponse, Encounter, LabResults, DiagnosisSuggestion } from '../models';

type HuggingFaceInferenceResponse = {
  riskTier?: string;
  risk_tier?: string;
  referralRecommended?: boolean;
  referral_recommended?: boolean;
  recommendedNextSteps?: string[];
  recommended_next_steps?: string[];
  diagnosisSuggestions?: any[];
  watchOuts?: string[];
  watch_outs?: string[];
  dangerSigns?: string[];
  danger_signs?: string[];
  uncertainty?: string;
  disclaimer?: string;
  reasoning?: string;
  generated_text?: string;
};

export class HuggingFaceAIService implements AIProvider {
  private config: AIProviderConfig;
  private endpoint: string;

  constructor(config: Partial<AIProviderConfig>) {
    const modelId = config.modelId || process.env.HF_MODEL_ID || 'google/medgemma-4b-it';
    // Use the new router.huggingface.co endpoint
    const endpoint =
      config.endpoint ||
      process.env.HF_INFER_URL ||
      `https://router.huggingface.co/models/${modelId}`;

    this.config = {
      provider: 'huggingface',
      modelId,
      endpoint,
      apiKey: config.apiKey || process.env.HF_API_TOKEN || '',
      maxInputTokens: config.maxInputTokens || 2000,
      maxOutputTokens: config.maxOutputTokens || 500,
      temperature: config.temperature || 0.2,
      timeoutMs: config.timeoutMs || 60000,
    };

    this.endpoint = this.config.endpoint || '';
  }

  async invokeModel(prompt: string): Promise<string> {
    if (!this.endpoint) {
      return JSON.stringify({
        riskTier: 'YELLOW',
        reasoning: 'Hugging Face endpoint not configured; returned local fallback.',
      });
    }

    try {
      const response = await this.callHuggingFace({
        inputs: prompt,
        symptoms: prompt.slice(0, 4000),
        options: { wait_for_model: true },
      });

      if (response.generated_text) {
        return response.generated_text;
      }
      return JSON.stringify(response);
    } catch (error) {
      console.warn('HuggingFace API call failed, using local fallback:', error);
      return JSON.stringify({
        riskTier: 'YELLOW',
        reasoning: 'HuggingFace API unavailable; using local heuristic fallback.',
      });
    }
  }

  async generateTriageAssessment(
    encounter: Encounter,
    followupResponses: string[],
    protocols: string,
    labResults?: LabResults
  ): Promise<AIResponse> {
    const symptoms = [
      encounter.Symptoms,
      followupResponses.join('; '),
      protocols ? `Protocols: ${protocols.slice(0, 600)}` : '',
    ]
      .filter(Boolean)
      .join(' | ');

    const labSection = labResults ? `
Lab Results: WBC=${labResults.wbc}, Hemoglobin=${labResults.hemoglobin}, Glucose=${labResults.glucose}, Temperature=${labResults.temperature}, BP=${labResults.bloodPressure}, CRP=${labResults.crp}, Lactate=${labResults.lactate}` : '';

    const enhancedSymptoms = symptoms + labSection;

    const payload = {
      symptoms: enhancedSymptoms,
      age: encounter.Demographics.age,
      sex: encounter.Demographics.sex,
      location: encounter.Demographics.location,
      followupResponses,
      labResults,
      inputs: this.buildTriagePrompt(enhancedSymptoms, encounter.Demographics.age, encounter.Demographics.sex),
      parameters: {
        temperature: this.config.temperature,
        max_new_tokens: this.config.maxOutputTokens,
      },
      options: { wait_for_model: true },
    };

    let raw: HuggingFaceInferenceResponse;
    try {
      raw = this.endpoint ? await this.callHuggingFace(payload) : this.localFallback(enhancedSymptoms);
    } catch (error) {
      console.warn('HuggingFace API call failed, using local fallback:', error);
      raw = this.localFallback(enhancedSymptoms);
    }
    return this.normalizeTriage(raw, enhancedSymptoms);
  }

  async normalizeIntake(
    symptoms: string,
    _demographics: { age: number; sex: string }
  ): Promise<{
    primaryComplaint: string;
    duration: string;
    severity: string;
    extractedSymptoms: string[];
  }> {
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
    _demographics: { age: number; sex: string }
  ): Promise<string[]> {
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

  async generateReferralSummary(
    encounter: Encounter,
    triageResult: AIResponse
  ): Promise<string> {
    const summary = [
      `Patient: Age ${encounter.Demographics.age}, ${encounter.Demographics.sex}`,
      `Location: ${encounter.Demographics.location}`,
      `Chief Complaint: ${encounter.Symptoms}`,
      `Risk Assessment: ${triageResult.riskTier}`,
    ];

    if (triageResult.dangerSigns && triageResult.dangerSigns.length > 0) {
      summary.push(`Danger Signs: ${triageResult.dangerSigns.join(', ')}`);
    }

    if (triageResult.recommendedNextSteps && triageResult.recommendedNextSteps.length > 0) {
      summary.push(`Recommended Next Steps: ${triageResult.recommendedNextSteps.join(', ')}`);
    }

    return summary.join('\n');
  }

  private async callHuggingFace(payload: Record<string, unknown>): Promise<HuggingFaceInferenceResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.config.apiKey) {
        headers.Authorization = `Bearer ${this.config.apiKey}`;
      }

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Hugging Face inference failed (${response.status}): ${errorText.slice(0, 300)}`);
      }

      const data = (await response.json()) as unknown;
      if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
        return data[0] as HuggingFaceInferenceResponse;
      }
      return (data || {}) as HuggingFaceInferenceResponse;
    } finally {
      clearTimeout(timeout);
    }
  }

  private localFallback(symptoms: string): HuggingFaceInferenceResponse {
    const lower = symptoms.toLowerCase();
    const red = lower.includes('chest pain') || lower.includes('cannot breathe') || lower.includes('unconscious');
    const yellow = !red && (lower.includes('fever') || lower.includes('vomit') || lower.includes('pain'));

    if (red) {
      return {
        riskTier: 'RED',
        referralRecommended: true,
        recommendedNextSteps: ['Seek emergency care immediately', 'Call emergency services'],
        dangerSigns: ['Severe symptoms detected'],
        disclaimer: 'Heuristic assessment - not a medical diagnosis',
        reasoning: 'Red flag symptoms detected using local heuristic (HuggingFace API unavailable)',
      };
    }

    if (yellow) {
      return {
        riskTier: 'YELLOW',
        referralRecommended: true,
        recommendedNextSteps: ['Visit a healthcare facility within 24 hours', 'Monitor symptoms closely'],
        watchOuts: ['Watch for worsening symptoms'],
        disclaimer: 'Heuristic assessment - not a medical diagnosis',
        reasoning: 'Moderate symptoms detected using local heuristic (HuggingFace API unavailable)',
      };
    }

    return {
      riskTier: 'GREEN',
      referralRecommended: false,
      recommendedNextSteps: ['Monitor symptoms at home', 'Seek care if symptoms worsen'],
      disclaimer: 'Heuristic assessment - not a medical diagnosis',
      reasoning: 'Low-risk symptoms detected using local heuristic (HuggingFace API unavailable)',
    };
  }

  private normalizeTriage(
    raw: HuggingFaceInferenceResponse,
    symptoms: string
  ): AIResponse {
    // Normalize field names (snake_case vs camelCase)
    const riskTier = (raw.riskTier || raw.risk_tier || 'YELLOW') as 'RED' | 'YELLOW' | 'GREEN';
    const referralRecommended = raw.referralRecommended || raw.referral_recommended || false;
    const nextSteps = raw.recommendedNextSteps || raw.recommended_next_steps || [];
    const watchOuts = raw.watchOuts || raw.watch_outs || [];
    const dangerSigns = raw.dangerSigns || raw.danger_signs || [];

    // Generate follow-up questions based on risk tier
    const followupQuestions = this.generateFollowupBasedOnRisk(riskTier, symptoms);

    return {
      riskTier,
      referralRecommended,
      recommendedNextSteps: nextSteps,
      watchOuts,
      dangerSigns,
      followupQuestions,
      uncertainty: 'MEDIUM',
      disclaimer: raw.disclaimer || 'Assessment generated by AI - consult medical professional for diagnosis',
      reasoning: raw.reasoning || 'Assessment based on reported symptoms and lab results',
      diagnosisSuggestions: this.generateDiagnosisSuggestions(symptoms),
    };
  }

  private generateFollowupBasedOnRisk(riskTier: string, symptoms: string): string[] {
    const lower = symptoms.toLowerCase();
    const followups: string[] = [];

    if (riskTier === 'RED') {
      followups.push('Have you sought emergency care?');
      followups.push('Are symptoms worsening?');
    } else if (riskTier === 'YELLOW') {
      followups.push('How long have these symptoms been present?');
      followups.push('Are symptoms improving or worsening?');
      followups.push('Have you taken any medication?');
    } else {
      followups.push('Are symptoms resolving?');
      followups.push('Do you need any support?');
    }

    if (lower.includes('fever')) {
      followups.push('Have you measured your temperature?');
    }
    if (lower.includes('cough') || lower.includes('breath')) {
      followups.push('Are you coughing up anything?');
    }

    return followups.slice(0, 4);
  }

  private generateDiagnosisSuggestions(symptoms: string): DiagnosisSuggestion[] {
    const lower = symptoms.toLowerCase();
    const suggestions: DiagnosisSuggestion[] = [];

    // Simple heuristic diagnosis suggestions based on symptoms
    if (lower.includes('fever') && lower.includes('cough')) {
      suggestions.push({ condition: 'Respiratory Infection', confidence: 0.7, reasoning: 'Fever and cough are typical of respiratory infections' });
      suggestions.push({ condition: 'Pneumonia', confidence: 0.5, reasoning: 'Fever and cough may indicate pneumonia' });
    }
    
    if (lower.includes('fever') && lower.includes('headache')) {
      suggestions.push({ condition: 'Viral Infection', confidence: 0.6, reasoning: 'Fever and headache suggest viral etiology' });
      suggestions.push({ condition: 'Meningitis', confidence: 0.3, reasoning: 'Fever with headache requires urgent evaluation' });
    }

    if (lower.includes('chest pain')) {
      suggestions.push({ condition: 'Acute Coronary Syndrome', confidence: 0.4, reasoning: 'Chest pain requires urgent cardiac evaluation' });
      suggestions.push({ condition: 'Pulmonary Embolism', confidence: 0.3, reasoning: 'Chest pain may indicate pulmonary embolism' });
    }

    if (lower.includes('abdominal pain')) {
      suggestions.push({ condition: 'Gastroenteritis', confidence: 0.5, reasoning: 'Abdominal pain with fever suggests gastroenteritis' });
      suggestions.push({ condition: 'Appendicitis', confidence: 0.3, reasoning: 'Abdominal pain may indicate appendicitis' });
    }

    if (lower.includes('headache') && lower.includes('stiff neck')) {
      suggestions.push({ condition: 'Meningitis', confidence: 0.6, reasoning: 'Headache with neck stiffness is classic for meningitis' });
    }

    return suggestions.length > 0 ? suggestions : [{condition: 'Requires clinical evaluation', confidence: 0.5, reasoning: 'Non-specific presentation requires clinical assessment'}];
  }

  private buildTriagePrompt(symptoms: string, age: number, sex: string): string {
    return `
You are a medical triage assistant. Assess the following patient presentation:

Patient: ${age}-year-old ${sex}
Chief Complaint: ${symptoms}

Provide a structured assessment with:
1. Risk Tier (RED/YELLOW/GREEN)
2. Key danger signs if any
3. Recommended next steps
4. Suggested questions for follow-up
5. Potential diagnoses with confidence scores

Be conservative - when in doubt, recommend evaluation by healthcare professional.
    `.trim();
  }
}
