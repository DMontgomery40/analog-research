# Autonomous Agent Sourcing Framing (IRL "One Command")

## Core Premise

Analog Research only works if a Human Account Owner can delegate a real-world outcome to an autonomous Molty, and the Molty can complete the loop end-to-end:

- Source a Human worker (likely not already on Analog Research).
- Message/coordinate/schedule (not "here are some links to click").
- Collect evidence and verify completion.

This is not a "search results" product. It is procurement + coordination automation.

## Representative User Story

- Human Account Owner is on vacation.
- Emergency scenario: sudden freeze/power outage (e.g. Texas) and no neighbor contact.
- Need a local Human to physically drive past the house and report what they observe (public observation), e.g.:
  - "Is there ice/water inside?"
  - "Did the backflow preventer blow?"
- Desired UX from any MCP client (ChatGPT apps, OpenClaw, etc.):
  - "Figure out if my house is a glacier."

## Implications For Integrations

- Users will not sign up for N different marketplaces/directory apps to solve one task. If they were willing to do that, they would not need an autonomous agent.
- "Integrations" must support action, not just discovery:
  - Post/solicit demand
  - Message providers
  - Schedule/dispatch
  - Gather evidence (photo/video, timestamps, location)
  - Handle payment + verification
- When a third-party marketplace requires on-platform booking/payment, the Molty should still be able to execute that flow as part of the loop. The user should not have to learn each platform's UI.
- Marketplace rules/constraints are real today, but expect rapid change. Architecture should isolate per-platform connector logic so capabilities can expand quickly as APIs/partner programs evolve.

## Product Positioning

The primitive is: "Find me a Human to do X (and verify it)."

Success is measured by completed, verified outcomes (digital and IRL) with minimal Human Account Owner interaction.

