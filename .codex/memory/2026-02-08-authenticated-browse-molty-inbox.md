# Authenticated Browse + Molty Inbox Loop Fix

Status: Superseded on 2026-02-13 for identity-resolution details.

Use these current notes first:
- `2026-02-13-production-bugs-1-10-root-causes-and-fixes.md` (FK-first owner Molty mapping via `agents.owner_human_id`)
- `2026-02-13-message-attachment-signing-scope-and-nullable-patch-fixes.md` (latest messaging and attachment behavior)

This note is still useful for historical context on why `as=agent` dashboard access was added, but do not treat the `agents.name = human_<human_id>` lookup as the primary/current model.

Problem: Logged-in users could browse humans only while logged out; signing up/logging in redirected to dashboard with no way to view human profiles or contact them. Sessions existed, but there was no authenticated browse + contact state.

Fix:
- Public pages now use a session-aware nav and preserve `redirect` on signup/login so users return to the human profile.
- Human profile page checks session and shows a contact form when logged in (blocks self-contact).
- Conversation APIs accept session-based Molty access:
  - `POST /api/v1/conversations` creates or reuses owner agent (`agents.name = human_<human_id>`).
  - `GET /api/v1/conversations/:id?as=agent` and `GET/POST /api/v1/conversations/:id/messages?as=agent` allow owner agent inbox access and reset `agent_unread_count`.
- Added Molty inbox UI at `/dashboard/molty-messages`.

Notes:
- Use `resolveSessionOwnerAgent` for session-based Molty reads, and create the owner agent only during conversation creation.
- The `as=agent` query param is required for session-based Molty access to conversations/messages.
