'use client';

import { useEffect } from 'react';

// This catches errors in the root layout (before the app shell renders).
// It must render its own <html> and <body> tags because the normal layout
// may have failed.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && (window as any).__sentryHub) {
        (window as any).__sentryHub.captureException(error);
      }
    } catch { /* never throw inside an error boundary */ }

    if (process.env.NODE_ENV !== 'production') {
      console.error('[Vuka] Global error:', error);
    }
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin:          0,
          background:      '#0a0a0a',
          color:           '#fafafa',
          fontFamily:      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          minHeight:       '100vh',
          textAlign:       'center',
          padding:         '2rem',
          boxSizing:       'border-box',
        }}
      >
        <div>
          <div style={{ fontSize: 56, marginBottom: 16 }}>⚡</div>
          <h1
            style={{
              fontSize:     24,
              fontWeight:   700,
              marginBottom: 12,
            }}
          >
            Vuka ran into a problem
          </h1>
          <p
            style={{
              fontSize:     14,
              color:        'rgba(255,255,255,0.5)',
              marginBottom: 8,
              maxWidth:     400,
              margin:       '0 auto 8px',
            }}
          >
            A critical error occurred. Our team has been notified automatically.
          </p>
          {error.digest && (
            <p
              style={{
                fontSize:     11,
                color:        'rgba(255,255,255,0.3)',
                fontFamily:   'monospace',
                marginBottom: 32,
              }}
            >
              Error ID: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              padding:         '12px 28px',
              background:      '#22c55e',
              color:           '#0a0a0a',
              border:          'none',
              borderRadius:    10,
              fontWeight:      700,
              fontSize:        14,
              cursor:          'pointer',
              marginTop:       error.digest ? 0 : 24,
            }}
          >
            Reload page
          </button>
        </div>
      </body>
    </html>
  );
}
