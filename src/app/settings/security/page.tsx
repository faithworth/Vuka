'use client';
/**
 * VUKA — Security Settings  (/settings/security)
 * Phase 10 · Applies to all user roles
 *
 * Features:
 * – 2FA setup / enable / disable / regenerate backup codes
 * – Active device sessions list (revoke one / revoke all)
 * – Change password
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Shield, ShieldCheck, ShieldOff, Smartphone, Monitor, Laptop, Tablet, CheckCircle2, XCircle, Eye, EyeOff, Clock, Key, Lock, RefreshCw, LogOut, AlertTriangle, Copy, Check, ChevronRight, X,
} from 'lucide-react';
import VukaLoader from '@/components/brand/VukaLoader';

// ── Types ─────────────────────────────────────────────────────

interface TwoFAStatus {
  isEnabled: boolean;
  enabledAt: string | null;
  backupCodesRemaining: number;
}

interface SessionRecord {
  id: string;
  sessionId: string;
  deviceName: string;
  browser: string;
  os: string;
  ipAddress: string;
  isCurrent: boolean;
  lastSeenAt: string;
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────

function DeviceIcon({ os, deviceName }: { os: string; deviceName: string }) {
  const s = `${os}${deviceName}`.toLowerCase();
  if (s.includes('iphone') || s.includes('android') || s.includes('mobile'))
    return <Smartphone size={16} style={{ color: 'var(--color-accent-green)' }} />;
  if (s.includes('ipad') || s.includes('tablet'))
    return <Tablet size={16} style={{ color: 'var(--color-accent-green)' }} />;
  if (s.includes('mac') || s.includes('windows') || s.includes('linux'))
    return <Laptop size={16} style={{ color: 'var(--color-accent-green)' }} />;
  return <Monitor size={16} style={{ color: 'var(--color-accent-green)' }} />;
}

function timeAgo(d: string): string {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60_000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const dy = Math.floor(h / 24);
  if (dy < 7) return `${dy}d ago`;
  return new Date(d).toLocaleDateString();
}

// ── Modal: Setup 2FA ──────────────────────────────────────────

function SetupModal({
  onClose,
  onEnabled,
}: {
  onClose: () => void;
  onEnabled: () => void;
}) {
  type Step = 'loading' | 'qr' | 'verify' | 'backup' | 'success';
  const [step, setStep] = useState<Step>('loading');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/auth/2fa?action=setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
      .then(r => r.json())
      .then(d => {
        setQrCode(d.qrCode ?? '');
        setSecret(d.secret ?? '');
        setBackupCodes(d.backupCodes ?? []);
        setStep('qr');
      })
      .catch(() => setError('Failed to start 2FA setup. Please try again.'));
  }, []);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/auth/2fa?action=enable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const d = await res.json();
    setLoading(false);
    if (!res.ok) { setError(d.error ?? 'Invalid code.'); return; }
    setStep('backup');
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const steps = ['qr', 'verify', 'backup'];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.8)' }}
      onClick={e => { if (e.target === e.currentTarget && step !== 'loading') onClose(); }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-tertiary)' }}>

        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} style={{ color: 'var(--color-accent-green)' }} />
            <h2 className="font-bold" style={{ color: 'var(--color-text-primary)' }}>
              {step === 'backup' ? 'Save Backup Codes' : 'Enable Two-Factor Auth'}
            </h2>
          </div>
          {step !== 'loading' && step !== 'success' && (
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
              <X size={17} />
            </button>
          )}
        </div>

        {/* Step dots */}
        {!['loading', 'success'].includes(step) && (
          <div className="flex items-center gap-1.5 px-5 pb-3">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center gap-1.5">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    background: step === s || steps.indexOf(step) > i
                      ? 'var(--color-accent-green)'
                      : 'var(--color-border-tertiary)',
                    color: step === s || steps.indexOf(step) > i ? '#000' : 'var(--color-text-secondary)',
                  }}>
                  {steps.indexOf(step) > i ? <Check size={11} /> : i + 1}
                </div>
                {i < 2 && (
                  <div className="w-6 h-px" style={{
                    background: steps.indexOf(step) > i
                      ? 'var(--color-accent-green)'
                      : 'var(--color-border-tertiary)',
                  }} />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="px-5 pb-5 space-y-4">
          {/* Loading */}
          {step === 'loading' && (
            <div className="flex flex-col items-center py-10 gap-3">
              <VukaLoader size={28} />
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Generating secure key…</p>
              {error && <p className="text-sm" style={{ color: '#f87171' }}>{error}</p>}
            </div>
          )}

          {/* QR step */}
          {step === 'qr' && (
            <>
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                Scan with Google Authenticator, Authy, or any TOTP-compatible app.
              </p>
              {qrCode && (
                <div className="flex justify-center">
                  <div className="p-3 rounded-xl bg-white">
                    <img src={qrCode} alt="2FA QR Code" className="w-44 h-44" />
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Or enter key manually:</p>
                <div className="flex items-center gap-2 p-2.5 rounded-lg font-mono text-xs"
                  style={{ background: 'var(--color-background)', border: '1px solid var(--color-border-tertiary)' }}>
                  <span className="flex-1 break-all transition-all"
                    style={{
                      color: 'var(--color-text-primary)',
                      filter: showSecret ? 'none' : 'blur(5px)',
                    }}>
                    {secret}
                  </span>
                  <button
                    onClick={() => setShowSecret(v => !v)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
                    {showSecret ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  <button
                    onClick={() => copy(secret)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? 'var(--color-accent-green)' : 'var(--color-text-secondary)' }}>
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                </div>
              </div>
              <button onClick={() => setStep('verify')} className="btn btn-primary w-full gap-1">
                I've scanned it <ChevronRight size={14} />
              </button>
            </>
          )}

          {/* Verify step */}
          {step === 'verify' && (
            <form onSubmit={handleVerify} className="space-y-4">
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                Enter the 6-digit code shown in your authenticator app to confirm setup.
              </p>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                className="input text-center text-3xl font-mono tracking-[0.5em] py-5"
                placeholder="000000"
                value={token}
                onChange={e => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                required
              />
              {error && <p className="text-sm" style={{ color: '#f87171' }}>{error}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setStep('qr')} className="btn btn-secondary flex-1">
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading || token.length !== 6}
                  className="btn btn-primary flex-1 disabled:opacity-60">
                  {loading ? <VukaLoader size={14} /> : 'Verify & Enable'}
                </button>
              </div>
            </form>
          )}

          {/* Backup codes */}
          {step === 'backup' && (
            <>
              <div className="px-3 py-2.5 rounded-lg text-xs flex items-start gap-2"
                style={{
                  background: 'rgba(251,191,36,0.1)',
                  border: '1px solid rgba(251,191,36,0.3)',
                  color: '#fbbf24',
                }}>
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                Save these in a secure location. Each code can only be used once. They're your only way in if you lose your authenticator.
              </div>
              <div className="grid grid-cols-2 gap-1.5 p-3 rounded-xl"
                style={{ background: 'var(--color-background)', border: '1px solid var(--color-border-tertiary)' }}>
                {backupCodes.map((c, i) => (
                  <div key={i}
                    className="font-mono text-xs py-1.5 text-center rounded"
                    style={{
                      color: 'var(--color-accent-green)',
                      background: 'rgba(160,232,124,0.06)',
                      border: '1px solid rgba(160,232,124,0.15)',
                    }}>
                    {c}
                  </div>
                ))}
              </div>
              <button
                onClick={() => copy(backupCodes.join('\n'))}
                className="btn btn-secondary w-full gap-2 text-sm">
                {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy All Codes</>}
              </button>
              <button
                onClick={() => {
                  setStep('success');
                  setTimeout(() => { onEnabled(); onClose(); }, 1200);
                }}
                className="btn btn-primary w-full">
                I've saved my codes — Finish
              </button>
            </>
          )}

          {/* Success */}
          {step === 'success' && (
            <div className="flex flex-col items-center py-8 gap-3">
              <CheckCircle2 size={44} style={{ color: 'var(--color-accent-green)' }} />
              <p className="font-bold" style={{ color: 'var(--color-text-primary)' }}>2FA Enabled!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Modal: Disable 2FA ────────────────────────────────────────

function DisableModal({
  onClose,
  onDisabled,
}: {
  onClose: () => void;
  onDisabled: () => void;
}) {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/auth/2fa?action=disable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const d = await res.json();
    setLoading(false);
    if (!res.ok) { setError(d.error ?? 'Invalid code.'); return; }
    onDisabled();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.8)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl"
        style={{ background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-tertiary)' }}>
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldOff size={17} style={{ color: '#f87171' }} />
              <h2 className="font-bold" style={{ color: 'var(--color-text-primary)' }}>Disable 2FA</h2>
            </div>
            <button onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
              <X size={16} />
            </button>
          </div>

          <div className="px-3 py-2.5 rounded-lg text-xs"
            style={{ background: 'rgba(255,77,77,0.1)', border: '1px solid rgba(255,77,77,0.25)', color: '#f87171' }}>
            Disabling 2FA reduces your account security. Enter your current code or a backup code to confirm.
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              className="input text-center text-2xl font-mono tracking-[0.5em] py-4"
              placeholder="000000"
              value={token}
              onChange={e => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
            />
            {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="btn btn-secondary flex-1">Cancel</button>
              <button
                type="submit"
                disabled={loading || token.length !== 6}
                className="btn flex-1 disabled:opacity-60"
                style={{ background: '#ef4444', color: '#fff', border: 'none' }}>
                {loading ? <VukaLoader size={14} /> : 'Disable 2FA'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Modal: Change Password ────────────────────────────────────

function ChangePasswordModal({
  onClose,
  currentSessionId,
}: {
  onClose: () => void;
  currentSessionId: string;
}) {
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    setError('');
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: newPw, currentSessionId }),
    });
    const d = await res.json();
    setLoading(false);
    if (!res.ok) { setError(d.error ?? 'Failed to change password.'); return; }
    setDone(true);
    setTimeout(onClose, 2000);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.8)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl"
        style={{ background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-tertiary)' }}>
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key size={17} style={{ color: 'var(--color-accent-green)' }} />
              <h2 className="font-bold" style={{ color: 'var(--color-text-primary)' }}>Change Password</h2>
            </div>
            <button onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
              <X size={16} />
            </button>
          </div>

          {done ? (
            <div className="flex flex-col items-center py-6 gap-2">
              <CheckCircle2 size={36} style={{ color: 'var(--color-accent-green)' }} />
              <p className="font-bold" style={{ color: 'var(--color-text-primary)' }}>Password Changed!</p>
              <p className="text-xs text-center" style={{ color: 'var(--color-text-secondary)' }}>
                All other devices have been signed out.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="relative">
                <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'var(--color-text-secondary)' }} />
                <input
                  type={showPw ? 'text' : 'password'}
                  className="input pl-9 pr-9"
                  placeholder="New password (min. 8 characters)"
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  required
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
                  {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>

              <input
                type="password"
                className="input"
                placeholder="Confirm new password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
              />

              {confirm && newPw !== confirm && (
                <p className="text-xs" style={{ color: '#f87171' }}>Passwords do not match.</p>
              )}
              {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}

              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                Changing your password signs out all other devices.
              </p>

              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="btn btn-secondary flex-1">Cancel</button>
                <button
                  type="submit"
                  disabled={loading || newPw.length < 8 || newPw !== confirm}
                  className="btn btn-primary flex-1 disabled:opacity-60">
                  {loading ? <VukaLoader size={14} /> : 'Update Password'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export default function SecurityPage() {
  const [loading, setLoading] = useState(true);
  const [twoFA, setTwoFA] = useState<TwoFAStatus | null>(null);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState('');
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [modal, setModal] = useState<'setup' | 'disable' | 'changepw' | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3200);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tfaRes, devRes] = await Promise.allSettled([
        fetch('/api/auth/2fa').then(r => r.ok ? r.json() : null),
        fetch('/api/auth/devices').then(r => r.ok ? r.json() : { sessions: [] }),
      ]);

      if (tfaRes.status === 'fulfilled' && tfaRes.value) {
        setTwoFA(tfaRes.value as TwoFAStatus);
      }
      if (devRes.status === 'fulfilled') {
        const d = devRes.value as { sessions: SessionRecord[] };
        setSessions(d.sessions ?? []);
      }

      // Register current session if not stored
      const stored = sessionStorage.getItem('vuka_session_id');
      if (!stored) {
        const r = await fetch('/api/auth/devices?action=register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }).then(r => r.ok ? r.json() : null).catch(() => null);

        if (r?.sessionId) {
          sessionStorage.setItem('vuka_session_id', r.sessionId);
          setCurrentSessionId(r.sessionId);
          // Re-fetch sessions with updated current marker
          const fresh = await fetch('/api/auth/devices')
            .then(r => r.ok ? r.json() : null).catch(() => null);
          if (fresh?.sessions) setSessions(fresh.sessions);
        }
      } else {
        setCurrentSessionId(stored);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function revokeOne(s: SessionRecord) {
    setRevoking(s.id);
    const res = await fetch('/api/auth/devices?action=revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: s.id }),
    });
    setRevoking(null);
    if (res.ok) {
      setSessions(prev => prev.filter(x => x.id !== s.id));
      showToast(`${s.deviceName} signed out`);
    } else {
      showToast('Failed to sign out device.', false);
    }
  }

  async function revokeAll() {
    if (!confirm('Sign out of all other devices?')) return;
    setRevokingAll(true);
    const res = await fetch('/api/auth/devices?action=revoke-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentSessionId }),
    });
    const d = await res.json();
    setRevokingAll(false);
    if (res.ok) {
      setSessions(prev => prev.filter(s => s.isCurrent));
      showToast(d.message ?? 'Done');
    } else {
      showToast('Failed.', false);
    }
  }

  const currentSession = sessions.find(s => s.isCurrent);
  const otherSessions = sessions.filter(s => !s.isCurrent);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--color-background)' }}>
        <VukaLoader size={22} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
      {/* Page header */}
      <div className="flex items-center gap-2 mb-6">
        <Shield size={20} style={{ color: 'var(--color-accent-green)' }} />
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            Account Security
          </h1>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Manage two-factor authentication, active devices, and your password
          </p>
        </div>
      </div>

      {/* ── 2FA ────────────────────────────────────── */}
      <div className="card p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: twoFA?.isEnabled
                ? 'rgba(160,232,124,0.12)'
                : 'var(--color-background-secondary)',
            }}>
            {twoFA?.isEnabled
              ? <ShieldCheck size={18} style={{ color: 'var(--color-accent-green)' }} />
              : <ShieldOff size={18} style={{ color: 'var(--color-text-secondary)' }} />}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h2 className="font-bold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                Two-Factor Authentication
              </h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                style={{
                  background: twoFA?.isEnabled ? 'var(--color-accent-green)' : 'var(--color-background)',
                  color: twoFA?.isEnabled ? '#000' : 'var(--color-text-secondary)',
                  border: twoFA?.isEnabled ? 'none' : '1px solid var(--color-border-tertiary)',
                }}>
                {twoFA?.isEnabled ? '✓ Enabled' : 'Disabled'}
              </span>
            </div>
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              {twoFA?.isEnabled
                ? `Enabled ${twoFA.enabledAt ? new Date(twoFA.enabledAt).toLocaleDateString() : ''}. ${twoFA.backupCodesRemaining} backup code${twoFA.backupCodesRemaining !== 1 ? 's' : ''} remaining.`
                : 'Require a verification code from your phone each time you sign in.'}
            </p>
            {twoFA?.isEnabled && twoFA.backupCodesRemaining <= 3 && (
              <div className="flex items-center gap-1.5 mt-1.5 text-xs"
                style={{ color: '#fbbf24' }}>
                <AlertTriangle size={11} />
                Only {twoFA.backupCodesRemaining} backup code{twoFA.backupCodesRemaining !== 1 ? 's' : ''} left — regenerate soon
              </div>
            )}
          </div>

          <button
            onClick={() => setModal(twoFA?.isEnabled ? 'disable' : 'setup')}
            className={`btn text-sm shrink-0 ${twoFA?.isEnabled ? 'btn-secondary' : 'btn-primary'}`}>
            {twoFA?.isEnabled ? 'Disable' : 'Enable'}
          </button>
        </div>
      </div>

      {/* ── Password ────────────────────────────────── */}
      <div className="card p-5">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'var(--color-background-secondary)' }}>
            <Key size={18} style={{ color: 'var(--color-text-secondary)' }} />
          </div>
          <div className="flex-1">
            <h2 className="font-bold text-sm mb-0.5" style={{ color: 'var(--color-text-primary)' }}>Password</h2>
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              Update your password. All other devices will be signed out.
            </p>
          </div>
          <button onClick={() => setModal('changepw')} className="btn btn-secondary text-sm shrink-0">
            Change
          </button>
        </div>
      </div>

      {/* ── Active Sessions ──────────────────────────── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-sm" style={{ color: 'var(--color-text-primary)' }}>
              Active Sessions
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
              {sessions.length} device{sessions.length !== 1 ? 's' : ''} signed in
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              title="Refresh"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: '6px' }}>
              <RefreshCw size={13} />
            </button>
            {otherSessions.length > 0 && (
              <button
                onClick={revokeAll}
                disabled={revokingAll}
                className="btn text-xs gap-1.5 disabled:opacity-60"
                style={{
                  background: 'rgba(255,77,77,0.1)',
                  border: '1px solid rgba(255,77,77,0.25)',
                  color: '#f87171',
                }}>
                {revokingAll ? <VukaLoader size={11} /> : <LogOut size={11} />}
                Sign Out Others
              </button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          {/* Current session */}
          {currentSession && (
            <div className="flex items-center gap-3 p-3 rounded-xl"
              style={{
                background: 'rgba(160,232,124,0.06)',
                border: '1px solid rgba(160,232,124,0.18)',
              }}>
              <DeviceIcon os={currentSession.os} deviceName={currentSession.deviceName} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
                    {currentSession.deviceName}
                  </p>
                  <span className="px-1.5 py-0.5 rounded text-xs font-bold text-black shrink-0"
                    style={{ background: 'var(--color-accent-green)', fontSize: '10px' }}>
                    This device
                  </span>
                </div>
                <p className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>
                  {currentSession.browser} · {currentSession.os}
                </p>
                <p className="text-xs flex items-center gap-1.5 mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                  <Clock size={10} />
                  {timeAgo(currentSession.lastSeenAt)}
                  {currentSession.ipAddress !== 'Unknown' && (
                    <span className="font-mono ml-1">{currentSession.ipAddress}</span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Other sessions */}
          {otherSessions.map(s => (
            <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl"
              style={{
                background: 'var(--color-background-secondary)',
                border: '1px solid var(--color-border-tertiary)',
              }}>
              <DeviceIcon os={s.os} deviceName={s.deviceName} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
                  {s.deviceName}
                </p>
                <p className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>
                  {s.browser} · {s.os}
                </p>
                <p className="text-xs flex items-center gap-1.5 mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                  <Clock size={10} />
                  {timeAgo(s.lastSeenAt)}
                  {s.ipAddress !== 'Unknown' && (
                    <span className="font-mono ml-1">{s.ipAddress}</span>
                  )}
                </p>
              </div>
              <button
                onClick={() => revokeOne(s)}
                disabled={revoking === s.id}
                title="Sign out this device"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#f87171', padding: '6px',
                  opacity: revoking === s.id ? 0.5 : 1,
                }}>
                {revoking === s.id
                  ? <VukaLoader size={15} />
                  : <LogOut size={15} />}
              </button>
            </div>
          ))}

          {sessions.length === 0 && (
            <div className="text-center py-6" style={{ color: 'var(--color-text-secondary)' }}>
              <Monitor size={26} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No active sessions found</p>
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 shadow-2xl"
          style={{
            background: toast.ok ? 'var(--color-accent-green)' : '#ef4444',
            color: toast.ok ? '#000' : '#fff',
          }}>
          {toast.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
          {toast.msg}
        </div>
      )}

      {/* Modals */}
      {modal === 'setup' && (
        <SetupModal
          onClose={() => setModal(null)}
          onEnabled={() => { load(); showToast('2FA enabled successfully!'); }}
        />
      )}
      {modal === 'disable' && (
        <DisableModal
          onClose={() => setModal(null)}
          onDisabled={() => { load(); showToast('2FA has been disabled.'); }}
        />
      )}
      {modal === 'changepw' && (
        <ChangePasswordModal
          onClose={() => setModal(null)}
          currentSessionId={currentSessionId}
        />
      )}
    </div>
  );
}
