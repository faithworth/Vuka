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
    console.error('[Vuka] Page error:', error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <div>
        <div style={{ fontSize: 48, marginBottom: 12 }}>⚡</div>
        <h2 style={{ color: 'var(--text)', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
          Something went wrong
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24, maxWidth: 360 }}>
          This page hit an unexpected error.
          {error.digest && (
            <span style={{ display: 'block', fontSize: 11, marginTop: 6, fontFamily: 'monospace', opacity: 0.6 }}>
              Ref: {error.digest}
            </span>
          )}
        </p>
        <button
          onClick={reset}
          style={{
            padding: '10px 24px',
            background: 'var(--green)',
            color: '#0a0a0a',
            border: 'none',
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
