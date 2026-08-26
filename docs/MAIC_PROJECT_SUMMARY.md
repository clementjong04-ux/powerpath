# PowerPath — MAIC Hackathon Project Summary

**One-liner:** PowerPath is the AI that runs a company's electricity decisions — it reads the documents, watches the market, and recommends what to do, with numbers a board can trust.

## The problem

Large electricity users in Malaysia — factories, data centres, industrial parks — make million-ringgit power decisions (stay on grid, add rooftop solar, add batteries, sign a green-power deal) using PDFs and spreadsheets. The answer is scattered across six or seven documents owned by nobody: bills, tariff rules, vendor quotes, contracts, sustainability targets, grid constraints. And the rules keep moving — Malaysia restructured electricity tariffs in July 2025 and keeps updating its green-power schemes — so yesterday's analysis is already stale. One wrong call means millions in stranded capital or a missed 2030 renewable target.

## The solution

An AI-native workflow of five specialised agents:

- **Ingest** reads bills, contracts and quotes
- **Watchtower** monitors official sources 24/7 and fingerprints every document for change
- **Strategy** generates and stress-tests five energy strategies, ranked by the client's objective
- **Analyst** explains every result in plain English
- **Memo** drafts a board-ready memo, watermarked until a human signs

**The trust rule:** AI runs the entire workflow — but it is architecturally unable to invent a number. Every figure is computed by a deterministic calculation engine (same inputs, same outputs, a trace on every figure), every assumption cites a verified source, and nothing changes a recommendation until a human approves. No silent updates, ever.

## Live in the MVP today (all demoable)

- Deterministic scenario engine with calculation traces: grid, rooftop solar, green-power scheme, battery storage, hybrid
- Real monitoring of official Malaysian sources with SHA-256-fingerprinted, tamper-proof snapshots
- Live NASA POWER satellite solar data for the site
- The closed loop: source change detected → impact quantified (~RM260k/yr on the sample case) → human approval recorded → engine reruns → recommendation re-ranks → memo rewrites, pending review
- AI explanation and memo drafting (Claude), code-audited so it cannot state a number the engine didn't compute
- Versioned assumptions, full audit log, watermarked memo export

**Sample case running live:** a Johor electronics plant — RM8.4M/yr electricity spend, 4.8 MW peak demand, 40% renewable target by 2030. Demo-grade data, honestly labeled; pre-feasibility only.

## Tech stack

Next.js + TypeScript · Supabase (versioned assumptions, audit logs) · deterministic engine in code · Anthropic Claude · NASA POWER API · hash-based source change detection.

## Why it matters for Malaysia

The Johor–Singapore data-centre corridor has made power a board-level constraint on growth, while the energy transition accelerates rule changes. PowerPath turns a slow, expensive consulting exercise into always-on, auditable software — Malaysia first, Southeast Asia next, each country a module.

## Team

- **Kenneth Jong** — energy strategy (Guidehouse Energy & Infrastructure consultant). The consultant this product encodes.
- **Clement Jong** — AI architect. Built the MVP end to end: agents, engine, audit trail.

Brothers who have built and operated together before.

**Contact:** kennethjong00@gmail.com · clementjong04@gmail.com
