---
name: apply-improvements
version: 1.0.0
description: |
  Review and apply improvement signals collected across all projects. Syncs signals
  from all registered projects, groups by skill, steps through each one interactively
  (Apply / Skip / Won't Fix / Defer), patches skill files directly, and writes a
  session summary. This is the "git commit" of the feedback loop — the explicit,
  human-reviewed apply step.
  Use when asked to "apply improvements", "review signals", "skill improvement session",
  or "what signals are queued".
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - AskUserQuestion
---

# /apply-improvements — Skill OS Improvement Session

You are running the `/apply-improvements` workflow. This is an **interactive review session**.
You will step through queued improvement signals one at a time, decide what to do with each,
and patch skill files in place. Think of this as the `git commit` of the feedback loop.

---

## Preamble (run first)

```bash
# Guard: Skill OS must be initialized
[ -f "$HOME/.claude/organizer/registry.json" ] || {
  echo "ERROR: Skill OS not initialized. Run: gstack-organizer init"
  exit 1
}

# Sync all project signals → HQ first
echo "Syncing project signals..."
~/.claude/organizer/bin/gstack-organizer sync

# Count actionable signals
_SIG_FILE="$HOME/.claude/organizer/improvements/signals.jsonl"
_SIG_COUNT=$(grep -c . "$_SIG_FILE" 2>/dev/null || echo 0)
echo "SIGNALS: $_SIG_COUNT"

# Show current status
~/.claude/organizer/bin/gstack-organizer status
```

If `SIGNALS` is `0`: tell the user **"No signals queued. All skills are up to date."** and stop.

If `SIGNALS` > 0: continue to Step 1.

---

## Step 1: Load and Filter Signals

Read `~/.claude/organizer/improvements/signals.jsonl`. Each line is a JSON object.

Parse all lines with python3:
```bash
python3 - <<'EOF'
import json, sys
signals = []
with open(f"{__import__('os').path.expanduser('~')}/.claude/organizer/improvements/signals.jsonl") as f:
    for line in f:
        line = line.strip()
        if line:
            try:
                signals.append(json.loads(line))
            except json.JSONDecodeError:
                pass
# Filter: skip signals with no description (vague — not actionable)
actionable = [s for s in signals if s.get("description","").strip()]
# Cap at 20 per session — work through the highest-priority ones first
# Priority: high > medium, then by ts ascending (oldest first)
def priority(s):
    sev = {"high": 0, "medium": 1, "low": 2}.get(s.get("severity","low"), 2)
    return (sev, s.get("ts",""))
actionable.sort(key=priority)
actionable = actionable[:20]
# Group by skill
from collections import defaultdict
by_skill = defaultdict(list)
for s in actionable:
    by_skill[s.get("skill","unknown")].append(s)
print(json.dumps({"total": len(actionable), "by_skill": {k: v for k, v in by_skill.items()}}))
EOF
```

Store the result. Tell the user:

```
Found <N> actionable signals across <K> skills.
Capped at 20 for this session (oldest/highest-priority first).
```

---

## Step 2: Per-Skill Review Loop

For each skill group (in order of decreasing signal count):

### 2a. Show skill header

Look up the skill in `registry.json`:
```bash
python3 -c "
import json,os
d=json.load(open(os.path.expanduser('~/.claude/organizer/registry.json')))
skill=[s for s in d['skills'] if s['name']=='SKILL_NAME']
print(json.dumps(skill[0] if skill else {}))
"
```

Print a header like:
```
╔══════════════════════════════════════════════════════╗
║  Skill: ship   (high tier • score: 8.5 • v0.9.9.0)  ║
║  Signals: 3                                           ║
╚══════════════════════════════════════════════════════╝
```

### 2b. For each signal in the skill group

Present the signal, then use AskUserQuestion:

**Signal display format:**
```
Signal N of M  ·  skill: <skill>  ·  severity: <severity>
──────────────────────────────────────────────────────────
Event:       <event_type>
Project:     <project>
Branch:      <source_branch>
Timestamp:   <ts>
Signal:      <signal>
Description: <description>
Suggested:   <suggested_fix or "(none)">
──────────────────────────────────────────────────────────
```

**AskUserQuestion format:**

1. **Re-ground:** State which skill is being reviewed and which signal this is (e.g., "Reviewing signal 2 of 3 for `ship`").
2. **Simplify:** Explain the signal in plain English — what problem does it describe, and what would a fix look like?
3. **Recommend:** If `suggested_fix` is non-empty, recommend Apply. If `suggested_fix` is empty and the description is vague, recommend Skip.
4. **Options:**
   - A) Apply — patch the skill's SKILL.md now
   - B) Skip — leave in queue for next session
   - C) Won't Fix — discard permanently (will ask for a reason)
   - D) Defer — add to open-questions.md for later investigation

