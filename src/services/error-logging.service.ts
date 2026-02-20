/**
 * Error Logging Service
 * Provides client-side error logging with local storage and cloud upload
 * Stores error logs locally and uploads them when connectivity is available
 */

import {
  CloudWatchLogsClient,
  PutLogEventsCommand,
  CreateLogStreamCommand,
  DescribeLogStreamsCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

/**
 * Error log entry structure
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

/**
 * Configuration for error logging service
 */
export interface ErrorLoggingServiceConfig {
  logGroupName?: string;
  s3BucketName?: string;
  region?: string;
  maxLocalLogs?: number;
  uploadBatchSize?: number;
}

/**
 * Error logging service class
 */
export class ErrorLoggingService {
  private cloudWatchClient: CloudWatchLogsClient;
  private s3Client: S3Client;
  private logGroupName: string;
  private s3BucketName: string;
  private maxLocalLogs: number;
  private uploadBatchSize: number;
  
  // In-memory storage for local logs (simulates device storage)
  private localLogs: ErrorLog[] = [];

  constructor(config: ErrorLoggingServiceConfig) {
    const region = config.region ?? process.env.AWS_REGION ?? 'us-east-1';
    
    this.cloudWatchClient = new CloudWatchLogsClient({ region });
    this.s3Client = new S3Client({ region });
    
    this.logGroupName = config.logGroupName ?? 'firstline-app-errors';
    this.s3BucketName = config.s3BucketName ?? 'firstline-error-logs';
    this.maxLocalLogs = config.maxLocalLogs ?? 1000;
    this.uploadBatchSize = config.uploadBatchSize ?? 50;
  }

  /**
   * Log an error to local storage
   * @param error The error to log
   * @param context Additional context information
   * @param encounterId Optional encounter ID if error is related to an encounter
   * @returns The error log entry
   */
  public logError(
    error: Error,
    context?: Record<string, any>,
    encounterId?: string
  ): ErrorLog {
    const errorLog: ErrorLog = {
      id: this.generateLogId(),
      timestamp: new Date().toISOString(),
      errorType: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
      context,
      deviceInfo: this.getDeviceInfo(),
      encounterId,
      uploaded: false,
    };

    // Store in local storage
    this.storeLocalLog(errorLog);

    return errorLog;
  }

  /**
   * Store error log in local storage
   * @param errorLog The error log to store
   */
  private storeLocalLog(errorLog: ErrorLog): void {
    this.localLogs.push(errorLog);

    // Enforce max local logs limit (FIFO)
    if (this.localLogs.length > this.maxLocalLogs) {
      // Remove oldest logs that have been uploaded
      const uploadedLogs = this.localLogs.filter(log => log.uploaded);
      if (uploadedLogs.length > 0) {
        // Remove the oldest uploaded log
        const oldestUploadedIndex = this.localLogs.findIndex(log => log.uploaded);
        if (oldestUploadedIndex !== -1) {
          this.localLogs.splice(oldestUploadedIndex, 1);
        }
      } else {
        // If no uploaded logs, remove the oldest log
        this.localLogs.shift();
      }
    }
  }

  /**
   * Get all local error logs
   * @param uploadedOnly If true, only return uploaded logs
   * @returns Array of error logs
   */
  public getLocalLogs(uploadedOnly: boolean = false): ErrorLog[] {
    if (uploadedOnly) {
      return this.localLogs.filter(log => log.uploaded);
    }
    return [...this.localLogs];
  }

  /**
   * Get pending (not uploaded) error logs
   * @returns Array of error logs that haven't been uploaded
   */
  public getPendingLogs(): ErrorLog[] {
    return this.localLogs.filter(log => !log.uploaded);
  }

  /**
   * Upload error logs to CloudWatch Logs when connectivity is available
   * @returns Number of logs successfully uploaded
   */
  public async uploadToCloudWatch(): Promise<number> {
    const pendingLogs = this.getPendingLogs();
    
    if (pendingLogs.length === 0) {
      return 0;
    }

    // Upload in batches
    const batches = this.createBatches(pendingLogs, this.uploadBatchSize);
    let uploadedCount = 0;

    for (const batch of batches) {
      try {
        await this.uploadBatchToCloudWatch(batch);
        
        // Mark logs as uploaded
        batch.forEach(log => {
          log.uploaded = true;
        });
        
        uploadedCount += batch.length;
      } catch (error) {
        // Log upload failure but continue with next batch
        console.error('Failed to upload batch to CloudWatch:', error);
        // Don't mark as uploaded if failed
      }
    }

    return uploadedCount;
  }

  /**
   * Upload a batch of error logs to CloudWatch Logs
   * @param logs Array of error logs to upload
   */
  private async uploadBatchToCloudWatch(logs: ErrorLog[]): Promise<void> {
    if (logs.length === 0) {
      return;
    }

    // Create log stream name based on date and device
    const logStreamName = this.generateLogStreamName();

    // Ensure log stream exists
    await this.ensureLogStream(logStreamName);

    // Prepare log events
    const logEvents = logs.map(log => ({
      timestamp: new Date(log.timestamp).getTime(),
      message: JSON.stringify({
        id: log.id,
        errorType: log.errorType,
        errorMessage: log.errorMessage,
        errorStack: log.errorStack,
        context: log.context,
        deviceInfo: log.deviceInfo,
        encounterId: log.encounterId,
      }),
    }));

    // Sort by timestamp (required by CloudWatch)
    logEvents.sort((a, b) => a.timestamp - b.timestamp);

    // Upload to CloudWatch
    const command = new PutLogEventsCommand({
      logGroupName: this.logGroupName,
      logStreamName,
      logEvents,
    });

    await this.cloudWatchClient.send(command);
  }

  /**
   * Upload error logs to S3 when connectivity is available
   * @returns Number of logs successfully uploaded
   */
  public async uploadToS3(): Promise<number> {
    const pendingLogs = this.getPendingLogs();
    
    if (pendingLogs.length === 0) {
      return 0;
    }

    try {
      // Create S3 key with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const deviceId = this.getDeviceId();
      const key = `error-logs/${deviceId}/${timestamp}.json`;

      // Upload all pending logs as a single JSON file
      const command = new PutObjectCommand({
        Bucket: this.s3BucketName,
        Key: key,
        Body: JSON.stringify(pendingLogs, null, 2),
        ContentType: 'application/json',
      });

      await this.s3Client.send(command);

      // Mark all logs as uploaded
      pendingLogs.forEach(log => {
        log.uploaded = true;
      });

      return pendingLogs.length;
    } catch (error) {
      console.error('Failed to upload logs to S3:', error);
      throw error;
    }
  }

  /**
   * Ensure CloudWatch log stream exists
   * @param logStreamName The log stream name
   */
  private async ensureLogStream(logStreamName: string): Promise<void> {
    try {
      // Check if log stream exists
      const describeCommand = new DescribeLogStreamsCommand({
        logGroupName: this.logGroupName,
        logStreamNamePrefix: logStreamName,
      });

      const response = await this.cloudWatchClient.send(describeCommand);
      
      if (response.logStreams && response.logStreams.length > 0) {
        // Log stream exists
        return;
      }

      // Create log stream if it doesn't exist
      const createCommand = new CreateLogStreamCommand({
        logGroupName: this.logGroupName,
        logStreamName,
      });

      await this.cloudWatchClient.send(createCommand);
    } catch (error) {
      // If log group doesn't exist, the error will be thrown
      // In production, log group should be created by infrastructure
      console.error('Failed to ensure log stream:', error);
      throw error;
    }
  }

  /**
   * Generate a unique log ID
   * @returns A unique identifier for the log entry
   */
  private generateLogId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Generate log stream name
   * @returns Log stream name based on date and device
   */
  private generateLogStreamName(): string {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const deviceId = this.getDeviceId();
    return `${date}/${deviceId}`;
  }

  /**
   * Get device ID (simulated for Lambda environment)
   * In a real mobile app, this would be the device's unique identifier
   * @returns Device identifier
   */
  private getDeviceId(): string {
    // In Lambda, use instance ID or generate a consistent ID
    return process.env.AWS_LAMBDA_LOG_STREAM_NAME ?? 'unknown-device';
  }

  /**
   * Get device information
   * @returns Device information object
   */
  private getDeviceInfo(): {
    platform?: string;
    version?: string;
    userAgent?: string;
  } {
    return {
      platform: process.platform,
      version: process.version,
      userAgent: process.env.USER_AGENT,
    };
  }

  /**
   * Create batches from an array
   * @param items Array of items to batch
   * @param batchSize Size of each batch
   * @returns Array of batches
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Clear uploaded logs from local storage
   * @returns Number of logs cleared
   */
  public clearUploadedLogs(): number {
    const uploadedCount = this.localLogs.filter(log => log.uploaded).length;
    this.localLogs = this.localLogs.filter(log => !log.uploaded);
    return uploadedCount;
  }

  /**
   * Get error log statistics
   * @returns Statistics about error logs
   */
  public getStatistics(): {
    total: number;
    uploaded: number;
    pending: number;
    oldestPending?: string;
  } {
    const total = this.localLogs.length;
    const uploaded = this.localLogs.filter(log => log.uploaded).length;
    const pending = total - uploaded;
    const pendingLogs = this.getPendingLogs();
    const oldestPending = pendingLogs.length > 0 
      ? pendingLogs[0].timestamp 
      : undefined;

    return {
      total,
      uploaded,
      pending,
      oldestPending,
    };
  }
}
