/**
 * DangerSignDetector Service
 * 
 * Implements hard-coded safety rules that override AI decisions.
 * Detects critical symptoms requiring immediate RED triage classification.
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8
 */

/**
 * Danger sign patterns for detecting critical symptoms
 * Each pattern uses case-insensitive regex matching
 */
export const DANGER_SIGNS = {
  unconscious: /unconscious|unresponsive|not waking|won't wake|doesn't wake/i,
  seizure: /seizure|convulsion|convulsing|fitting|fits/i,
  breathing: /can't breathe|cannot breathe|gasping|blue lips|severe breathing|difficulty breathing severely|very hard to breathe/i,
  bleeding: /heavy bleeding|hemorrhage|hemorrhaging|bleeding won't stop|bleeding heavily|severe bleeding/i,
  chestPain: /severe chest pain|crushing chest|chest crushing|heart attack/i,
  abdominalPain: /severe abdominal pain|rigid abdomen|abdomen rigid/i,
  pregnancy: /pregnancy.*bleeding|pregnancy.*pain|pregnancy.*headache|pregnant.*bleeding|pregnant.*pain|pregnant.*headache/i,
} as const;

/**
 * Type for danger sign keys
 */
export type DangerSignKey = keyof typeof DANGER_SIGNS;

/**
 * DangerSignDetector class
 * Provides methods to detect danger signs in patient symptom text
 */
export class DangerSignDetector {
  /**
   * Detect danger signs in the provided text
   * 
   * @param text - Combined symptom text and follow-up responses to analyze
   * @returns Array of detected danger sign names (e.g., ['unconscious', 'seizure'])
   * 
   * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8
   */
  detectDangerSigns(text: string): string[] {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const detectedSigns: string[] = [];

    // Test each danger sign pattern against the text
    for (const [signName, pattern] of Object.entries(DANGER_SIGNS)) {
      if (pattern.test(text)) {
        detectedSigns.push(signName);
      }
    }

    return detectedSigns;
  }

  /**
   * Check if any danger signs are present in the text
   * 
   * @param text - Combined symptom text and follow-up responses to analyze
   * @returns true if at least one danger sign is detected, false otherwise
   */
  hasDangerSigns(text: string): boolean {
    return this.detectDangerSigns(text).length > 0;
  }
}
