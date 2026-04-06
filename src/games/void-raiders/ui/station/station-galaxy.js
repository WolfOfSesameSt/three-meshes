/**
 * Galaxy Map — choose a realm for the next raid.
 *
 * V1: generates 3 procedural realm options with varying risk/reward.
 * Each realm has a name, tier, alien advancement, estimated resources, and threat level.
 */

import { gameState } from "../../economy/game-state.js";

const REALM_PREFIXES = [
  "Obsidian", "Crimson", "Void", "Ember", "Nether", "Azure", "Phantom",
  "Shattered", "Frozen", "Infernal", "Silent", "Twilight", "Hollow",
  "Ashen", "Stellar", "Spectral", "Molten", "Crystal", "Shadow", "Iron",
];

const REALM_SUFFIXES = [
  "Reach", "Expanse", "Drift", "Wastes", "Fields", "Depths", "Rift",
  "Corridor", "Basin", "Nexus", "Veil", "Hollow", "Abyss", "Frontier",
  "Strand", "Breach", "Domain", "Threshold", "Chasm", "Spine",
];

const THREAT_LABELS = ["MINIMAL", "LOW", "MODERATE", "HIGH", "EXTREME"];

function seededRandom(seed) {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) / 4294967296);
  };
}

function generateRealms() {
  const seed = Date.now() ^ (gameState.missionsCompleted * 7919);
  const rng = seededRandom(seed);

  const realms = [];
  for (let i = 0; i < 3; i++) {
    const tier = Math.min(1 + Math.floor(gameState.missionsCompleted / 3) + i, 5);
    const threatIdx = Math.min(tier - 1 + Math.floor(rng() * 2), THREAT_LABELS.length - 1);
    const prefix = REALM_PREFIXES[Math.floor(rng() * REALM_PREFIXES.length)];
    const suffix = REALM_SUFFIXES[Math.floor(rng() * REALM_SUFFIXES.length)];

    const baseRes = 2000 + tier * 1500;
    const variance = Math.floor(rng() * 1000) - 500;

    realms.push({
      id: `realm-${seed}-${i}`,
      name: `${prefix} ${suffix}`,
      tier,
      alienAdvancement: tier <= 2 ? "Primitive" : tier <= 4 ? "Advanced" : "Ascended",
      estimatedResources: baseRes + variance,
      threatLevel: threatIdx,
      threatLabel: THREAT_LABELS[threatIdx],
    });
  }
  return realms;
}

export class StationGalaxy {
  /**
   * @param {object} callbacks — { onBack() }
   */
  constructor(callbacks) {
    this.callbacks = callbacks;
    this.realms = [];

    this.el = document.createElement("div");
    this.el.className = "station-screen";
    this.el.id = "station-galaxy";
    this.el.innerHTML = `
      <button class="station-back" id="galaxy-back">&lt; BACK</button>
      <div class="station-panel">
        <div class="station-title">GALAXY MAP</div>
        <div class="station-subtitle">SELECT TARGET REALM</div>
        <div class="station-card-list" id="galaxy-realms"></div>
      </div>
    `;
    document.body.appendChild(this.el);

    this.el.querySelector("#galaxy-back").addEventListener("click", () => {
      this.callbacks.onBack();
    });
  }

  show() {
    this.realms = generateRealms();
    this._render();
    this.el.classList.add("visible");
  }

  hide() {
    this.el.classList.remove("visible");
  }

  _render() {
    const list = this.el.querySelector("#galaxy-realms");
    list.innerHTML = this.realms
      .map((realm) => {
        const selected = gameState.selectedRealm?.id === realm.id;
        const threatClass = realm.threatLevel <= 1 ? "threat-low" : realm.threatLevel <= 2 ? "threat-medium" : "threat-high";
        return `
          <div class="station-card realm-card${selected ? " selected" : ""}" data-realm-id="${realm.id}">
            <div class="card-info">
              <div class="card-name">${realm.name}</div>
              <div class="card-detail">
                Tier ${realm.tier} &mdash; ${realm.alienAdvancement}
              </div>
              <div class="realm-card .card-tags" style="display:flex;gap:8px;margin-top:6px;">
                <span class="realm-tag">~${realm.estimatedResources.toLocaleString()} RES</span>
                <span class="realm-tag ${threatClass}">${realm.threatLabel}</span>
              </div>
            </div>
            <div class="card-action">
              <button class="station-btn accent" data-select="${realm.id}">${selected ? "SELECTED" : "SELECT"}</button>
            </div>
          </div>`;
      })
      .join("");

    // Wire select buttons
    list.querySelectorAll("[data-select]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.select;
        gameState.selectedRealm = this.realms.find((r) => r.id === id) || null;
        this._render();
      });
    });
  }

  dispose() {
    this.el.remove();
  }
}
