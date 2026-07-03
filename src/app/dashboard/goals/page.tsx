'use client';
// Goals has been merged into Campaigns — this route now just redirects
// so old bookmarks/links don't dead-end.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function GoalsRedirectPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/dashboard/campaigns'); }, [router]);
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
    </div>
  );
}
