/**
 * Mothership turret/bay rigger.
 *
 * Shared between the model preview tool and the in-game mothership loader.
 * Takes a configuration JSON (produced by the model preview's
 * `serializeHardpoints()`) and applies it to a loaded glTF mothership group:
 *
 *   - hides the original ball-turret meshes (modelSlot.hiddenMeshNames)
 *   - builds a procedural ball turret at each slot
 *   - registers drone bays so the fleet manager can route drones through them
 *
 * The procedural ball turret is a small sphere head + single barrel, with
 * named pivots so callers can rotate them for aim/tracking. Each turret
 * exposes its muzzle position in pitchPivot-local space so weapon FX can fire
 * from the actual barrel tip rather than the rotation pivot.
 */

import * as THREE from "three";

const BALL_TURRET_DEFAULTS = {
  baseR: 0.025,
  baseH: 0.012,
  barrelR: 0.008,
  barrelL: 0.075,
  headR: 0.035,
  color: 0x9b9bff,
};

const BAY_DEFAULTS = {
  size: 0.15,
  color: 0x7bf77b,
};

/**
 * Build a procedural ball turret at the given local position, oriented so
 * its local +Y axis points along `normal`.
 *
 * @param {THREE.Vector3} position - in the parent group's local space
 * @param {THREE.Vector3} normal - outward-pointing direction in same space
 * @param {object} [opts] - geometry overrides
 * @returns {{group, yawPivot, pitchPivot, muzzleLocal}}
 */
export function buildBallTurret(position, normal, opts = {}) {
  const cfg = { ...BALL_TURRET_DEFAULTS, ...opts };

  const root = new THREE.Group();
  root.name = "turret_root";
  root.position.copy(position);
  root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);

  // Base disc sitting on the surface
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x444466, roughness: 0.4, metalness: 0.7 });
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(cfg.baseR, cfg.baseR * 1.1, cfg.baseH, 12),
    baseMat,
  );
  base.name = "turret_base";
  base.position.y = cfg.baseH / 2;
  root.add(base);

  // Yaw pivot (rotates around +Y / surface normal)
  const yawPivot = new THREE.Group();
  yawPivot.name = "turret_yaw";
  yawPivot.position.y = cfg.baseH;
  root.add(yawPivot);

  // Pitch pivot (tilts up/down)
  const pitchPivot = new THREE.Group();
  pitchPivot.name = "turret_pitch";
  yawPivot.add(pitchPivot);

  // Sphere head — full sphere raised so it sits on the base
  const headMat = new THREE.MeshStandardMaterial({
    color: cfg.color,
    roughness: 0.3,
    metalness: 0.6,
    emissive: new THREE.Color(cfg.color).multiplyScalar(0.15),
  });
  const head = new THREE.Mesh(new THREE.SphereGeometry(cfg.headR, 14, 10), headMat);
  head.name = "turret_head";
  head.position.y = cfg.headR * 0.6;
  pitchPivot.add(head);

  // Hollow open-ended barrel — the texture wraps around the cylinder wall
  // (and the inside, via DoubleSide) so it reads as a real armored gun
  // barrel with a visible bore. Higher radial segments make the wrap clean.
  const barrelMat = new THREE.MeshStandardMaterial({
    color: 0x888899,
    roughness: 0.3,
    metalness: 0.8,
    side: THREE.DoubleSide, // visible from inside the bore
  });
  const barrelGeom = new THREE.CylinderGeometry(
    cfg.barrelR,
    cfg.barrelR,
    cfg.barrelL,
    24,    // radial segments — more = smoother wrap
    1,     // height segments
    true,  // openEnded — hollow gun bore
  );
  barrelGeom.rotateX(Math.PI / 2);
  const barrel = new THREE.Mesh(barrelGeom, barrelMat);
  barrel.name = "turret_barrel";
  const barrelBaseZ = cfg.headR * 0.7;
  barrel.position.set(0, cfg.headR * 0.6, barrelBaseZ + cfg.barrelL / 2);
  pitchPivot.add(barrel);

  // Where to spawn lasers from — the front tip of the barrel, in pitchPivot
  // local coords. Callers do `pitchPivot.localToWorld(muzzleLocal.clone())`.
  const muzzleLocal = new THREE.Vector3(0, cfg.headR * 0.6, barrelBaseZ + cfg.barrelL);

  return { group: root, yawPivot, pitchPivot, muzzleLocal, head, barrel };
}

// ─── Active turret skin loader ──────────────────────────────────
// The texture lab writes filenames to localStorage. We read them here at
// mothership build time and load the actual textures via a shared loader
// (Three.js caches by URL so repeat calls are cheap).
//
// If the lab hasn't saved anything yet, we fall back to the BAKED DEFAULTS
// — the flat tileable textures generated via Gemini that ship with the
// game. This means a fresh install shows skinned turrets out of the box;
// the lab is for iteration when you want to swap in something new.
const SKIN_KEY_SMALL = "void-raiders.turret-skin.small";
const SKIN_KEY_HEAVY = "void-raiders.turret-skin.heavy";
const DEFAULT_SKIN_SMALL = "laser-flat-v1.png";
const DEFAULT_SKIN_HEAVY = "heavy-flat-v1.png";
const _skinLoader = new THREE.TextureLoader();

export async function loadActiveTurretSkins() {
  let smallFile = DEFAULT_SKIN_SMALL;
  let heavyFile = DEFAULT_SKIN_HEAVY;
  if (typeof localStorage !== "undefined") {
    smallFile = localStorage.getItem(SKIN_KEY_SMALL) || DEFAULT_SKIN_SMALL;
    heavyFile = localStorage.getItem(SKIN_KEY_HEAVY) || DEFAULT_SKIN_HEAVY;
  }

  function load(file) {
    if (!file) return Promise.resolve(null);
    const url = `/textures/turrets/${file}`;
    return new Promise((resolve) => {
      _skinLoader.load(
        url,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.wrapS = THREE.RepeatWrapping;
          resolve(tex);
        },
        undefined,
        () => resolve(null), // failed load → just skip the skin
      );
    });
  }

  const [small, heavy] = await Promise.all([load(smallFile), load(heavyFile)]);
  return { small, heavy };
}

/**
 * Apply a texture map to a built ball turret's head + barrel materials.
 * Lightens the base color so the texture isn't tinted dark.
 */
export function applyTurretSkin(built, texture) {
  if (!built || !texture) return;
  for (const m of [built.head, built.barrel]) {
    if (!m) continue;
    m.material.map = texture;
    m.material.color.set(0xffffff);
    m.material.needsUpdate = true;
  }
}

