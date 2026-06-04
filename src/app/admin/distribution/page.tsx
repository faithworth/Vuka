'use client';
// src/app/admin/distribution/page.tsx
// Phase 6 — Admin Distribution Queue Monitor
// Shows DSP delivery status, allows retry, mark-live, manual trigger.

import { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw, Loader2, CheckCircle, XCircle, Clock,
  Zap, RotateCcw, Radio, AlertTriangle, ExternalLink,
} from 'lucide-react';

type DeliveryStatus = 'queued' | 'submitting' | 'submitted' | 'live' | 'failed' | 'rolled_back';

interface Delivery {
  id: string;
  dsp: string;
  status: DeliveryStatus;
  retryCount: number;
  errorMessage: string;
  submittedAt: string | null;
  liveAt: string | null;
  failedAt: string | null;
  createdAt: string;
  distributionRelease: {
    id: string;
    title: string;
    status: string;
    artistName: string;
    artist: { name: string; slug: string } | null;
  } | null;
}

interface StatusCount { status: string; _count: number; }

const STATUS_STYLES: Record<DeliveryStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  queued:      { label: 'Queued',      color: '#a0a0a0', bg: 'rgba(160,160,160,0.1)', icon: Clock },
  submitting:  { label: 'Submitting',  color: '#60b4ff', bg: 'rgba(96,180,255,0.1)',  icon: Loader2 },
  submitted:   { label: 'Submitted',   color: '#a0e87c', bg: 'rgba(160,232,124,0.1)', icon: CheckCircle },
  live:        { label: 'Live',        color: '#a0e87c', bg: 'rgba(160,232,124,0.15)', icon: Radio },
  failed:      { label: 'Failed',      color: '#ff4d4d', bg: 'rgba(255,77,77,0.1)',   icon: XCircle },
  rolled_back: { label: 'Rolled Back', color: '#e8a87c', bg: 'rgba(232,168,124,0.1)', icon: AlertTriangle },
};

const DSP_LABELS: Record<string, string> = {
  vuka: 'Vuka', spotify: 'Spotify', apple_music: 'Apple Music',
  youtube_music: 'YouTube Music', boomplay: 'Boomplay', audiomack: 'Audiomack',
  deezer: 'Deezer', tidal: 'Tidal', amazon_music: 'Amazon Music',
  shazam: 'Shazam', soundcloud: 'SoundCloud', tiktok_music: 'TikTok Music',
  mdundo: 'Mdundo', pandora: 'Pandora',
};

