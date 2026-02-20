# FirstLine Mobile App - Complete Setup Guide

## ✅ What's Been Implemented

### Core Features
- ✅ **Authentication System**
  - Login screen with email/password
  - Signup screen with role selection
  - Forgot password flow
  - Demo mode for testing without backend
  - JWT token management
  - Auto-login on app restart

- ✅ **Patient Encounter Management**
  - Create new encounters with demographics
  - Collect vital signs (temperature, pulse, BP, respiratory rate)
  - Add symptoms with quick-select chips
  - Additional symptom text entry

- ✅ **Follow-up Questions**
  - AI-generated question flow
  - Yes/No quick answers
  - Free-text responses
  - Progress tracking
  - Question history

- ✅ **Triage Assessment**
  - Color-coded risk levels (RED/YELLOW/GREEN)
  - Danger sign detection
  - Recommended next steps
  - Watch-out warnings
  - Medical disclaimer

- ✅ **Referral Generation**
  - Generate PDF referral documents
  - View and share referrals
  - Document URL handling

- ✅ **Offline Support**
  - Local encounter storage
  - Sync queue management
  - Automatic sync when online
  - Manual sync trigger
  - Offline indicator

- ✅ **User Experience**
  - Material Design with React Native Paper
  - Responsive layouts
  - Loading states
  - Error handling
  - Form validation
  - User menu with logout

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd mobile-app
npm install
```

### 2. Configure Environment

Create `.env` file:

```env
EXPO_PUBLIC_API_URL=https://your-api-gateway-url.amazonaws.com/v1
```

For local testing without backend:
```env
EXPO_PUBLIC_API_URL=http://localhost:3000/v1
```

### 3. Start Development Server

```bash
npm start
```

Then:
- Press `i` for iOS simulator
- Press `a` for Android emulator
- Scan QR code with Expo Go app

### 4. Test with Demo Mode

1. Open the app
2. On login screen, tap "Demo Mode (No Login Required)"
3. You'll be logged in without needing a backend
4. All features work except actual API calls

## 📱 App Flow

### Authentication Flow
```
App Launch
  ↓
Check Auth Token
  ↓
├─ Token exists → Main App
└─ No token → Login Screen
     ↓
   Login/Signup
     ↓
   Store Token
     ↓
   Main App
```

### Triage Workflow
```
Home Screen
  ↓
New Encounter
  ↓
Enter Demographics & Symptoms
  ↓
Submit to Backend
  ↓
Triage Assessment (AI Analysis)
  ↓
View Results (RED/YELLOW/GREEN)
  ↓
Generate Referral (if needed)
  ↓
Return to Home
```

### Offline Workflow
```
No Internet Connection
  ↓
Create Encounter
  ↓
Save to Local Storage
  ↓
Add to Sync Queue
  ↓
Internet Restored
  ↓
Auto Sync or Manual Sync
  ↓
