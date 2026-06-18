# Code Projects — Master Roadmap

Last updated: 2026-04-23

---

## MarketMapMaker
**Status:** Active — local dev
**Repo:** `/Users/teddycha/Code/MarketMapMaker`
**CEO Plan:** `~/.gstack/projects/MarketMapMaker/ceo-plans/2026-04-23-buyer-ontology.md`

### Done
- [x] Core canvas: ICP swim lanes, 7-tier market position taxonomy, React Flow
- [x] AI classification pipeline: Tavily research + Claude Sonnet generateObject
- [x] Corrections flow: right-click panel, append-only Correction table, read-time merge
- [x] Ecosystem pivot: AI-inferred upstream/adjacent/downstream per company, cached
- [x] Map sharing: read-only share token
- [x] Home page: map grid with company count and position color dots
- [x] Buyer ontology migration (Phase 1 + 2): many-to-many CompanyBuyer, global Buyer canonical table, similarity check on add, `+N` badge, BuyerRelationships detail panel

### Up Next
- [ ] Buyer Tree Browser (`/buyers` route) — navigate canonical buyer hierarchy
- [ ] Buyer-First Add Flow — select buyer segment before searching for company
- [ ] Phase 2 cleanup done — `Company.icpId` dropped

### Deferred
- [ ] Librarian integration — cross-reference company mentions against maps
- [ ] Autonomous "Expand" — find more companies in a lane via Tavily sweep

---

## The Librarian
**Status:** Active — deployed on Railway
**URL:** https://the-librarian-production.up.railway.app
**Plan:** `~/.claude/plans/quizzical-riding-quiche.md`
**Repo:** https://github.com/tedccha/the-librarian

### Done
- [x] Phase 1–3: Core pipeline, Q&A, Library, Quality Judge, Web Discovery
- [x] Phase 4: Gmail integration (OAuth, sync, 3-tier filter)
- [x] Phase 5: Gmail CSS cleaning, reprocess endpoint
- [x] Phase 6: Railway deployment, Basic Auth, GitHub CI/CD
- [x] Singleton pipeline queue (throttled, Tavily rate-limit safe)
- [x] Multi-author support (guest/host roles on YouTube/Podcast)
- [x] File upload tab (PDF, TXT, MD) with drag-and-drop
- [x] Cloudflare R2 storage for PDFs (download link on item card)
- [x] Inline quality score adjustment with EMA weight learning
- [x] Dedup scan endpoint (fire-and-forget, Railway logs)
- [x] Shared API keys via `~/Code/.env.shared`

### In Progress
- [ ] Duplicate detection improvements — move check before expensive AI calls (Phase 8)
- [ ] Fix Gmail CSS cleaning — `cleanBodyText()` still passes raw CSS to DB
- [ ] Fix quality judge ZodError — `reasoning` field exceeds 300-char limit

### Up Next
- [ ] Doppler secret management (replace `~/Code/.env.shared`)
- [ ] Re-run Gmail reprocess after CSS fix deployed
- [ ] Calibration UI removal — inline adjustment already shipped; remove `/judge` from sidebar
- [ ] Corpus similarity scoring — weight new items by similarity to user-accepted corpus (after enough human signal collected)
- [ ] Duplicate detection: embed first chunk before summarize, check before AI calls
- [ ] NotebookLM export (jszip — notes.md + urls.txt zip download)
- [ ] Tag management UI — manual add/remove, autocomplete on Library page
- [ ] Chrome bookmarks import — extend existing Upload File tab to accept `.html` exports; detect `NETSCAPE-Bookmark-File` header, parse folder structure as `folder:` tags, SourceType: WEB_ARTICLE, batch response (no per-item polling)

### Future (Phase 7)
- [ ] Multi-user auth (NextAuth.js v5 — Google OAuth + magic link)
- [ ] Per-user data isolation (`userId` on all tables)
- [ ] One-click full data export (JSON/ZIP)
- [ ] Real account deletion (hard delete, CASCADE)
- [ ] Self-hosted packaging (Dockerfile + docker-compose)

---

## CompanyResearcher
**Status:** Active — research synthesis improved, continuous improvement system v0 live
**Repo:** `/Users/teddycha/Code/CompanyResearcher`

### Done
- [x] Synthesis schema fix: separated prompt guidance from schema structure (prevents "No object generated" errors)
- [x] Firecrawl fallback for Tavily quota exhaustion (Phase 4 complete)
- [x] AlternativesTo competitor intelligence scraper (Phase 3 complete)
- [x] Finnhub financials + MD&A insights (complete)
- [x] Investors hybrid search: Jina + Perplexity + NewsAPI (complete)
- [x] Continuous improvement system v0: gstack-organizer capture, AUDIT_PROTOCOL, patterns.json (live)

