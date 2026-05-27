// ============================================================
// PATCH 11a — NEW FILE: src/app/industry-dashboard/page.tsx
// Full working Industry portal: referrals, deal flow, earnings.
// ============================================================

'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import {
  Users, TrendingUp, Copy, Check, Plus, Music2, ExternalLink,
  Briefcase, Clock, CheckCircle, XCircle, LogOut, Loader2
} from 'lucide-react';

export default function IndustryDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [dealForm, setDealForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deal, setDeal] = useState({ title: '', description: '', artistSlug: '', dealType: 'licensing', offerAmount: '' });

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: auth }) => {
      if (!auth.user) { router.replace('/auth/login'); return; }
      const res = await fetch('/api/industry/me');
      if (!res.ok) { router.replace('/'); return; }
      const d = await res.json();
      setData(d);
      setLoading(false);
    });
  }, [router]);

  async function copyReferral() {
    const url = `${window.location.origin}?ref=${data?.industryUser?.referralCode}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function submitDeal() {
    setSubmitting(true);
    const res = await fetch('/api/industry/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...deal, offerAmount: parseFloat(deal.offerAmount) || 0 }),
    });
    if (res.ok) {
      const d = await res.json();
      setData((prev: any) => ({ ...prev, deals: [d.deal, ...(prev.deals || [])] }));
      setDeal({ title: '', description: '', artistSlug: '', dealType: 'licensing', offerAmount: '' });
      setDealForm(false);
    }
    setSubmitting(false);
  }

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <Loader2 size={24} className="animate-spin" style={{ color: 'var(--sky)' }} />
    </div>
  );

  const iu = data?.industryUser || {};
  const referrals = data?.referrals || [];
  const deals = data?.deals || [];

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--sky)' }}>
            <Music2 size={13} className="text-white" />
          </div>
          <span className="font-semibold text-base" style={{ color: 'var(--text)' }}>Vuka Industry</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{iu.company || data?.user?.name}</span>
          <button onClick={logout} className="p-2 rounded-lg" style={{ color: 'var(--text-muted)' }}>
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Referrals', value: iu.totalReferrals || 0, icon: Users, color: 'var(--sky)' },
            { label: 'Earnings',  value: `R${(iu.totalEarnings || 0).toFixed(2)}`, icon: TrendingUp, color: 'var(--green)' },
            { label: 'Deals',     value: deals.length, icon: Briefcase, color: 'var(--gold)' },
            { label: 'Converted', value: referrals.filter((r: any) => r.status === 'converted').length, icon: CheckCircle, color: 'var(--green)' },
          ].map(s => (
            <div key={s.label} className="p-4 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <s.icon size={16} style={{ color: s.color }} className="mb-2" />
              <p className="text-xl font-black" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Referral Link */}
        <div className="p-6 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <h2 className="font-black text-lg mb-1" style={{ color: 'var(--text)' }}>Your Referral Link</h2>
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
            Share this link to refer artists and fans to Vuka. Track every conversion below.
          </p>
          <div className="flex items-center gap-3">
            <div className="flex-1 p-3 rounded-xl text-sm font-mono overflow-hidden"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {typeof window !== 'undefined' ? `${window.location.origin}?ref=${iu.referralCode}` : `https://vuka-distro.vercel.app?ref=${iu.referralCode}`}
            </div>
            <button onClick={copyReferral}
              className="flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-sm text-white flex-shrink-0"
              style={{ background: copied ? 'var(--green)' : 'var(--sky)' }}>
              {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
            </button>
          </div>
        </div>

        {/* Deals */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-black text-lg" style={{ color: 'var(--text)' }}>Deal Flow</h2>
            <button onClick={() => setDealForm(v => !v)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm text-white"
              style={{ background: 'var(--sky)' }}>
              <Plus size={14} /> Submit Deal
            </button>
          </div>

          {dealForm && (
            <div className="p-5 rounded-2xl mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <h3 className="font-bold mb-4" style={{ color: 'var(--text)' }}>New Deal Proposal</h3>
              <div className="space-y-3">
                <input className="input" placeholder="Deal title (e.g. Sync License — Film)" value={deal.title} onChange={e => setDeal(p => ({ ...p, title: e.target.value }))} />
                <input className="input" placeholder="Artist slug (e.g. dj-maphorisa)" value={deal.artistSlug} onChange={e => setDeal(p => ({ ...p, artistSlug: e.target.value }))} />
                <div className="grid grid-cols-2 gap-3">
                  <select className="input" value={deal.dealType} onChange={e => setDeal(p => ({ ...p, dealType: e.target.value }))}>
                    <option value="licensing">Licensing</option>
                    <option value="distribution">Distribution</option>
                    <option value="sync">Sync</option>
                    <option value="management">Management</option>
                  </select>
                  <input className="input" placeholder="Offer (ZAR)" type="number" value={deal.offerAmount} onChange={e => setDeal(p => ({ ...p, offerAmount: e.target.value }))} />
                </div>
                <textarea className="input" rows={3} placeholder="Deal description & terms…" value={deal.description} onChange={e => setDeal(p => ({ ...p, description: e.target.value }))} />
                <div className="flex gap-3">
                  <button onClick={() => setDealForm(false)}
                    className="flex-1 py-2.5 rounded-xl font-semibold text-sm"
                    style={{ background: 'var(--surface2)', color: 'var(--text)' }}>
                    Cancel
                  </button>
                  <button onClick={submitDeal} disabled={submitting || !deal.title}
                    className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-60"
                    style={{ background: 'var(--sky)' }}>
                    {submitting ? 'Submitting…' : 'Submit Deal'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {deals.length === 0 ? (
            <div className="text-center py-12 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <Briefcase size={32} className="mx-auto mb-3 opacity-40" />
              <p className="font-semibold">No deals yet</p>
              <p className="text-sm mt-1">Submit a deal proposal to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {deals.map((d: any) => (
                <div key={d.id} className="p-4 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>{d.title}</p>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase"
                          style={{
                            background: d.status === 'accepted' ? 'rgba(16,185,129,0.12)' : d.status === 'rejected' ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)',
                            color: d.status === 'accepted' ? 'var(--green)' : d.status === 'rejected' ? '#ef4444' : 'var(--gold)',
                          }}>
                          {d.status}
                        </span>
                      </div>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {d.dealType} · {d.artistSlug ? `@${d.artistSlug}` : 'Platform-wide'} · R{d.offerAmount?.toFixed(2) || '0'}
                      </p>
                      {d.description && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{d.description}</p>}
                      {d.adminNotes && <p className="text-xs mt-1 font-medium" style={{ color: 'var(--sky)' }}>Admin: {d.adminNotes}</p>}
                    </div>
                    <p className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                      {new Date(d.createdAt).toLocaleDateString('en-ZA')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Referral history */}
        <div>
          <h2 className="font-black text-lg mb-4" style={{ color: 'var(--text)' }}>Referral History</h2>
          {referrals.length === 0 ? (
            <div className="text-center py-12 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <Users size={32} className="mx-auto mb-3 opacity-40" />
              <p className="font-semibold">No referrals yet</p>
              <p className="text-sm mt-1">Share your referral link to start tracking.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {referrals.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-xl"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{r.conversionType || 'Referral click'}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{new Date(r.createdAt).toLocaleDateString('en-ZA')}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full`}
                      style={{
                        background: r.status === 'converted' ? 'rgba(16,185,129,0.12)' : 'rgba(234,179,8,0.1)',
                        color: r.status === 'converted' ? 'var(--green)' : 'var(--gold)',
                      }}>
                      {r.status}
                    </span>
                    {r.commissionEarned > 0 && (
                      <p className="text-xs mt-0.5 font-semibold" style={{ color: 'var(--green)' }}>+R{r.commissionEarned}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
