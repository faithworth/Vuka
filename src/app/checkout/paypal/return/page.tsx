'use client';

/**
 * /checkout/paypal/return
 *
 * PayPal redirects the buyer here after they approve the payment.
 * We capture the order and redirect to the download page.
 *
 * Query params from PayPal:
 *   token       — the PayPal order ID
 *   PayerID     — the buyer's PayPal account ID
 *
 * Our params (set in create-order returnUrl):
 *   itemType    — beat | release | video | sample
 *   itemId      — DB id of the item
 */

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type State =
  | { phase: 'capturing' }
  | { phase: 'redirecting'; downloadUrl: string }
  | { phase: 'error'; message: string };

export default function PayPalReturnPage() {
  const params = useSearchParams();
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: 'capturing' });

  useEffect(() => {
    const orderId   = params.get('token');
    const itemType  = params.get('itemType');
    const itemId    = params.get('itemId');

    if (!orderId || !itemType || !itemId) {
      setState({ phase: 'error', message: 'Missing payment details. Please contact support.' });
      return;
    }

    // Pull buyer details from sessionStorage (set by the checkout page)
    const buyerName  = sessionStorage.getItem('vuka_buyer_name')  ?? 'Customer';
    const buyerEmail = sessionStorage.getItem('vuka_buyer_email') ?? '';

    if (!buyerEmail) {
      setState({ phase: 'error', message: 'Session expired. Please try your purchase again.' });
      return;
    }

    (async () => {
      try {
        const res = await fetch('/api/checkout/paypal/capture-order', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, itemType, itemId, buyerName, buyerEmail }),
        });

        const data = await res.json();

        if (!res.ok || !data.ok) {
          setState({
            phase:   'error',
            message: data.error ?? 'Payment capture failed. If you were charged, contact support.',
          });
          return;
        }

        // Clean up session storage
        sessionStorage.removeItem('vuka_buyer_name');
        sessionStorage.removeItem('vuka_buyer_email');

        setState({ phase: 'redirecting', downloadUrl: data.downloadUrl });

        // Redirect to download page
        setTimeout(() => router.push(data.downloadUrl), 800);

      } catch {
        setState({
          phase:   'error',
          message: 'Network error. Check your connection and try again.',
        });
      }
    })();
  }, [params, router]);

  return (
    <div style={{
      minHeight:      '60vh',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      padding:        '2rem',
      textAlign:      'center',
    }}>
      {state.phase === 'capturing' && (
        <div>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
          <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>
            Confirming your payment…
          </p>
        </div>
      )}

      {state.phase === 'redirecting' && (
        <div>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <p style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Payment confirmed!</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            Redirecting to your download…
          </p>
        </div>
      )}

      {state.phase === 'error' && (
        <div>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <p style={{ fontWeight: 700, fontSize: 18, marginBottom: 8, color: '#ef4444' }}>
            Something went wrong
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, maxWidth: 360, margin: '0 auto 24px' }}>
            {state.message}
          </p>
          <a
            href="/store"
            style={{
              padding:      '10px 24px',
              background:   'var(--green, #22c55e)',
              color:        '#0a0a0a',
              borderRadius: 10,
              fontWeight:   700,
              fontSize:     14,
              textDecoration: 'none',
            }}
          >
            Back to store
          </a>
        </div>
      )}
    </div>
  );
}
