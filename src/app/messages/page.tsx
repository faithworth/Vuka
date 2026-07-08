'use client';
import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import {
  Send, MessageSquare, ArrowLeft, Search, SquarePen, X, Paperclip,
  Check, CheckCheck, Music, ShieldCheck, Image as ImageIcon, Loader2,
} from 'lucide-react';
import VukaLoader from '@/components/brand/VukaLoader';

// ── Types ─────────────────────────────────────────────────────────

interface Conversation {
  id: string;
  otherUser: { id: string; name: string; photoUrl: string; role: 'artist' | 'industry' | 'fan'; isVerified: boolean };
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
}

interface Attachment { url: string; filename: string; fileType: string; size: number }

interface ChatMessage {
  id: string;
  body: string;
  senderId: string;
  attachments: Attachment[];
  isRead: boolean;
  createdAt: string;
  pending?: boolean;
}

interface Person {
  id: string;
  name: string;
  role: 'artist' | 'industry' | 'fan';
  photoUrl: string;
  subtitle: string;
  isVerified: boolean;
  slug?: string;
  isFollowing?: boolean;
}

const PEOPLE_TABS: { key: 'all' | 'following' | 'artists' | 'industry' | 'fans'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'following', label: 'Following' },
  { key: 'artists', label: 'Artists' },
  { key: 'industry', label: 'Industry' },
  { key: 'fans', label: 'Fans' },
];

const ALLOWED_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_ATTACHMENT_MB = 10;

// Normalise a raw conversation record from /api/messages/conversations
function normaliseConversation(raw: any): Conversation {
  const partner = raw.partner ?? {};
  const lastMsg = raw.messages?.[0];
  return {
    id: raw.id,
    otherUser: {
      id: partner.id ?? '',
      name: partner.name ?? 'Unknown',
      photoUrl: partner.artist?.photoUrl ?? '',
      role: partner.artist ? 'artist' : (partner.industryUser ? 'industry' : 'fan'),
      isVerified: !!partner.artist?.isVerified,
    },
    lastMessagePreview: raw.lastMessagePreview ?? lastMsg?.body ?? '',
    lastMessageAt: raw.lastMessageAt ?? raw.updatedAt ?? new Date().toISOString(),
    unreadCount: raw.unread ?? 0,
  };
}

function personToConversationShell(person: Person, convId: string): Conversation {
  return {
    id: convId,
    otherUser: {
      id: person.id, name: person.name, photoUrl: person.photoUrl,
      role: person.role, isVerified: person.isVerified,
    },
    lastMessagePreview: '',
    lastMessageAt: new Date().toISOString(),
    unreadCount: 0,
  };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
}

function initials(name: string): string {
  return (name || '?').trim()[0]?.toUpperCase() ?? '?';
}

function RoleBadge({ role, isVerified }: { role: string; isVerified?: boolean }) {
  if (role === 'artist' && isVerified) {
    return <ShieldCheck size={12} style={{ color: 'var(--sky)' }} className="flex-shrink-0" />;
  }
  if (role === 'industry') {
    return (
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
        style={{ background: 'var(--gold)', color: '#1a1200' }}>
        INDUSTRY
      </span>
    );
  }
  return null;
}

