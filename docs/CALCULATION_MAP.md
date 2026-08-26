# CALCULATION_MAP — where every number comes from

A beginner-friendly map of how a number travels through Powerpath: from the form
field you type into, through the deterministic engine, onto the screen, and into the
database. Updated 2026-07-05 — reflects the `src/lib/energy/` engine package, the
`/api/analyze` Study Analysis Agent, and source verification.

**The one-sentence answer:** all real calculations live in the
[`src/lib/energy/`](../src/lib/energy/) package (11 small files, ~800 lines, pure
functions), orchestrated by `analyzeStudy.ts`; the UI only formats and displays what
the engine produces, and the same engine runs on the server (normal path) and in the
browser (offline fallback). No LLM computes anything.

---

## The journey of a number

```
 you type into the wizard             (StudySetup.tsx — UI only)
   → form draft collected              (context.tsx — StudyDraft state)
     → StudyProject saved              (study.ts: createStudy → /api/projects/create
                                        → Supabase projects + sites + energy_bills)
       → POST /api/analyze             (the Study Analysis Agent)
         → validated & normalized      (energy/normalizeStudy.ts)
         → country module loaded       (energy/loadCountryModule.ts — Malaysia full,
                                        others limited + warning)
         → baseline derived            (energy/calculateBaseline.ts)
         → 5 scenarios calculated      (energy/calculate*.ts — each with a trace)
         → ranked by your objective    (energy/rankScenarios.ts)
         → saved to Supabase           (scenario_results, labeled pre_feasibility)
       → shown on screens              (screens/*.tsx — display only)
         → memo assembled              (study.ts: buildMemoSections — template text)
           → saved to Supabase         (/api/memos/save → memo_versions, linked to
                                        the exact scenario_results rows used)
```

## 1. Which file receives user input

**[`src/components/demo/screens/StudySetup.tsx`](../src/components/demo/screens/StudySetup.tsx)** —
the setup wizard (Project setup → Energy baseline → Strategic goals → Review). It
collects strings into a `StudyDraft` held in
**[`context.tsx`](../src/components/demo/context.tsx)**, whose `submitStudy` converts
them to numbers and calls `createStudy()`.

The **StudyProject model** lives in **[`src/lib/types.ts`](../src/lib/types.ts)** —
deliberately shaped like the database tables (`projects` + `sites` + `energy_bills`).

## 2. Which file normalizes the input

**[`src/lib/energy/normalizeStudy.ts`](../src/lib/energy/normalizeStudy.ts)**:
- `validateStudy()` (line 11) — required-field checks with human-readable problems.
- `normalizeStudy()` (line 31) — fills blanks deterministically and flags them:

| You left blank | It derives | Flag shown in UI |
|---|---|---|
| annual use | monthly consumption × 12 | — |
| annual cost | monthly bill × 12 | — |
| average unit cost | annual cost ÷ annual use | "(derived)" |
| carbon baseline | (annual kWh ÷ 1000) × grid factor | "derived from grid factor" |

(`study.ts` re-exports this as `toStudyInput` for older call sites.)

## 3. Which file calculates the baseline

**[`energy/calculateBaseline.ts`](../src/lib/energy/calculateBaseline.ts)** (line 19)
derives the shared quantities every scenario compares against (grid-only annual cost,
carbon baseline, tariff provenance), and
**[`energy/calculateGridOnly.ts`](../src/lib/energy/calculateGridOnly.ts)** turns them
into the "Grid only" scenario result with its own trace.

## 4. Which file calculates scenarios

One file per scenario in [`src/lib/energy/`](../src/lib/energy/):
`calculateGridOnly.ts`, `calculateSolarAtap.ts`, `calculateCress.ts`,
`calculateBess.ts`, `calculateHybrid.ts` — orchestrated by
**[`analyzeStudy.ts`](../src/lib/energy/analyzeStudy.ts)** (line 57). The hybrid
imports `deriveSolar()` and `deriveCress()` from the Solar/CRESS files, so it can never
disagree with its parts. For non-Malaysia studies, CRESS-based scenarios are returned
as **unavailable** (Malaysia example only — never silently computed as if local rules
applied).

## 5. Which formulas are currently used (demo-grade, all traced)

| Formula | File | What it does |
|---|---|---|
| `baseCost = annual_kWh × tariff` | calculateBaseline | grid-only annual cost |
| `carbon = (grid_kWh ÷ 1000) × emission factor` | calculateBaseline | tonnes CO₂e |
| `solar_kWp = peak_kW × 0.625` | calculateSolarAtap | rooftop sizing heuristic (flagged "confirm with roof survey") |
| `solar_gen = kWp × yield` | calculateSolarAtap | yearly solar energy |
| `LCOE = capex ÷ (lifetime × gen) × 1.15` | calculateSolarAtap | levelised solar cost incl. O&M uplift |
| `CRESS rate = PPA + SAC` | calculateCress | effective CRESS cost per kWh |
| `BESS saving = bill × saving% × size factor` | calculateBess | peak-shaving saving |
| `payback = capex ÷ annual saving` | each scenario | simple payback years |
| solar first, CRESS tops up to the RE target | calculateHybrid | Solar + CRESS mix |

