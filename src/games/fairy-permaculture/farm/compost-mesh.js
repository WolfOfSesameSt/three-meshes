/**
 * Fairy Permaculture — primitive compost-pile mesh.
 *
 * A stylized stepped cone of earth-brown + compost-rich tones.
 * State-driven surface:
 *   - empty/filling:  dark earth, small
 *   - hot:            warm-coral top + subtle steam sprite
 *   - cooling/curing: deeper brown, slightly settled
 *   - finished:       dark compost + gold glimmer on top
 */

import * as THREE from "three";
import { toonMaterial } from "../shaders/toon-2band.js";
import { PALETTE } from "../config.js";

export function createCompostPileMesh() {
  const group = new THREE.Group();
  group.name = "compost-pile";

  // Base mound — a chunky low-poly cone.
  const baseGeo = new THREE.ConeGeometry(2.2, 2.4, 8, 1);
  const baseMat = toonMaterial(PALETTE.earthBrown);
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = 1.2;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // Upper mound — richer compost tone so it reads as layered organic.
  const topGeo = new THREE.ConeGeometry(1.4, 1.0, 8, 1);
  const topMat = toonMaterial(PALETTE.compostRich);
  const top = new THREE.Mesh(topGeo, topMat);
  top.position.y = 2.4;
  top.castShadow = true;
  group.add(top);

  // Planks around the base — hint of a container.
  const plankGeo = new THREE.BoxGeometry(0.18, 0.9, 2.4);
  const plankMat = toonMaterial(0x8B6845);
  for (let i = 0; i < 4; i++) {
    const plank = new THREE.Mesh(plankGeo, plankMat);
    const theta = (i / 4) * Math.PI * 2 + Math.PI / 4;
    plank.position.set(Math.cos(theta) * 1.8, 0.45, Math.sin(theta) * 1.8);
    plank.rotation.y = theta + Math.PI / 2;
    plank.castShadow = true;
    group.add(plank);
  }

  // Steam puff — hidden until state goes hot.
  const steamGeo = new THREE.SphereGeometry(0.7, 10, 8);
  const steamMat = new THREE.MeshBasicMaterial({
    color: 0xEEEEEE,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  const steam = new THREE.Mesh(steamGeo, steamMat);
  steam.position.y = 3.4;
  group.add(steam);
  group.userData.steam = steam;

  // Gold sparkle on top — hidden until state=finished.
  const sparkleGeo = new THREE.OctahedronGeometry(0.35, 0);
  const sparkleMat = new THREE.MeshBasicMaterial({
    color: PALETTE.honeyGold,
    transparent: true,
    opacity: 0.0,
  });
  const sparkle = new THREE.Mesh(sparkleGeo, sparkleMat);
  sparkle.position.y = 3.1;
  group.add(sparkle);
  group.userData.sparkle = sparkle;

  // Tag so the interaction layer can identify it.
  group.userData.kind = "compost-pile";

  return group;
}

/** Update per-frame visuals based on the backing Pile state. */
export function updateCompostPileVisual(meshGroup, pile, t = 0) {
  if (!meshGroup || !pile) return;
  const state = pile.state;
  const steam = meshGroup.userData.steam;
  const sparkle = meshGroup.userData.sparkle;

  const hot = state === "hot" || state === "turn-window";
  const done = state === "finished";

  if (steam) {
    const target = hot ? 0.55 : 0.0;
    steam.material.opacity += (target - steam.material.opacity) * 0.08;
    const bob = 0.15 * Math.sin(t * 2);
    steam.position.y = 3.4 + bob;
    steam.scale.setScalar(1 + 0.1 * Math.sin(t * 1.5));
  }
  if (sparkle) {
    const target = done ? 1.0 : 0.0;
    sparkle.material.opacity += (target - sparkle.material.opacity) * 0.08;
    sparkle.rotation.y = t * 1.2;
    sparkle.position.y = 3.1 + 0.15 * Math.sin(t * 3);
  }

  // Volume-driven scale: a well-fed pile is physically bigger.
  const vol = Math.max(0.1, pile.volumeM3 ?? 0.1);
  const s = 0.75 + Math.min(1, vol / 2) * 0.45;
  meshGroup.scale.setScalar(s);
}
