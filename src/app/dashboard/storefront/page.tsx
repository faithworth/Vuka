'use client';
import { useEffect, useState } from 'react';
import { Loader2, Save, ExternalLink, Store, Palette, Type, Globe, Instagram, Twitter, Youtube } from 'lucide-react';

interface StorefrontData {
  tagline?: string;
  accentColor?: string;
  featuredBeatIds?: string[];
  socialLinks?: {
    instagram?: string;
    twitter?: string;
    youtube?: string;
    website?: string;
  };
  bioLong?: string;
  showSupport?: boolean;
}

export default function StorefrontPage() {
  const [data, setData] = useState<StorefrontData>({});
  const [artistSlug, setArtistSlug] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/creator/storefront').then(r => r.ok ? r.json() : {}),
      fetch('/api/auth/me').then(r => r.ok ? r.json() : {}),
    ]).then(([sf, me]) => {
      setData(sf.storefront || {});
      setArtistSlug(me.artist?.slug || me.slug || '');
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch('/api/creator/storefront', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const d = await res.json();
        setError(d.error || 'Failed to save');
      }
    } catch {
      setError('Failed to save storefront');
    }
    setSaving(false);
  }

  function update(key: keyof StorefrontData, val: any) {
    setData(prev => ({ ...prev, [key]: val }));
    setSaved(false);
  }

  function updateSocial(key: string, val: string) {
    setData(prev => ({
      ...prev,
      socialLinks: { ...(prev.socialLinks || {}), [key]: val },
    }));
    setSaved(false);
  }

  if (loading) return (
    <div className="p-6 md:p-10 flex justify-center py-20">
      <Loader2 size={24} className="animate-spin" style={{ color: 'var(--sky)' }} />
    </div>
  );

  return (
    <div className="p-6 md:p-10 max-w-3xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
            Storefront
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Customise how your artist page looks to fans
          </p>
        </div>
        <div className="flex items-center gap-2">
          {artistSlug && (
            <a href={`/artist/${artistSlug}`} target="_blank" rel="noopener noreferrer"
              className="btn btn-secondary gap-2 text-sm">
              <ExternalLink size={13} /> View Page
            </a>
          )}
          <button onClick={save} disabled={saving} className="btn btn-primary gap-2 disabled:opacity-50">
            {saving
              ? <Loader2 size={14} className="animate-spin" />
              : saved ? '✓ Saved' : <><Save size={14} /> Save</>
            }
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-5 p-3 rounded-xl text-sm" style={{ background: 'rgba(204,26,26,0.08)', color: 'var(--red)', border: '1px solid rgba(204,26,26,0.2)' }}>
          {error}
        </div>
      )}

      <div className="space-y-6">

        {/* Tagline */}
        <section className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Type size={16} style={{ color: 'var(--sky)' }} />
            <h2 className="font-bold text-sm" style={{ color: 'var(--text)' }}>Profile Copy</h2>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
                TAGLINE
              </label>
              <input
                className="input"
                placeholder="e.g. Beats that hit different. Based in Johannesburg."
                value={data.tagline || ''}
                onChange={e => update('tagline', e.target.value)}
                maxLength={120}
              />
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Short line shown under your name on your profile
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
                EXTENDED BIO
              </label>
              <textarea
                className="input resize-none"
                rows={4}
                placeholder="Tell your story — your background, your sound, what makes you different..."
                value={data.bioLong || ''}
                onChange={e => update('bioLong', e.target.value)}
                maxLength={1000}
              />
            </div>
          </div>
        </section>

        {/* Accent Color */}
        <section className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Palette size={16} style={{ color: 'var(--sky)' }} />
            <h2 className="font-bold text-sm" style={{ color: 'var(--text)' }}>Brand Color</h2>
          </div>
          <div className="flex items-center gap-4">
            <input
              type="color"
              value={data.accentColor || '#38b6e8'}
              onChange={e => update('accentColor', e.target.value)}
              className="w-12 h-12 rounded-xl cursor-pointer border-0 p-0"
              style={{ background: 'none' }}
            />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                Accent color: <span style={{ color: data.accentColor || 'var(--sky)' }}>{data.accentColor || '#38b6e8'}</span>
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Used for buttons and highlights on your artist page
              </p>
            </div>
          </div>
        </section>

        {/* Social Links */}
        <section className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Globe size={16} style={{ color: 'var(--sky)' }} />
            <h2 className="font-bold text-sm" style={{ color: 'var(--text)' }}>Social Links</h2>
          </div>
          <div className="space-y-3">
            {[
              { key: 'instagram', icon: Instagram, placeholder: 'https://instagram.com/yourhandle', label: 'INSTAGRAM' },
              { key: 'twitter', icon: Twitter, placeholder: 'https://twitter.com/yourhandle', label: 'X / TWITTER' },
              { key: 'youtube', icon: Youtube, placeholder: 'https://youtube.com/@yourchannel', label: 'YOUTUBE' },
              { key: 'website', icon: Globe, placeholder: 'https://yourwebsite.com', label: 'WEBSITE' },
            ].map(({ key, icon: Icon, placeholder, label }) => (
              <div key={key}>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  {label}
                </label>
                <div className="relative">
                  <Icon size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                  <input
                    className="input pl-9"
                    placeholder={placeholder}
                    value={(data.socialLinks as any)?.[key] || ''}
                    onChange={e => updateSocial(key, e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Show Support Toggle */}
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Store size={16} style={{ color: 'var(--sky)' }} />
              <div>
                <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Show Support Button</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Allow fans to tip / support you from your artist page
                </p>
              </div>
            </div>
            <button
              onClick={() => update('showSupport', !data.showSupport)}
              className="relative w-11 h-6 rounded-full transition-colors flex-shrink-0"
              style={{ background: data.showSupport !== false ? 'var(--sky)' : 'var(--border)' }}>
              <span
                className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                style={{ transform: data.showSupport !== false ? 'translateX(22px)' : 'translateX(2px)' }}
              />
            </button>
          </div>
        </section>

      </div>

      <div className="mt-6 flex justify-end">
        <button onClick={save} disabled={saving} className="btn btn-primary gap-2 disabled:opacity-50">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saved ? 'Saved!' : 'Save Storefront'}
        </button>
      </div>
    </div>
  );
}
