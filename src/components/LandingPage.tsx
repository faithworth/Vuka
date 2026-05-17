import Link from 'next/link';
import { ArrowRight, Globe, Zap, DollarSign, Shield, Music, TrendingUp, Users } from 'lucide-react';
import Navbar from '@/components/Navbar';

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main>

        {/* ── HERO ── */}
        <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(124,58,237,0.12) 0%, transparent 70%)' }} />
          <div className="relative z-10 text-center px-4 max-w-5xl mx-auto">

            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold mb-8"
              style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.25)', color: 'var(--purple-light)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
              Africa's independent music platform
            </div>

            <h1 className="text-5xl md:text-7xl font-bold mb-6 tracking-tight" style={{ color: 'var(--text)', lineHeight: 1.05 }}>
              Your music.<br />
              <span style={{ color: 'var(--purple-light)' }}>Your terms.</span><br />
              Your money.
            </h1>

            <p className="text-lg md:text-xl mb-4 max-w-2xl mx-auto leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Sell beats and releases directly to your fans — in South Africa and worldwide.
              Keep 99% of every sale.
            </p>

            <p className="text-sm mb-10 max-w-xl mx-auto" style={{ color: 'var(--text-muted)' }}>
              PayFast for South African buyers. Stripe for the world. Money goes straight to your bank — no middlemen, no waiting.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <Link href="/auth/register" className="btn btn-primary text-base px-8 py-4">
                Start Selling — It's Free <ArrowRight size={18} />
              </Link>
              <Link href="/store" className="btn btn-secondary text-base px-8 py-4">
                Browse the Store <Music size={18} />
              </Link>
            </div>

            <div className="flex items-center justify-center gap-12">
              {[
                { n: '99%', l: 'Artist Revenue' },
                { n: '1%', l: 'Platform Fee' },
                { n: 'Global', l: 'Payments' },
              ].map(s => (
                <div key={s.n} className="text-center">
                  <div className="text-2xl md:text-3xl font-bold mb-1" style={{ color: 'var(--text)' }}>{s.n}</div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FOR ARTISTS ── */}
        <section className="py-24 px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--purple-light)' }}>For Artists & Producers</p>
              <h2 className="text-3xl md:text-5xl font-bold mb-4" style={{ color: 'var(--text)' }}>
                Everything you need to get paid
              </h2>
              <p className="max-w-xl mx-auto" style={{ color: 'var(--text-muted)' }}>
                Upload your music in minutes. Set your price. Fans buy directly. Money lands in your bank.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                {
                  icon: DollarSign,
                  title: 'Dual Payments',
                  desc: 'PayFast for South African buyers with PayShap support. Stripe for international fans. Both fully automated.',
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
                <div key={f.title} className="p-6 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background: 'rgba(124,58,237,0.15)' }}>
                    <f.icon size={20} style={{ color: 'var(--purple-light)' }} />
                  </div>
                  <h3 className="font-semibold mb-2" style={{ color: 'var(--text)' }}>{f.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section className="py-24 px-4" style={{ background: 'var(--surface)' }}>
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-bold mb-4" style={{ color: 'var(--text)' }}>
                From studio to sold — in minutes
              </h2>
            </div>
            <div className="grid md:grid-cols-3 gap-10">
              {[
                {
                  n: '01',
                  t: 'Upload your music',
                  d: 'Add your beats or releases. Set your prices, license tiers, and artwork. We handle the rest.',
                },
                {
                  n: '02',
                  t: 'Share your link',
                  d: 'Get your personal store link — vuka.app/artist/you. Share it everywhere you already are.',
                },
                {
                  n: '03',
                  t: 'Get paid',
                  d: 'PayFast and Stripe move money directly to your bank. You get a notification with every sale.',
                },
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

        {/* ── FOR FANS ── */}
        <section className="py-24 px-4">
          <div className="max-w-6xl mx-auto">
            <div className="grid md:grid-cols-2 gap-16 items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--purple-light)' }}>For Fans & Listeners</p>
                <h2 className="text-3xl md:text-5xl font-bold mb-6" style={{ color: 'var(--text)' }}>
                  Support the artists you love
                </h2>
                <p className="leading-relaxed mb-6" style={{ color: 'var(--text-muted)' }}>
                  Discover independent artists from across Africa and the diaspora. Buy their music directly — every purchase goes almost entirely to the artist.
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
                      <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(16,185,129,0.15)' }}>
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
                    <c.icon size={20} className="mb-3" style={{ color: 'var(--purple-light)' }} />
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
              No monthly fees. No hidden charges. We take 1% only when you make a sale.
            </p>
            <div className="p-8 rounded-2xl mb-8" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <div className="text-6xl font-bold mb-3" style={{ color: 'var(--text)' }}>1%</div>
              <div className="text-lg mb-6" style={{ color: 'var(--text-muted)' }}>platform fee per sale</div>
              <div className="space-y-3">
                {[
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
        <footer className="py-12 px-4" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <span className="text-xl font-bold" style={{ color: 'var(--text)' }}>Vuka</span>
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>African music. Your money. Your terms.</span>
            </div>
            <div className="flex items-center gap-6 text-sm" style={{ color: 'var(--text-muted)' }}>
              <Link href="/store" className="hover:text-white transition-colors">Store</Link>
              <Link href="/auth/login" className="hover:text-white transition-colors">Log In</Link>
              <Link href="/auth/register" className="hover:text-white transition-colors">Sign Up</Link>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>© 2025 Vuka. Built for independent artists.</p>
          </div>
        </footer>

      </main>
    </>
  );
}
