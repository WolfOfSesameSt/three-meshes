# Anaglyph Video Generator — PRD

**Status:** MVP
**Owner:** Ian
**Created:** 2026-04-08

## 1. Summary

A scratchpad project for generating **anaglyph 3D videos** (the classic red/cyan
glasses kind) from procedurally-driven Three.js scenes, rendered deterministically
to MP4 via [Remotion](https://www.remotion.dev/).

This lives inside the existing `three-meshes` sandbox and reuses the repo's
Three.js installation. It is **not** a standalone product — it's a playground
for experimenting with stereoscopic rendering, depth cues, and film-style
anaglyph output.

## 2. Goals

- Produce frame-perfect anaglyph 3D videos from code (no manual editing).
- Use Three.js for scene authoring, Remotion as the frame scheduler + encoder.
- Keep the authoring loop tight: edit a scene file, preview in Remotion Studio,
  render to MP4 with one command.
- Make it easy to iterate on different anaglyph color matrices (true/gray/color
  anaglyph, Dubois optimized, etc.) without rewriting the scene.

## 3. Non-Goals (MVP)

- ❌ Real-time interactive viewer — Remotion renders offline.
- ❌ Stereo VR / side-by-side / top-bottom formats (future).
- ❌ Loading external video sources (future).
- ❌ Full post-processing pipeline (bloom, DoF, etc.) — scene-only for now.
- ❌ Audio tracks (Remotion supports it, but out of scope for v0).

## 4. User Stories

- **As Ian**, I want to write a Three.js scene as a function that takes `time`
  and mutates the scene graph, so I can keep animation logic simple.
- **As Ian**, I want to preview my scene in Remotion Studio with a scrubber so
  I can tune motion without re-rendering.
- **As Ian**, I want to hit `npm run remotion:render` and get an MP4 file that
  plays in 3D when I put on red/cyan glasses.
- **As Ian**, I want to swap the anaglyph color matrix at will so I can
  compare true anaglyph vs. Dubois side by side.

## 5. Technical Approach

### Stack
- **Remotion** — React-based video framework. Drives frame scheduling,
  Studio preview, and the render → MP4 pipeline (uses Chrome headless + ffmpeg).
- **Three.js r170** — Already in the sandbox. Handles the 3D scene.
- **`AnaglyphEffect`** from `three/examples/jsm/effects/AnaglyphEffect.js` —
  Wraps a `WebGLRenderer` and internally uses `StereoCamera` to produce a
  red/cyan composite each frame. Zero custom shader work required for MVP.
- **Plain React** — No react-three-fiber. Each composition is a React
  component that owns a `<canvas>` and runs Three.js imperatively, driven
  by `useCurrentFrame()`.

### Frame Loop
Remotion calls the React component once per frame. Our component:
1. On mount, builds the scene, camera, renderer, and `AnaglyphEffect` once.
   Wraps with `delayRender()` / `continueRender()` so Remotion waits for
   WebGL setup.
2. On every frame change, computes `t = frame / fps`, updates the scene,
   calls `effect.render(scene, camera)`, then `continueRender()`.
3. On unmount, disposes WebGL resources.

### Determinism
- No `Math.random()` in per-frame code (or seeded only).
- No `requestAnimationFrame`-based timing — all motion derives from `frame`.
- No async loads mid-frame — preload in the setup phase.

## 6. MVP Scope

### In scope
- [x] `src/remotion/` directory with Remotion entry, Root, and one composition
- [x] `AnaglyphScene` composition — a simple depth-showcasing scene
      (rotating torus knot + orbiting icosahedra + starfield backdrop)
- [x] `AnaglyphEffect` integration driven by `useCurrentFrame()`
- [x] `npm run remotion:studio` — launches Remotion Studio
- [x] `npm run remotion:render` — renders the default composition to
      `src/remotion/out/anaglyph.mp4`
- [x] README with usage + "how to view with glasses" note

### Out of scope (future work)
- Multiple scene presets (tunnel fly-through, particle field, etc.)
- Tunable anaglyph matrix UI (currently hardcoded to true anaglyph)
- Depth-of-field / bloom / film grain post
- Loading GLB models as scene content
- Side-by-side export for VR / Looking Glass
- Stereo parameter animation (eye separation, convergence over time)
- Audio sync
- Headless batch rendering across many scenes

## 7. File Layout

```
src/remotion/
  PRD.md             — this file
  README.md          — usage instructions
  index.js           — Remotion entry, calls registerRoot(Root)
  Root.jsx           — <Composition> registration
  AnaglyphScene.jsx  — the MVP composition (React + Three.js + AnaglyphEffect)
  scenes/
    demoScene.js     — pure-Three.js scene builder (no React)
  out/               — rendered MP4s (gitignored)
```

Keeping scene construction in `scenes/demoScene.js` (pure JS, no React)
means scene code can be reused outside Remotion later — e.g. an interactive
Vite page in `src/experiments/` — without refactoring.

## 8. Open Questions

- **Resolution / fps?** MVP ships at 1920×1080 @ 30fps. Render time is ~seconds
  per frame with Three.js, so 30fps keeps iteration fast.
- **Anaglyph flavor?** MVP uses `AnaglyphEffect`'s default matrix (a decent
  true-anaglyph). Dubois matrix upgrade tracked as future work.
- **Eye separation?** `StereoCamera.eyeSep` defaults to 0.064 (64mm human IPD
  in world units). Scenes should be scaled so 1 unit ≈ 1 meter for correct
  depth.

## 9. Success Criteria

The MVP is done when:
1. `npm run remotion:studio` opens Studio with `AnaglyphScene` visible and
   scrubbable.
2. `npm run remotion:render` produces a playable `anaglyph.mp4`.
3. Put on red/cyan glasses → scene has visible depth.
