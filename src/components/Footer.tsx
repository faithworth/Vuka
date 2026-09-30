// src/components/Footer.tsx
import Link from 'next/link';
import VukaLogo from '@/components/brand/VukaLogo';

const col = (heading: string, links: { label: string; href: string; external?: boolean }[]) => (
  <div>
    <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>{heading}</p>
    <ul className="space-y-2.5">
      {links.map(l => (
        <li key={l.href}>
          <Link
            href={l.href}
            target={l.external ? '_blank' : undefined}
            rel={l.external ? 'noopener noreferrer' : undefined}
            className="text-sm transition-colors hover:text-[var(--sky)]"
            style={{ color: 'var(--text-muted)' }}
          >
            {l.label}
          </Link>
        </li>
      ))}
    </ul>
  </div>
);

export default function Footer() {
  return (
    <footer style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
      <div className="max-w-6xl mx-auto px-4 pt-14 pb-10">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10 mb-12">

          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="inline-flex items-center gap-2.5 mb-4">
              <VukaLogo size={28} animated={false} />
              <span className="font-bold text-sm" style={{ color: 'var(--text)' }}>Vuka Music</span>
            </Link>
            <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--text-muted)' }}>
              Africa's digital music store. We sell music, merch, and creator services — artists earn royalties, paid weekly.
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Made in South Africa 🇿🇦
            </p>
          </div>

          {col('Explore', [
            { label: 'Store', href: '/store' },
            { label: 'Events', href: '/events' },
            { label: 'Campaigns', href: '/campaigns' },
            { label: 'Services', href: '/services' },
            { label: 'Industry Portal', href: '/industry' },
            { label: 'Social Feed', href: '/social' },
          ])}

          {col('Artists', [
            { label: 'Start Selling', href: '/auth/register?role=artist' },
            { label: 'Artist Dashboard', href: '/dashboard' },
            { label: 'Pricing & Plans', href: '/#pricing' },
            { label: 'Beat Licensing', href: '/legal/terms#licensing' },
            { label: 'Royalty Schedule', href: '/legal/terms#royalties' },
          ])}

          {col('Support', [
            { label: 'Help Centre', href: '/support' },
            { label: 'Contact Us', href: 'mailto:support@vukamusic.com', external: true },
            { label: 'Re-download Portal', href: '/redownload' },
            { label: 'DMCA / Copyright', href: '/legal/dmca' },
            { label: 'Report an Issue', href: 'mailto:admin@vukamusic.com', external: true },
          ])}

          {col('Legal', [
            { label: 'Terms of Service', href: '/legal/terms' },
            { label: 'Privacy Policy', href: '/legal/privacy' },
            { label: 'Refund Policy', href: '/legal/refunds' },
            { label: 'Shipping Policy', href: '/legal/shipping' },
            { label: 'Acceptable Use', href: '/legal/acceptable-use' },
            { label: 'Artist Agreement', href: '/legal/artist-agreement' },
          ])}

        </div>

        {/* Bottom bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-8" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            © {new Date().getFullYear()} Vuka Music - The Rise Up (Pty) Ltd · All rights reserved
          </p>
          <div className="flex items-center gap-5">
            {[
              { label: 'Log In', href: '/auth/login' },
              { label: 'Sign Up', href: '/auth/register' },
              { label: 'Facebook', href: 'https://facebook.com/vukamusic', external: true },
              { label: 'Instagram', href: 'https://instagram.com/vukamusic', external: true },
            ].map(l => (
              <Link
                key={l.href}
                href={l.href}
                target={l.external ? '_blank' : undefined}
                rel={l.external ? 'noopener noreferrer' : undefined}
                className="text-xs transition-colors hover:text-[var(--sky)]"
                style={{ color: 'var(--text-muted)' }}
              >
                {l.label}
              </Link>
            ))}
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            <a href="mailto:accounts@vukamusic.com" className="hover:text-[var(--sky)] transition-colors">accounts@vukamusic.com</a>
          </p>
        </div>
      </div>
    </footer>
  );
}
