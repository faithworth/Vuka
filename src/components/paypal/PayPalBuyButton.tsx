'use client';

/**
 * <PayPalBuyButton>
 *
 * International checkout via PayPal. Mirrors the Paystack BuyModal flow:
 *   1. Click → fetch FX preview (no buyer details needed)
 *   2. Buyer enters name + email
 *   3. create-order → Purchase(pending) + PayPal order
 *   4. Redirect to PayPal approval page
 *   5. PayPal → /checkout/paypal/return → capture-order → download
 *
 * Usage:
 *   <PayPalBuyButton
 *     itemType="beat"
 *     itemId={beat.id}
 *     itemTitle={beat.title}
 *     priceZAR={beat.basicPrice}
 *     licenseType="basic"
 *   />
 */

import { useState, useCallback } from 'react';

type ItemType    = 'beat' | 'release' | 'video' | 'sample';
type LicenseType = 'basic' | 'premium' | 'exclusive';

type Phase =
  | 'idle'
  | 'fetching-rate'
  | 'awaiting-details'
  | 'creating-order'
  | 'redirecting'
  | 'error';

interface Props {
  itemType:     ItemType;
  itemId:       string;
  itemTitle:    string;
  priceZAR:     number;
  licenseType?: LicenseType;
  disabled?:    boolean;
  onSuccess?:   (downloadUrl: string) => void;
  className?:   string;
}

