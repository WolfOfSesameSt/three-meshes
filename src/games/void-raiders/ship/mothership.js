/**
 * Mothership — the player's deployable vessel.
 *
 * Two render paths:
 *   1. Loaded glTF (e.g. Star Destroyer Detailed) with procedural ball turret
 *      slots applied from a saved hardpoint config — see Mothership.create().
 *   2. Procedural fallback — a low-poly angular hull built from primitives.
 *      Used when no hardpoint config is in localStorage or the glTF fails to
 *      load. Tests use this path so they don't need a real glTF loader.
 *
 * Follows a pre-planned route through the realm.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { applyMothershipConfig, loadActiveTurretSkins } from "./turret-rigger.js";
import { RepairBay } from "./repair-bay.js";

// In-game scale of the loaded glTF mothership relative to its source units.
// The model preview auto-fits ships to ~5 world units across; we scale the
// wrapper to make the in-game ship read at a sensible size next to terrain
// and drones. Bump this if the ship feels too small.
const MOTHERSHIP_SCALE = 8;
// Y-axis rotation applied to the loaded model so its bow points along the
// game's forward direction. The movement system uses
// `rotation.y = atan2(nx, nz)`, which aligns the ship's LOCAL +Z with the
// motion direction — so "forward in local space" = local +Z. The Star
// Destroyer Detailed is authored with its bow along +X, so a -90° rotation
// (-π/2) around Y maps the bow from +X to +Z. Flip the sign if you swap to
// a model that faces the other way.
const MOTHERSHIP_ROTATION_Y = -Math.PI / 2;
const MOTHERSHIP_MODEL_PATH = "/models/star-destroyer/scene.gltf";
const MOTHERSHIP_CONFIG_KEY = "ship-hp-star-destroyer";

/**
 * Build the procedural fallback mesh — a low-poly angular hull.
 * @returns {THREE.Group}
 */
function createMothershipMesh() {
  const group = new THREE.Group();

  // Main hull — elongated octahedron shape
  const hullGeometry = new THREE.BufferGeometry();
  const hullVerts = new Float32Array([
    // Top
    0, 4, 0,
    // Front
    0, 0, -20,
    // Right
    8, 0, 0,
    // Back
    0, 1, 14,
    // Left
    -8, 0, 0,
    // Bottom
    0, -2, 0,
  ]);
  const hullIndices = [
    // Top faces
    0, 1, 2,
    0, 2, 3,
    0, 3, 4,
    0, 4, 1,
    // Bottom faces
    5, 2, 1,
    5, 3, 2,
    5, 4, 3,
    5, 1, 4,
  ];
  hullGeometry.setAttribute("position", new THREE.Float32BufferAttribute(hullVerts, 3));
  hullGeometry.setIndex(hullIndices);
  hullGeometry.computeVertexNormals();

  const hullMaterial = new THREE.MeshStandardMaterial({
    color: 0x334455,
    roughness: 0.4,
    metalness: 0.7,
    flatShading: true,
  });

  const hull = new THREE.Mesh(hullGeometry, hullMaterial);
  group.add(hull);

  // Engine glow — two small emissive spheres at the back
  const engineGeo = new THREE.SphereGeometry(1.2, 6, 4);
  const engineMat = new THREE.MeshBasicMaterial({ color: 0x4488ff });

  const engineL = new THREE.Mesh(engineGeo, engineMat);
  engineL.position.set(-3, 0, 12);
  group.add(engineL);

  const engineR = new THREE.Mesh(engineGeo, engineMat);
  engineR.position.set(3, 0, 12);
  group.add(engineR);

  // Bridge — small raised section on top
  const bridgeGeo = new THREE.BoxGeometry(3, 1.5, 4);
  const bridgeMat = new THREE.MeshStandardMaterial({
    color: 0x556677,
    roughness: 0.3,
    metalness: 0.8,
    flatShading: true,
  });
  const bridge = new THREE.Mesh(bridgeGeo, bridgeMat);
  bridge.position.set(0, 4.5, -4);
  group.add(bridge);

  return group;
}

/**
 * Mothership entity with systems and state.
 *
 * Use `await Mothership.create()` to get one with the SD Detailed glTF +
 * configured slots loaded. The bare constructor returns the procedural
 * fallback only — kept exported because tests + helpers may want it.
 */
