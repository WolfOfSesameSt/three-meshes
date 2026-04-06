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
  // Common metals — high weight, large deposits
  "iron-ore":       { color: 0x88aacc, amount: [200, 600], weight: 5 },
  "copper-ore":     { color: 0xcc8844, amount: [200, 500], weight: 4 },
  // Tech / energy crystals
  "crystal-shard":  { color: 0xaa66dd, amount: [100, 300], weight: 3 },
  "quartz-crystal": { color: 0xccaaee, amount: [100, 250], weight: 2 },
  // Biological
  "organic-matter": { color: 0x66cc44, amount: [150, 400], weight: 3 },
  "bio-compound":   { color: 0x44cc88, amount: [80, 200],  weight: 1 },
  // Electronics
  "silicon-dust":   { color: 0xaabb88, amount: [120, 350], weight: 3 },
  "rare-earth":     { color: 0xddaa66, amount: [60, 180],  weight: 1 },
  // Rare metals
  "titanium-ore":   { color: 0x99bbdd, amount: [80, 250],  weight: 1 },
  // Energy — rare, small deposits
  "plasma-core":    { color: 0x44ddff, amount: [30, 120],  weight: 1 },
  "exotic-matter":  { color: 0xff44dd, amount: [10, 50],   weight: 0.3 },
  // Salvage
  "salvage-parts":  { color: 0x8899aa, amount: [100, 300], weight: 2 },
};

// Landmark affinity — which deposit types prefer which landmarks
const LANDMARK_DEPOSIT_AFFINITY = {
  monolith: ["exotic-matter", "crystal-shard", "plasma-core"],
  crater: ["bio-compound", "organic-matter"],
  ridge: ["iron-ore", "titanium-ore", "copper-ore"],
  mesa: ["iron-ore", "silicon-dust", "organic-matter"],
  canyon: ["plasma-core", "exotic-matter", "rare-earth"],
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
   * Spawn deposits along a route path, optionally biased toward landmarks.
   * When landmarks are provided, 70% of deposits spawn near landmarks
   * with type affinity (rarer deposits near interesting landmarks).
   * @param {Array<{x: number, z: number}>} route — mothership route waypoints
   * @param {number} count — number of deposits to scatter
   * @param {Array<object>} [landmarks] — optional landmark array from generateLandmarks
   */
  spawnAlongRoute(route, count = 30, landmarks = []) {
    const typeKeys = Object.keys(DEPOSIT_TYPES);
    const hasLandmarks = landmarks.length > 0;

    for (let i = 0; i < count; i++) {
      let x, z, selectedType;
      const nearLandmark = hasLandmarks && this.rng() < 0.7;

      if (nearLandmark) {
        // Pick a random landmark and spawn near it
        const lm = landmarks[Math.floor(this.rng() * landmarks.length)];
        const spread = 100;
        x = lm.x + (this.rng() - 0.5) * spread * 2;
        z = lm.z + (this.rng() - 0.5) * spread * 2;

        // Use landmark affinity for type selection
        const affinityTypes = LANDMARK_DEPOSIT_AFFINITY[lm.type];
        if (affinityTypes && this.rng() < 0.6) {
          // 60% chance to pick an affinity type
          selectedType = affinityTypes[Math.floor(this.rng() * affinityTypes.length)];
        } else {
          selectedType = this._weightedRandomType(typeKeys);
        }
      } else {
        // Route-based placement (original behavior)
        const routeIdx = Math.floor(Math.pow(this.rng(), 1.5) * route.length);
        const waypoint = route[routeIdx];
        const spread = 150;
        x = waypoint.x + (this.rng() - 0.5) * spread * 2;
        z = waypoint.z + (this.rng() - 0.5) * spread * 2;
        selectedType = this._weightedRandomType(typeKeys);
      }

      const typeDef = DEPOSIT_TYPES[selectedType];
      const [minAmt, maxAmt] = typeDef.amount;
      const amount = Math.floor(minAmt + this.rng() * (maxAmt - minAmt));

      const terrainY = getTerrainHeight(x, z) * VOXEL_SCALE;

      // Visual variety: per-deposit rotation and scale variation based on type
      const rotSeed = this.rng() * Math.PI * 2;
      const scaleMult = 0.7 + this.rng() * 0.6; // 0.7 to 1.3

      this.deposits.push({
        id: `deposit-${i}`,
        resourceType: selectedType,
        amount,
        maxAmount: amount,
        position: { x, y: terrainY + DEPOSIT_VISUAL_SCALE, z },
        color: typeDef.color,
        depleted: false,
        rotSeed,
        scaleMult,
      });
    }

    this._updateInstances();
  }

  /**
   * Weighted random type selection from deposit types.
   * @param {Array<string>} typeKeys
   * @returns {string}
   */
  _weightedRandomType(typeKeys) {
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
    return selectedType;
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
   * Add a wreck deposit at a specific position (for salvage missions).
   * The wreck acts like a special resource deposit containing "salvage-parts".
   * @param {{ x: number, y: number, z: number }} position
   * @param {number} amount — total salvageable value
   */
  addWreckDeposit(position, amount) {
    const terrainY = getTerrainHeight(position.x, position.z) * VOXEL_SCALE;
    this.deposits.push({
      id: "wreck-deposit",
      resourceType: "salvage-parts",
      amount,
      maxAmount: amount,
      position: { x: position.x, y: terrainY + DEPOSIT_VISUAL_SCALE, z: position.z },
      color: 0xff8844,
      depleted: false,
    });
    this._updateInstances();
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
