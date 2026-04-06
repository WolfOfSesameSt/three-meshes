/**
 * Procedural sky sphere for Void Raiders realms.
 *
 * Renders a large inverted sphere with a fragment shader that creates
 * biome-specific skies: star fields, suns, nebulae, planets, aurora.
 * Biome index (0-2) switches between Alien Violet, Crimson Waste,
 * and Frozen Depths themes.
 */

import * as THREE from "three";

const vertexShader = /* glsl */ `
  varying vec3 vWorldDir;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldDir = normalize(worldPos.xyz - cameraPosition);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uBiome;   // 0 = Alien Violet, 1 = Crimson Waste, 2 = Frozen Depths
  uniform vec3 uSunDir;   // direction toward the primary sun

  varying vec3 vWorldDir;

  // ─── Noise Utilities ──────────────────────────────────────────

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float hash3(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
  }

  float noise2d(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float noise3d(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x),
          mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x),
          mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
      f.z
    );
  }

  float fbm(vec2 p, int octaves) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 3; i++) {
      if (i >= octaves) break;
      value += amplitude * noise2d(p);
      p *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  float fbm3(vec3 p, int octaves) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 3; i++) {
      if (i >= octaves) break;
      value += amplitude * noise3d(p);
      p *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  // ─── Star Field ───────────────────────────────────────────────

  float stars(vec3 dir, float density, float brightness) {
    // Tile the sky into cells and place a star in each
    vec3 p = dir * 300.0;
    vec3 cell = floor(p);
    vec3 local = fract(p) - 0.5;

    float star = 0.0;
    // Check only the current cell (saves 26 iterations per pixel)
    float rng = hash3(cell);
    if (rng < density) {
      vec3 starPos = vec3(
        hash3(cell + 100.0) - 0.5,
        hash3(cell + 200.0) - 0.5,
        hash3(cell + 300.0) - 0.5
      ) * 0.8;

      float dist = length(local - starPos);
      float size = 0.02 + hash3(cell + 400.0) * 0.03;
      float glow = smoothstep(size, 0.0, dist);

      // Subtle twinkle
      float twinkle = 0.7 + 0.3 * sin(uTime * (1.0 + hash3(cell + 500.0) * 3.0) + rng * 6.28);
      star = glow * brightness * twinkle;
    }
    return star;
  }

  // ─── Sun Disc ─────────────────────────────────────────────────

  vec3 sunDisc(vec3 dir, vec3 sunPos, float radius, float glowRadius, vec3 color, float intensity) {
    float d = acos(clamp(dot(dir, normalize(sunPos)), -1.0, 1.0));

    // Hard disc
    float disc = smoothstep(radius, radius * 0.7, d);

    // Soft glow
    float glow = exp(-d * d / (glowRadius * glowRadius)) * 0.5;

    return color * (disc + glow) * intensity;
  }

  // ─── Ringed Planet ────────────────────────────────────────────

  vec3 ringedPlanet(vec3 dir, vec3 planetDir, float radius, vec3 planetColor) {
    float d = acos(clamp(dot(dir, normalize(planetDir)), -1.0, 1.0));

    // Planet disc
    float disc = smoothstep(radius, radius * 0.85, d);
    vec3 color = planetColor * disc;

    // Shading on the planet surface
    float shade = 0.4 + 0.6 * clamp(dot(normalize(planetDir), uSunDir), 0.0, 1.0);
    color *= shade;

    // Ring system — horizontal band
    // Project direction onto the ring plane (perpendicular to planet's "up")
    vec3 up = vec3(0.1, 0.95, 0.05);
    vec3 toDir = normalize(dir - normalize(planetDir) * dot(dir, normalize(planetDir)));
    float ringAngle = abs(dot(dir - normalize(planetDir) * dot(dir, normalize(planetDir)), up));
    float ringDist = d;

    // Rings: visible between 1.2x and 2.2x planet radius, thin band
    if (ringDist > radius * 1.1 && ringDist < radius * 2.5 && disc < 0.01) {
      float ringWidth = abs(dot(normalize(dir - normalize(planetDir) * dot(dir, normalize(planetDir))), up));
      float ringMask = smoothstep(0.15, 0.02, ringWidth);
      float ringBands = smoothstep(0.3, 0.6, sin(ringDist / radius * 20.0) * 0.5 + 0.5);
      float ringFade = smoothstep(radius * 2.5, radius * 1.5, ringDist);
      color += planetColor * 0.6 * ringMask * ringBands * ringFade * shade;
    }

    return color;
  }

  // ─── Biome 0: Alien Violet ────────────────────────────────────

  vec3 alienVioletSky(vec3 dir) {
    float up = dir.y;

    // Base gradient: deep purple at zenith, dark blue-purple at horizon
    vec3 zenith = vec3(0.08, 0.02, 0.18);
    vec3 horizon = vec3(0.15, 0.08, 0.25);
    vec3 color = mix(horizon, zenith, smoothstep(0.0, 0.8, max(up, 0.0)));

    // Below horizon: darker
    if (up < 0.0) {
      color = mix(color, vec3(0.03, 0.01, 0.06), smoothstep(0.0, -0.3, up));
    }

    // Nebula clouds — layered noise in 3D using direction
    vec3 nebulaCoord = dir * 3.0 + vec3(uTime * 0.005, 0.0, uTime * 0.003);
    float nebula = fbm3(nebulaCoord, 3);
    float nebula2 = fbm3(dir * 5.0 + vec3(0.0, uTime * 0.008, 0.0) + 100.0, 2);

    vec3 nebulaColor1 = vec3(0.3, 0.1, 0.5); // purple
    vec3 nebulaColor2 = vec3(0.1, 0.15, 0.4); // blue
    color += nebulaColor1 * smoothstep(0.3, 0.7, nebula) * 0.4;
    color += nebulaColor2 * smoothstep(0.35, 0.65, nebula2) * 0.3;

    // Binary star system — amber and pale blue
    vec3 sun1Dir = uSunDir;
    vec3 sun2Dir = normalize(uSunDir + vec3(0.15, 0.05, -0.1));
    color += sunDisc(dir, sun1Dir, 0.02, 0.08, vec3(1.0, 0.8, 0.4), 2.0);   // amber
    color += sunDisc(dir, sun2Dir, 0.015, 0.06, vec3(0.6, 0.8, 1.0), 1.5);  // pale blue

    // Star field — moderate density
    float starField = stars(dir, 0.35, 1.0);
    color += vec3(0.8, 0.8, 1.0) * starField;

    // Aurora ribbons — sinusoidal bands near the horizon
    float aurora = 0.0;
    if (up > 0.0 && up < 0.5) {
      float wave = sin(dir.x * 8.0 + uTime * 0.2) * 0.5 + 0.5;
      wave *= sin(dir.z * 6.0 - uTime * 0.15) * 0.5 + 0.5;
      float band = smoothstep(0.05, 0.15, up) * smoothstep(0.45, 0.25, up);
      aurora = wave * band * 0.3;
      // Noise breakup
      aurora *= smoothstep(0.3, 0.6, noise2d(dir.xz * 10.0 + uTime * 0.1));
    }
    color += vec3(0.1, 0.6, 0.4) * aurora;

    return color;
  }

  // ─── Biome 1: Crimson Waste ───────────────────────────────────

  vec3 crimsonWasteSky(vec3 dir) {
    float up = dir.y;

    // Base gradient: red-orange, hazy
    vec3 zenith = vec3(0.15, 0.04, 0.02);
    vec3 mid = vec3(0.4, 0.12, 0.05);
    vec3 horizon = vec3(0.6, 0.25, 0.1);
    vec3 color;

    if (up > 0.3) {
      color = mix(mid, zenith, smoothstep(0.3, 0.9, up));
    } else {
      color = mix(horizon, mid, smoothstep(0.0, 0.3, max(up, 0.0)));
    }

    // Below horizon
    if (up < 0.0) {
      color = mix(color, vec3(0.08, 0.02, 0.01), smoothstep(0.0, -0.3, up));
    }

    // Red giant sun — large, menacing, low on horizon
    vec3 lowSunDir = normalize(uSunDir * vec3(1.0, 0.3, 1.0)); // push it lower
    color += sunDisc(dir, lowSunDir, 0.06, 0.2, vec3(1.0, 0.3, 0.1), 3.0);

    // Add an extra warm glow around the sun
    float sunAngle = acos(clamp(dot(dir, normalize(lowSunDir)), -1.0, 1.0));
    color += vec3(0.5, 0.15, 0.03) * exp(-sunAngle * 3.0) * 0.8;

    // Dust haze near horizon
    float haze = smoothstep(0.2, -0.05, up);
    vec3 hazeCoord = dir.xzz * 4.0 + vec3(uTime * 0.01, uTime * 0.008, 0.0);
    float hazeNoise = fbm3(hazeCoord, 3);
    color = mix(color, vec3(0.5, 0.2, 0.08), haze * 0.5 * hazeNoise);

    // Sparse dim stars — only visible near zenith
    float starMask = smoothstep(0.3, 0.7, up);
    float starField = stars(dir, 0.15, 0.4);
    color += vec3(1.0, 0.8, 0.7) * starField * starMask;

    return color;
  }

  // ─── Biome 2: Frozen Depths ───────────────────────────────────

  vec3 frozenDepthsSky(vec3 dir) {
    float up = dir.y;

    // Base gradient: dark blue-black
    vec3 zenith = vec3(0.01, 0.02, 0.06);
    vec3 horizon = vec3(0.05, 0.08, 0.15);
    vec3 color = mix(horizon, zenith, smoothstep(0.0, 0.7, max(up, 0.0)));

    // Below horizon
    if (up < 0.0) {
      color = mix(color, vec3(0.01, 0.01, 0.03), smoothstep(0.0, -0.3, up));
    }

    // Pale white sun — small, distant, cold
    color += sunDisc(dir, uSunDir, 0.012, 0.04, vec3(0.9, 0.92, 1.0), 1.8);

    // Dense star field
    float starField = stars(dir, 0.55, 1.2);
    color += vec3(0.9, 0.95, 1.0) * starField;

    // Ice crystal sparkles — diamond dust in the upper atmosphere
    if (up > 0.0) {
      // Large-scale sparkle grid
      vec3 sparklePos = dir * 600.0;
      vec3 sparkleCell = floor(sparklePos);
      vec3 sparkleLocal = fract(sparklePos) - 0.5;
      float sparkle = 0.0;
      float rng = hash3(sparkleCell);
      if (rng > 0.7) {
        float dist = length(sparkleLocal);
        float pulse = 0.5 + 0.5 * sin(uTime * (3.0 + rng * 5.0) + rng * 6.28);
        sparkle = smoothstep(0.06, 0.0, dist) * pulse;
      }
      color += vec3(0.7, 0.85, 1.0) * sparkle * 0.8 * smoothstep(0.0, 0.2, up);
    }

    // Ringed planet on the horizon
    vec3 planetDir = normalize(vec3(-0.6, 0.15, 0.7));
    color += ringedPlanet(dir, planetDir, 0.05, vec3(0.35, 0.3, 0.45));

    return color;
  }

  // ─── Main ─────────────────────────────────────────────────────

  void main() {
    vec3 dir = normalize(vWorldDir);

    vec3 color;
    // Select biome sky theme
    if (uBiome < 0.5) {
      color = alienVioletSky(dir);
    } else if (uBiome < 1.5) {
      color = crimsonWasteSky(dir);
    } else {
      color = frozenDepthsSky(dir);
    }

    gl_FragColor = vec4(color, 1.0);
  }
`;

/**
 * Create the procedural sky sphere.
 *
 * @param {number} biomeIndex - 0 (Alien Violet), 1 (Crimson Waste), 2 (Frozen Depths)
 * @returns {{ mesh: THREE.Mesh, update: function(number): void, setBiome: function(number): void, setSunDirection: function(THREE.Vector3): void, uniforms: object }}
 */
export function createSky(biomeIndex = 0) {
  const uniforms = {
    uTime: { value: 0 },
    uBiome: { value: biomeIndex },
    uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.3).normalize() },
  };

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });

  // Large sphere surrounding the entire realm
  const geometry = new THREE.SphereGeometry(4000, 32, 24);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = -1; // render before everything else

  function update(time) {
    uniforms.uTime.value = time;
  }

  function setBiome(index) {
    uniforms.uBiome.value = index;
  }

  function setSunDirection(dir) {
    uniforms.uSunDir.value.copy(dir).normalize();
  }

  return { mesh, update, setBiome, setSunDirection, uniforms };
}
