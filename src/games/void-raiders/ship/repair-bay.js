/**
 * Repair Bay — mothership sub-system that heals docked drones.
 *
 * Gameplay model (from GDD):
 *   - Drones whose swarm routine uses the "damaged" retreat return here
 *     when their hull or shields fall below the configured threshold.
 *   - Shield restoration costs mothership energy. The ship diverts
 *     capacitor power directly to the drone's shields.
 *   - Hull repair uses the replicator to transmute raw materials from
 *     the tesseract into nano-repair paste. The cost is measured in
 *     raw material units per hull point, and materials are drawn from
 *     whichever of `transmuteFromMaterials` is available (in order).
 *   - Only `slots` drones can be repaired concurrently. Extras queue.
 *
 * All tunable values live on `this.config`. `applyResearchModifiers()`
 * rebuilds the config at mission start based on unlocked research.
 *
 * Metrics (telemetry) are accumulated on `this.metrics` for the HUD
 * and for QA tests to verify the routine is functioning as intended.
 */

/**
 * Baseline repair-bay tuning. Changed by research + upgrades.
 *
 * Rates are per-second. Costs are per-point of restoration.
 */
export const DEFAULT_REPAIR_CONFIG = {
  slots: 1,                        // concurrent repairs
  hullRepairRate: 8,               // hull HP / second
  shieldRepairRate: 14,            // shield HP / second
  energyCostPerShieldPoint: 0.4,   // mothership energy drain per shield point
  materialCostPerHullPoint: 0.08,  // raw material units per hull point
  // Transmutation source list — bay pulls raw materials in this priority
  // order and counts each unit as "1 nano-paste" for repair purposes.
  transmuteFromMaterials: [
    "iron-ore",
    "titanium-ore",
    "silicon-dust",
    "rare-earth",
    "salvage-parts",
  ],
};

/**
 * Build a fresh metrics bucket. One new object per mission so counters
 * don't bleed across raids.
 */
export function makeRepairMetrics() {
  return {
    admitted: 0,
    completed: 0,
    ejectedNoHost: 0,
    dronesLostDuringRepair: 0,
    totalEnergySpent: 0,
    totalMaterialsSpent: 0,
    totalHullRestored: 0,
    totalShieldsRestored: 0,
    totalRepairTimeSec: 0,
    longestRepairSec: 0,
  };
}

export class RepairBay {
  /**
   * @param {object} mothership — reference back to the ship for energy,
   *   tesseract, and alive checks. Safe for mothership to be set later.
   */
  constructor(mothership = null) {
    this.mothership = mothership;
    this.config = { ...DEFAULT_REPAIR_CONFIG };
    this.queue = [];    // drones waiting for an open slot
    this.active = [];   // drones currently in a repair slot
    this.metrics = makeRepairMetrics();
  }

  /**
   * Admit a drone for repair. Places it in `active` if a slot is free,
   * otherwise appends to `queue`. Returns true on success.
   */
  admit(drone) {
    if (!drone) return false;
    if (drone.stats?.hull <= 0 || drone.state === "destroyed") return false;
    if (this.active.includes(drone) || this.queue.includes(drone)) return false;

    drone.state = "in-repair";
    drone._repairElapsed = 0;
    this.metrics.admitted += 1;

    if (this.active.length < this.config.slots) {
      this.active.push(drone);
    } else {
      this.queue.push(drone);
    }
    return true;
  }

  /**
   * Eject every drone from the bay (mothership destroyed, mission cleanup).
   * Drones resume "active" state and will re-evaluate routines next tick.
   */
  ejectAll() {
    const total = this.active.length + this.queue.length;
    for (const d of this.active) {
      if (d) d.state = "active";
    }
    for (const d of this.queue) {
      if (d) d.state = "active";
    }
    this.active.length = 0;
    this.queue.length = 0;
    this.metrics.ejectedNoHost += total;
  }

  /**
   * Per-frame repair tick. Restores hull + shields on each active drone,
   * draws energy from the mothership and raw materials from the tesseract,
   * and promotes the next queued drone when a slot opens.
   *
   * @param {number} dt — delta seconds
   */
  tick(dt) {
    // Host dead? Drop everything.
    if (!this.mothership || this.mothership.alive === false) {
      if (this.active.length || this.queue.length) this.ejectAll();
      return;
    }

    // Clean up drones that died or otherwise left the slot (shouldn't
    // normally happen — their hull is increasing — but a stray hit from
    // an enemy projectile while docked is possible).
    this._removeDeadDrones(this.active);
    this._removeDeadDrones(this.queue);

    // Repair each active drone
    for (let i = this.active.length - 1; i >= 0; i--) {
      const drone = this.active[i];
      drone._repairElapsed = (drone._repairElapsed || 0) + dt;

      this._repairHull(drone, dt);
      this._repairShields(drone, dt);

      const hullFull = drone.stats.hull >= drone.stats.hullMax;
      const shieldsFull =
        drone.stats.shieldsMax <= 0 ||
        drone.stats.shields >= drone.stats.shieldsMax;

      if (hullFull && shieldsFull) {
        this._completeRepair(drone);
        this.active.splice(i, 1);
      }
    }

    // Promote queued drones into vacated slots
    while (this.active.length < this.config.slots && this.queue.length > 0) {
      this.active.push(this.queue.shift());
    }
  }

