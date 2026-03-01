# Third-party integrations must ship a verified endpoint

Date: 2026-02-15

## Context
External integration failures (especially ProxyPics credential/config drift) were surfacing only at runtime when users attempted real actions.

## Decision
For any fully onboarded third-party integration, require an explicit provider verification endpoint:

- `POST/GET /api/v1/integrations/{provider}/verified`

This endpoint must execute a real provider API credential check (not a local-only mock check).

## Implementation notes
- ProxyPics verification is now wired through provider plugin `testConnection` logic and exposed via `/verified`.
- Legacy `/api/v1/integrations/{provider}/test` remains as a compatibility alias, but must call the same verification logic.

## Rule for future provider onboarding
When adding a new full integration, do not mark it complete unless all of the following are true:
- Provider plugin includes credential validation + runtime verification behavior.
- `/api/v1/integrations/{provider}/verified` is implemented and tested.
- Settings/UI uses verification response to surface clear status.
- Architecture docs and AGENTS rules are updated if contract changes.
