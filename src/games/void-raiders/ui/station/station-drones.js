/**
 * Drone Bay — view fleet and build new drones.
 *
 * V1 drone costs:
 *   Mining Drone    200 iron-ore
 *   Offensive Drone 300 iron-ore + 100 salvage-parts
 *   Repair Drone    250 iron-ore + 50 crystal-shard
 */

import { gameState, spendResources, canAfford } from "../../economy/game-state.js";

const DRONE_BLUEPRINTS = [
  {
    type: "worker-mining",
    name: "Mining Drone",
    description: "Mines deposits and hauls cargo",
    costs: { "iron-ore": 200 },
  },
  {
    type: "offensive",
    name: "Offensive Drone",
    description: "Attacks hostile targets",
    costs: { "iron-ore": 300, "salvage-parts": 100 },
  },
  {
    type: "worker-repair",
    name: "Repair Drone",
    description: "Repairs damaged friendlies",
    costs: { "iron-ore": 250, "crystal-shard": 50 },
  },
];

function formatCosts(costs) {
  return Object.entries(costs)
    .map(([type, amt]) => `${amt} ${type.replace(/-/g, " ")}`)
    .join(", ");
}

export class StationDrones {
  /**
   * @param {object} callbacks — { onBack() }
   */
  constructor(callbacks) {
    this.callbacks = callbacks;

    this.el = document.createElement("div");
    this.el.className = "station-screen";
    this.el.id = "station-drones";
    this.el.innerHTML = `
      <button class="station-back" id="drones-back">&lt; BACK</button>
      <div class="station-panel">
        <div class="station-title">DRONE BAY</div>
        <div class="station-section-title">CURRENT FLEET</div>
        <div id="drone-fleet"></div>
        <div class="station-section-title">BUILD DRONES</div>
        <div class="station-card-list" id="drone-blueprints"></div>
      </div>
    `;
    document.body.appendChild(this.el);

    this.el.querySelector("#drones-back").addEventListener("click", () => {
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
    // Current fleet
    const fleetEl = this.el.querySelector("#drone-fleet");
    if (gameState.drones.length === 0) {
      fleetEl.innerHTML = `<div style="color:var(--ui-text-dim);font-size:12px;">No drones in fleet</div>`;
    } else {
      fleetEl.innerHTML = gameState.drones
        .map((d) => {
          const bp = DRONE_BLUEPRINTS.find((b) => b.type === d.type);
          const name = bp ? bp.name : d.type;
          return `<div class="stat-row"><span class="stat-label">${name}</span><span class="stat-value">x${d.count}</span></div>`;
        })
        .join("");
    }

    // Build blueprints
    const list = this.el.querySelector("#drone-blueprints");
    list.innerHTML = DRONE_BLUEPRINTS.map((bp) => {
      const affordable = canAfford(bp.costs);
      return `
        <div class="station-card">
          <div class="card-info">
            <div class="card-name">${bp.name}</div>
            <div class="card-detail">${bp.description}</div>
            <div class="card-cost">${formatCosts(bp.costs)}</div>
          </div>
          <div class="card-action">
            <button class="station-btn accent" data-build="${bp.type}" ${affordable ? "" : "disabled"}>BUILD</button>
          </div>
        </div>`;
    }).join("");

    // Wire build buttons
    list.querySelectorAll("[data-build]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const bp = DRONE_BLUEPRINTS.find((b) => b.type === btn.dataset.build);
        if (!bp) return;
        if (spendResources(bp.costs)) {
          // Add to fleet
          const existing = gameState.drones.find((d) => d.type === bp.type);
          if (existing) {
            existing.count++;
          } else {
            gameState.drones.push({ type: bp.type, count: 1 });
          }
          this._render();
        }
      });
    });
  }

  dispose() {
    this.el.remove();
  }
}
