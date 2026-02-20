/**
 * Referral Service
 * Generates clinical handoff documents in PDF and SMS formats
 * Handles S3 upload and DynamoDB persistence
 */

import { GCSStorageService } from './gcs-storage.service';
import { v4 as uuidv4 } from 'uuid';
import PDFDocument from 'pdfkit';
import { FirestoreService } from './firestore.service';
import { VitalSigns } from '../models';
import { FHIRService } from './fhir.service';

/**
 * Configuration for Referral Service
 */
export interface ReferralServiceConfig {
  firestoreService: FirestoreService;
  gcsStorageService: GCSStorageService;
  signedUrlExpirationSeconds?: number;
}

/**
 * Referral generation options
 */
export interface ReferralOptions {
  encounterId: string;
  format: 'pdf' | 'sms' | 'fhir';
  destination: string; // Phone number for SMS, or facility identifier
}

/**
 * Referral Service class
 */
export class ReferralService {
  private firestoreService: FirestoreService;
  private gcsStorageService: GCSStorageService;
  private fhirService: FHIRService;
  private signedUrlExpirationSeconds: number;

  constructor(config: ReferralServiceConfig) {
    this.firestoreService = config.firestoreService;
    this.gcsStorageService = config.gcsStorageService;
    this.signedUrlExpirationSeconds = config.signedUrlExpirationSeconds ?? 3600; // 1 hour default
    this.fhirService = new FHIRService();
  }

  /**
   * Generate a referral summary
   * @param options Referral generation options
   * @returns Referral ID and document URL (for PDF) or SMS sent confirmation
   */
  public async generateReferral(options: ReferralOptions): Promise<{
    referralId: string;
    documentUrl?: string;
    smsSent: boolean;
  }> {
    const referralId = uuidv4();

    // Load encounter data
    const encounterData = await this.firestoreService.getEncounter(options.encounterId);

    if (!encounterData.encounter) {
      throw new Error(`Encounter ${options.encounterId} not found`);
    }

    // Compile clinical note content
    const clinicalNote = this.compileClinicalNote(
      encounterData.encounter,
      encounterData.followups,
      encounterData.triage
    );

    let documentUrl: string | undefined;
    let content: string;

    if (options.format === 'pdf') {
      // Generate PDF and upload to GCS
      const pdfBuffer = await this.generatePDF(clinicalNote);
      documentUrl = await this.uploadToGCS(referralId, pdfBuffer);
      content = clinicalNote;
    } else if (options.format === 'fhir') {
      // Generate HL7 FHIR Bundle
      const bundle = this.fhirService.generateFHIRBundle(
        encounterData.encounter as any,
        encounterData.triage as any
      );
      content = JSON.stringify(bundle, null, 2);
    } else {
      // Format SMS version (truncated)
      content = this.formatSMSReferral(
        encounterData.encounter,
        encounterData.triage
      );
    }

    // Store referral entity in DynamoDB
    await this.storeReferral({
      encounterId: options.encounterId,
      referralId,
      format: options.format as any,
      documentUrl,
      destination: options.destination,
      content,
    });

    return {
      referralId,
      documentUrl,
      smsSent: options.format === 'sms',
    };
  }

  /**
   * Compile encounter data into structured clinical note format
   */
  private compileClinicalNote(
    encounter: any,
    followups: any[],
    triage: any | null
  ): string {
    const lines: string[] = [];

    // Header
    lines.push('CLINICAL REFERRAL SUMMARY');
    lines.push('FirstLine Healthcare Triage Platform');
    lines.push('');
    lines.push(`Encounter ID: ${encounter.EncounterId}`);
    lines.push(`Date: ${new Date(encounter.Timestamp).toLocaleString()}`);
    lines.push(`Channel: ${encounter.Channel.toUpperCase()}`);
    lines.push('');

    // Patient Demographics
    lines.push('PATIENT DEMOGRAPHICS');
    lines.push(`Age: ${encounter.Demographics.age} years`);
    lines.push(`Sex: ${encounter.Demographics.sex}`);
    lines.push(`Location: ${encounter.Demographics.location}`);
    lines.push('');

    // Vital Signs (if available)
    if (encounter.Vitals && Object.keys(encounter.Vitals).length > 0) {
      lines.push('VITAL SIGNS');
      const vitals = encounter.Vitals as VitalSigns;
      if (vitals.temperature !== undefined) {
        lines.push(`Temperature: ${vitals.temperature}°C`);
      }
      if (vitals.pulse !== undefined) {
        lines.push(`Pulse: ${vitals.pulse} bpm`);
      }
      if (vitals.bloodPressure !== undefined) {
        lines.push(`Blood Pressure: ${vitals.bloodPressure}`);
      }
      if (vitals.respiratoryRate !== undefined) {
        lines.push(`Respiratory Rate: ${vitals.respiratoryRate} breaths/min`);
      }
      lines.push('');
    }

    // Chief Complaint
    lines.push('CHIEF COMPLAINT');
    lines.push(encounter.Symptoms);
    lines.push('');

    // Follow-up Questions and Responses
    if (followups.length > 0) {
      lines.push('CLINICAL HISTORY');
      followups.forEach((followup, index) => {
        lines.push(`Q${index + 1}: ${followup.Question}`);
        lines.push(`A${index + 1}: ${followup.Response}`);
        lines.push('');
      });
    }

    // Triage Assessment
    if (triage) {
      lines.push('TRIAGE ASSESSMENT');
      lines.push(`Risk Level: ${triage.RiskTier}`);
      lines.push(`Uncertainty: ${triage.Uncertainty}`);
      lines.push('');

      if (triage.DangerSigns && triage.DangerSigns.length > 0) {
        lines.push('DANGER SIGNS DETECTED:');
        triage.DangerSigns.forEach((sign: string) => {
          lines.push(`- ${sign}`);
        });
        lines.push('');
      }

      lines.push('RECOMMENDED NEXT STEPS:');
      triage.RecommendedNextSteps.forEach((step: string) => {
        lines.push(`- ${step}`);
      });
      lines.push('');

      if (triage.WatchOuts && triage.WatchOuts.length > 0) {
        lines.push('WARNING SIGNS TO WATCH FOR:');
        triage.WatchOuts.forEach((warning: string) => {
          lines.push(`- ${warning}`);
        });
        lines.push('');
      }

      if (triage.Reasoning) {
        lines.push('CLINICAL REASONING:');
        lines.push(triage.Reasoning);
        lines.push('');
      }

      lines.push('DISCLAIMER:');
      lines.push(triage.Disclaimer);
    }

    return lines.join('\n');
  }

