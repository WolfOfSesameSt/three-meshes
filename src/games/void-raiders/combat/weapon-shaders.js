/**
 * Weapon shader pools — cinematic GLSL effects for the mothership turret
 * roster. Each factory returns an object with `fire(...)`, `update(dt)`,
 * `clear()`, and `dispose()` so it slots into TurretSystem the same way
 * the existing laser/projectile pools do.
 *
 * Pools provided:
 *   createBeamShaderPool      — billboarded beam quads with hot-core / glow
 *                               fragment shader. Branches by `style`:
 *                                 "standard"      — point-defense pulse
 *                                 "shield-breaker"— tight magenta cracker
 *                                 "lightning"     — arc-emitter chain bolt
 *                                                   with vertex jitter + forks
 *                                 "railgun"       — extreme-thin white penetrator
 *   createTrailedProjectilePool — projectile bolt + procedural smoke ribbon
 *                                  trail (24-segment shader strip that
 *                                  follows the projectile's recent positions)
 *   createShockwavePool       — expanding spherical fresnel shockwave for
 *                                flak detonations + railgun hits
 *   createChargeUpPool        — muzzle charge-up glow (icosahedron with
 *                                noise + electric arcs) used by railgun
 *   createMuzzleFlashPool     — small additive billboard at every fire
 *
 * All shaders share these conventions:
 *   - additive blending, depthWrite false, frustumCulled false
 *   - per-pool uTime uniform, ticked from update(dt)
 *   - inline GLSL with a tiny hash + value-noise helper at file top
 *   - hot white core + colored glow + soft outer fade
 */

import * as THREE from "three";

// ─── Shared GLSL helpers ─────────────────────────────────────
// 2D hash + value noise + fbm. Inlined into every shader so they don't have
// to share a chunk file. Cheap enough to call ~3 times per fragment.
const NOISE_GLSL = /* glsl */ `
  float vrHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float vrHash3(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  }
  float vrNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = vrHash(i);
    float b = vrHash(i + vec2(1.0, 0.0));
    float c = vrHash(i + vec2(0.0, 1.0));
    float d = vrHash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float vrFbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * vrNoise(p);
      p *= 2.07;
      a *= 0.5;
    }
    return v;
  }
`;

// ─── Beam shader pool ────────────────────────────────────────
//
// Vertex shader builds a billboarded quad strip from `position.x` along the
// beam (0..1) and `position.y` perpendicular (-1..1). For the lightning style
// we additionally jitter the position with a 3D noise sample seeded by uTime
// so the bolt visibly crackles + forks.
//
// Fragment shader paints a hot white core, colored body, and soft outer
// glow, fading over uAge / uLifetime. Style-specific branches add scrolling
// energy texture (standard), three-pulse bursts (shield-breaker), branching
// arcs (lightning), and a chromatic-aberration ring at the impact end
// (railgun).

const BEAM_VERTEX_SHADER = /* glsl */ `
  attribute float aOffset;
  attribute float aAlong;
  uniform vec3 uFrom;
  uniform vec3 uTo;
  uniform float uWidth;
  uniform float uTime;
  uniform float uJitter;   // 0..1 — how much to displace verts (lightning)

  varying float vOffset;
  varying float vAlong;

  ${NOISE_GLSL}

  void main() {
    vOffset = aOffset;
    vAlong = aAlong;

    vec3 dir = uTo - uFrom;
    float beamLen = length(dir);
    vec3 dirN = beamLen > 0.0001 ? dir / beamLen : vec3(0.0, 1.0, 0.0);
    vec3 pos = uFrom + dir * aAlong;

    // Camera-perpendicular widening
    vec3 viewDir = cameraPosition - pos;
    vec3 side = normalize(cross(dirN, viewDir));
    pos += side * aOffset * uWidth;

    // Lightning jitter — perpendicular displacement scaled by sin(distance)
    // so the endpoints stay anchored at the muzzle and impact point. The
    // displacement is a fixed amount in WORLD UNITS (not scaled by uWidth)
    // so wider beams don't compound into screen-covering fog. 1.5m max
    // jitter is plenty visible without overwhelming the camera frustum
    // when the beam is fired close to the player.
    if (uJitter > 0.0) {
      float anchor = sin(aAlong * 3.14159);
      vec3 perp1 = side;
      vec3 perp2 = normalize(cross(dirN, side));
      float n1 = vrNoise(vec2(aAlong * 18.0, uTime * 25.0)) - 0.5;
      float n2 = vrNoise(vec2(aAlong * 14.0 + 7.3, uTime * 22.0 + 3.1)) - 0.5;
      float displace = uJitter * 1.5 * anchor;
      pos += perp1 * n1 * displace;
      pos += perp2 * n2 * displace;
    }

    gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
  }
`;

