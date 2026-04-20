/**
 * Tree-state reducer tests (C3.2).
 */

import { describe, expect, it } from "vitest";
import {
  createTreeState,
  isUnlocked,
  isAvailable,
  isLocked,
  unlock,
  markCompleted,
  serialize,
  hydrate,
  getNode,
  getAllNodes,
  getAllBranches,
  snapshot,
} from "./tree-state.js";

describe("createTreeState", () => {
  it("starts with only r1 available", () => {
    const s = createTreeState();
    expect(s.unlocked.size).toBe(0);
    // r1 is the only node with zero prerequisites in branches.json.
    expect(isAvailable(s, "r1")).toBe(true);
    // Everything else is locked.
    expect(isLocked(s, "r2")).toBe(true);
    expect(isLocked(s, "r3")).toBe(true);
    expect(isLocked(s, "r4")).toBe(true);
    expect(isLocked(s, "a1")).toBe(true);
    expect(isLocked(s, "cx-biodynamic")).toBe(true);
  });

  it("available set contains exactly r1 on fresh state", () => {
    const s = createTreeState();
    expect([...s.available]).toEqual(["r1"]);
  });
});

describe("unlock()", () => {
  it("unlocking r1 makes r2, r3, r4, f1 available", () => {
    const s = createTreeState();
    unlock(s, "r1");
    expect(isUnlocked(s, "r1")).toBe(true);
    expect(isAvailable(s, "r2")).toBe(true);
    expect(isAvailable(s, "r3")).toBe(true);
    expect(isAvailable(s, "r4")).toBe(true);
    // f1 has prereq r1 (fungi branch picks up straight from root).
    expect(isAvailable(s, "f1")).toBe(true);
  });

  it("a1 requires r2 first — throws if r2 not unlocked", () => {
    const s = createTreeState();
    unlock(s, "r1");
    expect(() => unlock(s, "a1")).toThrow(/missing prerequisites/);
    unlock(s, "r2");
    expect(() => unlock(s, "a1")).not.toThrow();
    expect(isUnlocked(s, "a1")).toBe(true);
  });

  it("is idempotent when unlocking an already-unlocked node", () => {
    const s = createTreeState();
    unlock(s, "r1");
    unlock(s, "r1"); // no-op, no throw
    expect(isUnlocked(s, "r1")).toBe(true);
  });

  it("throws on unknown node id", () => {
    const s = createTreeState();
    expect(() => unlock(s, "nope-does-not-exist")).toThrow(/unknown node/);
  });

  it("climax node cx-biodynamic requires a4 + c3 + e4 unlocked", () => {
    const s = createTreeState();
    // Walk up the three chains.
    const chain = [
      "r1",
      "r2",
      // Branch A: r2 -> a1 -> a2 -> a3 -> a4
      "a1", "a2", "a3", "a4",
      // Branch C: r2 -> c1 -> c2 -> c3
      "c1", "c2", "c3",
      // Branch E: r2 -> e1 -> e2 -> e3 -> e4
      "e1", "e2", "e3", "e4",
    ];
    for (const id of chain) unlock(s, id);

    expect(isUnlocked(s, "a4")).toBe(true);
    expect(isUnlocked(s, "c3")).toBe(true);
    expect(isUnlocked(s, "e4")).toBe(true);
    expect(isAvailable(s, "cx-biodynamic")).toBe(true);

    unlock(s, "cx-biodynamic");
    expect(isUnlocked(s, "cx-biodynamic")).toBe(true);
  });

  it("climax node unreachable without all 3 prereqs", () => {
    const s = createTreeState();
    // Get A4 + C3 only — skip E chain entirely.
    const chain = ["r1", "r2", "a1", "a2", "a3", "a4", "c1", "c2", "c3"];
    for (const id of chain) unlock(s, id);
    expect(isAvailable(s, "cx-biodynamic")).toBe(false);
    expect(() => unlock(s, "cx-biodynamic")).toThrow(/missing prerequisites.*e4/);
  });
});

describe("markCompleted()", () => {
  it("is an alias for unlock", () => {
    const s = createTreeState();
    markCompleted(s, "r1");
    expect(isUnlocked(s, "r1")).toBe(true);
    expect(() => markCompleted(s, "a1")).toThrow(/missing prerequisites/);
  });
});

describe("serialize / hydrate", () => {
  it("round-trips identically", () => {
    const s1 = createTreeState();
    unlock(s1, "r1");
    unlock(s1, "r2");
    unlock(s1, "r4");
    unlock(s1, "b1");
    const saved = serialize(s1);

    const s2 = createTreeState();
    hydrate(s2, saved);

    expect([...s2.unlocked].sort()).toEqual([...s1.unlocked].sort());
    expect([...s2.available].sort()).toEqual([...s1.available].sort());
    expect([...s2.locked].sort()).toEqual([...s1.locked].sort());
  });

  it("hydrate drops unknown ids silently", () => {
    const s = createTreeState();
    hydrate(s, { version: 1, unlocked: ["r1", "ghost-node-xyz"] });
    expect(isUnlocked(s, "r1")).toBe(true);
    expect(s.unlocked.has("ghost-node-xyz")).toBe(false);
  });

  it("hydrate recomputes availability from scratch", () => {
    const s = createTreeState();
    hydrate(s, { version: 1, unlocked: ["r1"] });
    expect(isAvailable(s, "r2")).toBe(true);
    expect(isAvailable(s, "r3")).toBe(true);
    expect(isAvailable(s, "r4")).toBe(true);
    expect(isAvailable(s, "f1")).toBe(true);
  });

  it("hydrate throws on malformed payload", () => {
    const s = createTreeState();
    expect(() => hydrate(s, null)).toThrow();
    expect(() => hydrate(s, { version: 1 })).toThrow();
  });
});

describe("snapshot()", () => {
  it("every node has a status classification", () => {
    const s = createTreeState();
    const snap = snapshot(s);
    expect(snap.length).toBe(getAllNodes().length);
    for (const node of snap) {
      expect(["unlocked", "available", "locked"]).toContain(node.status);
    }
  });

  it("reflects transitions", () => {
    const s = createTreeState();
    let snap = snapshot(s);
    expect(snap.find((n) => n.id === "r1").status).toBe("available");
    expect(snap.find((n) => n.id === "r2").status).toBe("locked");
    unlock(s, "r1");
    snap = snapshot(s);
    expect(snap.find((n) => n.id === "r1").status).toBe("unlocked");
    expect(snap.find((n) => n.id === "r2").status).toBe("available");
  });
});

describe("static index", () => {
  it("getNode returns the node def with branch metadata", () => {
    const n = getNode("r1");
    expect(n.id).toBe("r1");
    expect(n.branchId).toBe("root");
    expect(n.branchKind).toBe("root");
  });

  it("getAllBranches returns 9 branches (root + 7 + climax)", () => {
    const branches = getAllBranches();
    const kinds = branches.map((b) => b.kind);
    expect(kinds.filter((k) => k === "root").length).toBe(1);
    expect(kinds.filter((k) => k === "branch").length).toBe(7);
    expect(kinds.filter((k) => k === "climax").length).toBe(1);
  });
});
