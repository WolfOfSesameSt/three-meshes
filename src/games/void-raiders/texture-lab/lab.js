/**
 * Texture lab — preview a turret head texture wrapped on the procedural
 * sphere head, side-by-side in small (laser) and heavy (cannon) sizes.
 *
 * Listing PNG files: in dev we can't read the public/ directory listing
 * directly, so we use Vite's import.meta.glob with `query: '?url'` to grab
 * every PNG that exists at build/dev time. New files added to the folder
 * after the page loaded require a Refresh List click (full reload).
 */

import * as THREE from "three";
import { buildBallTurret, buildMissileLauncher } from "../ship/turret-rigger.js";

const canvas = document.getElementById("canvas");
const status = document.getElementById("status");
const textureList = document.getElementById("texture-list");
const refreshBtn = document.getElementById("refresh");
const toggleRotateBtn = document.getElementById("toggle-rotate");
const applySmallBtn = document.getElementById("apply-small");
const applyHeavyBtn = document.getElementById("apply-heavy");
const applyBothBtn = document.getElementById("apply-both");
const clearTexBtn = document.getElementById("clear-tex");
const localFileInput = document.getElementById("local-file");

// ─── Three.js scene ─────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x06080f);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 1.5, 8.0);
camera.lookAt(0, 0, 0);

// Lighting tuned to read both metallic spheres at typical follow-cam exposure
scene.add(new THREE.AmbientLight(0x445566, 0.4));
const key = new THREE.DirectionalLight(0xffffff, 1.2);
key.position.set(3, 5, 4);
scene.add(key);
const fill = new THREE.DirectionalLight(0x88aaff, 0.5);
fill.position.set(-4, 2, -3);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffaa66, 0.4);
rim.position.set(0, -3, -5);
scene.add(rim);

// Pedestal grid for scale reference
const grid = new THREE.GridHelper(10, 10, 0x223344, 0x111822);
grid.position.y = -1.5;
scene.add(grid);

// Build the two turrets at the same scale wrapper sees in-game (8x).
// We mimic the in-game wrapper by parenting the procedural turrets under
// a Group that has scale 8, so the same dimensions used in the rigger
// produce the same world-space sizes here.
const wrapper = new THREE.Group();
wrapper.scale.setScalar(0.4); // smaller than in-game so both fit in view
scene.add(wrapper);

const SMALL_CFG = {
  baseR: 0.035,
  baseH: 0.014,
  barrelR: 0.010,
  barrelL: 0.10,
  headR: 0.035,
  color: 0x9b9bff,
};
const HEAVY_CFG = {
  baseR: 0.18,
  baseH: 0.07,
  barrelR: 0.06,
  barrelL: 0.55,
  headR: 0.24,
  color: 0xffaa55,
};

