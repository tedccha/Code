---
name: dex-hydrate
description: >
  Hydrates Tana #Person nodes with data from Dex CRM. Person nodes in Tana are
  autocreated from Google Calendar contacts, leaving the node name as a raw email
  address and all other fields empty. This skill looks each person up in Dex by
  email and fills in: display name (renames node), company, role, and LinkedIn URL.
  Triggers when the user says "hydrate person nodes", "sync Dex to Tana",
  "enrich my contacts", "fill in person data from Dex", "update contacts from Dex",
  "who is [email]", or similar. Can target a specific person, a filtered subset, or
  all incomplete #Person nodes.
compatibility:
  required_tools:
    - Tana local MCP (tana-local at http://localhost:8262/mcp)
      Setup: Tana desktop running, Local API enabled in Tana Labs
             claude mcp add --transport http tana-local http://localhost:8262/mcp
    - Dex MCP (dex_* tools)
  required_env: []  # No TANA_API_TOKEN needed — all writes via local MCP
---

# Dex → Tana Person Hydration Skill

Looks up Tana `#Person` nodes by email address in Dex CRM and fills in missing
fields: display name, company, role, and LinkedIn URL.

---

## Known Schema (hardcoded — do not rediscover)

| Item              | ID                  |
|-------------------|---------------------|
| Workspace         | `sEoMxmaw_i2h`      |
| #Person tag       | `nZpkld7dQskJ`      |
| Email field       | `k9O0oY4fMfJr`      |
| Company field     | `Q04zHyehJE6O`      |
| LinkedIn field    | `aysf-gg5hGSz`      |
| Phone field       | `sQIKjJtHrVG6`      |
| #Company tag      | `dOyQBmskUrt9`      |

**Field types (critical for write strategy):**
- Email → Instance of #E-Mail (already populated by autocreation — read-only for this skill)
- Company → Instance of #Company (reference field — requires node ID or paste syntax)
- LinkedIn → URL (use `set_field_content`)
- Node name → email address (rename via `edit_node`)

---

## Step 1 — Determine Scope

Ask the user (or infer from context):

| User says | Scope |
|-----------|-------|
| "hydrate all" | All #Person nodes (ask to confirm if >50) |
| "hydrate incomplete" / default | Nodes where Company field is not set |
| "hydrate [email or name]" | Single specific person |
| "hydrate contacts from [company]" | Filter by node name pattern |
| "hydrate recently added" | Nodes created in last 30 days |

**Default behavior (no explicit scope):** incomplete contacts — nodes where the
Company field is not set. This is the safest starting point and covers the highest-value work.

---

## Step 2 — Fetch #Person Nodes

### Default (incomplete only):
```
search_nodes({
  and: [
    { hasType: "nZpkld7dQskJ" },
    { field: { fieldId: "Q04zHyehJE6O", state: "notSet" } }
  ],
  limit: 100
})
```

### All persons:
```
search_nodes({ hasType: "nZpkld7dQskJ", limit: 100 })
```

### Single person (by email or name):
```
search_nodes({
  and: [
    { hasType: "nZpkld7dQskJ" },
    { textContains: "[email or name]" }
  ]
})
```

⚠️ `search_nodes` returns max 100 with no offset. For large workspaces, see
`references/update-strategy.md` for batching approaches.

---

## Step 3 — Hydrate Each Person

Process in parallel batches of up to 5. For each node:

### 3a. Extract the email

The node name IS the email (always, for autocreated nodes). Use it directly.
No need to read the Email field — it's the same value and is already set.

### 3b. Dex lookup

```
dex_find_contact(query: "[email]")
```
- **Match found** → `dex_get_contact(id: contactId)` for full details
- **No match** → log "not in Dex", skip this node
- **Multiple matches** → pick the one whose email exactly matches; if still ambiguous, skip and log

Extract from Dex (see `references/field-mapping.md` for exact field names):
- `name` / `displayName` — full name
- `company` — current company name
- `linkedinUrl` — LinkedIn profile URL

### 3c. Check what's already set

```
read_node(nodeId)
```

Scan the output to see which fields already have values. Only write to empty fields
(default mode). See `references/update-strategy.md` for conflict rules.

### 3d. Write back to Tana

Apply updates for each empty field using the correct write strategy per field type:

**① Rename node** (email → real name):
```
edit_node({
  nodeId: personNodeId,
  name: { old_string: "john@acme.com", new_string: "John Smith" }
})
```
Only do this if Dex returned a non-empty name that is not itself an email address.

**② LinkedIn URL** (URL field — simple):
```
set_field_content({
  nodeId: personNodeId,
  attributeId: "aysf-gg5hGSz",
  content: "https://www.linkedin.com/in/johnsmith"
})
```
Validate: must start with `https://` and contain `linkedin.com/in/`. Skip if not a profile URL.

**③ Company** (Instance of #Company — reference field):
First, search for an existing #Company node:
```
search_nodes({
  and: [
    { hasType: "dOyQBmskUrt9" },
    { textContains: "[company name]" }
  ]
})
```
- **Found** → link via `set_field_content({ nodeId, attributeId: "Q04zHyehJE6O", content: companyNodeId })`
- **Not found** → create + link via `import_tana_paste`:
  ```
  import_tana_paste({
    parentNodeId: personNodeId,
    content: "%%tana%%\n- [[^Q04zHyehJE6O]]:: [[Company Name #^dOyQBmskUrt9]]"
  })
  ```

---

## Step 4 — Report Results

After all nodes are processed:

```
Dex → Tana hydration complete.

✅ Updated: 23 contacts
   - Renamed: 21 (email → full name)
   - Company filled: 19
   - LinkedIn filled: 12

⏭ Skipped: 4 contacts
   - 2 not found in Dex
   - 1 Dex returned no name
   - 1 LinkedIn URL was a company page (not a profile)

⚠️ Conflicts (existing Tana data differs from Dex — not overwritten): 2
   - alice@example.com — Role: Tana "Director" / Dex "VP of Engineering"
   - bob@co.com — Company: Tana "OldCo" / Dex "NewCo"
   → Say "resolve conflicts" to review each one, or "overwrite conflicts" to take Dex data
```

Offer: "Run again on remaining nodes?" or "Hydrate a specific person?"

---

## Error Handling

| Situation | Response |
|-----------|----------|
| Tana local MCP offline | Stop — tell user to open Tana desktop and enable Local API |
| Dex not connected | Stop — tell user to connect Dex MCP |
| Person not in Dex | Log, skip, include in final report |
| Dex returns multiple matches | Pick exact email match; if ambiguous, skip and log |
| Dex has name but it looks like an email | Do not rename — log "Dex name looks like email, skipped rename" |
| LinkedIn URL is a company page (not `/in/`) | Skip LinkedIn field, log it |
| Company node search returns fuzzy match | Use only if match confidence is high (>90% name similarity); otherwise create new |
| `import_tana_paste` creates duplicate field | Happens if field was already set — prevent by reading node first (Step 3c) |
| Dex rate limit (429) | Pause 5s, retry once; if still failing, stop and report |
| >100 person nodes | Process first 100; report "N more nodes exist — run again to continue" |

---

## Reference Files

- `references/field-mapping.md` — Dex field names, type-specific write strategies
- `references/update-strategy.md` — Conflict rules, overwrite mode, batching
