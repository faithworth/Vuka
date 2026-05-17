'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { ShoppingBag, Heart, Download, Music2, ArrowRight, Loader2, ExternalLink } from 'lucide-react';
import Navbar from '@/components/Navbar';

interface Purchase {
  id: string;
  createdAt: string;
  amount: number;
  currency: string;
  downloadToken?: string;
  beat?: { title: string; artist: { name: string; slug: string } };
  release?: { title: string; artist: { name: string; slug: string } };
}

export default function FanDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace('/auth/login'); return; }
      setUser(data.user);
      fetch('/api/dashboard/purchases')
        .then(r => r.json())
        .then(d => { setPurchases(d.purchases || []); setLoading(false); })
        .catch(() => setLoading(false));
    });
  }, [router]);

  if (!user || loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <Loader2 size={24} className="animate-spin" style={{ color: 'var(--purple-light)' }} />
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="mb-10">
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text)' }}>Your Library</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Everything you've bought and supported</p>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          {[
            { icon: ShoppingBag, label: 'Purchases', value: purchases.length, href: '#purchases', color: 'var(--purple-light)' },
            { icon: Heart, label: 'Following', value: '—', href: '#following', color: 'var(--red)' },
            { icon: Download, label: 'Downloads', value: purchases.filter(p => p.downloadToken).length, href: '#purchases', color: 'var(--green)' },
          ].map(s => (
            <a key={s.label} href={s.href}
              className="flex items-center gap-4 p-5 rounded-2xl cursor-pointer transition-colors"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(124,58,237,0.1)' }}>
                <s.icon size={20} style={{ color: s.color }} />
              </div>
              <div>
                <div className="text-xl font-bold" style={{ color: 'var(--text)' }}>{s.value}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
              </div>
            </a>
          ))}
        </div>

        {/* Purchases */}
        <section id="purchases">
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>Your Purchases</h2>

          {purchases.length === 0 ? (
            <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <Music2 size={40} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
              <h3 className="font-semibold mb-2" style={{ color: 'var(--text)' }}>No purchases yet</h3>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Browse the store and support independent artists</p>
              <Link href="/store" className="btn btn-primary">
                Browse the Store <ArrowRight size={16} />
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {purchases.map(p => {
                const title = p.beat?.title || p.release?.title || 'Unknown';
                const artist = p.beat?.artist || p.release?.artist;
                const artistSlug = artist?.slug;
                return (
                  <div key={p.id} className="flex items-center gap-4 p-4 rounded-xl"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: 'var(--surface2)' }}>
                      <Music2 size={18} style={{ color: 'var(--purple-light)' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate" style={{ color: 'var(--text)' }}>{title}</p>
                      {artist && (
                        <Link href={`/artist/${artistSlug}`}
                          className="text-xs hover:underline" style={{ color: 'var(--text-muted)' }}>
                          {artist.name}
                        </Link>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                        {p.currency} {p.amount.toFixed(2)}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {new Date(p.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    {p.downloadToken && (
                      <Link href={`/download/${p.downloadToken}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0"
                        style={{ background: 'rgba(16,185,129,0.12)', color: 'var(--green)', border: '1px solid rgba(16,185,129,0.2)' }}>
                        <Download size={13} />
                        Download
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Discover more */}
        <div className="mt-12 p-6 rounded-2xl text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <h3 className="font-semibold mb-2" style={{ color: 'var(--text)' }}>Discover more music</h3>
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Independent artists from across Africa and beyond</p>
          <Link href="/store" className="btn btn-primary">
            Browse Store <ExternalLink size={15} />
          </Link>
        </div>

      </div>
    </div>
  );
}