// Build all three turret tiers at origin then nest each in a per-turret
// holder so we can scale them independently for the preview. The small
// laser is built at actual in-game dimensions (~0.035 head radius), which
// is tiny next to the heavy cannon's 0.24, so we boost it by 6x for
// visibility while leaving the in-game build identical.
const smallTurret = buildBallTurret(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), SMALL_CFG);
const heavyTurret = buildBallTurret(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), HEAVY_CFG);
const launcher = buildMissileLauncher(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), {
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

const smallHolder = new THREE.Group();
smallHolder.position.set(-5.0, 0, 0);
smallHolder.scale.setScalar(6.0); // preview-only zoom on the small turret
smallHolder.add(smallTurret.group);
wrapper.add(smallHolder);

const heavyHolder = new THREE.Group();
heavyHolder.position.set(0, 0, 0);
heavyHolder.add(heavyTurret.group);
wrapper.add(heavyHolder);

const launcherHolder = new THREE.Group();
launcherHolder.position.set(5.0, 0, 0);
launcherHolder.add(launcher.group);
wrapper.add(launcherHolder);

// Static aim — point the launcher's barrel forward toward camera so we
// can see the missile tips poking out of the front of the tubes.
launcher.pitchPivot.rotation.x = -0.4;

// buildBallTurret returns direct `head` and `barrel` references — no more
// brittle "find the largest mesh" heuristic that was matching the wrong
// mesh. We can apply textures to either part independently.
const smallHead = smallTurret.head;
const heavyHead = heavyTurret.head;
const smallBarrel = smallTurret.barrel;
const heavyBarrel = heavyTurret.barrel;

// Tilt both so we can see top of sphere
smallTurret.pitchPivot.rotation.x = -0.3;
heavyTurret.pitchPivot.rotation.x = -0.3;

// ─── Texture loading + apply ─────────────────────────────────
const loader = new THREE.TextureLoader();
let activeUrl = null;

function applyTexture(url, target) {
  if (!url) return;
  status.textContent = `Loading ${url.split("/").pop()}…`;
  loader.load(
    url,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      // Each target wraps the visible body parts of the turret so it
      // reads as one armored unit with a unified skin. Heavy and missile
      // launcher both share the "heavy" skin slot.
      const meshes = [];
      if (target === "small" || target === "both") meshes.push(smallHead, smallBarrel);
      if (target === "heavy" || target === "both") {
        meshes.push(heavyHead, heavyBarrel);
        // Launcher: housing + front plate get the wrap. Tubes stay dark
        // so the bores read as recessed.
        meshes.push(launcher.head, launcher.barrel);
      }
      for (const m of meshes) {
        if (!m) continue;
        m.material.map = tex;
        // Lighten the base color so the texture isn't tinted dark
        m.material.color.set(0xffffff);
        m.material.needsUpdate = true;
      }
      activeUrl = url;
      status.textContent = `Applied ${url.split("/").pop()} → ${target}`;
    },
    undefined,
    (err) => {
      status.textContent = `Failed: ${err.message || err}`;
    },
  );
}

function clearTextures() {
  const all = [
    { mesh: smallHead, baseColor: SMALL_CFG.color },
    { mesh: smallBarrel, baseColor: 0x888899 },
    { mesh: heavyHead, baseColor: HEAVY_CFG.color },
    { mesh: heavyBarrel, baseColor: 0x888899 },
    { mesh: launcher.head, baseColor: 0x556677 },
    { mesh: launcher.barrel, baseColor: 0x556677 },
  ];
  for (const { mesh, baseColor } of all) {
    if (!mesh) continue;
    if (mesh.material.map) mesh.material.map.dispose();
    mesh.material.map = null;
    mesh.material.color.set(baseColor);
    mesh.material.needsUpdate = true;
  }
  activeUrl = null;
  status.textContent = "Cleared textures";
  for (const el of textureList.querySelectorAll(".texture-item")) el.classList.remove("active");
}

// ─── Texture file listing ────────────────────────────────────
// Vite's import.meta.glob lets us grab every file in a folder at build/dev
// time. We use eager URLs so each match is just a string we can pass to
// the loader. The path is relative to THIS file.
function listTextures() {
  // eager URL imports for every PNG in public/textures/turrets via fetch
  // (we can't use import.meta.glob across the public/ boundary, so we do
  // a manifest fetch with a fallback).
  return fetch("/textures/turrets/manifest.json")
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);
}

async function rebuildList() {
  textureList.innerHTML = "";
  const files = await listTextures();
  if (files.length === 0) {
    textureList.innerHTML = '<p style="color:#666;font-size:11px">No textures yet. Generate one with <code>npm run texture</code>.</p>';
    return;
  }
  for (const file of files) {
    const url = `/textures/turrets/${file}`;
    const item = document.createElement("div");
    item.className = "texture-item";
    item.innerHTML = `<img src="${url}" /><span class="name">${file}</span>`;
    item.addEventListener("click", () => {
      for (const el of textureList.querySelectorAll(".texture-item")) el.classList.remove("active");
      item.classList.add("active");
      applyTexture(url, "both");
    });
    textureList.appendChild(item);
  }
  status.textContent = `Found ${files.length} texture file(s)`;
}

// ─── UI bindings ─────────────────────────────────────────────
// ─── Save textures so the game picks them up ─────────────────
// localStorage keys read by ship/turret-rigger.js loadActiveSkins().
// Same origin between lab and game so the values persist across both.
const SKIN_KEY_SMALL = "void-raiders.turret-skin.small";
const SKIN_KEY_HEAVY = "void-raiders.turret-skin.heavy";
const savedStatus = document.getElementById("saved-status");

