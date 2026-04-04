/**
 * Greedy meshing algorithm for a 32x32x32 voxel chunk.
 *
 * Produces a vertex buffer with position + normal + color attributes.
 * Single material, vertex-colored — one draw call per chunk.
 *
 * This file is imported both by the main thread (for reference) and by
 * the Web Worker (worker-mesher.js) which does the actual work.
 */

import { VOXEL, VOXEL_COLORS, CHUNK_SIZE } from "../config.js";

/**
 * @param {Uint8Array} voxels - flat CHUNK_SIZE³ voxel data
 * @returns {{ positions: Float32Array, normals: Float32Array, colors: Float32Array, indices: Uint32Array } | null}
 */
export function greedyMesh(voxels) {
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  let vertCount = 0;

  const S = CHUNK_SIZE;

  function getVoxel(x, y, z) {
    if (x < 0 || x >= S || y < 0 || y >= S || z < 0 || z >= S) return VOXEL.AIR;
    return voxels[x + y * S + z * S * S];
  }

  // For each of the 6 face directions
  // d = axis (0=x, 1=y, 2=z), side = 0 (negative) or 1 (positive)
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3; // first perpendicular axis
    const v = (d + 2) % 3; // second perpendicular axis

    const q = [0, 0, 0]; // step direction
    const mask = new Int32Array(S * S); // face mask for current slice

    for (let side = 0; side < 2; side++) {
      q[0] = q[1] = q[2] = 0;
      q[d] = side === 0 ? -1 : 1;

      const normal = [0, 0, 0];
      normal[d] = side === 0 ? -1 : 1;

      // Sweep through slices along axis d
      for (let slice = 0; slice < S; slice++) {
        // Build mask: which faces are visible on this slice?
        let maskIdx = 0;
        for (let vv = 0; vv < S; vv++) {
          for (let uu = 0; uu < S; uu++) {
            const pos = [0, 0, 0];
            pos[d] = slice;
            pos[u] = uu;
            pos[v] = vv;

            const cur = getVoxel(pos[0], pos[1], pos[2]);
            const neighbor = getVoxel(pos[0] + q[0], pos[1] + q[1], pos[2] + q[2]);

            if (cur !== VOXEL.AIR && neighbor === VOXEL.AIR) {
              mask[maskIdx] = cur; // solid facing air — emit face
            } else {
              mask[maskIdx] = 0;
            }
            maskIdx++;
          }
        }

        // Greedy merge: find maximal rectangles in the mask
        for (let vv = 0; vv < S; vv++) {
          for (let uu = 0; uu < S;) {
            const idx = vv * S + uu;
            const type = mask[idx];
            if (type === 0) { uu++; continue; }

            // Find width (along u)
            let w = 1;
            while (uu + w < S && mask[vv * S + uu + w] === type) w++;

            // Find height (along v)
            let h = 1;
            let done = false;
            while (vv + h < S && !done) {
              for (let k = 0; k < w; k++) {
                if (mask[(vv + h) * S + uu + k] !== type) { done = true; break; }
              }
              if (!done) h++;
            }

            // Emit quad
            const basePos = [0, 0, 0];
            basePos[d] = side === 1 ? slice + 1 : slice;
            basePos[u] = uu;
            basePos[v] = vv;

            const du = [0, 0, 0];
            du[u] = w;
            const dv = [0, 0, 0];
            dv[v] = h;

            const color = VOXEL_COLORS[type] || [1, 0, 1];
            // Slight ambient occlusion fake: darken based on face direction
            const ao = d === 1 ? (side === 1 ? 1.0 : 0.55) : (d === 0 ? 0.8 : 0.7);

            // 4 vertices of the quad
            for (let vi = 0; vi < 4; vi++) {
              const offU = (vi === 1 || vi === 2) ? 1 : 0;
              const offV = (vi === 2 || vi === 3) ? 1 : 0;
              positions.push(
                basePos[0] + du[0] * offU + dv[0] * offV,
                basePos[1] + du[1] * offU + dv[1] * offV,
                basePos[2] + du[2] * offU + dv[2] * offV,
              );
              normals.push(normal[0], normal[1], normal[2]);
              colors.push(color[0] * ao, color[1] * ao, color[2] * ao);
            }

            // 2 triangles (wind order depends on face direction)
            if (side === 1) {
              indices.push(vertCount, vertCount + 1, vertCount + 2);
              indices.push(vertCount, vertCount + 2, vertCount + 3);
            } else {
              indices.push(vertCount, vertCount + 2, vertCount + 1);
              indices.push(vertCount, vertCount + 3, vertCount + 2);
            }
            vertCount += 4;

            // Clear the merged area from mask
            for (let dy = 0; dy < h; dy++) {
              for (let dx = 0; dx < w; dx++) {
                mask[(vv + dy) * S + uu + dx] = 0;
              }
            }
            uu += w;
          }
        }
      }
    }
  }

  if (vertCount === 0) return null;

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    indices: new Uint32Array(indices),
  };
}
