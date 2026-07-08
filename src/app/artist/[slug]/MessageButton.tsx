'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { MessageCircle } from 'lucide-react';
import VukaLoader from '@/components/brand/VukaLoader';

export default function MessageButton({ artistUserId }: { artistUserId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function openConversation() {
    if (loading) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.push('/auth/login'); return; }

      const r = await fetch('/api/messages/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: artistUserId }),
      });
      if (r.ok) {
        const d = await r.json();
        router.push(`/messages?conv=${d.conversation?.id ?? ''}`);
      } else if (r.status === 401) {
        router.push('/auth/login');
      }
    } catch {
      // silent — button just stays clickable, no destructive state to roll back
    }
    setLoading(false);
  }

  return (
    <button onClick={openConversation} disabled={loading}
      className="px-6 py-3 rounded-xl font-bold flex items-center gap-2 justify-center transition-all"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
      {loading ? <VukaLoader size={16} /> : <><MessageCircle size={16} /> Message</>}
    </button>
  );
}
