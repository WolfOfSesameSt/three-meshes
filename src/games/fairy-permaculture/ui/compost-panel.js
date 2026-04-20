/**
 * Fairy Permaculture — compost pile inspector + action panel.
 *
 * Surfaces the pile's internal state so the player can read + react to
 * it: C:N balance, moisture, temperature, volume, turn count, quality
 * forecast, and the current phase. Provides explicit action buttons
 * for each interaction so the underlying state machine is visible.
 *
 * Shows when you click a compost pile. Dismiss with Escape or the ✕.
 */

import { computeQuality } from "../compost/quality.js";
import { mixCN, mixMoisture } from "../compost/ingredients.js";

const STATE_COPY = {
  empty:         { icon: "◌", text: "Empty",        hint: "Drop greens + browns to start the pile." },
  filling:       { icon: "↑", text: "Filling",      hint: "Keep adding — aim for 20–40:1 C:N and 50–65 % moisture." },
  triggered:     { icon: "•", text: "Warming",      hint: "Thermophiles waking up. Don't disturb yet." },
  hot:           { icon: "♨", text: "Hot",          hint: "Thermophilic decomposition. Water if it dries out." },
  "turn-window": { icon: "↻", text: "Turn now",     hint: "The turn window is open — click Turn to mix." },
  cooling:       { icon: "↓", text: "Cooling",      hint: "Cooking is done. Nearly there." },
  curing:        { icon: "⏳", text: "Curing",       hint: "Mellow fungal activity. Hands off." },
  finished:      { icon: "✦", text: "Finished",     hint: "Ready to harvest. Click Scoop." },
  anaerobic:     { icon: "✗", text: "Anaerobic",    hint: "Too wet. Add browns + cover to recover." },
  stalled:       { icon: "✗", text: "Stalled",      hint: "Too dry. Add moisture (water)." },
  "ammonia-loss":{ icon: "✗", text: "Ammonia loss", hint: "Too much N. Add browns to balance." },
};

