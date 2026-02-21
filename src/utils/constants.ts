/**
 * Shared constants and validation helpers for FirstLine 2.0
 */

// -- Data model sort key constants --
export const SK = {
  METADATA: 'METADATA',
  TRIAGE: 'TRIAGE',
  REFERRAL: 'REFERRAL',
  DECISION: 'DECISION',
  FOLLOWUP_PREFIX: 'FOLLOWUP#',
} as const;

// -- Demographics validation --
export const AGE_MIN = 0;
export const AGE_MAX = 120;

export function isValidAge(value: unknown): value is number {
  const age = typeof value === 'string' ? Number.parseInt(value, 10) : value;
  return typeof age === 'number' && Number.isInteger(age) && age >= AGE_MIN && age <= AGE_MAX;
}

// -- Request body size limit (KB) --
export const MAX_BODY_SIZE_KB = 100;
