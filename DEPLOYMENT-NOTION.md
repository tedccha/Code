# Notion Integration Deployment Guide

Reference for integrating with Notion API in applications.

---

## Pre-Deployment Checklist

### 1. API Key & Authentication

- [ ] `NOTION_API_TOKEN` is set in `.env` (local) and platform (Railway/Vercel)
- [ ] Token has correct permissions:
  - [ ] Read pages and databases
  - [ ] Create pages
  - [ ] Update page properties
  - [ ] Read content blocks
- [ ] Token is NOT in git history
  - Run: `git log -p | grep -i "notion_api_token\|ntn_"` (should be empty)

### 2. Database IDs

- [ ] All database IDs are correct (not workspace IDs or page IDs)
  - Database ID is the UUID in the database URL: `app.notion.com/p/{DATABASE_ID}`
  - NOT the first part of a full page URL
  - Test: `curl https://api.notion.com/v1/databases/{ID} -H "Authorization: Bearer $TOKEN"`
- [ ] Database IDs are in code as constants, not hardcoded magic strings
- [ ] Database IDs are documented (which database is for what?)

### 3. Property Types & Formatting

**Critical: Test locally with real data before deploying**

Property type formatting for `pages.create()`:

```typescript
// Title field
{ Name: { title: [{ type: 'text', text: { content: 'value' } }] } }

// Select field (dropdown)
{ Status: { select: { name: 'Option Name' } } }

// Relation (link to another page)
{ Person: { relation: [{ id: 'page-uuid-here' }] } }

// Date field
{ Date: { date: { start: '2026-06-25' } } }

// Phone field
{ Phone: { phone_number: '(555) 123-4567' } }

// Email field
{ Email: { email: 'user@example.com' } }

// Rich text (paragraph/notes)
{ Notes: { rich_text: [{ type: 'text', text: { content: 'value' } }] } }
```

- [ ] All properties are formatted for their actual Notion type
- [ ] Select fields use `{ select: { name } }` not plain strings
- [ ] Relations use `{ relation: [{ id }] }` not page IDs directly
- [ ] Test locally: Write a test script that creates a page with all property types
- [ ] Verify the page appears in Notion with correct properties

### 4. Error Handling

- [ ] API errors are logged with full context:
  ```typescript
  catch (err: any) {
    logger.error({
      err: err.message,
      pageData,
      database_id,
    }, 'Failed to create Notion page');
  }
  ```
- [ ] Don't just log `err.message` — Notion API returns detailed validation errors
- [ ] Retry logic for transient failures (rate limiting, timeouts)
- [ ] Graceful degradation if Notion API is down

### 5. Database Schema Awareness

**Important: The Notion SDK's `databases.retrieve()` does NOT return the schema**

- [ ] Don't rely on `databases.retrieve()` to get property definitions
- [ ] Maintain a local mapping of known property types:
  ```typescript
  const selectFields = new Set(['Type', 'Status', 'Role']);
  const relationFields = new Set(['Person', 'Provider']);
  const dateFields = new Set(['Date']);
  ```
- [ ] Update this mapping when database schema changes
- [ ] Document what properties each database has (schemaSummary)

### 6. Search & Sync Behavior

- [ ] Be aware: Notion's search may be delayed
  - Pages created successfully but not immediately searchable
  - Use `pages.retrieve()` with ID for immediate verification
  - Search is approximate, not immediate
- [ ] If syncing multiple databases, handle partial failures gracefully
- [ ] Post-sync: Verify created pages by ID, not by search

---

## Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| "Type is expected to be select" | Passing `{ Type: 'value' }` instead of `{ Type: { select: { name: 'value' } } }` | Use correct property format |
| "Role is expected to be select" | Missing select field in property type mapping | Add 'Role' to `selectFields` set |
| Pages created but not in search | Notion's search indexing lag | Use `pages.retrieve(pageId)` for verification |
| Properties are empty/null | Passing `{ Date: '2026-06-25' }` instead of `{ Date: { date: { start: '2026-06-25' } } }` | Use correct date format |
| "Database ID not found" | Using wrong UUID (page ID instead of database ID) | Extract actual database UUID from database URL |
| Relation fields failing | Passing page names instead of IDs | Use actual page UUIDs with `{ relation: [{ id }] }` |

---

## Deployment Workflow

1. **Update property mappings** if database schema changed
2. **Test locally** with real database IDs and data
   - Create test entries with all property types
   - Verify they appear in Notion
   - Delete test entries
3. **Deploy** with updated code
4. **Monitor logs** for Notion API errors
   - Watch for validation errors
   - Check property formatting issues
5. **Verify** by creating a test entry in production if needed

---

## Local Testing Example

```typescript
// test_notion.ts
import { NotionService } from './agents/common/notion';

async function test() {
  const notion = NotionService.getInstance();
  
  try {
    const page = await notion.createPageInDatabase(databaseId, {
      title: 'Test Entry',
      Type: 'Checkup',           // Select field
      Date: '2026-06-25',        // Date field
      Person: personPageId,      // Relation field
      Phone: '(555) 123-4567',   // Phone field
      Notes: 'Test notes'        // Rich text field
    });
    
    console.log('✓ Created:', page.id);
    console.log('✓ Properties:', page.properties);
  } catch (err: any) {
    console.error('✗ Failed:', err.message);
  }
}

test();
```

Run: `npx ts-node -T test_notion.ts`

---

## Monitoring & Debugging

### In Logs

Look for:
- `notion_create_db_entry: attempting to create` — Property formatting about to be tested
- `Created new Notion page` — Page was created successfully
- `Failed to create Notion page` — Error details should follow
- `Notion API response from create` — Full response (first 500 chars logged)

### Manual Verification

1. Go to Notion database
2. Find the entry by title
3. Check each property is set correctly
4. If properties are empty, check the error logs for formatting issues

### Rollback

If Notion integration breaks:
1. Check the actual Notion API error in logs
2. Fix property formatting or database configuration
3. Deploy fix
4. Test locally before relying on production

---

## Related Files

- **Main integration:** `/agents/common/notion.ts`
- **Tools wrapper:** `/agents/common/notion_tools.ts`
- **Test examples:** See `test_notion_*.ts` files
- **Dev checklist:** `/Code/DEV-CHECKLIST.md` (External APIs section)

---

## Last Updated

2026-06-25 — Created based on Obed health agent Notion integration debugging. Key lessons: test property formatting locally, understand that SDK doesn't return schema, log full API errors.
