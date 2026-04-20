import { debugLogPlugin } from "./vite-debug-plugin.js";
import { musicLabPlugin } from "./src/games/void-raiders/music-lab/vite-music-lab-plugin.js";
import { hardpointPlugin } from "./src/games/void-raiders/model-preview/vite-hardpoint-plugin.js";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [debugLogPlugin(), musicLabPlugin(), hardpointPlugin()],
  test: {
    include: [
      "src/games/void-raiders/**/*.test.js",
      "src/games/fairy-permaculture/**/*.test.js",
    ],
    setupFiles: [
      "src/games/void-raiders/test/setup.js",
      "src/games/fairy-permaculture/test/setup.js",
    ],
  },
});
