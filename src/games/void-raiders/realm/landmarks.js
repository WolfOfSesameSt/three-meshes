/**
 * Landmark structures — procedurally placed terrain features.
 *
 * Generates 3-5 unique landmarks per realm using the realm seed.
 * Each landmark modifies the terrain heightmap in its area.
 * Uses Poisson disc sampling for minimum-distance placement.
 */

import { mulberry32 } from "../utils/noise.js";

// Landmark type definitions
export const LANDMARK_TYPES = {
  monolith: {
    radius: 10,
    heightOffset: 30,
    description: "Tall narrow column",
  },
  crater: {
    radius: 50,
    heightOffset: -10,
    description: "Circular depression",
  },
  ridge: {
    length: 200,
    width: 20,
    heightOffset: 8,
    description: "Elongated raised terrain",
  },
  mesa: {
    radius: 80,
    heightOffset: 0, // clamps height rather than adding
    mesaLevel: 15,
    description: "Flat-topped plateau",
  },
  canyon: {
    length: 300,
    width: 30,
    heightOffset: -15,
    description: "Deep linear trench",
  },
};

const LANDMARK_KEYS = Object.keys(LANDMARK_TYPES);
const MIN_SPACING = 500; // meters between landmarks
const MIN_LANDMARKS = 3;
const MAX_LANDMARKS = 5;

/**
 * Generate landmarks for a realm using Poisson disc sampling.
 * @param {number} seed — realm seed
 * @param {number} realmSize — realm size in meters
 * @returns {Array<object>} — array of landmark descriptors
 */
export function generateLandmarks(seed, realmSize = 10000) {
  const rng = mulberry32(seed);
  const count = MIN_LANDMARKS + Math.floor(rng() * (MAX_LANDMARKS - MIN_LANDMARKS + 1));
  const halfSize = realmSize / 2;

  const landmarks = [];
  const maxAttempts = 100;

  for (let i = 0; i < count; i++) {
    let placed = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const x = (rng() - 0.5) * realmSize * 0.8; // keep away from edges
      const z = (rng() - 0.5) * realmSize * 0.8;

      // Check minimum spacing against existing landmarks
      let tooClose = false;
      for (const existing of landmarks) {
        const dx = x - existing.x;
        const dz = z - existing.z;
        if (Math.sqrt(dx * dx + dz * dz) < MIN_SPACING) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      // Pick type — weighted by index to ensure variety
      const typeIdx = (i + Math.floor(rng() * LANDMARK_KEYS.length)) % LANDMARK_KEYS.length;
      const type = LANDMARK_KEYS[typeIdx];

      // Random direction for directional landmarks (ridge, canyon)
      const angle = rng() * Math.PI * 2;

      landmarks.push({
        type,
        x,
        z,
        angle,
        seed: Math.floor(rng() * 999999),
      });

      placed = true;
      break;
    }

    // If we couldn't place after max attempts, skip this landmark
    if (!placed) break;
  }

  return landmarks;
}

/**
 * Compute height offset from all landmarks at a world position.
 * @param {number} worldX
 * @param {number} worldZ
 * @param {Array<object>} landmarks
 * @returns {number} — height offset in voxels
 */
export function getLandmarkModifier(worldX, worldZ, landmarks) {
  let offset = 0;
  let mesaClamped = false;
  let mesaLevel = 0;

  for (const lm of landmarks) {
    const dx = worldX - lm.x;
    const dz = worldZ - lm.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const def = LANDMARK_TYPES[lm.type];

    switch (lm.type) {
      case "monolith": {
        // Sharp spike in a small radius
        if (dist < def.radius) {
          const t = 1 - dist / def.radius;
          // Sharp falloff: t^4 for spiky look
          offset += def.heightOffset * t * t * t * t;
        }
        break;
      }

      case "crater": {
        // Circular depression with smooth falloff
        if (dist < def.radius) {
          const t = 1 - dist / def.radius;
          // Smooth bowl shape
          offset += def.heightOffset * t * t;
        }
        break;
      }

      case "ridge": {
        // Elongated height boost along a direction
        // Project point onto the ridge axis
        const cosA = Math.cos(lm.angle);
        const sinA = Math.sin(lm.angle);
        const along = dx * cosA + dz * sinA; // distance along ridge
        const across = Math.abs(-dx * sinA + dz * cosA); // perpendicular distance
        const halfLen = def.length / 2;
        const halfWidth = def.width / 2;

        if (Math.abs(along) < halfLen && across < halfWidth) {
          const tAlong = 1 - Math.abs(along) / halfLen;
          const tAcross = 1 - across / halfWidth;
          offset += def.heightOffset * tAlong * tAcross * tAcross;
        }
        break;
      }

      case "mesa": {
        // Flat-topped area — clamps height to a constant level
        if (dist < def.radius) {
          const t = 1 - dist / def.radius;
          if (t > 0.3) {
            // Inside the flat top
            mesaClamped = true;
            mesaLevel = def.mesaLevel;
          } else {
            // Edge ramp — blend up toward mesa level
            const edgeT = t / 0.3;
            mesaClamped = true;
            mesaLevel = def.mesaLevel * edgeT;
          }
        }
        break;
      }

      case "canyon": {
        // Linear trench along a direction
        const cosA = Math.cos(lm.angle);
        const sinA = Math.sin(lm.angle);
        const along = dx * cosA + dz * sinA;
        const across = Math.abs(-dx * sinA + dz * cosA);
        const halfLen = def.length / 2;
        const halfWidth = def.width / 2;

        if (Math.abs(along) < halfLen && across < halfWidth) {
          const tAlong = 1 - Math.abs(along) / halfLen;
          const tAcross = 1 - across / halfWidth;
          // Smooth U-shape across, tapering at ends
          offset += def.heightOffset * tAlong * tAcross;
        }
        break;
      }
    }
  }

  return { offset, mesaClamped, mesaLevel };
}
