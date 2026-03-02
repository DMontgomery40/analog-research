# Auth Infinite Loop, PKCE, and Netlify Subdomain Architecture

## Overview

This note documents the auth flow fixes, root causes, and operational constraints discovered during production debugging (Feb 2026). It complements [2026-02-09-auth-callback-pkce.md](2026-02-09-auth-callback-pkce.md).

---

## 1. Infinite Token Refresh Loop

### Symptom

- Visiting any page (including without login) triggered endless `token?grant_type=refresh_token` requests
- Eventually led to 429 (rate limit) from Supabase Auth

### Root Cause

Components like `PublicNav` were creating a browser Supabase client (via `createClient()` from `@/lib/supabase/client`). That client has `autoRefreshToken: true` by default. When **stale/invalid** auth cookies exist:

1. Client tries to refresh on mount
2. Refresh fails (e.g. expired refresh token)
3. Client retries
4. Creates a loop that exhausts Supabase rate limits

### Fix (Implemented)

**PublicNav** now uses `/api/auth/me` instead of instantiating a browser Supabase client:

- `apps/web/src/components/public-nav.tsx` → `fetch('/api/auth/me')`
- `apps/web/src/app/api/auth/me/route.ts` → server-side `createClient()` from `@/lib/supabase/server`, single `getUser()` call

This avoids `autoRefreshToken` entirely on public pages. The server endpoint runs once per page load, not in a retry loop.

### Rule for Future Work

**Do not create a browser Supabase client on public/marketing pages just to check "is user logged in?"** Use `/api/auth/me` or similar server-side check instead.

---

## 2. PKCE Code Verifier Not Found

### Symptom

- Google OAuth sign-in failed with: `PKCE code verifier not found in storage`

### Context

Supabase OAuth PKCE stores a short-lived "code verifier" in **cookies** when the user initiates sign-in. The exchange (trading `code` for tokens) must read that verifier from the **same storage** it was written to.

### Cookie Domain Mismatch (Plausible Root Cause)

When the server-side exchange fails to find the verifier, the likely cause is **hostname mismatch**:

| Location | Source | Example |
|----------|--------|---------|
| Client (`client.ts`) | `window.location.hostname` | `analog-research.org` or `www.analog-research.org` |
| Server (`server.ts`) | `x-forwarded-host` ?? `host` | May differ (e.g. load balancer rewriting) |

If `window.location.hostname ≠ x-forwarded-host`, cookies are set with different domains or names. The verifier cookie written by the client may not be visible to the server.

### Why Client-Side Exchange Fixes It

Do the exchange **in the browser** where the verifier is available in the same cookie context that wrote it:

1. Use `createClient()` from `@/lib/supabase/client` (same client as login page)
2. Call `supabase.auth.exchangeCodeForSession(code)` client-side (disable auto URL detection)
3. Redirect to `/auth/callback/complete?redirect=...` for profile creation (server route)
4. Server validates session and redirects to dashboard

**Rule:** Use the same `createClient()` from `@/lib/supabase/client` (or a server client that reads the same cookies) for PKCE exchange. Never mix localStorage-based clients with cookie-based storage for the same flow.

---

## 3. Email/Password Post-Sign-In Server Error

### Symptom

- After email/password sign-in, navigating to dashboard triggered a server exception

### Likely Cause

Sign-in writes cookies. If the app uses `router.push(redirect)` for client-side navigation, the **next request** might not include the newly-set cookies in the same way as a full page load. A full navigation (`window.location.replace`) forces a new request with all cookies.

### Fix (Implemented)

Use `window.location.replace(redirect)` instead of `router.push(redirect)` after sign-in so cookies are sent on the next request.

---

## 4. Netlify Subdomain Architecture

### Configuration

| Subdomain | Purpose | Implementation |
|-----------|---------|----------------|
| `analog-research.org` | Main web app (auth, dashboard, browse) | Next.js pages |
| `api.analog-research.org` | API-only | JSON endpoints, `/v1/*` rewrite |
| `supabase.analog-research.org` | Supabase proxy | Rewrite to Supabase (auth, storage, realtime) |

