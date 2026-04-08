import * as THREE from 'three';

/**
 * Mulberry32 PRNG — deterministic starfield placement.
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
 * Dodging-asteroids scene: like the demo, but each orbiting icosahedron
 * periodically swoops TOWARD the camera and swerves aside at the last
 * moment — a "near miss" choreography that creates strong anaglyph pop
 * at the moment of closest approach.
 *
 * Choreography per asteroid:
 *   - Base orbit (same as demo) around the center torus knot.
 *   - A staggered `dodgePhase` triggers a dodge event every `dodgePeriod`
 *     seconds. During the ~1.6s dodge window:
 *       * sin-bell envelope ramps 0→1→0 (`dodge` strength)
 *       * asteroid moves toward camera along the straight line between
 *         its base position and the camera, stopping `targetDist` units
 *         short of the camera
 *       * adds a perpendicular swerve vector (alternating sign per
 *         asteroid) so it arcs past the camera instead of smashing it
 *       * emissive flares and tumble speed ramps up for drama
 *   - Dodges are offset per-asteroid so you get a continuous stream of
 *     near-misses instead of synchronized chaos.
 */
export function buildDodgeScene(scene, camera) {
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

  // Center torus knot (fixed reference for depth perception) ---------------
  const knotGeo = new THREE.TorusKnotGeometry(0.9, 0.3, 220, 32);
  const knotMat = new THREE.MeshStandardMaterial({
    color: 0xe8eaff,
    metalness: 0.85,
    roughness: 0.2,
  });
  const knot = new THREE.Mesh(knotGeo, knotMat);
  scene.add(knot);

  // Dodging asteroids ------------------------------------------------------
  const ORBITER_COUNT = 20;
  const orbiterGeo = new THREE.IcosahedronGeometry(0.32, 0);
  const orbiters = [];
  for (let i = 0; i < ORBITER_COUNT; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(i / ORBITER_COUNT, 0.75, 0.58),
      metalness: 0.3,
      roughness: 0.4,
      emissive: new THREE.Color().setHSL(i / ORBITER_COUNT, 0.9, 0.3),
      emissiveIntensity: 0.4,
    });
    const mesh = new THREE.Mesh(orbiterGeo, mat);
    const scale = 0.85 + (i % 4) * 0.2;
    mesh.scale.setScalar(scale);
    scene.add(mesh);

    orbiters.push({
      mesh,
      material: mat,
      baseEmissive: 0.4,

      // Base orbit
      radius: 2.6 + (i % 3) * 0.7,
      speed: 0.22 + (i % 4) * 0.07,
      phase: (i / ORBITER_COUNT) * Math.PI * 2,
      yAmp: 0.6 + (i % 5) * 0.25,
      yFreq: 0.5 + (i % 3) * 0.15,

      // Dodge timing — stagger so dodges don't overlap too much
      dodgePeriod: 4.0 + (i % 4) * 0.35,
      dodgeOffset: (i / ORBITER_COUNT) * 4.0,
      dodgeDur: 1.6,

      // Swerve direction: alternate left/right around camera
      swerveSign: i % 2 === 0 ? 1 : -1,
      swerveY: (i % 3 - 1) * 0.5, // some go up, some down, some flat
    });
  }

  // Deterministic starfield ------------------------------------------------
  const rand = mulberry32(2025);
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

  // Ground grid for depth reference ----------------------------------------
  const grid = new THREE.GridHelper(40, 40, 0x224466, 0x112233);
  grid.position.y = -4;
  scene.add(grid);

  // How close dodging asteroids get to the camera (world units).
  // Keep >= 1.8 to avoid eye-strain-levels of anaglyph disparity.
  const TARGET_DIST = 2.2;

  return {
    update(t) {
      // Spin the knot (slower — it's the fixed reference now)
      knot.rotation.x = t * 0.35;
      knot.rotation.y = t * 0.55;

      const camX = camera.position.x;
      const camY = camera.position.y;
      const camZ = camera.position.z;

      for (const o of orbiters) {
        // Base orbit position
        const a = o.phase + t * o.speed;
        const baseX = Math.cos(a) * o.radius;
        const baseY = Math.sin(t * o.yFreq + o.phase) * o.yAmp;
        const baseZ = Math.sin(a) * o.radius;

        // Dodge schedule — one bell-shaped event per period
        const localT = (t + o.dodgeOffset) % o.dodgePeriod;
        let dodge = 0;
        if (localT < o.dodgeDur) {
          const u = localT / o.dodgeDur; // 0..1
          dodge = Math.sin(u * Math.PI); // 0..1..0
        }

        // Direction from base to camera
        const dx = camX - baseX;
        const dy = camY - baseY;
        const dz = camZ - baseZ;
        const dLen = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const nx = dx / dLen;
        const ny = dy / dLen;
        const nz = dz / dLen;

        // Approach distance — how far along toCam the asteroid travels.
        // Stops `TARGET_DIST` units short of the camera at peak dodge.
        const approach = dodge * Math.max(0, dLen - TARGET_DIST);

        // Perpendicular swerve vector in the XZ plane (horizontal arc)
        const swerveX = -nz * o.swerveSign;
        const swerveZ = nx * o.swerveSign;
        const swerveMag = dodge * 2.4;

        // Vertical lift for extra arc variety
        const yLift = dodge * o.swerveY;

        o.mesh.position.set(
          baseX + nx * approach + swerveX * swerveMag,
          baseY + ny * approach + yLift,
          baseZ + nz * approach + swerveZ * swerveMag,
        );

        // Tumble faster during dodge (startled asteroid)
        const spinBoost = 1 + dodge * 4;
        o.mesh.rotation.x = t * 0.9 * spinBoost;
        o.mesh.rotation.y = t * 1.2 * spinBoost;

        // Emissive flare at dodge peak
        o.material.emissiveIntensity = o.baseEmissive + dodge * 1.8;
      }

      // Pulse the fill light
      fillLight.intensity = 0.6 + Math.sin(t * 1.5) * 0.3;

      // Camera nearly still — we want the asteroids to feel like they're
      // moving, not the world. Tiny sway only.
      camera.position.set(
        Math.sin(t * 0.12) * 0.4,
        0.3 + Math.cos(t * 0.18) * 0.2,
        5.8,
      );
      camera.lookAt(0, 0, 0);

      // Slow star drift
      stars.rotation.y = t * 0.015;
    },
    dispose() {
      // Materials + geometries are walked by the caller's scene traversal.
    },
  };
}
