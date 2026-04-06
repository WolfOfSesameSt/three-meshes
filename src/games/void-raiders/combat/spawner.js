/**
 * Enemy spawner — spawns waves of enemies with escalating difficulty.
 *
 * The longer the player stays, the harder it gets.
 * Enemies spawn outside player view and converge on the mothership.
 */

import { createEnemy, isEnemyAlive, ENEMY_TYPES } from "./enemy.js";
import { getTerrainHeight } from "../realm/terrain.js";
import { VOXEL_SCALE } from "../config.js";

// Escalation timeline (seconds → what spawns)
const ESCALATION = [
  { time: 10, type: "scout-fighter", count: 2, interval: 15 },
  { time: 30, type: "scout-fighter", count: 3, interval: 12 },
  { time: 60, type: "patrol-cruiser", count: 1, interval: 20 },
  { time: 90, type: "scout-fighter", count: 4, interval: 10 },
  { time: 120, type: "patrol-cruiser", count: 2, interval: 15 },
  { time: 120, type: "interceptor", count: 2, interval: 12 },
  { time: 180, type: "scout-fighter", count: 6, interval: 8 },
  { time: 180, type: "bomber", count: 1, interval: 25 },
  { time: 240, type: "patrol-cruiser", count: 3, interval: 10 },
  { time: 240, type: "shielded-cruiser", count: 1, interval: 20 },
  { time: 300, type: "scout-fighter", count: 8, interval: 6 },
  { time: 300, type: "minelayer", count: 2, interval: 18 },
];

const SPAWN_DISTANCE = 500; // meters from mothership

/**
 * Manages enemy spawning and escalation.
 */
export class EnemySpawner {
  constructor() {
    this.enemies = [];
    this.missionTimer = 0;
    this._spawnTimers = {}; // per-wave-index timers
    this._currentWave = 0;
  }

  /**
   * Update spawner — advance timer, spawn new enemies.
   * Multiple wave entries can be active simultaneously.
   * @param {number} dt
   * @param {object} mothershipPos — { x, y, z }
   */
  update(dt, mothershipPos) {
    this.missionTimer += dt;

    // Find all active escalation entries
    for (let i = 0; i < ESCALATION.length; i++) {
      const wave = ESCALATION[i];
      if (this.missionTimer < wave.time) continue;

      // Only the highest-time entry per type is active
      // (later entries for the same type supersede earlier ones)
      let superseded = false;
      for (let j = i + 1; j < ESCALATION.length; j++) {
        if (ESCALATION[j].type === wave.type && this.missionTimer >= ESCALATION[j].time) {
          superseded = true;
          break;
        }
      }
      if (superseded) continue;

      // Per-wave spawn timer
      if (this._spawnTimers[i] === undefined) this._spawnTimers[i] = wave.interval; // spawn immediately on first tick
      this._spawnTimers[i] += dt;

      if (this._spawnTimers[i] >= wave.interval) {
        this._spawnTimers[i] = 0;
        this._spawnWave(wave, mothershipPos);
      }
    }
  }

  /**
   * Spawn a wave of enemies around the mothership.
   */
  _spawnWave(wave, mothershipPos) {
    for (let i = 0; i < wave.count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = SPAWN_DISTANCE + Math.random() * 200;
      const x = mothershipPos.x + Math.cos(angle) * dist;
      const z = mothershipPos.z + Math.sin(angle) * dist;

      let y;
      if (ENEMY_TYPES[wave.type].category === "ship") {
        y = mothershipPos.y + (Math.random() - 0.5) * 30;
      } else {
        // Ground unit — place on terrain
        y = getTerrainHeight(x, z) * VOXEL_SCALE + 5;
      }

      const enemy = createEnemy(wave.type, { x, y, z });
      this.enemies.push(enemy);
    }
  }

  /**
   * Get alive enemies.
   */
  getAlive() {
    return this.enemies.filter((e) => isEnemyAlive(e));
  }

  /**
   * Clean up dead enemies periodically.
   */
  cleanup() {
    this.enemies = this.enemies.filter((e) => isEnemyAlive(e));
  }

  /**
   * Get current threat level (0-1) based on mission timer.
   */
  getThreatLevel() {
    return Math.min(1, this.missionTimer / 300);
  }

  dispose() {
    this.enemies = [];
  }
}
