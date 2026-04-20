/**
 * Fairy Permaculture — main game entry.
 *
 * Current scope (C0.1 + C1.1 + C2.1 + C3.1 + C3.2 + C4.1 + C4.2 + C4.3):
 *   - Three.js scene w/ warm sun + cool ambient
 *   - Isometric overseer camera rig with WASD + edge-scroll + zoom + waypoints
 *   - BC coastal biome terrain generated from seed 42 (chunked mesh)
 *   - A handful of placeholder fairies using the procgen primitive mesh,
 *     parked around the starting homestead
 *   - SoilField initialised from biome OM; day-tick scheduler wired up
 *   - Plant manager with 5 salmonberry bushes seeded near the homestead,
 *     progressing seed → mature → ripe fruit on day ticks
 *   - Animal manager with a starter chicken, plus hive/coop/shed building
 *     primitives ready for branch-A (honey) and branch-C (milk) nodes
 *
 * Compost + fairy roles + full game are delegated to their own
 * modules and will be wired in as chunks land.
 */

import * as THREE from "three";
import {
  BG_COLOR,
  FOG_NEAR,
  FOG_FAR,
  SUN_COLOR,
  SUN_INTENSITY,
  AMBIENT_COLOR,
  AMBIENT_INTENSITY,
} from "./config.js";
import { createCameraRig } from "./core/camera-rig.js";
import { createFleet } from "./fairies/fleet.js";
import { createPopulation } from "./fairies/population.js";
import {
  fairyFood as fairyFoodCounters,
  onChange as onFoodChange,
  reset as resetFairyFood,
} from "./fairies/fairy-food.js";
import { createJuice } from "./ui/juice/index.js";
import { createEventEngine } from "./events/event-engine.js";
import {
  generateBiome,
  mountBiome,
  homesteadWorldCenter,
} from "./biome/index.js";
import { createTreeState } from "./progression/tree-state.js";
import { createEventBus } from "./progression/events.js";
import { createBranchTreePanel } from "./ui/branch-tree/branch-tree-panel.js";
import {
  createScheduler,
  advanceDay,
  onDay,
  setSpeed,
  SECONDS_PER_DAY,
} from "./core/day-tick.js";
import {
  createSoilField,
  initializeFromOmField,
} from "./farm/soil.js";
import { createPlantManager } from "./farm/plant-manager.js";
import { createPlantRenderer } from "./farm/plant-renderer.js";
import { createAnimalManager } from "./farm/animal-manager.js";
import { createAnimalMesh } from "./farm/animal-mesh.js";
import { fairyFood } from "./farm/fairy-food.js";
import { findPoi } from "./biome/pois.js";
import plantsCatalogue from "./data/plants.json" with { type: "json" };
import { MAP_TILES, TILE_SIZE } from "./config.js";
import bcCoastal from "./data/biomes/bc-coastal.json" with { type: "json" };
import { createWeatherListener } from "./core/weather.js";
import { serializeGame } from "./save/serialize.js";
import { hydrateGame } from "./save/hydrate.js";
import { saveSlot, loadSlot } from "./save/storage.js";
import { startAutosave } from "./save/autosave.js";
import { createHud } from "./ui/hud/hud.js";
import { createInteractionLayer } from "./ui/interactions.js";
import { createFairyInfoPanel } from "./ui/fairy-info-panel.js";
import { createGoals } from "./ui/goals/goals.js";
import { createCompostPanel } from "./ui/compost-panel.js";
import { createCompostPileMesh, updateCompostPileVisual } from "./farm/compost-mesh.js";
import { Pile } from "./compost/pile.js";
import { currentSeasonName } from "./core/day-tick.js";
import { add as addFairyFood } from "./fairies/fairy-food.js";
import { createMusicManager } from "./audio/music-manager.js";

// ─── Renderer ──────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// ─── Scene ─────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(BG_COLOR);
scene.fog = new THREE.Fog(BG_COLOR, FOG_NEAR, FOG_FAR);

