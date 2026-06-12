# Tools Repository

A centralized collection of reusable, standalone tools and libraries shared across projects.

## Overview

Each tool in this directory:
- ✅ Is **decoupled** from project-specific logic (no Prisma, no framework dependencies)
- ✅ Has a **clean API** for importing and using in other projects
- ✅ Includes **TypeScript types** for full type safety
- ✅ Is **tracked** in `~/.claude/organizer/registry.json` for discoverability
- ✅ Has its own **documentation and examples**

## Available Tools

### [`youtube-transcripts`](./youtube-transcripts/README.md) v1.0.0
Fetch YouTube transcripts with optional quality scoring and async polling support.

**Status:** Stable  
**Used by:** the-librarian, (future projects)  
**Key features:**
- Primary: `youtube-transcript` library
- Fallback: `usetranscribe.io` for auto-generated transcripts
- Optional: Quality scoring on 6 dimensions
- Async polling: Handle 1-5 min transcription waits
- No Prisma dependencies

---

## Using a Tool

### From the same machine:

```typescript
// Import from the tools directory
import { fetchYoutubeTranscript } from '../../../tools/youtube-transcripts/src';

// Or if you've built the dist:
import { fetchYoutubeTranscript } from '../../../tools/youtube-transcripts/dist';
```

### From a project (path alias):

Update your project's `tsconfig.json` or `next.config.ts`:

```json
{
  "compilerOptions": {
    "paths": {
      "@tools/*": ["../tools/*"]
    }
  }
}
```

Then import:

```typescript
import { fetchYoutubeTranscript } from '@tools/youtube-transcripts/src';
```

### As an npm package (future):

Once published to npm:

```bash
npm install @librarian/youtube-transcripts
```

```typescript
import { fetchYoutubeTranscript } from '@librarian/youtube-transcripts';
```

---

## Adding a New Tool

1. **Create the tool directory:**
   ```bash
   mkdir -p ~/Code/tools/my-tool/src
   cd ~/Code/tools/my-tool
   ```

2. **Set up scaffolding:**
   - Copy `package.json` and `tsconfig.json` from `youtube-transcripts`
   - Update `name`, `description`, `version`
   - List dependencies in `dependencies` (not `devDependencies`)

3. **Implement the tool:**
   - Core logic in `src/`
   - Export public API from `src/index.ts`
   - Include types (interfaces, enums, etc.)
   - No Prisma, no framework-specific imports

4. **Document it:**
   - Create `src/README.md` with usage examples
   - Include type examples if complex
   - Document async behavior, polling, limitations

5. **Register in organizer:**
   ```json
   // ~/.claude/organizer/registry.json
   {
     "tools": [
       {
         "name": "my-tool",
         "version": "1.0.0",
         "path": "~/Code/tools/my-tool",
         "category": "category-name",
         "quality_score": 8.0,
         "security_tier": "low",
         "description": "...",
         "projects": ["project1"],
         "external_dependencies": [],
         "status": "stable"
       }
     ]
   }
   ```

6. **Build and test:**
   ```bash
   npm run build
   npm test
   ```

---

## Principles

### Decoupling
- ❌ No Prisma (unless the entire tool is a Prisma wrapper)
- ❌ No framework assumptions (Next.js, Express, etc.)
- ❌ No app-specific logic or configuration
- ✅ Pure functions where possible
- ✅ Config injected at call time (no database queries inside)

### Stability
- Tools in `/tools/` are **production dependencies**
- Version changes are tracked in `~/.claude/organizer/registry.json`
- Breaking changes require version bump + documentation
- All public APIs should be stable (internal APIs can change)

### Discoverability
- Register every tool in `registry.json`
- Update `registry.json` when publishing to npm
- Include `projects` list showing who uses the tool
- Update version when releasing

### Type Safety
- Always export types alongside implementations
- Use `export type` for interfaces/types
- Avoid `any` unless absolutely necessary
- Generate `.d.ts` files in build step

---

## Development Workflow

**Make changes to a tool:**
```bash
cd ~/Code/tools/youtube-transcripts
npm run build
```

**Test in consuming project (the-librarian):**
```bash
cd ~/Code/the-librarian
npm run build  # will re-import and rebuild
```

**Before committing:**
```bash
cd ~/Code/tools/my-tool
npm test
npm run build  # verify no TS errors
```

---

## Registry

The tools registry lives in `~/.claude/organizer/registry.json` and tracks:
- **version** — Current published version
- **path** — Where the tool lives
- **quality_score** — 0-10 scale (test coverage, docs, stability)
- **security_tier** — `low`, `medium`, `high`
- **projects** — Which projects depend on it
- **status** — `alpha`, `beta`, `stable`, `deprecated`

Update this whenever you:
- Release a new version
- Add the tool to a new project
- Mark it as deprecated

---

## Examples

- [youtube-transcripts](./youtube-transcripts/README.md) — Full example of a complete tool

---

**Last updated:** 2026-06-12
