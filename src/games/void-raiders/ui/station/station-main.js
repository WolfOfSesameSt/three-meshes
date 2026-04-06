/**
 * Station Main Screen — hub for navigation between station sub-screens.
 *
 * Shows current resources, mission counter, and nav buttons to
 * Galaxy Map, Shipyard, Drone Bay, Research, and Launch.
 */

import { gameState } from "../../economy/game-state.js";

const RESOURCE_LABELS = {
  "iron-ore": "IRON",
  "crystal-shard": "CRYSTAL",
  "plasma-core": "PLASMA",
  "organic-matter": "ORGANIC",
  "salvage-parts": "SALVAGE",
};

export class StationMain {
  /**
   * @param {object} callbacks — { onNavigate(screen), onLaunch() }
   */
  constructor(callbacks) {
    this.callbacks = callbacks;

    this.el = document.createElement("div");
    this.el.className = "station-screen";
    this.el.id = "station-main";
    this.el.innerHTML = `
      <div class="station-panel">
        <div class="station-title">PIRATE STATION</div>
        <div class="station-subtitle">RESOURCES</div>
        <div class="station-resources" id="station-resources"></div>
        <div class="station-nav">
          <button class="station-btn" data-screen="galaxy">GALAXY MAP</button>
          <button class="station-btn" data-screen="shipyard">SHIPYARD</button>
          <button class="station-btn" data-screen="drones">DRONE BAY</button>
          <button class="station-btn" data-screen="research">RESEARCH</button>
        </div>
        <div style="margin-top: 16px;">
          <button class="station-btn launch" id="station-launch" style="width:100%;">LAUNCH</button>
        </div>
        <div class="mission-counter" id="station-missions"></div>
      </div>
    `;
    document.body.appendChild(this.el);

    // Wire nav buttons
    this.el.querySelectorAll("[data-screen]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.callbacks.onNavigate(btn.dataset.screen);
      });
    });

    this.el.querySelector("#station-launch").addEventListener("click", () => {
      this.callbacks.onLaunch();
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
    // Resources
    const resEl = this.el.querySelector("#station-resources");
    const types = Object.keys(RESOURCE_LABELS);
    resEl.innerHTML = types
      .map((type) => {
        const amount = gameState.resources[type] || 0;
        const label = RESOURCE_LABELS[type];
        return `<div class="station-resource-chip"><span class="res-name">${label}</span><span class="res-val">${amount.toLocaleString()}</span></div>`;
      })
      .join("");

    // Mission counter
    this.el.querySelector("#station-missions").textContent =
      `MISSIONS COMPLETED: ${gameState.missionsCompleted}`;
  }

  dispose() {
    this.el.remove();
  }
}
