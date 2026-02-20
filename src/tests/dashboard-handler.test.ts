/**
 * Unit tests for dashboard-handler Lambda function
 * 
 * Tests the dashboard handler's ability to:
 * - Handle GET /dashboard/stats requests
 * - Query daily rollup statistics
 * - Return formatted dashboard data
 * - Validate date parameters
 * - Handle errors gracefully
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

// Mock the services before importing handler
const mockGetDashboardStats = jest.fn();
const mockGetTodayDate = jest.fn().mockReturnValue('2024-01-15');

jest.mock('../services/dynamodb.service');
jest.mock('../services/rollup.service', () => {
  return {
    RollupService: jest.fn().mockImplementation(() => {
      return {
        getDashboardStats: mockGetDashboardStats,
      };
    }),
  };
});

// Import handler after mocks are set up
import { handler } from '../handlers/dashboard-handler';
import { RollupService } from '../services/rollup.service';

// Mock the static method
(RollupService as any).getTodayDate = mockGetTodayDate;

describe('Dashboard Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTodayDate.mockReturnValue('2024-01-15');
  });

  /**
   * Helper function to create API Gateway event
   */
  function createEvent(
    method: string,
    path: string,
    queryParams?: Record<string, string>
  ): APIGatewayProxyEvent {
    return {
      httpMethod: method,
      path,
      queryStringParameters: queryParams || null,
      pathParameters: null,
      headers: {},
      body: null,
      isBase64Encoded: false,
      requestContext: {} as any,
      resource: '',
      stageVariables: null,
      multiValueHeaders: {},
      multiValueQueryStringParameters: null,
    };
  }

  describe('GET /dashboard/stats', () => {
    it('should return dashboard statistics for today by default', async () => {
      // Arrange
      const mockStats = {
        date: '2024-01-15',
        totalEncounters: 42,
        channelDistribution: {
          app: 20,
          voice: 10,
          ussd: 7,
          sms: 5,
        },
        triageBreakdown: {
          red: 5,
          yellow: 15,
          green: 22,
        },
        topSymptoms: [
          { symptom: 'fever', count: 15 },
          { symptom: 'cough', count: 12 },
          { symptom: 'headache', count: 8 },
        ],
        dangerSignFrequency: {
          'severe chest pain': 2,
          'heavy bleeding': 1,
        },
        referralRate: 35.71,
        avgAiLatency: 1250,
      };

      mockGetDashboardStats.mockResolvedValue(mockStats);

      const event = createEvent('GET', '/dashboard/stats');

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(200);
      expect(mockGetDashboardStats).toHaveBeenCalledWith('2024-01-15');

      const body = JSON.parse(result.body);
      expect(body.date).toBe('2024-01-15');
      expect(body.totalEncounters).toBe(42);
      expect(body.channelDistribution).toEqual(mockStats.channelDistribution);
      expect(body.triageBreakdown).toEqual(mockStats.triageBreakdown);
      expect(body.topSymptoms).toEqual(mockStats.topSymptoms);
      expect(body.dangerSignFrequency).toEqual(mockStats.dangerSignFrequency);
      expect(body.referralRate).toBe(35.71);
      expect(body.avgAiLatency).toBe(1250);
      expect(body.timestamp).toBeDefined();
    });

    it('should return dashboard statistics for specified date', async () => {
      // Arrange
      const mockStats = {
        date: '2024-01-10',
        totalEncounters: 30,
        channelDistribution: {
          app: 15,
          voice: 8,
          ussd: 5,
          sms: 2,
        },
        triageBreakdown: {
          red: 3,
          yellow: 12,
          green: 15,
        },
        topSymptoms: [
          { symptom: 'respiratory', count: 10 },
        ],
        dangerSignFrequency: {},
        referralRate: 20.0,
        avgAiLatency: 1100,
      };

      mockGetDashboardStats.mockResolvedValue(mockStats);

      const event = createEvent('GET', '/dashboard/stats', { date: '2024-01-10' });

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(200);
      expect(mockGetDashboardStats).toHaveBeenCalledWith('2024-01-10');

      const body = JSON.parse(result.body);
      expect(body.date).toBe('2024-01-10');
      expect(body.totalEncounters).toBe(30);
    });

    it('should return empty statistics when no data exists for date', async () => {
      // Arrange
      const mockStats = {
        date: '2024-01-01',
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

      mockGetDashboardStats.mockResolvedValue(mockStats);

      const event = createEvent('GET', '/dashboard/stats', { date: '2024-01-01' });

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(200);

      const body = JSON.parse(result.body);
      expect(body.totalEncounters).toBe(0);
      expect(body.topSymptoms).toEqual([]);
    });

    it('should include cache control header', async () => {
      // Arrange
      const mockStats = {
        date: '2024-01-15',
        totalEncounters: 10,
        channelDistribution: { app: 10, voice: 0, ussd: 0, sms: 0 },
        triageBreakdown: { red: 2, yellow: 3, green: 5 },
        topSymptoms: [],
        dangerSignFrequency: {},
        referralRate: 0,
        avgAiLatency: 1000,
      };

      mockGetDashboardStats.mockResolvedValue(mockStats);

      const event = createEvent('GET', '/dashboard/stats');

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(200);
      expect(result.headers?.['Cache-Control']).toBe('max-age=60');
    });

    it('should return 400 for invalid date format', async () => {
      // Arrange
      const event = createEvent('GET', '/dashboard/stats', { date: 'invalid-date' });

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(400);

      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('Invalid date format');
    });

    it('should return 400 for malformed date', async () => {
      // Arrange
      const event = createEvent('GET', '/dashboard/stats', { date: '2024-13-45' });

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(400);

      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 500 when rollup service fails', async () => {
      // Arrange
      mockGetDashboardStats.mockRejectedValue(new Error('DynamoDB connection failed'));

      const event = createEvent('GET', '/dashboard/stats');

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(500);

      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('DASHBOARD_FAILED');
      expect(body.error.message).toContain('Failed to retrieve dashboard statistics');
      expect(body.error.details).toContain('DynamoDB connection failed');
    });

    it('should return 404 for unsupported endpoints', async () => {
      // Arrange
      const event = createEvent('GET', '/dashboard/other');

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(404);

      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return 404 for unsupported HTTP methods', async () => {
      // Arrange
      const event = createEvent('POST', '/dashboard/stats');

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(404);

      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should include CORS headers in response', async () => {
      // Arrange
      const mockStats = {
        date: '2024-01-15',
        totalEncounters: 5,
        channelDistribution: { app: 5, voice: 0, ussd: 0, sms: 0 },
        triageBreakdown: { red: 1, yellow: 2, green: 2 },
        topSymptoms: [],
        dangerSignFrequency: {},
        referralRate: 0,
        avgAiLatency: 900,
      };

      mockGetDashboardStats.mockResolvedValue(mockStats);

      const event = createEvent('GET', '/dashboard/stats');

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(200);
      expect(result.headers?.['Access-Control-Allow-Origin']).toBe('*');
    });

    it('should include all required dashboard fields', async () => {
      // Arrange
      const mockStats = {
        date: '2024-01-15',
        totalEncounters: 100,
        channelDistribution: {
          app: 50,
          voice: 25,
          ussd: 15,
          sms: 10,
        },
        triageBreakdown: {
          red: 10,
          yellow: 40,
          green: 50,
        },
        topSymptoms: [
          { symptom: 'fever', count: 30 },
          { symptom: 'cough', count: 25 },
          { symptom: 'headache', count: 20 },
          { symptom: 'pain', count: 15 },
          { symptom: 'respiratory', count: 10 },
        ],
        dangerSignFrequency: {
          'severe chest pain': 5,
          'heavy bleeding': 3,
          'seizure': 2,
        },
        referralRate: 45.5,
        avgAiLatency: 1350,
      };

      mockGetDashboardStats.mockResolvedValue(mockStats);

      const event = createEvent('GET', '/dashboard/stats');

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(200);

      const body = JSON.parse(result.body);
      
      // Validate all required fields are present (Requirements 13.1-13.7)
      expect(body).toHaveProperty('date');
      expect(body).toHaveProperty('totalEncounters'); // Requirement 13.1
      expect(body).toHaveProperty('channelDistribution'); // Requirement 13.2
      expect(body).toHaveProperty('triageBreakdown'); // Requirement 13.3
      expect(body).toHaveProperty('topSymptoms'); // Requirement 13.4
      expect(body).toHaveProperty('dangerSignFrequency'); // Requirement 13.5
      expect(body).toHaveProperty('referralRate'); // Requirement 13.6
      expect(body).toHaveProperty('avgAiLatency'); // Requirement 13.7
      expect(body).toHaveProperty('timestamp');

      // Validate channel distribution structure
      expect(body.channelDistribution).toHaveProperty('app');
      expect(body.channelDistribution).toHaveProperty('voice');
      expect(body.channelDistribution).toHaveProperty('ussd');
      expect(body.channelDistribution).toHaveProperty('sms');

      // Validate triage breakdown structure
      expect(body.triageBreakdown).toHaveProperty('red');
      expect(body.triageBreakdown).toHaveProperty('yellow');
      expect(body.triageBreakdown).toHaveProperty('green');
    });
  });
});