const BEAM_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uAge;
  uniform float uLifetime;
  uniform vec3 uColor;
  uniform int uStyle;        // 0 standard, 1 shield-breaker, 2 lightning, 3 railgun

  varying float vOffset;
  varying float vAlong;

  ${NOISE_GLSL}

  void main() {
    float t = clamp(uAge / max(uLifetime, 0.0001), 0.0, 1.0);
    float fade = 1.0 - smoothstep(0.0, 1.0, t);

    // Hot core / soft glow falloff. Magnitude varies per style.
    float coreWidth = 0.18;
    float glowWidth = 1.0;
    if (uStyle == 1) { coreWidth = 0.10; glowWidth = 0.8; } // shield-breaker — tight
    if (uStyle == 3) { coreWidth = 0.06; glowWidth = 0.6; } // railgun — razor

    float aOff = abs(vOffset);
    float core = smoothstep(coreWidth, 0.0, aOff);
    float glow = smoothstep(glowWidth, 0.0, aOff);

    // Style-specific body modulation
    float bodyMod = 1.0;
    if (uStyle == 0) {
      // Standard — scrolling energy stripes along the beam length
      float stripes = 0.5 + 0.5 * sin(vAlong * 60.0 - uTime * 40.0);
      bodyMod = 0.7 + 0.3 * stripes;
    } else if (uStyle == 1) {
      // Shield-breaker — hard pulse intensity with a bright leading edge
      float lead = smoothstep(0.0, 0.3, vAlong) * (1.0 - smoothstep(0.7, 1.0, vAlong));
      bodyMod = 0.6 + 0.6 * lead;
    } else if (uStyle == 2) {
      // Lightning — high-frequency flicker + branching forks
      float crackle = vrFbm(vec2(vAlong * 22.0, uTime * 60.0));
      float forks = smoothstep(0.55, 1.0, crackle);
      bodyMod = 0.5 + 1.6 * forks;
      // Add some sub-bolt streaks: squash the glow on the noise field
      glow *= (0.4 + 0.6 * crackle);
    } else if (uStyle == 3) {
      // Railgun — clean blinding line, with a leading flash at impact
      float impactFlash = smoothstep(0.85, 1.0, vAlong) * (1.0 - t * 0.5);
      bodyMod = 1.0 + impactFlash * 3.0;
    }

    float intensity = (core * 1.4 + glow * 0.55) * fade * bodyMod;

    vec3 color = uColor * intensity;
    // Hot white core for every style — pegs the bloom
    color += vec3(1.0) * core * core * fade * (uStyle == 3 ? 1.6 : 0.9);

    float alpha = clamp(intensity * 0.95, 0.0, 1.0);
    gl_FragColor = vec4(color, alpha);
  }
`;

/**
 * Build a quad strip geometry for the beam. Subdivided into N segments
 * along its length so the lightning vertex jitter has somewhere to wiggle.
 */
function _buildBeamGeometry(segments = 24) {
  // Each segment = 2 triangles = 6 verts. We use independent verts (not
  // indexed) for simplicity — 24 segments × 6 verts = 144 verts, fine.
  const positions = new Float32Array(segments * 6 * 3);
  const offsets = new Float32Array(segments * 6);
  const along = new Float32Array(segments * 6);

  let p = 0, o = 0, a = 0;
  for (let i = 0; i < segments; i++) {
    const a0 = i / segments;
    const a1 = (i + 1) / segments;
    // tri 1: (a0,-1) (a1,-1) (a1,+1)
    positions[p++] = 0; positions[p++] = 0; positions[p++] = 0; offsets[o++] = -1; along[a++] = a0;
    positions[p++] = 0; positions[p++] = 0; positions[p++] = 0; offsets[o++] = -1; along[a++] = a1;
    positions[p++] = 0; positions[p++] = 0; positions[p++] = 0; offsets[o++] = 1; along[a++] = a1;
    // tri 2: (a0,-1) (a1,+1) (a0,+1)
    positions[p++] = 0; positions[p++] = 0; positions[p++] = 0; offsets[o++] = -1; along[a++] = a0;
    positions[p++] = 0; positions[p++] = 0; positions[p++] = 0; offsets[o++] = 1; along[a++] = a1;
    positions[p++] = 0; positions[p++] = 0; positions[p++] = 0; offsets[o++] = 1; along[a++] = a0;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("aOffset", new THREE.Float32BufferAttribute(offsets, 1));
  geo.setAttribute("aAlong", new THREE.Float32BufferAttribute(along, 1));
  return geo;
}

const STYLE_TO_INT = {
  standard: 0,
  "shield-breaker": 1,
  lightning: 2,
  railgun: 3,
};

/**
 * Create a pool of beam shader meshes. Each beam carries its own ShaderMaterial
 * (per-instance uniforms — color/style/from/to vary per shot). Geometry is shared.
 */
export function createBeamShaderPool(scene, opts = {}) {
  const POOL_SIZE = opts.poolSize ?? 30;
  const SEGMENTS = opts.segments ?? 24;
  const geo = _buildBeamGeometry(SEGMENTS);

  const beams = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: BEAM_VERTEX_SHADER,
      fragmentShader: BEAM_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uAge: { value: 0 },
        uLifetime: { value: 0.18 },
        uColor: { value: new THREE.Color(0x66ffff) },
        uFrom: { value: new THREE.Vector3() },
        uTo: { value: new THREE.Vector3() },
        uWidth: { value: 0.2 },
        uJitter: { value: 0 },
        uStyle: { value: 0 },
      },
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 1500;
    scene.add(mesh);
    beams.push({ mesh, mat, age: 0, lifetime: 0 });
  }

  let elapsed = 0;
  let totalFires = 0;

  return {
    /**
     * Fire one beam from `from` to `to`.
     * @param {THREE.Vector3} from
     * @param {THREE.Vector3} to
     * @param {object} cfg — { color, width, lifetime, style }
     */
    fire(from, to, cfg = {}) {
      let beam = null;
      for (const b of beams) if (b.lifetime <= 0) { beam = b; break; }
      if (!beam) return;
      totalFires++;

      const style = cfg.style || "standard";
      const styleInt = STYLE_TO_INT[style] ?? 0;
      const u = beam.mat.uniforms;
      u.uFrom.value.copy(from);
      u.uTo.value.copy(to);
      u.uColor.value.setHex(cfg.color ?? 0x66ffff);
      u.uWidth.value = cfg.width ?? 0.2;
      u.uLifetime.value = cfg.lifetime ?? 0.18;
      u.uAge.value = 0;
      u.uStyle.value = styleInt;
      u.uJitter.value = style === "lightning" ? 1.0 : 0.0;

      beam.lifetime = u.uLifetime.value;
      beam.age = 0;
      beam.mesh.visible = true;
    },

    update(dt) {
      elapsed += dt;
      for (const b of beams) {
        if (b.lifetime <= 0) continue;
        b.age += dt;
        b.mat.uniforms.uTime.value = elapsed;
        b.mat.uniforms.uAge.value = b.age;
        if (b.age >= b.lifetime) {
          b.lifetime = 0;
          b.mesh.visible = false;
        }
      }
    },

    clear() {
      for (const b of beams) {
        b.lifetime = 0;
        b.age = 0;
        b.mesh.visible = false;
      }
    },

    // Diagnostic — total alive count + total fires since pool creation
    getStats() {
      return {
        poolSize: beams.length,
        activeNow: beams.filter(b => b.lifetime > 0).length,
        totalFires: totalFires,
      };
    },

    dispose() {
      for (const b of beams) {
        scene.remove(b.mesh);
        b.mat.dispose();
      }
      geo.dispose();
    },
  };
}

// ─── Trailed projectile pool ─────────────────────────────────
//
// Each live projectile owns:
//   1. A bolt mesh — additive sphere with a hot core fragment shader
//   2. A trail mesh — long quad strip whose vertices are updated each frame
//      to follow the projectile's recent world positions. Fragment shader
//      paints a smoke / exhaust gradient that fades along the strip length.
//
// The trail uses the cinematic missile contrail recipe: noise-modulated
// alpha along an FBM ribbon so it reads as turbulent smoke instead of a
// hard line. For non-missile bolts (flak shells) the same shader produces
// a hot ember tail by tinting the noise to the warm projectile color.

const BOLT_VERTEX_SHADER = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BOLT_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uColor;
  uniform float uTime;
  uniform float uPulseFreq;

  varying vec3 vPos;

  ${NOISE_GLSL}

  void main() {
    float r = length(vPos);
    // Hot core, soft outer falloff
    float core = smoothstep(0.6, 0.0, r);
    float glow = smoothstep(1.0, 0.2, r);
    float pulse = 0.85 + 0.15 * sin(uTime * uPulseFreq);
    // Subtle surface noise for shimmer
    float n = vrFbm(vec2(vPos.x * 4.0 + uTime * 2.0, vPos.y * 4.0));
    float intensity = (core * 1.5 + glow * 0.4 + n * 0.1) * pulse;
    vec3 color = uColor * intensity;
    color += vec3(1.0) * core * core * 0.7;
    gl_FragColor = vec4(color, clamp(intensity, 0.0, 1.0));
  }
`;