  /**
   * Generate PDF document from clinical note
   */
  private async generatePDF(clinicalNote: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: {
            top: 50,
            bottom: 50,
            left: 50,
            right: 50,
          },
        });

        const chunks: Buffer[] = [];

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Add content to PDF
        const lines = clinicalNote.split('\n');

        lines.forEach((line) => {
          if (line === '') {
            doc.moveDown(0.5);
          } else if (this.isHeaderLine(line)) {
            doc.fontSize(14).font('Helvetica-Bold').text(line);
            doc.moveDown(0.3);
          } else if (line.startsWith('- ')) {
            doc.fontSize(10).font('Helvetica').text(line, { indent: 20 });
          } else {
            doc.fontSize(10).font('Helvetica').text(line);
          }
        });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Check if a line is a header (all caps or specific patterns)
   */
  private isHeaderLine(line: string): boolean {
    const headerPatterns = [
      'CLINICAL REFERRAL SUMMARY',
      'PATIENT DEMOGRAPHICS',
      'VITAL SIGNS',
      'CHIEF COMPLAINT',
      'CLINICAL HISTORY',
      'TRIAGE ASSESSMENT',
      'DANGER SIGNS DETECTED:',
      'RECOMMENDED NEXT STEPS:',
      'WARNING SIGNS TO WATCH FOR:',
      'CLINICAL REASONING:',
      'DISCLAIMER:',
    ];

    return headerPatterns.includes(line);
  }

  /**
   * Upload PDF to GCS and return signed URL
   */
  private async uploadToGCS(referralId: string, pdfBuffer: Buffer): Promise<string> {
    const fileName = `referrals/${referralId}.pdf`;

    // Upload to GCS
    await this.gcsStorageService.uploadFile(fileName, pdfBuffer, 'application/pdf');

    // Get signed URL
    return await this.gcsStorageService.getSignedUrl(fileName, this.signedUrlExpirationSeconds / 60);
  }

  /**
   * Format SMS version of referral (truncated, key info only)
   */
  private formatSMSReferral(encounter: any, triage: any | null): string {
    const parts: string[] = [];

    // Header
    parts.push(`FirstLine Referral #${encounter.EncounterId.substring(0, 8)}`);

    // Patient info
    parts.push(
      `Patient: ${encounter.Demographics.age}yo ${encounter.Demographics.sex}, ${encounter.Demographics.location}`
    );

    // Chief complaint (truncated)
    const symptoms = encounter.Symptoms.substring(0, 100);
    parts.push(`Symptoms: ${symptoms}${encounter.Symptoms.length > 100 ? '...' : ''}`);

    // Triage result
    if (triage) {
      parts.push(`Triage: ${triage.RiskTier}`);

      // Danger signs (if any)
      if (triage.DangerSigns && triage.DangerSigns.length > 0) {
        parts.push(`DANGER SIGNS: ${triage.DangerSigns.join(', ')}`);
      }

      // First recommended step only
      if (triage.RecommendedNextSteps && triage.RecommendedNextSteps.length > 0) {
        parts.push(`Action: ${triage.RecommendedNextSteps[0]}`);
      }
    }

    // Join with line breaks, ensuring SMS length constraints
    let message = parts.join('\n');

    // SMS standard limit is 160 characters per message, but we'll allow up to 480 (3 messages)
    if (message.length > 480) {
      message = message.substring(0, 477) + '...';
    }

    return message;
  }

  /**
   * Store referral entity in DynamoDB
   */
  private async storeReferral(data: {
    encounterId: string;
    referralId: string;
    format: 'pdf' | 'sms';
    documentUrl?: string;
    destination: string;
    content: string;
  }): Promise<void> {
    const pk = this.firestoreService.generateEncounterPK(data.encounterId);
    const sk = this.firestoreService.generateReferralSK();

    const referral = {
      PK: pk,
      SK: sk,
      Type: 'Referral',
      ReferralId: data.referralId,
      Format: data.format,
      DocumentUrl: data.documentUrl,
      Destination: data.destination,
      SentAt: new Date().toISOString(),
      Content: data.content,
      TTL: this.firestoreService.calculateTTL(),
    };

    await this.firestoreService.put(referral);
  }
}
