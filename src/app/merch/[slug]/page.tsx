'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { BuyModal } from '@/components/BuyModal';
import { ShoppingCart, Package, Tag, ArrowLeft, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function MerchDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [merch, setMerch] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [buyOpen, setBuyOpen] = useState(false);
  const [selectedSize, setSelectedSize] = useState<string>('');

  useEffect(() => {
    fetch(`/api/store/merch?slug=${slug}`)
      .then(r => r.json())
      .then(d => { setMerch(d.merch || null); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <p style={{ color: 'var(--text-muted)' }}>Just now…</p>
    </div>
  );

  if (!merch) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="text-center">
        <Package size={48} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
        <p className="font-semibold mb-2" style={{ color: 'var(--text)' }}>Item not found</p>
        <Link href="/store/merch" className="text-sm" style={{ color: 'var(--sky)' }}>Browse merch →</Link>
      </div>
    </div>
  );

  const outOfStock = merch.stock <= 0;
  const needsSize  = merch.sizes?.length > 0 && !selectedSize;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-8">

        <Link href="/store/merch"
          className="inline-flex items-center gap-2 text-sm mb-6 hover:underline"
          style={{ color: 'var(--text-muted)' }}>
          <ArrowLeft size={14} /> Back to Merch
        </Link>

        <div className="flex flex-col md:flex-row gap-8">

          {/* Image */}
          <div className="md:w-80 flex-shrink-0">
            <div className="aspect-square rounded-2xl overflow-hidden flex items-center justify-center text-6xl"
              style={{ background: 'var(--surface2)' }}>
              {merch.imageUrl
                ? <img src={merch.imageUrl} className="w-full h-full object-cover" alt={merch.title} />
                : '👕'}
            </div>
          </div>

          {/* Info */}
          <div className="flex-1">
            <div className="text-xs font-bold mb-2 uppercase tracking-widest" style={{ color: 'var(--sky)' }}>
              Artist Merch
            </div>
            <h1 className="text-3xl font-black mb-2" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
              {merch.title}
            </h1>

            <Link href={`/artist/${merch.artist?.slug}`}
              className="text-lg hover:underline mb-4 block"
              style={{ color: 'var(--sky)' }}>
              {merch.artist?.name}
            </Link>

            {/* Meta badges */}
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="flex items-center gap-1.5 text-sm px-3 py-1 rounded-full"
                style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
                <Package size={12} />
                {outOfStock ? 'Out of Stock' : `${merch.stock} in stock`}
              </span>
              {merch.sizes?.length > 0 && (
                <span className="flex items-center gap-1.5 text-sm px-3 py-1 rounded-full"
                  style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
                  <Tag size={12} /> {merch.sizes.length} sizes
                </span>
              )}
            </div>

            {merch.description && (
              <p className="mb-6 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {merch.description}
              </p>
            )}

            {/* Size selector */}
            {merch.sizes?.length > 0 && (
              <div className="mb-6">
                <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>Select Size</p>
                <div className="flex gap-2 flex-wrap">
                  {merch.sizes.map((size: string) => (
                    <button key={size} onClick={() => setSelectedSize(size)}
                      className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                      style={{
                        background: selectedSize === size ? 'var(--sky)' : 'var(--surface)',
                        color: selectedSize === size ? 'white' : 'var(--text)',
                        border: `1px solid ${selectedSize === size ? 'var(--sky)' : 'var(--border)'}`,
                      }}>
                      {size}
                    </button>
                  ))}
                </div>
                {needsSize && (
                  <p className="text-xs mt-2 flex items-center gap-1" style={{ color: 'var(--gold)' }}>
                    <AlertCircle size={12} /> Please select a size first
                  </p>
                )}
              </div>
            )}

            {/* Price + Buy */}
            <div className="flex items-center gap-4 mb-6">
              <div className="text-4xl font-black" style={{ color: 'var(--sky)', fontFamily: 'var(--font-display)' }}>
                R{merch.price}
              </div>
              {outOfStock ? (
                <div className="flex-1 py-4 rounded-2xl text-center font-bold text-sm"
                  style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                  Out of Stock
                </div>
              ) : (
                <button
                  onClick={() => !needsSize && setBuyOpen(true)}
                  className="flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-white transition-opacity"
                  style={{
                    background: needsSize ? 'var(--surface2)' : 'var(--sky)',
                    opacity: needsSize ? 0.7 : 1,
                    cursor: needsSize ? 'not-allowed' : 'pointer',
                  }}>
                  <ShoppingCart size={18} />
                  Buy — R{merch.price}
                </button>
              )}
            </div>

            {/* Artist card */}
            {merch.artist && (
              <Link href={`/artist/${merch.artist.slug}`}
                className="flex items-center gap-3 p-4 rounded-2xl transition-all hover:scale-[1.01]"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                {merch.artist.photoUrl ? (
                  <img src={merch.artist.photoUrl} alt={merch.artist.name}
                    className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0"
                    style={{ background: 'var(--sky)' }}>
                    {merch.artist.name[0]}
                  </div>
                )}
                <div>
                  <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{merch.artist.name}</p>
                  <p className="text-xs" style={{ color: 'var(--sky)' }}>View artist profile →</p>
                </div>
              </Link>
            )}
          </div>
        </div>
      </div>

      {buyOpen && merch && (
        <BuyModal
          itemType="merch"
          release={{
            id: merch.id,
            title: merch.title + (selectedSize ? ` — ${selectedSize}` : ''),
            artworkUrl: merch.imageUrl || '',
            price: merch.price,
            minPrice: merch.price,
            payWhatWant: false,
            artistSharePct: undefined,
            artist: { name: merch.artist?.name || '' },
          }}
          onClose={() => setBuyOpen(false)}
        />
      )}
    </div>
  );
}
