/**
 * Vite dev-server plugin for the hardpoint editor's "Commit to repo" button.
 *
 * Exposes one endpoint:
 *   POST /__hardpoint/commit  body = { modelId, config }
 *     → writes public/ships/<modelId>.json with the config JSON
 *     → returns { ok: true, path: "public/ships/<modelId>.json" }
 *
 * Model ID is sanitized server-side so an attacker can't traverse the
 * file system via a crafted body. Only alphanumerics, dashes, and
 * underscores are allowed.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../../../..");
const SHIPS_DIR = path.join(PROJECT_ROOT, "public/ships");

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

function sanitizeModelId(id) {
  if (typeof id !== "string") return null;
  const cleaned = id.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!cleaned || cleaned.length > 64) return null;
  return cleaned;
}

export function hardpointPlugin() {
  return {
    name: "void-raiders-hardpoint-commit",
    configureServer(server) {
      server.middlewares.use("/__hardpoint/commit", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          return res.end();
        }
        try {
          const body = await readBody(req);
          const modelId = sanitizeModelId(body.modelId);
          if (!modelId) {
            return sendJson(res, 400, { error: "invalid modelId" });
          }
          if (!body.config || typeof body.config !== "object") {
            return sendJson(res, 400, { error: "config must be an object" });
          }
          fs.mkdirSync(SHIPS_DIR, { recursive: true });
          const outPath = path.join(SHIPS_DIR, `${modelId}.json`);
          fs.writeFileSync(outPath, JSON.stringify(body.config, null, 2));
          const relPath = path.relative(PROJECT_ROOT, outPath);
          sendJson(res, 200, {
            ok: true,
            path: relPath,
            bytes: fs.statSync(outPath).size,
          });
        } catch (e) {
          sendJson(res, 500, { error: e.message });
        }
      });
    },
  };
}
