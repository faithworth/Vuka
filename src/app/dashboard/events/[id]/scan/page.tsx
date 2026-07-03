'use client';
import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { useParams } from 'next/navigation';
import { CheckCircle2, XCircle, AlertTriangle, Loader2, ScanLine, Keyboard } from 'lucide-react';

type ScanResult = {
  result: 'admit' | 'already_used' | 'invalid' | 'wrong_event' | 'unpaid';
  reason?: string;
  buyerName?: string;
  ticketName?: string;
  checkedInAt?: string;
} | null;

export default function GateScanPage() {
  const params = useParams();
  const eventId = params?.id as string;

  const [scriptReady, setScriptReady] = useState(false);
  const [scanning,    setScanning]    = useState(false);
  const [busy,        setBusy]        = useState(false);
  const [lastResult,  setLastResult]  = useState<ScanResult>(null);
  const [manualToken, setManualToken] = useState('');
  const [manualMode,  setManualMode]  = useState(false);
  const [stats,       setStats]       = useState({ admitted: 0, rejected: 0 });

  const scannerRef = useRef<any>(null);
  const lastScannedRef = useRef<string>('');
  const lastScannedAtRef = useRef<number>(0);

  useEffect(() => {
    if (!scriptReady || manualMode) return;
    // @ts-ignore — loaded from CDN via next/script
    const Html5Qrcode = (window as any).Html5Qrcode;
    if (!Html5Qrcode) return;

    const el = document.getElementById('gate-reader');
    if (!el) return;

    const scanner = new Html5Qrcode('gate-reader');
    scannerRef.current = scanner;

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 260, height: 260 } },
      (decodedText: string) => handleScan(decodedText),
      () => {}, // ignore per-frame no-QR-found noise
    ).then(() => setScanning(true)).catch(() => setScanning(false));

    return () => {
      scanner.stop().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptReady, manualMode]);

  async function handleScan(qrToken: string) {
    // Debounce — camera keeps firing the same frame while the QR sits in view.
    const now = Date.now();
    if (qrToken === lastScannedRef.current && now - lastScannedAtRef.current < 3000) return;
    lastScannedRef.current = qrToken;
    lastScannedAtRef.current = now;
    await submit(qrToken);
  }

  async function submit(qrToken: string) {
    if (busy || !qrToken.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/events/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrToken: qrToken.trim(), eventId }),
      });
      const data = await res.json();
      setLastResult(data);
      setStats(s => data.result === 'admit'
        ? { ...s, admitted: s.admitted + 1 }
        : { ...s, rejected: s.rejected + 1 });
    } catch {
      setLastResult({ result: 'invalid', reason: 'Network error — try again' });
    } finally {
      setBusy(false);
      setManualToken('');
    }
  }

  const banner = (() => {
    if (!lastResult) return null;
    const admit = lastResult.result === 'admit';
    return (
      <div className="rounded-2xl p-6 text-center mb-4" style={{
        background: admit ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
        border: `2px solid ${admit ? '#22c55e' : '#ef4444'}`,
      }}>
        {admit
          ? <CheckCircle2 size={56} className="mx-auto mb-2" style={{ color: '#22c55e' }} />
          : <XCircle size={56} className="mx-auto mb-2" style={{ color: '#ef4444' }} />}
        <p className="text-2xl font-black" style={{ color: admit ? '#22c55e' : '#ef4444' }}>
          {admit ? 'ADMIT' : 'DENY'}
        </p>
        {lastResult.buyerName && <p className="text-lg font-bold mt-1" style={{ color: 'var(--text)' }}>{lastResult.buyerName}</p>}
        {lastResult.ticketName && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{lastResult.ticketName}</p>}
        {lastResult.reason && <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>{lastResult.reason}</p>}
      </div>
    );
  })();

  return (
    <div className="min-h-screen px-4 py-6 max-w-lg mx-auto" style={{ background: 'var(--bg)' }}>
      <Script
        src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"
        onReady={() => setScriptReady(true)}
      />

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-black" style={{ color: 'var(--text)' }}>Gate Scanner</h1>
        <button
          onClick={() => setManualMode(m => !m)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          <Keyboard size={13} /> {manualMode ? 'Use camera' : 'Type code'}
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="flex-1 rounded-xl p-3 text-center" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid #22c55e' }}>
          <p className="text-2xl font-black" style={{ color: '#22c55e' }}>{stats.admitted}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Admitted</p>
        </div>
        <div className="flex-1 rounded-xl p-3 text-center" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444' }}>
          <p className="text-2xl font-black" style={{ color: '#ef4444' }}>{stats.rejected}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Rejected</p>
        </div>
      </div>

      {banner}

      {!manualMode ? (
        <div className="rounded-2xl overflow-hidden relative" style={{ border: '1px solid var(--border)', background: '#000' }}>
          <div id="gate-reader" style={{ width: '100%' }} />
          {!scanning && (
            <div className="absolute inset-0 flex items-center justify-center flex-col gap-2" style={{ color: 'var(--text-muted)' }}>
              <Loader2 size={28} className="animate-spin" />
              <p className="text-xs">Starting camera…</p>
            </div>
          )}
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
              <Loader2 size={32} className="animate-spin text-white" />
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); submit(manualToken); }} className="space-y-3">
          <input
            autoFocus
            value={manualToken}
            onChange={e => setManualToken(e.target.value)}
            placeholder="Paste or type ticket code"
            className="w-full px-4 py-3 rounded-xl text-sm"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
          <button type="submit" disabled={busy || !manualToken.trim()}
            className="w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: 'var(--accent)' }}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ScanLine size={16} />}
            Check ticket
          </button>
        </form>
      )}

      <div className="flex items-start gap-2 mt-4 p-3 rounded-xl text-xs" style={{ background: 'var(--surface)', color: 'var(--text-muted)' }}>
        <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
        <p>Each ticket can only be scanned once. If two people show the same QR (screenshot shared), only the first scan admits — the second shows DENY with the original scan time.</p>
      </div>
    </div>
  );
}