// ─── Camera rig ────────────────────────────────────────────────
const rig = createCameraRig(renderer.domElement);

// ─── Lights ────────────────────────────────────────────────────
// Sun follows the camera target so shadows render where the player is
// looking. We re-center the shadow camera + directional light each
// frame from inside the render loop further down.
const sun = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -60;
sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60;
sun.shadow.camera.bottom = -60;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 500;
sun.shadow.bias = -0.0005;
scene.add(sun);
scene.add(sun.target);
scene.add(new THREE.AmbientLight(AMBIENT_COLOR, AMBIENT_INTENSITY));

function syncSunToTarget(t) {
  sun.target.position.set(t.x, t.y, t.z);
  sun.position.set(t.x + 100, t.y + 160, t.z + 100);
}
syncSunToTarget(rig.target);

// ─── BC biome terrain (C1.1) ───────────────────────────────────
const biomeData = generateBiome(42);
const biomeMount = mountBiome(biomeData, scene);

// Point the camera at the starting homestead.
const hc = homesteadWorldCenter(biomeData);
rig.setTarget(new THREE.Vector3(hc.x, hc.y, hc.z));

// ─── Fleet + population (C2.1, C2.4, C4.4) ──────────────────────
const fleet = createFleet({ scene, grove: { x: hc.x, z: hc.z + 2 } });
// The first fairy is the overseer's starting helper — make them a composter.
const seedFairy = fleet.spawn("Willow");
fleet.assignRole(seedFairy, "composter");

// Juice HUD overlay.
const juiceOverlay = document.createElement("div");
juiceOverlay.id = "fp-juice-overlay";
juiceOverlay.style.cssText = "position:absolute; inset:0; pointer-events:none; z-index:100;";
document.body.appendChild(juiceOverlay);
const juice = createJuice({ scene, camera: rig.camera, container: juiceOverlay });

// ─── Music manager (Zelda-style dynamic score) ────────────────
// We declare this before the population callback so the marquee
// new-fairy moment can trigger the milestone stinger. The manager
// reads `lateWorld.scheduler` / `lateWorld.eventEngine` via the
// getMusicState callback — they're both filled in further down.
const musicManager = createMusicManager({
  getMusicState: () => {
    const sched = lateWorld.scheduler;
    const engine = lateWorld.eventEngine;
    const season = sched ? currentSeasonName(sched) : "spring";
    const anyEventActive = !!(engine && typeof engine.activeEvents === "function" && engine.activeEvents().length > 0);
    // Until real time-of-day lighting ships, use season as a proxy:
    // spring/summer → day music, autumn/winter → night music.
    const timeOfDay = (season === "autumn" || season === "winter") ? "night" : "day";
    return { season, timeOfDay, anyEventActive };
  },
});

// Population manager wires fairy-food → new fairies. Each spawn fires
// the marquee "new fairy" juice moment.
const population = createPopulation({
  cap: 25, // MVP cap
  onSpawn: ({ name }) => {
    const f = fleet.spawn(name);
    const pos = f.mesh?.position ?? { x: hc.x, y: hc.y + 1, z: hc.z };
    juice.newFairyUnlock(pos, name);
    musicManager.playMilestone();
  },
});

// Hook fairy-food adds to juice (harvest-honey, milk, etc.).
onFoodChange((kind, amount, snap) => {
  // Juice already fires in the harvest code path; the population
  // spawn callback handles the marquee moment.
  void snap;
  void amount;
  void kind;
});

// Running tallies the HUD reads. Separate from fairyFood (which
// resets on spend) so the player sees absolute-biomass / compost
// progress.
const farmTotals = { biomass: 0, compost: 0 };
function hudSnapshot() {
  const ff = fairyFoodCounters;
  return {
    day: scheduler?.day ?? 0,
    year: scheduler?.year ?? 0,
    seasonName: scheduler ? currentSeasonName(scheduler) : "spring",
    fairyCount: fleet?.count ?? 1,
    fairyCap: population?.cap ?? 25,
    honey: ff.honey ?? 0,
    milk: ff.milk ?? 0,
    fruit: ff.fruit ?? 0,
    biomass: farmTotals.biomass,
    compost: farmTotals.compost,
    goal: farmTotals.biomass < 10
      ? "Click ripe berries to harvest. First five will start your farm."
      : fairyFoodCounters.fruit > 5 && fairyFoodCounters.milk < 1
      ? "Honey + milk branches are next — press T to see the tree."
      : null,
  };
}

