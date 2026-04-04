/**
 * Web Worker for off-thread greedy meshing.
 *
 * Receives voxel data as a transferable ArrayBuffer,
 * runs greedy mesh, returns vertex data as transferables.
 */

// We inline the constants and mesher here to avoid import issues in workers.
// Vite handles worker imports differently, so we self-contain this.

const CHUNK_SIZE = 32;
const VOXEL_AIR = 0;

const VOXEL_COLORS = {
  1: [0.35, 0.30, 0.25],  // GROUND
  2: [0.20, 0.20, 0.22],  // ROAD
  3: [0.55, 0.53, 0.50],  // CONCRETE
  4: [0.4, 0.6, 0.75],    // GLASS
  5: [0.45, 0.48, 0.52],  // STEEL
  6: [0.15, 0.30, 0.55],  // WATER
  7: [0.25, 0.50, 0.20],  // PARK
  8: [0.40, 0.35, 0.30],  // RUBBLE
};

function greedyMesh(voxels) {
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  let vertCount = 0;
  const S = CHUNK_SIZE;

  function getVoxel(x, y, z) {
    if (x < 0 || x >= S || y < 0 || y >= S || z < 0 || z >= S) return VOXEL_AIR;
    return voxels[x + y * S + z * S * S];
  }

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    const q = [0, 0, 0];
    const mask = new Int32Array(S * S);

    for (let side = 0; side < 2; side++) {
      q[0] = q[1] = q[2] = 0;
      q[d] = side === 0 ? -1 : 1;
      const normal = [0, 0, 0];
      normal[d] = side === 0 ? -1 : 1;

      for (let slice = 0; slice < S; slice++) {
        let maskIdx = 0;
        for (let vv = 0; vv < S; vv++) {
          for (let uu = 0; uu < S; uu++) {
            const pos = [0, 0, 0];
            pos[d] = slice; pos[u] = uu; pos[v] = vv;
            const cur = getVoxel(pos[0], pos[1], pos[2]);
            const neighbor = getVoxel(pos[0] + q[0], pos[1] + q[1], pos[2] + q[2]);
            mask[maskIdx++] = (cur !== VOXEL_AIR && neighbor === VOXEL_AIR) ? cur : 0;
          }
        }

        for (let vv = 0; vv < S; vv++) {
          for (let uu = 0; uu < S;) {
            const type = mask[vv * S + uu];
            if (type === 0) { uu++; continue; }

            let w = 1;
            while (uu + w < S && mask[vv * S + uu + w] === type) w++;

            let h = 1;
            let done = false;
            while (vv + h < S && !done) {
              for (let k = 0; k < w; k++) {
                if (mask[(vv + h) * S + uu + k] !== type) { done = true; break; }
              }
              if (!done) h++;
            }

            const basePos = [0, 0, 0];
            basePos[d] = side === 1 ? slice + 1 : slice;
            basePos[u] = uu; basePos[v] = vv;
            const du = [0, 0, 0]; du[u] = w;
            const dv = [0, 0, 0]; dv[v] = h;
            const color = VOXEL_COLORS[type] || [1, 0, 1];
            const ao = d === 1 ? (side === 1 ? 1.0 : 0.55) : (d === 0 ? 0.8 : 0.7);

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

            if (side === 1) {
              indices.push(vertCount, vertCount + 1, vertCount + 2);
              indices.push(vertCount, vertCount + 2, vertCount + 3);
            } else {
              indices.push(vertCount, vertCount + 2, vertCount + 1);
              indices.push(vertCount, vertCount + 3, vertCount + 2);
            }
            vertCount += 4;

            for (let dy = 0; dy < h; dy++)
              for (let dx = 0; dx < w; dx++)
                mask[(vv + dy) * S + uu + dx] = 0;
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

// ─── Worker message handler ─────────────────────────────────────────
self.onmessage = function (e) {
  const { id, cx, cz, voxelBuffer } = e.data;
  const voxels = new Uint8Array(voxelBuffer);
  const result = greedyMesh(voxels);

  if (result) {
    self.postMessage(
      { id, cx, cz, meshData: result },
      [result.positions.buffer, result.normals.buffer, result.colors.buffer, result.indices.buffer]
    );
  } else {
    self.postMessage({ id, cx, cz, meshData: null });
  }
};
