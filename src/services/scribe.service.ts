/**
 * ScribeService
 * 
 * Automatically converts clinical encounter data into structured SOAP notes
 * (Subjective, Objective, Assessment, Plan) to reduce clinician burnout.
 * 
 * Requirements: MedGemma Impact Challenge (Scribe Feature)
 */

import { AIProvider } from './ai-provider.interface';
import { Encounter, AIResponse } from '../models';

export class ScribeService {
  private aiProvider: AIProvider;

  constructor(aiProvider: AIProvider) {
    this.aiProvider = aiProvider;
  }

  /**
   * Generate a structured SOAP note from encounter and triage data
   */
  async generateSOAPNote(encounter: Encounter, triage: AIResponse): Promise<string> {
    const prompt = `You are a professional medical scribe. Convert the following clinical session into a structured SOAP note.

PATIENT DATA:
- Age: ${encounter.Demographics.age}
- Sex: ${encounter.Demographics.sex}
- Chief Complaint: ${encounter.Symptoms}

TRIAGE ASSESSMENT:
- Risk Tier: ${triage.riskTier}
- Danger Signs: ${triage.dangerSigns.join(', ')}
- Reasoning: ${triage.reasoning}

RECOMMENDATIONS:
- Next Steps: ${triage.recommendedNextSteps.join(', ')}

Format the output exactly as:
SUBJECTIVE: [Symtpoms and history]
OBJECTIVE: [Observed signs and vitals]
ASSESSMENT: [Clinical impression]
PLAN: [Treatment and follow-up]

SOAP Note:`;

    return await this.aiProvider.invokeModel(prompt);
  }
}
