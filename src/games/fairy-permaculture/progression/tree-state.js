/**
 * Fairy Permaculture — Food-Chain Tree state machine (C3.2).
 *
 * Pure state + reducer. Loads `branches.json` once at module load and
 * computes a flat node index and child/branch lookups. The state
 * object tracks:
 *
 *   unlocked  : Set<nodeId>   — player has completed / claimed this node
 *   available : Set<nodeId>   — prerequisites satisfied; node is clickable
 *   locked    : Set<nodeId>   — prerequisites unmet
 *
 * Rules:
 *   - A node is `available` iff every prerequisite is in `unlocked`.
 *   - A node is `locked` iff at least one prerequisite is missing.
 *   - Root nodes with no prerequisites start `available`.
 *   - `unlock(state, id)` throws if the node isn't currently available.
 *   - `markCompleted(state, id)` is a semantic alias for `unlock` —
 *     sim systems call this when an external process (e.g., building
 *     the compost pile, finishing R1) should flip the node on.
 *
 * This module is event-free. The UI and sim attach an event bus
 * (events.js) via the optional `bus` argument; the reducer emits
 * `node-available`, `node-unlocked`, `branch-completed`, `climax-met`
 * when caller passes a bus.
 */

import branchesData from "../data/branches.json" with { type: "json" };
import { EVENTS } from "./events.js";

// ─── Static tree index (computed once) ────────────────────────────

/**
 * Map<nodeId, {
 *   id, name, description, prerequisites, unlocks, product,
 *   branchId, branchKind, branchName
 * }>
 */
const NODE_INDEX = new Map();

/** Map<branchId, { id, name, kind, nodeIds: string[] }> */
const BRANCH_INDEX = new Map();

for (const branch of branchesData) {
  BRANCH_INDEX.set(branch.id, {
    id: branch.id,
    name: branch.name,
    kind: branch.kind,
    nodeIds: branch.nodes.map((n) => n.id),
  });
  for (const node of branch.nodes) {
    NODE_INDEX.set(node.id, {
      id: node.id,
      name: node.name,
      description: node.description,
      prerequisites: [...(node.prerequisites ?? [])],
      unlocks: node.unlocks ?? {},
      product: node.product,
      branchId: branch.id,
      branchKind: branch.kind,
      branchName: branch.name,
    });
  }
}

export function getAllNodes() {
  return [...NODE_INDEX.values()];
}

export function getNode(nodeId) {
  return NODE_INDEX.get(nodeId);
}

export function getAllBranches() {
  return [...BRANCH_INDEX.values()];
}

export function getBranch(branchId) {
  return BRANCH_INDEX.get(branchId);
}

// ─── State construction ───────────────────────────────────────────

/**
 * Create a fresh tree state. Every node starts locked except those
 * whose prerequisite list is empty (the Root R1 in BC's tree).
 */
export function createTreeState() {
  const state = {
    unlocked: new Set(),
    available: new Set(),
    locked: new Set(NODE_INDEX.keys()),
  };
  recomputeAvailability(state);
  return state;
}

/**
 * Recompute `available` and `locked` sets based on `unlocked`.
 * A node that's already unlocked stays out of both; otherwise it
 * lands in `available` if every prereq is unlocked, else `locked`.
 */
function recomputeAvailability(state) {
  state.available.clear();
  state.locked.clear();
  for (const node of NODE_INDEX.values()) {
    if (state.unlocked.has(node.id)) continue;
    const allPrereqsUnlocked = node.prerequisites.every((p) =>
      state.unlocked.has(p)
    );
    if (allPrereqsUnlocked) state.available.add(node.id);
    else state.locked.add(node.id);
  }
}

// ─── Queries ──────────────────────────────────────────────────────

export function isUnlocked(state, nodeId) {
  return state.unlocked.has(nodeId);
}

export function isAvailable(state, nodeId) {
  if (state.unlocked.has(nodeId)) return false;
  const node = NODE_INDEX.get(nodeId);
  if (!node) return false;
  return node.prerequisites.every((p) => state.unlocked.has(p));
}

export function isLocked(state, nodeId) {
  return state.locked.has(nodeId);
}

// ─── Mutations ────────────────────────────────────────────────────

/**
 * Unlock a node. Caller must have verified `isAvailable` — throws
 * otherwise to catch bugs loudly. If a bus is passed, emits:
 *   node-unlocked     for the node itself
 *   node-available    for each node newly flipped to available
 *   branch-completed  if this completes the node's branch
 *   climax-met        if the node is in the climax branch
 */
export function unlock(state, nodeId, bus = null) {
  const node = NODE_INDEX.get(nodeId);
  if (!node) throw new Error(`tree-state: unknown node '${nodeId}'`);
  if (state.unlocked.has(nodeId)) return state; // idempotent
  if (!isAvailable(state, nodeId)) {
    const missing = node.prerequisites.filter((p) => !state.unlocked.has(p));
    throw new Error(
      `tree-state: cannot unlock '${nodeId}' — missing prerequisites: ${missing.join(", ")}`
    );
  }

  const priorAvailable = new Set(state.available);

  state.unlocked.add(nodeId);
  recomputeAvailability(state);

  if (bus) {
    bus.emit(EVENTS.NODE_UNLOCKED, { nodeId });
    for (const id of state.available) {
      if (!priorAvailable.has(id)) bus.emit(EVENTS.NODE_AVAILABLE, { nodeId: id });
    }
    const branch = BRANCH_INDEX.get(node.branchId);
    if (branch && branch.nodeIds.every((nid) => state.unlocked.has(nid))) {
      bus.emit(EVENTS.BRANCH_COMPLETED, { branchId: branch.id });
    }
    if (node.branchKind === "climax") {
      bus.emit(EVENTS.CLIMAX_MET, { nodeId });
    }
  }

  return state;
}

/**
 * Semantically distinct from `unlock` — this is the hook that sim
 * systems (compost, fairies, biomass thresholds) call when they have
 * *just observed* a completion event. For the MVP it resolves to
 * `unlock`, but keeping a separate name means the sim doesn't have
 * to know about prereq checking; it can be routed through requirements
 * later.
 */
export function markCompleted(state, nodeId, bus = null) {
  return unlock(state, nodeId, bus);
}

// ─── Save/Load ────────────────────────────────────────────────────

export function serialize(state) {
  return {
    version: 1,
    unlocked: [...state.unlocked],
  };
}

export function hydrate(state, saved) {
  if (!saved || !Array.isArray(saved.unlocked)) {
    throw new Error("tree-state: hydrate() requires { unlocked: [] }");
  }
  state.unlocked.clear();
  for (const id of saved.unlocked) {
    if (NODE_INDEX.has(id)) state.unlocked.add(id);
  }
  recomputeAvailability(state);
  return state;
}

// ─── Introspection helpers (used by UI + tests) ──────────────────

/**
 * For each node, expose its static def + current classification.
 * Returns an array suitable for rendering the parchment panel.
 */
export function snapshot(state) {
  return [...NODE_INDEX.values()].map((n) => ({
    ...n,
    status: state.unlocked.has(n.id)
      ? "unlocked"
      : state.available.has(n.id)
      ? "available"
      : "locked",
  }));
}
