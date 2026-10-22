'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, AudioLines, Disc3, Headphones, Heart, Menu, Music2, Play, Search, Sparkles, Users, X, Zap } from 'lucide-react';

type Beat = { id:string; title:string; slug?:string; genre?:string; mood?:string; artworkUrl?:string|null; previewUrl?:string|null; basicPrice?:number; plays?:number; artist?:{name?:string;slug?:string;photoUrl?:string|null} };
type Release = { id:string; title:string; slug?:string; releaseType?:string; artworkUrl?:string|null; price?:number; plays?:number; tracks?:{id:string;title:string;previewUrl?:string|null}[]; artist?:{name?:string;slug?:string;photoUrl?:string|null} };
type Artist = { name:string; slug?:string; photoUrl?:string|null; city?:string; country?:string; genreTags?:string[]; _count?:{beats:number;releases:number} };
type Item = {key:string;title:string;artist:string;genre:string;price?:number;art?:string|null;url?:string|null;kind:string;href:string;slug?:string};

function Cover({src,title}:{src?:string|null;title:string}) {
  return <div className="vk-art" aria-label={title} style={{background:src ? 'center/cover url("' + src + '")' : 'radial-gradient(circle at 35% 30%,#a58bff,#27204a 42%,#101116 75%)'}}>
    {!src && <><div className="vk-art-glow"/><div className="vk-art-core"><Disc3 size={58} strokeWidth={1}/></div><span className="vk-art-word">VUKA<br/>SOUND</span></>}
  </div>;
}

