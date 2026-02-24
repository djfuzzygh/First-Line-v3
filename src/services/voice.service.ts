/**
 * Voice Service
 * Handles voice-specific formatting, SMS integration, and call management
 */

export interface VoiceConfig {
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilio

PhoneNumber?: string;
  africasTalkingApiKey?: string;
  africasTalkingUsername?: string;
  africasTalkingPhoneNumber?: string;
}

export class VoiceService {
  private config: VoiceConfig;

  constructor(config: VoiceConfig = {}) {
    this.config = {
      twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
      twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
      twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER,
      africasTalkingApiKey: process.env.AFRICAS_TALKING_API_KEY,
      africasTalkingUsername: process.env.AFRICAS_TALKING_USERNAME,
      africasTalkingPhoneNumber: process.env.AFRICAS_TALKING_PHONE_NUMBER,
      ...config,
    };
  }

  /**
   * Convert risk tier to voice-friendly explanation
   */
  formatRiskTierForVoice(riskTier: string): string {
    const tiers: { [key: string]: string } = {
      RED: 'Red - Emergency. Seek immediate medical attention.',
      ORANGE: 'Orange - High priority. See a clinician within 2 hours.',
      YELLOW: 'Yellow - Moderate. Schedule clinic appointment within 24 hours.',
      GREEN: 'Green - Low risk. Monitor at home, follow care instructions.',
    };
    return tiers[riskTier] || `${riskTier} risk level.`;
  }

  /**
   * Convert array of recommendations to voice-friendly format
   */
  formatRecommendationsForVoice(recommendations: string[]): string {
    if (!recommendations || recommendations.length === 0) {
      return 'Follow the advice of your healthcare provider.';
    }

    // Take first 2 recommendations, simplify them
    return recommendations
      .slice(0, 2)
      .map((rec) => this.simplifyRecommendation(rec))
      .join('. ');
  }

  /**
   * Simplify medical text for voice readability
   */
  private simplifyRecommendation(text: string): string {
    // Remove parentheses and complex medical jargon
    let simplified = text
      .replace(/\([^)]*\)/g, '') // Remove parentheses
      .replace(/[,;]/g, '.') // Convert to period
      .substring(0, 150); // Limit to 150 chars

