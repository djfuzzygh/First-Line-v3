/**
 * PatientBridgeService
 * 
 * Translates complex medical jargon into simple, patient-friendly language
 * to improve health literacy and medication adherence.
 * 
 * Requirements: MedGemma Impact Challenge (Patient Bridge Feature)
 */

import { AIProvider } from './ai-provider.interface';
import { AIResponse } from '../models';

export class PatientBridgeService {
    private aiProvider: AIProvider;

    constructor(aiProvider: AIProvider) {
        this.aiProvider = aiProvider;
    }

    /**
     * Simplify a medical assessment for the patient
     */
    async simplifyForPatient(triage: AIResponse): Promise<string> {
        const prompt = `You are a compassionate doctor explaining a triage result to a parent or patient with no medical background.

MEDICAL ASSESSMENT:
- Risk Level: ${triage.riskTier}
- Clinical Reasoning: ${triage.reasoning}
- Recommended Action: ${triage.recommendedNextSteps.join(', ')}

Rules:
1. Use simple, everyday language (no jargon).
2. Be empathetic and reassuring.
3. Use an analogy if helpful.
4. Clearly state the SINGLE MOST IMPORTANT next step.

Patient-friendly explanation:`;

        return await this.aiProvider.invokeModel(prompt);
    }
}
