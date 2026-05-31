'use client';
import Link from 'next/link';
import { ArrowRight, Globe, Zap, DollarSign, Shield, Music, TrendingUp, Users, Star, Headphones } from 'lucide-react';
import Navbar from '@/components/Navbar';

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
              "name": "Vuka",
              "alternateName": ["Vuka Distro", "vuka-distro"],
              "url": "https://vuka-distro.vercel.app",
              "description": "Africa's independent music platform. Buy beats and music directly from African artists.",
              "potentialAction": {
                "@type": "SearchAction",
                "target": "https://vuka-distro.vercel.app/store?q={search_term_string}",
                "query-input": "required name=search_term_string"
              }
            })
          }}
        />

        {/* ── HERO ── */}
        <section className="relative min-h-[100svh] flex items-center justify-center overflow-hidden pt-16 pb-8">
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(56,182,232,0.10) 0%, transparent 70%)' }} />
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 40% 30% at 80% 70%, rgba(201,162,39,0.07) 0%, transparent 60%)' }} />

          <div className="relative z-10 text-center px-4 max-w-5xl mx-auto w-full">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6"
              style={{ background: 'rgba(56,182,232,0.1)', border: '1px solid rgba(56,182,232,0.25)', color: 'var(--sky)' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse inline-block" style={{ background: 'var(--sky)' }} />
              Africa's independent music platform
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold mb-6 tracking-tight" style={{ color: 'var(--text)', lineHeight: 1.05 }}>
              Your music.<br />
              <span style={{
                background: 'linear-gradient(135deg, #38b6e8, #1a9dd4, #c9a227)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>Your terms.</span><br />
              Your money.
            </h1>

            <p className="text-base sm:text-lg md:text-xl mb-4 max-w-2xl mx-auto leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Sell beats and releases directly to your fans — in South Africa and worldwide.
              Keep 92% of every sale.
            </p>

            <p className="text-sm mb-4 max-w-xl mx-auto" style={{ color: 'var(--text-muted)' }}>
              PayFast for South African buyers. Money goes directly to your bank. Vuka takes just 8% to cover hosting and keep the platform running.
            </p>

            {/* Fee transparency notice */}
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs mb-8"
              style={{ background: 'rgba(201,162,39,0.08)', border: '1px solid rgba(201,162,39,0.3)', color: 'var(--text-muted)' }}>
              <span style={{ color: 'var(--gold)' }}>✦</span>
              Vuka charges a transparent 8% platform fee on every sale — you keep the other 92%.
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-10 px-2">
              <Link href="/auth/register" className="btn btn-primary text-sm sm:text-base px-6 py-3.5 w-full sm:w-auto">
                Start Selling — It's Free <ArrowRight size={16} />
              </Link>
              <Link href="/store" className="btn btn-secondary text-sm sm:text-base px-6 py-3.5 w-full sm:w-auto">
                Browse the Store <Music size={16} />
              </Link>
            </div>

            <div className="flex items-center justify-center gap-8 sm:gap-12 flex-wrap">
              {[
                { n: '92%', l: 'Artist Revenue' },
                { n: '8%', l: 'Platform Fee', sub: 'keeps the platform alive' },
                { n: 'Global', l: 'Payments' },
              ].map(s => (
                <div key={s.n} className="text-center">
                  <div className="text-2xl md:text-3xl font-bold mb-1" style={{ color: 'var(--text)' }}>{s.n}</div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.l}</div>
                  {'sub' in s && s.sub && <div className="text-xs mt-0.5" style={{ color: 'var(--gold)', fontSize: 10 }}>{s.sub}</div>}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FOR ARTISTS ── */}
        <section className="py-24 px-4" style={{ background: 'var(--surface)' }}>
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--sky)' }}>For Artists & Producers</p>
              <h2 className="text-3xl md:text-5xl font-bold mb-4" style={{ color: 'var(--text)' }}>
                Everything you need to get paid
              </h2>
              <p className="max-w-xl mx-auto" style={{ color: 'var(--text-muted)' }}>
                Upload your music in minutes. Set your price. Fans buy directly. 92% of every sale lands in your bank.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                {
                  icon: DollarSign,
                  title: 'Dual Payments',
                  desc: 'PayFast for South African buyers with PayShap support. Stripe for international fans. Both fully automated. You keep 92% of every sale.',
                },
                {
                  icon: Zap,
                  title: 'Instant Downloads',
                  desc: 'Fans receive secure download links the moment payment clears. No manual work needed.',
                },
                {
                  icon: Shield,
                  title: 'Beat Licensing',
                  desc: 'Basic, Premium, and Exclusive tiers. Auto-generated PDF license agreements sent to every buyer.',
                },
                {
                  icon: Users,
                  title: 'Fan Support',
                  desc: 'Let fans tip you and back your recording goals. Build a real community around your music.',
                },
              ].map(f => (
                <div key={f.title} className="p-6 rounded-2xl transition-all duration-200"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--sky)';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 20px rgba(56,182,232,0.1)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                  }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background: 'rgba(56,182,232,0.12)' }}>
                    <f.icon size={20} style={{ color: 'var(--sky)' }} />
                  </div>
                  <h3 className="font-semibold mb-2" style={{ color: 'var(--text)' }}>{f.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section className="py-24 px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-bold mb-4" style={{ color: 'var(--text)' }}>
                From studio to sold — in minutes
              </h2>
            </div>
            <div className="grid md:grid-cols-3 gap-10">
              {[
                { n: '01', t: 'Upload your music', d: 'Add your beats or releases. Set your prices, license tiers, and artwork. We handle the rest.' },
                { n: '02', t: 'Share your link', d: 'Get your personal store link — vuka.app/artist/you. Share it everywhere you already are.' },
                { n: '03', t: 'Get paid 92%', d: 'PayFast and Stripe move money directly to your bank. Vuka retains just 8% to keep the platform running.' },
              ].map(s => (
                <div key={s.n} className="text-center">
                  <div className="text-5xl font-bold mb-4 font-mono" style={{ color: 'var(--border)' }}>{s.n}</div>
                  <h3 className="font-semibold text-lg mb-3" style={{ color: 'var(--text)' }}>{s.t}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── INDUSTRY PORTAL CALLOUT ── */}
        <section className="py-16 px-4" style={{ background: 'var(--surface)' }}>
          <div className="max-w-4xl mx-auto">
            <div className="p-8 rounded-2xl flex flex-col md:flex-row gap-8 items-center" style={{
              background: 'linear-gradient(135deg, rgba(56,182,232,0.08), rgba(201,162,39,0.06))',
              border: '1px solid var(--border)',
            }}>
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--gold)' }}>Industry Portal</p>
                <h3 className="text-2xl md:text-3xl font-bold mb-3" style={{ color: 'var(--text)' }}>
                  Scouts, Labels & Promoters — earn too.
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Discover talent, close deals, and earn commission on every sale you refer. Up to 15% referral on every transaction.
                  Built for recruiters, sync buyers, sponsors, and artist managers.
                </p>
              </div>
              <div className="flex-shrink-0 flex flex-col gap-3">
                <Link href="/industry" className="btn text-sm font-semibold px-6 py-3" style={{ background: 'var(--sky)', color: 'white', borderRadius: 12 }}>
                  Industry Portal <ArrowRight size={16} />
                </Link>
                <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>Free to apply</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── FOR FANS ── */}
        <section className="py-24 px-4">
          <div className="max-w-6xl mx-auto">
            <div className="grid md:grid-cols-2 gap-16 items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--sky)' }}>For Fans & Listeners</p>
                <h2 className="text-3xl md:text-5xl font-bold mb-6" style={{ color: 'var(--text)' }}>
                  Support the artists you love
                </h2>
                <p className="leading-relaxed mb-6" style={{ color: 'var(--text-muted)' }}>
                  Discover independent artists from across Africa and the diaspora. Buy their music directly — 92% goes straight to the artist.
                </p>
                <div className="space-y-3 mb-8">
                  {[
                    'Browse and stream previews before you buy',
                    'Secure checkout via PayFast or card',
                    'Instant download links in your inbox',
                    'Follow artists and get notified of new drops',
                    'Tip artists and back their recording goals',
                  ].map(item => (
                    <div key={item} className="flex items-center gap-3 text-sm" style={{ color: 'var(--text-muted)' }}>
                      <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(42,157,92,0.12)' }}>
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
                {[
                  { icon: Globe, title: 'Global Discovery', desc: 'Artists from SA, Nigeria, Ghana, Kenya and beyond.' },
                  { icon: TrendingUp, title: 'Support Goals', desc: "Back an artist's recording or tour fund directly." },
                  { icon: Music, title: 'Build a Library', desc: 'Your purchases available for download anytime.' },
                  { icon: Shield, title: 'Safe & Secure', desc: 'Protected checkout. Immediate delivery.' },
                ].map(c => (
                  <div key={c.title} className="p-5 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <c.icon size={20} className="mb-3" style={{ color: 'var(--sky)' }} />
                    <h4 className="font-semibold text-sm mb-1.5" style={{ color: 'var(--text)' }}>{c.title}</h4>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{c.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── PRICING ── */}
        <section className="py-24 px-4" style={{ background: 'var(--surface)' }}>
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl md:text-5xl font-bold mb-4" style={{ color: 'var(--text)' }}>
              Honest pricing. Always.
            </h2>
            <p className="mb-12" style={{ color: 'var(--text-muted)' }}>
              No monthly fees. No hidden charges. Just 8% to keep the lights on.
            </p>
            <div className="p-8 rounded-2xl mb-8" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <div className="text-6xl font-bold mb-2" style={{ color: 'var(--text)' }}>8%</div>
              <div className="text-lg mb-2" style={{ color: 'var(--text-muted)' }}>platform fee per sale</div>
              <div className="text-sm mb-6" style={{ color: 'var(--gold)' }}>Artist keeps 92%</div>

              {/* Gold fee notice */}
              <div className="flex items-start gap-3 p-4 rounded-xl mb-6 text-left" style={{ background: 'rgba(201,162,39,0.08)', border: '1px solid rgba(201,162,39,0.25)' }}>
                <span style={{ color: 'var(--gold)', fontSize: 16, flexShrink: 0 }}>✦</span>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Vuka charges an 8% platform fee on every sale. This covers hosting, servers, payment processing, and keeps the app running. No monthly subscription, no hidden charges.
                </p>
              </div>

              <div className="space-y-3">
                {[
                  '8% platform fee per sale — keeps the platform running',
                  'No monthly subscription',
                  'No upfront costs',
                  'No limit on uploads',
                  'PayFast + Stripe both included',
                  'PDF license generation included',
                  'Secure download delivery included',
                ].map(item => (
                  <div key={item} className="flex items-center gap-3 text-sm justify-center" style={{ color: 'var(--text-muted)' }}>
                    <span style={{ color: 'var(--green)' }}>✓</span> {item}
                  </div>
                ))}
              </div>
            </div>
            <Link href="/auth/register" className="btn btn-primary text-base px-8 py-4">
              Get Started Free <ArrowRight size={18} />
            </Link>
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer className="py-10 px-4" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
          <div className="max-w-6xl mx-auto flex flex-col items-center gap-6 md:flex-row md:justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl font-bold" style={{ color: 'var(--text)' }}>Vuka</span>
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>African music. Your money. Your terms.</span>
            </div>
            <div className="flex items-center gap-6 text-sm flex-wrap justify-center" style={{ color: 'var(--text-muted)' }}>
              <Link href="/store" className="transition-colors hover:text-[var(--sky)]" style={{ color: 'var(--text-muted)' }}>Store</Link>
              <Link href="/industry" className="transition-colors hover:text-[var(--sky)]" style={{ color: 'var(--text-muted)' }}>Industry</Link>
              <Link href="/legal/terms" className="transition-colors hover:text-[var(--sky)]" style={{ color: 'var(--text-muted)' }}>Terms</Link>
              <Link href="/legal/privacy" className="transition-colors hover:text-[var(--sky)]" style={{ color: 'var(--text-muted)' }}>Privacy</Link>
              <Link href="/legal/dmca" className="transition-colors hover:text-[var(--sky)]" style={{ color: 'var(--text-muted)' }}>DMCA</Link>
              <Link href="/auth/login" className="transition-colors hover:text-[var(--sky)]" style={{ color: 'var(--text-muted)' }}>Log In</Link>
              <Link href="/auth/register" className="transition-colors hover:text-[var(--sky)]" style={{ color: 'var(--text-muted)' }}>Sign Up</Link>
            </div>
            <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              © 2025 Vuka · Made in South Africa
            </p>
          </div>
        </footer>

      </main>
    </>
  );
}
