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
import { Terrain, getTerrainHeight } from "./realm/terrain.js";
import { createAtmosphere } from "./realm/atmosphere.js";
import { createSky } from "./realm/sky.js";
import { Mothership } from "./ship/mothership.js";
import { updateMovement, generateTestRoute } from "./ship/movement.js";
import { FollowCamera } from "./camera/follow-camera.js";
import { FleetManager } from "./drones/fleet-manager.js";
import { FleetRenderer } from "./drones/fleet-renderer.js";
import { createDrone } from "./drones/drone.js";
import { createSwarm, addDroneToSwarm } from "./drones/swarm.js";
import { DepositManager } from "./realm/deposits.js";
import { EnemySpawner } from "./combat/spawner.js";
import { EnemyRenderer } from "./combat/enemy-renderer.js";
import { updateEnemyAI } from "./combat/enemy-ai.js";
import { WeaponSystem } from "./ship/weapon.js";
import { CombatEffects } from "./combat/effects.js";
import { ScreenShake, damageToTrauma, weaponFireTrauma } from "./combat/screen-shake.js";
import { createShieldBubble } from "./combat/shield-effect.js";
import { ExtractionSystem } from "./ship/stargate.js";
import { AttackSystem } from "./combat/attack-system.js";
import { getAttack } from "./combat/attack-defs.js";
import { RoutinePanel } from "./ui/mission/routine-panel.js";
import { PowerAllocator } from "./ship/power.js";
import { DroneShieldRenderer } from "./combat/drone-shields.js";
import { DamageVisuals } from "./combat/damage-visuals.js";
import { HUD } from "./ui/mission/hud.js";
import { Station } from "./ui/station/station.js";
import { gameState, deliverResources } from "./economy/game-state.js";
import { AudioManager } from "./audio/audio-manager.js";
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

const SFX_MANIFEST = {
  "weapon-pulse": "/audio/sfx/weapon-pulse.mp3",
  "weapon-drone-laser": "/audio/sfx/weapon-drone-laser.mp3",
  "weapon-plasma-bolt": "/audio/sfx/weapon-plasma-bolt.mp3",
  "weapon-heavy-cannon": "/audio/sfx/weapon-heavy-cannon.mp3",
  "weapon-turret-beam": "/audio/sfx/weapon-turret-beam.mp3",
  "shield-hit": "/audio/sfx/shield-hit.mp3",
  "hull-hit": "/audio/sfx/hull-hit.mp3",
  "explosion-small": "/audio/sfx/explosion-small.mp3",
  "explosion-large": "/audio/sfx/explosion-large.mp3",
  "mining-beam": "/audio/sfx/mining-beam.mp3",
  "stargate-summon": "/audio/sfx/stargate-summon.mp3",
  "stargate-warp": "/audio/sfx/stargate-warp.mp3",
  "drone-deploy": "/audio/sfx/drone-deploy.mp3",
  "ui-click": "/audio/sfx/ui-click.mp3",
  "ui-alert": "/audio/sfx/ui-alert.mp3",
};

// Throttle state for repeating sounds (mining, etc.)
let miningAudioTimer = 0;
const MINING_AUDIO_INTERVAL = 2.5; // seconds between mining beam sounds

// Track extraction state transitions for one-shot sounds
let prevExtractionState = "idle";

// ─── Mission-scoped state ──────────────────────────────────────
let mothership, followCam, terrain, atmosphere, sky, depositManager;
let enemySpawner, enemyRenderer, weaponSystem, combatEffects, screenShake, attackSystem;
let shieldBubble, fleetManager, fleetRenderer, extraction, hud, routinePanel;
let powerAllocator, droneShieldRenderer, damageVisuals;
let missionComplete = false;
let missionRunning = false;
let prevShields = 0;
let prevHull = 0;
let animFrameId = null;

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
  onLaunch: () => startMission(),
});

station.show();

// ─── Mission Lifecycle ─────────────────────────────────────────

