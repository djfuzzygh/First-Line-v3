/**
 * RollupService
 * 
 * Manages daily aggregate statistics for dashboard display.
 * Implements atomic updates to DailyRollup entities when encounters complete.
 * 
 * Requirements: 12.8, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7
 */

import { Channel, TriageLevel, DailyRollup } from '../models';
import { FirestoreService } from './firestore.service';

/**
 * Configuration for RollupService
 */
export interface RollupServiceConfig {
  firestoreService: FirestoreService;
}

/**
 * Data for updating rollup statistics
 */
export interface RollupUpdateData {
  date: string; // YYYY-MM-DD
  channel: Channel;
  triageLevel: TriageLevel;
  symptoms: string; // Symptom text for categorization
  dangerSigns?: string[];
  hasReferral: boolean;
  aiLatencyMs: number;
}

/**
 * Dashboard statistics response
 */
export interface DashboardStats {
  date: string;
  totalEncounters: number;
  channelDistribution: {
    app: number;
    voice: number;
    ussd: number;
    sms: number;
  };
  triageBreakdown: {
    red: number;
    yellow: number;
    green: number;
  };
  topSymptoms: Array<{ symptom: string; count: number }>;
  dangerSignFrequency: Record<string, number>;
  referralRate: number;
  avgAiLatency: number;
}

/**
 * RollupService class
 * Provides atomic updates to daily rollup statistics
 */
export class RollupService {
  private firestoreService: FirestoreService;

  /**
   * Create a new RollupService instance
   * 
   * @param config - Service configuration
   */
  constructor(config: RollupServiceConfig) {
    this.firestoreService = config.firestoreService;
  }

  /**
   * Extract symptom category from symptom text
   * Simple categorization based on keywords
   * 
   * @param symptoms - Symptom description text
   * @returns Symptom category
   */
  private extractSymptomCategory(symptoms: string): string {
    const lowerSymptoms = symptoms.toLowerCase();

    // Respiratory
    if (
      lowerSymptoms.includes('cough') ||
      lowerSymptoms.includes('breathing') ||
      lowerSymptoms.includes('breath') ||
      lowerSymptoms.includes('chest') ||
      lowerSymptoms.includes('respiratory')
    ) {
      return 'respiratory';
    }

    // Gastrointestinal
    if (
      lowerSymptoms.includes('stomach') ||
      lowerSymptoms.includes('abdominal') ||
      lowerSymptoms.includes('vomit') ||
      lowerSymptoms.includes('diarrhea') ||
      lowerSymptoms.includes('nausea')
    ) {
      return 'gastrointestinal';
    }

    // Neurological
    if (
      lowerSymptoms.includes('headache') ||
      lowerSymptoms.includes('dizzy') ||
      lowerSymptoms.includes('confusion') ||
      lowerSymptoms.includes('seizure') ||
      lowerSymptoms.includes('unconscious')
    ) {
      return 'neurological';
    }

    // Cardiovascular
    if (
      lowerSymptoms.includes('heart') ||
      lowerSymptoms.includes('chest pain') ||
      lowerSymptoms.includes('palpitation')
    ) {
      return 'cardiovascular';
    }

    // Fever
    if (
      lowerSymptoms.includes('fever') ||
      lowerSymptoms.includes('temperature') ||
      lowerSymptoms.includes('hot')
    ) {
      return 'fever';
    }

    // Pain
    if (
      lowerSymptoms.includes('pain') ||
      lowerSymptoms.includes('ache') ||
      lowerSymptoms.includes('hurt')
    ) {
      return 'pain';
    }

    // Default
    return 'other';
  }

  /**
   * Update daily rollup statistics atomically using Firestore transactions
   * Requirements: 12.8
   * 
   * @param data - Rollup update data
   */
  async updateRollup(data: RollupUpdateData): Promise<void> {
    const pk = this.firestoreService.generateRollupPK(data.date);
    const sk = this.firestoreService.generateRollupStatsSK();
    const symptomCategory = this.extractSymptomCategory(data.symptoms);

    // Fast path for local in-memory mode (used by Kaggle/demo smoke tests).
    if (process.env.FIRESTORE_IN_MEMORY === 'true' || process.env.NODE_ENV === 'test') {
      const existing = await this.firestoreService.get(pk, sk);
      const rollupData = this.applyRollupUpdate(existing || {
        PK: pk,
        SK: sk,
        Type: 'DailyRollup',
        Date: data.date,
        TotalEncounters: 0,
        ChannelCounts: { app: 0, voice: 0, ussd: 0, sms: 0 },
        TriageCounts: { red: 0, yellow: 0, green: 0 },
        SymptomCounts: {},
        DangerSignCounts: {},
        ReferralCount: 0,
        TotalAiLatencyMs: 0,
        AiCallCount: 0,
        TTL: this.firestoreService.calculateTTL(),
      }, data, symptomCategory);
      await this.firestoreService.put({ PK: pk, SK: sk, ...rollupData });
      return;
    }

    await this.firestoreService.runTransaction(async (transaction) => {
      const rollupRef = this.firestoreService.getDocRef(pk, sk);
      const rollupDoc = await transaction.get(rollupRef);

      let rollupData: any = {};
      if (rollupDoc.exists) {
        rollupData = rollupDoc.data();
      } else {
        // Initialize new rollup
        rollupData = {
          Type: 'DailyRollup',
          Date: data.date,
          TotalEncounters: 0,
          ChannelCounts: { app: 0, voice: 0, ussd: 0, sms: 0 },
          TriageCounts: { red: 0, yellow: 0, green: 0 },
          SymptomCounts: {},
          DangerSignCounts: {},
          ReferralCount: 0,
          TotalAiLatencyMs: 0,
          AiCallCount: 0,
          TTL: this.firestoreService.calculateTTL(),
        };
      }

      rollupData = this.applyRollupUpdate(rollupData, data, symptomCategory);

      transaction.set(rollupRef, rollupData);
    });
  }

