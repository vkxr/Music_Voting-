'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { Music2, ArrowRight, Zap, Users, Trophy, Globe, Sparkles } from 'lucide-react';

const FEATURES = [
  { icon: Zap,    title: 'Real-time voting',    desc: 'Every vote updates the queue instantly across all devices — no refresh needed.' },
  { icon: Users,  title: 'No account to vote',  desc: 'Viewers vote without signing up. Open the link, start voting immediately.' },
  { icon: Trophy, title: 'Top song always wins', desc: 'Highest-voted song plays next — powered by Redis sorted sets.' },
  { icon: Globe,  title: 'Live for everyone',   desc: 'Every viewer sees the same countdown and queue in perfect sync.' },
];

export default function Landing() {
  const { data: session } = useSession();
  const router = useRouter();
  const howRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (session?.user) router.push('/dashboard');
  }, [session, router]);

  return (
    <div className="text-white overflow-x-hidden" style={{ background: '#070708' }}>

      {/* ══════════════════════════════════════════
          HERO — full viewport concert stage
      ══════════════════════════════════════════ */}
      <section className="relative h-screen overflow-hidden flex flex-col">

        {/* ── REAL CONCERT PHOTO — grayscale + darkened to match AENA aesthetic ── */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&w=1920&q=85"
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none select-none"
          style={{ filter: 'grayscale(100%) contrast(1.25) brightness(0.38)' }}
        />

        {/* Dark vignette — darkens the edges so center stage pops */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 28%, rgba(0,0,0,0.62) 100%)',
          }}
        />
        {/* Bottom fade — makes text legible over the photo */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(to bottom, rgba(7,7,8,0.22) 0%, rgba(7,7,8,0) 22%, rgba(7,7,8,0) 46%, rgba(7,7,8,0.60) 70%, rgba(7,7,8,0.97) 100%)',
          }}
        />

        {/* ── NAV ── */}
        <nav className="relative z-20 flex items-center justify-between px-10 py-6 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-white/10 rounded flex items-center justify-center">
              <Music2 className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-[13px] font-black tracking-[0.15em] uppercase">MusicVote</span>
          </div>

          <div className="hidden lg:flex items-center gap-3 text-[11px] font-medium text-white/40 uppercase tracking-widest">
            <button
              onClick={() => howRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="hover:text-white transition-colors"
            >
              How it Works
            </button>
            <span className="text-white/15">/</span>
            <button className="hover:text-white transition-colors">Features</button>
            <span className="text-white/15">/</span>
            <button className="hover:text-white transition-colors">Queue</button>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => signIn('google')}
              className="text-[11px] font-semibold text-white/45 hover:text-white transition-colors uppercase tracking-widest"
            >
              Sign In
            </button>
            <button
              onClick={() => signIn('google')}
              className="text-[11px] font-black text-white bg-[#1a1aee] hover:bg-[#2828ff] px-5 py-2.5 rounded-full transition-colors uppercase tracking-widest"
            >
              Sign Up
            </button>
          </div>
        </nav>

        {/* ── [ MUSIC QUEUE ] bracket tag top-right ── */}
        <div className="absolute top-24 right-10 z-20">
          <span className="text-[10px] tracking-[0.3em] uppercase text-white/28 border border-white/12 px-3 py-1.5 font-medium">
            [ MUSIC QUEUE ]
          </span>
        </div>

        {/* ── HERO TEXT — bottom left ── */}
        <div className="relative z-10 flex-1 flex flex-col justify-end px-10 pb-12">
          <div className="flex items-end justify-between gap-8">

            <div>
              <h1
                className="font-black leading-[0.88] tracking-tight text-white"
                style={{ fontSize: 'clamp(56px, 8vw, 108px)', letterSpacing: '-0.03em' }}
              >
                Don&apos;t just listen.
                <br />
                <span style={{ color: '#FF3B2F' }} className="inline-flex items-center gap-4">
                  Vote.
                  <Globe
                    className="inline opacity-80"
                    style={{ width: '0.50em', height: '0.50em' }}
                  />
                </span>
              </h1>

              <button
                onClick={() => signIn('google')}
                className="mt-8 inline-flex items-center gap-3 text-[13px] font-bold text-white border border-white/25 hover:border-white/55 hover:bg-white/5 px-7 py-3.5 rounded-full transition-all uppercase tracking-widest"
              >
                Start Your Queue
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="max-w-[240px] pb-1 hidden md:block">
              <p className="text-[11px] text-white/30 leading-relaxed uppercase tracking-wide">
                Share a link with your audience.
                <br />They submit YouTube songs
                <br />and vote in real-time.
                <br />Highest vote plays — automatically.
              </p>
              <button
                onClick={() => howRef.current?.scrollIntoView({ behavior: 'smooth' })}
                className="mt-4 text-[10px] text-white/30 hover:text-white/60 transition-colors uppercase tracking-widest underline underline-offset-4"
              >
                How it works ↓
              </button>
            </div>

          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          HOW IT WORKS
      ══════════════════════════════════════════ */}
      <section ref={howRef} className="border-t border-white/[0.06] py-24" style={{ background: '#060608' }}>
        <div className="max-w-6xl mx-auto px-10">
          <div className="text-center mb-16">
            <p className="text-[10px] text-white/30 font-bold tracking-[0.3em] uppercase mb-3">How it works</p>
            <h2 className="text-4xl font-black tracking-tight">Up and running in 60 seconds</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                step: '01',
                title: 'Sign in & get your link',
                desc: 'One-click Google sign-in. You get a unique public URL to share — no config needed.',
              },
              {
                step: '02',
                title: 'Share with your audience',
                desc: 'Drop the link in your stream chat. Viewers open it and start voting immediately.',
              },
              {
                step: '03',
                title: 'Let democracy play',
                desc: 'Top-voted song plays. Queue updates live. New round every 5 minutes.',
              },
            ].map((s) => (
              <div
                key={s.step}
                className="border border-white/[0.06] rounded-2xl p-8"
                style={{ background: '#0e0e14' }}
              >
                <div className="text-5xl font-black text-white/[0.05] mb-5 font-mono">{s.step}</div>
                <h3 className="font-bold text-white mb-2.5">{s.title}</h3>
                <p className="text-sm text-white/35 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          FEATURES
      ══════════════════════════════════════════ */}
      <section className="border-t border-white/[0.06] py-24" style={{ background: '#060608' }}>
        <div className="max-w-6xl mx-auto px-10">
          <div className="text-center mb-16">
            <p className="text-[10px] text-white/30 font-bold tracking-[0.3em] uppercase mb-3">Features</p>
            <h2 className="text-4xl font-black tracking-tight">Built for speed &amp; fairness</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="border border-white/[0.06] hover:border-white/[0.12] rounded-2xl p-6 transition-colors"
                style={{ background: '#0e0e14' }}
              >
                <div className="w-10 h-10 rounded-xl bg-white/[0.05] flex items-center justify-center mb-4">
                  <f.icon className="w-5 h-5 text-white/60" />
                </div>
                <h3 className="font-bold text-sm text-white mb-2">{f.title}</h3>
                <p className="text-xs text-white/35 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          CTA
      ══════════════════════════════════════════ */}
      <section className="border-t border-white/[0.06] py-24" style={{ background: '#060608' }}>
        <div className="max-w-xl mx-auto px-10 text-center">
          <div className="border border-white/[0.06] rounded-3xl p-14" style={{ background: '#0e0e14' }}>
            <h2 className="text-4xl font-black tracking-tight mb-4">
              Start your{' '}
              <span style={{ color: '#FF3B2F' }}>music queue</span> now
            </h2>
            <p className="text-white/35 mb-10 text-sm">Free. No credit card. Your crowd will love it.</p>
            <button
              onClick={() => signIn('google')}
              className="inline-flex items-center gap-2.5 text-[13px] font-black text-white bg-[#1a1aee] hover:bg-[#2828ff] px-10 py-4 rounded-full transition-colors uppercase tracking-widest"
            >
              <Sparkles className="w-4 h-4" />
              Launch with Google
            </button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer
        className="border-t border-white/[0.06] py-8 px-10 flex items-center justify-between"
        style={{ background: '#060608' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-white/10 rounded flex items-center justify-center">
            <Music2 className="w-3 h-3 text-white" />
          </div>
          <span className="text-[13px] font-black tracking-widest uppercase">MusicVote</span>
        </div>
        <p className="text-xs text-white/20 uppercase tracking-widest">Real-time music democracy</p>
      </footer>

    </div>
  );
}