### Up Next — Core Research Engine
- [ ] Continuous Improvement System Phase 2:
  - [ ] `gstack-organizer audit` subcommand — automate Phase 1 (cluster signals by similarity)
  - [ ] `gstack-organizer decay` subcommand — surface patterns nearing decay threshold
  - [ ] hit_count incrementing mechanism — track when patterns are applied during research
- [ ] Quarterly audit (next: 2026-07-01) — cluster signals, Hindsight Test, promote ≤5 patterns
- [ ] create universal skill for fetching URL content, using Jina, stripping out headers/footers to get the meat of the content, what're fall-backs if Jina doesn't work, are there ways to get x or linkedin content or other problematic ones?

### Vision: Microservice Superskill (Shared Service Architecture)
CompanyResearcher to become a shared research superskill for other apps (MarketMapMaker, Librarian, etc.). Apps can request quick lookups (domain, LinkedIn, categories), selective deep-dives (Customers/ICP, Financials), or contribute new knowledge.

**Blockers to address:**
- Local SQLite → shared PostgreSQL (multi-app data consistency)
- No service contract / API versioning (external apps need stability)
- No auth / rate limiting (need to track which app is asking, enforce quotas)
- Synchronous-only research (blocking 30s+ calls in UI)
- No data ownership tracking (can't merge contributions from multiple apps)

#### Phase 1: Service Contract & Shared Database (1–2 weeks)
- [ ] Migrate SQLite → PostgreSQL on Railway
- [ ] Add OpenAPI schema documenting API contract
- [ ] Add API key auth middleware + rate limiting (10 req/min per key default)
- [ ] Document "quick lookup" (`/api/v1/companies/{id}/quick-lookup` → domain, LinkedIn, categories) vs. "deep research" (`/api/v1/research`) patterns
- [ ] Update CLAUDE.md with service SLA + deprecation policy

#### Phase 2: Data Ownership & Attribution (1 week)
- [ ] Add `contributedBy: string` field to insights, research logs, human commentaries
- [ ] Implement insight merge policy (keep both if different apps contribute different data, with attribution)
- [ ] Add `GET /api/v1/companies/{id}/audit-trail` to show knowledge provenance (which app/user added what, when)

#### Phase 3: Async & Caching (2 weeks)
- [ ] Add Redis cache for quick lookups (domain, LinkedIn, categories: 24h TTL)
- [ ] Implement async research queue (BullMQ or similar)
  - POST `/api/v1/research` → returns `{ jobId, status: "queued" }`
  - GET `/api/v1/research/{jobId}` → returns status/results
  - Webhook callback on completion (optional)
- [ ] Document polling vs. webhook patterns

#### Phase 4: Multi-Tenant Isolation (Optional, 2 weeks)
- [ ] Add app/user isolation (soft multi-tenancy)
- [ ] Add per-app quotas and usage dashboard
- [ ] Implement soft-delete for data retention policies

**Immediate quick win** (if starting today):
1. Deploy separately on Railway (not embedded)
2. Add API key auth (30 min)
3. Document contract (1 hour)
4. Use from other apps immediately

### Notes
- Used as reference architecture for The Librarian
- Shared patterns: Prisma singleton, AI provider init, API route structure, shadcn/ui stack
- Continuous improvement system documented in ~/.claude/organizer/AUDIT_PROTOCOL.md 

---

## interview-coach-skill
**Status:** Unknown — needs review
**Repo:** `/Users/teddycha/Code/interview-coach-skill`

### Up Next
- [ ] Review current status and open issues

---

## Cross-Project Infrastructure

### Done
- [x] `~/Code/.env.shared` — shared API keys (Anthropic, Gemini, Tavily, Gmail, Raindrop)
- [x] `~/Code/.gitignore` — prevents `.env.shared` from being committed

### Up Next
- [ ] **Doppler** — replace `~/Code/.env.shared` with proper secret manager
  - Free tier, CLI-based, Railway native integration
  - Per-project namespacing (least privilege)
  - Audit trail + rotation support
- [ ] Evaluate monorepo (npm workspaces) when a third app shares significant code with the first two

---

## Ideas / Backlog
- The Librarian multi-user SaaS — "radically transparent" model (open source + export + deletion)
- The Librarian mobile companion (read-only library browser + ask questions)