    // Split on periods and return first sentence
    const sentences = simplified.split('.');
    return sentences[0].trim();
  }

  /**
   * Send SMS via Twilio or Africa's Talking
   */
  async sendSMS(phoneNumber: string, message: string): Promise<boolean> {
    try {
      // Try Africa's Talking first (better for Africa/Global South)
      if (this.config.africasTalkingApiKey && this.config.africasTalkingUsername) {
        return await this.sendSMSViaAfricasTalking(phoneNumber, message);
      }

      // Fall back to Twilio
      if (this.config.twilioAccountSid && this.config.twilioAuthToken) {
        return await this.sendSMSViaTwilio(phoneNumber, message);
      }

      // Mock mode (development)
      console.log(`[MOCK SMS] To: ${phoneNumber}, Message: ${message}`);
      return true;
    } catch (error) {
      console.error('SMS sending failed:', error);
      return false;
    }
  }

  /**
   * Send SMS via Africa's Talking API
   */
  private async sendSMSViaAfricasTalking(phoneNumber: string, message: string): Promise<boolean> {
    try {
      // Format phone number if needed
      const formattedPhone = this.formatPhoneNumberForAT(phoneNumber);

      // This is a stub - actual implementation would call Africa's Talking API
      // import axios from 'axios';
      const response = await fetch('https://api.sandbox.africastalking.com/version1/messaging', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'apiKey': this.config.africasTalkingApiKey || '',
        },
        body: new URLSearchParams({
          username: this.config.africasTalkingUsername || '',
          recipients: formattedPhone,
          message: message,
        }).toString(),
      });

      const result = await response.json();
      console.log('Africa\'s Talking SMS response:', result);
      return response.ok;
    } catch (error) {
      console.error('Africa\'s Talking API error:', error);
      throw error;
    }
  }

  /**
   * Send SMS via Twilio API
   */
  private async sendSMSViaTwilio(phoneNumber: string, message: string): Promise<boolean> {
    try {
      // Stub - actual implementation would call Twilio API
      // const twilio = require('twilio');
      // const client = twilio(this.config.twilioAccountSid, this.config.twilioAuthToken);
      // const result = await client.messages.create({
      //   from: this.config.twilioPhoneNumber,
      //   to: phoneNumber,
      //   body: message,
      // });
      // return !!result.sid;

      console.log(`[Twilio Mock] SMS to ${phoneNumber}: ${message}`);
      return true;
    } catch (error) {
      console.error('Twilio API error:', error);
      throw error;
    }
  }

  /**
   * Format phone number for Africa's Talking (add country code)
   */
  private formatPhoneNumberForAT(phoneNumber: string): string {
    // Remove + and spaces
    let cleaned = phoneNumber.replace(/\D/g, '');

    // Add country code if missing (assume +256 for Uganda, adjust as needed)
    if (cleaned.length === 9) {
      cleaned = '256' + cleaned;
    }

    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }

    return cleaned;
  }

  /**
   * Generate call-back number for follow-up
   */
  getCallbackNumber(channel: 'twilio' | 'africas_talking' = 'africas_talking'): string {
    if (channel === 'africas_talking') {
      return this.config.africasTalkingPhoneNumber || '+256XXXXXXXXX';
    }
    return this.config.twilioPhoneNumber || '+1XXXXXXXXXX';
  }

  /**
   * Format SSML (Speech Synthesis Markup Language) for voice
   */
  formatSSML(text: string, options: { rate?: 'slow' | 'normal' | 'fast' } = {}): string {
    const rate = options.rate === 'slow' ? '0.8' : options.rate === 'fast' ? '1.3' : '1.0';
    return `<speak><prosody rate="${rate}">${this.escapeXML(text)}</prosody></speak>`;
  }

  /**
   * Escape XML special characters
   */
  private escapeXML(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Parse spoken input into structured format
   */
  parseSpokenInput(transcript: string): { symptoms: string[]; severity: string } {
    const symptoms: string[] = [];
    const lowerText = transcript.toLowerCase();

    // Simple keyword matching
    const symptomKeywords: { [key: string]: string } = {
      fever: ['fever', 'hot', 'temperature', 'warm'],
      cough: ['cough', 'coughing', 'coughed'],
      'chest pain': ['chest pain', 'chest', 'pain in chest'],
      'difficulty breathing': ['breathing', 'breath', 'shortness', 'breathless'],
      'abdominal pain': ['belly', 'stomach', 'abdominal', 'intestinal'],
      headache: ['headache', 'head pain', 'head'],
      vomiting: ['vomit', 'throw up', 'nausea'],
      diarrhea: ['diarrhea', 'loose stool', 'runs'],
    };

    for (const [symptom, keywords] of Object.entries(symptomKeywords)) {
      if (keywords.some((kw) => lowerText.includes(kw))) {
        symptoms.push(symptom);
      }
    }

    // Determine severity from keywords
    let severity = 'moderate';
    if (lowerText.includes('severe') || lowerText.includes('very') || lowerText.includes('bad')) {
      severity = 'severe';
    } else if (lowerText.includes('mild') || lowerText.includes('light')) {
      severity = 'mild';
    }

    return { symptoms, severity };
  }

  /**
   * Generate unique call identifier
   */
  generateCallId(): string {
    return `call_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Log call metrics for analytics
   */
  logCallMetrics(metrics: {
    callId: string;
    phoneNumber: string;
    duration: number;
    riskTier?: string;
    symptoms?: string[];
    smsDelivered?: boolean;
  }): void {
    console.log('[CALL METRICS]', {
      timestamp: new Date().toISOString(),
      ...metrics,
    });
    // In production, this would push to analytics service
  }
}
