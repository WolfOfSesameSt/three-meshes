import { Config } from '@remotion/cli/config';

/**
 * Remotion configuration for the anaglyph project.
 * See: https://www.remotion.dev/docs/config
 */
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setCodec('h264');
Config.setConcurrency(1); // WebGL contexts don't love parallelism
Config.setEntryPoint('src/remotion/index.js');
