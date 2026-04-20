/**
 * Fairy Permaculture — procgen plant meshes (C3.1).
 *
 * Low-poly meshes per species category. Deterministic given
 * `{ speciesId, x, y, seed }` — the same inputs always yield the same
 * geometry, so saved plants can replay visually identically.
 *
 * Category → generator:
 *   groundcover  — cluster of small cones (clover, strawberry)
 *   herbaceous   — medium cones + leafy blob (comfrey, nettle, yarrow)
 *   pioneer      — herbaceous lookalike, tighter
 *   shrub        — sphere cluster on short trunk (salmonberry, saskatoon)
 *   cane-fruit   — tall thin cones (raspberry, blackberry)
 *   small-tree   — trunk + spherical canopy (apple)
 *
 * Stage affects overall scale: seedling ≈ 15 %, juvenile ≈ 50 %,
 * mature = 100 %, senescent ≈ 90 % but desaturated.
 *
 * Ripe fruit are drawn as a second material — saturated berry-purple
 * or warm-coral spheres — only shown when `isRipe` returns true.
 */

import * as THREE from "three";
import { toonMaterial } from "../shaders/toon-2band.js";
import { PALETTE } from "../config.js";
import { createRng } from "../biome/seeded-rng.js";

const TMP_COLOR = new THREE.Color();

// Stage → scale multiplier applied to the whole plant group.
// Inflated above botanical realism so mature plants read from the
// overseer's isometric camera (tile = 3 m, ortho half-height ~30 m).
const STAGE_SCALE = {
  seed: 0.15,
  seedling: 0.6,
  juvenile: 1.6,
  mature: 2.6,
  senescent: 2.3,
  dead: 0.0,
};

// Per-category tuning (heights in world units; tile is 3 m).
const CATEGORY_TUNING = {
  groundcover: {
    foliage: PALETTE.meadowGreen,
    height: 0.35,
    radius: 0.55,
    count: 5,
  },
  herbaceous: {
    foliage: PALETTE.oliveDark,
    height: 1.1,
    radius: 0.6,
    count: 4,
  },
  pioneer: {
    foliage: PALETTE.sage,
    height: 0.65,
    radius: 0.45,
    count: 3,
  },
  shrub: {
    foliage: PALETTE.oliveDark,
    height: 1.6,
    radius: 0.9,
    count: 7,
  },
  "cane-fruit": {
    foliage: PALETTE.oliveDark,
    height: 2.0,
    radius: 0.5,
    count: 6,
  },
  "small-tree": {
    foliage: PALETTE.meadowGreen,
    height: 4.5,
    radius: 1.6,
    count: 1,
  },
};

const DEFAULT_TUNING = CATEGORY_TUNING.herbaceous;

/** Senescent plants get desaturated. */
function tintForStage(baseHex, stage) {
  if (stage !== "senescent" && stage !== "dead") return baseHex;
  TMP_COLOR.setHex(baseHex);
  const grey = 0.5 * (TMP_COLOR.r + TMP_COLOR.g + TMP_COLOR.b);
  TMP_COLOR.setRGB(
    TMP_COLOR.r * 0.5 + grey * 0.5,
    TMP_COLOR.g * 0.5 + grey * 0.5,
    TMP_COLOR.b * 0.5 + grey * 0.5
  );
  return TMP_COLOR.getHex();
}

/**
 * Ripe-fruit color heuristic: use species id to pick between coral
 * (rose/apple/salmon) and berry-purple (berries). Could be datafied
 * later but this keeps the catalogue concise.
 */
function ripeColorForSpecies(speciesId) {
  if (/berry|saskatoon|plum/.test(speciesId)) return PALETTE.berryPurple;
  if (/strawberry|salmon|apple|cherry/.test(speciesId)) return PALETTE.warmCoral;
  return PALETTE.honeyGold;
}

function hashKey(speciesId, x, y, seed = 0) {
  let h = seed | 0;
  for (let i = 0; i < speciesId.length; i++) {
    h = Math.imul(h ^ speciesId.charCodeAt(i), 2654435761);
  }
  h = Math.imul(h ^ (x * 73856093), 2654435761);
  h = Math.imul(h ^ (y * 19349663), 2654435761);
  return h >>> 0;
}

