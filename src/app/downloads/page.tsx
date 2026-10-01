import Link from 'next/link';
import { Monitor, Apple, Smartphone, ArrowDownToLine, ShieldCheck, ExternalLink } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const downloads = [
  { icon: Monitor, title: 'Windows', subtitle: 'Vuka Music for Windows 10/11', description: 'Desktop app for Windows PCs.', href: 'https://github.com/faithworth/Vuka/releases/download/v1.0.1/Vuka-Music-Windows.exe', label: 'Download for Windows', note: 'Current build is unsigned. Windows SmartScreen may show a warning until code signing is added.' },
  { icon: Apple, title: 'macOS', subtitle: 'Vuka Music for Mac', description: 'Universal desktop app for Apple Silicon and Intel Macs.', href: 'https://github.com/faithworth/Vuka/releases/download/v1.0.1/Vuka-Music-macOS.dmg', label: 'Download for Mac', note: 'Current build is unsigned/notarized. macOS may require confirmation in Privacy & Security.' },
  { icon: Smartphone, title: 'Android', subtitle: 'Vuka Music for Android', description: 'Install the current Android APK directly on your device.', href: 'https://github.com/faithworth/Vuka/releases/download/v1.0.1/Vuka-Music-Android.apk', label: 'Download Android APK', note: 'Current build is a test APK. Google Play production signing is the next release step.' },
];

export default function DownloadsPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen px-4 py-16" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
        <div className="max-w-6xl mx-auto">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <p className="text-sm font-bold uppercase tracking-[0.18em] mb-3" style={{ color: 'var(--green)' }}>Vuka Music Apps</p>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-4">Take Vuka Music with you.</h1>
            <p className="text-base sm:text-lg" style={{ color: 'var(--text-muted)' }}>
              Download Vuka Music for your computer or Android phone. The apps connect directly to your Vuka Music account and the same production platform at vukamusic.com.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {downloads.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="rounded-3xl p-6 flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5" style={{ background: 'rgba(160,232,124,0.1)', color: 'var(--green)' }}><Icon size={24} /></div>
                  <h2 className="text-2xl font-bold mb-1">{item.title}</h2>
                  <p className="text-sm font-semibold mb-3" style={{ color: 'var(--green)' }}>{item.subtitle}</p>
                  <p className="text-sm leading-6 mb-6" style={{ color: 'var(--text-muted)' }}>{item.description}</p>
                  <a href={item.href} className="mt-auto inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-black" style={{ background: 'var(--green)' }}>
                    <ArrowDownToLine size={17} />{item.label}
                  </a>
                  <p className="text-xs leading-5 mt-4" style={{ color: 'var(--text-muted)' }}>{item.note}</p>
                </article>
              );
            })}
          </div>
          <section className="max-w-4xl mx-auto mt-10 rounded-3xl p-6 sm:p-8" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex gap-4">
              <ShieldCheck className="flex-shrink-0 mt-1" size={22} style={{ color: 'var(--green)' }} />
              <div>
                <h2 className="font-bold text-lg mb-2">iPhone & iPad</h2>
                <p className="text-sm leading-6 mb-4" style={{ color: 'var(--text-muted)' }}>
                  The iPhone/iPad app has been built and tested as an iOS simulator build. A physical-device release requires Apple signing and App Store/TestFlight distribution, which is being prepared separately.
                </p>
                <a href="https://github.com/faithworth/Vuka/releases/tag/v1.0.1" className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--green)' }}>
                  View Vuka releases <ExternalLink size={14} />
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
