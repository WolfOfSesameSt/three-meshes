# Shader Recipes Reference

Ready-to-adapt shader patterns for common game and visual effects. Each recipe includes the GLSL and the Three.js wiring. All patterns use ShaderMaterial (auto-injected uniforms) unless noted.

---

## 1. Water Refraction / Shimmer

Distorts the scene behind a water surface using animated noise-based UV offsets. Works as either a transparent mesh material or a post-processing pass.

### As a transparent water plane material

**Vertex shader:**
```glsl
uniform float uTime;
varying vec2 vUv;
varying vec4 vScreenPos;

void main() {
  vUv = uv;
  vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vScreenPos = clipPos;
  gl_Position = clipPos;
}
```

**Fragment shader:**
```glsl
uniform float uTime;
uniform sampler2D uSceneTexture;  // rendered scene behind water
uniform vec2 uResolution;
uniform vec3 uWaterColor;
uniform float uDistortionStrength;

varying vec2 vUv;
varying vec4 vScreenPos;

// Simple 2D noise
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  // Screen-space UVs for sampling the scene behind
  vec2 screenUv = (vScreenPos.xy / vScreenPos.w) * 0.5 + 0.5;

  // Animated distortion
  vec2 distortion = vec2(
    fbm(vUv * 8.0 + uTime * 0.3),
    fbm(vUv * 8.0 + uTime * 0.3 + 100.0)
  );
  distortion = (distortion - 0.5) * uDistortionStrength;

  vec4 sceneColor = texture2D(uSceneTexture, screenUv + distortion);

  // Tint toward water color
  vec3 color = mix(sceneColor.rgb, uWaterColor, 0.3);

  // Shimmer highlights from noise peaks
  float shimmer = smoothstep(0.55, 0.7, fbm(vUv * 12.0 + uTime * 0.5));
  color += shimmer * 0.15;

  gl_FragColor = vec4(color, 0.85);
}
```

**Three.js setup:**
```js
const waterMaterial = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms: {
    uTime: { value: 0 },
    uSceneTexture: { value: renderTarget.texture },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uWaterColor: { value: new THREE.Color(0x0066aa) },
    uDistortionStrength: { value: 0.02 },
  },
  transparent: true,
  side: THREE.DoubleSide,
});
```

**Technique notes:**
- Render the scene to a `WebGLRenderTarget` first, then pass as `uSceneTexture`
- For simpler shimmer without refraction, skip the scene texture and just use noise-based color variation on a semi-transparent plane
- Increase FBM octaves (4-6) for more detailed ripples, decrease (2) for subtle shimmer
- Add `uSpeed` uniform to control animation rate independently

---

## 2. Fresnel Rim Lighting

Edge glow effect based on the angle between the surface normal and the camera view direction. Great for sci-fi, energy shields, selection highlights, or stylized characters.

**Vertex shader:**
```glsl
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

**Fragment shader:**
```glsl
uniform vec3 uBaseColor;
uniform vec3 uRimColor;
uniform float uRimPower;      // higher = thinner rim (2.0-5.0 typical)
uniform float uRimIntensity;  // brightness multiplier

varying vec3 vNormal;
varying vec3 vViewDir;
varying vec2 vUv;

void main() {
  float fresnel = 1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0);
  fresnel = pow(fresnel, uRimPower) * uRimIntensity;

  // Simple directional light
  float light = 0.3 + 0.7 * max(dot(normalize(vNormal), normalize(vec3(1.0, 1.0, 0.5))), 0.0);

  vec3 color = uBaseColor * light;
  color += uRimColor * fresnel;

  gl_FragColor = vec4(color, 1.0);
}
```

**Three.js setup:**
```js
const rimMaterial = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms: {
    uBaseColor: { value: new THREE.Color(0x444444) },
    uRimColor: { value: new THREE.Color(0x00ccff) },
    uRimPower: { value: 3.0 },
    uRimIntensity: { value: 1.5 },
  },
});
```

**Variations:**
- **Animated pulse**: multiply fresnel by `0.5 + 0.5 * sin(uTime * 3.0)` for breathing glow
- **Inner glow**: use `max(dot(...), 0.0)` directly (no `1.0 -`) for center-bright effect
- **Two-tone rim**: blend between two rim colors based on world Y for top/bottom split lighting
- **Add to existing material**: use `onBeforeCompile` to inject fresnel into any MeshStandardMaterial

---

## 3. Dynamic Color Grading (Post-Processing)

Change the game's color scheme in real time. Implemented as a full-screen post-processing pass using Three.js EffectComposer or a simple screen quad.

**Fragment shader (post-processing pass):**
```glsl
uniform sampler2D tDiffuse;  // EffectComposer convention for input texture
uniform float uBrightness;
uniform float uContrast;
uniform float uSaturation;
uniform float uHueShift;     // 0.0 to 1.0 (wraps)
uniform vec3 uTint;           // color multiplier
uniform float uVignette;      // 0.0 = none, 1.0 = strong

