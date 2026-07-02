'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Capture to Sentry via the browser SDK.
    // @sentry/nextjs automatically instruments this boundary when installed;
    // this explicit call is belt-and-suspenders for cases where auto-capture
    // fires before the SDK initialises.
    try {
      if (typeof window !== 'undefined' && (window as any).__sentryHub) {
        (window as any).__sentryHub.captureException(error);
      }
    } catch {
      // Never let error reporting break the error boundary itself
    }

    // Always log to console in dev — Sentry swallows in production
    if (process.env.NODE_ENV !== 'production') {
      console.error('[Vuka Music] Page error:', error);
    }
  }, [error]);

  return (
    <div
      style={{
        minHeight:      '60vh',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '2rem',
        textAlign:      'center',
      }}
    >
      <div>
        <div style={{ fontSize: 48, marginBottom: 12 }}>⚡</div>
        <h2
          style={{
            color:        'var(--text)',
            fontSize:     22,
            fontWeight:   700,
            marginBottom: 8,
          }}
        >
          Something went wrong
        </h2>
        <p
          style={{
            color:       'var(--text-muted)',
            fontSize:    14,
            marginBottom: 24,
            maxWidth:    360,
          }}
        >
          This page hit an unexpected error.
          {error.digest && (
            <span
              style={{
                display:    'block',
                fontSize:   11,
                marginTop:  6,
                fontFamily: 'monospace',
                opacity:    0.6,
              }}
            >
              Ref: {error.digest}
            </span>
          )}
        </p>
        <button
          onClick={reset}
          style={{
            padding:      '10px 24px',
            background:   'var(--green)',
            color:        '#0a0a0a',
            border:       'none',
            borderRadius: 10,
            fontWeight:   700,
            fontSize:     14,
            cursor:       'pointer',
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
