# BUILD_CONTEXT — Powerpath

Short source of truth for the demo. If something here conflicts with a slide deck in `docs/reference/`, this file wins for the demo; raise the conflict with a human.

## What the product is

Powerpath is a **country-specific AI energy strategy platform for Southeast Asia's large electricity users**. It helps a large power buyer understand their energy position, compare strategy options, and produce a human-approved strategy memo — grounded in real public sources, calculated deterministically, explained by AI, and approved by a person.

## Who buys it (the buyer)

Large electricity users in Southeast Asia — starting with **industrial / manufacturing plants in Malaysia** (Johor first). The buyer feels these pains:

- Energy is a top-3 cost line and rising, but poorly understood at the strategy level.
- Regulatory and tariff change (CRESS, solar programs, carbon) is hard to track and easy to get wrong.
- Renewable and cost-reduction targets exist (e.g. 40% renewable by 2030) with no credible, defensible plan.
- Consultants are slow and expensive; internal teams lack a fast, evidence-backed way to compare options.

## Core outputs

1. **Energy strategy dashboard** — the current position at a glance.
2. **Scenario comparison engine** — deterministic side-by-side of strategy options.
3. **Human-approved Power Strategy Memo** — the defensible, exportable deliverable.

## Hero demo

A **Johor electronics manufacturing plant**. Baseline (demo-grade until a real bill/CSV is uploaded):

| Metric | Value |
|---|---|
| Annual cost | RM 8.4M |
| Annual use | 18.6 GWh |
| Monthly bill | RM 700k |
| Peak demand | 4.8 MW |
| Avg unit cost | RM 0.452 / kWh |
| Renewable target | 40% by 2030 |
| Carbon baseline | ~13,760 tCO₂e / year |

Full data: `data/demo/johor_electronics_demo.json`.

## Demo narrative (the story we tell)

**Market intelligence → baseline → scenarios → refinement → memo.**

1. Show live market & regulatory intelligence for Malaysia.
2. Establish the plant's energy baseline from its bill.
3. Compare the actual situation against scenario options.
4. Refine with a human in the loop.
5. Produce a pre-feasibility recommendation and a Power Strategy Memo, with an evidence drawer behind every number.

## The closed loop we are proving

Real source sync → update detected → human approval → assumption version updated → scenario rerun → memo refreshed → evidence drawer records source and reviewer status.

This loop is the differentiator: the product **stays current with real sources without ever silently changing a recommendation.**

## Trust rules (summary — full version in TRUST_RULES.md)

- Deterministic code calculates. Sources provide evidence. The LLM explains. A human approves.
- No silent recommendation updates. No fake official tariff claims. No official grid-approval claim.
- Everything is **pre-feasibility only**.

## What we are NOT doing yet

- Not connecting GitHub MCP, Supabase, or live APIs during brain setup.
- Not building product UI until told.
- Not claiming any official/regulatory approval or guaranteed tariff.
