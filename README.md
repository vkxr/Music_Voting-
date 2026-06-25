# MusicVote

A real-time collaborative music queue where the audience votes on what plays next. Built for live events, parties, streams, and anywhere a group needs to agree on music democratically.

---

## What Is MusicVote?

MusicVote lets a **creator** (DJ, host, streamer) open a live session and hand control of the playlist over to the **audience**. Anyone with the link can submit YouTube songs and vote on what plays next — the highest-voted song always wins. When a song finishes, the next most-voted song in the queue advances automatically.

No app install needed. Works in any browser. No polling — every vote and queue change appears instantly across all connected clients via Server-Sent Events.

---

## Use Cases

| Scenario | How MusicVote Helps |
|---|---|
| House party | Guests submit songs via their phones; the crowd votes; no one argues about the aux |
| Twitch / YouTube stream | Viewers vote on the next song in real time; creator sees the live queue in the player panel |
| Office playlist | Team submits songs; fairest song wins without anyone dominating |
| DJ sets | Creator pre-queues tracks, crowd votes to reorder them live |
| Campus events | Open link on projector; anyone in the room can participate |
| Study rooms | Shared ambient music where everyone has equal say |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Auth | NextAuth v4 — Google OAuth |
| Database | Neon PostgreSQL via Prisma (user identity only) |
| Cache / State | Redis Cloud (node-redis v4) — all live session state lives here |
| Real-time | Server-Sent Events (SSE) + Redis Pub/Sub |
| Video | YouTube IFrame API (autoplay, end-detection) |
| Metadata | youtube-search-api (title fetch only) |
| UI | Inline styles, Lucide React icons |
| Hosting | Vercel-compatible (Edge-friendly SSE) |

---

## Architecture

### The Stateless-Redis Design

MusicVote uses **Redis as the single source of truth** for all live session data. PostgreSQL is only touched once per user: when they first sign in, their email is written to the DB and their ID is cached in Redis (`uid:${email}`) for 24 hours. Every subsequent request — votes, queue changes, heartbeats — hits Redis only.

This choice has three benefits:

1. **No database bottleneck during live events.** A room with 500 people voting simultaneously never touches Postgres.
2. **Automatic cleanup.** All Redis keys carry a 1-hour TTL. If the creator closes the tab without signing out, the session evaporates naturally within an hour with no orphaned rows.
3. **Trivial horizontal scaling.** Any number of Next.js instances can serve the same session because all state is external.

### Data Flow

```
Browser (Creator)                  Browser (Audience × N)
       │                                    │
       │  POST /api/streams (add song)      │  POST /api/streams/upvote
       │  POST /api/streams/next (skip)     │  GET  /api/streams/live  ──────────┐
       │  POST /api/streams/heartbeat       │                                    │
       ▼                                    ▼                                    │
┌─────────────────────────────────────────────────────────────────┐             │
│                     Next.js API Routes                          │             │
│  - Validate session (NextAuth cookie → Redis uid cache)         │             │
│  - Mutate Redis sorted set / hashes                             │             │
│  - Publish event to Redis channel  updates:${creatorId}         │             │
└───────────────────────────────┬─────────────────────────────────┘             │
                                │                                               │
                         Redis Pub/Sub                                          │
                                │                                               │
                 ┌──────────────▼──────────────┐                               │
                 │   GET /api/streams/live      │◄──────────────────────────────┘
                 │   (SSE — one per client)     │  EventSource (long-lived HTTP)
                 │   Subscribes to Redis channel│
                 │   Pipes events to browser    │
                 └──────────────┬───────────────┘
                                │  SSE events:
                                │  INIT, QUEUE_UPDATE, NOW_PLAYING, MODE_CHANGE
                                ▼
                         All browsers update instantly
```

### Redis Key Schema

