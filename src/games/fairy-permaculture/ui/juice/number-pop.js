/**
 * Fairy Permaculture — HUD number-pops.
 *
 * DOM-based because they need sharp typography with the rustic-parchment
 * theme. Projected from world space to screen space per-frame until
 * they expire. Pooled for perf.
 */

import * as THREE from "three";

const DEFAULT_CAP = 32;

export class NumberPopPool {
  /**
   * @param {HTMLElement} container  Overlay DIV that covers the canvas
   * @param {THREE.Camera} camera
   * @param {object} [opts]
   */
  constructor(container, camera, opts = {}) {
    this.container = container;
    this.camera = camera;
    this.capacity = opts.capacity ?? DEFAULT_CAP;
    this.pops = []; // { el, world, age, lifetime, dy, color, text }
    this.$wrap = document.createElement("div");
    this.$wrap.className = "number-pop-wrap";
    this.$wrap.style.cssText = `
      position: absolute; inset: 0; pointer-events: none;
      overflow: hidden; z-index: 200;
    `;
    container.appendChild(this.$wrap);
  }

  /** Spawn a number pop at a world-space position. */
  spawn(world, text, opts = {}) {
    // Merge duplicates if we're near cap
    if (this.pops.length >= this.capacity) {
      const oldest = this.pops.shift();
      if (oldest) oldest.el.remove();
    }
    const {
      color = "#F2C14E",
      lifetime = 1.1,
      dy = -80,
      size = 28,
    } = opts;
    const el = document.createElement("div");
    el.className = "number-pop";
    el.textContent = text;
    el.style.cssText = `
      position: absolute; pointer-events: none;
      font-family: Georgia, serif; font-weight: bold;
      font-size: ${size}px;
      color: ${color};
      text-shadow: 0 2px 4px rgba(0,0,0,0.6), 0 0 8px ${color}66;
      transition: none;
      will-change: transform, opacity;
    `;
    this.$wrap.appendChild(el);
    this.pops.push({
      el,
      world: world.clone ? world.clone() : { x: world.x, y: world.y, z: world.z },
      age: 0,
      lifetime,
      dy,
    });
  }

  /** Update per-frame: project world → screen, fade + drift. */
  update(dt, rendererSize) {
    const v = new THREE.Vector3();
    const w = rendererSize?.x ?? this.container.clientWidth;
    const h = rendererSize?.y ?? this.container.clientHeight;
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.age += dt;
      if (p.age >= p.lifetime) {
        p.el.remove();
        this.pops.splice(i, 1);
        continue;
      }
      v.set(p.world.x, p.world.y, p.world.z).project(this.camera);
      const sx = (v.x * 0.5 + 0.5) * w;
      const sy = (-v.y * 0.5 + 0.5) * h;
      const t = p.age / p.lifetime;
      const ease = 1 - Math.pow(1 - t, 2);
      const offsetY = p.dy * ease;
      const opacity = 1 - Math.pow(t, 3);
      const scale = 1 + (t < 0.2 ? t * 2 : 0.4 - t * 0.2);
      p.el.style.transform = `translate(${sx - 40}px, ${sy + offsetY}px) scale(${scale})`;
      p.el.style.opacity = `${opacity}`;
    }
  }

  get activeCount() {
    return this.pops.length;
  }
}
