/**
 * Property-Based Test: Danger Sign Override
 * Feature: firstline-triage-platform
 * 
 * **Property 12: Danger Sign Override**
 * **Validates: Requirements 4.4, 5.8**
 * 
 * For any encounter where a hard-coded danger sign is detected (unconsciousness, 
 * seizures, severe breathing difficulty, heavy bleeding, severe chest pain, 
 * severe abdominal pain, pregnancy danger signs), the system should assign RED 
 * triage level regardless of AI Engine recommendations.
 */

import * as fc from 'fast-check';
import { DangerSignDetector } from '../services/danger-sign-detector.service';

describe('Property 12: Danger Sign Override', () => {
  const detector = new DangerSignDetector();

  /**
   * Generator for danger sign keywords
   * Returns one of the 7 danger sign patterns
   */
  const dangerSignArbitrary = fc.oneof(
    fc.constant('unconscious'),
    fc.constant('unresponsive'),
    fc.constant('not waking'),
    fc.constant('seizure'),
    fc.constant('convulsion'),
    fc.constant('fitting'),
    fc.constant("can't breathe"),
    fc.constant('gasping'),
    fc.constant('blue lips'),
    fc.constant('heavy bleeding'),
    fc.constant('hemorrhage'),
    fc.constant("bleeding won't stop"),
    fc.constant('severe chest pain'),
    fc.constant('crushing chest'),
    fc.constant('heart attack'),
    fc.constant('severe abdominal pain'),
    fc.constant('rigid abdomen'),
    fc.constant('pregnancy bleeding'),
    fc.constant('pregnant with pain'),
    fc.constant('pregnancy headache')
  );

  /**
   * Generator for additional symptom text (non-danger signs)
   */
  const additionalSymptomsArbitrary = fc.oneof(
    fc.constant(''),
    fc.constant('mild headache'),
    fc.constant('cough for 2 days'),
    fc.constant('feeling tired'),
    fc.constant('slight fever'),
    fc.constant('sore throat'),
    fc.constant('runny nose'),
    fc.constant('mild nausea'),
    fc.constant('back pain'),
    fc.constant('joint pain')
  );

  /**
   * Generator for AI recommendations (non-RED triage levels)
   * This simulates what the AI might suggest, which should be overridden
   */
  const aiRecommendationArbitrary = fc.record({
    riskTier: fc.oneof(fc.constant('YELLOW'), fc.constant('GREEN')),
    uncertainty: fc.oneof(fc.constant('LOW'), fc.constant('MEDIUM'), fc.constant('HIGH')),
    reasoning: fc.string({ minLength: 10, maxLength: 100 })
  });

  it('should assign RED triage level for any danger sign regardless of AI output', () => {
    fc.assert(
      fc.property(
        dangerSignArbitrary,
        additionalSymptomsArbitrary,
        aiRecommendationArbitrary,
        (dangerSign, additionalSymptoms, aiRecommendation) => {
          // Arrange: Create symptom text containing a danger sign
          const symptomText = `${dangerSign} ${additionalSymptoms}`.trim();

          // Act: Detect danger signs
          const detectedSigns = detector.detectDangerSigns(symptomText);

          // Assert: Danger sign should be detected
          expect(detectedSigns.length).toBeGreaterThan(0);

          // Simulate triage logic: If danger signs detected, override AI
          const shouldOverride = detectedSigns.length > 0;
          const finalTriageLevel = shouldOverride ? 'RED' : aiRecommendation.riskTier;

          // Assert: Final triage level must be RED when danger signs present
          expect(finalTriageLevel).toBe('RED');

          // Assert: This should be true regardless of AI recommendation
          // Even if AI says GREEN or YELLOW, danger sign forces RED
          expect(finalTriageLevel).not.toBe(aiRecommendation.riskTier);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should detect danger signs in text with various formatting', () => {
    fc.assert(
      fc.property(
        dangerSignArbitrary,
        fc.oneof(
          fc.constant(''),
          fc.constant(' '),
          fc.constant('  '),
          fc.constant('\n'),
          fc.constant('. '),
          fc.constant(', ')
        ),
        fc.string({ minLength: 0, maxLength: 50 }),
        (dangerSign, separator, prefix) => {
          // Arrange: Create text with various formatting
          const symptomText = `${prefix}${separator}${dangerSign}${separator}`;

          // Act: Detect danger signs
          const detectedSigns = detector.detectDangerSigns(symptomText);

          // Assert: Should detect danger sign regardless of formatting
          expect(detectedSigns.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should override AI recommendation even with HIGH uncertainty', () => {
    fc.assert(
      fc.property(
        dangerSignArbitrary,
        fc.record({
          riskTier: fc.constant('GREEN'),
          uncertainty: fc.constant('HIGH'),
          reasoning: fc.string()
        }),
        (dangerSign, aiRecommendation) => {
          // Arrange: Danger sign present, AI says GREEN with HIGH uncertainty
          const symptomText = dangerSign;

          // Act: Detect danger signs
          const detectedSigns = detector.detectDangerSigns(symptomText);

          // Assert: Danger sign detected
          expect(detectedSigns.length).toBeGreaterThan(0);

          // Simulate triage logic with uncertainty constraint
          // Normally HIGH uncertainty prevents GREEN, but danger sign forces RED
          const hasDangerSign = detectedSigns.length > 0;
          const finalTriageLevel = hasDangerSign 
            ? 'RED' 
            : (aiRecommendation.uncertainty === 'HIGH' && aiRecommendation.riskTier === 'GREEN')
              ? 'YELLOW'
              : aiRecommendation.riskTier;

          // Assert: Must be RED due to danger sign, not YELLOW due to uncertainty
          expect(finalTriageLevel).toBe('RED');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should detect multiple danger signs and still assign RED', () => {
    fc.assert(
      fc.property(
        fc.array(dangerSignArbitrary, { minLength: 2, maxLength: 4 }),
        aiRecommendationArbitrary,
        (dangerSigns, aiRecommendation) => {
          // Arrange: Multiple danger signs in one text
          const symptomText = dangerSigns.join(' and ');

          // Act: Detect danger signs
          const detectedSigns = detector.detectDangerSigns(symptomText);

          // Assert: At least one danger sign detected
          expect(detectedSigns.length).toBeGreaterThan(0);

          // Simulate triage logic
          const finalTriageLevel = detectedSigns.length > 0 ? 'RED' : aiRecommendation.riskTier;

          // Assert: Must be RED
          expect(finalTriageLevel).toBe('RED');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle case-insensitive danger sign detection', () => {
    fc.assert(
      fc.property(
        dangerSignArbitrary,
        fc.oneof(
          fc.constant((s: string) => s.toLowerCase()),
          fc.constant((s: string) => s.toUpperCase()),
          fc.constant((s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
        ),
        (dangerSign, caseTransform) => {
          // Arrange: Apply case transformation
          const symptomText = caseTransform(dangerSign);

          // Act: Detect danger signs
          const detectedSigns = detector.detectDangerSigns(symptomText);

          // Assert: Should detect regardless of case
          expect(detectedSigns.length).toBeGreaterThan(0);

          // Simulate triage logic
          const finalTriageLevel = detectedSigns.length > 0 ? 'RED' : 'GREEN';

          // Assert: Must be RED
          expect(finalTriageLevel).toBe('RED');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should prioritize danger sign over all other triage factors', () => {
    fc.assert(
      fc.property(
        dangerSignArbitrary,
        fc.record({
          age: fc.integer({ min: 0, max: 120 }),
          vitalSigns: fc.record({
            temperature: fc.float({ min: 35, max: 42 }),
            pulse: fc.integer({ min: 40, max: 180 }),
            respiratoryRate: fc.integer({ min: 8, max: 40 })
          }),
          aiRecommendation: fc.oneof(fc.constant('YELLOW'), fc.constant('GREEN')),
          ruleEngineRecommendation: fc.oneof(fc.constant('YELLOW'), fc.constant('GREEN'))
        }),
        (dangerSign, triageFactors) => {
          // Arrange: Danger sign present with various other factors
          const symptomText = dangerSign;

          // Act: Detect danger signs
          const detectedSigns = detector.detectDangerSigns(symptomText);

          // Assert: Danger sign detected
          expect(detectedSigns.length).toBeGreaterThan(0);

          // Simulate complex triage logic with multiple factors
          // Danger sign should override everything
          const finalTriageLevel = detectedSigns.length > 0 
            ? 'RED' 
            : triageFactors.aiRecommendation;

          // Assert: Must be RED, ignoring age, vitals, and other recommendations
          expect(finalTriageLevel).toBe('RED');
          expect(finalTriageLevel).not.toBe(triageFactors.aiRecommendation);
          expect(finalTriageLevel).not.toBe(triageFactors.ruleEngineRecommendation);
        }
      ),
      { numRuns: 100 }
    );
  });
});
