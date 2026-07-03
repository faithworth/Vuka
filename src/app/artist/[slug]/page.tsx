import { Navbar } from '@/components/Navbar';
import { Instagram, Twitter, Youtube, Music2, Radio } from 'lucide-react';
import { notFound } from 'next/navigation';
import FollowButton from './FollowButton';
import ArtistTabs from './ArtistTabs';
import { VerifiedBadge } from '@/components/VerifiedBadge';

async function getArtist(slug: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/artist/${slug}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const artist = await getArtist(params.slug);
  if (!artist) return { title: 'Artist not found' };
  return {
    title: `${artist.name} on Vuka Music — Buy beats & music`,
    description: `${artist.storefront?.tagline || artist.bio || ''} ${artist.genreTags?.join(', ')}`.trim(),
    openGraph: {
      title: `${artist.name} on Vuka Music — Buy beats & music`,
      description: `Shop now on Vuka Music`,
      images: artist.coverUrl ? [artist.coverUrl] : [],
    },
  };
}

export default async function ArtistProfilePage({ params }: { params: { slug: string } }) {
  const artist = await getArtist(params.slug);
  if (!artist) notFound();

  // Accent colour from storefront (falls back to sky blue)
  const accent = artist.storefront?.accentColor || 'var(--sky)';

  // Total release count = store releases + distribution releases
  const totalReleases =
    (artist.releases?.length || 0) + (artist.distributionReleases?.length || 0);

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />

      {/* Cover */}
      <div className="relative h-52 md:h-72 overflow-hidden" style={{ background: 'var(--surface2)' }}>
        {artist.coverUrl && <img src={artist.coverUrl} alt="" className="w-full h-full object-cover" />}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 30%, var(--bg) 100%)' }} />
      </div>

      {/* Profile header */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        {/* Avatar + name row — avatar overlaps cover */}
        <div className="flex flex-col md:flex-row md:items-end gap-4 -mt-16 md:-mt-20 mb-5 relative z-10">
          <div className="w-32 h-32 md:w-36 md:h-36 rounded-2xl overflow-hidden flex-shrink-0 shadow-xl" style={{ border: '4px solid var(--bg)' }}>
            {artist.photoUrl
              ? <img src={artist.photoUrl} alt={artist.name} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-5xl" style={{ background: 'var(--surface2)' }}>🎤</div>}
          </div>

          <div className="flex-1 min-w-0 pb-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl md:text-4xl font-black leading-none" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>{artist.name}</h1>
              {artist.isVerified && <VerifiedBadge size={28} />}
            </div>
            {(artist.city || artist.country) && (
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                {artist.city}{artist.city && artist.country ? ', ' : ''}{artist.country}
              </p>
            )}
            {artist.storefront?.tagline && (
              <p className="mt-1 text-sm font-semibold" style={{ color: accent }}>{artist.storefront.tagline}</p>
            )}
            {artist.genreTags?.length > 0 && (
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {artist.genreTags.map((g: string) => (
                  <span key={g} className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: 'var(--surface2)', color: accent }}>{g}</span>
                ))}
              </div>
            )}
          </div>

          {/* Action buttons — pinned top-right on desktop */}
          <div className="flex flex-row md:flex-col gap-2 md:items-stretch flex-shrink-0 pb-1">
            <a href={`/support/${artist.slug}`}
              className="px-5 py-2.5 rounded-xl font-bold text-white text-center text-sm whitespace-nowrap"
              style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', boxShadow: '0 4px 14px rgba(245,158,11,0.3)' }}>
              ♥ Support
            </a>
            <FollowButton artistId={artist.id} artistName={artist.name} />
          </div>
        </div>

        {/* Bio */}
        {(artist.storefront?.bioLong || artist.bio) && (
          <p className="max-w-2xl text-sm leading-relaxed mb-4" style={{ color: 'var(--text-muted)' }}>
            {artist.storefront?.bioLong || artist.bio}
          </p>
        )}

        {/* Social links */}
        {(() => {
          const links = artist.socialLinks || artist.storefront?.socialLinks || {};
          const icons: Record<string, any> = {
            instagram: { icon: Instagram, label: 'Instagram', base: 'https://instagram.com/' },
            twitter:   { icon: Twitter,   label: 'Twitter',   base: 'https://twitter.com/' },
            youtube:   { icon: Youtube,   label: 'YouTube',   base: '' },
            spotify:   { icon: Music2,    label: 'Spotify',   base: '' },
            soundcloud:{ icon: Radio,     label: 'SoundCloud',base: '' },
          };
          const entries = Object.entries(links).filter(([, v]) => v);
          if (!entries.length) return null;
          return (
            <div className="flex gap-2 mb-5 flex-wrap">
              {entries.map(([platform, url]: [string, any]) => {
                const cfg = icons[platform];
                if (!cfg) return null;
                const href = url.startsWith('http') ? url : `${cfg.base}${url}`;
                const Icon = cfg.icon;
                return (
                  <a key={platform} href={href} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium hover:opacity-80 transition-opacity"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    <Icon size={13} />
                    {cfg.label}
                  </a>
                );
              })}
            </div>
          );
        })()}

        {/* Stats row */}
        <div className="flex gap-0 mb-8 rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {[
            { label: 'Beats',      value: artist.beats?.length || 0 },
            { label: 'Releases',   value: totalReleases },
            { label: 'Supporters', value: artist.supportReceived?.length || 0 },
            { label: 'Followers',  value: artist.followers?.length || 0 },
          ].map((s, i, arr) => (
            <div key={s.label} className="flex-1 py-4 text-center" style={{ borderRight: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <p className="text-xl font-black" style={{ color: 'var(--text)' }}>{s.value}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabbed: Beats / Releases / Posts */}
        <ArtistTabs artist={artist} />

        {/* Campaigns — crowdfunding projects this artist is currently running */}
        {(() => {
          const now = new Date();
          const liveCampaigns = (artist.campaigns || []).filter((c: any) => c.status === 'active' || c.status === 'funded');
          if (!liveCampaigns.length) return null;
          return (
          <section className="mb-12">
            <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text)' }}>🎯 Campaigns</h2>
            <div className="space-y-4">
              {liveCampaigns.map((campaign: any) => {
                const pct = Math.min(100, (campaign.currentAmount / campaign.targetAmount) * 100);
                const daysLeft = Math.max(0, Math.ceil((new Date(campaign.deadline).getTime() - now.getTime()) / 86400000));
                const backerCount = campaign._count?.backers ?? campaign.backerCount ?? 0;
                return (
                  <div key={campaign.id} className="p-5 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-bold" style={{ color: 'var(--text)' }}>{campaign.title}</h3>
                        {campaign.description && <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{campaign.description}</p>}
                      </div>
                      {campaign.status === 'active' ? (
                        <span className="text-xs px-2 py-1 rounded-full flex-shrink-0 ml-3"
                          style={{
                            background: daysLeft <= 7 ? 'rgba(239,68,68,0.1)' : 'var(--surface2)',
                            color: daysLeft <= 7 ? '#ef4444' : 'var(--text-muted)',
                          }}>
                          {daysLeft === 0 ? 'Last day!' : `${daysLeft}d left`}
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-1 rounded-full flex-shrink-0 ml-3" style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--green)' }}>
                          ✓ Funded
                        </span>
                      )}
                    </div>
                    <div className="h-2.5 rounded-full overflow-hidden my-3" style={{ background: 'var(--surface2)' }}>
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: accent }} />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold" style={{ color: accent }}>
                        {campaign.currency} {Number(campaign.currentAmount).toFixed(2)} raised
                      </span>
                      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        {pct.toFixed(0)}% of {campaign.currency} {Number(campaign.targetAmount).toFixed(2)} · {backerCount} backers
                      </span>
                    </div>
                    <a href={`/campaigns/${campaign.slug}`}
                      className="block mt-4 text-center py-2 rounded-xl font-bold text-sm text-white"
                      style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>
                      🎯 Back this campaign
                    </a>
                  </div>
                );
              })}
            </div>
          </section>
          );
        })()}

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

      <div className="mt-4 mb-10 text-center">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Vuka Music retains {artist.platformFeePct ?? 15}% of each sale to cover platform costs. The artist receives {artist.artistSharePct ?? 85}%.
        </p>
      </div>
    </div>
  );
}
