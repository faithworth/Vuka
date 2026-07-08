'use client';
import { useEffect, useRef, useState } from 'react';
import { Plus, X, ChevronLeft, ChevronRight, Loader2, Trash2 } from 'lucide-react';

interface StoryItem {
  id: string;
  mediaUrl: string;
  mediaType: string;
  caption: string;
  viewCount: number;
  createdAt: string;
  viewedByMe: boolean;
}
interface StoryGroup {
  artist: { id: string; name: string; slug: string; photoUrl: string; isVerified: boolean };
  hasUnseen: boolean;
  stories: StoryItem[];
}

const STORY_DURATION_MS = 5000;

function initials(name: string): string {
  return (name || '?').trim()[0]?.toUpperCase() ?? '?';
}

export default function StoriesBar({
  myArtist,
}: {
  myArtist: { id: string; name: string; slug: string; photoUrl: string; isVerified: boolean } | null;
}) {
  const [bar, setBar] = useState<StoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerGroupIndex, setViewerGroupIndex] = useState<number | null>(null);
  const [viewerStoryIndex, setViewerStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { loadBar(); }, []);

  async function loadBar() {
    try {
      const res = await fetch('/api/social/stories');
      if (res.ok) setBar((await res.json()).bar || []);
    } catch {}
    setLoading(false);
  }

  const myStoryGroup = myArtist ? bar.find(g => g.artist.id === myArtist.id) : undefined;
  const otherGroups = bar.filter(g => g.artist.id !== myArtist?.id);
  const fullOrder = myStoryGroup ? [myStoryGroup, ...otherGroups] : otherGroups;

  function openViewer(groupIndexInFullBar: number) {
    setViewerGroupIndex(groupIndexInFullBar);
    setViewerStoryIndex(0);
  }

  function closeViewer() {
    setViewerGroupIndex(null);
    setViewerStoryIndex(0);
    setProgress(0);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  const activeGroup = viewerGroupIndex !== null ? fullOrder[viewerGroupIndex] : null;
  const activeStory = activeGroup?.stories[viewerStoryIndex];

  // Mark viewed + auto-advance progress
  useEffect(() => {
    if (!activeStory) return;
    if (!activeStory.viewedByMe) {
      fetch(`/api/social/stories/${activeStory.id}`, { method: 'POST' }).catch(() => {});
      activeStory.viewedByMe = true;
    }
    setProgress(0);
    const started = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - started) / STORY_DURATION_MS) * 100);
      setProgress(pct);
      if (pct >= 100) goNext();
    }, 50);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStory?.id]);

  function goNext() {
    if (viewerGroupIndex === null) return;
    const group = fullOrder[viewerGroupIndex];
    if (viewerStoryIndex < group.stories.length - 1) {
      setViewerStoryIndex(i => i + 1);
    } else if (viewerGroupIndex < fullOrder.length - 1) {
      setViewerGroupIndex(i => (i as number) + 1);
      setViewerStoryIndex(0);
    } else {
      closeViewer();
    }
  }
  function goPrev() {
    if (viewerGroupIndex === null) return;
    if (viewerStoryIndex > 0) {
      setViewerStoryIndex(i => i - 1);
    } else if (viewerGroupIndex > 0) {
      const prevGroup = fullOrder[viewerGroupIndex - 1];
      setViewerGroupIndex(i => (i as number) - 1);
      setViewerStoryIndex(prevGroup.stories.length - 1);
    }
  }

  async function handleAddStory(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !myArtist) return;
    const isVideo = file.type.startsWith('video/');
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime'].includes(file.type)) {
      alert('Unsupported file type for a story.'); return;
    }
    const maxMB = isVideo ? 50 : 10;
    if (file.size > maxMB * 1024 * 1024) { alert(`Stories must be under ${maxMB}MB.`); return; }

    setUploading(true);
    try {
      const presignRes = await fetch('/api/social/upload-url', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: file.type, context: 'story' }),
      });
      if (!presignRes.ok) throw new Error();
      const { presignedUrl, publicUrl } = await presignRes.json();
      const putRes = await fetch(presignedUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!putRes.ok) throw new Error();

      const createRes = await fetch('/api/social/stories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaUrl: publicUrl, mediaType: isVideo ? 'video' : 'image' }),
      });
      if (createRes.ok) await loadBar();
    } catch {
      alert('Could not post that story — please try again.');
    }
    setUploading(false);
  }

  async function handleDeleteStory(storyId: string) {
    if (!confirm('Delete this story?')) return;
    try {
      await fetch(`/api/social/stories/${storyId}`, { method: 'DELETE' });
      closeViewer();
      await loadBar();
    } catch {}
  }

  if (loading) return null;
  if (bar.length === 0 && !myArtist) return null;

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-4 mb-1 -mx-1 px-1">
        {myArtist && (
          <button onClick={() => myStoryGroup ? openViewer(fullOrder.indexOf(myStoryGroup)) : fileInputRef.current?.click()}
            className="flex flex-col items-center gap-1 flex-shrink-0 w-16">
            <div className="relative w-14 h-14 rounded-full p-[2px]"
              style={{ background: myStoryGroup ? 'linear-gradient(135deg, var(--sky), var(--gold))' : 'var(--border)' }}>
              <div className="w-full h-full rounded-full p-[2px]" style={{ background: 'var(--bg)' }}>
                <div className="w-full h-full rounded-full flex items-center justify-center overflow-hidden font-bold text-white"
                  style={{ background: 'var(--sky)' }}>
                  {myArtist.photoUrl ? <img src={myArtist.photoUrl} alt="" className="w-full h-full object-cover" /> : initials(myArtist.name)}
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center border-2"
                style={{ background: 'var(--sky)', borderColor: 'var(--bg)' }}>
                {uploading ? <Loader2 size={10} className="animate-spin text-white" /> : <Plus size={10} className="text-white" />}
              </button>
            </div>
            <span className="text-[11px] truncate w-full text-center" style={{ color: 'var(--text-muted)' }}>Your Story</span>
          </button>
        )}
        <input ref={fileInputRef} type="file" accept="image/*,video/mp4,video/quicktime" className="hidden" onChange={handleAddStory} />

        {otherGroups.map((group) => (
          <button key={group.artist.id} onClick={() => openViewer(fullOrder.indexOf(group))}
            className="flex flex-col items-center gap-1 flex-shrink-0 w-16">
            <div className="w-14 h-14 rounded-full p-[2px]"
              style={{ background: group.hasUnseen ? 'linear-gradient(135deg, var(--sky), var(--gold))' : 'var(--border)' }}>
              <div className="w-full h-full rounded-full p-[2px]" style={{ background: 'var(--bg)' }}>
                <div className="w-full h-full rounded-full flex items-center justify-center overflow-hidden font-bold text-white"
                  style={{ background: 'var(--sky)' }}>
                  {group.artist.photoUrl ? <img src={group.artist.photoUrl} alt="" className="w-full h-full object-cover" /> : initials(group.artist.name)}
                </div>
              </div>
            </div>
            <span className="text-[11px] truncate w-full text-center" style={{ color: 'var(--text)' }}>{group.artist.name}</span>
          </button>
        ))}
      </div>

      {/* Fullscreen viewer */}
      {activeGroup && activeStory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'black' }}>
          <div className="relative w-full h-full max-w-md mx-auto flex flex-col">
            {/* Progress bars */}
            <div className="flex gap-1 px-3 pt-3 z-10">
              {activeGroup.stories.map((s, i) => (
                <div key={s.id} className="flex-1 h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.3)' }}>
                  <div className="h-full bg-white transition-all"
                    style={{ width: i < viewerStoryIndex ? '100%' : i === viewerStoryIndex ? `${progress}%` : '0%' }} />
                </div>
              ))}
            </div>

            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-3 z-10">
              <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center font-bold text-white text-xs flex-shrink-0" style={{ background: 'var(--sky)' }}>
                {activeGroup.artist.photoUrl ? <img src={activeGroup.artist.photoUrl} alt="" className="w-full h-full object-cover" /> : initials(activeGroup.artist.name)}
              </div>
              <span className="text-white text-sm font-semibold flex-1">{activeGroup.artist.name}</span>
              <span className="text-white/70 text-xs">{new Date(activeStory.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
              {myArtist?.id === activeGroup.artist.id && (
                <button onClick={() => handleDeleteStory(activeStory.id)} className="text-white/80 p-1"><Trash2 size={16} /></button>
              )}
              <button onClick={closeViewer} className="text-white p-1"><X size={20} /></button>
            </div>

            {/* Media */}
            <div className="flex-1 relative flex items-center justify-center">
              {activeStory.mediaType === 'video' ? (
                <video src={activeStory.mediaUrl} autoPlay muted playsInline className="max-h-full max-w-full object-contain" onEnded={goNext} />
              ) : (
                <img src={activeStory.mediaUrl} alt="" className="max-h-full max-w-full object-contain" />
              )}
              {activeStory.caption && (
                <p className="absolute bottom-6 left-4 right-4 text-white text-sm text-center bg-black/40 rounded-lg px-3 py-2">
                  {activeStory.caption}
                </p>
              )}
              {/* Tap zones */}
              <button onClick={goPrev} className="absolute left-0 top-0 bottom-0 w-1/3" aria-label="Previous" />
              <button onClick={goNext} className="absolute right-0 top-0 bottom-0 w-1/3" aria-label="Next" />
            </div>

            <div className="hidden md:flex justify-between px-2 pb-2">
              <button onClick={goPrev} className="text-white/70 p-2"><ChevronLeft size={20} /></button>
              <button onClick={goNext} className="text-white/70 p-2"><ChevronRight size={20} /></button>
            </div>

            {myArtist?.id === activeGroup.artist.id && (
              <p className="text-center text-white/60 text-xs pb-3">{activeStory.viewCount} view{activeStory.viewCount !== 1 ? 's' : ''}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
