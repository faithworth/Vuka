// src/components/Footer.tsx
// Shared site footer. Always rendered — independent of CMS blocks —
// so the homepage never loses its footer regardless of which blocks
// an admin chooses on the CMS "landing" page.
import Link from 'next/link';

export default function Footer() {
  return (
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
          © {new Date().getFullYear()} Vuka · Made in South Africa
        </p>
      </div>
    </footer>
  );
}
