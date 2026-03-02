# Public Showcase Hotfix Runbook

Use this runbook to enforce press-safe public visibility with exactly 3 curated humans and 3 curated bounties.

## Preconditions
- Service-role credentials are available in local `.env` or process env:
  - `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_PROJECT_URL`)
  - `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`)
- Deploy target is the live web app (`@analogresearch/web`).

## 1) Dry Run (no mutation)
```bash
node scripts/public-showcase/refresh-showcase-data.mjs --dry-run
```

Expected:
- JSON output with `mode: "dry-run"`
- Preview of purge matches and planned showcase create/update actions

## 2) Apply Curated Refresh
```bash
node scripts/public-showcase/refresh-showcase-data.mjs --apply
```

Expected:
- JSON output with:
  - `human_ids` (exactly 3 UUIDs)
  - `bounty_ids` (exactly 3 UUIDs)

## 3) Set Runtime Env IDs
Copy IDs from the apply output into `apps/web/.env.local` (or deployment env):

```bash
PUBLIC_SHOWCASE_MODE=curated
PUBLIC_SHOWCASE_HUMAN_IDS=<uuid-1>,<uuid-2>,<uuid-3>
PUBLIC_SHOWCASE_BOUNTY_IDS=<uuid-1>,<uuid-2>,<uuid-3>
```

## 4) Redeploy
Deploy the web app with the curated env values.

## 5) Verify Exact 3/3 Public Visibility
Run these checks against the deployed site:

```bash
curl -sS 'https://analog-research.org/api/v1/humans?limit=100' | jq '.pagination.total, (.data | length)'
curl -sS 'https://analog-research.org/api/v1/bounties?limit=100' | jq '.pagination.total, (.data | length)'
```

Expected:
- Humans total = `3`, data length = `3`
- Bounties total = `3`, data length = `3`

Verify non-curated detail IDs fail closed:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' 'https://analog-research.org/api/v1/humans/<non-curated-human-id>'
curl -sS -o /dev/null -w '%{http_code}\n' 'https://analog-research.org/api/v1/bounties/<non-curated-bounty-id>'
```

Expected:
- Both return `404`

Verify public pages only surface curated content:

```bash
curl -sS 'https://analog-research.org/browse' | rg -n 'Dr\. Elena Marquez|Prof\. Amina Okafor|Jordan Lee, MSc'
curl -sS 'https://analog-research.org/bounties' | rg -n 'Microplastics Transect Validation Across Urban Rivers|Nocturnal Pollinator Activity Survey|Community Air-Quality Sensor Co-Location and Drift Audit'
```

Expected:
- Only curated entries are discoverable from list pages

Verify sitemap is curated:

```bash
curl -sS 'https://analog-research.org/sitemap.xml' | rg -n '/humans/'
```

Expected:
- Exactly 3 public human profile URLs

## 6) Rollback
If any issue appears during press/demo windows:

1. Disable curated gating immediately:
```bash
PUBLIC_SHOWCASE_MODE=open
PUBLIC_SHOWCASE_HUMAN_IDS=
PUBLIC_SHOWCASE_BOUNTY_IDS=
```

2. Redeploy `@analogresearch/web`.

3. Confirm public feeds return to default mode:
```bash
curl -sS 'https://analog-research.org/api/v1/humans?limit=20' | jq '.pagination.total'
curl -sS 'https://analog-research.org/api/v1/bounties?limit=20' | jq '.pagination.total'
```

4. Re-enable curated mode only after validating fresh `human_ids` and `bounty_ids` from:
```bash
node scripts/public-showcase/refresh-showcase-data.mjs --dry-run
node scripts/public-showcase/refresh-showcase-data.mjs --apply
```
