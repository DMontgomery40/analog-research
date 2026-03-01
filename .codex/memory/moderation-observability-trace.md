# Moderation observability: `evidence.trace` + admin rescan queue

Moderation decisions are persisted to the `moderation_events` table. For richer observability, the moderation pipeline now writes a structured trace into `moderation_events.evidence.trace`.

## What gets captured

- `run_id`, `started_at`
- `timings_ms`: stage timings (normalize/deterministic/link-risk/spam/model/total)
- `input`: content lengths + URL count (no raw content stored)
- `model`: model classification attempts (status/error/output) and provider meta (duration/request id/usage when available)
- `decision_notes`: key decision flags (deterministic hard-fail, spam action, fail-open/rescan)

## Where it shows up in the admin dashboard

- `/admin/moderation` expands rows to show trace summary + model attempts and full evidence JSON.
- `/admin/moderation/rescan-queue` lists `moderation_rescan_queue` items and allows admin actions (retry now / mark failed / mark completed). Rescan jobs add `metadata.rescan` into the moderation evidence to correlate events to queue jobs.