varying vec2 vUv;

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec4 texColor = texture2D(tDiffuse, vUv);
  vec3 color = texColor.rgb;

  // Brightness and contrast
  color = (color - 0.5) * (1.0 + uContrast) + 0.5 + uBrightness;

  // Hue shift and saturation in HSV space
  vec3 hsv = rgb2hsv(color);
  hsv.x = fract(hsv.x + uHueShift);
  hsv.y *= uSaturation;
  color = hsv2rgb(hsv);

  // Color tint
  color *= uTint;

  // Vignette
  vec2 vigUv = vUv * (1.0 - vUv);
  float vig = vigUv.x * vigUv.y * 15.0;
  vig = pow(vig, uVignette * 0.5);
  color *= vig;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), texColor.a);
}
```

**Three.js setup with EffectComposer:**
```js
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const colorGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uBrightness: { value: 0.0 },
    uContrast: { value: 0.0 },
    uSaturation: { value: 1.0 },
    uHueShift: { value: 0.0 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uVignette: { value: 0.3 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader, // the fragment shader above
};

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new ShaderPass(colorGradeShader));

// In render loop: composer.render() instead of renderer.render()
```

**Preset examples:**
- **Sunset warm**: `{ uBrightness: 0.05, uContrast: 0.1, uSaturation: 1.2, uHueShift: 0.02, uTint: [1.1, 0.9, 0.8] }`
- **Noir**: `{ uSaturation: 0.0, uContrast: 0.4, uVignette: 0.8 }`
- **Cyberpunk**: `{ uSaturation: 1.5, uHueShift: 0.6, uTint: [0.8, 0.9, 1.2], uContrast: 0.2 }`
- **Horror**: `{ uSaturation: 0.3, uBrightness: -0.1, uContrast: 0.3, uTint: [0.8, 1.0, 0.8], uVignette: 1.0 }`

---

## 4. VHS / Retro Post-Processing

Scanlines, chromatic aberration, noise grain, and tracking distortion for that retro CRT / camcorder look.

**Fragment shader:**
```glsl
uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uScanlineIntensity;    // 0.0-1.0
uniform float uScanlineCount;        // lines across screen height (200-400)
uniform float uNoiseIntensity;       // 0.0-0.3
uniform float uChromaOffset;         // chromatic aberration strength (0.001-0.01)
uniform float uJitter;               // horizontal jitter strength (0.0-0.02)
uniform float uTrackingNoise;        // vertical tracking bands (0.0-1.0)

varying vec2 vUv;

