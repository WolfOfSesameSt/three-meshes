/**
 * Debug client: hooks console.log/warn/error and POSTs them
 * to the Vite dev server, which writes them to a log file.
 * Import this at the top of any entry point to enable.
 */

const LOG_ENDPOINT = "/__debug_log";
const BUFFER_INTERVAL = 500; // ms — batch logs to avoid spam
let buffer = [];

function send() {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0);
  fetch(LOG_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(batch),
  }).catch(() => {}); // silently fail if server is down
}

setInterval(send, BUFFER_INTERVAL);

function hook(level) {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    original(...args);
    const msg = args.map(a => {
      if (a instanceof Error) return `${a.message}\n${a.stack}`;
      if (typeof a === "object") try { return JSON.stringify(a); } catch { return String(a); }
      return String(a);
    }).join(" ");
    buffer.push({ level, msg, time: new Date().toISOString() });
  };
}

hook("log");
hook("warn");
hook("error");

// Capture uncaught errors
window.addEventListener("error", (e) => {
  buffer.push({ level: "error", msg: `UNCAUGHT: ${e.message} at ${e.filename}:${e.lineno}:${e.colno}`, time: new Date().toISOString() });
  send(); // flush immediately on error
});

window.addEventListener("unhandledrejection", (e) => {
  buffer.push({ level: "error", msg: `UNHANDLED PROMISE: ${e.reason}`, time: new Date().toISOString() });
  send();
});

console.log("[debug] Browser console capture active — logs written to .debug-log");
