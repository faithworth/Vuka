'use client';
// ============================================================
// VUKA — Artist Analytics Dashboard (Phase 10)
// /dashboard/analytics
// Full implementation: streams trend, platform donut, geo heatmap,
// earnings chart, engagement metrics, top tracks table, CSV export.
// Upgrades the Phase 3 skeleton — no files recreated, just patched.
// ============================================================

import { useEffect, useState, useCallback } from 'react';
import {
  TrendingUp, Users, Play, BarChart2, Globe, RefreshCw, Download, Music, Heart, Repeat2, MessageCircle, DollarSign, Eye, Activity,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { LineChart } from '@/components/analytics/LineChart';
import { BarChart } from '@/components/analytics/BarChart';
import { DonutChart } from '@/components/analytics/DonutChart';
import { GeoHeatmap } from '@/components/analytics/GeoHeatmap';
import { StatCard } from '@/components/analytics/StatCard';
import { PeriodSelector, PERIODS, type Period } from '@/components/analytics/PeriodSelector';
import VukaLoader from '@/components/brand/VukaLoader';

// ── Types ─────────────────────────────────────────────────────

interface CreatorData {
  summary: {
    profileViews: number;
    beatPlays: number;
    releasePlays: number;
    videoPlays: number;
    totalRevenue: number;
    newFollowers: number;
    likes: number;
    comments: number;
    reposts: number;
    followerCount: number;
    totalPlays: number;
    periodDays: number;
  };
  charts: {
    plays: { date: string; beats: number; releases: number; videos: number; total: number }[];
    revenue: { date: string; amount: number }[];
    followers: { date: string; gained: number; lost: number }[];
    engagement: { date: string; likes: number; comments: number; reposts: number }[];
  };
  geography: { countryCode: string; countryName: string; count: number }[];
  recentSales: { id: string; beat?: { title: string }; release?: { title: string }; amount: number; currency: string; buyerName?: string }[];
}

interface RevenueData {
  monthlyRevenue: { period: string; amount: number; netAmount?: number }[];
  topBeats: { id: string; title: string; plays: number; sales: number; basicPrice?: number }[];
  topReleases: { id: string; title: string; plays: number; sales: number; price?: number }[];
  conversionRate: number;
  totalSales: number;
  totalPlays: number;
  breakdown: {
    beatSales: number;
    releaseSales: number;
    subscriptions: number;
    marketplace: number;
    tips: number;
    distribution: number;
  } | null;
}

interface AudienceData {
  totalFollowers: number;
  memberCount: number;
  purchaserCount: number;
  followerGrowthChart: { date: string; followers: number; unfollows: number }[];
  topCountries: { countryCode: string; countryName: string; count: number }[];
}

// ── Platform colours ──────────────────────────────────────────

const PLATFORM_COLORS: Record<string, string> = {
  spotify: '#1db954',
  'apple music': '#fa243c',
  youtube: '#ff0000',
  boomplay: '#f57c00',
  audiomack: '#ff6600',
  deezer: '#a238ff',
  tidal: '#00ffff',
  soundcloud: '#ff5500',
  amazon: '#ff9900',
  default: 'var(--sky)',
};
function pc(name: string) {
  return PLATFORM_COLORS[name.toLowerCase()] ?? PLATFORM_COLORS.default;
}

// ── Tab definition ────────────────────────────────────────────

type Tab = 'overview' | 'streams' | 'revenue' | 'audience' | 'engagement';

const TABS: { id: Tab; label: string; icon: typeof BarChart2 }[] = [
  { id: 'overview',   label: 'Overview',   icon: BarChart2   },
  { id: 'streams',    label: 'Streams',    icon: Play        },
  { id: 'revenue',    label: 'Revenue',    icon: DollarSign  },
  { id: 'audience',   label: 'Audience',   icon: Users       },
  { id: 'engagement', label: 'Engagement', icon: Heart       },
];

// ── Section wrapper ───────────────────────────────────────────

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 16,
      overflow: 'hidden',
      marginBottom: 20,
    }}>
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{title}</h2>
        {action}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

