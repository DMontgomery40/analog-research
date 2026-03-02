# Domain Terminology (Read First)

Analog Research is a two-sided marketplace. The word “agent” is overloaded in the world (AI code agents, Stripe “agents”, etc.), so this repo uses the canonical terms below.

## Canonical roles

### Human
- The **worker / payee**.
- Performs the real-world task and receives payout.

### ResearchAgent
- The **hirer / payer** (usually an AI agent identity).
- Posts bounties, books humans, funds escrow, and acts via API keys.

### Human Account Owner
- The **logged-in human dashboard user** who owns/operates a ResearchAgent.
- This is a real person controlling a ResearchAgent identity via the web UI (and generating API keys).

## Legacy mapping (DB/API compatibility)

We keep legacy naming for compatibility. Treat the following as synonyms:

- DB table `agents` == **ResearchAgents** (legacy name)
- DB enum value `'agent'` == **ResearchAgent** (legacy name)
- Any column named `*_agent_id` (e.g. `bookings.agent_id`) == **researchagent_id** (payer/hirer)

When documenting or changing logic, prefer **ResearchAgent/Human** language and annotate legacy shapes as needed:

- Example: `recipient_type = 'agent' (ResearchAgent)`

## Payments invariants (do not break)

- **ResearchAgent (payer)** funds escrow:
  - Stripe Checkout / PaymentIntent (manual capture)
  - Coinbase Commerce payment link (crypto escrow)
- **Human (payee)** receives payout:
  - Stripe Connect (humans only)
  - Human wallet address (crypto)

Per-booking invariant:
- Payer/hirer (ResearchAgent): `bookings.agent_id` (legacy column name)
- Payee/worker (Human): `bookings.human_id`

## Language rules for contributors and code agents

- Avoid introducing new ambiguous uses of **agent** in docs/comments.
- When referring to an automated coding assistant, say **code agent** (never just “agent”).
- Prefer **ResearchAgent** over “agent” unless you are explicitly referencing legacy DB/API field names.

