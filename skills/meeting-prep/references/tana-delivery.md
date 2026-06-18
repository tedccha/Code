# Tana Delivery Reference

## Setup

- **Input API Endpoint:** `https://europe-west1-tagr-prod.cloudfunctions.net/addToNodeV2`
- **Auth header:** `Authorization: Tana <TANA_API_TOKEN>`
- **Content-Type:** `application/json`
- **Rate limit:** 1 call/second, max 100 nodes/call, max 5000 chars/call
- **Local MCP:** `http://localhost:8262/mcp` (for reading + finding #Meeting nodes)

Get token from: Tana → Settings → API Tokens

---

## Dedup: Stamping the Google Calendar Event ID

Every prep node must include the Google Calendar event ID so future scans can detect it
and avoid re-prepping the same meeting.

When appending to a #Meeting node, add a hidden stamp as the first child bullet:
```
- gcal_event_id: [eventID]
```

Future scans use `search_nodes` to check if a #Meeting node already contains a
`gcal_event_id:` child matching the event. If found → skip. If meeting changed → add
an `[UPDATED]` bullet rather than a duplicate full brief.

---

## Primary Delivery: Append to #Meeting Node

The preferred target is the existing `#Meeting` node in Tana (Library > Google Calendar
Events) that corresponds to the calendar event.

**Step 1 — Find the matching #Meeting node via local MCP:**
```
search_nodes(query: "[Meeting Title] [Date]")
→ filter results for nodes tagged #Meeting
→ match on: title similarity + date field matching the event date
→ if multiple matches, pick the one whose date field exactly matches the event
```

**Step 2 — Check for existing prep (dedup):**
```
get_children(nodeId: "[matched #Meeting nodeId]")
→ scan children for a node containing "gcal_event_id: [eventID]"
→ if found and unchanged → skip
→ if found and meeting changed → append "⚠️ Updated prep" section
→ if not found → proceed with full prep
```

**Step 3 — Append prep as child bullets using import_tana_paste:**
```
import_tana_paste(
  targetNodeId: "[matched #Meeting nodeId]",
  content: "%%tana%%\n- Meeting Prep\n  ..."
)
```

**Fallback if #Meeting node not found** (event not yet synced, or local MCP offline):
- Post to `INBOX` via Input API instead
- Note at top of brief: "⚠️ Could not find #Meeting node — posted to Inbox"

---

## Tana Paste Format

Use Tana Paste syntax when calling `import_tana_paste`. Structure the brief as nested
bullets under a "Meeting Prep" parent node.

**Single attendee:**
```
%%tana%%
- gcal_event_id: [eventID]
- Meeting Prep
  - **Who They Are**
    - [Title] at [Company], [tenure if known]
    - [Relationship context from CRM]
    - 🔗 Dex: https://getdex.com/appv3/contacts/[id]
  - **Last Interaction**
    - [Date] — [summary from Dex / Gmail thread / Tana notes]
    - Open items: [pending reminders]
  - **LinkedIn Activity**
    - Posted about: [topic 1], [topic 2]
    - [Career update if any]
  - **Company News**
    - [Key recent news]
  - **Suggested Talking Points**
    - [Point 1]
    - [Point 2]
  - **Quick Context**
    - [One sentence bottom line]
```

**Multi-attendee:**
```
%%tana%%
- gcal_event_id: [eventID]
- Meeting Prep
  - 👤 [Attendee 1 Name] — [Title] at [Company]
    - **Who They Are** ...
    - **Last Interaction** ...
    - ...
  - 👤 [Attendee 2 Name] — [Title] at [Company]
    - **Who They Are** ...
    - ...
  - 👥 Not prepped: [Name], [Name] — say "Prep [Name] from [meeting]" to add
```

---

## Fallback: Input API to INBOX

Used when local MCP is offline or no matching #Meeting node found.

```json
{
  "targetNodeId": "INBOX",
  "nodes": [
    {
      "name": "🗓 Prep: [Meeting Title] — [Date]",
      "description": "gcal_event_id: [eventID]",
      "children": [
        {
          "name": "👤 [Attendee Name] — [Title] at [Company]",
          "children": [
            { "name": "**Who They Are**", "description": "...",
              "children": [{ "dataType": "url", "name": "https://getdex.com/appv3/contacts/[id]", "description": "Dex profile" }]
            },
            { "name": "**Last Interaction**", "description": "..." },
            { "name": "**LinkedIn Activity**", "description": "..." },
            { "name": "**Company News**", "description": "..." },
            { "name": "**Suggested Talking Points**", "description": "..." },
            { "name": "**Quick Context**", "description": "..." }
          ]
        }
      ]
    }
  ]
}
```

---

## Minimal Test Payload (verify token works)

```bash
curl -X POST \
  https://europe-west1-tagr-prod.cloudfunctions.net/addToNodeV2 \
  -H "Authorization: Tana $TANA_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"targetNodeId":"INBOX","nodes":[{"name":"Meeting Prep skill: connection test ✓"}]}'
```

---

## #Meeting Supertag Schema (hardcoded)

Supertag nodeID: `7oQEPT5QcaZQ`

Known field attributeIds (from Show API schema):
| attributeId      | Type      | Field name         |
|------------------|-----------|--------------------|
| tXmmXtBjlmmq     | date      | Date               |
| 6gDVldPdf5sI     | Node[]    | Attendees          |
| Bzr4ijYgIB-c     | url       | Meeting link       |
| iQEykBUwxXuM     | reference | Event status (your RSVP) |
| JhMxMXwq0FV8     | Node[]    | Transcript         |
| kuOI4rluCS3i     | Node[]    | Tasks              |
| l7jOO1AbYVdv     | reference | Event status (duplicate/organizer status) |

Event status reference values (used by both iQEykBUwxXuM and l7jOO1AbYVdv):
- `SYS_V123` — Declined
- `SYS_V122` — Cancelled
- `SYS_V121` — Tentative
- `SYS_V120` — Confirmed

**Useful for matching:** Filter `search_nodes` results to only `Confirmed` or `Tentative`
meetings — skip any #Meeting node where event status is Declined or Cancelled.

**Tasks field bonus:** After the meeting, the skill could optionally write follow-up
action items into the `kuOI4rluCS3i` (Tasks) field of the same #Meeting node.

The skill appends prep content as plain child nodes under the matched #Meeting node —
it does NOT need to create new #Meeting nodes or set these fields. The fields above are
useful for **matching** the right node (e.g. filter search_nodes results by date field
`tXmmXtBjlmmq` matching the event date) rather than for writing.

**Matching logic using the date field:**
When `search_nodes` returns multiple #Meeting candidates with similar titles, use the
date field `tXmmXtBjlmmq` to disambiguate — pick the node whose date matches the
Google Calendar event start time.
