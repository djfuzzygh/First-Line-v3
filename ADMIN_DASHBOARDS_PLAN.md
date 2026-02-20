# Admin Dashboards - Complete List

## Overview

A comprehensive admin dashboard system where you can configure everything through a UI - no manual file editing or command-line needed.

---

## Dashboard List (9 Total)

### 1. System Configuration Dashboard ✅ CREATED
**File**: `web-dashboard/src/pages/admin/SystemConfig.tsx`

**Features**:
- AWS configuration (region, account ID, table names)
- API settings (base URL, timeout, retries)
- Security settings (JWT secret, expiration, encryption)
- Feature flags (offline mode, voice, SMS, USSD, edge devices)

**Tabs**:
- AWS Configuration
- API Settings
- Security
- Features

---

### 2. AI Provider Dashboard
**File**: `web-dashboard/src/pages/admin/AIProviders.tsx`

**Features**:
- Select AI provider (Bedrock, Vertex AI/MedGemma, OpenAI)
- Configure provider credentials
- Model selection and parameters
- Test AI responses
- Cost tracking per provider
- A/B testing configuration
- Fallback chain setup

**Tabs**:
- Provider Selection
- AWS Bedrock Config
- Google Vertex AI Config
- Model Parameters
- Testing & Validation
- Cost Analysis

**Configuration Fields**:
```
Bedrock:
- AWS Region
- Model ID (Claude, Titan, etc.)
- Max tokens
- Temperature

Vertex AI (MedGemma):
- GCP Project ID
- GCP Region
- Model ID (medgemma-2b, medgemma-7b)
- Access token / Service account
- Max tokens
- Temperature

Fallback Chain:
- Primary provider
- Secondary provider
- Tertiary provider
- Failure threshold
```

---

### 3. Voice System Dashboard
**File**: `web-dashboard/src/pages/admin/VoiceSystem.tsx`

**Features**:
- 3CX configuration
- Twilio configuration
- Africa's Talking configuration
- Phone number management
- IVR flow designer (visual)
- Call recording settings
- Voice language selection
- Test call functionality

**Tabs**:
- Provider Setup (3CX/Twilio/AT)
- Phone Numbers
- IVR Flow Designer
- Voice Settings
- Call Recording
- Testing

**Configuration Fields**:
```
3CX:
- Server URL
- Admin username/password
- Extension range
- SIP trunk details
- Webhook URL

Twilio:
- Account SID
- Auth Token
- Phone numbers
- TwiML app SID

Africa's Talking:
- API Key
- Username
- Phone numbers

IVR Settings:
- Welcome message
- Language options
- Timeout values
- DTMF vs Speech
- Recording duration
```

---

### 4. Edge Device Dashboard
**File**: `web-dashboard/src/pages/admin/EdgeDevices.tsx`

**Features**:
- List all edge devices
- Device status (online/offline/syncing)
- Add new device
- Device configuration
- Model deployment
- OTA updates
- Remote diagnostics
- Sync status and logs

**Tabs**:
- Device List
- Add Device
- Device Details
- Model Management
- Updates & Maintenance
- Monitoring

**Device Card Shows**:
```
- Device ID
- Location
- Status (online/offline)
- Last sync time
- Model version
- Storage usage
- CPU/Memory usage
- Network status
- Pending updates
- Actions (restart, update, configure)
```

---

### 5. Telecom Integration Dashboard
**File**: `web-dashboard/src/pages/admin/TelecomIntegration.tsx`

**Features**:
- SIP trunk configuration
- SMS provider setup
- Phone number inventory
- Toll-free number setup
- Usage statistics
- Cost tracking
- Provider comparison

**Tabs**:
- SIP Trunks
- SMS Providers
- Phone Numbers
- Usage & Billing
- Provider Comparison

**Configuration Fields**:
```
SIP Trunk:
- Provider name
- SIP server
- Username/Password
- Codec preferences
- Concurrent calls limit

SMS Providers:
- Twilio
- Africa's Talking
- Vonage
- API credentials
- Sender IDs

Phone Numbers:
- Number
- Type (local/toll-free)
- Provider
- Monthly cost
- Usage stats
- Assign to service
```

---

### 6. Protocol Configuration Dashboard
**File**: `web-dashboard/src/pages/admin/ProtocolConfig.tsx`

**Features**:
- Upload local health protocols
- Configure triage rules
- Danger sign definitions
- Referral criteria
- Age-specific guidelines
- Regional variations
- Protocol versioning

**Tabs**:
- Protocol Library
- Triage Rules
- Danger Signs
- Referral Criteria
- Regional Settings
- Version History

**Features**:
```
- Upload PDF/Word protocols
- Extract rules automatically
- Visual rule editor
- Test rules with sample cases
- Approve/reject changes
- Rollback to previous version
- Export protocols
```

---

### 7. User Management Dashboard
**File**: `web-dashboard/src/pages/admin/UserManagement.tsx`

**Features**:
- List all users (CHWs, admins, doctors)
- Add/edit/delete users
- Role management
- Permissions
- Activity logs
- Performance metrics
- Training status

**Tabs**:
- User List
- Roles & Permissions
- Activity Logs
- Performance
- Training

**User Card Shows**:
```
- Name
- Email
- Role (CHW, Admin, Doctor)
- Status (active/inactive)
- Last login
- Assessments completed
- Success rate
- Training completion
- Actions (edit, deactivate, reset password)
```

---

### 8. Monitoring Dashboard
**File**: `web-dashboard/src/pages/admin/Monitoring.tsx`

**Features**:
- Real-time system metrics
- API health status
- Database performance
- AI provider status
- Edge device health
- Alert management
- Log viewer
- Performance graphs