const TRAIL_VERTEX_SHADER = /* glsl */ `
  attribute float aT;     // 0..1 along the trail (0 = head, 1 = tail)
  attribute float aSide;  // -1 / +1 ribbon side
  varying float vT;
  varying float vSide;
  void main() {
    vT = aT;
    vSide = aSide;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TRAIL_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uColor;
  uniform float uTime;
  uniform float uSmoke;     // 0..1 — how much "puffy noise" to mix in (1 for missiles)

  varying float vT;
  varying float vSide;

  ${NOISE_GLSL}

  void main() {
    // Fade head→tail
    float life = 1.0 - vT;
    // Side falloff so the ribbon edges feather out
    float edge = 1.0 - abs(vSide);

    // FBM puff field — scrolls back along the trail
    float puff = vrFbm(vec2(vT * 8.0, vSide * 2.0 + uTime * 0.6));
    float smokeAlpha = mix(1.0, puff * puff * 1.6, uSmoke);

    float a = life * life * edge * smokeAlpha;
    // Brighter near the head, smoke-grey toward the tail when uSmoke > 0
    vec3 hot = uColor * (1.5 + 0.5 * smoothstep(0.0, 0.3, life));
    vec3 cold = mix(uColor * 0.4, vec3(0.45, 0.45, 0.5), uSmoke);
    vec3 col = mix(cold, hot, life);
    gl_FragColor = vec4(col, a * 0.9);
  }
`;

const TRAIL_SEGMENTS = 18;

/**
 * Build the empty trail ribbon geometry. Each segment is a quad: head and
 * tail vertex pairs side-by-side. Positions are zero — they get rewritten
 * every frame from the projectile history.
 */