export class Mothership {
  constructor() {
    this.mesh = createMothershipMesh();
    this.mesh.position.set(0, 30, 0);

    // Configured slots (populated by Mothership.create() when a saved
    // hardpoint config is available). Empty for the procedural fallback.
    this.turrets = []; // ball turret slots — { yawPivot, pitchPivot, muzzleLocal, ... }
    this.bays = [];    // drone bay slots — { position, normal, group }

    // Shield bubble radius — main.js reads this when constructing the
    // shield. Default fits the procedural octahedron mesh. Mothership.create()
    // overrides it from the loaded model's bounding box.
    this.shieldRadius = 14;

    // Last impact position recorded by takeDamage — main.js consumes this
    // each frame to ripple the shield bubble at the actual hit point instead
    // of a random angle. Cleared after consumption.
    this.lastShieldImpact = null;

    // Core systems
    this.systems = {
      hull: 1000,
      hullMax: 1000,
      shields: 500,
      shieldsMax: 500,
      energy: 100,
      energyMax: 100,
      energyProduction: 10,
    };

    // Tesseract storage
    this.tesseract = {
      capacity: 10000,
      contents: {},
    };

    // Route
    this.route = [];
    this.routeIndex = 0;
    this.speed = 0; // m/s, set by movement system

    // State
    this.alive = true;

    // Death callback — set by main.js to trigger mission failure
    this.onDeath = null;

    // Repair bay — heals drones that return with retreat="damaged".
    // Config is rebuilt from research modifiers at mission start via
    // applyResearchModifiers(gameState.research). See get position()
    // below — the bay uses it to eject repaired drones near the hull.
    this.repairBay = new RepairBay(this);
  }

  /**
   * Async factory: load the SD Detailed glTF, look up a saved hardpoint
   * config in localStorage, apply it (hide slot meshes + build procedural
   * turrets + register bays), and return a fully-configured Mothership.
   *
   * Falls back to the bare procedural mesh if anything fails — the game
   * still launches even without a configured ship.
   *
   * @returns {Promise<Mothership>}
   */
  static async create() {
    const ship = new Mothership();

    // Skip glTF loading entirely if there's no saved config — keep the
    // procedural fallback that the constructor already built.
    //
    // Resolution order:
    //   1. localStorage (model preview saves here after each edit)
    //   2. Committed repo file at /ships/star-destroyer.json
    //      (written by the "Commit to repo" button in the model preview)
    //   3. None → procedural fallback
    let savedConfig = null;
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(MOTHERSHIP_CONFIG_KEY) : null;
      if (raw) savedConfig = JSON.parse(raw);
    } catch {
      savedConfig = null;
    }
    if (!savedConfig || !Array.isArray(savedConfig.hardpoints) || savedConfig.hardpoints.length === 0) {
      // Fall back to the committed repo file. This is how a fresh browser
      // with no localStorage still loads the full turret loadout.
      try {
        const res = await fetch("/ships/star-destroyer.json");
        if (res.ok) {
          const body = await res.json();
          if (body && Array.isArray(body.hardpoints) && body.hardpoints.length > 0) {
            savedConfig = body;
            console.log("[Mothership] Loaded committed hardpoint config from /ships/star-destroyer.json");
          }
        }
      } catch (err) {
        // File not present yet — expected before the first commit
      }
    }
    if (!savedConfig || !Array.isArray(savedConfig.hardpoints) || savedConfig.hardpoints.length === 0) {
      console.log("[Mothership] No saved hardpoint config — using procedural fallback");
      return ship;
    }

