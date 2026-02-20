# FirstLine Mobile App

React Native mobile application for healthcare workers to conduct patient triage in low-resource settings.

## Features

- **Patient Encounter Management**: Create and manage patient encounters
- **Symptom Collection**: Record patient symptoms and vital signs
- **AI-Powered Triage**: Get instant triage assessments (RED/YELLOW/GREEN)
- **Offline Support**: Work without internet connection, sync when online
- **Referral Generation**: Create referral documents for healthcare providers
- **Multi-language Support**: (Coming soon)

## Prerequisites

- Node.js 18+ and npm
- Expo CLI: `npm install -g expo-cli`
- iOS Simulator (Mac) or Android Studio (for Android development)
- Expo Go app on your mobile device (for testing)

## Installation

```bash
cd mobile-app
npm install
```

## Configuration

Create a `.env` file in the mobile-app directory:

```env
EXPO_PUBLIC_API_URL=https://<your-backend-url>
```

## Running the App

### Development Mode

```bash
npm start
```

This will start the Expo development server. You can then:
- Press `i` to open iOS simulator
- Press `a` to open Android emulator
- Scan the QR code with Expo Go app on your phone

### iOS

```bash
npm run ios
```

### Android

```bash
npm run android
```

## Building for Production

### iOS

```bash
expo build:ios
```

### Android

```bash
expo build:android
```

## Project Structure

```
mobile-app/
├── src/
│   ├── screens/          # Screen components
│   │   ├── HomeScreen.tsx
│   │   ├── NewEncounterScreen.tsx
│   │   ├── TriageResultScreen.tsx
│   │   ├── ReferralScreen.tsx
│   │   └── OfflineQueueScreen.tsx
│   └── services/         # API and storage services
│       ├── api.ts
│       └── offlineStorage.ts
├── App.tsx              # Main app component with navigation
└── package.json
```

## Key Screens

### Home Screen
- Start new triage
- View offline queue
- System status

### New Encounter Screen
- Collect patient demographics (age, sex, location)
- Record symptoms
- Capture vital signs (optional)

### Triage Result Screen
- View triage level (RED/YELLOW/GREEN)
- See danger signs detected
- Get recommended next steps
- Generate referral if needed

### Offline Queue Screen
- View pending encounters
- Sync with server when online
- Clear synced encounters

## Offline Functionality

The app automatically saves encounters locally when offline and syncs them when connectivity is restored:

1. Encounters are saved to AsyncStorage
2. A sync queue tracks pending uploads
3. Manual or automatic sync when online
4. Retry logic with exponential backoff

## Testing

```bash
npm test
```

## Troubleshooting

### Metro Bundler Issues
```bash
expo start -c
```

### iOS Simulator Not Opening
```bash
sudo xcode-select --switch /Applications/Xcode.app
```

### Android Emulator Issues
Ensure Android Studio and emulator are properly installed and configured.

## License

CC BY 4.0
