'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import {
  Bell, ShoppingBag, Heart, Users, MessageCircle, Star,
  Music2, Loader2, CheckCheck,
} from 'lucide-react';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  linkType: string;
  linkId: string;
}

const TYPE_ICON: Record<string, any> = {
  new_sale:            ShoppingBag,
  new_follower:        Users,
  new_comment:         MessageCircle,
  new_like:            Heart,
  new_message:         MessageCircle,
  new_post:            Music2,
  milestone_followers: Star,
  milestone_sales:     Star,
};

const TYPE_COLOR: Record<string, string> = {
  new_sale:            'var(--green)',
  new_follower:        'var(--sky)',
  new_comment:         'var(--gold)',
  new_like:            '#e74c3c',
  new_message:         'var(--sky)',
  new_post:            'var(--sky)',
  milestone_followers: 'var(--gold)',
  milestone_sales:     'var(--gold)',
};

function notifHref(n: Notification): string {
  switch (n.linkType) {
    case 'post':    return '/feed';
    case 'artist':  return `/artist/${n.linkId}`;
    case 'beat':    return `/beat/${n.linkId}`;
    case 'release': return `/release/${n.linkId}`;
    case 'message': return '/messages';
    case 'sale':    return '/dashboard/payouts';
    default:        return '/fan';
  }
}

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.replace('/auth/login'); return; }
      try {
        const res = await fetch('/api/social/notifications?limit=50');
        if (res.ok) {
          const d = await res.json();
          setNotifications(d.notifications || []);
        }
      } catch {}
      setLoading(false);
    });
  }, [router]);

  async function markAllRead() {
    setMarkingAll(true);
    try {
      await fetch('/api/social/notifications', { method: 'PATCH' });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch {}
    setMarkingAll(false);
  }

  async function handleClick(n: Notification) {
    if (!n.isRead) {
      try {
        await fetch('/api/social/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [n.id] }),
        });
        setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, isRead: true } : x));
      } catch {}
    }
    router.push(notifHref(n));
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  const unreadCount = notifications.filter(n => !n.isRead).length;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <Loader2 size={28} className="animate-spin" style={{ color: 'var(--sky)' }} />
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="max-w-2xl mx-auto px-4 py-8">

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
              Notifications
            </h1>
            {unreadCount > 0 && (
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {unreadCount} unread
              </p>
            )}
          </div>
          {unreadCount > 0 && (
            <button onClick={markAllRead} disabled={markingAll}
              className="flex items-center gap-2 text-sm font-medium disabled:opacity-50"
              style={{ color: 'var(--sky)' }}>
              {markingAll ? <Loader2 size={14} className="animate-spin" /> : <CheckCheck size={14} />}
              Mark all read
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="text-center py-20 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <Bell size={40} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
            <p className="font-bold" style={{ color: 'var(--text)' }}>No notifications yet</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              You'll be notified about sales, follows, and more
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map(notif => {
              const Icon = TYPE_ICON[notif.type] || Bell;
              const color = TYPE_COLOR[notif.type] || 'var(--sky)';
              return (
                <button
                  key={notif.id}
                  onClick={() => handleClick(notif)}
                  className="w-full text-left card p-4 flex gap-4 items-start transition-opacity hover:opacity-90 cursor-pointer"
                  style={{ opacity: notif.isRead ? 0.7 : 1 }}
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: `${color}1a` }}>
                    <Icon size={18} style={{ color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
                        {notif.title}
                      </p>
                      <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                        {timeAgo(notif.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {notif.body}
                    </p>
                  </div>
                  {!notif.isRead && (
                    <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ background: 'var(--sky)' }} />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
