'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { signIn, signOut, useSession } from 'next-auth/react';
import {
  ChevronUp, ChevronDown, Music2, Share2, Check, Home,
  SkipForward, ListMusic, Users, Search,
  LogOut, Globe, Lock, Trophy, Plus, Bell, Settings, Heart, Clock, Star,
} from 'lucide-react';
import type { QueueItem, QueueMode, SSEEvent } from '@/app/types/Music';

const ROUND_SECS = 5 * 60;

interface YTPlayer { loadVideoById(id: string): void; destroy(): void; }
interface YTWindow extends Window {
  YT?: { Player: new (el: string, opts: object) => YTPlayer };
  onYouTubeIframeAPIReady?: () => void;
}
const ytThumb   = (id: string) => `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
const ytThumbHD = (id: string) => `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;

const C = {
  bg:        '#0d0d0d',
  sidebar:   '#141414',
  card:      '#1c1c1c',
  cardHi:    '#252525',
  accent:    '#5352ED',
  accentDim: 'rgba(83,82,237,0.13)',
  red:       '#ef4444',
  gold:      '#f59e0b',
  green:     '#22c55e',
  border:    'rgba(255,255,255,0.07)',
  text:      '#ffffff',
  textSec:   'rgba(255,255,255,0.52)',
  textMut:   'rgba(255,255,255,0.28)',
} as const;

function Avatar({ user, size = 26 }: { user: { name?: string | null; image?: string | null }; size?: number }) {
  return user.image ? (
    <img src={user.image} alt={user.name ?? ''} width={size} height={size}
      style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: '50%', background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white', flexShrink: 0 }}>
      {(user.name ?? '?')[0].toUpperCase()}
    </div>
  );
}

