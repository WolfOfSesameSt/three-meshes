/**
 * 001 — Toroidal Energy Flow
 *
 * True toroidal vortex: particles orbit in the meridional plane around
 * the vortex ring core. Small orbits hug the torus surface; large orbits
 * extend far above/below, creating a visible column through the center
 * hole and wide arcs over the outside. The torus shape emerges from the
 * density of the flow, not from a surface mesh.
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

import particleVert from "../shaders/torus-particle.vert?raw";
import particleFrag from "../shaders/torus-particle.frag?raw";

// ─── Config ─────────────────────────────────────────────────────────
const PARTICLE_COUNT = 8000;
const STREAMLINE_COUNT = 16;   // visible flow guide curves
const STREAMLINE_SEGS = 200;
const R = 2.5;                 // vortex ring major radius
const POLOIDAL_SPEED = 1.4;   // circulation speed
const TOROIDAL_DRIFT = 0.04;  // slow azimuthal drift

// Orbit radii distribution — controls the shape of the field
const ORBIT_MIN = 0.3;   // tightest loops (near torus surface)
const ORBIT_MAX = 4.5;   // tallest arcs (extend far above/below)

// ─── Palette ────────────────────────────────────────────────────────
const COLORS = {
  bg: 0x050510,
  core: new THREE.Color(0.5, 0.8, 1.0),
  mid: new THREE.Color(0.12, 0.3, 0.85),
  edge: new THREE.Color(0.3, 0.08, 0.55),
  streamline: new THREE.Color(0.08, 0.18, 0.5),
  centerGlow: new THREE.Color(0.12, 0.25, 0.6),
};

// ─── Scene ──────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.bg);
scene.fog = new THREE.FogExp2(COLORS.bg, 0.025);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(4, 5, 7);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.7;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.4;
controls.maxDistance = 18;
controls.minDistance = 3;

// ─── Post-processing ────────────────────────────────────────────────
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.5, 0.3, 0.4
);
composer.addPass(bloomPass);

// ─── Meridional orbit → 3D position ────────────────────────────────
// Each particle orbits in the rho-z plane around the vortex core at (R, 0).
// theta = toroidal angle (azimuth around Y axis)
// phi = poloidal angle (position along the meridional orbit)
// orbitR = radius of that orbit (small = hugs torus, large = tall arc)
//
// In the meridional plane:
//   rho = R + orbitR * cos(phi)
//   y   = orbitR * sin(phi)
//
// Then projected to 3D:
//   x = rho * cos(theta)
//   z = rho * sin(theta)

function flowPosition(theta, phi, orbitR) {
  const rho = R + orbitR * Math.cos(phi);
  const y = orbitR * Math.sin(phi);
  const x = rho * Math.cos(theta);
  const z = rho * Math.sin(theta);
  return [x, y, z];
}

// ─── Particle system ────────────────────────────────────────────────
const particleGeometry = new THREE.BufferGeometry();
const positions = new Float32Array(PARTICLE_COUNT * 3);
const intensities = new Float32Array(PARTICLE_COUNT);
const sizes = new Float32Array(PARTICLE_COUNT);

const pTheta = new Float32Array(PARTICLE_COUNT);   // azimuthal position
const pPhi = new Float32Array(PARTICLE_COUNT);     // meridional phase (animated)
const pOrbitR = new Float32Array(PARTICLE_COUNT);   // orbit radius
const pSpeed = new Float32Array(PARTICLE_COUNT);    // speed multiplier

for (let i = 0; i < PARTICLE_COUNT; i++) {
  pTheta[i] = Math.random() * Math.PI * 2;
  pPhi[i] = Math.random() * Math.PI * 2;

  // Orbit radius distribution: mix of tight (torus surface) and wide (field arcs)
  // Use a distribution that favors medium-large orbits for visible field shape
  const t = Math.random();
  if (t < 0.3) {
    // 30% tight orbits — define the torus core
    pOrbitR[i] = ORBIT_MIN + Math.random() * 0.8;
  } else if (t < 0.7) {
    // 40% medium orbits — the main visible flow
    pOrbitR[i] = 1.0 + Math.random() * 2.0;
  } else {
    // 30% wide orbits — the outer field extending far
    pOrbitR[i] = 2.5 + Math.random() * (ORBIT_MAX - 2.5);
  }

  // Larger orbits move slower (angular velocity ~ 1/r for vortex)
  pSpeed[i] = (0.8 + Math.random() * 0.4) / (0.5 + pOrbitR[i] * 0.3);

  // Larger orbits get slightly bigger particles
  sizes[i] = 0.4 + (pOrbitR[i] / ORBIT_MAX) * 1.2 + Math.random() * 0.5;

  intensities[i] = 0.1 + Math.random() * 0.4;
}

particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
particleGeometry.setAttribute("aIntensity", new THREE.BufferAttribute(intensities, 1));
particleGeometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

const particleMaterial = new THREE.ShaderMaterial({
  vertexShader: particleVert,
  fragmentShader: particleFrag,
  uniforms: {
    uColorCore: { value: COLORS.core },
    uColorMid: { value: COLORS.mid },
    uColorEdge: { value: COLORS.edge },
  },
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

const particles = new THREE.Points(particleGeometry, particleMaterial);
scene.add(particles);

// ─── Streamlines (visible flow guides at various orbit radii) ───────
const streamlineGroup = new THREE.Group();
scene.add(streamlineGroup);

// Show streamlines at a few fixed toroidal angles, with varying orbit radii
const streamlineRadii = [0.6, 1.2, 2.0, 3.0, 4.0];
const thetaSlices = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];

for (const theta of thetaSlices) {
  for (const oR of streamlineRadii) {
    const points = [];
    for (let j = 0; j <= STREAMLINE_SEGS; j++) {
      const phi = (j / STREAMLINE_SEGS) * Math.PI * 2;
      const [x, y, z] = flowPosition(theta, phi, oR);
      points.push(new THREE.Vector3(x, y, z));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: COLORS.streamline,
      transparent: true,
      opacity: 0.025 + 0.015 * (oR / ORBIT_MAX), // wider orbits slightly more visible
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    streamlineGroup.add(new THREE.Line(geo, mat));
  }
}

// ─── Central axis glow (vertical column through the hole) ───────────
function createGlowTexture(size = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  gradient.addColorStop(0, "rgba(80, 130, 255, 0.25)");
  gradient.addColorStop(0.3, "rgba(40, 80, 200, 0.1)");
  gradient.addColorStop(0.6, "rgba(20, 40, 120, 0.03)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

const glowMat = new THREE.SpriteMaterial({
  map: createGlowTexture(),
  color: COLORS.centerGlow,
  blending: THREE.AdditiveBlending,
  transparent: true,
  depthWrite: false,
});

// Stack a few glow sprites along the vertical axis to suggest the column
const glowSprites = [];
for (const yPos of [-2, -0.5, 0, 0.5, 2]) {
  const sprite = new THREE.Sprite(glowMat.clone());
  sprite.position.set(0, yPos, 0);
  sprite.scale.set(1.5, 1.5, 1);
  scene.add(sprite);
  glowSprites.push(sprite);
}

// ─── Subtle ambient ─────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0x112244, 0.2));

// ─── Resize ─────────────────────────────────────────────────────────
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Animation loop ─────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const elapsed = clock.elapsedTime;

  const posArray = particleGeometry.attributes.position.array;
  const intArray = particleGeometry.attributes.aIntensity.array;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    // Primary: advance poloidal angle (meridional circulation)
    // phi increases → up through center, over top, down outside, under bottom
    pPhi[i] += POLOIDAL_SPEED * pSpeed[i] * delta;
    if (pPhi[i] > Math.PI * 2) pPhi[i] -= Math.PI * 2;

    // Secondary: slow azimuthal drift
    pTheta[i] += TOROIDAL_DRIFT * delta;
    if (pTheta[i] > Math.PI * 2) pTheta[i] -= Math.PI * 2;

    const [x, y, z] = flowPosition(pTheta[i], pPhi[i], pOrbitR[i]);
    posArray[i * 3] = x;
    posArray[i * 3 + 1] = y;
    posArray[i * 3 + 2] = z;

    // Intensity: bright when passing through the center column (rho near 0)
    // and when at the top/bottom of the arc
    const rho = R + pOrbitR[i] * Math.cos(pPhi[i]);
    const centerProximity = 1.0 - Math.min(rho / R, 1.0); // 1 at axis, 0 at ring
    const verticalness = Math.abs(Math.sin(pPhi[i]));       // 1 at top/bottom
    intArray[i] = 0.1 + 0.4 * centerProximity + 0.3 * verticalness;
  }

  particleGeometry.attributes.position.needsUpdate = true;
  particleGeometry.attributes.aIntensity.needsUpdate = true;

  // Pulse the axis glow
  const pulse = 1.0 + 0.06 * Math.sin(elapsed * 1.2);
  for (const sprite of glowSprites) {
    sprite.scale.set(1.5 * pulse, 1.5 * pulse, 1);
    sprite.material.opacity = 0.2 + 0.05 * Math.sin(elapsed * 1.8 + sprite.position.y);
  }

  // Gentle bloom breathing
  bloomPass.strength = 0.4 + 0.1 * Math.sin(elapsed * 0.7);

  controls.update();
  composer.render();
}

animate();