/**
 * Compute the dominant principal axis (longest direction) of a mesh's
 * vertices via PCA + power iteration. For a barrel-shaped object the longest
 * axis IS the barrel direction. The returned vector is unit-length but its
 * SIGN is arbitrary — callers must disambiguate (e.g., by picking the side
 * the muzzle vertex projects to).
 *
 * Returns null if the mesh has no position attribute or zero variance.
 *
 * Algorithm:
 *   1. Center vertices around their mean
 *   2. Build the 3×3 covariance matrix from the centered vertices
 *   3. Power iteration on the covariance matrix → dominant eigenvector
 *
 * Power iteration converges to the eigenvector with the largest magnitude
 * eigenvalue, which for a covariance matrix is the direction of maximum
 * variance — exactly the long axis we want.
 *
 * @param {THREE.Mesh} mesh
 * @returns {THREE.Vector3 | null}
 */
export function computeLongestAxis(mesh) {
  const pos = mesh.geometry?.attributes?.position;
  if (!pos || pos.count === 0) return null;

  // Mean
  let mx = 0, my = 0, mz = 0;
  for (let i = 0; i < pos.count; i++) {
    mx += pos.getX(i);
    my += pos.getY(i);
    mz += pos.getZ(i);
  }
  mx /= pos.count; my /= pos.count; mz /= pos.count;

  // Covariance matrix entries (symmetric so we only need 6)
  let cxx = 0, cxy = 0, cxz = 0, cyy = 0, cyz = 0, czz = 0;
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i) - mx;
    const dy = pos.getY(i) - my;
    const dz = pos.getZ(i) - mz;
    cxx += dx * dx;
    cxy += dx * dy;
    cxz += dx * dz;
    cyy += dy * dy;
    cyz += dy * dz;
    czz += dz * dz;
  }

  // Bail if the cloud is degenerate (all vertices coincident)
  const trace = cxx + cyy + czz;
  if (trace < 1e-12) return null;

  // Power iteration: v_{k+1} = (C * v_k) / ||C * v_k||
  // Start from a non-axis-aligned seed so we don't accidentally land on a
  // local minimum if C happens to have an axis-aligned eigenvector.
  let vx = 0.7, vy = 0.5, vz = 0.5;
  for (let iter = 0; iter < 32; iter++) {
    const nx = cxx * vx + cxy * vy + cxz * vz;
    const ny = cxy * vx + cyy * vy + cyz * vz;
    const nz = cxz * vx + cyz * vy + czz * vz;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len < 1e-12) return null;
    vx = nx / len; vy = ny / len; vz = nz / len;
  }

  return new THREE.Vector3(vx, vy, vz);
}

/**
 * Reparent a mesh under a new target group, baking its vertices so the mesh
 * stays at the EXACT same world position/orientation/scale as before. Used
 * to attach the artist's original ball turret meshes to a procedural
 * yaw/pitch pivot hierarchy without visually shifting them.
 *
 * Math: for a vertex v under the OLD parent, its world position is
 *   worldPos = oldParent.matrixWorld * v
 * After reparenting we want
 *   worldPos = newParent.matrixWorld * baked
 * Solving for baked:
 *   baked = (newParent.matrixWorld)^-1 * oldParent.matrixWorld * v
 * That's the (scale-agnostic) transform we apply to every vertex. Works
 * regardless of any scaling on either parent chain.
 *
 * The previous version of this function used a "pivot + invQuat" approach
 * that ignored the new parent's scale — which silently broke as soon as the
 * in-game wrapper applied an 8× scale on top of the rigging hierarchy and
 * meshes ended up rendered 8× too big.
 *
 * @param {THREE.Mesh} mesh
 * @param {THREE.Object3D} targetGroup
 */
export function reparentMeshToGroup(mesh, targetGroup) {
  mesh.updateMatrixWorld(true);
  const oldWorldMat = mesh.matrixWorld.clone();

  mesh.removeFromParent();
  targetGroup.add(mesh);
  mesh.position.set(0, 0, 0);
  mesh.quaternion.identity();
  mesh.scale.set(1, 1, 1);

  // Make sure the new parent chain has fresh world matrices before we read
  // its inverse — the parent's matrixWorld can be stale if it was just added
  // to the scene.
  targetGroup.updateMatrixWorld(true);
  const transform = targetGroup.matrixWorld.clone().invert().multiply(oldWorldMat);

  const pos = mesh.geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    v.applyMatrix4(transform);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  mesh.geometry.computeBoundingSphere();
  mesh.geometry.computeBoundingBox();
}

/**
 * Build a procedural 6-shot revolver missile launcher.
 *
 * Hierarchy:
 *   root (positioned + oriented to surface normal — local +Y is outward)
 *     hideTransform  (translates the whole launcher down into the hull
 *                     during the reload animation; identity when raised)
 *       yawPivot     (rotates around +Y to face the target azimuth)
 *         pitchPivot (tilts up/down to set elevation)
 *           housing  (a hexagonal-ish base/mount that the revolver sits on)
 *           revolver (the main 6-tube cylinder, axis along local +Z)
 *             tubes[0..5]  — each is a small forward-facing cylinder + a
 *                            visible missile tip cone that pokes out the
 *                            front of the tube. Hide the cone after firing
 *                            to leave an empty bore.
 *
 * The whole revolver group rotates around its own +Z axis to advance to
 * the next loaded chamber between shots — this is the "revolving cylinder"
 * effect. Cosmetic, since the firing position itself doesn't move; the
 * art just makes it READ as a revolver.
 *
 * The TurretSystem advances state like:
 *   LOADED → fire chamber → rotate 60° → wait for next cooldown →
 *   ... after 6 shots → LOWERING → RELOADING (hidden, X seconds) → RAISING → LOADED
 *
 * @returns {{
 *   group, hideTransform, yawPivot, pitchPivot, muzzleLocal,
 *   revolver, tubes, missileTips, head, barrel,
 * }}
 */