    try {
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(MOTHERSHIP_MODEL_PATH);
      const root = gltf.scene;

      // Auto-fit the loaded model to the same ~5-unit space the model preview
      // tool used when the hardpoints were saved, so the saved coordinates
      // line up exactly with the model geometry.
      const box = new THREE.Box3().setFromObject(root);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const fitScale = 5 / maxDim;
      root.scale.setScalar(fitScale);
      root.position.sub(center.multiplyScalar(fitScale));

      // Two-layer wrapping:
      //   outer  ← what main.js / shield / movement attach to (UNSCALED, so
      //            things added to it stay at world units — no shield blow-up)
      //   wrapper ← carries the in-game scale + the static rotation that
      //             aligns the model's bow with the game's forward (-Z).
      //             Procedural turrets/bays are added HERE because the saved
      //             positions are in 5-unit space — wrapper's local space
      //             matches that 1:1 (only the in-game scale on top), so
      //             attaching the procedural visuals here doesn't apply the
      //             auto-fit transform a second time.
      //   root    ← the loaded glTF, in its auto-fit-to-5-units local space
      //             (the auto-fit lives on root, NOT on the procedural slots)
      const wrapper = new THREE.Group();
      wrapper.add(root);
      wrapper.scale.setScalar(MOTHERSHIP_SCALE);
      wrapper.rotation.y = MOTHERSHIP_ROTATION_Y;

      const outer = new THREE.Group();
      outer.add(wrapper);

      // Load any saved turret skins from localStorage (texture lab writes
      // them) before building the slots — applyMothershipConfig wraps each
      // procedural turret head + barrel with the appropriate map.
      const skins = await loadActiveTurretSkins();

      // Apply the saved config — build procedural ball turrets / bays
      // attached to wrapper, leaving the artist's original ball-turret
      // meshes visible underneath. The procedural turrets sit at the same
      // saved position so they overlay the artist art.
      const { turrets, bays, skipped } = applyMothershipConfig(root, wrapper, savedConfig, { skins });

      if (skipped > 0) {
        console.warn(
          `[Mothership] ${skipped}/${savedConfig.hardpoints.length} saved hardpoint(s) skipped — entries had neither modelSlot nor modelTurret. Re-run Detect in the model preview to refresh the format.`,
        );
      }
      if (turrets.length === 0 && savedConfig.hardpoints.length > 0) {
        console.warn(
          `[Mothership] Saved config has ${savedConfig.hardpoints.length} hardpoint(s) but none became turret slots. Format keys per entry:`,
          savedConfig.hardpoints.map(h => Object.keys(h).join(",")),
        );
      }

      // Swap the procedural fallback for the configured glTF mesh
      const oldMesh = ship.mesh;
      outer.position.copy(oldMesh.position);
      ship.mesh = outer;

      // Dispose of the procedural fallback geometry/materials we just orphaned
      oldMesh.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material?.dispose) c.material.dispose();
      });

      ship.turrets = turrets;
      ship.bays = bays;

      // Compute a shield radius that actually wraps this ship. Use the
      // wrapper's world-space bounding box (which includes the in-game
      // scale) and pad slightly so the bubble doesn't clip the hull.
      wrapper.updateMatrixWorld(true);
      const sizeBox = new THREE.Box3().setFromObject(wrapper);
      const sizeVec = sizeBox.getSize(new THREE.Vector3());
      const longest = Math.max(sizeVec.x, sizeVec.y, sizeVec.z);
      ship.shieldRadius = longest * 0.6;

      console.log(
        `[Mothership] Loaded ${MOTHERSHIP_MODEL_PATH} with ${turrets.length} ball turret slot(s), ${bays.length} drone bay(s), shield radius ${ship.shieldRadius.toFixed(1)}`,
      );
    } catch (err) {
      console.warn("[Mothership] Failed to load glTF, using procedural fallback:", err);
    }

    return ship;
  }

  /**
   * Toggle a turret slot on or off. Inactive slots:
   *   - skip the per-frame aim/fire loop (no rotation, no shots)
   *   - hide the visible mesh (procedural sphere/barrel OR original artist
   *     mesh, whichever was used to build the slot)
   *
   * Used by the progression / upgrade system: ship starts with most slots
   * inactive, the player buys them on as upgrades.
   *
   * @param {number} index - turret index in this.turrets
   * @param {boolean} active
   */
  setTurretActive(index, active) {
    const t = this.turrets[index];
    if (!t) return false;
    t.active = !!active;
    if (t.group) t.group.visible = t.active;
    // Reset rotation when deactivating so the next activation starts neutral
    if (!t.active) {
      if (t.yawPivot) t.yawPivot.rotation.y = 0;
      if (t.pitchPivot) t.pitchPivot.rotation.x = 0;
      t.currentYaw = 0;
      t.currentPitch = 0;
    }
    return true;
  }

  /**
   * Get the world position of a drone bay's spawn/exit point. Drones spawn
   * exactly at this point and travel along the bay's outward normal until
   * they're clear of the hull.
   *
   * @param {object} bay - entry from this.bays
   * @returns {THREE.Vector3} world-space position
   */
  bayWorldPosition(bay) {
    const v = bay.position.clone();
    bay.group.parent?.localToWorld(v); // walk up through wrapper(s) to world
    return v;
  }

  /**
   * Get the world-space outward normal of a drone bay. This is the direction
   * drones move when exiting and approach from when returning.
   *
   * @param {object} bay
   * @returns {THREE.Vector3}
   */
  bayWorldNormal(bay) {
    // Transform a local-direction vector into world space using the parent's
    // world matrix (rotation only — we don't want translation in a direction)
    const dir = bay.normal.clone();
    if (bay.group.parent) {
      bay.group.parent.updateMatrixWorld(true);
      const m = new THREE.Matrix3().getNormalMatrix(bay.group.parent.matrixWorld);
      dir.applyMatrix3(m).normalize();
    }
    return dir;
  }

  /**
   * Get world position.
   * @returns {THREE.Vector3}
   */
  get position() {
    return this.mesh.position;
  }

  /**
   * Apply damage (shields first, then hull).
   * @param {number} amount
   * @param {{x:number,y:number,z:number}} [impactPos] - world-space position
   *   of the hit, used to ripple the shield bubble at the right location.
   */
  takeDamage(amount, impactPos) {
    if (this.systems.shields > 0 && impactPos) {
      // Record the most recent shield impact so main.js can ripple from it
      this.lastShieldImpact = { x: impactPos.x, y: impactPos.y, z: impactPos.z };
    }
    if (this.systems.shields > 0) {
      const absorbed = Math.min(this.systems.shields, amount);
      this.systems.shields -= absorbed;
      amount -= absorbed;
    }
    this.systems.hull -= amount;
    if (this.systems.hull <= 0) {
      this.systems.hull = 0;
      if (this.alive) {
        this.alive = false;
        if (this.onDeath) this.onDeath();
      }
    }
  }

  /**
   * Store resources in the tesseract.
   * @param {string} resourceType
   * @param {number} amount
   * @returns {number} amount actually stored
   */
  storeResource(resourceType, amount) {
    const currentTotal = Object.values(this.tesseract.contents).reduce((a, b) => a + b, 0);
    const space = this.tesseract.capacity - currentTotal;
    const stored = Math.min(amount, space);
    this.tesseract.contents[resourceType] = (this.tesseract.contents[resourceType] || 0) + stored;
    return stored;
  }

  dispose() {
    this.mesh.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  }
}
