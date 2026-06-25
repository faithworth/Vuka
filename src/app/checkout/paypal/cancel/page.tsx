'use client';

/**
 * /checkout/paypal/cancel
 * Buyer clicked "Cancel" on the PayPal approval page.
 * No charge was made.
 */

import { useRouter } from 'next/navigation';

export default function PayPalCancelPage() {
  const router = useRouter();

  return (
    <div style={{
      minHeight:      '60vh',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      padding:        '2rem',
      textAlign:      'center',
    }}>
      <div>
        <div style={{ fontSize: 40, marginBottom: 12 }}>↩️</div>
        <p style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Payment cancelled</p>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, maxWidth: 320, margin: '0 auto 24px' }}>
          No charge was made. You can go back and try again anytime.
        </p>
        <button
          onClick={() => router.back()}
          style={{
            padding:      '10px 24px',
            background:   'var(--green, #22c55e)',
            color:        '#0a0a0a',
            border:       'none',
            borderRadius: 10,
            fontWeight:   700,
            fontSize:     14,
            cursor:       'pointer',
          }}
        >
          Go back
        </button>
      </div>
    </div>
  );
}