| Key | Type | Purpose | TTL |
|---|---|---|---|
| `queue:${creatorId}` | Sorted Set | Vote-ordered song queue. Score = vote count | 3600s |
| `song:${streamId}` | Hash | Song metadata: `title`, `thumbnail`, `extractedId`, `addedByUserId` | 3600s |
| `now_playing:${creatorId}` | String (JSON) | Currently playing `QueueItem` | 3600s |
| `round_ends_at:${creatorId}` | String | Unix ms timestamp when current round ends | 3600s |
| `queue_mode:${creatorId}` | String | `'public'` or `'creator'` | 3600s |
| `queue_vids:${creatorId}` | Set | YouTube video IDs in queue (duplicate guard) | 3600s |
| `session_songs:${creatorId}` | Set | All stream IDs added this session (heartbeat + cleanup) | 3600s |
| `added:${userId}:${creatorId}` | String | Rate-limit: audience can add 1 song per 2 rounds | ROUND_S × 2 |
| `active_vote:${identifier}:${creatorId}` | String | The single stream ID this user has voted for | 7200s |
| `uid:${email}` | String | Cached DB user ID (avoids Prisma hit on every request) | 86400s |
| `lock:next:${creatorId}` | String | Distributed mutex — prevents double-advance on concurrent `/next` calls | 5s |

### Real-time: SSE + Redis Pub/Sub

Each browser opens one long-lived HTTP connection to `GET /api/streams/live`. The server:

1. Sends an `INIT` event with the full current state (queue, now-playing, remaining round time, mode).
2. Subscribes a Redis Pub/Sub client to `updates:${creatorId}`.
3. Any time another request mutates state (vote, add song, skip, mode change), it calls `publishUpdate()` which writes a JSON event to the Redis channel.
4. The SSE handler receives it and pushes it to all connected browsers within milliseconds.
5. A 25-second keepalive comment (`: ping`) prevents proxies from closing idle connections.

`remainingMs` is sent instead of an absolute timestamp so clients with different system clocks all display the same countdown.

### YouTube Playback

The player uses the **YouTube IFrame API** (not a plain `<iframe>`). This matters because:

- The API fires `onStateChange` events, specifically `state === 0` (video ended).
- When a video ends naturally, the client immediately calls `POST /api/streams/next` with `force: true`, advancing the queue without waiting for the countdown timer.
- The 5-minute round timer is kept as a **fallback only** — it handles cases where the end event doesn't fire (IFrame blocked, tab backgrounded, etc.).
- A distributed Redis lock (`lock:next:${creatorId}`, TTL 5s) prevents two clients from advancing the queue simultaneously.

---

## Voting System

### One Vote Per User

Each user holds at most **one active vote** per creator session at a time.

- Voting for a song stores `active_vote:${identifier}:${creatorId}` = `streamId` in Redis.
- Clicking the same song again **removes** the vote (toggle-off).
- Clicking a **different** song while a vote is active is **rejected** — the user must remove their current vote first.
- The downvote (↓) button in Top Charts only appears on the song the user voted for — it acts as a "remove vote" action.
- Songs the user cannot vote for are dimmed to 35% opacity and show `cursor: not-allowed`.
- On page refresh, `GET /api/streams/myvote` restores the user's current active vote from Redis so the UI state is consistent.

This enforces that every participant has exactly one unit of influence. Users must commit — they cannot casually upvote everything they like.

### Audience Song Submission Limit

Non-creator users can add **one song per round** (enforced via `added:${userId}:${creatorId}` with TTL of `2 × ROUND_SECONDS`). This prevents one person from flooding the queue.

Creators can add unlimited songs.

### Queue Mode

Creators can toggle between:

- **Open** (`public`) — anyone can submit songs
- **Locked** (`creator`) — only the creator can add songs; audience can still vote

The mode change is broadcast instantly via SSE `MODE_CHANGE` event.

---

## Session Lifecycle

```
Creator opens /stream/[creatorId]
        │
        ├─ Heartbeat fires every 30s → refreshes all session key TTLs
        │
        ├─ Audience joins via shared link
        │  └─ SSE connection opened → receives INIT event with full state
        │
        ├─ Songs added → auto-start if queue was empty
        │  └─ QUEUE_UPDATE / NOW_PLAYING broadcast to all clients
        │
        ├─ Votes cast → sorted set scores updated → re-broadcast queue
        │
        ├─ Video ends (or round timer expires) → next highest-voted song plays
        │  └─ Distributed lock prevents double-advance
        │
        └─ Creator signs out → cleanup route deletes ALL session keys instantly
                              (or keys expire after 1 hour via TTL)
```

