/**
 * Fairy Permaculture — isometric overseer camera rig.
 *
 * Fixed 45° isometric orthographic camera. WASD + edge-scroll +
 * mouse-wheel zoom. Waypoints on hotkeys 1–9 (user places with
 * Ctrl-1..9 and jumps to them with 1..9 alone).
 *
 * No hero fairy — the camera is the player's eye.
 */

import * as THREE from "three";
import {
  CAMERA_PITCH_DEG,
  CAMERA_YAW_DEG,
  CAMERA_DISTANCE,
  CAMERA_ORTHO_SIZE,
} from "../config.js";

const PITCH = THREE.MathUtils.degToRad(CAMERA_PITCH_DEG);
const YAW = THREE.MathUtils.degToRad(CAMERA_YAW_DEG);
const OFFSET = new THREE.Vector3(
  Math.cos(PITCH) * Math.sin(YAW) * CAMERA_DISTANCE,
  Math.sin(PITCH) * CAMERA_DISTANCE,
  Math.cos(PITCH) * Math.cos(YAW) * CAMERA_DISTANCE
);

/**
 * Create the overseer camera rig.
 *
 * @param {Element} dom     — element to attach listeners to
 * @returns {object}        — rig with camera, target, waypoints
 */
export function createCameraRig(dom) {
  const aspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.OrthographicCamera(
    -CAMERA_ORTHO_SIZE * aspect,
    CAMERA_ORTHO_SIZE * aspect,
    CAMERA_ORTHO_SIZE,
    -CAMERA_ORTHO_SIZE,
    0.1,
    2000
  );

  const target = new THREE.Vector3(0, 0, 0);
  const zoom = { value: CAMERA_ORTHO_SIZE };
  const minZoom = 10;
  const maxZoom = 120;

  const keys = new Set();
  const waypoints = new Map(); // '1'..'9' → Vector3

  function updateCamera() {
    const a = window.innerWidth / window.innerHeight;
    camera.left = -zoom.value * a;
    camera.right = zoom.value * a;
    camera.top = zoom.value;
    camera.bottom = -zoom.value;
    camera.updateProjectionMatrix();

    camera.position.copy(target).add(OFFSET);
    camera.lookAt(target);
  }

  // ── Input ──────────────────────────────────────────────────────
  const onKey = (e, down) => {
    if (e.ctrlKey && down && /^[1-9]$/.test(e.key)) {
      // Ctrl-N: place waypoint at current target
      waypoints.set(e.key, target.clone());
      e.preventDefault();
      return;
    }
    if (/^[1-9]$/.test(e.key) && down) {
      const wp = waypoints.get(e.key);
      if (wp) target.copy(wp);
    }
    keys.add(e.code);
    if (!down) keys.delete(e.code);
  };
  const onKeydown = (e) => onKey(e, true);
  const onKeyup = (e) => onKey(e, false);
  window.addEventListener("keydown", onKeydown);
  window.addEventListener("keyup", onKeyup);

  const onWheel = (e) => {
    zoom.value = THREE.MathUtils.clamp(
      zoom.value + Math.sign(e.deltaY) * 2,
      minZoom,
      maxZoom
    );
    e.preventDefault();
  };
  dom.addEventListener("wheel", onWheel, { passive: false });

  // Edge-scroll intentionally disabled — WASD only. Mouse is left
  // purely for clicking/hovering interactables.
  const mouse = { x: -1, y: -1 };
  const onMouseMove = () => {};

  updateCamera();
  window.addEventListener("resize", updateCamera);

  // ── Per-frame update ───────────────────────────────────────────
  function update(dt) {
    const panSpeed = 30 * (zoom.value / CAMERA_ORTHO_SIZE);
    // WASD — isometric-space movement (NE/NW/SE/SW mapped to world axes)
    let mx = 0;
    let mz = 0;
    if (keys.has("KeyW") || keys.has("ArrowUp")) mz -= 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) mz += 1;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) mx -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) mx += 1;

    if (mx !== 0 || mz !== 0) {
      // At yaw=45° / pitch=45° the camera's "forward" in world XZ is
      // (-sin yaw, -cos yaw) ≈ (-1, -1)/√2. So "screen up" from the
      // player's POV is world (-1, 0, -1) and "screen right" is
      // (+1, 0, -1). Map WASD accordingly:
      //   W (mz=-1) → screen up    → (wx, wz) = (-1, -1)
      //   S (mz=+1) → screen down  → (+1, +1)
      //   D (mx=+1) → screen right → (+1, -1)
      //   A (mx=-1) → screen left  → (-1, +1)
      let wx = mx + mz;
      let wz = mz - mx;
      // Normalize diagonals so W+D isn't √2 faster than W alone.
      const len = Math.hypot(wx, wz);
      if (len > 0) { wx /= len; wz /= len; }
      target.x += wx * panSpeed * dt;
      target.z += wz * panSpeed * dt;
    }
    updateCamera();
  }

  function dispose() {
    window.removeEventListener("keydown", onKeydown);
    window.removeEventListener("keyup", onKeyup);
    window.removeEventListener("resize", updateCamera);
    dom.removeEventListener("wheel", onWheel);
    // mouse-move was a no-op, but keep the symmetry if it's re-enabled.
    void onMouseMove;
  }

  function setTarget(v) {
    target.copy(v);
    updateCamera();
  }

  function placeWaypoint(key, v = null) {
    waypoints.set(String(key), (v ?? target).clone());
  }

  function jumpToWaypoint(key) {
    const wp = waypoints.get(String(key));
    if (wp) setTarget(wp);
  }

  return {
    camera,
    target,
    zoom,
    waypoints,
    update,
    dispose,
    setTarget,
    placeWaypoint,
    jumpToWaypoint,
  };
}
