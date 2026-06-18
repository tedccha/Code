# My Reusable Tools & Services

**Quick Reference | Last Synced: 2026-06-12**

Before building a new feature, search this list first. If you're about to build something, check if a tool already exists.

---

## 📚 Embedded Services

### YouTube Transcript Extractor
**ID:** `youtube-transcripts` | **Status:** Stable | **Quality:** 8.5/10

Extract YouTube transcripts with optional quality scoring and async polling support.

| | |
|---|---|
| **Owned by** | the-librarian |
| **Location** | `~/Code/the-librarian/src/lib/youtube-transcripts` |
| **Access** | REST API endpoints in the-librarian |
| **For other apps** | Call the-librarian's API instead of importing directly |
| **Docs** | [README](~/Code/the-librarian/src/lib/youtube-transcripts/README.md) |

**What it does:**
- Fetch transcripts via `youtube-transcript` library (public captions)
- Fallback to `usetranscribe.io` for auto-generated transcripts
- Async polling for 1–5 min transcription waits
- Optional quality scoring on 6 dimensions: relevance, depth, credibility, signal, clarity, actionability
- Metadata: title, channel name via oEmbed (no API key)

**When to use:**
- ✅ Extracting YouTube transcripts in your app
- ✅ Needing async transcript fetching (videos not yet captioned)
- ✅ Want optional quality assessment of video content

**Dependencies:** youtube-transcript, ai, zod (peerDependencies)

**Key exports:**
- `fetchYoutubeTranscript(options)` — Fetch with optional quality scoring
- `pollForTranscript(videoId, options)` — Poll for TRANSCRIBING state
- `scoreTranscriptQuality(text, context, summarizeContent, model)` — Quality scoring helper

---

## 🔌 API Services

### Company Research Service
**ID:** `company-researcher` | **Status:** Stable | **Quality:** 9.0/10

REST API for high-fidelity company research: disambiguation, classification, market position, intelligence briefs.

| | |
|---|---|
| **Service URL** | `https://companyresearcher.vercel.app` |
| **Source** | `~/Code/CompanyResearcher` |
| **Used by** | MarketMapMaker |
| **Docs** | [API Integration Guide](~/Code/CompanyResearcher/docs/API_INTEGRATION_GUIDE.md) |
| **OpenAPI** | [Spec](~/Code/CompanyResearcher/public/openapi.yaml) |

**Two Integration Patterns:**

#### 1️⃣ Quick Lookup — Synchronous Classification
```
POST /api/v1/classify
→ Returns: market position + industry in <5 seconds
Use for: category resolution, dedup enrichment
```

**Request:**
```json
{
  "companyName": "OpenAI",
  "industry": "AI/ML"
}
```

**Response:**
```json
{
  "companyId": "openai-1",
  "primary": { "id": 1, "name": "Artificial Intelligence", "path": "...", "level": 2 },
  "secondary": [...],
  "marketPosition": "LEADER",
  "confidence": 0.95
}
```

#### 2️⃣ Deep Research — Asynchronous Intelligence Brief
```
POST /api/v1/research (returns jobId immediately)
→ Typical completion: 60–300 seconds
→ GET /api/v1/research/{jobId} (poll for results)
Use for: full research, all 11 intelligence topics
```

**Returns:** Full intelligence brief with:
- Executive summary
- Financial metrics (revenue, headcount, growth)
- Market position & competitive analysis
- Recent news & developments
- Leadership team
- And 6 more intelligence topics

#### 3️⃣ Disambiguate — Resolve Name Ambiguities
```
POST /api/v1/disambiguate
→ Returns: Candidate companies with confidence scores
Use for: handling "Apple Inc" vs "Apple Music" scenarios
```

**Authentication:**
- **Header:** `Authorization: Bearer <V1_API_KEY>`
- **Env vars needed:**
  - `V1_API_KEY` (production, can be unset in dev)
  - `COMPANY_RESEARCHER_BASE_URL` (set to https://companyresearcher.vercel.app)

**Rate Limiting:**
- 10 requests/minute per API key
- On limit: HTTP 429 + `Retry-After` header

**Timeouts:**
- Quick lookup: <10s
- Deep research: <5min

**When to use:**
- ✅ Classifying companies by industry/market position
- ✅ Researching companies (deep intelligence)
- ✅ Disambiguating company names
- ✅ Enriching company data with market insights

**Critical Integration Notes:**
- `startResearch()` returns `jobId` — **save to database BEFORE responding to client** (prevents race condition with webhook)
- Webhook must allow null `researchJobId` (prevents drop)
- Stale companies (RESEARCHING >15 min) auto-fail on poll
- Field extraction: handle multi-format responses (numbers, objects with `mean`/`value`/`median` keys)
- All calls have 15s timeout max

---

## 🔍 How to Search & Use

**By keyword:** Search this file for capability you need
- Want transcripts? → Search "youtube" → `youtube-transcripts`
- Need company data? → Search "company" or "research" → `company-researcher`

**By type:**
- **Library** (import code) → Use `@tools/` path alias
- **API Service** (HTTP calls) → Use base URL + auth header

**Before building:**
1. Check TOOLS.md (this file)
2. If found, read tool's documentation
3. If not found, check `~/.claude/organizer/registry.json` for more detail
4. Implement, don't rebuild

---

## 📋 Registry Details

Full registry with metadata, versioning, SLAs, and more:
**Location:** `~/.claude/organizer/registry.json`

**Check registry when:**
- Adding a tool to a new project
- Updating tool version
- Checking API compatibility
- Understanding rate limits / SLAs

---

## 🚀 Coming Soon

Tools in development or planned:
- (none currently)

---

## ➕ Adding a New Tool

When you build a reusable component:

1. **Add to registry:** `~/.claude/organizer/registry.json` (tools array)
2. **Document it:** Create README or API docs in tool directory
3. **Update this file:** TOOLS.md with quick reference
4. **Tag it:** Use searchable keywords
5. **Set status:** alpha → beta → stable

---

**Version:** 2.0 | **Last Updated:** 2026-06-12