async function startMission() {
  cleanupMission();

  missionComplete = false;
  missionRunning = true;

  // ── Audio preload ──
  await audio.preload(SFX_MANIFEST);

  // ── Mothership ──
  mothership = new Mothership();

  // Apply persistent stats from gameState
  const ms = gameState.mothership;
  mothership.systems.hull = ms.hullMax;
  mothership.systems.hullMax = ms.hullMax;
  mothership.systems.shields = ms.shieldsMax;
  mothership.systems.shieldsMax = ms.shieldsMax;
  mothership.systems.energy = ms.energyMax;
  mothership.systems.energyMax = ms.energyMax;
  mothership.tesseract.capacity = ms.tesseractCapacity;

  const startX = 0;
  const startZ = 0;
  const tH = getTerrainHeight(startX, startZ);
  mothership.mesh.position.set(startX, tH * VOXEL_SCALE + 50, startZ);
  scene.add(mothership.mesh);
  mothership.route = generateTestRoute(startX, startZ, 5000, 20);

  // ── Camera ──
  followCam = new FollowCamera(camera, renderer.domElement);
  followCam.snap(mothership.position, mothership.mesh.rotation.y);

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

  // ── Deposits ──
  depositManager = new DepositManager(scene, Date.now());
  depositManager.spawnAlongRoute(mothership.route, 30);

  // ── Combat ──
  enemySpawner = new EnemySpawner();
  enemyRenderer = new EnemyRenderer(scene);
  weaponSystem = new WeaponSystem();
  combatEffects = new CombatEffects(scene);
  screenShake = new ScreenShake();
  attackSystem = new AttackSystem(scene, combatEffects, screenShake);
  attackSystem.audioManager = audio;

  // ── Shield Bubble ──
  shieldBubble = createShieldBubble(14, 0x4488ff);
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
  }, 3000);
}

function cleanupMission() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  if (hud) { hud.dispose(); hud = null; }
  if (routinePanel) { routinePanel.dispose(); routinePanel = null; }
  if (droneShieldRenderer) { droneShieldRenderer.dispose(); droneShieldRenderer = null; }
  if (damageVisuals) { damageVisuals.dispose(); damageVisuals = null; }
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
  if (!extraction || !mothership) return;
  if (extraction.state === "idle" && !missionComplete) {
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

  // ── Mothership movement ──
  updateMovement(mothership, dt);

  const shipTerrainH = getTerrainHeight(mothership.position.x, mothership.position.z);
  const targetY = shipTerrainH * VOXEL_SCALE + 50;
  mothership.position.y += (targetY - mothership.position.y) * 2 * dt;

  // ── Enemies ──
  enemySpawner.update(dt, mothership.position);
  const aliveEnemies = enemySpawner.getAlive();
  const combatTargets = { mothership, drones: fleetManager.drones };
  for (const enemy of aliveEnemies) {
    updateEnemyAI(enemy, combatTargets, dt, elapsed, attackSystem);
  }
  enemyRenderer.update(enemySpawner.enemies);

  // ── Mothership weapons ──
  const hits = weaponSystem.update(mothership.position, aliveEnemies, mothership.systems, dt);
  for (const hit of hits) {
    // Fire through attack system for consistent visuals + audio
    const pulseLaser = getAttack("pulse-laser");
    attackSystem.fire(mothership, hit.enemy, { ...pulseLaser, damage: 0 });

    if (hit.enemy.state === "dead") {
      combatEffects.addDeathEffect(hit.enemy.position, hit.enemy.type, hit.enemy.color);
      // Audio: enemy explosion (large for cruisers, small for scouts)
      const explosionType = hit.enemy.type === "patrol-cruiser" ? "explosion-large" : "explosion-small";
      audio.playSFX(explosionType, hit.enemy.position);
    }
  }

  // Update attack system (projectiles + beams)
  attackSystem.update(dt);
  combatEffects.update(dt);

  // ── Shield visual ──
  shieldBubble.update(elapsed);
  shieldBubble.setVisible(mothership.systems.shields > 0);

  const shieldDrop = prevShields - mothership.systems.shields;
  if (shieldDrop > 0) {
    const hitAngle = Math.random() * Math.PI * 2;
    const hitPos = {
      x: mothership.position.x + Math.cos(hitAngle) * 12,
      y: mothership.position.y + (Math.random() - 0.5) * 8,
      z: mothership.position.z + Math.sin(hitAngle) * 12,
    };
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

  // ── Drone shield regen rate (from power allocation) ──
  const shieldedDrones = fleetManager.drones.filter(d => d.stats.shieldsMax > 0 && d.state !== "destroyed").length;
  fleetManager.droneShieldRegenRate = powerAllocator.getDroneShieldRegenRate(
    mothership.systems.energyProduction, shieldedDrones
  );

  // ── Drone shield visuals ──
  droneShieldRenderer.update(fleetManager.drones);

  // ── Damage visuals (smoke, sparks, scars) ──
  {
    const damagedUnits = [];
    // Mothership
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

  // ── Extraction ──
  if (extraction.isActive()) {
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

  // ── HUD ──
  hud.updateMissionTimer(enemySpawner.missionTimer);
  hud.updateShipStatus(mothership.systems);
  hud.updateCargo(mothership.tesseract.contents, mothership.tesseract.capacity);
  hud.updateDrones(fleetManager.getAliveCount(), fleetManager.drones.length);
  hud.updateCombat(aliveEnemies.length, enemySpawner.getThreatLevel());
  hud.updateExtraction(extraction.state, extraction.getProgress(), extraction.getTimeRemaining());

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