---

## API Reference

| Method | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/api/streams` | Required | Add a YouTube song to the queue |
| `GET` | `/api/streams?creatorId=` | None | Snapshot of queue + now-playing |
| `GET` | `/api/streams/live?creatorId=` | None | SSE stream (real-time updates) |
| `POST` | `/api/streams/upvote` | None (session preferred) | Cast one vote for a song |
| `POST` | `/api/streams/downvote` | None (session preferred) | Remove your vote from a song |
| `GET` | `/api/streams/myvote?creatorId=` | None (session preferred) | Get the user's current active vote |
| `POST` | `/api/streams/next` | None | Advance to next song (`force` flag bypasses timer check) |
| `POST` | `/api/streams/mode` | Creator only | Toggle queue mode between public / creator |
| `POST` | `/api/streams/heartbeat?creatorId=` | Creator only | Refresh all Redis key TTLs |
| `POST` | `/api/streams/cleanup` | Creator only | Delete all session data on sign-out |
| `GET` | `/api/user/me` | Required | Get authenticated user's DB ID |
| `GET/POST` | `/api/auth/[...nextauth]` | — | NextAuth Google OAuth handler |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A Google Cloud project with OAuth 2.0 credentials
- A Neon PostgreSQL database (free tier works fine)
- A Redis Cloud instance or any Redis 6+ server

### Environment Variables

Create `.env.local` in the project root:

```env
# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-here

# Google OAuth (console.cloud.google.com)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Neon PostgreSQL
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require

# Redis Cloud
REDIS_HOST=your-redis-host.db.redis.io
REDIS_PORT=13032
REDIS_PASSWORD=your-redis-password
```

### Installation

```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

Open `http://localhost:3000`. Sign in with Google. Your Google account's DB user ID becomes your `creatorId`. Share `/stream/[your-id]` with your audience.

---

## Why MusicVote is Beneficial

### For Creators / Hosts

- **No manual queue management.** The crowd votes and the best song wins automatically.
- **Engagement driver.** Giving people agency makes them more invested in staying in the session.
- **Flexible control.** Lock the queue when you need full control; open it when you want audience participation.
- **Zero setup for audience.** Share one URL — no accounts required to vote.

### For Audiences

- **Democratic music selection.** Your vote counts equally regardless of when you joined.
- **Transparent queue.** Live vote counts and queue order are visible to everyone simultaneously.
- **Commitment mechanic.** One-vote rule forces real choices — you cannot upvote everything.
- **Mobile-friendly.** The full UI works in a phone browser with no install required.

### Technical Benefits

- **No database writes during live events.** Redis handles all runtime state; Postgres is only ever queried for user identity.
- **Works at any scale.** Redis Pub/Sub + SSE handles hundreds of simultaneous voters without polling overhead or long-polling latency.
- **Self-healing.** All session state auto-expires via Redis TTL; no orphaned data, no manual cleanup scripts.
- **Clock-skew proof.** The server sends `remainingMs` (time remaining) rather than an absolute `endsAt` timestamp, so clients on different system clocks all display the same countdown.

---

## Current Limitations

- **YouTube-only.** Video source is locked to YouTube via the IFrame API.
- **One active session per creator.** One user account = one queue. Running multiple simultaneous rooms requires multiple accounts.
- **No persistent history.** Once a session ends, Redis TTL clears everything. There is no replay or song history.
- **Anonymous voting uses IP.** Logged-in users are tracked by email; unauthenticated visitors by IP (breaks behind shared NAT or VPNs in local dev — all requests appear as `'anon'`).
- **No mobile push notifications.** Users don't get notified when their song starts playing.
- **Round timer is a fixed 5-minute fallback** regardless of actual song length. The YouTube end event is the primary trigger but is not guaranteed in all environments.

---

## Future Scope

### AI Integration

