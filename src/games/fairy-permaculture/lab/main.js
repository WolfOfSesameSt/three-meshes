/**
 * Fairy Permaculture — Dev Lab entry.
 *
 * Tabbed dev tool. Three functional tabs in C0.3 scope:
 *   1. Model Viewer — drag-drop GLB/GLTF, toon shader, palette remap, season/tod LUT
 *   2. Shader Lab   — hot-reload GLSL against a stock sphere
 *   3. Balance Tuning — edit balance.json live, save as proposal
 *
 * The rest are scaffolded placeholders awaiting future chunks.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PALETTE } from "../config.js";

// ─── Tab switching ────────────────────────────────────────────────
const tabs = document.querySelectorAll("nav.tabs button");
const panels = document.querySelectorAll(".panel");
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab;
    tabs.forEach((t) => t.classList.toggle("active", t === tab));
    panels.forEach((p) => p.classList.toggle("active", p.id === `panel-${target}`));
  });
});

const status = (msg) => {
  document.getElementById("status").textContent = msg;
};

// ─── Palette chips (visual reference) ─────────────────────────────
const paletteRow = document.getElementById("palette-row");
for (const [name, hex] of Object.entries(PALETTE)) {
  const chip = document.createElement("div");
  chip.className = "palette-chip";
  chip.style.background = `#${hex.toString(16).padStart(6, "0")}`;
  chip.title = `${name} — #${hex.toString(16).padStart(6, "0")}`;
  paletteRow.appendChild(chip);
}

// ─── 1. Model Viewer ──────────────────────────────────────────────
const modelViewport = document.getElementById("model-viewport");
const modelRenderer = new THREE.WebGLRenderer({ antialias: true });
modelRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
modelViewport.appendChild(modelRenderer.domElement);

const modelScene = new THREE.Scene();
modelScene.background = new THREE.Color(PALETTE.skyPastel);
const modelCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
modelCamera.position.set(5, 5, 5);

const modelControls = new OrbitControls(modelCamera, modelRenderer.domElement);
modelControls.target.set(0, 1, 0);
modelControls.update();

// Lights — mirror the main game (warm sun + cool fill)
const modelSun = new THREE.DirectionalLight(0xFFF4DC, 1.0);
modelSun.position.set(5, 10, 5);
modelScene.add(modelSun);
modelScene.add(new THREE.AmbientLight(PALETTE.skyPastel, 0.4));

// Floor for scale reference
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: PALETTE.meadowGreen, flatShading: true })
);
floor.rotation.x = -Math.PI / 2;
modelScene.add(floor);

// Default stand-in mesh
let currentModel = makeStandInModel();
modelScene.add(currentModel);

function makeStandInModel() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: PALETTE.warmCoral, flatShading: true })
  );
  body.position.y = 1;
  group.add(body);
  return group;
}

function applyToonShader(object) {
  // Simple 2-band cel via MeshToonMaterial + a 2-band gradient map.
  const gradientTexture = build2BandGradient();
  object.traverse((n) => {
    if (n.isMesh) {
      const baseColor = n.material?.color ?? new THREE.Color(PALETTE.meadowGreen);
      n.material = new THREE.MeshToonMaterial({
        color: baseColor.clone(),
        gradientMap: gradientTexture,
      });
      n.material.needsUpdate = true;
    }
  });
}

function build2BandGradient() {
  const data = new Uint8Array([80, 80, 80, 255, 255, 255]); // 2 pixels: shadow, lit
  const tex = new THREE.DataTexture(data, 2, 1, THREE.RGBFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

applyToonShader(currentModel);

// Drag-drop handler
const dropHint = document.getElementById("drop-hint");
modelViewport.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropHint.style.color = PALETTE.warmCoral.toString(16);
});
modelViewport.addEventListener("drop", async (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (!file) return;
  status(`loading ${file.name}…`);
  const url = URL.createObjectURL(file);
  const loader = new GLTFLoader();
  try {
    const gltf = await loader.loadAsync(url);
    modelScene.remove(currentModel);
    currentModel = gltf.scene;
    modelScene.add(currentModel);
    applyToonShader(currentModel);
    dropHint.style.display = "none";
    status(`loaded ${file.name}`);
  } catch (err) {
    status(`error: ${err.message}`);
  }
});

// Season / time-of-day color grade (subtle LUT via fog + ambient color)
const seasonSelect = document.getElementById("season-select");
const todSelect = document.getElementById("tod-select");
const GRADE = {
  spring:  { bg: 0xD6EEF0, amb: 0xB8D8E8, sun: 0xFFF4DC },
  summer:  { bg: 0xE8E9B8, amb: 0xFFF2BE, sun: 0xFFE89A },
  autumn:  { bg: 0xE8C8A8, amb: 0xF2C14E, sun: 0xF28E74 },
  winter:  { bg: 0xCDDDE8, amb: 0xE8E6D8, sun: 0xBFD0E0 },
};
const TOD = {
  dawn: 0.65,
  noon: 1.0,
  dusk: 0.7,
  night: 0.25,
};
function updateGrade() {
  const g = GRADE[seasonSelect.value] ?? GRADE.summer;
  const mult = TOD[todSelect.value] ?? 1;
  modelScene.background = new THREE.Color(g.bg);
  modelSun.intensity = mult;
  modelScene.children.forEach((c) => {
    if (c.isAmbientLight) c.color.setHex(g.amb);
  });
}
seasonSelect.addEventListener("change", updateGrade);
todSelect.addEventListener("change", updateGrade);

const rotateToggle = document.getElementById("rotate-toggle");
document.getElementById("reset-camera-btn").addEventListener("click", () => {
  modelCamera.position.set(5, 5, 5);
  modelControls.target.set(0, 1, 0);
  modelControls.update();
});

function resizeModelViewport() {
  const w = modelViewport.clientWidth;
  const h = modelViewport.clientHeight;
  modelRenderer.setSize(w, h, false);
  modelCamera.aspect = w / h;
  modelCamera.updateProjectionMatrix();
}
window.addEventListener("resize", resizeModelViewport);
setTimeout(resizeModelViewport, 0);

// ─── 2. Shader Lab ────────────────────────────────────────────────
const shaderViewport = document.getElementById("shader-viewport");
const shaderRenderer = new THREE.WebGLRenderer({ antialias: true });
shaderRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
shaderViewport.appendChild(shaderRenderer.domElement);

const shaderScene = new THREE.Scene();
shaderScene.background = new THREE.Color(PALETTE.mistCyan);
const shaderCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
shaderCamera.position.set(0, 0, 4);
new OrbitControls(shaderCamera, shaderRenderer.domElement);

const DEFAULT_FRAG = `
// Fairy Permaculture — default fragment
// uv, uTime, uColor available
varying vec2 vUv;
uniform float uTime;
uniform vec3  uColor;

void main() {
  float wave = 0.5 + 0.5 * sin(vUv.y * 12.0 + uTime * 1.5);
  vec3 col = mix(uColor * 0.6, uColor, wave);
  gl_FragColor = vec4(col, 1.0);
}
`.trim();

const DEFAULT_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`.trim();

const shaderEditor = document.getElementById("shader-source");
shaderEditor.value = DEFAULT_FRAG;

let shaderMaterial = new THREE.ShaderMaterial({
  vertexShader: DEFAULT_VERT,
  fragmentShader: DEFAULT_FRAG,
  uniforms: {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(PALETTE.warmCoral) },
  },
});

const shaderMesh = new THREE.Mesh(new THREE.SphereGeometry(1.2, 64, 64), shaderMaterial);
shaderScene.add(shaderMesh);

document.getElementById("recompile-btn").addEventListener("click", () => {
  try {
    const newMat = new THREE.ShaderMaterial({
      vertexShader: DEFAULT_VERT,
      fragmentShader: shaderEditor.value,
      uniforms: shaderMaterial.uniforms,
    });
    shaderMesh.material = newMat;
    shaderMaterial = newMat;
    status("shader recompiled");
  } catch (err) {
    status(`shader error: ${err.message}`);
  }
});

document.getElementById("save-shader-btn").addEventListener("click", () => {
  const blob = new Blob([shaderEditor.value], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "shader.frag";
  a.click();
  URL.revokeObjectURL(url);
  status("shader download triggered (browser save dialog)");
});

function resizeShaderViewport() {
  const w = shaderViewport.clientWidth;
  const h = shaderViewport.clientHeight;
  shaderRenderer.setSize(w, h, false);
  shaderCamera.aspect = w / h;
  shaderCamera.updateProjectionMatrix();
}
window.addEventListener("resize", resizeShaderViewport);
setTimeout(resizeShaderViewport, 0);

// ─── 4. Balance Tuning ────────────────────────────────────────────
const balanceEditor = document.getElementById("balance-editor");
document.getElementById("load-balance-btn").addEventListener("click", async () => {
  try {
    const res = await fetch("/src/games/fairy-permaculture/data/balance.json");
    const text = await res.text();
    balanceEditor.textContent = text;
    status("balance.json loaded");
  } catch (err) {
    status(`load failed: ${err.message}`);
  }
});
document.getElementById("save-proposal-btn").addEventListener("click", () => {
  const text = balanceEditor.textContent;
  try {
    JSON.parse(text);
  } catch {
    status("invalid JSON — fix before saving");
    return;
  }
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `balance-proposal-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  status("balance proposal downloaded");
});
document.getElementById("run-sim-btn").addEventListener("click", () => {
  document.getElementById("sim-output").textContent =
    "[simulator not yet implemented — see task 'Build progression simulator']";
  status("simulator pending");
});

// ─── Animate ──────────────────────────────────────────────────────
const clock = new THREE.Clock();
function loop() {
  const dt = clock.getDelta();
  shaderMaterial.uniforms.uTime.value = clock.getElapsedTime();
  if (rotateToggle.checked && currentModel) currentModel.rotation.y += dt * 0.5;

  const active = document.querySelector(".panel.active")?.id;
  if (active === "panel-model-viewer") modelRenderer.render(modelScene, modelCamera);
  if (active === "panel-shader-lab") shaderRenderer.render(shaderScene, shaderCamera);

  requestAnimationFrame(loop);
}
loop();

console.log("[fp-lab] dev lab loaded");