float random(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = vUv;

  // ── Tracking distortion ──────────────────────────────
  // Occasional horizontal offset bands that drift vertically
  float trackY = uv.y + uTime * 0.1;
  float tracking = smoothstep(0.0, 0.02, abs(sin(trackY * 50.0 + uTime * 5.0)));
  tracking = 1.0 - (1.0 - tracking) * uTrackingNoise;
  float trackOffset = (1.0 - tracking) * 0.03 * sin(uTime * 20.0);

  // ── Horizontal jitter ────────────────────────────────
  float lineJitter = (random(vec2(floor(uv.y * 200.0), uTime)) - 0.5) * uJitter;
  uv.x += lineJitter + trackOffset;

  // ── Chromatic aberration ─────────────────────────────
  float r = texture2D(tDiffuse, vec2(uv.x + uChromaOffset, uv.y)).r;
  float g = texture2D(tDiffuse, uv).g;
  float b = texture2D(tDiffuse, vec2(uv.x - uChromaOffset, uv.y)).b;
  vec3 color = vec3(r, g, b);

  // ── Scanlines ────────────────────────────────────────
  float scanline = sin(vUv.y * uScanlineCount * 3.14159) * 0.5 + 0.5;
  scanline = pow(scanline, 1.5);
  color *= 1.0 - uScanlineIntensity * (1.0 - scanline);

  // ── Noise grain ──────────────────────────────────────
  float grain = random(vUv + fract(uTime)) * uNoiseIntensity;
  color += grain - uNoiseIntensity * 0.5;

  // ── Slight color bleed / smear ───────────────────────
  color.r = mix(color.r, color.r * 0.95 + 0.05, 0.3);

  // ── Vignette (CRT curved edges) ─────────────────────
  vec2 vigUv = vUv * 2.0 - 1.0;
  float vig = 1.0 - dot(vigUv * 0.5, vigUv * 0.5);
  vig = smoothstep(0.0, 0.7, vig);
  color *= vig;

  // ── Slight green/blue tint (VHS color cast) ─────────
  color *= vec3(0.95, 1.0, 1.05);

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
```

**Three.js setup:**
```js
const vhsShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uScanlineIntensity: { value: 0.3 },
    uScanlineCount: { value: 300.0 },
    uNoiseIntensity: { value: 0.1 },
    uChromaOffset: { value: 0.003 },
    uJitter: { value: 0.005 },
    uTrackingNoise: { value: 0.2 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader, // the VHS fragment shader above
};

// Add to EffectComposer after RenderPass
const vhsPass = new ShaderPass(vhsShader);
composer.addPass(vhsPass);

// In render loop:
vhsPass.uniforms.uTime.value = elapsed;
```

**Intensity presets:**
- **Subtle retro**: `{ scanlineIntensity: 0.15, noiseIntensity: 0.05, chromaOffset: 0.001, jitter: 0.001, trackingNoise: 0.0 }`
- **Full VHS**: `{ scanlineIntensity: 0.3, noiseIntensity: 0.12, chromaOffset: 0.004, jitter: 0.008, trackingNoise: 0.3 }`
- **Glitch**: `{ scanlineIntensity: 0.1, noiseIntensity: 0.2, chromaOffset: 0.008, jitter: 0.02, trackingNoise: 0.8 }`

---

## 5. Vegetation Sway / Object Wobble

Vertex shader wind deformation. Uses world position to seed the animation so each object/vertex moves independently. Works on any mesh — trees, grass, flags, tentacles, etc.

**Vertex shader:**
```glsl
uniform float uTime;
uniform float uWindStrength;   // 0.0-1.0 overall intensity
uniform vec2 uWindDirection;   // normalized XZ direction
uniform float uWindSpeed;      // animation speed multiplier
uniform float uWindTurbulence; // high-frequency noise amount

varying vec2 vUv;
varying vec3 vNormal;

// Simple 2D noise for turbulence
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

void main() {
  vUv = uv;
  vNormal = normalMatrix * normal;

  vec3 pos = position;
  vec4 worldPos = modelMatrix * vec4(pos, 1.0);

  // Height mask: base stays planted, top moves most
  // Uses local Y — assumes model origin at base
  // Adjust the range for your model's coordinate space
  float heightFactor = max(pos.y, 0.0);
  float mask = heightFactor * heightFactor; // quadratic falloff — roots fixed, tips wild

  // Primary sway: large slow movement
  float sway = sin(uTime * uWindSpeed + worldPos.x * 0.5 + worldPos.z * 0.3) * uWindStrength;

  // Secondary sway: offset phase for more organic feel
  float sway2 = sin(uTime * uWindSpeed * 1.3 + worldPos.x * 0.7 - worldPos.z * 0.5) * uWindStrength * 0.4;

  // Turbulence: high-frequency per-vertex noise
  float turb = noise(worldPos.xz * 2.0 + uTime * uWindSpeed * 0.5) * uWindTurbulence;

  // Apply displacement along wind direction
  float totalDisplacement = (sway + sway2 + turb) * mask;
  pos.x += uWindDirection.x * totalDisplacement;
  pos.z += uWindDirection.y * totalDisplacement;

  // Slight vertical compression when bent (conservation of length)
  pos.y -= abs(totalDisplacement) * 0.1;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
```

**Fragment shader (basic textured):**
```glsl
uniform sampler2D uTexture;

varying vec2 vUv;
varying vec3 vNormal;

void main() {
  vec4 texColor = texture2D(uTexture, vUv);

  // Discard transparent pixels (for leaf textures with alpha cutout)
  if (texColor.a < 0.5) discard;

  // Simple hemisphere lighting
  float light = 0.4 + 0.6 * max(dot(normalize(vNormal), normalize(vec3(0.3, 1.0, 0.2))), 0.0);
  gl_FragColor = vec4(texColor.rgb * light, texColor.a);
}
```

**Three.js setup:**
```js
const windMaterial = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms: {
    uTime: { value: 0 },
    uWindStrength: { value: 0.3 },
    uWindDirection: { value: new THREE.Vector2(1.0, 0.5).normalize() },
    uWindSpeed: { value: 2.0 },
    uWindTurbulence: { value: 0.15 },
    uTexture: { value: leafTexture },
  },
  side: THREE.DoubleSide,
});