**Tabs**:
- System Health
- API Metrics
- Database Stats
- AI Performance
- Edge Devices
- Alerts
- Logs

**Metrics Displayed**:
```
System:
- Uptime
- Request rate
- Error rate
- Response time (p50, p95, p99)

API:
- Endpoint health
- Success rate
- Latency
- Throughput

Database:
- Read/write capacity
- Latency
- Throttles
- Storage usage

AI:
- Provider status
- Inference time
- Cost per request
- Accuracy metrics

Alerts:
- Active alerts
- Alert history
- Configure thresholds
- Notification settings
```

---

### 9. Deployment Dashboard
**File**: `web-dashboard/src/pages/admin/Deployment.tsx`

**Features**:
- Deploy updates
- Rollback deployments
- Version control
- Environment management (dev/staging/prod)
- CI/CD status
- Deployment history
- Health checks

**Tabs**:
- Deploy
- Environments
- Version History
- CI/CD Status
- Health Checks

**Features**:
```
Deploy:
- Select version
- Select environment
- Preview changes
- Deploy button
- Rollback button

Environments:
- Dev (auto-deploy on push)
- Staging (manual approval)
- Production (manual approval + checks)

Version History:
- Version number
- Deploy date
- Deployed by
- Changes included
- Status
- Rollback option
```

---

## Navigation Structure

```
Admin (top-level menu)
├── System Configuration
├── AI Providers
├── Voice System
├── Edge Devices
├── Telecom Integration
├── Protocol Configuration
├── User Management
├── Monitoring
└── Deployment
```

---

## Implementation Priority

### Phase 1: Core (Week 1)
1. ✅ System Configuration
2. AI Providers
3. User Management

### Phase 2: Services (Week 2)
4. Voice System
5. Telecom Integration
6. Protocol Configuration

### Phase 3: Operations (Week 3)
7. Edge Devices
8. Monitoring
9. Deployment

---

## Common Features Across All Dashboards

### 1. Save/Cancel Buttons
- Save changes
- Cancel and revert
- Auto-save draft
- Confirm before save

### 2. Validation
- Real-time validation
- Error messages
- Warning messages
- Success confirmation

### 3. Testing
- Test configuration
- Preview changes
- Dry run
- Rollback option

### 4. Help & Documentation
- Inline help text
- Tooltips
- Link to docs
- Video tutorials

### 5. Audit Trail
- Who changed what
- When
- Previous values
- Reason for change

---

## API Endpoints Needed

### System Config
```
GET    /admin/config/system
PUT    /admin/config/system
POST   /admin/config/test
```

### AI Providers
```
GET    /admin/ai-providers
PUT    /admin/ai-providers/:provider
POST   /admin/ai-providers/test
GET    /admin/ai-providers/costs
```

### Voice System
```
GET    /admin/voice/config
PUT    /admin/voice/config
POST   /admin/voice/test-call
GET    /admin/voice/phone-numbers
POST   /admin/voice/phone-numbers
```

### Edge Devices
```
GET    /admin/edge-devices
POST   /admin/edge-devices
GET    /admin/edge-devices/:id
PUT    /admin/edge-devices/:id
POST   /admin/edge-devices/:id/update
POST   /admin/edge-devices/:id/restart
GET    /admin/edge-devices/:id/logs
```

### Telecom
```
GET    /admin/telecom/sip-trunks
POST   /admin/telecom/sip-trunks
GET    /admin/telecom/sms-providers
PUT    /admin/telecom/sms-providers/:provider
GET    /admin/telecom/phone-numbers
```

### Protocols
```
GET    /admin/protocols
POST   /admin/protocols
PUT    /admin/protocols/:id
DELETE /admin/protocols/:id
POST   /admin/protocols/:id/activate
```

### Users
```
GET    /admin/users
POST   /admin/users
PUT    /admin/users/:id
DELETE /admin/users/:id
GET    /admin/users/:id/activity
```

### Monitoring
```
GET    /admin/monitoring/health
GET    /admin/monitoring/metrics
GET    /admin/monitoring/alerts
POST   /admin/monitoring/alerts/:id/acknowledge
GET    /admin/monitoring/logs
```

### Deployment
```
GET    /admin/deployment/versions
POST   /admin/deployment/deploy
POST   /admin/deployment/rollback
GET    /admin/deployment/status
GET    /admin/deployment/health-check
```

---

## Security

### Access Control
- Admin role required
- Audit all changes
- Two-factor authentication
- IP whitelist option

### Sensitive Data
- Encrypt secrets in database
- Mask secrets in UI
- Show/hide toggle
- Never log secrets

### Validation
- Server-side validation
- Rate limiting
- CSRF protection
- Input sanitization

---

## Mobile Responsive

All dashboards will be:
- Mobile responsive
- Touch-friendly
- Optimized for tablets
- Progressive web app

---

## Next Steps

1. **Implement remaining dashboards** (8 more)
2. **Create backend API handlers** for all endpoints
3. **Add authentication** to admin routes
4. **Test each dashboard** thoroughly
5. **Create user documentation**
6. **Record video tutorials**

---

## Estimated Timeline

- **Phase 1** (Core): 1 week
- **Phase 2** (Services): 1 week
- **Phase 3** (Operations): 1 week
- **Testing & Polish**: 1 week

**Total: 4 weeks for complete admin system**

---

## Benefits

✅ **No command-line needed** - Everything through UI
✅ **Copy-paste friendly** - Just paste API keys and credentials
✅ **Visual configuration** - See what you're changing
✅ **Test before save** - Validate configurations
✅ **Audit trail** - Track all changes
✅ **Role-based access** - Control who can change what
✅ **Mobile friendly** - Configure from anywhere

This will make FirstLine the easiest healthcare triage platform to deploy and manage!
