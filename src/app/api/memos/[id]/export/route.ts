// GET /api/memos/[id]/export?format=html|md — export a SAVED memo_versions record.
//
// Reads the memo and its linked evidence (project, assumption_versions,
// source_registry, market_updates) from Supabase and renders a printable HTML
// page (browser print = Save as PDF) or a Markdown download. Read-only; no LLM.
//
// Only the whitelisted export model in src/lib/export/memoExport.ts reaches the
// output — no env vars, keys, or debug state. The approval status and the
// pre-feasibility / no-grid-approval caveat are always rendered.

import { getSupabaseAdmin, supabaseAdminConfigured } from "@/lib/supabase/admin";
import {
  exportFileBase,
  renderMemoHtml,
  renderMemoMarkdown,
  type MemoExportModel,
} from "@/lib/export/memoExport";
import type { MemoSection } from "@/lib/types";

interface MemoRow {
  id: string;
  project_id: string;
  version: number;
  memo_type: string;
  content: MemoSection[];
  market_update_ids: string[] | null;
  assumption_version_ids: string[] | null;
  scenario_result_ids?: string[] | null; // absent before migration 0004
  assumption_set_version: string | null;
  human_review_status: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const config = supabaseAdminConfigured();
  if (!config.ok) {
    return Response.json(
      { ok: false, status: "not_configured", error: `Missing environment variables: ${config.missing.join(", ")}` },
      { status: 503 },
    );
  }

  const { id } = await params;
  const format = new URL(request.url).searchParams.get("format") === "md" ? "md" : "html";
  const supabase = getSupabaseAdmin();

  // 1. The saved memo record (requirement: export uses memo_versions, not UI state).
  const memoRes = await supabase.from("memo_versions").select("*").eq("id", id).maybeSingle();
  if (memoRes.error) return Response.json({ ok: false, error: memoRes.error.message }, { status: 500 });
  if (!memoRes.data) return Response.json({ ok: false, error: `Memo ${id} not found in memo_versions.` }, { status: 404 });
  const memo = memoRes.data as MemoRow;

  // 2. The project it belongs to (name + country only).
  const projectRes = await supabase
    .from("projects")
    .select("project_name, country")
    .eq("id", memo.project_id)
    .maybeSingle();
  if (projectRes.error) return Response.json({ ok: false, error: projectRes.error.message }, { status: 500 });
  const project = (projectRes.data as { project_name: string; country: string } | null) ?? {
    project_name: memo.project_id,
    country: "—",
  };

  // 3. Linked evidence: assumption versions, their sources, market updates.
  const assumptionIds = memo.assumption_version_ids ?? [];
  const updateIds = memo.market_update_ids ?? [];

  const assumptionsRes = assumptionIds.length
    ? await supabase
        .from("assumption_versions")
        .select("id, label, value, unit, source_id, confidence, human_review_status, active")
        .in("id", assumptionIds)
    : { data: [], error: null };
  if (assumptionsRes.error) return Response.json({ ok: false, error: assumptionsRes.error.message }, { status: 500 });
  const assumptions = (assumptionsRes.data ?? []) as MemoExportModel["assumptions"];

  const sourceIds = [...new Set(assumptions.map((a) => a.source_id).filter((s): s is string => Boolean(s)))];
  const sourcesRes = sourceIds.length
    ? await supabase
        .from("source_registry")
        .select("id, source_name, authority, url, source_domain, verification_status")
        .in("id", sourceIds)
    : { data: [], error: null };
  if (sourcesRes.error) return Response.json({ ok: false, error: sourcesRes.error.message }, { status: 500 });

  const updatesRes = updateIds.length
    ? await supabase
        .from("market_updates")
        .select("id, title, detected_at, human_review_status")
        .in("id", updateIds)
    : { data: [], error: null };
  if (updatesRes.error) return Response.json({ ok: false, error: updatesRes.error.message }, { status: 500 });

  const model: MemoExportModel = {
    memo: {
      id: memo.id,
      version: memo.version,
      memo_type: memo.memo_type,
      content: Array.isArray(memo.content) ? memo.content : [],
      human_review_status: memo.human_review_status,
      approved_by: memo.approved_by,
      approved_at: memo.approved_at,
      created_at: memo.created_at,
      assumption_set_version: memo.assumption_set_version,
      market_update_ids: updateIds,
      assumption_version_ids: assumptionIds,
      scenario_result_ids: memo.scenario_result_ids ?? [],
    },
    project,
    assumptions,
    sources: (sourcesRes.data ?? []) as MemoExportModel["sources"],
    market_updates: (updatesRes.data ?? []) as MemoExportModel["market_updates"],
    exported_at: new Date().toISOString(),
  };

  const fileBase = exportFileBase(project.project_name, new Date());
  if (format === "md") {
    return new Response(renderMemoMarkdown(model), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileBase}.md"`,
      },
    });
  }
  return new Response(renderMemoHtml(model), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="${fileBase}.html"`,
    },
  });
}