export default function AdminDistributionPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [statusCounts, setStatusCounts] = useState<StatusCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [filter, setFilter] = useState<DeliveryStatus | 'all'>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/distribution?action=queue');
      if (res.ok) {
        const data = await res.json();
        setDeliveries(data.deliveries || []);
        setStatusCounts(data.statusCounts || []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function processQueue() {
    setProcessing(true);
    try {
      const res = await fetch('/api/admin/distribution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'process_queue' }),
      });
      if (res.ok) await load();
    } catch {}
    setProcessing(false);
  }

  async function retryDelivery(deliveryId: string) {
    setActionLoading(deliveryId);
    try {
      await fetch('/api/admin/distribution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry', deliveryId }),
      });
      await load();
    } catch {}
    setActionLoading(null);
  }

  async function markLive(deliveryId: string) {
    setActionLoading(deliveryId + '-live');
    try {
      await fetch('/api/admin/distribution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_live', deliveryId }),
      });
      await load();
    } catch {}
    setActionLoading(null);
  }

  const filtered = filter === 'all' ? deliveries : deliveries.filter((d) => d.status === filter);

  const totalCounts = statusCounts.reduce((acc, s) => {
    acc[s.status] = s._count;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', margin: 0 }}>
            Distribution Queue
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            DSP delivery pipeline — monitor, retry, and manually advance deliveries
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={processQueue}
            disabled={processing}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700,
              background: 'var(--accent)', color: '#000', border: 'none', cursor: 'pointer',
              opacity: processing ? 0.7 : 1,
            }}
          >
            {processing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            Process Queue Now
          </button>
          <button
            onClick={load}
            style={{
              padding: 8, borderRadius: 10, cursor: 'pointer',
              background: 'var(--surface)', border: '1px solid var(--border)',
            }}
          >
            <RefreshCw size={15} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      </div>

      {/* Status summary pills */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {(['all', 'queued', 'submitting', 'submitted', 'live', 'failed'] as const).map((s) => {
          const style = s !== 'all' ? STATUS_STYLES[s] : null;
          const count = s === 'all'
            ? deliveries.length
            : (totalCounts[s] || 0);
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              style={{
                padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                cursor: 'pointer', border: '1px solid var(--border)',
                background: filter === s
                  ? (style?.bg || 'rgba(160,232,124,0.15)')
                  : 'var(--surface)',
                color: filter === s ? (style?.color || 'var(--accent)') : 'var(--text-muted)',
              }}
            >
              {s === 'all' ? 'All' : STATUS_STYLES[s]?.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Deliveries table */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', padding: 40 }}>
          <Loader2 size={18} className="animate-spin" /> Loading deliveries…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 60, borderRadius: 16,
          background: 'var(--surface)', border: '1px solid var(--border)',
        }}>
          <CheckCircle size={36} style={{ color: 'var(--accent)', margin: '0 auto 12px' }} />
          <p style={{ fontWeight: 700, color: 'var(--text)' }}>Queue is clear</p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            No deliveries matching this filter.
          </p>
        </div>
      ) : (
        <div style={{
          borderRadius: 14, overflow: 'hidden',
          border: '1px solid var(--border)',
        }}>
          {/* Table header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 120px 100px 90px 80px 110px',
            padding: '10px 20px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.05em', color: 'var(--text-muted)',
            background: 'var(--surface2)', borderBottom: '1px solid var(--border)',
          }}>
            <span>Release / Artist</span>
            <span>DSP</span>
            <span>Status</span>
            <span>Retries</span>
            <span>Date</span>
            <span style={{ textAlign: 'right' }}>Actions</span>
          </div>

          {filtered.map((delivery) => {
            const statusStyle = STATUS_STYLES[delivery.status] || STATUS_STYLES.queued;
            const StatusIcon = statusStyle.icon;
            const dspLabel = DSP_LABELS[delivery.dsp] || delivery.dsp;
            const isActioning = actionLoading === delivery.id || actionLoading === delivery.id + '-live';

            return (
              <div
                key={delivery.id}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr 120px 100px 90px 80px 110px',
                  alignItems: 'center', padding: '12px 20px',
                  borderBottom: '1px solid var(--border)',
                  background: 'var(--surface)',
                }}
              >
                {/* Release info */}
                <div>
                  <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 2 }}>
                    {delivery.distributionRelease?.title || '—'}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {delivery.distributionRelease?.artistName ||
                     delivery.distributionRelease?.artist?.name || '—'}
                  </p>
                  {delivery.errorMessage && (
                    <p style={{ fontSize: 11, color: '#ff4d4d', marginTop: 2 }}>
                      {delivery.errorMessage.slice(0, 80)}
                    </p>
                  )}
                </div>

                {/* DSP */}
                <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>
                  {dspLabel}
                </span>

                {/* Status badge */}
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  color: statusStyle.color, background: statusStyle.bg,
                  width: 'fit-content',
                }}>
                  <StatusIcon size={11} />
                  {statusStyle.label}
                </span>

                {/* Retry count */}
                <span style={{
                  fontSize: 12, color: delivery.retryCount > 0 ? '#e8a87c' : 'var(--text-muted)',
                  fontWeight: delivery.retryCount > 0 ? 700 : 400,
                }}>
                  {delivery.retryCount > 0 ? `${delivery.retryCount}×` : '—'}
                </span>

                {/* Date */}
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {new Date(delivery.createdAt).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })}
                </span>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  {delivery.status === 'failed' && (
                    <button
                      onClick={() => retryDelivery(delivery.id)}
                      disabled={isActioning}
                      title="Retry delivery"
                      style={{
                        padding: '4px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                        background: 'rgba(255,77,77,0.1)', color: '#ff4d4d',
                        border: '1px solid rgba(255,77,77,0.3)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4,
                        opacity: isActioning ? 0.6 : 1,
                      }}
                    >
                      <RotateCcw size={11} /> Retry
                    </button>
                  )}
                  {delivery.status === 'submitted' && (
                    <button
                      onClick={() => markLive(delivery.id)}
                      disabled={isActioning}
                      title="Manually mark as live"
                      style={{
                        padding: '4px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                        background: 'rgba(160,232,124,0.1)', color: 'var(--accent)',
                        border: '1px solid rgba(160,232,124,0.3)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4,
                        opacity: isActioning ? 0.6 : 1,
                      }}
                    >
                      <Radio size={11} /> Mark Live
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Queue info note */}
      <div style={{
        marginTop: 20, padding: '12px 16px', borderRadius: 12, fontSize: 12,
        background: 'rgba(160,232,124,0.05)', border: '1px solid rgba(160,232,124,0.15)',
        color: 'var(--text-muted)',
      }}>
        <strong style={{ color: 'var(--accent)' }}>Queue note:</strong> The distribution queue
        processes automatically every hour via cron (
        <code style={{ fontSize: 11 }}>GET /api/workers/cron?job=distribution</code>).
        Use "Process Queue Now" to trigger immediately, or retry individual failed deliveries above.
        DSP APIs are stubbed — swap adapter bodies in{' '}
        <code style={{ fontSize: 11 }}>src/lib/distribution.ts</code> with real API keys once credentials are live.
      </div>
    </div>
  );
}