All routing is handled in `apps/web/src/proxy.ts`. **Netlify redirects with Host conditions do not work with the Next.js runtime** (see `netlify.toml`). The proxy runs at the edge before any Netlify redirects; the `Host` header is preserved.

### Auth Flow and Subdomains

Human auth (login, signup, dashboard) runs on the **main domain** (`analog-research.org` / `www.analog-research.org`). Supabase auth endpoints are reached via `supabase.analog-research.org` when configured, but the auth **flow** (callback, redirect, cookies) happens on the main domain.

The subdomain setup is **not** the primary cause of the auth bugs we fixed. The issues were:

1. Infinite loop from browser Supabase client on public pages
2. PKCE verifier storage consistency (cookies vs localStorage)
3. Post-sign-in navigation (cookies not sent on client-side nav)

---

## 5. Cookie Domain

`getSupabaseAuthCookieDomain()` in `@/lib/supabase/cookie-domain.ts` sets `domain: '.analog-research.org'` so sessions persist across `www.analog-research.org` and `analog-research.org`. Without this, moving between apex and www would make users appear logged out.

---

## 6. Phase Summary (Updated)

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | Done | Server-side exchange (temporary) used during debugging |
| 2 | Done | PublicNav uses `/api/auth/me` instead of Supabase client |
| 3 | Done | Client-side PKCE exchange + `/auth/callback/complete` + `window.location.replace` for email/password |

---

## 7. Phase 3 Implementation (As Shipped)

### Problem A: PKCE Verifier Not Found

- **Root cause:** Cookie domain/hostname mismatch between client (`window.location.hostname`) and server (`x-forwarded-host`)
- **Fix:** Client-side exchange using `createClient()` from `@/lib/supabase/client`, then redirect to `/auth/callback/complete` for profile creation

### Problem B: Email/Password Server Error

- **Root cause:** `router.push(redirect)` does client-side navigation; newly-set cookies may not be sent until full page reload
- **Fix:** Use `window.location.replace(redirect)` instead of `router.push(redirect)` after sign-in

### Files to Change

| File | Change |
|------|--------|
| `apps/web/src/app/auth/callback/page.tsx` | Client-side exchange with existing `createClient()` |
| `apps/web/src/app/auth/callback/complete/route.ts` | CREATE — Profile completion, validate session, redirect |
| `apps/web/src/app/auth/callback/exchange/route.ts` | DELETE — No longer needed |
| `apps/web/src/app/(auth)/login/page.tsx` | Use `window.location.replace(redirect)` instead of `router.push(redirect)` |

### Verification

1. `pnpm --filter @analogresearch/web build` — Build succeeds
2. `pnpm verify` — All quality gates pass
3. Manual: Google OAuth → `/auth/callback` → `/auth/callback/complete` → dashboard (no PKCE error)
4. Manual: Email/password sign-in → dashboard (no server error)

### Risk

Medium — Changes auth flow. Client-side exchange uses same `createClient()` as login (verifier found). Page redirects quickly; `autoRefreshToken` loops avoided. Profile creation in separate server route.

---

## Related Files

- Auth: `apps/web/src/app/auth/callback/page.tsx`, `apps/web/src/app/auth/callback/complete/route.ts`, `apps/web/src/app/(auth)/login/page.tsx`
- Supabase: `apps/web/src/lib/supabase/client.ts`, `apps/web/src/lib/supabase/server.ts`, `apps/web/src/lib/supabase/cookie-domain.ts`, `apps/web/src/lib/supabase/session-gate.ts`
- PublicNav: `apps/web/src/components/public-nav.tsx`
- API: `apps/web/src/app/api/auth/me/route.ts`
- Proxy: `apps/web/src/proxy.ts`
- Netlify: `netlify.toml`
