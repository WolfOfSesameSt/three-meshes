/**
 * Fairy Permaculture — simulator determinism test.
 *
 * Same seed + profile + years must produce bit-identical day-by-day
 * metrics across runs. This is the bedrock guarantee the balance loop
 * depends on.
 */
import { describe, it, expect } from "vitest";
import { runSimulation } from "./simulator.js";

function fingerprint(run) {
  // Hash the four main metric arrays; a simple FNV-ish over bytes.
  const arrays = [
    run.rec.fairyCount.buffer,
    run.rec.biomassStock.buffer,
    run.rec.honeyStock.buffer,
    run.rec.milkStock.buffer,
    run.rec.fruitStock.buffer,
    run.rec.yieldUnits.buffer,
    run.rec.unlockedCount.buffer,
  ];
  let h = 0x811c9dc5;
  for (const buf of arrays) {
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h.toString(16);
}

describe("simulator determinism", () => {
  it("same seed + profile → identical metric fingerprint", () => {
    const a = runSimulation({ seed: 42, years: 1, profile: "typical" });
    const b = runSimulation({ seed: 42, years: 1, profile: "typical" });
    expect(fingerprint(a)).toBe(fingerprint(b));
    expect(a.fairyCountFinal).toBe(b.fairyCountFinal);
    expect(a.unlockedFinal).toBe(b.unlockedFinal);
    expect(JSON.stringify(a.branchInvestment)).toBe(JSON.stringify(b.branchInvestment));
  });

  it("different seeds produce different fingerprints", () => {
    const a = runSimulation({ seed: 42, years: 1, profile: "typical" });
    const b = runSimulation({ seed: 43, years: 1, profile: "typical" });
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it("different profiles on same seed differ", () => {
    const a = runSimulation({ seed: 42, years: 1, profile: "typical" });
    const b = runSimulation({ seed: 42, years: 1, profile: "naive" });
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });
});
