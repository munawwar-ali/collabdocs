This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

---

## 🔄 Offline Sync Deep Dive

### Complete Flow Diagram

```
USER EDITS (online)
      │
      ▼
  Y.Doc (CRDT)  ──update event──►  IndexedDB (y-indexeddb)
      │                                   [persisted immediately]
      │
      ▼
  WebSocket ──────────────────────►  WS Server  ──►  PostgreSQL
  (live broadcast)                   [sync_operations log]


USER EDITS (offline)
      │
      ▼
  Y.Doc (CRDT)  ──update event──►  IndexedDB (y-indexeddb)
      │                                   [persisted immediately]
      │
      ▼
  sync queue ◄─────────────────────  navigator.onLine = false
  [IDB store]                         enqueuePendingUpdate()


USER COMES BACK ONLINE
      │
  window 'online' event
  SW 'sync' event (Background Sync API — works even if tab was closed)
      │
      ▼
  pullRemoteChanges()          flushQueue()
      │                             │
      ▼                             ▼
  GET /api/sync/[id]?since=N    POST /api/sync/[id] × N
      │                             │
      ▼                             ▼
  Yjs updates from server       Server appends to sync_operations
      │                             │
      ▼                             ▼
  Y.applyUpdate() [CRDT merge]  Sequence number assigned atomically
  [no conflicts — converges]
```

### Why CRDTs Eliminate Conflicts

Traditional collaborative editing uses Operational Transformation (OT) —
a complex algorithm that requires a central server to coordinate concurrent edits.

Yjs uses **CRDTs (Conflict-free Replicated Data Types)**:

- Every character insertion gets a globally unique **logical timestamp**
  (Lamport clock + client ID)
- When two users type at the same position offline, the CRDT merges their
  edits **deterministically** — same result regardless of arrival order
- The merged result is always the **union** of both edits — no data is lost

Example: Alice types "Hello" and Bob types "World" at the same position offline.
After sync: they both see "HelloWorld" (or "WorldHello" — deterministic by client ID).
Neither edit is lost.

### Service Worker Caching Strategy

| Resource | Strategy | Reason |
|---|---|---|
| `/_next/static/**` | Cache-First | Content-hashed, never changes |
| HTML pages | Stale-While-Revalidate | Fast load, background update |
| `GET /api/**` | Network-First + cache | Fresh when online, reads when offline |
| `POST /api/sync/**` | Pass-through (queued) | Mutations handled by sync engine |
| WebSocket | Not intercepted | SW cannot intercept WS |

---

## 🤖 Getting Your Groq API Key (Free, 2 minutes)

1. Go to **https://console.groq.com**
2. Sign up (free — no credit card)
3. Click **API Keys** → **Create API Key**
4. Copy the key and add it to `.env.local`:
   ```
   GROQ_API_KEY=gsk_your_key_here
   ```

The free tier gives you **14,400 requests/day** — more than enough for a demo.

### AI Commands Available

| Command | What it does | Needs selection? |
|---|---|---|
| ✍️ Continue writing | Appends 1–3 paragraphs after the document | No |
| 📝 Summarise | 2–3 sentence summary of the doc | No |
| ✅ Fix grammar | Corrects spelling, grammar, phrasing | Yes |
| 🔭 Expand | Turns a brief note into a full paragraph | Yes |
| ✂️ Make shorter | Condenses without losing key points | Yes |
| 🌍 Translate | Translates to any language | Yes |
| 🎭 Change tone | Rewrites in formal/casual/academic/etc. | Yes |
| 💬 Custom prompt | Freeform AI instruction | Optional |