  // ── internals ──────────────────────────────────────────────

  _removeDeadDrones(list) {
    for (let i = list.length - 1; i >= 0; i--) {
      const d = list[i];
      if (!d || d.stats.hull <= 0 || d.state === "destroyed") {
        list.splice(i, 1);
        this.metrics.dronesLostDuringRepair += 1;
      }
    }
  }

  _repairHull(drone, dt) {
    if (drone.stats.hull >= drone.stats.hullMax) return;
    const needed = drone.stats.hullMax - drone.stats.hull;
    const wantedHull = Math.min(this.config.hullRepairRate * dt, needed);
    if (wantedHull <= 0) return;

    const materialsNeeded = wantedHull * this.config.materialCostPerHullPoint;
    const materialsDrawn = this._drawMaterials(materialsNeeded);
    if (materialsDrawn <= 0) return;

    // Pro-rate hull restoration by whatever materials we actually got
    const actualHull =
      this.config.materialCostPerHullPoint > 0
        ? materialsDrawn / this.config.materialCostPerHullPoint
        : wantedHull;

    drone.stats.hull = Math.min(drone.stats.hullMax, drone.stats.hull + actualHull);
    this.metrics.totalHullRestored += actualHull;
    this.metrics.totalMaterialsSpent += materialsDrawn;
  }

  _repairShields(drone, dt) {
    if (drone.stats.shieldsMax <= 0) return;
    if (drone.stats.shields >= drone.stats.shieldsMax) return;

    const needed = drone.stats.shieldsMax - drone.stats.shields;
    const wantedShields = Math.min(this.config.shieldRepairRate * dt, needed);
    if (wantedShields <= 0) return;

    const energyNeeded = wantedShields * this.config.energyCostPerShieldPoint;
    const available = Math.max(0, this.mothership.systems?.energy ?? 0);
    if (available <= 0) return;

    const actualEnergy = Math.min(energyNeeded, available);
    const actualShields =
      this.config.energyCostPerShieldPoint > 0
        ? actualEnergy / this.config.energyCostPerShieldPoint
        : wantedShields;

    drone.stats.shields = Math.min(
      drone.stats.shieldsMax,
      drone.stats.shields + actualShields
    );
    this.mothership.systems.energy -= actualEnergy;
    this.metrics.totalShieldsRestored += actualShields;
    this.metrics.totalEnergySpent += actualEnergy;
  }

  _completeRepair(drone) {
    this.metrics.completed += 1;
    const elapsed = drone._repairElapsed || 0;
    this.metrics.totalRepairTimeSec += elapsed;
    if (elapsed > this.metrics.longestRepairSec) {
      this.metrics.longestRepairSec = elapsed;
    }
    drone.state = "active";
    drone._repairElapsed = 0;
    drone._retreatReason = null;

    // Eject the drone at a point outside the mothership so it doesn't
    // reappear mid-hull. FleetManager will take over motion next tick.
    if (this.mothership?.position) {
      const p = this.mothership.position;
      drone.position.x = p.x;
      drone.position.y = (p.y ?? 0) - 10;
      drone.position.z = p.z;
    }
  }

  /**
   * Draw `needed` raw material units from the tesseract, preferring the
   * first entries of `transmuteFromMaterials`. Returns the actual amount
   * drawn (may be < needed if the tesseract is low).
   */
  _drawMaterials(needed) {
    if (needed <= 0) return 0;
    const contents = this.mothership?.tesseract?.contents;
    if (!contents) return 0;

    let drawn = 0;
    for (const matId of this.config.transmuteFromMaterials) {
      if (drawn >= needed) break;
      const have = contents[matId] ?? 0;
      if (have <= 0) continue;
      const want = needed - drawn;
      const take = Math.min(have, want);
      contents[matId] = have - take;
      drawn += take;
    }
    return drawn;
  }

  /**
   * Rebuild config from defaults + unlocked research entries.
   * Called at mission start from main.js.
   *
   * Research tiers:
   *   repair-bay-speed       → +50 % repair rate (hull + shields)
   *   repair-bay-efficiency  → −30 % energy cost for shield restore
   *   repair-bay-replicator  → −30 % material cost for hull restore
   *   repair-bay-capacity    → +1 concurrent repair slot
   */
  applyResearchModifiers(research = {}) {
    this.config = { ...DEFAULT_REPAIR_CONFIG };
    if (research["repair-bay-speed"]) {
      this.config.hullRepairRate *= 1.5;
      this.config.shieldRepairRate *= 1.5;
    }
    if (research["repair-bay-efficiency"]) {
      this.config.energyCostPerShieldPoint *= 0.7;
    }
    if (research["repair-bay-replicator"]) {
      this.config.materialCostPerHullPoint *= 0.7;
    }
    if (research["repair-bay-capacity"]) {
      this.config.slots += 1;
    }
  }

  /** Reset queue + metrics for a new mission. */
  reset() {
    this.queue.length = 0;
    this.active.length = 0;
    this.metrics = makeRepairMetrics();
  }

  /** Read-only snapshot for HUD / QA inspection. */
  getStatus() {
    return {
      activeCount: this.active.length,
      queuedCount: this.queue.length,
      slots: this.config.slots,
      metrics: { ...this.metrics },
      config: { ...this.config },
    };
  }
}
