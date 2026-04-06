/**
 * Enemy renderer — instanced rendering for all enemy types.
 * Same pattern as fleet-renderer but for hostiles.
 */

import * as THREE from "three";
import { ENEMY_TYPES, isEnemyAlive } from "./enemy.js";

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const MAX_ENEMIES = 100;

export class EnemyRenderer {
  constructor(scene) {
    this.scene = scene;
    this.meshes = {};

    for (const [type, def] of Object.entries(ENEMY_TYPES)) {
      const [w, h, d] = def.size;
      let geo;

      if (def.category === "ship") {
        // Diamond/wedge shape for ships
        geo = new THREE.BufferGeometry();
        const verts = new Float32Array([
          0, 0, -d / 2,
          w / 2, 0, d / 4,
          0, h / 2, d / 4,
          -w / 2, 0, d / 4,
          0, -h / 3, d / 4,
          0, 0, d / 2,
        ]);
        const indices = [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1, 5, 2, 1, 5, 3, 2, 5, 4, 3, 5, 1, 4];
        geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();
      } else {
        // Box for turrets
        geo = new THREE.BoxGeometry(w, h, d);
      }

      const mat = new THREE.MeshStandardMaterial({
        color: def.color,
        roughness: 0.5,
        metalness: 0.3,
        flatShading: true,
        emissive: def.color,
        emissiveIntensity: 0.3,
      });

      const mesh = new THREE.InstancedMesh(geo, mat, MAX_ENEMIES);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.meshes[type] = mesh;
    }
  }

  update(enemies) {
    const counts = {};
    for (const type of Object.keys(ENEMY_TYPES)) counts[type] = 0;

    for (const enemy of enemies) {
      if (!isEnemyAlive(enemy)) continue;
      const mesh = this.meshes[enemy.type];
      if (!mesh) continue;

      const idx = counts[enemy.type];

      _dummy.position.set(enemy.position.x, enemy.position.y, enemy.position.z);
      if (enemy.velocity.x !== 0 || enemy.velocity.z !== 0) {
        _dummy.rotation.y = Math.atan2(enemy.velocity.x, enemy.velocity.z);
      }
      _dummy.updateMatrix();
      mesh.setMatrixAt(idx, _dummy.matrix);

      // Color: tint toward charred as health drops
      const healthPct = enemy.stats.hull / enemy.stats.hullMax;
      _color.setHex(ENEMY_TYPES[enemy.type].color);
      if (healthPct < 0.7) {
        const damage = Math.min(1, (1 - (healthPct - 0.15) / 0.55)); // 0 at 70%, 1 at 15%
        const charred = 0.15;
        _color.r = _color.r * (1 - damage * 0.6) + charred * damage * 0.6;
        _color.g = _color.g * (1 - damage * 0.7);
        _color.b = _color.b * (1 - damage * 0.7);
      }
      mesh.setColorAt(idx, _color);

      counts[enemy.type]++;
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