// ─── Render loop (set up; hudSnapshot + pulses filled in after world is ready) ──
const clock = new THREE.Clock();
const rendererSize = new THREE.Vector2();
let hud = null;
let interactions = null;
const hoverPulses = [];
// Mutable slot for late-bound world refs the render loop needs. Avoids
// TDZ errors from capturing const names declared further down.
const lateWorld = { pile: null, pileMesh: null, goalsPanel: null, playerFlags: null, scheduler: null, eventEngine: null };

// Real-time day-tick driver. SECONDS_PER_DAY (60) is the 1× baseline;
// multiply by scheduler.speed each frame and advance one game-day
// whenever `dayTimer` crosses that threshold.
// Default 2× gives a ~30 s day so the player sees growth + state shifts.
let dayTimer = 0;
// Game starts paused until the player clicks anything (browser audio
// autoplay policy + lets them read the goals first).
const gameState = { started: false };

function loop() {
  const dt = clock.getDelta();
  const t = clock.getElapsedTime();
  rig.update(dt);
  syncSunToTarget(rig.target);
  fleet.animate(t);
  for (const p of hoverPulses) p.tick(t);
  if (lateWorld.pileMesh && lateWorld.pile) {
    updateCompostPileVisual(lateWorld.pileMesh, lateWorld.pile, t);
  }

  // Auto day-tick
  if (gameState.started && lateWorld.scheduler) {
    const sched = lateWorld.scheduler;
    if (sched.speed > 0) {
      dayTimer += dt * sched.speed;
      // Advance as many days as have elapsed (safety cap = 4 per frame).
      let steps = 0;
      while (dayTimer >= SECONDS_PER_DAY && steps < 4) {
        dayTimer -= SECONDS_PER_DAY;
        advanceDay(sched, {});
        steps += 1;
      }
    }
  }

  renderer.getSize(rendererSize);
  juice.update(dt, rendererSize);
  // Music crossfade driver — internally debounced to ~2 Hz.
  musicManager.tick();
  if (hud) hud.render(hudSnapshot());
  if (lateWorld.goalsPanel) {
    lateWorld.goalsPanel.render({
      farmTotals,
      pile: lateWorld.pile,
      flags: lateWorld.playerFlags ?? {},
    });
  }
  renderer.render(scene, rig.camera);
  requestAnimationFrame(loop);
}
loop();

// First user click starts the clock + resumes audio (autoplay rules).
window.addEventListener("pointerdown", () => {
  if (!gameState.started) {
    gameState.started = true;
    console.log("[fp] game started — day-tick is live");
  }
}, { once: true });

// Attach the music-manager's gesture listeners immediately — the
// first user click/keypress anywhere will resume the AudioContext
// and start the appropriate background track.
musicManager.start();

// Tree panel observed — mark goal complete.
window.addEventListener("keydown", (e) => {
  if ((e.key === "t" || e.key === "T") && !e.ctrlKey && !e.metaKey) {
    setTimeout(() => {
      if (lateWorld.playerFlags) lateWorld.playerFlags.openedTree = true;
    }, 50);
  }
});

window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Progression tree (C3.2) ───────────────────────────────────
const progressionBus = createEventBus();
const treeState = createTreeState();
const branchTreePanel = createBranchTreePanel({
  state: treeState,
  bus: progressionBus,
});
branchTreePanel.mount(document.body);

// ─── Soil + Plant system (C3.1 + C4.1) ─────────────────────────
const soilField = createSoilField(MAP_TILES);
initializeFromOmField(soilField, biomeData.soilOm);

