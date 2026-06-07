'use client';
// ============================================================
// VUKA — Earnings Dashboard (Phase 3)
// /dashboard/earnings
// Consumes /api/analytics/revenue which returns RevenueRecord data.
// ============================================================

import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import {
  TrendingUp, Download, BarChart2, Loader2, RefreshCw,
  Music, Disc, ChevronDown,
} from 'lucide-react';

type Period = 1 | 3 | 12 | 24;

interface TopItem { id: string; title: string; slug: string; sales: number; plays: number; basicPrice?: number; price?: number; }
interface Breakdown { beatSales: number; releaseSales: number; subscriptions: number; marketplace: number; tips: number; distribution: number; }

interface RevenueData {
  monthlyRevenue: { id: string; period: string; amount: number; netAmount: number; type: string; currency: string }[];
  topBeats:       TopItem[];
  topReleases:    TopItem[];
  conversionRate: number;
  totalSales:     number;
  totalPlays:     number;
  breakdown:      Breakdown | null;
}

const PERIOD_OPTIONS = [
  { label: 'Last month',     value: 1  },
  { label: 'Last 3 months',  value: 3  },
  { label: 'Last 12 months', value: 12 },
  { label: 'All time',       value: 24 },
] as const;

export default function EarningsPage() {
  const [months, setMonths]   = useState<Period>(12);
  const [data, setData]       = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan]       = useState<{ artistSharePct: number; platformFeePct: number; planName: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [res, planRes] = await Promise.all([
        fetch(`/api/analytics/revenue?months=${months}`),
        fetch('/api/plans/status'),
      ]);
      if (res.ok) setData(await res.json());
      if (planRes.ok) setPlan(await planRes.json());
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, [months]);

  const artistPct  = plan?.artistSharePct  ?? 85;
  const platformPct = plan?.platformFeePct ?? 15;

  function exportCSV() {
    if (!data?.monthlyRevenue?.length) return;
    const header = 'Period,Type,Gross (ZAR),Net (ZAR),Currency\n';
    const body = data.monthlyRevenue.map(r =>
      `"${r.period}","${r.type}",${r.amount.toFixed(2)},${(r.netAmount || r.amount).toFixed(2)},"${r.currency || 'ZAR'}"`
    ).join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `vuka-earnings-${months}m.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Totals
  const totalNet = data?.monthlyRevenue?.reduce((s, r) => s + (r.netAmount || r.amount), 0) ?? 0;
  const totalGross = data?.monthlyRevenue?.reduce((s, r) => s + r.amount, 0) ?? 0;
  const totalVukaFee = totalGross - totalNet;

  return (
    <div className="p-6 md:p-10 max-w-5xl">

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black" style={{ color: 'var(--text)' }}>Earnings</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Your royalties and sales revenue — {artistPct}% goes to you.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={months}
              onChange={e => setMonths(Number(e.target.value) as Period)}
              className="appearance-none input pr-8 text-sm py-2"
              style={{ minWidth: 150 }}>
              {PERIOD_OPTIONS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--text-muted)' }} />
          </div>
          <button onClick={load} className="p-2 rounded-xl"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <RefreshCw size={15} style={{ color: 'var(--text-muted)' }} />
          </button>
          <button onClick={exportCSV} disabled={!data?.monthlyRevenue?.length}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-40"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 py-12" style={{ color: 'var(--text-muted)' }}>
          <Loader2 size={18} className="animate-spin" /> Loading earnings…
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            {[
              { label: 'Gross',                   value: formatCurrency(totalGross),    color: 'var(--gold)',  icon: TrendingUp },
              { label: `Net (Your ${artistPct}%)`, value: formatCurrency(totalNet),      color: 'var(--green)', icon: BarChart2 },
              { label: `Vuka ${platformPct}% Fee`, value: formatCurrency(totalVukaFee),  color: 'var(--sky)',   icon: BarChart2 },
              { label: 'Total Sales',               value: (data?.totalSales ?? 0).toString(), color: 'var(--sky)', icon: BarChart2 },
            ].map(card => (
              <div key={card.label} className="p-5 rounded-2xl"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <card.icon size={16} className="mb-2" style={{ color: card.color }} />
                <div className="text-xl font-black" style={{ color: card.color }}>{card.value}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{card.label}</div>
              </div>
            ))}
          </div>

          {/* Revenue breakdown */}
          {data?.breakdown && (
            <div className="p-5 rounded-2xl mb-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <h2 className="text-sm font-bold mb-4" style={{ color: 'var(--text)' }}>Revenue Sources</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { label: 'Beat Sales',     value: data.breakdown.beatSales,     color: 'var(--sky)' },
                  { label: 'Release Sales',  value: data.breakdown.releaseSales,  color: 'var(--green)' },
                  { label: 'Distribution',   value: data.breakdown.distribution,  color: 'var(--gold)' },
                  { label: 'Fan Support',    value: data.breakdown.tips,           color: '#f59e0b' },
                  { label: 'Memberships',    value: data.breakdown.subscriptions,  color: '#a238ff' },
                  { label: 'Services',       value: data.breakdown.marketplace,    color: '#00c896' },
                ].map(item => (
                  <div key={item.label} className="p-3 rounded-xl"
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                    <div className="text-sm font-black" style={{ color: item.color }}>
                      {formatCurrency(item.value)}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{item.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            {/* Top Beats */}
            {data?.topBeats && data.topBeats.length > 0 && (
              <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <div className="px-5 py-4 flex items-center gap-2"
                  style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                  <Music size={15} style={{ color: 'var(--sky)' }} />
                  <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Top Beats</h2>
                </div>
                <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {data.topBeats.map((b, i) => (
                    <div key={b.id} className="flex items-center gap-3 px-5 py-3"
                      style={{ background: 'var(--surface)' }}>
                      <span className="text-xs w-5 font-mono" style={{ color: 'var(--text-muted)' }}>{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{b.title}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{b.sales} sales · {b.plays} plays</p>
                      </div>
                      <span className="text-sm font-semibold" style={{ color: 'var(--green)' }}>
                        {formatCurrency((b.basicPrice ?? 0) * b.sales)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top Releases */}
            {data?.topReleases && data.topReleases.length > 0 && (
              <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <div className="px-5 py-4 flex items-center gap-2"
                  style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                  <Disc size={15} style={{ color: 'var(--sky)' }} />
                  <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Top Releases</h2>
                </div>
                <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {data.topReleases.map((r, i) => (
                    <div key={r.id} className="flex items-center gap-3 px-5 py-3"
                      style={{ background: 'var(--surface)' }}>
                      <span className="text-xs w-5 font-mono" style={{ color: 'var(--text-muted)' }}>{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{r.title}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{r.sales} sales · {r.plays} plays</p>
                      </div>
                      <span className="text-sm font-semibold" style={{ color: 'var(--green)' }}>
                        {formatCurrency((r.price ?? 0) * r.sales)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Monthly table */}
          {data?.monthlyRevenue && data.monthlyRevenue.length > 0 && (
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <div className="px-5 py-4 flex items-center justify-between"
                style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Monthly Breakdown</h2>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{data.monthlyRevenue.length} records</span>
              </div>
              <div className="hidden md:grid grid-cols-5 gap-4 px-5 py-2 text-xs font-semibold uppercase tracking-wide"
                style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <span>Period</span>
                <span>Type</span>
                <span className="text-right">Gross</span>
                <span className="text-right">Net ({artistPct}%)</span>
                <span className="text-right">Currency</span>
              </div>
              <div className="divide-y max-h-80 overflow-y-auto" style={{ borderColor: 'var(--border)' }}>
                {data.monthlyRevenue.map(row => (
                  <div key={row.id} className="grid grid-cols-1 md:grid-cols-5 gap-2 md:gap-4 px-5 py-3 text-sm"
                    style={{ background: 'var(--surface)' }}>
                    <span className="font-mono text-xs" style={{ color: 'var(--text)' }}>{row.period}</span>
                    <span className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>
                      {row.type.replace(/_/g, ' ')}
                    </span>
                    <span className="md:text-right" style={{ color: 'var(--text-muted)' }}>
                      {formatCurrency(row.amount, row.currency)}
                    </span>
                    <span className="md:text-right font-semibold" style={{ color: 'var(--green)' }}>
                      {formatCurrency(row.netAmount || row.amount, row.currency)}
                    </span>
                    <span className="md:text-right text-xs" style={{ color: 'var(--text-muted)' }}>
                      {row.currency || 'ZAR'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(!data?.monthlyRevenue?.length && !data?.topBeats?.length && !data?.topReleases?.length) && (
            <div className="py-16 text-center rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <BarChart2 size={36} className="mx-auto mb-4 opacity-30" style={{ color: 'var(--text-muted)' }} />
              <p className="font-semibold" style={{ color: 'var(--text)' }}>No earnings recorded yet</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                Upload beats or releases to start earning.
              </p>
            </div>
          )}

          {/* Fee note */}
          <div className="mt-6 px-4 py-3 rounded-xl flex items-start gap-3 text-xs"
            style={{ background: 'rgba(201,162,39,0.07)', border: '1px solid rgba(201,162,39,0.25)' }}>
            <span style={{ color: 'var(--gold)', flexShrink: 0 }}>✦</span>
            <p style={{ color: 'var(--text-muted)' }}>
              All net amounts shown are after Vuka's {platformPct}% platform fee.
              You keep {artistPct}% of every sale — no hidden charges.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
