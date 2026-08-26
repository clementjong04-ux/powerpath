// Memo export rendering (server-only) — printable HTML and Markdown.
//
// Renders ONLY a whitelisted export model assembled from saved database records
// (memo_versions + its linked project, assumption_versions, source_registry,
// market_updates). No env vars, no keys, no debug state can reach the output —
// everything printed passes through this typed model, and all dynamic text is
// escaped. The pre-feasibility caveat and the approval status are rendered by
// code on every export; they cannot be omitted.

import { BRAND } from "@/lib/brand";
import type { MemoSection } from "@/lib/types";

export interface MemoExportModel {
  memo: {
    id: string;
    version: number;
    memo_type: string;
    content: MemoSection[];
    human_review_status: string;
    approved_by: string | null;
    approved_at: string | null;
    created_at: string;
    assumption_set_version: string | null;
    market_update_ids: string[];
    assumption_version_ids: string[];
    scenario_result_ids: string[]; // [] when migration 0004 is pending
  };
  project: { project_name: string; country: string };
  assumptions: {
    id: string;
    label: string | null;
    value: number | string | null;
    unit: string | null;
    source_id: string | null;
    confidence: string | null;
    human_review_status: string | null;
    active: boolean;
  }[];
  sources: {
    id: string;
    source_name: string;
    authority: string | null;
    url: string | null;
    source_domain: string | null;
    verification_status: string | null;
  }[];
  market_updates: { id: string; title: string; detected_at: string; human_review_status: string }[];
  exported_at: string;
}

const CAVEAT =
  "Demo-grade · pre-feasibility only · not official tariff-grade financial advice · " +
  "no official grid approval is claimed or implied · human approval is required before any final recommendation. " +
  "Numbers come from the deterministic calculation engine (scenario_results); the AI never calculates.";

export function approvalLabel(status: string): { label: string; approved: boolean } {
  if (status === "approved" || status === "approved_demo") {
    return { label: "HUMAN-APPROVED (DEMO) — not a real regulatory or financial sign-off", approved: true };
  }
  if (status === "pending_review") return { label: "PENDING HUMAN REVIEW — draft, not approved", approved: false };
  return { label: `${status.toUpperCase()} — not approved`, approved: false };
}

