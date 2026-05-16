'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';

function SuccessContent() {
  const searchParams = useSearchParams();
  const purchaseId = searchParams.get('purchaseId');
  const [purchase, setPurchase] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!purchaseId) { setLoading(false); return; }
    let attempts = 0;
    const poll = async () => {
      try {
        const res = await fetch(`/api/purchase/${purchaseId}`);
        if (res.ok) {
          const data = await res.json();
          setPurchase(data);
          if (data.status === 'confirmed' || attempts > 10) { setLoading(false); return; }
        }
      } catch {}
      attempts++;
      if (attempts < 12) setTimeout(poll, 2500);
      else setLoading(false);
    };
    poll();
  }, [purchaseId]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 text-center">
      <div className="text-6xl mb-6 animate-bounce">⏳</div>
      <h1 className="text-2xl font-bold mb-3" style={{ color: 'var(--text)' }}>Confirming your payment…</h1>
      <p style={{ color: 'var(--text-muted)' }}>Just now — we're processing your purchase.</p>
    </div>
  );

  if (purchase?.status === 'confirmed') return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 text-center">
      <div className="max-w-md">
        <div className="text-7xl mb-6">🎉</div>
        <h1 className="text-4xl font-black mb-3" style={{ color: 'var(--text)' }}>Sharp! It's yours now.</h1>
        <p className="mb-8" style={{ color: 'var(--text-muted)' }}>
          Your download link has been sent to <strong style={{ color: 'var(--purple-light)' }}>{purchase.buyerEmail}</strong>. Check your inbox.
        </p>
        <div className="p-6 rounded-2xl mb-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="font-bold text-lg mb-2" style={{ color: 'var(--text)' }}>{purchase.beat?.title || purchase.release?.title || 'Your Purchase'}</p>
          {purchase.licenseType && <p className="text-sm mb-1 capitalize" style={{ color: 'var(--text-muted)' }}>{purchase.licenseType} License</p>}
          <p className="text-sm font-mono" style={{ color: 'var(--purple-light)' }}>Ref: {purchase.licenseId}</p>
        </div>
        <Link
          href={`/download/${purchase.downloadToken}`}
          className="block w-full py-4 rounded-xl font-bold text-white text-lg mb-4"
          style={{ background: 'linear-gradient(135deg,var(--purple),#5b21b6)' }}
        >
          ⬇️ Download Now
        </Link>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Link valid for 30 days · 5 downloads max · <Link href="/redownload" className="underline">Re-download anytime</Link></p>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 text-center">
      <div className="max-w-md">
        <div className="text-6xl mb-6">📧</div>
        <h1 className="text-2xl font-bold mb-3" style={{ color: 'var(--text)' }}>Payment received!</h1>
        <p className="mb-6" style={{ color: 'var(--text-muted)' }}>
          We're processing your purchase. You'll receive a download link by email shortly.
        </p>
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>If you don't receive an email within 5 minutes, use the re-download portal below.</p>
        <Link href="/redownload" className="inline-block px-6 py-3 rounded-xl font-bold" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          Re-download Portal
        </Link>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <Suspense fallback={
        <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 text-center">
          <div className="text-6xl mb-6 animate-bounce">⏳</div>
          <h1 className="text-2xl font-bold mb-3" style={{ color: 'var(--text)' }}>Loading…</h1>
        </div>
      }>
        <SuccessContent />
      </Suspense>
    </div>
  );
}
