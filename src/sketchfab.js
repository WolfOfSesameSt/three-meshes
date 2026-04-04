/**
 * Sketchfab Model Browser & Downloader
 *
 * Interactive CLI tool for searching and downloading free 3D models
 * from Sketchfab into public/models/.
 *
 * Usage:
 *   node src/sketchfab.js search "low poly tree"
 *   node src/sketchfab.js search "sword" --max-faces 5000 --sort popular
 *   node src/sketchfab.js download <model-uid>
 *   node src/sketchfab.js info <model-uid>
 *
 * Requires SKETCHFAB_API_TOKEN in .env
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { pipeline } from "stream/promises";
import { Extract } from "unzipper";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = join(__dirname, "..", "public", "models");
const API_BASE = "https://api.sketchfab.com/v3";

// Load token from .env
function loadToken() {
  const envPath = join(__dirname, "..", ".env");
  if (!existsSync(envPath)) {
    console.error("Error: .env file not found. Create it with SKETCHFAB_API_TOKEN=your_token");
    process.exit(1);
  }
  const envContent = readFileSync(envPath, "utf-8");
  const match = envContent.match(/SKETCHFAB_API_TOKEN=(.+)/);
  if (!match) {
    console.error("Error: SKETCHFAB_API_TOKEN not found in .env");
    process.exit(1);
  }
  return match[1].trim();
}

// --- API helpers ---

async function apiFetch(endpoint, token) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { Authorization: `Token ${token}` },
  });
  if (res.status === 429) {
    console.error("Rate limited. Wait a moment and try again.");
    process.exit(1);
  }
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// --- Commands ---

async function search(query, { maxFaces, sort, count } = {}) {
  const token = loadToken();
  const params = new URLSearchParams({
    type: "models",
    q: query,
    downloadable: "true",
    count: String(count || 12),
  });
  if (maxFaces) params.set("max_face_count", String(maxFaces));
  if (sort === "popular") params.set("sort_by", "-viewCount");
  else if (sort === "recent") params.set("sort_by", "-createdAt");
  else if (sort === "likes") params.set("sort_by", "-likeCount");

  const data = await apiFetch(`/search?${params}`, token);
  const results = data.results || [];

  if (results.length === 0) {
    console.log("No models found.");
    return [];
  }

  console.log(`\n  Found ${results.length} models for "${query}":\n`);

  const formatted = results.map((m, i) => {
    const thumb =
      m.thumbnails?.images?.find((t) => t.width === 256)?.url ||
      m.thumbnails?.images?.[0]?.url ||
      "(no thumbnail)";
    return {
      index: i + 1,
      uid: m.uid,
      name: m.name,
      faces: m.faceCount?.toLocaleString() || "?",
      license: m.license?.slug || m.license?.label || m.license || "unknown",
      thumbnail: thumb,
      url: m.viewerUrl,
    };
  });

  formatted.forEach((m) => {
    console.log(`  ${m.index}. ${m.name}`);
    console.log(`     UID: ${m.uid}`);
    console.log(`     Faces: ${m.faces} | License: ${m.license}`);
    console.log(`     View: ${m.url}`);
    console.log();
  });

  // Also output JSON for programmatic consumption
  const jsonPath = join(MODELS_DIR, ".last-search.json");
  mkdirSync(MODELS_DIR, { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(formatted, null, 2));
  console.log(`  Results saved to public/models/.last-search.json`);

  return formatted;
}

async function download(uid) {
  const token = loadToken();

  // Step 1: Get model info
  console.log(`\n  Fetching model info for ${uid}...`);
  const model = await apiFetch(`/models/${uid}`, token);
  const safeName = model.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const modelDir = join(MODELS_DIR, safeName);

  if (existsSync(modelDir)) {
    console.log(`  Model already exists at public/models/${safeName}/`);
    console.log(`  Delete the directory first if you want to re-download.`);
    return;
  }

  // Step 2: Get download URL (expires in 300s)
  console.log(`  Requesting download URL...`);
  const dlData = await apiFetch(`/models/${uid}/download`, token);
  const gltfDownload = dlData.gltf || dlData.glb;
  if (!gltfDownload) {
    console.error("  No glTF/GLB download available for this model.");
    console.log("  Available formats:", Object.keys(dlData).join(", "));
    return;
  }

  const dlUrl = gltfDownload.url;
  const sizeKB = gltfDownload.size
    ? `${(gltfDownload.size / 1024).toFixed(0)} KB`
    : "unknown size";
  console.log(`  Downloading (${sizeKB})...`);

  // Step 3: Download and extract ZIP
  mkdirSync(modelDir, { recursive: true });
  const res = await fetch(dlUrl);
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status}`);
  }

  await pipeline(res.body, Extract({ path: modelDir }));

  // Step 4: Write metadata
  const meta = {
    uid: model.uid,
    name: model.name,
    author: model.user?.displayName || "unknown",
    authorUrl: model.user?.profileUrl || "",
    license: model.license?.slug || "unknown",
    licenseUrl: model.license?.url || "",
    faces: model.faceCount,
    viewerUrl: model.viewerUrl,
    downloadedAt: new Date().toISOString(),
  };
  writeFileSync(join(modelDir, "_meta.json"), JSON.stringify(meta, null, 2));

  console.log(`  Downloaded to public/models/${safeName}/`);
  console.log(`  Author: ${meta.author} (${meta.license})`);
  console.log(`  Files:`);

  // List extracted files
  const files = readdirSync(modelDir);
  files.forEach((f) => console.log(`    - ${f}`));

  return { dir: modelDir, meta };
}

async function info(uid) {
  const token = loadToken();
  const model = await apiFetch(`/models/${uid}`, token);

  console.log(`\n  Model: ${model.name}`);
  console.log(`  UID: ${model.uid}`);
  console.log(`  Author: ${model.user?.displayName}`);
  console.log(`  Faces: ${model.faceCount?.toLocaleString()}`);
  console.log(`  License: ${model.license?.slug}`);
  console.log(`  Animated: ${model.isAnimated}`);
  console.log(`  View: ${model.viewerUrl}`);
  if (model.tags?.length) {
    console.log(`  Tags: ${model.tags.map((t) => t.name).join(", ")}`);
  }
}

// --- CLI ---

const [, , command, ...args] = process.argv;

switch (command) {
  case "search": {
    const query = [];
    let maxFaces = null;
    let sort = null;
    let count = null;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--max-faces") maxFaces = parseInt(args[++i]);
      else if (args[i] === "--sort") sort = args[++i];
      else if (args[i] === "--count") count = parseInt(args[++i]);
      else query.push(args[i]);
    }
    await search(query.join(" "), { maxFaces, sort, count });
    break;
  }
  case "download":
    if (!args[0]) {
      console.error("Usage: node src/sketchfab.js download <model-uid>");
      process.exit(1);
    }
    await download(args[0]);
    break;
  case "info":
    if (!args[0]) {
      console.error("Usage: node src/sketchfab.js info <model-uid>");
      process.exit(1);
    }
    await info(args[0]);
    break;
  default:
    console.log(`
  Sketchfab Model Browser

  Commands:
    search <query> [options]    Search for free models
      --max-faces <n>           Max polygon count
      --sort popular|recent|likes
      --count <n>               Results per page (max 24)

    download <uid>              Download model to public/models/
    info <uid>                  Show model details

  Examples:
    node src/sketchfab.js search "low poly tree"
    node src/sketchfab.js search "sword" --max-faces 5000 --sort popular
    node src/sketchfab.js download abc123def456
`);
}