function _buildTrailGeometry() {
  const verts = TRAIL_SEGMENTS * 2; // 2 verts per segment (left/right)
  const positions = new Float32Array(verts * 3);
  const aT = new Float32Array(verts);
  const aSide = new Float32Array(verts);
  const indices = [];
  for (let i = 0; i < TRAIL_SEGMENTS; i++) {
    const t = i / (TRAIL_SEGMENTS - 1);
    aT[i * 2] = t;
    aT[i * 2 + 1] = t;
    aSide[i * 2] = -1;
    aSide[i * 2 + 1] = 1;
  }
  for (let i = 0; i < TRAIL_SEGMENTS - 1; i++) {
    const a = i * 2;
    const b = i * 2 + 1;
    const c = (i + 1) * 2;
    const d = (i + 1) * 2 + 1;
    indices.push(a, b, d, a, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("aT", new THREE.Float32BufferAttribute(aT, 1));
  geo.setAttribute("aSide", new THREE.Float32BufferAttribute(aSide, 1));
  if (geo.setIndex) {
    geo.setIndex(indices);
  }
  return geo;
}

/**
 * Pool of glowing projectile bolts with shader-based contrail/exhaust ribbons.
 * The pool wraps the existing physics-projectile pool semantics — it returns
 * the same kind of object (with `alive`, `x/y/z`, `vx/vy/vz`, target, etc.)
 * so TurretSystem doesn't have to know there's any visual difference.
 *
 * Per-fire `cfg` extends the original projectile cfg with:
 *   trailColor   — hex, defaults to projectileColor
 *   trailWidth   — meters, defaults to size * 0.6
 *   trailLength  — meters, defaults to 12 (controls how spread the history is)
 *   smokey       — 0..1, 1 = full puffy contrail (missiles), 0 = thin ember (flak)
 *   pulseFreq    — bolt-shader pulse rate, defaults 8
 */
export function createTrailedProjectilePool(scene, opts = {}) {
  const POOL_SIZE = opts.poolSize ?? 16;
  const COLOR = opts.color ?? 0xffaa44;
  const SIZE = opts.size ?? 1.0;

  const boltGeo = new THREE.SphereGeometry(SIZE, 12, 8);
  const trailGeoTemplate = _buildTrailGeometry();

  const projectiles = [];
  const _lookTarget = new THREE.Vector3();

  for (let i = 0; i < POOL_SIZE; i++) {
    const boltMat = new THREE.ShaderMaterial({
      vertexShader: BOLT_VERTEX_SHADER,
      fragmentShader: BOLT_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color(COLOR) },
        uTime: { value: 0 },
        uPulseFreq: { value: 8.0 },
      },
    });
    const boltMesh = new THREE.Mesh(boltGeo, boltMat);
    boltMesh.visible = false;
    boltMesh.frustumCulled = false;
    boltMesh.renderOrder = 1500;
    scene.add(boltMesh);

    // Each projectile gets its own trail geometry copy so positions are
    // independent. The buffer is dynamic — we rewrite it every frame.
    const trailGeo = new THREE.BufferGeometry();
    const verts = TRAIL_SEGMENTS * 2;
    const trailPositions = new Float32Array(verts * 3);
    const trailAT = new Float32Array(verts);
    const trailASide = new Float32Array(verts);
    for (let j = 0; j < TRAIL_SEGMENTS; j++) {
      const t = j / (TRAIL_SEGMENTS - 1);
      trailAT[j * 2] = t;
      trailAT[j * 2 + 1] = t;
      trailASide[j * 2] = -1;
      trailASide[j * 2 + 1] = 1;
    }
    const trailIndices = [];
    for (let j = 0; j < TRAIL_SEGMENTS - 1; j++) {
      const a = j * 2;
      const b = j * 2 + 1;
      const c = (j + 1) * 2;
      const d = (j + 1) * 2 + 1;
      trailIndices.push(a, b, d, a, d, c);
    }
    const posAttr = new THREE.Float32BufferAttribute(trailPositions, 3);
    if (posAttr) posAttr.needsUpdate = true;
    trailGeo.setAttribute("position", posAttr);
    trailGeo.setAttribute("aT", new THREE.Float32BufferAttribute(trailAT, 1));
    trailGeo.setAttribute("aSide", new THREE.Float32BufferAttribute(trailASide, 1));
    if (trailGeo.setIndex) trailGeo.setIndex(trailIndices);

    const trailMat = new THREE.ShaderMaterial({
      vertexShader: TRAIL_VERTEX_SHADER,
      fragmentShader: TRAIL_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color(COLOR) },
        uTime: { value: 0 },
        uSmoke: { value: 1.0 },
      },
    });
    const trailMesh = new THREE.Mesh(trailGeo, trailMat);
    trailMesh.visible = false;
    trailMesh.frustumCulled = false;
    trailMesh.renderOrder = 1499;
    scene.add(trailMesh);

    projectiles.push({
      // Visual handles
      boltMesh, boltMat, trailMesh, trailMat,
      trailPositions, posAttr,
      // History buffer for the trail vertices — TRAIL_SEGMENTS world positions
      history: new Float32Array(TRAIL_SEGMENTS * 3),
      historyInited: false,
      trailWidth: 0.6,
      // Physics state — same shape as the legacy projectile pool entries so
      // TurretSystem can interact with it identically.
      alive: false,
      x: 0, y: 0, z: 0,
      vx: 0, vy: 0, vz: 0,
      target: null,
      damage: 0,
      aoeRadius: 0,
      lifetime: 0,
      onImpact: null,
      homing: null,
      speed: 0,
      flakArmDist: 0,
      flakDetonationRange: 0,
      flakArmed: false,
      getFlakEnemies: null,
      distTraveled: 0,
    });
  }

  let elapsed = 0;
  let totalFires = 0;
  const _toTarget = new THREE.Vector3();
  const _steerVec = new THREE.Vector3();
  const _newVel = new THREE.Vector3();

  // Update the trail geometry from the projectile's history. Builds a ribbon
  // by walking the history points and offsetting each pair side-to-side
  // perpendicular to the local segment direction (camera-perpendicular would
  // be ideal but a fixed up-axis cross is good enough at the trail's scale).
  function _writeTrailGeometry(p) {
    const hist = p.history;
    const positions = p.trailPositions;
    const w = p.trailWidth;
    for (let i = 0; i < TRAIL_SEGMENTS; i++) {
      const ix = i * 3;
      const px = hist[ix];
      const py = hist[ix + 1];
      const pz = hist[ix + 2];
      // Direction = next history point − this one (or velocity for the head)
      let dx, dy, dz;
      if (i < TRAIL_SEGMENTS - 1) {
        dx = hist[ix + 3] - px;
        dy = hist[ix + 4] - py;
        dz = hist[ix + 5] - pz;
      } else {
        dx = px - hist[ix - 3];
        dy = py - hist[ix - 2];
        dz = pz - hist[ix - 1];
      }
      // Side = cross(dir, world up)
      let sx = dy * 0 - dz * 1;
      let sy = dz * 0 - dx * 0;
      let sz = dx * 1 - dy * 0;
      // If side is near-zero (vertical motion) flip to a different up axis
      const sLen = Math.hypot(sx, sy, sz);
      if (sLen < 0.0001) {
        sx = 1; sy = 0; sz = 0;
      } else {
        sx /= sLen; sy /= sLen; sz /= sLen;
      }
      const vix = i * 6;
      positions[vix]     = px - sx * w;
      positions[vix + 1] = py - sy * w;
      positions[vix + 2] = pz - sz * w;
      positions[vix + 3] = px + sx * w;
      positions[vix + 4] = py + sy * w;
      positions[vix + 5] = pz + sz * w;
    }
    if (p.posAttr) p.posAttr.needsUpdate = true;
  }

  return {
    /**
     * Fire a projectile. Same arg shape as the legacy createProjectilePool —
     * cfg may also include trailColor / trailWidth / smokey / pulseFreq.
     */
    fire(from, dir, cfg) {
      let p = null;
      for (const proj of projectiles) if (!proj.alive) { p = proj; break; }
      if (!p) return null;
      totalFires++;

      p.alive = true;
      p.x = from.x; p.y = from.y; p.z = from.z;
      p.vx = dir.x * cfg.speed;
      p.vy = dir.y * cfg.speed;
      p.vz = dir.z * cfg.speed;
      p.speed = cfg.speed;
      p.target = cfg.target || null;
      p.damage = cfg.damage || 0;
      p.aoeRadius = cfg.aoeRadius || 0;
      p.lifetime = cfg.lifetime || 4.0;
      p.onImpact = cfg.onImpact || null;
      p.homing = cfg.homing || null;
      p.flakArmDist = cfg.flakArmingDistance || 0;
      p.flakDetonationRange = cfg.flakDetonationRange || 0;
      p.flakArmed = false;
      p.getFlakEnemies = cfg.getFlakEnemies || null;
      p.distTraveled = 0;

      // Visual cfg
      const trailColor = cfg.trailColor ?? cfg.color ?? COLOR;
      p.trailWidth = cfg.trailWidth ?? SIZE * 0.6;
      p.boltMat.uniforms.uColor.value.setHex(cfg.color ?? COLOR);
      p.boltMat.uniforms.uPulseFreq.value = cfg.pulseFreq ?? 8.0;
      p.trailMat.uniforms.uColor.value.setHex(trailColor);
      p.trailMat.uniforms.uSmoke.value = cfg.smokey ?? 1.0;
      p.boltMesh.visible = true;
      p.trailMesh.visible = true;
      p.boltMesh.position.set(from.x, from.y, from.z);

      // Seed the history buffer with the spawn point so the trail doesn't
      // start with a giant snake from origin.
      for (let i = 0; i < TRAIL_SEGMENTS; i++) {
        p.history[i * 3]     = from.x;
        p.history[i * 3 + 1] = from.y;
        p.history[i * 3 + 2] = from.z;
      }
      p.historyInited = true;
      _writeTrailGeometry(p);

      _lookTarget.set(from.x + dir.x, from.y + dir.y, from.z + dir.z);
      if (p.boltMesh.lookAt) p.boltMesh.lookAt(_lookTarget);

      return p;
    },

    update(dt) {
      elapsed += dt;
      for (const p of projectiles) {
        if (!p.alive) continue;

        // ── PID homing (mirrors createProjectilePool) ──
        if (p.homing && p.target?.position && (!p.target.stats || p.target.stats.hull > 0)) {
          const tp = p.target.position;
          _toTarget.set(tp.x - p.x, tp.y - p.y, tp.z - p.z);
          const distToTarget = _toTarget.length();
          if (distToTarget > 0.001) _toTarget.multiplyScalar(1 / distToTarget);
          _steerVec.copy(_toTarget).multiplyScalar(p.homing.kp * p.speed);
          const tv = p.target.velocity;
          if (tv) {
            _steerVec.x += (tv.x ?? 0) * p.homing.kd;
            _steerVec.y += (tv.y ?? 0) * p.homing.kd;
            _steerVec.z += (tv.z ?? 0) * p.homing.kd;
          }
          _newVel.set(p.vx + _steerVec.x * dt, p.vy + _steerVec.y * dt, p.vz + _steerVec.z * dt);
          const curLen = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz);
          const newLen = _newVel.length();
          if (curLen > 0.001 && newLen > 0.001) {
            let cosA = (p.vx * _newVel.x + p.vy * _newVel.y + p.vz * _newVel.z) / (curLen * newLen);
            cosA = Math.max(-1, Math.min(1, cosA));
            const angle = Math.acos(cosA);
            const maxAngle = p.homing.maxTurn * dt;
            if (angle > maxAngle && angle > 0) {
              const t = maxAngle / angle;
              _newVel.set(
                p.vx + (_newVel.x - p.vx) * t,
                p.vy + (_newVel.y - p.vy) * t,
                p.vz + (_newVel.z - p.vz) * t,
              );
            }
            const finalLen = _newVel.length();
            if (finalLen > 0.001) {
              const k = p.speed / finalLen;
              p.vx = _newVel.x * k;
              p.vy = _newVel.y * k;
              p.vz = _newVel.z * k;
            }
          }
        }

        // Move
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        const stepLen = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz) * dt;
        p.distTraveled += stepLen;
        p.lifetime -= dt;

        // Push the new head into history (shift back, write [0])
        const h = p.history;
        for (let i = TRAIL_SEGMENTS - 1; i > 0; i--) {
          h[i * 3]     = h[(i - 1) * 3];
          h[i * 3 + 1] = h[(i - 1) * 3 + 1];
          h[i * 3 + 2] = h[(i - 1) * 3 + 2];
        }
        h[0] = p.x; h[1] = p.y; h[2] = p.z;
        _writeTrailGeometry(p);

        if (p.boltMesh.position && p.boltMesh.position.set) {
          p.boltMesh.position.set(p.x, p.y, p.z);
        }
        p.boltMat.uniforms.uTime.value = elapsed;
        p.trailMat.uniforms.uTime.value = elapsed;
        // Reorient the bolt for the trail-direction shimmer
        if (p.boltMesh.lookAt) {
          _lookTarget.set(p.x + p.vx, p.y + p.vy, p.z + p.vz);
          p.boltMesh.lookAt(_lookTarget);
        }

        // Hit detection — same as the legacy projectile pool
        let hit = false;
        if (p.flakArmDist > 0 && p.flakDetonationRange > 0) {
          if (!p.flakArmed && p.distTraveled >= p.flakArmDist) p.flakArmed = true;
          if (p.flakArmed && p.getFlakEnemies) {
            const flakList = p.getFlakEnemies();
            const r = p.flakDetonationRange;
            const r2 = r * r;
            if (flakList) {
              for (const e of flakList) {
                if (!e || !e.position) continue;
                if (e.stats && e.stats.hull <= 0) continue;
                const dx = e.position.x - p.x;
                const dy = e.position.y - p.y;
                const dz = e.position.z - p.z;
                if (dx * dx + dy * dy + dz * dz < r2) { hit = true; break; }
              }
            }
          }
        }
        if (!hit && p.target && p.target.position && (!p.target.stats || p.target.stats.hull > 0)) {
          const dx = p.target.position.x - p.x;
          const dy = p.target.position.y - p.y;
          const dz = p.target.position.z - p.z;
          const distSq = dx * dx + dy * dy + dz * dz;
          // Stop the bolt at the shield SURFACE if the target has a shield
          // bubble — otherwise the visible mesh keeps flying through the
          // ripple and disappears inside the hull. shieldRadius lives on
          // the mothership and on shielded enemies; fall back to a small
          // proximity radius for unshielded targets.
          let proxRadius;
          if (p.target.shieldRadius && p.target.stats?.shields > 0) {
            // Bolt impacts when it crosses the shield bubble surface +
            // a small fudge so the impact reads as touching the shield.
            proxRadius = p.target.shieldRadius + 1.0;
          } else {
            proxRadius = Math.max(p.aoeRadius * 0.4, 8);
          }
          if (distSq < proxRadius * proxRadius) hit = true;
        }
        if (p.lifetime <= 0) hit = true;

        if (hit) {
          if (p.onImpact) p.onImpact({ x: p.x, y: p.y, z: p.z });
          p.alive = false;
          p.boltMesh.visible = false;
          p.trailMesh.visible = false;
        }
      }
    },

    clear() {
      for (const p of projectiles) {
        p.alive = false;
        p.boltMesh.visible = false;
        p.trailMesh.visible = false;
      }
    },

    getStats() {
      return {
        poolSize: projectiles.length,
        activeNow: projectiles.filter(p => p.alive).length,
        totalFires: totalFires,
      };
    },

    dispose() {
      for (const p of projectiles) {
        scene.remove(p.boltMesh);
        scene.remove(p.trailMesh);
        p.boltMat.dispose();
        p.trailMat.dispose();
        if (p.trailMesh.geometry && p.trailMesh.geometry.dispose) p.trailMesh.geometry.dispose();
      }
      boltGeo.dispose();
      if (trailGeoTemplate.dispose) trailGeoTemplate.dispose();
    },
  };
}

