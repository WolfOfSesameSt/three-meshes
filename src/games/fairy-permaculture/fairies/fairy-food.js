/**
 * Fairy Permaculture — central fairy-food counters.
 *
 * The three foods that drive fairy spawning: honey, milk, fruit.
 * Every product-harvesting system (hives, goats, berry bushes) calls
 * `add()` here; the fairy-population module reads these to decide
 * when to spawn a new fairy.
 *
 * Keeping this in one place guarantees that balancing a single
 * number (`food_unit_cost_per_fairy`) tunes the whole snowball.
 */

const _store = { honey: 0, milk: 0, fruit: 0 };
const _listeners = new Set();

export const fairyFood = new Proxy(_store, {
  set() {
    throw new Error("use add() / reset() — fairyFood is read-only");
  },
});

export function add(kind, amount) {
  if (!(kind in _store)) throw new Error(`unknown fairy-food kind: ${kind}`);
  if (!Number.isFinite(amount) || amount <= 0) return;
  _store[kind] += amount;
  for (const cb of _listeners) cb(kind, amount, { ..._store });
}

export function spend(kind, amount) {
  if (!(kind in _store)) throw new Error(`unknown fairy-food kind: ${kind}`);
  if (_store[kind] < amount) return false;
  _store[kind] -= amount;
  return true;
}

/** Total across all three kinds. */
export function total() {
  return _store.honey + _store.milk + _store.fruit;
}

export function snapshot() {
  return { ..._store };
}

export function reset(values = { honey: 0, milk: 0, fruit: 0 }, { clearListeners = true } = {}) {
  _store.honey = values.honey ?? 0;
  _store.milk = values.milk ?? 0;
  _store.fruit = values.fruit ?? 0;
  if (clearListeners) _listeners.clear();
}

/** Subscribe to change notifications. Returns unsubscribe. */
export function onChange(cb) {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}
