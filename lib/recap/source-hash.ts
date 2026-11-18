/**
 * Stable, dependency-free hash of a recap's normalized inputs.
 *
 * Not cryptographic: it only answers "did anything that affects the render
 * change?" so a re-render can be skipped. Two independent FNV-1a 32-bit lanes
 * are concatenated into 64 bits, which is plenty for change detection.
 */

const FNV_PRIME = 0x01000193;
const LANE_A_BASIS = 0x811c9dc5;
const LANE_B_BASIS = 0x9747b28c;

/** Canonical JSON: object keys sorted, undefined dropped, no whitespace. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return Number.isFinite(value as number) || typeof value !== "number" ? JSON.stringify(value) : "null";
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? "null" : stableStringify(item))).join(",")}]`;
  }
  if (typeof value === "object" && value !== undefined) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined && typeof v !== "function")
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return "null";
}

function fnv1a32(text: string, basis: number): number {
  let hash = basis >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

const hex8 = (n: number) => n.toString(16).padStart(8, "0");

/** 16 lowercase hex characters (64 bits) over the canonical JSON of `input`. */
export function computeSourceHash(input: unknown): string {
  const text = stableStringify(input);
  // Lane B hashes the reversed-salt text so the lanes do not collapse together.
  return hex8(fnv1a32(text, LANE_A_BASIS)) + hex8(fnv1a32(`~${text.length}~${text}`, LANE_B_BASIS));
}

export const SOURCE_HASH_PATTERN = /^[0-9a-f]{16}$/;
