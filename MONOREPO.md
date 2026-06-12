# Monorepo Structure & Philosophy

## Overview

`~/Code/.git` is the monorepo root. It tracks:

- **Shared tools** — `~/Code/tools/` (reusable libraries and services)
- **Infrastructure** — TOOLS.md, registry, documentation
- **Unified .gitignore** — Applies to all projects

**Individual projects** (the-librarian, MarketMapMaker, etc.) remain as **separate git repos** with their own history. They are NOT merged into the monorepo.

## Why This Structure?

### Monorepo Benefits We Keep:
✅ **Atomic tool updates** — Improve youtube-transcripts, commit once, all projects can benefit  
✅ **Single source of truth** — TOOLS.md + registry.json for discovery  
✅ **Easy tool reuse** — Path aliases make importing tools seamless  
✅ **Centralized improvements** — Fix once, benefit everywhere  

### Keeping Projects Separate:
✅ **Independent CI/CD** — Each project can have its own build/deploy pipeline  
✅ **Cleaner git history** — Project commits don't pollute tool history  
✅ **Flexible deployment** — Projects release on their own schedule  
✅ **Access control** — Can keep some projects private if needed  

## How It Works

```
~/Code/.git (monorepo)
├── tools/
│   └── youtube-transcripts/
│       ├── .git (shared in monorepo)
│       ├── src/
│       └── package.json
│
├── the-librarian/ (project)
│   ├── .git (separate repo, its own history)
│   ├── src/
│   └── package.json
│
├── MarketMapMaker/ (project)
│   ├── .git (separate repo)
│   └── ...
│
└── TOOLS.md (unified registry in monorepo)
```

## Workflow

**Improving a tool:**
```bash
cd ~/Code/tools/youtube-transcripts
# Edit files
git add .
git commit -m "improve: handle edge case X"
# Commit goes to ~/Code/.git (monorepo)
```

**Using the tool in a project:**
```bash
cd ~/Code/the-librarian
# Import via path alias
import { fetchYoutubeTranscript } from '@tools/youtube-transcripts/src'
# That's it—automatically uses latest tool code
```

**Adding a new project:**
```bash
cd ~/Code
# Create new project or copy existing one
mkdir new-project
cd new-project
git init  # Create its own repo
```

**Updating the tool registry:**
```bash
# Edit ~/Code/TOOLS.md or ~/.claude/organizer/registry.json
git add TOOLS.md ~/.claude/organizer/registry.json
git commit -m "docs: add new tool to registry"
# Commit goes to monorepo
```

## Important Practices

### ✅ DO

- Commit tool improvements to `~/Code/.git` (the monorepo)
- Commit tool version bumps to `~/Code/.git`
- Update TOOLS.md in `~/Code/.git` when tools change
- Commit project changes to individual project repos (e.g., `~/Code/the-librarian/.git`)

### ❌ DON'T

- Commit project-specific code to `~/Code/.git` (keep in project's own repo)
- Let tool improvements sit in project repos—move them to `~/Code/tools/`
- Update TOOLS.md in individual projects (it lives in the monorepo)

## Git Commands

**See monorepo status:**
```bash
cd ~/Code
git status  # Shows tools/ changes, not project changes
```

**See a project's status:**
```bash
cd ~/Code/the-librarian
git status  # Shows only that project's changes
```

**See all activity:**
```bash
cd ~/Code
git log --all --oneline  # Shows monorepo history only

cd ~/Code/the-librarian
git log --oneline  # Shows project history only
```

## Future: Optional Git Subtree

If in the future you want to merge a project's entire history into the monorepo (e.g., making it a true monorepo project), you can use `git subtree add`:

```bash
cd ~/Code
git subtree add --prefix the-librarian ./the-librarian main
```

This would preserve the-librarian's full git history in the monorepo. But this is optional and not required—the current structure (separate repos + shared tools) works well.

---

**Summary:** The monorepo is for **shared infrastructure and tools**. Individual projects remain independent but benefit from the tools registry and unified discovery.

**Last updated:** 2026-06-12
