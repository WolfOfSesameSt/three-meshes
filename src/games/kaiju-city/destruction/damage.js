/**
 * Damage system: processes attacks from kaiju, removes voxels,
 * spawns debris, triggers structural collapse checks.
 */

import * as THREE from "three";
import { VOXEL, VOXEL_SIZE, CHUNK_SIZE, CHUNK_WORLD_SIZE } from "../config.js";

/**
 * Process a list of attacks against the voxel world.
 * @param {Array} attacks - from KaijuController.update()
 * @param {import('../city/chunk-manager.js').ChunkManager} chunkManager
 * @param {import('./debris.js').DebrisSystem} debris
 * @param {import('../camera/follow-camera.js').FollowCamera} camera
 */
export function processAttacks(attacks, chunkManager, debris, camera) {
  for (const attack of attacks) {
    let removed = [];

    switch (attack.type) {
      case "punch":
        removed = chunkManager.removeSphereWorld(
          attack.position.x, attack.position.y, attack.position.z,
          attack.radius
        );
        if (removed.length > 0) camera.shake(1.5);
        break;

      case "stomp":
        removed = removeCylinder(
          chunkManager,
          attack.position.x, attack.position.y, attack.position.z,
          attack.radius, attack.depth
        );
        if (removed.length > 0) camera.shake(3);
        break;

      case "tail":
        removed = removeArc(
          chunkManager,
          attack.position.x, attack.position.y, attack.position.z,
          attack.yaw, attack.arc, attack.range, attack.height
        );
        if (removed.length > 0) camera.shake(2);
        break;

      case "breath":
        removed = removeBeam(
          chunkManager,
          attack.origin, attack.direction,
          attack.range, attack.radius
        );
        break;
    }

    // Spawn debris from removed voxels (limit to avoid spike)
    if (removed.length > 0) {
      // Only spawn debris for a subset to limit particle count
      const maxSpawn = Math.min(removed.length, 50);
      const step = Math.max(1, Math.floor(removed.length / maxSpawn));
      const toSpawn = [];
      for (let i = 0; i < removed.length; i += step) {
        toSpawn.push(removed[i]);
      }
      debris.spawn(toSpawn);

      // Check structural integrity for affected chunks
      checkStructuralIntegrity(chunkManager, removed);
    }
  }
}

/** Remove voxels in a cylinder (vertical, centered at x,z from y downward) */
function removeCylinder(cm, cx, cy, cz, radius, depth) {
  const removed = [];
  const r2 = radius * radius;

  for (let wy = cy; wy >= cy - depth && wy >= 0; wy -= VOXEL_SIZE) {
    for (let wx = cx - radius; wx <= cx + radius; wx += VOXEL_SIZE) {
      for (let wz = cz - radius; wz <= cz + radius; wz += VOXEL_SIZE) {
        const dx = wx - cx, dz = wz - cz;
        if (dx * dx + dz * dz > r2) continue;

        const loc = cm.worldToLocal(wx, wy, wz);
        const chunk = cm.get(loc.cx, loc.cz);
        if (!chunk) continue;

        const old = chunk.remove(loc.lx, loc.ly, loc.lz);
        if (old !== VOXEL.AIR) {
          removed.push({ wx, wy, wz, type: old });
        }
      }
    }
  }
  return removed;
}

/** Remove voxels in an arc behind the kaiju (tail swipe) */
function removeArc(cm, cx, cy, cz, yaw, arc, range, height) {
  const removed = [];
  const r2 = range * range;
  const halfArc = arc / 2;

  for (let wx = cx - range; wx <= cx + range; wx += VOXEL_SIZE) {
    for (let wz = cz - range; wz <= cz + range; wz += VOXEL_SIZE) {
      const dx = wx - cx, dz = wz - cz;
      if (dx * dx + dz * dz > r2) continue;

      // Check angle
      const angle = Math.atan2(-dx, -dz);
      let diff = angle - yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > halfArc) continue;

      for (let wy = cy; wy <= cy + height; wy += VOXEL_SIZE) {
        const loc = cm.worldToLocal(wx, wy, wz);
        const chunk = cm.get(loc.cx, loc.cz);
        if (!chunk) continue;

        const old = chunk.remove(loc.lx, loc.ly, loc.lz);
        if (old !== VOXEL.AIR) {
          removed.push({ wx, wy, wz, type: old });
        }
      }
    }
  }
  return removed;
}

/** Remove voxels along a beam (DDA-like ray through voxels) */
function removeBeam(cm, origin, direction, range, radius) {
  const removed = [];
  const step = VOXEL_SIZE;
  const steps = Math.ceil(range / step);

  for (let i = 0; i < steps; i++) {
    const t = i * step;
    const bx = origin.x + direction.x * t;
    const by = origin.y + direction.y * t;
    const bz = origin.z + direction.z * t;

    if (by < 0) break; // hit the ground

    // Remove sphere around beam point
    const r2 = radius * radius;
    for (let dx = -radius; dx <= radius; dx += VOXEL_SIZE) {
      for (let dy = -radius; dy <= radius; dy += VOXEL_SIZE) {
        for (let dz = -radius; dz <= radius; dz += VOXEL_SIZE) {
          if (dx * dx + dy * dy + dz * dz > r2) continue;

          const wx = bx + dx, wy = by + dy, wz = bz + dz;
          if (wy < 0) continue;

          const loc = cm.worldToLocal(wx, wy, wz);
          const chunk = cm.get(loc.cx, loc.cz);
          if (!chunk) continue;

          const old = chunk.remove(loc.lx, loc.ly, loc.lz);
          if (old !== VOXEL.AIR) {
            removed.push({ wx, wy, wz, type: old });
          }
        }
      }
    }
  }
  return removed;
}

/**
 * Simple structural integrity check: for each affected chunk,
 * find voxels with no support below them and collapse them.
 */
function checkStructuralIntegrity(cm, removedVoxels) {
  // Collect affected chunks
  const affectedChunks = new Set();
  for (const v of removedVoxels) {
    const loc = cm.worldToLocal(v.wx, v.wy, v.wz);
    affectedChunks.add(`${loc.cx},${loc.cz}`);
  }

  const collapsed = [];

  for (const key of affectedChunks) {
    const chunk = cm.chunks.get(key);
    if (!chunk) continue;

    // Simple per-column check: if any column has a gap, drop everything above
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        let gapFound = false;
        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
          const v = chunk.get(lx, ly, lz);
          if (v === VOXEL.AIR && !gapFound && ly > 0) {
            // Check if there's something above this gap
            let hasAbove = false;
            for (let ay = ly + 1; ay < CHUNK_SIZE; ay++) {
              if (chunk.get(lx, ay, lz) !== VOXEL.AIR) { hasAbove = true; break; }
            }
            if (hasAbove) gapFound = true;
          }

          if (gapFound && v !== VOXEL.AIR) {
            // This voxel is unsupported — collapse it
            const wx = chunk.cx * CHUNK_WORLD_SIZE + lx * VOXEL_SIZE;
            const wy = ly * VOXEL_SIZE;
            const wz = chunk.cz * CHUNK_WORLD_SIZE + lz * VOXEL_SIZE;
            chunk.remove(lx, ly, lz);
            collapsed.push({ wx, wy, wz, type: v });
          }
        }
      }
    }
  }

  return collapsed;
}