function Avatar({ name, photoUrl, size = 44 }: { name: string; photoUrl?: string; size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white overflow-hidden"
      style={{ width: size, height: size, background: 'var(--sky)', fontSize: size * 0.4 }}>
      {photoUrl ? <img src={photoUrl} alt="" className="w-full h-full object-cover" /> : initials(name)}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────

function MessagesInner() {
  const router = useRouter();
  const params = useSearchParams();

  const [myId, setMyId] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const [convSearch, setConvSearch] = useState('');

  // "New Message" picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<typeof PEOPLE_TABS[number]['key']>('all');
  const [pickerQuery, setPickerQuery] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [startingChatWith, setStartingChatWith] = useState<string | null>(null);

  // Attachments
  const [pendingAttachment, setPendingAttachment] = useState<Attachment | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const activeConvRef = useRef<Conversation | null>(null);
  activeConvRef.current = activeConv;

  // ── Auth + initial load ──────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.replace('/auth/login'); return; }
      try {
        const meRes = await fetch('/api/auth/me');
        if (meRes.ok) setMyId((await meRes.json()).id);
        await loadConversations();
      } catch {}
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // ── Deep links: ?conv=<id> or ?to=<userId> ───────────────────
  useEffect(() => {
    const convId = params.get('conv');
    const toUserId = params.get('to');
    if (!convId && !toUserId) return;

    (async () => {
      if (convId) {
        // Prefer the loaded list (has full partner info); fall back to a
        // direct fetch if the list hasn't caught up yet (brand-new convo).
        const existing = conversations.find(c => c.id === convId);
        if (existing) { openConversation(existing); return; }
        try {
          const res = await fetch(`/api/messages/${convId}`);
          if (res.ok) {
            const d = await res.json();
            const firstMsg = d.messages?.[0];
            const other = firstMsg && firstMsg.senderId !== myId ? firstMsg.sender : null;
            const shell: Conversation = {
              id: convId,
              otherUser: {
                id: other?.id ?? '',
                name: other?.name ?? 'Conversation',
                photoUrl: other?.artist?.photoUrl ?? '',
                role: other?.artist ? 'artist' : 'fan',
                isVerified: false,
              },
              lastMessagePreview: '', lastMessageAt: new Date().toISOString(), unreadCount: 0,
            };
            setConversations(prev => prev.some(c => c.id === convId) ? prev : [shell, ...prev]);
            openConversation(shell);
          }
        } catch {}
      } else if (toUserId) {
        await startConversationWith({ id: toUserId, name: 'Conversation', role: 'fan', photoUrl: '', subtitle: '', isVerified: false });
      }
    })();
    // Clear the query string so a refresh doesn't re-trigger this.
    router.replace('/messages', { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations.length, myId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Realtime: instant push via Supabase Broadcast ──────────────
  // Subscribes to a personal "inbox" channel (new messages from anyone)
  // and, while a thread is open, that thread's channel too. Polling below
  // still runs underneath at a much lower frequency as a safety net for
  // missed events (tab was asleep, reconnect gap, etc) — belt and braces,
  // not a race between two sources of truth, since both paths just
  // re-fetch from the same REST endpoints rather than trusting the
  // broadcast payload blindly.
  useEffect(() => {
    if (!myId) return;
    const supabase = createClient();
    const inbox = supabase.channel(`inbox:${myId}`);
    inbox
      .on('broadcast', { event: 'new_message' }, (msg) => {
        const conversationId = (msg.payload as { conversationId?: string })?.conversationId;
        loadConversations(true);
        if (conversationId && activeConvRef.current?.id === conversationId) {
          fetch(`/api/messages/${conversationId}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d) setMessages(d.messages || []); })
            .catch(() => {});
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(inbox); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId]);

  useEffect(() => {
    if (!activeConv) return;
    const supabase = createClient();
    const convChannel = supabase.channel(`conversation:${activeConv.id}`);
    convChannel
      .on('broadcast', { event: 'new_message' }, () => {
        fetch(`/api/messages/${activeConv.id}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d) setMessages(d.messages || []); })
          .catch(() => {});
      })
      .on('broadcast', { event: 'read_receipt' }, () => {
        fetch(`/api/messages/${activeConv.id}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d) setMessages(d.messages || []); })
          .catch(() => {});
      })
      .subscribe();
    return () => { supabase.removeChannel(convChannel); };
  }, [activeConv?.id]);

  // ── Fallback polling (much slower — realtime handles the live case) ──
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled || document.hidden) return;
      await loadConversations(true);
    };
    const id = setInterval(tick, 25000);
    return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeConv) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled || document.hidden) return;
      try {
        const res = await fetch(`/api/messages/${activeConv.id}`);
        if (res.ok) {
          const d = await res.json();
          if (!cancelled) setMessages((d.messages || []) as ChatMessage[]);
        }
      } catch {}
    };
    const id = setInterval(tick, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [activeConv?.id]);

  // ── People picker: debounced search ──────────────────────────
  useEffect(() => {
    if (!pickerOpen) return;
    setPeopleLoading(true);
    const t = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ tab: pickerTab, limit: '40' });
        if (pickerQuery.trim()) qs.set('q', pickerQuery.trim());
        const res = await fetch(`/api/messages/people?${qs}`);
        if (res.ok) setPeople((await res.json()).people || []);
      } catch {}
      setPeopleLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [pickerOpen, pickerTab, pickerQuery]);

  // ── Actions ───────────────────────────────────────────────────

  async function loadConversations(silent = false) {
    try {
      const res = await fetch('/api/messages/conversations');
      if (res.ok) {
        const d = await res.json();
        const list = (d.conversations || []).map(normaliseConversation);
        setConversations(list);
        // Keep the open thread's header info fresh (e.g. read receipts on
        // the list don't affect this, but unread counts / previews do).
        if (activeConvRef.current) {
          const fresh = list.find((c: Conversation) => c.id === activeConvRef.current!.id);
          if (fresh) setActiveConv(fresh);
        }
      }
    } catch { if (!silent) { /* first-load failure surfaces via empty state */ } }
  }

  function openConversation(conv: Conversation) {
    setActiveConv(conv);
    setMobileView('chat');
    setMessages([]);
    setPendingAttachment(null);
    fetch(`/api/messages/${conv.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setMessages(d.messages || []); })
      .catch(() => {});
    // Optimistically clear the unread badge for this thread.
    setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unreadCount: 0 } : c));
  }

  async function startConversationWith(person: Person) {
    if (startingChatWith) return;
    setStartingChatWith(person.id);
    try {
      const res = await fetch('/api/messages/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: person.id }),
      });
      if (res.ok) {
        const d = await res.json();
        const convId = d.conversation?.id;
        if (convId) {
          const shell = personToConversationShell(person, convId);
          setConversations(prev => {
            const exists = prev.find(c => c.id === convId);
            if (exists) return prev;
            return [shell, ...prev];
          });
          const target = conversations.find(c => c.id === convId) ?? shell;
          openConversation(target);
          setPickerOpen(false);
          setPickerQuery('');
        }
      }
    } catch {}
    setStartingChatWith(null);
  }

  async function handleAttachmentSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
      alert('Only JPG, PNG, WEBP, or GIF images can be attached.');
      return;
    }
    if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
      alert(`Attachments must be under ${MAX_ATTACHMENT_MB}MB.`);
      return;
    }
    setUploadingAttachment(true);
    try {
      const presignRes = await fetch('/api/social/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: file.type, context: 'message' }),
      });
      if (!presignRes.ok) throw new Error('Failed to get upload URL');
      const { presignedUrl, publicUrl } = await presignRes.json();
      const putRes = await fetch(presignedUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!putRes.ok) throw new Error('Upload failed');
      setPendingAttachment({ url: publicUrl, filename: file.name, fileType: file.type, size: file.size });
    } catch {
      alert('Could not attach that file — please try again.');
    }
    setUploadingAttachment(false);
  }

  async function sendMessage() {
    if ((!draft.trim() && !pendingAttachment) || !activeConv || sending) return;
    setSending(true);
    const body = draft.trim();
    const attachments = pendingAttachment ? [pendingAttachment] : [];
    const tempId = `temp-${Date.now()}`;
    setDraft('');
    setPendingAttachment(null);

    // Optimistic append
    setMessages(prev => [...prev, {
      id: tempId, body, senderId: myId, attachments, isRead: false,
      createdAt: new Date().toISOString(), pending: true,
    }]);

    try {
      const res = await fetch(`/api/messages/${activeConv.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, attachments }),
      });
      if (res.ok) {
        const d = await res.json();
        setMessages(prev => prev.map(m => m.id === tempId ? d.message : m));
        setConversations(prev => {
          const updated = prev.map(c =>
            c.id === activeConv.id
              ? { ...c, lastMessagePreview: body || '📎 Attachment', lastMessageAt: new Date().toISOString() }
              : c
          );
          // Bump the active conversation to the top, like a real inbox.
          const idx = updated.findIndex(c => c.id === activeConv.id);
          if (idx > 0) { const [c] = updated.splice(idx, 1); updated.unshift(c); }
          return updated;
        });
      } else {
        const err = await res.json().catch(() => ({}));
        setMessages(prev => prev.filter(m => m.id !== tempId));
        setDraft(body);
        if (res.status === 429) alert(err.error || 'Sending too fast — please slow down.');
      }
    } catch {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setDraft(body);
    }
    setSending(false);
  }

  const filteredConversations = conversations.filter(c =>
    !convSearch.trim() || c.otherUser.name.toLowerCase().includes(convSearch.trim().toLowerCase())
  );

  const groupedMessages = messages.reduce<{ label: string; items: ChatMessage[] }[]>((groups, msg) => {
    const label = dayLabel(msg.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(msg);
    else groups.push({ label, items: [msg] });
    return groups;
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <VukaLoader size={28} />
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="max-w-6xl mx-auto px-4 py-6 md:py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
            Messages
          </h1>
          <button onClick={() => setPickerOpen(true)}
            className="btn btn-primary flex items-center gap-2 px-4 py-2 text-sm">
            <SquarePen size={16} /> New Message
          </button>
        </div>

        <div className="rounded-2xl overflow-hidden flex" style={{ background: 'var(--surface)', border: '1px solid var(--border)', height: '75vh', minHeight: 480 }}>

          {/* Conversation List */}
          <div
            className={`flex-shrink-0 w-full md:w-80 flex flex-col ${mobileView === 'chat' ? 'hidden md:flex' : 'flex'}`}
            style={{ borderRight: '1px solid var(--border)' }}>
            <div className="p-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                <input
                  className="input w-full pl-9 text-sm"
                  placeholder="Search conversations"
                  value={convSearch}
                  onChange={e => setConvSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-6">
                  <MessageSquare size={32} className="mb-3" style={{ color: 'var(--text-muted)' }} />
                  <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                    {convSearch ? 'No matches' : 'No messages yet'}
                  </p>
                  {!convSearch && (
                    <>
                      <p className="text-xs mt-1 mb-3" style={{ color: 'var(--text-muted)' }}>
                        Start a conversation with anyone on Vuka
                      </p>
                      <button onClick={() => setPickerOpen(true)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                        style={{ background: 'var(--sky)', color: 'white' }}>
                        New Message
                      </button>
                    </>
                  )}
                </div>
              ) : filteredConversations.map(conv => (
                <button key={conv.id} onClick={() => openConversation(conv)}
                  className="w-full text-left px-4 py-3 flex gap-3 items-center transition-colors hover:bg-[var(--surface2)]"
                  style={{
                    background: activeConv?.id === conv.id ? 'var(--surface2)' : 'transparent',
                    borderBottom: '1px solid var(--border)',
                  }}>
                  <Avatar name={conv.otherUser.name} photoUrl={conv.otherUser.photoUrl} size={44} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm truncate flex items-center gap-1" style={{ color: 'var(--text)' }}>
                        <span className="truncate">{conv.otherUser.name}</span>
                        <RoleBadge role={conv.otherUser.role} isVerified={conv.otherUser.isVerified} />
                      </p>
                      <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                        {timeAgo(conv.lastMessageAt)}
                      </span>
                    </div>
                    <p className="text-xs truncate" style={{ color: conv.unreadCount > 0 ? 'var(--text)' : 'var(--text-muted)', fontWeight: conv.unreadCount > 0 ? 600 : 400 }}>
                      {conv.lastMessagePreview || 'Say hello 👋'}
                    </p>
                  </div>
                  {conv.unreadCount > 0 && (
                    <span className="min-w-5 h-5 px-1.5 rounded-full text-xs font-bold text-white flex items-center justify-center flex-shrink-0"
                      style={{ background: 'var(--sky)' }}>
                      {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Chat area */}
          <div className={`flex-1 flex flex-col min-w-0 ${mobileView === 'list' ? 'hidden md:flex' : 'flex'}`}>
            {!activeConv ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <MessageSquare size={40} className="mb-4" style={{ color: 'var(--text-muted)' }} />
                <p className="font-semibold" style={{ color: 'var(--text)' }}>Select a conversation</p>
                <p className="text-sm mt-1 mb-4" style={{ color: 'var(--text-muted)' }}>Or start a new one — everyone on Vuka is one tap away</p>
                <button onClick={() => setPickerOpen(true)} className="btn btn-primary text-sm px-4 py-2 flex items-center gap-2">
                  <SquarePen size={15} /> New Message
                </button>
              </div>
            ) : (
              <>
                {/* Chat header */}
                <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                  <button className="md:hidden" onClick={() => setMobileView('list')} style={{ color: 'var(--text-muted)' }}>
                    <ArrowLeft size={20} />
                  </button>
                  <Avatar name={activeConv.otherUser.name} photoUrl={activeConv.otherUser.photoUrl} size={36} />
                  <div className="min-w-0">
                    <p className="font-semibold text-sm flex items-center gap-1 truncate" style={{ color: 'var(--text)' }}>
                      {activeConv.otherUser.name}
                      <RoleBadge role={activeConv.otherUser.role} isVerified={activeConv.otherUser.isVerified} />
                    </p>
                    <p className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>{activeConv.otherUser.role}</p>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center opacity-60">
                      <Avatar name={activeConv.otherUser.name} photoUrl={activeConv.otherUser.photoUrl} size={56} />
                      <p className="text-sm font-medium mt-3" style={{ color: 'var(--text)' }}>{activeConv.otherUser.name}</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                        Say hello, ask a question, or discuss an order or exclusive pack.
                      </p>
                    </div>
                  )}
                  {groupedMessages.map(group => (
                    <div key={group.label}>
                      <div className="flex justify-center mb-3">
                        <span className="text-[11px] font-medium px-2.5 py-1 rounded-full" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
                          {group.label}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {group.items.map(msg => {
                          const isMine = msg.senderId === myId;
                          return (
                            <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                              <div className="max-w-[75%] md:max-w-xs">
                                {msg.attachments?.map((att, i) => (
                                  <a key={i} href={att.url} target="_blank" rel="noopener noreferrer" className="block mb-1 rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                                    {att.fileType.startsWith('image/')
                                      ? <img src={att.url} alt={att.filename} className="max-h-56 w-full object-cover" />
                                      : <div className="px-3 py-2 flex items-center gap-2 text-xs" style={{ background: 'var(--surface2)' }}><Music size={14} /> {att.filename}</div>}
                                  </a>
                                ))}
                                {msg.body && (
                                  <div className="px-4 py-2.5 rounded-2xl text-sm break-words"
                                    style={{
                                      background: isMine ? 'var(--sky)' : 'var(--surface2)',
                                      color: isMine ? 'white' : 'var(--text)',
                                      opacity: msg.pending ? 0.6 : 1,
                                      borderBottomRightRadius: isMine ? 4 : undefined,
                                      borderBottomLeftRadius: !isMine ? 4 : undefined,
                                    }}>
                                    {msg.body}
                                  </div>
                                )}
                                <div className={`flex items-center gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                    {new Date(msg.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                                  </span>
                                  {isMine && !msg.pending && (
                                    msg.isRead
                                      ? <CheckCheck size={13} style={{ color: 'var(--sky)' }} />
                                      : <Check size={13} style={{ color: 'var(--text-muted)' }} />
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>

                {/* Input */}
                <div className="p-3 md:p-4 flex-shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
                  {pendingAttachment && (
                    <div className="mb-2 flex items-center gap-2 px-3 py-2 rounded-xl text-xs" style={{ background: 'var(--surface2)' }}>
                      <ImageIcon size={14} />
                      <span className="flex-1 truncate">{pendingAttachment.filename}</span>
                      <button onClick={() => setPendingAttachment(null)} style={{ color: 'var(--text-muted)' }}><X size={14} /></button>
                    </div>
                  )}
                  <div className="flex gap-2 items-end">
                    <input ref={fileInputRef} type="file" accept={ALLOWED_ATTACHMENT_TYPES.join(',')} className="hidden" onChange={handleAttachmentSelect} />
                    <button onClick={() => fileInputRef.current?.click()} disabled={uploadingAttachment}
                      className="p-2.5 rounded-xl flex-shrink-0 transition-colors hover:bg-[var(--surface2)]"
                      style={{ color: 'var(--text-muted)' }} title="Attach an image">
                      {uploadingAttachment ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
                    </button>
                    <textarea
                      className="input flex-1 resize-none text-sm py-2.5"
                      rows={1}
                      placeholder="Type a message…"
                      value={draft}
                      onChange={e => setDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    />
                    <button onClick={sendMessage} disabled={sending || (!draft.trim() && !pendingAttachment)}
                      className="btn btn-primary p-2.5 flex-shrink-0 disabled:opacity-40">
                      {sending ? <VukaLoader size={16} /> : <Send size={16} />}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── New Message picker ─────────────────────────────────── */}
      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setPickerOpen(false)}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '80vh' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="font-bold" style={{ color: 'var(--text)' }}>New Message</h2>
              <button onClick={() => setPickerOpen(false)} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
            </div>
            <div className="p-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="relative mb-2">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                <input autoFocus className="input w-full pl-9 text-sm" placeholder="Search people on Vuka…"
                  value={pickerQuery} onChange={e => setPickerQuery(e.target.value)} />
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {PEOPLE_TABS.map(t => (
                  <button key={t.key} onClick={() => setPickerTab(t.key)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors"
                    style={{
                      background: pickerTab === t.key ? 'var(--sky)' : 'var(--surface2)',
                      color: pickerTab === t.key ? 'white' : 'var(--text-muted)',
                    }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {peopleLoading ? (
                <div className="flex justify-center py-10"><VukaLoader size={22} /></div>
              ) : people.length === 0 ? (
                <div className="text-center py-10 px-4 text-sm" style={{ color: 'var(--text-muted)' }}>
                  {pickerQuery ? `No one found for "${pickerQuery}"` : 'No one here yet'}
                </div>
              ) : people.map(person => (
                <button key={person.id} onClick={() => startConversationWith(person)}
                  disabled={!!startingChatWith}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors hover:bg-[var(--surface2)] disabled:opacity-60">
                  <Avatar name={person.name} photoUrl={person.photoUrl} size={40} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm flex items-center gap-1 truncate" style={{ color: 'var(--text)' }}>
                      <span className="truncate">{person.name}</span>
                      <RoleBadge role={person.role} isVerified={person.isVerified} />
                    </p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{person.subtitle}</p>
                  </div>
                  {startingChatWith === person.id
                    ? <VukaLoader size={16} />
                    : person.isFollowing && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>Following</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <VukaLoader size={28} />
      </div>
    }>
      <MessagesInner />
    </Suspense>
  );
}
