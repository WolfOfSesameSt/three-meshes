/**
 * Fairy Permaculture — juice orchestrator.
 *
 * One-stop API for the four MVP juice moments:
 *   - compost scoop
 *   - biomass chop-and-drop
 *   - berry/fruit pick
 *   - new-fairy unlock (marquee)
 *
 * Each helper calls the right combination of particle burst, number
 * pop, audio, and camera bob. See GDD §Click-Harvest Juice Spec for
 * the designed feel per moment.
 */

import * as THREE from "three";
import { ParticlePool } from "./particle-pool.js";
import { NumberPopPool } from "./number-pop.js";
import { play } from "./audio-pool.js";
import { CameraBob } from "./camera-bob.js";
import { PALETTE } from "../../config.js";

export function createJuice({ scene, camera, container }) {
  // Three particle styles — one pool each so we can tint independently.
  const particlesCompost = new ParticlePool(scene, {
    capacity: 128,
    material: new THREE.MeshBasicMaterial({ color: PALETTE.compostRich, transparent: true, opacity: 0.9 }),
  });
  const particlesBerry = new ParticlePool(scene, {
    capacity: 128,
    material: new THREE.MeshBasicMaterial({ color: PALETTE.warmCoral, transparent: true, opacity: 0.95 }),
  });
  const particlesLeaf = new ParticlePool(scene, {
    capacity: 128,
    material: new THREE.MeshBasicMaterial({ color: PALETTE.meadowGreen, transparent: true, opacity: 0.9 }),
  });
  const particlesSparkle = new ParticlePool(scene, {
    capacity: 256,
    material: new THREE.MeshBasicMaterial({ color: PALETTE.honeyGold, transparent: true, opacity: 1.0 }),
  });

  const pops = new NumberPopPool(container, camera);
  const bob = new CameraBob(camera, { maxOffset: 0.3 });

  // Per-type chain tracking for the "combo" bonus.
  const chains = new Map(); // type -> { count, lastAt }
  const CHAIN_WINDOW_MS = 1500;

  function recordChain(type) {
    const now = performance.now();
    const c = chains.get(type) ?? { count: 0, lastAt: 0 };
    if (now - c.lastAt < CHAIN_WINDOW_MS) c.count += 1;
    else c.count = 1;
    c.lastAt = now;
    chains.set(type, c);
    return c.count;
  }

  // ── Public API ────────────────────────────────────────────────
  const api = {
    /** Compost scoop — dark glittery swirl, hefty thunk. */
    compostScoop(world, bagsPopped, quality) {
      const combo = recordChain("compost");
      particlesCompost.burst(world, 18, { speed: 2.8, lifetime: 0.8 });
      particlesSparkle.burst(world, 10, { speed: 2.2, lifetime: 0.7 });
      pops.spawn(world, `+${bagsPopped} COMPOST Q${quality}`, {
        color: "#F2C14E",
        size: combo >= 3 ? 34 : 28,
      });
      play("compost-scoop", { volume: 0.7 });
      bob.bump(0.6);
    },

    /** Berry / fruit pick — sweet chime + colorful particles. */
    berryPick(world, count = 1) {
      const combo = recordChain("berry");
      particlesBerry.burst(world, 12, { speed: 2, lifetime: 0.6 });
      pops.spawn(world, `+${count} FRUIT`, {
        color: "#F28E74",
        size: combo >= 3 ? 32 : 26,
      });
      play("berry-pick", { volume: 0.55 });
      bob.bump(0.25);
    },

    /** Biomass chop — crisp snip + leafy dust. */
    biomassChop(world, kg) {
      const combo = recordChain("biomass");
      particlesLeaf.burst(world, 10 + Math.min(12, kg | 0), { speed: 2.4, lifetime: 0.55 });
      pops.spawn(world, `+${kg} BIOMASS`, {
        color: "#8BC47A",
        size: combo >= 3 ? 30 : 24,
      });
      play("biomass-chop", { volume: 0.5 });
      bob.bump(0.2);
    },

    /** Honey harvest — warm gold burst. */
    honeyHarvest(world, kg) {
      particlesSparkle.burst(world, 16, { speed: 2.4, lifetime: 0.8 });
      pops.spawn(world, `+${kg} HONEY`, { color: "#F2C14E", size: 30 });
      play("berry-pick", { volume: 0.6, pitchJitter: 0.08 });
      bob.bump(0.35);
    },

    /** Milk / egg — soft chime. */
    milkHarvest(world, liters) {
      pops.spawn(world, `+${liters}L MILK`, { color: "#E8E6D8", size: 28 });
      play("berry-pick", { volume: 0.45 });
      bob.bump(0.2);
    },

    /** Marquee moment — new fairy is born. */
    newFairyUnlock(world, fairyName = "Anon") {
      particlesSparkle.burst(world, 60, { speed: 3.2, lifetime: 1.5, gravity: -2 });
      particlesBerry.burst(world, 24, { speed: 2.6, lifetime: 1.2 });
      pops.spawn(world, `✦ ${fairyName}`, {
        color: "#FFF4DC",
        size: 42,
        lifetime: 2.4,
        dy: -160,
      });
      play("new-fairy", { volume: 0.9 });
      bob.bump(0.9);
      // Dim-and-restore screen flash handled by a CSS class.
      container.classList.add("fp-new-fairy-flash");
      setTimeout(() => container.classList.remove("fp-new-fairy-flash"), 1500);
    },

    /** Call from the render loop. */
    update(dt, rendererSize) {
      bob.unapply();
      particlesCompost.update(dt);
      particlesBerry.update(dt);
      particlesLeaf.update(dt);
      particlesSparkle.update(dt);
      pops.update(dt, rendererSize);
      bob.update(dt);
    },

    // For tests / debug
    _pools: { particlesCompost, particlesBerry, particlesLeaf, particlesSparkle, pops, bob },
  };

  return api;
}
