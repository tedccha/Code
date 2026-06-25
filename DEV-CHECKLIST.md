# Universal Development Checklist

Master reference for pre-implementation, implementation, and pre-deployment checks across all projects.

---

## Phase 1: Before Writing Code

### 1. Read & Understand the Code You're About to Write

**CRITICAL:** Before asking someone to test it, read the code yourself carefully.

- [ ] **Verify all imports exist**
  - If using `prisma`, is it imported?
  - If using `SystemMessage`, is it imported from the right module?
  - Don't assume — actually check the import statements

- [ ] **Understand the API you're using**
  - `messageModifier` — function or string? Check docs/examples
  - `upsert` — what's the unique constraint? Will it work as written?
  - `findUnique` — what field is the unique key?
  - Don't guess — verify the API contract

- [ ] **Trace the data flow end-to-end**
  - Where is this value created? → Where is it used? → What happens to it?
  - Example: `buildDomainContext` returns data → Is it actually passed to the LLM? → Will the LLM actually use it?
  - Write this out if unsure

- [ ] **Check function signatures and parameters**
  - What does this function expect? What will I pass it?
  - Are the types correct?
  - Will it work with null/undefined?

### 2. Verify External Dependencies

- [ ] **API Keys/Credentials**
  - Does the API key actually exist? (Don't assume)
  - Is it in the right environment (.env.shared vs local .env vs platform)?
  - Has it been added to the deployment platform?
  - Test: `echo $VARIABLE_NAME` should return the value

- [ ] **Database/Service Availability**
  - Is the database set up? Run migrations if needed
  - Are connection strings correct?
  - Test locally before deploying

- [ ] **Third-party Libraries & APIs**
  - Is the library installed? Check `package.json`
  - What version? Are there breaking changes?
  - Have you read the relevant API docs for how you're using it?
  - **Critical:** What does the API actually return? Don't assume.
    - Example: Notion's `databases.retrieve()` doesn't return the schema properties
    - Example: Select fields need `{ select: { name: value } }`, not plain text
    - Test with real data before deploying

### 3. Architecture & Design

- [ ] **Identify data flow type**
  - Synchronous operation? → Handle with regular functions
  - Async operation? → Need async/await or promises
  - Long-running? → May need background jobs, queues
  - Real-time? → May need event listeners, subscriptions

- [ ] **Schema/Contract Design** (if applicable)
  - If adding database columns → Define schema first, create migration
  - If adding API endpoint → Define request/response schemas with Zod or TypeScript
  - If integrating external API → Validate response shape before using it

- [ ] **Dependency Chain**
  - What does this depend on?
  - What depends on this?
  - Are there circular dependencies?
  - Can you test it in isolation?

---

## Phase 2: Writing Code

### 1. Code Quality Fundamentals

- [ ] **Type Safety**
  - TypeScript: No `any` unless absolutely necessary
  - No `z.record(z.unknown())` for typed objects — use `z.object({...})`
  - All external data validated with schemas

- [ ] **Error Handling**
  - What errors can occur here? Handle them
  - Invalid input → Validate and reject
  - External API fails → Retry or graceful degradation
  - Database down → Meaningful error message
  - Don't swallow errors silently

- [ ] **Configuration**
  - Hardcoded values → Use env vars or config objects
  - Credentials → Never in code, always in env vars
  - Feature flags → If adding a feature that might need rollback

### 2. Implementation Patterns

- [ ] **Before deploying to see if something works, read the code to verify it should work**
  - Don't add logging and redeploy to debug basic code issues
  - Take 5 minutes to read the code carefully
  - Ask: "Will this actually work?" not "Let's try it"

- [ ] **State Persistence** (if applicable)
  - Does this data need to survive a restart? How?
  - Database, cache, file, local storage?
  - Test: Restart the service/browser. Is the data still there?

- [ ] **API Contract Adherence**
  - Passing a string to something expecting a function? Check.
  - Using the right method signature? Verify params
  - Return type matches what caller expects? Confirm.

---

## Phase 3: Before Shipping / Deployment

### 1. Code Review (Self-First)

**Read your code as if someone else wrote it. Be critical.**

- [ ] **Logic Review**
  - Does this actually do what I intended?
  - Are there edge cases I missed?
  - What happens if input is null/undefined/empty?
  - Will this work with the data it actually receives?

- [ ] **Imports & Dependencies**
  - All imported modules exist and are correct
  - No circular dependencies
  - Unused imports? Remove them

- [ ] **Configuration Data Flow**
  - Configuration is defined somewhere (env var, config file, database)
  - Configuration is loaded at startup
  - Configuration is injected into the component/service that needs it
  - The component actually reads and uses the configuration
  - Test: Add logging to verify configuration is there

### 2. Testing

- [ ] **Type Checking**
  - Run: `npx tsc --noEmit` (or equivalent)
  - Zero TypeScript errors

- [ ] **Build Test**
  - Run: `npm run build` (or equivalent)
  - Build completes without errors

- [ ] **Local Testing**
  - Start dev server: `npm run dev` (or equivalent)
  - Test the feature manually
  - Check browser console for errors
  - Test happy path AND error cases

- [ ] **Database** (if applicable)
  - Migrations run successfully
  - Schema is correct
  - Data persists across restarts
  - Queries work as expected

- [ ] **External APIs** (if applicable)
  - **Test locally before deploying**
    - Write a test script that calls the API with your code
    - Verify the actual response format matches your assumptions
    - Example: `test_notion_properties.ts` to verify select/relation formatting
    - Don't just trust the docs — test it
  - Rate limiting handled gracefully (show pending, not error)
  - Timeout handling in place
  - Error responses handled (log full error body, not just message)
  - Retry logic works
  - API response validation in place (don't assume fields exist)

### 3. Configuration Verification

**Most common production failures: missing config**

- [ ] **All required env vars are set**
  - List them: where should they be (local .env vs platform)?
  - Verify they exist: `echo $VAR`
  - Test they're accessible in code

- [ ] **Secrets are not in git**
  - Run: `git log -p | grep -i "password\|token\|api_key"` (should be empty)
  - Check: `.gitignore` includes `.env`, `.env.local`

- [ ] **Configuration is passed to the right place**
  - Is buildDomainContext called? → Does it get memberId?
  - Is the system prompt built? → Is it actually passed to the LLM?
  - Trace it end-to-end

### 4. Clean Build (Schema/Framework Issues)

**After any schema, config, or dependency changes:**

```bash
# Prisma (Node.js/TypeScript)
npx prisma generate && rm -rf .next node_modules/.prisma && npm run dev

# Next.js
rm -rf .next && npm run dev

# General
rm -rf node_modules && npm install && npm run build
```

---

## Phase 4: Before Pushing / Requesting Review

- [ ] **Git history is clean**
  - Commit message is descriptive
  - No debugging code left in
  - No `console.log` debugging statements
  - No large unrelated changes mixed in

- [ ] **No breaking changes without migration**
  - Database schema changed? → Migrations exist
  - API contract changed? → Clients updated
  - Config keys renamed? → Old keys still work or documented migration

- [ ] **Documentation Updated**
  - README reflects changes?
  - CLAUDE.md or deployment.md updated?
  - Comments added if behavior is non-obvious?

---

## Phase 5: After Deploy / If Something Breaks

### Debugging Mindset

**Before adding logging and redeploying:**

1. **Read the code** — Trace through logic
2. **Check configuration** — Is it actually there?
3. **Verify data flow** — Does data reach where it's used?
4. **Look at logs** — What error is actually happening?
5. **Then deploy** — With targeted fixes, not "add logging everywhere"

### Common Failures

| Problem | Check First |
|---------|------------|
| "Variable not defined" | Is it imported? |
| "Configuration not found" | Is it in the right env (local vs platform)? Was it added to platform? |
| "Type mismatch" | Check the API docs for expected type |
| "Data not appearing" | Trace the full path from creation to use |
| "Service won't start" | Missing import, missing env var, schema error |

---

## Checklist: Before Every Deploy

- [ ] Code reads correctly (no obvious bugs)
- [ ] All imports exist
- [ ] Configuration is set up in the right place(s)
- [ ] TypeScript passes: `npx tsc --noEmit`
- [ ] Build passes: `npm run build`
- [ ] Dev server works: `npm run dev`
- [ ] Manual testing done (happy path + errors)
- [ ] No secrets in `.env` or git history
- [ ] Commit message is clear
- [ ] Related docs updated (CLAUDE.md, deployment.md, README)

---

## Decision Tree: "Should I Deploy This?"

```
Does the code read correctly?
├─ NO → Fix it before deploying
└─ YES
   ├─ Do all imports exist?
   │  ├─ NO → Add imports
   │  └─ YES
   │     ├─ Is all required config in place?
   │     │  ├─ NO → Add to env / platform
   │     │  └─ YES
   │     │     ├─ Does build pass?
   │     │     │  ├─ NO → Fix errors
   │     │     │  └─ YES
   │     │     │     ├─ Does dev work?
   │     │     │     │  ├─ NO → Test locally, fix
   │     │     │     │  └─ YES → Deploy ✓
```

---

## Anti-Patterns to Avoid

❌ **"Let's add logging and redeploy to see what's happening"**
- First: Read the code. Trace the logic. Identify the problem.
- Then: Deploy with a fix, not with logging.

❌ **"I'll just assume this API works this way"**
- Check the docs. Look at examples. Verify the signature.
- **Test it locally** with real data before deploying
- Test what the API actually returns, not what you think it returns
- Example: Notion's `databases.retrieve()` doesn't return schema properties
- Example: Select fields require `{ select: { name } }` format, not plain strings
- Don't deploy assumptions.

❌ **"The env var should be there"**
- Test it: `echo $VAR`
- Check the platform settings
- Don't assume

❌ **"I'll test it in production"**
- Test locally first
- Dev server, manual testing, error cases
- Only deploy after local testing passes

❌ **"It compiled, so it must work"**
- TypeScript passes ≠ logic is correct
- Run your feature. Test the happy path and errors.

---

## Resources

- **This checklist:** `/Code/DEV-CHECKLIST.md` (universal, all projects)
- **Deployment:** `/Code/DEPLOYMENT.md` (Railway, Vercel)
- **Project-specific:** `[PROJECT]/CLAUDE.md` or `[PROJECT]/dev-checklist.md`

---

## Last Updated

2026-06-25 — Updated with Obed health agent lessons:
- Test external APIs locally before deploying (don't assume response format)
- Verify what APIs actually return vs what docs say
- Add detailed error logging to external API calls
- Test property formatting for complex types (select, relations, dates) in isolation
- Anti-pattern: deploying assumptions about external APIs
