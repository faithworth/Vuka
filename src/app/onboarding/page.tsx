'use client';
// ============================================================
// VUKA — Onboarding Wizard (Phase 2)
// /onboarding — shown after first registration for artists.
// Steps: 1. Genre tags  2. Bio + city  3. Profile photo  4. Done
// ============================================================

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, Music, MapPin, Mic, ArrowRight, ChevronRight, Upload } from 'lucide-react';
import VukaLoader from '@/components/brand/VukaLoader';

const GENRE_OPTIONS = [
  'Amapiano', 'Afrobeats', 'Gqom', 'Hip-Hop', 'Trap',
  'R&B', 'Drill', 'House', 'Kwaito', 'Gospel', 'Jazz',
  'Pop', 'Electronic', 'Dancehall', 'Reggae', 'Soul',
];

type Step = 1 | 2 | 3 | 4;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const [genres, setGenres]   = useState<string[]>([]);
  const [bio, setBio]         = useState('');
  const [city, setCity]       = useState('');
  const [country, setCountry] = useState('ZA');
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  // Check auth on mount
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(me => {
      if (!me?.isArtist && me?.role !== 'artist') {
        router.replace('/dashboard');
      }
    }).catch(() => {});
  }, [router]);

  function toggleGenre(g: string) {
    setGenres(prev =>
      prev.includes(g) ? prev.filter(x => x !== g) : prev.length < 4 ? [...prev, g] : prev
    );
  }

  async function saveStep(nextStep: Step | 'done') {
    setSaving(true);
    try {
      // Build patch payload
      const patch: Record<string, unknown> = {};
      if (step === 1 && genres.length > 0) patch.genreTags = genres;
      if (step === 2) {
        if (bio.trim()) patch.bio = bio.trim();
        if (city.trim()) patch.city = city.trim();
        if (country) patch.country = country;
      }
      if (step === 3 && photoFile) {
        // Upload photo via upload-url endpoint
        const mimeType = photoFile.type || 'image/jpeg';
        const urlRes = await fetch(`/api/dashboard/settings/upload-url?type=photo&mimeType=${encodeURIComponent(mimeType)}`);
        if (urlRes.ok) {
          const { uploadUrl, publicUrl } = await urlRes.json();
          await fetch(uploadUrl, { method: 'PUT', body: photoFile, headers: { 'Content-Type': mimeType } });
          patch.photoUrl = publicUrl;
        }
      }

      if (Object.keys(patch).length > 0) {
        await fetch('/api/dashboard/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
      }

      if (nextStep === 'done') {
        router.push('/dashboard');
      } else {
        setStep(nextStep);
      }
    } catch (err) {
      console.error('Onboarding save error:', err);
    }
    setSaving(false);
  }

  const STEPS = [
    { n: 1, label: 'Genres',  icon: Music },
    { n: 2, label: 'Profile', icon: MapPin },
    { n: 3, label: 'Photo',   icon: Mic },
    { n: 4, label: 'Done',    icon: CheckCircle },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ background: 'rgba(56,182,232,0.1)', border: '1px solid rgba(56,182,232,0.25)', color: 'var(--sky)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            Setting up your artist profile
          </div>
          <h1 className="text-2xl font-black mb-2" style={{ color: 'var(--text)' }}>
            Almost ready
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            A few quick steps and your store goes live.
          </p>
        </div>

        {/* Progress steps */}
        <div className="flex items-center justify-center gap-0 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.n} className="flex items-center">
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                  style={{
                    background: step > s.n ? 'var(--green)' : step === s.n ? 'var(--sky)' : 'var(--surface2)',
                    color: step >= s.n ? 'white' : 'var(--text-muted)',
                  }}>
                  {step > s.n ? '✓' : s.n}
                </div>
                <span className="text-[10px] mt-1 font-medium" style={{ color: step === s.n ? 'var(--sky)' : 'var(--text-muted)' }}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className="w-12 h-px mx-1 mb-4" style={{ background: step > s.n ? 'var(--green)' : 'var(--border)' }} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="card p-8">

          {/* Step 1 — Genre tags */}
          {step === 1 && (
            <div>
              <h2 className="text-xl font-black mb-2" style={{ color: 'var(--text)' }}>
                What genres do you make?
              </h2>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                Pick up to 4. Fans discover you through these.
              </p>
              <div className="flex flex-wrap gap-2 mb-8">
                {GENRE_OPTIONS.map(g => (
                  <button key={g} type="button" onClick={() => toggleGenre(g)}
                    className="px-3 py-1.5 rounded-full text-sm font-semibold transition-all"
                    style={{
                      background: genres.includes(g) ? 'var(--sky)' : 'var(--surface2)',
                      color:      genres.includes(g) ? 'white' : 'var(--text-muted)',
                      border:     `1px solid ${genres.includes(g) ? 'var(--sky)' : 'var(--border)'}`,
                    }}>
                    {g}
                  </button>
                ))}
              </div>
              {genres.length > 0 && (
                <div className="flex items-center gap-2 mb-6 text-sm" style={{ color: 'var(--text-muted)' }}>
                  <CheckCircle size={14} style={{ color: 'var(--green)' }} />
                  {genres.join(', ')}
                </div>
              )}
              <button
                onClick={() => saveStep(2)}
                disabled={genres.length === 0 || saving}
                className="btn btn-primary w-full disabled:opacity-50">
                {saving ? <VukaLoader size={16} /> : null}
                Continue <ArrowRight size={15} />
              </button>
              <button onClick={() => setStep(2)} className="w-full mt-3 text-center text-sm py-2"
                style={{ color: 'var(--text-muted)' }}>
                Skip for now
              </button>
            </div>
          )}

          {/* Step 2 — Bio + location */}
          {step === 2 && (
            <div>
              <h2 className="text-xl font-black mb-2" style={{ color: 'var(--text)' }}>
                Tell fans about yourself
              </h2>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                A short bio goes a long way. You can always edit this later.
              </p>
              <div className="space-y-4">
                <textarea
                  className="input resize-none"
                  rows={4}
                  placeholder="From Joburg, making sounds that hit different..."
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  maxLength={300}
                />
                <p className="text-xs text-right -mt-2" style={{ color: 'var(--text-muted)' }}>
                  {bio.length}/300
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs mb-1.5 font-medium" style={{ color: 'var(--text-muted)' }}>
                      City
                    </label>
                    <input
                      className="input"
                      placeholder="Johannesburg"
                      value={city}
                      onChange={e => setCity(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1.5 font-medium" style={{ color: 'var(--text-muted)' }}>
                      Country
                    </label>
                    <select
                      className="input"
                      value={country}
                      onChange={e => setCountry(e.target.value)}>
                      <option value="ZA">South Africa</option>
                      <option value="NG">Nigeria</option>
                      <option value="GH">Ghana</option>
                      <option value="KE">Kenya</option>
                      <option value="TZ">Tanzania</option>
                      <option value="UG">Uganda</option>
                      <option value="ZW">Zimbabwe</option>
                      <option value="ZM">Zambia</option>
                      <option value="US">United States</option>
                      <option value="GB">United Kingdom</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setStep(1)} className="btn btn-secondary flex-1">
                  Back
                </button>
                <button onClick={() => saveStep(3)} disabled={saving}
                  className="btn btn-primary flex-1 disabled:opacity-50">
                  {saving ? <VukaLoader size={16} /> : null}
                  Continue <ArrowRight size={15} />
                </button>
              </div>
              <button onClick={() => setStep(3)} className="w-full mt-3 text-center text-sm py-2"
                style={{ color: 'var(--text-muted)' }}>
                Skip for now
              </button>
            </div>
          )}

          {/* Step 3 — Profile photo */}
          {step === 3 && (
            <div>
              <h2 className="text-xl font-black mb-2" style={{ color: 'var(--text)' }}>
                Add a profile photo
              </h2>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                Artists with photos get 3× more profile views.
              </p>

              <input
                ref={photoRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setPhotoFile(file);
                  setPhotoPreview(URL.createObjectURL(file));
                }}
              />

              <div className="flex flex-col items-center mb-8">
                <div
                  className="w-32 h-32 rounded-full overflow-hidden flex items-center justify-center cursor-pointer mb-4 transition-all hover:opacity-80"
                  style={{ background: 'var(--surface2)', border: '2px dashed var(--border)' }}
                  onClick={() => photoRef.current?.click()}>
                  {photoPreview
                    ? <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                    : <Upload size={28} style={{ color: 'var(--text-muted)' }} />}
                </div>
                <button onClick={() => photoRef.current?.click()}
                  className="text-sm font-semibold" style={{ color: 'var(--sky)' }}>
                  {photoPreview ? 'Change photo' : 'Choose photo'}
                </button>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(2)} className="btn btn-secondary flex-1">
                  Back
                </button>
                <button onClick={() => saveStep(4)} disabled={saving}
                  className="btn btn-primary flex-1 disabled:opacity-50">
                  {saving ? <VukaLoader size={16} /> : null}
                  {photoFile ? 'Save & Continue' : 'Skip'} <ArrowRight size={15} />
                </button>
              </div>
            </div>
          )}

          {/* Step 4 — Done */}
          {step === 4 && (
            <div className="text-center">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
                style={{ background: 'rgba(42,157,92,0.12)' }}>
                <CheckCircle size={36} style={{ color: 'var(--green)' }} />
              </div>
              <h2 className="text-2xl font-black mb-3" style={{ color: 'var(--text)' }}>
                You're live, fam 🎵
              </h2>
              <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
                Your artist profile is ready. Upload your first beat or release to start earning.
              </p>

              <div className="space-y-3">
                <Link href="/dashboard/uploads"
                  className="btn btn-primary w-full">
                  Upload My First Beat <ChevronRight size={15} />
                </Link>
                <Link href="/dashboard"
                  className="btn btn-secondary w-full">
                  Go to Dashboard
                </Link>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'var(--text-muted)' }}>
          You can update all of this later in{' '}
          <Link href="/dashboard/settings" style={{ color: 'var(--sky)' }}>Settings</Link>.
        </p>
      </div>
    </div>
  );
}
