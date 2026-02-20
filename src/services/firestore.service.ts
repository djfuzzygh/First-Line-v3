/**
 * Firestore Service
 * Provides a wrapper around Google Cloud Firestore client.
 * Maps Single-Table Design patterns (PK/SK) to Firestore documents.
 */

import { Firestore, Transaction } from '@google-cloud/firestore';

/**
 * Configuration for Firestore service
 */
export interface FirestoreServiceConfig {
    projectId?: string;
    databaseId?: string;
    collectionName?: string;
}

/**
 * Firestore service class
 */
export class FirestoreService {
    private db: Firestore;
    private collectionName: string;
    private useInMemory: boolean;
    private static inMemoryStore = new Map<string, Record<string, any>>();

    constructor(config: FirestoreServiceConfig = {}) {
        this.db = new Firestore({
            projectId: config.projectId || process.env.GCP_PROJECT_ID,
            databaseId: config.databaseId || '(default)',
        });
        this.collectionName = config.collectionName || process.env.FIRESTORE_COLLECTION || 'FirstLineData';
        this.useInMemory = process.env.NODE_ENV === 'test' || process.env.FIRESTORE_IN_MEMORY === 'true';
    }

    /**
     * Key generation helpers (Maintained for compatibility with DynamoDB logic)
     */
    public generateEncounterPK(encounterId: string): string {
        return `ENC#${encounterId}`;
    }

    public generateEncounterMetadataSK(): string {
        return 'METADATA';
    }

    public generateFollowupSK(sequence: number): string {
        return `FOLLOWUP#${sequence}`;
    }

    public generateTriageSK(): string {
        return 'TRIAGE';
    }

    public generateReferralSK(): string {
        return 'REFERRAL';
    }

    public generateDecisionSK(): string {
        return 'DECISION';
    }

    public generateRollupPK(date: string): string {
        return `ROLLUP#${date}`;
    }

    public generateRollupStatsSK(): string {
        return 'STATS';
    }

    public generateGSI1PK(date: string): string {
        return `DATE#${date}`;
    }

    public generateGSI1SK(channel: string, timestamp: string): string {
        return `CHANNEL#${channel}#TIME#${timestamp}`;
    }

    /**
     * Firestore doesn't have native TTL, 
     * but we maintain the field for alignment.
     */
    public calculateTTL(fromDate?: Date): number {
        const date = fromDate ?? new Date();
        const ttlDate = new Date(date);
        ttlDate.setDate(ttlDate.getDate() + 90);
        return Math.floor(ttlDate.getTime() / 1000);
    }

    private getDocId(pk: string, sk: string): string {
        return `${pk}__${sk}`.replace(/\//g, '_');
    }

    private static stripUndefined<T>(value: T): T {
        if (Array.isArray(value)) {
            return value.map((v) => FirestoreService.stripUndefined(v)) as T;
        }
        if (value && typeof value === 'object') {
            const out: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
                if (v !== undefined) {
                    out[k] = FirestoreService.stripUndefined(v);
                }
            }
            return out as T;
        }
        return value;
    }

    public async put(item: Record<string, any>): Promise<void> {
        const docId = this.getDocId(item.PK, item.SK);
        const payload = FirestoreService.stripUndefined({
            ...item,
            updatedAt: new Date().toISOString()
        });

        if (this.useInMemory) {
            FirestoreService.inMemoryStore.set(docId, payload);
            return;
        }

        await this.db.collection(this.collectionName).doc(docId).set(payload);
    }

    public async get(pk: string, sk: string): Promise<Record<string, any> | null> {
        const docId = this.getDocId(pk, sk);

        if (this.useInMemory) {
            return FirestoreService.inMemoryStore.get(docId) || null;
        }

        const doc = await this.db.collection(this.collectionName).doc(docId).get();

        if (!doc.exists) {
            return null;
        }

        return doc.data() as Record<string, any>;
    }

