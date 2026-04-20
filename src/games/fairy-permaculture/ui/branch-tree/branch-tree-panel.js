/**
 * Fairy Permaculture — Branch Tree panel (C3.2).
 *
 * Classic tech-tree grid on parchment. One column per branch (root +
 * 7 branches + climax), one row per tier depth computed from the
 * longest prerequisite chain. Lines drawn between nodes for prereq
 * edges. Unlocked = full-color; available = gently pulsing amber;
 * locked = greyscale.
 *
 * Usage:
 *   import { createBranchTreePanel } from "./ui/branch-tree/branch-tree-panel.js";
 *   const panel = createBranchTreePanel({ state, bus });
 *   panel.mount(document.body);
 *   // Press T to toggle (already wired inside mount()).
 */

import "./branch-tree-panel.css";
import {
  getAllBranches,
  getAllNodes,
  getNode,
  snapshot,
  isAvailable,
  isUnlocked,
  unlock,
} from "../../progression/tree-state.js";
import { EVENTS } from "../../progression/events.js";

// ─── Static layout: tier per node (longest-prereq-chain depth) ────

/**
 * Tier = 0 for zero-prereq nodes (r1), otherwise 1 + max(tier of prereqs).
 * Climax nodes live in the climax column; their tier is computed the
 * same way so they slot into a shared row system.
 */
const NODE_TIER = (() => {
  const tier = new Map();
  function resolve(id) {
    if (tier.has(id)) return tier.get(id);
    const n = getNode(id);
    if (!n) return 0;
    if (n.prerequisites.length === 0) {
      tier.set(id, 0);
      return 0;
    }
    const t = 1 + Math.max(...n.prerequisites.map(resolve));
    tier.set(id, t);
    return t;
  }
  for (const n of getAllNodes()) resolve(n.id);
  return tier;
})();

const MAX_TIER = Math.max(0, ...NODE_TIER.values());

// ─── Panel factory ────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {object} opts.state  — tree-state returned from createTreeState()
 * @param {object} [opts.bus]  — event bus; if passed, unlock is routed through it
 * @param {string} [opts.toggleKey] — default "t"
 */
