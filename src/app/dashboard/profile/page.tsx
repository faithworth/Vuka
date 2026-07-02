'use client';
// ============================================================
// VUKA — Artist Profile Editor (Phase 3)
// /dashboard/profile — edit public profile: avatar, banner,
// bio, genre tags, social links, stage name.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2, CheckCircle, Upload, Camera, ExternalLink,
  Instagram, Twitter, Youtube, Music2, Globe, ArrowLeft,
} from 'lucide-react';

const GENRES = [
  'Amapiano', 'Afrobeats', 'Gqom', 'Hip-Hop', 'Trap', 'R&B',
  'Drill', 'House', 'Kwaito', 'Gospel', 'Jazz', 'Pop', 'Electronic',
  'Reggae', 'Dancehall', 'Soul',
];

const SOCIAL_FIELDS = [
  { key: 'spotify',   label: 'Spotify Artist URL',   placeholder: 'https://open.spotify.com/artist/…' },
  { key: 'instagram', label: 'Instagram',             placeholder: '@yourhandle or full URL' },
  { key: 'twitter',   label: 'X / Twitter',           placeholder: '@yourhandle' },
  { key: 'youtube',   label: 'YouTube',               placeholder: 'https://youtube.com/@channel' },
  { key: 'tiktok',    label: 'TikTok',                placeholder: '@yourhandle' },
  { key: 'soundcloud',label: 'SoundCloud',            placeholder: 'https://soundcloud.com/yourname' },
  { key: 'website',   label: 'Personal Website',      placeholder: 'https://yoursite.com' },
];

function normalizeContentType(file: File): string {
  const name = file.name.toLowerCase();
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.png')) return 'image/png';
  return file.type || 'image/jpeg';
}

