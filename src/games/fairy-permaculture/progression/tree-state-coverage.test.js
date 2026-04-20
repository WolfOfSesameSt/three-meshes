/**
 * Coverage test (C3.2) — walks the entire branches.json graph and
 * proves every node is reachable from the root via its prerequisites.
 * Flags unreachable nodes, missing prereq references, and cycles.
 */

import { describe, expect, it } from "vitest";
import branchesData from "../data/branches.json" with { type: "json" };
import {
  createTreeState,
  getAllNodes,
  unlock,
  isUnlocked,
} from "./tree-state.js";

/**
 * Topologically order nodes so every node is visited after its
 * prerequisites. Throws on a cycle.
 */
function topoOrder(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const visited = new Set();
  const stack = new Set();
  const order = [];

  function visit(id, path) {
    if (visited.has(id)) return;
    if (stack.has(id)) {
      throw new Error(`Cycle in tree: ${[...path, id].join(" -> ")}`);
    }
    stack.add(id);
    const node = byId.get(id);
    if (!node) {
      throw new Error(`Prereq references missing node '${id}' (path: ${path.join(" -> ")})`);
    }
    for (const p of node.prerequisites) {
      visit(p, [...path, id]);
    }
    stack.delete(id);
    visited.add(id);
    order.push(id);
  }

  for (const n of nodes) visit(n.id, []);
  return order;
}

describe("tree-state coverage", () => {
  it("every prereq references an existing node (and no cycles)", () => {
    const nodes = getAllNodes();
    expect(() => topoOrder(nodes)).not.toThrow();
  });

  it("every node is reachable — unlocking in topological order succeeds for all", () => {
    const nodes = getAllNodes();
    const order = topoOrder(nodes);
    const state = createTreeState();
    const unreachable = [];
    for (const id of order) {
      try {
        unlock(state, id);
      } catch (e) {
        unreachable.push({ id, error: e.message });
      }
    }
    expect(unreachable).toEqual([]);
    for (const node of nodes) {
      expect(isUnlocked(state, node.id), `node ${node.id}`).toBe(true);
    }
  });

  it("exactly one root node has zero prerequisites", () => {
    const nodes = getAllNodes();
    const roots = nodes.filter((n) => n.prerequisites.length === 0);
    expect(roots.length).toBe(1);
    expect(roots[0].id).toBe("r1");
  });

  it("branches.json has the expected 8 containers (root + 7 + climax)", () => {
    expect(branchesData.length).toBe(9);
    const kinds = branchesData.map((b) => b.kind);
    expect(kinds.filter((k) => k === "root").length).toBe(1);
    expect(kinds.filter((k) => k === "branch").length).toBe(7);
    expect(kinds.filter((k) => k === "climax").length).toBe(1);
  });

  it("each branch node's prereqs live inside the tree (no dangling refs)", () => {
    const allIds = new Set(getAllNodes().map((n) => n.id));
    for (const node of getAllNodes()) {
      for (const p of node.prerequisites) {
        expect(allIds.has(p), `prereq '${p}' of '${node.id}'`).toBe(true);
      }
    }
  });

  it("each node defines a non-empty name + description", () => {
    for (const node of getAllNodes()) {
      expect(node.name.length).toBeGreaterThan(0);
      expect(node.description.length).toBeGreaterThan(0);
    }
  });
});
