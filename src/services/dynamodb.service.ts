/**
 * DynamoDB Service
 * Provides a wrapper around AWS DynamoDB client with retry logic,
 * single-table design key generation, and TTL management
 */

import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  QueryCommand,
  UpdateItemCommand,
  PutItemCommandInput,
  GetItemCommandInput,
  QueryCommandInput,
  UpdateItemCommandInput,
  AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

/**
 * Configuration for DynamoDB service
 */
export interface DynamoDBServiceConfig {
  tableName: string;
  region?: string;
  maxRetries?: number;
  baseDelayMs?: number;
}

/**
 * DynamoDB service class implementing single-table design patterns
 */
export class DynamoDBService {
  private client: DynamoDBClient;
  private tableName: string;
  private maxRetries: number;
  private baseDelayMs: number;

  constructor(config: DynamoDBServiceConfig) {
    this.tableName = config.tableName;
    this.maxRetries = config.maxRetries ?? 3;
    this.baseDelayMs = config.baseDelayMs ?? 100;

    this.client = new DynamoDBClient({
      region: config.region ?? process.env.AWS_REGION ?? 'us-east-1',
    });
  }

  /**
   * Generate partition key for an encounter
   */
  public generateEncounterPK(encounterId: string): string {
    return `ENC#${encounterId}`;
  }

  /**
   * Generate sort key for encounter metadata
   */
  public generateEncounterMetadataSK(): string {
    return 'METADATA';
  }

  /**
   * Generate sort key for follow-up questions
   */
  public generateFollowupSK(sequence: number): string {
    return `FOLLOWUP#${sequence}`;
  }

  /**
   * Generate sort key for triage result
   */
  public generateTriageSK(): string {
    return 'TRIAGE';
  }

  /**
   * Generate sort key for referral
   */
  public generateReferralSK(): string {
    return 'REFERRAL';
  }

  /**
   * Generate sort key for decision
   */
  public generateDecisionSK(): string {
    return 'DECISION';
  }

  /**
   * Generate partition key for daily rollup
   */
  public generateRollupPK(date: string): string {
    return `ROLLUP#${date}`;
  }

  /**
   * Generate sort key for rollup stats
   */
  public generateRollupStatsSK(): string {
    return 'STATS';
  }

  /**
   * Generate GSI1 partition key for date-based queries
   */
  public generateGSI1PK(date: string): string {
    return `DATE#${date}`;
  }

  /**
   * Generate GSI1 sort key for channel and time-based queries
   */
  public generateGSI1SK(channel: string, timestamp: string): string {
    return `CHANNEL#${channel}#TIME#${timestamp}`;
  }

  /**
   * Calculate TTL timestamp (90 days from now)
   */
  public calculateTTL(fromDate?: Date): number {
    const date = fromDate ?? new Date();
    const ttlDate = new Date(date);
    ttlDate.setDate(ttlDate.getDate() + 90);
    return Math.floor(ttlDate.getTime() / 1000);
  }

  /**
   * Put an item into DynamoDB with retry logic
   */
  public async put(item: Record<string, any>): Promise<void> {
    const params: PutItemCommandInput = {
      TableName: this.tableName,
      Item: marshall(item, { removeUndefinedValues: true }),
    };

    await this.executeWithRetry(async () => {
      const command = new PutItemCommand(params);
      await this.client.send(command);
    });
  }

  /**
   * Get an item from DynamoDB with retry logic
   */
  public async get(
    pk: string,
    sk: string
  ): Promise<Record<string, any> | null> {
    const params: GetItemCommandInput = {
      TableName: this.tableName,
      Key: marshall({ PK: pk, SK: sk }),
    };

    const result = await this.executeWithRetry(async () => {
      const command = new GetItemCommand(params);
      return await this.client.send(command);
    });

    if (!result.Item) {
      return null;
    }

    return unmarshall(result.Item);
  }

  /**
   * Query items from DynamoDB with retry logic
   */
  public async query(
    pk: string,
    skPrefix?: string
  ): Promise<Record<string, any>[]> {
    const params: QueryCommandInput = {
      TableName: this.tableName,
      KeyConditionExpression: skPrefix
        ? 'PK = :pk AND begins_with(SK, :sk)'
        : 'PK = :pk',
      ExpressionAttributeValues: marshall(
        skPrefix ? { ':pk': pk, ':sk': skPrefix } : { ':pk': pk }
      ),
    };

    const result = await this.executeWithRetry(async () => {
      const command = new QueryCommand(params);
      return await this.client.send(command);
    });

    if (!result.Items || result.Items.length === 0) {
      return [];
    }

    return result.Items.map((item) => unmarshall(item));
  }

