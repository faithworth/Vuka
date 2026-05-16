import Link from 'next/link';
import { Music, ArrowRight, Globe, Zap, DollarSign, Shield } from 'lucide-react';
import Navbar from '@/components/Navbar';

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
          <div className="absolute inset-0 bg-gradient-glow opacity-60" />
          <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(124,58,237,0.1) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(245,158,11,0.05) 0%, transparent 40%)' }} />
          <div className="relative z-10 text-center px-4 max-w-5xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-[var(--purple)]/30 text-sm text-[var(--purple-light)] mb-8">
              <span className="w-2 h-2 rounded-full bg-[var(--green)] animate-pulse" />
              Live now — artists earning globally
            </div>
            <h1 className="font-display text-5xl md:text-8xl font-black mb-6 leading-none">
              <span className="gradient-text">VUKA</span><br />
              <span className="text-[var(--text)]">Rise</span>
            </h1>
            <p className="text-lg md:text-xl text-[var(--text-muted)] mb-4 max-w-2xl mx-auto leading-relaxed">
              Sell your music to the world. Keep 99%, we take 1%.
            </p>
            <p className="text-sm md:text-base text-[var(--text-muted)] mb-12 max-w-2xl mx-auto">
              Artists in 45 countries already earn from their beats and releases. <strong className="text-[var(--green)]">Money goes straight to your bank.</strong>
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <Link href="/auth/register" className="btn btn-primary text-lg px-8 py-4">
                Rise Up — It&apos;s Free <ArrowRight size={20} />
              </Link>
              <Link href="/store" className="btn btn-secondary text-lg px-8 py-4">
                Browse Store <Music size={20} />
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-8 max-w-lg mx-auto">
              {[{ n: '99%', l: 'Artist Revenue' }, { n: '1%', l: 'Platform Fee' }, { n: 'Global', l: 'Reach' }].map(s => (
                <div key={s.n} className="text-center">
                  <div className="text-2xl md:text-3xl font-bold gradient-text">{s.n}</div>
                  <div className="text-xs text-[var(--text-muted)] mt-1">{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-24 px-4">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl md:text-5xl font-bold text-center mb-4">Everything you need to <span className="gradient-text">get paid</span></h2>
            <p className="text-[var(--text-muted)] text-center mb-16 max-w-xl mx-auto">One link. Your beats. Your music. Your rules.</p>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { icon: Globe, title: 'Global Payments', desc: 'Stripe for international buyers. PayFast for South Africa. Funds go straight to you.' },
                { icon: Zap, title: 'Instant Downloads', desc: 'Buyers get secure download links immediately after payment. No friction.' },
                { icon: DollarSign, title: 'Beat Licensing', desc: 'Basic, Premium, and Exclusive tiers with auto-generated PDF license agreements.' },
                { icon: Shield, title: 'Fan Support', desc: 'Let your fans tip and back your goals. Build a real community.' },
              ].map(f => (
                <div key={f.title} className="card p-6">
                  <div className="w-12 h-12 rounded-xl bg-[var(--purple)]/20 flex items-center justify-center mb-4">
                    <f.icon size={24} className="text-[var(--purple-light)]" />
                  </div>
                  <h3 className="font-bold mb-2">{f.title}</h3>
                  <p className="text-sm text-[var(--text-muted)] leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-24 px-4 bg-[var(--surface)]">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl md:text-5xl font-bold mb-16">From studio to <span className="gradient-text">paid</span> in minutes</h2>
            <div className="grid md:grid-cols-3 gap-8">
              {[
                { n: '01', t: 'Upload', d: 'Drag your beats or releases. We auto-detect BPM, key, and generate waveform previews.' },
                { n: '02', t: 'Share', d: 'Get your link — vuka.app/artist/you. Share it everywhere. Fans buy directly.' },
                { n: '03', t: 'Get Paid', d: 'Stripe moves money to your bank. You get a "💰 You just made a sale" email.' },
              ].map(s => (
                <div key={s.n}>
                  <div className="text-6xl font-black text-[var(--border)] mb-4 font-mono">{s.n}</div>
                  <h3 className="font-bold text-xl mb-2">{s.t}</h3>
                  <p className="text-[var(--text-muted)] text-sm leading-relaxed">{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-24 px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-5xl font-bold mb-6">The music industry had its run.<br /><span className="gradient-text">Vuka is what comes next.</span></h2>
            <p className="text-[var(--text-muted)] mb-8">An artist in Katlehong uploads their EP tonight. Fans from London and Lagos buy it by morning. No label. No cuts. Just music.</p>
            <Link href="/auth/register" className="btn btn-primary text-lg px-10 py-5">
              Start for Free — Rise Up <ArrowRight size={20} />
            </Link>
          </div>
        </section>

        <footer className="border-t border-[var(--border)] py-8 px-4">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-[var(--purple)] flex items-center justify-center">
                <Music size={12} className="text-white" />
              </div>
              <span className="font-bold gradient-text">VUKA</span>
            </div>
            <div className="flex gap-6 text-sm text-[var(--text-muted)]">
              <Link href="/store">Store</Link>
              <Link href="/auth/login">Login</Link>
              <Link href="/auth/register">Register</Link>
              <Link href="/redownload">Re-Download</Link>
            </div>
            <p className="text-xs text-[var(--text-muted)]">© 2025 Vuka. Artist-first music. 1% fee. Built for creators.</p>
          </div>
        </footer>
      </main>
    </>
  );
}