export function createBranchTreePanel({ state, bus = null, toggleKey = "t" }) {
  const root = document.createElement("div");
  root.className = "fp-branch-tree";
  root.dataset.open = "false";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Food-Chain Branch Tree");

  root.innerHTML = `
    <div class="fp-branch-tree__backdrop"></div>
    <div class="fp-branch-tree__frame">
      <div class="fp-branch-tree__main">
        <div class="fp-branch-tree__header">
          <div class="fp-branch-tree__title">Food-Chain Tree</div>
          <div class="fp-branch-tree__hint">Press T to close</div>
        </div>
        <div class="fp-branch-tree__grid-scroll">
          <div class="fp-branch-tree__grid"></div>
        </div>
      </div>
      <div class="fp-branch-tree__sidebar">
        <div class="fp-branch-tree__sidebar-title" data-role="name">Pick a node</div>
        <div class="fp-branch-tree__sidebar-branch" data-role="branch"></div>
        <div class="fp-branch-tree__sidebar-body" data-role="description">
          Click any node in the tree to see its description and prerequisites.
        </div>
        <dl class="fp-branch-tree__sidebar-meta" data-role="meta"></dl>
        <button class="fp-branch-tree__sidebar-action" data-role="action" disabled>Locked</button>
      </div>
      <button class="fp-branch-tree__close" data-role="close" title="Close (T)">×</button>
    </div>
  `;

  const grid = root.querySelector(".fp-branch-tree__grid");
  const sidebar = {
    name: root.querySelector('[data-role="name"]'),
    branch: root.querySelector('[data-role="branch"]'),
    description: root.querySelector('[data-role="description"]'),
    meta: root.querySelector('[data-role="meta"]'),
    action: root.querySelector('[data-role="action"]'),
  };
  const closeBtn = root.querySelector('[data-role="close"]');

  let selectedNodeId = null;
  const nodeEls = new Map(); // nodeId -> HTMLElement
  let svgLines = null;

  // ─── Grid construction ─────────────────────────────────────────

  function buildGrid() {
    grid.innerHTML = "";
    nodeEls.clear();

    // One column per branch container.
    for (const branch of getAllBranches()) {
      const col = document.createElement("div");
      col.className = "fp-branch-tree__column";
      col.dataset.branchId = branch.id;
      col.dataset.kind = branch.kind;

      const header = document.createElement("div");
      header.className = "fp-branch-tree__column-header";
      header.textContent = branch.name;
      col.appendChild(header);

      // Build a tier -> node map for this branch.
      const nodesByTier = new Map();
      for (const id of branch.nodeIds) {
        const t = NODE_TIER.get(id) ?? 0;
        if (!nodesByTier.has(t)) nodesByTier.set(t, []);
        nodesByTier.get(t).push(id);
      }

      for (let t = 0; t <= MAX_TIER; t++) {
        const ids = nodesByTier.get(t) ?? [];
        if (ids.length === 0) {
          const spacer = document.createElement("div");
          spacer.className = "fp-branch-tree__tier fp-branch-tree__tier--spacer";
          col.appendChild(spacer);
          continue;
        }
        // In this tree each (branch, tier) contains at most one node.
        // Root has r1 at tier 0 and r2/r3/r4 all at tier 1 — we stack
        // them; treat the remaining tier slot with extra cells.
        for (const id of ids) {
          const slot = document.createElement("div");
          slot.className = "fp-branch-tree__tier";
          const nodeEl = buildNodeEl(id);
          slot.appendChild(nodeEl);
          col.appendChild(slot);
          nodeEls.set(id, nodeEl);
        }
        // If a tier has multiple nodes (root tier 1), the other branches
        // need matching spacers to keep rows aligned.
      }

      grid.appendChild(col);
    }

    // Align tier rows across columns: if the root column is taller
    // than the others (r2/r3/r4 stacked), insert spacer slots in the
    // shorter columns so horizontal tiers stay readable. Simpler
    // approach: count the maximum slot count per column and pad.
    const maxSlots = Math.max(
      ...[...grid.children].map((c) => c.querySelectorAll(".fp-branch-tree__tier").length)
    );
    for (const col of grid.children) {
      const cur = col.querySelectorAll(".fp-branch-tree__tier").length;
      for (let i = cur; i < maxSlots; i++) {
        const spacer = document.createElement("div");
        spacer.className = "fp-branch-tree__tier fp-branch-tree__tier--spacer";
        col.appendChild(spacer);
      }
    }

    // Create the SVG overlay for prereq lines. Placed last so it sits
    // on top in the DOM but with z-index:0 to stay under nodes.
    svgLines = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgLines.setAttribute("class", "fp-branch-tree__lines");
    grid.appendChild(svgLines);
  }

  function buildNodeEl(id) {
    const node = getNode(id);
    const el = document.createElement("button");
    el.type = "button";
    el.className = "fp-branch-tree__node";
    el.dataset.nodeId = id;
    el.innerHTML = `
      <div class="fp-branch-tree__node-id">${id.toUpperCase()}</div>
      <div class="fp-branch-tree__node-name">${escapeHtml(node.name)}</div>
    `;
    el.addEventListener("click", () => selectNode(id));
    return el;
  }

  // ─── State → DOM sync ──────────────────────────────────────────

  function refresh() {
    const snap = snapshot(state);
    for (const n of snap) {
      const el = nodeEls.get(n.id);
      if (!el) continue;
      el.dataset.status = n.status;
      el.dataset.selected = selectedNodeId === n.id ? "true" : "false";
    }
    drawLines();
    updateSidebar();
  }

  function drawLines() {
    if (!svgLines) return;
    // Defer to next frame so layout is measured correctly the first
    // time the panel is shown.
    requestAnimationFrame(() => {
      if (root.dataset.open !== "true") return;
      const gridRect = grid.getBoundingClientRect();
      svgLines.innerHTML = "";
      svgLines.setAttribute("width", gridRect.width);
      svgLines.setAttribute("height", gridRect.height);
      svgLines.setAttribute("viewBox", `0 0 ${gridRect.width} ${gridRect.height}`);
      for (const node of getAllNodes()) {
        for (const prereqId of node.prerequisites) {
          const from = nodeEls.get(prereqId);
          const to = nodeEls.get(node.id);
          if (!from || !to) continue;
          const a = from.getBoundingClientRect();
          const b = to.getBoundingClientRect();
          const x1 = a.left + a.width / 2 - gridRect.left;
          const y1 = a.bottom - gridRect.top;
          const x2 = b.left + b.width / 2 - gridRect.left;
          const y2 = b.top - gridRect.top;
          const midY = (y1 + y2) / 2;
          const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("class", "fp-branch-tree__line");
          path.setAttribute("d", d);
          const active =
            isUnlocked(state, prereqId) && (isUnlocked(state, node.id) || isAvailable(state, node.id));
          if (active) path.setAttribute("data-active", "true");
          svgLines.appendChild(path);
        }
      }
    });
  }

  function selectNode(id) {
    selectedNodeId = id;
    refresh();
  }

  function updateSidebar() {
    if (!selectedNodeId) {
      sidebar.name.textContent = "Pick a node";
      sidebar.branch.textContent = "";
      sidebar.description.textContent =
        "Click any node in the tree to see its description and prerequisites.";
      sidebar.meta.innerHTML = "";
      sidebar.action.disabled = true;
      sidebar.action.textContent = "Locked";
      return;
    }
    const node = getNode(selectedNodeId);
    sidebar.name.textContent = node.name;
    sidebar.branch.textContent = node.branchName;
    sidebar.description.textContent = node.description;

    const metaParts = [];
    if (node.prerequisites.length) {
      const prereqList = node.prerequisites
        .map((p) => {
          const n = getNode(p);
          const done = isUnlocked(state, p);
          return `<span style="color:${done ? "var(--color-olive)" : "var(--color-earth)"}">${p.toUpperCase()}${done ? " ✓" : ""}</span>`;
        })
        .join(", ");
      metaParts.push(`<dt>Prerequisites</dt><dd>${prereqList}</dd>`);
    }
    if (node.product) {
      metaParts.push(`<dt>Product</dt><dd>${escapeHtml(node.product)}</dd>`);
    }
    const unlockList = [];
    for (const [k, arr] of Object.entries(node.unlocks ?? {})) {
      if (Array.isArray(arr) && arr.length) {
        unlockList.push(`<dt>${k}</dt><dd>${arr.map(escapeHtml).join(", ")}</dd>`);
      }
    }
    metaParts.push(...unlockList);
    sidebar.meta.innerHTML = metaParts.join("");

    if (isUnlocked(state, selectedNodeId)) {
      sidebar.action.disabled = true;
      sidebar.action.textContent = "Unlocked";
    } else if (isAvailable(state, selectedNodeId)) {
      sidebar.action.disabled = false;
      sidebar.action.textContent = "Unlock";
    } else {
      sidebar.action.disabled = true;
      sidebar.action.textContent = "Locked";
    }
  }

  sidebar.action.addEventListener("click", () => {
    if (!selectedNodeId) return;
    if (!isAvailable(state, selectedNodeId)) return;
    unlock(state, selectedNodeId, bus);
    refresh();
  });

  closeBtn.addEventListener("click", () => setOpen(false));

  // ─── Bus wiring — refresh on external unlock events ───────────

  let busUnsub = null;
  function wireBus() {
    if (!bus) return;
    const offs = [
      bus.subscribe(EVENTS.NODE_UNLOCKED, () => refresh()),
      bus.subscribe(EVENTS.NODE_AVAILABLE, () => refresh()),
    ];
    busUnsub = () => offs.forEach((o) => o());
  }

  // ─── Keyboard toggle ──────────────────────────────────────────

  function onKey(e) {
    if (e.key.toLowerCase() === toggleKey && !e.repeat && !isTypingTarget(e.target)) {
      e.preventDefault();
      setOpen(root.dataset.open !== "true");
    } else if (e.key === "Escape" && root.dataset.open === "true") {
      setOpen(false);
    }
  }

  function isTypingTarget(el) {
    if (!el) return false;
    const tag = (el.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || el.isContentEditable;
  }

  function setOpen(open) {
    root.dataset.open = open ? "true" : "false";
    if (open) {
      refresh();
      // Re-draw lines after the panel becomes visible (layout shift).
      requestAnimationFrame(drawLines);
    }
  }

  // ─── Public API ───────────────────────────────────────────────

  function mount(host = document.body) {
    host.appendChild(root);
    buildGrid();
    wireBus();
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", drawLines);
    refresh();
    return api;
  }

  function destroy() {
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", drawLines);
    if (busUnsub) busUnsub();
    root.remove();
  }

  const api = {
    mount,
    destroy,
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(root.dataset.open !== "true"),
    refresh,
    get element() {
      return root;
    },
    get isOpen() {
      return root.dataset.open === "true";
    },
  };
  return api;
}

// ─── Utilities ────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