export function buildMissileLauncher(position, normal, opts = {}) {
  const cfg = {
    baseR: 0.10,
    baseH: 0.04,
    revolverR: 0.16,       // outer radius of the revolver housing
    revolverL: 0.30,       // length along the firing axis
    tubeR: 0.045,          // each missile-tube radius
    tubeOffsetR: 0.10,     // distance from revolver center to each tube center
    tipL: 0.06,            // missile tip cone length
    color: 0x556677,
    accentColor: 0xff8844,
    ...opts,
  };

  const root = new THREE.Group();
  root.name = "missile_launcher_root";
  root.position.copy(position);
  root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);

  // hideTransform — slid down (negative local Y) during reload
  const hideTransform = new THREE.Group();
  hideTransform.name = "missile_launcher_hide";
  root.add(hideTransform);

  // Base disc on the hull surface
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x333344, roughness: 0.4, metalness: 0.7 });
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(cfg.baseR, cfg.baseR * 1.1, cfg.baseH, 12),
    baseMat,
  );
  base.position.y = cfg.baseH / 2;
  hideTransform.add(base);

  const yawPivot = new THREE.Group();
  yawPivot.name = "missile_launcher_yaw";
  yawPivot.position.y = cfg.baseH;
  hideTransform.add(yawPivot);

  const pitchPivot = new THREE.Group();
  pitchPivot.name = "missile_launcher_pitch";
  yawPivot.add(pitchPivot);

  // Housing block — short cylinder behind the revolver, so the launcher
  // visually mounts to a body rather than floating in space
  const housingMat = new THREE.MeshStandardMaterial({
    color: cfg.color,
    roughness: 0.5,
    metalness: 0.7,
  });
  const housing = new THREE.Mesh(
    new THREE.CylinderGeometry(cfg.revolverR * 0.95, cfg.revolverR * 1.0, cfg.revolverL * 0.4, 16),
    housingMat,
  );
  housing.name = "turret_head"; // shared name w/ ball turret head so audits + skin lookups find it
  housing.rotation.x = Math.PI / 2; // along Z
  housing.position.set(0, cfg.revolverR * 0.6, -cfg.revolverL * 0.15);
  pitchPivot.add(housing);

  // Revolver cylinder — solid back-plate with 6 tube holes around it
  const revolver = new THREE.Group();
  revolver.name = "missile_launcher_revolver";
  // Position so the FRONT of the revolver is at +Z (so missiles fire forward)
  revolver.position.set(0, cfg.revolverR * 0.6, cfg.revolverL * 0.5);
  pitchPivot.add(revolver);

  const revolverFaceMat = new THREE.MeshStandardMaterial({
    color: cfg.color,
    roughness: 0.55,
    metalness: 0.8,
  });
  // Back plate — solid disc behind the tubes
  const backPlate = new THREE.Mesh(
    new THREE.CylinderGeometry(cfg.revolverR, cfg.revolverR, 0.04, 16),
    revolverFaceMat,
  );
  backPlate.rotation.x = Math.PI / 2;
  backPlate.position.z = -cfg.revolverL * 0.5;
  revolver.add(backPlate);

  // Front face — disc with 6 visible holes (we just stack a slightly
  // smaller dark disc to suggest the bore mouths around each tube)
  const frontPlate = new THREE.Mesh(
    new THREE.CylinderGeometry(cfg.revolverR, cfg.revolverR, 0.04, 16),
    revolverFaceMat,
  );
  frontPlate.name = "turret_barrel"; // shared name w/ ball turret barrel for skin lookups
  frontPlate.rotation.x = Math.PI / 2;
  frontPlate.position.z = cfg.revolverL * 0.5;
  revolver.add(frontPlate);

  // Build the 6 tubes — each is a hollow cylinder (so you see down the bore)
  // arranged around the revolver center axis. Each tube has a missile tip
  // cone on the FRONT face that we toggle visible/invisible as ammo state
  // changes.
  const tubeMat = new THREE.MeshStandardMaterial({
    color: 0x222233,
    roughness: 0.9,
    metalness: 0.4,
    side: THREE.DoubleSide,
  });
  const tipMat = new THREE.MeshStandardMaterial({
    color: cfg.accentColor,
    roughness: 0.3,
    metalness: 0.6,
    emissive: new THREE.Color(cfg.accentColor).multiplyScalar(0.25),
  });

  const tubes = [];
  const missileTips = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const tx = Math.cos(angle) * cfg.tubeOffsetR;
    const ty = Math.sin(angle) * cfg.tubeOffsetR;

    // Hollow tube (open both ends so you see through the bore)
    const tubeGeom = new THREE.CylinderGeometry(cfg.tubeR, cfg.tubeR, cfg.revolverL * 0.92, 12, 1, true);
    tubeGeom.rotateX(Math.PI / 2); // along Z
    const tube = new THREE.Mesh(tubeGeom, tubeMat);
    tube.position.set(tx, ty, 0);
    revolver.add(tube);
    tubes.push(tube);

    // Missile tip — small cone sticking out the FRONT of the tube
    const tipGeom = new THREE.ConeGeometry(cfg.tubeR * 0.85, cfg.tipL, 10);
    tipGeom.rotateX(Math.PI / 2); // point along +Z
    const tip = new THREE.Mesh(tipGeom, tipMat);
    tip.position.set(tx, ty, cfg.revolverL * 0.46 + cfg.tipL * 0.5);
    revolver.add(tip);
    missileTips.push(tip);
  }

  // Muzzle position = the FRONT of the chamber that's currently aligned
  // with the firing position (top of the revolver, angle 0). The TurretSystem
  // updates the revolver's rotation between shots, so the "fire from the
  // top tube" position rotates with the geometry. We compute the muzzle
  // each shot from tube[currentChamber].position transformed into local.
  // For now we expose the firing position offset so the system can use it.
  const muzzleLocal = new THREE.Vector3(0, cfg.revolverR * 0.6, cfg.revolverL * 0.5 + cfg.tipL);

  // To match the ball turret API, expose head + barrel pointers (the
  // texture lab uses these). For the launcher we'll consider housing = head
  // and frontPlate = barrel since they're the most visible flat surfaces.
  return {
    group: root,
    hideTransform,
    yawPivot,
    pitchPivot,
    revolver,
    tubes,
    missileTips,
    muzzleLocal,
    head: housing,
    barrel: frontPlate,
    config: cfg,
  };
}

/**
 * Build a small drone-bay marker at the given position.
 * Visual placeholder — actual hangar door / opening logic is up to the model.
 */
export function buildDroneBay(position, normal, opts = {}) {
  const cfg = { ...BAY_DEFAULTS, ...opts };

  const root = new THREE.Group();
  root.position.copy(position);
  root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);

  const bayMat = new THREE.MeshStandardMaterial({
    color: cfg.color,
    roughness: 0.5,
    metalness: 0.3,
    emissive: new THREE.Color(cfg.color).multiplyScalar(0.3),
  });
  const bay = new THREE.Mesh(new THREE.BoxGeometry(cfg.size, 0.02, cfg.size), bayMat);
  bay.position.y = 0.01;
  root.add(bay);

  return { group: root };
}

/**
 * Connected-component extraction for a mesh with an index buffer.
 *
 * Builds a union-find over the triangle vertex indices and returns one new
 * `THREE.Mesh` per island. Components below `threshold` faces are merged
 * into a single "fragments" island so they don't pollute the main list.
 *
 * Returns null when there's nothing to split (single component, no fragments).
 * Otherwise returns an array of `{ mesh, faceCount, center }` plus a
 * `triangleToIsland` Int32Array on the array itself.
 *
 * Naming convention: each significant island gets `${mesh.name}_islandN`,
 * the merged fragments get `${mesh.name}_fragments`. The model preview tool
 * saves these names into hardpoint configs, and the in-game loader re-runs
 * this function on parent meshes to regenerate the same names.
 */
