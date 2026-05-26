import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <div className="text-center">
        <div className="text-8xl mb-6">😬</div>
        <h1 className="text-4xl font-black mb-4" style={{ color: 'var(--text)' }}>Eish.</h1>
        <p className="text-xl mb-8" style={{ color: 'var(--text-muted)' }}>This page doesn&apos;t exist.</p>
        <div className="flex gap-4 justify-center">
          <Link href="/"
            className="px-6 py-3 rounded-xl font-bold text-white transition-all hover:scale-105"
            style={{ background: 'var(--red)' }}>
            Go Home
          </Link>
          <Link href="/store"
            className="px-6 py-3 rounded-xl font-bold border transition-all"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            Browse Store
          </Link>
        </div>
      </div>
    </div>
  );
}
