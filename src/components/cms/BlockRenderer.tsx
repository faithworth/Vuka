'use client';
// src/components/cms/BlockRenderer.tsx
// Renders each CmsBlock type as live public UI.
import Link from 'next/link';
import { ArrowRight, Music, Play } from 'lucide-react';

// content mirrors Prisma's JsonValue: string | number | boolean | object | array | null
type Block          = { id: string; type: string; content: unknown; isVisible: boolean };
type FeaturedArtist = {
  id: string; tagline: string; blurb: string;
  artist: {
    id: string; slug: string; name: string; photoUrl: string; coverUrl: string;
    genreTags: string[]; city: string; country: string; isVerified: boolean; totalPlays: number;
    _count: { beats: number; releases: number; followers: number };
  };
};
interface Props { blocks: Block[]; featuredArtists?: FeaturedArtist[] }

// ── Hero ─────────────────────────────────────────────────────
function HeroBlock({ c }: { c: Record<string, unknown> }) {
  const p     = c.cta_primary   as { label: string; href: string } | undefined;
  const s     = c.cta_secondary as { label: string; href: string } | undefined;
  const stats = c.stats as Array<{ value: string; label: string; sub?: string }> | undefined;
  const headline = String(c.headline ?? '').replace(/\\n/g, '\n');
  return (
    <section className="relative min-h-[100svh] flex items-center justify-center overflow-hidden pt-16 pb-8">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(56,182,232,0.10) 0%, transparent 70%)' }} />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 40% 30% at 80% 70%, rgba(201,162,39,0.07) 0%, transparent 60%)' }} />
      <div className="relative z-10 text-center px-4 max-w-5xl mx-auto w-full">
        {Boolean(c.badge) && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6"
            style={{ background: 'rgba(56,182,232,0.1)', border: '1px solid rgba(56,182,232,0.25)', color: 'var(--sky)' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse inline-block" style={{ background: 'var(--sky)' }} />
            {String(c.badge)}
          </div>
        )}
        <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold mb-6 tracking-tight"
          style={{ color: 'var(--text)', lineHeight: 1.05 }}>
          {headline.split('\n').map((line, i, arr) =>
            i === 1
              ? <span key={i} style={{ background: 'linear-gradient(135deg,#38b6e8,#1a9dd4,#c9a227)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{line}{i < arr.length - 1 ? <br /> : ''}</span>
              : <span key={i}>{line}{i < arr.length - 1 ? <br /> : ''}</span>
          )}
        </h1>
        {Boolean(c.subheadline) && <p className="text-base sm:text-lg md:text-xl mb-4 max-w-2xl mx-auto leading-relaxed" style={{ color: 'var(--text-muted)' }}>{String(c.subheadline)}</p>}
        {Boolean(c.subline) && <p className="text-sm mb-4 max-w-xl mx-auto" style={{ color: 'var(--text-muted)' }}>{String(c.subline)}</p>}
        {Boolean(c.notice) && (
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs mb-8"
            style={{ background: 'rgba(201,162,39,0.08)', border: '1px solid rgba(201,162,39,0.3)', color: 'var(--text-muted)' }}>
            <span style={{ color: 'var(--gold)' }}>✦</span>
            {String(c.notice)}
          </div>
        )}
        {(p || s) && (
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-10 px-2">
            {p && <Link href={p.href} className="btn btn-primary text-sm sm:text-base px-6 py-3.5 w-full sm:w-auto">{p.label} <ArrowRight size={16} /></Link>}
            {s && <Link href={s.href} className="btn btn-secondary text-sm sm:text-base px-6 py-3.5 w-full sm:w-auto">{s.label} <Music size={16} /></Link>}
          </div>
        )}
        {stats && stats.length > 0 && (
          <div className="flex items-center justify-center gap-8 sm:gap-12 flex-wrap">
            {stats.map((st, i) => (
              <div key={i} className="text-center">
                <div className="text-2xl md:text-3xl font-bold mb-1" style={{ color: 'var(--text)' }}>{st.value}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{st.label}</div>
                {st.sub && <div className="text-xs mt-0.5" style={{ color: 'var(--gold)', fontSize: 10 }}>{st.sub}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Text ─────────────────────────────────────────────────────
function TextBlock({ c }: { c: Record<string, unknown> }) {
  const align = String(c.align ?? 'left');
  return (
    <section className="py-16 px-4">
      <div className={`max-w-3xl mx-auto text-${align}`}>
        {Boolean(c.heading) && <h2 className="text-3xl md:text-4xl font-bold mb-6" style={{ color: 'var(--text)' }}>{String(c.heading)}</h2>}
        {Boolean(c.body) && <p className="text-lg leading-relaxed" style={{ color: 'var(--text-muted)' }}>{String(c.body)}</p>}
      </div>
    </section>
  );
}

// ── Rich Text ────────────────────────────────────────────────
function RichTextBlock({ c }: { c: Record<string, unknown> }) {
  return (
    <section className="py-16 px-4">
      <div className="max-w-3xl mx-auto prose prose-invert prose-lg" dangerouslySetInnerHTML={{ __html: String(c.html ?? '') }} />
    </section>
  );
}

// ── Image ────────────────────────────────────────────────────
function ImageBlock({ c }: { c: Record<string, unknown> }) {
  if (!c.src) return null;
  return (
    <section className="py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <img src={String(c.src)} alt={String(c.alt ?? '')} className={`w-full object-cover ${c.rounded !== false ? 'rounded-2xl' : ''}`} />
        {Boolean(c.caption) && <p className="text-center text-sm mt-3" style={{ color: 'var(--text-muted)' }}>{String(c.caption)}</p>}
      </div>
    </section>
  );
}

// ── Video ────────────────────────────────────────────────────
function VideoBlock({ c }: { c: Record<string, unknown> }) {
  if (!c.url) return null;
  const embed = String(c.url).replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/').replace('vimeo.com/', 'player.vimeo.com/video/');
  return (
    <section className="py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="relative rounded-2xl overflow-hidden" style={{ paddingBottom: '56.25%', height: 0 }}>
          <iframe src={embed} className="absolute top-0 left-0 w-full h-full" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowFullScreen title={String(c.caption ?? 'Video')} />
        </div>
        {Boolean(c.caption) && <p className="text-center text-sm mt-3" style={{ color: 'var(--text-muted)' }}>{String(c.caption)}</p>}
      </div>
    </section>
  );
}

// ── CTA ──────────────────────────────────────────────────────
function CtaBlock({ c }: { c: Record<string, unknown> }) {
  const buttons = c.buttons as Array<{ label: string; href: string; variant?: string }> | undefined;
  return (
    <section className="py-20 px-4">
      <div className="max-w-3xl mx-auto text-center">
        {Boolean(c.heading) && <h2 className="text-3xl md:text-5xl font-bold mb-4" style={{ color: 'var(--text)' }}>{String(c.heading)}</h2>}
        {Boolean(c.subheading) && <p className="text-lg mb-10" style={{ color: 'var(--text-muted)' }}>{String(c.subheading)}</p>}
        {buttons && (
          <div className="flex flex-wrap gap-3 justify-center">
            {buttons.map((btn, i) => (
              <Link key={i} href={btn.href} className={`btn ${btn.variant === 'primary' ? 'btn-primary' : 'btn-secondary'} px-8 py-3.5 text-base`}>
                {btn.label} <ArrowRight size={16} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Features Grid ─────────────────────────────────────────────
function FeaturesGridBlock({ c }: { c: Record<string, unknown> }) {
  const features = c.features as Array<{ icon: string; title: string; desc: string }> | undefined;
  const cols = Number(c.columns ?? 4);
  const grid = cols === 3 ? 'md:grid-cols-3' : cols === 2 ? 'md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-4';
  return (
    <section className="py-24 px-4" style={{ background: 'var(--surface)' }}>
      <div className="max-w-6xl mx-auto">
        {(Boolean(c.heading) || Boolean(c.subheading)) && (
          <div className="text-center mb-16">
            {Boolean(c.heading) && <h2 className="text-3xl md:text-5xl font-bold mb-4" style={{ color: 'var(--text)' }}>{String(c.heading)}</h2>}
            {Boolean(c.subheading) && <p className="max-w-xl mx-auto" style={{ color: 'var(--text-muted)' }}>{String(c.subheading)}</p>}
          </div>
        )}
        <div className={`grid ${grid} gap-5`}>
          {features?.map((f, i) => (
            <div key={i} className="p-6 rounded-2xl transition-all duration-200"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = 'var(--sky)'; el.style.boxShadow = '0 4px 20px rgba(56,182,232,0.1)'; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = 'var(--border)'; el.style.boxShadow = 'none'; }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 text-xl" style={{ background: 'rgba(56,182,232,0.12)' }}>{f.icon}</div>
              <h3 className="font-semibold mb-2" style={{ color: 'var(--text)' }}>{f.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Pricing ───────────────────────────────────────────────────
function PricingBlock({ c }: { c: Record<string, unknown> }) {
  const tiers = c.tiers as Array<{ name: string; price: string; period: string; keep: string; highlight?: boolean; features: string[]; cta: { label: string; href: string }; note?: string }> | undefined;
  return (
    <section className="py-24 px-4" style={{ background: 'var(--surface)' }}>
      <div className="max-w-5xl mx-auto text-center">
        {Boolean(c.heading) && <h2 className="text-3xl md:text-5xl font-bold mb-4" style={{ color: 'var(--text)' }}>{String(c.heading)}</h2>}
        {Boolean(c.subheading) && <p className="mb-12" style={{ color: 'var(--text-muted)' }}>{String(c.subheading)}</p>}
        <div className="grid md:grid-cols-3 gap-6 mb-10">
          {tiers?.map((tier, i) => (
            <div key={i} className="p-8 rounded-2xl text-left flex flex-col relative"
              style={{ background: 'var(--bg)', border: tier.highlight ? '2px solid var(--sky)' : '1px solid var(--border)', boxShadow: tier.highlight ? '0 0 30px rgba(56,182,232,0.1)' : 'none' }}>
              {tier.highlight && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold" style={{ background: 'var(--sky)', color: 'white' }}>Most Popular</div>}
              <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: tier.highlight ? 'var(--sky)' : 'var(--text-muted)' }}>{tier.name}</div>
              <div className="text-5xl font-bold mb-1" style={{ color: 'var(--text)' }}>{tier.price}</div>
              <div className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>{tier.period}</div>
              <div className="text-2xl font-bold mb-1" style={{ color: tier.highlight ? 'var(--sky)' : 'var(--gold)' }}>{tier.keep}</div>
              <div className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>artist keeps per sale</div>
              <div className="space-y-2 flex-1 mb-8">
                {tier.features.map((f, j) => (
                  <div key={j} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                    <span style={{ color: 'var(--green)' }}>✓</span> {f}
                  </div>
                ))}
              </div>
              <Link href={tier.cta.href} className={`btn ${tier.highlight ? 'btn-primary' : 'btn-secondary'} text-sm text-center w-full py-3`}>{tier.cta.label}</Link>
            </div>
          ))}
        </div>
        {Boolean(c.footnote) && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{String(c.footnote)}</p>}
      </div>
    </section>
  );
}

// ── Artists Grid ──────────────────────────────────────────────
function ArtistsGridBlock({ c, featuredArtists }: { c: Record<string, unknown>; featuredArtists?: FeaturedArtist[] }) {
  const max = Number(c.max ?? 6);
  const visible = (featuredArtists ?? []).slice(0, max);
  if (!visible.length) return null;
  return (
    <section className="py-24 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          {Boolean(c.heading) && <h2 className="text-3xl md:text-5xl font-bold mb-4" style={{ color: 'var(--text)' }}>{String(c.heading)}</h2>}
          {Boolean(c.subheading) && <p className="max-w-xl mx-auto" style={{ color: 'var(--text-muted)' }}>{String(c.subheading)}</p>}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {visible.map(fa => (
            <Link key={fa.id} href={`/artist/${fa.artist.slug}`}
              className="group rounded-2xl overflow-hidden transition-all duration-200"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLAnchorElement; el.style.borderColor = 'var(--sky)'; el.style.transform = 'translateY(-2px)'; el.style.boxShadow = '0 8px 32px rgba(56,182,232,0.12)'; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLAnchorElement; el.style.borderColor = 'var(--border)'; el.style.transform = 'none'; el.style.boxShadow = 'none'; }}>
              <div className="relative h-40 overflow-hidden" style={{ background: 'var(--surface)' }}>
                {fa.artist.photoUrl && <img src={fa.artist.photoUrl} alt={fa.artist.name} className="w-full h-full object-cover opacity-70 group-hover:opacity-90 transition-opacity" />}
                <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%)' }} />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(56,182,232,0.9)' }}><Play size={16} style={{ color: '#000' }} /></div>
                </div>
                <div className="absolute top-3 left-3 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(201,162,39,0.85)', color: '#000' }}>✦ Featured</div>
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold" style={{ color: 'var(--text)' }}>{fa.artist.name}</span>
                      {fa.artist.isVerified && <span className="text-xs" style={{ color: 'var(--sky)' }}>✓</span>}
                    </div>
                    {fa.tagline && <p className="text-xs mt-0.5" style={{ color: 'var(--gold)' }}>{fa.tagline}</p>}
                  </div>
                  <div className="text-right text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{fa.artist._count.followers.toLocaleString()} fans</div>
                </div>
                {fa.blurb && <p className="text-xs mt-2 leading-relaxed line-clamp-2" style={{ color: 'var(--text-muted)' }}>{fa.blurb}</p>}
                <div className="flex gap-1.5 mt-3 flex-wrap">
                  {fa.artist.genreTags.slice(0, 3).map(tag => (
                    <span key={tag} className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'rgba(56,182,232,0.1)', color: 'var(--sky)', border: '1px solid rgba(56,182,232,0.15)' }}>{tag}</span>
                  ))}
                  {fa.artist.city && <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>📍 {fa.artist.city}</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
        <div className="text-center mt-10">
          <Link href="/discover" className="btn btn-secondary px-8 py-3">Discover More Artists <ArrowRight size={16} /></Link>
        </div>
      </div>
    </section>
  );
}

// ── Stats ─────────────────────────────────────────────────────
function StatsBlock({ c }: { c: Record<string, unknown> }) {
  const items = c.items as Array<{ value: string; label: string }> | undefined;
  return (
    <section className="py-16 px-4" style={{ background: 'var(--surface)' }}>
      <div className="max-w-4xl mx-auto flex items-center justify-center gap-12 sm:gap-20 flex-wrap">
        {items?.map((s, i) => (
          <div key={i} className="text-center">
            <div className="text-4xl md:text-5xl font-bold mb-2" style={{ color: 'var(--text)' }}>{s.value}</div>
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── FAQ ───────────────────────────────────────────────────────
function FaqBlock({ c }: { c: Record<string, unknown> }) {
  const items = c.items as Array<{ q: string; a: string }> | undefined;
  return (
    <section className="py-24 px-4">
      <div className="max-w-3xl mx-auto">
        {Boolean(c.heading) && <h2 className="text-3xl md:text-4xl font-bold mb-10 text-center" style={{ color: 'var(--text)' }}>{String(c.heading)}</h2>}
        <div className="space-y-4">
          {items?.map((item, i) => (
            <details key={i} className="rounded-2xl overflow-hidden group" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <summary className="flex items-center justify-between px-6 py-4 cursor-pointer font-semibold text-sm list-none" style={{ color: 'var(--text)' }}>
                {item.q}
                <span className="ml-4 flex-shrink-0 text-lg transition-transform group-open:rotate-45" style={{ color: 'var(--sky)' }}>+</span>
              </summary>
              <div className="px-6 pb-5 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{item.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Banner ────────────────────────────────────────────────────
function BannerBlock({ c }: { c: Record<string, unknown> }) {
  const palette: Record<string, { bg: string; text: string; border: string }> = {
    info:    { bg: 'rgba(56,182,232,0.08)',  text: 'var(--sky)',   border: 'rgba(56,182,232,0.2)'  },
    success: { bg: 'rgba(160,232,124,0.08)', text: 'var(--green)', border: 'rgba(160,232,124,0.2)' },
    warning: { bg: 'rgba(232,200,124,0.08)', text: 'var(--gold)',  border: 'rgba(232,200,124,0.2)' },
    error:   { bg: 'rgba(255,77,77,0.08)',   text: '#ff4d4d',      border: 'rgba(255,77,77,0.2)'   },
  };
  const p = palette[String(c.variant ?? 'info')] ?? palette.info;
  return (
    <div className="px-4 py-3">
      <div className="max-w-6xl mx-auto px-4 py-3 rounded-2xl flex items-center justify-between gap-4" style={{ background: p.bg, border: `1px solid ${p.border}` }}>
        <p className="text-sm font-medium" style={{ color: p.text }}>{String(c.text ?? '')}</p>
        {Boolean(c.link) && Boolean(c.linkLabel) && <Link href={String(c.link)} className="text-xs font-semibold flex-shrink-0 underline" style={{ color: p.text }}>{String(c.linkLabel)} →</Link>}
      </div>
    </div>
  );
}

// ── Testimonials ──────────────────────────────────────────────
function TestimonialsBlock({ c }: { c: Record<string, unknown> }) {
  const items = c.items as Array<{ quote: string; author: string; role: string }> | undefined;
  return (
    <section className="py-24 px-4" style={{ background: 'var(--surface)' }}>
      <div className="max-w-5xl mx-auto">
        {Boolean(c.heading) && <h2 className="text-3xl md:text-4xl font-bold mb-12 text-center" style={{ color: 'var(--text)' }}>{String(c.heading)}</h2>}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items?.map((item, i) => (
            <div key={i} className="p-6 rounded-2xl flex flex-col gap-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <p className="text-sm leading-relaxed italic flex-1" style={{ color: 'var(--text-muted)' }}>"{item.quote}"</p>
              <div>
                <div className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{item.author}</div>
                {item.role && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.role}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Steps ("How It Works") ────────────────────────────────────
function StepsBlock({ c }: { c: Record<string, unknown> }) {
  const items = c.items as Array<{ n: string; title: string; desc: string }> | undefined;
  return (
    <section className="py-24 px-4">
      <div className="max-w-4xl mx-auto">
        {Boolean(c.heading) && (
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4" style={{ color: 'var(--text)' }}>{String(c.heading)}</h2>
          </div>
        )}
        <div className="grid md:grid-cols-3 gap-10">
          {items?.map((s, i) => (
            <div key={i} className="text-center">
              <div className="text-5xl font-bold mb-4 font-mono" style={{ color: 'var(--border)' }}>{s.n}</div>
              <h3 className="font-semibold text-lg mb-3" style={{ color: 'var(--text)' }}>{s.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Callout (e.g. "Industry Portal") ─────────────────────────
function CalloutBlock({ c }: { c: Record<string, unknown> }) {
  const cta = c.cta as { label: string; href: string } | undefined;
  return (
    <section className="py-16 px-4" style={{ background: 'var(--surface)' }}>
      <div className="max-w-4xl mx-auto">
        <div className="p-8 rounded-2xl flex flex-col md:flex-row gap-8 items-center" style={{
          background: 'linear-gradient(135deg, rgba(56,182,232,0.08), rgba(201,162,39,0.06))',
          border: '1px solid var(--border)',
        }}>
          <div className="flex-1">
            {Boolean(c.eyebrow) && <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--gold)' }}>{String(c.eyebrow)}</p>}
            {Boolean(c.heading) && <h3 className="text-2xl md:text-3xl font-bold mb-3" style={{ color: 'var(--text)' }}>{String(c.heading)}</h3>}
            {Boolean(c.body) && <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{String(c.body)}</p>}
          </div>
          {cta && (
            <div className="flex-shrink-0 flex flex-col gap-3">
              <Link href={cta.href} className="btn text-sm font-semibold px-6 py-3" style={{ background: 'var(--sky)', color: 'white', borderRadius: 12 }}>
                {cta.label} <ArrowRight size={16} />
              </Link>
              {Boolean(c.note) && <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>{String(c.note)}</p>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Split Content (e.g. "For Fans") ──────────────────────────
function SplitContentBlock({ c }: { c: Record<string, unknown> }) {
  const checklist = c.checklist as string[] | undefined;
  const cards     = c.cards as Array<{ icon: string; title: string; desc: string }> | undefined;
  const cta       = c.cta as { label: string; href: string } | undefined;
  return (
    <section className="py-24 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div>
            {Boolean(c.eyebrow) && <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--sky)' }}>{String(c.eyebrow)}</p>}
            {Boolean(c.heading) && <h2 className="text-3xl md:text-5xl font-bold mb-6" style={{ color: 'var(--text)' }}>{String(c.heading)}</h2>}
            {Boolean(c.body) && <p className="leading-relaxed mb-6" style={{ color: 'var(--text-muted)' }}>{String(c.body)}</p>}
            {checklist && checklist.length > 0 && (
              <div className="space-y-3 mb-8">
                {checklist.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm" style={{ color: 'var(--text-muted)' }}>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(42,157,92,0.12)' }}>
                      <span style={{ color: 'var(--green)', fontSize: 10 }}>✓</span>
                    </div>
                    {item}
                  </div>
                ))}
              </div>
            )}
            {cta && <Link href={cta.href} className="btn btn-secondary inline-flex">{cta.label} <ArrowRight size={16} /></Link>}
          </div>
          {cards && cards.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              {cards.map((card, i) => (
                <div key={i} className="p-5 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="text-xl mb-3" style={{ color: 'var(--sky)' }}>{card.icon}</div>
                  <h4 className="font-semibold text-sm mb-1.5" style={{ color: 'var(--text)' }}>{card.title}</h4>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{card.desc}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Spacer / HTML ─────────────────────────────────────────────
function SpacerBlock({ c }: { c: Record<string, unknown> }) { return <div style={{ height: `${Number(c.height ?? 64)}px` }} />; }
function HtmlBlock  ({ c }: { c: Record<string, unknown> }) { return <div dangerouslySetInnerHTML={{ __html: String(c.code ?? '') }} />; }

// ── Router ────────────────────────────────────────────────────
export default function BlockRenderer({ blocks, featuredArtists }: Props) {
  return (
    <>
      {blocks.filter(b => b.isVisible).map(b => {
        const c = (typeof b.content === 'object' && b.content !== null && !Array.isArray(b.content))
          ? (b.content as Record<string, unknown>)
          : {} as Record<string, unknown>;
        switch (b.type) {
          case 'hero':          return <HeroBlock         key={b.id} c={c} />;
          case 'text':          return <TextBlock         key={b.id} c={c} />;
          case 'rich_text':     return <RichTextBlock     key={b.id} c={c} />;
          case 'image':         return <ImageBlock        key={b.id} c={c} />;
          case 'video':         return <VideoBlock        key={b.id} c={c} />;
          case 'cta':           return <CtaBlock          key={b.id} c={c} />;
          case 'features_grid': return <FeaturesGridBlock key={b.id} c={c} />;
          case 'pricing':       return <PricingBlock      key={b.id} c={c} />;
          case 'artists_grid':  return <ArtistsGridBlock  key={b.id} c={c} featuredArtists={featuredArtists} />;
          case 'stats':         return <StatsBlock        key={b.id} c={c} />;
          case 'faq':           return <FaqBlock          key={b.id} c={c} />;
          case 'banner':        return <BannerBlock       key={b.id} c={c} />;
          case 'testimonials':  return <TestimonialsBlock key={b.id} c={c} />;
          case 'steps':         return <StepsBlock        key={b.id} c={c} />;
          case 'callout':       return <CalloutBlock      key={b.id} c={c} />;
          case 'split_content': return <SplitContentBlock key={b.id} c={c} />;
          case 'spacer':        return <SpacerBlock       key={b.id} c={c} />;
          case 'html':          return <HtmlBlock         key={b.id} c={c} />;
          default:              return null;
        }
      })}
    </>
  );
}
