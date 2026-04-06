/**
 * Mission HUD — minimal overlay during gameplay.
 *
 * Shows ship status bars, performance overlay (toggle),
 * and extraction button.
 */

export class HUD {
  constructor() {
    this.el = document.createElement("div");
    this.el.id = "hud";
    this.el.innerHTML = `
      <div id="mission-timer">00:00</div>
      <div id="ship-status">
        <div class="vr-bar-label">HULL</div>
        <div class="vr-bar"><div class="vr-bar-fill hull" id="hull-bar"></div></div>
        <div class="vr-bar-label">SHIELDS</div>
        <div class="vr-bar"><div class="vr-bar-fill shields" id="shields-bar"></div></div>
        <div class="vr-bar-label">ENERGY</div>
        <div class="vr-bar"><div class="vr-bar-fill energy" id="energy-bar"></div></div>
      </div>
      <div id="perf-overlay">
        <div id="perf-fps">FPS: --</div>
        <div id="perf-draws">Draws: --</div>
        <div id="perf-tris">Tris: --</div>
        <div id="perf-chunks">Chunks: --</div>
      </div>
      <div id="resource-counter">
        <div class="resource-row">
          <span class="resource-name">CARGO</span>
          <span class="resource-value" id="cargo-count">0 / 0</span>
        </div>
        <div id="resource-breakdown"></div>
        <div class="resource-row" style="margin-top:6px; border-top:1px solid rgba(80,140,220,0.2); padding-top:4px;">
          <span class="resource-name">DRONES</span>
          <span class="resource-value" id="drone-count">0</span>
        </div>
        <div class="resource-row">
          <span class="resource-name">HOSTILES</span>
          <span class="resource-value" id="enemy-count">0</span>
        </div>
        <div class="resource-row">
          <span class="resource-name">THREAT</span>
          <span class="resource-value" id="threat-level">LOW</span>
        </div>
      </div>
      <div id="extraction-panel" style="display:none;">
        <div id="extraction-status">STARGATE SUMMONED</div>
        <div id="extraction-timer">60s</div>
        <div class="vr-bar" style="width:180px;"><div class="vr-bar-fill" id="extraction-bar" style="background:var(--ui-accent);width:0%"></div></div>
      </div>
      <button id="extract-btn">EXTRACT [E]</button>
    `;
    document.body.appendChild(this.el);

    this._missionTimer = this.el.querySelector("#mission-timer");
    this._hullBar = this.el.querySelector("#hull-bar");
    this._shieldsBar = this.el.querySelector("#shields-bar");
    this._energyBar = this.el.querySelector("#energy-bar");
    this._cargoCount = this.el.querySelector("#cargo-count");
    this._resourceBreakdown = this.el.querySelector("#resource-breakdown");
    this._droneCount = this.el.querySelector("#drone-count");
    this._enemyCount = this.el.querySelector("#enemy-count");
    this._threatLevel = this.el.querySelector("#threat-level");
    this._extractionPanel = this.el.querySelector("#extraction-panel");
    this._extractionStatus = this.el.querySelector("#extraction-status");
    this._extractionTimer = this.el.querySelector("#extraction-timer");
    this._extractionBar = this.el.querySelector("#extraction-bar");
    this._extractBtn = this.el.querySelector("#extract-btn");
    this._perfOverlay = this.el.querySelector("#perf-overlay");

    // Mission complete overlay (added to body, not hud)
    this._missionComplete = document.createElement("div");
    this._missionComplete.id = "mission-complete";
    this._missionComplete.innerHTML = `<div id="mission-complete-inner"><h1>EXTRACTION COMPLETE</h1><div id="mission-loot"></div></div>`;
    document.body.appendChild(this._missionComplete);
    this._perfFps = this.el.querySelector("#perf-fps");
    this._perfDraws = this.el.querySelector("#perf-draws");
    this._perfTris = this.el.querySelector("#perf-tris");
    this._perfChunks = this.el.querySelector("#perf-chunks");

    this._showPerf = false;

    // Toggle perf overlay with backtick
    window.addEventListener("keydown", (e) => {
      if (e.key === "`") {
        this._showPerf = !this._showPerf;
        this._perfOverlay.classList.toggle("visible", this._showPerf);
      }
    });
  }