function saveAsSmall() {
  if (!activeUrl) { savedStatus.textContent = "Click a texture first."; return; }
  const file = activeUrl.split("/").pop();
  localStorage.setItem(SKIN_KEY_SMALL, file);
  savedStatus.textContent = `✓ Small turret skin saved: ${file}`;
}
function saveAsHeavy() {
  if (!activeUrl) { savedStatus.textContent = "Click a texture first."; return; }
  const file = activeUrl.split("/").pop();
  localStorage.setItem(SKIN_KEY_HEAVY, file);
  savedStatus.textContent = `✓ Heavy turret skin saved: ${file}`;
}
function clearSaved() {
  localStorage.removeItem(SKIN_KEY_SMALL);
  localStorage.removeItem(SKIN_KEY_HEAVY);
  savedStatus.textContent = "Cleared saved skins.";
}
document.getElementById("save-small").addEventListener("click", saveAsSmall);
document.getElementById("save-heavy").addEventListener("click", saveAsHeavy);
document.getElementById("clear-saved").addEventListener("click", clearSaved);

// Show what's currently saved on page load
const currentSmall = localStorage.getItem(SKIN_KEY_SMALL);
const currentHeavy = localStorage.getItem(SKIN_KEY_HEAVY);
if (currentSmall || currentHeavy) {
  savedStatus.textContent = `Saved: small=${currentSmall || "—"}, heavy=${currentHeavy || "—"}`;
}

refreshBtn.addEventListener("click", rebuildList);
let spinning = true;
toggleRotateBtn.addEventListener("click", () => {
  spinning = !spinning;
  toggleRotateBtn.textContent = spinning ? "Pause spin" : "Resume spin";
});
applySmallBtn.addEventListener("click", () => activeUrl && applyTexture(activeUrl, "small"));
applyHeavyBtn.addEventListener("click", () => activeUrl && applyTexture(activeUrl, "heavy"));
applyBothBtn.addEventListener("click", () => activeUrl && applyTexture(activeUrl, "both"));
clearTexBtn.addEventListener("click", clearTextures);
localFileInput.addEventListener("change", (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const url = URL.createObjectURL(f);
  applyTexture(url, "both");
});

