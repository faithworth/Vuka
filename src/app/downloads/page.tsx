import { Monitor, Apple, Smartphone, ArrowDownToLine, ShieldCheck, ExternalLink, LockKeyhole } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const downloads = [
  {
    icon: Monitor,
    title: 'Windows',
    subtitle: 'Vuka Music for Windows 10/11',
    description: 'Branded Vuka Music desktop app for Windows PCs.',
    href: '/api/app-download/windows',
    label: 'Download for Windows',
    status: 'Available now — unsigned',
  },
  {
    icon: Apple,
    title: 'macOS',
    subtitle: 'Vuka Music for Mac',
    description: 'Universal Vuka Music desktop app for Apple Silicon and Intel Macs.',
    href: '/api/app-download/mac',
    label: 'Download for Mac',
    status: 'Available now — unsigned',
  },
  {
    icon: Smartphone,
    title: 'Android',
    subtitle: 'Vuka Music for Android',
    description: 'Vuka Music APK for direct installation on Android devices.',
    href: '/api/app-download/android',
    label: 'Download Android APK',
    status: 'Available now',
  },
];

export default function DownloadsPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen px-4 py-16" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
        <div className="max-w-6xl mx-auto">
          <header className="max-w-3xl mx-auto text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold mb-5"
              style={{ color: 'var(--green)', background: 'rgba(160,232,124,0.08)', border: '1px solid rgba(160,232,124,0.18)' }}>
              <LockKeyhole size={13} /> AVAILABLE RELEASES
            </div>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-4">Download Vuka Music.</h1>
            <p className="text-base sm:text-lg" style={{ color: 'var(--text-muted)' }}>
              Official Vuka Music applications for Windows, Mac and Android. The current downloadable desktop release is unsigned; signed production builds will replace it when available.
            </p>
          </header>

          <div className="grid md:grid-cols-3 gap-5">
            {downloads.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="rounded-3xl p-6 flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6"
                    style={{ background: '#0A0A0A', border: '1px solid rgba(160,232,124,0.18)', color: 'var(--green)' }}>
                    <Icon size={26} />
                  </div>
                  <h2 className="text-2xl font-bold mb-1">{item.title}</h2>
                  <p className="text-sm font-semibold mb-3" style={{ color: 'var(--green)' }}>{item.subtitle}</p>
                  <p className="text-sm leading-6 mb-6" style={{ color: 'var(--text-muted)' }}>{item.description}</p>
                  <div className="inline-flex items-center gap-2 text-xs font-semibold mb-5" style={{ color: 'var(--green)' }}>
                    <ShieldCheck size={15} /> {item.status}
                  </div>
                  <a href={item.href}
                    className="mt-auto inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl font-bold text-black"
                    style={{ background: 'var(--green)' }}>
                    <ArrowDownToLine size={17} /> {item.label}
                  </a>
                </article>
              );
            })}
          </div>

          <section className="max-w-4xl mx-auto mt-10 rounded-3xl p-6 sm:p-8" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex gap-4">
              <Apple className="flex-shrink-0 mt-1" size={22} style={{ color: 'var(--green)' }} />
              <div>
                <h2 className="font-bold text-lg mb-2">iPhone & iPad</h2>
                <p className="text-sm leading-6 mb-4" style={{ color: 'var(--text-muted)' }}>
                  The Vuka Music iPhone/iPad app is being prepared as a signed App Store/TestFlight release. Apple requires a valid Apple Developer signing identity and provisioning for physical-device distribution.
                </p>
                <a href="https://github.com/faithworth/Vuka/releases/tag/v1.0.1"
                  className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--green)' }}>
                  View Vuka release status <ExternalLink size={14} />
                </a>
              </div>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
