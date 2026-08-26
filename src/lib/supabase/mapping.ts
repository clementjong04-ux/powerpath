// Pure mapping between the StudyProject app object and the projects / sites /
// energy_bills rows. No env access, no I/O — usable from server routes and tests.
//
// Convention: one project has (for now) exactly one site and one representative
// energy bill. Child ids derive from the project id so sample upserts stay idempotent.

import type { StudyProject } from "@/lib/types";

export interface ProjectRow {
  id: string;
  project_name: string;
  country: string;
  business_type: string;
  user_type: string;
  main_objective: string;
  budget_preference: string;
  reliability_requirement: string;
  risk_appetite: string;
  renewable_target_percent: number;
  renewable_target_year: number;
  expansion_load_kw: number;
  data_status: string;
  created_at: string;
  updated_at: string;
}

export interface SiteRow {
  id: string;
  project_id: string;
  site_location: string;
  tariff_category: string;
  peak_demand_kw: number;
  // Tariff context (migration 0008) — optional so pre-migration rows still map.
  state?: string | null;
  region?: string | null;
  utility?: string | null;
  supply_voltage_level?: string | null;
  tariff_code?: string | null;
  tariff_source_id?: string | null;
  tariff_verification_status?: string | null;
}

export interface EnergyBillRow {
  id: string;
  site_id: string;
  period_label: string;
  monthly_consumption_kwh: number;
  bill_amount: number;
  annual_cost: number;
  average_unit_cost: number | null;
  carbon_baseline: number | null;
  current_re_share: number;
  data_source: string;
  confirmed_by_human: boolean;
}

export function siteIdFor(projectId: string): string {
  return projectId.replace(/^study-/, "site-");
}

export function billIdFor(projectId: string): string {
  return projectId.replace(/^study-/, "bill-");
}

export function toRows(study: StudyProject): {
  project: ProjectRow;
  site: SiteRow;
  bill: EnergyBillRow;
} {
  return {
    project: {
      id: study.id,
      project_name: study.project_name,
      country: study.country,
      business_type: study.business_type,
      user_type: study.user_type,
      main_objective: study.main_objective,
      budget_preference: study.budget_preference,
      reliability_requirement: study.reliability_requirement,
      risk_appetite: study.risk_appetite,
      renewable_target_percent: study.renewable_target_percent,
      renewable_target_year: study.renewable_target_year,
      expansion_load_kw: study.expansion_load_kw,
      data_status: study.data_status,
      created_at: study.created_at,
      updated_at: study.updated_at,
    },
    site: {
      id: siteIdFor(study.id),
      project_id: study.id,
      site_location: study.site_location,
      tariff_category: study.tariff_category,
      peak_demand_kw: study.peak_demand_kw,
      state: study.state ?? null,
      region: study.region ?? null,
      utility: study.utility ?? null,
      supply_voltage_level: study.supply_voltage_level ?? null,
      tariff_code: study.tariff_code ?? null,
      tariff_source_id: study.tariff_source_id ?? null,
      tariff_verification_status: study.tariff_verification_status ?? null,
    },
    bill: {
      id: billIdFor(study.id),
      site_id: siteIdFor(study.id),
      period_label: "representative-month",
      monthly_consumption_kwh: study.monthly_consumption_kwh,
      bill_amount: study.monthly_bill,
      annual_cost: study.annual_cost,
      average_unit_cost: study.average_unit_cost,
      carbon_baseline: study.carbon_baseline,
      current_re_share: study.current_re_share,
      data_source: study.data_status === "sample_case" ? "sample" : "user_entered",
      // In the wizard the review step is the human confirmation.
      confirmed_by_human: true,
    },
  };
}

export function fromRows(
  project: ProjectRow,
  site: SiteRow | null,
  bill: EnergyBillRow | null,
): StudyProject {
  return {
    id: project.id,
    project_name: project.project_name,
    country: project.country,
    business_type: project.business_type,
    user_type: project.user_type as StudyProject["user_type"],
    site_location: site?.site_location ?? "—",
    tariff_category: site?.tariff_category ?? "—",
    state: site?.state ?? undefined,
    region: site?.region ?? undefined,
    utility: site?.utility ?? undefined,
    supply_voltage_level: site?.supply_voltage_level ?? undefined,
    tariff_code: site?.tariff_code ?? null,
    tariff_source_id: site?.tariff_source_id ?? null,
    tariff_verification_status: site?.tariff_verification_status ?? null,
    peak_demand_kw: Number(site?.peak_demand_kw ?? 0),
    monthly_consumption_kwh: Number(bill?.monthly_consumption_kwh ?? 0),
    monthly_bill: Number(bill?.bill_amount ?? 0),
    annual_cost: Number(bill?.annual_cost ?? 0),
    average_unit_cost: bill?.average_unit_cost === null || bill?.average_unit_cost === undefined ? null : Number(bill.average_unit_cost),
    carbon_baseline: bill?.carbon_baseline === null || bill?.carbon_baseline === undefined ? null : Number(bill.carbon_baseline),
    current_re_share: Number(bill?.current_re_share ?? 0),
    renewable_target_percent: Number(project.renewable_target_percent),
    renewable_target_year: Number(project.renewable_target_year),
    expansion_load_kw: Number(project.expansion_load_kw),
    budget_preference: project.budget_preference as StudyProject["budget_preference"],
    reliability_requirement: project.reliability_requirement as StudyProject["reliability_requirement"],
    main_objective: project.main_objective as StudyProject["main_objective"],
    risk_appetite: project.risk_appetite as StudyProject["risk_appetite"],
    created_at: project.created_at,
    updated_at: project.updated_at,
    // 'sample' is the pre-migration-0002 legacy value for 'sample_case'.
    data_status: (project.data_status === "sample" ? "sample_case" : project.data_status) as StudyProject["data_status"],
    persisted: true,
  };
}