export function splitMeshByIslands(mesh, threshold) {
  const geom = mesh.geometry;
  const index = geom.index;
  if (!index) return null;

  const positions = geom.attributes.position;
  const normals = geom.attributes.normal;
  const uvs = geom.attributes.uv;
  const indexArr = index.array;
  const triCount = indexArr.length / 3;

  const parent = new Int32Array(positions.count);
  const rank = new Uint8Array(positions.count);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
  function union(a, b) {
    a = find(a); b = find(b);
    if (a === b) return;
    if (rank[a] < rank[b]) [a, b] = [b, a];
    parent[b] = a;
    if (rank[a] === rank[b]) rank[a]++;
  }
  for (let t = 0; t < triCount; t++) {
    const i0 = indexArr[t * 3], i1 = indexArr[t * 3 + 1], i2 = indexArr[t * 3 + 2];
    union(i0, i1); union(i1, i2);
  }

  const componentTris = new Map();
  for (let t = 0; t < triCount; t++) {
    const root = find(indexArr[t * 3]);
    if (!componentTris.has(root)) componentTris.set(root, []);
    componentTris.get(root).push(t);
  }

  const significant = [];
  const fragmentTris = [];
  for (const [, tris] of componentTris) {
    if (tris.length >= threshold) significant.push(tris);
    else fragmentTris.push(...tris);
  }
  if (significant.length <= 1 && fragmentTris.length === 0) return null;

  const triangleToIsland = new Int32Array(triCount).fill(-1);
  for (let i = 0; i < significant.length; i++) {
    for (const t of significant[i]) triangleToIsland[t] = i;
  }

  function buildIslandMesh(tris) {
    const vertMap = new Map();
    let newIdx = 0;
    const newIndices = [];
    for (const t of tris) {
      for (let j = 0; j < 3; j++) {
        const vi = indexArr[t * 3 + j];
        if (!vertMap.has(vi)) vertMap.set(vi, newIdx++);
        newIndices.push(vertMap.get(vi));
      }
    }
    const vc = vertMap.size;
    const pos = new Float32Array(vc * 3);
    const nrm = normals ? new Float32Array(vc * 3) : null;
    const uv = uvs ? new Float32Array(vc * 2) : null;
    let cx = 0, cy = 0, cz = 0;
    for (const [oldVi, newVi] of vertMap) {
      const x = positions.getX(oldVi), y = positions.getY(oldVi), z = positions.getZ(oldVi);
      pos[newVi * 3] = x; pos[newVi * 3 + 1] = y; pos[newVi * 3 + 2] = z;
      cx += x; cy += y; cz += z;
      if (nrm) { nrm[newVi * 3] = normals.getX(oldVi); nrm[newVi * 3 + 1] = normals.getY(oldVi); nrm[newVi * 3 + 2] = normals.getZ(oldVi); }
      if (uv) { uv[newVi * 2] = uvs.getX(oldVi); uv[newVi * 2 + 1] = uvs.getY(oldVi); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    if (nrm) g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
    if (uv) g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(newIndices), 1));
    const m = new THREE.Mesh(g, mesh.material.clone());
    const center = new THREE.Vector3(cx / vc, cy / vc, cz / vc);
    return { mesh: m, faceCount: tris.length, center };
  }

  const results = significant.map((tris, i) => {
    const r = buildIslandMesh(tris);
    r.mesh.name = `${mesh.name}_island${i}`;
    return r;
  });
  if (fragmentTris.length > 0) {
    const r = buildIslandMesh(fragmentTris);
    r.mesh.name = `${mesh.name}_fragments`;
    r.isFragments = true;
    results.push(r);
  }
  results.triangleToIsland = triangleToIsland;
  results.significantCount = significant.length;
  return results;
}

const SPLIT_THRESHOLD = 5; // matches AUTO_RIG_MIN_FACES in the model preview

/**
 * Apply a saved hardpoint config to a loaded glTF mothership group.
 *
 * For each entry in `config.hardpoints`:
 *   - `modelSlot.hiddenMeshNames`  (current format) — hide the original
 *     meshes by name, build a procedural ball turret at the saved position
 *   - `modelTurret.islandNames`    (legacy format)   — best-effort hide of
 *     names that ARE present, build a procedural ball turret at the saved
 *     position. The original ball geometry may stay visible because island
 *     names like `Object_NN_island5` only exist after a runtime split.
 *   - `drone_bay` type — build a procedural bay marker
 *
 * The saved positions are in the model preview's "5-unit fit" world space,
 * which is the same as the in-game wrapper's local space (the wrapper holds
 * the in-game uniform scale but not the auto-fit). So procedural turrets and
 * bays are attached to `attachGroup` (the wrapper), NOT `modelGroup` (which
 * has the auto-fit baked in and would double-apply it).
 *
 * @param {THREE.Object3D} modelGroup - loaded glTF root (auto-fit applied),
 *   used for finding/hiding meshes by name
 * @param {THREE.Object3D} attachGroup - parent for the procedural turret /
 *   bay groups. Should be the wrapper (no auto-fit, only the in-game scale).
 *   Pass `modelGroup` for old behavior (will double-apply the auto-fit).
 * @param {object|null} config - parsed save JSON, or null to skip
 * @returns {{turrets: Array, bays: Array, skipped: number}}
 */
