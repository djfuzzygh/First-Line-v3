# FirstLine Healthcare Triage Platform - Frontend Applications

This repository contains two frontend applications for the FirstLine Healthcare Triage Platform:

1. **Mobile App** (React Native) - For healthcare workers conducting patient triage
2. **Web Dashboard** (React) - For administrators monitoring system operations

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend Applications                    │
├──────────────────────────────┬──────────────────────────────┤
│       Mobile App             │      Web Dashboard           │
│    (React Native/Expo)       │      (React/Vite)           │
│                              │                              │
│  - Patient encounters        │  - Real-time statistics      │
│  - Symptom collection        │  - Triage analytics          │
│  - Triage assessment         │  - Channel insights          │
│  - Offline support           │  - Performance monitoring    │
│  - Referral generation       │  - System configuration      │
└──────────────────────────────┴──────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Backend API    │
                    │ (Cloud Run/GCP) │
                    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ FirstLine Backend│
                    │  (TypeScript)   │
                    └─────────────────┘
```

## Quick Start

### Mobile App

```bash
cd mobile-app
npm install
npm start
```

See [mobile-app/README.md](mobile-app/README.md) for detailed instructions.

### Web Dashboard

```bash
cd web-dashboard
npm install
npm run dev
```

See [web-dashboard/README.md](web-dashboard/README.md) for detailed instructions.

## Configuration

Both applications require API endpoint configuration:

### Mobile App (.env)
```env
EXPO_PUBLIC_API_URL=https://<your-backend-url>
```

### Web Dashboard (.env)
```env
VITE_API_URL=https://<your-backend-url>
VITE_KAGGLE_API_URL=
```

## Features Comparison

| Feature | Mobile App | Web Dashboard |
|---------|-----------|---------------|
| Create encounters | ✅ | ❌ |
| View triage results | ✅ | ❌ |
| Generate referrals | ✅ | ❌ |
| Offline support | ✅ | ❌ |
| View statistics | ❌ | ✅ |
| Analytics & charts | ❌ | ✅ |
| System monitoring | ❌ | ✅ |
| User management | ❌ | ✅ (planned) |

## User Roles

### Healthcare Workers (Mobile App)
- Conduct patient triage
- Collect symptoms and vital signs
- Get AI-powered assessments
- Generate referral documents
- Work offline in low-connectivity areas

### Administrators (Web Dashboard)
- Monitor system performance
- View aggregate statistics
- Analyze triage patterns
- Track channel usage
- Configure system settings

## Technology Stack

### Mobile App
- **Framework**: React Native with Expo
- **Navigation**: React Navigation
- **UI Library**: React Native Paper
- **State Management**: React Hooks
- **Storage**: AsyncStorage
- **HTTP Client**: Axios

### Web Dashboard
- **Framework**: React 18
- **Build Tool**: Vite
- **UI Library**: Material-UI (MUI)
- **Charts**: Recharts
- **Routing**: React Router
- **HTTP Client**: Axios

## Development Workflow

### 1. Backend First
Ensure the backend API is running/deployed and accessible.

### 2. Configure Endpoints
Update `.env` files in both frontend applications with the API Gateway URL.

### 3. Start Development Servers

Terminal 1 (Mobile):
```bash
cd mobile-app
npm start
```

Terminal 2 (Web):
```bash
cd web-dashboard
npm run dev
```

### 4. Test Offline Functionality (Mobile)
- Enable airplane mode on device/simulator
- Create encounters - they'll be saved locally
- Disable airplane mode
- Encounters sync automatically

## Deployment

### Mobile App

#### iOS
```bash
cd mobile-app
expo build:ios
# Follow Expo's instructions for App Store submission
```

#### Android
```bash
cd mobile-app
expo build:android
# Follow Expo's instructions for Play Store submission
```

### Web Dashboard

#### Static Hosting
```bash
cd web-dashboard
npm run build
# Deploy dist/ folder to your static host
```

#### Netlify
```bash
cd web-dashboard
npm run build
netlify deploy --prod --dir=dist
```

## API Endpoints Used

### Mobile App
- `POST /encounters` - Create encounter
- `GET /encounters/{id}` - Get encounter details
- `POST /encounters/{id}/symptoms` - Add symptoms
- `POST /encounters/{id}/followup` - Submit follow-up
- `POST /encounters/{id}/triage` - Perform triage
- `POST /encounters/{id}/referral` - Generate referral
- `GET /health` - Health check

### Web Dashboard
- `GET /dashboard/stats` - Get statistics
- `GET /health` - Health check
- `GET /encounters` - List encounters (planned)
- `GET /config` - Get configuration (planned)

## Security

### Authentication
Both applications use JWT tokens for authentication:

```typescript
// Store token after login
localStorage.setItem('authToken', token); // Web
AsyncStorage.setItem('authToken', token); // Mobile

// Token is automatically included in API requests
```

### API Key Management
- Tokens stored securely in device storage
- HTTPS only for API communication
- Token refresh mechanism (to be implemented)

## Offline Support (Mobile Only)

The mobile app includes comprehensive offline support:

1. **Local Storage**: Encounters saved to AsyncStorage
2. **Sync Queue**: Tracks pending uploads
3. **Automatic Sync**: Syncs when connectivity restored
4. **Retry Logic**: Exponential backoff for failed syncs
5. **Conflict Resolution**: Timestamp-based (to be enhanced)

## Monitoring & Analytics

### Mobile App
- Error logging to backend
- Usage analytics (to be implemented)
- Crash reporting (to be implemented)

### Web Dashboard
- Real-time system metrics
- Triage distribution charts
- Channel usage analytics
- Performance monitoring

## Internationalization (Planned)

Both applications are designed to support multiple languages:

- English (default)
- French
- Swahili
- Portuguese
- Spanish

## Accessibility

Both applications follow accessibility best practices:

- Screen reader support
- High contrast mode
- Keyboard navigation (web)
- Touch target sizes (mobile)
- ARIA labels

## Testing

### Mobile App
```bash
cd mobile-app
npm test
```

### Web Dashboard
```bash
cd web-dashboard
npm test
```

## Troubleshooting

### Mobile App Won't Connect to API
1. Check `.env` file has correct API URL
2. Ensure device/simulator can reach the API
3. Check backend CORS settings
4. Verify authentication token is valid

### Web Dashboard Shows No Data
1. Check browser console for errors
2. Verify API URL in `.env`
3. Check authentication token in localStorage
4. Ensure backend is deployed and healthy

### Offline Sync Not Working
1. Check AsyncStorage permissions
2. Verify network connectivity detection
3. Check sync queue in OfflineQueueScreen
4. Review error logs

## Contributing

1. Create feature branch
2. Make changes
3. Test on both iOS and Android (mobile)
4. Test on multiple browsers (web)
5. Submit pull request

## Support

For issues or questions:
- Backend API: See main repository README
- Mobile App: See mobile-app/README.md
- Web Dashboard: See web-dashboard/README.md

## License

CC BY 4.0