Inputs come from **your study** or from **versioned assumptions** (e.g.
`ASM-CRESS-SAC@0.1`), each citing a registry source. Since the source-verification
step, only **verified_official** sources can drive updates to those assumptions;
internal-demo sources are labeled and can never receive live updates
([`src/lib/sourcePolicy.ts`](../src/lib/sourcePolicy.ts)).

## 6. Which file ranks recommendations

**[`energy/rankScenarios.ts`](../src/lib/energy/rankScenarios.ts)** —
`rankScenarios()` (line 57) filters by constraints (capex budget, payback threshold,
risk appetite, country availability), then ranks by your **main objective**
(cost-first / carbon-first / reliability-first / expansion-first / balanced). The exact
rule is returned as text and displayed — never a black box. `seedSettings()` (line 29)
converts your study goals into the starting constraints.

## 7. Which file generates memo content

**[`src/lib/study.ts`](../src/lib/study.ts)** — `buildMemoSections()` (line 344)
writes the nine template sections purely from calculated results (no LLM);
`generateMemo()` (line 406) wraps them into a versioned record and persists via
[`/api/memos/save`](../src/app/api/memos/save/route.ts), recording the exact
`scenario_result_ids`, `market_update_ids` and `assumption_version_ids` used.

### Where `calculation_trace` lives
Built by every scenario file through
[`energy/createCalculationTrace.ts`](../src/lib/energy/createCalculationTrace.ts)
helpers, displayed in the Evidence Drawer, and stored as required-non-empty `jsonb`
by [`/api/analyze`](../src/app/api/analyze/route.ts) — the database rejects a result
without a trace.

### Where results are displayed
All under [`src/components/demo/screens/`](../src/components/demo/screens/):
`Baseline.tsx` (KPI dashboard), `ScenarioComparison.tsx` (scenario cards),
`Refinement.tsx` (ranking + constraints), `Recommendation.tsx` (decision card),
`Memo.tsx` (memo preview), plus `EvidenceDrawer.tsx` (traces, assumptions, and the
full source verification record). These files **format** numbers
([`src/lib/format.ts`](../src/lib/format.ts)) — they don't create them.

## 8. Which data is currently local only

Already persisted: projects/sites/bills, every analysis run (scenario_results with
traces), memo versions (linked), source registry (verified). Still session-local:

- **Refinement settings** (capex budget, payback threshold, RE target, BESS size, risk) — lost on reload
- **The CRESS approval state** — the "Apply update & rerun" click is not yet written to `market_updates` / `human_reviews` (the server mirrors the approved view via an overlay in `loadActiveAssumptions`, but the DB `active` flags don't flip yet)
- **Recommendation snapshots** — the ranking result isn't stored (only scenario rows are)
- **"Save revised strategy"** — a local flag

Note: assumption READS now come from Supabase — `/api/analyze` loads the active
approved set from `assumption_versions` via
[`energy/loadActiveAssumptions.ts`](../src/lib/energy/loadActiveAssumptions.ts)
(YAML is only the offline/browser fallback).

## 9. Which data should be saved to Supabase next (in order)

1. **Market-update approvals** → set `market_updates.human_review_status` + insert a
   `human_reviews` row when Apply is clicked, and flip `assumption_versions.active`
   from `ASM-CRESS-SAC@0.1` to `@0.2` (biggest remaining closed-loop gap; the
   source-verification gate is already enforced app-side).
2. **Refinement settings / saved strategy** → jsonb column on `projects` or a small
   `strategy_settings` table.
3. **Recommendation snapshot** per `run_id`, alongside its scenario rows.
4. **`source_snapshots`** — starts with the first live NASA POWER fetch.

## 10. Are any calculations inside UI components?

The engine refactor moved everything real into `src/lib/energy/`. Two small,
previously-noted normalization leaks still exist in UI files (unchanged, identical
logic, no bug — just hygiene):

1. **[`context.tsx`](../src/components/demo/context.tsx) (~line 210–240)** —
   `submitStudy` parses the form strings and applies the
   `annual_cost = monthly_bill × 12` fallback. Note the engine now applies the same
   fallback in `normalizeStudy()`, so this is doubly redundant.
2. **[`StudySetup.tsx`](../src/components/demo/screens/StudySetup.tsx) (Review step)** —
   re-computes `annual = annual_cost || monthly_bill × 12` and `GWh/yr` for the
   preview panel.

Both should collapse into one shared `draftToStudyFields()` helper in
`src/lib/study.ts` during a cleanup pass. Everything else in the screens is
presentation math only (kW→MW conversion, progress-bar percentages).
