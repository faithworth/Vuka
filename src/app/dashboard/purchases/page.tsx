'use client';
import { useEffect, useState } from 'react';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard/purchases').then(r => r.json()).then(d => { setPurchases(d.purchases || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 md:p-10">
      <h1 className="text-2xl font-black mb-8" style={{ color: 'var(--text)' }}>Purchases</h1>
      {loading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'var(--surface)' }} />)}</div>
      ) : purchases.length === 0 ? (
        <div className="text-center py-24 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-5xl mb-4">🛒</p>
          <p className="font-bold mb-2" style={{ color: 'var(--text)' }}>No purchases yet</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>When fans buy your beats or releases, every sale shows up here.</p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Date', 'Item', 'Buyer', 'License', 'Amount', 'Status'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {purchases.map((p: any) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--muted)' }}>{formatDate(p.createdAt)}</td>
                    <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--text)' }}>{p.beat?.title || p.release?.title || '—'}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--muted)' }}>{p.buyerName}</td>
                    <td className="px-4 py-3 text-sm capitalize" style={{ color: 'var(--muted)' }}>{p.licenseType || p.itemType}</td>
                    <td className="px-4 py-3 text-sm font-bold" style={{ color: 'var(--green)' }}>{formatCurrency(p.amount, p.currency)}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-1 rounded-full font-medium"
                        style={{ background: p.status === 'confirmed' ? 'rgba(16,185,129,0.15)' : 'var(--surface2)', color: p.status === 'confirmed' ? 'var(--green)' : 'var(--muted)' }}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
