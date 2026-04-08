# Anaglyph Video Generator

Procedurally generates anaglyph 3D videos (red/cyan glasses) using
**Three.js** scenes rendered through **Remotion**.

See [PRD.md](./PRD.md) for goals, scope, and technical approach.

## Quick Start

```bash
# Launch Remotion Studio (interactive preview + scrub)
npm run remotion:studio

# Render to MP4 (writes to src/remotion/out/anaglyph.mp4)
npm run remotion:render
```

Put on red/cyan anaglyph glasses while watching for the 3D effect.

## How It Works

```
Remotion (frame scheduler)
    │
    ▼
React component  ── useCurrentFrame()
    │
    ▼
Plain Three.js  ── imperative scene built in scenes/demoScene.js
    │
    ▼
AnaglyphEffect  ── wraps WebGLRenderer + StereoCamera, produces red/cyan composite
    │
    ▼
<canvas>        ── Remotion screenshots the DOM each frame
    │
    ▼
ffmpeg → .mp4
```

Each frame:
1. Remotion renders `AnaglyphScene` at `frame = N`.
2. The component computes `t = frame / fps`.
3. `demoScene.update(t)` mutates the Three.js scene graph (rotations,
   orbits, camera dolly).
4. `AnaglyphEffect.render(scene, camera)` draws the left and right eye views
   in a single pass and composites them via a color matrix.
5. `delayRender`/`continueRender` keeps Remotion waiting until the WebGL
   paint has landed before screenshotting.

## File Layout

```
src/remotion/
├── PRD.md             Product requirements
├── README.md          ← you are here
├── index.js           Remotion entry: registerRoot(Root)
├── Root.jsx           <Composition> registration
├── AnaglyphScene.jsx  React wrapper around Three.js + AnaglyphEffect
├── scenes/
│   └── demoScene.js   Pure Three.js scene builder (no React)
└── out/               Rendered MP4s (gitignored)
```

The split between `AnaglyphScene.jsx` (Remotion glue) and
`scenes/demoScene.js` (pure Three.js) means the demo scene can be reused
outside Remotion later — e.g. in a live `src/experiments/` Vite page —
without refactoring.

## Adding a New Scene

1. Create `src/remotion/scenes/myScene.js` exporting `buildMyScene(scene, camera)`
   that returns `{ update(t, frame), dispose() }`.
2. Duplicate `AnaglyphScene.jsx` → `MyScene.jsx` and swap the `buildDemoScene`
   import.
3. Register a new `<Composition id="MyScene" …>` in `Root.jsx`.
4. Render with `npx remotion render MyScene out/my-scene.mp4`.

## Notes & Gotchas

- **`preserveDrawingBuffer: true`** on the WebGLRenderer is required — without
  it, the browser may clear the canvas after compositing and Remotion captures
  a blank frame.
- **`Config.setConcurrency(1)`** in `remotion.config.js` — rendering multiple
  frames in parallel browser tabs contends for WebGL contexts and crashes.
- **Determinism**: the starfield uses a seeded PRNG (`mulberry32`) so renders
  are byte-for-byte reproducible. Don't add `Math.random()` inside scene
  `update()`.
- **Eye separation**: `AnaglyphEffect` uses Three.js's `StereoCamera` defaults
  (0.064 world-unit IPD). Scale your scene so 1 unit ≈ 1 meter for comfortable
  parallax.

## Future Work

See the "Out of scope" section of [PRD.md](./PRD.md) — the list includes
tunable color matrices, side-by-side VR export, GLB model loading, and
multiple scene presets.
