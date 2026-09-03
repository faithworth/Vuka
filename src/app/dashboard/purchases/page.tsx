'use client';
import { useEffect, useState } from 'react';
import { formatCurrency, formatDate } from '@/lib/utils';

const FULFILLMENT_LABEL: Record<string, string> = {
  awaiting_shipment: 'Awaiting shipment',
  shipped: 'Shipped',
  delivered: 'Delivered',
};

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<any[]>([]);
  const [role, setRole] = useState<'artist' | 'fan' | null>(null);
  const [loading, setLoading] = useState(true);
  const [shipModal, setShipModal] = useState<any>(null);
  const [trackingInput, setTrackingInput] = useState('');
  const [shipSaving, setShipSaving] = useState(false);
  const [shipError, setShipError] = useState('');

  function load() {
    fetch('/api/dashboard/purchases')
      .then(r => r.json())
      .then(d => { setPurchases(d.purchases || []); setRole(d.role || null); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function markShipped() {
    if (!shipModal) return;
    setShipSaving(true);
    setShipError('');
    try {
      const res = await fetch('/api/dashboard/merch/ship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchaseId: shipModal.id, trackingRef: trackingInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setShipError(data.error || 'Something went wrong'); return; }
      setShipModal(null);
      setTrackingInput('');
      load();
    } catch {
      setShipError('Something went wrong. Please try again.');
    } finally {
      setShipSaving(false);
    }
  }

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
                  {['Date', 'Item', 'Buyer', 'License', 'Amount', 'Status', 'Shipping'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {purchases.map((p: any) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>{formatDate(p.createdAt)}</td>
                    <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--text)' }}>
                      {p.beat?.title || p.release?.title || p.video?.title || p.sample?.title || p.merch?.title || ({
                        membership:  'Fan Membership',
                        marketplace: 'Marketplace Order',
                        ticket:      'Event Ticket',
                        campaign:    'Campaign Pledge',
                      } as Record<string, string>)[p.itemType] || 'Purchase'}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>{p.buyerName}</td>
                    <td className="px-4 py-3 text-sm capitalize" style={{ color: 'var(--text-muted)' }}>{p.licenseType || p.itemType}</td>
                    <td className="px-4 py-3 text-sm font-bold" style={{ color: 'var(--green)' }}>{formatCurrency(p.amount, p.currency)}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-1 rounded-full font-medium"
                        style={{ background: p.status === 'confirmed' ? 'rgba(16,185,129,0.15)' : 'var(--surface2)', color: p.status === 'confirmed' ? 'var(--green)' : 'var(--text-muted)' }}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {p.itemType !== 'merch' ? (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      ) : p.fulfillmentStatus === 'shipped' || p.fulfillmentStatus === 'delivered' ? (
                        <div>
                          <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--green)' }}>
                            {FULFILLMENT_LABEL[p.fulfillmentStatus]}
                          </span>
                          {p.trackingRef && (
                            <p className="text-xs mt-1 font-mono" style={{ color: 'var(--text-muted)' }}>{p.trackingRef}</p>
                          )}
                        </div>
                      ) : role === 'artist' ? (
                        <button
                          onClick={() => { setShipModal(p); setTrackingInput(''); setShipError(''); }}
                          className="text-xs px-3 py-1.5 rounded-full font-semibold"
                          style={{ background: 'var(--sky)', color: 'white' }}
                        >
                          Mark Shipped
                        </button>
                      ) : (
                        <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
                          Awaiting shipment
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {shipModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => !shipSaving && setShipModal(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-bold text-lg mb-1" style={{ color: 'var(--text)' }}>Mark as shipped</h3>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
              {shipModal.merch?.title} — {shipModal.buyerName}
            </p>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>
              Courier tracking number (optional)
            </label>
            <input
              value={trackingInput}
              onChange={e => setTrackingInput(e.target.value)}
              placeholder="e.g. Courier Guy waybill number"
              className="w-full px-3 py-2 rounded-lg text-sm mb-4"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            {shipError && <p className="text-xs mb-3" style={{ color: '#FF4D4D' }}>{shipError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setShipModal(null)}
                disabled={shipSaving}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold"
                style={{ background: 'var(--surface2)', color: 'var(--text)' }}
              >
                Cancel
              </button>
              <button
                onClick={markShipped}
                disabled={shipSaving}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold"
                style={{ background: 'var(--sky)', color: 'white', opacity: shipSaving ? 0.7 : 1 }}
              >
                {shipSaving ? 'Saving…' : 'Confirm shipped'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
