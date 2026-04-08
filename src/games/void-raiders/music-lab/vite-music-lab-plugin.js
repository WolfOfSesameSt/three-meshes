/**
 * Vite dev-server plugin for the Void Raiders Music Laboratory.
 *
 * Exposes three endpoints under /__music_lab:
 *   GET  /__music_lab/list      → { files: [...], budget: {...} }
 *   POST /__music_lab/plan      → { plan: {...} }   (free, previews structure)
 *   POST /__music_lab/generate  → { filename, credits, budget }
 *
 * The endpoints shell out to the existing elevenlabs.js CLI, so the
 * lab shares the exact same code path (and budget tracking) as the
 * `npm run music` command.
 */

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../../../..");
const MUSIC_DIR = path.join(PROJECT_ROOT, "public/audio/music");
const BUDGET_FILE = path.join(PROJECT_ROOT, "public/audio/.budget.json");
const ELEVENLABS_SCRIPT = path.join(PROJECT_ROOT, "src/games/void-raiders/audio/elevenlabs.js");

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function loadBudget() {
  if (!fs.existsSync(BUDGET_FILE)) {
    return { totalCreditsUsed: 0, limit: 50000, generations: [] };
  }
  return JSON.parse(fs.readFileSync(BUDGET_FILE, "utf-8"));
}

/** List every .mp3 in public/audio/music/ along with its generation metadata. */
function listMusicFiles() {
  if (!fs.existsSync(MUSIC_DIR)) return [];
  const budget = loadBudget();
  const musicGens = budget.generations.filter((g) => g.type === "music");

  return fs
    .readdirSync(MUSIC_DIR)
    .filter((f) => f.endsWith(".mp3"))
    .map((filename) => {
      const fullPath = path.join(MUSIC_DIR, filename);
      const stat = fs.statSync(fullPath);
      // Match on filename — most recent generation wins if duplicates exist
      const gens = musicGens.filter((g) => g.filename === filename);
      const latest = gens[gens.length - 1];
      return {
        filename,
        url: `/audio/music/${filename}`,
        sizeBytes: stat.size,
        mtime: stat.mtime.toISOString(),
        prompt: latest?.prompt ?? null,
        generatedAt: latest?.date ?? null,
        credits: latest?.credits ?? null,
      };
    })
    .sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
}

/** Run the elevenlabs.js CLI as a child process and stream stdout/stderr. */
function runElevenLabs(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn("node", [ELEVENLABS_SCRIPT, ...args], {
      cwd: PROJECT_ROOT,
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || stdout || `elevenlabs.js exited ${code}`));
    });
  });
}

function sanitizeFilename(name) {
  // Reuse the same slug rules as elevenlabs.js so names stay consistent
  return name.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40).replace(/^-|-$/g, "");
}

export function musicLabPlugin() {
  return {
    name: "void-raiders-music-lab",
    configureServer(server) {
      server.middlewares.use("/__music_lab/list", (req, res) => {
        if (req.method !== "GET") { res.statusCode = 405; return res.end(); }
        try {
          sendJson(res, 200, {
            files: listMusicFiles(),
            budget: loadBudget(),
          });
        } catch (e) {
          sendJson(res, 500, { error: e.message });
        }
      });

      server.middlewares.use("/__music_lab/plan", async (req, res) => {
        if (req.method !== "POST") { res.statusCode = 405; return res.end(); }
        try {
          const body = await readBody(req);
          const prompt = (body.prompt || "").trim();
          if (!prompt) return sendJson(res, 400, { error: "prompt required" });
          const { stdout } = await runElevenLabs(["plan", prompt]);
          // The CLI prints "Composition Plan:\n{...json...}". Extract the JSON.
          const jsonStart = stdout.indexOf("{");
          let plan = null;
          if (jsonStart >= 0) {
            try { plan = JSON.parse(stdout.slice(jsonStart)); } catch {}
          }
          sendJson(res, 200, { plan, raw: stdout });
        } catch (e) {
          sendJson(res, 500, { error: e.message });
        }
      });

      server.middlewares.use("/__music_lab/generate", async (req, res) => {
        if (req.method !== "POST") { res.statusCode = 405; return res.end(); }
        try {
          const body = await readBody(req);
          const prompt = (body.prompt || "").trim();
          const duration = Number(body.duration) || 30;
          const name = sanitizeFilename(body.name || prompt);
          if (!prompt) return sendJson(res, 400, { error: "prompt required" });
          if (!name) return sendJson(res, 400, { error: "name required" });
          if (duration < 10 || duration > 300) {
            return sendJson(res, 400, { error: "duration must be 10–300 seconds" });
          }

          const args = ["music", prompt, "--duration", String(duration), "--name", name];
          const { stdout } = await runElevenLabs(args);

          // Re-read the budget to get the fresh entry the CLI just wrote
          const budget = loadBudget();
          const latest = budget.generations[budget.generations.length - 1];

          sendJson(res, 200, {
            filename: `${name}.mp3`,
            url: `/audio/music/${name}.mp3`,
            credits: latest?.credits ?? null,
            budget,
            log: stdout,
          });
        } catch (e) {
          sendJson(res, 500, { error: e.message });
        }
      });
    },
  };
}
