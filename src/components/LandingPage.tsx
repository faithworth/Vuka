'use client';
import Link from 'next/link';
import { ArrowRight, Globe, Zap, DollarSign, Shield, Music, TrendingUp, Users, Star, Headphones } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import VukaShopJourney from '@/components/brand/VukaShopJourney';

const ARTIST_FEATURES = [
  {
    icon: DollarSign,
    tag: '01 / PAYMENTS',
    title: 'Dual Payments',
    desc: 'Paystack for South African buyers with instant EFT, card, and bank transfer support. Flutterwave for Pan-African payments. Both fully automated.',
  },
  {
    icon: Zap,
    tag: '02 / DELIVERY',
    title: 'Instant Downloads',
    desc: 'Fans receive secure download links the moment payment clears. No manual work needed.',
  },
  {
    icon: Shield,
    tag: '03 / LICENSING',
    title: 'Beat Licensing',
    desc: 'Basic, Premium, and Exclusive tiers. Auto-generated PDF license agreements sent to every buyer.',
  },
  {
    icon: Users,
    tag: '04 / COMMUNITY',
    title: 'Fan Support',
    desc: 'Let fans tip you and back your recording goals. Build a real community around your music.',
  },
];

const HOW_IT_WORKS = [
  { n: '01', t: 'Upload your music', d: 'Add your beats or releases. Set your prices, license tiers, and artwork. We handle the rest.' },
  { n: '02', t: 'Share your link', d: 'Get your personal store link — vukamusic.com/artist/you. Share it everywhere you already are.' },
  { n: '03', t: 'Keep most of every sale', d: 'Paystack and Flutterwave move money directly to your bank account. Free starts at 90% and steps up automatically as you sell more — Pro and Label keep even more.' },
];

const FAN_BENEFITS = [
  'Browse and stream previews before you buy',
  'Secure checkout via Paystack or card',
  'Instant download links in your inbox',
  'Follow artists and get notified of new drops',
  'Tip artists and back their recording goals',
];

const FAN_CARDS = [
  { icon: Globe, title: 'Global Discovery', desc: 'Artists from SA, Nigeria, Ghana, Kenya and beyond.' },
  { icon: TrendingUp, title: 'Campaigns', desc: "Back an artist's recording or tour fund directly." },
  { icon: Music, title: 'Build a Library', desc: 'Your purchases available for download anytime.' },
  { icon: Shield, title: 'Safe & Secure', desc: 'Protected checkout. Immediate delivery.' },
];

