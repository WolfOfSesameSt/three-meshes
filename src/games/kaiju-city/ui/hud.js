/**
 * In-game HUD: energy bar, controls hint, FPS counter.
 */

export class HUD {
  constructor() {
    this.container = document.createElement("div");
    this.container.id = "hud";
    this.container.innerHTML = `
      <div id="energy-bar-container">
        <div id="energy-bar-label">ATOMIC BREATH</div>
        <div id="energy-bar-bg"><div id="energy-bar-fill"></div></div>
      </div>
      <div id="controls-hint">
        WASD move · Mouse look · LMB punch · RMB tail · Space stomp · F breath · Q roar · Shift sprint
      </div>
      <div id="fps-counter"></div>
    `;
    document.body.appendChild(this.container);

    this.energyFill = document.getElementById("energy-bar-fill");
    this.fpsCounter = document.getElementById("fps-counter");
    this.frames = 0;
    this.lastFpsTime = performance.now();
  }

  update(energy, maxEnergy) {
    const pct = Math.max(0, Math.min(100, (energy / maxEnergy) * 100));
    this.energyFill.style.width = `${pct}%`;

    // Color shifts: full = cyan, low = red
    if (pct > 50) {
      this.energyFill.style.backgroundColor = "#44aaff";
    } else if (pct > 20) {
      this.energyFill.style.backgroundColor = "#ffaa44";
    } else {
      this.energyFill.style.backgroundColor = "#ff4444";
    }

    // FPS
    this.frames++;
    const now = performance.now();
    if (now - this.lastFpsTime > 1000) {
      this.fpsCounter.textContent = `${this.frames} FPS`;
      this.frames = 0;
      this.lastFpsTime = now;
    }
  }

  show() { this.container.style.display = "block"; }
  hide() { this.container.style.display = "none"; }
}
