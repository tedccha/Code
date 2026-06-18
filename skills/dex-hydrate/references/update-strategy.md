# Update Strategy

## Default Mode: Fill-Empty-Only

By default, the skill only writes to fields that are currently unset. It never
overwrites existing Tana data automatically.

| Tana field state | Dex has data | Action |
|------------------|--------------|--------|
| Empty / not set  | Yes          | ✅ Write to Tana |
| Already set      | Same value   | ⏭ Skip (already correct) |
| Already set      | Different    | ⚠️ Flag as conflict — do NOT overwrite |
| Empty / not set  | Empty / null | ⏭ Skip (nothing to write) |

---

## Overwrite Mode

Triggered by: "overwrite", "force update", "sync all from Dex", "take Dex data"

- Same logic, but also updates fields that already have values
- Before starting, ask the user: **"This will overwrite existing Tana data with Dex data for
  conflicting fields. Proceed?"**
- Wait for explicit confirmation
- Conflicts are still logged in the final report, but the Dex value wins

---

## Conflict Definition

A conflict occurs when **both** Tana and Dex have a non-empty value for the same field
AND the values differ meaningfully.

**Fuzzy matching** — treat as the same (no conflict) if:
- Values differ only in case: "acme corp" vs "Acme Corp"
- Values differ only in punctuation: "Acme Corp." vs "Acme Corp"
- One is a substring of the other: "John S." vs "John Smith" — flag as soft conflict
  (mention in report but don't block)

**Genuine conflicts** (flag and skip):
- Different companies: "Google" vs "Meta"
- Different roles: "Director" vs "VP of Engineering"
- Different names: "Jon Smith" vs "Jonathan Smith" — ambiguous spelling/preferred name

In the final report, list all conflicts clearly so the user can decide:
```
⚠️ Conflicts not updated (Tana value kept):
   - alice@acme.com — Role: Tana "Director" / Dex "VP of Engineering"
   - bob@co.com — Company: Tana "OldCo" / Dex "NewCo (acquired OldCo)"
→ Say "overwrite conflicts" to accept all Dex values, or name specific ones
```

---

## Reading Before Writing (Critical)

Always `read_node(nodeId)` before any write to confirm which fields are actually empty.

The `search_nodes` query filters on `field: state: "notSet"` for the Company field,
but this only tells you about Company. A node might have Company empty but Role already set.

**Pattern:**
1. `search_nodes` → get candidate nodes (filtered by empty Company)
2. `read_node` each → get actual current state of ALL fields
3. Write only the fields confirmed empty from `read_node`

This prevents duplicate field entries from `import_tana_paste` calls on fields
that are already set.

---

## Batching for Large Workspaces

`search_nodes` returns max 100 results with no offset parameter.

### If ≤100 incomplete nodes → single pass, done.

### If >100 incomplete nodes → use these strategies:

**Strategy A — Field-based batching (recommended):**
Run multiple targeted queries, each filtering for a different empty field, and
deduplicate by nodeId across results:
```
Pass 1: field: { fieldId: "Q04zHyehJE6O", state: "notSet" }  → Company empty
Pass 2: field: { fieldId: "aysf-gg5hGSz", state: "notSet" }  → LinkedIn empty
```
Merge results, deduplicate by nodeId, process unique set.

**Strategy B — Time-based batching:**
Filter by creation date to work through the backlog:
```
Pass 1: and: [hasType, created: { last: 30 }, field: notSet]
Pass 2: and: [hasType, created: { last: 90 }, field: notSet]   (overlapping, dedup by id)
```

**Strategy C — User-directed:**
"Hydrate contacts from [company domain]" — filter by textContains on node name:
```
search_nodes({
  and: [
    { hasType: "nZpkld7dQskJ" },
    { textContains: "@acme.com" }
  ]
})
```
Works well for batch-processing all contacts from a specific organization.

---

## Idempotency

The skill is safe to run multiple times:

- `fill-empty-only` mode is naturally idempotent — re-running on already-hydrated
  nodes does nothing (all fields already set → all skipped)
- `edit_node` requires `old_string` to match exactly → renames can't double-fire
  (once renamed to "John Smith", `old_string: "john@acme.com"` won't match)
- `set_field_content` on a field already set = no write (caught by `read_node` check)
- `import_tana_paste` for Company/Role is the only non-idempotent operation → always
  gate with `read_node` check before calling

---

## Parallel Processing

Dex lookups (read) can be parallelized: up to **5 concurrent** `dex_find_contact` /
`dex_get_contact` calls.

Tana writes should be **sequential** with ~200ms gap between calls to avoid race conditions
on the local MCP server. If `import_tana_paste` returns an error, wait 500ms and retry once.

Recommended pattern:
```
1. Fetch all candidate nodes from Tana (1 search call)
2. Read all nodes in batches of 5 (parallel read_node calls)
3. Perform all Dex lookups in batches of 5 (parallel)
4. Write back to Tana sequentially, one node at a time
```

---

## Scope Confirmation for Large Batches

If the scope would affect more than 50 nodes, always ask for confirmation first:

```
"I found 143 incomplete #Person nodes. This will look each one up in Dex and fill
in their name, company, role, and LinkedIn URL. Proceed with all 143, or would you
like to start with a smaller batch?"
```

Give the user options: all, first 20, or a specific filtered subset.
