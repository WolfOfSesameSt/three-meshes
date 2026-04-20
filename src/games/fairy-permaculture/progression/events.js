/**
 * Fairy Permaculture — progression event bus.
 *
 * A tiny pub/sub bus for tree-state transitions. Keeps coupling low
 * between the pure state machine (tree-state.js) and the reactors
 * (UI panel, sim hooks, juice/particles). Subscribers can listen for:
 *
 *   - "node-available"     { nodeId }     fires when a locked node flips to available
 *   - "node-unlocked"      { nodeId }     fires when a node is unlocked
 *   - "branch-completed"   { branchId }   fires when every node in a branch is unlocked
 *   - "climax-met"         { nodeId }     fires when a climax node is unlocked
 *
 * Each `subscribe` returns an unsubscribe fn; `createEventBus()` is
 * the sole entry point. No globals; callers own the bus instance.
 */

export function createEventBus() {
  const listeners = new Map(); // event -> Set<cb>

  function subscribe(event, cb) {
    if (typeof cb !== "function") {
      throw new Error(`event-bus: subscribe(${event}) requires a function`);
    }
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(cb);
    return () => {
      const set = listeners.get(event);
      if (!set) return;
      set.delete(cb);
      if (set.size === 0) listeners.delete(event);
    };
  }

  function emit(event, payload) {
    const set = listeners.get(event);
    if (!set) return;
    // Copy to a local array so subscribers that unsubscribe during
    // emission don't mutate the iteration.
    for (const cb of [...set]) cb(payload);
  }

  function clear() {
    listeners.clear();
  }

  function listenerCount(event) {
    const set = listeners.get(event);
    return set ? set.size : 0;
  }

  return { subscribe, emit, clear, listenerCount };
}

export const EVENTS = Object.freeze({
  NODE_AVAILABLE: "node-available",
  NODE_UNLOCKED: "node-unlocked",
  BRANCH_COMPLETED: "branch-completed",
  CLIMAX_MET: "climax-met",
});