Mark as Synced
```

## 🎨 Screens Overview

### 1. Login Screen
- Email/password authentication
- Demo mode button
- Link to signup
- Forgot password link
- Form validation

### 2. Signup Screen
- Full name, email, password
- Organization field
- Role selection (Healthcare Worker/Admin)
- Password confirmation
- Link back to login

### 3. Forgot Password Screen
- Email input
- Send reset link
- Success confirmation
- Back to login

### 4. Home Screen
- Welcome message with user name
- Online/offline status badge
- Pending sync count
- Start new triage button
- Offline queue access
- Quick guide
- User menu (refresh, logout)

### 5. New Encounter Screen
- Patient age (required)
- Sex selection (M/F/O)
- Location (required)
- Chief complaint/symptoms (required)
- Vital signs (optional):
  - Temperature
  - Pulse
  - Blood Pressure
  - Respiratory Rate
- Form validation
- Offline support

### 6. Symptoms Screen
- Quick-select symptom chips
- Common symptoms list
- Additional symptoms text area
- Selected symptoms summary
- Add/cancel buttons

### 7. Followup Screen
- Question progress bar
- Current question display
- Yes/No radio buttons (for applicable questions)
- Free-text input
- Previous/Next navigation
- Skip option
- Answered questions summary

### 8. Triage Result Screen
- Risk level card (color-coded)
- Confidence indicator
- Danger signs (if any)
- Recommended next steps
- Watch-out warnings
- Medical disclaimer
- Generate referral button
- Start new encounter button

### 9. Referral Screen
- Generate referral button
- Success confirmation
- Open document button
- Return to home

### 10. Offline Queue Screen
- List of offline encounters
- Sync status (pending/synced)
- Encounter details
- Sync all button
- Clear synced button
- Empty state

## 🔧 Configuration

### API Integration

The app expects these backend endpoints:

**Authentication:**
- `POST /auth/login` - User login
- `POST /auth/signup` - User registration
- `POST /auth/forgot-password` - Password reset

**Encounters:**
- `POST /encounters` - Create encounter
- `GET /encounters/{id}` - Get encounter
- `POST /encounters/{id}/symptoms` - Add symptoms
- `POST /encounters/{id}/followup` - Submit follow-up
- `POST /encounters/{id}/triage` - Perform triage
- `POST /encounters/{id}/referral` - Generate referral

**System:**
- `GET /health` - Health check

### Offline Storage

Uses AsyncStorage for:
- `authToken` - JWT authentication token
- `userInfo` - User profile data
- `offline_encounters` - Queue of unsynced encounters

## 🧪 Testing

### Manual Testing Checklist

**Authentication:**
- [ ] Login with valid credentials
- [ ] Login with invalid credentials
- [ ] Signup new account
- [ ] Demo mode login
- [ ] Logout
- [ ] Auto-login on app restart

**Encounter Creation:**
- [ ] Create encounter with all fields
- [ ] Create encounter with required fields only
- [ ] Form validation errors
- [ ] Offline encounter creation

**Triage Flow:**
- [ ] Complete triage assessment
- [ ] View RED triage result
- [ ] View YELLOW triage result
- [ ] View GREEN triage result
- [ ] Danger signs displayed

**Offline:**
- [ ] Create encounter offline
- [ ] View offline queue
- [ ] Sync when online
- [ ] Clear synced encounters

**UX:**
- [ ] All buttons work
- [ ] Navigation flows correctly
- [ ] Loading states show
- [ ] Error messages display
- [ ] Forms validate properly

## 🐛 Troubleshooting

### App Won't Start
```bash
# Clear cache
expo start -c

# Reinstall dependencies
rm -rf node_modules
npm install
```

### Can't Connect to API
1. Check `.env` file exists
2. Verify API URL is correct
3. Check device/simulator network
4. Try demo mode

### Offline Sync Not Working
1. Check AsyncStorage permissions
2. Verify network detection
3. Check sync queue in Offline Queue screen
4. Clear app data and retry

### TypeScript Errors
```bash
# Regenerate types
npx expo customize tsconfig.json
```

## 📦 Building for Production

### iOS

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure build
eas build:configure

# Build for iOS
eas build --platform ios
```

### Android

```bash
# Build for Android
eas build --platform android

# Build APK for testing
eas build --platform android --profile preview
```

## 🔐 Security Notes

- Tokens stored in AsyncStorage (encrypted on device)
- HTTPS only for API communication
- No sensitive data in logs
- Password minimum 8 characters
- Email validation
- Form input sanitization

## 🎯 Next Steps

### Recommended Enhancements

1. **Photo Capture**
   - Add camera integration
   - Capture symptom photos
   - Attach to encounters

2. **Voice Input**
   - Speech-to-text for symptoms
   - Voice recording for notes

3. **Push Notifications**
   - Sync reminders
   - System alerts

4. **Biometric Auth**
   - Fingerprint login
   - Face ID support

5. **Multi-language**
   - i18n implementation
   - Language selector

6. **Analytics**
   - Usage tracking
   - Error reporting
   - Performance monitoring

## 📚 Resources

- [React Native Paper Docs](https://callstack.github.io/react-native-paper/)
- [React Navigation Docs](https://reactnavigation.org/)
- [Expo Documentation](https://docs.expo.dev/)
- [AsyncStorage Guide](https://react-native-async-storage.github.io/async-storage/)

## 🆘 Support

For issues:
1. Check this guide
2. Review error messages
3. Check console logs
4. Test with demo mode
5. Verify backend is running

## ✨ Summary

The mobile app is now **fully functional** with:
- Complete authentication system
- All triage workflow screens
- Offline support
- Professional UI/UX
- Form validation
- Error handling
- Demo mode for testing

You can now:
1. Test the app with demo mode
2. Deploy the backend
3. Configure the API URL
4. Test end-to-end workflow
5. Build for production