---

### 2c. Handling each choice

#### A) Apply

1. Find the skill's SKILL.md path:
   ```bash
   python3 -c "
   import json,os
   d=json.load(open(os.path.expanduser('~/.claude/organizer/registry.json')))
   skill=[s for s in d['skills'] if s['name']=='SKILL_NAME']
   if skill: print(os.path.expanduser(skill[0]['path']+'/SKILL.md'))
   "
   ```

2. Read the SKILL.md file.

3. Determine where the patch goes based on the signal description + suggested_fix. Use your judgment:
   - Bug in a specific step → patch that step's section
   - Missing check → add before the relevant section
   - Preamble issue → patch the preamble bash block
   - General instruction → add to the most relevant existing section

4. Propose the patch: show the user what you plan to change (2–10 lines of before/after diff). Use AskUserQuestion:
   - Re-ground: which file, which section
   - Show the proposed change clearly
   - Options: A) Apply this patch  B) Try a different approach  C) Skip this signal

5. If A: apply with the Edit tool. Add a comment on the changed line(s):
   `# SKILL OS PATCH: <short description> — applied <YYYY-MM-DD>`
   This marks the change as a local patch (survives gstack upgrade detection).

6. Confirm: `✓ Patched <skill>/SKILL.md — <one-line summary of what changed>`

7. Record the signal as **applied** (in memory — will be written out in Step 3).

#### B) Skip

Acknowledge: `↷ Skipped — signal stays in queue for next session.`
Record signal as **skipped** (stays in signals.jsonl).

#### C) Won't Fix

Use AskUserQuestion to collect a one-line reason (free text).
Then confirm: `✗ Won't Fix — logged to wont-fix.jsonl.`
Record signal as **wont_fix** (will be moved to wont-fix.jsonl in Step 3).

#### D) Defer

Ask for an optional one-line investigation note.
Append to `open-questions.md`:
```bash
printf '\n## [OPEN] %s — deferred from /apply-improvements %s\n%s\n**Skill:** %s | **Signal:** %s\n' \
  "SLUG" "$(date +%Y-%m-%d)" "INVESTIGATION_NOTE" "SKILL" "SIGNAL_DESCRIPTION" \
  >> ~/.claude/organizer/improvements/open-questions.md
```
Where SLUG = first 6 words of description, lowercased, hyphenated, max 60 chars.
Confirm: `⊡ Deferred — added to open-questions.md as [OPEN] item.`
Record signal as **deferred** (stays in signals.jsonl, also in open-questions).

---

### 2d. After all signals for a skill

Offer a quality score update for the skill (only if at least one signal was Applied):

