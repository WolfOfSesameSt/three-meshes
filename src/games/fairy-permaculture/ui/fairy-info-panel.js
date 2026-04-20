/**
 * Fairy Permaculture — fairy info + nudge popup.
 *
 * Click a fairy → shows name / role / level / XP and a short nudge menu.
 * Floats next to the fairy's projected screen position; dismissible.
 */

import * as THREE from "three";

export function createFairyInfoPanel({ container, camera }) {
  const root = document.createElement("div");
  root.id = "fp-fairy-info";
  root.style.cssText = `
    position: absolute; z-index: 220;
    min-width: 220px; padding: 10px 14px;
    background: #F2E6C9; border: 2px solid #C9B88A;
    border-radius: 6px; box-shadow: 0 6px 16px rgba(0,0,0,0.28);
    font-family: Georgia, serif; color: #3A2815;
    font-size: 13px; line-height: 1.5;
    display: none;
    pointer-events: auto;
  `;
  container.appendChild(root);

  let currentFairy = null;

  function hide() {
    root.style.display = "none";
    currentFairy = null;
  }

  function show(fairy) {
    currentFairy = fairy;
    root.innerHTML = renderHtml(fairy);
    root.style.display = "block";
    wireButtons(fairy);
    reposition();
  }

  function renderHtml(f) {
    const roleLine = f.role ? `${cap(f.role)}` : "Unassigned";
    const xpLine = f.role
      ? `${f.xp ?? 0} XP &middot; Lv ${levelFromXp(f.xp ?? 0)}`
      : "idle in the Fairy Grove";
    const cd = f.cooldownDaysLeft ?? 0;
    return `
      <div style="display:flex; justify-content:space-between; align-items:baseline; gap:8px;">
        <div style="font-weight:bold; font-size:14px; color:#5C4429;">🧚 ${escape(f.name ?? "Fairy")}</div>
        <button data-act="close" style="background:none; border:none; cursor:pointer; font-size:14px; color:#8B6845;">✕</button>
      </div>
      <div style="font-size:12px; color:#8B6845; margin-top:2px;">${escape(roleLine)}</div>
      <div style="font-size:12px; color:#8B6845;">${escape(xpLine)}</div>
      ${cd > 0 ? `<div style="font-size:11px; color:#A0673A; margin-top:4px;">cooling down ${cd}d</div>` : ""}
      <div style="margin-top:10px; border-top:1px solid #C9B88A; padding-top:8px;">
        <div style="font-size:11px; color:#8B6845; margin-bottom:6px;">ASSIGN ROLE</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px;">
          ${["composter","harvester","forager","builder","digger","beekeeper","shepherd","healer"]
            .map((r) => `<button data-act="role" data-role="${r}" style="${btnStyle(r === f.role)}">${cap(r)}</button>`)
            .join("")}
        </div>
      </div>
    `;
  }

  function btnStyle(active) {
    return `
      background: ${active ? "#8B6845" : "#E8D9B0"};
      color: ${active ? "#F2E6C9" : "#3A2815"};
      border: 1px solid #8B6845;
      border-radius: 3px; padding: 5px 6px;
      font-family: Georgia, serif; font-size: 11px;
      cursor: ${active ? "default" : "pointer"};
    `;
  }

  function wireButtons(fairy) {
    root.querySelector('[data-act="close"]').onclick = hide;
    root.querySelectorAll('[data-act="role"]').forEach((btn) => {
      btn.onclick = () => {
        const role = btn.dataset.role;
        if (role === fairy.role) return;
        const fleet = window.__FP__?.fleet;
        fleet?.assignRole?.(fairy, role);
        show(fairy); // re-render
      };
    });
  }

  function reposition() {
    if (!currentFairy) return;
    const fairyMesh = currentFairy.mesh;
    if (!fairyMesh) return;
    const v = fairyMesh.position.clone();
    v.y += 2;
    v.project(camera);
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    root.style.left = `${Math.max(8, Math.min(window.innerWidth - 240, x + 20))}px`;
    root.style.top = `${Math.max(8, Math.min(window.innerHeight - 240, y - 80))}px`;
  }

  // Reposition each frame so the panel follows if the camera pans.
  function tick() {
    reposition();
    requestAnimationFrame(tick);
  }
  tick();

  // Dismiss on escape.
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hide();
  });

  return { show, hide, get current() { return currentFairy; } };
}

function cap(s) {
  return (s ?? "").replace(/^\w/, (c) => c.toUpperCase());
}
function escape(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
}
function levelFromXp(xp) {
  const curve = [0, 20, 60, 140, 300];
  let l = 1;
  for (let i = 0; i < curve.length; i++) if (xp >= curve[i]) l = i + 1;
  return Math.min(5, l);
}
