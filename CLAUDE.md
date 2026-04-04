# Three.js Sandbox

Prototyping sandbox for games, graphics, shaders, and programmatic animations for video. Built with Three.js + Vite.

## Stack

- **Three.js** r170 (target: keep updated, see `docs/threejs-changelog.md`)
- **Vite 6** — dev server and bundler
- **Pure JavaScript** — ES6 modules, no TypeScript
- **Export target** — Godot 4.x via glTF/GLB

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run export` | Export meshes to `dist/` |
| `npm run export -- --godot` | Export + copy to Godot project |

## Project Structure

```
src/
  viewer.js            — Main scene viewer (entry point for index.html)
  export.js            — glTF/GLB export script for Godot
  lib/                 — Shared utilities (scene setup, camera rigs, post-processing)
  experiments/         — Numbered prototypes: 001-crystal.js, 002-particles.js, etc.
  shaders/             — Custom GLSL shaders
    chunks/            — Reusable GLSL snippets (noise, lighting, etc.)
  animations/          — Animation modules for video export
public/
  textures/            — Static texture assets
docs/
  threejs-changelog.md — Auto-maintained Three.js release notes
```

## Conventions

- **Modules** — ES6 `import`/`export` only, no CommonJS
- **Variables** — `camelCase`
- **Classes** — `PascalCase`
- **Files** — `kebab-case.js`
- **Constants** — `UPPER_SNAKE_CASE`
- **Experiments** — Numbered prefix: `001-name.js`, `002-name.js`
- **Godot meshes** — `snake_case` names in exported glTF

## Three.js Patterns

### Scene boilerplate
Every experiment should follow the pattern in `src/viewer.js`:
1. Create Scene, Camera, Renderer
2. Add OrbitControls for interactivity
3. Set up lighting (ambient + directional minimum)
4. Add GridHelper for spatial reference
5. Implement resize handler
6. Run `requestAnimationFrame` loop

### Material selection
- **MeshStandardMaterial** — Default choice, PBR, good for most cases
- **MeshBasicMaterial** — Unlit, use for wireframes or debug visuals
- **ShaderMaterial** — Custom GLSL with Three.js uniforms injected automatically
- **RawShaderMaterial** — Full control, you write all uniforms/attributes yourself

### Resource disposal
Always dispose geometry and materials when removing objects:
```js
mesh.geometry.dispose();
mesh.material.dispose();
if (mesh.material.map) mesh.material.map.dispose();
scene.remove(mesh);
```

### Lighting defaults
```js
new THREE.AmbientLight(0xffffff, 0.4);    // soft fill
new THREE.DirectionalLight(0xffffff, 0.8); // key light at (5, 10, 5)
```

## Shader Workflow

### File organization
- Vertex shaders: `src/shaders/name.vert`
- Fragment shaders: `src/shaders/name.frag`
- Reusable chunks: `src/shaders/chunks/noise.glsl`, `chunks/lighting.glsl`

### Importing in Vite
Use the `?raw` suffix to import GLSL as strings — no plugin needed:
```js
import vertexShader from './shaders/demo.vert?raw';
import fragmentShader from './shaders/demo.frag?raw';

const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms: {
    uTime: { value: 0.0 },
    uResolution: { value: new THREE.Vector2() },
  },
});
```

### Uniform naming
- `uTime` — elapsed time in seconds
- `uResolution` — viewport resolution
- `uMouse` — mouse position (normalized)
- `vUv` — varying UV coordinates (vertex → fragment)
- `vNormal` — varying normal vector

### ShaderMaterial vs RawShaderMaterial
- **ShaderMaterial** — Three.js injects `projectionMatrix`, `modelViewMatrix`, `position`, `uv`, `normal` automatically. Use `#include <common>` etc.
- **RawShaderMaterial** — You declare everything. Add `precision mediump float;` and all attribute/uniform declarations yourself. Use for GLSL 300 es (`#version 300 es`).

## Animation Workflow

### Module interface
Each animation module in `src/animations/` should export:
```js
export const config = {
  width: 1920,
  height: 1080,
  fps: 60,
  duration: 10, // seconds
};

export function setup(scene, camera, renderer) {
  // Create and add objects to scene
}

export function update(time, deltaTime, frame) {
  // Called each frame — animate objects here
  // time: elapsed seconds, frame: frame index
}
```

### Recording methods
1. **MediaRecorder** — Quick captures, variable quality. Good for previews.
2. **CCapture.js** — Frame-perfect recording, deterministic timing. Good for final output.
3. **Puppeteer + ffmpeg** — Headless CI pipeline. Best for batch rendering.

## glTF/GLB Export

### Browser-side (GLTFExporter)
```js
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
const exporter = new GLTFExporter();
exporter.parse(scene, (gltf) => { /* save */ }, { binary: true });
```

### Node.js alternative
Use `@gltf-transform/core` for headless export (see `src/export.js`).

### Godot conventions
- Mesh names: `snake_case` (Godot auto-converts on import)
- One mesh per GLB file for simple assets
- Use `-col` suffix for collision shapes, `-nav` for navigation meshes

## Version Tracking

Three.js releases are tracked in `docs/threejs-changelog.md` (auto-updated weekly).

Before upgrading Three.js:
1. Check the changelog for breaking changes
2. Run `npm update three`
3. Test `npm run dev` — verify viewer loads
4. Test any custom shaders — API changes often affect ShaderMaterial

## References

- Three.js docs: https://threejs.org/docs/
- Three.js examples: https://threejs.org/examples/
- Three.js releases: https://github.com/mrdoob/three.js/releases
- Vite asset handling: https://vite.dev/guide/assets
- glTF spec: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
