/**
 * Research Tree — unlock new routine engine values.
 *
 * V1 research:
 *   Track Resource anchor  — already unlocked (skip)
 *   Track Enemy anchor     — 200 salvage-parts
 *   Repair action          — 300 crystal-shard + 100 organic-matter
 *   Intercept action       — 500 salvage-parts
 *   Never Retreat          — 400 salvage-parts
 */

import { gameState, spendResources, canAfford } from "../../economy/game-state.js";
import { ANCHOR_TYPES, ACTION_TYPES, RETREAT_TYPES } from "../../drones/routine.js";
import { feedbackResearch, feedbackDenied } from "./station-feedback.js";

const RESEARCH_ITEMS = [
  {
    id: "track-enemy",
    name: "Track Enemy Anchor",
    description: "Swarms can anchor on nearest hostile",
    costs: { "salvage-parts": 200, "circuit-board": 1 },
    ruleType: "anchor",
    ruleKey: "track-enemy",
  },
  {
    id: "repair-action",
    name: "Repair Action",
    description: "Repair drones can heal damaged friendlies",
    costs: { "bio-gel": 2, "crystal-shard": 100 },
    ruleType: "action",
    ruleKey: "repair",
  },
  {
    id: "intercept-action",
    name: "Intercept Action",
    description: "Drones can sacrifice to destroy projectiles",
    costs: { "salvage-parts": 300, "shield-capacitor": 1 },
    ruleType: "action",
    ruleKey: "intercept",
  },
  {
    id: "never-retreat",
    name: "Never Retreat",
    description: "Drones fight to the death",
    costs: { "salvage-parts": 200, "nano-repair-paste": 1 },
    ruleType: "retreat",
    ruleKey: "never",
  },
];

const RULE_MAPS = {
  anchor: ANCHOR_TYPES,
  action: ACTION_TYPES,
  retreat: RETREAT_TYPES,
};

function formatCosts(costs) {
  return Object.entries(costs)
    .map(([type, amt]) => `${amt} ${type.replace(/-/g, " ")}`)
    .join(", ");
}

export class StationResearch {
  /**
   * @param {object} callbacks — { onBack() }
   */
  constructor(callbacks) {
    this.callbacks = callbacks;

    this.el = document.createElement("div");
    this.el.className = "station-screen";
    this.el.id = "station-research";
    this.el.innerHTML = `
      <button class="station-back" id="research-back">&lt; BACK</button>
      <div class="station-panel">
        <div class="station-title">RESEARCH</div>
        <div class="station-subtitle">UNLOCK ROUTINE ENGINE VALUES</div>
        <div class="station-card-list" id="research-items"></div>
      </div>
    `;
    document.body.appendChild(this.el);

    this.el.querySelector("#research-back").addEventListener("click", () => {
      this.callbacks.onBack();
    });
  }

  show() {
    this._render();
    this.el.classList.add("visible");
  }

  hide() {
    this.el.classList.remove("visible");
  }

  _render() {
    const list = this.el.querySelector("#research-items");
    list.innerHTML = RESEARCH_ITEMS.map((item) => {
      const unlocked = !!gameState.research[item.id];
      const affordable = canAfford(item.costs);
      return `
        <div class="station-card${unlocked ? " unlocked" : ""}">
          <div class="card-info">
            <div class="card-name">${item.name}</div>
            <div class="card-detail">${item.description}</div>
            ${unlocked ? '<div class="card-detail" style="color:var(--ui-success);">UNLOCKED</div>' : `<div class="card-cost">${formatCosts(item.costs)}</div>`}
          </div>
          <div class="card-action">
            ${unlocked
              ? ""
              : `<button class="station-btn accent" data-research="${item.id}" ${affordable ? "" : "disabled"}>RESEARCH</button>`
            }
          </div>
        </div>`;
    }).join("");

    // Wire research buttons
    list.querySelectorAll("[data-research]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = RESEARCH_ITEMS.find((r) => r.id === btn.dataset.research);
        if (!item) return;
        if (spendResources(item.costs)) {
          gameState.research[item.id] = true;
          const ruleMap = RULE_MAPS[item.ruleType];
          if (ruleMap && ruleMap[item.ruleKey]) {
            ruleMap[item.ruleKey].unlocked = true;
          }
          feedbackResearch(btn, item.name);
          this._render();
        } else {
          feedbackDenied(btn);
        }
      });
    });
  }

  dispose() {
    this.el.remove();
  }
}