// ─── Shockwave pool ──────────────────────────────────────────
//
// Expanding spherical fresnel shockwave used for flak detonations and
// railgun impacts. Vertex shader scales a unit sphere outward over the
// effect's lifetime; fragment uses fresnel-style edge brightness with a
// rim glow that thins out as the radius grows.

const SHOCKWAVE_VERTEX_SHADER = /* glsl */ `
  uniform float uRadius;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vec3 scaled = position * uRadius;
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(scaled, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const SHOCKWAVE_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uAge;
  uniform float uLifetime;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    float t = clamp(uAge / max(uLifetime, 0.0001), 0.0, 1.0);
    // View vector for fresnel
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fres = 1.0 - max(dot(normalize(vNormal), viewDir), 0.0);
    fres = pow(fres, 2.5);
    // Quick rise then long fade
    float energy = (1.0 - t) * (1.0 - t);
    // Sharp leading edge: fres rim brightens at the start, softens out
    float rim = mix(fres * 2.0, fres * 0.6, t);
    float intensity = rim * energy;
    vec3 color = uColor * intensity * 1.6;
    color += vec3(1.0) * pow(rim, 4.0) * energy * 0.8;
    gl_FragColor = vec4(color, intensity);
  }
`;

export function createShockwavePool(scene, opts = {}) {
  const POOL_SIZE = opts.poolSize ?? 12;
  const geo = new THREE.SphereGeometry(1, 24, 16);

  const waves = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: SHOCKWAVE_VERTEX_SHADER,
      fragmentShader: SHOCKWAVE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: new THREE.Color(0xffaa44) },
        uRadius: { value: 0 },
        uAge: { value: 0 },
        uLifetime: { value: 0.5 },
      },
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 1450;
    scene.add(mesh);
    waves.push({
      mesh, mat, age: 0, lifetime: 0,
      maxRadius: 0,
    });
  }

  return {
    /**
     * Spawn a shockwave at `pos`.
     * @param {object} pos — { x, y, z }
     * @param {object} cfg — { color, radius, duration }
     */
    fire(pos, cfg = {}) {
      let w = null;
      for (const wave of waves) if (wave.lifetime <= 0) { w = wave; break; }
      if (!w) return;

      w.lifetime = cfg.duration ?? 0.5;
      w.age = 0;
      w.maxRadius = cfg.radius ?? 20;
      w.mat.uniforms.uColor.value.setHex(cfg.color ?? 0xffaa44);
      w.mat.uniforms.uLifetime.value = w.lifetime;
      w.mat.uniforms.uAge.value = 0;
      w.mat.uniforms.uRadius.value = 0.1;
      if (w.mesh.position && w.mesh.position.set) {
        w.mesh.position.set(pos.x, pos.y, pos.z);
      }
      w.mesh.visible = true;
    },

    update(dt) {
      for (const w of waves) {
        if (w.lifetime <= 0) continue;
        w.age += dt;
        const t = Math.min(1, w.age / w.lifetime);
        // Expand with an ease-out curve
        const eased = 1 - (1 - t) * (1 - t);
        w.mat.uniforms.uRadius.value = w.maxRadius * eased;
        w.mat.uniforms.uAge.value = w.age;
        if (w.age >= w.lifetime) {
          w.lifetime = 0;
          w.mesh.visible = false;
        }
      }
    },

    clear() {
      for (const w of waves) {
        w.lifetime = 0;
        w.age = 0;
        w.mesh.visible = false;
      }
    },

    dispose() {
      for (const w of waves) {
        scene.remove(w.mesh);
        w.mat.dispose();
      }
      geo.dispose();
    },
  };
}

