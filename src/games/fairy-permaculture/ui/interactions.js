/**
 * Fairy Permaculture — click-to-interact layer with an obvious
 * hover highlight.
 *
 * - Raycasts from the mouse into the scene.
 * - Paints a honey-gold ground ring under the hovered interactable,
 *   scaled to the object's bounding sphere. Reads from any camera
 *   angle.
 * - Fires `onClick(ev, intersect)` on click.
 */

import * as THREE from "three";
import { PALETTE } from "../config.js";

export function createInteractionLayer({ renderer, camera, scene }) {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  /** @type {Array<{ object: THREE.Object3D, onClick: Function, onHover?: Function, isActive?: () => boolean }>} */
  const registry = [];
  let hovered = null;

  // ── Ground-ring hover highlight ────────────────────────────────
  const ringGeo = new THREE.RingGeometry(1, 1.18, 48);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: PALETTE.honeyGold,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false, // draw on top so it always reads
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.renderOrder = 9999;
  ring.visible = false;
  scene.add(ring);

  // Bob pulse for life
  const ring2 = ring.clone();
  ring2.material = ringMat.clone();
  ring2.material.opacity = 0.45;
  ring2.visible = false;
  scene.add(ring2);

  const tmpBox = new THREE.Box3();
  const tmpSphere = new THREE.Sphere();

  function positionRingOn(object) {
    tmpBox.setFromObject(object);
    if (!tmpBox.isEmpty()) {
      tmpBox.getBoundingSphere(tmpSphere);
      // Place ring at the object's ground footprint.
      const r = Math.max(1.2, tmpSphere.radius * 0.9);
      ring.scale.setScalar(r);
      ring2.scale.setScalar(r);
      ring.position.set(tmpSphere.center.x, tmpBox.min.y + 0.05, tmpSphere.center.z);
      ring2.position.copy(ring.position);
    }
    ring.visible = true;
    ring2.visible = true;
  }

  function hideRing() {
    ring.visible = false;
    ring2.visible = false;
  }

  function toNdc(ev) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function pick() {
    raycaster.setFromCamera(mouse, camera);
    let best = null;
    let bestDist = Infinity;
    for (const r of registry) {
      if (r.isActive && !r.isActive()) continue;
      const hits = raycaster.intersectObject(r.object, true);
      if (hits.length > 0 && hits[0].distance < bestDist) {
        best = { entry: r, hit: hits[0] };
        bestDist = hits[0].distance;
      }
    }
    return best;
  }

  function onMove(ev) {
    toNdc(ev);
    const hit = pick();
    const next = hit?.entry ?? null;
    if (next !== hovered) {
      if (hovered?.object?.userData) hovered.object.userData._hovered = false;
      hovered = next;
      if (hovered?.object?.userData) hovered.object.userData._hovered = true;
      if (hovered) positionRingOn(hovered.object);
      else hideRing();
      renderer.domElement.style.cursor = hovered ? "pointer" : "default";
    }
    if (hovered && hovered === next) positionRingOn(hovered.object); // follow movement
    if (hovered?.onHover) hovered.onHover();
  }

  function onClick(ev) {
    toNdc(ev);
    const hit = pick();
    if (hit) hit.entry.onClick(ev, hit.hit);
  }

  renderer.domElement.addEventListener("mousemove", onMove);
  renderer.domElement.addEventListener("click", onClick);

  // Ring pulse so it feels alive.
  let t0 = performance.now();
  function animate() {
    const t = (performance.now() - t0) / 1000;
    if (ring.visible) {
      const pulse = 1 + 0.08 * Math.sin(t * 6);
      ring.scale.setScalar(ring.userData.baseScale ?? ring.scale.x);
      ring2.scale.setScalar((ring.userData.baseScale ?? ring.scale.x) * (1.15 + 0.1 * Math.sin(t * 4)));
      ring.material.opacity = 0.75 + 0.15 * Math.sin(t * 6);
      ring2.material.opacity = 0.35 + 0.1 * Math.sin(t * 4 + 1);
      void pulse;
    }
    requestAnimationFrame(animate);
  }
  animate();

  function register(entry) {
    registry.push(entry);
    return () => {
      const i = registry.indexOf(entry);
      if (i >= 0) registry.splice(i, 1);
    };
  }

  function clear() {
    registry.length = 0;
    hovered = null;
    hideRing();
    renderer.domElement.style.cursor = "default";
  }

  return {
    register,
    clear,
    get hovered() { return hovered; },
    dispose() {
      renderer.domElement.removeEventListener("mousemove", onMove);
      renderer.domElement.removeEventListener("click", onClick);
      scene.remove(ring);
      scene.remove(ring2);
    },
  };
}

/** Legacy hover-pulse helper kept for backwards-compat; now a no-op. */
export function makeHoverPulse() {
  return { tick() {} };
}