export function applyMothershipConfig(modelGroup, attachGroup, config, opts = {}) {
  // Backward compat: old call sites passed (modelGroup, config)
  if (config === undefined && attachGroup && Array.isArray(attachGroup.hardpoints)) {
    config = attachGroup;
    attachGroup = modelGroup;
  }
  const skins = opts.skins || { small: null, heavy: null };
  const turrets = [];
  const bays = [];
  let skipped = 0;

  if (!config || !Array.isArray(config.hardpoints)) return { turrets, bays, skipped };

  // Re-split any parent meshes whose island children are referenced in the
  // saved config. The model preview tool stores names like `Object_106_island5`
  // which only exist after a runtime split — the freshly loaded glTF has the
  // ORIGINAL parent mesh (`Object_106`) but not the islands. Without this
  // step the hide loop below silently does nothing and the original ball
  // turret geometry stays visible underneath the procedural turrets.
  const parentNamesToSplit = new Set();
  for (const hp of config.hardpoints) {
    const names = hp.modelSlot?.hiddenMeshNames || hp.modelTurret?.islandNames || [];
    for (const name of names) {
      const m = /^(.+)_island\d+$/.exec(name);
      if (m) parentNamesToSplit.add(m[1]);
    }
  }
  for (const parentName of parentNamesToSplit) {
    let target = null;
    modelGroup.traverse((c) => { if (!target && c.isMesh && c.name === parentName) target = c; });
    if (!target) continue;
    const result = splitMeshByIslands(target, SPLIT_THRESHOLD);
    if (!result) continue;
    const par = target.parent;
    par.remove(target);
    for (const r of result) par.add(r.mesh);
  }

  // Index meshes by name for fast lookup (built AFTER the split so the new
  // island meshes are findable)
  const meshesByName = new Map();
  modelGroup.traverse((c) => {
    if (c.isMesh && c.name) meshesByName.set(c.name, c);
  });

  // Tier the slot hardpoints by aft-ness so different positions get
  // different weapon types. Saved hp.position uses the gltf's natural
  // orientation where +X is the bow direction (per the wrapper's static
  // -π/2 Y rotation in mothership.js), so MOST NEGATIVE x is most aft.
  //
  // Tier layout (see combat/weapon-catalog.md):
  //   tier 1 — back pair (2)        → heavy-railgun  (long-range AP precision)
  //   tier 2 — mid-aft pair (2)     → guided-missile (PID-homing)
  //   tier 3 — mid pair (2)         → flak-burst + shield-breaker (port/starboard split)
  //   tier 4 — bridge cluster (3)   → point-defense-pulse + arc-emitter (centre)
  //
  // Visually: heavy ball turret in back two, missile revolvers next, ball
  // turrets in the middle pair (different colors per side), and the bridge
  // cluster gets small PD ball turrets with one centre arc-emitter.
  const slotHps = config.hardpoints.filter(h => {
    const names = h.modelSlot?.hiddenMeshNames || h.modelTurret?.islandNames;
    return Array.isArray(names) && names.length > 0 && h.type !== "drone_bay";
  });
  const sortedByAft = [...slotHps].sort((a, b) => a.position.x - b.position.x);
  const backTwoSet = new Set(sortedByAft.slice(0, 2));
  const missileSet = new Set(sortedByAft.slice(2, 4));
  const midPairSet = new Set(sortedByAft.slice(4, 6));
  // Pick which side of the mid pair gets flak vs shield-breaker — sort by
  // Z (port/starboard) so it's deterministic.
  const midPairSorted = [...sortedByAft.slice(4, 6)].sort((a, b) => a.position.z - b.position.z);
  const midPairFlak = midPairSorted[0];
  // Centre bridge slot is the middle Y coord of whatever's left after the
  // mid pair — among the remaining slots, pick the one with median z.
  const remainingHps = sortedByAft.slice(6);
  const remainingByZ = [...remainingHps].sort((a, b) => a.position.z - b.position.z);
  const arcEmitterHp = remainingByZ[Math.floor(remainingByZ.length / 2)] || null;

  for (const hp of config.hardpoints) {
    const position = new THREE.Vector3(hp.position.x, hp.position.y, hp.position.z);
    const normal = new THREE.Vector3(hp.normal.x, hp.normal.y, hp.normal.z);

    // Bay first
    if (hp.type === "drone_bay") {
      const built = buildDroneBay(position, normal);
      attachGroup.add(built.group);
      bays.push({
        name: hp.name || "Drone Bay",
        position: position.clone(),
        normal: normal.clone(),
        group: built.group,
      });
      continue;
    }

    // Either format that maps to a ball turret slot
    const meshNamesToHide = hp.modelSlot?.hiddenMeshNames
      || hp.modelTurret?.islandNames
      || null;
    const isTurretSlot = Array.isArray(meshNamesToHide) && meshNamesToHide.length > 0;

    if (!isTurretSlot) {
      skipped++;
      continue;
    }

    // Look up the source meshes in the (now-split) modelGroup. The first
    // entry in hiddenMeshNames is the ball island; the rest are the gun /
    // detail attachments. Order is preserved so buildTurretFromMesh can
    // treat element [0] as the rotation center.
    const sourceMeshes = [];
    for (const name of meshNamesToHide) {
      const mesh = meshesByName.get(name);
      if (mesh) sourceMeshes.push(mesh);
    }

    // Leave the artist's slot meshes VISIBLE — the procedural turret gets
    // overlaid on top at the same position (saved hp.position is the bbox
    // center of the original artist ball island). User sees the artist art
    // for the static "ball turret" visual + the procedural rotating barrel
    // on top for aim and laser firing.
    //
    // We tried hiding them and using only procedurals, but with the SD's
    // 9-rigged-slot config, three of the slots are stacked at the bridge
    // tower (sensor domes the auto-rig grouped together), so only one
    // procedural turret was visible up there. Keeping the artist art visible
    // means every slot has SOMETHING to look at even when procedurals
    // overlap.

    // Per-slot weapon decision. weaponType stays as the hardware kind
    // (laser ball / heavy ball / missile revolver) — that decides which
    // procedural mesh + state machine the turret runs. attackId carries
    // the tactical config (damage, targeting rules, homing, flak) which
    // the TurretSystem looks up via getAttack(turret.attackId).
    const isHeavy = backTwoSet.has(hp);
    const isMissile = !isHeavy && missileSet.has(hp);
    const isMidPair = !isHeavy && !isMissile && midPairSet.has(hp);
    const isArcEmitter = !isHeavy && !isMissile && !isMidPair && hp === arcEmitterHp;

    let built;
    let weaponType;
    let attackId;
    if (isMissile) {
      built = buildMissileLauncher(position, normal, {
        baseR: 0.10,
        baseH: 0.04,
        revolverR: 0.16,
        revolverL: 0.30,
        tubeR: 0.045,
        tubeOffsetR: 0.10,
        tipL: 0.06,
        color: 0x556677,
        accentColor: 0xff8844,
      });
      weaponType = "missile_launcher";
      attackId = "guided-missile";
    } else if (isHeavy) {
      // Visually a chunky ball turret with a long thick barrel — railgun
      // bore. Hardware path is "laser" (hitscan beam) because the railgun
      // attack def is speed 0; the heavy_cannon projectile path is reserved
      // for slow visible-bolt weapons (none in the v2 catalog).
      built = buildBallTurret(position, normal, {
        baseR: 0.18,
        baseH: 0.07,
        barrelR: 0.06,
        barrelL: 0.55,
        headR: 0.24,
        color: 0xddddee, // pale silver — railgun barrel reads as kinetic
      });
      weaponType = "laser";
      attackId = "heavy-railgun";
    } else if (isMidPair) {
      // Mid pair: port side gets flak (yellow projectile bolts), starboard
      // gets shield-breaker (cyan beam burst). Both use a medium-sized ball
      // turret. The flak side fires through the projectile pool (speed > 0)
      // while the shield-breaker uses the hitscan beam path (speed 0).
      const isFlakSide = hp === midPairFlak;
      built = buildBallTurret(position, normal, {
        baseR: 0.06,
        baseH: 0.020,
        barrelR: 0.018,
        barrelL: 0.18,
        headR: 0.06,
        color: isFlakSide ? 0xffbb33 : 0x66ffff,
      });
      weaponType = isFlakSide ? "heavy_cannon" : "laser";
      attackId = isFlakSide ? "flak-burst" : "shield-breaker";
    } else if (isArcEmitter) {
      built = buildBallTurret(position, normal, {
        baseR: 0.040,
        baseH: 0.016,
        barrelR: 0.012,
        barrelL: 0.12,
        headR: 0.040,
        color: 0xcc66ff, // purple
      });
      weaponType = "laser";
      attackId = "arc-emitter";
    } else {
      // Tier 4 PD pulse — fast small turret
      built = buildBallTurret(position, normal, {
        // Sized so the bridge tower's 3 stacked turret slots (closest
        // pair 0.69 m apart in world space) don't have overlapping
        // sphere heads. headR 0.035 local × wrapper scale 8 = 0.28 m
        // world radius → 0.56 m diameter, leaves ~0.13 m clearance.
        baseR: 0.035,
        baseH: 0.014,
        barrelR: 0.010,
        barrelL: 0.10,
        headR: 0.035,
        color: 0x66ddff, // pale blue PD
      });
      weaponType = "laser";
      attackId = "point-defense-pulse";
    }

    built.barrelYawOffset = 0;
    built.barrelPitchOffset = 0;
    attachGroup.add(built.group);

    // Apply the saved texture skin (if any). Missile launcher uses the
    // heavy skin (closest match in vibe — both are "big weapon" tier).
    applyTurretSkin(built, (isHeavy || isMissile) ? skins.heavy : skins.small);

    const usedSourceMesh = false;

    turrets.push({
      name: hp.name || "Turret",
      type: hp.type || "ball_turret",
      // Per-turret weapon kind. The TurretSystem reads this to choose
      // between the hitscan laser pool, the projectile pool, and the
      // missile launcher state machine.
      weaponType,
      // Tactical attack def the TurretSystem looks up via getAttack(). All
      // damage / range / fire rate / targeting rules / homing / flak comes
      // from this id, so adding new weapons is a data-only change.
      attackId,
      position: position.clone(),
      normal: normal.clone(),
      yawArc: [hp.yawMin ?? -180, hp.yawMax ?? 180],
      pitchArc: [hp.pitchMin ?? -10, hp.pitchMax ?? 60],
      group: built.group,
      yawPivot: built.yawPivot,
      pitchPivot: built.pitchPivot,
      muzzleLocal: built.muzzleLocal,
      barrelYawOffset: built.barrelYawOffset,
      barrelPitchOffset: built.barrelPitchOffset,
      // Missile-launcher-only fields (state machine references)
      hideTransform: built.hideTransform,
      revolver: built.revolver,
      tubes: built.tubes,
      missileTips: built.missileTips,
      // Active by default; the upgrade/progression system flips this. When
      // false, the visible mesh is hidden and the turret is skipped in the
      // per-frame aim/fire loop.
      active: true,
      usedSourceMesh,
      sourceMeshes, // kept so setActive can hide/show them
    });
  }

  return { turrets, bays, skipped };
}

