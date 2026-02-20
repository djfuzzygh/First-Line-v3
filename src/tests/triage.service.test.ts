/**
 * Unit tests for TriageService
 * 
 * Tests the orchestration of the 6-step agentic pipeline on GCP.
 */

import { TriageService } from '../services/triage.service';
import { FirestoreService } from '../services/firestore.service';
import { AIProvider } from '../services/ai-provider.interface';
import { DangerSignDetector } from '../services/danger-sign-detector.service';
import { RuleEngine } from '../services/rule-engine.service';
import { AIResponse, Encounter, TriageLevel } from '../models';

// Mock services
jest.mock('../services/firestore.service');
jest.mock('../services/danger-sign-detector.service');
jest.mock('../services/rule-engine.service');

describe('TriageService', () => {
  let triageService: TriageService;
  let mockFirestoreService: jest.Mocked<FirestoreService>;
  let mockAIProvider: jest.Mocked<AIProvider>;
  let mockDangerSignDetector: jest.Mocked<DangerSignDetector>;
  let mockRuleEngine: jest.Mocked<RuleEngine>;

  const mockEncounter: Encounter = {
    PK: 'ENC#test-123',
    SK: 'METADATA',
    Type: 'Encounter',
    EncounterId: 'test-123',
    Channel: 'app',
    Timestamp: '2024-01-01T00:00:00Z',
    Status: 'created',
    Demographics: {
      age: 35,
      sex: 'M',
      location: 'Test City',
    },
    Symptoms: 'Headache and fever',
    OfflineCreated: false,
    GSI1PK: 'DATE#2024-01-01',
    GSI1SK: 'CHANNEL#app#TIME#2024-01-01T00:00:00Z',
    TTL: 1234567890,
  };

  const mockNormalizedIntake = {
    primaryComplaint: 'Headache',
    duration: '2 days',
    severity: 'Moderate',
    extractedSymptoms: ['Fever', 'Headache'],
  };

  beforeEach(() => {
    // Create mock instances
    mockFirestoreService = new FirestoreService() as jest.Mocked<FirestoreService>;
    mockAIProvider = {
      invokeModel: jest.fn(),
      generateTriageAssessment: jest.fn(),
      normalizeIntake: jest.fn().mockResolvedValue(mockNormalizedIntake),
      generateFollowupQuestions: jest.fn().mockResolvedValue([]),
      generateReferralSummary: jest.fn().mockResolvedValue('Mock SOAP Note'),
    } as unknown as jest.Mocked<AIProvider>;
    mockDangerSignDetector = new DangerSignDetector() as jest.Mocked<DangerSignDetector>;
    mockRuleEngine = new RuleEngine() as jest.Mocked<RuleEngine>;

    // Setup default mock implementations
    mockFirestoreService.getEncounter = jest.fn().mockResolvedValue({
      encounter: mockEncounter,
    });
    mockFirestoreService.put = jest.fn().mockResolvedValue(undefined);
    mockFirestoreService.updateEncounter = jest.fn().mockResolvedValue(undefined);
    mockFirestoreService.generateEncounterPK = jest.fn((id) => `ENC#${id}`);
    mockFirestoreService.generateTriageSK = jest.fn(() => 'TRIAGE');

    mockDangerSignDetector.detectDangerSigns = jest.fn().mockReturnValue([]);

    // Create service instance
    triageService = new TriageService({
      firestoreService: mockFirestoreService,
      aiProvider: mockAIProvider,
      dangerSignDetector: mockDangerSignDetector,
      ruleEngine: mockRuleEngine,
    });
  });

  describe('Agentic Pipeline: Step 1 & 3 (Intake & Red-Flags)', () => {
    it('should assign RED and short-circuit when danger signs are detected', async () => {
      // Mock danger sign detection
      mockDangerSignDetector.detectDangerSigns.mockReturnValue(['unconscious', 'seizure']);

      const result = await triageService.performTriage('test-123');

      expect(result.RiskTier).toBe('RED');
      expect(mockAIProvider.generateTriageAssessment).not.toHaveBeenCalled();
      expect(mockFirestoreService.put).toHaveBeenCalledWith(expect.objectContaining({ RiskTier: 'RED' }));
    });

    it('should call normalizeIntake (Step 1) before triage', async () => {
      mockAIProvider.generateTriageAssessment.mockResolvedValue({
        riskTier: 'GREEN',
        dangerSigns: [],
        uncertainty: 'LOW',
        recommendedNextSteps: [],
        watchOuts: [],
        referralRecommended: false,
        disclaimer: 'test',
        reasoning: 'test',
      });

      await triageService.performTriage('test-123');

      expect(mockAIProvider.normalizeIntake).toHaveBeenCalledWith(
        mockEncounter.Symptoms,
        mockEncounter.Demographics
      );
    });
  });

  describe('Agentic Pipeline: Step 2 (Adaptive Follow-up)', () => {
    it('should generate follow-up questions if intake is vague', async () => {
      mockAIProvider.normalizeIntake.mockResolvedValue({
        ...mockNormalizedIntake,
        severity: 'Unknown',
      });
      mockAIProvider.generateFollowupQuestions.mockResolvedValue(['Question 1?']);
      mockAIProvider.generateTriageAssessment.mockResolvedValue({
        riskTier: 'GREEN',
        dangerSigns: [],
        uncertainty: 'LOW',
        recommendedNextSteps: [],
        watchOuts: [],
        referralRecommended: false,
        disclaimer: 'test',
        reasoning: 'test',
      });

      const result = await triageService.performTriage('test-123');

      expect(mockAIProvider.generateFollowupQuestions).toHaveBeenCalled();
      expect(result.FollowupQuestions).toEqual(['Question 1?']);
    });
  });

  describe('Agentic Pipeline: Step 5 & 6 (Safety & SOAP)', () => {
    it('should upgrade GREEN to YELLOW when uncertainty is HIGH (Step 5)', async () => {
      mockAIProvider.generateTriageAssessment.mockResolvedValue({
        riskTier: 'GREEN',
        dangerSigns: [],
        uncertainty: 'HIGH',
        recommendedNextSteps: [],
        watchOuts: [],
        referralRecommended: false,
        disclaimer: 'test',
        reasoning: 'Uncertain assessment',
      });

      const result = await triageService.performTriage('test-123');

      expect(result.RiskTier).toBe('YELLOW');
      expect(result.Reasoning).toContain('SAFETY ESCALATION');
    });

    it('should generate professional SOAP notes (Step 6)', async () => {
      mockAIProvider.generateTriageAssessment.mockResolvedValue({
        riskTier: 'GREEN',
        dangerSigns: [],
        uncertainty: 'LOW',
        recommendedNextSteps: [],
        watchOuts: [],
        referralRecommended: false,
        disclaimer: 'test',
        reasoning: 'test',
      });

      const result = await triageService.performTriage('test-123');

      expect(mockAIProvider.generateReferralSummary).toHaveBeenCalled();
      expect(result.SoapNote).toBe('Mock SOAP Note');
    });
  });

  describe('Error Handling & Fallback', () => {
    it('should throw error if encounter not found', async () => {
      mockFirestoreService.getEncounter = jest.fn().mockResolvedValue({ encounter: null });
      await expect(triageService.performTriage('nonexistent')).rejects.toThrow('Encounter nonexistent not found');
    });

    it('should fall back to Rule Engine if AI fails', async () => {
      mockAIProvider.normalizeIntake.mockRejectedValue(new Error('AI failed'));
      mockRuleEngine.generateTriageResponse.mockReturnValue({
        riskTier: 'YELLOW',
        dangerSigns: [],
        uncertainty: 'HIGH',
        recommendedNextSteps: [],
        watchOuts: [],
        referralRecommended: true,
        disclaimer: 'Fallback',
        reasoning: 'Fallback',
      });

      const result = await triageService.performTriage('test-123');

      expect(result.UsedFallback).toBe(true);
      expect(result.RiskTier).toBe('YELLOW');
    });
  });
});
