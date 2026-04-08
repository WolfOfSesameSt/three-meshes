import * as THREE from 'three';

/**
 * Simple seeded PRNG so starfield placement is deterministic across renders.
 * Mulberry32 — fast, good-enough-for-visuals.
 */
function mulberry32(seed) {
  return function rand() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build a depth-showcasing demo scene into the provided Three.js scene.
 *
 * Returned handle exposes:
 *   update(t, frame)  — drive animation by absolute time (seconds)
 *   dispose()         — release any owned resources
 *
 * The caller owns the scene/camera/renderer lifecycle; this function only
 * populates the scene graph and returns a stateful updater.
 */
export function buildDemoScene(scene, camera) {
  scene.background = new THREE.Color(0x02030a);
  scene.fog = new THREE.FogExp2(0x02030a, 0.035);

  // Lighting ----------------------------------------------------------------
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
  keyLight.position.set(5, 8, 5);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x88aaff, 0.7);
  rimLight.position.set(-5, 3, -5);
  scene.add(rimLight);

  const fillLight = new THREE.PointLight(0xff88cc, 0.8, 20);
  fillLight.position.set(0, 0, 3);
  scene.add(fillLight);

  // Center torus knot -------------------------------------------------------
  const knotGeo = new THREE.TorusKnotGeometry(1.0, 0.35, 220, 32);
  const knotMat = new THREE.MeshStandardMaterial({
    color: 0xf0f2ff,
    metalness: 0.85,
    roughness: 0.18,
  });
  const knot = new THREE.Mesh(knotGeo, knotMat);
  scene.add(knot);

  // Orbiting icosahedra at varied depths -----------------------------------
  const ORBITER_COUNT = 24;
  const orbiterGeo = new THREE.IcosahedronGeometry(0.28, 0);
  const orbiters = [];
  for (let i = 0; i < ORBITER_COUNT; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(i / ORBITER_COUNT, 0.75, 0.58),
      metalness: 0.25,
      roughness: 0.45,
      emissive: new THREE.Color().setHSL(i / ORBITER_COUNT, 0.9, 0.25),
      emissiveIntensity: 0.4,
    });
    const mesh = new THREE.Mesh(orbiterGeo, mat);
    scene.add(mesh);
    orbiters.push({
      mesh,
      radius: 2.5 + (i % 3) * 0.7,
      speed: 0.25 + (i % 4) * 0.08,
      phase: (i / ORBITER_COUNT) * Math.PI * 2,
      yAmp: 0.6 + (i % 5) * 0.25,
      yFreq: 0.5 + (i % 3) * 0.15,
    });
  }

  // Deterministic starfield ------------------------------------------------
  const rand = mulberry32(1337);
  const starCount = 900;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 18 + rand() * 22;
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    starPositions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    starPositions[i * 3 + 2] = r * Math.cos(phi);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(starPositions, 3),
  );
  const starMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.08,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
  });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // Ground grid far behind for depth reference ----------------------------
  const grid = new THREE.GridHelper(40, 40, 0x224466, 0x112233);
  grid.position.y = -4;
  scene.add(grid);

  return {
    update(t) {
      // Spin the knot
      knot.rotation.x = t * 0.5;
      knot.rotation.y = t * 0.8;

      // Orbit the icosahedra
      for (const o of orbiters) {
        const a = o.phase + t * o.speed;
        o.mesh.position.set(
          Math.cos(a) * o.radius,
          Math.sin(t * o.yFreq + o.phase) * o.yAmp,
          Math.sin(a) * o.radius,
        );
        o.mesh.rotation.x = t * 0.9;
        o.mesh.rotation.y = t * 1.2;
      }

      // Pulse the fill light
      fillLight.intensity = 0.6 + Math.sin(t * 1.5) * 0.3;

      // Gentle camera dolly to add parallax
      camera.position.set(
        Math.sin(t * 0.15) * 0.9,
        0.3 + Math.cos(t * 0.2) * 0.4,
        5.8 + Math.sin(t * 0.1) * 0.6,
      );
      camera.lookAt(0, 0, 0);

      // Slow star drift
      stars.rotation.y = t * 0.015;
    },
    dispose() {
      // Materials + geometries will be walked by the caller's scene.traverse
      // cleanup. Nothing extra owned here.
    },
  };
}