export default function VukaPreviewPage() {
  const [beats,setBeats] = useState<Beat[]>([]);
  const [releases,setReleases] = useState<Release[]>([]);
  const [artists,setArtists] = useState<Artist[]>([]);
  const [query,setQuery] = useState('');
  const [genre,setGenre] = useState('All sounds');
  const [playing,setPlaying] = useState<string|null>(null);
  const [playingUrl,setPlayingUrl] = useState('');
  const [menuOpen,setMenuOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement|null>(null);
  const [loadError,setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch('/api/store/beats?sort=newest').then(r=>r.ok?r.json():{beats:[]}),
      fetch('/api/store/releases?sort=newest').then(r=>r.ok?r.json():{releases:[]}),
      fetch('/api/store/artists?q=ar').then(r=>r.ok?r.json():{artists:[]})
    ]).then(([b,r,a]) => {
      if(!active)return;
      setBeats(Array.isArray(b.beats)?b.beats:[]);
      setReleases(Array.isArray(r.releases)?r.releases:[]);
      setArtists(Array.isArray(a.artists)?a.artists:[]);
      setLoadError(Boolean(b.dbError||r.dbError));
    }).catch(()=>{if(active)setLoadError(true)});
    return ()=>{active=false};
  },[]);

  const items:Item[] = useMemo(() => [
    ...beats.map(b=>({key:'beat-'+b.id,title:b.title,artist:b.artist?.name||'Independent artist',slug:b.artist?.slug,genre:b.genre||'Beat',price:b.basicPrice,art:b.artworkUrl,url:b.previewUrl,kind:'Beat',href:'/beat/'+(b.slug||b.id)})),
    ...releases.map(r=>({key:'release-'+r.id,title:r.title,artist:r.artist?.name||'Independent artist',slug:r.artist?.slug,genre:r.releaseType||'Release',price:r.price,art:r.artworkUrl,url:r.tracks?.find(t=>t.previewUrl)?.previewUrl||null,kind:'Release',href:'/release/'+(r.slug||r.id)}))
  ].filter(x=>(genre==='All sounds'||x.genre.toLowerCase().includes(genre.toLowerCase()))&&(x.title+' '+x.artist+' '+x.genre).toLowerCase().includes(query.toLowerCase())),[beats,releases,genre,query]);

  function togglePlay(item:Item) {
    if(!item.url)return;
    if(playing===item.key){audioRef.current?.pause();setPlaying(null);return;}
    if(audioRef.current){audioRef.current.pause();audioRef.current.src=item.url;void audioRef.current.play().catch(()=>setPlaying(null));}
    setPlaying(item.key);setPlayingUrl(item.url);
  }

  const artistList = useMemo(()=>{
    const map = new Map<string,Artist>();
    artists.forEach(a=>{if(a.slug)map.set(a.slug,a)});
    [...beats,...releases].forEach(x=>{const a=x.artist;if(a?.slug&&!map.has(a.slug))map.set(a.slug,{name:a.name||'Artist',slug:a.slug,photoUrl:a.photoUrl});});
    return [...map.values()].slice(0,6);
  },[artists,beats,releases]);

  return <main className="vk-preview">
    <audio ref={audioRef} src={playingUrl||undefined} onEnded={()=>setPlaying(null)} onError={()=>setPlaying(null)} />
    <div className="vk-noise" aria-hidden="true"/>
    <header className="vk-header">
      <Link href="/" className="vk-brand"><span className="vk-brand-mark">V</span><span>vuka<span className="vk-brand-dot">.</span></span></Link>
      <nav className={menuOpen?'vk-nav vk-nav-open':'vk-nav'}><a href="#discover" onClick={()=>setMenuOpen(false)}>Discover</a><a href="#artists" onClick={()=>setMenuOpen(false)}>Artists</a><a href="#platform" onClick={()=>setMenuOpen(false)}>The platform</a></nav>
      <div className="vk-header-actions"><Link href="/auth/login" className="vk-login">Log in</Link><Link href="/auth/register" className="vk-cta vk-cta-small">Enter Vuka <ArrowRight size={15}/></Link></div>
      <button className="vk-menu-toggle" aria-label="Toggle navigation" onClick={()=>setMenuOpen(v=>!v)}>{menuOpen?<X/>:<Menu/>}</button>
    </header>
    <section className="vk-hero">
      <div className="vk-hero-copy">
        <motion.div className="vk-eyebrow" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}><span className="vk-live-dot"/> VUKA MUSIC · YOUR WORLD OF SOUND</motion.div>
        <motion.h1 initial={{opacity:0,y:24}} animate={{opacity:1,y:0}} transition={{duration:.6}}>Step inside<br/>the <span className="vk-gradient-text">sound.</span></motion.h1>
        <motion.p className="vk-hero-sub" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:.1}}>Discover independent music, connect with artists, and support the sound you believe in. The Vuka you know, reimagined as an immersive experience.</motion.p>
        <div className="vk-hero-actions"><a className="vk-cta" href="#discover">Explore the music <ArrowRight size={17}/></a><Link className="vk-quiet-link" href="/auth/register">I make music <ArrowRight size={16}/></Link></div>
        <div className="vk-proof-row"><div className="vk-avatar-stack"><span>V</span><span>M</span><span>+</span></div><p><strong>Real music. Real artists.</strong><br/>Connected to the Vuka catalogue.</p></div>
      </div>
      <div className="vk-hero-art" aria-label="Animated 3D-inspired vinyl visual"><div className="vk-orbit vk-orbit-one"/><div className="vk-orbit vk-orbit-two"/>
        <motion.div className="vk-floating-chip vk-chip-top" animate={{y:[0,-9,0],rotate:[-5,-2,-5]}} transition={{duration:5,repeat:Infinity,ease:'easeInOut'}}><AudioLines size={18}/><span>INDEPENDENT FREQUENCIES</span></motion.div>
        <motion.div className="vk-hero-record" animate={{rotate:360}} transition={{duration:36,repeat:Infinity,ease:'linear'}}><div className="vk-record-ring"><div className="vk-record-label"><span>VUKA</span><small>SIDE A · 33⅓ RPM</small></div></div></motion.div>
        <motion.div className="vk-floating-chip vk-chip-bottom" animate={{y:[0,8,0],rotate:[4,1,4]}} transition={{duration:4.2,repeat:Infinity,ease:'easeInOut'}}><span className="vk-chip-icon"><Headphones size={17}/></span><span><strong>Find your next sound</strong><small>Listen to real previews</small></span></motion.div>
        <div className="vk-hero-coordinate">BUILT FOR INDEPENDENT MUSIC <span>VUKA · SOUTH AFRICA</span></div>
      </div><a href="#discover" className="vk-scroll-cue"><span/> Scroll to enter</a>
    </section>
    <section className="vk-marquee"><div className="vk-marquee-track">{Array.from({length:2},(_,i)=><div className="vk-marquee-set" key={i}><span>REAL ARTISTS</span><Sparkles/><span>REAL RELEASES</span><Sparkles/><span>DIRECT FAN SUPPORT</span><Sparkles/><span>YOUR MUSIC JOURNEY</span><Sparkles/></div>)}</div></section>
    <section id="discover" className="vk-section vk-discover">
      <div className="vk-section-head"><div><p className="vk-kicker">FROM THE LIVE VUKA CATALOGUE</p><h2>Choose your <span className="vk-serif">next sound.</span></h2></div><Link href="/store" className="vk-text-link">Open full store <ArrowRight size={16}/></Link></div>
      <div className="vk-discovery-tools"><div className="vk-filter-list">{['All sounds','Hip Hop','Amapiano','Afrobeats','R&B','Trap'].map(g=><button key={g} onClick={()=>setGenre(g)} className={genre===g?'vk-filter active':'vk-filter'}>{g}</button>)}</div><label className="vk-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search real music and artists" aria-label="Search real music and artists"/></label></div>
      {loadError&&<p className="vk-demo-note">Some catalogue data could not be loaded. Open the store to retry.</p>}
      <div className="vk-release-grid"><AnimatePresence mode="popLayout">{items.map((item,i)=><motion.article layout key={item.key} className="vk-release-card" initial={{opacity:0,y:18}} animate={{opacity:1,y:0}} exit={{opacity:0,scale:.97}} transition={{duration:.25,delay:Math.min(i*.025,.2)}}>
        <div className="vk-card-art-wrap"><Cover src={item.art} title={item.title}/><span className="vk-release-tag">{item.kind.toUpperCase()}</span><button className="vk-play-button" aria-label={'Play preview '+item.title} disabled={!item.url} title={item.url?'Play available preview':'No public preview available'} onClick={()=>togglePlay(item)}>{playing===item.key?<AudioLines size={19}/>:<Play size={19} fill="currentColor"/>}</button></div>
        <div className="vk-release-meta"><div><p className="vk-release-genre">{item.genre}</p><h3>{item.title}</h3><p className="vk-release-artist">{item.artist}</p></div><span className="vk-price">{typeof item.price==='number'?'R'+item.price.toFixed(2):'View'}</span></div>
        <div className="vk-card-footer"><span><span className="vk-status-dot"/> {playing===item.key?'Playing preview':item.url?'Preview available':'Visit listing'}</span><Link href={item.href} aria-label={'View '+item.title}><ArrowRight size={16}/></Link></div>
      </motion.article>)}</AnimatePresence></div>
      {!items.length&&<div className="vk-empty-state">{query?'No matching live listings. Try another search.':'No active listings are available right now.'}</div>}
      <p className="vk-demo-note">Music, artists, artwork and pricing are requested from Vuka's existing store APIs. Only public preview audio is played here.</p>
    </section>
    <section id="artists" className="vk-artist-section"><div className="vk-section vk-artists-inner"><div className="vk-artist-copy"><p className="vk-kicker">THE PEOPLE BEHIND THE SOUND</p><h2>Meet the <span className="vk-serif">artists.</span></h2><p>Explore the artist profiles already on Vuka. Their existing pages, releases, and storefronts remain the source of truth.</p><Link href="/browse-artists" className="vk-cta">Browse all artists <ArrowRight size={16}/></Link></div><div className="vk-artist-list">{artistList.map((a,i)=><motion.div key={a.slug||a.name} className="vk-artist-row" whileHover={{x:7}} transition={{type:'spring',stiffness:300,damping:24}}><div className="vk-artist-avatar vk-violet" style={a.photoUrl?{backgroundImage:'url("'+a.photoUrl+'")',backgroundSize:'cover',backgroundPosition:'center'}:{}}>{!a.photoUrl&&a.name.slice(0,2).toUpperCase()}</div><div className="vk-artist-details"><strong>{a.name}</strong><span>{[a.city,...(a.genreTags||[]).slice(0,1)].filter(Boolean).join(' · ')||'Vuka artist'}</span></div><span className="vk-artist-number">0{i+1}</span><Link href={'/artist/'+a.slug} aria-label={'Discover '+a.name}><ArrowRight size={17}/></Link></motion.div>)}</div></div></section>
    <section id="platform" className="vk-section vk-how"><div className="vk-section-head"><div><p className="vk-kicker">SAME PLATFORM. NEW EXPERIENCE.</p><h2>Choose your <span className="vk-serif">side of Vuka.</span></h2></div><p className="vk-section-description">The interactive layer leads into the real tools you already use.</p></div><div className="vk-feature-grid">
      <article className="vk-feature-card vk-feature-main"><span className="vk-feature-icon"><Music2/></span><span className="vk-feature-index">01 / ARTISTS</span><h3>Your music.<br/>Your business.</h3><p>Manage uploads, releases, storefront, earnings, analytics, and artist tools.</p><Link href="/auth/login">Sign in to artist dashboard <ArrowRight size={15}/></Link><div className="vk-feature-disc"><Disc3 size={120}/></div></article>
      <article className="vk-feature-card vk-feature-fan"><span className="vk-feature-icon"><Heart/></span><span className="vk-feature-index">02 / FANS</span><h3>Find it.<br/>Support it.</h3><p>Discover music, follow artists, buy releases, and access your purchases.</p><Link href="/fan">Enter fan space <ArrowRight size={15}/></Link><div className="vk-feature-disc"><Users size={112}/></div></article>
      <article className="vk-feature-card vk-feature-industry"><span className="vk-feature-icon"><Zap/></span><span className="vk-feature-index">03 / INDUSTRY</span><h3>Discover<br/>what's next.</h3><p>Use Vuka's existing industry area and professional tools.</p><Link href="/industry">Explore industry <ArrowRight size={15}/></Link><div className="vk-feature-disc"><Sparkles size={108}/></div></article>
    </div><div className="vk-inside-links"><Link className="vk-cta" href="/preview-site/inside">Preview the inside experience <ArrowRight size={16}/></Link><Link className="vk-quiet-link" href="/dashboard">Open real dashboard <ArrowRight size={16}/></Link><Link className="vk-quiet-link" href="/settings">Account settings <ArrowRight size={16}/></Link></div></section>
    <section className="vk-plans"><div className="vk-plans-orb"/><div className="vk-plans-content"><p className="vk-kicker">YOUR ACCOUNT, YOUR JOURNEY</p><h2>Step into <span className="vk-serif">your Vuka.</span></h2><p>Explore the existing account experience without changing your account or its data.</p><div className="vk-plan-row"><div><span>01 / DISCOVER</span><h3>Fan</h3><p>Find music and support the artists you love.</p><strong>Explore <small>the store</small></strong><Link href="/fan">Open fan space →</Link></div><div className="vk-plan-featured"><span>02 / CREATE</span><h3>Artist</h3><p>Access uploads, releases, storefront, and earnings.</p><strong>Create <small>your catalogue</small></strong><Link href="/dashboard">Open dashboard →</Link></div><div><span>03 / CONNECT</span><h3>Industry</h3><p>Discover talent using Vuka's existing industry tools.</p><strong>Connect <small>on Vuka</small></strong><Link href="/industry-dashboard">Open industry →</Link></div></div><Link href="/auth/register" className="vk-cta">Create your Vuka account <ArrowRight size={16}/></Link></div></section>
    <footer className="vk-footer"><Link href="/preview-site" className="vk-brand"><span className="vk-brand-mark">V</span><span>vuka<span className="vk-brand-dot">.</span></span></Link><p>Vuka Music · Independent sound.</p><div><Link href="/store">Store</Link><Link href="/browse-artists">Artists</Link><Link href="/auth/login">Log in</Link><Link href="/support">Support</Link><span>© {new Date().getFullYear()} Vuka Music</span></div></footer>
  </main>;
}