const scheduler = createScheduler();
const plantManager = createPlantManager(plantsCatalogue);

// Weather listener populates env.rainMm / env.rainDaysStreak /
// env.rainlessDaysStreak — used by soil + events. Attach FIRST so
// every downstream listener sees the populated env.
const weatherListener = createWeatherListener(bcCoastal, 42);
onDay(scheduler, (env) => {
  weatherListener(env);
});

onDay(scheduler, (env) => {
  plantManager.tick(env.day, env, soilField);
});

const plantRenderer = createPlantRenderer({
  manager: plantManager,
  scene,
  heightfield: biomeData.heightfield,
});

// Seed 5 salmonberry bushes near the starting homestead as MVP.
{
  const homestead = findPoi(biomeData.pois, "starting-homestead");
  if (homestead) {
    const { center, size } = homestead.meta;
    const offsets = [
      { dx: -3, dy: -2 },
      { dx: 2, dy: -3 },
      { dx: -4, dy: 1 },
      { dx: 3, dy: 2 },
      { dx: 0, dy: 4 },
    ];
    for (const { dx, dy } of offsets) {
      const tx = Math.max(0, Math.min(MAP_TILES - 1, center.x + dx));
      const ty = Math.max(0, Math.min(MAP_TILES - 1, center.y + dy));
      const p = plantManager.plantSeed("salmonberry", tx, ty);
      // Fast-forward to mature + ripe so the opening scene reads as a
      // living farm, not a field of invisible seeds.
      if (p) {
        p.stage = "mature";
        p.ageDays = 120;
        p.ripeAmount = 2;
      }
    }

    // Seed 3 mature comfrey plants — the permaculture biomass
    // accumulator. Chop-and-drop these to feed the compost pile.
    const comfreyOffsets = [
      { dx: -1, dy: 5 },
      { dx: 5, dy: -1 },
      { dx: -5, dy: -5 },
    ];
    for (const { dx, dy } of comfreyOffsets) {
      const tx = Math.max(0, Math.min(MAP_TILES - 1, center.x + dx));
      const ty = Math.max(0, Math.min(MAP_TILES - 1, center.y + dy));
      const p = plantManager.plantSeed("comfrey-bocking14", tx, ty);
      if (p) {
        p.stage = "mature";
        p.ageDays = 60;
      }
    }
    // Kick renderer to mount the freshly-seeded plants (at mature stage).
    plantRenderer.sync();
    console.log(
      `[fairy-permaculture] plant manager seeded ${plantManager.count()} salmonberry bushes`
    );
  }
}

// ─── HUD + click-to-interact ──────────────────────────────────────
hud = createHud({
  container: document.body,
  onSpeed: (v) => {
    if (lateWorld.scheduler) setSpeed(lateWorld.scheduler, v);
    gameState.started = true; // any speed change = game is running
  },
});

interactions = createInteractionLayer({
  renderer,
  camera: rig.camera,
  scene,
});

const fairyInfoPanel = createFairyInfoPanel({ container: document.body, camera: rig.camera });
const goalsPanel = createGoals({ container: document.body });

