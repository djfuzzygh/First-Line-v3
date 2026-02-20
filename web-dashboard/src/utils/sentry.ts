// Sentry Error Tracking Configuration
// Install: npm install @sentry/react

/*
import * as Sentry from '@sentry/react';

export function initSentry() {
  if (import.meta.env.VITE_SENTRY_DSN) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE,
      integrations: [
        new Sentry.BrowserTracing(),
        new Sentry.Replay(),
      ],
      tracesSampleRate: 1.0,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
    });
  }
}

export function captureError(error: Error, context?: Record<string, any>) {
  console.error('Error:', error, context);
  if (import.meta.env.VITE_SENTRY_DSN) {
    Sentry.captureException(error, { extra: context });
  }
}
*/

// Placeholder implementation until Sentry is configured
export function initSentry() {
  console.log('Sentry not configured. Set VITE_SENTRY_DSN to enable error tracking.');
}

export function captureError(error: Error, context?: Record<string, any>) {
  console.error('Error:', error, context);
}
