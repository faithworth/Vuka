'use client';
// src/app/dashboard/settings/page.tsx
import { useEffect, useRef, useState } from 'react';
import { Loader2, CheckCircle2, CreditCard, Mic2, ExternalLink, Info } from 'lucide-react';

export default function SettingsPage() {
  const [artist, setArtist] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connectingStripe, setConnectingStripe] = useState(false);
  const [stripeError, setStripeError] = useState('');
  const [savingPayfast, setSavingPayfast] = useState(false);
  const [savedPayfast, setSavedPayfast] = useState(false);
  const [saved, setSaved] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/dashboard/settings')
      .then(r => r.json())
      .then(d => { setArtist(d.artist || d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function pickImage(file: File, key: 'photoUrl' | 'coverUrl', setPreview: (s: string) => void) {
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    try {
      const type = key === 'coverUrl' ? 'cover' : 'photo';
      // Pass the actual mime type so the presigned URL is signed with the correct Content-Type
      const mimeType = file.type || 'image/jpeg';
      const res = await fetch(`/api/dashboard/settings/upload-url?type=${type}&mimeType=${encodeURIComponent(mimeType)}`);
      if (!res.ok) throw new Error('Could not get upload URL');
      const { uploadUrl, publicUrl } = await res.json();
      // Upload directly to R2 — Content-Type must match what was signed
      const uploadRes = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': mimeType } });
      if (!uploadRes.ok) throw new Error(`R2 upload failed: ${uploadRes.status}`);
      // Update local state with new URL
      const updatedArtist = await new Promise<any>(resolve => {
        setArtist((p: any) => {
          const updated = { ...p, [key]: publicUrl };
          resolve(updated);
          return updated;
        });
      });
      // Auto-save to database so it persists on reload
      await fetch('/api/dashboard/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: publicUrl }),
      });
    } catch (e: any) {
      console.error('Image upload failed:', e.message);
    }
  }

  async function savePayfast() {
    setSavingPayfast(true);
    const res = await fetch('/api/dashboard/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payfastMerchant: artist.payfastMerchant || '' }),
    });
    const data = await res.json();
    if (data.artist) setArtist((p: any) => ({ ...p, payfastMerchant: data.artist.payfastMerchant }));
    setSavingPayfast(false);
    setSavedPayfast(true);
    setTimeout(() => setSavedPayfast(false), 3000);
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch('/api/dashboard/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(artist),
    }).catch(() => {});
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function connectStripe() {
    setConnectingStripe(true);
    setStripeError('');
    try {
      const res = await fetch('/api/connect/onboard');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Stripe connection failed');
      if (!data.url) throw new Error('No onboarding URL returned. Check that Stripe Connect is enabled for your account.');
      window.location.href = data.url;
    } catch (e: any) {
      setStripeError(e.message);
      setConnectingStripe(false);
    }
  }

  if (loading) return (
    <div className="p-10 flex items-center gap-3" style={{ color: 'var(--text-muted)' }}>
      <Loader2 size={20} className="animate-spin" /> Loading your profile…
    </div>
  );
  if (!artist) return (
    <div className="p-10">
      <p style={{ color: 'var(--text-muted)' }}>You need an artist profile to access settings.</p>
    </div>
  );

  return (
    <div className="p-6 md:p-10 max-w-2xl">
      <h1 className="text-2xl font-black mb-2" style={{ color: 'var(--text)' }}>Settings</h1>
      <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
        Manage your profile, payments, and public store link.
      </p>

      {/* Payment Setup */}
      <div className="rounded-2xl mb-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="font-bold text-lg mb-1" style={{ color: 'var(--text)' }}>💳 Payment Setup</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Connect your payment accounts. Buyers in South Africa pay via PayFast; international buyers via Stripe. You keep 100%.
          </p>
        </div>

        {/* Stripe */}
        <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Stripe — International Payments</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>USD, EUR, GBP and 130+ currencies via Stripe Connect</p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full font-medium" style={{
              background: artist.stripeAccountId ? 'color-mix(in srgb,var(--green) 15%,transparent)' : 'var(--surface2)',
              color: artist.stripeAccountId ? 'var(--green)' : 'var(--text-muted)',
            }}>
              {artist.stripeAccountId ? '✓ Connected' : 'Not connected'}
            </span>
          </div>
          {artist.stripeAccountId ? (
            <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              Account: {artist.stripeAccountId.slice(0, 20)}…
            </p>
          ) : (
            <>
              <button onClick={connectStripe} disabled={connectingStripe}
                className="px-5 py-2.5 rounded-xl font-semibold text-sm text-white disabled:opacity-60 transition-opacity"
                style={{ background: 'linear-gradient(135deg,#635bff,#4338ca)' }}>
                {connectingStripe
                  ? <><Loader2 size={14} className="animate-spin inline mr-2" />Connecting…</>
                  : <><CreditCard size={14} className="inline mr-2" />Connect Stripe</>}
              </button>
              {stripeError && <p className="mt-3 text-sm text-red-400">⚠️ {stripeError}</p>}
            </>
          )}
        </div>

        {/* PayFast */}
        <div className="p-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>PayFast — South African Payments</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>ZAR payments via PayShap, EFT, credit cards — SA buyers</p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full font-medium" style={{
              background: artist.payfastMerchant ? 'color-mix(in srgb,var(--green) 15%,transparent)' : 'var(--surface2)',
              color: artist.payfastMerchant ? 'var(--green)' : 'var(--text-muted)',
            }}>
              {artist.payfastMerchant ? '✓ Connected' : 'Not connected'}
            </span>
          </div>
          <div>
            <label className="block text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
              PayFast Merchant ID
            </label>
            <input
              value={artist.payfastMerchant || ''}
              placeholder="e.g. 12345678"
              onChange={e => setArtist((p: any) => ({ ...p, payfastMerchant: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl text-sm"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            <div className="flex items-start gap-1.5 mt-2">
              <Info size={12} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Find your Merchant ID in your{' '}
                <a href="https://my.payfast.io/settings/developer-settings" target="_blank" rel="noopener noreferrer"
                  className="underline inline-flex items-center gap-0.5"
                  style={{ color: 'var(--purple-light)' }}>
                  my.payfast.io <ExternalLink size={10} />
                </a>
                . Required for SA buyers to pay you directly via PayShap or EFT.
              </p>
            </div>
            <button
              type="button"
              onClick={savePayfast}
              disabled={savingPayfast}
              className="mt-3 px-5 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-60"
              style={{ background: savedPayfast ? 'var(--green)' : 'linear-gradient(135deg,#00a05a,#007a44)' }}>
              {savingPayfast ? 'Saving…' : savedPayfast ? '✓ Saved!' : 'Save PayFast ID'}
            </button>
          </div>
        </div>
      </div>

      {/* Currency Preference */}
      <div className="p-6 rounded-2xl mb-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h2 className="font-bold text-base mb-3" style={{ color: 'var(--text)' }}>Default Currency</h2>
        <select
          value={artist.currency || 'ZAR'}
          onChange={e => setArtist((p: any) => ({ ...p, currency: e.target.value }))}
          className="w-full px-4 py-3 rounded-xl text-sm"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          <option value="ZAR">ZAR — South African Rand</option>
          <option value="USD">USD — US Dollar</option>
          <option value="EUR">EUR — Euro</option>
          <option value="GBP">GBP — British Pound</option>
          <option value="NGN">NGN — Nigerian Naira</option>
          <option value="KES">KES — Kenyan Shilling</option>
          <option value="GHS">GHS — Ghanaian Cedi</option>
        </select>
      </div>

      {/* Profile Form */}
      <form onSubmit={saveProfile} className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg" style={{ color: 'var(--text)' }}>Artist Profile</h2>
          <a href={`/artist/${artist.slug}`} target="_blank" rel="noopener noreferrer"
            className="text-xs flex items-center gap-1 underline"
            style={{ color: 'var(--purple-light)' }}>
            View public page <ExternalLink size={11} />
          </a>
        </div>

        {/* Photo Upload */}
        <div>
          <label className="block text-sm mb-2" style={{ color: 'var(--text-muted)' }}>Profile Photo</label>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
              style={{ background: 'var(--surface2)', border: '2px solid var(--border)' }}>
              {(photoPreview || artist.photoUrl)
                ? <img src={photoPreview || artist.photoUrl} alt="Photo" className="w-full h-full object-cover" />
                : <Mic2 size={24} style={{ color: 'var(--text-muted)' }} />}
            </div>
            <button type="button" onClick={() => photoRef.current?.click()}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              Upload Photo
            </button>
            <input ref={photoRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) pickImage(f, 'photoUrl', setPhotoPreview); }} />
          </div>
        </div>

        {/* Cover Image */}
        <div>
          <label className="block text-sm mb-2" style={{ color: 'var(--text-muted)' }}>Cover / Banner Image</label>
          <div className="w-full h-28 rounded-xl overflow-hidden relative flex items-center justify-center cursor-pointer"
            style={{ background: 'var(--surface2)', border: '2px dashed var(--border)' }}
            onClick={() => coverRef.current?.click()}>
            {(coverPreview || artist.coverUrl)
              ? <img src={coverPreview || artist.coverUrl} alt="Cover" className="w-full h-full object-cover" />
              : <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Click to upload cover image</span>}
          </div>
          <input ref={coverRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) pickImage(f, 'coverUrl', setCoverPreview); }} />
        </div>

        {/* Text Fields */}
        {[
          { label: 'Artist / Stage Name', key: 'name', placeholder: 'Your stage name' },
          { label: 'City', key: 'city', placeholder: 'e.g. Johannesburg' },
          { label: 'Country', key: 'country', placeholder: 'e.g. South Africa' },
        ].map(f => (
          <div key={f.key}>
            <label className="block text-sm mb-1" style={{ color: 'var(--text-muted)' }}>{f.label}</label>
            <input value={artist[f.key] || ''} placeholder={f.placeholder}
              onChange={e => setArtist((p: any) => ({ ...p, [f.key]: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
        ))}

        <div>
          <label className="block text-sm mb-1" style={{ color: 'var(--text-muted)' }}>Bio — tell fans your story</label>
          <textarea rows={4} value={artist.bio || ''} placeholder="Who are you? What's your sound? Where are you from?"
            onChange={e => setArtist((p: any) => ({ ...p, bio: e.target.value }))}
            className="w-full px-4 py-3 rounded-xl resize-none"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        </div>

        <div>
          <label className="block text-sm mb-1" style={{ color: 'var(--text-muted)' }}>Genre Tags (comma separated)</label>
          <input value={(artist.genreTags || []).join(', ')}
            placeholder="e.g. Amapiano, Afrobeats, Hip Hop, Gqom"
            onChange={e => setArtist((p: any) => ({ ...p, genreTags: e.target.value.split(',').map((t: string) => t.trim()).filter(Boolean) }))}
            className="w-full px-4 py-3 rounded-xl"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        </div>

        {/* Social Links */}
        <div>
          <label className="block text-sm mb-2" style={{ color: 'var(--text-muted)' }}>Social Links</label>
          <div className="space-y-2">
            {['instagram', 'twitter', 'spotify', 'youtube', 'soundcloud'].map(platform => (
              <div key={platform} className="flex items-center gap-2">
                <span className="text-xs w-24 capitalize flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{platform}</span>
                <input
                  value={(artist.socialLinks as any)?.[platform] || ''}
                  placeholder={`https://${platform}.com/yourname`}
                  onChange={e => setArtist((p: any) => ({
                    ...p,
                    socialLinks: { ...(p.socialLinks || {}), [platform]: e.target.value }
                  }))}
                  className="flex-1 px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="pt-2">
          <button type="submit" disabled={saving}
            className="w-full py-4 rounded-xl font-bold text-white disabled:opacity-60 transition-all"
            style={{ background: saved ? 'var(--green)' : 'var(--purple)' }}>
            {saving
              ? <><Loader2 size={16} className="animate-spin inline mr-2" />Saving…</>
              : saved
              ? <><CheckCircle2 size={16} className="inline mr-2" />Profile Saved!</>
              : 'Save Profile'}
          </button>
        </div>
      </form>
    </div>
  );
}
