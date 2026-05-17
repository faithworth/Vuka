'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { Menu, X, Music } from 'lucide-react';

export function Navbar() {
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

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
    <nav className="sticky top-0 z-50"
      style={{ background: 'rgba(10,10,8,0.92)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">

        {/* Logo — softer, premium */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--purple)' }}>
            <Music size={15} className="text-white" />
          </div>
          <span className="text-lg font-semibold tracking-tight" style={{ color: 'var(--text)' }}>
            Vuka
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6">
          {navLinks.map(l => (
            <Link key={l.href} href={l.href}
              className="text-sm font-medium transition-colors hover:text-white"
              style={{ color: 'var(--text-muted)' }}>
              {l.label}
            </Link>
          ))}
        </div>

        {/* Auth actions */}
        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <Link href="/dashboard"
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/auth/login"
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ color: 'var(--text-muted)' }}>
                Log In
              </Link>
              <Link href="/auth/register"
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                style={{ background: 'var(--purple)', color: 'white' }}>
                Get Started
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button className="md:hidden p-2 rounded-lg"
          style={{ color: 'var(--text-muted)' }}
          onClick={() => setMobileOpen(v => !v)}>
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden px-6 pb-6 flex flex-col gap-3" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="pt-4 flex flex-col gap-1">
            {navLinks.map(l => (
              <Link key={l.href} href={l.href}
                onClick={() => setMobileOpen(false)}
                className="py-2.5 px-3 rounded-lg text-sm font-medium transition-colors hover:bg-[var(--surface2)]"
                style={{ color: 'var(--text-muted)' }}>
                {l.label}
              </Link>
            ))}
          </div>
          <div className="pt-2 flex flex-col gap-2" style={{ borderTop: '1px solid var(--border)' }}>
            {user ? (
              <Link href="/dashboard" onClick={() => setMobileOpen(false)}
                className="py-2.5 px-3 rounded-lg text-sm font-medium"
                style={{ color: 'var(--text)' }}>
                Dashboard
              </Link>
            ) : (
              <>
                <Link href="/auth/login" onClick={() => setMobileOpen(false)}
                  className="py-2.5 px-3 rounded-lg text-sm font-medium"
                  style={{ color: 'var(--text-muted)' }}>
                  Log In
                </Link>
                <Link href="/auth/register" onClick={() => setMobileOpen(false)}
                  className="py-2.5 px-4 rounded-lg text-sm font-semibold text-white text-center"
                  style={{ background: 'var(--purple)' }}>
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}

export default Navbar;
