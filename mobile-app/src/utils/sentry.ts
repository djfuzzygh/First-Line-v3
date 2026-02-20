// Sentry Error Tracking Configuration
// Install: npm install @sentry/react-native

/*
import * as Sentry from '@sentry/react-native';

export function initSentry() {
  if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
      environment: __DEV__ ? 'development' : 'production',
      tracesSampleRate: 1.0,
      enableAutoSessionTracking: true,
      sessionTrackingIntervalMillis: 10000,
    });
  }
}

export function captureError(error: Error, context?: Record<string, any>) {
  console.error('Error:', error, context);
  if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
    Sentry.captureException(error, { extra: context });
  }
}
*/

// Placeholder implementation until Sentry is configured
export function initSentry() {
  console.log('Sentry not configured. Set EXPO_PUBLIC_SENTRY_DSN to enable error tracking.');
}

export function captureError(error: Error, context?: Record<string, any>) {
  console.error('Error:', error, context);
}
