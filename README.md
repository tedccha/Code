# Monorepo — Tools & Projects

A unified repository for all reusable tools and projects across the ecosystem.

## Structure

```
~/Code/
├── tools/                    # Reusable libraries & services
│   └── youtube-transcripts/
├── the-librarian/           # Main project
├── MarketMapMaker/          # Project using company-researcher API
├── CompanyResearcher/       # API service
├── AInextleveler/
├── Obed/
├── interview-coach-skill/
├── the-travel-agent/
└── TOOLS.md                 # Quick reference for all tools
```

## Quick Start

**Find available tools:**
```bash
# Human-readable catalog
cat ~/Code/TOOLS.md

# Full registry with metadata
cat ~/.claude/organizer/registry.json
```

**Using a tool in your project:**

1. Check TOOLS.md for what's available
2. If it's a library, add path alias to `tsconfig.json`:
   ```json
   {
     "paths": {
       "@tools/*": ["../../tools/*"]
     }
   }
   ```
3. Import and use:
   ```typescript
   import { fetchYoutubeTranscript } from '@tools/youtube-transcripts/src';
   ```

**Using an API service in your project:**

1. Check TOOLS.md for API endpoint and authentication
2. Set required environment variables (e.g., `COMPANY_RESEARCHER_BASE_URL`, `V1_API_KEY`)
3. Make HTTP requests to the API

## Tools Available

- **youtube-transcripts** — Extract YouTube transcripts with quality scoring and async polling
- **company-researcher** — REST API for company research and classification

See [TOOLS.md](./TOOLS.md) for full details and integration examples.

## Development

**Install dependencies for a project:**
```bash
cd ~/Code/the-librarian
npm install
npm run dev
```

**Add a new tool:**
1. Create `~/Code/tools/my-tool/`
2. Set up `package.json`, `tsconfig.json`, `src/`
3. Add to `~/.claude/organizer/registry.json`
4. Add to `~/Code/TOOLS.md`

See [~/Code/tools/README.md](./tools/README.md) for detailed tool development guide.

## Registry

All tools are tracked in the unified registry at:
- **Quick reference:** `~/Code/TOOLS.md`
- **Full metadata:** `~/.claude/organizer/registry.json`

Update the registry whenever:
- Adding a new tool
- Releasing a new version
- Changing API endpoints or rate limits
- Updating authentication requirements

## Principles

✅ **Reuse over rebuild** — Check TOOLS.md before building new features  
✅ **Atomic updates** — Tools and projects commit together  
✅ **Centralized improvements** — Fix youtube-transcripts once → all projects benefit  
✅ **Single source of truth** — Registry is the only place to discover tools

---

**Last updated:** 2026-06-12