export default function StreamPage() {
  const { creatorId } = useParams<{ creatorId: string }>();
  const { data: session } = useSession();

  const [userId,       setUserId]       = useState<string | null>(null);
  const [queue,        setQueue]        = useState<QueueItem[]>([]);
  const [nowPlaying,   setNow]          = useState<QueueItem | null>(null);
  const [endsAt,       setEndsAt]       = useState<number | null>(null);
  const [countdown,    setCountdown]    = useState(0);
  const [mode,         setMode]         = useState<QueueMode>('public');
  const [togglingMode, setTogglingMode] = useState(false);
  const [url,          setUrl]          = useState('');
  const [adding,       setAdding]       = useState(false);
  const [addError,     setAddError]     = useState('');
  const [myVote,       setMyVote]       = useState<string | null>(null); // streamId user voted for
  const [copied,       setCopied]       = useState(false);
  const [activeNav,    setActiveNav]    = useState('explore');
  const [activeTab,    setActiveTab]    = useState<'MUSIC'|'QUEUE'|'LIVE'>('MUSIC');
  const [skipping,     setSkipping]     = useState(false);
  const [liveCount,    setLiveCount]    = useState(0);
  const [streamEnded,  setStreamEnded]  = useState(false);
  const [showMobilePlayer, setShowMobilePlayer] = useState(false);

  const advRef      = useRef(false);
  const inputRef    = useRef<HTMLInputElement>(null);
  const ytPlayerRef = useRef<YTPlayer | null>(null);
  const ytReadyRef  = useRef(false);
  const ytPendVid   = useRef('');
  const isCreator = !!userId && userId === creatorId;

  useEffect(() => { setLiveCount(Math.floor(Math.random() * 80) + 22); }, []);
  useEffect(() => {
    if (!session?.user) return;
    fetch('/api/user/me').then(r => r.json()).then(d => setUserId(d.id)).catch(() => {});
  }, [session]);

  useEffect(() => {
    if (!creatorId) return;
    fetch(`/api/streams/myvote?creatorId=${creatorId}`)
      .then(r => r.json()).then(d => setMyVote(d.streamId ?? null)).catch(() => {});
  }, [creatorId, session?.user?.email]);

  useEffect(() => {
    if (!creatorId) return;
    const es = new EventSource(`/api/streams/live?creatorId=${creatorId}`);
    es.onmessage = (e) => {
      const d: SSEEvent = JSON.parse(e.data);
      if (d.type === 'INIT')         { setQueue(d.queue); setNow(d.nowPlaying); setEndsAt(d.remainingMs != null ? Date.now() + d.remainingMs : null); setMode(d.mode); advRef.current = false; }
      if (d.type === 'QUEUE_UPDATE') setQueue(d.queue);
      if (d.type === 'NOW_PLAYING')  { setNow(d.song); setEndsAt(d.remainingMs != null ? Date.now() + d.remainingMs : null); setQueue(d.queue); advRef.current = false; }
      if (d.type === 'MODE_CHANGE')  setMode(d.mode);
      if (d.type === 'STREAM_ENDED') setStreamEnded(true);
    };
    return () => es.close();
  }, [creatorId]);

  useEffect(() => {
    if (!isCreator || !creatorId) return;
    const ping = () => fetch(`/api/streams/heartbeat?creatorId=${creatorId}`, { method: 'POST' }).catch(() => {});
    ping();
    const t = setInterval(ping, 30_000);
    return () => clearInterval(t);
  }, [isCreator, creatorId]);

  // YouTube IFrame API — creator only; viewers see a static thumbnail, not a live player
  useEffect(() => {
    if (!isCreator) return;
    function initPlayer() {
      ytReadyRef.current = true;
      const yw = window as unknown as YTWindow;
      ytPlayerRef.current = new yw.YT!.Player('yt-player-div', {
        height: '100%', width: '100%',
        playerVars: { autoplay: 1, controls: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady() {
            if (ytPendVid.current) {
              try { ytPlayerRef.current?.loadVideoById(ytPendVid.current); } catch {}
            }
          },
          onStateChange(e: { data: number }) {
            if (e.data === 0 && !advRef.current) {
              advRef.current = true;
              fetch('/api/streams/next', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ creatorId, force: true }),
              }).catch(() => {});
            }
          },
        },
      });
    }
    const yw = window as unknown as YTWindow;
    if (yw.YT?.Player) {
      initPlayer();
    } else {
      yw.onYouTubeIframeAPIReady = initPlayer;
      if (!document.getElementById('yt-api-script')) {
        const tag = document.createElement('script');
        tag.id = 'yt-api-script'; tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
    }
    return () => { try { ytPlayerRef.current?.destroy(); } catch {} ytPlayerRef.current = null; ytReadyRef.current = false; };
  }, [isCreator, creatorId]);

  // Load new video when now-playing changes — creator only
  useEffect(() => {
    if (!isCreator) return;
    const vid = nowPlaying?.extractedId ?? '';
    ytPendVid.current = vid;
    if (!vid) return;
    if (ytPlayerRef.current && ytReadyRef.current) {
      try { ytPlayerRef.current.loadVideoById(vid); } catch {}
    }
  }, [isCreator, nowPlaying?.extractedId]);

  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => {
      const rem = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setCountdown(rem);
      if (rem === 0 && !advRef.current) {
        advRef.current = true;
        fetch('/api/streams/next', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ creatorId, force: false }) });
      }
    }, 500);
    return () => clearInterval(t);
  }, [endsAt, creatorId]);

  const vote = useCallback(async (streamId: string, dir: 'up' | 'down') => {
    const res = await fetch(dir === 'up' ? '/api/streams/upvote' : '/api/streams/downvote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ streamId, creatorId }),
    });
    const d = await res.json();
    // activeVoteStreamId is always returned (null = no vote, string = voted song)
    if (res.ok || res.status === 400) setMyVote(d.activeVoteStreamId ?? null);
  }, [creatorId]);

  const addSong = async () => {
    if (!url.trim()) return;
    setAdding(true); setAddError('');
    const res = await fetch('/api/streams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ creatorId, url: url.trim() }) }).catch(() => null);
    if (!res) { setAddError('Network error'); setAdding(false); return; }
    const data = await res.json();
    if (!res.ok) setAddError(data.message ?? 'Failed'); else setUrl('');
    setAdding(false);
  };

  const skip = async () => {
    if (!isCreator || skipping) return;
    setSkipping(true);
    await fetch('/api/streams/next', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ creatorId, force: true }) });
    setSkipping(false);
  };

  const toggleMode = async () => {
    if (!isCreator || togglingMode) return;
    setTogglingMode(true);
    const next: QueueMode = mode === 'public' ? 'creator' : 'public';
    const res = await fetch('/api/streams/mode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ creatorId, mode: next }) });
    if (res.ok) setMode(next);
    setTogglingMode(false);
  };

  const copyLink = useCallback(() => {
    const url = `${window.location.origin}/stream/${creatorId}`;
    const doFallback = () => {
      const ta = document.createElement('textarea');
      ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).catch(doFallback);
    } else {
      doFallback();
    }
    setCopied(true); setTimeout(() => setCopied(false), 2200);
  }, [creatorId]);

  const handleSignOut = useCallback(async () => {
    if (isCreator) await fetch('/api/streams/cleanup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ creatorId }) }).catch(() => {});
    signOut({ callbackUrl: '/' });
  }, [isCreator, creatorId]);

  const elapsed    = ROUND_SECS - countdown;
  const pct        = endsAt ? Math.min(100, (elapsed / ROUND_SECS) * 100) : 0;
  const totalVotes = queue.reduce((s, q) => s + q.votes, 0);
  const canAdd     = !!session?.user && (mode === 'public' || isCreator);
  const isLocked   = mode === 'creator' && !isCreator;
  const elapsedStr = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;

  if (streamEnded && !isCreator) return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: C.bg, color: C.text, fontFamily: 'system-ui,-apple-system,sans-serif', gap: 20, textAlign: 'center', padding: 24 }}>
      <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(83,82,237,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
        <Music2 style={{ width: 32, height: 32, color: C.accent }} />
      </div>
      <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', margin: 0 }}>Stream Ended</h1>
      <p style={{ fontSize: 15, color: C.textSec, margin: 0, maxWidth: 340, lineHeight: 1.5 }}>
        Thanks for joining! The creator has ended this session.<br />Come back next time to vote for your favourite songs.
      </p>
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <button onClick={() => window.location.href = '/'}
          style={{ padding: '10px 24px', borderRadius: 999, background: C.accent, color: 'white', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
          Go Home
        </button>
        <button onClick={() => setStreamEnded(false)}
          style={{ padding: '10px 24px', borderRadius: 999, background: 'rgba(255,255,255,0.07)', color: C.textSec, fontSize: 13, fontWeight: 600, border: `1px solid ${C.border}`, cursor: 'pointer' }}>
          Stay on Page
        </button>
      </div>
    </div>
  );

  return (
    <div className="mv-root" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: C.bg, color: C.text, fontFamily: 'system-ui,-apple-system,sans-serif', fontSize: 14, position: 'relative' }}>

      {/* ══ TOP BAR — absolute overlay so hero thumbnail bleeds behind it ══ */}
      <header className="mv-header" style={{ height: 44, display: 'flex', alignItems: 'stretch', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20 }}>

        {/* Logo section — sidebar background, separated by right border */}
        <div className="mv-header-logo" style={{ width: 148, flexShrink: 0, background: C.sidebar, display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 16, borderRight: `1px solid ${C.border}` }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Music2 style={{ width: 12, height: 12, color: 'white' }} />
          </div>
          <span style={{ fontWeight: 700, fontSize: 13 }}>MusicVote</span>
        </div>

        {/* Content section — left side dark so tabs stay legible; right fades to transparent over thumbnail */}
        <div className="mv-header-nav" style={{ flex: 1, background: `linear-gradient(to right, ${C.bg} 0%, ${C.bg} 46%, transparent 72%)`, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px 0 14px' }}>

          {/* MUSIC / QUEUE / LIVE tabs — Groovvy exact, each does something */}
          <div style={{ display: 'flex', gap: 0, flexShrink: 0 }}>
            {(['MUSIC', 'QUEUE', 'LIVE'] as const).map(t => {
              const active = activeTab === t;
              return (
                <button key={t} onClick={() => {
                  setActiveTab(t);
                  if (t === 'QUEUE') inputRef.current?.focus();
                }}
                  style={{ padding: '5px 13px', borderRadius: 5, fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', color: active ? C.accent : C.textMut, background: active ? C.accentDim : 'transparent', border: 'none', cursor: 'pointer', transition: 'color 0.15s, background 0.15s' }}>
                  {t}
                </button>
              );
            })}
          </div>

          {/* Search bar — squarish (borderRadius 7px, not pill) matching Groovvy */}
          <div className="mv-header-search" style={{ flex: 1, maxWidth: 360, display: 'flex', gap: 6 }}>
            <div style={{ flex: 1, height: 30, display: 'flex', alignItems: 'center', gap: 7, padding: '0 10px', borderRadius: 7, background: 'rgba(255,255,255,0.07)', border: `1px solid ${C.border}` }}>
              <Search style={{ width: 12, height: 12, color: C.textMut, flexShrink: 0 }} />
              <input ref={inputRef} type="text"
                placeholder={isLocked ? '🔒 Creator-only mode' : 'Type here to search'}
                value={url}
                onChange={e => { setUrl(e.target.value); setAddError(''); }}
                onKeyDown={e => e.key === 'Enter' && canAdd && !isLocked && addSong()}
                disabled={!canAdd || isLocked}
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: C.text, cursor: (!canAdd || isLocked) ? 'not-allowed' : 'text' }}
              />
            </div>
            {/* Add button — squarish to match */}
            {canAdd && !isLocked && (
              <button onClick={addSong} disabled={adding || !url.trim()}
                style={{ height: 30, padding: '0 14px', borderRadius: 7, background: C.accent, color: 'white', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', flexShrink: 0, opacity: (adding || !url.trim()) ? 0.45 : 1 }}>
                {adding ? '…' : 'Add'}
              </button>
            )}
            {!session?.user && (
              <button onClick={() => signIn('google')}
                style={{ height: 30, padding: '0 14px', borderRadius: 7, background: C.accent, color: 'white', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                Sign In
              </button>
            )}
          </div>
          {addError && <p style={{ fontSize: 11, color: C.red, flexShrink: 0, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{addError}</p>}

          {/* Right icons — same as Groovvy: bell gear live profile */}
          <div className="mv-header-icons" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <button style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bell style={{ width: 13, height: 13, color: C.textSec }} />
            </button>
            <button style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Settings style={{ width: 13, height: 13, color: C.textSec }} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 7, background: 'rgba(255,255,255,0.05)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, display: 'inline-block' }} />
              <span style={{ fontSize: 11, fontWeight: 500, color: C.textSec }}>{liveCount}</span>
            </div>
            {session?.user && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 7, background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}` }}>
                <Avatar user={session.user} size={22} />
                <span style={{ fontSize: 11, fontWeight: 500, maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {session.user.name?.split(' ')[0]?.toUpperCase()}
                </span>
            </div>
          )}
          {session?.user && (
            <button onClick={handleSignOut} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, color: C.textMut, display: 'flex', alignItems: 'center' }}>
              <LogOut style={{ width: 13, height: 13 }} />
            </button>
          )}
          </div>
        </div>
      </header>

      {/* ══ MOBILE SEARCH BAR — hidden on desktop via CSS ══ */}
      <div className="mv-mobile-search" style={{ display: 'none', padding: '8px 12px', gap: 8, background: C.sidebar, borderBottom: `1px solid ${C.border}`, alignItems: 'center' }}>
        <div style={{ flex: 1, display: 'flex', gap: 6 }}>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addSong()}
            placeholder="Paste YouTube URL to add song…"
            style={{ flex: 1, height: 36, padding: '0 12px', borderRadius: 7, background: 'rgba(255,255,255,0.07)', border: `1px solid ${C.border}`, color: C.text, fontSize: 13, outline: 'none' }}
          />
          <button
            onClick={addSong}
            disabled={adding || !url.trim()}
            style={{ height: 36, padding: '0 14px', borderRadius: 7, background: C.accent, color: 'white', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', flexShrink: 0, opacity: adding || !url.trim() ? 0.5 : 1 }}>
            {adding ? '…' : 'Add'}
          </button>
        </div>
        {addError && <p style={{ fontSize: 11, color: C.red, flexShrink: 0 }}>{addError}</p>}
      </div>

      {/* ══ BODY ══ */}
      <div className="mv-body" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ══ LEFT SIDEBAR ══ */}
        <aside className="mv-sidebar" style={{ width: 148, flexShrink: 0, background: C.sidebar, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflowY: 'auto', paddingTop: 44 }}>
          <div style={{ padding: '18px 12px 0' }}>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.13em', color: C.textMut, marginBottom: 10, paddingLeft: 2 }}>MENU</p>
            {[
              { id: 'explore', Icon: Home,     label: 'Explore',    action: () => setActiveNav('explore') },
              { id: 'playing', Icon: Music2,    label: 'Now Playing', action: () => { setActiveNav('playing'); } },
              { id: 'queue',   Icon: ListMusic, label: 'Vote Queue',  action: () => { setActiveNav('queue'); inputRef.current?.focus(); } },
              { id: 'mode',    Icon: mode === 'creator' ? Lock : Globe, label: 'Queue Mode', action: () => { setActiveNav('mode'); if (isCreator) toggleMode(); } },
              { id: 'share',   Icon: Share2,   label: 'Share',       action: () => { setActiveNav('share'); copyLink(); } },
            ].map(({ id, Icon, label, action }) => {
              const active = activeNav === id;
              return (
                <div key={id} onClick={action} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 8px', marginBottom: 1, borderLeft: `2.5px solid ${active ? C.accent : 'transparent'}`, background: active ? 'rgba(83,82,237,0.10)' : 'transparent', borderRadius: '0 7px 7px 0', cursor: 'pointer' }}>
                  {active && <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.accent, flexShrink: 0 }} />}
                  <Icon style={{ width: 14, height: 14, color: active ? C.accent : C.textSec, flexShrink: 0, strokeWidth: 1.7 }} />
                  <span style={{ fontSize: 13, fontWeight: active ? 500 : 400, color: active ? C.accent : C.textSec }}>{label}</span>
                </div>
              );
            })}
          </div>
          <div style={{ padding: '16px 12px 0' }}>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.13em', color: C.textMut, marginBottom: 10, paddingLeft: 2 }}>LIBRARY</p>
            {[
              { Icon: Clock, label: 'Recent',     val: `${queue.length} songs` },
              { Icon: Star,  label: 'Favourites', val: `${totalVotes} votes`   },
              { Icon: Users, label: 'Listeners',  val: `${liveCount} live`     },
            ].map(({ Icon, label, val }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 8px', cursor: 'pointer', borderRadius: 7 }}>
                <Icon style={{ width: 13, height: 13, color: C.textSec, flexShrink: 0, strokeWidth: 1.7 }} />
                <span style={{ fontSize: 13, color: C.textSec, flex: 1 }}>{label}</span>
                <span style={{ fontSize: 10, color: C.textMut }}>{val}</span>
              </div>
            ))}
          </div>
          <div style={{ padding: '16px 12px 0' }}>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.13em', color: C.textMut, marginBottom: 10, paddingLeft: 2 }}>
              {isCreator ? 'CREATOR' : 'PLAYLIST'}
            </p>
            {isCreator ? (
              <>
                <div style={{ display: 'flex', gap: 4, padding: '3px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', marginBottom: 6 }}>
                  <button onClick={() => mode !== 'public' && toggleMode()} disabled={togglingMode}
                    style={{ flex: 1, padding: '4px 0', borderRadius: 6, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', background: mode === 'public' ? C.accent : 'transparent', color: mode === 'public' ? 'white' : C.textMut, transition: 'all 0.15s' }}>
                    Open
                  </button>
                  <button onClick={() => mode !== 'creator' && toggleMode()} disabled={togglingMode}
                    style={{ flex: 1, padding: '4px 0', borderRadius: 6, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', background: mode === 'creator' ? C.red : 'transparent', color: mode === 'creator' ? 'white' : C.textMut, transition: 'all 0.15s' }}>
                    Lock
                  </button>
                </div>
                {nowPlaying && (
                  <button onClick={skip} disabled={skipping}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: 'none', cursor: 'pointer', color: C.textSec, fontSize: 12, opacity: skipping ? 0.4 : 1 }}>
                    <SkipForward style={{ width: 12, height: 12, flexShrink: 0 }} />
                    {skipping ? 'Skipping…' : 'Skip Song'}
                  </button>
                )}
              </>
            ) : (
              ['Create New', 'Vote History', 'My Adds', 'Favorites'].map(label => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 8px', cursor: 'pointer', borderRadius: 7 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: C.textSec }}>{label}</span>
                </div>
              ))
            )}
          </div>
          <div style={{ flex: 1 }} />
          {session?.user ? (
            <div style={{ margin: 10, padding: '9px 10px', borderRadius: 10, background: C.card, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar user={session.user} size={28} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 11, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.user.name?.split(' ')[0]}</p>
                <p style={{ fontSize: 9, color: C.textMut, marginTop: 1 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: isCreator ? C.accent : C.green, display: 'inline-block', marginRight: 4 }} />
                  {isCreator ? 'Playing on Device' : 'Listener'}
                </p>
              </div>
            </div>
          ) : (
            <div style={{ margin: 10 }}>
              <button onClick={() => signIn('google')} style={{ width: '100%', padding: '8px 0', borderRadius: 9, background: C.accent, color: 'white', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>Sign In</button>
            </div>
          )}
        </aside>

        {/* ══ CONTENT + PLAYER WRAPPER ══ */}
        <div className="mv-content" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

          {/* ══ HERO — extends behind the absolute header; thumbnail bleeds to top ══ */}
          <div className="mv-hero" style={{ height: 344, flexShrink: 0, background: C.bg, display: 'flex', overflow: 'hidden', position: 'relative' }}>

            {/* Left 58%: text — paddingTop:76 keeps text below the 44px header */}
            <div className="mv-hero-text" style={{ flex: '0 0 58%', padding: '76px 40px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
              <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.40)', marginBottom: 14, lineHeight: 1 }}>
                {nowPlaying ? 'Trending New Hits' : 'Your Vote Queue'}
              </p>
              <h1 className="mv-hero-title" style={{ fontWeight: 800, fontSize: 54, letterSpacing: '-0.03em', lineHeight: 1.05, marginBottom: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {nowPlaying?.title ?? 'Add a Song to Start'}
              </h1>
              <p style={{ fontSize: 15, color: C.textSec, marginBottom: 24, lineHeight: 1.4 }}>
                {nowPlaying
                  ? <><strong style={{ color: C.text, fontWeight: 600 }}>{nowPlaying.votes} votes</strong>&nbsp;&nbsp;&nbsp;<span style={{ color: C.textMut }}>63Million Plays</span></>
                  : isLocked ? 'Queue is creator-only' : 'Paste a YouTube URL in the search bar above'}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {!session?.user ? (
                  <button onClick={() => signIn('google')}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 999, background: C.accent, color: 'white', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                    <Plus style={{ width: 13, height: 13 }} />Sign In to Add
                  </button>
                ) : canAdd && !isLocked ? (
                  <button onClick={() => inputRef.current?.focus()}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 999, background: C.accent, color: 'white', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                    {nowPlaying ? <><Music2 style={{ width: 13, height: 13 }} />Playing Now</> : <><Plus style={{ width: 13, height: 13 }} />Add Song</>}
                  </button>
                ) : null}
                <button onClick={copyLink}
                  style={{ width: 34, height: 34, borderRadius: '50%', background: copied ? 'rgba(83,82,237,0.28)' : 'rgba(83,82,237,0.14)', border: '1.5px solid rgba(83,82,237,0.36)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: copied ? C.green : C.accent, flexShrink: 0 }}>
                  {copied ? <Check style={{ width: 14, height: 14 }} /> : <Heart style={{ width: 14, height: 14 }} />}
                </button>
                {endsAt && (
                  <span style={{ fontSize: 12, fontWeight: 500, color: countdown <= 30 ? C.red : C.textMut }}>
                    {countdown >= 60 ? `${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, '0')}` : `${countdown}s`}
                  </span>
                )}
              </div>
            </div>

            {/* Right 42%: album art thumbnail (Groovvy artist photo style) */}
            <div className="mv-hero-thumb" style={{ flex: '0 0 42%', position: 'relative', overflow: 'hidden' }}>
              {nowPlaying ? (
                <>
                  {/* maxresdefault = 1280×720, true 16:9, no letterbox bars.
                      onError falls back to hqdefault in case maxres doesn't exist. */}
                  <img
                    src={ytThumbHD(nowPlaying.extractedId)}
                    onError={(e) => { const t = e.target as HTMLImageElement; if (!t.src.includes('hqdefault')) t.src = ytThumb(nowPlaying.extractedId); }}
                    alt={nowPlaying.title}
                    style={{ position: 'absolute', top: 0, right: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center center', display: 'block' }}
                  />
                  {/* left fade — text readability */}
                  <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to right, ${C.bg} 0%, rgba(13,13,13,0.55) 35%, transparent 65%)`, pointerEvents: 'none' }} />
                  {/* bottom fade — smooth transition into cards */}
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 72, background: `linear-gradient(to bottom, transparent, ${C.bg})`, pointerEvents: 'none' }} />
                </>
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 28 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, opacity: 0.14 }}>
                    {[0, 1, 2].map(i => <span key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: 'white', display: 'block' }} />)}
                  </div>
                </div>
              )}
            </div>

            {/* Chevrons — far right */}
            <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 2, zIndex: 10 }}>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.20)', fontSize: 11, lineHeight: 1, padding: 2 }}>▲</button>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.20)', fontSize: 11, lineHeight: 1, padding: 2 }}>▼</button>
            </div>
          </div>

          {/* ══ BELOW HERO: left main + right player ══ */}
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

            {/* ══ LEFT MAIN — fills full remaining height (NO scroll, flex-col) ══ */}
            <main className="mv-main" style={{ flex: 1, overflow: 'hidden', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* VOTE QUEUE — flex:1 so it takes equal share (doubles its height vs bottom grid) */}
              <div style={{ background: C.card, borderRadius: 12, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px 0', flexShrink: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>Vote Queue</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <button style={{ fontSize: 12, color: C.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>See all</button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.red, display: 'inline-block' }} />
                      <span style={{ fontSize: 9, fontWeight: 700, color: C.red, textTransform: 'uppercase', letterSpacing: '0.1em' }}>LIVE</span>
                    </div>
                  </div>
                </div>
                <div style={{ flex: 1, padding: '12px 16px 14px', display: 'flex', alignItems: 'center' }}>
                  {queue.length === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(83,82,237,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <ListMusic style={{ width: 16, height: 16, color: C.accent }} />
                      </div>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 500, color: C.textSec }}>Queue is empty</p>
                        <p style={{ fontSize: 11, color: C.textMut, marginTop: 2 }}>
                          {isLocked ? 'Queue is locked to creator only.' : 'Paste a YouTube URL above to get started!'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="no-scrollbar" style={{ display: 'flex', gap: 14, overflowX: 'auto', width: '100%', alignItems: 'flex-start', paddingBottom: 4 }}>
                      {queue.map((track, i) => {
                        const voted    = myVote === track.id;
                        const locked   = !!myVote && !voted;   // voted elsewhere — dim this card
                        const canVote  = !!session?.user && !locked;
                        return (
                          <div key={track.id} style={{ flexShrink: 0, width: 104, display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: locked ? 0.35 : 1, transition: 'opacity 0.2s' }}>
                            <div
                              onClick={() => canVote && vote(track.id, 'up')}
                              title={locked ? 'Remove your current vote first' : voted ? 'Click to remove your vote' : 'Click to vote'}
                              style={{ width: 96, height: 96, borderRadius: 12, overflow: 'hidden', marginBottom: 8, cursor: canVote ? 'pointer' : 'not-allowed', border: i === 0 ? `2.5px solid ${C.gold}` : voted ? `2.5px solid ${C.accent}` : '2.5px solid transparent', position: 'relative', transition: 'border-color 0.15s' }}>
                              <img src={ytThumb(track.extractedId)} alt={track.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              {voted && (
                                <div style={{ position: 'absolute', inset: 0, background: 'rgba(83,82,237,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <ChevronUp style={{ width: 28, height: 28, color: 'white' }} />
                                </div>
                              )}
                            </div>
                            <p style={{ fontSize: 12, fontWeight: 600, textAlign: 'center', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: i === 0 ? C.text : C.textSec, marginBottom: 2 }}>{track.title}</p>
                            <p style={{ fontSize: 10, fontWeight: 500, color: i === 0 ? C.gold : voted ? C.accent : C.textMut }}>{track.votes} vote{track.votes !== 1 ? 's' : ''}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* BOTTOM GRID — fills all remaining height: Quick Actions + Top Charts */}
              <div className="mv-bottom-grid" style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '2fr 3fr', gap: 16 }}>

                {/* Quick Actions — stretches full grid height */}
                <div style={{ background: C.card, borderRadius: 12, padding: '8px 14px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexShrink: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>Quick Actions</span>
                    <button style={{ fontSize: 12, color: C.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>See all</button>
                  </div>
                  {/* 2×2 grid — cards fill the full remaining height */}
                  <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 10 }}>
                    {[
                      { label: 'Share Queue',  sub: 'Invite friends',            bg: '#1e1a4a', Icon: Share2,    ic: C.accent,  action: copyLink },
                      { label: mode === 'public' ? 'Open Queue' : 'Locked',  sub: isCreator ? 'Click to toggle' : 'Queue mode', bg: mode === 'creator' ? '#3a1a1a' : '#1a2e1a', Icon: mode === 'creator' ? Lock : Globe, ic: mode === 'creator' ? C.red : C.green, action: isCreator ? toggleMode : undefined },
                      { label: `${liveCount} Live`,  sub: 'Watching now',        bg: '#1a1e3a', Icon: Users,    ic: '#6ea8fe', action: undefined },
                      { label: isCreator && nowPlaying ? 'Skip Song' : `${totalVotes} Votes`, sub: isCreator && nowPlaying ? 'Next track' : 'This session', bg: '#2a1e10', Icon: isCreator && nowPlaying ? SkipForward : Trophy, ic: isCreator && nowPlaying ? '#fb923c' : C.gold, action: isCreator && nowPlaying ? skip : undefined },
                    ].map(({ label, sub, bg, Icon, ic, action }) => (
                      <button key={label} onClick={action}
                        style={{ background: bg, borderRadius: 10, padding: '12px 14px', border: 'none', cursor: action ? 'pointer' : 'default', textAlign: 'left', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '100%', height: '100%' }}>
                        <Icon style={{ width: 14, height: 14, color: ic }} />
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.2 }}>{label}</p>
                          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.42)', marginTop: 2 }}>{sub}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Top Charts — stretches full grid height */}
                <div style={{ background: C.card, borderRadius: 12, padding: '8px 14px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexShrink: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>Top Charts</span>
                    <button style={{ fontSize: 12, color: C.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>See all</button>
                  </div>
                  {/* List scrolls inside the card if there are many songs */}
                  <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                    {queue.length === 0 ? (
                      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMut, fontSize: 12 }}>
                        No songs in queue
                      </div>
                    ) : (
                      queue.slice(0, 6).map((track, i) => {
                        const voted   = myVote === track.id;
                        const locked  = !!myVote && !voted;
                        return (
                          <div key={track.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: i < Math.min(queue.length, 6) - 1 ? `1px solid ${C.border}` : 'none', opacity: locked ? 0.38 : 1, transition: 'opacity 0.2s' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, width: 22, textAlign: 'center', flexShrink: 0, color: i === 0 ? C.gold : C.textMut }}>
                              {String(i + 1).padStart(2, '0')}
                            </span>
                            <img src={ytThumb(track.extractedId)} alt="" style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.title}</p>
                              <p style={{ fontSize: 10, color: voted ? C.accent : C.textSec, marginTop: 1 }}>{track.votes} vote{track.votes !== 1 ? 's' : ''}</p>
                            </div>
                            <button
                              onClick={() => !locked && vote(track.id, 'up')}
                              disabled={locked}
                              title={locked ? 'Remove your current vote first' : voted ? 'Remove vote' : 'Vote'}
                              style={{ width: 26, height: 26, borderRadius: 6, background: voted ? C.accent : 'rgba(83,82,237,0.18)', border: 'none', cursor: locked ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: voted ? 'white' : C.accent }}>
                              <ChevronUp style={{ width: 13, height: 13 }} />
                            </button>
                            {voted && (
                              <button
                                onClick={() => vote(track.id, 'down')}
                                title="Remove your vote"
                                style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(239,68,68,0.18)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: C.red }}>
                                <ChevronDown style={{ width: 13, height: 13 }} />
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

              </div>
            </main>

            {/* ══ RIGHT PLAYER PANEL — doubled to 430px ══
                Video iframe lives here so it's big and watchable.
                Background = C.bg so only the card shows (no full-height coloured column).
            */}
            <aside className={`mv-player${showMobilePlayer ? ' mv-show' : ''}`} style={{ width: 430, flexShrink: 0, background: C.bg, padding: '16px 20px 16px 8px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

              <div style={{ background: C.card, borderRadius: 14, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>

                {/* "Player" header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px 11px', borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Player</span>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 14 }}>
                    {nowPlaying
                      ? [0, 1, 2, 3].map(i => <span key={i} className="music-bar" />)
                      : <span style={{ fontSize: 14, color: C.textMut, lineHeight: 1 }}>⊟</span>}
                  </div>
                </div>

                {/* VIDEO AREA — iframe for creator; thumbnail preview for viewers */}
                <div style={{ flex: 1, background: C.cardHi, overflow: 'hidden', position: 'relative' }}>
                  {isCreator ? (
                    <>
                      <div id="yt-player-div" style={{ width: '100%', height: '100%' }} />
                      {!nowPlaying && (
                        <div style={{ position: 'absolute', inset: 0, background: C.cardHi, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, pointerEvents: 'none' }}>
                          <Music2 style={{ width: 44, height: 44, color: C.textMut }} />
                          <p style={{ fontSize: 12, color: C.textMut }}>No song playing</p>
                        </div>
                      )}
                    </>
                  ) : nowPlaying ? (
                    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                      <img
                        src={ytThumbHD(nowPlaying.extractedId)}
                        onError={(e) => { const t = e.target as HTMLImageElement; if (!t.src.includes('hqdefault')) t.src = ytThumb(nowPlaying.extractedId); }}
                        alt={nowPlaying.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.38)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Music2 style={{ width: 20, height: 20, color: 'white' }} />
                        </div>
                        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.70)', fontWeight: 500 }}>Playing on creator&apos;s device</p>
                      </div>
                    </div>
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                      <Music2 style={{ width: 44, height: 44, color: C.textMut }} />
                      <p style={{ fontSize: 12, color: C.textMut }}>No song playing</p>
                    </div>
                  )}
                </div>

                {/* Song info — centered below video */}
                <div style={{ padding: '14px 18px 10px', textAlign: 'center', flexShrink: 0 }}>
                  <p style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 5 }}>
                    {nowPlaying?.title ?? 'Nothing Playing'}
                  </p>
                  <p style={{ fontSize: 13, color: C.textSec, marginBottom: 3 }}>
                    {nowPlaying ? `${nowPlaying.votes} votes` : 'Add a song above'}
                  </p>
                  <p style={{ fontSize: 11, color: C.textMut }}>
                    {nowPlaying ? 'Best of 2024' : ''}
                  </p>
                </div>

                {/* Progress bar */}
                <div style={{ padding: '4px 18px 12px', flexShrink: 0 }}>
                  <div style={{ position: 'relative', height: 3, borderRadius: 999, background: 'rgba(255,255,255,0.09)', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 999, background: C.accent, transition: 'width 1s linear', width: `${pct}%` }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    <span style={{ fontSize: 10, color: C.textMut }}>{elapsedStr}</span>
                    <span style={{ fontSize: 10, color: C.textMut }}>5:00</span>
                  </div>
                </div>

                {/* Blue controls — Groovvy exact: [Share] [●] [Skip] + ▲ VOTES */}
                <div style={{ background: C.accent, flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '14px 28px 10px' }}>
                    <button onClick={copyLink}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', opacity: 0.85 }}>
                      {copied ? <Check style={{ width: 17, height: 17, color: 'white' }} /> : <Share2 style={{ width: 17, height: 17, color: 'white' }} />}
                      <span style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.60)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{copied ? 'Copied' : 'Share'}</span>
                    </button>
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 14px rgba(0,0,0,0.28)', flexShrink: 0 }}>
                      <Music2 style={{ width: 20, height: 20, color: C.accent }} />
                    </div>
                    {isCreator ? (
                      <button onClick={skip} disabled={skipping}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', opacity: skipping ? 0.4 : 0.85 }}>
                        <SkipForward style={{ width: 17, height: 17, color: 'white' }} />
                        <span style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.60)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{skipping ? '…' : 'Skip'}</span>
                      </button>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                        <Users style={{ width: 17, height: 17, color: 'white', opacity: 0.85 }} />
                        <span style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.60)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{liveCount}</span>
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'center', padding: '6px 0 12px', borderTop: '1px solid rgba(255,255,255,0.16)' }}>
                    <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.60)' }}>
                      {queue.length > 0 ? '▲  VOTES' : 'QUEUE EMPTY'}
                    </span>
                  </div>
                </div>

              </div>
            </aside>

          </div>
        </div>
      </div>

      {/* ══ MOBILE BOTTOM NAV BAR — hidden on desktop via CSS ══ */}
      <div className="mv-mobile-bar" style={{ display: 'none', position: 'fixed', bottom: 0, left: 0, right: 0, height: 56, background: C.sidebar, borderTop: `1px solid ${C.border}`, alignItems: 'center', justifyContent: 'space-around', zIndex: 40, padding: '0 8px' }}>
        <button onClick={() => setActiveNav('explore')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', color: activeNav === 'explore' ? C.accent : C.textSec, minWidth: 52, padding: '6px 0' }}>
          <Home style={{ width: 20, height: 20 }} />
          <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Explore</span>
        </button>
        <button onClick={() => setActiveNav('queue')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', color: activeNav === 'queue' ? C.accent : C.textSec, minWidth: 52, padding: '6px 0' }}>
          <ListMusic style={{ width: 20, height: 20 }} />
          <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Queue</span>
        </button>
        <button
          onClick={() => setShowMobilePlayer(p => !p)}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', color: showMobilePlayer ? C.accent : C.textSec, minWidth: 52, padding: '6px 0' }}>
          <Music2 style={{ width: 22, height: 22 }} />
          <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Player</span>
        </button>
        <button onClick={copyLink} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', color: copied ? C.green : C.textSec, minWidth: 52, padding: '6px 0' }}>
          {copied ? <Check style={{ width: 20, height: 20 }} /> : <Share2 style={{ width: 20, height: 20 }} />}
          <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{copied ? 'Copied' : 'Share'}</span>
        </button>
      </div>
    </div>
  );
}
