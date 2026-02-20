/**
 * TriageService
 * 
 * Orchestrates the complete triage assessment workflow:
 * 1. Load encounter data
 * 2. Check for danger signs
 * 3. Call AI Engine or Rule Engine
 * 4. Apply safety constraints
 * 5. Generate tier-appropriate recommendations
 * 6. Save triage result
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 6.1, 6.3, 6.4, 6.5, 6.6
 */

import { AIResponse, Encounter, TriageLevel, TriageResult } from '../models';
import { AIProvider } from './ai-provider.interface';
import { AIProviderFactory } from './ai-provider.factory';
import { DangerSignDetector } from './danger-sign-detector.service';
import { RuleEngine } from './rule-engine.service';
import { FirestoreService } from './firestore.service';
import { ScribeService } from './scribe.service';
import { PatientBridgeService } from './patient-bridge.service';
import { HeARService } from './hear.service';

/**
 * Configuration for TriageService
 */
export interface TriageServiceConfig {
  firestoreService?: FirestoreService;
  // Backward compatibility for older tests/configuration.
  dynamoDBService?: any;
  aiProvider?: AIProvider;
  // Backward compatibility alias for aiProvider.
  bedrockService?: AIProvider;
  dangerSignDetector?: DangerSignDetector;
  ruleEngine?: RuleEngine;
  localProtocols?: string;
}

/**
 * TriageService class
 * Orchestrates AI-powered or rule-based triage assessment with safety constraints
 */
export class TriageService {
  private firestoreService: FirestoreService;
  private aiProvider: AIProvider;
  private dangerSignDetector: DangerSignDetector;
  private ruleEngine: RuleEngine;
  private scribeService: ScribeService;
  private patientBridgeService: PatientBridgeService;
  private hearService: HeARService;
  private localProtocols?: string;

  /**
   * Create a new TriageService instance
   * 
   * @param config - Service configuration
   */
  constructor(config: TriageServiceConfig) {
    const storage = config.firestoreService ?? (config.dynamoDBService as FirestoreService | undefined);
    if (!storage) {
      throw new Error('TriageService requires firestoreService (or legacy dynamoDBService)');
    }

    this.firestoreService = storage;
    this.aiProvider = config.aiProvider ?? config.bedrockService ?? AIProviderFactory.create();
    this.dangerSignDetector = config.dangerSignDetector ?? new DangerSignDetector();
    this.ruleEngine = config.ruleEngine ?? new RuleEngine();
    this.scribeService = new ScribeService(this.aiProvider);
    this.patientBridgeService = new PatientBridgeService(this.aiProvider);
    this.hearService = new HeARService();
    this.localProtocols = config.localProtocols;
  }

  /**
   * Generate tier-appropriate recommendations
   * Requirements: 6.4, 6.5, 6.6
   * 
   * @param riskTier - Assigned triage level
   * @returns Object with recommended next steps and watch-outs
   */
  private generateTierRecommendations(riskTier: TriageLevel): {
    recommendedNextSteps: string[];
    watchOuts: string[];
    referralRecommended: boolean;
  } {
    if (riskTier === 'RED') {
      // RED: Emergency recommendations
      return {
        recommendedNextSteps: [
          'Seek immediate emergency care',
          'Call emergency services or go to the nearest hospital immediately',
          'Do not delay - this requires urgent medical attention',
        ],
        watchOuts: [
          'Worsening symptoms',
          'Loss of consciousness',
          'Difficulty breathing',
          'Severe bleeding',
        ],
        referralRecommended: true,
      };
    } else if (riskTier === 'YELLOW') {
      // YELLOW: 24-hour care recommendations
      return {
        recommendedNextSteps: [
          'Seek medical evaluation within 24 hours',
          'Visit a clinic or healthcare facility today or tomorrow',
          'Monitor symptoms closely',
          'Keep track of any changes in your condition',
        ],
        watchOuts: [
          'Symptoms getting worse',
          'New symptoms developing',
          'Difficulty performing daily activities',
          'Persistent or worsening pain',
        ],
        referralRecommended: true,
      };
    } else {
      // GREEN: Home care recommendations
      return {
        recommendedNextSteps: [
          'Rest and stay well hydrated',
          'Monitor symptoms at home',
          'Take over-the-counter medications as appropriate for symptom relief',
          'Seek care if symptoms worsen or persist beyond a few days',
        ],
        watchOuts: [
          'Symptoms lasting more than 3-5 days',
          'Symptoms getting significantly worse',
          'Development of fever or severe pain',
          'New concerning symptoms',
        ],
        referralRecommended: false,
      };
    }
  }

