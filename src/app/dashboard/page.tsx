'use client';
import { useEffect, useState } from 'react';
import { TrendingUp, Calendar, ShoppingBag, Play, Upload, CreditCard, Link2, Music } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link';

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard/stats').then(r => r.json()).then(d => { setStats(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 md:p-10">
      <div className="mb-8">
        <h1 className="text-3xl font-black" style={{ color: 'var(--text)' }}>Dashboard</h1>
        <p style={{ color: 'var(--text-muted)' }}>What You've Earned</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: 'var(--surface)' }} />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Total Revenue', value: formatCurrency(stats?.totalRevenue || 0), icon: <TrendingUp size={20} />, color: 'var(--green)' },
              { label: 'This Month', value: formatCurrency(stats?.monthRevenue || 0), icon: <Calendar size={20} />, color: 'var(--sky)' },
              { label: 'Total Sales', value: stats?.totalSales || 0, icon: <ShoppingBag size={20} />, color: 'var(--gold)' },
              { label: 'Total Plays', value: stats?.totalPlays || 0, icon: <Play size={20} />, color: 'var(--sky)' },
            ].map(s => (
              <div key={s.label} className="p-6 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="mb-2" style={{ color: s.color }}>{s.icon}</div>
                <div className="text-2xl font-black mb-1" style={{ color: s.color }}>{s.value}</div>
                <div className="text-sm" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Fee transparency note */}
          <div className="mb-6 px-4 py-3 rounded-xl flex items-center gap-3 text-sm"
            style={{ background: 'rgba(201,162,39,0.07)', border: '1px solid rgba(201,162,39,0.25)' }}>
            <span style={{ color: 'var(--gold)', fontSize: 14 }}>✦</span>
            <span style={{ color: 'var(--text-muted)' }}>
              Your earnings are 98% of total sales. Vuka retains 2% to cover hosting and operational costs.
            </span>
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Link href="/dashboard/uploads" className="flex items-center gap-4 p-6 rounded-2xl transition-colors hover:border-sky-400"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <Upload size={28} style={{ color: "var(--sky)" }} />
              <div><p className="font-bold" style={{ color: 'var(--text)' }}>Upload New Beat</p><p className="text-sm" style={{ color: 'var(--text-muted)' }}>Add to your store</p></div>
            </Link>
            <Link href="/dashboard/settings" className="flex items-center gap-4 p-6 rounded-2xl transition-colors"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <CreditCard size={28} style={{ color: "var(--sky)" }} />
              <div><p className="font-bold" style={{ color: 'var(--text)' }}>Configure Payouts</p><p className="text-sm" style={{ color: 'var(--text-muted)' }}>Bank account / PayFast</p></div>
            </Link>
            <button
              onClick={() => { if (stats?.artistSlug) navigator.clipboard.writeText(`${window.location.origin}/artist/${stats.artistSlug}`); }}
              className="flex items-center gap-4 p-6 rounded-2xl text-left transition-colors"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <Link2 size={28} style={{ color: "var(--sky)" }} />
              <div><p className="font-bold" style={{ color: 'var(--text)' }}>Copy Your Link</p><p className="text-sm" style={{ color: 'var(--text-muted)' }}>Share on socials</p></div>
            </button>
          </div>

          {/* Recent sales */}
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="font-bold" style={{ color: 'var(--text)' }}>Recent Sales</h2>
            </div>
            {stats?.recentSales?.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-4xl mb-3">🎵</p>
                <p style={{ color: 'var(--text-muted)' }}>Nothing here yet, go create</p>
                <Link href="/dashboard/uploads" className="inline-block mt-4 px-6 py-3 rounded-xl font-bold text-white" style={{ background: 'var(--sky)' }}>Upload a Beat</Link>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {stats?.recentSales?.map((sale: any) => (
                  <div key={sale.id} className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-medium" style={{ color: 'var(--text)' }}>{sale.beat?.title || sale.release?.title || 'Item'}</p>
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{sale.buyerName} · {sale.licenseType || sale.itemType}</p>
                    </div>
                    <span className="font-bold" style={{ color: 'var(--green)' }}>{formatCurrency(sale.amount, sale.currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
