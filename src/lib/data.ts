// Server-only data loaders. These read the source-of-truth files in /data at request time
// so the demo genuinely consumes the JSON/YAML brain files (no duplicated constants).
// Uses the Node fs API + js-yaml, so it must run in a Server Component / server context.

import { readFileSync } from "node:fs";
import path from "node:path";
import { load as loadYaml } from "js-yaml";
import type {
  AssumptionSet,
  Baseline,
  DemoData,
  MarketUpdateFixture,
  SourceRegistry,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");

function readJson<T>(rel: string): T {
  return JSON.parse(readFileSync(path.join(DATA_DIR, rel), "utf8")) as T;
}

function readYaml<T>(rel: string): T {
  return loadYaml(readFileSync(path.join(DATA_DIR, rel), "utf8")) as T;
}

// Load one Malaysia assumption set by version ('0.1' | '0.2'). Server-only.
export function loadAssumptionSet(version: string): AssumptionSet {
  if (!/^0\.(1|2)$/.test(version)) {
    throw new Error(`Unknown assumption set version: ${version}`);
  }
  return readYaml<AssumptionSet>(`assumptions/malaysia_assumptions.v${version}.yaml`);
}

export function loadDemoData(): DemoData {
  const baseline = readJson<Baseline>("demo/johor_electronics_demo.json");
  const registry = readYaml<SourceRegistry>("sources/source_registry.malaysia.yaml");
  const assumptionsV1 = readYaml<AssumptionSet>("assumptions/malaysia_assumptions.v0.1.yaml");
  const assumptionsV2 = readYaml<AssumptionSet>("assumptions/malaysia_assumptions.v0.2.yaml");
  const marketUpdate = readJson<MarketUpdateFixture>("sources/market_update.cress_sac.json");

  return {
    baseline,
    sources: registry.sources,
    assumptionsV1,
    assumptionsV2,
    marketUpdate,
  };
}