  /**
   * Apply high uncertainty safety constraint
   * Requirements: 4.5
   * 
   * "Automatic risk-tier escalation if the model reports high uncertainty, 
   * prioritizing patient safety over model confidence."
   * 
   * @param aiResponse - AI-generated response
   * @returns Modified response with safety constraint applied
   */
  private applySafetyConstraints(aiResponse: AIResponse): AIResponse {
    // 1. High uncertainty safety constraint: Never return GREEN if uncertainty HIGH
    if (aiResponse.uncertainty === 'HIGH' && aiResponse.riskTier === 'GREEN') {
      console.log('Safety Escalation: Upgrading GREEN to YELLOW due to HIGH model uncertainty');
      const yellowRecs = this.generateTierRecommendations('YELLOW');
      return {
        ...aiResponse,
        riskTier: 'YELLOW',
        recommendedNextSteps: [...yellowRecs.recommendedNextSteps, 'Contact a healthcare provider within 24 hours for confirmation.'],
        watchOuts: [...yellowRecs.watchOuts, 'Model reports HIGH uncertainty - prioritize physical exam.'],
        referralRecommended: true,
        reasoning: `${aiResponse.reasoning} [SAFETY ESCALATION: Upgraded from GREEN to YELLOW due to HIGH model uncertainty]`,
      };
    }

    // 2. High uncertainty for YELLOW: Add extra caution
    if (aiResponse.uncertainty === 'HIGH' && aiResponse.riskTier === 'YELLOW') {
      console.log('Safety Warning: Adding high-caution instructions to YELLOW due to HIGH uncertainty');
      return {
        ...aiResponse,
        recommendedNextSteps: [...aiResponse.recommendedNextSteps, 'URGENT: Request clinical review if symptoms do not improve within 4 hours.'],
        watchOuts: [...aiResponse.watchOuts, 'AI uncertainty is HIGH; treat as high-risk YELLOW.'],
        reasoning: `${aiResponse.reasoning} [SAFETY WARNING: High model uncertainty for YELLOW tier]`,
      };
    }

    return aiResponse;
  }

  /**
   * Ensure disclaimer is present in the response
   * Requirements: 6.3
   * 
   * @param response - AI or Rule Engine response
   * @returns Response with disclaimer guaranteed
   */
  private ensureDisclaimer(response: AIResponse): AIResponse {
    // If disclaimer is missing or empty, add default disclaimer
    if (!response.disclaimer || response.disclaimer.trim() === '') {
      return {
        ...response,
        disclaimer: 'This assessment is provided for informational purposes only and should be confirmed by a qualified healthcare professional. Always seek professional medical advice for health concerns.',
      };
    }

    return response;
  }