export function exportFileBase(projectName: string, when: Date): string {
  const slug = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "memo";
  return `power-strategy-memo-${slug}-${when.toISOString().slice(0, 10)}`;
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-MY", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// HTML export — a self-contained printable page (browser print = the PDF path).
// ---------------------------------------------------------------------------
export function renderMemoHtml(m: MemoExportModel): string {
  const approval = approvalLabel(m.memo.human_review_status);
  const sourceById = new Map(m.sources.map((s) => [s.id, s]));

  const sections = m.memo.content
    .map(
      (sec, i) => `
      <section>
        <h2>${i + 1} · ${esc(sec.title)}</h2>
        <p>${esc(sec.body)}</p>
      </section>`,
    )
    .join("");

  const assumptionRows = m.assumptions
    .map((a) => {
      const src = a.source_id ? sourceById.get(a.source_id) : undefined;
      return `<tr>
        <td>${esc(a.label ?? a.id)}<div class="sub">${esc(a.id)}</div></td>
        <td class="num">${esc(a.value ?? "—")} ${esc(a.unit ?? "")}</td>
        <td>${esc(a.human_review_status ?? "—")}${a.active ? " · active" : ""}</td>
        <td>${esc(a.confidence ?? "—")}</td>
        <td>${esc(src ? src.source_name : (a.source_id ?? "—"))}${src?.verification_status ? `<div class="sub">${esc(src.verification_status)}</div>` : ""}</td>
      </tr>`;
    })
    .join("");

  const sourceRows = m.sources
    .map(
      (s) => `<tr>
      <td>${esc(s.source_name)}<div class="sub">${esc(s.id)}</div></td>
      <td>${esc(s.authority ?? "—")}</td>
      <td>${esc(s.verification_status ?? "unverified")}</td>
      <td>${s.url ? `<a href="${esc(s.url)}">${esc(s.source_domain ?? s.url)}</a>` : "—"}</td>
    </tr>`,
    )
    .join("");

  const updates = m.market_updates
    .map((u) => `<li>${esc(u.title)} <span class="sub">(${esc(u.human_review_status)} · detected ${esc(fmtDate(u.detected_at))} · ${esc(u.id)})</span></li>`)
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(exportFileBase(m.project.project_name, new Date(m.exported_at)))}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, "Times New Roman", serif; color: #1a1d21; margin: 0; background: #f3f4f6; }
  .page { max-width: 800px; margin: 0 auto; background: #fff; padding: 48px 56px; min-height: 100vh; }
  header.doc { border-bottom: 3px solid #1a1d21; padding-bottom: 16px; margin-bottom: 8px; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  .meta { font-family: Arial, sans-serif; font-size: 12px; color: #555; }
  .status { font-family: Arial, sans-serif; font-weight: bold; font-size: 13px; padding: 10px 14px; margin: 16px 0; border-radius: 6px; }
  .status.pending { background: #fef3c7; color: #92400e; border: 1px solid #f59e0b; }
  .status.approved { background: #d1fae5; color: #065f46; border: 1px solid #10b981; }
  section { margin: 18px 0; }
  h2 { font-family: Arial, sans-serif; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #0d5c4d; margin: 0 0 6px; }
  p { font-size: 14px; line-height: 1.55; margin: 0; }
  table { width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px; margin-top: 6px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #666; }
  td.num { white-space: nowrap; }
  .sub { font-size: 10px; color: #888; }
  ul { margin: 6px 0 0; padding-left: 18px; font-size: 13px; line-height: 1.5; }
  footer.doc { margin-top: 28px; border-top: 1px solid #d1d5db; padding-top: 12px; font-family: Arial, sans-serif; font-size: 11px; color: #555; line-height: 1.5; }
  .printbar { position: sticky; top: 0; background: #1a1d21; color: #fff; font-family: Arial, sans-serif; font-size: 13px; padding: 10px 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .printbar button { background: #10b981; color: #fff; border: 0; border-radius: 6px; padding: 8px 14px; font-size: 13px; cursor: pointer; }
  @media print { .printbar { display: none; } body { background: #fff; } .page { padding: 0; max-width: none; } a { color: inherit; text-decoration: none; } }
</style>
</head>
<body>
<div class="printbar">
  <span>To save as PDF: click Print, then choose “Save as PDF” as the destination.</span>
  <button onclick="window.print()">Print / Save as PDF</button>
</div>
<div class="page">
  <header class="doc">
    <div class="meta" style="margin-bottom:4px;">${esc(BRAND.name)} · ${esc(BRAND.descriptor)}</div>
    <h1>Power Strategy Memo</h1>
    <div class="meta">
      ${esc(m.project.project_name)} · ${esc(m.project.country)} · memo v${m.memo.version} (${esc(m.memo.memo_type.toUpperCase())})
      · assumption set ${esc(m.memo.assumption_set_version ?? "—")} · created ${esc(fmtDate(m.memo.created_at))} · exported ${esc(fmtDate(m.exported_at))}
    </div>
  </header>

  <div class="status ${approval.approved ? "approved" : "pending"}">${esc(approval.label)}${
    approval.approved && m.memo.approved_by ? ` · by ${esc(m.memo.approved_by)} on ${esc(fmtDate(m.memo.approved_at))}` : ""
  }</div>

  ${sections}

  <section>
    <h2>Evidence · assumptions used (${esc(m.memo.assumption_set_version ?? "—")})</h2>
    ${m.assumptions.length > 0 ? `<table>
      <thead><tr><th>Assumption</th><th>Value</th><th>Review status</th><th>Confidence</th><th>Source</th></tr></thead>
      <tbody>${assumptionRows}</tbody>
    </table>` : `<p class="sub">No linked assumption versions on this memo record.</p>`}
  </section>

  <section>
    <h2>Evidence · sources cited</h2>
    ${m.sources.length > 0 ? `<table>
      <thead><tr><th>Source</th><th>Authority</th><th>Verification</th><th>Link</th></tr></thead>
      <tbody>${sourceRows}</tbody>
    </table>` : `<p class="sub">No registry sources linked.</p>`}
  </section>

  <section>
    <h2>Evidence · record trail</h2>
    <ul>
      <li>Memo record: ${esc(m.memo.id)} (memo_versions v${m.memo.version})</li>
      <li>Scenario results linked: ${m.memo.scenario_result_ids.length > 0 ? `${m.memo.scenario_result_ids.length} rows — every figure above traces to these deterministic calculation rows` : "recorded per run (all figures come from the deterministic engine)"}</li>
      <li>Assumption versions linked: ${m.memo.assumption_version_ids.length}</li>
      ${updates ? `<li>Market updates considered:<ul>${updates}</ul></li>` : ""}
    </ul>
  </section>

  <footer class="doc">${esc(CAVEAT)}</footer>
</div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Markdown export.
// ---------------------------------------------------------------------------
export function renderMemoMarkdown(m: MemoExportModel): string {
  const approval = approvalLabel(m.memo.human_review_status);
  const sourceById = new Map(m.sources.map((s) => [s.id, s]));
  const lines: string[] = [];

  lines.push(`# Power Strategy Memo — ${m.project.project_name}`);
  lines.push("");
  lines.push(`_${BRAND.name} · ${BRAND.descriptor}_`);
  lines.push("");
  lines.push(
    `${m.project.country} · memo v${m.memo.version} (${m.memo.memo_type.toUpperCase()}) · assumption set ${m.memo.assumption_set_version ?? "—"} · created ${fmtDate(m.memo.created_at)} · exported ${fmtDate(m.exported_at)}`,
  );
  lines.push("");
  lines.push(`> **${approval.label}**${approval.approved && m.memo.approved_by ? ` — by ${m.memo.approved_by} on ${fmtDate(m.memo.approved_at)}` : ""}`);
  lines.push("");

  m.memo.content.forEach((sec, i) => {
    lines.push(`## ${i + 1} · ${sec.title}`);
    lines.push("");
    lines.push(sec.body);
    lines.push("");
  });

  lines.push(`## Evidence · assumptions used (${m.memo.assumption_set_version ?? "—"})`);
  lines.push("");
  if (m.assumptions.length > 0) {
    lines.push("| Assumption | Value | Review status | Confidence | Source |");
    lines.push("|---|---|---|---|---|");
    for (const a of m.assumptions) {
      const src = a.source_id ? sourceById.get(a.source_id) : undefined;
      lines.push(
        `| ${a.label ?? a.id} (\`${a.id}\`) | ${a.value ?? "—"} ${a.unit ?? ""} | ${a.human_review_status ?? "—"}${a.active ? " · active" : ""} | ${a.confidence ?? "—"} | ${src ? `${src.source_name} (${src.verification_status ?? "unverified"})` : (a.source_id ?? "—")} |`,
      );
    }
  } else {
    lines.push("_No linked assumption versions on this memo record._");
  }
  lines.push("");

  lines.push("## Evidence · sources cited");
  lines.push("");
  for (const s of m.sources) {
    lines.push(`- **${s.source_name}** (${s.id}) — ${s.authority ?? "—"} · ${s.verification_status ?? "unverified"}${s.url ? ` · ${s.url}` : ""}`);
  }
  if (m.sources.length === 0) lines.push("_No registry sources linked._");
  lines.push("");

  lines.push("## Evidence · record trail");
  lines.push("");
  lines.push(`- Memo record: \`${m.memo.id}\` (memo_versions v${m.memo.version})`);
  lines.push(
    `- Scenario results linked: ${m.memo.scenario_result_ids.length > 0 ? `${m.memo.scenario_result_ids.length} rows — every figure above traces to these deterministic calculation rows` : "recorded per run (all figures come from the deterministic engine)"}`,
  );
  lines.push(`- Assumption versions linked: ${m.memo.assumption_version_ids.length}`);
  for (const u of m.market_updates) {
    lines.push(`- Market update considered: ${u.title} (${u.human_review_status} · detected ${fmtDate(u.detected_at)} · \`${u.id}\`)`);
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(`_${CAVEAT}_`);
  lines.push("");
  return lines.join("\n");
}
