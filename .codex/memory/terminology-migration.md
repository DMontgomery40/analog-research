# Repo-local memory and terminology migration

## Why this exists

We are migrating away from global/home-scoped Codex memory (`~/.codex/**`) because it caused cross-repo confusion (especially around the overloaded word “agent”).

For this repo, memory is **repo-local** and should live in:
- `.codex/MEMORY.md` (index)
- `.codex/memory/` (notes)

## What to do going forward

When you solve a non-obvious bug, make an architecture decision, or discover a workflow gotcha:
1. Write a note in `.codex/memory/` (descriptive filename).
2. Add a link entry to `.codex/MEMORY.md`.

## Do not update

Do not add new entries for this repo to:
- `~/.codex/MEMORY.md`
- `~/.codex/projects/**`

Those may contain legacy notes from older workflows, but they are not canonical for this repository.

