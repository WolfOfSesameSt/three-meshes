/**
 * Fleet renderer — instanced rendering for player drones.
 *
 * Drones use rounded, friendly shapes with bright emissive glow
 * to visually distinguish them from angular enemy ships.
 *
 * Workers: rounded capsule/disc shape with tool-color accents
 * Offensive: swept-wing fighter with engine glow
 */

import * as THREE from "three";
import { MAX_DRONES } from "../config.js";

// Drone type → visual config
const DRONE_VISUALS = {
  "worker-mining": { color: 0x44dd88, emissive: 0x22aa55, size: 1.5 },
  "worker-looting": { color: 0xddaa44, emissive: 0xaa8822, size: 1.5 },
  "worker-repair": { color: 0x44aadd, emissive: 0x2288aa, size: 1.2 },
  offensive: { color: 0x6688ff, emissive: 0x4466dd, size: 2.0 },
};

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

/**
 * Build a rounded worker drone mesh — disc/saucer shape.
 */
function buildWorkerGeometry(scale) {
  // Flattened sphere = friendly saucer shape
  const geo = new THREE.SphereGeometry(scale, 8, 4);
  // Flatten vertically
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, pos.getY(i) * 0.3);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Build an offensive drone mesh — swept angular fighter.
 */
function buildFighterGeometry(scale) {
  const geo = new THREE.BufferGeometry();
  const s = scale;
  const verts = new Float32Array([
    // Nose
    0, 0, -s * 1.5,
    // Wings
    s * 0.8, 0, s * 0.3,
    -s * 0.8, 0, s * 0.3,
    // Top fin
    0, s * 0.35, s * 0.1,
    // Bottom
    0, -s * 0.15, s * 0.2,
    // Tail
    0, s * 0.1, s * 0.8,
  ]);
  const indices = [
    // Top
    0, 1, 3,
    0, 3, 2,
    // Bottom
    0, 4, 1,
    0, 2, 4,
    // Back top
    1, 5, 3,
    2, 3, 5,
    // Back bottom
    1, 4, 5,
    2, 5, 4,
  ];
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export class FleetRenderer {
  constructor(scene) {
    this.scene = scene;
    this.meshes = {};

    this._initMeshes();
  }

  _initMeshes() {
    for (const [type, visual] of Object.entries(DRONE_VISUALS)) {
      const isWorker = type.startsWith("worker");
      const geo = isWorker
        ? buildWorkerGeometry(visual.size)
        : buildFighterGeometry(visual.size);

      const mat = new THREE.MeshStandardMaterial({
        color: visual.color,
        emissive: visual.emissive,
        emissiveIntensity: 0.4,
        roughness: 0.25,
        metalness: 0.7,
        flatShading: true,
      });

      const mesh = new THREE.InstancedMesh(geo, mat, MAX_DRONES);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.meshes[type] = mesh;
    }
  }

  /**
   * Update all instanced meshes from drone data.
   */
  update(allDrones) {
    const counts = {};
    for (const type of Object.keys(DRONE_VISUALS)) counts[type] = 0;

    for (const drone of allDrones) {
      if (drone.state === "destroyed") continue;
      const type = drone.type;
      const mesh = this.meshes[type];
      if (!mesh) continue;

      const idx = counts[type];

      _dummy.position.set(drone.position.x, drone.position.y, drone.position.z);

      if (drone.velocity.x !== 0 || drone.velocity.z !== 0) {
        _dummy.rotation.y = Math.atan2(drone.velocity.x, drone.velocity.z);
      }

      _dummy.updateMatrix();
      mesh.setMatrixAt(idx, _dummy.matrix);

      // Color: tint toward charred as health drops
      const healthPct = drone.stats.hull / drone.stats.hullMax;
      _color.setHex(DRONE_VISUALS[type].color);
      if (healthPct < 0.7) {
        const damage = Math.min(1, (1 - (healthPct - 0.15) / 0.55)); // 0 at 70%, 1 at 15%
        const charred = 0.15;
        _color.r = _color.r * (1 - damage * 0.6) + charred * damage * 0.6;
        _color.g = _color.g * (1 - damage * 0.7);
        _color.b = _color.b * (1 - damage * 0.7);
      }
      mesh.setColorAt(idx, _color);

      counts[type]++;
    }

    for (const [type, mesh] of Object.entries(this.meshes)) {
      mesh.count = counts[type];
      if (counts[type] > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  dispose() {
    for (const mesh of Object.values(this.meshes)) {
      mesh.geometry.dispose();
      mesh.material.dispose();
      this.scene.remove(mesh);
    }
  }
}
