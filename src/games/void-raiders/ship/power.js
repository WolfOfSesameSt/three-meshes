/**
 * Power allocation system — distributes mothership energy between systems.
 *
 * The player allocates a percentage of energy production to each system.
 * Shield regen rate is a direct function of energy allocated to shields.
 * Weapon fire rate is affected by weapon energy allocation.
 *
 * Allocation is 0-100% per system, total must sum to 100%.
 * Default: 40% shields, 40% weapons, 20% replication.
 */

export const POWER_SYSTEMS = {
  shields: { id: "shields", label: "Shield Regen", default: 40 },
  weapons: { id: "weapons", label: "Weapons", default: 40 },
  replication: { id: "replication", label: "Replication", default: 20 },
};

/**
 * Power allocation state.
 */
export class PowerAllocator {
  constructor() {
    this.allocation = {
      shields: POWER_SYSTEMS.shields.default,
      weapons: POWER_SYSTEMS.weapons.default,
      replication: POWER_SYSTEMS.replication.default,
    };
  }

  /**
   * Set allocation for a system (0-100). Others scale proportionally.
   * @param {string} system — "shields" | "weapons" | "replication"
   * @param {number} percent — 0-100
   */
  setAllocation(system, percent) {
    percent = Math.max(0, Math.min(100, percent));
    const others = Object.keys(this.allocation).filter(k => k !== system);
    const oldOtherTotal = others.reduce((sum, k) => sum + this.allocation[k], 0);

    this.allocation[system] = percent;
    const remaining = 100 - percent;

    if (oldOtherTotal > 0) {
      for (const k of others) {
        this.allocation[k] = Math.round((this.allocation[k] / oldOtherTotal) * remaining);
      }
    } else {
      // Distribute equally
      for (const k of others) {
        this.allocation[k] = Math.round(remaining / others.length);
      }
    }

    // Fix rounding
    const total = Object.values(this.allocation).reduce((a, b) => a + b, 0);
    if (total !== 100) {
      this.allocation[others[0]] += 100 - total;
    }
  }

  /**
   * Get the fraction (0-1) of energy allocated to a system.
   */
  getFraction(system) {
    return (this.allocation[system] ?? 0) / 100;
  }

  /**
   * Calculate shield regen rate based on energy allocation.
   * @param {number} energyProduction — base production rate
   * @returns {number} shields per second
   */
  getShieldRegenRate(energyProduction) {
    // Shield regen scales linearly with allocated energy
    // At 100% allocation of 10 energy production → 5 shields/s
    // At 40% allocation of 10 energy production → 2 shields/s
    return energyProduction * this.getFraction("shields") * 0.5;
  }

  /**
   * Calculate drone shield regen rate (drones get a fraction of mothership shield energy).
   * @param {number} energyProduction
   * @param {number} droneCount — alive drones with shields
   * @returns {number} shields per second per drone
   */
  getDroneShieldRegenRate(energyProduction, droneCount) {
    if (droneCount <= 0) return 0;
    // 30% of shield energy is distributed to drone shields
    const dronePool = energyProduction * this.getFraction("shields") * 0.3;
    return (dronePool / droneCount) * 0.5;
  }
}
