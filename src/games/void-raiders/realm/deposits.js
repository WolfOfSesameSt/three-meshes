/**
 * Resource deposits — mineable nodes scattered across the realm.
 *
 * Deposits are spawned procedurally around the mothership's route.
 * They have a type, amount, and position. Mining drones extract from them.
 * Visually rendered as glowing crystal clusters using instanced rendering.
 */

import * as THREE from "three";
import { getTerrainHeight } from "./terrain.js";
import { mulberry32 } from "../utils/noise.js";
import { VOXEL_SCALE } from "../config.js";

const DEPOSIT_TYPES = {
  "iron-ore": { color: 0x88aacc, amount: [200, 600], weight: 5 },
  "crystal-shard": { color: 0xaa66dd, amount: [100, 300], weight: 3 },
  "plasma-core": { color: 0x44ddff, amount: [50, 150], weight: 1 },
  "organic-matter": { color: 0x66cc44, amount: [150, 400], weight: 2 },
};

const DEPOSIT_VISUAL_SCALE = 5;

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

/**
 * Manages resource deposits in the realm.
 */
export class DepositManager {
  constructor(scene, seed = 42) {
    this.scene = scene;
    this.deposits = [];
    this.rng = mulberry32(seed);

    // Instanced mesh for deposit crystals
    const geo = new THREE.OctahedronGeometry(DEPOSIT_VISUAL_SCALE, 0);
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.2,
      metalness: 0.8,
      flatShading: true,
      emissive: 0x444444,
      emissiveIntensity: 0.5,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, 200);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  /**
   * Spawn deposits along a route path.
   * @param {Array<{x: number, z: number}>} route — mothership route waypoints
   * @param {number} count — number of deposits to scatter
   */
  spawnAlongRoute(route, count = 30) {
    const typeKeys = Object.keys(DEPOSIT_TYPES);

    for (let i = 0; i < count; i++) {
      // Bias early deposits toward the start of the route for faster first-contact
      const routeIdx = Math.floor(Math.pow(this.rng(), 1.5) * route.length);
      const waypoint = route[routeIdx];
      const spread = 150;
      const x = waypoint.x + (this.rng() - 0.5) * spread * 2;
      const z = waypoint.z + (this.rng() - 0.5) * spread * 2;

      // Weighted random type selection
      const totalWeight = Object.values(DEPOSIT_TYPES).reduce((s, t) => s + t.weight, 0);
      let roll = this.rng() * totalWeight;
      let selectedType = typeKeys[0];
      for (const key of typeKeys) {
        roll -= DEPOSIT_TYPES[key].weight;
        if (roll <= 0) {
          selectedType = key;
          break;
        }
      }

      const typeDef = DEPOSIT_TYPES[selectedType];
      const [minAmt, maxAmt] = typeDef.amount;
      const amount = Math.floor(minAmt + this.rng() * (maxAmt - minAmt));

      const terrainY = getTerrainHeight(x, z) * VOXEL_SCALE;

      this.deposits.push({
        id: `deposit-${i}`,
        resourceType: selectedType,
        amount,
        maxAmount: amount,
        position: { x, y: terrainY + DEPOSIT_VISUAL_SCALE, z },
        color: typeDef.color,
        depleted: false,
      });
    }

    this._updateInstances();
  }

  /**
   * Update visual instances to reflect current deposit state.
   * Call after deposits are mined or spawned.
   */
  _updateInstances() {
    let idx = 0;
    for (const dep of this.deposits) {
      if (dep.depleted) continue;

      // Scale down as deposit is mined
      const pct = dep.amount / dep.maxAmount;
      const scale = 0.3 + pct * 0.7;

      _dummy.position.set(dep.position.x, dep.position.y, dep.position.z);
      _dummy.rotation.set(dep.position.x * 0.1, dep.position.z * 0.1, 0); // unique tilt per deposit
      _dummy.scale.setScalar(scale);
      _dummy.updateMatrix();
      this.mesh.setMatrixAt(idx, _dummy.matrix);

      _color.setHex(dep.color);
      // Dim color as depleted
      if (pct < 0.3) {
        _color.multiplyScalar(0.5 + pct);
      }
      this.mesh.setColorAt(idx, _color);

      idx++;
    }

    this.mesh.count = idx;
    if (idx > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
  }

  /**
   * Per-frame update — check for depleted deposits and update visuals.
   */
  update() {
    let dirty = false;
    for (const dep of this.deposits) {
      if (!dep.depleted && dep.amount <= 0) {
        dep.depleted = true;
        dirty = true;
      }
    }
    if (dirty) {
      this._updateInstances();
    }
  }

  /**
   * Get active (non-depleted) deposits.
   */
  getActive() {
    return this.deposits.filter((d) => !d.depleted);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.scene.remove(this.mesh);
    this.deposits = [];
  }
}
