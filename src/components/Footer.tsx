// src/components/Footer.tsx
// Shared site footer. Always rendered — independent of CMS blocks —
// so the homepage never loses its footer regardless of which blocks
// an admin chooses on the CMS "landing" page.
import Link from 'next/link';
import VukaLogo from '@/components/brand/VukaLogo';

export default function Footer() {
  return (
    <footer className="py-10 px-4" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
      <div className="max-w-6xl mx-auto flex flex-col items-center gap-6 md:flex-row md:justify-between">
        <div className="flex items-center gap-3">
          <VukaLogo size={26} animated={false} />
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>African music. Your money. Your terms.</span>
        </div>
        <div className="w-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-8 gap-y-6 text-sm" style={{ color: 'var(--text-muted)' }}>
          <div className="flex flex-col gap-2">
            <p className="font-bold" style={{ color: 'var(--text)' }}>Store</p>
            <Link href="/store">Store Home</Link>
            <Link href="/store/beats">Beats</Link>
            <Link href="/store/releases">Releases</Link>
            <Link href="/store/videos">Videos</Link>
            <Link href="/store/samples">Samples</Link>
            <Link href="/store/merch">Merch</Link>
            <Link href="/store/memberships">Memberships</Link>
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-bold" style={{ color: 'var(--text)' }}>Discover</p>
            <Link href="/discover">Discover</Link>
            <Link href="/feed">Feed</Link>
            <Link href="/reels">Reels</Link>
            <Link href="/artists">Artists</Link>
            <Link href="/browse-artists">Browse Artists</Link>
            <Link href="/awards">Awards</Link>
            <Link href="/events">Events</Link>
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-bold" style={{ color: 'var(--text)' }}>Work With Vuka</p>
            <Link href="/industry">For Industry</Link>
            <Link href="/services">Services</Link>
            <Link href="/marketplace">Marketplace</Link>
            <Link href="/campaigns">Campaigns</Link>
            <Link href="/support">Artist Support</Link>
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-bold" style={{ color: 'var(--text)' }}>Account</p>
            <Link href="/auth/login">Log In</Link>
            <Link href="/auth/register">Sign Up</Link>
            <Link href="/fan">My Library</Link>
            <Link href="/dashboard/purchases">Purchases</Link>
            <Link href="/messages">Messages</Link>
            <Link href="/notifications">Notifications</Link>
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-bold" style={{ color: 'var(--text)' }}>Legal & Help</p>
            <Link href="/legal/terms">Terms</Link>
            <Link href="/legal/privacy">Privacy</Link>
            <Link href="/legal/dmca">DMCA</Link>
            <Link href="/legal/refunds">Refunds</Link>
            <Link href="/legal/shipping">Shipping</Link>
            <Link href="/legal/acceptable-use">Acceptable Use</Link>
            <Link href="/legal/artist-agreement">Artist Agreement</Link>
          </div>
        </div>
        <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
          © {new Date().getFullYear()} Vuka Music · Made in South Africa
        </p>
      </div>
    </footer>
  );
}
