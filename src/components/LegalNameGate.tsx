'use client';
// src/components/LegalNameGate.tsx
// A dismissible-but-persistent prompt shown to artists/producers whose
// User.legalName is still null — this happens for anyone who signed up via
// Google OAuth, since that flow skips the registration form entirely.
// Not a hard block: they can dismiss and keep using the dashboard, but the
// underlying payout-verification flow (verify_bank_account / admin payouts)
// already requires isVerified on the bank account regardless, so nothing
// unsafe happens if this gets skipped — it just means we ask again next visit.

import { useState } from 'react';
import { X, ShieldCheck, Loader2 } from 'lucide-react';

interface LegalNameGateProps {
  onSaved: (legalName: string) => void;
}

export default function LegalNameGate({ onSaved }: LegalNameGateProps) {
  const [open, setOpen] = useState(true);
  const [legalName, setLegalName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!legalName.trim() || legalName.trim().length < 2) {
      setError('Please enter your full legal name.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/account/legal-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ legalName: legalName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        setLoading(false);
        return;
      }
      onSaved(data.legalName);
      setOpen(false);
    } catch {
      setError('Network error — please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div className="w-full max-w-md rounded-2xl p-6 relative"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

        <button
          onClick={() => setOpen(false)}
          aria-label="Remind me later"
          className="absolute top-4 right-4"
          style={{ color: 'var(--text-muted)' }}>
          <X size={18} />
        </button>

        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck size={20} style={{ color: 'var(--sky)' }} />
          <h2 className="font-bold text-base" style={{ color: 'var(--text)' }}>
            One quick thing before you get paid
          </h2>
        </div>

        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
          Your account is set up with a public stage name, but we're missing your{' '}
          <strong>legal name</strong> — the name on your bank account. We need this to verify
          your payouts before any money is sent. This is private and never shown on your profile.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            className="input w-full"
            type="text"
            placeholder="Legal name (as it appears on your bank account)"
            value={legalName}
            onChange={e => setLegalName(e.target.value)}
            autoFocus
          />

          {error && (
            <p className="text-sm px-3 py-2 rounded-lg"
              style={{ background: 'rgba(204,26,26,0.1)', color: 'var(--red)' }}>
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn btn-secondary flex-1"
            >
              Remind me later
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary flex-1 disabled:opacity-60"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
