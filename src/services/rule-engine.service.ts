/**
 * RuleEngine Service
 * 
 * Provides deterministic triage classification when AI is unavailable or uncertain.
 * Implements rule-based logic for symptom categorization and triage level assignment.
 * 
 * Requirements: 3.3, 4.7, 8.2
 */

import { AIResponse, TriageLevel } from '../models';

/**
 * Symptom categories for classification
 */
export enum SymptomCategory {
  RESPIRATORY = 'respiratory',
  GASTROINTESTINAL = 'gastrointestinal',
  NEUROLOGICAL = 'neurological',
  CARDIOVASCULAR = 'cardiovascular',
  FEVER = 'fever',
  PAIN = 'pain',
  OTHER = 'other',
}

/**
 * Symptom patterns for categorization
 */
const SYMPTOM_PATTERNS = {
  [SymptomCategory.RESPIRATORY]: /cough|shortness of breath|short of breath|breathing|chest pain|wheezing|congestion|sore throat/i,
  [SymptomCategory.GASTROINTESTINAL]: /abdominal pain|stomach pain|vomit|nausea|diarrhea|constipation|belly pain/i,
  [SymptomCategory.NEUROLOGICAL]: /headache|dizzy|dizziness|confusion|confused|weakness|numbness|tingling/i,
  [SymptomCategory.CARDIOVASCULAR]: /chest pain|palpitation|heart racing|irregular heartbeat/i,
  [SymptomCategory.FEVER]: /fever|hot|temperature|chills|sweating/i,
  [SymptomCategory.PAIN]: /pain|ache|hurt|sore/i,
} as const;

/**
 * Pain severity levels
 */
export enum PainSeverity {
  MILD = 'mild',
  MODERATE = 'moderate',
  SEVERE = 'severe',
}

/**
 * RuleEngine class
 * Provides fallback triage logic when AI Engine is unavailable
 */
export class RuleEngine {
  /**
   * Categorize symptoms into clinical categories
   * 
   * @param symptoms - Patient symptom description
   * @returns Array of matching symptom categories
   */
  categorizeSymptoms(symptoms: string): SymptomCategory[] {
    if (!symptoms || typeof symptoms !== 'string') {
      return [SymptomCategory.OTHER];
    }

    const categories: SymptomCategory[] = [];

    for (const [category, pattern] of Object.entries(SYMPTOM_PATTERNS)) {
      if (pattern.test(symptoms)) {
        categories.push(category as SymptomCategory);
      }
    }

    // If no categories matched, return OTHER
    return categories.length > 0 ? categories : [SymptomCategory.OTHER];
  }

  /**
   * Assess pain severity from symptom description
   * 
   * @param symptoms - Patient symptom description
   * @returns Pain severity level
   */
  private assessPainSeverity(symptoms: string): PainSeverity {
    const lowerSymptoms = symptoms.toLowerCase();
    
    if (/severe|extreme|unbearable|worst|10\/10|9\/10|8\/10/i.test(lowerSymptoms)) {
      return PainSeverity.SEVERE;
    }
    
    if (/moderate|significant|7\/10|6\/10|5\/10/i.test(lowerSymptoms)) {
      return PainSeverity.MODERATE;
    }
    
    return PainSeverity.MILD;
  }

  /**
   * Calculate symptom duration in days
   * 
   * @param symptoms - Patient symptom description
   * @returns Duration in days, or 0 if not specified
   */
  private extractDuration(symptoms: string): number {
    const dayMatch = symptoms.match(/(\d+)\s*day/i);
    if (dayMatch) {
      return parseInt(dayMatch[1], 10);
    }
    
    const weekMatch = symptoms.match(/(\d+)\s*week/i);
    if (weekMatch) {
      return parseInt(weekMatch[1], 10) * 7;
    }
    
    return 0;
  }

  /**
   * Perform rule-based triage assessment
   * 
   * @param age - Patient age in years
   * @param symptoms - Patient symptom description
   * @param dangerSigns - Array of detected danger signs (should be checked before calling this)
   * @returns Triage level based on deterministic rules
   * 
   * Logic:
   * - IF age < 2 AND fever THEN YELLOW
   * - IF age > 65 AND respiratory symptoms THEN YELLOW
   * - IF moderate/severe pain AND duration > 3 days THEN YELLOW
   * - ELSE GREEN
   */
  assessTriageLevel(age: number, symptoms: string, dangerSigns: string[] = []): TriageLevel {
    // If danger signs present, return RED immediately
    if (dangerSigns.length > 0) {
      return 'RED';
    }

    const categories = this.categorizeSymptoms(symptoms);
    const painSeverity = this.assessPainSeverity(symptoms);
    const duration = this.extractDuration(symptoms);

    // Rule: Infants with fever
    if (age < 2 && categories.includes(SymptomCategory.FEVER)) {
      return 'YELLOW';
    }

    // Rule: Elderly with respiratory symptoms
    if (age > 65 && categories.includes(SymptomCategory.RESPIRATORY)) {
      return 'YELLOW';
    }

    // Rule: Moderate/severe pain lasting more than 3 days
    if (
      (painSeverity === PainSeverity.MODERATE || painSeverity === PainSeverity.SEVERE) &&
      duration > 3
    ) {
      return 'YELLOW';
    }

    // Default to GREEN for non-urgent cases
    return 'GREEN';
  }

