/**
 * Void Raiders — Main game entry point.
 *
 * Initializes the Three.js scene, shows the station screen first,
 * then spawns terrain, mothership, camera, and runs the core game
 * loop when the player launches a mission.
 *
 * After extraction, resources are delivered to the persistent game
 * state and the station screen returns.
 */

import * as THREE from "three";
import { Terrain, getTerrainHeight, setLandmarks } from "./realm/terrain.js";
import { createAtmosphere } from "./realm/atmosphere.js";
import { createSky } from "./realm/sky.js";
import { generateLandmarks } from "./realm/landmarks.js";
import { StructureManager } from "./realm/structures.js";
import { DroneLightRenderer } from "./drones/drone-lights.js";
import { Mothership } from "./ship/mothership.js";
import { updateMovement, generateTestRoute } from "./ship/movement.js";
import { FollowCamera } from "./camera/follow-camera.js";
import { FleetManager } from "./drones/fleet-manager.js";
import { FleetRenderer } from "./drones/fleet-renderer.js";
import { createDrone } from "./drones/drone.js";
import { createSwarm, addDroneToSwarm } from "./drones/swarm.js";
import { RETREAT_TYPES } from "./drones/routine.js";
import { DepositManager } from "./realm/deposits.js";
import { EnemySpawner } from "./combat/spawner.js";
import { EnemyRenderer } from "./combat/enemy-renderer.js";
import { updateEnemyAI } from "./combat/enemy-ai.js";
import { WeaponSystem } from "./ship/weapon.js";
import { TurretSystem } from "./ship/turret-system.js";
import { CombatEffects } from "./combat/effects.js";
import { ScreenShake, damageToTrauma, weaponFireTrauma } from "./combat/screen-shake.js";
import { createShieldBubble } from "./combat/shield-effect.js";
import { ExtractionSystem } from "./ship/stargate.js";
import { AttackSystem } from "./combat/attack-system.js";
import { getAttack } from "./combat/attack-defs.js";
import { RoutinePanel } from "./ui/mission/routine-panel.js";
import { PowerAllocator } from "./ship/power.js";
import { DroneShieldRenderer } from "./combat/drone-shields.js";
import { setAudioManager as setStationAudio } from "./ui/station/station-feedback.js";
import { DamageVisuals } from "./combat/damage-visuals.js";
import { HUD } from "./ui/mission/hud.js";
import { Station } from "./ui/station/station.js";
import { gameState, deliverResources, recordShipDeath, clearWreckData } from "./economy/game-state.js";
import { syncResearchToRules } from "./ui/station/station-research.js";
import { applyStoredUpgrades } from "./drones/upgrades.js";
import { AudioManager } from "./audio/audio-manager.js";
import { getMusicConfig } from "./audio/music-config.js";

// Propagate any default-unlocked research (see gameState.research) into
// the routine-engine rule maps so the "Damaged" retreat condition etc.
// appear in the routine panel from the first mission.
syncResearchToRules();
import {
  BG_COLOR,
  FOG_NEAR,
  FOG_FAR,
  SUN_COLOR,
  SUN_INTENSITY,
  AMBIENT_COLOR,
  AMBIENT_INTENSITY,
  VOXEL_SCALE,
} from "./config.js";

// ─── Renderer ──────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

// ─── Scene ─────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(BG_COLOR);
scene.fog = new THREE.Fog(BG_COLOR, FOG_NEAR, FOG_FAR);

// ─── Lighting (persistent across missions) ─────────────────────
const sun = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY);
sun.position.set(200, 400, 150);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 800;
sun.shadow.camera.left = -120;
sun.shadow.camera.right = 120;
sun.shadow.camera.top = 120;
sun.shadow.camera.bottom = -120;
sun.shadow.bias = -0.001;
scene.add(sun);
scene.add(sun.target);
scene.add(new THREE.AmbientLight(AMBIENT_COLOR, AMBIENT_INTENSITY));

const hemiLight = new THREE.HemisphereLight(0x6688aa, 0x332244, 0.6);
scene.add(hemiLight);

// Sun offset for shadow camera tracking (direction from ship to sun)
const SUN_OFFSET = new THREE.Vector3(200, 400, 150);

// ─── Camera ────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  1,
  5000
);

// ─── Resize ────────────────────────────────────────────────────
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Audio (persistent across missions) ────────────────────────
const audio = new AudioManager();
setStationAudio(audio);

// UI sounds preloaded immediately (station needs them before mission starts)
// Music tracks — loaded from music-config.js (lab can override via localStorage).
// Re-read at each situation change so lab edits take effect without a reload.
let MUSIC_CONFIG = getMusicConfig();
function refreshMusicConfig() { MUSIC_CONFIG = getMusicConfig(); }
let currentMusicTrack = null;

// React to lab saves in the same tab (custom event) or other tabs (storage event)
if (typeof window !== "undefined") {
  window.addEventListener("vr-music-config-changed", refreshMusicConfig);
  window.addEventListener("storage", (e) => {
    if (e.key === "vr-music-config-v1") refreshMusicConfig();
  });
}

const UI_SFX = {
  "ui-click": "/audio/sfx/ui-click.mp3",
  "ui-alert": "/audio/sfx/ui-alert.mp3",
  "ui-upgrade": "/audio/sfx/ui-upgrade.mp3",
  "ui-purchase": "/audio/sfx/ui-purchase.mp3",
  "ui-denied": "/audio/sfx/ui-denied.mp3",
  "ui-research": "/audio/sfx/ui-research.mp3",
  "ui-build-drone": "/audio/sfx/ui-build-drone.mp3",
};

