/**
 * In-game Command Panel — swarm routine editor + power allocation.
 *
 * Toggled with TAB. Two sections:
 * 1. POWER ALLOCATION — shields/weapons/replication energy sliders
 * 2. SWARM ROUTINES — per-swarm rule editors with presets
 *
 * Changes apply immediately.
 */

import {
  getUnlockedValues,
} from "../../drones/routine.js";

// Preset routines
const PRESETS = [
  { label: "Strip Miners", routine: { anchor: "track-resource", range: 300, priority: "richest", action: "mine", retreat: "cargo-full" } },
  { label: "Smash & Grab", routine: { anchor: "track-resource", range: 200, priority: "nearest", action: "mine", retreat: "health-low" } },
  { label: "Wolfpack", routine: { anchor: "follow-mothership", range: 400, priority: "weakest", action: "attack", retreat: "health-low" } },
  { label: "Bodyguard", routine: { anchor: "follow-mothership", range: 100, priority: "nearest", action: "attack", retreat: "health-low" } },
  { label: "Field Medic", routine: { anchor: "follow-mothership", range: 200, priority: "most-damaged", action: "repair", retreat: "health-low" } },
  { label: "Ship Doctor", routine: { anchor: "follow-mothership", range: 50, priority: "most-damaged", action: "repair", retreat: "health-low" } },
];

