#!/usr/bin/env node
/**
 * Browser QA harness for the model-preview tool.
 *
 * Loads the page in headless Chromium, drives the UI, captures console logs,
 * unhandled errors, and a screenshot. Prints everything to stdout so Claude
 * can read it.
 *
 * Requires the Vite dev server to already be running on :5173.
 *
 * Usage:
 *   node src/games/void-raiders/model-preview/qa.mjs [scenario]
 *
 * Scenarios:
 *   boot      Just load the page, report stats + console output
 *   venator   Load Venator, click Auto, click a turret, report state
 *   clear     Reset localStorage + reload, report empty state
 */

import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const URL = 'http://localhost:5173/src/games/void-raiders/model-preview/index.html';
const OUT_DIR = resolve(__dirname, '.qa');
mkdirSync(OUT_DIR, { recursive: true });

const scenario = process.argv[2] || 'boot';

// ---------- scenario definitions ----------
const scenarios = {
  async boot(page) {
    await page.waitForSelector('#sidebar h1');
    return { ok: true, note: 'Page loaded' };
  },

  async clear(page) {
    // Clear everything in localStorage for a clean slate
    await page.evaluate(() => {
      Object.keys(localStorage)
        .filter(k => k.startsWith('ship-hp-'))
        .forEach(k => localStorage.removeItem(k));
    });
    await page.reload({ waitUntil: 'networkidle0' });
    const remaining = await page.evaluate(() =>
      Object.keys(localStorage).filter(k => k.startsWith('ship-hp-'))
    );
    return { ok: true, note: 'Cleared localStorage', remaining };
  },

  async reset_url(page) {
    // Seed some junk into localStorage, then verify ?reset=1 wipes it
    await page.evaluate(() => {
      localStorage.setItem('ship-hp-venator', '{"hardpoints":[{"name":"junk"}]}');
      localStorage.setItem('ship-hp-eclipse-class', '{"hardpoints":[{"name":"junk2"}]}');
    });
    const before = await page.evaluate(() =>
      Object.keys(localStorage).filter(k => k.startsWith('ship-hp-')).length
    );
    await page.goto(`${URL}?reset=1`, { waitUntil: 'networkidle0' });
    const after = await page.evaluate(() =>
      Object.keys(localStorage).filter(k => k.startsWith('ship-hp-')).length
    );
    return { ok: true, before, after };
  },

  async inspect_venator(page) {
    await page.goto(`${URL}?reset=1`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#model-list .model-card');
    const cards = await page.$$('#model-list .model-card');
    await cards[3].click(); // Venator
    await page.waitForFunction(() => {
      const el = document.getElementById('loading');
      return el && el.classList.contains('hidden');
    }, { timeout: 15000 });

    const meshes = await page.evaluate(() => window.__qa.inspectMeshes(5));
    return { ok: true, meshes };
  },

  async sd_clean_view(page) {
    // Clean screenshots from multiple angles
    await page.goto(`${URL}?reset=1`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#model-list .model-card');
    const cards = await page.$$('#model-list .model-card');
    await cards[1].click();
    await page.waitForFunction(() => {
      const el = document.getElementById('loading');
      return el && el.classList.contains('hidden');
    }, { timeout: 15000 });
    // Hide arcs / ensure clean view
    await page.click('[data-tab="hardpoints"]');

    // Default view (perspective)
    const ssDefault = resolve(OUT_DIR, 'sd_clean_default.png');
    await page.screenshot({ path: ssDefault, clip: { x: 260, y: 0, width: 1340, height: 900 } });

    // Top-down (camera high above looking down)
    await page.evaluate(() => window.__qa.setCamera(0, 8, 0.001, 0, 0, 0));
    await new Promise(r => setTimeout(r, 200));
    const ssTop = resolve(OUT_DIR, 'sd_clean_top.png');
    await page.screenshot({ path: ssTop, clip: { x: 260, y: 0, width: 1340, height: 900 } });

    // Front-quarter zoom (closer to bridge area)
    await page.evaluate(() => window.__qa.setCamera(2, 2, 2, -1.5, 0.3, 0));
    await new Promise(r => setTimeout(r, 200));
    const ssQuarter = resolve(OUT_DIR, 'sd_clean_quarter.png');
    await page.screenshot({ path: ssQuarter, clip: { x: 260, y: 0, width: 1340, height: 900 } });

    return { ok: true, ssDefault, ssTop, ssQuarter };
  },

  async sd_bay(page) {
    // Detect ball turrets, then click Bay mode and click on the bottom of the
    // ship to place a drone bay.
    await page.goto(`${URL}?reset=1`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#model-list .model-card');
    const cards = await page.$$('#model-list .model-card');
    await cards[1].click();
    await page.waitForFunction(() => {
      const el = document.getElementById('loading');
      return el && el.classList.contains('hidden');
    }, { timeout: 15000 });
    await page.click('[data-tab="hardpoints"]');
    await new Promise(r => setTimeout(r, 200));
    await page.click('#hp-detect');
    await new Promise(r => setTimeout(r, 200));

    // Look at the ship from below so a click in the viewport center hits
    // the ventral hull (where the bay should go)
    await page.evaluate(() => window.__qa.setCamera(0, -7, 0.001, 0, 0, 0));
    await new Promise(r => setTimeout(r, 200));

    await page.click('#hp-bay-mode');
    const vp = await page.evaluate(() => {
      const el = document.getElementById('viewport');
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
    await page.mouse.click(Math.round(vp.x + vp.w * 0.5), Math.round(vp.y + vp.h * 0.5), { delay: 20 });
    await new Promise(r => setTimeout(r, 300));

    const state = await page.evaluate(() => ({
      countText: document.getElementById('hp-count')?.textContent,
      hpItems: document.querySelectorAll('.hp-item').length,
      bayChips: document.querySelectorAll('.hp-type-drone_bay').length,
    }));

    return { ok: true, state };
  },

  async sd_multi_target(page) {
    // Verify hemisphere gating: top turrets fire only when a target is above
    // them, bottom turrets fire only when a target is below them. Tracks
    // canFire for top vs bottom turrets across many sim frames so we can be
    // sure both groups participate in the simulation.
    await page.goto(`${URL}?reset=1`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#model-list .model-card');
    const cards = await page.$$('#model-list .model-card');
    await cards[1].click();
    await page.waitForFunction(() => {
      const el = document.getElementById('loading');
      return el && el.classList.contains('hidden');
    }, { timeout: 15000 });
    await page.click('[data-tab="hardpoints"]');
    await new Promise(r => setTimeout(r, 200));
    await page.click('#hp-detect');
    await new Promise(r => setTimeout(r, 200));

    // Classify each hardpoint as top vs bottom by its world Y
    const slots = await page.evaluate(() =>
      window.__qa.snapshot().map(s => ({
        name: s.name,
        y: s.worldCenter ? s.worldCenter[1] : null,
        normalY: s.normal.y,
      }))
    );
    const top = slots.filter(s => s.normalY > 0).map(s => s.name);
    const bottom = slots.filter(s => s.normalY < 0).map(s => s.name);

    await page.click('#hp-show-arcs'); // hide arcs for cleanliness
    await new Promise(r => setTimeout(r, 100));

    // Hide the model so we can clearly see the procedural turrets + lasers
    await page.evaluate(() => window.__qa.setCamera(0, 0, 8, 0, 0, 0));
    await new Promise(r => setTimeout(r, 200));
    await page.click('#hp-simulate');

    // Sample for 4 seconds — enough for the figure-8/zigzag to take all
    // targets through their full Y range. Track which turrets canFire each
    // frame and which ever fire at all.
    const topEverFired = new Set();
    const bottomEverFired = new Set();
    let topCanFireSamples = 0;
    let bottomCanFireSamples = 0;
    const targetHistory = []; // record target Y values per frame
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 100));
      const stats = await page.evaluate(() => ({
        fireStats: window.__qa.fireStats(),
        targets: window.__qa.simTargets(),
      }));
      targetHistory.push(stats.targets.map(t => +t.y.toFixed(2)));
      for (const f of stats.fireStats) {
        if (f.canFire) {
          if (top.includes(f.name)) {
            topCanFireSamples++;
            topEverFired.add(f.name);
          } else if (bottom.includes(f.name)) {
            bottomCanFireSamples++;
            bottomEverFired.add(f.name);
          }
        }
      }
    }

    // Capture a screenshot at the end
    const ss = resolve(OUT_DIR, 'sd_multi_target.png');
    await page.screenshot({ path: ss, clip: { x: 260, y: 0, width: 1340, height: 900 } });

    return {
      ok: true,
      slotCount: { top: top.length, bottom: bottom.length },
      topEverFired: [...topEverFired].sort(),
      bottomEverFired: [...bottomEverFired].sort(),
      topCanFireSamples, bottomCanFireSamples,
      targetYRange: {
        t0: { min: Math.min(...targetHistory.map(h => h[0])), max: Math.max(...targetHistory.map(h => h[0])) },
        t1: { min: Math.min(...targetHistory.map(h => h[1])), max: Math.max(...targetHistory.map(h => h[1])) },
        t2: { min: Math.min(...targetHistory.map(h => h[2])), max: Math.max(...targetHistory.map(h => h[2])) },
      },
      screenshot: ss,
    };
  },

  async sd_fire_diag(page) {
    // Detect, sim, sample fireStats + activeLaserCount over several frames
    await page.goto(`${URL}?reset=1`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#model-list .model-card');
    const cards = await page.$$('#model-list .model-card');
    await cards[1].click();
    await page.waitForFunction(() => {
      const el = document.getElementById('loading');
      return el && el.classList.contains('hidden');
    }, { timeout: 15000 });
    await page.click('[data-tab="hardpoints"]');
    await new Promise(r => setTimeout(r, 200));
    await page.click('#hp-detect');
    await new Promise(r => setTimeout(r, 200));

    const initialStats = await page.evaluate(() => window.__qa.fireStats());

    await page.click('#hp-simulate');

    const samples = [];
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 200));
      const s = await page.evaluate(() => ({
        active: window.__qa.activeLaserCount(),
        target: window.__qa.simTarget(),
        canFireCount: window.__qa.fireStats().filter(f => f.canFire).length,
      }));
      samples.push(s);
    }

    return { ok: true, initialStats, samples };
  },

  async sd_save_load(page) {
    // Detect 9 ball turrets, autosave to localStorage, reload, verify they
    // come back. Catches the bindModelTurret save/load bug.
    await page.goto(`${URL}?reset=1`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#model-list .model-card');
    const cards = await page.$$('#model-list .model-card');
    await cards[1].click();
    await page.waitForFunction(() => {
      const el = document.getElementById('loading');
      return el && el.classList.contains('hidden');
    }, { timeout: 15000 });
    await page.click('[data-tab="hardpoints"]');
    await new Promise(r => setTimeout(r, 200));

    await page.click('#hp-detect');
    await new Promise(r => setTimeout(r, 300));
    const before = await page.evaluate(() => ({
      countText: document.getElementById('hp-count')?.textContent,
      hpItems: document.querySelectorAll('.hp-item').length,
      stored: !!localStorage.getItem('ship-hp-star-destroyer'),
    }));

    // Reload (NO ?reset=1 — we WANT the saved state to come back)
    await page.goto(URL, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#model-list .model-card');
    // Re-pick the SD Detailed card. autoSaved hardpoints should auto-import.
    const cards2 = await page.$$('#model-list .model-card');
    await cards2[1].click();
    await page.waitForFunction(() => {
      const el = document.getElementById('loading');
      return el && el.classList.contains('hidden');
    }, { timeout: 15000 });
    await new Promise(r => setTimeout(r, 500));
    await page.click('[data-tab="hardpoints"]');
    await new Promise(r => setTimeout(r, 200));

    const after = await page.evaluate(() => ({
      countText: document.getElementById('hp-count')?.textContent,
      hpItems: document.querySelectorAll('.hp-item').length,
      stored: !!localStorage.getItem('ship-hp-star-destroyer'),
    }));

    return { ok: true, before, after };
  },

  async sd_lasers(page) {
    // Detect, sim, poll until lasers are active, then screenshot.
    await page.goto(`${URL}?reset=1`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#model-list .model-card');
    const cards = await page.$$('#model-list .model-card');
    await cards[1].click();
    await page.waitForFunction(() => {
      const el = document.getElementById('loading');
      return el && el.classList.contains('hidden');
    }, { timeout: 15000 });
    await page.click('[data-tab="hardpoints"]');
    await new Promise(r => setTimeout(r, 200));
    await page.click('#hp-detect');
    await new Promise(r => setTimeout(r, 200));
    await page.click('#hp-show-arcs'); // hide arcs
    await new Promise(r => setTimeout(r, 100));

    // Top-down camera
    await page.evaluate(() => window.__qa.setCamera(0, 7, 0.001, 0, 0, 0));
    await new Promise(r => setTimeout(r, 200));
    await page.click('#hp-simulate');

    // Wait for at least one active laser before capturing the top view
    let topActive = 0;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 100));
      topActive = await page.evaluate(() => window.__qa.activeLaserCount());
      if (topActive > 0) break;
    }
    const ssTop = resolve(OUT_DIR, 'sd_lasers_top.png');
    await page.screenshot({ path: ssTop, clip: { x: 260, y: 0, width: 1340, height: 900 } });

    // Side view, also wait for an active laser
    await page.evaluate(() => window.__qa.setCamera(7, 1, 0.001, 0, 0, 0));
    await new Promise(r => setTimeout(r, 100));
    let sideActive = 0;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 100));
      sideActive = await page.evaluate(() => window.__qa.activeLaserCount());
      if (sideActive > 0) break;
    }
    const ssSide = resolve(OUT_DIR, 'sd_lasers_side.png');
    await page.screenshot({ path: ssSide, clip: { x: 260, y: 0, width: 1340, height: 900 } });

    return { ok: true, ssTop, ssSide, topActive, sideActive };
  },

  async sd_detect_button(page) {
    // End-to-end test of the new "Detect" button
    await page.goto(`${URL}?reset=1`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#model-list .model-card');
    const cards = await page.$$('#model-list .model-card');
    await cards[1].click();
    await page.waitForFunction(() => {
      const el = document.getElementById('loading');
      return el && el.classList.contains('hidden');
    }, { timeout: 15000 });
    await page.click('[data-tab="hardpoints"]');
    await new Promise(r => setTimeout(r, 200));

    // Click the new Detect button
    await page.click('#hp-detect');
    await new Promise(r => setTimeout(r, 300));

    const state = await page.evaluate(() => ({
      countText: document.getElementById('hp-count')?.textContent,
      hpItems: document.querySelectorAll('.hp-item').length,
      rigStatus: document.getElementById('rig-status')?.innerText || '',
    }));

    return { ok: true, state };
  },

  async sd_auto_balls(page) {
    // Run the new auto ball-turret rig on SD Detailed and verify
    await page.goto(`${URL}?reset=1`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#model-list .model-card');
    const cards = await page.$$('#model-list .model-card');
    await cards[1].click();
    await page.waitForFunction(() => {
      const el = document.getElementById('loading');
      return el && el.classList.contains('hidden');
    }, { timeout: 15000 });
    await page.click('[data-tab="hardpoints"]');

    const result = await page.evaluate(() => window.__qa.autoRigBallTurrets());
    const snap = await page.evaluate(() => window.__qa.snapshot());

    // Hide arcs for cleaner screenshot
    await page.click('#hp-show-arcs');
    await new Promise(r => setTimeout(r, 100));

    // Top-down view
    await page.evaluate(() => window.__qa.setCamera(0, 7, 0.001, 0, 0, 0));
    await new Promise(r => setTimeout(r, 200));

    // Force a 60° rotation to see if turrets visibly tilt
    await page.evaluate(() => window.__qa.forceRotate(0, 0));
    await new Promise(r => setTimeout(r, 100));
    const ssA = resolve(OUT_DIR, 'sd_balls_a.png');
    await page.screenshot({ path: ssA, clip: { x: 260, y: 0, width: 1340, height: 900 } });

    await page.evaluate(() => window.__qa.forceRotate(0, 60));
    await new Promise(r => setTimeout(r, 100));
    const ssB = resolve(OUT_DIR, 'sd_balls_b.png');
    await page.screenshot({ path: ssB, clip: { x: 260, y: 0, width: 1340, height: 900 } });

    return {
      ok: true,
      detectResult: result,
      hardpointCount: snap.length,
      sample: snap.slice(0, 5).map(s => ({
        name: s.name, pitchMesh: s.pitchMesh, worldCenter: s.worldCenter, extents: s.worldBox ? [(s.worldBox.max[0]-s.worldBox.min[0]).toFixed(3),(s.worldBox.max[1]-s.worldBox.min[1]).toFixed(3),(s.worldBox.max[2]-s.worldBox.min[2]).toFixed(3)] : null,
      })),
    };
  },

  async sd_detect_balls(page) {
    await page.goto(`${URL}?reset=1`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#model-list .model-card');
    const cards = await page.$$('#model-list .model-card');
    await cards[1].click();
    await page.waitForFunction(() => {
      const el = document.getElementById('loading');
      return el && el.classList.contains('hidden');
    }, { timeout: 15000 });
    const result = await page.evaluate(() => window.__qa.detectBallTurrets());
    return { ok: true, result };
  },

  async sd_highlight_top(page) {
    // Top-down view of SD Detailed with several candidate mesh groups highlighted.
    // Goal: visually match groups to the dome bumps along the upper hull.
    await page.goto(`${URL}?reset=1`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#model-list .model-card');
    const cards = await page.$$('#model-list .model-card');
    await cards[1].click();
    await page.waitForFunction(() => {
      const el = document.getElementById('loading');
      return el && el.classList.contains('hidden');
    }, { timeout: 15000 });
    await page.click('[data-tab="hardpoints"]');

    // Top-down camera
    await page.evaluate(() => window.__qa.setCamera(0, 7, 0.001, 0, 0, 0));
    await new Promise(r => setTimeout(r, 200));

    const groupsToTry = {
      'group_106_114': ['Object_106', 'Object_108', 'Object_110', 'Object_112', 'Object_114'],
      'group_96_102':  ['Object_96', 'Object_98', 'Object_100', 'Object_102'],
      'group_116_124': ['Object_116', 'Object_118', 'Object_120', 'Object_122', 'Object_124'],
      'group_30_38':   ['Object_30', 'Object_34', 'Object_38'],
      'group_16_20':   ['Object_16', 'Object_20'],
      'group_18_22':   ['Object_18', 'Object_22'],
      'group_132_136': ['Object_132', 'Object_134', 'Object_136'],
      'group_126_130': ['Object_126', 'Object_128', 'Object_130'],
      'group_60_74':   ['Object_60', 'Object_62', 'Object_64', 'Object_66', 'Object_68', 'Object_70', 'Object_72', 'Object_74'],
      'group_36_58':   ['Object_36', 'Object_44', 'Object_46', 'Object_48', 'Object_50', 'Object_52', 'Object_54', 'Object_56', 'Object_58'],
      'high_y_bridge': ['Object_76', 'Object_86', 'Object_88', 'Object_90', 'Object_92', 'Object_94'],
    };

    const results = {};
    for (const [groupName, names] of Object.entries(groupsToTry)) {
      const count = await page.evaluate(n => window.__qa.highlightMeshes(n), names);
      await new Promise(r => setTimeout(r, 100));
      const ss = resolve(OUT_DIR, `sd_top_${groupName}.png`);
      await page.screenshot({ path: ss, clip: { x: 260, y: 0, width: 1340, height: 900 } });
      results[groupName] = { count, screenshot: ss };
    }
    await page.evaluate(() => window.__qa.clearHighlights());
    return { ok: true, results };
  },

  async sd_highlight_groups(page) {
    // Load SD Detailed, highlight different mesh groups in turn, screenshot each
    await page.goto(`${URL}?reset=1`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#model-list .model-card');
    const cards = await page.$$('#model-list .model-card');
    await cards[1].click();
    await page.waitForFunction(() => {
      const el = document.getElementById('loading');
      return el && el.classList.contains('hidden');
    }, { timeout: 15000 });

    const groupsToTry = {
      'cubic_singletons': ['Object_14', 'Object_128'],
      'elongated_40faces': ['Object_36', 'Object_44', 'Object_46', 'Object_48', 'Object_50', 'Object_52', 'Object_54', 'Object_56', 'Object_58', 'Object_60', 'Object_62', 'Object_64', 'Object_66', 'Object_68', 'Object_70', 'Object_72', 'Object_74'],
      'group_106_114': ['Object_106', 'Object_108', 'Object_110', 'Object_112', 'Object_114'],
      'group_96_102': ['Object_96', 'Object_98', 'Object_100', 'Object_102'],
      'group_126_130': ['Object_126', 'Object_128', 'Object_130'],
      'group_132_136': ['Object_132', 'Object_134', 'Object_136'],
      'group_30_38': ['Object_30', 'Object_34', 'Object_38'],
    };

    const results = {};
    for (const [groupName, names] of Object.entries(groupsToTry)) {
      const count = await page.evaluate(n => window.__qa.highlightMeshes(n), names);
      await new Promise(r => setTimeout(r, 100));
      const ss = resolve(OUT_DIR, `sd_hl_${groupName}.png`);
      await page.screenshot({ path: ss, clip: { x: 260, y: 0, width: 1340, height: 900 } });
      results[groupName] = { count, screenshot: ss };
    }
    await page.evaluate(() => window.__qa.clearHighlights());
    return { ok: true, results };
  },

  async sd_shapes(page) {
    // Load SD Detailed and dump every mesh's shape so we can spot groups
    // of cubic/spherical instances (probable ball turrets).
    await page.goto(`${URL}?reset=1`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#model-list .model-card');
    const cards = await page.$$('#model-list .model-card');
    await cards[1].click(); // Star Destroyer (Detailed)
    await page.waitForFunction(() => {
      const el = document.getElementById('loading');
      return el && el.classList.contains('hidden');
    }, { timeout: 15000 });
    const shapes = await page.evaluate(() => window.__qa.meshShapes());
    return { ok: true, shapes };
  },

  async sd_turret_rig(page) {
    // Load SD Detailed, rig ONE turret mesh, hide arcs, force big rotation,
    // screenshot. Single turret + no arc clutter = visible mesh movement.
    await page.goto(`${URL}?reset=1`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#model-list .model-card');
    const cards = await page.$$('#model-list .model-card');
    await cards[1].click(); // Star Destroyer (Detailed)
    await page.waitForFunction(() => {
      const el = document.getElementById('loading');
      return el && el.classList.contains('hidden');
    }, { timeout: 15000 });
    await page.click('[data-tab="hardpoints"]');
    await new Promise(r => setTimeout(r, 200));

    // Hide the firing arcs so they don't obscure the ship
    await page.click('#hp-show-arcs');
    await new Promise(r => setTimeout(r, 100));

    // Rig a single likely-turret mesh (Object_36 — 40 faces, single component)
    const r = await page.evaluate(n => window.__qa.rigByName(n), 'Object_36');
    const snap = await page.evaluate(() => window.__qa.snapshot());

    // 0° rotation
    await page.evaluate(() => window.__qa.forceRotate(0, 0));
    await new Promise(r => setTimeout(r, 100));
    const ssA = resolve(OUT_DIR, 'sd_turret_a.png');
    await page.screenshot({ path: ssA, fullPage: false, clip: { x: 260, y: 0, width: 1340, height: 900 } });

    // 90° yaw, 45° pitch (huge rotation)
    await page.evaluate(() => window.__qa.forceRotate(90, 45));
    await new Promise(r => setTimeout(r, 100));
    const ssB = resolve(OUT_DIR, 'sd_turret_b.png');
    await page.screenshot({ path: ssB, fullPage: false, clip: { x: 260, y: 0, width: 1340, height: 900 } });

    const fs = await import('node:fs');
    const crypto = await import('node:crypto');
    const hashA = crypto.createHash('sha1').update(fs.readFileSync(ssA)).digest('hex');
    const hashB = crypto.createHash('sha1').update(fs.readFileSync(ssB)).digest('hex');

    return {
      ok: true,
      rigResult: r,
      hardpointCount: snap.length,
      snapshot: snap.map(s => ({
        name: s.name,
        pitchMesh: s.pitchMesh,
        worldCenter: s.worldCenter,
        worldExtents: s.worldBox ? [s.worldBox.max[0]-s.worldBox.min[0], s.worldBox.max[1]-s.worldBox.min[1], s.worldBox.max[2]-s.worldBox.min[2]].map(v => +v.toFixed(3)) : null,
      })),
      hashA, hashB,
      pixelsChanged: hashA !== hashB,
    };
  },

  async inspect_sd(page) {
    await page.goto(`${URL}?reset=1`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#model-list .model-card');
    const cards = await page.$$('#model-list .model-card');
    await cards[1].click(); // Star Destroyer (Detailed)
    await page.waitForFunction(() => {
      const el = document.getElementById('loading');
      return el && el.classList.contains('hidden');
    }, { timeout: 15000 });

    const meshes = await page.evaluate(() => window.__qa.inspectMeshes(5));
    return { ok: true, meshes };
  },

  async inspect_all(page) {
    // Survey every ship in the catalog: how many meshes, how clean is each one?
    await page.goto(`${URL}?reset=1`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#model-list .model-card');
    const cards = await page.$$('#model-list .model-card');
    const summary = [];
    for (let i = 0; i < cards.length; i++) {
      const card = (await page.$$('#model-list .model-card'))[i];
      await card.click();
      await page.waitForFunction(() => {
        const el = document.getElementById('loading');
        return el && el.classList.contains('hidden');
      }, { timeout: 15000 });
      const name = await page.evaluate((idx) =>
        document.querySelectorAll('#model-list .model-card')[idx]?.querySelector('.name')?.textContent,
      i);
      const meshes = await page.evaluate(() => window.__qa.inspectMeshes(5));
      const totalIslands = meshes.reduce((s, m) => s + m.islandCount, 0);
      const totalFaces = meshes.reduce((s, m) => s + m.faceCount, 0);
      summary.push({
        idx: i,
        name,
        meshCount: meshes.length,
        totalFaces,
        totalIslands,
        avgIslandsPerMesh: meshes.length ? (totalIslands / meshes.length).toFixed(1) : 0,
      });
    }
    return { ok: true, summary };
  },

  async force_rotate(page) {
    // Reset, load Star Destroyer (Low Poly) which has clearly separated turrets,
    // rig 1 turret, then forcibly rotate it 90° and screenshot before/after.
    await page.goto(`${URL}?reset=1`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#model-list .model-card');
    const cards = await page.$$('#model-list .model-card');
    await cards[3].click(); // Venator
    await page.waitForFunction(() => {
      const el = document.getElementById('loading');
      return el && el.classList.contains('hidden');
    }, { timeout: 15000 });
    await page.click('[data-tab="hardpoints"]');
    await new Promise(r => setTimeout(r, 200));
    await page.click('#hp-auto-mode');

    const vp = await page.evaluate(() => {
      const el = document.getElementById('viewport');
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });

    // Click center of ship
    await page.mouse.click(Math.round(vp.x + vp.w * 0.5), Math.round(vp.y + vp.h * 0.5), { delay: 20 });
    await new Promise(r => setTimeout(r, 300));

    // Snapshot 0° rotation
    await page.evaluate(() => window.__qa.forceRotate(0, 0));
    await new Promise(r => setTimeout(r, 100));
    const ssA = resolve(OUT_DIR, 'force_rotate_a.png');
    await page.screenshot({ path: ssA, fullPage: false, clip: { x: 260, y: 0, width: 1340, height: 900 } });
    const snapA = await page.evaluate(() => window.__qa.snapshot());

    // Force 90° yaw, 30° pitch
    await page.evaluate(() => window.__qa.forceRotate(90, 30));
    await new Promise(r => setTimeout(r, 100));
    const ssB = resolve(OUT_DIR, 'force_rotate_b.png');
    await page.screenshot({ path: ssB, fullPage: false, clip: { x: 260, y: 0, width: 1340, height: 900 } });
    const snapB = await page.evaluate(() => window.__qa.snapshot());

    // Hash + diff
    const fs = await import('node:fs');
    const crypto = await import('node:crypto');
    const hashA = crypto.createHash('sha1').update(fs.readFileSync(ssA)).digest('hex');
    const hashB = crypto.createHash('sha1').update(fs.readFileSync(ssB)).digest('hex');

    return {
      ok: true,
      snapA: snapA.map(s => ({ name: s.name, yawRotY: s.yawRotY, pitchRotX: s.pitchRotX, worldCenter: s.worldCenter })),
      snapB: snapB.map(s => ({ name: s.name, yawRotY: s.yawRotY, pitchRotX: s.pitchRotX, worldCenter: s.worldCenter })),
      hashA, hashB,
      pixelsChanged: hashA !== hashB,
    };
  },

  async diag(page) {
    // Comprehensive diagnostic: rig 1 turret, dump everything we know about it
    await page.goto(`${URL}?reset=1`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#model-list .model-card');
    const cards = await page.$$('#model-list .model-card');
    await cards[3].click(); // Venator
    await page.waitForFunction(() => {
      const el = document.getElementById('loading');
      return el && el.classList.contains('hidden');
    }, { timeout: 15000 });

    // Capture model hierarchy BEFORE any rigging
    const hierarchy = await page.evaluate(() => window.__qa.modelHierarchy());

    await page.click('[data-tab="hardpoints"]');
    await new Promise(r => setTimeout(r, 200));
    await page.click('#hp-auto-mode');

    const vp = await page.evaluate(() => {
      const el = document.getElementById('viewport');
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });

    // Rig one turret at center of viewport
    await page.mouse.click(Math.round(vp.x + vp.w * 0.5), Math.round(vp.y + vp.h * 0.5), { delay: 20 });
    await new Promise(r => setTimeout(r, 300));

    const snap = await page.evaluate(() => window.__qa.snapshot());

    // Force pitch rotation manually to a big angle and see if pixels change
    await page.evaluate(() => {
      // grab the only hardpoint
      const dump = window.__qa.snapshot();
      // we don't have direct ref, so use scene traversal: find by turretGroup name pattern
    });

    return { ok: true, hierarchy, snapshot: snap };
  },

  async sim_check(page) {
    // Reset, load Venator, rig 2 turrets, enable sim, snapshot rotations + screenshots
    await page.goto(`${URL}?reset=1`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#model-list .model-card');
    const cards = await page.$$('#model-list .model-card');
    await cards[3].click(); // Venator
    await page.waitForFunction(() => {
      const el = document.getElementById('loading');
      return el && el.classList.contains('hidden');
    }, { timeout: 15000 });
    await page.click('[data-tab="hardpoints"]');
    await new Promise(r => setTimeout(r, 200));
    await page.click('#hp-auto-mode');

    const vp = await page.evaluate(() => {
      const el = document.getElementById('viewport');
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });

    // Two clicks at different positions
    await page.mouse.click(Math.round(vp.x + vp.w * 0.5), Math.round(vp.y + vp.h * 0.5), { delay: 20 });
    await new Promise(r => setTimeout(r, 200));
    await page.mouse.click(Math.round(vp.x + vp.w * 0.4), Math.round(vp.y + vp.h * 0.45), { delay: 20 });
    await new Promise(r => setTimeout(r, 200));

    // Snapshot BEFORE simulation
    const beforeSim = await page.evaluate(() => window.__qa.snapshot());

    // Enable sim
    await page.click('#hp-simulate');
    const simEnabled = await page.evaluate(() => window.__qa.simulating());

    // Force the sim time forward to a known angle so we get a big rotation,
    // not a tiny lerp. We'll directly bump the target into a known position.
    // First snapshot some short-window rotations.
    const rotationFrames = [];
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 200));
      const snap = await page.evaluate(() => ({
        target: window.__qa.simTarget(),
        turrets: window.__qa.snapshot().map(h => ({
          name: h.name,
          yawRotY: h.yawRotY,
          pitchRotX: h.pitchRotX,
          currentYaw: h.currentYaw,
          currentPitch: h.currentPitch,
        })),
      }));
      rotationFrames.push({ frame: i, ...snap });
    }

    // Now wait significantly longer so the lerp has time to converge
    await new Promise(r => setTimeout(r, 2000));
    const afterLong = await page.evaluate(() => window.__qa.snapshot());

    // Take screenshots at two distinct moments to verify VISUAL change
    const ssA = resolve(OUT_DIR, 'sim_check_a.png');
    await page.screenshot({ path: ssA, fullPage: false });
    await new Promise(r => setTimeout(r, 1500));
    const ssB = resolve(OUT_DIR, 'sim_check_b.png');
    await page.screenshot({ path: ssB, fullPage: false });

    // Hash the two screenshots so we can detect if pixels changed at all
    const fs = await import('node:fs');
    const crypto = await import('node:crypto');
    const hashA = crypto.createHash('sha1').update(fs.readFileSync(ssA)).digest('hex');
    const hashB = crypto.createHash('sha1').update(fs.readFileSync(ssB)).digest('hex');

    return {
      ok: true,
      beforeSimCount: beforeSim.length,
      simEnabled,
      rotationFrames,
      afterLong: afterLong.map(h => ({
        name: h.name,
        yawRotY: h.yawRotY, pitchRotX: h.pitchRotX,
        currentYaw: h.currentYaw, currentPitch: h.currentPitch,
      })),
      ssA, ssB, hashA, hashB,
      pixelsChanged: hashA !== hashB,
    };
  },

  async multi_click(page) {
    // Reset state, load Venator, click Auto, then click 4 different points on
    // the ship, capturing the cumulative state after each click.
    await page.goto(`${URL}?reset=1`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#model-list .model-card');
    const cards = await page.$$('#model-list .model-card');
    await cards[3].click(); // Venator
    await page.waitForFunction(() => {
      const el = document.getElementById('loading');
      return el && el.classList.contains('hidden');
    }, { timeout: 15000 });
    await page.click('[data-tab="hardpoints"]');
    await new Promise(r => setTimeout(r, 200));
    await page.click('#hp-auto-mode');

    const vp = await page.evaluate(() => {
      const el = document.getElementById('viewport');
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });

    // Pick a few different positions across the ship body. The Venator
    // auto-frames so its hull spans most of the viewport horizontally.
    const points = [
      { x: vp.x + vp.w * 0.5,  y: vp.y + vp.h * 0.5  }, // dead center
      { x: vp.x + vp.w * 0.4,  y: vp.y + vp.h * 0.45 }, // upper left of hull
      { x: vp.x + vp.w * 0.6,  y: vp.y + vp.h * 0.55 }, // lower right of hull
      { x: vp.x + vp.w * 0.55, y: vp.y + vp.h * 0.4  }, // upper right
    ];

    const stepResults = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      await page.mouse.click(Math.round(p.x), Math.round(p.y), { delay: 20 });
      await new Promise(r => setTimeout(r, 250));
      const s = await page.evaluate(() => ({
        countText: document.getElementById('hp-count')?.textContent,
        hpItems: document.querySelectorAll('.hp-item').length,
        rigStatus: document.getElementById('rig-status')?.innerText || '',
        autoActive: document.getElementById('hp-auto-mode')?.classList.contains('active'),
      }));
      stepResults.push({ click: { x: Math.round(p.x), y: Math.round(p.y) }, after: s });
    }

    // Turn on simulation, wait a moment, capture rotations
    await page.click('#hp-simulate');
    await new Promise(r => setTimeout(r, 1500));

    const simState = await page.evaluate(() => {
      // Walk the scene to find all turret yaw/pitch values
      const yaws = [];
      const pitches = [];
      // We can't easily reach hardpoints from outside — read from the DOM count instead
      return {
        simButtonActive: document.getElementById('hp-simulate')?.classList.contains('active'),
        countText: document.getElementById('hp-count')?.textContent,
        hpItems: document.querySelectorAll('.hp-item').length,
      };
    });

    return { ok: true, stepResults, simState };
  },

  async clear_button(page) {
    // Seed bad state, load Venator (which will import it), then click Clear
    await page.evaluate(() => {
      // Build a minimal but valid serialized hardpoints payload for Venator
      const hp = {
        modelId: 'venator',
        splitThreshold: 20,
        hardpoints: [
          { name: 'Zombie 1', type: 'turret', position: { x: 0, y: 1, z: 0 }, normal: { x: 0, y: 1, z: 0 }, yawMin: -180, yawMax: 180, pitchMin: -10, pitchMax: 60 },
          { name: 'Zombie 2', type: 'turret', position: { x: 1, y: 1, z: 0 }, normal: { x: 0, y: 1, z: 0 }, yawMin: -180, yawMax: 180, pitchMin: -10, pitchMax: 60 },
        ],
      };
      localStorage.setItem('ship-hp-venator', JSON.stringify(hp));
    });
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('#model-list .model-card');
    const cards = await page.$$('#model-list .model-card');
    await cards[3].click();
    await page.waitForFunction(() => {
      const el = document.getElementById('loading');
      return el && el.classList.contains('hidden');
    }, { timeout: 15000 });
    await page.click('[data-tab="hardpoints"]');
    await new Promise(r => setTimeout(r, 200));

    const beforeClear = await page.evaluate(() => ({
      countText: document.getElementById('hp-count')?.textContent,
      hpItems: document.querySelectorAll('.hp-item').length,
      stored: !!localStorage.getItem('ship-hp-venator'),
    }));

    // Click Clear (auto-dismiss confirm dialog)
    page.once('dialog', async d => { await d.accept(); });
    await page.click('#hp-clear-all');
    // Wait for the model to reload after clear
    await new Promise(r => setTimeout(r, 800));

    const afterClear = await page.evaluate(() => ({
      countText: document.getElementById('hp-count')?.textContent,
      hpItems: document.querySelectorAll('.hp-item').length,
      stored: !!localStorage.getItem('ship-hp-venator'),
    }));

    return { ok: true, beforeClear, afterClear };
  },

  async venator(page) {
    // Clear before running so previous state doesn't contaminate
    await page.evaluate(() => {
      Object.keys(localStorage)
        .filter(k => k.startsWith('ship-hp-'))
        .forEach(k => localStorage.removeItem(k));
    });
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('#model-list .model-card');

    // Click the Venator card (4th in the list: low-poly, detailed, eclipse, venator)
    const cards = await page.$$('#model-list .model-card');
    if (cards.length < 4) throw new Error(`expected >=4 model cards, got ${cards.length}`);
    await cards[3].click();

    // Wait for model to load — look for the hardpoints panel becoming visible
    await page.waitForFunction(() => {
      const el = document.getElementById('loading');
      return el && el.classList.contains('hidden');
    }, { timeout: 15000 });

    // Switch to hardpoints tab
    await page.click('[data-tab="hardpoints"]');
    await new Promise(r => setTimeout(r, 200));

    // Click Auto
    await page.click('#hp-auto-mode');
    const autoActive = await page.$eval('#hp-auto-mode', el => el.classList.contains('active'));

    // Capture the viewport rect so we can click in it
    const vp = await page.evaluate(() => {
      const el = document.getElementById('viewport');
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });

    // Click roughly at the ship center — the camera auto-frames so a click near
    // viewport center should hit the ship body. Not specifically a turret; the
    // point is to see what happens and report state.
    const cx = Math.round(vp.x + vp.w * 0.5);
    const cy = Math.round(vp.y + vp.h * 0.5);
    await page.mouse.click(cx, cy, { delay: 20 });
    await new Promise(r => setTimeout(r, 300));

    // Collect post-click state
    const state = await page.evaluate(() => {
      const countText = document.getElementById('hp-count')?.textContent || '';
      const hpItems = document.querySelectorAll('.hp-item').length;
      const statFaces = document.getElementById('stat-faces')?.textContent;
      const statMeshes = document.getElementById('stat-meshes')?.textContent;
      const rigStatus = document.getElementById('rig-status')?.innerText || '';
      return { countText, hpItems, statFaces, statMeshes, rigStatus };
    });

    return { ok: true, autoActive, clickAt: { cx, cy }, viewport: vp, state };
  },
};

if (!scenarios[scenario]) {
  console.error(`Unknown scenario "${scenario}". Available: ${Object.keys(scenarios).join(', ')}`);
  process.exit(2);
}

// ---------- harness ----------
const consoleLogs = [];
const pageErrors = [];
const requestFailures = [];

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1600,900'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });

  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push({ type: msg.type(), text });
  });
  page.on('pageerror', err => {
    pageErrors.push({ message: err.message, stack: err.stack });
  });
  page.on('requestfailed', req => {
    requestFailures.push({ url: req.url(), failure: req.failure()?.errorText });
  });

  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 15000 });

  const result = await scenarios[scenario](page);

  const screenshotPath = resolve(OUT_DIR, `${scenario}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });

  const report = {
    scenario,
    result,
    consoleLogs: consoleLogs.slice(-80), // last 80 entries
    pageErrors,
    requestFailures,
    screenshot: screenshotPath,
  };

  const reportPath = resolve(OUT_DIR, `${scenario}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Print concise summary to stdout
  console.log('=== QA REPORT:', scenario, '===');
  console.log('result:', JSON.stringify(result, null, 2));
  console.log(`pageErrors: ${pageErrors.length}`);
  for (const e of pageErrors) console.log('  ERR:', e.message);
  console.log(`requestFailures: ${requestFailures.length}`);
  for (const r of requestFailures) console.log('  REQ:', r.url, r.failure);
  console.log(`consoleLogs: ${consoleLogs.length}`);
  for (const l of consoleLogs.slice(-40)) console.log(`  [${l.type}] ${l.text.slice(0, 300)}`);
  console.log('screenshot:', screenshotPath);
  console.log('report json:', reportPath);
} finally {
  await browser.close();
}
