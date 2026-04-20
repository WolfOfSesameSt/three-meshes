/**
 * Fairy Permaculture — event UI notifications (C6.1, MVP).
 *
 * For MVP this is deliberately minimal: console.log + a single
 * auto-hiding parchment toast in the rustic theme. UX agent will
 * expand this into a full scroll-unroll animation during C6.3.
 *
 * Exports `notifyEvent(event, severityMultiplier, opts)` — safe to
 * call in a headless/test environment (no-ops if `document` is
 * undefined).
 */

const TOAST_VISIBLE_MS = 6000;

function ensureToastContainer(doc) {
  let c = doc.getElementById("fp-event-toasts");
  if (c) return c;
  c = doc.createElement("div");
  c.id = "fp-event-toasts";
  c.style.cssText = [
    "position: fixed",
    "top: 12px",
    "right: 12px",
    "z-index: 10000",
    "display: flex",
    "flex-direction: column",
    "gap: 8px",
    "pointer-events: none",
  ].join(";");
  doc.body.appendChild(c);
  return c;
}

function toastHtml(event, severity) {
  const sevLabel =
    severity >= 0.8 ? "severe" : severity >= 0.4 ? "moderate" : "mild";
  return `
    <div style="font-weight:bold;margin-bottom:4px">${event.name}</div>
    <div style="font-size:12px;line-height:1.35">${event.description}</div>
    <div style="font-size:11px;margin-top:6px;opacity:0.7">Severity: ${sevLabel}</div>
  `;
}

export function notifyEvent(event, severityMultiplier = 1, opts = {}) {
  const logger = opts.logger ?? console;
  logger.log?.(
    `[fp:event] ${event.id} fired — severity=${severityMultiplier.toFixed(2)}`
  );

  const doc = opts.document ?? (typeof document !== "undefined" ? document : null);
  if (!doc || !doc.body) return; // headless / tests

  const container = ensureToastContainer(doc);
  const toast = doc.createElement("div");
  toast.className = "parchment-panel fp-event-toast";
  toast.style.cssText = [
    "min-width: 240px",
    "max-width: 320px",
    "pointer-events: auto",
    "background: var(--parchment, #F2E6C9)",
    "border: 2px solid var(--parchment-edge, #C9B88A)",
    "color: var(--ink, #3A2815)",
    "padding: 10px 14px",
    "border-radius: 4px",
    "box-shadow: 0 4px 12px rgba(0,0,0,0.25)",
    "opacity: 0",
    "transition: opacity 240ms ease-in-out",
    "font-family: Georgia, serif",
  ].join(";");
  toast.innerHTML = toastHtml(event, severityMultiplier);
  container.appendChild(toast);
  // Next frame → fade in.
  requestAnimationFrame?.(() => {
    toast.style.opacity = "1";
  });

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, opts.visibleMs ?? TOAST_VISIBLE_MS);
}

export function notifyEventEnded(event, opts = {}) {
  const logger = opts.logger ?? console;
  logger.log?.(`[fp:event] ${event.id} resolved`);
}
