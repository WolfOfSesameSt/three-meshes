/**
 * Fairy Permaculture — resource-threshold requirements (C3.2, MVP).
 *
 * Some nodes should auto-unlock only after the sim reaches a given
 * resource threshold (e.g., "R2 Pioneer Plants becomes available only
 * after total biomass ≥ N", "A4 Warré hive after HONEY pipeline has
 * seen X pollinator visits"). The full design lives in the GDD; this
 * module ships the *state machine* for it and no concrete rules yet —
 * those are registered by other systems as they come online.
 *
 * Usage:
 *
 *   const reqs = createRequirements();
 *   // Node 'r2' needs 50 biomass before it flips to available:
 *   reqs.register('r2', { resource: 'biomass', threshold: 50 });
 *
 *   // Each tick, the sim feeds current resource levels:
 *   const satisfied = reqs.feed({ biomass: 12, honey: 0, milk: 0 });
 *   // `satisfied` is an array of node ids whose thresholds just flipped
 *   // from unmet → met. Caller routes those through `markCompleted` or
 *   // merely uses them to gate UI affordances.
 *
 * Design notes:
 *   - A requirement is satisfied the first time `feed` sees a value
 *     that meets or exceeds its threshold. We don't un-satisfy if the
 *     resource later drops (progression is monotonic).
 *   - Nodes with no registered requirement are controlled purely by
 *     prerequisite edges in tree-state.js — the common case.
 *   - Comparators: only `>=` for MVP. `<=` / ranges deferred until a
 *     concrete use-case appears.
 */

export function createRequirements() {
  /** Map<nodeId, { resource, threshold, satisfied: boolean }> */
  const rules = new Map();

  function register(nodeId, { resource, threshold }) {
    if (typeof resource !== "string" || !resource.length) {
      throw new Error(`requirements.register: '${nodeId}' needs a resource key`);
    }
    if (!Number.isFinite(threshold) || threshold < 0) {
      throw new Error(
        `requirements.register: '${nodeId}' threshold must be a non-negative number`
      );
    }
    rules.set(nodeId, { resource, threshold, satisfied: false });
  }

  function unregister(nodeId) {
    rules.delete(nodeId);
  }

  function isSatisfied(nodeId) {
    const rule = rules.get(nodeId);
    if (!rule) return true; // no rule == trivially satisfied
    return rule.satisfied;
  }

  /**
   * Feed current resource levels. Returns the array of node ids whose
   * requirement *just* flipped from unmet → met on this call.
   */
  function feed(resources) {
    const flipped = [];
    for (const [nodeId, rule] of rules) {
      if (rule.satisfied) continue;
      const value = resources?.[rule.resource];
      if (Number.isFinite(value) && value >= rule.threshold) {
        rule.satisfied = true;
        flipped.push(nodeId);
      }
    }
    return flipped;
  }

  function serialize() {
    return {
      version: 1,
      satisfied: [...rules.entries()]
        .filter(([, r]) => r.satisfied)
        .map(([id]) => id),
    };
  }

  function hydrate(saved) {
    if (!saved || !Array.isArray(saved.satisfied)) return;
    for (const id of saved.satisfied) {
      const rule = rules.get(id);
      if (rule) rule.satisfied = true;
    }
  }

  function list() {
    return [...rules.entries()].map(([nodeId, r]) => ({
      nodeId,
      resource: r.resource,
      threshold: r.threshold,
      satisfied: r.satisfied,
    }));
  }

  return {
    register,
    unregister,
    isSatisfied,
    feed,
    serialize,
    hydrate,
    list,
  };
}
