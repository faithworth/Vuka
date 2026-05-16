'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { Menu, X } from 'lucide-react';

export function Navbar() {
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showFeeInfo, setShowFeeInfo] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const navLinks = [
    { href: '/store', label: 'Store' },
    { href: '/store/beats', label: 'Beats' },
    { href: '/store/releases', label: 'Releases' },
  ];

  return (
    <nav className="sticky top-0 z-50" style={{ background: 'rgba(13,11,20,0.95)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <Link href="/" className="text-2xl font-black tracking-widest flex items-center gap-1" style={{ color: 'var(--accent, #c8f53a)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.15em' }}>
          <span style={{ fontSize: '0.75em' }}>▲</span>VUKA
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6">
          {navLinks.map(l => (
            <Link key={l.href} href={l.href} style={{ color: 'var(--text-muted)' }} className="hover:text-white transition-colors text-sm font-medium">
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <Link href="/dashboard" className="px-4 py-2 rounded-lg font-medium text-sm transition-colors" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/auth/login" className="px-4 py-2 rounded-lg font-medium text-sm" style={{ color: 'var(--text-muted)' }}>Log In</Link>
              <Link href="/auth/register" className="px-4 py-2 rounded-lg font-bold text-sm" style={{ background: 'var(--accent, #c8f53a)', color: '#0a0a08' }}>
                Sign Up
              </Link>
            </>
          )}
        </div>

        {/* Mobile menu button */}
        <button className="md:hidden p-2 rounded-lg" style={{ color: 'var(--text-muted)' }} onClick={() => setMobileOpen(v => !v)}>
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="md:hidden px-6 pb-6 flex flex-col gap-4" style={{ borderTop: '1px solid var(--border)' }}>
          {navLinks.map(l => (
            <Link key={l.href} href={l.href} onClick={() => setMobileOpen(false)} style={{ color: 'var(--text-muted)' }} className="py-2 font-medium hover:text-white transition-colors">
              {l.label}
            </Link>
          ))}
          <hr style={{ borderColor: 'var(--border)' }} />
          {user ? (
            <Link href="/dashboard" onClick={() => setMobileOpen(false)} className="py-2 font-medium" style={{ color: 'var(--text)' }}>Dashboard</Link>
          ) : (
            <>
              <Link href="/auth/login" onClick={() => setMobileOpen(false)} className="py-2 font-medium" style={{ color: 'var(--text-muted)' }}>Log In</Link>
              <Link href="/auth/register" onClick={() => setMobileOpen(false)} className="px-4 py-2 rounded-lg font-bold text-sm text-white text-center" style={{ background: 'linear-gradient(135deg,var(--purple),#5b21b6)' }}>
                Sign Up
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}

export default Navbar;
