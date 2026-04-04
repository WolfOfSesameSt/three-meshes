/**
 * Export meshes to glTF/GLB for use in Godot.
 *
 * Usage:
 *   node src/export.js                     — exports to dist/
 *   node src/export.js --godot             — also copies to Godot project
 */

import { writeFileSync, copyFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, "..", "dist");
const GODOT_MODELS_DIR = join(__dirname, "..", "..", "Godot", "project", "assets", "models");

const copyToGodot = process.argv.includes("--godot");

// Ensure output dirs exist
mkdirSync(DIST_DIR, { recursive: true });

if (copyToGodot) {
  mkdirSync(GODOT_MODELS_DIR, { recursive: true });
}

console.log("Export script ready.");
console.log(`Output: ${DIST_DIR}`);
if (copyToGodot) {
  console.log(`Godot copy: ${GODOT_MODELS_DIR}`);
}

// TODO: Add Three.js GLTFExporter usage here once meshes are built.
// The GLTFExporter runs in a browser/jsdom context. For Node.js export,
// consider using @gltf-transform/core or building meshes as raw glTF JSON.
console.log("\nNo meshes to export yet. Build some geometry in src/ first!");
