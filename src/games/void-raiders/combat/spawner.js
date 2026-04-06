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
  { time: 180, type: "scout-fighter", count: 6, interval: 8 },
  { time: 240, type: "patrol-cruiser", count: 3, interval: 10 },
  { time: 300, type: "scout-fighter", count: 8, interval: 6 },
];

const SPAWN_DISTANCE = 500; // meters from mothership

/**
 * Manages enemy spawning and escalation.
 */
export class EnemySpawner {
  constructor() {
    this.enemies = [];
    this.missionTimer = 0;
    this._spawnTimer = 0;
    this._currentWave = 0;
  }

  /**
   * Update spawner — advance timer, spawn new enemies.
   * @param {number} dt
   * @param {object} mothershipPos — { x, y, z }
   */
  update(dt, mothershipPos) {
    this.missionTimer += dt;
    this._spawnTimer += dt;

    // Find current escalation level
    let wave = null;
    for (let i = ESCALATION.length - 1; i >= 0; i--) {
      if (this.missionTimer >= ESCALATION[i].time) {
        wave = ESCALATION[i];
        break;
      }
    }

    if (!wave) return;

    // Spawn at interval
    if (this._spawnTimer >= wave.interval) {
      this._spawnTimer = 0;
      this._spawnWave(wave, mothershipPos);
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
