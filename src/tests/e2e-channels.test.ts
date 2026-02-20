/**
 * E2E Tests for All Channels
 * These tests verify that the complete workflow exists for each channel
 */

describe('E2E: Multi-Channel Workflows', () => {
  it('should have smartphone app channel workflow components', () => {
    // Verify all required handlers exist
    expect(require('../handlers/encounter-handler').handler).toBeDefined();
    expect(require('../handlers/triage-handler').handler).toBeDefined();
    expect(require('../handlers/referral-handler').handler).toBeDefined();
    expect(require('../handlers/dashboard-handler').handler).toBeDefined();
    
    // Verify all required services exist
    expect(require('../services/dynamodb.service').DynamoDBService).toBeDefined();
    expect(require('../services/triage.service').TriageService).toBeDefined();
    expect(require('../services/referral.service').ReferralService).toBeDefined();
    expect(require('../services/followup.service').FollowupService).toBeDefined();
    expect(require('../services/offline-sync.service').OfflineSyncService).toBeDefined();
  });

  it('should have voice channel workflow components', () => {
    // Verify voice handler exists
    expect(require('../handlers/voice-handler').handler).toBeDefined();
    
    // Verify voice channel can use same triage workflow
    expect(require('../services/triage.service').TriageService).toBeDefined();
    expect(require('../services/danger-sign-detector.service').DangerSignDetector).toBeDefined();
  });

  it('should have SMS channel workflow components', () => {
    // Verify SMS handler exists
    expect(require('../handlers/sms-handler').handler).toBeDefined();
    
    // Verify SMS can use triage and referral services
    expect(require('../services/triage.service').TriageService).toBeDefined();
    expect(require('../services/referral.service').ReferralService).toBeDefined();
  });

  it('should have USSD channel workflow components', () => {
    // Verify USSD handler exists
    expect(require('../handlers/ussd-handler').handler).toBeDefined();
    
    // Verify USSD can use triage workflow
    expect(require('../services/triage.service').TriageService).toBeDefined();
  });

  it('should have complete triage workflow: encounter → triage → referral', () => {
    // Verify encounter management
    const encounterHandler = require('../handlers/encounter-handler').handler;
    expect(encounterHandler).toBeDefined();
    expect(typeof encounterHandler).toBe('function');
    
    // Verify triage assessment
    const triageHandler = require('../handlers/triage-handler').handler;
    expect(triageHandler).toBeDefined();
    expect(typeof triageHandler).toBe('function');
    
    // Verify referral generation
    const referralHandler = require('../handlers/referral-handler').handler;
    expect(referralHandler).toBeDefined();
    expect(typeof referralHandler).toBe('function');
    
    // Verify dashboard statistics
    const dashboardHandler = require('../handlers/dashboard-handler').handler;
    expect(dashboardHandler).toBeDefined();
    expect(typeof dashboardHandler).toBe('function');
  });

  it('should have safety mechanisms in place', () => {
    // Verify danger sign detection
    const DangerSignDetector = require('../services/danger-sign-detector.service').DangerSignDetector;
    expect(DangerSignDetector).toBeDefined();
    
    const detector = new DangerSignDetector();
    const dangerSigns = detector.detectDangerSigns('severe chest pain and difficulty breathing');
    expect(dangerSigns.length).toBeGreaterThan(0);
    
    // Verify rule engine fallback exists
    const RuleEngine = require('../services/rule-engine.service').RuleEngine;
    expect(RuleEngine).toBeDefined();
  });

  it('should have offline capabilities', () => {
    // Verify offline sync service
    const OfflineSyncService = require('../services/offline-sync.service').OfflineSyncService;
    expect(OfflineSyncService).toBeDefined();
    
    // Verify configuration service for local protocols
    const ConfigurationService = require('../services/configuration.service').ConfigurationService;
    expect(ConfigurationService).toBeDefined();
  });

  it('should have monitoring and health checks', () => {
    // Verify health check handler
    const healthHandler = require('../handlers/health-handler').handler;
    expect(healthHandler).toBeDefined();
    expect(typeof healthHandler).toBe('function');
    
    // Verify error logging service
    const ErrorLoggingService = require('../services/error-logging.service').ErrorLoggingService;
    expect(ErrorLoggingService).toBeDefined();
  });
});
