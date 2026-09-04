'use client';
// ============================================================
// VUKA — Get Verified (artist-facing KYC submission)
// /dashboard/verification
// The backend enforcement (submitVerification) already required this;
// this page was the missing piece that let an artist actually reach it.
// ============================================================

import { useEffect, useState } from 'react';
import { ShieldCheck, Upload, CheckCircle2, Clock, XCircle, FileText } from 'lucide-react';
import VukaLoader from '@/components/brand/VukaLoader';

type VStatus = 'none' | 'pending' | 'approved' | 'rejected';

export default function VerificationPage() {
  const [loading, setLoading]   = useState(true);
  const [status, setStatus]     = useState<VStatus>('none');
  const [adminNotes, setAdminNotes] = useState('');

  const [legalName, setLegalName]         = useState('');
  const [socialProofUrl, setSocialProofUrl] = useState('');
  const [notes, setNotes]                 = useState('');
  const [file, setFile]                   = useState<File | null>(null);
  const [fileName, setFileName]           = useState('');

  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/moderation/verify');
      const data = await res.json();
      if (data.request) {
        setStatus(data.request.status);
        setLegalName(data.request.legalName || '');
        setSocialProofUrl(data.request.socialProofUrl || '');
        setAdminNotes(data.request.adminNotes || '');
      }
    } catch {
      // ignore — treat as not-yet-submitted
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    setError('');
    if (!legalName.trim()) { setError('Enter your legal name as it appears on your ID'); return; }
    if (!file) { setError('Upload a photo or scan of your ID document'); return; }

    try {
      setUploading(true);
      const urlRes = await fetch('/api/dashboard/verification/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: file.type }),
      });
      const urlData = await urlRes.json();
      if (!urlRes.ok) throw new Error(urlData.error || 'Failed to prepare upload');

      const putRes = await fetch(urlData.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      if (!putRes.ok) throw new Error('File upload failed');
      setUploading(false);

      setSubmitting(true);
      const res = await fetch('/api/moderation/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ legalName: legalName.trim(), idDocumentUrl: urlData.key, socialProofUrl: socialProofUrl.trim(), notes: notes.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit');

      setStatus('pending');
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
    } finally {
      setUploading(false);
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="min-h-[50vh] flex items-center justify-center"><VukaLoader size={28} /></div>;
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={20} style={{ color: 'var(--green)' }} />
        <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Get Verified</h1>
      </div>
      <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
        Verification confirms you're a real, identifiable artist. It unlocks the verified badge on your profile and is used to review higher-risk activity.
      </p>

      {status === 'pending' && (
        <div className="p-5 rounded-2xl flex items-start gap-3" style={{ background: 'rgba(201,162,39,0.08)', border: '1px solid rgba(201,162,39,0.25)' }}>
          <Clock size={20} style={{ color: 'var(--gold)' }} className="mt-0.5" />
          <div>
            <p className="font-bold" style={{ color: 'var(--gold)' }}>Under review</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>We've received your submission for {legalName}. An admin will review it — you'll get a notification once it's decided.</p>
          </div>
        </div>
      )}

      {status === 'approved' && (
        <div className="p-5 rounded-2xl flex items-start gap-3" style={{ background: 'rgba(160,232,124,0.08)', border: '1px solid rgba(160,232,124,0.25)' }}>
          <CheckCircle2 size={20} style={{ color: 'var(--green)' }} className="mt-0.5" />
          <div>
            <p className="font-bold" style={{ color: 'var(--green)' }}>You're verified</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Your profile now shows the verified badge.</p>
          </div>
        </div>
      )}

      {(status === 'none' || status === 'rejected') && (
        <div className="space-y-4">
          {status === 'rejected' && (
            <div className="p-4 rounded-2xl flex items-start gap-3" style={{ background: 'rgba(255,77,77,0.08)', border: '1px solid rgba(255,77,77,0.25)' }}>
              <XCircle size={18} style={{ color: '#ff4d4d' }} className="mt-0.5" />
              <div>
                <p className="font-bold text-sm" style={{ color: '#ff4d4d' }}>Not approved</p>
                {adminNotes && <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{adminNotes}</p>}
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>You can fix the issue and resubmit below.</p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>Legal name *</label>
            <p className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>As it appears on your ID document — can differ from your public artist name.</p>
            <input value={legalName} onChange={e => setLegalName(e.target.value)}
              placeholder="e.g. Tshepang Mokoena"
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>ID document *</label>
            <p className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>A photo or scan of your government ID or passport. Stored privately — only reviewed by Vuka admins.</p>
            <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm cursor-pointer"
              style={{ background: 'var(--surface2)', border: '1px dashed var(--border)', color: 'var(--text-muted)' }}>
              <Upload size={16} />
              {fileName || 'Choose a file (JPG, PNG, or PDF)'}
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); setFileName(f.name); } }} />
            </label>
            {fileName && <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--green)' }}><FileText size={12} /> {fileName} selected</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>Social proof link <span className="font-normal" style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
            <input value={socialProofUrl} onChange={e => setSocialProofUrl(e.target.value)}
              placeholder="Instagram, Spotify, or another public profile"
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>Anything else? <span className="font-normal" style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>

          {error && <p className="text-sm" style={{ color: '#ff4d4d' }}>{error}</p>}

          <button onClick={submit} disabled={uploading || submitting}
            className="w-full py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
            style={{ background: 'var(--green)', color: '#0a0a0a' }}>
            {uploading ? 'Uploading document…' : submitting ? 'Submitting…' : 'Submit for review'}
          </button>
        </div>
      )}
    </div>
  );
}
