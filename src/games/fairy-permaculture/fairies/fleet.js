/**
 * Fairy Permaculture — fairy fleet manager.
 *
 * Owns the runtime fairy instances: their role, XP, position, mesh,
 * and per-day behavior. Plays with:
 *   - `population.js` for spawn / cap
 *   - `roles.js` for per-role work
 *   - `fairy-mesh.js` for visuals
 *   - Scheduler for per-day ticks
 *   - Juice module for marquee moments
 */

import * as THREE from "three";
import { createFairy, animateFairy } from "./fairy-mesh.js";
import { loadFairyModel } from "./fairy-library.js";
import { ROLES, levelFromXp, bonusForLevel } from "./roles.js";
import fairiesConfig from "../data/fairies.json" with { type: "json" };

const ROLE_IDS = fairiesConfig.roles.map((r) => r.id);
const SWAP_COST_DAYS = fairiesConfig.swap_cost_days ?? 1;
const SWAP_COST_FOOD = fairiesConfig.swap_cost_fairy_food_units ?? 1;

function randomRoleId(rng = Math.random) {
  return ROLE_IDS[Math.floor(rng() * ROLE_IDS.length)];
}

/**
 * Build a Fleet. The scene is optional — tests run without it.
 */
export function createFleet({ scene = null, grove = { x: 0, z: 0 }, rng = Math.random } = {}) {
  const fairies = [];
  const unassigned = []; // idle pool

  function spawn(name = "Fairy") {
    const id = fairies.length;
    const fairy = {
      id,
      name,
      role: null, // unassigned until player (or auto) picks
      xp: 0,
      x: grove.x + (rng() - 0.5) * 6,
      y: 1 + rng() * 0.5,
      z: grove.z + (rng() - 0.5) * 6,
      cooldownDaysLeft: 0,
      mesh: null,
    };
    if (scene) {
      // Show the primitive immediately so we never have a blank
      // frame, then upgrade to the library model when it resolves.
      // Fleet's stylized scale (~6 in primitive units) maps to ~3 for
      // the 2 m library model so the silhouette stays comparable.
      fairy.mesh = createFairy({ name, scale: 6 });
      fairy.mesh.position.set(fairy.x, fairy.y, fairy.z);
      scene.add(fairy.mesh);

      loadFairyModel().then((libMesh) => {
        // Fairy may have been removed (test/restart) before load completed.
        if (!fairy.mesh || !fairy.mesh.parent) return;
        libMesh.scale.setScalar(3);
        libMesh.position.copy(fairy.mesh.position);
        libMesh.rotation.copy(fairy.mesh.rotation);
        libMesh.name = name;
        scene.remove(fairy.mesh);
        scene.add(libMesh);
        fairy.mesh = libMesh;
      }).catch((err) => {
        // Library failed — keep the primitive and log; the game
        // remains playable.
        console.warn("[fairy-library] load failed, using primitive:", err.message);
      });
    }
    fairies.push(fairy);
    unassigned.push(fairy);
    return fairy;
  }

  function assignRole(fairyOrId, roleId) {
    const fairy = typeof fairyOrId === "number" ? fairies[fairyOrId] : fairyOrId;
    if (!fairy) return false;
    if (!ROLES[roleId]) throw new Error(`unknown role: ${roleId}`);
    if (fairy.cooldownDaysLeft > 0) return false;
    if (fairy.role) {
      // Swapping: apply cooldown + food cost deferred to caller.
      fairy.cooldownDaysLeft = SWAP_COST_DAYS;
    }
    fairy.role = roleId;
    // Remove from unassigned pool
    const idx = unassigned.indexOf(fairy);
    if (idx >= 0) unassigned.splice(idx, 1);
    return true;
  }

  function tick(day, env, world = {}) {
    for (const fairy of fairies) {
      if (fairy.cooldownDaysLeft > 0) {
        fairy.cooldownDaysLeft -= 1;
        continue;
      }
      const role = ROLES[fairy.role];
      if (!role) continue;
      role.serveDay(fairy, world);
    }
  }

  // Animation drift — lerps the mesh toward each fairy's target pos
  // so the player SEES them fly to their work. The role ticks set
  // `fairy.targetPos` when they have something to do; otherwise the
  // fairy settles back near the Fairy Grove.
  const _v = new THREE.Vector3();
  function animate(t) {
    for (const f of fairies) {
      if (!f.mesh) continue;
      animateFairy(f.mesh, t, f.id * 0.37);
      const target = f.targetPos ?? { x: f.x, y: f.y, z: f.z };
      _v.set(target.x, target.y, target.z);
      f.mesh.position.lerp(_v, 0.06); // ~1.5 s to cover 10 m
    }
  }

  function removeAll() {
    for (const f of fairies) {
      if (f.mesh && scene) scene.remove(f.mesh);
    }
    fairies.length = 0;
    unassigned.length = 0;
  }

  return {
    get all() { return [...fairies]; },
    get count() { return fairies.length; },
    get unassignedCount() { return unassigned.length; },
    spawn,
    assignRole,
    tick,
    animate,
    removeAll,
    // Introspection
    levelOf: (fairy) => levelFromXp(fairy.xp),
    bonusFor: (fairy) => bonusForLevel(fairy.role, levelFromXp(fairy.xp)),
    serialize() {
      return fairies.map((f) => ({
        id: f.id,
        name: f.name,
        role: f.role,
        xp: f.xp,
        x: f.x,
        y: f.y,
        z: f.z,
        cooldownDaysLeft: f.cooldownDaysLeft,
      }));
    },
    hydrate(saved) {
      removeAll();
      for (const s of saved) {
        const f = spawn(s.name);
        f.role = s.role;
        f.xp = s.xp;
        f.x = s.x;
        f.y = s.y;
        f.z = s.z;
        f.cooldownDaysLeft = s.cooldownDaysLeft ?? 0;
        if (f.role) {
          const idx = unassigned.indexOf(f);
          if (idx >= 0) unassigned.splice(idx, 1);
        }
      }
    },
  };
}
