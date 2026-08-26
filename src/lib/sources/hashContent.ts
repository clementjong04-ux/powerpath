// Deterministic content hashing for source snapshots (server-only).
// Same bytes -> same hash; any change -> new hash -> triggers a pending review.

import { createHash } from "node:crypto";

export function hashContent(data: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}