/**
 * Build a THREE.Group representing a plant at full-mature size. The
 * renderer scales this group down per `stage`.
 *
 * Deterministic given `{ speciesId, x, y, seed }`.
 *
 * @param {object} species
 * @param {number} tileX
 * @param {number} tileY
 * @param {object} [opts]
 * @param {string} [opts.stage="mature"]
 * @param {number} [opts.seed=0]
 * @param {boolean} [opts.ripe=false]
 * @returns {THREE.Group}
 */
export function buildPlantMesh(species, tileX, tileY, opts = {}) {
  const stage = opts.stage ?? "mature";
  const ripe = !!opts.ripe;
  const rng = createRng(hashKey(species.id, tileX, tileY, opts.seed ?? 0));
  const tuning = CATEGORY_TUNING[species.category] ?? DEFAULT_TUNING;

  const group = new THREE.Group();
  group.name = `plant-${species.id}-${tileX}-${tileY}`;

  const foliageColor = tintForStage(tuning.foliage, stage);
  const foliageMat = toonMaterial(foliageColor);

  switch (species.category) {
    case "small-tree":
      addSmallTree(group, tuning, rng, foliageMat);
      break;
    case "shrub":
      addShrub(group, tuning, rng, foliageMat);
      break;
    case "cane-fruit":
      addCaneFruit(group, tuning, rng, foliageMat);
      break;
    case "groundcover":
      addGroundcover(group, tuning, rng, foliageMat);
      break;
    case "pioneer":
      addPioneer(group, tuning, rng, foliageMat);
      break;
    case "herbaceous":
    default:
      addHerbaceous(group, tuning, rng, foliageMat);
      break;
  }

  if (ripe) {
    addRipeFruits(group, tuning, rng, species);
  }

  const s = STAGE_SCALE[stage] ?? 1;
  group.scale.setScalar(s);

  group.userData = { speciesId: species.id, stage, ripe };
  return group;
}

function addGroundcover(group, tuning, rng, mat) {
  for (let i = 0; i < tuning.count; i++) {
    const h = tuning.height * (0.7 + rng.next() * 0.6);
    const r = tuning.radius * 0.18 * (0.6 + rng.next() * 0.8);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5), mat);
    const theta = rng.range(0, Math.PI * 2);
    const rad = rng.range(0, tuning.radius);
    cone.position.set(Math.cos(theta) * rad, h / 2, Math.sin(theta) * rad);
    cone.rotation.y = rng.range(0, Math.PI * 2);
    cone.castShadow = true;
    group.add(cone);
  }
}

function addHerbaceous(group, tuning, rng, mat) {
  // Central stem cone + leafy blob.
  const stemH = tuning.height;
  const stem = new THREE.Mesh(
    new THREE.ConeGeometry(tuning.radius * 0.15, stemH, 6),
    mat
  );
  stem.position.y = stemH / 2;
  stem.castShadow = true;
  group.add(stem);

  for (let i = 0; i < tuning.count; i++) {
    const leafR = tuning.radius * (0.35 + rng.next() * 0.2);
    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(leafR, 6, 4),
      mat
    );
    const theta = rng.range(0, Math.PI * 2);
    const rad = rng.range(0, tuning.radius * 0.3);
    leaf.position.set(
      Math.cos(theta) * rad,
      stemH * rng.range(0.5, 1.0),
      Math.sin(theta) * rad
    );
    leaf.scale.y = 0.6;
    leaf.castShadow = true;
    group.add(leaf);
  }
}

function addPioneer(group, tuning, rng, mat) {
  // Dandelion-like: low rosette of small cones.
  for (let i = 0; i < tuning.count * 2; i++) {
    const h = tuning.height * (0.4 + rng.next() * 0.6);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(tuning.radius * 0.12, h, 4),
      mat
    );
    const theta = rng.range(0, Math.PI * 2);
    const rad = rng.range(0, tuning.radius * 0.5);
    cone.position.set(Math.cos(theta) * rad, h / 2, Math.sin(theta) * rad);
    cone.rotation.z = rng.range(-0.3, 0.3);
    cone.castShadow = true;
    group.add(cone);
  }
}

