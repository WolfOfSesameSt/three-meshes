/**
 * Mothership movement — follows a pre-planned route through the realm.
 *
 * The route is a series of waypoints. The mothership moves toward
 * the current waypoint and advances to the next when close enough.
 */

import { MOTHERSHIP_SPEED_MS } from "../config.js";

const WAYPOINT_THRESHOLD = 20; // meters — close enough to advance

/**
 * Move the mothership along its route.
 * @param {import('./mothership.js').Mothership} ship
 * @param {number} dt — delta time in seconds
 */
export function updateMovement(ship, dt) {
  if (!ship.alive || ship.route.length === 0) return;
  if (ship.routeIndex >= ship.route.length) return;

  const target = ship.route[ship.routeIndex];
  const pos = ship.mesh.position;

  // Direction to waypoint (XZ plane)
  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist < WAYPOINT_THRESHOLD) {
    ship.routeIndex++;
    return;
  }

  // Move toward waypoint
  const speed = MOTHERSHIP_SPEED_MS * dt;
  const nx = dx / dist;
  const nz = dz / dist;

  pos.x += nx * speed;
  pos.z += nz * speed;

  // Rotate to face movement direction
  ship.mesh.rotation.y = Math.atan2(nx, nz);

  ship.speed = MOTHERSHIP_SPEED_MS;
}

/**
 * Generate a simple default route for testing.
 * Straight line through the realm center.
 * @param {number} startX
 * @param {number} startZ
 * @param {number} distance — total route distance in meters
 * @param {number} segments — number of waypoints
 * @returns {Array<{x: number, z: number}>}
 */
export function generateTestRoute(startX, startZ, distance = 5000, segments = 20) {
  const route = [];
  const segLen = distance / segments;

  for (let i = 1; i <= segments; i++) {
    // Gentle S-curve for visual interest
    const progress = i / segments;
    const curve = Math.sin(progress * Math.PI * 2) * 200;
    route.push({
      x: startX + curve,
      z: startZ + i * segLen,
    });
  }

  return route;
}
