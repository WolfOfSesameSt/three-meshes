/**
 * Fairy Permaculture — plant manager (C3.1 / C4.1).
 *
 * Owns every planted plant on the map. Exposes:
 *
 *   plantSeed(speciesId, tileX, tileY)      — place a new PlantInstance
 *   tick(day, env, soilField)               — advance all plants one day
 *   harvest(tileX, tileY) -> { product, amount }
 *   chopAndDrop(tileX, tileY) -> { biomassKg }
 *   findRipe() -> PlantInstance[]
 *
 * Species catalogue is sourced from data/plants.json and looked up by
 * `id`. A missing species id throws a clear error — easier to debug
 * than a silent no-op.
 *
 * The manager is deliberately small: no rendering here (see
 * plant-renderer.js), no balance tuning beyond what `plant-instance.js`
 * already applies. The per-day loop is tight (~ Float32Array-friendly)
 * so we can scale to 10 000 plants without trouble.
 */

import {
  createPlantInstance,
  tickPlant,
  isRipe,
  estimatedBiomassKg,
  isAlive,
} from "./plant-instance.js";
import { getTile } from "./soil.js";

/**
 * @param {Array<object>} plantCatalogue  plants.json contents
 */
export function createPlantManager(plantCatalogue) {
  if (!Array.isArray(plantCatalogue)) {
    throw new Error("createPlantManager: plantCatalogue must be an array");
  }
  const byId = new Map(plantCatalogue.map((p) => [p.id, p]));
  const plants = [];
  // Per-day listeners (e.g. the renderer subscribes to re-sync meshes).
  const changeListeners = new Set();

  function getSpecies(id) {
    const s = byId.get(id);
    if (!s) throw new Error(`plant-manager: unknown species '${id}'`);
    return s;
  }

  function plantSeed(speciesId, tileX, tileY, opts = {}) {
    const species = getSpecies(speciesId);
    const inst = createPlantInstance(species, tileX, tileY, opts);
    plants.push(inst);
    return inst;
  }

  function tick(day, env, soilField) {
    // Iterate in reverse so `dead` removals don't disturb indexing.
    for (let i = plants.length - 1; i >= 0; i--) {
      const p = plants[i];
      const species = getSpecies(p.id);
      const tile = getTile(soilField, p.tileX, p.tileY);
      tickPlant(p, species, tile, env);
      // Keep dead plants in the list for 1 more tick so the renderer
      // has a chance to swap them out — they get purged next day.
      if (p.stage === "dead" && p.ageDays > 1 && p._markedForRemoval) {
        plants.splice(i, 1);
      } else if (p.stage === "dead") {
        p._markedForRemoval = true;
      }
    }
    for (const cb of changeListeners) cb();
  }

  function findAt(tileX, tileY) {
    return plants.find(
      (p) => p.tileX === tileX && p.tileY === tileY && isAlive(p)
    );
  }

  function harvest(tileX, tileY) {
    const p = findAt(tileX, tileY);
    if (!p) return null;
    const species = getSpecies(p.id);
    if (!isRipe(p, species)) return null;
    const fruit = (species.products || []).find((pp) => pp.id === "fruit");
    const amount = p.ripeAmount;
    p.ripeAmount = 0;
    return {
      product: fruit ? fruit.id : "fruit",
      amount,
      speciesId: p.id,
      unit: fruit?.unit ?? "kg",
    };
  }

  function chopAndDrop(tileX, tileY) {
    const p = findAt(tileX, tileY);
    if (!p) return null;
    const species = getSpecies(p.id);
    const biomassKg = estimatedBiomassKg(p, species);
    // Chopping kills the plant — roots may regrow but treat as dead
    // for the instance record.
    p.stage = "dead";
    p.ripeAmount = 0;
    p._markedForRemoval = true;
    return { biomassKg, speciesId: p.id };
  }

  function findRipe() {
    const out = [];
    for (const p of plants) {
      const species = byId.get(p.id);
      if (!species) continue;
      if (isRipe(p, species)) out.push(p);
    }
    return out;
  }

  function all() {
    return plants;
  }

  function count() {
    return plants.length;
  }

  function onChange(cb) {
    changeListeners.add(cb);
    return () => changeListeners.delete(cb);
  }

  return {
    plantSeed,
    tick,
    harvest,
    chopAndDrop,
    findRipe,
    findAt,
    all,
    count,
    onChange,
    getSpecies,
  };
}
