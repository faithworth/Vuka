import { Navbar } from '@/components/Navbar';
import { BeatCard } from '@/components/BeatCard';
import { notFound } from 'next/navigation';

async function getArtist(slug: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/artist/${slug}`, { next: { revalidate: 60 } });
  if (!res.ok) return null;
  return res.json();
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const artist = await getArtist(params.slug);
  if (!artist) return { title: 'Artist not found' };
  return {
    title: `${artist.name} on Vuka — Buy beats & music`,
    description: `${artist.bio || ''} ${artist.genreTags?.join(', ')}`.trim(),
    openGraph: {
      title: `${artist.name} on Vuka — Buy beats & music`,
      description: `Shop now on Vuka`,
      images: artist.coverUrl ? [artist.coverUrl] : [],
    },
  };
}

export default async function ArtistProfilePage({ params }: { params: { slug: string } }) {
  const artist = await getArtist(params.slug);
  if (!artist) notFound();

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      {/* Cover */}
      <div className="relative h-48 md:h-72 overflow-hidden" style={{ background: 'var(--surface2)' }}>
        {artist.coverUrl && <img src={artist.coverUrl} alt="" className="w-full h-full object-cover" />}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent, var(--bg))' }} />
      </div>

      {/* Profile header */}
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex flex-col md:flex-row items-start gap-6 -mt-16 mb-8 relative z-10">
          <div className="w-28 h-28 rounded-2xl overflow-hidden flex-shrink-0 border-4" style={{ borderColor: 'var(--bg)' }}>
            {artist.photoUrl
              ? <img src={artist.photoUrl} alt={artist.name} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-4xl" style={{ background: 'var(--surface2)' }}>🎤</div>}
          </div>
          <div className="flex-1 pt-16 md:pt-12">
            <h1 className="text-3xl font-black" style={{ color: 'var(--text)' }}>{artist.name}</h1>
            <p style={{ color: 'var(--muted)' }}>{artist.city}{artist.city && artist.country ? ', ' : ''}{artist.country}</p>
            {artist.genreTags?.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {artist.genreTags.map((g: string) => (
                  <span key={g} className="text-xs px-2 py-1 rounded-full" style={{ background: 'var(--surface2)', color: 'var(--purple-light)' }}>{g}</span>
                ))}
              </div>
            )}
            {artist.bio && <p className="mt-3 max-w-xl" style={{ color: 'var(--muted)' }}>{artist.bio}</p>}
          </div>
          <a href={`/support/${artist.slug}`} className="px-6 py-3 rounded-xl font-bold text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>
            ♥ Support Artist
          </a>
        </div>

        {/* Stats */}
        <div className="flex gap-8 mb-8">
          {[
            { label: 'Beats', value: artist.beats?.length || 0 },
            { label: 'Releases', value: artist.releases?.length || 0 },
            { label: 'Supporters', value: artist.supportReceived?.length || 0 },
          ].map(s => (
            <div key={s.label}>
              <p className="text-xl font-bold" style={{ color: 'var(--text)' }}>{s.value}</p>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Beats */}
        {artist.beats?.length > 0 && (
          <section className="mb-12">
            <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text)' }}>Beats</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {artist.beats.map((beat: any) => <BeatCard key={beat.id} beat={{ ...beat, artist: { name: artist.name, slug: artist.slug } }} />)}
            </div>
          </section>
        )}

        {/* Releases */}
        {artist.releases?.length > 0 && (
          <section className="mb-12">
            <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text)' }}>Releases</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {artist.releases.map((r: any) => (
                <a key={r.id} href={`/release/${r.slug}`} className="rounded-2xl overflow-hidden hover:scale-[1.02] transition-transform block" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="aspect-square overflow-hidden">
                    {r.artworkUrl ? <img src={r.artworkUrl} alt={r.title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-4xl" style={{ background: 'var(--surface2)' }}>🎶</div>}
                  </div>
                  <div className="p-4">
                    <p className="font-bold truncate" style={{ color: 'var(--text)' }}>{r.title}</p>
                    <p className="text-sm capitalize" style={{ color: 'var(--muted)' }}>{r.releaseType} · R{r.price}</p>
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Support wall */}
        {artist.supportReceived?.length > 0 && (
          <section className="mb-12">
            <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text)' }}>Your Riders ♥</h2>
            <div className="space-y-3">
              {artist.supportReceived.map((s: any, i: number) => (
                <div key={i} className="flex items-start gap-4 p-4 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0" style={{ background: 'var(--surface2)' }}>🎤</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold" style={{ color: 'var(--text)' }}>{s.fanName}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface2)', color: 'var(--gold)' }}>{s.tier}</span>
                    </div>
                    {s.message && <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>"{s.message}"</p>}
                  </div>
                  <span className="font-bold" style={{ color: 'var(--green)' }}>{s.currency} {s.amount}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
