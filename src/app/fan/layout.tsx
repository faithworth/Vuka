// src/app/fan/layout.tsx — fan portal layout (no extra Navbar since fan/page.tsx includes it)
export default function FanLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <main>{children}</main>
    </div>
  );
}