const MARQUEE_TAGS = ['RELEASE MUSIC', 'SELL BEATS', 'RUN EVENTS', 'SHIP MERCH', 'GET PAID DIRECT'];

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main style={{ background: 'var(--bg)', color: 'var(--text)' }}>

        {/* JSON-LD structured data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              "name": "Vuka Music",
              "alternateName": ["Vuka Music", "Vuka Music Distro"],
              "url": "https://www.vukamusic.com",
              "description": "Africa's independent music platform. Buy beats and music directly from African artists.",
              "potentialAction": {
                "@type": "SearchAction",
                "target": "https://www.vukamusic.com/store?q={search_term_string}",
                "query-input": "required name=search_term_string"
              }
            })
          }}
        />

        {/* ══════════════════════ HERO ══════════════════════ */}
        <section className="relative min-h-[100svh] flex flex-col justify-center overflow-hidden pt-24 pb-10 px-4 sm:px-8">
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(160,232,124,0.10) 0%, transparent 70%)' }} />
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 40% 30% at 80% 70%, rgba(232,200,124,0.07) 0%, transparent 60%)' }} />

          <div className="relative z-10 max-w-5xl mx-auto w-full text-center">
            <div className="flex items-center justify-center gap-2 mb-8">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse inline-block" style={{ background: 'var(--green)' }} />
              <span className="eyebrow">Africa's independent music platform</span>
            </div>

            <div className="flex justify-center -mb-2 px-2">
              <VukaShopJourney className="w-full max-w-[720px] h-auto" />
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold mb-6 tracking-tight" style={{ color: 'var(--text)', lineHeight: 0.98, letterSpacing: '-0.02em' }}>
              Your music.<br />
              <span style={{
                background: 'linear-gradient(135deg, #A0E87C, #6BB84A, #E8C87C)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>Your terms.</span><br />
              Your money.
            </h1>

            <div className="max-w-2xl mx-auto hairline-t pt-6 mt-6">
              <p className="text-base sm:text-lg md:text-xl mb-4 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Sell beats and releases directly to your fans — in South Africa and worldwide.
                Keep up to 95% of every sale.
              </p>

              <p className="text-sm mb-6 max-w-xl mx-auto" style={{ color: 'var(--text-muted)' }}>
                Paystack for South African buyers. Money goes directly to your bank. Start free — upgrade anytime for a lower platform fee.
              </p>
            </div>

            {/* Fee transparency notice */}
            <div className="inline-flex items-center gap-2 px-3 py-2 mb-8"
              style={{ border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-muted)', fontSize: 12 }}>
              <span style={{ color: 'var(--gold)' }}>✦</span>
              <span className="numeric">Free plan: 10% platform fee, auto-reduces to 8.5% as you sell more. Pro plan: 8%. Label plan: 5%. No hidden charges.</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-14 px-2">
              <Link href="/auth/register" className="btn btn-primary text-sm sm:text-base px-6 py-3.5 w-full sm:w-auto">
                Start Selling — It's Free <ArrowRight size={16} />
              </Link>
              <Link href="/store" className="btn btn-secondary text-sm sm:text-base px-6 py-3.5 w-full sm:w-auto">
                Browse the Store <Music size={16} />
              </Link>
            </div>

            {/* Stat band */}
            <div className="hairline-t hairline-b grid grid-cols-3 gap-y-6 py-8">
              {[
                { n: '90%', l: 'Artist keeps (Free)', sub: 'up to 95% on paid plans' },
                { n: '10%', l: 'Platform Fee', sub: 'Free plan — drops to 8.5% as you sell more' },
                { n: 'ZAR', l: 'Paid in Rands' },
              ].map((s, i) => (
                <div key={s.n} className={i > 0 ? 'text-center sm:border-l sm:pl-4' : 'text-center'} style={i > 0 ? { borderColor: 'var(--border)' } : undefined}>
                  <div className="numeric text-2xl md:text-4xl font-semibold mb-1" style={{ color: 'var(--text)' }}>{s.n}</div>
                  <div className="eyebrow">{s.l}</div>
                  {'sub' in s && s.sub && <div className="text-xs mt-1" style={{ color: 'var(--gold)' }}>{s.sub}</div>}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════ MARQUEE ══════════════════════ */}
        <section className="hairline-t hairline-b py-5 lp-marquee-wrap">
          <div className="lp-marquee-track">
            {[...MARQUEE_TAGS, ...MARQUEE_TAGS].map((m, i) => (
              <span key={i} className="flex items-center gap-3 mx-7">
                <span className="font-bold tracking-tight text-2xl md:text-4xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>{m}</span>
                <span style={{ color: 'var(--green)' }}>✦</span>
              </span>
            ))}
          </div>
        </section>

        {/* ══════════════════════ FOR ARTISTS ══════════════════════ */}
        <section className="py-24 px-4 sm:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-end justify-between gap-6 mb-14 flex-wrap">
              <div>
                <p className="eyebrow mb-4">For Artists & Producers</p>
                <h2 className="text-3xl md:text-5xl font-bold" style={{ color: 'var(--text)' }}>
                  Everything you need to get paid
                </h2>
              </div>
              <p className="max-w-xs text-sm" style={{ color: 'var(--text-muted)' }}>
                Upload your music in minutes. Set your price. Fans buy directly. Start on Free — upgrade to keep more.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {ARTIST_FEATURES.map((f, i) => (
                <div key={f.title} className="p-8 transition-all duration-300 hover:-translate-y-1"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                  <div className="flex items-start justify-between mb-8">
                    <span className="numeric eyebrow" style={{ color: 'var(--text-tertiary, var(--text-muted))' }}>{f.tag}</span>
                    <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      <f.icon size={18} />
                    </div>
                  </div>
                  <h3 className="font-bold text-2xl mb-3" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>{f.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{f.desc}</p>
                  <div className="flex items-center justify-between hairline-t mt-8 pt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span className="numeric">{String(i + 1).padStart(2, '0')} / {String(ARTIST_FEATURES.length).padStart(2, '0')}</span>
                    <span>Explore →</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════ HOW IT WORKS ══════════════════════ */}
        <section className="py-24 px-4 sm:px-8 hairline-t">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16">
              <p className="eyebrow mb-4">§ How it works</p>
              <h2 className="text-3xl md:text-5xl font-bold" style={{ color: 'var(--text)' }}>
                From studio to sold — in minutes
              </h2>
            </div>
            <div className="grid md:grid-cols-3 gap-10">
              {HOW_IT_WORKS.map(s => (
                <div key={s.n} className="text-center md:text-left">
                  <div className="numeric text-4xl font-bold mb-4" style={{ color: 'var(--border)', fontFamily: 'var(--font-mono)' }}>{s.n}</div>
                  <h3 className="font-semibold text-lg mb-3" style={{ color: 'var(--text)' }}>{s.t}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════ INDUSTRY PORTAL CALLOUT ══════════════════════ */}
        <section className="py-16 px-4 sm:px-8 hairline-t">
          <div className="max-w-4xl mx-auto">
            <div className="relative overflow-hidden p-8 md:p-12 flex flex-col md:flex-row gap-8 items-center" style={{
              border: '1px solid var(--border-strong, var(--border))',
              borderRadius: 16,
              background: 'linear-gradient(135deg, var(--surface), var(--bg), var(--surface))',
            }}>
              <div className="flex-1">
                <p className="eyebrow mb-3" style={{ color: 'var(--gold)' }}>Industry Portal</p>
                <h3 className="text-2xl md:text-3xl font-bold mb-3" style={{ color: 'var(--text)' }}>
                  Scouts, Labels & Promoters — built in.
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Discover emerging talent, close deals, and manage artists directly on Vuka Music.
                  Built for recruiters, sync buyers, sponsors, and artist managers.
                </p>
              </div>
              <div className="flex-shrink-0 flex flex-col gap-3">
                <Link href="/industry" className="btn btn-primary text-sm font-semibold px-6 py-3">
                  Industry Portal <ArrowRight size={16} />
                </Link>
                <p className="text-xs text-center eyebrow">Free to apply</p>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════ FOR FANS ══════════════════════ */}
        <section className="py-24 px-4 sm:px-8 hairline-t">
          <div className="max-w-6xl mx-auto">
            <div className="grid md:grid-cols-2 gap-16 items-center">
              <div>
                <p className="eyebrow mb-4">For Fans & Listeners</p>
                <h2 className="text-3xl md:text-5xl font-bold mb-6" style={{ color: 'var(--text)' }}>
                  Support the artists you love
                </h2>
                <p className="leading-relaxed mb-6 text-sm" style={{ color: 'var(--text-muted)' }}>
                  Discover independent artists from across Africa and the diaspora. Buy their music directly — money goes straight to the artist.
                </p>
                <div className="space-y-3 mb-8">
                  {FAN_BENEFITS.map(item => (
                    <div key={item} className="flex items-center gap-3 text-sm" style={{ color: 'var(--text-muted)' }}>
                      <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ border: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--green)', fontSize: 10 }}>✓</span>
                      </div>
                      {item}
                    </div>
                  ))}
                </div>
                <Link href="/auth/register?role=fan" className="btn btn-secondary inline-flex">
                  Create a Fan Account <ArrowRight size={16} />
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {FAN_CARDS.map(c => (
                  <div key={c.title} className="p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                    <c.icon size={20} className="mb-3" style={{ color: 'var(--green)' }} />
                    <h4 className="font-semibold text-sm mb-1.5" style={{ color: 'var(--text)' }}>{c.title}</h4>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{c.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════ PRICING ══════════════════════ */}
        <section className="py-24 px-4 sm:px-8 hairline-t">
          <div className="max-w-5xl mx-auto text-center">
            <p className="eyebrow mb-4">§ Pricing</p>
            <h2 className="text-3xl md:text-5xl font-bold mb-4" style={{ color: 'var(--text)' }}>
              Honest pricing. Always.
            </h2>
            <p className="mb-12 text-sm" style={{ color: 'var(--text-muted)' }}>
              Start free. Upgrade when you're ready to keep more of what you earn.
            </p>

            <div className="grid md:grid-cols-3 gap-6 mb-10">
              {/* FREE */}
              <div className="p-8 text-left flex flex-col" style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16 }}>
                <div className="eyebrow mb-3">Free</div>
                <div className="text-5xl font-bold mb-1 numeric" style={{ color: 'var(--text)' }}>R0</div>
                <div className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>forever</div>
                <div className="text-2xl font-bold mb-1 numeric" style={{ color: 'var(--green)' }}>90%</div>
                <div className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>artist keeps per sale</div>
                <div className="space-y-2 flex-1 mb-8 hairline-t pt-6">
                  {['Up to 2 releases/month', 'Beat store & licensing', 'Fan memberships', 'PDF license generation', 'Paystack + Flutterwave', 'Fee drops to 8.5% automatically as you sell more'].map(f => (
                    <div key={f} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                      <span style={{ color: 'var(--green)' }}>✓</span> {f}
                    </div>
                  ))}
                </div>
                <Link href="/auth/register" className="btn btn-secondary text-sm text-center w-full py-3">
                  Get Started Free
                </Link>
              </div>

              {/* PRO */}
              <div className="p-8 text-left flex flex-col relative" style={{ background: 'var(--bg)', border: '1px solid var(--green)', borderRadius: 16, boxShadow: '0 0 30px rgba(160,232,124,0.10)' }}>
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 text-xs font-bold" style={{ background: 'var(--green)', color: '#0A0A0A', borderRadius: 100 }}>Most Popular</div>
                <div className="eyebrow mb-3" style={{ color: 'var(--green)' }}>Pro</div>
                <div className="text-5xl font-bold mb-1 numeric" style={{ color: 'var(--text)' }}>R249</div>
                <div className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>per month</div>
                <div className="text-2xl font-bold mb-1 numeric" style={{ color: 'var(--green)' }}>92%</div>
                <div className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>artist keeps per sale</div>
                <div className="space-y-2 flex-1 mb-8 hairline-t pt-6">
                  {['Unlimited releases', '8% platform fee', 'Priority support', 'Advanced analytics', 'Industry marketplace access', 'Everything in Free'].map(f => (
                    <div key={f} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                      <span style={{ color: 'var(--green)' }}>✓</span> {f}
                    </div>
                  ))}
                </div>
                <Link href="/auth/register" className="btn btn-primary text-sm text-center w-full py-3">
                  Start Pro
                </Link>
              </div>

              {/* LABEL */}
              <div className="p-8 text-left flex flex-col" style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16 }}>
                <div className="eyebrow mb-3" style={{ color: 'var(--gold)' }}>Label</div>
                <div className="text-5xl font-bold mb-1 numeric" style={{ color: 'var(--text)' }}>R999</div>
                <div className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>per month</div>
                <div className="text-2xl font-bold mb-1 numeric" style={{ color: 'var(--gold)' }}>95%</div>
                <div className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>artist keeps per sale</div>
                <div className="space-y-2 flex-1 mb-8 hairline-t pt-6">
                  {['Unlimited releases', '5% platform fee', 'Multiple artists under one account', 'Bulk payout management', 'White-label storefront', 'Everything in Pro'].map(f => (
                    <div key={f} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                      <span style={{ color: 'var(--green)' }}>✓</span> {f}
                    </div>
                  ))}
                </div>
                <Link href="/auth/register" className="btn btn-secondary text-sm text-center w-full py-3">
                  Start Label
                </Link>
              </div>
            </div>

            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              All plans include Paystack + Flutterwave payments, PDF license generation, secure download delivery, and full analytics. No hidden charges.
            </p>
          </div>
        </section>

        {/* ══════════════════════ FOOTER ══════════════════════ */}
        <Footer />

      </main>
    </>
  );
}
