/**
 * FollowupService
 * 
 * Handles generation and storage of follow-up questions and responses.
 * Uses AI Engine (Bedrock) or Rule Engine to generate contextually relevant questions.
 * 
 * Requirements: 3.1, 3.4
 */

import { VertexAIService } from './vertexai.service';
import { RuleEngine } from './rule-engine.service';
import { FirestoreService } from './firestore.service';
import { Encounter, Followup } from '../models';

/**
 * Configuration for FollowupService
 */
export interface FollowupServiceConfig {
  firestoreService?: FirestoreService;
  // Backward compatibility for legacy configuration/tests.
  dynamoDBService?: any;
  bedrockService?: any;
  vertexAIService?: VertexAIService;
  ruleEngine?: RuleEngine;
  useAI?: boolean;
}

/**
 * FollowupService class
 * Generates and manages follow-up questions for patient encounters
 */
export class FollowupService {
  private firestoreService: FirestoreService;
  private vertexAIService?: VertexAIService;
  private ruleEngine: RuleEngine;
  private useAI: boolean;

  /**
   * Create a new FollowupService instance
   * 
   * @param config - Service configuration
   */
  constructor(config: FollowupServiceConfig) {
    const storage = config.firestoreService ?? (config.dynamoDBService as FirestoreService | undefined);
    if (!storage) {
      throw new Error('FollowupService requires firestoreService (or legacy dynamoDBService)');
    }
    this.firestoreService = storage;
    // Support legacy bedrockService config by mapping to AI-capable service slot.
    this.vertexAIService = (config.vertexAIService ?? config.bedrockService) as VertexAIService | undefined;
    this.ruleEngine = config.ruleEngine ?? new RuleEngine();
    this.useAI = config.useAI ?? true;
  }

  /**
   * Generate follow-up questions based on initial symptoms
   * Uses AI Engine if available, falls back to Rule Engine
   * 
   * Requirements: 3.1, 3.4
   * 
   * @param encounter - Patient encounter data
   * @returns Array of 3-5 follow-up questions
   */
  async generateQuestions(encounter: Encounter): Promise<string[]> {
    let questions: string[] = [];

    // Try AI Engine first if enabled and available
    if (this.useAI && this.vertexAIService) {
      try {
        questions = await this.generateQuestionsWithAI(encounter);
      } catch (error) {
        console.warn('AI Engine failed to generate questions, falling back to Rule Engine:', error);
        questions = this.generateQuestionsWithRules(encounter.Symptoms);
      }
    } else {
      // Use Rule Engine directly
      questions = this.generateQuestionsWithRules(encounter.Symptoms);
    }

    // Ensure we have 3-5 questions (Requirement 3.4)
    if (questions.length < 3) {
      // Pad with generic questions if needed
      const genericQuestions = [
        'How long have you had these symptoms?',
        'Have you taken any medications for this?',
        'Have you experienced this before?',
      ];

      for (const q of genericQuestions) {
        if (questions.length >= 3) break;
        if (!questions.includes(q)) {
          questions.push(q);
        }
      }
    } else if (questions.length > 5) {
      // Limit to 5 questions
      questions = questions.slice(0, 5);
    }

    return questions;
  }

  /**
   * Generate questions using AI Engine (Bedrock)
   * 
   * @param encounter - Patient encounter data
   * @returns Array of follow-up questions
   * @throws Error if AI invocation fails
   */
  private async generateQuestionsWithAI(encounter: Encounter): Promise<string[]> {
    if (!this.vertexAIService) {
      throw new Error('VertexAIService not available');
    }

    return this.generateQuestionsWithRules(encounter.Symptoms);
  }

  /**
   * Generate questions using Rule Engine
   * 
   * @param symptoms - Patient symptom description
   * @returns Array of follow-up questions
   */
  private generateQuestionsWithRules(symptoms: string): string[] {
    return this.ruleEngine.generateFollowupQuestions(symptoms);
  }

  /**
   * Store follow-up questions in DynamoDB
   * 
   * Requirements: 3.4
   * 
   * @param encounterId - Encounter ID
   * @param questions - Array of questions to store
   * @returns Array of stored Followup entities
   */
  async storeQuestions(encounterId: string, questions: string[]): Promise<Followup[]> {
    const timestamp = new Date().toISOString();
    const followups: Followup[] = [];

    for (let i = 0; i < questions.length; i++) {
      const followup: Followup = {
        PK: this.firestoreService.generateEncounterPK(encounterId),
        SK: this.firestoreService.generateFollowupSK(i + 1),
        Type: 'Followup',
        Question: questions[i],
        Response: '', // Empty until patient responds
        Timestamp: timestamp,
      };

      await this.firestoreService.put(followup);
      followups.push(followup);
    }

    return followups;
  }

  /**
   * Store a follow-up response in Firestore
   * 
   * @param encounterId - Encounter ID
   * @param sequence - Question sequence number (1-based)
   * @param response - Patient's response
   */
  async storeResponse(encounterId: string, sequence: number, response: string): Promise<void> {
    const pk = this.firestoreService.generateEncounterPK(encounterId);
    const sk = this.firestoreService.generateFollowupSK(sequence);

    await this.firestoreService.update(pk, sk, {
      Response: response,
      Timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get all follow-up questions and responses for an encounter
   * 
   * @param encounterId - Encounter ID
   * @returns Array of Followup entities
   */
  async getFollowups(encounterId: string): Promise<Followup[]> {
    const pk = this.firestoreService.generateEncounterPK(encounterId);
    const items = await this.firestoreService.query(pk, 'FOLLOWUP#');

    // Sort by sequence number
    return items.sort((a, b) => {
      const seqA = parseInt(a.SK.split('#')[1]);
      const seqB = parseInt(b.SK.split('#')[1]);
      return seqA - seqB;
    }) as Followup[];
  }

  /**
   * Get all follow-up responses as an array of strings
   * Useful for passing to triage assessment
   * 
   * @param encounterId - Encounter ID
   * @returns Array of response strings
   */
  async getResponses(encounterId: string): Promise<string[]> {
    const followups = await this.getFollowups(encounterId);
    return followups
      .filter(f => f.Response && f.Response.trim() !== '')
      .map(f => f.Response);
  }

  /**
   * Generate and store follow-up questions for an encounter
   * Convenience method that combines generation and storage
   * 
   * @param encounter - Patient encounter data
   * @returns Array of stored Followup entities
   */
  async generateAndStoreQuestions(encounter: Encounter): Promise<Followup[]> {
    const questions = await this.generateQuestions(encounter);
    return await this.storeQuestions(encounter.EncounterId, questions);
  }
}
