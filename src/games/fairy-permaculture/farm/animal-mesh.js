/**
 * Fairy Permaculture — primitive procgen animal meshes (C4.2 + C4.3).
 *
 * Per the GDD "procgen or library" strategy: ship primitive stand-ins
 * first, swap in Sketchfab assets via Model Viewer later. All meshes
 * use the locked 2-band toon shader.
 *
 *   chicken     — sphere body + tiny cone comb + beak
 *   duck        — ellipsoid body + flat beak
 *   goat        — box body + 4 leg cylinders + 2 horn cones
 *   hive        — box hive body (warré) or vertical bundle (mason tubes)
 *   bee swarm   — InstancedMesh of tiny ellipsoids around a hive
 *   mason-bee   — single tiny ellipsoid (standalone visual)
 */

import * as THREE from 'three';
import { toonMaterial } from '../shaders/toon-2band.js';
import { PALETTE } from '../config.js';

// ─── Chicken ─────────────────────────────────────────────────────

export function createChickenMesh(opts = {}) {
  const g = new THREE.Group();
  g.name = opts.name ?? 'chicken';

  // Body
  const bodyGeo = new THREE.SphereGeometry(0.25, 10, 8);
  bodyGeo.scale(1.0, 0.9, 1.3); // slightly elongated
  const body = new THREE.Mesh(bodyGeo, toonMaterial(0xF2EAD0));
  body.position.y = 0.25;
  body.castShadow = true;
  g.add(body);

  // Head
  const headGeo = new THREE.SphereGeometry(0.14, 8, 6);
  const head = new THREE.Mesh(headGeo, toonMaterial(0xF2EAD0));
  head.position.set(0, 0.42, 0.25);
  head.castShadow = true;
  g.add(head);

  // Comb — small red cone
  const combGeo = new THREE.ConeGeometry(0.05, 0.08, 6);
  const comb = new THREE.Mesh(combGeo, toonMaterial(PALETTE.warmCoral));
  comb.position.set(0, 0.55, 0.22);
  g.add(comb);

  // Beak
  const beakGeo = new THREE.ConeGeometry(0.03, 0.08, 5);
  const beak = new THREE.Mesh(beakGeo, toonMaterial(PALETTE.honeyGold));
  beak.position.set(0, 0.42, 0.38);
  beak.rotation.x = Math.PI / 2;
  g.add(beak);

  // Legs
  const legMat = toonMaterial(PALETTE.honeyGold);
  for (const sign of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 5), legMat);
    leg.position.set(sign * 0.08, 0.09, 0);
    g.add(leg);
  }

  return g;
}

// ─── Duck ────────────────────────────────────────────────────────

export function createDuckMesh(opts = {}) {
  const g = new THREE.Group();
  g.name = opts.name ?? 'duck';

  const bodyGeo = new THREE.SphereGeometry(0.28, 10, 8);
  bodyGeo.scale(1.0, 0.75, 1.4);
  const body = new THREE.Mesh(bodyGeo, toonMaterial(PALETTE.moonlightSilver));
  body.position.y = 0.22;
  body.castShadow = true;
  g.add(body);

  const headGeo = new THREE.SphereGeometry(0.15, 8, 6);
  const head = new THREE.Mesh(headGeo, toonMaterial(PALETTE.oliveDark));
  head.position.set(0, 0.4, 0.32);
  head.castShadow = true;
  g.add(head);

  // Flat beak
  const beakGeo = new THREE.BoxGeometry(0.08, 0.03, 0.12);
  const beak = new THREE.Mesh(beakGeo, toonMaterial(PALETTE.honeyGold));
  beak.position.set(0, 0.38, 0.44);
  g.add(beak);

  return g;
}

// ─── Goat ────────────────────────────────────────────────────────

export function createGoatMesh(opts = {}) {
  const g = new THREE.Group();
  g.name = opts.name ?? 'goat';

  // Body — box
  const bodyGeo = new THREE.BoxGeometry(0.45, 0.38, 0.8);
  const body = new THREE.Mesh(bodyGeo, toonMaterial(PALETTE.earthBrown));
  body.position.y = 0.52;
  body.castShadow = true;
  g.add(body);

  // Head
  const headGeo = new THREE.BoxGeometry(0.22, 0.22, 0.28);
  const head = new THREE.Mesh(headGeo, toonMaterial(PALETTE.earthBrown));
  head.position.set(0, 0.62, 0.55);
  head.castShadow = true;
  g.add(head);

  // Horns
  const hornMat = toonMaterial(PALETTE.moonlightSilver);
  for (const sign of [-1, 1]) {
    const horn = new THREE.Mesh(
      new THREE.ConeGeometry(0.03, 0.15, 5),
      hornMat
    );
    horn.position.set(sign * 0.07, 0.78, 0.5);
    horn.rotation.z = sign * 0.3;
    g.add(horn);
  }

  // Legs
  const legMat = toonMaterial(0x3E2B1C);
  const legGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.38, 5);
  const legOffsets = [
    [-0.15, -0.3],
    [0.15, -0.3],
    [-0.15, 0.3],
    [0.15, 0.3],
  ];
  for (const [lx, lz] of legOffsets) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(lx, 0.19, lz);
    g.add(leg);
  }

  return g;
}