const SFX_MANIFEST = {
  "weapon-pulse": "/audio/sfx/weapon-pulse.mp3",
  "weapon-drone-laser": "/audio/sfx/weapon-drone-laser.mp3",
  "weapon-plasma-bolt": "/audio/sfx/weapon-plasma-bolt.mp3",
  "weapon-heavy-cannon": "/audio/sfx/weapon-heavy-cannon.mp3",
  "weapon-turret-beam": "/audio/sfx/weapon-turret-beam.mp3",
  // Mothership turret catalog (v2) — one per weapon role
  "weapon-pd-pulse": "/audio/sfx/weapon-pd-pulse.mp3",
  "weapon-arc-emitter": "/audio/sfx/weapon-arc-emitter.mp3",
  "weapon-shield-breaker": "/audio/sfx/weapon-shield-breaker.mp3",
  "weapon-flak-launch": "/audio/sfx/weapon-flak-launch.mp3",
  "weapon-flak-detonate": "/audio/sfx/weapon-flak-detonate.mp3",
  "weapon-missile-launch": "/audio/sfx/weapon-missile-launch.mp3",
  "weapon-railgun-charge": "/audio/sfx/weapon-railgun-charge.mp3",
  "weapon-railgun-fire": "/audio/sfx/weapon-railgun-fire.mp3",
  "weapon-railgun-impact": "/audio/sfx/weapon-railgun-impact.mp3",
  "shield-hit": "/audio/sfx/shield-hit.mp3",
  "hull-hit": "/audio/sfx/hull-hit.mp3",
  "explosion-small": "/audio/sfx/explosion-small.mp3",
  "explosion-large": "/audio/sfx/explosion-large.mp3",
  "mining-beam": "/audio/sfx/mining-beam.mp3",
  "stargate-summon": "/audio/sfx/stargate-summon.mp3",
  "stargate-warp": "/audio/sfx/stargate-warp.mp3",
  "drone-deploy": "/audio/sfx/drone-deploy.mp3",
  "cargo-deposit": "/audio/sfx/cargo-deposit.mp3",
  "ui-click": "/audio/sfx/ui-click.mp3",
  "ui-alert": "/audio/sfx/ui-alert.mp3",
  "ui-upgrade": "/audio/sfx/ui-upgrade.mp3",
  "ui-purchase": "/audio/sfx/ui-purchase.mp3",
  "ui-denied": "/audio/sfx/ui-denied.mp3",
  "ui-research": "/audio/sfx/ui-research.mp3",
  "ui-build-drone": "/audio/sfx/ui-build-drone.mp3",
};

// Throttle state for repeating sounds (mining, etc.)
let miningAudioTimer = 0;
const MINING_AUDIO_INTERVAL = 2.5; // seconds between mining beam sounds

// Track extraction state transitions for one-shot sounds
let prevExtractionState = "idle";

// ─── Mission-scoped state ──────────────────────────────────────
let mothership, followCam, terrain, atmosphere, sky, depositManager;
let enemySpawner, enemyRenderer, weaponSystem, turretSystem, combatEffects, screenShake, attackSystem;
let shieldBubble, fleetManager, fleetRenderer, extraction, hud, routinePanel;
let powerAllocator, droneShieldRenderer, damageVisuals;
let droneLightRenderer, structureManager, realmLandmarks;
let missionComplete = false;
let missionFailed = false;
let missionRunning = false;
let prevShields = 0;
let prevHull = 0;
let animFrameId = null;
let missionSeed = 0;
let isSalvageMission = false;

const clock = new THREE.Clock();
let frameCount = 0;
let fpsTime = 0;
let currentFps = 0;
let terrainTimer = 0;
const TERRAIN_UPDATE_INTERVAL = 0.5;

// ─── QA debug hook ─────────────────────────────────────────────
window.__renderer = renderer;
window.__gameState = () => ({
  tesseract: mothership?.tesseract.contents ?? {},
  drones: fleetManager?.drones.map(d => ({ id: d.id, type: d.type, state: d.state, cargo: d.cargo })) ?? [],
  deposits: depositManager?.getActive().length ?? 0,
  station: gameState,
});

// ─── Station ───────────────────────────────────────────────────
const station = new Station({
  onLaunch: () => {
    // Initialize audio context synchronously in the click handler
    // (browsers require AudioContext creation inside a user gesture)
    audio.initFromUserGesture();
    startMission();
  },
});

station.show();