// ============================================================
// AIMING — shared between model preview and in-game turret system
// ============================================================
const _targetLocal = new THREE.Vector3();
const _tempMatrix = new THREE.Matrix4();

/**
 * Aim a rigged turret at a world-space target. Lerps the yaw/pitch pivots
 * toward the desired aim each frame and clamps to the firing arc. Returns
 * whether the target is actually in the turret's hemisphere (`canFire`) so
 * the caller knows whether to pull the trigger.
 *
 * The turret object must look like:
 *   {
 *     group:        THREE.Object3D,  // the root with position+rotation
 *     yawPivot:     THREE.Object3D,
 *     pitchPivot:   THREE.Object3D,
 *     yawArc:       [minDeg, maxDeg],   // OR yawMin, yawMax
 *     pitchArc:     [minDeg, maxDeg],   // OR pitchMin, pitchMax
 *     barrelYawOffset:   0,             // optional offset for unaligned barrels
 *     barrelPitchOffset: 0,
 *     currentYaw / currentPitch:        // mutated by this function
 *   }
 *
 * @returns {{canFire: boolean}}
 */
export function aimTurret(turret, targetWorld, dt) {
  if (!turret.yawPivot || !turret.group) return { canFire: false };

  // Make sure matrixWorld is current — for in-game callers the parent ship
  // moves around and rotates each frame, so a stale matrix would alias
  // every turret to the ship's last position.
  turret.group.updateMatrixWorld(true);
  _tempMatrix.copy(turret.group.matrixWorld).invert();
  _targetLocal.copy(targetWorld).applyMatrix4(_tempMatrix);

  // Line-of-sight gate: target must be on the OUTWARD side of the turret's
  // local +Y (which is aligned with the surface normal).
  const inFiringHemisphere = _targetLocal.y > 0.05;

  const yawArc = turret.yawArc || [turret.yawMin ?? -180, turret.yawMax ?? 180];
  const pitchArc = turret.pitchArc || [turret.pitchMin ?? -10, turret.pitchMax ?? 60];
  const barrelYawOffset = turret.barrelYawOffset || 0;
  const barrelPitchOffset = turret.barrelPitchOffset || 0;

  let desiredYaw = Math.atan2(_targetLocal.x, _targetLocal.z) - barrelYawOffset;
  const horizDist = Math.sqrt(_targetLocal.x * _targetLocal.x + _targetLocal.z * _targetLocal.z);
  let desiredPitch = Math.atan2(_targetLocal.y, horizDist) - barrelPitchOffset;

  desiredYaw = THREE.MathUtils.clamp(desiredYaw, THREE.MathUtils.degToRad(yawArc[0]), THREE.MathUtils.degToRad(yawArc[1]));
  desiredPitch = THREE.MathUtils.clamp(desiredPitch, THREE.MathUtils.degToRad(pitchArc[0]), THREE.MathUtils.degToRad(pitchArc[1]));

  if (turret.currentYaw === undefined) turret.currentYaw = 0;
  if (turret.currentPitch === undefined) turret.currentPitch = 0;
  const trackSpeed = turret.trackSpeed ?? 3.0;
  turret.currentYaw = THREE.MathUtils.lerp(turret.currentYaw, desiredYaw, 1 - Math.exp(-trackSpeed * dt));
  turret.currentPitch = THREE.MathUtils.lerp(turret.currentPitch, desiredPitch, 1 - Math.exp(-trackSpeed * dt));

  turret.yawPivot.rotation.y = turret.currentYaw;
  turret.pitchPivot.rotation.x = -turret.currentPitch;

  // Aim tolerance gate: only report canFire when the rotation lerp has
  // actually settled close to the desired aim. ~3° (0.05 rad) gives a
  // perceptible "wait for it" delay before the laser pulses.
  const yawError = Math.abs(turret.currentYaw - desiredYaw);
  const pitchError = Math.abs(turret.currentPitch - desiredPitch);
  const aimReady = yawError < 0.05 && pitchError < 0.05;

  return { canFire: inFiringHemisphere && aimReady };
}

