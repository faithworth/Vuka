'use client';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import {
  ArrowRight, Star, TrendingUp, Users, Briefcase, Radio,
  Megaphone, Search, DollarSign, Globe, Shield, Zap,
  CheckCircle, ChevronRight, Music, BarChart2, Award,
  Building2, Headphones, MicVocal,
} from 'lucide-react';

/* ─────────────────────────────────────────────
   DATA
───────────────────────────────────────────── */
const ROLES = [
  {
    icon: Search,
    title: 'Talent Scout',
    tag: 'Scout',
    color: 'var(--sky)',
    colorBg: 'rgba(56,182,232,0.1)',
    desc: 'Discover Africa\'s next breakout artists before anyone else. Browse real sales data, stream counts, and fan engagement — not just hype.',
    earn: [
      'Earn a referral commission when a signed artist sells on Vuka',
      'Paid placement fees from labels for artist introductions',
      'Exclusive early access to unreleased catalogues',
    ],
  },
  {
    icon: Building2,
    title: 'Label & Publisher',
    tag: 'Label',
    color: 'var(--gold)',
    colorBg: 'rgba(201,162,39,0.1)',
    desc: 'Sign, distribute, and monetise African talent at scale. Vuka gives labels direct access to vetted, commercially active artists and producers.',
    earn: [
      'Revenue share from every sale of your roster\'s catalogue',
      'Bulk licensing deals on beat catalogues',
      'White-label store pages for your label brand',
    ],
  },
  {
    icon: Megaphone,
    title: 'Promoter',
    tag: 'Promoter',
    color: '#e84040',
    colorBg: 'rgba(232,64,64,0.08)',
    desc: 'Run campaigns, drive traffic, and earn on every conversion you generate. Performance-based payouts — you grow when artists grow.',
    earn: [
      'Affiliate commission on every sale you refer (up to 15%)',
      'Paid promotional partnerships with artist stores',
      'Event and release campaign management fees',
    ],
  },
  {
    icon: Radio,
    title: 'Sync & Media Buyer',
    tag: 'Sync',
    color: 'var(--green)',
    colorBg: 'rgba(42,157,92,0.1)',
    desc: 'License music for film, TV, ads, and social media. Access a curated, pre-cleared catalogue of African beats and releases ready for sync.',
    earn: [
      'Flat-fee sync licences per placement',
      'Ongoing royalty splits on recurring placements',
      'Exclusive catalogue access for repeat buyers',
    ],
  },
  {
    icon: Briefcase,
    title: 'Sponsor',
    tag: 'Sponsor',
    color: 'var(--sky)',
    colorBg: 'rgba(56,182,232,0.08)',
    desc: 'Put your brand in front of Africa\'s most passionate music consumers. Sponsor artist stores, releases, and platform features.',
    earn: [
      'Branded placement on high-traffic artist pages',
      'Co-branded release campaigns with major artists',
      'Sponsored beat packs and content drops',
    ],
  },
  {
    icon: MicVocal,
    title: 'Artist Manager',
    tag: 'Manager',
    color: 'var(--gold)',
    colorBg: 'rgba(201,162,39,0.08)',
    desc: 'Manage multiple artists from one dashboard. Track sales, coordinate releases, and negotiate deals — all in one place.',
    earn: [
      'Management commission on every sale (industry standard %)',
      'Centralised earnings overview across your full roster',
      'Priority deal flow from labels and sponsors on Vuka',
    ],
  },
];

const REVENUE_MODELS = [
  {
    icon: DollarSign,
    title: 'Referral Commissions',
    desc: 'Bring verified buyers, labels, or artists to Vuka and earn a transparent cut on every transaction they complete on the platform.',
    highlight: 'Up to 15% per referred sale',
  },
  {
    icon: BarChart2,
    title: 'Placement Fees',
    desc: 'Earn structured fees for facilitating artist-label introductions, sync placements, or sponsorship deals that close through Vuka.',
    highlight: 'Fixed + performance bonuses',
  },
  {
    icon: Award,
    title: 'Catalogue Licensing',
    desc: 'License entire beat catalogues or release packages for use in media, ads, events, or brand campaigns at negotiated flat rates.',
    highlight: 'Bulk deals, flexible terms',
  },
  {
    icon: Globe,
    title: 'Branded Partnerships',
    desc: 'Co-brand artist campaigns, sponsored drops, and platform features. Reach a deeply engaged African music audience at scale.',
    highlight: 'Custom partnership packages',
  },
];

