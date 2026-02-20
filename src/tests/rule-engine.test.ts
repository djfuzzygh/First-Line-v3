/**
 * Unit tests for RuleEngine service
 * Tests symptom categorization, triage rules, and follow-up question generation
 */

import { RuleEngine, SymptomCategory } from '../services/rule-engine.service';

describe('RuleEngine', () => {
  let ruleEngine: RuleEngine;

  beforeEach(() => {
    ruleEngine = new RuleEngine();
  });

  describe('categorizeSymptoms', () => {
    it('should categorize respiratory symptoms', () => {
      const categories = ruleEngine.categorizeSymptoms('I have a bad cough and shortness of breath');
      expect(categories).toContain(SymptomCategory.RESPIRATORY);
    });

    it('should categorize gastrointestinal symptoms', () => {
      const categories = ruleEngine.categorizeSymptoms('I have stomach pain and diarrhea');
      expect(categories).toContain(SymptomCategory.GASTROINTESTINAL);
    });

    it('should categorize neurological symptoms', () => {
      const categories = ruleEngine.categorizeSymptoms('I have a severe headache and feel dizzy');
      expect(categories).toContain(SymptomCategory.NEUROLOGICAL);
    });

    it('should categorize cardiovascular symptoms', () => {
      const categories = ruleEngine.categorizeSymptoms('I have chest pain and palpitations');
      expect(categories).toContain(SymptomCategory.CARDIOVASCULAR);
    });

    it('should categorize fever symptoms', () => {
      const categories = ruleEngine.categorizeSymptoms('I have a high fever and chills');
      expect(categories).toContain(SymptomCategory.FEVER);
    });

    it('should categorize pain symptoms', () => {
      const categories = ruleEngine.categorizeSymptoms('I have pain in my back');
      expect(categories).toContain(SymptomCategory.PAIN);
    });

    it('should return OTHER for unrecognized symptoms', () => {
      const categories = ruleEngine.categorizeSymptoms('I feel tired');
      expect(categories).toContain(SymptomCategory.OTHER);
    });

    it('should handle multiple categories', () => {
      const categories = ruleEngine.categorizeSymptoms('I have a cough, fever, and headache');
      expect(categories).toContain(SymptomCategory.RESPIRATORY);
      expect(categories).toContain(SymptomCategory.FEVER);
      expect(categories).toContain(SymptomCategory.NEUROLOGICAL);
    });

    it('should handle empty symptoms', () => {
      const categories = ruleEngine.categorizeSymptoms('');
      expect(categories).toEqual([SymptomCategory.OTHER]);
    });
  });

  describe('assessTriageLevel', () => {
    it('should return RED when danger signs are present', () => {
      const level = ruleEngine.assessTriageLevel(30, 'I have a headache', ['unconscious']);
      expect(level).toBe('RED');
    });

    it('should return YELLOW for infant with fever', () => {
      const level = ruleEngine.assessTriageLevel(1, 'My baby has a fever');
      expect(level).toBe('YELLOW');
    });

    it('should return YELLOW for elderly with respiratory symptoms', () => {
      const level = ruleEngine.assessTriageLevel(70, 'I have a cough and shortness of breath');
      expect(level).toBe('YELLOW');
    });

    it('should return YELLOW for moderate pain lasting more than 3 days', () => {
      const level = ruleEngine.assessTriageLevel(35, 'I have moderate pain for 5 days');
      expect(level).toBe('YELLOW');
    });

    it('should return YELLOW for severe pain lasting more than 3 days', () => {
      const level = ruleEngine.assessTriageLevel(35, 'I have severe pain for 4 days');
      expect(level).toBe('YELLOW');
    });

    it('should return GREEN for mild symptoms in healthy adult', () => {
      const level = ruleEngine.assessTriageLevel(30, 'I have a mild headache');
      expect(level).toBe('GREEN');
    });

    it('should return GREEN for recent mild symptoms', () => {
      const level = ruleEngine.assessTriageLevel(25, 'I have had a cough for 1 day');
      expect(level).toBe('GREEN');
    });
  });

  describe('generateFollowupQuestions', () => {
    it('should generate 3-5 questions', () => {
      const questions = ruleEngine.generateFollowupQuestions('I have a cough');
      expect(questions.length).toBeGreaterThanOrEqual(3);
      expect(questions.length).toBeLessThanOrEqual(5);
    });

    it('should include duration and severity questions', () => {
      const questions = ruleEngine.generateFollowupQuestions('I have pain');
      expect(questions.some(q => q.toLowerCase().includes('long'))).toBe(true);
      expect(questions.some(q => q.toLowerCase().includes('severe') || q.toLowerCase().includes('scale'))).toBe(true);
    });

    it('should generate respiratory-specific questions', () => {
      const questions = ruleEngine.generateFollowupQuestions('I have a cough and shortness of breath');
      expect(questions.some(q => q.toLowerCase().includes('breathing'))).toBe(true);
    });

    it('should generate GI-specific questions', () => {
      const questions = ruleEngine.generateFollowupQuestions('I have stomach pain and vomiting');
      expect(questions.some(q => q.toLowerCase().includes('food') || q.toLowerCase().includes('fluid'))).toBe(true);
    });

    it('should generate neurological-specific questions', () => {
      const questions = ruleEngine.generateFollowupQuestions('I have a severe headache');
      expect(questions.some(q => q.toLowerCase().includes('vision') || q.toLowerCase().includes('confusion'))).toBe(true);
    });

    it('should generate cardiovascular-specific questions', () => {
      const questions = ruleEngine.generateFollowupQuestions('I have chest pain');
      expect(questions.some(q => q.toLowerCase().includes('arm') || q.toLowerCase().includes('jaw'))).toBe(true);
    });

    it('should handle empty symptoms', () => {
      const questions = ruleEngine.generateFollowupQuestions('');
      expect(questions.length).toBeGreaterThanOrEqual(3);
      expect(questions.length).toBeLessThanOrEqual(5);
    });
  });

  describe('generateTriageResponse', () => {
    it('should generate complete response for RED triage', () => {
      const response = ruleEngine.generateTriageResponse(30, 'chest pain', ['chestPain']);
      expect(response.riskTier).toBe('RED');
      expect(response.dangerSigns).toEqual(['chestPain']);
      expect(response.uncertainty).toBe('MEDIUM');
      expect(response.recommendedNextSteps.length).toBeGreaterThan(0);
      expect(response.watchOuts.length).toBeGreaterThan(0);
      expect(response.referralRecommended).toBe(true);
      expect(response.disclaimer).toContain('healthcare professional');
      expect(response.reasoning).toContain('Rule-based assessment');
    });

    it('should generate complete response for YELLOW triage', () => {
      const response = ruleEngine.generateTriageResponse(70, 'cough and fever');
      expect(response.riskTier).toBe('YELLOW');
      expect(response.dangerSigns).toEqual([]);
      expect(response.uncertainty).toBe('MEDIUM');
      expect(response.recommendedNextSteps.some(step => step.includes('24 hours'))).toBe(true);
      expect(response.referralRecommended).toBe(true);
    });

    it('should generate complete response for GREEN triage', () => {
      const response = ruleEngine.generateTriageResponse(30, 'mild headache');
      expect(response.riskTier).toBe('GREEN');
      expect(response.dangerSigns).toEqual([]);
      expect(response.uncertainty).toBe('MEDIUM');
      expect(response.recommendedNextSteps.some(step => step.toLowerCase().includes('rest') || step.toLowerCase().includes('home'))).toBe(true);
      expect(response.referralRecommended).toBe(false);
    });

    it('should include appropriate watch-outs for each tier', () => {
      const redResponse = ruleEngine.generateTriageResponse(30, 'severe pain', ['bleeding']);
      const yellowResponse = ruleEngine.generateTriageResponse(1, 'fever');
      const greenResponse = ruleEngine.generateTriageResponse(30, 'mild cough');

      expect(redResponse.watchOuts.length).toBeGreaterThan(0);
      expect(yellowResponse.watchOuts.length).toBeGreaterThan(0);
      expect(greenResponse.watchOuts.length).toBeGreaterThan(0);
    });

    it('should always include disclaimer', () => {
      const response = ruleEngine.generateTriageResponse(30, 'headache');
      expect(response.disclaimer).toBeTruthy();
      expect(response.disclaimer.length).toBeGreaterThan(0);
    });

    it('should include reasoning with age and symptoms', () => {
      const response = ruleEngine.generateTriageResponse(45, 'back pain');
      expect(response.reasoning).toContain('45');
      expect(response.reasoning).toContain('symptom categories');
    });
  });
});
