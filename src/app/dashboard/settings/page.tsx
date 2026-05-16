'use client';
import { useEffect, useRef, useState } from 'react';
import { Loader2, CheckCircle2, CreditCard, Mic2 } from 'lucide-react';

export default function SettingsPage() {
  const [artist, setArtist] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connectingStripe, setConnectingStripe] = useState(false);
  const [stripeError, setStripeError] = useState('');
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
      const res = await fetch(`/api/dashboard/settings/upload-url?type=${type}`);
      if (!res.ok) throw new Error('Could not get upload URL');
      const { uploadUrl, publicUrl } = await res.json();
      await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      setArtist((p: any) => ({ ...p, [key]: publicUrl }));
    } catch (e: any) {
      console.error('Image upload failed:', e.message);
    }
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
      <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>Update your profile, payment setup, and public store link.</p>

      {/* Payment Setup */}
      <div className="p-6 rounded-2xl mb-8" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h2 className="font-bold text-lg mb-1" style={{ color: 'var(--text)' }}>💳 Payment Setup</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Connect Stripe so buyers pay directly to your bank. We take 1%, you keep 99%.</p>
        {artist.stripeAccountId ? (
          <div className="flex items-center gap-2 text-sm">
            <span style={{ color: 'var(--green)' }}>✓ Stripe connected</span>
            <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{artist.stripeAccountId.slice(0, 18)}…</span>
          </div>
        ) : (
          <>
            <button onClick={connectStripe} disabled={connectingStripe}
              className="px-6 py-3 rounded-xl font-bold text-white disabled:opacity-60 transition-opacity"
              style={{ background: 'linear-gradient(135deg,#635bff,#4338ca)' }}>
              {connectingStripe ? <><Loader2 size={16} className="animate-spin inline mr-2" />Connecting…</> : <><CreditCard size={16} className="inline mr-2" />Connect Stripe — Get Paid</>}
            </button>
            {stripeError && <p className="mt-3 text-sm text-red-400">⚠️ {stripeError}</p>}
          </>
        )}
      </div>

      {/* Profile Form */}
      <form onSubmit={saveProfile} className="space-y-5">
        <h2 className="font-bold text-lg" style={{ color: 'var(--text)' }}>Artist Profile</h2>

        {/* Photo Upload */}
        <div>
          <label className="block text-sm mb-2" style={{ color: 'var(--text-muted)' }}>Profile Photo</label>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center text-2xl"
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

        {/* Cover Image Upload */}
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
          { label: 'Artist Name', key: 'name', placeholder: 'Your stage name' },
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
            placeholder="e.g. Amapiano, Afrobeats, Hip Hop"
            onChange={e => setArtist((p: any) => ({ ...p, genreTags: e.target.value.split(',').map((t: string) => t.trim()).filter(Boolean) }))}
            className="w-full px-4 py-3 rounded-xl"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        </div>

        <div className="pt-2">
          <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
            Your public store:{' '}
            <a href={`/artist/${artist.slug}`} target="_blank" className="underline" style={{ color: 'var(--purple-light)' }}>
              vuka.app/artist/{artist.slug}
            </a>
          </p>
          <button type="submit" disabled={saving}
            className="w-full py-4 rounded-xl font-bold text-white disabled:opacity-60 transition-all"
            style={{ background: saved ? 'var(--green)' : 'var(--purple)' }}>
            {saving ? <><Loader2 size={16} className="animate-spin inline mr-2" />Saving…</> : saved ? <><CheckCircle2 size={16} className="inline mr-2" />Profile Saved!</> : 'Save Profile'}
          </button>
        </div>
      </form>
    </div>
  );
}