const HOW_IT_WORKS = [
  { n: '01', t: 'Apply for Industry Access', d: 'Submit your role, company, and what you bring to the table. Approval takes 24–48 hours.' },
  { n: '02', t: 'Get Your Industry Dashboard', d: 'Access artist analytics, catalogue previews, deal flow tools, and your dedicated account manager.' },
  { n: '03', t: 'Discover & Connect', d: 'Browse artists by genre, sales volume, location, and growth trajectory. Initiate contact directly on platform.' },
  { n: '04', t: 'Close Deals & Earn', d: 'Formalise deals through Vuka\'s deal flow system. Commissions and fees are tracked and paid automatically.' },
];

const STATS = [
  { n: '98%', l: 'Artist Payout Rate' },
  { n: '2%', l: 'Platform Fee' },
  { n: 'ZA', l: 'Live Market' },
  { n: '98%', l: 'Artist Payout Rate' },
];

/* ─────────────────────────────────────────────
   PAGE
───────────────────────────────────────────── */
export default function IndustryPage() {
  return (
    <>
      <Navbar />
      <main style={{ background: 'var(--bg)', color: 'var(--text)' }}>

        {/* ── HERO ── */}
        <section className="relative min-h-[92vh] flex items-center justify-center overflow-hidden pt-20 pb-24 px-4">
          {/* background glow */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: 'radial-gradient(ellipse 70% 55% at 50% -10%, rgba(56,182,232,0.10) 0%, transparent 70%)',
          }} />
          <div className="absolute inset-0 pointer-events-none" style={{
            background: 'radial-gradient(ellipse 40% 30% at 80% 60%, rgba(201,162,39,0.06) 0%, transparent 60%)',
          }} />

          <div className="relative z-10 max-w-5xl mx-auto text-center">
            {/* pill badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold mb-8 tracking-wide" style={{
              background: 'rgba(56,182,232,0.1)',
              border: '1px solid rgba(56,182,232,0.25)',
              color: 'var(--sky)',
            }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse inline-block" style={{ background: 'var(--sky)' }} />
              Industry Portal — Recruiters · Labels · Scouts · Promoters
            </div>

            <h1 className="text-5xl md:text-7xl font-bold mb-6 tracking-tight" style={{ lineHeight: 1.05 }}>
              The business side<br />
              <span style={{
                background: 'linear-gradient(135deg, #38b6e8, #1a9dd4, #c9a227)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>of African music.</span>
            </h1>

            <p className="text-lg md:text-xl mb-4 max-w-2xl mx-auto leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Scouts, labels, promoters, sync buyers, and sponsors — this is your command centre.
              Find talent, close deals, and earn real money from Africa's fastest-growing music economy.
            </p>
            <p className="text-sm mb-10 max-w-xl mx-auto" style={{ color: 'var(--text-muted)' }}>
              Performance-based commissions. Transparent deal flow. Direct artist access.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <Link href="/auth/register?role=industry" className="btn btn-primary text-base px-8 py-4" style={{ background: 'var(--sky)', color: 'white' }}>
                Apply for Industry Access <ArrowRight size={18} />
              </Link>
              <Link href="/store" className="btn btn-secondary text-base px-8 py-4">
                Browse Talent <Music size={18} />
              </Link>
            </div>

            {/* stats bar */}
            <div className="flex flex-wrap items-center justify-center gap-10 md:gap-16">
              {STATS.map(s => (
                <div key={s.n} className="text-center">
                  <div className="text-2xl md:text-3xl font-bold mb-1" style={{ color: 'var(--text)' }}>{s.n}</div>
                  <div className="text-xs tracking-wide" style={{ color: 'var(--text-muted)' }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── ROLE CARDS ── */}
        <section className="py-24 px-4" style={{ background: 'var(--surface)' }}>
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--sky)' }}>Who This Is For</p>
              <h2 className="text-3xl md:text-5xl font-bold mb-4">Pick your role. Start earning.</h2>
              <p className="max-w-xl mx-auto" style={{ color: 'var(--text-muted)' }}>
                Every role on Vuka's industry portal comes with a defined revenue model. No vague exposure — real commission structures.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {ROLES.map(r => (
                <div key={r.title} className="p-6 rounded-2xl flex flex-col gap-4 transition-all duration-200"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = r.color)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>

                  <div className="flex items-start justify-between">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: r.colorBg }}>
                      <r.icon size={20} style={{ color: r.color }} />
                    </div>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: r.colorBg, color: r.color }}>
                      {r.tag}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-bold text-lg mb-2" style={{ color: 'var(--text)' }}>{r.title}</h3>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{r.desc}</p>
                  </div>

                  <div className="mt-auto pt-4 flex flex-col gap-2" style={{ borderTop: '1px solid var(--border)' }}>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>How you earn</p>
                    {r.earn.map(e => (
                      <div key={e} className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                        <CheckCircle size={13} style={{ color: r.color, flexShrink: 0, marginTop: 1 }} />
                        {e}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── REVENUE MODELS ── */}
        <section className="py-24 px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--gold)' }}>Revenue Models</p>
              <h2 className="text-3xl md:text-5xl font-bold mb-4">Four ways to make money</h2>
              <p className="max-w-xl mx-auto" style={{ color: 'var(--text-muted)' }}>
                Transparent, performance-based. Every rand is tracked. Every commission is paid automatically.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {REVENUE_MODELS.map(m => (
                <div key={m.title} className="p-7 rounded-2xl flex gap-5 transition-all duration-200"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(201,162,39,0.1)' }}>
                    <m.icon size={22} style={{ color: 'var(--gold)' }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-base mb-2" style={{ color: 'var(--text)' }}>{m.title}</h3>
                    <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text-muted)' }}>{m.desc}</p>
                    <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: 'rgba(201,162,39,0.12)', color: 'var(--gold)' }}>
                      ✦ {m.highlight}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── BIG LABEL / COMPANY BLOCK ── */}
        <section className="py-24 px-4" style={{ background: 'var(--surface)' }}>
          <div className="max-w-6xl mx-auto">
            <div className="grid md:grid-cols-2 gap-16 items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--sky)' }}>For Major Labels & Companies</p>
                <h2 className="text-3xl md:text-5xl font-bold mb-6">Scale your A&R pipeline across Africa</h2>
                <p className="leading-relaxed mb-6" style={{ color: 'var(--text-muted)' }}>
                  Stop relying on word-of-mouth and cold DMs. Vuka gives institutional partners real data — sales velocity, fan engagement, geographic reach — so every signing decision is backed by evidence, not guesswork.
                </p>
                <div className="space-y-3 mb-8">
                  {[
                    'Access to full artist analytics before you reach out',
                    'Filter by genre, country, revenue band, and growth rate',
                    'Initiate deal conversations through verified in-platform messaging',
                    'White-label your label\'s catalogue page on Vuka',
                    'Dedicated account manager for enterprise partners',
                    'Custom API access for CRM integration',
                  ].map(item => (
                    <div key={item} className="flex items-center gap-3 text-sm" style={{ color: 'var(--text-muted)' }}>
                      <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(56,182,232,0.12)' }}>
                        <span style={{ color: 'var(--sky)', fontSize: 10 }}>✓</span>
                      </div>
                      {item}
                    </div>
                  ))}
                </div>
                <Link href="/auth/register?role=industry" className="btn inline-flex gap-2 text-sm font-semibold px-6 py-3" style={{ background: 'var(--sky)', color: 'white', borderRadius: 12 }}>
                  Enterprise Enquiry <ArrowRight size={16} />
                </Link>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {[
                  { icon: BarChart2, title: 'Live Sales Data', desc: 'Real revenue numbers per artist, updated in real time.' },
                  { icon: Globe, title: 'Pan-African Reach', desc: '18+ African countries, diaspora buyers worldwide.' },
                  { icon: Shield, title: 'Verified Artists', desc: 'Every artist KYC\'d and payment-verified before listing.' },
                  { icon: Headphones, title: 'Sync-Ready Catalogue', desc: 'Pre-cleared beats and releases available for licensing.' },
                  { icon: Zap, title: 'Fast Deal Flow', desc: 'From discovery to signed deal in days, not months.' },
                  { icon: Star, title: 'Exclusive Access', desc: 'Unreleased tracks available to label partners first.' },
                ].map(c => (
                  <div key={c.title} className="p-5 rounded-2xl" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <c.icon size={18} className="mb-3" style={{ color: 'var(--sky)' }} />
                    <h4 className="font-semibold text-sm mb-1.5" style={{ color: 'var(--text)' }}>{c.title}</h4>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{c.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section className="py-24 px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-bold mb-4">From application to first deal</h2>
              <p style={{ color: 'var(--text-muted)' }}>Fast. Structured. No gatekeeping.</p>
            </div>
            <div className="grid md:grid-cols-2 gap-8">
              {HOW_IT_WORKS.map(s => (
                <div key={s.n} className="flex gap-5">
                  <div className="text-3xl font-bold font-mono flex-shrink-0 w-12" style={{ color: 'var(--border)' }}>{s.n}</div>
                  <div>
                    <h3 className="font-semibold text-lg mb-2" style={{ color: 'var(--text)' }}>{s.t}</h3>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{s.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── INDUSTRY TIER PRICING ── */}
        <section className="py-24 px-4" style={{ background: 'var(--surface)' }}>
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--gold)' }}>Industry Tiers</p>
            <h2 className="text-3xl md:text-5xl font-bold mb-4">Transparent access. Performance upside.</h2>
            <p className="mb-14" style={{ color: 'var(--text-muted)' }}>No retainers. Pay when you earn, or upgrade for priority access.</p>

            <div className="grid md:grid-cols-3 gap-6 text-left">
              {[
                {
                  tier: 'Scout',
                  price: 'Free',
                  sub: 'Commission-only',
                  color: 'var(--sky)',
                  colorBg: 'rgba(56,182,232,0.08)',
                  features: [
                    'Browse artist profiles & previews',
                    'Submit talent introductions',
                    '8% referral commission on sales',
                    'Basic analytics access',
                    'Email support',
                  ],
                },
                {
                  tier: 'Pro Industry',
                  price: 'R499/mo',
                  sub: 'For active deal-makers',
                  color: 'var(--gold)',
                  colorBg: 'rgba(201,162,39,0.08)',
                  featured: true,
                  features: [
                    'Full artist sales analytics',
                    'Direct in-platform messaging',
                    '12% referral commission on sales',
                    'Priority deal flow notifications',
                    'Dedicated account manager',
                  ],
                },
                {
                  tier: 'Enterprise',
                  price: 'Custom',
                  sub: 'Labels & large companies',
                  color: 'var(--sky)',
                  colorBg: 'rgba(56,182,232,0.08)',
                  features: [
                    'White-label label page',
                    'Bulk catalogue licensing',
                    '15% referral commission cap',
                    'API access for CRM sync',
                    'SLA & custom contracts',
                  ],
                },
              ].map(t => (
                <div key={t.tier} className="p-7 rounded-2xl flex flex-col gap-5 relative"
                  style={{
                    background: t.featured ? t.colorBg : 'var(--bg)',
                    border: `2px solid ${t.featured ? t.color : 'var(--border)'}`,
                  }}>
                  {t.featured && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-3 py-1 rounded-full" style={{ background: t.color, color: 'white' }}>
                      Most Popular
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: t.color }}>{t.tier}</p>
                    <div className="text-3xl font-bold mb-0.5" style={{ color: 'var(--text)' }}>{t.price}</div>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t.sub}</p>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {t.features.map(f => (
                      <div key={f} className="flex items-start gap-2.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                        <ChevronRight size={14} style={{ color: t.color, flexShrink: 0, marginTop: 2 }} />
                        {f}
                      </div>
                    ))}
                  </div>
                  <Link href="/auth/register?role=industry" className="btn text-sm font-semibold mt-auto py-3"
                    style={{
                      background: t.featured ? t.color : 'var(--surface2)',
                      color: t.featured ? 'white' : 'var(--text)',
                      border: t.featured ? 'none' : '1px solid var(--border)',
                      borderRadius: 12,
                    }}>
                    {t.tier === 'Enterprise' ? 'Contact Us' : 'Apply Now'}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FEE TRANSPARENCY NOTE ── */}
        <section className="py-10 px-4">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-start gap-4 p-5 rounded-2xl" style={{
              background: 'rgba(201,162,39,0.07)',
              border: '1px solid var(--gold)',
            }}>
              <Shield size={18} style={{ color: 'var(--gold)', flexShrink: 0, marginTop: 2 }} />
              <div>
                <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Platform fee transparency</p>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Vuka charges a 2% platform fee on all direct artist sales. Artists receive 98% of every transaction.
                  Industry commissions are separate and paid by Vuka from platform revenue — not deducted from artist payouts.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="py-24 px-4 text-center" style={{ background: 'var(--surface)' }}>
          <div className="max-w-2xl mx-auto">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-6" style={{ background: 'rgba(56,182,232,0.12)', border: '1px solid rgba(56,182,232,0.2)' }}>
              <TrendingUp size={26} style={{ color: 'var(--sky)' }} />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to tap into African music?</h2>
            <p className="mb-10" style={{ color: 'var(--text-muted)' }}>
              Apply today. Get verified in 24 hours. Start discovering and earning from Africa's most commercially active independent artists and producers.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/auth/register?role=industry" className="btn text-base px-8 py-4 font-semibold" style={{ background: 'var(--sky)', color: 'white', borderRadius: 14 }}>
                Apply for Industry Access <ArrowRight size={18} />
              </Link>
              <Link href="mailto:industry@vuka-distro.app" className="btn btn-secondary text-base px-8 py-4">
                Contact the Team
              </Link>
            </div>
          </div>
        </section>

        {/* ── FOOTER NOTE ── */}
        <footer className="py-10 px-4 text-center" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            © 2025 Vuka · Industry Portal · 2% platform fee on all sales · Artists keep 98%
          </p>
        </footer>

      </main>
    </>
  );
}
