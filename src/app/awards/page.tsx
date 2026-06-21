'use client';
import { useEffect, useState } from 'react';
import { Loader2, Trophy, ThumbsUp, Check } from 'lucide-react';

export default function AwardsPage() {
  const [awards,  setAwards]  = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [voted,   setVoted]   = useState<Record<string, boolean>>({});
  const [voting,  setVoting]  = useState<string | null>(null);
  const [error,   setError]   = useState('');

  useEffect(() => {
    fetch('/api/awards').then(r => r.json()).then(d => { setAwards(d.awards ?? []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function vote(nominationId: string) {
    setError(''); setVoting(nominationId);
    try {
      const res = await fetch('/api/awards/vote', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ nominationId }) });
      const d = await res.json();
      if (d.ok) {
        setVoted(v => ({ ...v, [nominationId]: d.voted }));
        setAwards(aw => aw.map(award => ({
          ...award,
          categories: award.categories.map((cat: any) => ({
            ...cat,
            nominations: cat.nominations.map((nom: any) =>
              nom.id === nominationId ? { ...nom, voteCount: nom.voteCount + (d.voted ? 1 : -1) } : nom
            ),
          })),
        })));
      } else setError(d.error ?? 'Failed to vote');
    } catch { setError('Network error'); }
    setVoting(null);
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background:'var(--bg)' }}><Loader2 size={24} className="animate-spin" style={{ color:'var(--text-muted)' }}/></div>;

  return (
    <div className="min-h-screen pb-20" style={{ background:'var(--bg)' }}>
      <div className="max-w-3xl mx-auto px-4 pt-12">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background:'rgba(212,160,0,0.12)', border:'1px solid rgba(212,160,0,0.25)' }}><Trophy size={22} style={{ color:'var(--gold)' }}/></div>
          <div>
            <h1 className="text-3xl font-black" style={{ color:'var(--text)' }}>Vuka Music Awards</h1>
            <p className="text-sm" style={{ color:'var(--text-muted)' }}>Vote for your favourite South African artists</p>
          </div>
        </div>
        {error && <div className="my-4 text-sm p-3 rounded-xl" style={{ background:'rgba(248,113,113,0.1)', color:'#f87171' }}>{error}</div>}

        {awards.length === 0 ? (
          <div className="text-center py-20"><Trophy size={40} className="mx-auto mb-4" style={{ color:'var(--text-muted)', opacity:0.3 }}/><p style={{ color:'var(--text-muted)' }}>No active awards yet. Check back soon.</p></div>
        ) : awards.map(award => (
          <div key={award.id} className="mt-10">
            <div className="mb-6">
              {award.coverUrl && <img src={award.coverUrl} alt={award.title} className="w-full h-40 object-cover rounded-2xl mb-4"/>}
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-black" style={{ color:'var(--text)' }}>{award.title}</h2>
                <span className="text-xs font-bold px-3 py-1 rounded-full capitalize" style={{ background:'rgba(212,160,0,0.15)', color:'var(--gold)' }}>{award.status.replace('_',' ')}</span>
              </div>
              {award.description && <p className="text-sm mt-1" style={{ color:'var(--text-muted)' }}>{award.description}</p>}
            </div>
            <div className="space-y-8">
              {award.categories.map((cat: any) => (
                <div key={cat.id}>
                  <h3 className="text-sm font-black mb-3 uppercase tracking-wider" style={{ color:'var(--text-muted)' }}>{cat.name}</h3>
                  <div className="space-y-2">
                    {cat.nominations.map((nom: any) => {
                      const isVoted    = voted[nom.id] ?? false;
                      const isVoting   = voting === nom.id;
                      const votingOpen = award.status === 'voting_open';
                      const isWinner   = nom.isWinner;
                      return (
                        <div key={nom.id} className="flex items-center justify-between p-4 rounded-2xl" style={{ background: isWinner ? 'rgba(212,160,0,0.1)' : 'var(--surface)', border:`1px solid ${isWinner ? 'rgba(212,160,0,0.3)' : 'var(--border)'}` }}>
                          <div className="flex items-center gap-3">
                            {nom.artist.photoUrl ? <img src={nom.artist.photoUrl} alt={nom.artist.name} className="w-10 h-10 rounded-xl object-cover"/> : <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm" style={{ background:'var(--surface2)', color:'var(--text-muted)' }}>{nom.artist.name[0]}</div>}
                            <div>
                              <a href={`/artist/${nom.artist.slug}`} className="font-bold text-sm hover:underline" style={{ color:'var(--text)' }}>{nom.artist.name}</a>
                              {isWinner && <div className="text-xs font-bold mt-0.5" style={{ color:'var(--gold)' }}>🏆 Winner</div>}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-bold" style={{ color:'var(--text-muted)' }}>{nom.voteCount.toLocaleString()}</span>
                            {votingOpen && (
                              <button onClick={() => vote(nom.id)} disabled={isVoting}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs disabled:opacity-50"
                                style={{ background: isVoted ? 'rgba(212,160,0,0.15)' : 'var(--surface2)', color: isVoted ? 'var(--gold)' : 'var(--text-muted)', border:`1px solid ${isVoted ? 'rgba(212,160,0,0.3)' : 'var(--border)'}` }}>
                                {isVoting ? <Loader2 size={12} className="animate-spin"/> : isVoted ? <><Check size={12}/>Voted</> : <><ThumbsUp size={12}/>Vote</>}
                              </button>
                            )}
                            {award.status === 'announced' && isWinner && <Trophy size={18} style={{ color:'var(--gold)' }}/>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
