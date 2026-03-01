# Schema Parity and PostgREST Cache Recovery

## Purpose

Recover safely when API routes return schema-cache or missing-table errors after code deploys.

This runbook covers:

- external integrations surface (`external_integrations`, `external_jobs`, `external_job_events`)
- autopilot activity tables (`agent_autopilot_*`)
- Stripe Connect sample mapping table (`stripe_connect_sample_accounts`)

## Typical Symptoms

- Dashboard Settings shows:
  - `Could not find the table 'public.external_integrations' in the schema cache`
  - `Could not find the table 'public.agent_autopilot_audit_log' in the schema cache`
- Connect sample storefront returns:
  - `Stripe Connect sample table is missing. Apply migration 047_stripe_connect_sample_accounts.sql, then retry the request.`
- Field Checks pages fail with missing table errors.
- API endpoints return `SCHEMA_PARITY_UNAVAILABLE` with remediation metadata.

## Detection

### 1. API-level detection

Call affected endpoints and inspect JSON responses:

- `GET /api/v1/integrations`
- `GET /api/v1/integrations/providers`
- `GET /api/v1/external-jobs?kind=field_check`
- `GET /api/v1/autopilot/actions`
- `GET /api/v1/connect-sample/storefront`

If schema parity guard is active, you will get:

- `status: 503`
- `code: SCHEMA_PARITY_UNAVAILABLE`
- `missing_tables: [...]`

### 2. Database-level detection

Run SQL against target DB:

```sql
select to_regclass('public.external_integrations') as external_integrations,
       to_regclass('public.external_jobs') as external_jobs,
       to_regclass('public.external_job_events') as external_job_events,
       to_regclass('public.agent_autopilot_audit_log') as agent_autopilot_audit_log,
       to_regclass('public.agent_autopilot_configs') as agent_autopilot_configs,
       to_regclass('public.agent_autopilot_state') as agent_autopilot_state,
       to_regclass('public.stripe_connect_sample_accounts') as stripe_connect_sample_accounts;
```

Any `null` value indicates migration parity gap.

## Recovery Procedure

### Step 1: Apply missing migrations

From repo root, target the correct Supabase instance and run:

```bash
pnpm db:push
```

If using explicit DB URL:

```bash
pnpm --filter @analoglabor/database push -- --db-url "postgresql://..."
```

### Step 2: Refresh PostgREST schema cache

If tables exist but API still reports schema cache misses, execute:

```sql
NOTIFY pgrst, 'reload schema';
```

### Step 3: Re-test guarded endpoints

Retry:

- `GET /api/v1/integrations/providers`
- `GET /api/v1/external-jobs?kind=field_check`
- `GET /api/v1/autopilot/actions`
- `GET /api/v1/connect-sample/storefront`

Expected: `200` responses and no `SCHEMA_PARITY_UNAVAILABLE` code.

### Step 4: Confirm UI recovery

- `/dashboard/settings`: External Integrations and Autopilot Activity panels load.
- `/dashboard/field-checks`: list/create flow works.
- linked field checks on bounty/booking detail pages render.

## Root Cause Categories

1. Migration not applied to target environment.
2. Migration applied but API schema cache stale.
3. Drift from ad-hoc schema changes outside migration history.
4. Duplicate/ambiguous migration numbering introducing inconsistent rollout.

## Guardrails in This Repo

- Runtime schema parity checks return actionable 503s for affected surfaces.
- Quality gate step `pnpm check:migration-prefix` blocks new duplicate migration prefixes.
- Legacy collisions (`024`, `025`) are allowlisted temporarily and explicitly logged.

## Escalation

Escalate to platform owner if:

- `pnpm db:push` succeeds but tables remain missing.
- `NOTIFY pgrst, 'reload schema'` does not clear schema-cache errors.
- Production shows conflicting migration histories across regions/environments.
