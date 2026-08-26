// Source verification policy — the gate between the registry and the model.
//
// Rules (see also supabase/migrations/0005_source_verification.sql):
//   * Only verification_status = 'verified_official' sources may drive live source
//     sync, market updates, or assumption updates.
//   * not_official_source (internal demo) sources may be displayed and may back
//     clearly-labeled demo assumptions, but never receive or drive live updates.
//   * pending / unverified sources show a warning and cannot affect scenario results.
//
// Pure functions — usable in UI, adapters, and API routes.

import type { Source, VerificationStatus } from "./types";

export function verificationOf(source: Source | undefined | null): VerificationStatus {
  return source?.verification_status ?? "unverified";
}

export function isVerifiedOfficial(source: Source | undefined | null): boolean {
  return verificationOf(source) === "verified_official";
}

export function isInternalDemo(source: Source | undefined | null): boolean {
  return verificationOf(source) === "not_official_source";
}

// May this source drive live sync / market updates / new assumption versions?
export function canDriveUpdates(source: Source | undefined | null): boolean {
  return isVerifiedOfficial(source) && (source?.active ?? true) !== false;
}

// May this source back an assumption at all? Verified sources yes; internal demo
// yes but only as clearly-labeled demo data; pending/unverified no.
export function canBackAssumption(source: Source | undefined | null): boolean {
  return isVerifiedOfficial(source) || isInternalDemo(source);
}

// Human-readable warning when a source must not affect the model; null when fine.
export function sourceWarning(source: Source | undefined | null): string | null {
  const v = verificationOf(source);
  switch (v) {
    case "verified_official":
      return null;
    case "not_official_source":
      return "Internal demo source — shown for illustration; it can back labeled demo assumptions but can never receive or drive live updates.";
    case "pending":
      return "Source verification pending — it cannot affect scenario results or assumptions until verified as official.";
    case "unverified":
    default:
      return "Unverified source — it cannot affect scenario results or assumptions until verified as official.";
  }
}

// Short badge label per status (UI).
export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  verified_official: "Verified official",
  pending: "Pending verification",
  unverified: "Unverified",
  not_official_source: "Internal demo",
};

// Throwing guard used by approval paths: a market update may only be applied when
// its source is verified official.
export function assertUpdateSourceVerified(source: Source | undefined | null, sourceId: string): void {
  if (!canDriveUpdates(source)) {
    throw new Error(
      `Market update blocked: source ${sourceId} is ${VERIFICATION_LABEL[verificationOf(source)].toLowerCase()} — only verified official sources can update assumptions.`,
    );
  }
}