// ─── Resize + render loop ────────────────────────────────────
function resize() {
  const stage = document.getElementById("stage");
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// ─── Launcher demo state machine (simplified mirror of TurretSystem) ──
// Cycles: fire 6 chambers → tilt barrel up to the sky → load tips back
// in one at a time (with a revolver click between each) → drop barrel
// back to combat aim. Same sequence the in-game launcher runs.
const LAUNCH_CFG = {
  fireInterval: 0.45,
  burst: 6,
  rotateTime: 0.18,
  tiltUpTime: 0.55,
  skyAngle: -1.35,         // pitchPivot.rotation.x for "looking up"
  combatAngle: -0.4,       // baseline aim pitch when not reloading
  reloadStepTime: 0.55,    // per-missile load delay
  reloadRotateTime: 0.18,
  tiltDownTime: 0.4,       // ease back to combat aim after full reload
};
const launcherState = {
  state: "loaded", // loaded | rotating | tilting_up | reloading | reload_rotate | tilting_down
  t: 0,
  shotsLeft: LAUNCH_CFG.burst,
  chamber: 0,
  fireTimer: 0.5,
  rotateFrom: 0,
  rotateTo: 0,
  rotateT: 0,
  reloadCursor: 0,
  tiltFrom: 0,
};

function tickLauncherDemo(dt) {
  const s = launcherState;
  s.t += dt;

  if (s.state === "loaded") {
    s.fireTimer -= dt;
    if (s.fireTimer <= 0 && s.shotsLeft > 0) {
      const tip = launcher.missileTips[s.chamber];
      if (tip) tip.visible = false;
      s.shotsLeft--;
      s.fireTimer = LAUNCH_CFG.fireInterval;

      if (s.shotsLeft <= 0) {
        // Burst complete — start tilting up
        s.state = "tilting_up";
        s.t = 0;
        s.tiltFrom = launcher.pitchPivot.rotation.x;
        s.reloadCursor = 0;
      } else {
        s.state = "rotating";
        s.t = 0;
        s.rotateFrom = launcher.revolver.rotation.z;
        s.rotateTo = s.rotateFrom + (Math.PI * 2) / 6;
        s.rotateT = 0;
      }
    }
    return;
  }

  if (s.state === "rotating") {
    s.rotateT += dt / LAUNCH_CFG.rotateTime;
    const t = Math.min(1, s.rotateT);
    const eased = t * t * (3 - 2 * t);
    launcher.revolver.rotation.z = s.rotateFrom + (s.rotateTo - s.rotateFrom) * eased;
    if (t >= 1) {
      s.chamber = (s.chamber + 1) % LAUNCH_CFG.burst;
      s.state = "loaded";
      s.t = 0;
    }
    return;
  }

  if (s.state === "tilting_up") {
    const t = Math.min(1, s.t / LAUNCH_CFG.tiltUpTime);
    const eased = 1 - (1 - t) * (1 - t);
    launcher.pitchPivot.rotation.x = s.tiltFrom + (LAUNCH_CFG.skyAngle - s.tiltFrom) * eased;
    if (t >= 1) {
      s.state = "reloading";
      s.t = 0;
    }
    return;
  }

  if (s.state === "reloading") {
    launcher.pitchPivot.rotation.x = LAUNCH_CFG.skyAngle;
    if (s.t >= LAUNCH_CFG.reloadStepTime) {
      const idx = s.reloadCursor % LAUNCH_CFG.burst;
      const tip = launcher.missileTips[idx];
      if (tip) tip.visible = true;
      s.reloadCursor++;

      if (s.reloadCursor >= LAUNCH_CFG.burst) {
        // Fully reloaded — start tilting back down to combat aim
        s.shotsLeft = LAUNCH_CFG.burst;
        s.state = "tilting_down";
        s.t = 0;
        s.tiltFrom = launcher.pitchPivot.rotation.x;
      } else {
        s.rotateFrom = launcher.revolver.rotation.z;
        s.rotateTo = s.rotateFrom + (Math.PI * 2) / 6;
        s.rotateT = 0;
        s.state = "reload_rotate";
        s.t = 0;
      }
    }
    return;
  }

  if (s.state === "reload_rotate") {
    launcher.pitchPivot.rotation.x = LAUNCH_CFG.skyAngle;
    s.rotateT += dt / LAUNCH_CFG.reloadRotateTime;
    const t = Math.min(1, s.rotateT);
    const eased = t * t * (3 - 2 * t);
    launcher.revolver.rotation.z = s.rotateFrom + (s.rotateTo - s.rotateFrom) * eased;
    if (t >= 1) {
      s.state = "reloading";
      s.t = 0;
    }
    return;
  }

  if (s.state === "tilting_down") {
    const t = Math.min(1, s.t / LAUNCH_CFG.tiltDownTime);
    const eased = 1 - (1 - t) * (1 - t);
    launcher.pitchPivot.rotation.x = s.tiltFrom + (LAUNCH_CFG.combatAngle - s.tiltFrom) * eased;
    if (t >= 1) {
      launcher.pitchPivot.rotation.x = LAUNCH_CFG.combatAngle;
      s.state = "loaded";
      s.t = 0;
      s.fireTimer = LAUNCH_CFG.fireInterval;
    }
    return;
  }
}

let lastT = performance.now();
function tick() {
  const now = performance.now();
  const dt = (now - lastT) / 1000;
  lastT = now;

  if (spinning) {
    smallTurret.yawPivot.rotation.y += dt * 0.6;
    heavyTurret.yawPivot.rotation.y += dt * 0.4;
    launcher.yawPivot.rotation.y += dt * 0.3;
  }

  // Launcher always demos its fire/reload cycle so the user can see the
  // full sequence without having to spawn enemies.
  tickLauncherDemo(dt);

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

rebuildList();