// ─── QA debug surface ─────────────────────────────────────────
// Lets a puppeteer harness inspect game state without poking at internals.
window.__qa = {
  startMission: () => {
    // Mirror what station._launch() does — hide the station overlay so it
    // doesn't cover the in-mission scene in QA screenshots
    if (station && typeof station.hide === "function") station.hide();
    return startMission();
  },
  // Diagnostic: report whether the mothership turret system is actually
  // firing weapons. Returns counts per attack ID + scene-level totals so
  // we can distinguish "weapons aren't firing" from "weapons fire but
  // visuals don't render". Run from devtools: __qa.weaponStats()
  weaponStats: () => {
    if (!turretSystem) return { error: "turretSystem not initialized" };
    const ts = turretSystem;
    const stats = {
      hasLasersPool: !!ts.lasers,
      hasProjectilesPool: !!ts.heavyProjectiles,
      hasShockwavePool: !!ts.shockwaves,
      hasChargeUpPool: !!ts.chargeUps,
      hasMuzzleFlashPool: !!ts.muzzleFlashes,
      turretCount: mothership?.turrets?.length ?? 0,
      enemyCount: enemySpawner?.getAlive?.()?.length ?? 0,
    };
    // Walk the turrets and report each one's attackId + canFire + cooldown
    if (mothership?.turrets) {
      stats.turrets = mothership.turrets.map(t => ({
        name: t.name,
        attackId: t.attackId,
        weaponType: t.weaponType,
        active: t.active,
        canFire: t.canFire,
        fireCooldown: +(t.fireCooldown ?? 0).toFixed(2),
        currentTarget: t._currentTarget?.type || null,
      }));
    }
    // Pool stats — totalFires is the cumulative count since the
    // mission started. If this stays at 0 the turret system isn't
    // calling .fire() at all (gameplay/AI bug). If it's > 0 but
    // nothing is visible, the issue is in the shader render path.
    if (ts.lasers?.getStats) stats.beamPool = ts.lasers.getStats();
    if (ts.heavyProjectiles?.getStats) stats.projectilePool = ts.heavyProjectiles.getStats();
    return stats;
  },
  // Flood the resource pool to test-mode floors. Useful from devtools when
  // you've burned through your stockpile and want to keep crafting/buying
  // without leaving the game. Returns the new resource snapshot.
  flood: () => {
    const floors = {
      "iron-ore": 50000, "copper-ore": 50000, "titanium-ore": 25000,
      "crystal-shard": 25000, "quartz-crystal": 25000, "plasma-core": 25000,
      "exotic-matter": 10000, "organic-matter": 25000, "bio-compound": 25000,
      "silicon-dust": 25000, "rare-earth": 25000, "salvage-parts": 50000,
    };
    for (const [type, floor] of Object.entries(floors)) {
      if ((gameState.resources[type] ?? 0) < floor) gameState.resources[type] = floor;
    }
    return { ...gameState.resources };
  },
  mothership: () => mothership ? {
    exists: true,
    turretCount: mothership.turrets?.length ?? 0,
    bayCount: mothership.bays?.length ?? 0,
    shieldRadius: mothership.shieldRadius,
    position: mothership.position ? { x: mothership.position.x, y: mothership.position.y, z: mothership.position.z } : null,
    turrets: (mothership.turrets || []).map(t => {
      // Compute the world position of the turret group + the muzzle so we can
      // detect "lasers fire from far away" — they should be ON the ship,
      // not 100 units off in space.
      let groupWorld = null;
      let groupSize = null;
      let muzzleWorld = null;
      if (t.group) {
        t.group.updateMatrixWorld(true);
        const wp = new THREE.Vector3();
        t.group.getWorldPosition(wp);
        groupWorld = { x: wp.x, y: wp.y, z: wp.z };
        // World-space bbox of the entire turret group — catches cases where
        // the rendered mesh is way bigger than its pivot point would suggest
        // (e.g., wrapper scale double-applied to the baked vertices).
        const box = new THREE.Box3().setFromObject(t.group);
        const sz = box.getSize(new THREE.Vector3());
        groupSize = { x: sz.x, y: sz.y, z: sz.z };
      }
      if (t.pitchPivot && t.muzzleLocal) {
        t.pitchPivot.updateMatrixWorld(true);
        const mp = t.muzzleLocal.clone();
        t.pitchPivot.localToWorld(mp);
        muzzleWorld = { x: mp.x, y: mp.y, z: mp.z };
      }
      return {
        name: t.name,
        type: t.type,
        weaponType: t.weaponType,
        attackId: t.attackId || null,
        active: t.active !== false,
        usedSourceMesh: !!t.usedSourceMesh,
        groupVisible: t.group?.visible ?? null,
        barrelYawOffsetDeg: t.barrelYawOffset != null ? +(t.barrelYawOffset * 180 / Math.PI).toFixed(1) : null,
        barrelPitchOffsetDeg: t.barrelPitchOffset != null ? +(t.barrelPitchOffset * 180 / Math.PI).toFixed(1) : null,
        muzzleLocalRaw: t.muzzleLocal ? { x: +t.muzzleLocal.x.toFixed(4), y: +t.muzzleLocal.y.toFixed(4), z: +t.muzzleLocal.z.toFixed(4) } : null,
        hasYawPivot: !!t.yawPivot,
        hasPitchPivot: !!t.pitchPivot,
        hasGroup: !!t.group,
        yawRotY: t.yawPivot?.rotation?.y ?? null,
        pitchRotX: t.pitchPivot?.rotation?.x ?? null,
        currentYaw: t.currentYaw,
        currentPitch: t.currentPitch,
        canFire: t.canFire,
        fireCooldown: t.fireCooldown,
        position: { x: t.position.x, y: t.position.y, z: t.position.z },
        normal: { x: t.normal.x, y: t.normal.y, z: t.normal.z },
        groupWorld,
        groupSize,
        muzzleWorld,
        // Audit: skin map presence on the head + barrel materials.
        // After loadActiveTurretSkins() runs, both should have a non-null
        // texture map pointing at the saved (or default) skin file.
        headHasMap: !!(t.group && (() => {
          let found = false;
          t.group.traverse(c => { if (c.isMesh && c.name === "turret_head" && c.material?.map) found = true; });
          return found;
        })()),
        barrelHasMap: !!(t.group && (() => {
          let found = false;
          t.group.traverse(c => { if (c.isMesh && c.name === "turret_barrel" && c.material?.map) found = true; });
          return found;
        })()),
        sourceVisibility: (t.sourceMeshes || []).map(m => ({ name: m.name, visible: m.visible })),
      };
    }),
  } : { exists: false },
  enemies: () => {
    if (!enemySpawner) return [];
    const alive = enemySpawner.getAlive();
    return alive.map(e => ({
      type: e.type,
      hull: e.stats?.hull,
      position: { x: e.position.x, y: e.position.y, z: e.position.z },
    }));
  },
  // Toggle individual turret slots on/off (for testing the upgrade system).
  setTurretActive: (index, active) => mothership?.setTurretActive(index, active),
  // Position the camera at a specific world point looking at another point.
  // Used by the QA harness to grab calibration screenshots from fixed angles.
  setCameraAt: (posXYZ, lookXYZ) => {
    if (!followCam || !mothership) return false;
    // Force into free mode so the follow logic doesn't snap us back
    if (!followCam.freeMode) followCam.toggleFreeMode();
    // Position relative to the mothership so the camera stays useful as the
    // ship moves around the test scene.
    const m = mothership.position;
    camera.position.set(m.x + posXYZ[0], m.y + posXYZ[1], m.z + posXYZ[2]);
    const look = new THREE.Vector3(m.x + lookXYZ[0], m.y + lookXYZ[1], m.z + lookXYZ[2]);
    camera.lookAt(look);
    // Update freeYaw/freePitch so the next mouse move doesn't snap back
    const dir = new THREE.Vector3().subVectors(look, camera.position).normalize();
    followCam.freeYaw = Math.atan2(dir.x, dir.z);
    followCam.freePitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
    return true;
  },
  // Force-spawn a test enemy near the mothership so we can verify the
  // turret system actually tracks/fires without waiting for natural spawns.
  spawnTestEnemy: (offsetX = 80, offsetY = 30, offsetZ = 0) => {
    if (!mothership || !enemySpawner) return false;
    // Lazy-import createEnemy via the spawner module
    return import("./combat/enemy.js").then(({ createEnemy }) => {
      const pos = mothership.position;
      const enemy = createEnemy("scout-fighter", {
        x: pos.x + offsetX,
        y: pos.y + offsetY,
        z: pos.z + offsetZ,
      });
      enemySpawner.enemies.push(enemy);
      return true;
    });
  },
  // Spawn 8 invincible test enemies in a grid around the ship — for
  // verifying turret aim/canFire across all hemispheres without enemies
  // dying instantly. Hull is set to 999999 so turrets can shoot at them
  // forever without removing them.
  spawnCalibration: (radius = 120) => {
    if (!mothership || !enemySpawner) return false;
    return import("./combat/enemy.js").then(({ createEnemy }) => {
      const pos = mothership.position;
      const r = radius;
      const positions = [
        // 4 above, 4 below
        { x: pos.x + r, y: pos.y + 40, z: pos.z },         // east-up
        { x: pos.x - r, y: pos.y + 40, z: pos.z },         // west-up
        { x: pos.x,     y: pos.y + 40, z: pos.z + r },     // north-up
        { x: pos.x,     y: pos.y + 40, z: pos.z - r },     // south-up
        { x: pos.x + r, y: pos.y - 40, z: pos.z },         // east-down
        { x: pos.x - r, y: pos.y - 40, z: pos.z },         // west-down
        { x: pos.x,     y: pos.y - 40, z: pos.z + r },     // north-down
        { x: pos.x,     y: pos.y - 40, z: pos.z - r },     // south-down
      ];
      for (const p of positions) {
        const enemy = createEnemy("scout-fighter", p);
        if (enemy.stats) {
          enemy.stats.hull = 999999;
          enemy.stats.hullMax = 999999;
        }
        enemySpawner.enemies.push(enemy);
      }
      return positions.length;
    });
  },
  // Clear ALL enemies (including the calibration ones)
  clearEnemies: () => {
    if (!enemySpawner) return 0;
    const n = enemySpawner.enemies.length;
    enemySpawner.enemies.length = 0;
    return n;
  },

  // ── Repair bay inspection / drone damage (for QA) ──
  repairBay: () => {
    if (!mothership?.repairBay) return null;
    return mothership.repairBay.getStatus();
  },
  routineMetrics: () => {
    return fleetManager?.routineMetrics || { retreats: {} };
  },
  // Assign a retreat condition + damage a drone so we can drive the
  // return-to-repair flow without waiting for enemies to attack.
  setSwarmRetreat: (swarmIndex, retreatId) => {
    const swarm = fleetManager?.swarms?.[swarmIndex];
    if (!swarm) return false;
    swarm.routine.retreat = retreatId;
    return true;
  },
  // Force-unlock a retreat condition. Used by QA scenarios that need to
  // exercise gated retreats (e.g. "damaged") without walking the full
  // research-tree unlock path first.
  unlockRetreat: (retreatId) => {
    const def = RETREAT_TYPES[retreatId];
    if (!def) return false;
    def.unlocked = true;
    return true;
  },
  // Seed the tesseract with raw materials + top up energy so a QA
  // scenario can exercise the repair-bay hull-restoration path without
  // first running a mining loop. Returns the new totals.
  seedRepairStockpile: (ironOre = 500, energy = 100) => {
    if (!mothership) return null;
    mothership.tesseract.contents["iron-ore"] =
      (mothership.tesseract.contents["iron-ore"] || 0) + ironOre;
    mothership.systems.energy = Math.min(
      mothership.systems.energyMax ?? energy,
      (mothership.systems.energy || 0) + energy
    );
    return {
      ironOre: mothership.tesseract.contents["iron-ore"],
      energy: mothership.systems.energy,
      energyMax: mothership.systems.energyMax,
    };
  },
  damageDroneByIndex: (droneIndex, fraction = 0.4) => {
    const drone = fleetManager?.drones?.[droneIndex];
    if (!drone) return null;
    drone.stats.hull = drone.stats.hullMax * fraction;
    if (drone.stats.shieldsMax > 0) drone.stats.shields = 0;
    return { id: drone.id, hull: drone.stats.hull, state: drone.state };
  },
  droneSummary: () => {
    if (!fleetManager) return [];
    return fleetManager.drones.map((d) => ({
      id: d.id,
      type: d.type,
      state: d.state,
      hull: d.stats.hull,
      hullMax: d.stats.hullMax,
      shields: d.stats.shields,
      shieldsMax: d.stats.shieldsMax,
      retreatReason: d._retreatReason || null,
      position: { x: d.position.x, y: d.position.y, z: d.position.z },
    }));
  },
  // Teleport a drone near the mothership so dock-flow tests don't wait
  // for long-distance travel.
  teleportDroneToShip: (droneIndex) => {
    const drone = fleetManager?.drones?.[droneIndex];
    if (!drone || !mothership) return false;
    const p = mothership.position;
    drone.position.x = p.x;
    drone.position.y = p.y;
    drone.position.z = p.z;
    return true;
  },
  savedConfigPreview: () => {
    try {
      const raw = localStorage.getItem("ship-hp-star-destroyer");
      if (!raw) return null;
      const data = JSON.parse(raw);
      return {
        hardpointCount: data.hardpoints?.length ?? 0,
        firstEntryKeys: data.hardpoints?.[0] ? Object.keys(data.hardpoints[0]) : [],
        firstEntry: data.hardpoints?.[0] || null,
      };
    } catch (e) { return { error: String(e) }; }
  },
  // Walk the loaded mothership mesh and report visibility stats so we can
  // confirm the hide-original-ball-meshes step actually fired.
  meshVisibility: () => {
    if (!mothership || !mothership.mesh) return null;
    let total = 0, visible = 0, hidden = 0;
    const hiddenNames = [];
    mothership.mesh.traverse((c) => {
      if (!c.isMesh) return;
      total++;
      if (c.visible) visible++;
      else { hidden++; if (hiddenNames.length < 10) hiddenNames.push(c.name); }
    });
    return { total, visible, hidden, sampleHidden: hiddenNames };
  },
  // Walk the entire scene and report every visible top-level object plus
  // any visible spheres/balls — used to track down "what is that blue
  // floating thing" mysteries.
  sceneAudit: () => {
    if (!scene) return null;
    const tempBox = new THREE.Box3();
    const sz = new THREE.Vector3();
    const c = new THREE.Vector3();
    const items = [];
    scene.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      if (!o.visible) return;
      // Skip anything inside the mothership tree (we already audit that)
      let p = o.parent;
      let inMothership = false;
      while (p) {
        if (mothership && p === mothership.mesh) { inMothership = true; break; }
        p = p.parent;
      }
      if (inMothership) return;
      tempBox.setFromObject(o);
      tempBox.getSize(sz);
      tempBox.getCenter(c);
      items.push({
        name: o.name || o.type,
        type: o.type,
        instanced: !!o.isInstancedMesh,
        instanceCount: o.count,
        size: { x: +sz.x.toFixed(2), y: +sz.y.toFixed(2), z: +sz.z.toFixed(2) },
        center: { x: +c.x.toFixed(2), y: +c.y.toFixed(2), z: +c.z.toFixed(2) },
      });
    });
    return items;
  },
  // Find all currently-visible meshes that are roughly ball-turret-shaped:
  // small cubic-aspect bboxes near the hull surface. Used to track down
  // turret-shaped meshes that the auto-rig missed.
  findVisibleBallShapes: () => {
    if (!mothership || !mothership.mesh) return [];
    const results = [];
    const tempBox = new THREE.Box3();
    const sz = new THREE.Vector3();
    mothership.mesh.traverse((c) => {
      if (!c.isMesh || !c.visible) return;
      tempBox.setFromObject(c);
      tempBox.getSize(sz);
      const dims = [sz.x, sz.y, sz.z].sort((a, b) => b - a);
      if (dims[2] < 1e-6) return;
      const aspect = dims[0] / dims[2];
      const longest = dims[0];
      // Ball-turret heuristic: cubic-ish (aspect < 2.2) and small (under 8 m)
      if (aspect < 2.2 && longest > 0.5 && longest < 8) {
        const c2 = tempBox.getCenter(new THREE.Vector3());
        results.push({
          name: c.name,
          size: { x: +sz.x.toFixed(2), y: +sz.y.toFixed(2), z: +sz.z.toFixed(2) },
          center: { x: +c2.x.toFixed(2), y: +c2.y.toFixed(2), z: +c2.z.toFixed(2) },
          aspect: +aspect.toFixed(2),
          faces: (c.geometry?.index?.count || 0) / 3,
        });
      }
    });
    return results.sort((a, b) => b.faces - a.faces);
  },
};