// ─── Charge-up pool ──────────────────────────────────────────
//
// Pre-fire muzzle glow used by the heavy railgun. An icosahedron with a
// noise-scrolled fragment that builds up over the charge time, plus an
// additive sphere "halo". The lifetime is the full charge time, and the
// effect should be re-fired each frame at the muzzle world position to
// follow the turret as it tracks.

const CHARGE_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uPulse;
  varying vec3 vPos;
  varying vec3 vNormal;
  void main() {
    vPos = position;
    vNormal = normalize(normalMatrix * normal);
    // Slight pulse — verts breathe in and out as charge builds
    vec3 displaced = position * (1.0 + sin(uTime * 18.0 + position.x * 4.0) * 0.06 * uPulse);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const CHARGE_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uCharge;   // 0..1 charge progress
  varying vec3 vPos;
  varying vec3 vNormal;

  ${NOISE_GLSL}

  void main() {
    // Noise field on the surface — feels like crawling electricity
    float n = vrFbm(vec2(vPos.x * 6.0 + uTime * 4.0, vPos.y * 6.0 - uTime * 3.0));
    float arcs = smoothstep(0.45, 0.85, n);
    float bright = 0.3 + 0.7 * uCharge;
    float intensity = (0.4 + arcs * 1.6) * bright;
    vec3 col = uColor * intensity;
    col += vec3(1.0) * arcs * arcs * uCharge * 0.8;
    float alpha = clamp(intensity, 0.0, 1.0) * uCharge;
    gl_FragColor = vec4(col, alpha);
  }
`;

export function createChargeUpPool(scene, opts = {}) {
  const POOL_SIZE = opts.poolSize ?? 6;
  const geo = new THREE.SphereGeometry(1, 16, 12);

  const charges = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: CHARGE_VERTEX_SHADER,
      fragmentShader: CHARGE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0xeeeeff) },
        uCharge: { value: 0 },
        uPulse: { value: 1 },
      },
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 1480;
    scene.add(mesh);
    charges.push({ mesh, mat, age: 0, lifetime: 0, scale: 1, owner: null });
  }

  let elapsed = 0;

  return {
    /**
     * Begin or refresh a charge-up at the given position. The owner key lets
     * the same turret keep updating its existing charge each frame instead
     * of spawning a new one — pass turret reference or any unique key.
     */
    fire(pos, cfg = {}) {
      const owner = cfg.owner ?? null;
      // Reuse the existing charge for this owner if one is already running
      let c = null;
      if (owner) {
        for (const ch of charges) if (ch.lifetime > 0 && ch.owner === owner) { c = ch; break; }
      }
      if (!c) {
        for (const ch of charges) if (ch.lifetime <= 0) { c = ch; break; }
      }
      if (!c) return;

      c.lifetime = cfg.duration ?? 0.4;
      c.age = 0;
      c.owner = owner;
      c.scale = cfg.size ?? 1.5;
      c.mat.uniforms.uColor.value.setHex(cfg.color ?? 0xeeeeff);
      if (c.mesh.position && c.mesh.position.set) {
        c.mesh.position.set(pos.x, pos.y, pos.z);
      }
      if (c.mesh.scale && c.mesh.scale.setScalar) c.mesh.scale.setScalar(0.01);
      c.mesh.visible = true;
    },

    /**
     * Update a charge's position to follow its owner — call this each frame
     * while the charge is active so the glow tracks the moving muzzle.
     */
    track(owner, pos) {
      for (const ch of charges) {
        if (ch.lifetime > 0 && ch.owner === owner) {
          if (ch.mesh.position && ch.mesh.position.set) {
            ch.mesh.position.set(pos.x, pos.y, pos.z);
          }
          return;
        }
      }
    },

    /** Cancel an in-progress charge by owner (e.g. when target is lost). */
    cancel(owner) {
      for (const ch of charges) {
        if (ch.lifetime > 0 && ch.owner === owner) {
          ch.lifetime = 0;
          ch.mesh.visible = false;
          ch.owner = null;
        }
      }
    },

    update(dt) {
      elapsed += dt;
      for (const c of charges) {
        if (c.lifetime <= 0) continue;
        c.age += dt;
        const t = Math.min(1, c.age / c.lifetime);
        // Charge builds quickly, fully ramps near the end
        const charge = t * t;
        c.mat.uniforms.uTime.value = elapsed;
        c.mat.uniforms.uCharge.value = charge;
        // Scale grows from 0 to full
        if (c.mesh.scale && c.mesh.scale.setScalar) c.mesh.scale.setScalar(c.scale * (0.4 + 0.6 * charge));
        if (c.age >= c.lifetime) {
          c.lifetime = 0;
          c.mesh.visible = false;
          c.owner = null;
        }
      }
    },

    clear() {
      for (const c of charges) {
        c.lifetime = 0;
        c.age = 0;
        c.mesh.visible = false;
        c.owner = null;
      }
    },

    dispose() {
      for (const c of charges) {
        scene.remove(c.mesh);
        c.mat.dispose();
      }
      geo.dispose();
    },
  };
}

// ─── Muzzle flash pool ───────────────────────────────────────
//
// Tiny additive billboard at the muzzle on every shot. Uses the bolt
// fragment shader for a hot-core look but on a flat sphere that stays
// camera-facing via lookAt(camera). Lifetime ~0.08s.

export function createMuzzleFlashPool(scene, opts = {}) {
  const POOL_SIZE = opts.poolSize ?? 20;
  const geo = new THREE.SphereGeometry(1, 8, 6);

  const flashes = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: BOLT_VERTEX_SHADER,
      fragmentShader: BOLT_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color(0xffffff) },
        uTime: { value: 0 },
        uPulseFreq: { value: 30 },
      },
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 1490;
    scene.add(mesh);
    flashes.push({ mesh, mat, age: 0, lifetime: 0, scale: 1 });
  }

  let elapsed = 0;

  return {
    /**
     * Spawn a muzzle flash at the given world pos.
     * @param {THREE.Vector3|object} pos
     * @param {object} cfg — { color, size, duration }
     */
    fire(pos, cfg = {}) {
      let f = null;
      for (const flash of flashes) if (flash.lifetime <= 0) { f = flash; break; }
      if (!f) return;
      f.lifetime = cfg.duration ?? 0.1;
      f.age = 0;
      f.scale = cfg.size ?? 1.0;
      f.mat.uniforms.uColor.value.setHex(cfg.color ?? 0xffffff);
      if (f.mesh.position && f.mesh.position.set) {
        f.mesh.position.set(pos.x, pos.y, pos.z);
      }
      if (f.mesh.scale && f.mesh.scale.setScalar) f.mesh.scale.setScalar(f.scale);
      f.mesh.visible = true;
    },

    update(dt) {
      elapsed += dt;
      for (const f of flashes) {
        if (f.lifetime <= 0) continue;
        f.age += dt;
        const t = Math.min(1, f.age / f.lifetime);
        // Quick expand then fast fade
        const grow = 1 + t * 1.5;
        if (f.mesh.scale && f.mesh.scale.setScalar) f.mesh.scale.setScalar(f.scale * grow);
        f.mat.uniforms.uTime.value = elapsed;
        if (f.age >= f.lifetime) {
          f.lifetime = 0;
          f.mesh.visible = false;
        }
      }
    },

    clear() {
      for (const f of flashes) {
        f.lifetime = 0;
        f.age = 0;
        f.mesh.visible = false;
      }
    },

    dispose() {
      for (const f of flashes) {
        scene.remove(f.mesh);
        f.mat.dispose();
      }
      geo.dispose();
    },
  };
}