async function uploadToR2(presignedUrl: string, file: File): Promise<void> {
  const res = await fetch(presignedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': normalizeContentType(file) },
    body: file,
  });
  if (!res.ok) throw new Error('Image upload failed');
}

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState('');

  const [name, setName]           = useState('');
  const [bio, setBio]             = useState('');
  const [city, setCity]           = useState('');
  const [country, setCountry]     = useState('ZA');
  const [genres, setGenres]       = useState<string[]>([]);
  const [socialLinks, setSocial]  = useState<Record<string, string>>({});
  const [slug, setSlug]           = useState('');

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');

  const avatarRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/dashboard/settings')
      .then(r => r.json())
      .then(d => {
        const a = d.artist || {};
        setName(a.name || '');
        setBio(a.bio || '');
        setCity(a.city || '');
        setCountry(a.country || 'ZA');
        setGenres(a.genres || []);
        setSocial(a.socialLinks || {});
        setSlug(a.slug || '');
        setAvatarUrl(a.avatarUrl || '');
        setBannerUrl(a.bannerUrl || '');
        if (a.avatarUrl) setAvatarPreview(a.avatarUrl);
        if (a.bannerUrl) setBannerPreview(a.bannerUrl);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleImageUpload(file: File, type: 'avatar' | 'banner') {
    if (type === 'avatar') setAvatarUploading(true);
    else setBannerUploading(true);
    try {
      const res = await fetch('/api/dashboard/settings/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: normalizeContentType(file), fileType: type }),
      });
      if (!res.ok) throw new Error('Failed to get upload URL');
      const { presignedUrl, publicUrl } = await res.json();
      await uploadToR2(presignedUrl, file);
      if (type === 'avatar') { setAvatarUrl(publicUrl); setAvatarPreview(publicUrl); }
      else { setBannerUrl(publicUrl); setBannerPreview(publicUrl); }
    } catch (e: any) { setError(e.message); }
    finally {
      if (type === 'avatar') setAvatarUploading(false);
      else setBannerUploading(false);
    }
  }

  function toggleGenre(g: string) {
    setGenres(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/dashboard/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, bio, city, country, genres, socialLinks, avatarUrl, bannerUrl }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Save failed'); }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin" size={28} style={{ color: 'var(--green)' }} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 md:p-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black font-display">Edit Profile</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Your public artist page</p>
        </div>
        {slug && (
          <a href={`/artist/${slug}`} target="_blank" rel="noopener"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            <ExternalLink size={14} /> View Profile
          </a>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Banner */}
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <div className="relative h-36 bg-gradient-to-r from-green-900/40 to-black cursor-pointer group"
            onClick={() => bannerRef.current?.click()}>
            {bannerPreview && <img src={bannerPreview} alt="Banner" className="absolute inset-0 w-full h-full object-cover" />}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              {bannerUploading
                ? <Loader2 size={24} className="animate-spin text-white" />
                : <Upload size={24} className="text-white" />}
            </div>
            <input ref={bannerRef} type="file" accept="image/*" className="hidden"
              onChange={e => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'banner')} />
          </div>

          {/* Avatar */}
          <div className="px-6 pb-4 -mt-10 flex items-end gap-4">
            <div className="relative cursor-pointer group" onClick={() => avatarRef.current?.click()}>
              <div className="w-20 h-20 rounded-2xl overflow-hidden"
                style={{ border: '3px solid var(--bg)', background: 'var(--surface)' }}>
                {avatarPreview
                  ? <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-2xl font-black"
                      style={{ color: 'var(--green)' }}>{name?.[0]?.toUpperCase() || '?'}</div>
                }
              </div>
              <div className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                {avatarUploading
                  ? <Loader2 size={16} className="animate-spin text-white" />
                  : <Camera size={16} className="text-white" />}
              </div>
              <input ref={avatarRef} type="file" accept="image/*" className="hidden"
                onChange={e => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'avatar')} />
            </div>
            <div className="pb-1">
              <div className="font-bold">{name || 'Your Name'}</div>
              {slug && <div className="text-sm" style={{ color: 'var(--text-muted)' }}>vukamusic.com/artist/{slug}</div>}
            </div>
          </div>
        </div>

        {/* Basic info */}
        <div className="rounded-2xl p-6 space-y-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <h2 className="font-bold">Basic Info</h2>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Stage Name / Display Name</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="Your artist name"
              className="w-full px-4 py-3 rounded-xl text-sm outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Bio</label>
            <textarea value={bio} onChange={e => setBio(e.target.value)}
              placeholder="Tell your story…"
              rows={4} maxLength={500}
              className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            <div className="text-xs mt-1 text-right" style={{ color: 'var(--text-muted)' }}>{bio.length}/500</div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>City</label>
              <input value={city} onChange={e => setCity(e.target.value)}
                placeholder="e.g. Durban"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Country</label>
              <select value={country} onChange={e => setCountry(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                <option value="ZA">South Africa</option>
                <option value="NG">Nigeria</option>
                <option value="KE">Kenya</option>
                <option value="GH">Ghana</option>
                <option value="TZ">Tanzania</option>
                <option value="UG">Uganda</option>
                <option value="ZW">Zimbabwe</option>
                <option value="ZM">Zambia</option>
                <option value="US">United States</option>
                <option value="GB">United Kingdom</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
        </div>

        {/* Genres */}
        <div className="rounded-2xl p-6 space-y-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <h2 className="font-bold">Genre Tags</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Select up to 3 genres that describe your music.</p>
          <div className="flex flex-wrap gap-2">
            {GENRES.map(g => {
              const active = genres.includes(g);
              const disabled = !active && genres.length >= 3;
              return (
                <button key={g} type="button"
                  onClick={() => !disabled && toggleGenre(g)}
                  className="px-3 py-1.5 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: active ? 'rgba(160,232,124,0.15)' : 'var(--bg)',
                    color: active ? 'var(--green)' : disabled ? 'var(--text-muted)' : 'var(--text)',
                    border: active ? '1px solid rgba(160,232,124,0.4)' : '1px solid var(--border)',
                    opacity: disabled ? 0.4 : 1,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                  }}>
                  {g}
                </button>
              );
            })}
          </div>
        </div>

        {/* Social links */}
        <div className="rounded-2xl p-6 space-y-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <h2 className="font-bold">Social Links</h2>
          <div className="space-y-3">
            {SOCIAL_FIELDS.map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</label>
                <input
                  value={socialLinks[key] || ''}
                  onChange={e => setSocial(s => ({ ...s, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(255,77,77,0.08)', color: '#ff4d4d', border: '1px solid rgba(255,77,77,0.2)' }}>
            {error}
          </div>
        )}

        <div className="flex items-center gap-4">
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold disabled:opacity-60"
            style={{ background: 'var(--green)', color: '#0a0a0a' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--green)' }}>
              <CheckCircle size={14} /> Saved!
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
