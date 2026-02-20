/**
 * Unit Tests: DangerSignDetector
 * Feature: firstline-triage-platform
 * 
 * Tests for specific danger sign patterns (Requirements 5.1-5.7)
 * 
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7**
 */

import { DangerSignDetector, DANGER_SIGNS } from '../services/danger-sign-detector.service';

describe('DangerSignDetector', () => {
  let detector: DangerSignDetector;

  beforeEach(() => {
    detector = new DangerSignDetector();
  });

  describe('Requirement 5.1: Unconsciousness detection', () => {
    it('should detect unconscious patient', () => {
      const result = detector.detectDangerSigns('Patient is unconscious');
      expect(result).toContain('unconscious');
    });

    it('should detect unresponsive patient', () => {
      const result = detector.detectDangerSigns('Patient is unresponsive');
      expect(result).toContain('unconscious');
    });

    it('should detect not waking patient', () => {
      const result = detector.detectDangerSigns('Patient is not waking up');
      expect(result).toContain('unconscious');
    });

    it('should detect won\'t wake patient', () => {
      const result = detector.detectDangerSigns('Patient won\'t wake');
      expect(result).toContain('unconscious');
    });

    it('should not detect consciousness in normal text', () => {
      const result = detector.detectDangerSigns('Patient is awake and alert');
      expect(result).not.toContain('unconscious');
    });
  });

  describe('Requirement 5.2: Seizure detection', () => {
    it('should detect seizure', () => {
      const result = detector.detectDangerSigns('Patient is having a seizure');
      expect(result).toContain('seizure');
    });

    it('should detect convulsion', () => {
      const result = detector.detectDangerSigns('Patient is convulsing');
      expect(result).toContain('seizure');
    });

    it('should detect fitting', () => {
      const result = detector.detectDangerSigns('Patient is fitting');
      expect(result).toContain('seizure');
    });

    it('should detect fits', () => {
      const result = detector.detectDangerSigns('Patient has fits');
      expect(result).toContain('seizure');
    });

    it('should not detect seizure in normal text', () => {
      const result = detector.detectDangerSigns('Patient has no neurological symptoms');
      expect(result).not.toContain('seizure');
    });
  });

  describe('Requirement 5.3: Breathing difficulty detection', () => {
    it('should detect can\'t breathe', () => {
      const result = detector.detectDangerSigns('Patient can\'t breathe');
      expect(result).toContain('breathing');
    });

    it('should detect cannot breathe', () => {
      const result = detector.detectDangerSigns('Patient cannot breathe');
      expect(result).toContain('breathing');
    });

    it('should detect gasping', () => {
      const result = detector.detectDangerSigns('Patient is gasping for air');
      expect(result).toContain('breathing');
    });

    it('should detect blue lips', () => {
      const result = detector.detectDangerSigns('Patient has blue lips');
      expect(result).toContain('breathing');
    });

    it('should detect severe breathing difficulty', () => {
      const result = detector.detectDangerSigns('Patient has severe breathing problems');
      expect(result).toContain('breathing');
    });

    it('should not detect mild breathing issues', () => {
      const result = detector.detectDangerSigns('Patient has mild shortness of breath');
      expect(result).not.toContain('breathing');
    });
  });

  describe('Requirement 5.4: Heavy bleeding detection', () => {
    it('should detect heavy bleeding', () => {
      const result = detector.detectDangerSigns('Patient has heavy bleeding');
      expect(result).toContain('bleeding');
    });

    it('should detect hemorrhage', () => {
      const result = detector.detectDangerSigns('Patient is hemorrhaging');
      expect(result).toContain('bleeding');
    });

    it('should detect bleeding won\'t stop', () => {
      const result = detector.detectDangerSigns('Bleeding won\'t stop');
      expect(result).toContain('bleeding');
    });

    it('should detect severe bleeding', () => {
      const result = detector.detectDangerSigns('Patient has severe bleeding');
      expect(result).toContain('bleeding');
    });

    it('should not detect minor bleeding', () => {
      const result = detector.detectDangerSigns('Patient has a small cut');
      expect(result).not.toContain('bleeding');
    });
  });

  describe('Requirement 5.5: Severe chest pain detection', () => {
    it('should detect severe chest pain', () => {
      const result = detector.detectDangerSigns('Patient has severe chest pain');
      expect(result).toContain('chestPain');
    });

    it('should detect crushing chest pain', () => {
      const result = detector.detectDangerSigns('Patient has crushing chest pain');
      expect(result).toContain('chestPain');
    });

    it('should detect heart attack symptoms', () => {
      const result = detector.detectDangerSigns('Patient thinks they are having a heart attack');
      expect(result).toContain('chestPain');
    });

    it('should not detect mild chest discomfort', () => {
      const result = detector.detectDangerSigns('Patient has mild chest discomfort');
      expect(result).not.toContain('chestPain');
    });
  });

  describe('Requirement 5.6: Severe abdominal pain detection', () => {
    it('should detect severe abdominal pain', () => {
      const result = detector.detectDangerSigns('Patient has severe abdominal pain');
      expect(result).toContain('abdominalPain');
    });

    it('should detect rigid abdomen', () => {
      const result = detector.detectDangerSigns('Patient has a rigid abdomen');
      expect(result).toContain('abdominalPain');
    });

    it('should not detect mild stomach ache', () => {
      const result = detector.detectDangerSigns('Patient has a mild stomach ache');
      expect(result).not.toContain('abdominalPain');
    });
  });

  describe('Requirement 5.7: Pregnancy danger signs detection', () => {
    it('should detect pregnancy bleeding', () => {
      const result = detector.detectDangerSigns('Patient is pregnant and has bleeding');
      expect(result).toContain('pregnancy');
    });

    it('should detect pregnancy pain', () => {
      const result = detector.detectDangerSigns('Patient is pregnant with severe pain');
      expect(result).toContain('pregnancy');
    });

    it('should detect pregnancy headache', () => {
      const result = detector.detectDangerSigns('Patient is pregnant and has severe headache');
      expect(result).toContain('pregnancy');
    });

    it('should detect pregnant bleeding', () => {
      const result = detector.detectDangerSigns('Pregnant woman with bleeding');
      expect(result).toContain('pregnancy');
    });

    it('should not detect normal pregnancy', () => {
      const result = detector.detectDangerSigns('Patient is pregnant, feeling well');
      expect(result).not.toContain('pregnancy');
    });
  });

  describe('Multiple danger signs', () => {
    it('should detect multiple danger signs in one text', () => {
      const result = detector.detectDangerSigns(
        'Patient is unconscious and having a seizure with heavy bleeding'
      );
      expect(result).toContain('unconscious');
      expect(result).toContain('seizure');
      expect(result).toContain('bleeding');
      expect(result.length).toBe(3);
    });

    it('should return empty array for no danger signs', () => {
      const result = detector.detectDangerSigns('Patient has a mild headache and cough');
      expect(result).toEqual([]);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string', () => {
      const result = detector.detectDangerSigns('');
      expect(result).toEqual([]);
    });

    it('should handle null input', () => {
      const result = detector.detectDangerSigns(null as any);
      expect(result).toEqual([]);
    });

    it('should handle undefined input', () => {
      const result = detector.detectDangerSigns(undefined as any);
      expect(result).toEqual([]);
    });

    it('should be case insensitive', () => {
      const result1 = detector.detectDangerSigns('PATIENT IS UNCONSCIOUS');
      const result2 = detector.detectDangerSigns('patient is unconscious');
      const result3 = detector.detectDangerSigns('Patient Is Unconscious');
      
      expect(result1).toContain('unconscious');
      expect(result2).toContain('unconscious');
      expect(result3).toContain('unconscious');
    });

    it('should handle very long text', () => {
      const longText = 'Patient has been feeling unwell for several days. ' +
        'Started with mild symptoms but now patient is unconscious. ' +
        'Family is very worried. '.repeat(100);
      
      const result = detector.detectDangerSigns(longText);
      expect(result).toContain('unconscious');
    });
  });

  describe('hasDangerSigns method', () => {
    it('should return true when danger signs present', () => {
      const result = detector.hasDangerSigns('Patient is unconscious');
      expect(result).toBe(true);
    });

    it('should return false when no danger signs present', () => {
      const result = detector.hasDangerSigns('Patient has a mild headache');
      expect(result).toBe(false);
    });

    it('should return false for empty string', () => {
      const result = detector.hasDangerSigns('');
      expect(result).toBe(false);
    });
  });

  describe('DANGER_SIGNS constant', () => {
    it('should have all 7 danger sign patterns', () => {
      const keys = Object.keys(DANGER_SIGNS);
      expect(keys).toHaveLength(7);
      expect(keys).toContain('unconscious');
      expect(keys).toContain('seizure');
      expect(keys).toContain('breathing');
      expect(keys).toContain('bleeding');
      expect(keys).toContain('chestPain');
      expect(keys).toContain('abdominalPain');
      expect(keys).toContain('pregnancy');
    });

    it('should have regex patterns for all danger signs', () => {
      Object.values(DANGER_SIGNS).forEach((pattern) => {
        expect(pattern).toBeInstanceOf(RegExp);
      });
    });
  });
});
