import { Composition } from 'remotion';
import { AnaglyphRenderer } from './AnaglyphScene.jsx';
import { buildDemoScene } from './scenes/demoScene.js';
import { buildDodgeScene } from './scenes/dodgeScene.js';
import { buildVowelsScene } from './scenes/vowelsScene.js';

/**
 * Thin wrappers binding each scene builder to the shared AnaglyphRenderer.
 * Defined at module scope (not inline in <Composition>) so React treats
 * them as stable component types instead of remounting on every render.
 */
const DemoAsteroids = () => (
  <AnaglyphRenderer buildScene={buildDemoScene} />
);

const DodgingAsteroids = () => (
  <AnaglyphRenderer buildScene={buildDodgeScene} />
);

const Vowels = () => (
  <AnaglyphRenderer buildScene={buildVowelsScene} />
);

/**
 * Remotion root: each <Composition> is a selectable entry in Studio and
 * an addressable target for `remotion render <id>`.
 */
export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="AnaglyphScene"
        component={DemoAsteroids}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="DodgingAsteroids"
        component={DodgingAsteroids}
        durationInFrames={360}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="Vowels"
        component={Vowels}
        durationInFrames={600}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
