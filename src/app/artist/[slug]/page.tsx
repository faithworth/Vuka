import { Navbar } from '@/components/Navbar';
import { BeatCard } from '@/components/BeatCard';
import { notFound } from 'next/navigation';
import FollowButton from './FollowButton';

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
            <p style={{ color: 'var(--text-muted)' }}>{artist.city}{artist.city && artist.country ? ', ' : ''}{artist.country}</p>
            {artist.genreTags?.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {artist.genreTags.map((g: string) => (
                  <span key={g} className="text-xs px-2 py-1 rounded-full" style={{ background: 'var(--surface2)', color: 'var(--purple-light)' }}>{g}</span>
                ))}
              </div>
            )}
            {artist.bio && <p className="mt-3 max-w-xl" style={{ color: 'var(--text-muted)' }}>{artist.bio}</p>}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 md:flex-col md:items-stretch flex-shrink-0">
            <a href={`/support/${artist.slug}`}
              className="px-6 py-3 rounded-xl font-bold text-white text-center"
              style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>
              ♥ Support Artist
            </a>
            <FollowButton artistId={artist.id} artistName={artist.name} />
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-8 mb-8">
          {[
            { label: 'Beats', value: artist.beats?.length || 0 },
            { label: 'Releases', value: artist.releases?.length || 0 },
            { label: 'Supporters', value: artist.supportReceived?.length || 0 },
            { label: 'Followers', value: artist.followers?.length || 0 },
          ].map(s => (
            <div key={s.label}>
              <p className="text-xl font-bold" style={{ color: 'var(--text)' }}>{s.value}</p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
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
                    <p className="text-sm capitalize" style={{ color: 'var(--text-muted)' }}>{r.releaseType} · R{r.price}</p>
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Goals */}
        {artist.goals?.filter((g: any) => g.isActive).length > 0 && (
          <section className="mb-12">
            <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text)' }}>🎯 Support Goals</h2>
            <div className="space-y-4">
              {artist.goals.filter((g: any) => g.isActive).map((goal: any) => {
                const pct = Math.min(100, (goal.currentAmount / goal.targetAmount) * 100);
                return (
                  <div key={goal.id} className="p-5 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-bold" style={{ color: 'var(--text)' }}>{goal.title}</h3>
                        {goal.description && <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{goal.description}</p>}
                      </div>
                      {goal.deadline && (
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          Due {new Date(goal.deadline).toLocaleDateString('en-ZA')}
                        </span>
                      )}
                    </div>
                    <div className="h-3 rounded-full overflow-hidden my-3" style={{ background: 'var(--surface2)' }}>
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--purple), var(--purple-light))' }} />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold" style={{ color: 'var(--purple-light)' }}>
                        {goal.currency} {Number(goal.currentAmount).toFixed(2)} raised
                      </span>
                      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        {pct.toFixed(0)}% of {goal.currency} {Number(goal.targetAmount).toFixed(2)}
                      </span>
                    </div>
                    <a href={`/support/${artist.slug}`}
                      className="block mt-4 text-center py-2 rounded-xl font-bold text-sm text-white"
                      style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>
                      ♥ Contribute to this goal
                    </a>
                  </div>
                );
              })}
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
                    {s.message && <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>"{s.message}"</p>}
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
