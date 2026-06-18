---
name: meeting-prep
description: >
  Automatically prepares rich, contextual briefings before meetings. Use this skill
  whenever the user mentions an upcoming meeting, asks to "prep for" a call or meeting,
  wants to know about someone they're meeting, or says things like "I have a meeting with X",
  "prep me for my call with Y", "brief me on Z before our meeting", or "what do I know about
  [person] before we talk". Also triggers when the user asks to scan their calendar for
  upcoming meetings. Always use this skill proactively if a meeting or call with a named person
  is mentioned — even casually. Delivers briefs to Tana by default, with optional Google Calendar
  or Gmail delivery.
compatibility:
  required_tools:
    - Google Calendar MCP: "claude.ai Google Calendar" at https://gcal.mcp.claude.com/mcp
        Setup: claude mcp auth "claude.ai Google Calendar"  (Claude.ai connector, OAuth)
    - Gmail MCP: "claude.ai Gmail" at https://gmail.mcp.claude.com/mcp
        Setup: claude mcp auth "claude.ai Gmail"  (Claude.ai connector, OAuth)
    - web_search (for news + LinkedIn research)
  optional_tools:
    - Dex MCP (dex_* tools, for CRM context)
    - Tana local MCP (tana-local at http://localhost:8262/mcp, for reading Tana notes)
      Requires: Tana desktop app running, Local API enabled in Tana Labs
      Setup: Tana → Options → Local API settings → enable Claude Code option
             OR: claude mcp add --transport http tana-local http://localhost:8262/mcp
  required_env:
    - TANA_API_TOKEN (for Tana delivery via Input API)
---

# Meeting Prep Skill

Generates a structured pre-meeting briefing for every attendee, pulling from CRM history,
LinkedIn activity, and recent news. Delivers to Tana by default.

---

## Step 1 — Identify the Meeting

**On-demand (user names a person/meeting):**
- Extract: attendee name(s), meeting topic/title, date/time if known
- If multiple attendees, brief all of them

**Calendar scan mode:**
- Use Google Calendar MCP (`claude.ai Google Calendar`) as the **authoritative source** for event
  details — attendees, description, recurrence, RSVP status, and Google Calendar event ID
- ⚠️ **Do not rely on Tana alone for attendee data.** Tana's GCal sync is shallow: events
  created from messages (e.g. Gmail smart scheduling) often sync with no attendees and a
  generic description ("This event was created from a message"). Always pull fresh from GCal.
- After fetching from GCal, optionally cross-reference the matching Tana #Meeting node for
  any notes or prep already added there (see Step 1b dedup check)
- Filter out:
  - Meetings where you are the only attendee (solo blocks, focus time, OOO)
  - Daily recurring meetings (recurrence rule: FREQ=DAILY)
  - Weekly recurring meetings (recurrence rule: FREQ=WEEKLY)
  - Keep bi-weekly, monthly, or less frequent recurring meetings
  - Keep all other meetings regardless of whether attendees are internal or external
  - Skip meetings where your RSVP status is Declined or Cancelled (event status field
    in Tana: SYS_V122 = Cancelled, SYS_V123 = Declined)
- For each qualifying meeting, apply the attendee cap rule (see below)
- Ask the user: "I found [N] upcoming meetings. Prep all of them, or pick specific ones?"

**Exclusion list:**
Never prep the following people — skip them silently, do not mention them in the brief or
in the "additional attendees not prepped" footer:
- cha.jennifer.s@gmail.com
- jswc.mail@gmail.com
- ccha888@gmail.com
- acha503@gmail.com

To add more exclusions, update this list directly in SKILL.md.

**Attendee cap rule:**
- First, remove excluded emails from the attendee list entirely
- If ≤5 remaining attendees → prep everyone
- If >5 remaining attendees → prep up to 4 people:
  1. The organizer (if not you)
  2. The next 3 people in invite list order
- For skipped attendees, add a note at the bottom of the brief:
  "👥 [N] additional attendees not prepped: [Name, Name, ...] — ask me to prep any of them."

---

## Step 1b — Deduplication Check (calendar scan mode only)

Before prepping any meeting, check if it's already been prepped by searching Tana for an
existing node whose description contains `gcal_event_id: [eventID]`.

**Logic:**
1. Search Tana INBOX (or user's designated Meeting Prep node) for `gcal_event_id: [eventID]`
2. If **not found** → proceed with full prep
3. If **found and meeting is unchanged** → skip silently; count it in end-of-scan summary
4. If **found but meeting has changed** (new attendee, time shifted >30 min, title changed):
   - Create new node: `🗓 Prep [UPDATED]: [Meeting Title] — [Date]`
   - Add child: `⚠️ Updated since last prep — [what changed]`
   - Re-research new attendees only; skip unchanged attendees

After all meetings are processed, report:
- ✅ [N] newly prepped
- ⏭ [N] skipped (already done)
- 🔄 [N] re-prepped (meeting changed)

**Storing the event ID:** When creating a prep node, always include in the top-level node's
description field: `gcal_event_id: [Google Calendar event ID]`
This is what future scans use to detect the node.

---

## Step 2 — Research Each Attendee

Run these in parallel for each attendee. See `references/research-guide.md` for detailed prompts.

### 2a. Dex CRM Lookup
If `dex_*` tools are available:
```
dex_find_contact(name or email)
→ pull: role, company, last interaction date + type + summary, open reminders, tags/groups, linkedinUrl
```
If the last interaction type is **email**, always fetch the full Gmail thread via Gmail MCP
(search by the contact's email address + approximate date). Summarize key points from the
thread for the brief — don't just rely on Dex's summary.

If Dex is not available, note "No CRM data" and continue.

### 2a-ii. Tana Notes Lookup
If the Tana local MCP is available (`tana-local` tools, at `http://localhost:8262/mcp`):
```
search_nodes(query: "[Full Name]")
→ scan results for notes, meeting logs, or any node referencing this person
→ read_node on the most recent 2–3 hits to extract context
```
Look for: past meeting notes, decisions made, commitments, personal details mentioned.
Compare with Dex's last interaction date — use whichever is more recent as the
authoritative "last interaction" in the brief. Surface both if they add different context.

If Tana local MCP is not available (desktop app not running), skip silently.

### 2b. LinkedIn Research (via web search)
First, check if Dex returned a LinkedIn URL for this contact (field: `linkedin` or `linkedinUrl`):
- **Yes** → skip profile lookup, go straight to activity/posts searches
- **No** → run full search sequence (see `references/research-guide.md`)

Extract:
- Current title and company
- Previous roles (last 2)
- Recent posts (last 60 days if findable) — note topics/themes
- Any career changes or announcements

### 2c. News & Context Search
Run 2–3 searches:
1. `"[Full Name]" "[Company]" news 2025 OR 2026`
2. `"[Company]" news recent` (funding, product launches, layoffs, partnerships)
3. If meeting has a topic: `[topic] [industry] recent developments`

Summarize: any notable recent events, press mentions, relevant industry news.

---

## Step 3 — Compose the Brief

Use the template in `references/brief-template.md`.

One brief section per attendee. For multi-attendee meetings, add a "Meeting Context" section
at the top with the overall purpose and dynamic between attendees if inferable.

**Tone:** Concise, scannable, actionable. No filler. Every line should be something the user
can actually use in the meeting.

---

## Step 4 — Deliver to Tana

Default delivery is Tana. See `references/tana-delivery.md` for the full API pattern.

**Node structure:**
- Target: `INBOX` (or a `Meeting Prep` node if the user has one — ask once, remember it)
- Node name: `🗓 Prep: [Meeting Title] — [Date]`
- Children: one child node per attendee section + a "Meeting Context" node if multi-attendee

**Environment variable required:** `TANA_API_TOKEN`
API endpoint: `https://europe-west1-tagr-prod.cloudfunctions.net/addToNodeV2`

**Optional delivery overrides** (user can request):
- "Also email me" → use Gmail MCP to send the brief to the user's own address
- "Add to the calendar event" → use Google Calendar MCP to append brief to event description
- Both can be combined with Tana

---

## Step 5 — Post-Delivery Confirmation

After delivering, tell the user:
- Where the brief was sent (Tana INBOX / email / calendar)
- A 2-sentence executive summary of the most important thing to know going into the meeting
- Offer: "Want me to set a reminder or prep follow-up tasks after the meeting?"

---

## Error Handling

| Situation | Response |
|-----------|----------|
| Dex not connected | Skip CRM section, note it in brief, continue |
| Person not found in Dex | Note "Not in CRM", suggest adding them after meeting |
| Dex last interaction is email, Gmail fetch fails | Use Dex summary only, note "Full thread unavailable" |
| LinkedIn URL in Dex | Skip profile search, go straight to activity searches |
| LinkedIn profile not found via search | Note "Limited LinkedIn data", use what's available |
| No news found | Note "No recent news found" in brief |
| Tana local MCP offline (desktop not running) | Skip Tana notes search silently, note "Tana notes not searched" |
| Tana local MCP available but person not found | Note "No Tana notes found for this person" |
| Tana Input API error (write) | Fall back to displaying brief inline; offer to email instead |
| Calendar MCP not available | Run `claude mcp auth "claude.ai Google Calendar"` to re-authenticate, then retry |
| GCal event has no attendees in Tana | Expected for message-created events — always fetch from GCal directly, not Tana |

---

## Reference Files

- `references/brief-template.md` — Exact format and structure for the brief
- `references/tana-delivery.md` — Tana API call patterns with examples
- `references/research-guide.md` — Search query strategies for LinkedIn + news
