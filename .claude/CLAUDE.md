# Extends: ~/.claude/CLAUDE.md
# Reports-to: /Users/teddycha/.claude/organizer/

# Tools Registry

Before building any feature, check the tools registry first:
- **Quick search:** `~/Code/TOOLS.md` — searchable list with examples
- **Full registry:** `~/.claude/organizer/registry.json` — complete metadata

**Available tools:**
- **youtube-transcripts** — Extract YouTube transcripts with quality scoring + async polling
- **company-researcher** — REST API for company research, classification, market position

When you need to build something, search the registry first. Don't rebuild what already exists.

# gstack

Use the /browse skill from gstack for all web browsing. Never use mcp__claude-in-chrome__* tools.

Available skills: /plan-ceo-review, /plan-eng-review, /review, /ship, /browse, /retro