// ─── Mission Lifecycle ─────────────────────────────────────────

async function startMission() {
  cleanupMission();

  missionComplete = false;
  missionFailed = false;
  missionRunning = true;
  missionSeed = Date.now();

  // ── Audio preload + mission music ──
  await audio.preload(SFX_MANIFEST);
  refreshMusicConfig();
  audio.playMusic(MUSIC_CONFIG.mission.track, { fadeDuration: MUSIC_CONFIG.mission.fadeDuration });
  currentMusicTrack = "mission";

  // ── Mothership ──
  // Async factory loads the SD Detailed glTF + applies the saved hardpoint
  // config from localStorage if one exists. Falls back to the procedural
  // octahedron mesh if there's no saved config or the load fails — the
  // game still launches either way.
  mothership = await Mothership.create();

  // Apply persistent stats from gameState
  const ms = gameState.mothership;
  mothership.systems.hull = ms.hullMax;
  mothership.systems.hullMax = ms.hullMax;
  mothership.systems.shields = ms.shieldsMax;
  mothership.systems.shieldsMax = ms.shieldsMax;
  mothership.systems.energy = ms.energyMax;
  mothership.systems.energyMax = ms.energyMax;
  mothership.tesseract.capacity = ms.tesseractCapacity;

  // Repair bay: reset queue + rebuild config from unlocked research
  if (mothership.repairBay) {
    mothership.repairBay.reset();
    mothership.repairBay.applyResearchModifiers(gameState.research);
  }

  const startX = 0;
  const startZ = 0;
  const tH = getTerrainHeight(startX, startZ);
  mothership.mesh.position.set(startX, tH * VOXEL_SCALE + 50, startZ);
  scene.add(mothership.mesh);
  mothership.route = generateTestRoute(startX, startZ, 5000, 20);

  // ── Ship death handler ──
  mothership.onDeath = () => handleShipDeath();

  // ── Camera ──
  followCam = new FollowCamera(camera, renderer.domElement);
  followCam.snap(mothership.position, mothership.mesh.rotation.y);

  // ── Landmarks (must be set before terrain generation) ──
  realmLandmarks = generateLandmarks(missionSeed);
  setLandmarks(realmLandmarks);

  // ── Terrain ──
  terrain = new Terrain(scene);
  terrain.update(mothership.position);

  // ── Atmosphere ──
  atmosphere = createAtmosphere();
  scene.add(atmosphere.mesh);

  // ── Sky ──
  const biomeIndex = Math.floor(Math.abs(Math.sin(Date.now() * 0.001)) * 3) % 3;
  sky = createSky(biomeIndex);
  sky.setSunDirection(SUN_OFFSET);
  scene.add(sky.mesh);

  // ── Mothership shadows ──
  mothership.mesh.traverse((child) => {
    if (child.isMesh) child.castShadow = true;
  });

  // ── Deposits (biased toward landmarks) ──
  depositManager = new DepositManager(scene, missionSeed);
  depositManager.spawnAlongRoute(mothership.route, 30, realmLandmarks);

  // ── Alien Structures ──
  structureManager = new StructureManager(scene);
  structureManager.generate(missionSeed, 10000, realmLandmarks);

  // ── Combat ──
  enemySpawner = new EnemySpawner();
  enemyRenderer = new EnemyRenderer(scene);
  weaponSystem = new WeaponSystem();
  // Per-slot turret system used when the mothership has configured turret
  // slots. Falls through to the global weaponSystem when there are none.
  turretSystem = new TurretSystem(scene, { audioManager: audio });
  combatEffects = new CombatEffects(scene);
  screenShake = new ScreenShake();
  attackSystem = new AttackSystem(scene, combatEffects, screenShake);
  attackSystem.audioManager = audio;
  // Late-bind heavy-cannon dependencies on the turret system. We need
  // combatEffects (for explosions/debris), screenShake (for the boom feel),
  // and a getter for the live enemy list (for AOE damage).
  turretSystem.setCombatHooks({
    combatEffects,
    screenShake,
    getEnemies: () => (enemySpawner ? enemySpawner.getAlive() : []),
  });

  // ── Shield Bubble ──
  // Radius is pulled from the mothership so the bubble actually wraps the
  // model. Procedural fallback uses 14; loaded glTF derives it from bbox.
  shieldBubble = createShieldBubble(mothership.shieldRadius, 0x4488ff);
  mothership.mesh.add(shieldBubble.mesh);
  prevShields = mothership.systems.shields;
  prevHull = mothership.systems.hull;

  // ── Drone Fleet ──
  fleetManager = new FleetManager();
  fleetManager.mothership = mothership;
  fleetManager.attackSystem = attackSystem;
  fleetManager.combatEffects = combatEffects;
  fleetRenderer = new FleetRenderer(scene);

  // Build fleet from gameState drones
  let minerCount = 0;
  let fighterCount = 0;
  for (const entry of gameState.drones) {
    if (entry.type === "worker-mining") minerCount = entry.count;
    else if (entry.type === "offensive") fighterCount = entry.count;
  }
  fleetManager.createStarterFleet(minerCount, fighterCount);

  // Apply stored upgrades to miners and fighters
  for (const entry of gameState.drones) {
    if (!entry.upgrades || entry.upgrades.length === 0) continue;
    const matchingDrones = fleetManager.drones.filter(d => d.type === entry.type);
    for (const drone of matchingDrones) {
      applyStoredUpgrades(drone, entry.upgrades);
    }
  }

  // Spawn repair drones if any
  const repairEntry = gameState.drones.find(d => d.type === "worker-repair");
  if (repairEntry && repairEntry.count > 0) {
    const repairSwarm = createSwarm({
      routine: { anchor: "follow-mothership", range: 200, priority: "most-damaged", action: "repair", retreat: "health-low" },
    });
    for (let i = 0; i < repairEntry.count; i++) {
      const drone = createDrone({ type: "worker-repair" });
      drone.state = "deploying";
      addDroneToSwarm(repairSwarm, drone);
      fleetManager.drones.push(drone);
      fleetManager._deployQueue.push(drone);
    }
    fleetManager.swarms.push(repairSwarm);

    // Apply stored upgrades to repair drones
    if (repairEntry.upgrades && repairEntry.upgrades.length > 0) {
      for (const drone of repairSwarm.drones) {
        applyStoredUpgrades(drone, repairEntry.upgrades);
      }
    }
  }

  // ── Extraction ──
  extraction = new ExtractionSystem(scene);
  prevExtractionState = "idle";

  // ── HUD ──
  hud = new HUD();
  hud.onExtract(triggerExtraction);

  // ── Power Allocation ──
  powerAllocator = new PowerAllocator();

  // ── Drone Shield Renderer ──
  droneShieldRenderer = new DroneShieldRenderer(scene);

  // ── Drone Light Pools (ground glow beneath drones) ──
  droneLightRenderer = new DroneLightRenderer(scene);

  // ── Damage Visuals ──
  damageVisuals = new DamageVisuals(scene);

  // ── Command Panel (TAB to toggle) ──
  routinePanel = new RoutinePanel();
  routinePanel.setPowerAllocator(powerAllocator, mothership.systems.energyProduction);
  routinePanel.setSwarms(fleetManager.swarms);

  // Reset audio throttles
  miningAudioTimer = 0;

  // Start loop
  clock.start();
  frameCount = 0;
  fpsTime = 0;
  currentFps = 0;
  terrainTimer = 0;
  animFrameId = requestAnimationFrame(gameLoop);
}