    public async query(pk: string, skPrefix?: string): Promise<Record<string, any>[]> {
        if (this.useInMemory) {
            return Array.from(FirestoreService.inMemoryStore.values()).filter((item) => {
                if (item.PK !== pk) return false;
                if (!skPrefix) return true;
                return typeof item.SK === 'string' && item.SK.startsWith(skPrefix);
            });
        }

        let query = this.db.collection(this.collectionName).where('PK', '==', pk);

        if (skPrefix) {
            query = query
                .where('SK', '>=', skPrefix)
                .where('SK', '<', skPrefix + '\uf8ff');
        }

        const snapshot = await query.get();
        return snapshot.docs.map(doc => doc.data() as Record<string, any>);
    }

    public async queryGSI1(gsi1pk: string, gsi1skPrefix?: string): Promise<Record<string, any>[]> {
        if (this.useInMemory) {
            return Array.from(FirestoreService.inMemoryStore.values()).filter((item) => {
                if (item.GSI1PK !== gsi1pk) return false;
                if (!gsi1skPrefix) return true;
                return typeof item.GSI1SK === 'string' && item.GSI1SK.startsWith(gsi1skPrefix);
            });
        }

        let query = this.db.collection(this.collectionName).where('GSI1PK', '==', gsi1pk);

        if (gsi1skPrefix) {
            query = query
                .where('GSI1SK', '>=', gsi1skPrefix)
                .where('GSI1SK', '<', gsi1skPrefix + '\uf8ff');
        }

        const snapshot = await query.get();
        return snapshot.docs.map(doc => doc.data() as Record<string, any>);
    }

    public async update(pk: string, sk: string, updates: Record<string, any>): Promise<void> {
        const docId = this.getDocId(pk, sk);
        const payload = FirestoreService.stripUndefined({
            ...updates,
            updatedAt: new Date().toISOString()
        });

        if (this.useInMemory) {
            const current = FirestoreService.inMemoryStore.get(docId) || { PK: pk, SK: sk };
            FirestoreService.inMemoryStore.set(docId, { ...current, ...payload });
            return;
        }

        await this.db.collection(this.collectionName).doc(docId).update(payload);
    }

    public async createEncounter(data: any): Promise<string> {
        const timestamp = new Date().toISOString();
        const date = timestamp.split('T')[0];

        const encounter = {
            PK: this.generateEncounterPK(data.encounterId),
            SK: this.generateEncounterMetadataSK(),
            Type: 'Encounter',
            EncounterId: data.encounterId,
            Channel: data.channel,
            Timestamp: timestamp,
            Status: 'created',
            Demographics: data.demographics,
            Symptoms: data.symptoms,
            Vitals: data.vitals,
            OfflineCreated: data.offlineCreated ?? false,
            GSI1PK: this.generateGSI1PK(date),
            GSI1SK: this.generateGSI1SK(data.channel, timestamp),
            TTL: this.calculateTTL(),
        };

        await this.put(encounter);
        return data.encounterId;
    }

    public async getEncounter(encounterId: string): Promise<any> {
        const pk = this.generateEncounterPK(encounterId);
        const items = await this.query(pk);

        let encounter: Record<string, any> | null = null;
        const followups: Record<string, any>[] = [];
        let triage: Record<string, any> | null = null;

        for (const item of items) {
            if (item.SK === 'METADATA') encounter = item;
            else if (item.SK.startsWith('FOLLOWUP#')) followups.push(item);
            else if (item.SK === 'TRIAGE') triage = item;
        }

        return { encounter, followups, triage };
    }

    public async updateEncounter(encounterId: string, updates: Record<string, any>): Promise<void> {
        await this.update(this.generateEncounterPK(encounterId), this.generateEncounterMetadataSK(), updates);
    }

    public async runTransaction<T>(updateFn: (transaction: Transaction) => Promise<T>): Promise<T> {
        return await this.db.runTransaction(updateFn);
    }

    public getDocRef(pk: string, sk: string) {
        return this.db.collection(this.collectionName).doc(this.getDocId(pk, sk));
    }
}