  private applyRollupUpdate(rollupData: any, data: RollupUpdateData, symptomCategory: string): any {
    rollupData.TotalEncounters = (rollupData.TotalEncounters || 0) + 1;

    const channel = data.channel.toLowerCase();
    rollupData.ChannelCounts = rollupData.ChannelCounts || {};
    rollupData.ChannelCounts[channel] = (rollupData.ChannelCounts[channel] || 0) + 1;

    const triageLevel = data.triageLevel.toLowerCase();
    rollupData.TriageCounts = rollupData.TriageCounts || {};
    rollupData.TriageCounts[triageLevel] = (rollupData.TriageCounts[triageLevel] || 0) + 1;

    rollupData.SymptomCounts = rollupData.SymptomCounts || {};
    rollupData.SymptomCounts[symptomCategory] = (rollupData.SymptomCounts[symptomCategory] || 0) + 1;

    if (data.dangerSigns && data.dangerSigns.length > 0) {
      rollupData.DangerSignCounts = rollupData.DangerSignCounts || {};
      data.dangerSigns.forEach(sign => {
        rollupData.DangerSignCounts[sign] = (rollupData.DangerSignCounts[sign] || 0) + 1;
      });
    }

    if (data.hasReferral) {
      rollupData.ReferralCount = (rollupData.ReferralCount || 0) + 1;
    }

    rollupData.TotalAiLatencyMs = (rollupData.TotalAiLatencyMs || 0) + data.aiLatencyMs;
    rollupData.AiCallCount = (rollupData.AiCallCount || 0) + 1;
    rollupData.LastUpdated = new Date().toISOString();

    return rollupData;
  }

  /**
   * Get dashboard statistics for a specific date
   * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7
   * 
   * @param date - Date in YYYY-MM-DD format
   * @returns Dashboard statistics
   */
  async getDashboardStats(date: string): Promise<DashboardStats> {
    const pk = this.firestoreService.generateRollupPK(date);
    const sk = this.firestoreService.generateRollupStatsSK();

    // Get rollup data from Firestore
    const rollup = await this.firestoreService.get(pk, sk);

    // If no data exists for this date, return empty stats
    if (!rollup) {
      return {
        date,
        totalEncounters: 0,
        channelDistribution: {
          app: 0,
          voice: 0,
          ussd: 0,
          sms: 0,
        },
        triageBreakdown: {
          red: 0,
          yellow: 0,
          green: 0,
        },
        topSymptoms: [],
        dangerSignFrequency: {},
        referralRate: 0,
        avgAiLatency: 0,
      };
    }

    // Cast to DailyRollup type
    const dailyRollup = rollup as DailyRollup;

    // Calculate derived metrics
    const totalEncounters = dailyRollup.TotalEncounters || 0;
    const referralCount = dailyRollup.ReferralCount || 0;
    const totalAiLatencyMs = dailyRollup.TotalAiLatencyMs || 0;
    const aiCallCount = dailyRollup.AiCallCount || 0;

    // Calculate referral rate (percentage)
    const referralRate =
      totalEncounters > 0 ? (referralCount / totalEncounters) * 100 : 0;

    // Calculate average AI latency
    const avgAiLatency =
      aiCallCount > 0 ? totalAiLatencyMs / aiCallCount : 0;

    // Sort symptoms by count and get top 5
    const symptomCounts = dailyRollup.SymptomCounts || {};
    const topSymptoms = Object.entries(symptomCounts)
      .map(([symptom, count]) => ({ symptom, count: count as number }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Return formatted dashboard stats
    return {
      date: dailyRollup.Date,
      totalEncounters,
      channelDistribution: {
        app: dailyRollup.ChannelCounts?.app || 0,
        voice: dailyRollup.ChannelCounts?.voice || 0,
        ussd: dailyRollup.ChannelCounts?.ussd || 0,
        sms: dailyRollup.ChannelCounts?.sms || 0,
      },
      triageBreakdown: {
        red: dailyRollup.TriageCounts?.red || 0,
        yellow: dailyRollup.TriageCounts?.yellow || 0,
        green: dailyRollup.TriageCounts?.green || 0,
      },
      topSymptoms,
      dangerSignFrequency: dailyRollup.DangerSignCounts || {},
      referralRate: Math.round(referralRate * 100) / 100, // Round to 2 decimal places
      avgAiLatency: Math.round(avgAiLatency), // Round to nearest ms
    };
  }

  /**
   * Get today's date in YYYY-MM-DD format
   * 
   * @returns Today's date string
   */
  static getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }
}
