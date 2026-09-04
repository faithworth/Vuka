'use client';
import { useEffect, useState } from 'react';
import { TrendingUp, Calendar, ShoppingBag, Play, Upload, CreditCard, Link2, Crown, Zap, Star, ArrowRight, CheckCircle, Circle, X } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link';

const PLAN_COLORS: Record<string, string> = {
  free:  'var(--text-muted)',
  pro:   'var(--sky)',
  label: 'var(--gold)',
};

const PLAN_ICONS: Record<string, any> = {
  free:  Zap,
  pro:   Crown,
  label: Star,
};

export default function DashboardPage() {
  const [stats,      setStats]      = useState<any>(null);
  const [plan,       setPlan]       = useState<any>(null);
  const [onboarding, setOnboarding] = useState<any>(null);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/dashboard/stats').then(r => r.json()).catch(() => ({})),
      fetch(`/api/plans/status?t=${Date.now()}`, { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch('/api/dashboard/onboarding').then(r => r.json()).catch(() => null),
    ]).then(([s, p, ob]) => {
      setStats(s);
      setPlan(p);
      setOnboarding(ob);

      setLoading(false);
    });
  }, []);

  const planColor   = PLAN_COLORS[plan?.planSlug ?? 'free'];
  const PlanIcon    = PLAN_ICONS[plan?.planSlug ?? 'free'] ?? Zap;
  const artistPct   = plan?.artistSharePct  ?? 90;
  const platformPct = plan?.platformFeePct  ?? 10;

  async function dismissOnboarding() {
    await fetch('/api/dashboard/onboarding', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'dismiss' }) });
    setOnboarding((ob: any) => ob ? { ...ob, dismissed: true } : ob);
  }

  const showOnboarding = onboarding && !onboarding.dismissed && !onboarding.completed && onboarding.doneCount < onboarding.total;

  return (
    <div className="p-6 md:p-10">
      <div className="mb-8">
        <h1 className="text-3xl font-black" style={{ color: 'var(--text)' }}>Dashboard</h1>
        <p style={{ color: 'var(--text-muted)' }}>What You've Earned</p>
      </div>

      {/* Onboarding checklist */}
      {!loading && showOnboarding && (
        <div className="mb-6 p-5 rounded-2xl" style={{ background:'rgba(212,160,0,0.07)', border:'1px solid rgba(212,160,0,0.25)' }}>
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="font-bold text-sm" style={{ color:'var(--gold)' }}>🚀 Get set up — {onboarding.doneCount}/{onboarding.total} done</p>
              <p className="text-xs mt-0.5" style={{ color:'var(--text-muted)' }}>Complete these steps to start earning on Vuka Music.</p>
            </div>
            <button onClick={dismissOnboarding} className="p-1.5 rounded-lg" style={{ color:'var(--text-muted)' }}><X size={14}/></button>
          </div>
          <div className="w-full h-1.5 rounded-full mb-4 overflow-hidden" style={{ background:'var(--surface2)' }}>
            <div className="h-full rounded-full transition-all" style={{ width:`${(onboarding.doneCount/onboarding.total)*100}%`, background:'linear-gradient(90deg,#d4a000,#f59e0b)' }}/>
          </div>
          <div className="space-y-2">
            {onboarding.steps.map((step: any) => (
              <Link key={step.key} href={step.done ? '#' : step.href}
                className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: step.done ? 'rgba(16,185,129,0.06)' : 'var(--surface)', border:`1px solid ${step.done ? 'rgba(16,185,129,0.2)' : 'var(--border)'}` }}>
                {step.done
                  ? <CheckCircle size={16} style={{ color:'var(--green)', flexShrink:0 }}/>
                  : <Circle size={16} style={{ color:'var(--text-muted)', flexShrink:0 }}/>}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: step.done ? 'var(--text-muted)' : 'var(--text)', textDecoration: step.done ? 'line-through' : 'none' }}>{step.label}</p>
                  {!step.done && <p className="text-xs" style={{ color:'var(--text-muted)' }}>{step.desc}</p>}
                </div>
                {!step.done && <ArrowRight size={13} style={{ color:'var(--text-muted)', flexShrink:0 }}/>}
              </Link>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: 'var(--surface)' }} />)}
        </div>
      ) : (
        <>
          {/* Plan banner */}
          <div className="mb-6 p-4 rounded-2xl flex items-center justify-between gap-4"
            style={{ background: 'var(--surface)', border: `1px solid ${planColor}44` }}>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl" style={{ background: `${planColor}18` }}>
                <PlanIcon size={20} style={{ color: planColor }} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm" style={{ color: 'var(--text)' }}>
                    {plan?.planName ?? 'Free'} Plan
                  </span>
                  {plan?.subscription?.status === 'cancelled' && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: 'var(--red-surface, rgba(239,68,68,0.1))', color: 'var(--red, #ef4444)' }}>
                      Cancels {plan?.planExpiresAt ? new Date(plan.planExpiresAt).toLocaleDateString('en-ZA') : ''}
                    </span>
                  )}
                </div>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  You keep <strong style={{ color: planColor }}>{artistPct}%</strong> of every sale
                  &nbsp;·&nbsp; Vuka Music takes {platformPct}%
                  {plan?.planExpiresAt && plan?.planSlug !== 'free' && (
                    <> &nbsp;·&nbsp; Renews {new Date(plan.planExpiresAt).toLocaleDateString('en-ZA')}</>
                  )}
                </p>
              </div>
            </div>
            {plan?.planSlug === 'free' && (
              <Link href="/dashboard/settings#plan"
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap"
                style={{ background: 'var(--sky)', color: '#fff' }}>
                Upgrade <ArrowRight size={13} />
              </Link>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Total Revenue', value: formatCurrency(stats?.totalRevenue || 0), icon: <TrendingUp size={20} />, color: 'var(--green)' },
              { label: 'This Month',    value: formatCurrency(stats?.monthRevenue  || 0), icon: <Calendar size={20} />,    color: 'var(--sky)' },
              { label: 'Total Sales',  value: stats?.totalSales || 0,                     icon: <ShoppingBag size={20} />, color: 'var(--gold)' },
              { label: 'Total Plays',  value: stats?.totalPlays || 0,                     icon: <Play size={20} />,        color: 'var(--sky)' },
            ].map(s => (
              <div key={s.label} className="p-6 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="mb-2" style={{ color: s.color }}>{s.icon}</div>
                <div className="text-2xl font-black mb-1" style={{ color: s.color }}>{s.value}</div>
                <div className="text-sm" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Link href="/dashboard/uploads" className="flex items-center gap-4 p-6 rounded-2xl transition-colors hover:border-sky-400"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <Upload size={28} style={{ color: 'var(--sky)' }} />
              <div><p className="font-bold" style={{ color: 'var(--text)' }}>Upload New Beat</p><p className="text-sm" style={{ color: 'var(--text-muted)' }}>Add to your store</p></div>
            </Link>
            <Link href="/dashboard/settings" className="flex items-center gap-4 p-6 rounded-2xl transition-colors"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <CreditCard size={28} style={{ color: 'var(--sky)' }} />
              <div><p className="font-bold" style={{ color: 'var(--text)' }}>Configure Payouts</p><p className="text-sm" style={{ color: 'var(--text-muted)' }}>Bank account details</p></div>
            </Link>
            <Link href="/settings/security" className="flex items-center gap-4 p-6 rounded-2xl transition-colors"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--sky)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <div><p className="font-bold" style={{ color: 'var(--text)' }}>Account Security</p><p className="text-sm" style={{ color: 'var(--text-muted)' }}>2FA, devices &amp; password</p></div>
            </Link>
            <button
              onClick={() => { if (stats?.artistSlug) navigator.clipboard.writeText(`${window.location.origin}/artist/${stats.artistSlug}`); }}
              className="flex items-center gap-4 p-6 rounded-2xl text-left transition-colors"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <Link2 size={28} style={{ color: 'var(--sky)' }} />
              <div><p className="font-bold" style={{ color: 'var(--text)' }}>Copy Your Link</p><p className="text-sm" style={{ color: 'var(--text-muted)' }}>Share on socials</p></div>
            </button>
          </div>

          {/* Recent sales */}
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="font-bold" style={{ color: 'var(--text)' }}>Recent Sales</h2>
            </div>
            {!stats?.recentSales?.length ? (
              <div className="p-12 text-center">
                <p className="text-4xl mb-3">🎵</p>
                <p style={{ color: 'var(--text-muted)' }}>Nothing here yet, go create</p>
                <Link href="/dashboard/uploads" className="inline-block mt-4 px-6 py-3 rounded-xl font-bold text-white" style={{ background: 'var(--sky)' }}>Upload a Beat</Link>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {stats.recentSales.map((sale: any) => (
                  <div key={sale.id} className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-medium" style={{ color: 'var(--text)' }}>
                        {sale.beat?.title || sale.release?.title || sale.video?.title || sale.sample?.title || sale.merch?.title || ({
                          membership:  'Fan Membership',
                          marketplace: 'Marketplace Order',
                          ticket:      'Event Ticket',
                          campaign:    'Campaign Pledge',
                        } as Record<string, string>)[sale.itemType] || 'Purchase'}
                      </p>
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{sale.buyerName} · {sale.licenseType || sale.itemType}</p>
                    </div>
                    <span className="font-bold" style={{ color: 'var(--green)' }}>{formatCurrency(sale.amount, sale.currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
