import { debugLogPlugin } from "./vite-debug-plugin.js";
import { musicLabPlugin } from "./src/games/void-raiders/music-lab/vite-music-lab-plugin.js";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [debugLogPlugin(), musicLabPlugin()],
  test: {
    include: ["src/games/void-raiders/**/*.test.js"],
    setupFiles: ["src/games/void-raiders/test/setup.js"],
  },
});