function addShrub(group, tuning, rng, mat) {
  // Short stubby trunk.
  const trunkH = tuning.height * 0.25;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(
      tuning.radius * 0.1,
      tuning.radius * 0.12,
      trunkH,
      5
    ),
    toonMaterial(PALETTE.earthBrown)
  );
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  group.add(trunk);

  // Cluster of spherical canopy blobs.
  for (let i = 0; i < tuning.count; i++) {
    const r = tuning.radius * (0.35 + rng.next() * 0.25);
    const blob = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 5), mat);
    const theta = rng.range(0, Math.PI * 2);
    const rad = rng.range(0, tuning.radius * 0.6);
    blob.position.set(
      Math.cos(theta) * rad,
      trunkH + tuning.height * rng.range(0.25, 0.8),
      Math.sin(theta) * rad
    );
    blob.castShadow = true;
    group.add(blob);
  }
}

function addCaneFruit(group, tuning, rng, mat) {
  // Several tall thin cones leaning outward.
  for (let i = 0; i < tuning.count; i++) {
    const h = tuning.height * (0.8 + rng.next() * 0.3);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(tuning.radius * 0.12, h, 5),
      mat
    );
    const theta = (i / tuning.count) * Math.PI * 2;
    const rad = tuning.radius * 0.35;
    cone.position.set(Math.cos(theta) * rad, h / 2, Math.sin(theta) * rad);
    cone.rotation.z = Math.cos(theta) * 0.18;
    cone.rotation.x = Math.sin(theta) * 0.18;
    cone.castShadow = true;
    group.add(cone);
  }
}

function addSmallTree(group, tuning, rng, mat) {
  const trunkH = tuning.height * 0.45;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(
      tuning.radius * 0.12,
      tuning.radius * 0.18,
      trunkH,
      6
    ),
    toonMaterial(PALETTE.earthBrown)
  );
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  group.add(trunk);

  const canopyR = tuning.radius;
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(canopyR, 8, 6),
    mat
  );
  canopy.position.y = trunkH + canopyR * 0.7;
  canopy.scale.y = 0.85;
  canopy.castShadow = true;
  group.add(canopy);

  // A couple of smaller canopy blobs for silhouette variety.
  for (let i = 0; i < 2; i++) {
    const r = canopyR * (0.45 + rng.next() * 0.2);
    const blob = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 5), mat);
    const theta = rng.range(0, Math.PI * 2);
    blob.position.set(
      Math.cos(theta) * canopyR * 0.5,
      trunkH + canopyR * rng.range(0.4, 1.0),
      Math.sin(theta) * canopyR * 0.5
    );
    group.add(blob);
  }
}

function addRipeFruits(group, tuning, rng, species) {
  const color = ripeColorForSpecies(species.id);
  const mat = toonMaterial(color);
  const nFruit = Math.max(3, Math.floor(tuning.count * 1.5));
  const fruitR = Math.max(0.08, tuning.radius * 0.1);
  const geo = new THREE.SphereGeometry(fruitR, 5, 4);
  for (let i = 0; i < nFruit; i++) {
    const theta = rng.range(0, Math.PI * 2);
    const rad = rng.range(tuning.radius * 0.3, tuning.radius);
    const y = rng.range(tuning.height * 0.3, tuning.height * 0.95);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(Math.cos(theta) * rad, y, Math.sin(theta) * rad);
    m.castShadow = true;
    group.add(m);
  }
}

/**
 * Release geometry + materials owned by a plant group. Call this
 * when a plant is unmounted so we don't leak GPU buffers.
 */
export function disposePlantMesh(group) {
  group.traverse((n) => {
    if (n.isMesh) {
      n.geometry?.dispose();
      if (Array.isArray(n.material)) {
        n.material.forEach((m) => m?.dispose());
      } else {
        n.material?.dispose();
      }
    }
  });
}

export { STAGE_SCALE, CATEGORY_TUNING };
