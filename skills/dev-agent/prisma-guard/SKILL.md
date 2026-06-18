---
name: prisma-guard
description: "Use when modifying schema.prisma or encountering 'Unknown argument' / 'Inconsistent column count' errors during database operations."
category: dev-agent
risk: medium
source: user
date_added: "2026-05-01"
metadata:
  triggers: 
    - prisma-generate
    - schema-desync
    - unknown-argument
    - hot-reload-prisma
    - global-prisma-cache
---

# Prisma Guard (Sync & Lifecycle)

Ensure your Prisma Client, Schema, and Runtime are in perfect sync. Use this skill whenever you touch `schema.prisma` or encounter runtime database errors.

## When to Use
- Immediately after modifying `prisma/schema.prisma`.
- When you see errors like `Unknown argument X` in a Prisma call (Client desync).
- When you see `Inconsistent column count` (Database desync).
- When hot-reloading in Next.js/Hono fails to pick up new schema changes.

## Core Workflow

### 1. The Sync Audit
Before assuming the client is ready, check the sync status:
- Compare the modified timestamp of `prisma/schema.prisma` with `node_modules/@prisma/client/package.json`.
- If schema is newer, you MUST generate.

### 2. The Force Generate
Always run with the explicit path to ensure no environment confusion:
```bash
npx prisma generate
```

### 3. The Runtime Flush (Dev Mode)
In dev servers (Next.js, etc.), the `PrismaClient` is often cached in `globalThis`. 
- **Action**: "Touch" the file where `PrismaClient` is initialized (e.g., `src/lib/prisma.ts`).
- **Pattern**: If the issue persists, temporarily bypass the global cache in the initialization file:
  ```typescript
  // Temporary bypass for sync issues
  export const prisma = new PrismaClient();
  ```

## Anti-Rationalization Rules
- **DO NOT** assume `prisma generate` is enough. In hot-reloading environments, you MUST verify the instance was re-instantiated.
- **DO NOT** use `(prisma as any)` to bypass type errors unless you have confirmed the underlying schema and database columns exist.
- **ALWAYS** check for a `prisma.config.ts` which might override default schema locations.

## Troubleshooting
| Symptom | Fix |
|---------|-----|
| `Unknown argument` | Run `prisma generate` AND restart dev server or touch initialization file. |
| `P2025` (Record not found) | Check if you are hitting the correct database environment. |
| `P2002` (Unique constraint) | Verify data integrity before retrying manual corrections. |
