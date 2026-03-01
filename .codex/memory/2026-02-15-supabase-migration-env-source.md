# Supabase migration credentials source (.env)

Date: 2026-02-15

## Context
Agent runs repeatedly asked for `SUPABASE_ACCESS_TOKEN` / DB credentials even though they already existed locally.

## Decision
Treat repo `.env` (and exported process env) as a first-class source of truth for migration/schema-repair credentials.

## Required credentials for migration execution
- CLI path: `SUPABASE_ACCESS_TOKEN`
- Direct DB path: `SUPABASE_DB_URL` + `SUPABASE_DB_PASSWORD`

## Operational note
Document this rule in `AGENTS.md`, `CLAUDE.md`, and test config comments so future runs do not request the same values again when already present.
