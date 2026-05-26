'use client';
import { useEffect, useState } from 'react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Heart } from 'lucide-react';

const TIERS: Record<string, string> = {
  'Listener': '🎧', 'Supporter': '⭐', 'Day One': '🔥', 'Ride or Die': '💜'
};

export default function DashboardSupportPage() {
  const [txns, setTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({ total: 0, count: 0 });

  useEffect(() => {
    fetch('/api/dashboard/support').then(r => r.json()).then(d => {
      setTxns(d.transactions || []);
      const total = (d.transactions || []).reduce((s: number, t: any) => t.status === 'confirmed' ? s + t.amount : s, 0);
      setTotals({ total, count: (d.transactions || []).filter((t: any) => t.status === 'confirmed').length });
      setLoading(false);
    });
  }, []);

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-black mb-2" style={{ color: 'var(--text)' }}>Your Riders</h1>
      <p className="mb-6 text-sm" style={{ color: 'var(--text-muted)' }}>Fans who've supported you directly.</p>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="p-4 rounded-xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>Total Support Received</div>
          <div className="text-2xl font-black" style={{ color: 'var(--gold)' }}>{formatCurrency(totals.total)}</div>
        </div>
        <div className="p-4 rounded-xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>Supporters</div>
          <div className="text-2xl font-black" style={{ color: 'var(--sky)' }}>{totals.count}</div>
        </div>
      </div>

      {loading && <p style={{ color: 'var(--text-muted)' }}>Just now…</p>}

      {!loading && txns.length === 0 && (
        <div className="text-center py-20 rounded-2xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <Heart className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--sky)' }} />
          <p className="font-bold" style={{ color: 'var(--text)' }}>Nothing here yet, go create</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Share your profile link and your fans will find you.</p>
        </div>
      )}

      <div className="space-y-3">
        {txns.map((txn: any) => (
          <div key={txn.id} className="p-4 rounded-xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
                  style={{ background: 'var(--surface2)' }}>{TIERS[txn.tier] || '🎧'}</div>
                <div>
                  <div className="font-bold text-sm" style={{ color: 'var(--text)' }}>{txn.fanName}</div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{txn.tier} · {formatDate(txn.createdAt)}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-black" style={{ color: txn.status === 'confirmed' ? 'var(--gold)' : 'var(--text-muted)' }}>
                  {formatCurrency(txn.amount, txn.currency)}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{txn.status}</div>
              </div>
            </div>
            {txn.message && (
              <div className="border-l-2 pl-3 mt-2" style={{ borderColor: 'var(--sky)', color: 'var(--text-muted)' }}>
                <p className="text-sm italic">"{txn.message}"</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
