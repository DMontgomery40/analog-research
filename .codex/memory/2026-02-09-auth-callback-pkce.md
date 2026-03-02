# Auth Callback PKCE (Client Page) + Supabase Rate Limits

> **See also:** [2026-02-11-auth-infinite-loop-pkce-and-netlify.md](2026-02-11-auth-infinite-loop-pkce-and-netlify.md) for the full auth flow fixes, infinite loop cause, and Netlify subdomain architecture.

## Symptom

- Google OAuth sign-in failed with: `PKCE code verifier not found in storage`.
- Email/password sign-in intermittently returned: `Request rate limit reached`.

## Context (Why This Repo Is Weird)

Analog Research runs on Netlify with a host-based proxy layer (`apps/web/src/proxy.ts`) to support:

- `supabase.*` proxying to Supabase (auth/storage/realtime)
- `api.*` serving only `/api/v1/*` (plus doc assets)
- apex/`www` serving the full Next.js app

This architecture is not the typical "one host, one Next app" deployment and it changes how cookies and redirects behave at runtime.

## Root Cause (Operational)

1. Supabase OAuth PKCE relies on a short-lived "code verifier" stored in cookie-based storage.
   - In our Netlify + proxy setup, the server callback exchange (`/auth/callback` Route Handler) repeatedly failed to see the verifier cookie at callback time for real users.
   - Additionally, `@supabase/ssr` configures the browser client with `detectSessionInUrl: true` and will auto-exchange `?code=...` on client init. If the callback page *also* calls `exchangeCodeForSession(code)` explicitly, the first exchange clears the verifier and the second fails with "PKCE code verifier not found".
2. Supabase Auth endpoints are rate limited.
   - Naively calling `supabase.auth.getUser()` on every request (including unauthenticated/bot traffic) can exhaust rate limits and break sign-in/sign-up.
   - Redirect loops caused by stale cookies can amplify this (e.g. `/login` -> `/dashboard` -> `/login` ...).

## Current Implementation (as of Feb 2026)

- **Callback page** (`/auth/callback/page.tsx`): Client page that parses `code` / `token_hash` from URL, handles hash-fragment errors, and performs the exchange in the browser using cookie storage (no auto URL detection).
- **Completion route** (`/auth/callback/complete/route.ts`): Server Route Handler that validates the session cookies, ensures the user has a `humans` profile row, and redirects to the intended destination.
- **Session gating**: `apps/web/src/lib/supabase/session-gate.ts` (used by proxy) — only validates with Supabase when a session-like cookie exists; avoids hitting Supabase on every request.
- **PublicNav**: Uses `/api/auth/me` instead of creating a browser Supabase client to avoid infinite token refresh loops.

## Safety Notes

- Redirect targets are sanitized to prevent open redirects.
- The callback uses `location.replace()` to avoid leaving OAuth `code` / OTP params in history.
- We never log the OAuth `code` or OTP `token_hash`.
- Human profile creation is safe client-side because RLS only allows users to insert/select their own `humans` row.