export class RoutinePanel {
  constructor() {
    this.el = document.createElement("div");
    this.el.id = "routine-panel";
    this.el.style.display = "none";
    this.el.innerHTML = `
      <div class="rp-header">SHIP COMMAND <span class="rp-hint">[TAB]</span></div>
      <div id="rp-power-section">
        <div class="rp-section-title">POWER ALLOCATION</div>
        <div class="rp-power-row">
          <span class="rp-power-label">SHIELDS</span>
          <input type="range" min="0" max="100" step="5" value="40" class="rp-power-slider" data-system="shields">
          <span class="rp-power-value" data-system="shields">40%</span>
        </div>
        <div class="rp-power-row">
          <span class="rp-power-label">WEAPONS</span>
          <input type="range" min="0" max="100" step="5" value="40" class="rp-power-slider" data-system="weapons">
          <span class="rp-power-value" data-system="weapons">40%</span>
        </div>
        <div class="rp-power-row">
          <span class="rp-power-label">REPLICATION</span>
          <input type="range" min="0" max="100" step="5" value="20" class="rp-power-slider" data-system="replication">
          <span class="rp-power-value" data-system="replication">20%</span>
        </div>
        <div class="rp-power-info" id="rp-shield-rate">Shield regen: 2.0/s</div>
      </div>
      <div class="rp-section-title" style="margin-top:4px;">SWARM ROUTINES</div>
      <div id="rp-swarm-list"></div>
    `;
    document.body.appendChild(this.el);

    this._swarmList = this.el.querySelector("#rp-swarm-list");
    this._shieldRateDisplay = this.el.querySelector("#rp-shield-rate");
    this._visible = false;
    this._swarms = [];
    this._powerAllocator = null;
    this._energyProduction = 10;

    // Wire power sliders
    this.el.querySelectorAll(".rp-power-slider").forEach(slider => {
      slider.addEventListener("input", () => {
        this._onPowerSliderChange(slider.dataset.system, parseInt(slider.value));
      });
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  /**
   * Set the power allocator reference.
   * @param {import('../../ship/power.js').PowerAllocator} allocator
   * @param {number} energyProduction
   */
  setPowerAllocator(allocator, energyProduction) {
    this._powerAllocator = allocator;
    this._energyProduction = energyProduction;
    this._syncPowerDisplay();
  }

  /**
   * Set the swarm data to display.
   */
  setSwarms(swarms) {
    this._swarms = swarms;
    this._rebuildSwarms();
  }

  toggle() {
    this._visible = !this._visible;
    this.el.style.display = this._visible ? "" : "none";
    if (this._visible) {
      this._syncPowerDisplay();
      this._rebuildSwarms();
    }
  }

  show() { this._visible = true; this.el.style.display = ""; this._syncPowerDisplay(); this._rebuildSwarms(); }
  hide() { this._visible = false; this.el.style.display = "none"; }

  _onPowerSliderChange(system, value) {
    if (!this._powerAllocator) return;
    this._powerAllocator.setAllocation(system, value);
    this._syncPowerDisplay();
  }

  _syncPowerDisplay() {
    if (!this._powerAllocator) return;

    // Update all slider positions and labels
    for (const system of ["shields", "weapons", "replication"]) {
      const val = this._powerAllocator.allocation[system];
      const slider = this.el.querySelector(`.rp-power-slider[data-system="${system}"]`);
      const label = this.el.querySelector(`.rp-power-value[data-system="${system}"]`);
      if (slider) slider.value = val;
      if (label) label.textContent = `${val}%`;
    }

    // Shield regen rate info
    const rate = this._powerAllocator.getShieldRegenRate(this._energyProduction);
    this._shieldRateDisplay.textContent = `Shield regen: ${rate.toFixed(1)}/s`;
  }

  _rebuildSwarms() {
    this._swarmList.innerHTML = "";

    for (const swarm of this._swarms) {
      const aliveCount = swarm.drones.filter(d => d.state !== "destroyed").length;
      const totalCount = swarm.drones.length;
      const swarmType = swarm.drones[0]?.type ?? "unknown";
      const label = this._getSwarmLabel(swarmType);

      const card = document.createElement("div");
      card.className = "rp-swarm-card";
      card.innerHTML = `
        <div class="rp-swarm-header">${label} <span class="rp-count">(${aliveCount}/${totalCount})</span></div>
        <div class="rp-rules">
          ${this._buildDropdown("Anchor", "anchor", swarm, getUnlockedValues("anchor"))}
          ${this._buildRangeSlider(swarm)}
          ${this._buildDropdown("Priority", "priority", swarm, getUnlockedValues("priority"))}
          ${this._buildDropdown("Action", "action", swarm, getUnlockedValues("action"))}
          ${this._buildDropdown("Retreat", "retreat", swarm, getUnlockedValues("retreat"))}
        </div>
        <div class="rp-presets"></div>
      `;
      this._swarmList.appendChild(card);

      // Wire up dropdowns
      card.querySelectorAll("select").forEach(sel => {
        sel.addEventListener("change", () => {
          swarm.routine[sel.dataset.rule] = sel.value;
        });
      });

      // Wire up range slider
      const slider = card.querySelector("input[type=range]");
      const rangeLabel = card.querySelector(".rp-range-value");
      if (slider) {
        slider.addEventListener("input", () => {
          swarm.routine.range = parseInt(slider.value);
          rangeLabel.textContent = `${slider.value}m`;
        });
      }

      // Add preset buttons
      const presetContainer = card.querySelector(".rp-presets");
      for (const preset of PRESETS) {
        const btn = document.createElement("button");
        btn.className = "rp-preset-btn";
        btn.textContent = preset.label;
        btn.addEventListener("click", () => {
          Object.assign(swarm.routine, { ...preset.routine });
          this._rebuildSwarms();
        });
        presetContainer.appendChild(btn);
      }
    }
  }

  _buildDropdown(label, rule, swarm, options) {
    const current = swarm.routine[rule];
    const opts = options.map(o =>
      `<option value="${o.id}" ${o.id === current ? "selected" : ""}>${o.label}</option>`
    ).join("");
    return `
      <div class="rp-rule-row">
        <span class="rp-rule-label">${label}</span>
        <select class="rp-select" data-rule="${rule}">${opts}</select>
      </div>
    `;
  }

  _buildRangeSlider(swarm) {
    return `
      <div class="rp-rule-row">
        <span class="rp-rule-label">Range</span>
        <input type="range" min="50" max="500" step="25" value="${swarm.routine.range}" class="rp-slider">
        <span class="rp-range-value">${swarm.routine.range}m</span>
      </div>
    `;
  }

  _getSwarmLabel(type) {
    const labels = {
      "worker-mining": "MINERS",
      "worker-looting": "LOOTERS",
      "worker-repair": "REPAIR",
      offensive: "FIGHTERS",
    };
    return labels[type] ?? type.toUpperCase();
  }

  dispose() {
    this.el.remove();
  }
}
