/**
 * Shipyard — view and upgrade the mothership.
 *
 * Upgrade costs (tiered: early raw, mid refined, late advanced):
 *   Hull Plating     +200 hull        3 steel-plate
 *   Shield Booster   +100 shields     1 shield-capacitor
 *   Power Core       +20 energy       2 energy-cell
 *   Hull Reinforcement +500 hull      2 hull-armor
 *   Tesseract Exp.   +5000 capacity   2 alloy-composite + 1 quantum-processor
 */

import { gameState, spendResources, canAfford } from "../../economy/game-state.js";
import { feedbackUpgrade, feedbackDenied } from "./station-feedback.js";

const UPGRADES = [
  {
    id: "hull-plating",
    name: "Hull Plating",
    description: "+200 max hull",
    costs: { "steel-plate": 3 },
    apply: (ms) => { ms.hullMax += 200; ms.hull += 200; },
  },
  {
    id: "shield-booster",
    name: "Shield Booster",
    description: "+100 max shields",
    costs: { "shield-capacitor": 1 },
    apply: (ms) => { ms.shieldsMax += 100; ms.shields += 100; },
  },
  {
    id: "power-core",
    name: "Power Core",
    description: "+20 max energy",
    costs: { "energy-cell": 2 },
    apply: (ms) => { ms.energyMax += 20; ms.energy += 20; },
  },
  {
    id: "hull-reinforcement",
    name: "Hull Reinforcement",
    description: "+500 max hull (advanced)",
    costs: { "hull-armor": 2 },
    apply: (ms) => { ms.hullMax += 500; ms.hull += 500; },
  },
  {
    id: "tesseract-expansion",
    name: "Tesseract Expansion",
    description: "+5000 cargo capacity",
    costs: { "alloy-composite": 2, "quantum-processor": 1 },
    apply: (ms) => { ms.tesseractCapacity += 5000; },
  },
];

function formatCosts(costs) {
  return Object.entries(costs)
    .map(([type, amt]) => `${amt} ${type.replace(/-/g, " ")}`)
    .join(", ");
}

export class StationShipyard {
  /**
   * @param {object} callbacks — { onBack() }
   */
  constructor(callbacks) {
    this.callbacks = callbacks;

    this.el = document.createElement("div");
    this.el.className = "station-screen";
    this.el.id = "station-shipyard";
    this.el.innerHTML = `
      <button class="station-back" id="shipyard-back">&lt; BACK</button>
      <div class="station-panel">
        <div class="station-title">SHIPYARD</div>
        <div class="station-section-title">MOTHERSHIP STATS</div>
        <div id="shipyard-stats"></div>
        <div class="station-section-title">UPGRADES</div>
        <div class="station-card-list" id="shipyard-upgrades"></div>
      </div>
    `;
    document.body.appendChild(this.el);

    this.el.querySelector("#shipyard-back").addEventListener("click", () => {
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
    const ms = gameState.mothership;

    // Stats
    const statsEl = this.el.querySelector("#shipyard-stats");
    statsEl.innerHTML = `
      <div class="stat-row"><span class="stat-label">Hull</span><span class="stat-value">${ms.hull} / ${ms.hullMax}</span></div>
      <div class="stat-row"><span class="stat-label">Shields</span><span class="stat-value">${ms.shields} / ${ms.shieldsMax}</span></div>
      <div class="stat-row"><span class="stat-label">Energy</span><span class="stat-value">${ms.energy} / ${ms.energyMax}</span></div>
      <div class="stat-row"><span class="stat-label">Tesseract</span><span class="stat-value">${ms.tesseractCapacity.toLocaleString()} capacity</span></div>
    `;

    // Upgrades
    const list = this.el.querySelector("#shipyard-upgrades");
    list.innerHTML = UPGRADES.map((u) => {
      const affordable = canAfford(u.costs);
      return `
        <div class="station-card">
          <div class="card-info">
            <div class="card-name">${u.name}</div>
            <div class="card-detail">${u.description}</div>
            <div class="card-cost">${formatCosts(u.costs)}</div>
          </div>
          <div class="card-action">
            <button class="station-btn accent" data-upgrade="${u.id}" ${affordable ? "" : "disabled"}>BUY</button>
          </div>
        </div>`;
    }).join("");

    // Wire buy buttons
    list.querySelectorAll("[data-upgrade]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const upgrade = UPGRADES.find((u) => u.id === btn.dataset.upgrade);
        if (!upgrade) return;
        if (spendResources(upgrade.costs)) {
          upgrade.apply(gameState.mothership);
          feedbackUpgrade(btn, upgrade.name);
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
