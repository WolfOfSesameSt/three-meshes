/**
 * Mothership weapon system — auto-fires at enemies based on firing routines.
 *
 * The mothership has weapon slots. Each weapon targets and fires independently.
 * For V1: one default pulse weapon that targets the nearest enemy.
 */

const DEFAULT_WEAPON = {
  id: "pulse-laser-mk1",
  damage: 15,
  range: 300,
  fireRate: 1.5, // shots per second
  energyCost: 2,
  targetPriority: "nearest",
};

/**
 * Mothership weapon controller.
 */
export class WeaponSystem {
  constructor() {
    this.weapons = [{ ...DEFAULT_WEAPON, cooldown: 0 }];
    this.lastFiredAt = null; // for visual feedback
  }

  /**
   * Update weapons — find targets and fire.
   * @param {object} mothershipPos — { x, y, z }
   * @param {Array} enemies — alive enemies
   * @param {object} systems — mothership systems { energy, ... }
   * @param {number} dt
   * @returns {Array} hits — [{ enemy, damage }] for visual feedback
   */
  update(mothershipPos, enemies, systems, dt) {
    const hits = [];

    for (const weapon of this.weapons) {
      weapon.cooldown = Math.max(0, weapon.cooldown - dt);
      if (weapon.cooldown > 0) continue;
      if (systems.energy < weapon.energyCost) continue;

      // Find target
      const target = this._findTarget(weapon, mothershipPos, enemies);
      if (!target) continue;

      // Fire
      target.stats.hull = Math.max(0, target.stats.hull - weapon.damage);
      if (target.stats.hull <= 0) {
        target.state = "dead";
      }
      systems.energy -= weapon.energyCost;
      weapon.cooldown = 1.0 / weapon.fireRate;

      this.lastFiredAt = { ...target.position };
      hits.push({ enemy: target, damage: weapon.damage });
    }

    return hits;
  }

  _findTarget(weapon, shipPos, enemies) {
    let best = null;
    let bestDist = Infinity;

    for (const enemy of enemies) {
      if (enemy.stats.hull <= 0) continue;
      const d = dist3(shipPos, enemy.position);
      if (d > weapon.range) continue;
      if (d < bestDist) {
        bestDist = d;
        best = enemy;
      }
    }

    return best;
  }
}

function dist3(a, b) {
  const dx = (a.x ?? 0) - (b.x ?? 0);
  const dy = (a.y ?? 0) - (b.y ?? 0);
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
