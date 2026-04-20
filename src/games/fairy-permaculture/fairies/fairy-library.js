/**
 * Fairy Permaculture — library-loaded fairy model.
 *
 * Loads the canonical Sketchfab fairy GLB once, normalizes it for
 * the toon pipeline, then hands out clones to the fleet.
 *
 * Source model: "Daisy Fairy" by MonokumaTheAlcholic (CC-BY-4.0)
 *   https://sketchfab.com/3d-models/daisy-fairy-11b6ab483a2a449eae8e59a9ef4ac753
 *
 * The `fairy-mesh.js` primitive is kept as a fallback so the game has
 * something to render until this resolves (no blank frame).
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { toonifyObject } from "../shaders/toon-2band.js";

const MODEL_URL = "/models/daisy-fairy/scene.gltf";
const TARGET_HEIGHT_M = 2.0; // matches the chunky 2 m base before fleet's scale

let cachedTemplate = null;
let inflightLoad = null;

/**
 * Load (and cache) the fairy template, then return a fresh clone
 * each call. Resolves with a `THREE.Group` ready to drop into the
 * scene at unit scale.
 */
export function loadFairyModel() {
  if (cachedTemplate) {
    return Promise.resolve(cloneTemplate(cachedTemplate));
  }
  if (inflightLoad) {
    return inflightLoad.then(cloneTemplate);
  }

  const loader = new GLTFLoader();
  inflightLoad = loader.loadAsync(MODEL_URL).then((gltf) => {
    const template = prepareTemplate(gltf.scene);
    cachedTemplate = template;
    inflightLoad = null;
    return template;
  }).catch((err) => {
    inflightLoad = null;
    throw err;
  });
  return inflightLoad.then(cloneTemplate);
}

/**
 * One-time normalization: re-center, re-scale, toonify, shadows.
 * Returns a Group whose bounding-box height is ~TARGET_HEIGHT_M and
 * whose origin sits on the floor (y=0).
 */
function prepareTemplate(scene) {
  const wrapper = new THREE.Group();
  wrapper.name = "fairy-template";
  wrapper.add(scene);

  // Compute bbox to re-center XZ and re-scale to target height.
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const heightScale = size.y > 0 ? TARGET_HEIGHT_M / size.y : 1;
  scene.scale.setScalar(heightScale);

  // Re-center: place the model's feet at y=0 and XZ centered on origin.
  scene.position.x = -center.x * heightScale;
  scene.position.z = -center.z * heightScale;
  scene.position.y = -box.min.y * heightScale;

  // Ensure base-color textures render in sRGB (Three.js r152+
  // changed the default to LinearSRGBColorSpace for DataTextures and
  // unspecified textures, which washes painted-on details).
  wrapper.traverse((n) => {
    if (!n.isMesh || !n.material) return;
    const m = Array.isArray(n.material) ? n.material[0] : n.material;
    if (m.map && m.map.colorSpace !== THREE.SRGBColorSpace) {
      m.map.colorSpace = THREE.SRGBColorSpace;
      m.map.needsUpdate = true;
    }
  });

  toonifyObject(wrapper);

  wrapper.traverse((n) => {
    if (n.isMesh) {
      n.castShadow = true;
      n.receiveShadow = true;
    }
  });

  return wrapper;
}

function cloneTemplate(template) {
  // SkeletonUtils-free clone; the Daisy Fairy mesh is non-skinned
  // so a plain Object3D.clone(true) is enough.
  return template.clone(true);
}

/**
 * Internal hook for tests — wipe the cache so a fresh load can be
 * exercised. Not exported in normal builds.
 */
export function _resetFairyLibraryCache() {
  cachedTemplate = null;
  inflightLoad = null;
}
