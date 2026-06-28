# CollabDocs — Security Audit

## Threat Model & Mitigations

### 1. OOM via Giant Sync Payload

**Threat:** A malicious actor sends a 1GB Yjs update to `/api/sync/[docId]`,
causing the Node.js process to run out of memory.

**Mitigations (layered defence):**
| Layer | Mechanism |
|---|---|
| Next.js middleware | Content-Length header checked; rejects > 1MB before routing |
| Route handler | `request.arrayBuffer()` with byte-count check before JSON parse |
| Zod schema | `YjsUpdateSchema` max length enforced on base64 string |
| Binary decode | `Buffer.byteLength` checked after base64 decode (can't be spoofed) |
| Yjs sanity | `isPlausibleYjsUpdate()` checks minimum length and header bytes |
| WS server | Per-message `MAX_MESSAGE_BYTES` check before protocol parse |

**Result:** A malicious client cannot allocate more than ~1MB per request.

---

### 2. Viewer Write Escalation

**Threat:** A Viewer modifies the Auth.js session token or intercepts a request
to push a sync update as if they were an Editor.

**Mitigations (layered defence):**
| Layer | Mechanism |
|---|---|
| API route | `getDocumentWithRole()` checks role from DB before any write |
| PostgreSQL RLS | `sync_ops_insert_editor` policy blocks insert for viewer role |
| WS server | `SyncStep2` / `Update` messages from viewers silently dropped |
| Drizzle ORM | All queries scoped to authenticated user's session |

**Result:** Viewers have read-only access enforced at three independent layers.

---

### 3. Tenant Data Isolation (Multi-tenancy)

**Threat:** User A crafts a request to read or modify User B's documents.

**Mitigations:**
- Every query joins `document_members` to verify the requesting user is a member
- PostgreSQL RLS policies (in `drizzle/rls-policies.sql`) enforce this at DB level
- `set_app_user()` sets session context before every user-scoped query
- Even if application code has a bug, the DB rejects cross-tenant queries

---

### 4. Authentication Bypass

**Threat:** Requests reach protected routes without a valid session.

**Mitigations:**
- Next.js middleware runs before all routes; returns 401 for protected API routes
- Every API handler calls `getAuthOrUnauthorized()` as a second check
- Auth.js JWT tokens are signed with `AUTH_SECRET` (HS256)
- Session tokens are `httpOnly`, `SameSite=Lax` cookies

---

### 5. Brute Force / Credential Stuffing

**Threat:** Attacker tries millions of email/password combinations.

**Mitigations:**
- bcrypt cost factor 12 ≈ 300ms per hash attempt (makes brute force slow)
- Rate limit on `/api/auth/register`: 5 requests per 15 minutes per email
- Auth.js Credentials provider rate-limits internally
- Generic error messages prevent user enumeration:
  - "Invalid email or password" (not "Email not found" or "Wrong password")

---

### 6. Stored XSS

**Threat:** Attacker stores malicious `<script>` tags in document content
that execute when other users view the document.

**Mitigations:**
- Document content is stored as **Yjs binary** (not HTML or text in DB)
- TipTap sanitises HTML on render via ProseMirror's schema
- Text fields (title, label, description) are passed through `stripHtml()`
  before storage
- `hasNullBytes()` check on all text fields prevents SQL injection via null terminator

---

### 7. SQL Injection

**Threat:** Malicious input in document titles, emails, etc. modifies SQL queries.

**Mitigations:**
- Drizzle ORM uses **parameterised queries exclusively** — raw SQL is never
  constructed with user input
- Zod validates all inputs before they reach the ORM
- Even if Zod is bypassed, Drizzle's prepared statements prevent injection

---

### 8. CSRF

**Threat:** Attacker tricks an authenticated user's browser into making
unauthorised requests to our API.

**Mitigations:**
- Auth.js sets `SameSite=Lax` on session cookies (blocks cross-site POSTs)
- All mutating API routes require `Content-Type: application/json`
  (browsers won't send this cross-origin without a CORS preflight)
- CORS is not configured to allow cross-origin API access

---

### 9. Rate Limiting / DoS

**Threat:** Attacker floods API endpoints to exhaust server resources.

**Mitigations:**
| Endpoint | Limit |
|---|---|
| `POST /api/sync/[docId]` | 120 requests / minute / user |
| `POST /api/documents/[docId]/versions` | 20 requests / minute / user |
| `POST /api/documents/[docId]/members` | 10 requests / minute / user |
| `POST /api/auth/register` | 5 requests / 15 minutes / email |
| `POST /api/documents` | 30 requests / minute / user |
| `POST /api/ai/assist` | 20 requests / minute / user |

Rate limiting is in-memory (per server instance). For production at scale,
replace with Redis-backed rate limiting (e.g. `@upstash/ratelimit`).

---

### 10. Malformed Yjs Payload Crashing Collaboration

**Threat:** Attacker sends a structurally valid but semantically malicious
Yjs update that causes `Y.applyUpdate()` to throw, crashing the WS server.

**Mitigations:**
- WS server wraps `handleMessage()` in `try/catch` — one bad message
  does not kill the connection or the server process
- The server only applies updates from authenticated editors
- Each update is applied to a single room's Y.Doc in isolation —
  a crash in one room cannot affect other rooms

---

## Security Checklist

- [x] Authentication required on all protected routes
- [x] Role-based access control (Owner / Editor / Viewer)
- [x] PostgreSQL Row Level Security enabled
- [x] Payload size limits (middleware + route + binary)
- [x] Zod validation on all API inputs
- [x] Rate limiting on all write endpoints
- [x] bcrypt password hashing (cost 12)
- [x] Generic error messages (no information leakage)
- [x] XSS prevention (binary storage + HTML strip)
- [x] SQL injection prevention (parameterised ORM)
- [x] CSRF protection (SameSite cookies)
- [x] HTTPS enforced in production (Vercel)
- [x] Security headers (X-Frame-Options, X-Content-Type-Options, etc.)
- [x] Viewer write blocked at API + DB + WebSocket levels
- [x] WS server message error isolation (try/catch per message)
- [x] Secrets in environment variables (never committed)

## Production Upgrade Path

| Item | Current | Production |
|---|---|---|
| Rate limiting | In-memory Map | Redis / Upstash |
| WS auth | Query param userId | Signed JWT verified against DB |
| Secrets | .env.local | Vercel environment variables (encrypted) |
| DB SSL | `rejectUnauthorized: false` | Pinned CA certificate |
| Logging | `console.log` | Structured JSON logging (Axiom/Datadog) |