// In render loop:
windMaterial.uniforms.uTime.value = elapsed;
```

**Adapting for different objects:**

| Object | heightFactor | mask curve | notes |
|--------|-------------|------------|-------|
| Tree trunk + canopy | `pos.y` | `pow(h, 2.0)` | trunk barely moves, canopy sways |
| Grass blade | `pos.y` | `pow(h, 1.5)` | more uniform bend |
| Flag / banner | `pos.x` (distance from pole) | `pow(h, 1.0)` | linear, wave along length |
| Hanging object | `1.0 - pos.y` (invert) | `pow(h, 2.0)` | top fixed, bottom swings |
| Tentacle / rope | distance from root | `pow(h, 3.0)` | cubic for whip effect |

**Using with existing MeshStandardMaterial (onBeforeCompile):**
```js
mesh.material.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = { value: 0 };
  shader.uniforms.uWindStrength = { value: 0.3 };
  shader.uniforms.uWindDirection = { value: new THREE.Vector2(1, 0.5).normalize() };
  shader.uniforms.uWindSpeed = { value: 2.0 };

  // Inject into vertex shader before the project_vertex chunk
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    `
    #include <begin_vertex>
    vec4 wPos = modelMatrix * vec4(position, 1.0);
    float hMask = max(position.y, 0.0);
    hMask *= hMask;
    float sway = sin(uTime * uWindSpeed + wPos.x * 0.5 + wPos.z * 0.3) * uWindStrength;
    transformed.x += uWindDirection.x * sway * hMask;
    transformed.z += uWindDirection.y * sway * hMask;
    transformed.y -= abs(sway * hMask) * 0.1;
    `
  );

  // Declare uniforms
  shader.vertexShader = 'uniform float uTime;\nuniform float uWindStrength;\nuniform vec2 uWindDirection;\nuniform float uWindSpeed;\n' + shader.vertexShader;

  // Store reference so we can update uTime in the render loop
  mesh.userData.shader = shader;
};
```

---

## Combining Effects

These recipes stack naturally:

1. **Rim-lit swaying trees**: Vegetation sway vertex shader + fresnel fragment shader
2. **VHS city destruction**: Render Kaiju City normally, apply VHS post-processing pass
3. **Underwater scene**: Water refraction on a plane + color grading (blue tint, low saturation) + vegetation sway on seaweed
4. **Sci-fi energy shield**: Fresnel rim + animated noise distortion + additive blending
5. **Retro horror**: Desaturated color grade + scanlines + vignette + swaying dead trees

For EffectComposer with multiple post-processing passes, chain them:
```js
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new ShaderPass(colorGradeShader));  // color grading first
composer.addPass(new ShaderPass(vhsShader));          // VHS on top
```
