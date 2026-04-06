/**
 * Swarm — a group of drones that share an AI routine.
 *
 * Players assign drones to swarms and give each swarm a ruleset.
 * The swarm manages coordination and passes rules to individual drones.
 */

let nextSwarmId = 0;

/**
 * Create a new swarm.
 * @param {object} opts
 * @param {object} [opts.routine] — the 5 core rules
 * @returns {object}
 */
export function createSwarm(opts = {}) {
  return {
    id: nextSwarmId++,
    drones: [],
    routine: {
      anchor: "follow-mothership",
      range: 200,
      priority: "nearest",
      action: "mine",
      retreat: "cargo-full",
      ...opts.routine,
    },
    anchorPosition: { x: 0, y: 0, z: 0 },
    active: true,
  };
}

/**
 * Add a drone to a swarm.
 */
export function addDroneToSwarm(swarm, drone) {
  drone.swarmId = swarm.id;
  swarm.drones.push(drone);
}

/**
 * Remove a drone from a swarm.
 */
export function removeDroneFromSwarm(swarm, drone) {
  const idx = swarm.drones.indexOf(drone);
  if (idx >= 0) {
    swarm.drones.splice(idx, 1);
    drone.swarmId = null;
  }
}

/**
 * Get alive drones in a swarm.
 */
export function getAliveDrones(swarm) {
  return swarm.drones.filter((d) => d.state !== "destroyed");
}

/**
 * Update swarm anchor position based on routine.
 * @param {object} swarm
 * @param {object} mothershipPos — { x, y, z }
 */
export function updateSwarmAnchor(swarm, mothershipPos) {
  switch (swarm.routine.anchor) {
    case "follow-mothership":
      swarm.anchorPosition.x = mothershipPos.x;
      swarm.anchorPosition.y = mothershipPos.y;
      swarm.anchorPosition.z = mothershipPos.z;
      break;
    case "fixed":
      // anchor stays where it was set
      break;
    // More anchor types added via research progression
    default:
      swarm.anchorPosition.x = mothershipPos.x;
      swarm.anchorPosition.y = mothershipPos.y;
      swarm.anchorPosition.z = mothershipPos.z;
  }
}
