# Research Guide: LinkedIn + News

## LinkedIn Research (via web_search)

LinkedIn has no public API. Use web search with targeted queries.

### Step 0 — Check Dex First

If the contact was found in Dex, check for a LinkedIn URL in their profile before searching.
Dex often stores this as a  or  field.

- **If Dex has a LinkedIn URL** → skip profile lookup queries entirely. Go straight to
  activity/posts searches (queries 3 and 4 below), using the known name and company.
  Note in research log: "LinkedIn profile sourced from Dex"
- **If Dex has no LinkedIn URL**, or person not in Dex → run the full query sequence below

### Query Sequence (fallback when no Dex LinkedIn URL)

Run these in order, stopping when you have enough:

**1. Profile lookup**
```
"[Full Name]" "[Company Name]" site:linkedin.com
```
→ Looking for: title, company, tenure

**2. If company unknown**
```
"[Full Name]" linkedin.com/in
```
→ Often surfaces profile snippet with title in search result description

**3. Recent activity / posts**
```
"[Full Name]" "[Company]" linkedin post
```
OR
```
"[Full Name]" linkedin site:linkedin.com/posts
```
→ Looking for: topics they post about, thought leadership, opinions, recent announcements
→ When using web_search, sort/filter by recent (last 60 days) rather than hard-coding a year
→ If the search tool supports a date range parameter, use: past 2 months

**4. Career change detection**
```
"[Full Name]" "[Company]" "joined" OR "promoted" OR "excited to announce"
```
→ Do not append years — rely on search recency ranking to surface fresh results

### What to Extract

| Data Point | Where to find it |
|-----------|-----------------|
| Current title | LinkedIn profile snippet in search results |
| Previous role | "Previously at..." in profile snippet, or bio text |
| Recent posts | linkedin.com/posts URLs in results |
| Career news | "excited to share", "thrilled to announce" patterns |

### Interpretation Tips

- If search results show an old title (e.g., 2023), note uncertainty: "Title as of [year]"
- Post topics reveal what they care about — great for talking points
- Look for patterns: do they post about AI? Sales? Leadership? Note the theme
- A quiet LinkedIn presence is also useful to note

---

## News & Context Research

### Query Templates

**Person-focused:**
```
"[Full Name]" "[Company]" news recent
"[Full Name]" interview OR keynote OR announcement
```

**Company-focused:**
```
"[Company Name]" funding OR acquisition OR launch
"[Company Name]" layoffs OR restructuring OR CEO
```
→ Never hard-code years in queries — recency is handled by search ranking and the
  web_search tool's built-in freshness signals. If the tool supports date filtering,
  use "past 6 months" rather than a specific year.

**Topic-focused (for the meeting subject):**
```
[meeting topic] [industry] news 2026
[meeting topic] trends latest
```

### What Matters

Prioritize (in order):
1. Funding rounds, acquisitions, IPO activity — signals company trajectory
2. Product launches or major announcements — conversation hooks
3. Leadership changes — affects decision-making context
4. Industry headwinds — shows you understand their world
5. Personal press mentions — shows you've done homework

### What to Skip

- Blog posts older than 6 months (unless foundational/biographical)
- Generic industry listicles that don't mention the person/company
- Promotional content from the company's own PR

---

## Dex CRM Query Guide

If `dex_*` tools are available:

```
dex_find_contact(query: "[name]")        // search by name
dex_get_contact(id: "[contact_id]")      // get full details + history
```

Key fields to extract:
- `id` — use to construct the Dex profile link (see below)
- `lastInteraction.date` + `lastInteraction.type` + `lastInteraction.summary`
- `linkedinUrl` — if present, skip LinkedIn profile search queries
- `reminders[]` — any open/pending items
- `tags[]` + `groups[]` — relationship context
- `notes[]` (most recent 2–3) — conversation history

**Dex profile link:**
Construct from the contact's `id` field:
`https://getdex.com/appv3/contacts/[id]`

Include this as a URL node in the Tana brief under the attendee's name so you can
jump straight to their Dex profile. If the contact `id` is unavailable or the link
format turns out to be wrong, omit silently rather than showing a broken link.

**If `lastInteraction.type` is email:**
Always fetch the full thread via Gmail MCP:
```
// Search Gmail for threads with this contact around the interaction date
gmail_search(query: "from:[contact_email] OR to:[contact_email]", limit: 5)
→ pick the thread matching the Dex interaction date
→ read full thread content
→ summarize: topic, key asks, commitments made, tone
```
Use this richer summary in the "Last Interaction" section of the brief instead of
Dex's auto-generated summary.

If Dex returns multiple matches, pick the one whose company matches the meeting attendee.
If still ambiguous, mention both in the brief and ask user to confirm.

---

## Tana Notes Query Guide

If the Tana local MCP is available (Tana desktop running, `tana-local` configured):

**Endpoint:** `http://localhost:8262/mcp`
**Health check:** `http://localhost:8262/health`

```
// Search for notes referencing this person
search_nodes(query: "[Full Name]")
→ filter results for: meeting notes, interaction logs, person-tagged nodes

// Read the most relevant nodes
read_node(nodeId: "[id]")
→ extracts full node content as markdown including children
```

**What to look for:**
- Meeting notes with this person (look for their name in node title or body)
- Any node tagged with a person supertag matching their name
- Decisions, commitments, or personal context mentioned
- Daily notes that reference them

**Reconciling with Dex:**
- Compare Tana note dates vs. Dex `lastInteraction.date`
- Use the most recent as the primary "Last Interaction" in the brief
- If both have recent entries with different content, surface both:
  - "Last interaction (Dex): March 10 — email re: contract renewal"
  - "Tana notes: March 12 — [note content]"

**If Tana local MCP unavailable** (desktop not running):
- Note: "Tana local MCP offline — notes not searched"
- Continue with Dex + Gmail data only