// Compost action handler — wires panel buttons to the Pile API.
const compostPanel = createCompostPanel({
  container: document.body,
  camera: rig.camera,
  onAction: (action, pile, mesh) => {
    const worldPos = mesh.position.clone(); worldPos.y += 3;
    switch (action) {
      case "greens": {
        // One armload of fresh grass / comfrey chop.
        //   ~100 kg dry = 0.4 m³  →  ~3 balanced clicks to clear the
        //   1 m³ hot threshold.  CN 15 (N-rich), 75% moisture.
        if (farmTotals.biomass < 1) return;
        farmTotals.biomass -= 1;
        pile.addIngredient({ id: "fresh-grass", dryMassKg: 100 });
        farmTotals.pileFeeds = (farmTotals.pileFeeds ?? 0) + 1;
        juice.biomassChop(worldPos, 1);
        break;
      }
      case "browns": {
        // One armload of dry leaves / straw. CN 60 (C-rich), ~15% moisture.
        if (farmTotals.biomass < 1) return;
        farmTotals.biomass -= 1;
        pile.addIngredient({ id: "dry-leaves", dryMassKg: 90 });
        farmTotals.pileFeeds = (farmTotals.pileFeeds ?? 0) + 1;
        juice.biomassChop(worldPos, 1);
        break;
      }
      case "inoculant": {
        pile.addIngredient({ id: "forest-duff-imo", dryMassKg: 1 });
        juice.biomassChop(worldPos, 0);
        break;
      }
      case "water": {
        pile.moisturePct = Math.min(100, (pile.moisturePct ?? 0) + 12);
        break;
      }
      case "cover": {
        pile.setCovered(!pile.covered);
        break;
      }
      case "turn": {
        const ok = pile.turn();
        if (ok) juice.biomassChop(worldPos, 0);
        break;
      }
      case "harvest": {
        const out = pile.harvest();
        if (out && out.kg > 0) {
          const bags = Math.max(1, Math.round(out.kg / 20));
          farmTotals.compost += bags;
          farmTotals.compostHarvested = (farmTotals.compostHarvested ?? 0) + bags;
          juice.compostScoop(worldPos, bags, out.quality ?? 3);
          compostPanel.hide();
        }
        break;
      }
    }
  },
});

// Mesh registry consumed by rebuildInteractions. Declared here so the
// function reference is valid before the animals block populates it.
const animalMeshes = new Map(); // animal.uid → Three.js mesh

// ─── First compost pile (placed at game start so the core loop is visible) ──
const pile = new Pile({ variant: "hot-pile", covered: false });
const pileMesh = createCompostPileMesh();
pileMesh.position.set(hc.x - 4, hc.y, hc.z - 4);
scene.add(pileMesh);
farmTotals.pileFeeds = 0;
farmTotals.fruitPicked = 0;
farmTotals.compostHarvested = 0;
farmTotals.pileHotSeen = false;
const playerFlags = { openedTree: false };

// Publish to the render loop.
lateWorld.pile = pile;
lateWorld.pileMesh = pileMesh;
lateWorld.goalsPanel = goalsPanel;
lateWorld.playerFlags = playerFlags;
lateWorld.scheduler = scheduler;
setSpeed(scheduler, 2); // 2× default so the world feels alive

// (Re-)register every interactable in the scene. Called whenever the
// world changes (plants harvested, fairies spawned, animals added).
function rebuildInteractions() {
  interactions.clear();

  // Plants — click dispatches based on species role:
  //   plants with a "biomass" role (comfrey, nettle, yarrow) → chop-and-drop
  //   plants with fruit (salmonberry, etc.)              → harvest
  const group = scene.getObjectByName("plants");
  if (group) {
    for (const mesh of group.children) {
      if (!mesh.children || mesh.children.length === 0) continue;
      const parts = mesh.name.split("-");
      const ty = parseInt(parts.pop(), 10);
      const tx = parseInt(parts.pop(), 10);
      const plantInst = plantManager.findAt?.(tx, ty);
      const species = plantInst ? plantManager.getSpecies(plantInst.id) : null;
      const isBiomassPlant = !!species?.roles?.includes("biomass");
      interactions.register({
        object: mesh,
        onClick: () => {
          const worldPos = mesh.position.clone(); worldPos.y += 2;
          if (isBiomassPlant) {
            const out = plantManager.chopAndDrop?.(tx, ty);
            const kg = out?.biomassKg ?? 0;
            if (kg > 0) {
              farmTotals.biomass += kg;
              juice.biomassChop(worldPos, Math.round(kg));
            }
          } else {
            const out = plantManager.harvest(tx, ty);
            if (out && out.amount > 0) {
              if (out.product === "fruit") {
                juice.berryPick(worldPos, out.amount);
                addFairyFood("fruit", out.amount);
                farmTotals.fruitPicked += 1;
              } else {
                juice.biomassChop(worldPos, out.amount);
              }
            }
          }
          plantRenderer.sync();
          rebuildInteractions();
        },
      });
    }
  }

  // Fairies — click to open info/nudge panel.
  for (const fairy of fleet.all) {
    if (!fairy.mesh) continue;
    interactions.register({
      object: fairy.mesh,
      onClick: () => fairyInfoPanel.show(fairy),
    });
  }

  // Compost pile — click opens the state + action inspector.
  interactions.register({
    object: pileMesh,
    onClick: () => compostPanel.show(pile, pileMesh),
  });

  // Animals — click for a quick info toast (same panel infra, future expansion).
  for (const [, mesh] of animalMeshes) {
    interactions.register({
      object: mesh,
      onClick: () => {
        juice.milkHarvest(mesh.position, 0); // placeholder feedback
        console.log("[fp] animal clicked:", mesh.name);
      },
    });
  }
}
rebuildInteractions();

