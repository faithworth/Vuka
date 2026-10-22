'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowDownRight, ArrowRight, AudioLines, BadgeCheck, ChevronDown, Disc3,
  Globe2, Headphones, Heart, Menu, Music2, Play, Search, ShoppingBag,
  Sparkles, Users, X, Zap,
} from 'lucide-react';

const genres = ['All sounds', 'Hip-hop', 'Amapiano', 'Afrobeats', 'R&B', 'Electronic'];
const releases = [
  { title: 'After Hours', artist: 'Luna Grey', genre: 'R&B', price: 'R35', tone: 'violet', tag: 'NEW RELEASE', shape: 'orb' },
  { title: 'City Never Sleeps', artist: 'Kxng Sizwe', genre: 'Hip-hop', price: 'R49', tone: 'lime', tag: 'FAN FAVOURITE', shape: 'grid' },
  { title: 'Golden Hour', artist: 'Nia Sol', genre: 'Amapiano', price: 'R29', tone: 'orange', tag: 'JUST DROPPED', shape: 'sun' },
  { title: 'Blue Notes', artist: 'Milo West', genre: 'R&B', price: 'R39', tone: 'blue', tag: 'VUKA SELECT', shape: 'wave' },
];
const artists = [
  { name: 'Luna Grey', genre: 'Alt R&B · Johannesburg', initials: 'LG', tone: 'violet' },
  { name: 'Kxng Sizwe', genre: 'Hip-hop · Durban', initials: 'KS', tone: 'lime' },
  { name: 'Nia Sol', genre: 'Amapiano · Pretoria', initials: 'NS', tone: 'orange' },
];

function Artwork({ tone, shape }: { tone: string; shape: string }) {
  return <div className={'vk-art vk-' + tone + ' vk-shape-' + shape} aria-hidden="true">
    <div className="vk-art-glow" />
    <div className="vk-art-core"><Disc3 size={56} strokeWidth={1.1} /></div>
    <span className="vk-art-word">VUKA<br/>SOUND</span>
    <span className="vk-art-index">VOL. 0{['violet','lime','orange','blue'].indexOf(tone) + 1}</span>
  </div>;
}

