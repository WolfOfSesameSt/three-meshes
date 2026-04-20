/**
 * Fairy Permaculture — animal-manager (C4.2 + C4.3).
 *
 * Owns the list of placed animals + hives + livestock buildings, and
 * drives their per-day tick. Designed so the parallel plant-manager
 * agent is fully optional at load time; tests can still cover
 * animal/hive dynamics without a plant sim present.
 *
 * Per-day tick complexity:
 *   • Animals: O(animals). Each animal does constant work.
 *   • Hives:   O(hives). Each hive caches its plant-scan per day;
 *              we rely on plantManager.findFloweringPlantsWithin to
 *              be at worst O(nearbyPlants), not O(allPlants).
 *
 * Public API (keep stable — UI + tests depend on it):
 *   createAnimalManager({ plantManager })
 *   placeAnimal(species, x, y)
 *   placeHive(type, x, y)
 *   placeCoop(x, y)
 *   placeGoatShed(x, y)
 *   tick(day, env)
 *   milk(x, y) -> liters
 *   collectEgg(x, y) -> count
 *   harvestHoney(hiveUid?) -> kg
 *   findReady() -> instances[]       (milk/egg ready OR honey ≥ 1 kg)
 *   applyPredatorEvent(event)        (drops animals per event.effects)
 */

import animalsData from '../data/animals.json' with { type: 'json' };
import { createAnimal } from './animal-instance.js';
import {
  createHive,
  tickHive,
  harvestHoney as harvestHoneyFromHive,
} from './hive.js';
import {
  createCoop,
  createGoatShed,
  applyPredatorDamage,
} from './coop.js';
import * as fairyFood from './fairy-food.js';

// ─── Species lookup ─────────────────────────────────────────────

const SPECIES = new Map();
for (const a of animalsData) SPECIES.set(a.id, a);

/**
 * Extract "per-day rate" for a given product id. Returns 0 if the
 * species doesn't produce it.
 */
function rateOf(speciesId, productId) {
  const def = SPECIES.get(speciesId);
  if (!def) return 0;
  const p = def.products.find((pp) => pp.id === productId);
  return p ? p.rate_per_day : 0;
}

// ─── Manager ────────────────────────────────────────────────────

/**
 * @param {object} [opts]
 * @param {any}    [opts.plantManager]  defensive import target —
 *                                      may be null / missing methods.
 */
