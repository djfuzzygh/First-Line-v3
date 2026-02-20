/**
 * Property-Based Test: Rule Engine Fallback
 * 
 * Property 9: AI Fallback on Unavailability
 * 
 * For any encounter where the AI Engine fails, times out, or returns invalid JSON,
 * the Rule Engine should provide fallback triage classification and follow-up questions.
 * 
 * **Validates: Requirements 3.3, 4.7, 14.6, 17.1**
 * 
 * Feature: firstline-triage-platform, Property 9: AI Fallback on Unavailability
 */

import * as fc from 'fast-check';
import { RuleEngine } from '../services/rule-engine.service';

describe('Property 9: AI Fallback on Unavailability', () => {
  let ruleEngine: RuleEngine;

  beforeEach(() => {
    ruleEngine = new RuleEngine();
  });

  /**
   * Generator for valid patient age (0-120 years)
   */
  const ageArbitrary = fc.integer({ min: 0, max: 120 });

  /**
   * Generator for symptom descriptions
   * Includes various symptom types to test different rule paths
   */
  const symptomsArbitrary = fc.oneof(
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
    fc.constant('I feel tired'),
    fc.constant('I have body aches'),
    // Combinations
    fc.constant('I have a cough and fever'),
    fc.constant('I have stomach pain and vomiting'),
    fc.constant('I have a headache and feel dizzy'),
    // With severity and duration
    fc.constant('I have moderate pain for 5 days'),
    fc.constant('I have severe headache for 2 days'),
    fc.constant('I have mild cough for 1 day'),
  );

  /**
   * Generator for danger signs array
   */
  const dangerSignsArbitrary = fc.oneof(
    fc.constant([]),
    fc.constant(['unconscious']),
    fc.constant(['seizure']),
    fc.constant(['breathing']),
    fc.constant(['bleeding']),
    fc.constant(['chestPain']),
    fc.constant(['abdominalPain']),
    fc.constant(['pregnancy']),
    fc.constant(['unconscious', 'seizure']),
  );

  it('should always generate a valid triage response structure', () => {
    fc.assert(
      fc.property(
        ageArbitrary,
        symptomsArbitrary,
        dangerSignsArbitrary,
        (age, symptoms, dangerSigns) => {
          // Act: Generate triage response using rule engine
          const response = ruleEngine.generateTriageResponse(age, symptoms, dangerSigns);

          // Assert: Response has all required fields
          expect(response).toBeDefined();
          expect(response.riskTier).toBeDefined();
          expect(response.dangerSigns).toBeDefined();
          expect(response.uncertainty).toBeDefined();
          expect(response.recommendedNextSteps).toBeDefined();
          expect(response.watchOuts).toBeDefined();
          expect(response.referralRecommended).toBeDefined();
          expect(response.disclaimer).toBeDefined();
          expect(response.reasoning).toBeDefined();

          // Assert: riskTier is one of the valid values
          expect(['RED', 'YELLOW', 'GREEN']).toContain(response.riskTier);

          // Assert: uncertainty is one of the valid values
          expect(['LOW', 'MEDIUM', 'HIGH']).toContain(response.uncertainty);

          // Assert: Arrays are actually arrays
          expect(Array.isArray(response.dangerSigns)).toBe(true);
          expect(Array.isArray(response.recommendedNextSteps)).toBe(true);
          expect(Array.isArray(response.watchOuts)).toBe(true);

          // Assert: Arrays have content
          expect(response.recommendedNextSteps.length).toBeGreaterThan(0);
          expect(response.watchOuts.length).toBeGreaterThan(0);

          // Assert: Strings are non-empty
          expect(response.disclaimer.length).toBeGreaterThan(0);
          expect(response.reasoning.length).toBeGreaterThan(0);

          // Assert: referralRecommended is boolean
          expect(typeof response.referralRecommended).toBe('boolean');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should always generate 3-5 follow-up questions', () => {
    fc.assert(
      fc.property(
        symptomsArbitrary,
        (symptoms) => {
          // Act: Generate follow-up questions
          const questions = ruleEngine.generateFollowupQuestions(symptoms);

          // Assert: Questions array has 3-5 items
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

  it('should assign RED triage when danger signs are present', () => {
    fc.assert(
      fc.property(
        ageArbitrary,
        symptomsArbitrary,
        fc.array(fc.constantFrom('unconscious', 'seizure', 'breathing', 'bleeding', 'chestPain', 'abdominalPain', 'pregnancy'), { minLength: 1, maxLength: 3 }),
        (age, symptoms, dangerSigns) => {
          // Act: Generate triage response with danger signs
          const response = ruleEngine.generateTriageResponse(age, symptoms, dangerSigns);

          // Assert: Triage level is RED when danger signs present
          expect(response.riskTier).toBe('RED');
          expect(response.dangerSigns).toEqual(dangerSigns);
          expect(response.referralRecommended).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should provide tier-appropriate recommendations', () => {
    fc.assert(
      fc.property(
        ageArbitrary,
        symptomsArbitrary,
        dangerSignsArbitrary,
        (age, symptoms, dangerSigns) => {
          // Act: Generate triage response
          const response = ruleEngine.generateTriageResponse(age, symptoms, dangerSigns);

          // Assert: Recommendations match triage tier
          if (response.riskTier === 'RED') {
            // RED should recommend immediate emergency care
            const hasEmergencyLanguage = response.recommendedNextSteps.some(step =>
              /immediate|emergency|urgent|hospital/i.test(step)
            );
            expect(hasEmergencyLanguage).toBe(true);
            expect(response.referralRecommended).toBe(true);
          } else if (response.riskTier === 'YELLOW') {
            // YELLOW should recommend care within 24 hours
            const has24HourLanguage = response.recommendedNextSteps.some(step =>
              /24 hours|today|tomorrow|clinic/i.test(step)
            );
            expect(has24HourLanguage).toBe(true);
            expect(response.referralRecommended).toBe(true);
          } else if (response.riskTier === 'GREEN') {
            // GREEN should recommend home care
            const hasHomeCareLanguage = response.recommendedNextSteps.some(step =>
              /home|rest|monitor|over-the-counter/i.test(step)
            );
            expect(hasHomeCareLanguage).toBe(true);
            expect(response.referralRecommended).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should always include a disclaimer about professional medical advice', () => {
    fc.assert(
      fc.property(
        ageArbitrary,
        symptomsArbitrary,
        dangerSignsArbitrary,
        (age, symptoms, dangerSigns) => {
          // Act: Generate triage response
          const response = ruleEngine.generateTriageResponse(age, symptoms, dangerSigns);

          // Assert: Disclaimer mentions healthcare professional or medical advice
          const hasDisclaimerLanguage = /healthcare professional|medical advice|qualified|professional/i.test(response.disclaimer);
          expect(hasDisclaimerLanguage).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should provide reasoning that includes patient age and symptoms', () => {
    fc.assert(
      fc.property(
        ageArbitrary,
        symptomsArbitrary,
        dangerSignsArbitrary,
        (age, symptoms, dangerSigns) => {
          // Act: Generate triage response
          const response = ruleEngine.generateTriageResponse(age, symptoms, dangerSigns);

          // Assert: Reasoning includes age
          expect(response.reasoning).toContain(age.toString());

          // Assert: Reasoning mentions rule-based assessment
          expect(response.reasoning.toLowerCase()).toContain('rule-based');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle edge cases: infants with fever', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1 }), // Infants under 2
        fc.constantFrom('fever', 'high fever', 'my baby has a fever', 'temperature'),
        (age, symptoms) => {
          // Act: Generate triage response for infant with fever
          const response = ruleEngine.generateTriageResponse(age, symptoms, []);

          // Assert: Should be at least YELLOW (not GREEN)
          expect(['RED', 'YELLOW']).toContain(response.riskTier);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should handle edge cases: elderly with respiratory symptoms', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 66, max: 120 }), // Elderly over 65
        fc.constantFrom('cough', 'shortness of breath', 'breathing difficulty', 'chest pain'),
        (age, symptoms) => {
          // Act: Generate triage response for elderly with respiratory symptoms
          const response = ruleEngine.generateTriageResponse(age, symptoms, []);

          // Assert: Should be at least YELLOW (not GREEN)
          expect(['RED', 'YELLOW']).toContain(response.riskTier);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should be deterministic: same inputs produce same outputs', () => {
    fc.assert(
      fc.property(
        ageArbitrary,
        symptomsArbitrary,
        dangerSignsArbitrary,
        (age, symptoms, dangerSigns) => {
          // Act: Generate response twice with same inputs
          const response1 = ruleEngine.generateTriageResponse(age, symptoms, dangerSigns);
          const response2 = ruleEngine.generateTriageResponse(age, symptoms, dangerSigns);

          // Assert: Responses are identical
          expect(response1.riskTier).toBe(response2.riskTier);
          expect(response1.dangerSigns).toEqual(response2.dangerSigns);
          expect(response1.uncertainty).toBe(response2.uncertainty);
          expect(response1.referralRecommended).toBe(response2.referralRecommended);
          
          // Questions should also be deterministic
          const questions1 = ruleEngine.generateFollowupQuestions(symptoms);
          const questions2 = ruleEngine.generateFollowupQuestions(symptoms);
          expect(questions1).toEqual(questions2);
        }
      ),
      { numRuns: 100 }
    );
  });
});