function endMission() {
  if (!missionRunning) return;

  // Deliver cargo to station
  deliverResources(mothership.tesseract.contents);
  gameState.missionsCompleted++;

  // Clear wreck data on successful extraction (salvage complete)
  if (gameState.wreckData) {
    clearWreckData();
  }

  // Full repair between missions (V1)
  const ms = gameState.mothership;
  ms.hull = ms.hullMax;
  ms.shields = ms.shieldsMax;
  ms.energy = ms.energyMax;

  missionRunning = false;

  // Brief delay so player sees mission complete screen, then return to station
  setTimeout(() => {
    cleanupMission();
    station.show();
    refreshMusicConfig();
    audio.playMusic(MUSIC_CONFIG.station.track, { fadeDuration: MUSIC_CONFIG.station.fadeDuration });
    currentMusicTrack = "station";
  }, 3000);
}

function handleShipDeath() {
  if (missionFailed || missionComplete) return;
  missionFailed = true;

  // Death explosion
  if (combatEffects) {
    combatEffects.addDeathEffect(mothership.position, "mothership", 0x334455);
  }
  if (screenShake) {
    screenShake.addTrauma(1.0);
  }
  audio.playSFX("explosion-large", mothership.position);

  // Hide the ship mesh
  mothership.mesh.visible = false;

  // Gather what was lost
  const lostCargo = { ...mothership.tesseract.contents };
  const lostDrones = [];
  const droneCounts = {};
  for (const drone of fleetManager.drones) {
    droneCounts[drone.type] = (droneCounts[drone.type] || 0) + 1;
  }
  for (const [type, count] of Object.entries(droneCounts)) {
    lostDrones.push({ type, count });
  }

  // Record death in game state
  recordShipDeath({
    position: mothership.position,
    lostCargo,
    lostDrones,
    seed: missionSeed,
  });

  // Show destroyed screen after a brief pause for the explosion
  setTimeout(() => {
    if (hud) {
      hud.showShipDestroyed(lostCargo, lostDrones, true);
      hud.onReturnToStation(() => failMission(false));
      hud.onSalvageWreck(() => failMission(true));
    }
  }, 1500);
}

