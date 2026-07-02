'use client';
// src/app/dashboard/referrals/page.tsx
// Founding Artist referral programme dashboard.
// Shows unique link, signup count, progress toward reward, and badge status.

import { useEffect, useState } from 'react';
import { Copy, Check, Users, Gift, Star, RefreshCw, Share2 } from 'lucide-react';
import VukaLoader from '@/components/brand/VukaLoader';

interface ReferralData {
  referralCode:    string;
  referralLink:    string;
  referralCount:   number;
  threshold:       number;
  rewardEarned:    boolean;
  rewardClaimed:   boolean;
  isFoundingArtist: boolean;
  progress: {
    current: number;
    needed:  number;
    pct:     number;
  };
}

export default function ReferralsPage() {
  const [data, setData]       = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied]   = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimMsg, setClaimMsg] = useState('');

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/referrals');
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function copyLink() {
    if (!data?.referralLink) return;
    await navigator.clipboard.writeText(data.referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function shareLink() {
    if (!data?.referralLink) return;
    if (navigator.share) {
      await navigator.share({
        title: 'Join me on Vuka Music',
        text: 'Sell your music directly to fans — no middlemen. Join through my link:',
        url:  data.referralLink,
      });
    } else {
      copyLink();
    }
  }

  async function claimReward() {
    setClaiming(true);
    setClaimMsg('');
    try {
      const res = await fetch('/api/dashboard/referrals', { method: 'POST' });
      const d   = await res.json();
      if (d.ok) {
        setClaimMsg('🎉 3 months Pro unlocked!');
        await load();
      } else {
        setClaimMsg(d.reason === 'already_rewarded'
          ? 'Reward already claimed.'
          : d.reason === 'threshold_not_met'
          ? `You need ${data?.threshold} referrals — keep going!`
          : 'Something went wrong. Try again.');
      }
    } catch {
      setClaimMsg('Network error — try again.');
    }
    setClaiming(false);
  }

  if (loading) {
    return (
      <div className="p-10 flex items-center gap-3" style={{ color: 'var(--text-muted)' }}>
        <VukaLoader size={18} /> Loading referrals…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-10" style={{ color: 'var(--text-muted)' }}>
        Failed to load referral data. Please refresh.
      </div>
    );
  }

  const { referralLink, referralCount, threshold, rewardEarned, rewardClaimed, isFoundingArtist, progress } = data;

  return (
    <div className="p-6 md:p-10 max-w-2xl">

      {/* Header */}
      <div className="flex items-start justify-between mb-2 gap-4">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2" style={{ color: 'var(--text)' }}>
            Referrals
            {isFoundingArtist && (
              <span className="text-xs font-bold px-2 py-1 rounded-full"
                style={{ background: 'rgba(212,160,0,0.15)', color: 'var(--gold)', border: '1px solid rgba(212,160,0,0.3)' }}>
                ✦ Founding Artist
              </span>
            )}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Share your link. Earn 3 months Pro free when {threshold} artists sign up through it.
          </p>
        </div>
        <button onClick={load} className="p-2 rounded-lg flex-shrink-0"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <RefreshCw size={15} style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* Founding Artist banner */}
      {isFoundingArtist && (
        <div className="p-4 rounded-2xl mb-6 flex items-start gap-3"
          style={{ background: 'rgba(212,160,0,0.08)', border: '1px solid rgba(212,160,0,0.25)' }}>
          <Star size={18} style={{ color: 'var(--gold)', flexShrink: 0, marginTop: 2 }} />
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--gold)' }}>You're a Founding Artist</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              This badge is permanent on your profile. You're part of the first wave of artists who built Vuka Music.
              Thank you.
            </p>
          </div>
        </div>
      )}

      {/* Reward status */}
      {rewardClaimed ? (
        <div className="p-4 rounded-2xl mb-6 flex items-center gap-3"
          style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}>
          <Gift size={18} style={{ color: 'var(--green)', flexShrink: 0 }} />
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--green)' }}>Reward claimed — 3 months Pro unlocked</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Your Pro plan has been extended. Keep sharing — every artist you bring makes Vuka Music stronger.
            </p>
          </div>
        </div>
      ) : rewardEarned ? (
        <div className="p-4 rounded-2xl mb-6" style={{ background: 'rgba(212,160,0,0.08)', border: '1px solid rgba(212,160,0,0.3)' }}>
          <div className="flex items-center gap-3 mb-3">
            <Gift size={18} style={{ color: 'var(--gold)', flexShrink: 0 }} />
            <p className="text-sm font-bold" style={{ color: 'var(--gold)' }}>
              You've hit {threshold} referrals — claim your reward!
            </p>
          </div>
          <button onClick={claimReward} disabled={claiming}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#d4a000,#b38600)' }}>
            {claiming
              ? <><VukaLoader size={14} /> Claiming…</>
              : <><Gift size={14} /> Claim 3 Months Pro Free</>}
          </button>
          {claimMsg && (
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{claimMsg}</p>
          )}
        </div>
      ) : null}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Signups',  value: referralCount, color: 'var(--sky)',   icon: Users },
          { label: 'Goal',     value: threshold,      color: 'var(--gold)',  icon: Star },
          { label: 'Progress', value: `${progress.pct}%`, color: 'var(--green)', icon: Gift },
        ].map(card => (
          <div key={card.label} className="p-4 rounded-2xl text-center"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <card.icon size={16} className="mx-auto mb-2" style={{ color: card.color }} />
            <div className="text-xl font-black" style={{ color: card.color }}>{card.value}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="mb-6 p-5 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>
            {progress.current} / {progress.needed} referrals
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {rewardEarned ? '✓ Goal reached' : `${progress.needed - progress.current} more to go`}
          </p>
        </div>
        <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progress.pct}%`,
              background: rewardEarned
                ? 'linear-gradient(90deg, #10b981, #22c55e)'
                : 'linear-gradient(90deg, #d4a000, #f59e0b)',
            }}
          />
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
          Earn 3 months Pro free (worth R747) when {threshold} artists sign up using your link.
        </p>
      </div>

      {/* Referral link */}
      <div className="mb-6 p-5 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <p className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Your referral link</p>
        <div className="flex items-center gap-2 p-3 rounded-xl mb-3"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-mono flex-1 truncate" style={{ color: 'var(--text-muted)' }}>
            {referralLink}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={copyLink}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm flex-1 justify-center"
            style={{ background: copied ? 'rgba(16,185,129,0.1)' : 'var(--surface2)', border: '1px solid var(--border)', color: copied ? 'var(--green)' : 'var(--text)' }}>
            {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy Link</>}
          </button>
          <button onClick={shareLink}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm"
            style={{ background: 'linear-gradient(135deg,#d4a000,#b38600)', color: 'white' }}>
            <Share2 size={14} /> Share
          </button>
        </div>
      </div>

      {/* How it works */}
      <div className="p-5 rounded-2xl" style={{ background: 'rgba(56,182,232,0.06)', border: '1px solid rgba(56,182,232,0.2)' }}>
        <p className="text-sm font-bold mb-3" style={{ color: 'var(--sky)' }}>How it works</p>
        <div className="space-y-2.5">
          {[
            { n: '1', text: 'Share your unique link with other artists — SA WhatsApp groups, Instagram stories, anywhere.' },
            { n: '2', text: 'When they sign up through your link, they count toward your goal.' },
            { n: '3', text: `Hit ${threshold} signups and claim 3 months Pro free (R747 value) — automatically, no waiting.` },
            { n: '4', text: 'The first 5 artists to complete the programme earn a permanent Founding Artist badge on their profile.' },
          ].map(step => (
            <div key={step.n} className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 mt-0.5"
                style={{ background: 'rgba(56,182,232,0.15)', color: 'var(--sky)' }}>
                {step.n}
              </span>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{step.text}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