Use AskUserQuestion:
- Re-ground: "All signals for `<skill>` reviewed. Current quality score: <N>."
- Simplify: "Do you want to update the quality score in registry.json? Scores are 0–10 and used in the status dashboard."
- Options:
  - A) Keep current score (<N>)
  - B) Update to a new score (you'll enter the value)

If B: ask for the new score (free text), then update registry.json:
```bash
python3 - <<'EOF'
import json, os
path = os.path.expanduser("~/.claude/organizer/registry.json")
d = json.load(open(path))
for s in d["skills"]:
    if s["name"] == "SKILL_NAME":
        s["quality_score"] = NEW_SCORE
        break
with open(path, "w") as f:
    json.dump(d, f, indent=2)
print("Updated.")
EOF
```

---

## Step 3: Write Session Summary

After all skill groups are reviewed, do the following atomically:

### 3a. Update signals.jsonl

Rewrite `signals.jsonl` to contain ONLY the **skipped** and **deferred** signals
(applied and wont-fix signals are moved out):

```bash
python3 - <<'EOF'
import json, os
hq = os.path.expanduser("~/.claude/organizer/improvements")
# Read all current signals
with open(f"{hq}/signals.jsonl") as f:
    all_signals = [json.loads(l) for l in f if l.strip()]

# APPLIED_KEYS and WONTFIX_KEYS are sets of (ts, skill, signal) tuples
# filled in from the review session — substitute actual values below

# Signals to keep (skipped + deferred): write back to signals.jsonl
keep = [s for s in all_signals if (s["ts"], s["skill"], s["signal"]) not in PROCESSED_KEYS]
with open(f"{hq}/signals.jsonl", "w") as f:
    for s in keep:
        f.write(json.dumps(s) + "\n")

# Applied signals → signals-reviewed.jsonl (append)
for s in APPLIED_SIGNALS:
    s["reviewed_ts"] = __import__("datetime").datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    s["action"] = "applied"
    with open(f"{hq}/signals-reviewed.jsonl", "a") as f:
        f.write(json.dumps(s) + "\n")

# Won't Fix signals → wont-fix.jsonl (append)
for s in WONTFIX_SIGNALS:
    s["reviewed_ts"] = __import__("datetime").datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    s["action"] = "wont_fix"
    with open(f"{hq}/wont-fix.jsonl", "a") as f:
        f.write(json.dumps(s) + "\n")

print("Signals updated.")
EOF
```

**Substitute** `PROCESSED_KEYS`, `APPLIED_SIGNALS`, and `WONTFIX_SIGNALS` with the
actual collected values from the review session.

### 3b. Write pending-review.md (ephemeral — gitignored)

Write a session summary to `~/.claude/organizer/improvements/pending-review.md`.
This file is ephemeral: regenerated each session, never committed.

Format:
```markdown
# Skill OS Improvement Session — YYYY-MM-DD

## Summary
- N signals reviewed across K skills
- A applied, S skipped, W won't fix, D deferred

## Applied Patches

### <skill> (<tier> tier)

**Signal:** <signal text>
**Fix:** <one-line description of what was patched>
**File:** `<SKILL.md path>`

[repeat for each applied patch]

## Won't Fix

- **<skill>:** <signal text> — Reason: <reason>

## Deferred (→ open-questions.md)

- **<skill>:** <signal text>

## Quality Score Updates

- <skill>: <old> → <new>

---
*Generated by /apply-improvements — not committed (gitignored)*
```

### 3c. Log sync event

```bash
printf '{"ts":"%s","event":"apply_session","applied":%d,"skipped":%d,"wont_fix":%d,"deferred":%d}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" APPLIED SKIPPED WONTFIX DEFERRED \
  >> ~/.claude/organizer/federation/sync-log.jsonl
```

---

## Step 4: Final Status

Run:
```bash
~/.claude/organizer/bin/gstack-organizer status
```

Then print the session summary to the user:

```
╔══════════════════════════════════════════════════════════╗
║  /apply-improvements session complete                     ║
╠══════════════════════════════════════════════════════════╣
║  Applied:    A   |  Skipped:  S                          ║
║  Won't Fix:  W   |  Deferred: D                          ║
║  Skills patched: <list>                                   ║
╚══════════════════════════════════════════════════════════╝

Full session log: ~/.claude/organizer/improvements/pending-review.md
Open questions:   gstack-organizer questions
```

Tell the user: "Commit the patched SKILL.md files to `~/.claude` to lock in the changes:
`cd ~/.claude && git add skills/ && git commit -m 'skill-os: apply improvements YYYY-MM-DD'`"

---

## Completion Status Protocol

- **DONE** — All signals reviewed, signals.jsonl updated, pending-review.md written.
- **DONE_WITH_CONCERNS** — Completed but some patches may conflict with gstack upstream (auto-generated files). List each concern.
- **BLOCKED** — Cannot read signals.jsonl or registry.json. State what is missing.
- **NEEDS_CONTEXT** — A signal is too vague to act on even after reading the skill file. State the signal and what would make it actionable.

If a patch attempt fails 3 times (can't find the right insertion point, conflicting content), skip the signal and note it in DONE_WITH_CONCERNS.

---

## Notes on Auto-Generated Skills

gstack skills (`~/.claude/skills/gstack/*/SKILL.md`) are auto-generated from templates.
When patching these files:
1. The `<!-- AUTO-GENERATED -->` header is a warning, not a lock — local patches are valid.
2. Always add the `# SKILL OS PATCH:` comment on changed lines so patches can be identified after a gstack upgrade.
3. After a gstack upgrade, run `gstack-organizer validate` to detect if any patches were overwritten — look for missing `# SKILL OS PATCH:` comments.
