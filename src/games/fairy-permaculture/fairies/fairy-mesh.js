/**
 * Fairy Permaculture — procgen fairy mesh + sparkle trail.
 *
 * Primitive fairy for MVP: tiny body (capsule), two triangular wings,
 * and a small colored sphere "glow" around it. Designed to be
 * instanced at 100+ copies without trouble.
 *
 * Library-sourced fairy mesh will replace this via the Model Viewer
 * lab later; the role-specific hat/tool sprites attach at
 * `bodyGroup.hatSlot` and `bodyGroup.toolSlot`.
 */

import * as THREE from "three";
import { toonMaterial } from "../shaders/toon-2band.js";
import { PALETTE } from "../config.js";

const BODY_COLOR = PALETTE.moonlightSilver;
const WING_COLOR = PALETTE.skyPastel;
const GLOW_COLOR = PALETTE.honeyGold;

/**
 * Create a fairy. Returns a Three.js Group.
 *
 * @param {object} [opts]
 * @param {number} [opts.scale=1.0]
 * @param {THREE.Color|number} [opts.bodyColor]
 * @param {string} [opts.name]
 */
export function createFairy(opts = {}) {
  const group = new THREE.Group();
  group.name = opts.name ?? "fairy";

  // Body — small capsule-ish (stacked sphere + half-sphere for skirt)
  const bodyGeo = new THREE.SphereGeometry(0.25, 8, 6);
  const bodyMat = toonMaterial(opts.bodyColor ?? BODY_COLOR);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.5;
  body.castShadow = true;
  group.add(body);

  // Wings — two symmetrical triangles, pitched slightly up
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.quadraticCurveTo(0.45, 0.6, 0.2, 0.8);
  wingShape.quadraticCurveTo(0.1, 0.4, 0, 0);
  const wingGeo = new THREE.ShapeGeometry(wingShape);
  const wingMat = toonMaterial(WING_COLOR, {
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
  });
  const wingL = new THREE.Mesh(wingGeo, wingMat);
  wingL.position.set(-0.05, 0.55, 0);
  wingL.rotation.y = -Math.PI / 3;
  group.add(wingL);
  const wingR = wingL.clone();
  wingR.position.x = 0.05;
  wingR.rotation.y = Math.PI / 3;
  group.add(wingR);

  // Glow — a small back-facing sphere for soft-light halo
  const glowGeo = new THREE.SphereGeometry(0.45, 10, 8);
  const glowMat = new THREE.MeshBasicMaterial({
    color: GLOW_COLOR,
    transparent: true,
    opacity: 0.18,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.y = 0.5;
  group.add(glow);

  // Attachment slots for role hat/tool (empty for now)
  const hatSlot = new THREE.Group();
  hatSlot.position.y = 0.78;
  hatSlot.name = "hatSlot";
  group.add(hatSlot);

  const toolSlot = new THREE.Group();
  toolSlot.position.set(0.22, 0.45, 0);
  toolSlot.name = "toolSlot";
  group.add(toolSlot);

  // Point-light for the moonlit-night amplification effect
  const light = new THREE.PointLight(GLOW_COLOR, 0.5, 3, 2);
  light.position.y = 0.5;
  group.add(light);
  group.userData.light = light;

  if (opts.scale) group.scale.setScalar(opts.scale);

  // Store wing refs for animation
  group.userData.wings = [wingL, wingR];
  group.userData.body = body;

  return group;
}

/**
 * Simple per-frame animation: wing flutter + bob. Deterministic
 * given `t` (elapsed seconds) and an offset; safe for up to 100+
 * fairies without perf issues.
 */
export function animateFairy(fairy, t, offset = 0) {
  const flap = Math.sin((t + offset) * 18) * 0.4;
  if (fairy.userData.wings) {
    fairy.userData.wings[0].rotation.z = flap;
    fairy.userData.wings[1].rotation.z = -flap;
  }
  if (fairy.userData.body) {
    fairy.userData.body.position.y = 0.5 + Math.sin((t + offset) * 4) * 0.04;
  }
}
