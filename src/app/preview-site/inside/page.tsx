'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, BarChart3, Disc3, Headphones, Heart, LayoutDashboard, Music2, Settings, ShoppingBag, Upload, Wallet } from 'lucide-react';

export default function InsidePreview() {
  const [loading,setLoading] = useState(true);
  const [session,setSession] = useState(false);
  const [stats,setStats] = useState<any>(null);
  useEffect(()=>{
    fetch('/api/dashboard/stats').then(r=>{setSession(r.ok);return r.ok?r.json():null}).then(data=>{setStats(data);setLoading(false)}).catch(()=>setLoading(false));
  },[]);
  const modules = [
    {title:'Dashboard',desc:'Your Vuka overview and setup checklist',href:'/dashboard',icon:LayoutDashboard},
    {title:'Upload music',desc:'Manage uploads and your music catalogue',href:'/dashboard/uploads',icon:Upload},
    {title:'Releases',desc:'Your published and upcoming releases',href:'/dashboard/releases',icon:Disc3},
    {title:'Analytics',desc:'Review plays and performance data',href:'/dashboard/analytics',icon:BarChart3},
    {title:'Earnings & payouts',desc:'Your actual earnings and payout pages',href:'/dashboard/earnings',icon:Wallet},
    {title:'Storefront',desc:'Manage how fans discover your work',href:'/dashboard/storefront',icon:ShoppingBag},
    {title:'Account settings',desc:'Profile, account and preferences',href:'/dashboard/settings',icon:Settings},
    {title:'Fan experience',desc:'Discover and support music on Vuka',href:'/fan',icon:Headphones},
    {title:'Community',desc:'The existing Vuka social feed',href:'/feed',icon:Heart}
  ];
  return <main className="vk-preview" style={{minHeight:'100vh'}}>
    <header className="vk-header"><Link href="/preview-site" className="vk-brand"><span className="vk-brand-mark">V</span><span>vuka<span className="vk-brand-dot">.</span></span></Link><nav className="vk-nav" style={{display:'flex'}}><Link href="/preview-site">Outside Vuka</Link><Link href="/store">Live store</Link></nav><div className="vk-header-actions"><Link href="/auth/login" className="vk-login">Log in</Link><Link href="/dashboard" className="vk-cta vk-cta-small">Open real dashboard <ArrowRight size={15}/></Link></div></header>
    <section className="vk-section vk-inside-page">
      <p className="vk-kicker">INSIDE VUKA · ACCOUNT EXPERIENCE</p><h1 className="vk-inside-title">Your music world.<br/><span className="vk-gradient-text">One control room.</span></h1>
      <p className="vk-hero-sub" style={{maxWidth:700}}>A designed entry point to Vuka's existing authenticated areas. Choose a module to open its real page; private account data is never fabricated in this concept.</p>
      {loading?<p className="vk-demo-note">Checking existing account routes…</p>:<div className="vk-inside-session"><strong>Explore your real Vuka account</strong><p>{session?'Your dashboard endpoint responded. Open the dashboard to view your role-specific account.':'Sign in first to access private dashboard information and account tools.'}</p><Link className="vk-cta" href={session?'/dashboard':'/auth/login'}>{session?'Enter dashboard':'Log in to Vuka'} <ArrowRight size={16}/></Link></div>}
      <div className="vk-feature-grid vk-module-grid">{modules.map((item,i)=>{const Icon=item.icon;return <Link key={item.href} href={item.href} className={'vk-feature-card '+(i%3===0?'vk-feature-main':i%3===1?'vk-feature-fan':'vk-feature-industry')} style={{textDecoration:'none',minHeight:220}}><span className="vk-feature-icon"><Icon/></span><span className="vk-feature-index">0{i+1} / VUKA MODULE</span><h3>{item.title}</h3><p>{item.desc}</p><span className="vk-module-enter">Enter module <ArrowRight size={15}/></span></Link>})}</div>
      <p className="vk-demo-note">This is a navigation/design preview, not a replacement for the authenticated pages. Existing login, role checks and permissions remain in control.</p>
    </section>
    <footer className="vk-footer"><Link href="/preview-site" className="vk-brand"><span className="vk-brand-mark">V</span><span>vuka<span className="vk-brand-dot">.</span></span></Link><p>Explore the real Vuka platform.</p><div><Link href="/preview-site">Public experience</Link><Link href="/auth/login">Login</Link><Link href="/support">Support</Link></div></footer>
  </main>;
}
