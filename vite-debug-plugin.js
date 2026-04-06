/**
 * Vite plugin: receives debug logs from the browser and writes to .debug-log
 */

import { writeFileSync, appendFileSync } from "fs";

export function debugLogPlugin() {
  const LOG_FILE = ".debug-log";

  return {
    name: "debug-log",
    configureServer(server) {
      // Clear log on server start
      writeFileSync(LOG_FILE, `--- Debug log started ${new Date().toISOString()} ---\n`);

      server.middlewares.use("/__debug_log", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }

        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          try {
            const entries = JSON.parse(body);
            const lines = entries.map(e => {
              const tag = e.level === "log" ? "LOG" : e.level === "warn" ? "WRN" : "ERR";
              const time = e.time?.split("T")[1]?.slice(0, 12) || "";
              return `[${time}] ${tag}: ${e.msg}`;
            }).join("\n") + "\n";
            appendFileSync(LOG_FILE, lines);
          } catch (err) {
            appendFileSync(LOG_FILE, `[parse-error] ${body}\n`);
          }
          res.statusCode = 200;
          res.end("ok");
        });
      });
    },
  };
}
