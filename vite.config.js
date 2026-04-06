import { debugLogPlugin } from "./vite-debug-plugin.js";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [debugLogPlugin()],
  test: {
    include: ["src/games/void-raiders/**/*.test.js"],
    setupFiles: ["src/games/void-raiders/test/setup.js"],
  },
});
