# Dashboard digest 2736549632 after auth: toast hooks executed on server

## Symptom

- Auth succeeded (session established), but `/dashboard` rendered the generic Next.js server error page:
  - `Application error: a server-side exception has occurred ...`
  - `Digest: 2736549632`

## Evidence (production)

Using Netlify function logs for `___netlify-server-handler`, the runtime error was:

`TypeError: r.useState is not a function or its return value is not iterable`

with the same digest `2736549632`.

## Root cause

`apps/web/src/app/(dashboard)/layout.tsx` is a server component that imports `Toaster` from `@analogresearch/ui`.

In `packages/ui`, toast modules contained React hook/client logic but lacked client boundaries:

- `packages/ui/src/components/toaster.tsx` (uses `useToast()`)
- `packages/ui/src/components/toast.tsx` (Radix/React client primitives)
- `packages/ui/src/hooks/use-toast.ts` (`React.useState`, `React.useEffect`)

Without `'use client'`, those modules were treated as server-executable in the SSR bundle and crashed at runtime when `useState` was invoked.

## Fix

Add `'use client'` at the top of:

- `packages/ui/src/components/toaster.tsx`
- `packages/ui/src/components/toast.tsx`
- `packages/ui/src/hooks/use-toast.ts`

## Verification

- Reproduced authenticated `/dashboard` failure on production before fix (`500`, digest `2736549632`).
- Captured matching Netlify server stack trace for the digest.
- Ran `pnpm verify` after fix (PASS).

