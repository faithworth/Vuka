'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Vuka] Unhandled error:', error);
  }, [error]);

  return (
    <html>
      <body style={{ background: '#0a0a0a', margin: 0, fontFamily: 'sans-serif' }}>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          textAlign: 'center',
        }}>
          <div>
            <div style={{ fontSize: 64, marginBottom: 16 }}>⚡</div>
            <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
              Something went wrong
            </h1>
            <p style={{ color: '#888', fontSize: 15, marginBottom: 32, maxWidth: 400 }}>
              We hit an unexpected error. Our team has been notified.
              {error.digest && (
                <span style={{ display: 'block', fontSize: 12, marginTop: 8, fontFamily: 'monospace', color: '#555' }}>
                  Ref: {error.digest}
                </span>
              )}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={reset}
                style={{
                  padding: '10px 24px',
                  background: '#1db954',
                  color: '#000',
                  border: 'none',
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Try again
              </button>
              <Link
                href="/"
                style={{
                  padding: '10px 24px',
                  background: 'transparent',
                  color: '#888',
                  border: '1px solid #333',
                  borderRadius: 10,
                  fontWeight: 600,
                  fontSize: 14,
                  textDecoration: 'none',
                }}
              >
                Go home
              </Link>
            </div>
            <p style={{ color: '#444', fontSize: 13, marginTop: 32 }}>
              Need help?{' '}
              <a href="mailto:support@vuka.co.za" style={{ color: '#666', textDecoration: 'underline' }}>
                support@vuka.co.za
              </a>
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