  /**
   * Update mission timer display.
   * @param {number} elapsedSeconds — total mission time in seconds
   */
  updateMissionTimer(elapsedSeconds) {
    const mins = Math.floor(elapsedSeconds / 60);
    const secs = Math.floor(elapsedSeconds % 60);
    this._missionTimer.textContent =
      `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  /**
   * Update ship status bars.
   * @param {object} systems — { hull, hullMax, shields, shieldsMax, energy, energyMax }
   */
  updateShipStatus(systems) {
    this._hullBar.style.width = `${(systems.hull / systems.hullMax) * 100}%`;
    this._shieldsBar.style.width = `${(systems.shields / systems.shieldsMax) * 100}%`;
    this._energyBar.style.width = `${(systems.energy / systems.energyMax) * 100}%`;
  }

  /**
   * Update cargo display with per-resource breakdown.
   * @param {object} contents — { "iron-ore": 50, "crystal-shard": 20, ... }
   */
  /**
   * @param {object} contents — { "iron-ore": 50, ... }
   * @param {number} capacity — tesseract max capacity
   */
  updateCargo(contents, capacity) {
    const total = Object.values(contents).reduce((a, b) => a + b, 0);
    this._cargoCount.textContent = `${Math.floor(total).toLocaleString()} / ${capacity.toLocaleString()}`;

    // Per-resource breakdown
    const rows = Object.entries(contents)
      .filter(([, amt]) => amt > 0)
      .map(([type, amt]) => `<div class="resource-row"><span class="resource-name">${type.replace(/-/g, " ")}</span><span class="resource-value">${Math.floor(amt).toLocaleString()}</span></div>`)
      .join("");
    this._resourceBreakdown.innerHTML = rows;
  }

  /**
   * Update drone count.
   * @param {number} alive
   * @param {number} total
   */
  updateDrones(alive, total) {
    this._droneCount.textContent = `${alive}/${total}`;
  }

  /**
   * Update combat info.
   * @param {number} enemyCount
   * @param {number} threatLevel — 0-1
   */
  updateCombat(enemyCount, threatLevel) {
    this._enemyCount.textContent = enemyCount;
    const labels = ["LOW", "MODERATE", "HIGH", "CRITICAL", "OVERWHELMING"];
    const idx = Math.min(Math.floor(threatLevel * labels.length), labels.length - 1);
    this._threatLevel.textContent = labels[idx];
    this._threatLevel.style.color = threatLevel > 0.6 ? "var(--ui-danger)" :
                                     threatLevel > 0.3 ? "var(--ui-warning)" : "var(--ui-text-dim)";
  }

  /**
   * Update performance overlay.
   * @param {object} stats — { fps, drawCalls, triangles, chunks }
   */
  updatePerf(stats) {
    if (!this._showPerf) return;
    this._perfFps.textContent = `FPS: ${stats.fps}`;
    this._perfDraws.textContent = `Draws: ${stats.drawCalls}`;
    this._perfTris.textContent = `Tris: ${stats.triangles.toLocaleString()}`;
    this._perfChunks.textContent = `Chunks: ${stats.chunks}`;
  }

  /**
   * Update extraction UI.
   * @param {string} state — idle|stabilizing|ready|warping|complete
   * @param {number} progress — 0-1
   * @param {number} timeRemaining — seconds
   */
  updateExtraction(state, progress, timeRemaining) {
    if (state === "idle") {
      this._extractionPanel.style.display = "none";
      this._extractBtn.style.display = "";
      return;
    }

    this._extractBtn.style.display = "none";
    this._extractionPanel.style.display = "";

    if (state === "stabilizing") {
      this._extractionStatus.textContent = "STARGATE STABILIZING";
      this._extractionTimer.textContent = `${Math.ceil(timeRemaining)}s`;
      this._extractionBar.style.width = `${progress * 100}%`;
      this._extractionBar.style.background = "var(--ui-accent)";
    } else if (state === "ready") {
      this._extractionStatus.textContent = "GATE READY — APPROACH";
      this._extractionTimer.textContent = "WARP READY";
      this._extractionBar.style.width = "100%";
      this._extractionBar.style.background = "var(--ui-success)";
    } else if (state === "warping") {
      this._extractionStatus.textContent = "WARPING";
      this._extractionTimer.textContent = "...";
      this._extractionBar.style.background = "var(--ui-success)";
    }
  }

  /**
   * Show mission complete screen.
   * @param {object} loot — tesseract contents
   */
  showMissionComplete(loot) {
    const rows = Object.entries(loot)
      .filter(([, amt]) => amt > 0)
      .map(([type, amt]) => `<div>${type.replace(/-/g, " ")}: ${Math.floor(amt).toLocaleString()}</div>`)
      .join("");
    this._missionComplete.querySelector("#mission-loot").innerHTML =
      rows || "<div>No resources extracted</div>";
    this._missionComplete.classList.add("visible");
  }

  /**
   * Set extract button callback.
   */
  onExtract(callback) {
    this._extractBtn.addEventListener("click", callback);
  }

  show() { this.el.style.display = ""; }
  hide() { this.el.style.display = "none"; }

  dispose() {
    this.el.remove();
    this._missionComplete.remove();
  }
}
