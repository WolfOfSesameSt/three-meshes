/**
 * Fairy Permaculture — minimal rustic HUD.
 *
 * Shows, at a glance:
 *   - Top-left:  day / season / year
 *   - Top-right: fairy count, fairy-food stocks (honey / milk / fruit), biomass, compost
 *   - Bottom-center: controls hint + goal-of-the-moment
 *
 * DOM-based (cheap, themable via `ui/theme.css`). Call `update()` from
 * the render loop or subscribe to scheduler/day-tick + fairy-food.
 */

export function createHud({ container, onSpeed }) {
  const root = document.createElement("div");
  root.id = "fp-hud";
  root.style.cssText = `
    position: absolute; inset: 0; pointer-events: none;
    font-family: Georgia, serif; color: #3A2815;
    z-index: 150;
  `;
  container.appendChild(root);

  // Speed control — bottom-left parchment strip, pointer-events enabled.
  const speedBar = document.createElement("div");
  speedBar.className = "parchment-panel";
  speedBar.style.cssText = `
    position: absolute; bottom: 14px; left: 14px;
    background: #F2E6C9; border: 2px solid #C9B88A;
    padding: 6px 10px; border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    display: flex; gap: 4px; align-items: center;
    pointer-events: auto;
    font-size: 12px;
  `;
  speedBar.innerHTML = `
    <div style="color:#8B6845; font-weight:bold; margin-right:6px;">SPEED</div>
    ${["⏸", "1×", "2×", "4×"].map((l, i) => {
      const val = [0, 1, 2, 4][i];
      return `<button data-speed="${val}" style="
        background:#E8D9B0; color:#3A2815;
        border:1px solid #8B6845; border-radius:3px;
        padding:4px 10px; cursor:pointer;
        font-family:Georgia, serif; font-size:12px;
        min-width:32px;
      ">${l}</button>`;
    }).join("")}
  `;
  root.appendChild(speedBar);
  const speedButtons = speedBar.querySelectorAll("button[data-speed]");
  speedButtons.forEach((btn) => {
    btn.onclick = () => {
      const v = parseInt(btn.dataset.speed, 10);
      onSpeed?.(v);
      updateSpeedHighlight(v);
    };
  });
  function updateSpeedHighlight(active) {
    speedButtons.forEach((btn) => {
      const on = parseInt(btn.dataset.speed, 10) === active;
      btn.style.background = on ? "#8B6845" : "#E8D9B0";
      btn.style.color = on ? "#F2E6C9" : "#3A2815";
      btn.style.fontWeight = on ? "bold" : "normal";
    });
  }
  updateSpeedHighlight(2);

  const tl = panel();
  tl.style.top = "14px";
  tl.style.left = "14px";
  root.appendChild(tl);

  const tr = panel();
  tr.style.top = "14px";
  tr.style.right = "14px";
  tr.style.minWidth = "220px";
  root.appendChild(tr);

  const bc = panel();
  bc.style.bottom = "14px";
  bc.style.left = "50%";
  bc.style.transform = "translateX(-50%)";
  bc.style.textAlign = "center";
  root.appendChild(bc);

  function panel() {
    const p = document.createElement("div");
    p.className = "parchment-panel";
    p.style.cssText += `
      position: absolute;
      background: #F2E6C9;
      border: 2px solid #C9B88A;
      padding: 10px 14px;
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
      font-size: 14px; line-height: 1.45;
      min-width: 160px;
    `;
    return p;
  }

  function render(snap) {
    tl.innerHTML = `
      <div style="font-weight: bold; font-size: 13px; color: #5C4429">Day ${snap.day + 1}</div>
      <div style="font-size: 12px; color: #8B6845;">${cap(snap.seasonName)} · Year ${snap.year + 1}</div>
    `;

    tr.innerHTML = `
      <div style="font-weight: bold; font-size: 13px; color: #5C4429;">Your Farm</div>
      <div>🧚 <b>${snap.fairyCount}</b> / ${snap.fairyCap} fairies</div>
      <div style="margin-top: 4px;">
        🍯 <b>${fmt(snap.honey)}</b>
        &nbsp; 🥛 <b>${fmt(snap.milk)}</b>
        &nbsp; 🍓 <b>${fmt(snap.fruit)}</b>
      </div>
      <div style="margin-top: 4px; font-size: 12px; color: #8B6845;">
        biomass ${fmt(snap.biomass)} &nbsp;|&nbsp; compost ${fmt(snap.compost)}
      </div>
    `;

    bc.innerHTML = `
      <div style="font-size: 13px; font-weight: bold; color: #5C4429;">${snap.goal ?? "Pick a berry. Build a pile. Start a farm."}</div>
      <div style="font-size: 12px; color: #8B6845; margin-top: 4px;">
        click a bush to harvest &nbsp;·&nbsp;
        click a fairy to assign a role &nbsp;·&nbsp;
        <b>WASD</b> move camera &nbsp;·&nbsp;
        <b>wheel</b> zoom &nbsp;·&nbsp;
        <b>T</b> tree &nbsp;·&nbsp;
        <b>Ctrl+S</b> save
      </div>
    `;
  }

  function dispose() {
    root.remove();
  }

  return { root, render, dispose, setSpeedHighlight: updateSpeedHighlight };
}

function cap(s) {
  return (s ?? "").replace(/^\w/, (c) => c.toUpperCase());
}

function fmt(n) {
  if (n == null) return "0";
  if (n < 10) return n.toFixed(1);
  return Math.round(n).toString();
}