export function createAnimalManager(opts = {}) {
  const manager = {
    plantManager: opts.plantManager ?? null,
    animals: [],         // AnimalInstance[]
    hives: [],           // hive[]
    buildings: [],       // coop[] + shed[]
    day: 0,
  };

  // ─── Placement ────────────────────────────────────────────

  manager.placeAnimal = function placeAnimal(species, x, y) {
    if (!SPECIES.has(species)) {
      throw new Error(`animal-manager: unknown species '${species}'`);
    }
    const a = createAnimal(species, x, y);
    manager.animals.push(a);
    return a;
  };

  manager.placeHive = function placeHive(type, x, y) {
    const h = createHive(type, x, y);
    manager.hives.push(h);
    return h;
  };

  manager.placeCoop = function placeCoop(x, y) {
    const c = createCoop(x, y);
    manager.buildings.push(c);
    return c;
  };

  manager.placeGoatShed = function placeGoatShed(x, y) {
    const s = createGoatShed(x, y);
    manager.buildings.push(s);
    return s;
  };

  // ─── Per-day tick ─────────────────────────────────────────

  manager.tick = function tick(day, env = {}) {
    manager.day = day;

    // ── Animals: age, hunger, product accrual ────────────────
    for (const a of manager.animals) {
      if (a.health <= 0) continue;
      a.age += 1;

      // Hunger rises; housed animals rise slower.
      const building = a.buildingRef ? findBuildingByUid(manager, a.buildingRef) : null;
      const hungerGain = 0.05 * (building ? building.hungerResistance : 1.0);
      a.hunger = Math.min(1, a.hunger + hungerGain);

      // Health drops if starving, recovers otherwise.
      if (a.hunger > 0.9) {
        a.health = Math.max(0, a.health - 0.02);
      } else {
        a.health = Math.min(1, a.health + 0.01);
      }

      // Product accrual — scaled by health (a sick animal produces less).
      const def = SPECIES.get(a.id);
      if (!def) continue;
      for (const p of def.products) {
        const qty = p.rate_per_day * a.health;
        a.productStock[p.id] = (a.productStock[p.id] ?? 0) + qty;
      }
      if (a.id === 'chicken-layer' || a.id === 'duck') {
        a.lastEggCount = a.productStock.egg ?? 0;
      }
    }

    // ── Hives: colony + honey ─────────────────────────────────
    for (const h of manager.hives) {
      tickHive(h, day, manager.plantManager);
    }
  };

  // ─── Harvest actions ──────────────────────────────────────

  /**
   * Milk the goat/cow closest to (x,y). Adds liters to
   * `fairyFood.milk` as a side effect. Returns liters harvested.
   */
  manager.milk = function milk(x, y) {
    const target = nearestOf(manager.animals, x, y, (a) =>
      ['dairy-goat', 'dexter-cow'].includes(a.id) && a.health > 0
    );
    if (!target) return 0;
    const liters = target.productStock.milk ?? 0;
    target.productStock.milk = 0;
    target.lastMilked = manager.day;
    if (liters > 0) fairyFood.add('milk', liters);
    return liters;
  };

  /**
   * Collect eggs from the nearest chicken/duck. Eggs are NOT fairy
   * food per the design; they don't push into the fairyFood counter.
   */
  manager.collectEgg = function collectEgg(x, y) {
    const target = nearestOf(manager.animals, x, y, (a) =>
      ['chicken-layer', 'duck'].includes(a.id) && a.health > 0
    );
    if (!target) return 0;
    const count = target.productStock.egg ?? 0;
    target.productStock.egg = 0;
    target.lastEggCount = 0;
    return count;
  };

  /**
   * Harvest honey from a specific hive (by uid) or from the hive with
   * the most stored honey. Adds kg to `fairyFood.honey`.
   */
  manager.harvestHoney = function harvestHoney(hiveUid = null) {
    let h;
    if (hiveUid) {
      h = manager.hives.find((hh) => hh.uid === hiveUid);
    } else {
      // Pick the hive with the most stored honey.
      h = manager.hives.reduce(
        (best, cur) => (best && best.honeyStored >= cur.honeyStored ? best : cur),
        null
      );
    }
    if (!h) return 0;
    const kg = harvestHoneyFromHive(h);
    if (kg > 0) fairyFood.add('honey', kg);
    return kg;
  };

  /**
   * Animals + hives that have something worth picking up:
   *   • any animal with non-zero productStock
   *   • any hive with ≥ 1 kg honey stored
   */
  manager.findReady = function findReady() {
    const ready = [];
    for (const a of manager.animals) {
      if (a.health <= 0) continue;
      for (const v of Object.values(a.productStock)) {
        if (v > 0) {
          ready.push(a);
          break;
        }
      }
    }
    for (const h of manager.hives) {
      if (h.honeyStored >= 1.0) ready.push(h);
    }
    return ready;
  };

  /**
   * Apply a predator event (like hawk-strike). `event.effects[]` may
   * contain `{ type: 'lose-animals', params: { min, max, species } }`
   * and/or `{ type: 'damage-building', params: { amount } }` entries.
   * Buildings under canopy are immune; housed animals are protected
   * IF their housing is still intact.
   */
  manager.applyPredatorEvent = function applyPredatorEvent(event) {
    if (!event || !Array.isArray(event.effects)) return { lost: [] };
    const lost = [];

    for (const effect of event.effects) {
      if (effect.type === 'lose-animals') {
        const p = effect.params ?? {};
        const targetSpecies = new Set(p.species ?? []);
        const min = p.min ?? 1;
        const max = p.max ?? min;
        const count = min + Math.floor(Math.random() * (max - min + 1));

        // Candidates: unhoused animals of the target species, or
        // animals in a broken building.
        const candidates = manager.animals.filter((a) => {
          if (a.health <= 0) return false;
          if (targetSpecies.size && !targetSpecies.has(a.id)) return false;
          if (!a.buildingRef) return true;
          const b = findBuildingByUid(manager, a.buildingRef);
          if (!b) return true;
          // Canopy-covered coops fully protect their occupants.
          if (b.coveredByCanopy && b.durability > 0) return false;
          // Otherwise the building takes a hit; occupants are at risk
          // only if the building breaks.
          const stillProtects = applyPredatorDamage(b, 0.25);
          return !stillProtects;
        });

        for (let i = 0; i < count && candidates.length > 0; i++) {
          // Pick a random candidate, remove it, mark dead.
          const idx = Math.floor(Math.random() * candidates.length);
          const victim = candidates.splice(idx, 1)[0];
          victim.health = 0;
          lost.push(victim);
        }
      }
    }

    // Prune dead animals from the list so we don't iterate them forever.
    manager.animals = manager.animals.filter((a) => a.health > 0);
    return { lost };
  };

  return manager;
}

// ─── Helpers ─────────────────────────────────────────────────────

function findBuildingByUid(manager, uid) {
  return manager.buildings.find((b) => b.uid === uid) ?? null;
}

function nearestOf(list, x, y, pred) {
  let best = null;
  let bestDist = Infinity;
  for (const item of list) {
    if (!pred(item)) continue;
    const dx = item.x - x;
    const dy = item.y - y;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = item;
    }
  }
  return best;
}

export { rateOf as __rateOf };
