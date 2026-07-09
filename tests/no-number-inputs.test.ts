import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import path from "path";

// Ratchet: <input type="number"> silently increments/decrements on
// wheel-scroll while focused. This corrupted an event price from
// 100000 to 99995 VND (Jul 2026). Use type="text" + inputMode="numeric"
// + pattern="[0-9]*" instead — numeric keypad on mobile, no spinner.
const SCAN_DIRS = ["components", "app"];
const ROOT = path.resolve(__dirname, "..");

function findOffenders(): string[] {
  const offenders: string[] = [];
  for (const dir of SCAN_DIRS) {
    const entries = readdirSync(path.join(ROOT, dir), {
      recursive: true,
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".tsx")) continue;
      if (entry.name.endsWith(".test.tsx")) continue;
      const filePath = path.join(entry.parentPath, entry.name);
      const source = readFileSync(filePath, "utf8");
      if (/type\s*=\s*["'{]+\s*["']?number/.test(source)) {
        offenders.push(path.relative(ROOT, filePath));
      }
    }
  }
  return offenders;
}

describe("no spinner number inputs", () => {
  it('has zero <input type="number"> in components/ and app/', () => {
    expect(findOffenders()).toEqual([]);
  });
});