// Re-scan when the plant manager mutates (daily tick, ripenings, deaths).
plantManager.onChange(() => rebuildInteractions());

// ─── Animal system (C4.2 + C4.3) ───────────────────────────────
// Build a world-space adapter around the tile-space plant-manager so
// the hive can query flowering pollinator plants by meters/radius.
const WORLD_OFFSET = -((MAP_TILES * TILE_SIZE) / 2);
const plantsById = new Map(plantsCatalogue.map((p) => [p.id, p]));
const plantManagerAdapter = {
  findFloweringPlantsWithin(worldX, worldZ, radiusMeters) {
    const r2 = radiusMeters * radiusMeters;
    const out = [];
    for (const p of plantManager.all()) {
      const species = plantsById.get(p.id);
      if (!species) continue;
      if (!species.roles?.includes("pollinator")) continue;
      // "Flowering" ≈ mature-stage plant.
      if (p.stage !== "mature") continue;
      const px = WORLD_OFFSET + (p.tileX + 0.5) * TILE_SIZE;
      const pz = WORLD_OFFSET + (p.tileY + 0.5) * TILE_SIZE;
      const dx = px - worldX;
      const dz = pz - worldZ;
      if (dx * dx + dz * dz <= r2) out.push(p);
    }
    return out;
  },
};

const animalManager = createAnimalManager({ plantManager: plantManagerAdapter });
onDay(scheduler, (env) => {
  animalManager.tick(env.day, env);
});

// ─── Events engine (C6.1) ───────────────────────────────────────
const eventEngine = createEventEngine({ seed: 42 });
// Expose to the music manager so it can detect "tense" moments.
lateWorld.eventEngine = eventEngine;
const worldForEvents = {
  soilField,
  plantManager,
  animalManager,
  compostPiles: [pile],
  activePenalties: { yield: [] },
  pendingRisks: {},
};
onDay(scheduler, (env) => {
  // Tick the pile each game-day so the player can watch heat / finish.
  pile.tick({ seasonId: env.seasonName, rainedToday: !!env.rained, tempC: env.tempC ?? 18, rainDaysStreak: env.rainDaysStreak ?? 0 });
  eventEngine.tick(env, worldForEvents);
  // Attach world-space coords to each pile so fairy roles can fly to them.
  const piles = worldForEvents.compostPiles.map((p) => {
    if (p === pile) {
      p.x = pileMesh.position.x;
      p.y = pileMesh.position.y;
      p.z = pileMesh.position.z;
    }
    return p;
  });
  fleet.tick(env.day, env, {
    piles,
    plantManager,
    hives: worldForEvents.hives ?? [],
    animals: animalManager.all?.() ?? [],
  });
});

