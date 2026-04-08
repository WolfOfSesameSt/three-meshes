import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  delayRender,
  continueRender,
} from 'remotion';
import * as THREE from 'three';
import { AnaglyphEffect } from 'three/examples/jsm/effects/AnaglyphEffect.js';
import { buildDemoScene } from './scenes/demoScene.js';

/**
 * Reusable Remotion renderer: wraps a Three.js scene in AnaglyphEffect and
 * drives it from Remotion's frame clock. Accepts a `buildScene(scene, camera)`
 * factory that returns `{ update(t, frame), dispose() }`.
 *
 * Timing:
 *   - `useState(() => delayRender(...))` creates a one-time gate on frame 0,
 *     so Remotion waits for WebGL setup before capturing the first frame.
 *   - The setup `useEffect` builds the renderer/scene/effect, draws frame 0,
 *     and clears the setup handle synchronously (no RAF — RAF deadlocks
 *     inside Remotion's headless capture because Remotion is already
 *     paused waiting for the handle).
 *   - Per-frame, `useLayoutEffect` re-runs when `frame` changes and draws
 *     the scene synchronously before Remotion screenshots the canvas.
 *     No per-frame delayRender is needed: useLayoutEffect runs inside
 *     React's commit phase which Remotion awaits.
 */
export const AnaglyphRenderer = ({ buildScene }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const canvasRef = useRef(null);
  const stateRef = useRef(null);

  // One-time delayRender gate for initial WebGL setup.
  const [setupHandle] = useState(() => delayRender('anaglyph-three-setup'));

  // One-time setup -----------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: false,
    });
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      50,
      width / height,
      0.1,
      1000,
    );
    camera.position.set(0, 0, 6);

    const sceneApi = buildScene(scene, camera);

    const effect = new AnaglyphEffect(renderer);
    effect.setSize(width, height);

    stateRef.current = { renderer, scene, camera, effect, sceneApi };

    // Draw the current frame immediately so the first capture isn't blank.
    const t = frame / fps;
    sceneApi.update(t, frame);
    effect.render(scene, camera);

    // Clear the setup gate synchronously — Remotion can now capture.
    continueRender(setupHandle);

    return () => {
      sceneApi.dispose?.();
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material)
            ? obj.material
            : [obj.material];
          for (const m of mats) {
            if (m.map) m.map.dispose();
            m.dispose();
          }
        }
      });
      renderer.dispose();
      stateRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupHandle, buildScene]);

  // Per-frame render — synchronous, commit-phase, no RAF --------------------
  useLayoutEffect(() => {
    const s = stateRef.current;
    if (!s) return; // Setup hasn't run yet — the setup effect handled frame 0.
    const t = frame / fps;
    s.sceneApi.update(t, frame);
    s.effect.render(s.scene, s.camera);
  }, [frame, fps]);

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />
    </AbsoluteFill>
  );
};

/**
 * Original demo scene wrapper — kept for backwards compatibility with the
 * `AnaglyphScene` composition ID and the `remotion:render` npm script.
 */
export const AnaglyphScene = () => (
  <AnaglyphRenderer buildScene={buildDemoScene} />
);
