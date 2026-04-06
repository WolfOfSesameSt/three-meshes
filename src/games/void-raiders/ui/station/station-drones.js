/**
 * Drone Bay — view fleet, build new drones, and equip upgrades.
 *
 * Drone costs:
 *   Mining Drone    150 iron-ore + 50 copper-ore  (raw — early game)
 *   Offensive Drone 2 steel-plate + 1 circuit-board (refined)
 *   Repair Drone    1 steel-plate + 1 bio-gel      (refined)
 */

import { gameState, spendResources, canAfford } from "../../economy/game-state.js";
import { feedbackBuildDrone, feedbackUpgrade, feedbackDenied } from "./station-feedback.js";
import {
  DRONE_UPGRADES,
  canEquip as canEquipUpgrade,
  getAvailableUpgrades,
} from "../../drones/upgrades.js";

const DRONE_BLUEPRINTS = [
  {
    type: "worker-mining",
    name: "Mining Drone",
    description: "Mines deposits and hauls cargo",
    costs: { "iron-ore": 150, "copper-ore": 50 },
  },
  {
    type: "offensive",
    name: "Offensive Drone",
    description: "Attacks hostile targets",
    costs: { "steel-plate": 2, "circuit-board": 1 },
  },
  {
    type: "worker-repair",
    name: "Repair Drone",
    description: "Repairs damaged friendlies",
    costs: { "steel-plate": 1, "bio-gel": 1 },
  },
];

function formatCosts(costs) {
  return Object.entries(costs)
    .map(([type, amt]) => `${amt} ${type.replace(/-/g, " ")}`)
    .join(", ");
}

function formatStatBonus(statBonus) {
  return Object.entries(statBonus)
    .map(([stat, val]) => `+${val} ${stat.replace(/([A-Z])/g, " $1").toLowerCase()}`)
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
        <div class="station-section-title">UPGRADES</div>
        <div id="drone-upgrades"></div>
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
    this._renderFleet();
    this._renderUpgrades();
    this._renderBlueprints();
  }

  _renderFleet() {
    const fleetEl = this.el.querySelector("#drone-fleet");
    if (gameState.drones.length === 0) {
      fleetEl.innerHTML = `<div style="color:var(--ui-text-dim);font-size:12px;">No drones in fleet</div>`;
      return;
    }

    fleetEl.innerHTML = gameState.drones
      .map((d) => {
        const bp = DRONE_BLUEPRINTS.find((b) => b.type === d.type);
        const name = bp ? bp.name : d.type;
        const upgrades = d.upgrades || [];
        const maxSlots = d.type === "offensive" ? 2 : 2; // base slots
        const slotsUsed = upgrades.length;

        let upgradeHtml = "";
        if (upgrades.length > 0) {
          const upgradeLabels = upgrades.map((uid, idx) => {
            const def = DRONE_UPGRADES[uid];
            const label = def ? def.label : uid;
            return `<span class="upgrade-chip">${label} <button class="upgrade-remove" data-drone-type="${d.type}" data-slot="${idx}">x</button></span>`;
          }).join(" ");
          upgradeHtml = `<div class="drone-upgrades-row">${upgradeLabels}</div>`;
        }

        return `
          <div class="drone-fleet-entry">
            <div class="stat-row">
              <span class="stat-label">${name}</span>
              <span class="stat-value">x${d.count} &mdash; Slots: ${slotsUsed}/${maxSlots}</span>
            </div>
            ${upgradeHtml}
          </div>`;
      })
      .join("");

    // Wire remove buttons
    fleetEl.querySelectorAll(".upgrade-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        const droneType = btn.dataset.droneType;
        const slotIdx = parseInt(btn.dataset.slot, 10);
        const entry = gameState.drones.find((d) => d.type === droneType);
        if (!entry || !entry.upgrades) return;

        // Remove upgrade from state
        entry.upgrades.splice(slotIdx, 1);
        this._render();
      });
    });
  }

  _renderUpgrades() {
    const upgradesEl = this.el.querySelector("#drone-upgrades");

    // Show available upgrades with equip buttons per drone type
    const allUpgrades = Object.values(DRONE_UPGRADES);

    // Find drone types that have open slots
    const droneEntries = gameState.drones.filter((d) => {
      const upgrades = d.upgrades || [];
      return upgrades.length < 2; // base 2 slots
    });

    if (droneEntries.length === 0 && gameState.drones.length > 0) {
      upgradesEl.innerHTML = `<div style="color:var(--ui-text-dim);font-size:12px;">All drone slots full</div>`;
      return;
    }

    if (gameState.drones.length === 0) {
      upgradesEl.innerHTML = `<div style="color:var(--ui-text-dim);font-size:12px;">Build drones first</div>`;
      return;
    }

    upgradesEl.innerHTML = `<div class="station-card-list">${allUpgrades.map((upgrade) => {
      const affordable = canAfford(upgrade.cost);

      // Build equip buttons for each drone type with open slots
      const equipButtons = droneEntries.map((d) => {
        const bp = DRONE_BLUEPRINTS.find((b) => b.type === d.type);
        const shortName = bp ? bp.name.split(" ")[0] : d.type;
        return `<button class="station-btn accent equip-btn" data-upgrade="${upgrade.id}" data-drone-type="${d.type}" ${affordable ? "" : "disabled"} style="font-size:10px;padding:6px 10px;margin:2px;">EQUIP ${shortName}</button>`;
      }).join("");

      return `
        <div class="station-card">
          <div class="card-info">
            <div class="card-name">${upgrade.label}</div>
            <div class="card-detail">${formatStatBonus(upgrade.statBonus)}</div>
            <div class="card-cost">${formatCosts(upgrade.cost)}</div>
          </div>
          <div class="card-action" style="display:flex;flex-direction:column;align-items:flex-end;">
            ${equipButtons}
          </div>
        </div>`;
    }).join("")}</div>`;

    // Wire equip buttons
    upgradesEl.querySelectorAll(".equip-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const upgradeId = btn.dataset.upgrade;
        const droneType = btn.dataset.droneType;
        const upgrade = DRONE_UPGRADES[upgradeId];
        if (!upgrade) return;

        const entry = gameState.drones.find((d) => d.type === droneType);
        if (!entry) return;

        // Ensure upgrades array exists
        if (!entry.upgrades) entry.upgrades = [];

        // Check slots
        if (entry.upgrades.length >= 2) return; // base 2 slots

        // Spend resources
        if (!spendResources(upgrade.cost)) {
          feedbackDenied(equipBtn);
          return;
        }

        // Equip
        entry.upgrades.push(upgradeId);
        feedbackUpgrade(equipBtn, upgrade.label);
        this._render();
      });
    });
  }

  _renderBlueprints() {
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
          const existing = gameState.drones.find((d) => d.type === bp.type);
          if (existing) {
            existing.count++;
          } else {
            gameState.drones.push({ type: bp.type, count: 1, upgrades: [] });
          }
          feedbackBuildDrone(btn, bp.name);
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