// ============================================================
// LASER POOL — pooled cylinders for weapon FX
// ============================================================
/**
 * Create a pool of laser-beam meshes that callers can fire on demand. Each
 * laser is a thin cylinder stretched between two world-space points, fades
 * out over LIFETIME seconds, then returns to the pool.
 *
 * @param {THREE.Scene} scene
 * @param {object} [opts]
 * @param {number} [opts.poolSize=40]
 * @param {number} [opts.lifetime=0.18]
 * @param {number} [opts.color=0x66ff88]
 * @param {number} [opts.radius=0.022]  cylinder radius in world units
 * @param {number} [opts.opacity=0.95]
 */
export function createLaserPool(scene, opts = {}) {
  const POOL_SIZE = opts.poolSize ?? 40;
  const LIFETIME = opts.lifetime ?? 0.18;
  const COLOR = opts.color ?? 0x66ff88;
  const RADIUS = opts.radius ?? 0.022;
  const OPACITY_MAX = opts.opacity ?? 0.95;

  const lasers = [];
  const geom = new THREE.CylinderGeometry(RADIUS, RADIUS, 1, 8, 1, true);
  geom.rotateX(Math.PI / 2); // along +Z so we can stretch with scale.z

  for (let i = 0; i < POOL_SIZE; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: COLOR, transparent: true, opacity: OPACITY_MAX, depthWrite: false,
    });
    const m = new THREE.Mesh(geom, mat);
    m.visible = false;
    m.renderOrder = 1500;
    scene.add(m);
    lasers.push({ mesh: m, lifetime: 0 });
  }

  const _mid = new THREE.Vector3();

  return {
    /** Fire one laser pulse from `fromPos` to `toPos` (both world-space). */
    fire(fromPos, toPos) {
      let laser = null;
      for (const l of lasers) if (l.lifetime <= 0) { laser = l; break; }
      if (!laser) return; // pool exhausted, drop the shot
      laser.lifetime = LIFETIME;
      laser.mesh.visible = true;
      laser.mesh.material.opacity = OPACITY_MAX;
      _mid.copy(fromPos).add(toPos).multiplyScalar(0.5);
      const dist = fromPos.distanceTo(toPos);
      laser.mesh.position.copy(_mid);
      laser.mesh.scale.set(1, 1, dist);
      laser.mesh.lookAt(toPos);
    },

    /** Per-frame update — fades active lasers out and returns them to pool. */
    update(dt) {
      for (const l of lasers) {
        if (l.lifetime <= 0) continue;
        l.lifetime -= dt;
        if (l.lifetime <= 0) {
          l.mesh.visible = false;
        } else {
          l.mesh.material.opacity = OPACITY_MAX * (l.lifetime / LIFETIME);
        }
      }
    },

    /** Hide and reset every laser in the pool (e.g., when leaving sim). */
    clear() {
      for (const l of lasers) {
        l.lifetime = 0;
        l.mesh.visible = false;
      }
    },

    /** Free the GPU resources held by the pool. */
    dispose() {
      for (const l of lasers) {
        scene.remove(l.mesh);
        l.mesh.material.dispose();
      }
      geom.dispose();
    },
  };
}

// ============================================================
// PROJECTILE POOL — pooled velocity-based bolts for heavy cannons
// ============================================================
/**
 * Pool of glowing projectile bolts that travel with a velocity instead of
 * snapping instantly to the target. On reaching the target (or expiring),
 * the caller is responsible for spawning the impact effect — this pool
 * just handles the visible bolt + the per-frame transform update.
 *
 * Each fire() returns the projectile object so the caller can store the
 * target/damage/AOE radius and check for impact in its own update.
 *
 * @param {THREE.Scene} scene
 * @param {object} [opts]
 * @param {number} [opts.poolSize=20]
 * @param {number} [opts.color=0xffaa44]
 * @param {number} [opts.size=1.0]      sphere radius in world units
 * @param {number} [opts.trailLength=4] stretched-along-velocity bonus length
 */
