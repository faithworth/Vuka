'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, AudioLines, Disc3, Headphones, LockKeyhole, Music2 } from 'lucide-react';

export default function LoginPreview() {
  return <main className="vk-preview vk-auth-preview">
    <header className="vk-header"><Link href="/preview-site" className="vk-brand"><span className="vk-brand-mark">V</span><span>vuka<span className="vk-brand-dot">.</span></span></Link><Link href="/preview-site" className="vk-login"><ArrowLeft size={15}/> Back to experience</Link></header>
    <section className="vk-auth-stage">
      <div className="vk-auth-scene"><div className="vk-auth-scene-grid"/><div className="vk-auth-scene-orbit"/><div className="vk-auth-record"><div className="vk-auth-record-label"><Disc3 size={45}/><span>VUKA</span><small>YOUR SOUND. YOUR SPACE.</small></div></div><div className="vk-auth-float vk-auth-float-a"><AudioLines/><span>YOUR MUSIC JOURNEY</span></div><div className="vk-auth-float vk-auth-float-b"><Headphones/><span>INDEPENDENT SOUND</span></div><p>STEP BACK INTO YOUR WORLD.</p></div>
      <div className="vk-auth-panel"><p className="vk-kicker">WELCOME BACK</p><h1>Pick up where<br/>your <span className="vk-gradient-text">sound lives.</span></h1><p className="vk-auth-lede">Sign in through the real Vuka authentication page to access your account, music, purchases and artist tools.</p><div className="vk-auth-preview-note"><span className="vk-feature-icon"><LockKeyhole/></span><div><strong>Existing account security stays intact</strong><p>Password recovery, verification, two-factor authentication and role-based redirects remain handled by Vuka's actual login system.</p></div></div><Link href="/auth/login" className="vk-cta vk-auth-main-cta">Continue to secure login <ArrowRight size={17}/></Link><Link href="/auth/register" className="vk-auth-register">New to Vuka? <strong>Create an account</strong> <ArrowRight size={14}/></Link><div className="vk-auth-links"><Link href="/auth/forgot-password">Forgot password?</Link><span>Preview concept · No account data changed</span></div></div>
    </section>
    <footer className="vk-footer"><Link href="/preview-site" className="vk-brand"><span className="vk-brand-mark">V</span><span>vuka<span className="vk-brand-dot">.</span></span></Link><p>One platform. Many ways to rise.</p><div><Link href="/preview-site">Explore Vuka</Link><Link href="/support">Support</Link></div></footer>
  </main>;
}