  /**
   * Perform complete triage assessment
   * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 6.1, 6.3
   * 
   * @param encounterId - Unique encounter identifier
   * @param followupResponses - Optional array of follow-up question responses
   * @returns Complete triage result
   */
  async performTriage(
    encounterId: string,
    followupResponses: string[] = [],
    audioSample?: Buffer
  ): Promise<TriageResult> {
    const startTime = Date.now();

    // Step 0: Load encounter data from Firestore
    console.log(`Loading encounter ${encounterId}...`);
    const encounterData = await this.firestoreService.getEncounter(encounterId);

    if (!encounterData.encounter) {
      throw new Error(`Encounter ${encounterId} not found`);
    }

    const encounter = encounterData.encounter as Encounter;

    // Optional Step: Acoustic Analysis (HeAR)
    let acousticSummary: string | undefined;
    if (audioSample) {
      console.log('Performing acoustic health analysis (HeAR)...');
      const hearResult = await this.hearService.analyzeAcoustics(audioSample);
      acousticSummary = this.hearService.formatAcousticReasoning(hearResult);
    }

    // MOCK MODE - Return mock response if enabled (Bypasses AI calls that fail without creds)
    if (process.env.MOCK_AI === 'true') {
      console.log('MOCK_AI mode enabled - returning mock triage response');
      const symptoms = encounter.Symptoms.toLowerCase();
      const mockTriageLevel: TriageLevel =
        symptoms.includes('severe') || symptoms.includes('emergency') || symptoms.includes('unconscious') ? 'RED' :
          symptoms.includes('fever') || symptoms.includes('pain') || symptoms.includes('vomit') ? 'YELLOW' : 'GREEN';

      const tierRecommendations = this.generateTierRecommendations(mockTriageLevel);
      const endTime = Date.now();

      const triageResult: TriageResult = {
        PK: this.firestoreService.generateEncounterPK(encounterId),
        SK: this.firestoreService.generateTriageSK(),
        Type: 'TriageResult',
        RiskTier: mockTriageLevel,
        DangerSigns: [],
        Uncertainty: 'LOW',
        RecommendedNextSteps: tierRecommendations.recommendedNextSteps,
        WatchOuts: tierRecommendations.watchOuts,
        ReferralRecommended: tierRecommendations.referralRecommended,
        Disclaimer: '⚠️ MOCK AI RESPONSE FOR TESTING - This is not a real AI assessment. Real AI triage will be available via Vertex AI once configured.',
        Reasoning: `Mock assessment based on keyword detection in symptoms: "${encounter.Symptoms.substring(0, 100)}...". Detected severity level: ${mockTriageLevel}. This is a simulated response for testing purposes only.`,
        SoapNote: 'SOAP Note (Mock): Subjective: ' + encounter.Symptoms,
        PatientExplanation: 'Your assessment is complete. Please follow the instructions below.',
        AcousticSummary: acousticSummary,
        AiLatencyMs: endTime - startTime,
        UsedFallback: true,
        Timestamp: new Date().toISOString(),
        TTL: this.firestoreService.calculateTTL(),
      };

      // Save triage result
      await this.firestoreService.put(triageResult);

      // Update encounter status
      await this.firestoreService.updateEncounter(encounterId, {
        Status: 'completed',
      });

      console.log(`Mock triage completed: ${mockTriageLevel}`);
      return triageResult;
    }

    // Step 1: Intake Normalization (Agentic Step 1)
    console.log('Agentic Step 1: Normalizing intake...');
    const normalizedIntake = await this.aiProvider.normalizeIntake(
      encounter.Symptoms,
      { age: encounter.Demographics.age, sex: encounter.Demographics.sex }
    );

    // Step 2: Adaptive Follow-up Generation (Agentic Step 2)
    // If we have no follow-ups yet, and the symptoms are vague, ask for more info
    let followupQuestions: string[] = [];
    if (followupResponses.length === 0 && normalizedIntake.severity === 'Unknown') {
      console.log('Agentic Step 2: Generating adaptive follow-up questions...');
      followupQuestions = await this.aiProvider.generateFollowupQuestions(
        encounter.Symptoms,
        { age: encounter.Demographics.age, sex: encounter.Demographics.sex }
      );
    }
    console.log(`Normalized Complaint: ${normalizedIntake.primaryComplaint}`);

    // Step 3: Red-Flag Detection (Agentic Step 3)
    console.log('Agentic Step 3: Checking for danger signs...');
    const combinedText = [
      normalizedIntake.primaryComplaint,
      ...normalizedIntake.extractedSymptoms,
      ...followupResponses,
      acousticSummary || '',
    ].join(' ');

    const detectedDangerSigns = this.dangerSignDetector.detectDangerSigns(combinedText);

    // Step 3: If danger signs found, return RED immediately
    if (detectedDangerSigns.length > 0) {
      console.log(`Danger signs detected: ${detectedDangerSigns.join(', ')} - assigning RED`);

      const redRecommendations = this.generateTierRecommendations('RED');
      const endTime = Date.now();

      const triageResult: TriageResult = {
        PK: this.firestoreService.generateEncounterPK(encounterId),
        SK: this.firestoreService.generateTriageSK(),
        Type: 'TriageResult',
        RiskTier: 'RED',
        DangerSigns: detectedDangerSigns,
        Uncertainty: 'LOW', // Danger sign detection is certain
        RecommendedNextSteps: redRecommendations.recommendedNextSteps,
        WatchOuts: redRecommendations.watchOuts,
        ReferralRecommended: redRecommendations.referralRecommended,
        Disclaimer: 'This assessment is provided for informational purposes only and should be confirmed by a qualified healthcare professional. Always seek professional medical advice for health concerns.',
        Reasoning: `Danger signs detected: ${detectedDangerSigns.join(', ')}. Immediate RED classification per safety rules. ${acousticSummary || ''}`,
        AcousticSummary: acousticSummary,
        AiLatencyMs: endTime - startTime,
        UsedFallback: false, // Danger sign override, not fallback
        Timestamp: new Date().toISOString(),
        TTL: this.firestoreService.calculateTTL(),
      };

      // Save triage result
      await this.firestoreService.put(triageResult);

      // Update encounter status
      await this.firestoreService.updateEncounter(encounterId, {
        Status: 'completed',
      });

      return triageResult;
    }

    // Step 4: Triage Reasoning (Agentic Step 4)
    let aiResponse: AIResponse;
    let usedFallback = false;
    let aiLatencyMs = 0;

    try {
      console.log('Calling AI Engine (Vertex AI)...');
      const aiStartTime = Date.now();

      aiResponse = await this.aiProvider.generateTriageAssessment(
        encounter,
        followupResponses,
        this.localProtocols || 'Standard WHO guidelines'
      );

      aiLatencyMs = Date.now() - aiStartTime;
      console.log(`AI Engine completed in ${aiLatencyMs}ms`);

      // Log AI decision for audit
      const decision = {
        PK: this.firestoreService.generateEncounterPK(encounterId),
        SK: this.firestoreService.generateDecisionSK(),
        Type: 'Decision',
        AiModel: 'medgemma-2b',
        PromptTokens: 0,
        CompletionTokens: 0,
        RawResponse: JSON.stringify(aiResponse),
        ProcessingTimeMs: aiLatencyMs,
        Timestamp: new Date().toISOString(),
        TTL: this.firestoreService.calculateTTL(),
      };

      await this.firestoreService.put(decision);
    } catch (error) {
      console.error('AI Engine failed, falling back to Rule Engine:', error);
      usedFallback = true;
      const ruleResult = this.ruleEngine.generateTriageResponse(
        encounter.Demographics.age,
        encounter.Symptoms,
        detectedDangerSigns
      );
      aiResponse = {
        ...ruleResult,
        uncertainty: 'HIGH',
        disclaimer: 'RULE ENGINE FALLBACK: ' + ruleResult.disclaimer,
        reasoning: 'AI Engine failed; assessment provided by deterministic Rule Engine.',
      };
      aiLatencyMs = Date.now() - startTime;
    }

    // Step 5: Uncertainty Gating (Agentic Step 5)
    console.log('Agentic Step 5: Applying Uncertainty Gating...');
    aiResponse = this.applySafetyConstraints(aiResponse);
    aiResponse = this.ensureDisclaimer(aiResponse);

    // Step 6: SOAP Note Generation (Agentic Step 6)
    console.log('Agentic Step 6: Generating professional SOAP note...');
    let soapNote: string | undefined;
    let patientExplanation: string | undefined;

    try {
      soapNote = await this.scribeService.generateSOAPNote(encounter, aiResponse);
      patientExplanation = await this.patientBridgeService.simplifyForPatient(aiResponse);
    } catch (postError) {
      console.error('Post-processing features failed:', postError);
      soapNote = `Subjective: ${encounter.Symptoms}\nAssessment: ${aiResponse.riskTier}\nPlan: ${aiResponse.recommendedNextSteps.join(', ')}`;
      patientExplanation = 'Your assessment is complete. Please seek care as advised.';
    }

    const triageResult: TriageResult = {
      PK: this.firestoreService.generateEncounterPK(encounterId),
      SK: this.firestoreService.generateTriageSK(),
      Type: 'TriageResult',
      RiskTier: aiResponse.riskTier,
      DangerSigns: aiResponse.dangerSigns.length > 0 ? aiResponse.dangerSigns : detectedDangerSigns,
      Uncertainty: aiResponse.uncertainty,
      RecommendedNextSteps: aiResponse.recommendedNextSteps,
      WatchOuts: aiResponse.watchOuts,
      ReferralRecommended: aiResponse.referralRecommended,
      Disclaimer: aiResponse.disclaimer,
      Reasoning: aiResponse.reasoning,
      FollowupQuestions: followupQuestions.length > 0 ? followupQuestions : undefined,
      SoapNote: soapNote,
      PatientExplanation: patientExplanation,
      AcousticSummary: acousticSummary,
      AiLatencyMs: aiLatencyMs,
      UsedFallback: usedFallback,
      Timestamp: new Date().toISOString(),
      TTL: this.firestoreService.calculateTTL(),
    };

    console.log(`Saving triage result: ${triageResult.RiskTier}`);
    await this.firestoreService.put(triageResult);

    await this.firestoreService.updateEncounter(encounterId, {
      Status: 'completed',
    });

    console.log(`Triage completed in ${Date.now() - startTime}ms`);
    return triageResult;
  }
}