function failMission(startSalvage = false) {
  if (!missionRunning) return;
  missionRunning = false;

  // Full repair for next mission (rebuilt ship)
  const ms = gameState.mothership;
  ms.hull = ms.hullMax;
  ms.shields = ms.shieldsMax;
  ms.energy = ms.energyMax;

  if (startSalvage) {
    // Go directly into a salvage mission
    cleanupMission();
    startSalvageMission();
  } else {
    // Return to station
    setTimeout(() => {
      cleanupMission();
      station.show();
      refreshMusicConfig();
      audio.playMusic(MUSIC_CONFIG.station.track, { fadeDuration: MUSIC_CONFIG.station.fadeDuration });
      currentMusicTrack = "station";
    }, 500);
  }
}

async function startSalvageMission() {
  const wreck = gameState.wreckData;
  if (!wreck) {
    station.show();
    refreshMusicConfig();
    audio.playMusic(MUSIC_CONFIG.station.track, { fadeDuration: MUSIC_CONFIG.station.fadeDuration });
    currentMusicTrack = "station";
    return;
  }

  isSalvageMission = true;

  // Start a regular mission — wreck mining is overlaid on the same flow
  await startMission();

  // Place a wreck deposit at the death position so drones can mine it
  if (depositManager && wreck.position) {
    // Calculate total lost value for the deposit amount
    const totalCargo = Object.values(wreck.lostCargo).reduce((a, b) => a + b, 0);
    const wreckAmount = Math.max(totalCargo, 500);
    depositManager.addWreckDeposit(wreck.position, wreckAmount);
  }

  isSalvageMission = false;
}

function cleanupMission() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  if (hud) { hud.dispose(); hud = null; }
  if (routinePanel) { routinePanel.dispose(); routinePanel = null; }
  if (droneShieldRenderer) { droneShieldRenderer.dispose(); droneShieldRenderer = null; }
  if (droneLightRenderer) { droneLightRenderer.dispose(); droneLightRenderer = null; }
  if (damageVisuals) { damageVisuals.dispose(); damageVisuals = null; }
  if (structureManager) { structureManager.dispose(); structureManager = null; }
  realmLandmarks = null;
  setLandmarks([]);
  powerAllocator = null;
  if (extraction) { extraction.dispose(); extraction = null; }
  if (fleetRenderer) { fleetRenderer.dispose(); fleetRenderer = null; }
  if (fleetManager) { fleetManager.dispose(); fleetManager = null; }
  if (combatEffects) { combatEffects.dispose(); combatEffects = null; }
  if (enemyRenderer) { enemyRenderer.dispose(); enemyRenderer = null; }
  if (enemySpawner) { enemySpawner.dispose(); enemySpawner = null; }
  if (depositManager) { depositManager.dispose(); depositManager = null; }
  if (sky) { sky.mesh.geometry.dispose(); sky.mesh.material.dispose(); scene.remove(sky.mesh); sky = null; }
  if (atmosphere) { scene.remove(atmosphere.mesh); atmosphere = null; }
  if (terrain) { terrain.dispose(); terrain = null; }
  if (mothership) { scene.remove(mothership.mesh); mothership.dispose(); mothership = null; }

  weaponSystem = null;
  if (attackSystem) { attackSystem.dispose(); attackSystem = null; }
  screenShake = null;
  shieldBubble = null;
  followCam = null;
}

// ─── Extraction ────────────────────────────────────────────────
function triggerExtraction() {
  if (!extraction || !mothership || !mothership.alive) return;
  if (extraction.state === "idle" && !missionComplete && !missionFailed) {
    extraction.summon(mothership.position, mothership.mesh.rotation.y);
    const gatePos = extraction.getGatePosition();
    mothership.route = [gatePos];
    mothership.routeIndex = 0;
  }
}

