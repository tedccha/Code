#!/usr/bin/env node
/**
 * meeting-prep-scan.js
 *
 * Scans Google Calendar for upcoming meetings and triggers meeting prep.
 * Can be run manually, via cron, or as part of a daily automation.
 *
 * Usage:
 *   node scripts/meeting-prep-scan.js [--hours 48] [--auto]
 *
 * Options:
 *   --hours N   Look ahead N hours (default: 48)
 *   --auto      Non-interactive: prep all qualifying meetings without asking
 *
 * Requirements:
 *   - Google Calendar MCP connected in Claude
 *   - TANA_API_TOKEN environment variable set
 *
 * This script is meant to be triggered by Claude (via bash_tool or Claude Code).
 * It outputs a structured list of upcoming meetings for Claude to then prep.
 */

const LOOKAHEAD_HOURS = parseInt(process.argv.find((a, i, arr) => arr[i-1] === '--hours') || '48');
const AUTO_MODE = process.argv.includes('--auto');

const now = new Date();
const cutoff = new Date(now.getTime() + LOOKAHEAD_HOURS * 60 * 60 * 1000);

console.log(JSON.stringify({
  action: "scan_calendar",
  params: {
    timeMin: now.toISOString(),
    timeMax: cutoff.toISOString(),
    lookaheadHours: LOOKAHEAD_HOURS,
    autoMode: AUTO_MODE,
    filterRules: [
      "exclude events where you are the only attendee",
      "exclude daily recurring meetings (RRULE FREQ=DAILY)",
      "exclude weekly recurring meetings (RRULE FREQ=WEEKLY)",
      "include bi-weekly, monthly, or less frequent recurring meetings",
      "include all other meetings regardless of internal/external attendees",
      "exclude all-day events unless they have attendees and a clear meeting purpose"
    ]
  },
  instructions: `
Use Google Calendar MCP to list events between timeMin and timeMax.
Apply filterRules to identify qualifying meetings.
For each qualifying meeting, extract:
  - title
  - start datetime
  - attendees (name + email)
  - description (if any)
  - meeting link (Zoom/Meet/Teams URL if present)

If autoMode is false, present the list to the user and ask which to prep.
If autoMode is true, prep all of them.

For each meeting to prep, follow the full meeting-prep SKILL.md workflow.
  `
}));
