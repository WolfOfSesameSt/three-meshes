/**
 * Kaiju City — Main game entry point.
 * State machine: MENU → LOADING → PLAYING
 */

import * as THREE from "three";
import { ChunkManager } from "./city/chunk-manager.js";
import { generateTestCity } from "./city/procgen.js";
import { fetchOSMData, geocodeCity } from "./city/data-osm.js";
import { voxelizeOSM } from "./city/voxelizer.js";
import { GeoProjection } from "./utils/geo.js";
import { KaijuController } from "./kaiju/controller.js";
import { FollowCamera } from "./camera/follow-camera.js";
import { DebrisSystem } from "./destruction/debris.js";
import { DustEffects } from "./destruction/effects.js";
import { processAttacks } from "./destruction/damage.js";
import { HUD } from "./ui/hud.js";
import { CitySelectUI } from "./ui/city-select.js";
import {
  BG_COLOR, SUN_COLOR, SUN_INTENSITY, AMBIENT_INTENSITY,
  FOG_FAR, BREATH_ENERGY_MAX, MAX_BBOX_SIZE,
} from "./config.js";

// ─── State ──────────────────────────────────────────────────────────
let state = "MENU"; // MENU | LOADING | PLAYING

// ─── Renderer ───────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

// ─── Scene ──────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(BG_COLOR);
scene.fog = new THREE.Fog(BG_COLOR, 100, FOG_FAR);

// Lights
const sun = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY);
sun.position.set(200, 400, 150);
scene.add(sun);
scene.add(new THREE.AmbientLight(0x8899bb, AMBIENT_INTENSITY));

// ─── Camera ─────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 3000);
const followCam = new FollowCamera(camera);

// ─── Systems (initialized on game start) ────────────────────────────
let chunkManager = null;
let kaiju = null;
let debris = null;
let dust = null;
let hud = null;

// ─── UI ─────────────────────────────────────────────────────────────
const citySelect = new CitySelectUI(handleCitySelection);
hud = new HUD();
hud.hide();

// ─── Resize ─────────────────────────────────────────────────────────
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── City Selection Handler ─────────────────────────────────────────
async function handleCitySelection(selection) {
  state = "LOADING";

  // Clean up previous game if any
  if (chunkManager) {
    chunkManager.dispose();
    chunkManager = null;
  }
  if (kaiju) {
    scene.remove(kaiju.mesh);
    scene.remove(kaiju.beamMesh);
    kaiju = null;
  }

  chunkManager = new ChunkManager(scene);
  debris = new DebrisSystem(scene);
  dust = new DustEffects(scene);

  try {
    if (selection.type === "procgen") {
      citySelect.setStatus("Generating random city...");
      generateTestCity(chunkManager, 6);
      startGame();
    } else if (selection.type === "osm") {
      citySelect.setStatus(`Looking up "${selection.query}"...`);

      const geo = await geocodeCity(selection.query);
      citySelect.setStatus(`Found: ${geo.displayName}`);

      // Calculate bbox centered on the city (1km x 1km)
      const halfSize = MAX_BBOX_SIZE / 2;
      const projection = new GeoProjection(geo.lat, geo.lng);

      // Get lat/lng bounds for the bbox
      const sw = projection.toLatLng(-halfSize, halfSize);  // southwest
      const ne = projection.toLatLng(halfSize, -halfSize);   // northeast

      const osmData = await fetchOSMData(
        sw.lat, sw.lng, ne.lat, ne.lng,
        (msg) => citySelect.setStatus(msg)
      );

      citySelect.setStatus("Voxelizing city...");
      await new Promise((r) => setTimeout(r, 50)); // let UI update

      voxelizeOSM(osmData, chunkManager, projection, (msg) => citySelect.setStatus(msg));

      startGame();
    }
  } catch (err) {
    console.error(err);
    citySelect.setStatus(`Error: ${err.message}`);
    state = "MENU";
  }
}

function startGame() {
  state = "PLAYING";
  citySelect.hide();
  hud.show();

  kaiju = new KaijuController(scene);
  // Position kaiju at center of the city
  kaiju.position.set(0, 0, 0);

  // Initial camera position
  followCam.currentPos.set(0, 200, 200);

  // Request pointer lock on click
  renderer.domElement.addEventListener("click", () => {
    if (state === "PLAYING") followCam.requestLock(renderer.domElement);
  }, { once: false });
}

// ─── Game Loop ──────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05); // cap delta to avoid spiral

  if (state === "PLAYING" && kaiju && chunkManager) {
    // Update kaiju
    const { attacks } = kaiju.update(delta, followCam);

    // Process attacks
    if (attacks.length > 0) {
      processAttacks(attacks, chunkManager, debris, followCam);

      // Spawn dust at attack locations
      for (const a of attacks) {
        const pos = a.position || a.origin;
        if (pos) dust.spawn(pos.x, pos.y, pos.z, 3);
      }
    }

    // Update systems
    chunkManager.update(kaiju.position.x, kaiju.position.z);
    debris.update(delta);
    dust.update(delta);
    followCam.update(kaiju.position, kaiju.yaw, delta);
    hud.update(kaiju.energy, BREATH_ENERGY_MAX);
  }

  renderer.render(scene, camera);
}

animate();