| Feature | How It Would Work |
|---|---|
| **AI DJ mode** | An LLM agent monitors the queue and room mood (via genre clustering or chat sentiment) and auto-suggests the next song to keep energy consistent |
| **Smart queue seeding** | On session start, the creator provides a mood / genre prompt; AI returns 5 seed songs to populate the queue and solve the cold-start problem |
| **Content moderation** | Before a song is admitted, run its title through a classifier to filter explicit or off-topic content — useful for family-friendly or corporate events |
| **Playlist generation at session end** | AI orders the played songs by energy curve and exports them to a Spotify / Apple Music playlist |
| **Audience mood detection** | Track vote velocity and skip frequency; if songs are being skipped frequently, the AI suggests a genre pivot |
| **Real-time lyrics overlay** | Fetch and display synced lyrics during playback using a transcription or lyrics API |
| **Natural language queue control** | Creator types "play something chill and indie" into a chat box; the AI adds an appropriate song to the top of the queue |

### Platform Features

- **Spotify / Apple Music support** — Search and queue from licensed catalogues; avoids YouTube copyright issues for monetised streams.
- **Song boosting / tipping** — Audience members pay (via Stripe) to move their song up the queue by one position, creating a revenue stream for creators.
- **Twitch / YouTube chat commands** — Vote via `!vote 2` in stream chat without opening the web UI; expands participation without requiring tab switching.
- **Room history and analytics** — Persist completed sessions to a read-only log: most-voted songs, peak listener count, genre breakdown, return visitor rate.
- **Collaborative playlists** — Export the session queue as a Spotify / YouTube playlist after the session ends.
- **Scheduled sessions** — Creator sets a start time; the session opens automatically and sends email or push reminders to past participants.
- **Multi-room support** — One creator account can host multiple simultaneous rooms (e.g. different floors at an event), each with an independent queue and SSE stream.

### Real-time Improvements

- **WebSocket upgrade** — Replace SSE with WebSockets for true bidirectional communication; enables the server to push personalised events such as "your song is up next" without client polling.
- **Presence system** — Show which specific songs individual listeners are voting for (opt-in); adds social transparency and discovery.
- **Live vote animations** — Broadcast vote events with voter avatars so the queue feels visually alive rather than just a number incrementing.
- **Typed queue snapshots** — Periodic Redis snapshots to a time-series store so admins can replay the exact vote history of a session for analytics.

### Creator Monetisation

- **Paid queue slots** — Creator reserves the top 1–2 queue positions for paying supporters via a one-time or recurring subscription.
- **Creator analytics dashboard** — Songs played per session, average vote count per song, peak concurrent listeners, return visitor rate over time.
- **Whitelabel rooms** — Custom domain and branding for corporate events, radio stations, or branded experiences.
- **Public API** — Expose the live queue via a REST API so creators can embed it into their own streaming overlays, OBS browser sources, or custom dashboards.

---

## Project Structure

```
app/
├── api/
│   ├── auth/[...nextauth]/       # Google OAuth (NextAuth handler)
│   ├── user/me/                  # GET: authenticated user's DB ID
│   └── streams/
│       ├── route.ts              # POST: add song | GET: queue snapshot
│       ├── live/route.ts         # GET: SSE real-time stream (Redis Pub/Sub)
│       ├── upvote/route.ts       # POST: cast one vote per user per session
│       ├── downvote/route.ts     # POST: remove vote from your current song
│       ├── myvote/route.ts       # GET: restore vote state on page load
│       ├── next/route.ts         # POST: advance queue (distributed lock)
│       ├── mode/route.ts         # POST: toggle public / creator mode
│       ├── heartbeat/route.ts    # POST: refresh all Redis TTLs (30s interval)
│       └── cleanup/route.ts      # POST: delete session on creator sign-out
├── stream/[creatorId]/
│   └── page.tsx                  # Main UI — sidebar, hero, vote queue, player
├── types/
│   └── Music.ts                  # QueueItem, QueueMode, SSEEvent types
└── lib/
    └── db.ts                     # Prisma client singleton

lib/
├── redis.ts                      # Redis client singleton (one connection, global)
└── queue.ts                      # getQueue() and publishUpdate() helpers

prisma/
└── schema.prisma                 # User model (email + provider — identity only)
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/ai-suggestions`
3. Make your changes and write clear commit messages
4. Open a pull request with a description of the feature, the problem it solves, and any trade-offs

---

## License

MIT
