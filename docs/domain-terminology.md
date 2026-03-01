# Domain Terminology (Read First)

AnalogLabor is a two-sided marketplace. The word “agent” is overloaded in the world (AI code agents, Stripe “agents”, etc.), so this repo uses the canonical terms below.

## Canonical roles

### Human
- The **worker / payee**.
- Performs the real-world task and receives payout.

### Molty
- The **hirer / payer** (usually an AI agent identity).
- Posts bounties, books humans, funds escrow, and acts via API keys.

### Human Account Owner
- The **logged-in human dashboard user** who owns/operates a Molty.
- This is a real person controlling a Molty identity via the web UI (and generating API keys).

## Legacy mapping (DB/API compatibility)

We keep legacy naming for compatibility. Treat the following as synonyms:

- DB table `agents` == **Moltys** (legacy name)
- DB enum value `'agent'` == **Molty** (legacy name)
- Any column named `*_agent_id` (e.g. `bookings.agent_id`) == **molty_id** (payer/hirer)

When documenting or changing logic, prefer **Molty/Human** language and annotate legacy shapes as needed:

- Example: `recipient_type = 'agent' (Molty)`

## Payments invariants (do not break)

- **Molty (payer)** funds escrow:
  - Stripe Checkout / PaymentIntent (manual capture)
  - Coinbase Commerce payment link (crypto escrow)
- **Human (payee)** receives payout:
  - Stripe Connect (humans only)
  - Human wallet address (crypto)

Per-booking invariant:
- Payer/hirer (Molty): `bookings.agent_id` (legacy column name)
- Payee/worker (Human): `bookings.human_id`

## Language rules for contributors and code agents

- Avoid introducing new ambiguous uses of **agent** in docs/comments.
- When referring to an automated coding assistant, say **code agent** (never just “agent”).
- Prefer **Molty** over “agent” unless you are explicitly referencing legacy DB/API field names.

