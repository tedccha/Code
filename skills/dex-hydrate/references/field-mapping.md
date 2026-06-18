# Field Mapping: Dex → Tana #Person

## Dex Fields to Extract

`dex_get_contact(id)` returns a contact object. Extract these fields:

| Dex field (try in order) | Maps to Tana | Notes |
|--------------------------|--------------|-------|
| `name` → `displayName` → `firstName + lastName` | Node name (rename) | Prefer `name`; concat first+last as fallback |
| `company` → `organization` → `employer` | Company field (`Q04zHyehJE6O`) | Plain string; needs lookup to Company node |
| `linkedinUrl` → `linkedin` | LinkedIn field (`aysf-gg5hGSz`) | Must be a profile URL (`/in/`) |
| `phone` → `phones[0].value` | Phone field (`sQIKjJtHrVG6`) | Optional; skip if not present in schema |

⚠️ Dex field names vary slightly across API versions — always try the primary key first,
fall through to alternates if null/undefined.

---

## Write Strategy by Field Type

### Node Name (rename email → real name)

**Read:** Node name is always the email for autocreated nodes (e.g. `john@acme.com`).

**Write:**
```
edit_node({
  nodeId: "...",
  name: {
    old_string: "john@acme.com",   // must exactly match current node name
    new_string: "John Smith"
  }
})
```

**Guards before renaming:**
- Dex name must be non-empty
- Dex name must NOT look like an email address (don't rename to another email)
- Dex name must NOT be just a company name (sometimes Dex stores "Acme Corp" as the name for unresolved contacts)

---

### LinkedIn (URL field — `aysf-gg5hGSz`)

**Write:**
```
set_field_content({
  nodeId: "...",
  attributeId: "aysf-gg5hGSz",
  content: "https://www.linkedin.com/in/johnsmith"
})
```

**Validation:**
- Must contain `linkedin.com/in/` — skip company pages (`/company/`)
- Must start with `https://`
- If Dex returns a URL without `https://`, prepend it

---

### Company (Instance of #Company — `Q04zHyehJE6O`)

This is a **reference field** — it stores a link to a `#Company` node, not a plain string.
`set_field_content` accepts a node ID for reference fields.

**Step 1 — Find existing Company node:**
```
search_nodes({
  and: [
    { hasType: "dOyQBmskUrt9" },
    { textContains: "[company name from Dex]" }
  ]
})
```

**Step 2a — Match found:**
Check that the result name is a close match (not just a substring coincidence).
If confident:
```
set_field_content({
  nodeId: personNodeId,
  attributeId: "Q04zHyehJE6O",
  content: companyNodeId    // the ID of the found #Company node
})
```

**Step 2b — No match found (create + link in one step):**
```
import_tana_paste({
  parentNodeId: personNodeId,
  content: "%%tana%%\n- [[^Q04zHyehJE6O]]:: [[Company Name #^dOyQBmskUrt9]]"
})
```
Replace `Company Name` with the actual company name from Dex.
Tana will find an existing #Company node by name or create a new one if it doesn't exist.

**⚠️ Do NOT call `set_field_content` with a plain string on a reference field** — it will
fail silently or create a broken link. Always use a node ID or `import_tana_paste`.

---

## Name Disambiguation

Sometimes Dex returns names that need cleanup before writing to Tana:

| Dex name value | Action |
|----------------|--------|
| `"John Smith"` | ✅ Use as-is |
| `"john smith"` | Capitalize: "John Smith" |
| `"JOHN SMITH"` | Titlecase: "John Smith" |
| `"john@acme.com"` | ❌ Looks like email — do not rename |
| `"Acme Corp"` (same as company) | ❌ Likely unresolved — do not rename |
| `""` or `null` | ❌ Skip rename |
| Single word (e.g., `"John"`) | ⚠️ Use if confident, note it's partial |

---

## Dex Profile Link (optional enrichment)

If the contact's `id` field is available, you can add a Dex profile link as a child node
under the person for easy CRM access:

```
import_tana_paste({
  parentNodeId: personNodeId,
  content: "%%tana%%\n- 🔗 [Dex profile](https://getdex.com/appv3/contacts/[id])"
})
```

Only add this if the user has opted into enrichment (or if explicitly requested).
Don't add it during a standard bulk hydration run — it adds noise.
