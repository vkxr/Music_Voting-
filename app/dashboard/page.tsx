'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') { router.replace('/'); return; }
    if (status !== 'authenticated' || !session?.user) return;
    fetch('/api/user/me')
      .then(r => r.json())
      .then(d => { if (d.id) router.replace(`/stream/${d.id}`); })
      .catch(() => router.replace('/'));
  }, [status, session, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex items-center gap-3 text-zinc-500">
        <div className="w-5 h-5 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
        <span className="text-sm font-medium">Loading…</span>
      </div>
    </div>
  );
}
