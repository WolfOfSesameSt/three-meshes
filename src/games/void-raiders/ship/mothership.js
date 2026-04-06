/**
 * Mothership — the player's deployable vessel.
 *
 * Low-poly geometric mesh with basic systems.
 * Follows a pre-planned route through the realm.
 */

import * as THREE from "three";

/**
 * Create the mothership mesh — a low-poly angular hull.
 * @returns {THREE.Group}
 */
function createMothershipMesh() {
  const group = new THREE.Group();

  // Main hull — elongated octahedron shape
  const hullGeometry = new THREE.BufferGeometry();
  const hullVerts = new Float32Array([
    // Top
    0, 4, 0,
    // Front
    0, 0, -20,
    // Right
    8, 0, 0,
    // Back
    0, 1, 14,
    // Left
    -8, 0, 0,
    // Bottom
    0, -2, 0,
  ]);
  const hullIndices = [
    // Top faces
    0, 1, 2,
    0, 2, 3,
    0, 3, 4,
    0, 4, 1,
    // Bottom faces
    5, 2, 1,
    5, 3, 2,
    5, 4, 3,
    5, 1, 4,
  ];
  hullGeometry.setAttribute("position", new THREE.Float32BufferAttribute(hullVerts, 3));
  hullGeometry.setIndex(hullIndices);
  hullGeometry.computeVertexNormals();

  const hullMaterial = new THREE.MeshStandardMaterial({
    color: 0x334455,
    roughness: 0.4,
    metalness: 0.7,
    flatShading: true,
  });

  const hull = new THREE.Mesh(hullGeometry, hullMaterial);
  group.add(hull);

  // Engine glow — two small emissive spheres at the back
  const engineGeo = new THREE.SphereGeometry(1.2, 6, 4);
  const engineMat = new THREE.MeshBasicMaterial({ color: 0x4488ff });

  const engineL = new THREE.Mesh(engineGeo, engineMat);
  engineL.position.set(-3, 0, 12);
  group.add(engineL);

  const engineR = new THREE.Mesh(engineGeo, engineMat);
  engineR.position.set(3, 0, 12);
  group.add(engineR);

  // Bridge — small raised section on top
  const bridgeGeo = new THREE.BoxGeometry(3, 1.5, 4);
  const bridgeMat = new THREE.MeshStandardMaterial({
    color: 0x556677,
    roughness: 0.3,
    metalness: 0.8,
    flatShading: true,
  });
  const bridge = new THREE.Mesh(bridgeGeo, bridgeMat);
  bridge.position.set(0, 4.5, -4);
  group.add(bridge);

  return group;
}

/**
 * Mothership entity with systems and state.
 */
export class Mothership {
  constructor() {
    this.mesh = createMothershipMesh();
    this.mesh.position.set(0, 30, 0);

    // Core systems
    this.systems = {
      hull: 1000,
      hullMax: 1000,
      shields: 500,
      shieldsMax: 500,
      energy: 100,
      energyMax: 100,
      energyProduction: 10,
    };

    // Tesseract storage
    this.tesseract = {
      capacity: 10000,
      contents: {},
    };

    // Route
    this.route = [];
    this.routeIndex = 0;
    this.speed = 0; // m/s, set by movement system

    // State
    this.alive = true;
  }

  /**
   * Get world position.
   * @returns {THREE.Vector3}
   */
  get position() {
    return this.mesh.position;
  }

  /**
   * Apply damage (shields first, then hull).
   * @param {number} amount
   */
  takeDamage(amount) {
    if (this.systems.shields > 0) {
      const absorbed = Math.min(this.systems.shields, amount);
      this.systems.shields -= absorbed;
      amount -= absorbed;
    }
    this.systems.hull -= amount;
    if (this.systems.hull <= 0) {
      this.systems.hull = 0;
      this.alive = false;
    }
  }

  /**
   * Store resources in the tesseract.
   * @param {string} resourceType
   * @param {number} amount
   * @returns {number} amount actually stored
   */
  storeResource(resourceType, amount) {
    const currentTotal = Object.values(this.tesseract.contents).reduce((a, b) => a + b, 0);
    const space = this.tesseract.capacity - currentTotal;
    const stored = Math.min(amount, space);
    this.tesseract.contents[resourceType] = (this.tesseract.contents[resourceType] || 0) + stored;
    return stored;
  }

  dispose() {
    this.mesh.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  }
}
