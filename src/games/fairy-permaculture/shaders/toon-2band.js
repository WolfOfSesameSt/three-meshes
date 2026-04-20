/**
 * Fairy Permaculture — crisp 2-band cel shading.
 *
 * Applies `MeshToonMaterial` with a 2-pixel gradient texture (shadow
 * + lit) to produce the hard cel look locked in by the art decision.
 * This module is the canonical source of the shader; use it
 * everywhere instead of rolling new toon materials inline.
 */

import * as THREE from "three";

let gradientTexture = null;

function getGradientTexture() {
  if (gradientTexture) return gradientTexture;
  // 2-band shadow→lit ramp. WebGL2 disallows 3-channel DataTexture
  // uploads, so use RGBA (the alpha byte is ignored by MeshToonMaterial).
  const data = new Uint8Array([70, 70, 70, 255, 255, 255, 255, 255]);
  gradientTexture = new THREE.DataTexture(data, 2, 1, THREE.RGBAFormat);
  gradientTexture.minFilter = THREE.NearestFilter;
  gradientTexture.magFilter = THREE.NearestFilter;
  gradientTexture.needsUpdate = true;
  return gradientTexture;
}

/**
 * Create a toon material.
 *
 * @param {number|string|THREE.Color} color
 * @param {object} [opts]
 * @returns {THREE.MeshToonMaterial}
 */
export function toonMaterial(color = 0xffffff, opts = {}) {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: getGradientTexture(),
    ...opts,
  });
}

/**
 * In-place replacement of any MeshStandardMaterial / MeshBasic with
 * toon, preserving color and name. Used in lab + main game when
 * loading library meshes.
 */
export function toonifyObject(object3D) {
  object3D.traverse((n) => {
    if (n.isMesh && n.material) {
      const base = Array.isArray(n.material) ? n.material[0] : n.material;
      const color = base.color?.clone() ?? new THREE.Color(0xffffff);
      const opts = {};
      // Preserve the base-color texture if present — without it,
      // textured library models (e.g. the Daisy Fairy) collapse to a
      // single tint and look like blobs.
      if (base.map) opts.map = base.map;
      const newMat = toonMaterial(color, opts);
      // Don't force flat shading when the model carries a texture —
      // flat shading can stripe the texture into facets.
      newMat.flatShading = !base.map;
      n.material = newMat;
      n.castShadow = true;
      n.receiveShadow = true;
    }
  });
}
