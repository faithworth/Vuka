'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { Send, MessageSquare, ArrowLeft } from 'lucide-react';
import VukaLoader from '@/components/brand/VukaLoader';

// Normalised shape used by this page
interface Conversation {
  id: string;
  otherUser: { id: string; name: string; photoUrl?: string };
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
}

interface Message {
  id: string;
  body: string;
  senderId: string;
  createdAt: string;
}

// Normalise raw API conversation to the shape used by this page
function normaliseConversation(raw: any): Conversation {
  const partner = raw.partner ?? raw.otherUser ?? {};
  const lastMsg = raw.messages?.[0];
  return {
    id:                 raw.id,
    otherUser: {
      id:       partner.id    ?? '',
      name:     partner.name  ?? 'Unknown',
      photoUrl: partner.artist?.photoUrl ?? undefined,
    },
    lastMessagePreview: raw.lastMessagePreview ?? lastMsg?.body ?? '',
    lastMessageAt:      raw.lastMessageAt ?? raw.updatedAt ?? new Date().toISOString(),
    unreadCount:        raw.unreadCount ?? raw.unread ?? 0,
  };
}

export default function MessagesPage() {
  const router = useRouter();
  const [myId, setMyId]                   = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv]       = useState<Conversation | null>(null);
  const [messages, setMessages]           = useState<Message[]>([]);
  const [draft, setDraft]                 = useState('');
  const [loading, setLoading]             = useState(true);
  const [sending, setSending]             = useState(false);
  const [mobileView, setMobileView]       = useState<'list' | 'chat'>('list');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.replace('/auth/login'); return; }
      try {
        const meRes = await fetch('/api/auth/me');
        if (meRes.ok) {
          const me = await meRes.json();
          setMyId(me.id);
        }
        const res = await fetch('/api/messages/conversations');
        if (res.ok) {
          const d = await res.json();
          const raw: any[] = d.conversations || [];
          setConversations(raw.map(normaliseConversation));
        }
      } catch {}
      setLoading(false);
    });
  }, [router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function openConversation(conv: Conversation) {
    setActiveConv(conv);
    setMobileView('chat');
    setMessages([]);
    try {
      const res = await fetch(`/api/messages/${conv.id}`);
      if (res.ok) {
        const d = await res.json();
        setMessages(d.messages || []);
      }
    } catch {}
  }

  async function sendMessage() {
    if (!draft.trim() || !activeConv || sending) return;
    setSending(true);
    const body = draft.trim();
    setDraft('');
    try {
      const res = await fetch(`/api/messages/${activeConv.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (res.ok) {
        const d = await res.json();
        setMessages(prev => [...prev, d.message]);
        setConversations(prev => prev.map(c =>
          c.id === activeConv.id
            ? { ...c, lastMessagePreview: body, lastMessageAt: new Date().toISOString() }
            : c
        ));
      }
    } catch {}
    setSending(false);
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <VukaLoader size={28} />
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
          Messages
        </h1>

        <div className="rounded-2xl overflow-hidden flex" style={{ background: 'var(--surface)', border: '1px solid var(--border)', height: '70vh' }}>

          {/* Conversation List */}
          <div
            className={`flex-shrink-0 w-full md:w-72 flex flex-col ${mobileView === 'chat' ? 'hidden md:flex' : 'flex'}`}
            style={{ borderRight: '1px solid var(--border)' }}>
            <div className="px-4 py-3 font-semibold text-sm" style={{ borderBottom: '1px solid var(--border)', color: 'var(--text)' }}>
              Conversations
            </div>
            <div className="flex-1 overflow-y-auto">
              {conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-6">
                  <MessageSquare size={32} className="mb-3" style={{ color: 'var(--text-muted)' }} />
                  <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>No messages yet</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    Messages from artists will appear here
                  </p>
                </div>
              ) : conversations.map(conv => (
                <button key={conv.id} onClick={() => openConversation(conv)}
                  className="w-full text-left px-4 py-3 flex gap-3 items-center transition-colors hover:bg-[var(--surface2)]"
                  style={{
                    background: activeConv?.id === conv.id ? 'var(--surface2)' : 'transparent',
                    borderBottom: '1px solid var(--border)',
                  }}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white text-sm overflow-hidden"
                    style={{ background: 'var(--sky)' }}>
                    {conv.otherUser.photoUrl
                      ? <img src={conv.otherUser.photoUrl} alt="" className="w-full h-full object-cover" />
                      : conv.otherUser.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>
                        {conv.otherUser.name}
                      </p>
                      <span className="text-xs flex-shrink-0 ml-2" style={{ color: 'var(--text-muted)' }}>
                        {timeAgo(conv.lastMessageAt)}
                      </span>
                    </div>
                    <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                      {conv.lastMessagePreview || 'No messages yet'}
                    </p>
                  </div>
                  {conv.unreadCount > 0 && (
                    <span className="w-5 h-5 rounded-full text-xs font-bold text-white flex items-center justify-center flex-shrink-0"
                      style={{ background: 'var(--sky)' }}>
                      {conv.unreadCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Chat area */}
          <div className={`flex-1 flex flex-col ${mobileView === 'list' ? 'hidden md:flex' : 'flex'}`}>
            {!activeConv ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <MessageSquare size={40} className="mb-4" style={{ color: 'var(--text-muted)' }} />
                <p className="font-semibold" style={{ color: 'var(--text)' }}>Select a conversation</p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Choose from the list to start messaging</p>
              </div>
            ) : (
              <>
                {/* Chat header */}
                <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                  <button className="md:hidden mr-1" onClick={() => setMobileView('list')} style={{ color: 'var(--text-muted)' }}>
                    <ArrowLeft size={20} />
                  </button>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-sm flex-shrink-0 overflow-hidden"
                    style={{ background: 'var(--sky)' }}>
                    {activeConv.otherUser.photoUrl
                      ? <img src={activeConv.otherUser.photoUrl} alt="" className="w-full h-full object-cover" />
                      : activeConv.otherUser.name[0]?.toUpperCase()}
                  </div>
                  <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
                    {activeConv.otherUser.name}
                  </p>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.map(msg => {
                    const isMine = msg.senderId === myId;
                    return (
                      <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <div className="max-w-xs px-4 py-2.5 rounded-2xl text-sm"
                          style={{
                            background: isMine ? 'var(--sky)' : 'var(--surface2)',
                            color: isMine ? 'white' : 'var(--text)',
                            borderBottomRightRadius: isMine ? 4 : undefined,
                            borderBottomLeftRadius:  !isMine ? 4 : undefined,
                          }}>
                          {msg.body}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>

                {/* Input */}
                <div className="p-4 flex gap-3" style={{ borderTop: '1px solid var(--border)' }}>
                  <input
                    className="input flex-1"
                    placeholder="Type a message…"
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  />
                  <button onClick={sendMessage} disabled={sending || !draft.trim()}
                    className="btn btn-primary px-4 disabled:opacity-50">
                    {sending ? <VukaLoader size={16} /> : <Send size={16} />}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