  /**
   * Generate follow-up questions based on symptom category
   * 
   * @param symptoms - Patient symptom description
   * @returns Array of 3-5 follow-up questions
   * 
   * Requirements: 3.3, 3.4
   */
  generateFollowupQuestions(symptoms: string): string[] {
    const categories = this.categorizeSymptoms(symptoms);
    const questions: string[] = [];

    // Always ask about duration and severity
    questions.push('How long have you had these symptoms?');
    questions.push('On a scale of 1-10, how severe are your symptoms?');

    // Category-specific questions - prioritize cardiovascular over respiratory for chest pain
    if (categories.includes(SymptomCategory.CARDIOVASCULAR)) {
      questions.push('Does the pain spread to your arm, jaw, or back?');
      questions.push('Do you feel short of breath or dizzy?');
    } else if (categories.includes(SymptomCategory.RESPIRATORY)) {
      questions.push('Do you have difficulty breathing or shortness of breath?');
      questions.push('Do you have a fever or chills?');
    } else if (categories.includes(SymptomCategory.GASTROINTESTINAL)) {
      questions.push('Have you been able to keep down food and fluids?');
      questions.push('Do you have a fever?');
    } else if (categories.includes(SymptomCategory.NEUROLOGICAL)) {
      questions.push('Have you experienced any vision changes or confusion?');
      questions.push('Do you have neck stiffness?');
    } else if (categories.includes(SymptomCategory.FEVER)) {
      questions.push('What is your temperature?');
      questions.push('Do you have any other symptoms like cough or body aches?');
    } else if (categories.includes(SymptomCategory.PAIN)) {
      questions.push('Where exactly is the pain located?');
      questions.push('Does anything make the pain better or worse?');
    } else {
      // Generic questions for OTHER category
      questions.push('Have you had any fever?');
      questions.push('Have you noticed any other symptoms?');
    }

    // Limit to 5 questions
    return questions.slice(0, 5);
  }

  /**
   * Generate complete triage response using rule-based logic
   * 
   * @param age - Patient age in years
   * @param symptoms - Patient symptom description
   * @param dangerSigns - Array of detected danger signs
   * @returns Complete AIResponse structure with rule-based assessment
   */
  generateTriageResponse(age: number, symptoms: string, dangerSigns: string[] = []): AIResponse {
    const riskTier = this.assessTriageLevel(age, symptoms, dangerSigns);
    const categories = this.categorizeSymptoms(symptoms);

    // Generate tier-appropriate recommendations
    let recommendedNextSteps: string[] = [];
    let watchOuts: string[] = [];
    let referralRecommended = false;

    if (riskTier === 'RED') {
      recommendedNextSteps = [
        'Seek immediate emergency care',
        'Call emergency services or go to the nearest hospital',
        'Do not delay - this requires urgent medical attention',
      ];
      watchOuts = [
        'Worsening symptoms',
        'Loss of consciousness',
        'Difficulty breathing',
      ];
      referralRecommended = true;
    } else if (riskTier === 'YELLOW') {
      recommendedNextSteps = [
        'Seek medical evaluation within 24 hours',
        'Visit a clinic or healthcare facility today or tomorrow',
        'Monitor symptoms closely',
      ];
      watchOuts = [
        'Symptoms getting worse',
        'New symptoms developing',
        'Difficulty performing daily activities',
      ];
      referralRecommended = true;
    } else {
      // GREEN
      recommendedNextSteps = [
        'Rest and stay hydrated',
        'Monitor symptoms at home',
        'Take over-the-counter medications as appropriate',
        'Seek care if symptoms worsen or persist beyond a few days',
      ];
      watchOuts = [
        'Symptoms lasting more than 3-5 days',
        'Symptoms getting significantly worse',
        'Development of fever or severe pain',
      ];
      referralRecommended = false;
    }

    return {
      riskTier,
      dangerSigns,
      uncertainty: 'MEDIUM', // Rule engine always has medium uncertainty
      recommendedNextSteps,
      watchOuts,
      referralRecommended,
      disclaimer: 'This assessment is based on automated rules and should be confirmed by a qualified healthcare professional. Always seek professional medical advice for health concerns.',
      reasoning: `Rule-based assessment: Patient age ${age}, symptom categories: ${categories.join(', ')}. ${dangerSigns.length > 0 ? 'Danger signs detected: ' + dangerSigns.join(', ') : 'No danger signs detected.'}`,
    };
  }
}