// ─── Hive (Warré box) ────────────────────────────────────────────

export function createWarreHiveMesh(opts = {}) {
  const g = new THREE.Group();
  g.name = opts.name ?? 'warre-hive';

  const wood = toonMaterial(PALETTE.earthBrown);
  // Three stacked boxes.
  for (let i = 0; i < 3; i++) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.6), wood);
    box.position.y = 0.15 + i * 0.31;
    box.castShadow = true;
    box.receiveShadow = true;
    g.add(box);
  }
  // Peaked roof
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(0.48, 0.25, 4),
    toonMaterial(PALETTE.oliveDark)
  );
  roof.position.y = 1.2;
  roof.rotation.y = Math.PI / 4;
  g.add(roof);

  return g;
}

// ─── Mason-bee tube station ──────────────────────────────────────

export function createMasonTubesMesh(opts = {}) {
  const g = new THREE.Group();
  g.name = opts.name ?? 'mason-tubes';

  // Wooden frame
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.4, 0.2),
    toonMaterial(PALETTE.earthBrown)
  );
  frame.position.y = 0.3;
  frame.castShadow = true;
  g.add(frame);

  // Tube bundle — a grid of little cylinders (the "holes")
  const tubeMat = toonMaterial(PALETTE.honeyGold);
  for (let ix = -1; ix <= 1; ix++) {
    for (let iy = -1; iy <= 1; iy++) {
      const tube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.18, 6),
        tubeMat
      );
      tube.position.set(ix * 0.1, 0.3 + iy * 0.1, 0.1);
      tube.rotation.x = Math.PI / 2;
      g.add(tube);
    }
  }

  return g;
}

// ─── Bee swarm around a hive ─────────────────────────────────────

/**
 * Returns an InstancedMesh you can parent to a hive. Each bee is a
 * tiny gold ellipsoid; the manager's animate() updates their orbit.
 *
 * @param {number} count
 */
export function createBeeSwarm(count = 12) {
  const geo = new THREE.SphereGeometry(0.04, 6, 5);
  geo.scale(1.0, 0.7, 1.4);
  const mat = toonMaterial(PALETTE.honeyGold);
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.name = 'bee-swarm';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    m.makeTranslation(
      Math.cos(angle) * 0.8,
      0.9 + Math.sin(i * 1.3) * 0.1,
      Math.sin(angle) * 0.8
    );
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.userData = { count, _t0: Math.random() * 10 };
  return mesh;
}

/** Per-frame orbit animation for a swarm. */
export function animateBeeSwarm(swarm, t) {
  const count = swarm.userData.count;
  const t0 = swarm.userData._t0;
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (t + t0) * 1.8;
    const r = 0.7 + Math.sin((t + t0 + i) * 2) * 0.15;
    m.makeTranslation(
      Math.cos(angle) * r,
      0.9 + Math.sin((t + t0 + i) * 3) * 0.15,
      Math.sin(angle) * r
    );
    swarm.setMatrixAt(i, m);
  }
  swarm.instanceMatrix.needsUpdate = true;
}

// ─── Mason bee standalone ────────────────────────────────────────

export function createMasonBeeMesh(opts = {}) {
  const geo = new THREE.SphereGeometry(0.05, 6, 5);
  geo.scale(1.0, 0.7, 1.4);
  const mesh = new THREE.Mesh(geo, toonMaterial(PALETTE.oliveDark));
  mesh.name = opts.name ?? 'mason-bee';
  return mesh;
}

// ─── Species → mesh factory registry ─────────────────────────────

export const ANIMAL_MESH_FACTORIES = {
  'chicken-layer': createChickenMesh,
  'duck': createDuckMesh,
  'dairy-goat': createGoatMesh,
  'dexter-cow': createGoatMesh, // reuse shape as placeholder (scaled up below)
  'mason-bee': createMasonBeeMesh,
};

/**
 * Get a mesh for a species; falls back to a neutral sphere if
 * unrecognized. Scales a goat up for dexter-cow until we have a real
 * cow primitive.
 */
export function createAnimalMesh(speciesId) {
  const factory = ANIMAL_MESH_FACTORIES[speciesId];
  let mesh;
  if (factory) {
    mesh = factory();
  } else {
    mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 8, 6),
      toonMaterial(0xCCCCCC)
    );
    mesh.name = speciesId;
  }
  if (speciesId === 'dexter-cow') mesh.scale.setScalar(1.8);
  return mesh;
}
