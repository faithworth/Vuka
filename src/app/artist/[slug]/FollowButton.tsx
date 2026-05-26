'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { UserCheck, UserPlus, Loader2 } from 'lucide-react';

export default function FollowButton({ artistId, artistName }: { artistId: string; artistName: string }) {
  const router = useRouter();
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setLoading(false); return; }
      setLoggedIn(true);
      try {
        const res = await fetch(`/api/follow?artistId=${artistId}`);
        if (res.ok) {
          const d = await res.json();
          setFollowing(d.following);
        }
      } catch {}
      setLoading(false);
    });
  }, [artistId]);

  async function toggle() {
    if (!loggedIn) { router.push('/auth/login'); return; }
    setToggling(true);
    try {
      const res = await fetch('/api/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistId }),
      });
      if (res.ok) {
        const d = await res.json();
        setFollowing(d.following);
      }
    } catch {}
    setToggling(false);
  }

  if (loading) return (
    <button disabled className="px-6 py-3 rounded-xl font-bold opacity-50 flex items-center gap-2 justify-center"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
      <Loader2 size={16} className="animate-spin" />
      Loading…
    </button>
  );

  return (
    <button onClick={toggle} disabled={toggling}
      className="px-6 py-3 rounded-xl font-bold flex items-center gap-2 justify-center transition-all"
      style={{
        background: following ? 'rgba(56,182,232,0.15)' : 'var(--surface)',
        border: `1px solid ${following ? 'var(--sky)' : 'var(--border)'}`,
        color: following ? 'var(--sky)' : 'var(--text)',
      }}>
      {toggling
        ? <Loader2 size={16} className="animate-spin" />
        : following
          ? <><UserCheck size={16} /> Following</>
          : <><UserPlus size={16} /> Follow</>}
    </button>
  );
}
