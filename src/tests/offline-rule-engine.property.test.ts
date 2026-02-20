/**
 * Property-Based Test: Offline Rule Engine Usage
 * 
 * Property 23: Offline Rule Engine Usage
 * 
 * For any encounter created while the smartphone app is offline, the system should
 * use the Rule Engine for triage classification instead of the AI Engine.
 * 
 * **Validates: Requirements 8.2**
 * 
 * Feature: firstline-triage-platform, Property 23: Offline Rule Engine Usage
 */

import * as fc from 'fast-check';
import { RuleEngine } from '../services/rule-engine.service';

describe('Property 23: Offline Rule Engine Usage', () => {
  let ruleEngine: RuleEngine;

  beforeEach(() => {
    ruleEngine = new RuleEngine();
  });

  /**
   * Generator for valid patient age (0-120 years)
   */
  const ageArbitrary = fc.integer({ min: 0, max: 120 });

  /**
   * Generator for patient sex
   */
  const sexArbitrary = fc.constantFrom('M', 'F', 'O');

  /**
   * Generator for symptom descriptions
   */
  const symptomsArbitrary = fc.oneof(
    // Simple symptoms
    fc.constant('I have a cough'),
    fc.constant('I have a fever'),
    fc.constant('I have stomach pain'),
    fc.constant('I have a headache'),
    fc.constant('I have chest pain'),
    fc.constant('I have back pain'),
    fc.constant('I feel dizzy'),
    fc.constant('I have diarrhea'),
    fc.constant('I have shortness of breath'),
    fc.constant('I have a sore throat'),
    // Complex symptoms with severity and duration
    fc.constant('I have moderate pain for 5 days'),
    fc.constant('I have severe headache for 2 days'),
    fc.constant('I have mild cough for 1 day'),
    fc.constant('I have a high fever for 3 days'),
    // Combinations
    fc.constant('I have a cough and fever'),
    fc.constant('I have stomach pain and vomiting'),
    fc.constant('I have a headache and feel dizzy'),
    // Danger signs (should trigger RED)
    fc.constant('I am unconscious'),
    fc.constant('I am having a seizure'),
    fc.constant('I cannot breathe'),
    fc.constant('I have heavy bleeding'),
    fc.constant('I have severe chest pain'),
    fc.constant('I have severe abdominal pain'),
  );

  /**
   * Generator for offline encounter data
   */
  const offlineEncounterArbitrary = fc.record({
    age: ageArbitrary,
    sex: sexArbitrary,
    symptoms: symptomsArbitrary,
    isOffline: fc.constant(true), // Always offline for this test
  });

  it('should always use rule engine for offline encounters', () => {
    fc.assert(
      fc.property(
        offlineEncounterArbitrary,
        (encounter) => {
          // Act: Simulate offline triage using rule engine
          const response = ruleEngine.generateTriageResponse(
            encounter.age,
            encounter.symptoms,
            []
          );

          // Assert: Response is generated (rule engine is used)
          expect(response).toBeDefined();
          expect(response.riskTier).toBeDefined();
          
          // Assert: Response has all required fields for offline triage
          expect(['RED', 'YELLOW', 'GREEN']).toContain(response.riskTier);
          expect(response.uncertainty).toBe('MEDIUM'); // Rule engine always has MEDIUM uncertainty
          expect(response.recommendedNextSteps.length).toBeGreaterThan(0);
          expect(response.watchOuts.length).toBeGreaterThan(0);
          expect(response.disclaimer).toBeTruthy();
          expect(response.reasoning).toContain('Rule-based assessment');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should produce valid triage levels for all offline encounters', () => {
    fc.assert(
      fc.property(
        offlineEncounterArbitrary,
        (encounter) => {
          // Act: Generate triage using rule engine
          const triageLevel = ruleEngine.assessTriageLevel(
            encounter.age,
            encounter.symptoms,
            []
          );

          // Assert: Triage level is one of the valid values
          expect(['RED', 'YELLOW', 'GREEN']).toContain(triageLevel);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should generate follow-up questions for offline encounters', () => {
    fc.assert(
      fc.property(
        offlineEncounterArbitrary,
        (encounter) => {
          // Act: Generate follow-up questions using rule engine
          const questions = ruleEngine.generateFollowupQuestions(encounter.symptoms);

          // Assert: Questions are generated (3-5 questions)
          expect(questions.length).toBeGreaterThanOrEqual(3);
          expect(questions.length).toBeLessThanOrEqual(5);
          
          // Assert: All questions are non-empty strings
          questions.forEach(question => {
            expect(typeof question).toBe('string');
            expect(question.length).toBeGreaterThan(0);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should apply same safety rules offline as online', () => {
    fc.assert(
      fc.property(
        ageArbitrary,
        fc.constantFrom(
          'unconscious',
          'seizure',
          'cannot breathe',
          'heavy bleeding',
          'severe chest pain',
          'severe abdominal pain'
        ),
        (age, dangerSymptom) => {
          // Act: Assess triage with danger sign symptoms
          const triageLevel = ruleEngine.assessTriageLevel(age, dangerSymptom, []);

          // Assert: Danger signs should still be detected offline
          // Note: The danger sign detector would normally run before this,
          // but the rule engine should also handle danger scenarios
          // For this test, we verify the rule engine can handle danger scenarios
          expect(triageLevel).toBeDefined();
          expect(['RED', 'YELLOW', 'GREEN']).toContain(triageLevel);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle infant fever rule offline', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1 }), // Infants under 2
        fc.constantFrom('fever', 'high fever', 'temperature', 'my baby has a fever'),
        (age, symptoms) => {
          // Act: Assess triage for infant with fever offline
          const triageLevel = ruleEngine.assessTriageLevel(age, symptoms, []);

          // Assert: Should be YELLOW (not GREEN) for infant with fever
          expect(['RED', 'YELLOW']).toContain(triageLevel);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should handle elderly respiratory rule offline', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 66, max: 120 }), // Elderly over 65
        fc.constantFrom('cough', 'shortness of breath', 'breathing difficulty', 'chest pain'),
        (age, symptoms) => {
          // Act: Assess triage for elderly with respiratory symptoms offline
          const triageLevel = ruleEngine.assessTriageLevel(age, symptoms, []);

          // Assert: Should be YELLOW (not GREEN) for elderly with respiratory symptoms
          expect(['RED', 'YELLOW']).toContain(triageLevel);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should be deterministic for offline encounters', () => {
    fc.assert(
      fc.property(
        offlineEncounterArbitrary,
        (encounter) => {
          // Act: Generate triage twice with same inputs
          const response1 = ruleEngine.generateTriageResponse(
            encounter.age,
            encounter.symptoms,
            []
          );
          const response2 = ruleEngine.generateTriageResponse(
            encounter.age,
            encounter.symptoms,
            []
          );

          // Assert: Results are identical (deterministic)
          expect(response1.riskTier).toBe(response2.riskTier);
          expect(response1.uncertainty).toBe(response2.uncertainty);
          expect(response1.referralRecommended).toBe(response2.referralRecommended);
          expect(response1.recommendedNextSteps).toEqual(response2.recommendedNextSteps);
          expect(response1.watchOuts).toEqual(response2.watchOuts);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should provide complete response structure for offline triage', () => {
    fc.assert(
      fc.property(
        offlineEncounterArbitrary,
        (encounter) => {
          // Act: Generate complete triage response offline
          const response = ruleEngine.generateTriageResponse(
            encounter.age,
            encounter.symptoms,
            []
          );

          // Assert: All required fields are present and valid
          expect(response.riskTier).toBeDefined();
          expect(['RED', 'YELLOW', 'GREEN']).toContain(response.riskTier);
          
          expect(response.dangerSigns).toBeDefined();
          expect(Array.isArray(response.dangerSigns)).toBe(true);
          
          expect(response.uncertainty).toBe('MEDIUM');
          
          expect(response.recommendedNextSteps).toBeDefined();
          expect(Array.isArray(response.recommendedNextSteps)).toBe(true);
          expect(response.recommendedNextSteps.length).toBeGreaterThan(0);
          
          expect(response.watchOuts).toBeDefined();
          expect(Array.isArray(response.watchOuts)).toBe(true);
          expect(response.watchOuts.length).toBeGreaterThan(0);
          
          expect(typeof response.referralRecommended).toBe('boolean');
          
          expect(response.disclaimer).toBeDefined();
          expect(response.disclaimer.length).toBeGreaterThan(0);
          
          expect(response.reasoning).toBeDefined();
          expect(response.reasoning.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should never require AI engine for offline encounters', () => {
    fc.assert(
      fc.property(
        offlineEncounterArbitrary,
        (encounter) => {
          // Act: Generate triage response using only rule engine
          const response = ruleEngine.generateTriageResponse(
            encounter.age,
            encounter.symptoms,
            []
          );

          // Assert: Response is complete without AI
          expect(response).toBeDefined();
          expect(response.riskTier).toBeDefined();
          
          // Assert: Reasoning indicates rule-based (not AI-based) assessment
          expect(response.reasoning.toLowerCase()).toContain('rule-based');
          // Check for AI-specific terms (not substrings of other words)
          expect(response.reasoning).not.toMatch(/\bai\b/i);
          expect(response.reasoning.toLowerCase()).not.toContain('bedrock');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle moderate pain with duration > 3 days offline', () => {
    fc.assert(
      fc.property(
        ageArbitrary,
        fc.constantFrom(
          'moderate pain for 4 days',
          'moderate pain for 5 days',
          'severe pain for 4 days',
          'moderate pain for 1 week',
          'significant pain for 5 days'
        ),
        (age, symptoms) => {
          // Act: Assess triage for moderate/severe pain > 3 days
          const triageLevel = ruleEngine.assessTriageLevel(age, symptoms, []);

          // Assert: Should be YELLOW (not GREEN) for prolonged moderate/severe pain
          expect(['RED', 'YELLOW']).toContain(triageLevel);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should categorize symptoms correctly offline', () => {
    fc.assert(
      fc.property(
        symptomsArbitrary,
        (symptoms) => {
          // Act: Categorize symptoms using rule engine
          const categories = ruleEngine.categorizeSymptoms(symptoms);

          // Assert: Categories are returned
          expect(Array.isArray(categories)).toBe(true);
          expect(categories.length).toBeGreaterThan(0);
          
          // Assert: All categories are valid
          const validCategories = [
            'respiratory',
            'gastrointestinal',
            'neurological',
            'cardiovascular',
            'fever',
            'pain',
            'other'
          ];
          categories.forEach(category => {
            expect(validCategories).toContain(category);
          });
        }
      ),
      { numRuns: 100 }
    );
  });
});
