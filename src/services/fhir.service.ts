/**
 * FHIRService
 * 
 * Standardizes clinical handoffs using the HL7 FHIR (Fast Healthcare Interoperability Resources)
 * standard. This ensures compatibility with modern EHR systems like Epic and Cerner.
 * 
 * Requirements: MedGemma Impact Challenge (EHR Integration Feature)
 */

import { Encounter, TriageResult } from '../models';

export class FHIRService {
    /**
     * Generates a FHIR Bundle containing Patient and ClinicalImpression resources
     */
    generateFHIRBundle(encounter: Encounter, triage: TriageResult): any {
        const timestamp = new Date().toISOString();

        return {
            resourceType: 'Bundle',
            type: 'collection',
            entry: [
                {
                    fullUrl: `urn:uuid:patient-${encounter.EncounterId}`,
                    resource: {
                        resourceType: 'Patient',
                        id: `patient-${encounter.EncounterId}`,
                        gender: this.mapGender(encounter.Demographics.sex),
                        birthDate: this.calculateApproximateBirthDate(encounter.Demographics.age),
                    }
                },
                {
                    fullUrl: `urn:uuid:impression-${encounter.EncounterId}`,
                    resource: {
                        resourceType: 'ClinicalImpression',
                        id: `impression-${encounter.EncounterId}`,
                        status: 'completed',
                        subject: { reference: `Patient/patient-${encounter.EncounterId}` },
                        date: timestamp,
                        summary: triage.Reasoning,
                        investigation: [
                            {
                                code: { text: 'Initial Triage Assessment' },
                                item: [
                                    { display: `Chief Complaint: ${encounter.Symptoms}` },
                                    { display: `Risk Tier: ${triage.RiskTier}` }
                                ]
                            }
                        ],
                        finding: triage.DangerSigns.map(sign => ({ itemCodeableConcept: { text: sign } })),
                        note: [
                            { text: triage.SoapNote || 'No SOAP note available' }
                        ]
                    }
                }
            ]
        };
    }

    private mapGender(sex: string): string {
        switch (sex) {
            case 'M': return 'male';
            case 'F': return 'female';
            default: return 'other';
        }
    }

    private calculateApproximateBirthDate(age: number): string {
        const year = new Date().getFullYear() - age;
        return `${year}-01-01`;
    }
}