window.addEventListener("keydown", (e) => {
  if (e.key === "e" || e.key === "E") triggerExtraction();
});

// ─── Game Loop ─────────────────────────────────────────────────

function gameLoop() {
  if (!missionRunning) return;
  animFrameId = requestAnimationFrame(gameLoop);

  const dt = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  // ── Audio listener (camera position/orientation) ──
  audio.updateListener(camera.position, camera.quaternion);

  const shipAlive = mothership.alive;

  // ── Mothership movement (only when alive) ──
  if (shipAlive) {
    updateMovement(mothership, dt);

    const shipTerrainH = getTerrainHeight(mothership.position.x, mothership.position.z);
    const targetY = shipTerrainH * VOXEL_SCALE + 50;
    mothership.position.y += (targetY - mothership.position.y) * 2 * dt;
  }

  // ── Enemies ──
  enemySpawner.update(dt, mothership.position);
  const aliveEnemies = enemySpawner.getAlive();
  const aliveDrones = fleetManager.drones.filter(d => d.state !== "destroyed");

  // Set target pools for real collision detection
  attackSystem.setTargets(aliveDrones, aliveEnemies, shipAlive ? mothership : null);

  const combatTargets = { mothership: shipAlive ? mothership : null, drones: fleetManager.drones };
  for (const enemy of aliveEnemies) {
    updateEnemyAI(enemy, combatTargets, dt, elapsed, attackSystem);
  }
  enemyRenderer.update(enemySpawner.enemies);

  // ── Mothership weapons (only when alive) ──
  // Two paths:
  //   - Per-slot TurretSystem when the mothership has configured turret
  //     slots (loaded glTF + saved hardpoint config). Each turret picks its
  //     own target and fires its own laser from its actual barrel tip.
  //   - Global WeaponSystem fallback for the procedural mothership (no slots).
  if (shipAlive) {
    if (mothership.turrets && mothership.turrets.length > 0) {
      // Snapshot enemy hull values before the turret update so we can detect
      // kills and trigger the same death effects + audio the old WeaponSystem
      // path used.
      const hullBefore = new Map();
      for (const e of aliveEnemies) hullBefore.set(e, e.stats?.hull ?? 0);

      turretSystem.update(dt, mothership, aliveEnemies);

      for (const enemy of aliveEnemies) {
        const before = hullBefore.get(enemy) ?? 0;
        const after = enemy.stats?.hull ?? 0;
        if (before > 0 && after <= 0 && enemy.state !== "dead") {
          enemy.state = "dead";
          combatEffects.addDeathEffect(enemy.position, enemy.type, enemy.color);
          const explosionType = enemy.type === "patrol-cruiser" ? "explosion-large" : "explosion-small";
          audio.playSFX(explosionType, enemy.position);
        }
      }
    } else {
      const hits = weaponSystem.update(mothership.position, aliveEnemies, mothership.systems, dt);
      for (const hit of hits) {
        // Fire through attack system for consistent visuals + audio
        const pulseLaser = getAttack("pulse-laser");
        attackSystem.fire(mothership, hit.enemy, { ...pulseLaser, damage: 0 }, "player");

        if (hit.enemy.state === "dead") {
          combatEffects.addDeathEffect(hit.enemy.position, hit.enemy.type, hit.enemy.color);
          const explosionType = hit.enemy.type === "patrol-cruiser" ? "explosion-large" : "explosion-small";
          audio.playSFX(explosionType, hit.enemy.position);
        }
      }
    }
  } else {
    // Even when the ship is dead, keep the laser pool decaying so existing
    // pulses don't get frozen mid-fade.
    turretSystem.update(dt, null, []);
  }

  // Update attack system (projectiles + beams)
  attackSystem.update(dt);
  combatEffects.update(dt);

  // ── Shield visual (only when alive) ──
  if (shipAlive) {
    shieldBubble.update(elapsed);
    shieldBubble.setVisible(mothership.systems.shields > 0);

    const shieldDrop = prevShields - mothership.systems.shields;
    if (shieldDrop > 0) {
      // Prefer the actual recorded impact position if takeDamage was called
      // with one. Falls back to a random angle for legacy callers that don't
      // pass an impact position.
      let hitPos;
      if (mothership.lastShieldImpact) {
        hitPos = { ...mothership.lastShieldImpact };
        mothership.lastShieldImpact = null;
      } else {
        const hitAngle = Math.random() * Math.PI * 2;
        hitPos = {
          x: mothership.position.x + Math.cos(hitAngle) * mothership.shieldRadius,
          y: mothership.position.y + (Math.random() - 0.5) * mothership.shieldRadius * 0.6,
          z: mothership.position.z + Math.sin(hitAngle) * mothership.shieldRadius,
        };
      }
      shieldBubble.hit(hitPos, elapsed);
      combatEffects.addHitFlash(hitPos);
      screenShake.addTrauma(damageToTrauma(shieldDrop));
      // Audio: shield hit
      audio.playSFX("shield-hit", mothership.position);
    }
    prevShields = mothership.systems.shields;

    const hullDrop = prevHull - mothership.systems.hull;
    if (hullDrop > 0) {
      screenShake.addTrauma(damageToTrauma(hullDrop * 2));
      // Audio: hull impact
      audio.playSFX("hull-hit", mothership.position);
      // Damage visuals: register hull hit with scar
      const hullHitAngle = Math.random() * Math.PI * 2;
      const hullHitPos = {
        x: mothership.position.x + Math.cos(hullHitAngle) * 8,
        y: mothership.position.y + (Math.random() - 0.5) * 4,
        z: mothership.position.z + Math.sin(hullHitAngle) * 8,
      };
      const intensity = Math.min(1, hullDrop / mothership.systems.hullMax * 10);
      damageVisuals.registerHit(hullHitPos, intensity, mothership.mesh);
    }
    prevHull = mothership.systems.hull;

    // ── Energy regen ──
    mothership.systems.energy = Math.min(
      mothership.systems.energyMax,
      mothership.systems.energy + mothership.systems.energyProduction * dt
    );

    // ── Shield regen (energy-based) ──
    const shieldRegenRate = powerAllocator.getShieldRegenRate(mothership.systems.energyProduction);
    if (mothership.systems.shields < mothership.systems.shieldsMax) {
      mothership.systems.shields = Math.min(
        mothership.systems.shieldsMax,
        mothership.systems.shields + shieldRegenRate * dt
      );
    }
  } else {
    shieldBubble.setVisible(false);
  }

  // ── Drone shield regen rate (from power allocation) ──
  const shieldedDrones = fleetManager.drones.filter(d => d.stats.shieldsMax > 0 && d.state !== "destroyed").length;
  fleetManager.droneShieldRegenRate = powerAllocator.getDroneShieldRegenRate(
    mothership.systems.energyProduction, shieldedDrones
  );

  // ── Drone shield visuals ──
  droneShieldRenderer.update(fleetManager.drones);

  // ── Drone light pools (ground glow) ──
  droneLightRenderer.update(fleetManager.drones);

  // ── Damage visuals (smoke, sparks, scars) ──
  {
    const damagedUnits = [];
    // Mothership (only when alive)
    if (shipAlive) {
      const msHealthPct = mothership.systems.hull / mothership.systems.hullMax;
      if (msHealthPct < 0.7) {
        damagedUnits.push({
          position: mothership.position,
          healthPct: msHealthPct,
          velocity: { x: 0, y: 0, z: 0 },
          isMothership: true,
          id: "mothership",
        });
      }
    }
    // Drones
    for (const drone of fleetManager.drones) {
      if (drone.state === "destroyed") continue;
      const dHealthPct = drone.stats.hull / drone.stats.hullMax;
      if (dHealthPct < 0.7) {
        damagedUnits.push({
          position: drone.position,
          healthPct: dHealthPct,
          velocity: drone.velocity,
          isMothership: false,
          id: drone.id,
        });
      }
    }
    // Enemies
    for (const enemy of aliveEnemies) {
      const eHealthPct = enemy.stats.hull / enemy.stats.hullMax;
      if (eHealthPct < 0.7) {
        damagedUnits.push({
          position: enemy.position,
          healthPct: eHealthPct,
          velocity: enemy.velocity,
          isMothership: false,
          id: enemy.id,
        });
      }
    }
    damageVisuals.update(dt, damagedUnits);
  }

  // ── Drone fleet ──
  fleetManager.context.deposits = depositManager.getActive();
  fleetManager.context.enemies = aliveEnemies;
  fleetManager.update(dt, elapsed, mothership.position);
  fleetRenderer.update(fleetManager.drones);

  // ── Audio: mining drones (throttled) ──
  miningAudioTimer += dt;
  if (miningAudioTimer >= MINING_AUDIO_INTERVAL) {
    const miningDrones = fleetManager.drones.filter(d => d.state === "acting" && d.type === "worker-mining");
    if (miningDrones.length > 0) {
      // Play mining sound at the first mining drone's position
      audio.playSFX("mining-beam", miningDrones[0].position);
    }
    miningAudioTimer = 0;
  }

  // ── Audio: drone deploy sounds ──
  for (const drone of fleetManager.drones) {
    if (drone.state === "deploying" && !drone._audioDeployed) {
      audio.playSFX("drone-deploy", mothership.position);
      drone._audioDeployed = true;
    }
  }

  // ── Audio: cargo deposit "ding" when miners offload at the mothership ──
  for (const drone of fleetManager.drones) {
    if (drone._pendingOffloadSound) {
      audio.playSFX("cargo-deposit", drone.position);
      drone._pendingOffloadSound = false;
    }
  }

  // ── Deposits ──
  depositManager.update();

  // ── Enemy cleanup (every 5s) ──
  if (Math.floor(elapsed) % 5 === 0) {
    enemySpawner.cleanup();
  }

  // ── Screen Shake ──
  const shakeOffset = screenShake.update(dt);
  followCam.setShakeOffset(shakeOffset);

  // ── Camera ──
  followCam.update(mothership.position, mothership.mesh.rotation.y, dt);

  // ── Terrain streaming ──
  terrainTimer += dt;
  if (terrainTimer > TERRAIN_UPDATE_INTERVAL) {
    terrain.update(mothership.position);
    terrainTimer = 0;
  }

  // ── Atmosphere ──
  atmosphere.update(elapsed);

  // ── Sky ──
  sky.update(elapsed);
  // Keep the sky sphere centered on the camera so it always surrounds the player
  sky.mesh.position.copy(camera.position);

  // ── Shadow camera follows mothership ──
  sun.position.copy(mothership.position).add(SUN_OFFSET);
  sun.target.position.copy(mothership.position);
  sun.target.updateMatrixWorld();

  // ── Extraction (only when alive) ──
  if (shipAlive && extraction.isActive()) {
    const extState = extraction.update(dt, elapsed, mothership.position);

    // Audio: extraction state transitions
    if (extState !== prevExtractionState) {
      if (extState === "stabilizing" && prevExtractionState === "idle") {
        const gatePos = extraction.getGatePosition();
        audio.playSFX("stargate-summon", gatePos);
      } else if (extState === "warping") {
        const gatePos = extraction.getGatePosition();
        audio.playSFX("stargate-warp", gatePos);
      }
      prevExtractionState = extState;
    }

    if (extState === "complete" && !missionComplete) {
      missionComplete = true;
      hud.showMissionComplete(mothership.tesseract.contents);
      endMission();
    }
  }

  // ── HUD (only when ship alive) ──
  if (!missionFailed) {
    hud.updateMissionTimer(enemySpawner.missionTimer);
    hud.updateShipStatus(mothership.systems);
    hud.updateCargo(mothership.tesseract.contents, mothership.tesseract.capacity);
    hud.updateDrones(fleetManager.getAliveCount(), fleetManager.drones.length);
    hud.updateCombat(aliveEnemies.length, enemySpawner.getThreatLevel());
    hud.updateExtraction(extraction.state, extraction.getProgress(), extraction.getTimeRemaining());
    if (mothership.repairBay) hud.updateRepairBay(mothership.repairBay.getStatus());

    // ── Dynamic music ──
    const threatLevel = enemySpawner.getThreatLevel();
    const extracting = extraction.isActive();

    if (extracting && currentMusicTrack !== "extraction") {
      audio.playMusic(MUSIC_CONFIG.extraction.track, { fadeDuration: MUSIC_CONFIG.extraction.fadeDuration });
      currentMusicTrack = "extraction";
    } else if (!extracting && threatLevel > 0.4 && currentMusicTrack !== "combat") {
      audio.playMusic(MUSIC_CONFIG.combat.track, { fadeDuration: MUSIC_CONFIG.combat.fadeDuration });
      currentMusicTrack = "combat";
    } else if (!extracting && threatLevel <= 0.4 && currentMusicTrack === "combat") {
      audio.playMusic(MUSIC_CONFIG.mission.track, { fadeDuration: MUSIC_CONFIG.mission.fadeDuration });
      currentMusicTrack = "mission";
    }
  }

  // ── Performance stats ──
  frameCount++;
  fpsTime += dt;
  if (fpsTime >= 1) {
    currentFps = frameCount;
    frameCount = 0;
    fpsTime = 0;
  }
  hud.updatePerf({
    fps: currentFps,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    chunks: terrain.chunks.size,
  });

  // ── Render ──
  renderer.render(scene, camera);
}
