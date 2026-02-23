/**
 * Data models and TypeScript interfaces
 * Export all model definitions from this file
 */

// Type definitions for channels and triage levels
export type Channel = 'app' | 'voice' | 'ussd' | 'sms';
export type TriageLevel = 'RED' | 'YELLOW' | 'GREEN';
export type UncertaintyLevel = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * Patient demographics information
 */
export interface Demographics {
  age: number;
  sex: 'M' | 'F' | 'O';
  location: string;
}

/**
 * Patient vital signs measurements
 */
export interface VitalSigns {
  temperature?: number;
  pulse?: number;
  bloodPressure?: string;
  respiratoryRate?: number;
}

/**
 * Lab test results
 */
export interface LabResults {
  wbc?: number;              // White Blood Cell count (K/μL)
  hemoglobin?: number;       // g/dL
  glucose?: number;          // mg/dL
  temperature?: number;      // °C
  bloodPressure?: string;    // "120/80"
  crp?: number;              // C-Reactive Protein
  lactate?: number;          // mmol/L
}

/**
 * Suggested diagnosis with confidence and reasoning
 */
export interface DiagnosisSuggestion {
  condition: string;
  confidence: number;        // 0-1 scale
  reasoning: string;
}

/**
 * AI Engine structured response format
 */
export interface AIResponse {
  riskTier: TriageLevel;
  dangerSigns: string[];
  uncertainty: UncertaintyLevel;
  recommendedNextSteps: string[];
  watchOuts: string[];
  referralRecommended: boolean;
  disclaimer: string;
  reasoning: string;
  diagnosisSuggestions?: DiagnosisSuggestion[];
  followupQuestions?: string[];
  labResults?: LabResults;
}

/**
 * Patient encounter entity
 * Represents a single patient interaction session
 */
export interface Encounter {
  PK: string; // ENC#{encounterId}
  SK: string; // METADATA
  Type: 'Encounter';
  EncounterId: string;
  Channel: Channel;
  Timestamp: string; // ISO8601
  Status: 'created' | 'in_progress' | 'completed';
  Demographics: Demographics;
  Symptoms: string;
  Vitals?: VitalSigns;
  OfflineCreated: boolean;
  SyncedAt?: string; // ISO8601
  GSI1PK: string; // DATE#{YYYY-MM-DD}
  GSI1SK: string; // CHANNEL#{channel}#TIME#{timestamp}
  TTL: number; // Unix timestamp
}

/**
 * Follow-up question and response entity
 */
export interface Followup {
  PK: string; // ENC#{encounterId}
  SK: string; // FOLLOWUP#{sequence}
  Type: 'Followup';
  Question: string;
  Response: string;
  Timestamp: string; // ISO8601
  TTL?: number; // Unix timestamp
}

/**
 * Triage assessment result entity
 */
export interface TriageResult {
  PK: string; // ENC#{encounterId}
  SK: string; // TRIAGE
  Type: 'TriageResult';
  RiskTier: TriageLevel;
  DangerSigns: string[];
  Uncertainty: UncertaintyLevel;
  RecommendedNextSteps: string[];
  WatchOuts: string[];
  ReferralRecommended: boolean;
  Disclaimer: string;
  Reasoning: string;
  FollowupQuestions?: string[]; // Agentic Step 2
  SoapNote?: string;
  PatientExplanation?: string;
  AcousticSummary?: string;
  AiLatencyMs: number;
  UsedFallback: boolean;
  Timestamp: string; // ISO8601
  TTL?: number; // Unix timestamp
}

/**
 * Referral summary document entity
 */
export interface Referral {
  PK: string; // ENC#{encounterId}
  SK: string; // REFERRAL
  Type: 'Referral';
  ReferralId: string;
  Format: 'pdf' | 'sms' | 'fhir';
  DocumentUrl?: string; // S3 URL for PDF format
  Destination: string;
  SentAt: string; // ISO8601
  OfflineCreated?: boolean;
  TTL?: number; // Unix timestamp
}

/**
 * AI decision tracking entity
 */
export interface Decision {
  PK: string; // ENC#{encounterId}
  SK: string; // DECISION
  Type: 'Decision';
  AiModel: string;
  PromptTokens: number;
  CompletionTokens: number;
  RawResponse: string;
  ProcessingTimeMs: number;
  Timestamp: string; // ISO8601
  TTL?: number; // Unix timestamp
}

/**
 * Daily aggregate statistics entity
 */
export interface DailyRollup {
  PK: string; // ROLLUP#{YYYY-MM-DD}
  SK: string; // STATS
  Type: 'DailyRollup';
  Date: string; // YYYY-MM-DD
  TotalEncounters: number;
  ChannelCounts: {
    app: number;
    voice: number;
    ussd: number;
    sms: number;
  };
  TriageCounts: {
    red: number;
    yellow: number;
    green: number;
  };
  SymptomCounts: Record<string, number>;
  DangerSignCounts: Record<string, number>;
  ReferralCount: number;
  TotalAiLatencyMs: number;
  AiCallCount: number;
  LastUpdated: string; // ISO8601
  TTL?: number; // Unix timestamp
}

/**
 * Error log entry for client-side error tracking
 */
export interface ErrorLog {
  id: string;
  timestamp: string; // ISO8601
  errorType: string;
  errorMessage: string;
  errorStack?: string;
  context?: Record<string, any>;
  deviceInfo?: {
    platform?: string;
    version?: string;
    userAgent?: string;
  };
  encounterId?: string;
  uploaded: boolean;
}