export default function VukaPreviewPage() {
  const [genre, setGenre] = useState('All sounds');
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [liked, setLiked] = useState<string[]>([]);
  const filtered = useMemo(() => releases.filter(r =>
    (genre === 'All sounds' || r.genre === genre) &&
    (r.title + ' ' + r.artist + ' ' + r.genre).toLowerCase().includes(search.toLowerCase())
  ), [genre, search]);

  return <main className="vk-preview">
    <div className="vk-noise" aria-hidden="true" />
    <header className="vk-header">
      <Link href="/" className="vk-brand" aria-label="Vuka Music preview home"><span className="vk-brand-mark">V</span><span>vuka<span className="vk-brand-dot">.</span></span></Link>
      <nav className={menuOpen ? 'vk-nav vk-nav-open' : 'vk-nav'}>
        <a href="#discover" onClick={() => setMenuOpen(false)}>Discover</a>
        <a href="#artists" onClick={() => setMenuOpen(false)}>Artists</a>
        <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
        <a href="#plans" onClick={() => setMenuOpen(false)}>Plans</a>
      </nav>
      <div className="vk-header-actions"><Link href="/auth/login" className="vk-login">Log in</Link><Link href="/auth/register" className="vk-cta vk-cta-small">Join Vuka <ArrowRight size={15}/></Link></div>
      <button className="vk-menu-toggle" aria-label="Toggle navigation" onClick={() => setMenuOpen(v => !v)}>{menuOpen ? <X/> : <Menu/>}</button>
    </header>

    <section className="vk-hero">
      <div className="vk-hero-copy">
        <motion.div className="vk-eyebrow" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5 }}><span className="vk-live-dot"/> A new home for independent sound</motion.div>
        <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .65, delay: .08 }}>Music moves<br/>the <span className="vk-gradient-text">world forward.</span></motion.h1>
        <motion.p className="vk-hero-sub" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .6, delay: .18 }}>Discover the next sound. Back the people behind it. Give independent music room to rise.</motion.p>
        <motion.div className="vk-hero-actions" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .6, delay: .25 }}><a className="vk-cta" href="#discover">Explore the sound <ArrowRight size={17}/></a><Link className="vk-quiet-link" href="/auth/register">I make music <ArrowDownRight size={16}/></Link></motion.div>
        <div className="vk-proof-row"><div className="vk-avatar-stack"><span>F</span><span>N</span><span>K</span><span>+</span></div><p><strong>Independent by nature.</strong><br/>Global in every direction.</p><div className="vk-proof-divider"/><div className="vk-proof-stat"><strong>01</strong><span>Artist-first<br/>marketplace</span></div></div>
      </div>
      <div className="vk-hero-art" aria-label="Floating 3D music artwork illustration">
        <div className="vk-orbit vk-orbit-one"/><div className="vk-orbit vk-orbit-two"/>
        <motion.div className="vk-floating-chip vk-chip-top" animate={{ y: [0, -9, 0], rotate: [-5, -2, -5] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}><AudioLines size={18}/><span>NEW FREQUENCIES</span></motion.div>
        <motion.div className="vk-hero-record" animate={{ rotate: 360 }} transition={{ duration: 36, repeat: Infinity, ease: 'linear' }}><div className="vk-record-ring"><div className="vk-record-label"><span>VUKA</span><small>SIDE A · 33⅓ RPM</small></div></div></motion.div>
        <motion.div className="vk-floating-chip vk-chip-bottom" animate={{ y: [0, 8, 0], rotate: [4, 1, 4] }} transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}><span className="vk-chip-icon"><Headphones size={17}/></span><span><strong>Hear something new</strong><small>Made to be discovered</small></span></motion.div>
        <div className="vk-hero-coordinate">SOUND WITHOUT BORDERS <span>25°44' S / 28°11' E</span></div>
      </div>
      <a href="#discover" className="vk-scroll-cue"><span/> Scroll to explore</a>
    </section>

    <section className="vk-marquee" aria-label="Vuka features"><div className="vk-marquee-track">{Array.from({ length: 2 }, (_, i) => <div className="vk-marquee-set" key={i}><span>DISCOVER NEW SOUND</span><Sparkles/><span>SUPPORT THE ARTISTS</span><Sparkles/><span>OWN YOUR MUSIC</span><Sparkles/><span>INDEPENDENT ALWAYS</span><Sparkles/></div>)}</div></section>

    <section id="discover" className="vk-section vk-discover">
      <div className="vk-section-head"><div><p className="vk-kicker">THE SOUND OF WHAT'S NEXT</p><h2>Find your <span className="vk-serif">next favourite.</span></h2></div><Link href="/store" className="vk-text-link">Enter the store <ArrowRight size={16}/></Link></div>
      <div className="vk-discovery-tools"><div className="vk-filter-list">{genres.map(g => <button key={g} onClick={() => setGenre(g)} className={genre === g ? 'vk-filter active' : 'vk-filter'}>{g}</button>)}</div><label className="vk-search"><Search size={16}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search sounds or artists" aria-label="Search sounds or artists"/></label></div>
      <div className="vk-release-grid"><AnimatePresence mode="popLayout">{filtered.map((r, i) => <motion.article layout key={r.title} className="vk-release-card" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: .97 }} transition={{ duration: .28, delay: i * .04 }}><div className="vk-card-art-wrap"><Artwork tone={r.tone} shape={r.shape}/><span className="vk-release-tag">{r.tag}</span><button className="vk-play-button" aria-label={'Preview ' + r.title} onClick={() => setPlaying(playing === r.title ? null : r.title)}>{playing === r.title ? <AudioLines size={19}/> : <Play size={19} fill="currentColor"/>}</button><button className={liked.includes(r.title) ? 'vk-like liked' : 'vk-like'} aria-label={(liked.includes(r.title) ? 'Unlike ' : 'Like ') + r.title} onClick={() => setLiked(old => old.includes(r.title) ? old.filter(t => t !== r.title) : [...old, r.title])}><Heart size={17} fill={liked.includes(r.title) ? 'currentColor' : 'none'}/></button></div><div className="vk-release-meta"><div><p className="vk-release-genre">{r.genre}</p><h3>{r.title}</h3><p className="vk-release-artist">{r.artist}</p></div><span className="vk-price">{r.price}</span></div><div className="vk-card-footer"><span><span className="vk-status-dot"/> {playing === r.title ? 'Preview selected' : 'Independent release'}</span><Link href="/store" aria-label={'View ' + r.title}><ArrowUpRightIcon/></Link></div></motion.article>)}</AnimatePresence></div>
      {filtered.length === 0 && <div className="vk-empty-state">No matches yet. Try another search or genre.</div>}
      <p className="vk-demo-note">Interactive concept preview · Sample artwork and listings are illustrative, not live catalog data.</p>
    </section>

    <section id="artists" className="vk-artist-section"><div className="vk-section vk-artists-inner"><div className="vk-artist-copy"><p className="vk-kicker">THE PEOPLE MAKE THE MUSIC</p><h2>Independent isn't a genre.<br/><span className="vk-serif">It's a movement.</span></h2><p>Meet the artists building their own lane. Discover their sound, support their next chapter, and keep the culture moving.</p><Link href="/browse-artists" className="vk-cta">Meet the artists <ArrowRight size={16}/></Link></div><div className="vk-artist-list">{artists.map((a, i) => <motion.div key={a.name} className="vk-artist-row" whileHover={{ x: 7 }} transition={{ type: 'spring', stiffness: 300, damping: 24 }}><div className={'vk-artist-avatar vk-' + a.tone}>{a.initials}</div><div className="vk-artist-details"><strong>{a.name}</strong><span>{a.genre}</span></div><span className="vk-artist-number">0{i + 1}</span><Link href="/browse-artists" aria-label={'Discover ' + a.name}><ArrowRight size={17}/></Link></motion.div>)}</div></div></section>

    <section id="how-it-works" className="vk-section vk-how"><div className="vk-section-head"><div><p className="vk-kicker">A BETTER WAY TO MOVE</p><h2>Made for the <span className="vk-serif">music life.</span></h2></div><p className="vk-section-description">Whether you make it or live for it, there's a place for you here.</p></div><div className="vk-feature-grid"><article className="vk-feature-card vk-feature-main"><span className="vk-feature-icon"><Music2/></span><span className="vk-feature-index">01 / CREATE</span><h3>Your sound.<br/>Your rules.</h3><p>Build your artist storefront, set your prices, and bring your releases straight to your people.</p><Link href="/auth/register">Start your artist journey <ArrowRight size={15}/></Link><div className="vk-feature-disc"><Disc3 size={120}/></div></article><article className="vk-feature-card vk-feature-fan"><span className="vk-feature-icon"><Heart/></span><span className="vk-feature-index">02 / SUPPORT</span><h3>Love music.<br/>Move culture.</h3><p>Discover new voices, buy directly, and support the people making the soundtrack.</p><Link href="/store">Explore the store <ArrowRight size={15}/></Link><div className="vk-feature-disc"><Users size={112}/></div></article><article className="vk-feature-card vk-feature-industry"><span className="vk-feature-icon"><Globe2/></span><span className="vk-feature-index">03 / CONNECT</span><h3>Find the next<br/>big thing.</h3><p>A space for industry professionals to discover talent and build meaningful connections.</p><Link href="/industry">Explore industry <ArrowRight size={15}/></Link><div className="vk-feature-disc"><Zap size={108}/></div></article></div></section>

    <section id="plans" className="vk-plans"><div className="vk-plans-orb"/><div className="vk-plans-content"><p className="vk-kicker">YOUR JOURNEY, YOUR PACE</p><h2>Start where you are.<br/><span className="vk-serif">Rise from there.</span></h2><p>Open the door for free. Upgrade when you're ready for more room to grow.</p><div className="vk-plan-row"><div><span>01 / OPEN</span><h3>Free</h3><p>Set up your space and start sharing your sound.</p><strong>R0 <small>/ forever</small></strong></div><div className="vk-plan-featured"><span>02 / GROW</span><h3>Pro</h3><p>More room for releases, insights, and your business.</p><strong>R170 <small>/ 2 months</small></strong></div><div><span>03 / SCALE</span><h3>Label</h3><p>Bring your roster together under one roof.</p><strong>R549 <small>/ 2 months</small></strong></div></div><Link href="/auth/register" className="vk-cta">Find your place on Vuka <ArrowRight size={16}/></Link><p className="vk-plan-note">Preview only. Prices and plan benefits reflect existing public pricing and should be verified before launch.</p></div></section>

    <footer className="vk-footer"><Link href="/" className="vk-brand"><span className="vk-brand-mark">V</span><span>vuka<span className="vk-brand-dot">.</span></span></Link><p>Independent sound. Unbound potential.</p><div><Link href="/legal/terms">Terms</Link><Link href="/legal/privacy">Privacy</Link><Link href="/support">Support</Link><span>© {new Date().getFullYear()} Vuka Music</span></div></footer>
  </main>;
}

function ArrowUpRightIcon() {
  return <ArrowRight size={16} className="vk-card-arrow"/>;
}