// Dev flag: place a starter chicken near the homestead even though c1
// isn't unlocked yet. In the final build the UX flow unlocks c1 first;
// this preserves the MVP visual per the chunk spec.
const __DEV_STARTER_ANIMALS = true;
if (__DEV_STARTER_ANIMALS) {
  const chicken = animalManager.placeAnimal("chicken-layer", hc.x + 6, hc.z + 4);
  const mesh = createAnimalMesh("chicken-layer");
  mesh.scale.setScalar(4);           // stylized: chicken reads as ~1 m tall, smaller than the 4 m bushes
  mesh.position.set(hc.x + 6, hc.y, hc.z + 4);
  scene.add(mesh);
  animalMeshes.set(chicken.uid, mesh);
  console.log(
    "[fairy-permaculture] C4.3 starter chicken placed near homestead (dev)"
  );
}

// Animals were added after the initial rebuildInteractions() — re-scan
// so hover + click works on them too.
rebuildInteractions();

/** Debug helper: advance the day scheduler by `n` days. */
function tickDays(n = 1, env = { rainMm: 2, tempC: 18, evapBase: 2 }) {
  for (let i = 0; i < n; i++) advanceDay(scheduler, env);
}

// ─── Save / Load (C6.5) ────────────────────────────────────────
// The `game` bundle is what serialize.js and hydrate.js walk. We keep
// a stable reference here so save() and load() always see fresh state.
const game = {
  scheduler,
  treeState,
  eventEngine,
  soilField,
  compostPiles: worldForEvents.compostPiles,
  weatherListener,
  fairyFood: fairyFoodCounters,
  fairyFoodReset: resetFairyFood,
  plantManager,
  animalManager,
  biomeSeed: 42,
};

function saveGame(slotId = "manual") {
  try {
    const payload = serializeGame(game);
    const ok = saveSlot(slotId, payload);
    console.log(`[fairy-permaculture] saved → ${slotId}: ${ok}`);
    return ok;
  } catch (err) {
    console.warn("[fairy-permaculture] save failed", err);
    return false;
  }
}

function loadGame(slotId = "autosave") {
  try {
    const payload = loadSlot(slotId);
    if (!payload) {
      console.log(`[fairy-permaculture] no save in slot '${slotId}'`);
      return false;
    }
    hydrateGame(game, payload, { world: worldForEvents });
    console.log(
      `[fairy-permaculture] loaded ← ${slotId} (day=${scheduler.day}, year=${scheduler.year})`
    );
    return true;
  } catch (err) {
    console.warn("[fairy-permaculture] load failed", err);
    return false;
  }
}

// Autosave is opt-in: set `window.__FP__.autosave = true` to enable.
startAutosave(game, { enabled: () => !!window.__FP__?.autosave });

// Dev hotkeys: Ctrl-S = save, Ctrl-L = load from autosave.
window.addEventListener("keydown", (e) => {
  if (!e.ctrlKey) return;
  if (e.key === "s" || e.key === "S") {
    e.preventDefault();
    saveGame("manual");
  } else if (e.key === "l" || e.key === "L") {
    e.preventDefault();
    loadGame("autosave");
  }
});

// Expose for debugging.
if (typeof window !== "undefined") {
  window.__FP__ = {
    biomeData,
    biomeMount,
    scene,
    rig,
    renderer,
    treeState,
    progressionBus,
    branchTreePanel,
    soilField,
    scheduler,
    plantManager,
    plantRenderer,
    animalManager,
    animalMeshes,
    fairyFood: fairyFoodCounters,
    tickDays,
    fleet,
    population,
    juice,
    eventEngine,
    engine: eventEngine,
    weatherListener,
    game,
    save: saveGame,
    load: loadGame,
    autosave: false,
    musicManager,
  };
}

console.log(
  `[fairy-permaculture] C1.1 biome mounted — ${biomeData.pois.length} POIs, ` +
    `stream ${biomeData.stream.tiles.size} tiles, ` +
    `${biomeMount.chunks.length} terrain chunks`
);
console.log("[fairy-permaculture] C3.2 branch-tree ready — press T to toggle");
console.log(
  "[fairy-permaculture] C3.1 plants live — window.__FP__.tickDays(n) to fast-forward"
);
console.log(
  "[fairy-permaculture] C4.2+C4.3 animals live — __FP__.animalManager + __FP__.fairyFood"
);