  /**
   * Query items from GSI1 index
   */
  public async queryGSI1(
    gsi1pk: string,
    gsi1skPrefix?: string
  ): Promise<Record<string, any>[]> {
    const params: QueryCommandInput = {
      TableName: this.tableName,
      IndexName: 'GSI1',
      KeyConditionExpression: gsi1skPrefix
        ? 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)'
        : 'GSI1PK = :pk',
      ExpressionAttributeValues: marshall(
        gsi1skPrefix ? { ':pk': gsi1pk, ':sk': gsi1skPrefix } : { ':pk': gsi1pk }
      ),
    };

    const result = await this.executeWithRetry(async () => {
      const command = new QueryCommand(params);
      return await this.client.send(command);
    });

    if (!result.Items || result.Items.length === 0) {
      return [];
    }

    return result.Items.map((item) => unmarshall(item));
  }

  /**
   * Update an item in DynamoDB with retry logic
   */
  public async update(
    pk: string,
    sk: string,
    updates: Record<string, any>
  ): Promise<void> {
    // Build update expression and attribute values
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, AttributeValue> = {};

    let index = 0;
    for (const [key, value] of Object.entries(updates)) {
      const nameKey = `#attr${index}`;
      const valueKey = `:val${index}`;
      updateExpressions.push(`${nameKey} = ${valueKey}`);
      expressionAttributeNames[nameKey] = key;
      expressionAttributeValues[valueKey] = marshall(value);
      index++;
    }

    const params: UpdateItemCommandInput = {
      TableName: this.tableName,
      Key: marshall({ PK: pk, SK: sk }),
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    };

    await this.executeWithRetry(async () => {
      const command = new UpdateItemCommand(params);
      await this.client.send(command);
    });
  }

  /**
   * Execute a DynamoDB operation with exponential backoff retry logic
   * Retries up to maxRetries times with exponentially increasing delays
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on the last attempt
        if (attempt === this.maxRetries - 1) {
          break;
        }

        // Calculate exponential backoff delay: baseDelay * 2^attempt
        const delayMs = this.baseDelayMs * Math.pow(2, attempt);

        // Add jitter to prevent thundering herd
        const jitter = Math.random() * delayMs * 0.1;
        const totalDelay = delayMs + jitter;

        // Wait before retrying
        await this.sleep(totalDelay);
      }
    }

    // If we get here, all retries failed
    throw new Error(
      `DynamoDB operation failed after ${this.maxRetries} attempts: ${lastError?.message}`
    );
  }

  /**
   * Sleep for the specified number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Create a new encounter
   * @param data Encounter creation data
   * @returns The created encounter ID
   */
  public async createEncounter(data: {
    encounterId: string;
    channel: string;
    demographics: {
      age: number;
      sex: 'M' | 'F' | 'O';
      location: string;
    };
    symptoms: string;
    vitals?: {
      temperature?: number;
      pulse?: number;
      bloodPressure?: string;
      respiratoryRate?: number;
    };
    offlineCreated?: boolean;
  }): Promise<string> {
    const timestamp = new Date().toISOString();
    const date = timestamp.split('T')[0]; // YYYY-MM-DD

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

    // Add SyncedAt if created offline
    if (data.offlineCreated) {
      Object.assign(encounter, { SyncedAt: timestamp });
    }

    await this.put(encounter);
    return data.encounterId;
  }

  /**
   * Get an encounter with all related entities
   * @param encounterId The encounter ID
   * @returns The encounter with all related data, or null if not found
   */
  public async getEncounter(encounterId: string): Promise<{
    encounter: Record<string, any> | null;
    followups: Record<string, any>[];
    triage: Record<string, any> | null;
    referral: Record<string, any> | null;
    decision: Record<string, any> | null;
  }> {
    const pk = this.generateEncounterPK(encounterId);
    
    // Query all items for this encounter
    const items = await this.query(pk);

    // Separate items by type
    let encounter: Record<string, any> | null = null;
    const followups: Record<string, any>[] = [];
    let triage: Record<string, any> | null = null;
    let referral: Record<string, any> | null = null;
    let decision: Record<string, any> | null = null;

    for (const item of items) {
      if (item.SK === 'METADATA') {
        encounter = item;
      } else if (item.SK.startsWith('FOLLOWUP#')) {
        followups.push(item);
      } else if (item.SK === 'TRIAGE') {
        triage = item;
      } else if (item.SK === 'REFERRAL') {
        referral = item;
      } else if (item.SK === 'DECISION') {
        decision = item;
      }
    }

    // Sort followups by sequence number
    followups.sort((a, b) => {
      const seqA = parseInt(a.SK.split('#')[1]);
      const seqB = parseInt(b.SK.split('#')[1]);
      return seqA - seqB;
    });

    return {
      encounter,
      followups,
      triage,
      referral,
      decision,
    };
  }

  /**
   * Update an encounter
   * @param encounterId The encounter ID
   * @param updates Fields to update
   */
  public async updateEncounter(
    encounterId: string,
    updates: Record<string, any>
  ): Promise<void> {
    const pk = this.generateEncounterPK(encounterId);
    const sk = this.generateEncounterMetadataSK();
    
    await this.update(pk, sk, updates);
  }
}