export function createCompostPanel({ container, camera, onAction }) {
  const root = document.createElement("div");
  root.id = "fp-compost-panel";
  root.style.cssText = `
    position: absolute; z-index: 220;
    min-width: 300px; max-width: 340px;
    padding: 12px 14px;
    background: #F2E6C9; border: 2px solid #C9B88A;
    border-radius: 6px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.3);
    font-family: Georgia, serif; color: #3A2815;
    font-size: 13px; line-height: 1.5;
    display: none;
    pointer-events: auto;
  `;
  container.appendChild(root);

  let currentPile = null;
  let currentMesh = null;

  function hide() {
    root.style.display = "none";
    currentPile = null;
    currentMesh = null;
  }

  function show(pile, mesh) {
    currentPile = pile;
    currentMesh = mesh;
    render();
    root.style.display = "block";
    reposition();
  }

  function bar(pct, color, band) {
    pct = Math.max(0, Math.min(100, pct));
    const bandStart = band ? band[0] : null;
    const bandEnd = band ? band[1] : null;
    return `
      <div style="position:relative; height:10px; background:#E8D9B0; border:1px solid #C9B88A; border-radius:3px; margin:2px 0 4px 0;">
        ${band ? `<div style="position:absolute; left:${bandStart}%; width:${bandEnd - bandStart}%; top:0; height:100%; background:rgba(138,196,122,0.35);"></div>` : ""}
        <div style="position:absolute; left:0; top:0; height:100%; width:${pct}%; background:${color}; border-radius:3px;"></div>
      </div>
    `;
  }

  function render() {
    const p = currentPile;
    if (!p) return;

    const state = p.state ?? "empty";
    const copy = STATE_COPY[state] ?? { icon: "?", text: state, hint: "" };

    // C:N in [10, 80] range for display; band [20, 40] is the hot-happy zone.
    const cn = Number.isFinite(p.currentCN) ? p.currentCN : 20;
    const cnPct = Math.max(0, Math.min(100, ((cn - 10) / 70) * 100));
    const moisture = Number.isFinite(p.moisturePct) ? p.moisturePct : 0;
    const temp = Number.isFinite(p.tempC) ? p.tempC : 15;
    const tempPct = Math.max(0, Math.min(100, (temp / 70) * 100));
    const volume = p.volumeM3 ?? 0;
    const volPct = Math.min(100, (volume / 2) * 100);
    const turns = p.turnsTotal ?? 0;

    // Quality forecast — run computeQuality against the live tracker.
    const q = computeQuality({
      hotDays: p.qualityTracker?.hotDays ?? 0,
      cnInBandDays: p.qualityTracker?.cnInBandDays ?? 0,
      moistureInBandDays: p.qualityTracker?.moistureInBandDays ?? 0,
      turnsTotal: turns,
      inoculantIds: p.qualityTracker?.inoculantIds ?? [],
      curingCompleted: p.qualityTracker?.curingCompleted ?? false,
      earlyHarvested: false,
      ammoniaFlag: p.qualityTracker?.ammoniaFlag ?? false,
      anaerobicFlag: p.qualityTracker?.anaerobicFlag ?? false,
    });

    const isTurnWindow = state === "turn-window";
    const isFinished = state === "finished";
    const canFeed = state === "empty" || state === "filling" || state === "anaerobic" || state === "ammonia-loss";
    const canWater = state !== "finished";

    root.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:baseline; gap:8px;">
        <div style="font-weight:bold; font-size:14px; color:#5C4429;">
          ${copy.icon} Compost Pile — ${copy.text}
        </div>
        <button data-act="close" title="Close (Esc)" style="
          background:#E8D9B0; border:1px solid #8B6845;
          cursor:pointer; font-size:16px; color:#3A2815;
          padding:2px 10px; border-radius:3px;
          min-width:28px; min-height:24px;
          font-family:Georgia, serif; line-height:1;
        ">✕</button>
      </div>
      <div style="font-size:12px; color:#8B6845; font-style:italic; margin-top:2px;">${copy.hint}</div>

      <div style="margin-top:8px;">
        <div style="font-size:11px; color:#5C4429;">C:N <b>${cn.toFixed(0)}:1</b> <span style="color:#8B6845;">(sweet 20–40)</span></div>
        ${bar(cnPct, "#8BC47A", [((20 - 10) / 70) * 100, ((40 - 10) / 70) * 100])}

        <div style="font-size:11px; color:#5C4429;">Moisture <b>${moisture.toFixed(0)}%</b> <span style="color:#8B6845;">(sweet 50–65)</span></div>
        ${bar(moisture, "#B8D8E8", [50, 65])}

        <div style="font-size:11px; color:#5C4429;">Temperature <b>${temp.toFixed(0)}°C</b></div>
        ${bar(tempPct, "#F28E74")}

        <div style="font-size:11px; color:#5C4429;">Volume <b>${volume.toFixed(2)} m³</b> <span style="color:#8B6845;">(≥1 m³ to heat)</span></div>
        ${bar(volPct, "#7A5C48")}
      </div>

      <div style="margin-top:8px; display:flex; justify-content:space-between; font-size:12px; color:#5C4429;">
        <div>Turns <b>${turns}</b>${turns >= 4 ? " <span style='color:#7A9A5A;'>· cooked</span>" : ""}</div>
        <div>Quality <b>${"★".repeat(q.stars)}${"☆".repeat(5 - q.stars)}</b></div>
      </div>

      <div style="margin-top:10px; border-top:1px solid #C9B88A; padding-top:8px;">
        <div style="font-size:11px; color:#8B6845; margin-bottom:6px;">ADD MATERIAL</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
          <button data-act="greens" ${canFeed ? "" : "disabled"} style="${btn(canFeed, "#B8D8A0")}">
            <div style="font-weight:bold;">+ Greens</div>
            <div style="font-size:10px; font-weight:normal; opacity:0.85;">fresh grass · <b>15:1</b> · wet</div>
            ${projectionLine(p, "fresh-grass", 100)}
          </button>
          <button data-act="browns" ${canFeed ? "" : "disabled"} style="${btn(canFeed, "#D8B084")}">
            <div style="font-weight:bold;">+ Browns</div>
            <div style="font-size:10px; font-weight:normal; opacity:0.85;">dry leaves · <b>60:1</b> · dry</div>
            ${projectionLine(p, "dry-leaves", 90)}
          </button>
        </div>
        <div style="text-align:center; font-size:10px; color:#8B6845; margin-top:4px;">
          ≈ 2 greens : 1 brown by mass keeps C:N in the hot band (20–40)
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:8px;">
          <button data-act="inoculant" ${canFeed ? "" : "disabled"} style="${btn(canFeed)}">+ Inoculant</button>
          <button data-act="water"  ${canWater ? "" : "disabled"} style="${btn(canWater)}">Water</button>
          <button data-act="cover"  style="${btn(true)}">${p.covered ? "Uncover" : "Cover"}</button>
          <button data-act="turn" ${isTurnWindow ? "" : "disabled"} style="${btn(isTurnWindow, "#C47A74")}">Turn${isTurnWindow ? " ↻" : ""}</button>
        </div>
        <button data-act="harvest" ${isFinished ? "" : "disabled"} style="${btn(isFinished, "#8BC47A")}; width:100%; margin-top:6px;">
          ${isFinished ? `Scoop ${"★".repeat(q.stars)} Compost` : "Scoop (not ready)"}
        </button>
      </div>
    `;

    wireButtons();
  }

  function btn(active, accent) {
    const bg = active ? (accent ?? "#E8D9B0") : "#D7C9A3";
    const col = active ? "#3A2815" : "#8B6845";
    const cur = active ? "pointer" : "not-allowed";
    return `
      background:${bg}; color:${col};
      border:1px solid #8B6845; border-radius:3px;
      padding:6px 8px; font-family:Georgia, serif; font-size:12px;
      cursor:${cur};
      ${active ? "" : "opacity:0.55;"}
    `;
  }

  // One-time event delegation — survives re-renders so the ✕ button
  // remains clickable even though `render()` rebuilds innerHTML every
  // frame. Previously the button was replaced between mousedown and
  // mouseup, killing the click event.
  root.addEventListener("click", (ev) => {
    const btnEl = ev.target.closest("button[data-act]");
    if (!btnEl || btnEl.disabled) return;
    const act = btnEl.dataset.act;
    if (act === "close") { hide(); return; }
    onAction?.(act, currentPile, currentMesh);
    render();
  });
  function wireButtons() { /* no-op — handled by delegation above */ }

  function reposition() {
    if (!currentMesh) return;
    const v = currentMesh.position.clone();
    v.y += 3;
    v.project(camera);
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    root.style.left = `${Math.max(8, Math.min(window.innerWidth - 340, x + 30))}px`;
    root.style.top = `${Math.max(8, Math.min(window.innerHeight - 360, y - 100))}px`;
  }

  function tick() {
    if (currentPile) {
      render();
      reposition();
    }
    requestAnimationFrame(tick);
  }
  tick();

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hide();
  });

  return { show, hide, get isOpen() { return root.style.display !== "none"; } };
}

/**
 * Render a small "→ 23:1 · 58%" preview showing what the pile's mix
 * would look like if you hypothetically added this ingredient.
 * Colours green when the projected values land in the hot band.
 */
function projectionLine(pile, id, dryMassKg) {
  try {
    const existing = pile.ingredients ?? [];
    const projected = [...existing, { id, dryMassKg }];
    const cn = mixCN(projected);
    const m = mixMoisture(projected);
    const cnGood = cn >= 20 && cn <= 40;
    const mGood = m >= 50 && m <= 65;
    const cnColor = cnGood ? "#5A7A4B" : "#A0673A";
    const mColor = mGood ? "#5A7A4B" : "#A0673A";
    return `<div style="font-size:10px; font-weight:normal; opacity:0.95; margin-top:2px;">
      → <span style="color:${cnColor};"><b>${cn.toFixed(0)}:1</b></span>
      &nbsp;<span style="color:${mColor};"><b>${m.toFixed(0)}%</b></span>
    </div>`;
  } catch {
    return "";
  }
}
