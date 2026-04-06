/**
 * ElevenLabs API client for sound effects and music generation.
 *
 * Tracks credit usage against a budget. All generated files are saved
 * to public/audio/sfx/ or public/audio/music/.
 *
 * Usage:
 *   node src/games/void-raiders/audio/elevenlabs.js sfx "laser blast" --duration 2 --name weapon-laser
 *   node src/games/void-raiders/audio/elevenlabs.js music "epic space battle theme" --duration 60 --name battle-theme
 *   node src/games/void-raiders/audio/elevenlabs.js budget
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../../../..");
const SFX_DIR = path.join(PROJECT_ROOT, "public/audio/sfx");
const MUSIC_DIR = path.join(PROJECT_ROOT, "public/audio/music");
const BUDGET_FILE = path.join(PROJECT_ROOT, "public/audio/.budget.json");

// Load API key from .env
function getApiKey() {
  const envPath = path.join(PROJECT_ROOT, ".env");
  if (!fs.existsSync(envPath)) throw new Error("No .env file found");
  const env = fs.readFileSync(envPath, "utf-8");
  const match = env.match(/ELEVENLABS_API_KEY=(.+)/);
  if (!match) throw new Error("ELEVENLABS_API_KEY not found in .env");
  return match[1].trim();
}

// ─── Budget Tracking ────────────────────────────────────────────

const BUDGET_LIMIT = 50000;

function loadBudget() {
  if (fs.existsSync(BUDGET_FILE)) {
    return JSON.parse(fs.readFileSync(BUDGET_FILE, "utf-8"));
  }
  return { totalCreditsUsed: 0, limit: BUDGET_LIMIT, generations: [] };
}

function saveBudget(budget) {
  fs.writeFileSync(BUDGET_FILE, JSON.stringify(budget, null, 2));
}

function trackUsage(budget, credits, type, prompt, filename) {
  budget.totalCreditsUsed += credits;
  budget.generations.push({
    date: new Date().toISOString(),
    type,
    prompt,
    filename,
    credits,
    totalAfter: budget.totalCreditsUsed,
  });
  saveBudget(budget);
}

function checkBudget(budget, estimatedCredits) {
  const remaining = budget.limit - budget.totalCreditsUsed;
  if (estimatedCredits > remaining) {
    throw new Error(
      `Budget exceeded! Need ${estimatedCredits} credits but only ${remaining} remaining (${budget.totalCreditsUsed}/${budget.limit} used).`
    );
  }
  return remaining;
}

// ─── Sound Effects Generation ───────────────────────────────────

async function generateSFX(prompt, options = {}) {
  const apiKey = getApiKey();
  const budget = loadBudget();
  const duration = options.duration ?? null;
  const name = options.name ?? prompt.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40);
  const format = options.format ?? "mp3_44100_128";

  // Estimate credits
  const estimatedCredits = duration ? Math.ceil(duration) * 40 : 200;
  const remaining = checkBudget(budget, estimatedCredits);
  console.log(`Estimated cost: ${estimatedCredits} credits (${budget.totalCreditsUsed + estimatedCredits}/${budget.limit} after)`);
  console.log(`Budget remaining: ${remaining}`);

  const body = {
    text: prompt,
    model_id: "eleven_text_to_sound_v2",
    prompt_influence: options.promptInfluence ?? 0.3,
  };
  if (duration) body.duration_seconds = duration;
  if (options.loop) body.loop = true;

  console.log(`Generating SFX: "${prompt}" (${duration ? duration + "s" : "auto duration"})...`);

  const resp = await fetch(`https://api.elevenlabs.io/v1/sound-generation?output_format=${format}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`ElevenLabs API error ${resp.status}: ${err}`);
  }

  const buffer = Buffer.from(await resp.arrayBuffer());
  const ext = format.startsWith("mp3") ? "mp3" : format.startsWith("pcm") ? "wav" : "opus";
  const filename = `${name}.${ext}`;
  const outPath = path.join(SFX_DIR, filename);
  fs.writeFileSync(outPath, buffer);

  trackUsage(budget, estimatedCredits, "sfx", prompt, filename);
  console.log(`Saved: ${outPath} (${buffer.length} bytes)`);
  console.log(`Credits used: ${estimatedCredits} | Total: ${budget.totalCreditsUsed}/${budget.limit}`);
  return { path: outPath, filename, credits: estimatedCredits };
}

// ─── Music Generation ───────────────────────────────────────────

async function generateMusic(prompt, options = {}) {
  const apiKey = getApiKey();
  const budget = loadBudget();
  const durationMs = (options.duration ?? 30) * 1000;
  const name = options.name ?? prompt.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40);
  const format = options.format ?? "mp3_44100_128";

  // Music credits are harder to estimate — roughly 500 credits per minute
  const durationMin = Math.ceil(durationMs / 60000);
  const estimatedCredits = durationMin * 500;
  const remaining = checkBudget(budget, estimatedCredits);
  console.log(`Estimated cost: ~${estimatedCredits} credits (${budget.totalCreditsUsed + estimatedCredits}/${budget.limit} after)`);
  console.log(`Budget remaining: ${remaining}`);

  const body = {
    prompt,
    music_length_ms: durationMs,
    model_id: "music_v1",
    force_instrumental: options.instrumental !== false,
  };

  console.log(`Generating music: "${prompt}" (${options.duration ?? 30}s, instrumental: ${body.force_instrumental})...`);

  const resp = await fetch(`https://api.elevenlabs.io/v1/music?output_format=${format}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`ElevenLabs API error ${resp.status}: ${err}`);
  }

  const buffer = Buffer.from(await resp.arrayBuffer());
  const filename = `${name}.mp3`;
  const outPath = path.join(MUSIC_DIR, filename);
  fs.writeFileSync(outPath, buffer);

  trackUsage(budget, estimatedCredits, "music", prompt, filename);
  console.log(`Saved: ${outPath} (${buffer.length} bytes)`);
  console.log(`Credits used: ~${estimatedCredits} | Total: ${budget.totalCreditsUsed}/${budget.limit}`);
  return { path: outPath, filename, credits: estimatedCredits };
}

// ─── Music Plan (FREE — no credits) ────────────────────────────

async function planMusic(prompt) {
  const apiKey = getApiKey();

  console.log(`Planning composition: "${prompt}" (free, no credits)...`);

  const resp = await fetch("https://api.elevenlabs.io/v1/music/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
    body: JSON.stringify({ prompt }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`ElevenLabs API error ${resp.status}: ${err}`);
  }

  const plan = await resp.json();
  console.log("\nComposition Plan:");
  console.log(JSON.stringify(plan, null, 2));
  return plan;
}

// ─── CLI ────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

function getFlag(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : undefined;
}

if (command === "sfx") {
  const prompt = args[1];
  if (!prompt) { console.error("Usage: elevenlabs.js sfx \"prompt\" [--duration N] [--name name] [--loop]"); process.exit(1); }
  generateSFX(prompt, {
    duration: getFlag("duration") ? parseFloat(getFlag("duration")) : undefined,
    name: getFlag("name"),
    loop: args.includes("--loop"),
    promptInfluence: getFlag("influence") ? parseFloat(getFlag("influence")) : undefined,
  }).catch(e => { console.error(e.message); process.exit(1); });
} else if (command === "music") {
  const prompt = args[1];
  if (!prompt) { console.error("Usage: elevenlabs.js music \"prompt\" [--duration N] [--name name] [--instrumental]"); process.exit(1); }
  generateMusic(prompt, {
    duration: getFlag("duration") ? parseFloat(getFlag("duration")) : undefined,
    name: getFlag("name"),
    instrumental: !args.includes("--vocal"),
  }).catch(e => { console.error(e.message); process.exit(1); });
} else if (command === "plan") {
  const prompt = args[1];
  if (!prompt) { console.error("Usage: elevenlabs.js plan \"prompt\""); process.exit(1); }
  planMusic(prompt).catch(e => { console.error(e.message); process.exit(1); });
} else if (command === "budget") {
  const budget = loadBudget();
  console.log(`\nElevenLabs Budget:`);
  console.log(`  Used:      ${budget.totalCreditsUsed} credits`);
  console.log(`  Remaining: ${budget.limit - budget.totalCreditsUsed} credits`);
  console.log(`  Limit:     ${budget.limit} credits`);
  console.log(`  Generations: ${budget.generations.length}`);
  if (budget.generations.length > 0) {
    console.log(`\nRecent:`);
    budget.generations.slice(-5).forEach(g => {
      console.log(`  ${g.date.slice(0, 10)} ${g.type.padEnd(5)} ${g.credits.toString().padStart(5)} cr  ${g.filename}`);
    });
  }
} else {
  console.log(`ElevenLabs Audio Generator for Void Raiders

Commands:
  sfx   "prompt"  [--duration N] [--name name] [--loop] [--influence 0-1]
  music "prompt"  [--duration N] [--name name] [--vocal]
  plan  "prompt"  (free — preview composition structure)
  budget          (show credit usage)

Examples:
  node elevenlabs.js sfx "laser blast in space" --duration 2 --name weapon-laser
  node elevenlabs.js sfx "shield impact energy pulse" --duration 1 --name shield-hit
  node elevenlabs.js music "dark ambient space pirate theme" --duration 60 --name main-theme
  node elevenlabs.js plan "epic orchestral battle music with electronic undertones"
  node elevenlabs.js budget`);
}
