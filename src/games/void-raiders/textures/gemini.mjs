#!/usr/bin/env node
/**
 * Gemini 2.5 Flash Image (nano banana) texture generator.
 *
 * Generates seamless equirectangular sphere textures for the procedural
 * ball turret heads. Saves PNGs to public/textures/turrets/.
 *
 * Usage:
 *   node src/games/void-raiders/textures/gemini.mjs "<prompt>" --name <file>
 *   node src/games/void-raiders/textures/gemini.mjs "<prompt>" --name <file> --aspect 16:9
 *
 * The model returns whatever aspect Gemini decides — usually 1:1 or 16:9.
 * Equirectangular sphere textures want 2:1 but Gemini doesn't expose that
 * exactly, so we add wording in the prompt to request the layout.
 *
 * Default model: gemini-2.5-flash-image-preview (the public preview ID).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../../../..");
const OUT_DIR = path.join(PROJECT_ROOT, "public/textures/turrets");
const ENV_FILE = path.join(PROJECT_ROOT, ".env");

function getApiKey() {
  if (!fs.existsSync(ENV_FILE)) throw new Error("No .env file found");
  const env = fs.readFileSync(ENV_FILE, "utf-8");
  const match = env.match(/GEMINI_API_KEY=(.+)/);
  if (!match) throw new Error("GEMINI_API_KEY not found in .env");
  return match[1].trim();
}

function parseArgs(argv) {
  const args = { prompt: null, name: null, model: "gemini-2.5-flash-image" };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--name") args.name = argv[++i];
    else if (a === "--model") args.model = argv[++i];
    else positional.push(a);
  }
  args.prompt = positional.join(" ");
  return args;
}

async function generate(prompt, model) {
  const apiKey = getApiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{
      parts: [{ text: prompt }],
    }],
    generationConfig: {
      // Tells Gemini we want an image back instead of text
      responseModalities: ["IMAGE"],
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gemini API ${res.status}: ${txt}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  if (!candidate) throw new Error("No candidates in response: " + JSON.stringify(data));

  // Find the inlineData part with the image
  const parts = candidate.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      return {
        mime: part.inlineData.mimeType || "image/png",
        bytes: Buffer.from(part.inlineData.data, "base64"),
      };
    }
  }
  throw new Error("No image data in candidate parts: " + JSON.stringify(candidate));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.prompt) {
    console.error("Usage: node src/games/void-raiders/textures/gemini.mjs \"<prompt>\" --name <file>");
    process.exit(1);
  }
  if (!args.name) {
    console.error("--name is required (e.g., --name laser-turret-v1)");
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[gemini] generating "${args.name}" with model ${args.model}`);
  console.log(`[gemini] prompt: ${args.prompt}`);

  const t0 = Date.now();
  const { mime, bytes } = await generate(args.prompt, args.model);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const ext = mime === "image/jpeg" ? "jpg" : "png";
  const outPath = path.join(OUT_DIR, `${args.name}.${ext}`);
  fs.writeFileSync(outPath, bytes);

  // Also write a sidecar JSON with the prompt for traceability
  fs.writeFileSync(
    path.join(OUT_DIR, `${args.name}.json`),
    JSON.stringify({ prompt: args.prompt, model: args.model, generated: new Date().toISOString(), bytes: bytes.length }, null, 2),
  );

  // Refresh the manifest the texture-lab page reads. Lists every PNG/JPG
  // currently in the folder. The lab fetches this on Refresh List.
  const files = fs
    .readdirSync(OUT_DIR)
    .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
    .sort();
  fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify(files, null, 2));

  console.log(`[gemini] saved ${outPath} (${(bytes.length / 1024).toFixed(1)} KB) in ${elapsed}s`);
  console.log(`[gemini] manifest.json updated (${files.length} textures total)`);
}

main().catch((e) => {
  console.error("[gemini] FAILED:", e.message);
  process.exit(2);
});