// ── CSV export helper ─────────────────────────────────────────

function downloadCSV(rows: string[][], filename: string) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main Component ────────────────────────────────────────────

export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [period, setPeriod] = useState<Period>('30d');
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [creator, setCreator] = useState<CreatorData | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [audience, setAudience] = useState<AudienceData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, rRes, aRes] = await Promise.all([
        fetch(`/api/analytics/creator?days=${days}`),
        fetch(`/api/analytics/revenue?months=${days >= 365 ? 12 : days >= 90 ? 6 : 3}`),
        fetch('/api/analytics/audience'),
      ]);
      if (cRes.ok) setCreator(await cRes.json());
      if (rRes.ok) setRevenue(await rRes.json());
      if (aRes.ok) setAudience(await aRes.json());
    } catch (e) {
      console.error('Analytics load error:', e);
    }
    setLoading(false);
  }, [days]);

  useEffect(() => { load(); }, [load]);

  // ── Overview tab ────────────────────────────────────────────

  function OverviewTab() {
    const s = creator?.summary;
    const totalPlays = (s?.beatPlays ?? 0) + (s?.releasePlays ?? 0) + (s?.videoPlays ?? 0);

    const playsChartData = (creator?.charts.plays ?? []).map((p) => ({
      label: p.date.slice(5),
      value: p.total,
    }));

    const revenueChartData = (creator?.charts.revenue ?? []).map((r) => ({
      label: r.date.slice(5),
      value: Number(r.amount),
    }));

    return (
      <>
        {/* KPI Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
          <StatCard label="Total Plays" value={totalPlays.toLocaleString()} icon={Play} color="var(--sky)"
            change={s ? undefined : undefined} subLabel={`${days}d period`} />
          <StatCard label="Profile Views" value={(s?.profileViews ?? 0).toLocaleString()} icon={Eye} color="var(--sky)" />
          <StatCard label="Revenue" value={formatCurrency(s?.totalRevenue ?? 0)} icon={DollarSign} color="var(--gold)" />
          <StatCard label="New Followers" value={(s?.newFollowers ?? 0).toLocaleString()} icon={Users} color="var(--green)" />
          <StatCard label="Likes" value={(s?.likes ?? 0).toLocaleString()} icon={Heart} color="var(--sky)" />
          <StatCard label="Total Followers" value={(s?.followerCount ?? 0).toLocaleString()} icon={Activity} color="var(--green)" />
        </div>

        {/* Plays trend */}
        <Section title={`Plays Trend — Last ${days} Days`}>
          {playsChartData.length > 0 ? (
            <LineChart data={playsChartData} color="var(--sky)" label="Plays" />
          ) : (
            <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No plays recorded yet in this period.
            </div>
          )}
        </Section>

        {/* Revenue + Geography side by side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <Section title="Revenue Trend">
            {revenueChartData.length > 0 ? (
              <BarChart data={revenueChartData} colors={['var(--gold)']}
                formatValue={(v) => formatCurrency(v)} />
            ) : (
              <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No revenue data</div>
            )}
          </Section>

          <Section title="Top Listener Countries">
            {(audience?.topCountries ?? creator?.geography ?? []).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(audience?.topCountries ?? creator?.geography ?? []).slice(0, 6).map((c, i) => {
                  const maxC = Math.max(...(audience?.topCountries ?? creator?.geography ?? []).map((x) => x.count), 1);
                  return (
                    <div key={c.countryCode}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 12 }}>
                        <span style={{ color: 'var(--text)' }}>{c.countryName || c.countryCode}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{c.count.toLocaleString()}</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: 'var(--surface2)' }}>
                        <div style={{ height: '100%', borderRadius: 2, background: 'var(--sky)', width: `${(c.count / maxC) * 100}%`, transition: 'width 0.5s' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No geography data</div>
            )}
          </Section>
        </div>

        {/* Recent sales */}
        {creator?.recentSales && creator.recentSales.length > 0 && (
          <Section title="Recent Sales"
            action={
              <button onClick={() => downloadCSV(
                [['Item', 'Buyer', 'Amount'],
                 ...(creator.recentSales.map((s) => [s.beat?.title || s.release?.title || 'Unknown', s.buyerName || '—', `${s.amount} ${s.currency}`]))],
                'vuka-sales.csv'
              )} style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer' }}>
                <Download size={13} /> Export
              </button>
            }>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {creator.recentSales.map((sale) => (
                <div key={sale.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <p style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>
                      {sale.beat?.title || sale.release?.title || 'Item'}
                    </p>
                    {sale.buyerName && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sale.buyerName}</p>}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>
                    {formatCurrency(sale.amount, sale.currency)}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}
      </>
    );
  }

  // ── Streams tab ─────────────────────────────────────────────

  function StreamsTab() {
    const plays = creator?.charts.plays ?? [];

    const stackedData = plays.map((p) => ({
      label: p.date.slice(5),
      value: p.beats,
      value2: p.releases,
      value3: p.videos,
    }));

    const s = creator?.summary;

    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          <StatCard label="Beat Plays" value={(s?.beatPlays ?? 0).toLocaleString()} icon={Music} color="var(--sky)" />
          <StatCard label="Release Plays" value={(s?.releasePlays ?? 0).toLocaleString()} icon={Play} color="var(--gold)" />
          <StatCard label="Video Plays" value={(s?.videoPlays ?? 0).toLocaleString()} icon={Activity} color="var(--green)" />
        </div>

        <Section title="Plays by Content Type">
          <BarChart
            data={stackedData}
            colors={['var(--sky)', 'var(--gold)', 'var(--green)']}
            labels={['Beats', 'Releases', 'Videos']}
            stacked
            height={220}
          />
        </Section>

        <Section title="Daily Plays Trend">
          <LineChart
            data={plays.map((p) => ({ label: p.date.slice(5), value: p.total }))}
            color="var(--sky)" label="Total Plays" showDots={plays.length <= 30}
          />
        </Section>

        {/* Top tracks */}
        {revenue && revenue.topBeats.length > 0 && (
          <Section title="Top Tracks by Plays">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['#', 'Track', 'Plays', 'Sales', 'Rate'].map((h) => (
                    <th key={h} style={{ padding: '8px 0', textAlign: h === '#' ? 'center' : 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {revenue.topBeats.slice(0, 10).map((b, i) => {
                  const convRate = b.plays > 0 ? ((b.sales / b.plays) * 100).toFixed(1) : '0.0';
                  return (
                    <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>{i + 1}</td>
                      <td style={{ padding: '10px 12px 10px 0', color: 'var(--text)', fontWeight: 500 }}>{b.title}</td>
                      <td style={{ color: 'var(--sky)', fontFamily: 'monospace' }}>{b.plays.toLocaleString()}</td>
                      <td style={{ color: 'var(--gold)', fontFamily: 'monospace' }}>{b.sales}</td>
                      <td style={{ color: 'var(--green)', fontFamily: 'monospace' }}>{convRate}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Section>
        )}
      </>
    );
  }

  // ── Revenue tab ─────────────────────────────────────────────

  function RevenueTab() {
    const monthly = revenue?.monthlyRevenue ?? [];
    const breakdown = revenue?.breakdown;

    const monthlyChartData = monthly.map((m) => ({
      label: m.period.slice(2),
      value: Number(m.netAmount ?? m.amount),
    }));

    const breakdownData = breakdown
      ? [
          { label: 'Beat Sales',    value: breakdown.beatSales,    color: 'var(--sky)'   },
          { label: 'Releases',      value: breakdown.releaseSales, color: 'var(--gold)'  },
          { label: 'Memberships',   value: breakdown.subscriptions,color: 'var(--green)' },
          { label: 'Marketplace',   value: breakdown.marketplace,  color: '#9b59b6'      },
          { label: 'Fan Support',   value: breakdown.tips,         color: '#e74c3c'      },
          { label: 'Distribution',  value: breakdown.distribution, color: '#1abc9c'      },
        ].filter((d) => d.value > 0)
      : [];

    const totalRevAll = breakdownData.reduce((s, d) => s + d.value, 0);

    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          <StatCard label="Conversion Rate" value={`${revenue?.conversionRate ?? 0}%`} icon={TrendingUp} color="var(--green)" />
          <StatCard label="Total Sales" value={(revenue?.totalSales ?? 0).toLocaleString()} icon={BarChart2} color="var(--sky)" />
          <StatCard label="All-time Plays" value={(revenue?.totalPlays ?? 0).toLocaleString()} icon={Play} color="var(--gold)" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <Section title="Monthly Revenue">
            {monthlyChartData.length > 0 ? (
              <BarChart data={monthlyChartData} colors={['var(--gold)']}
                formatValue={(v) => formatCurrency(v)} height={220} />
            ) : (
              <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No revenue data</div>
            )}
          </Section>

          <Section title="Revenue by Source">
            {breakdownData.length > 0 ? (
              <DonutChart
                data={breakdownData}
                centerValue={formatCurrency(totalRevAll)}
                centerLabel="Total"
                size={160}
                thickness={32}
              />
            ) : (
              <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No revenue breakdown yet</div>
            )}
          </Section>
        </div>

        {/* Top releases */}
        {revenue?.topReleases && revenue.topReleases.length > 0 && (
          <Section title="Top Releases by Sales"
            action={
              <button onClick={() => downloadCSV(
                [['Title', 'Plays', 'Sales'],
                 ...(revenue.topReleases.map((r) => [r.title, String(r.plays), String(r.sales)]))],
                'vuka-releases-revenue.csv'
              )} style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer' }}>
                <Download size={13} /> CSV
              </button>
            }>
            {revenue.topReleases.map((r, i) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 20, textAlign: 'right' }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.plays.toLocaleString()} plays</p>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', flexShrink: 0 }}>
                  {r.sales} sold
                </span>
              </div>
            ))}
          </Section>
        )}
      </>
    );
  }

  // ── Audience tab ────────────────────────────────────────────

  function AudienceTab() {
    const geo = audience?.topCountries ?? creator?.geography ?? [];
    const growthData = (audience?.followerGrowthChart ?? []).map((d) => ({
      label: d.date.slice(5),
      value: d.followers,
      value2: d.unfollows,
    }));

    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          <StatCard label="Total Followers" value={(audience?.totalFollowers ?? 0).toLocaleString()} icon={Users} color="var(--sky)" />
          <StatCard label="Active Members" value={(audience?.memberCount ?? 0).toLocaleString()} icon={Heart} color="var(--gold)" />
          <StatCard label="Unique Buyers" value={(audience?.purchaserCount ?? 0).toLocaleString()} icon={TrendingUp} color="var(--green)" />
        </div>

        <Section title="Follower Growth (30 Days)">
          {growthData.length > 0 ? (
            <LineChart
              data={growthData}
              color="var(--green)"
              color2="var(--red, #e74c3c)"
              label="Gained"
              label2="Lost"
              showDots={growthData.length <= 30}
            />
          ) : (
            <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No follower data yet
            </div>
          )}
        </Section>

        <Section title="Geographic Heatmap">
          <GeoHeatmap data={geo} color="var(--sky)" />
        </Section>
      </>
    );
  }

  // ── Engagement tab ──────────────────────────────────────────

  function EngagementTab() {
    const s = creator?.summary;
    const totalEngagement = (s?.likes ?? 0) + (s?.comments ?? 0) + (s?.reposts ?? 0);

    const engagementData = (creator?.charts.engagement ?? []).map((e) => ({
      label: e.date.slice(5),
      value: e.likes,
      value2: e.comments,
      value3: e.reposts,
    }));

    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          <StatCard label="Total Engagement" value={totalEngagement.toLocaleString()} icon={Activity} color="var(--sky)" />
          <StatCard label="Likes" value={(s?.likes ?? 0).toLocaleString()} icon={Heart} color="var(--sky)" />
          <StatCard label="Comments" value={(s?.comments ?? 0).toLocaleString()} icon={MessageCircle} color="var(--gold)" />
          <StatCard label="Reposts" value={(s?.reposts ?? 0).toLocaleString()} icon={Repeat2} color="var(--green)" />
        </div>

        <Section title="Engagement Breakdown">
          {engagementData.length > 0 ? (
            <BarChart
              data={engagementData}
              colors={['var(--sky)', 'var(--gold)', 'var(--green)']}
              labels={['Likes', 'Comments', 'Reposts']}
              stacked
              height={220}
            />
          ) : (
            <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No engagement data yet</div>
          )}
        </Section>

        {totalEngagement > 0 && (
          <Section title="Engagement Mix">
            <DonutChart
              data={[
                { label: 'Likes',    value: s?.likes ?? 0,    color: 'var(--sky)'   },
                { label: 'Comments', value: s?.comments ?? 0, color: 'var(--gold)'  },
                { label: 'Reposts',  value: s?.reposts ?? 0,  color: 'var(--green)' },
              ].filter((d) => d.value > 0)}
              centerValue={totalEngagement.toLocaleString()}
              centerLabel="actions"
              size={160}
            />
          </Section>
        )}
      </>
    );
  }

  // ── Render ──────────────────────────────────────────────────

  return (
    <div style={{ padding: '24px 28px', maxWidth: 960 }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', fontFamily: 'IBM Plex Mono, monospace' }}>
            Analytics
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            Streams, revenue, audience, and engagement — all in one place.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <PeriodSelector value={period} onChange={(p, d) => { setPeriod(p); setDays(d); }} />
          <button onClick={load} disabled={loading} style={{
            padding: '8px 10px', borderRadius: 10,
            background: 'var(--surface)', border: '1px solid var(--border)',
            cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center',
          }}>
            <RefreshCw size={15} style={{ color: 'var(--text-muted)', ...(loading ? { animation: 'spin 1s linear infinite' } : {}) }} />
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 24,
        borderBottom: '1px solid var(--border)', paddingBottom: 0,
      }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', fontSize: 13, fontWeight: 600,
            background: 'none', border: 'none', cursor: 'pointer',
            color: tab === t.id ? 'var(--sky)' : 'var(--text-muted)',
            borderBottom: tab === t.id ? '2px solid var(--sky)' : '2px solid transparent',
            marginBottom: -1, borderRadius: '4px 4px 0 0',
            transition: 'color 0.15s',
          }}>
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '48px 0', color: 'var(--text-muted)', fontSize: 14 }}>
          <VukaLoader size={18} />
          Loading analytics…
        </div>
      )}

      {/* Empty state */}
      {!loading && !creator && (
        <div style={{ padding: '64px 24px', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16 }}>
          <BarChart2 size={36} style={{ color: 'var(--text-muted)', opacity: 0.3, margin: '0 auto 16px' }} />
          <p style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>No analytics yet</p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Data appears here once your music gets plays and sales.
          </p>
        </div>
      )}

      {/* Tab content */}
      {!loading && creator && (
        <>
          {tab === 'overview'   && <OverviewTab   />}
          {tab === 'streams'    && <StreamsTab    />}
          {tab === 'revenue'    && <RevenueTab    />}
          {tab === 'audience'   && <AudienceTab   />}
          {tab === 'engagement' && <EngagementTab />}
        </>
      )}

      {/* Spin keyframe (inline since we can't rely on Tailwind here) */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