export function createProjectilePool(scene, opts = {}) {
  const POOL_SIZE = opts.poolSize ?? 20;
  const COLOR = opts.color ?? 0xffaa44;
  const SIZE = opts.size ?? 1.0;
  const TRAIL = opts.trailLength ?? 4;

  // Glowing sphere geo, slightly stretched along Z so it reads as a "bolt"
  // when the mesh is oriented along the velocity vector via lookAt().
  const geom = new THREE.SphereGeometry(SIZE, 10, 8);
  geom.scale(1, 1, 1 + TRAIL);

  const projectiles = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: COLOR,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.visible = false;
    mesh.renderOrder = 1500;
    mesh.frustumCulled = false;
    scene.add(mesh);
    projectiles.push({
      mesh,
      alive: false,
      // populated on fire()
      x: 0, y: 0, z: 0,
      vx: 0, vy: 0, vz: 0,
      target: null,
      damage: 0,
      aoeRadius: 0,
      lifetime: 0,
      onImpact: null,
      // Homing config — when set, the projectile steers toward p.target each
      // frame using a PID-style update (proportional to position error,
      // derivative reads target velocity). maxTurn caps the per-second
      // angular change so a small fast target can outmaneuver the missile.
      homing: null,
      speed: 0, // cached scalar speed for homing renormalization
      // Flak fuse — when armDist > 0, after travelling armDist meters the
      // projectile checks for ANY alive enemy within detonationRange and
      // detonates as soon as one is found (not just its assigned target).
      // getEnemies() is called from the pool update; the caller passes it
      // through fire() so the pool stays decoupled from main.js.
      flakArmDist: 0,
      flakDetonationRange: 0,
      flakArmed: false,
      getFlakEnemies: null,
      distTraveled: 0,
    });
  }

  const _lookTarget = new THREE.Vector3();
  const _steerVec = new THREE.Vector3();
  const _toTarget = new THREE.Vector3();
  const _newVel = new THREE.Vector3();

  return {
    /**
     * Fire one projectile from `from` toward a target.
     *
     * @param {THREE.Vector3} from         world muzzle position
     * @param {THREE.Vector3} dir          unit-length world direction (barrel forward)
     * @param {object} cfg                 { speed, damage, aoeRadius, lifetime, target, onImpact }
     */
    fire(from, dir, cfg) {
      let p = null;
      for (const proj of projectiles) if (!proj.alive) { p = proj; break; }
      if (!p) return null;
      p.alive = true;
      p.x = from.x; p.y = from.y; p.z = from.z;
      p.vx = dir.x * cfg.speed;
      p.vy = dir.y * cfg.speed;
      p.vz = dir.z * cfg.speed;
      p.speed = cfg.speed;
      p.target = cfg.target || null;
      p.damage = cfg.damage || 0;
      p.aoeRadius = cfg.aoeRadius || 0;
      p.lifetime = cfg.lifetime || 4.0;
      p.onImpact = cfg.onImpact || null;
      // Optional PID homing config: { kp, kd, maxTurn }
      p.homing = cfg.homing || null;
      // Optional flak fuse config — pool calls getFlakEnemies() each frame
      // to check for nearby enemies after the arming distance is reached.
      p.flakArmDist = cfg.flakArmingDistance || 0;
      p.flakDetonationRange = cfg.flakDetonationRange || 0;
      p.flakArmed = false;
      p.getFlakEnemies = cfg.getFlakEnemies || null;
      p.distTraveled = 0;
      p.mesh.visible = true;
      p.mesh.material.opacity = 1.0;
      p.mesh.position.set(from.x, from.y, from.z);
      _lookTarget.set(from.x + dir.x, from.y + dir.y, from.z + dir.z);
      p.mesh.lookAt(_lookTarget);
      return p;
    },

    /**
     * Per-frame update — moves all live projectiles, expires the dead ones,
     * checks proximity to their assigned target. The caller's onImpact
     * callback is invoked once when proximity is hit OR lifetime runs out.
     */
    update(dt) {
      for (const p of projectiles) {
        if (!p.alive) continue;

        // ─── PID homing ────────────────────────────────────────
        // Steers the velocity vector toward the target using:
        //   accel = kp × (toTarget) + kd × (targetVelocity)
        // The proportional term chases the target's current position;
        // the derivative term reads the target's velocity so the missile
        // pre-empts where it's going. Total angular change per frame is
        // capped by maxTurn so a fast target can outrun the lock.
        if (p.homing && p.target?.position && (!p.target.stats || p.target.stats.hull > 0)) {
          const tp = p.target.position;
          _toTarget.set(tp.x - p.x, tp.y - p.y, tp.z - p.z);
          const distToTarget = _toTarget.length();
          if (distToTarget > 0.001) {
            _toTarget.multiplyScalar(1 / distToTarget); // unit vector
          }
          // proportional: pull velocity toward target direction at kp
          _steerVec.copy(_toTarget).multiplyScalar(p.homing.kp * p.speed);
          // derivative: add scaled target velocity (lead)
          const tv = p.target.velocity;
          if (tv) {
            _steerVec.x += (tv.x ?? 0) * p.homing.kd;
            _steerVec.y += (tv.y ?? 0) * p.homing.kd;
            _steerVec.z += (tv.z ?? 0) * p.homing.kd;
          }
          // desired velocity = current + steer × dt
          _newVel.set(p.vx + _steerVec.x * dt, p.vy + _steerVec.y * dt, p.vz + _steerVec.z * dt);
          // Cap angular change rate using maxTurn (rad/s)
          const curLen = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz);
          const newLen = _newVel.length();
          if (curLen > 0.001 && newLen > 0.001) {
            // angle between current and desired velocity
            let cosA = (p.vx * _newVel.x + p.vy * _newVel.y + p.vz * _newVel.z) / (curLen * newLen);
            cosA = Math.max(-1, Math.min(1, cosA));
            const angle = Math.acos(cosA);
            const maxAngle = p.homing.maxTurn * dt;
            if (angle > maxAngle && angle > 0) {
              // slerp current toward _newVel by maxAngle/angle
              const t = maxAngle / angle;
              _newVel.set(
                p.vx + (_newVel.x - p.vx) * t,
                p.vy + (_newVel.y - p.vy) * t,
                p.vz + (_newVel.z - p.vz) * t,
              );
            }
            // Renormalize to preserve speed
            const finalLen = _newVel.length();
            if (finalLen > 0.001) {
              const k = p.speed / finalLen;
              p.vx = _newVel.x * k;
              p.vy = _newVel.y * k;
              p.vz = _newVel.z * k;
            }
          }
          // Reorient mesh along new velocity for trail readability
          _lookTarget.set(p.x + p.vx, p.y + p.vy, p.z + p.vz);
          p.mesh.lookAt(_lookTarget);
        }

        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        const stepLen = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz) * dt;
        p.distTraveled += stepLen;
        p.lifetime -= dt;
        p.mesh.position.set(p.x, p.y, p.z);

        let hit = false;

        // ─── Flak proximity fuse ───────────────────────────────
        // After arming, detonate as soon as ANY alive enemy comes within
        // detonationRange. Independent of the assigned target — that's the
        // whole point of flak: it's an area weapon, not a single-target
        // weapon. The pool stays scene-agnostic by reading enemies through
        // the per-shot getFlakEnemies callback.
        if (p.flakArmDist > 0 && p.flakDetonationRange > 0) {
          if (!p.flakArmed && p.distTraveled >= p.flakArmDist) p.flakArmed = true;
          if (p.flakArmed && p.getFlakEnemies) {
            const flakList = p.getFlakEnemies();
            const r = p.flakDetonationRange;
            const r2 = r * r;
            if (flakList) {
              for (const e of flakList) {
                if (!e || !e.position) continue;
                if (e.stats && e.stats.hull <= 0) continue;
                const dx = e.position.x - p.x;
                const dy = e.position.y - p.y;
                const dz = e.position.z - p.z;
                if (dx * dx + dy * dy + dz * dz < r2) { hit = true; break; }
              }
            }
          }
        }

        // ─── Standard target proximity (non-flak path) ─────────
        if (!hit && p.target && p.target.position && (!p.target.stats || p.target.stats.hull > 0)) {
          const dx = p.target.position.x - p.x;
          const dy = p.target.position.y - p.y;
          const dz = p.target.position.z - p.z;
          const distSq = dx * dx + dy * dy + dz * dz;
          // Proximity hit when within ~1 second of travel time of the target
          // OR within the AOE radius — whichever is closer.
          const proxRadius = Math.max(p.aoeRadius * 0.4, 8);
          if (distSq < proxRadius * proxRadius) hit = true;
        }
        if (p.lifetime <= 0) hit = true;

        if (hit) {
          if (p.onImpact) p.onImpact({ x: p.x, y: p.y, z: p.z });
          p.alive = false;
          p.mesh.visible = false;
        }
      }
    },

    clear() {
      for (const p of projectiles) {
        p.alive = false;
        p.mesh.visible = false;
      }
    },

    dispose() {
      for (const p of projectiles) {
        scene.remove(p.mesh);
        p.mesh.material.dispose();
      }
      geom.dispose();
    },
  };
}