export default function PayPalBuyButton({
  itemType,
  itemId,
  itemTitle,
  priceZAR,
  licenseType = 'basic',
  disabled,
  onSuccess,
  className,
}: Props) {
  const [phase,       setPhase]       = useState<Phase>('idle');
  const [error,       setError]       = useState('');
  const [usdPreview,  setUsdPreview]  = useState<number | null>(null);
  const [fxSource,    setFxSource]    = useState('');
  const [showModal,   setShowModal]   = useState(false);
  const [email,       setEmail]       = useState('');
  const [name,        setName]        = useState('');

  const reset = useCallback(() => {
    setPhase('idle');
    setError('');
    setShowModal(false);
    setEmail('');
    setName('');
    setUsdPreview(null);
  }, []);

  // ── Step 1: fetch FX preview ────────────────────────────────────────────
  const handleClick = useCallback(async () => {
    if (disabled || phase !== 'idle') return;
    setError('');
    setPhase('fetching-rate');
    setShowModal(true);

    try {
      const res  = await fetch('/api/checkout/paypal/create-order', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ itemType, itemId, licenseType }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Failed to load PayPal. Try again.');
        setPhase('error');
        return;
      }

      setUsdPreview(data.amountUSD);
      setFxSource(data.fxSource ?? '');
      setPhase('awaiting-details');
    } catch {
      setError('Network error. Check your connection and try again.');
      setPhase('error');
    }
  }, [disabled, phase, itemType, itemId, licenseType]);

  // ── Step 2: create order → redirect ────────────────────────────────────
  const handleProceed = useCallback(async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName  = name.trim();
    if (!trimmedEmail.includes('@') || !trimmedName) return;

    setPhase('creating-order');

    // Persist buyer details so the return page can include them in the capture call
    sessionStorage.setItem('vuka_buyer_name',  trimmedName);
    sessionStorage.setItem('vuka_buyer_email', trimmedEmail);

    try {
      const res  = await fetch('/api/checkout/paypal/create-order', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          itemType,
          itemId,
          licenseType,
          buyerEmail: trimmedEmail,
          buyerName:  trimmedName,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.approveUrl) {
        setError(data.error ?? 'Failed to start PayPal checkout.');
        setPhase('error');
        return;
      }

      setPhase('redirecting');
      setTimeout(() => { window.location.href = data.approveUrl; }, 400);
    } catch {
      setError('Network error. Check your connection and try again.');
      setPhase('error');
    }
  }, [email, name, itemType, itemId, licenseType]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className={className} style={{ width: '100%' }}>
      <button
        onClick={handleClick}
        disabled={!!disabled || phase !== 'idle'}
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          gap:            8,
          width:          '100%',
          padding:        '13px 20px',
          background:     '#FFC439',
          color:          '#003087',
          border:         'none',
          borderRadius:   12,
          fontWeight:     700,
          fontSize:       15,
          cursor:         disabled || phase !== 'idle' ? 'not-allowed' : 'pointer',
          opacity:        disabled ? 0.5 : 1,
          transition:     'opacity 0.15s, transform 0.1s',
        }}
        onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
        onMouseUp={(e)   => (e.currentTarget.style.transform = 'scale(1)')}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M7.07 10.43c.18-1.17 1.17-2.05 2.35-2.05h4.5c2.35 0 3.99 1.84 3.6 4.12-.38 2.27-2.6 4.12-4.96 4.12H11.5l-.55 3.32H8.42l1.97-11.7-.59.11-.73.08z" fill="#009cde" />
          <path d="M5.5 7.5c.18-1.17 1.17-2 2.35-2h5.9c2.36 0 4 1.84 3.6 4.12-.14.85-.5 1.62-1.03 2.24-.82.97-2.04 1.55-3.34 1.55H10.5l-.55 3.32H7.42L5.5 7.5z" fill="#003087" />
        </svg>
        Pay with PayPal
      </button>

      {showModal && (
        <div
          onClick={(e) => e.target === e.currentTarget && reset()}
          style={{
            position:       'fixed',
            inset:          0,
            background:     'rgba(0,0,0,0.75)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            zIndex:         9999,
            padding:        '1rem',
          }}
        >
          <div style={{
            background:   'var(--surface, #141414)',
            border:       '1px solid var(--border, rgba(255,255,255,0.1))',
            borderRadius: 16,
            padding:      '28px 24px',
            width:        '100%',
            maxWidth:     400,
            color:        'var(--text, #fafafa)',
            fontFamily:   'inherit',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <p style={{ fontWeight: 700, fontSize: 17, margin: 0 }}>{itemTitle}</p>
                <p style={{ color: 'var(--text-muted, rgba(255,255,255,0.5))', fontSize: 13, margin: '4px 0 0' }}>
                  International checkout via PayPal
                </p>
              </div>
              <button
                onClick={reset}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted, rgba(255,255,255,0.4))', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '0 0 0 8px' }}
              >×</button>
            </div>

            {/* Price summary */}
            <div style={{ background: 'var(--surface-2, rgba(255,255,255,0.05))', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span style={{ color: 'var(--text-muted, rgba(255,255,255,0.5))' }}>Price (ZAR)</span>
                <span style={{ fontWeight: 600 }}>R{priceZAR.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginTop: 6 }}>
                <span style={{ color: 'var(--text-muted, rgba(255,255,255,0.5))' }}>
                  You pay (USD)
                  {fxSource && <span style={{ fontSize: 11, marginLeft: 4, opacity: 0.5 }}>· live rate</span>}
                </span>
                <span style={{ fontWeight: 700, color: '#FFC439' }}>
                  {usdPreview !== null ? `$${usdPreview.toFixed(2)}` : '…'}
                </span>
              </div>
            </div>

            {phase === 'fetching-rate' && (
              <p style={{ textAlign: 'center', color: 'var(--text-muted, rgba(255,255,255,0.5))', fontSize: 14, margin: '16px 0' }}>
                Loading exchange rate…
              </p>
            )}

            {(phase === 'awaiting-details' || phase === 'creating-order') && (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-muted, rgba(255,255,255,0.5))', display: 'block', marginBottom: 6 }}>
                    Your name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full name"
                    disabled={phase === 'creating-order'}
                    style={{
                      width: '100%', padding: '10px 12px',
                      background: 'var(--surface-2, rgba(255,255,255,0.06))',
                      border: '1px solid var(--border, rgba(255,255,255,0.12))',
                      borderRadius: 8, color: 'var(--text, #fafafa)',
                      fontSize: 14, outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-muted, rgba(255,255,255,0.5))', display: 'block', marginBottom: 6 }}>
                    Email (download link sent here)
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    disabled={phase === 'creating-order'}
                    onKeyDown={(e) => e.key === 'Enter' && handleProceed()}
                    style={{
                      width: '100%', padding: '10px 12px',
                      background: 'var(--surface-2, rgba(255,255,255,0.06))',
                      border: '1px solid var(--border, rgba(255,255,255,0.12))',
                      borderRadius: 8, color: 'var(--text, #fafafa)',
                      fontSize: 14, outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>

                <button
                  onClick={handleProceed}
                  disabled={!email.includes('@') || !name.trim() || phase === 'creating-order'}
                  style={{
                    width: '100%', padding: '13px',
                    background: '#FFC439', color: '#003087',
                    border: 'none', borderRadius: 10,
                    fontWeight: 700, fontSize: 15,
                    cursor: phase === 'creating-order' ? 'wait' : 'pointer',
                    opacity: (!email.includes('@') || !name.trim()) ? 0.5 : 1,
                  }}
                >
                  {phase === 'creating-order'
                    ? 'Preparing PayPal…'
                    : `Continue to PayPal · $${usdPreview?.toFixed(2)}`}
                </button>
              </div>
            )}

            {phase === 'redirecting' && (
              <p style={{ textAlign: 'center', color: 'var(--text-muted, rgba(255,255,255,0.5))', fontSize: 14, margin: '16px 0' }}>
                Redirecting to PayPal…
              </p>
            )}

            {phase === 'error' && (
              <div>
                <p style={{ color: '#ef4444', fontSize: 14, marginBottom: 16, textAlign: 'center' }}>
                  {error}
                </p>
                <button
                  onClick={reset}
                  style={{
                    width: '100%', padding: '11px',
                    background: 'rgba(255,255,255,0.07)',
                    color: 'var(--text, #fafafa)',
                    border: '1px solid var(--border, rgba(255,255,255,0.12))',
                    borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer',
                  }}
                >
                  Try again
                </button>
              </div>
            )}

            <p style={{ fontSize: 11, color: 'var(--text-muted, rgba(255,255,255,0.3))', textAlign: 'center', margin: '16px 0 0' }}>
              You'll be redirected to PayPal to complete your purchase securely.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
