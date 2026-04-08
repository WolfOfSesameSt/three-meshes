import * as THREE from 'three';
import { Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import helvetikerBoldJson from 'three/examples/fonts/helvetiker_bold.typeface.json';

/**
 * Mulberry32 — deterministic PRNG for starfield placement.
 */
function mulberry32(seed) {
  return function rand() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Easing helpers --------------------------------------------------------------
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const easeInCubic = (x) => x * x * x;
const easeOutBack = (x) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

// Timing constants ------------------------------------------------------------
// All frame counts below assume the composition runs at 30 fps (see Root.jsx).
const FPS = 30;
const SECS_PER_VOWEL = 4.0;
const FRAMES_PER_VOWEL = SECS_PER_VOWEL * FPS; // 120

// Per-vowel phase boundaries (in frames, relative to the start of its slot)
const FLING_END = 30; // 0 → 30  : fling forward from far to near
const PULSE_END = 90; // 30 → 90 : hover & pulse 3 times
const ZIP_END = 114; // 90 → 114: zip back into distance
// 114 → 120: empty beat before the next vowel

// Z positions
const FAR_Z = -32; // deep in the fog, barely visible
const NEAR_Z = 2.5; // ~3.3 units in front of camera (camera at Z≈5.8)

// Vowels & colors
const VOWELS = ['A', 'E', 'I', 'O', 'U'];
const COLORS = [
  0xff3355, // A - red
  0x33ff88, // E - green
  0x44aaff, // I - cyan-blue
  0xffcc33, // O - gold
  0xcc44ff, // U - purple
];

/**
 * Vowels scene: each vowel is flung forward to close range, pulses 3 times,
 * then zips back into the distance, revealing letters one at a time.
 *
 * The font is imported synchronously from three/examples/fonts (JSON import
 * resolved by webpack) so there's no async loading in the scene setup — the
 * AnaglyphRenderer can build this scene the same way as any other.
 *
 * Timing per vowel slot (120 frames @ 30fps = 4s):
 *   frames 0-30   fling: FAR_Z → NEAR_Z with easeOutCubic + 1x tumble
 *   frames 30-90  pulse: 3 gaussian "heartbeats" (scale + emissive flare)
 *   frames 90-114 zip:   NEAR_Z → FAR_Z with easeInCubic + 1x tumble
 *   frames 114-120 rest: hidden
 *
 * Total: 5 vowels × 120 frames = 600 frames = 20 seconds.
 */
export function buildVowelsScene(scene, camera) {
  scene.background = new THREE.Color(0x02020f);
  scene.fog = new THREE.FogExp2(0x02020f, 0.055);

  // Lighting --------------------------------------------------------------
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
  keyLight.position.set(5, 8, 8);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x88aaff, 0.6);
  rimLight.position.set(-5, 3, -5);
  scene.add(rimLight);

  const fillLight = new THREE.PointLight(0xffffff, 0.5, 30);
  fillLight.position.set(0, 0, 6);
  scene.add(fillLight);

  // Build the font once, reuse for all letters ---------------------------
  const font = new Font(helvetikerBoldJson);

  // Build a TextGeometry per vowel, centered at origin -------------------
  const letters = VOWELS.map((char, i) => {
    const geo = new TextGeometry(char, {
      font,
      size: 1.5,
      depth: 0.45,
      curveSegments: 8,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.04,
      bevelSegments: 4,
    });
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const centerX = -(bb.max.x + bb.min.x) / 2;
    const centerY = -(bb.max.y + bb.min.y) / 2;
    const centerZ = -(bb.max.z + bb.min.z) / 2;
    geo.translate(centerX, centerY, centerZ);

    const color = COLORS[i];
    const mat = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.45,
      roughness: 0.3,
      emissive: color,
      emissiveIntensity: 0.35,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false; // hidden until its slot
    scene.add(mesh);

    return { char, mesh, material: mat, baseEmissive: 0.35, color };
  });

  // Deterministic starfield -----------------------------------------------
  const rand = mulberry32(99);
  const starCount = 900;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 20 + rand() * 25;
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    starPositions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    starPositions[i * 3 + 2] = r * Math.cos(phi);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(starPositions, 3),
  );
  const starMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.08,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
  });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // Ground grid for depth reference ---------------------------------------
  const grid = new THREE.GridHelper(60, 60, 0x224466, 0x112233);
  grid.position.y = -5;
  scene.add(grid);

  return {
    update(t, frame) {
      // Prefer integer frame count for deterministic timing; fall back to
      // rounding `t` if the renderer passes only seconds.
      const globalFrame =
        typeof frame === 'number' ? frame : Math.round(t * FPS);

      const letterIndex = Math.floor(globalFrame / FRAMES_PER_VOWEL);
      const localFrame = globalFrame - letterIndex * FRAMES_PER_VOWEL;

      // Hide all letters — we'll re-show only the active one below.
      for (const l of letters) l.mesh.visible = false;

      if (letterIndex >= 0 && letterIndex < letters.length) {
        const letter = letters[letterIndex];
        let z = FAR_Z;
        let scale = 1;
        let emissive = letter.baseEmissive;
        let rotY = 0;
        let rotZ = 0;
        let visible = true;

        if (localFrame < FLING_END) {
          // ---- Phase 1: fling forward ----
          const p = localFrame / FLING_END;
          const e = easeOutBack(p); // springy arrival with slight overshoot
          z = FAR_Z + (NEAR_Z - FAR_Z) * e;
          // Start small, end at full size
          scale = 0.4 + Math.min(1, e) * 0.6;
          // Tumble once during approach
          rotY = (1 - p) * Math.PI * 2;
        } else if (localFrame < PULSE_END) {
          // ---- Phase 2: hover & pulse 3 times ----
          z = NEAR_Z;
          const pulseT =
            (localFrame - FLING_END) / (PULSE_END - FLING_END); // 0..1
          // Three gaussian "heartbeats" at pulseT = 0.18, 0.50, 0.82
          const g1 = Math.exp(-Math.pow((pulseT - 0.18) * 9, 2));
          const g2 = Math.exp(-Math.pow((pulseT - 0.5) * 9, 2));
          const g3 = Math.exp(-Math.pow((pulseT - 0.82) * 9, 2));
          const pulse = g1 + g2 + g3;
          scale = 1.0 + pulse * 0.18;
          emissive = letter.baseEmissive + pulse * 1.5;
          // Subtle wobble between beats
          rotZ = Math.sin(pulseT * Math.PI * 6) * 0.04;
        } else if (localFrame < ZIP_END) {
          // ---- Phase 3: zip into the distance ----
          const p = (localFrame - PULSE_END) / (ZIP_END - PULSE_END);
          const e = easeInCubic(p);
          z = NEAR_Z + (FAR_Z - NEAR_Z) * e;
          scale = 1.0 - e * 0.7;
          rotY = e * Math.PI * 2;
        } else {
          // ---- Phase 4: rest beat ----
          visible = false;
        }

        if (visible) {
          letter.mesh.visible = true;
          letter.mesh.position.set(0, 0, z);
          letter.mesh.scale.setScalar(scale);
          letter.mesh.rotation.set(0, rotY, rotZ);
          letter.material.emissiveIntensity = emissive;
        }
      }

      // Pulse the fill light subtly
      fillLight.intensity = 0.4 + Math.sin(t * 2.5) * 0.15;

      // Camera — mostly still, tiny sway for life
      camera.position.set(
        Math.sin(t * 0.15) * 0.25,
        0.2 + Math.cos(t * 0.2) * 0.15,
        5.8,
      );
      camera.lookAt(0, 0, 0);

      stars.rotation.y = t * 0.01;
    },
    dispose() {
      // Materials + geometries are walked by the caller's scene traversal.
    },
  };
}
