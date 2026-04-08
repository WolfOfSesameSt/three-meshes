#!/usr/bin/env node
/**
 * Game-side QA harness — drives the in-game scene to verify the mothership
 * loaded correctly and the turret system is wired up.
 *
 * Run with: node src/games/void-raiders/qa-game.mjs [scenario]
 *
 * Requires the Vite dev server to be running on :5173.
 */

import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// QA_PORT lets scenarios target a separate Vite dev server (e.g. 5180) so
// they don't interfere with the human dev server on 5173. Defaults to 5173
// for backwards compatibility with existing scenarios.
const QA_PORT = process.env.QA_PORT || '5173';
const URL = `http://localhost:${QA_PORT}/src/games/void-raiders/index.html`;
const OUT_DIR = resolve(__dirname, '.qa-game');
mkdirSync(OUT_DIR, { recursive: true });

const scenario = process.argv[2] || 'inspect';

const scenarios = {
  /**
   * Just load the page (no mission), inspect the saved config in localStorage.
   */
  async config(page) {
    const cfg = await page.evaluate(() => window.__qa.savedConfigPreview());
    return { ok: true, savedConfig: cfg };
  },

  /**
   * Load page → start mission → inspect mothership state after the world loads.
   *
   * IMPORTANT: puppeteer starts with empty localStorage, so we first navigate
   * to the model preview, click Detect to seed the saved hardpoint config,
   * THEN navigate to the game URL (same origin = shared localStorage).
   */
  async calibrate(page) {
    // Visual verification: spawn calibration enemies, switch to free camera,
    // fly to a vantage point ABOVE the ship looking down, screenshot.
    // Then a second view from BELOW. Then a side view.
    await page.goto('http://localhost:5173/src/games/void-raiders/model-preview/index.html?reset=1', {
      waitUntil: 'networkidle0', timeout: 30000,
    });
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

    await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluate(() => window.__qa.startMission());
    let exists = false;
    for (let i = 0; i < 60 && !exists; i++) {
      await new Promise(r => setTimeout(r, 200));
      exists = await page.evaluate(() => window.__qa.mothership().exists);
    }
    await new Promise(r => setTimeout(r, 500));

    // Spawn calibration enemies
    await page.evaluate(() => window.__qa.spawnCalibration(100));
    await new Promise(r => setTimeout(r, 1000));

    // Drop captures from a few angles. To do that, set free-mode camera and
    // teleport via direct camera position writes.
    const screenshots = [];
    const angles = [
      { name: 'above',   pos: [0, 250, 0], look: [0, 50, 0] },
      { name: 'side',    pos: [200, 60, 0], look: [0, 50, 0] },
      { name: 'below',   pos: [0, -150, 0], look: [0, 50, 0] },
      { name: 'frontup', pos: [0, 100, -150], look: [0, 50, 0] },
    ];
    for (const a of angles) {
      await page.evaluate((a) => {
        // Force the camera into free mode + position it manually for the shot
        const cam = window.__qaCam || (window.__qaCam = (() => {
          // We don't have direct camera access. Use the FollowCamera if present.
          // Fall back to no-op if not.
          return null;
        })());
      }, a);
      // We'll instead use page.evaluate to set up the angle through __qa.setCameraAt
      await page.evaluate((a) => {
        if (window.__qa.setCameraAt) window.__qa.setCameraAt(a.pos, a.look);
      }, a);
      await new Promise(r => setTimeout(r, 800));
      const ssPath = resolve(OUT_DIR, `calibrate_${a.name}.png`);
      await page.screenshot({ path: ssPath });
      screenshots.push(ssPath);
    }

    const finalState = await page.evaluate(() => window.__qa.mothership());
    return {
      ok: true,
      turretCount: finalState.turretCount,
      canFireCount: (finalState.turrets || []).filter(t => t.canFire).length,
      screenshots,
    };
  },

  /**
   * Repair bay end-to-end — drives the "damaged" drone retreat through the
   * real update loop and verifies the drone is admitted, healed, and
   * released. Run against a separate Vite dev server via QA_PORT so the
   * user's :5173 stays untouched.
   *
   *   QA_PORT=5180 node src/games/void-raiders/qa-game.mjs repair-bay
   */
  async 'repair-bay'(page) {
    // Step 1: start the mission via __qa and wait for the mothership glTF
    // to finish loading.
    await page.evaluate(() => window.__qa.startMission());
    let exists = false;
    for (let i = 0; i < 60 && !exists; i++) {
      await new Promise(r => setTimeout(r, 200));
      exists = await page.evaluate(() => window.__qa.mothership().exists);
    }
    if (!exists) {
      return { ok: false, reason: 'mothership never loaded' };
    }
    // Give deploy + initial simulation a moment to settle
    await new Promise(r => setTimeout(r, 500));

    // Step 2: unlock the damaged retreat so the routine engine actually
    // evaluates it when the swarm gets flipped.
    const unlocked = await page.evaluate(() => window.__qa.unlockRetreat('damaged'));

    // Step 3: seed the tesseract with iron-ore + top up energy so hull
    // repair can actually run. The game starts with an empty tesseract
    // (mining is the normal fill path) — without this the bay would try
    // to repair with 0 materials and the scenario would stall.
    const seedResult = await page.evaluate(() => window.__qa.seedRepairStockpile(500, 100));

    // Step 4: flip swarm 1 (offensive) to the damaged retreat.
    const swarmFlipResult = await page.evaluate(() => {
      // createStarterFleet pushes miner swarm first (index 0), then
      // fighter swarm (index 1). We want fighters because they have
      // shields and higher hull — the scenario exercises both repair
      // paths.
      return window.__qa.setSwarmRetreat(1, 'damaged');
    });

    // Step 5: pick the first offensive drone, teleport it to the ship,
    // and damage it to 30% hull. The FleetManager will evaluate the
    // retreat next tick.
    const pickResult = await page.evaluate(() => {
      const drones = window.__qa.droneSummary();
      // Pick the first offensive drone, which has shields to test the
      // energy-drain path.
      const idx = drones.findIndex(d => d.type === 'offensive');
      if (idx < 0) return { ok: false, reason: 'no offensive drones found', drones };
      window.__qa.teleportDroneToShip(idx);
      const dmg = window.__qa.damageDroneByIndex(idx, 0.3);
      return { ok: true, idx, drone: drones[idx], damage: dmg };
    });

    // Step 6: poll the repair bay for ~5 seconds of real time.
    const samples = [];
    let maxActiveCount = 0;
    let sawAdmission = false;
    let sawCompletion = false;
    for (let i = 0; i < 50; i++) {
      await new Promise(r => setTimeout(r, 100));
      const sample = await page.evaluate(() => {
        const bay = window.__qa.repairBay();
        const rm = window.__qa.routineMetrics();
        const ds = window.__qa.droneSummary();
        const offensive = ds.find(d => d.type === 'offensive');
        return {
          bay,
          routineMetrics: rm,
          focusedDrone: offensive ? {
            id: offensive.id,
            state: offensive.state,
            hull: offensive.hull,
            hullMax: offensive.hullMax,
            shields: offensive.shields,
            shieldsMax: offensive.shieldsMax,
            retreatReason: offensive.retreatReason,
          } : null,
        };
      });
      samples.push({ t: (i + 1) * 0.1, ...sample });
      if (sample.bay && sample.bay.activeCount > maxActiveCount) {
        maxActiveCount = sample.bay.activeCount;
      }
      if (sample.bay && (sample.bay.activeCount >= 1 || sample.bay.queuedCount >= 1)) {
        sawAdmission = true;
      }
      if (sample.bay && sample.bay.metrics.completed >= 1) {
        sawCompletion = true;
      }
      // Early exit once we've seen admission + completion — no point in
      // burning the remaining 4 seconds of poll time.
      if (sawAdmission && sawCompletion) break;
    }

    // Step 7: final snapshot + assertions
    const finalBay = await page.evaluate(() => window.__qa.repairBay());
    const finalMetrics = await page.evaluate(() => window.__qa.routineMetrics());
    const finalDrones = await page.evaluate(() => window.__qa.droneSummary());

    const damagedRetreats = finalMetrics?.retreats?.damaged ?? 0;
    const focused = finalDrones.find(d => d.type === 'offensive');

    const assertions = {
      sawAdmission,
      sawCompletion,
      activeCountReachedOne: maxActiveCount >= 1,
      completedAtLeastOne: (finalBay?.metrics.completed ?? 0) >= 1,
      damagedRetreatCounterIncremented: damagedRetreats >= 1,
      spentEnergyOrMaterials:
        (finalBay?.metrics.totalEnergySpent ?? 0) > 0 ||
        (finalBay?.metrics.totalMaterialsSpent ?? 0) > 0,
    };
    const allPassed = Object.values(assertions).every(Boolean);

    return {
      ok: allPassed,
      assertions,
      unlocked,
      swarmFlipResult,
      pickResult,
      maxActiveCount,
      finalBay,
      finalRoutineMetrics: finalMetrics,
      focusedFinalDrone: focused,
      // Trim sample history — first, middle, last for diagnostics
      sampleHead: samples.slice(0, 3),
      sampleMid: samples[Math.floor(samples.length / 2)],
      sampleTail: samples.slice(-3),
      sampleCount: samples.length,
    };
  },

  async inspect(page) {
    // Step 1: seed localStorage by running Detect in the model preview
    await page.goto('http://localhost:5173/src/games/void-raiders/model-preview/index.html?reset=1', {
      waitUntil: 'networkidle0', timeout: 30000,
    });
    await page.waitForSelector('#model-list .model-card');
    const cards = await page.$$('#model-list .model-card');
    await cards[1].click(); // Star Destroyer (Detailed)
    await page.waitForFunction(() => {
      const el = document.getElementById('loading');
      return el && el.classList.contains('hidden');
    }, { timeout: 15000 });
    await page.click('[data-tab="hardpoints"]');
    await new Promise(r => setTimeout(r, 200));
    await page.click('#hp-detect');
    await new Promise(r => setTimeout(r, 300));
    const seedCount = await page.evaluate(() => {
      const raw = localStorage.getItem('ship-hp-star-destroyer');
      return raw ? JSON.parse(raw).hardpoints.length : 0;
    });

    // Step 2: navigate to the game (same origin → localStorage persists)
    await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });

    // Saved config snapshot — should now have the seeded entries
    const savedConfig = await page.evaluate(() => window.__qa.savedConfigPreview());

    // Trigger mission start (skips the click-through-station UI)
    await page.evaluate(() => window.__qa.startMission());

    // Wait for the mothership to be loaded — Mothership.create is async and
    // takes a moment to fetch the glTF. Poll until __qa.mothership() reports
    // it exists.
    let exists = false;
    for (let i = 0; i < 60 && !exists; i++) {
      await new Promise(r => setTimeout(r, 200));
      exists = await page.evaluate(() => window.__qa.mothership().exists);
    }

    const ms = await page.evaluate(() => window.__qa.mothership());
    const enemies = await page.evaluate(() => window.__qa.enemies());
    const meshVis = await page.evaluate(() => window.__qa.meshVisibility());
    const visibleBalls = await page.evaluate(() => window.__qa.findVisibleBallShapes());

    // Spawn the full calibration grid (8 invincible test targets at all
    // hemispheres) instead of one fragile scout — lets every turret pick a
    // target and lets the rotation lerp converge.
    await page.evaluate(() => window.__qa.spawnCalibration());
    await new Promise(r => setTimeout(r, 2000));
    const enemiesAfter = await page.evaluate(() => window.__qa.enemies());
    const msAfter = await page.evaluate(() => window.__qa.mothership());

    // Toggle 8 slots off and verify only 1 is active
    await page.evaluate(() => {
      for (let i = 1; i < 9; i++) window.__qa.setTurretActive(i, false);
    });
    await new Promise(r => setTimeout(r, 300));
    const afterToggle = await page.evaluate(() => {
      const ms = window.__qa.mothership();
      return {
        activeCount: (ms.turrets || []).filter(t => t.active !== false).length,
        // Walk the scene visibility to count visible vs hidden slot groups
        // (we don't have direct group.visible in the snapshot, so use hpItems)
        groupVisibility: (ms.turrets || []).map(t => ({
          name: t.name,
          // The snapshot doesn't expose group.visible directly; we'll just
          // confirm via the active flag. Real visual check is the screenshot.
          active: t.active,
        })),
      };
    });
    // Reset to all active for the next inspection step
    await page.evaluate(() => {
      for (let i = 0; i < 9; i++) window.__qa.setTurretActive(i, true);
    });

    return {
      ok: true,
      seedCount,
      visibleBalls,
      afterToggle,
      savedConfigSummary: {
        hardpointCount: savedConfig?.hardpointCount,
        firstEntryKeys: savedConfig?.firstEntryKeys,
      },
      // Show every saved entry's identifying keys so we can spot the format
      // mismatch on the one that's being skipped
      savedEntryFormats: await page.evaluate(() => {
        const raw = localStorage.getItem("ship-hp-star-destroyer");
        if (!raw) return [];
        return JSON.parse(raw).hardpoints.map(h => ({
          name: h.name,
          type: h.type,
          hasModelSlot: !!h.modelSlot,
          hasModelTurret: !!h.modelTurret,
          isBay: h.type === "drone_bay",
          position: h.position,
          normal: h.normal,
        }));
      }),
      mothershipImmediate: { turretCount: ms.turretCount, bayCount: ms.bayCount, shieldRadius: ms.shieldRadius },
      meshVisibility: meshVis,
      enemiesImmediate: enemies.length,
      enemiesAfterWait: enemiesAfter.length,
      mothershipAfterWait: {
        turretCount: msAfter.turretCount,
        bayCount: msAfter.bayCount,
        shieldRadius: msAfter.shieldRadius,
        shipPos: msAfter.position,
        // Show ALL turrets — name, normal, canFire, rotation, world position
        turrets: (msAfter.turrets || []).map(t => ({
          name: t.name,
          weaponType: t.weaponType,
          attackId: t.attackId,
          active: t.active,
          usedSourceMesh: t.usedSourceMesh,
          groupVisible: t.groupVisible,
          normalY: t.normal.y, // +1 = top-mount, -1 = bottom
          yawRotY: +t.yawRotY?.toFixed(3),
          pitchRotX: +t.pitchRotX?.toFixed(3),
          barrelYawDeg: t.barrelYawOffsetDeg,
          barrelPitchDeg: t.barrelPitchOffsetDeg,
          muzzleLocal: t.muzzleLocalRaw,
          canFire: t.canFire,
          // World positions — should be NEAR the ship, not 100 units away
          groupWorld: t.groupWorld ? { x: +t.groupWorld.x.toFixed(2), y: +t.groupWorld.y.toFixed(2), z: +t.groupWorld.z.toFixed(2) } : null,
          // Bounding-box size — exposes the "mesh is huge" bug. A ball
          // turret should be ~1-2 meters across in world units, not 8+ m.
          groupSize: t.groupSize ? { x: +t.groupSize.x.toFixed(2), y: +t.groupSize.y.toFixed(2), z: +t.groupSize.z.toFixed(2) } : null,
          muzzleWorld: t.muzzleWorld ? { x: +t.muzzleWorld.x.toFixed(2), y: +t.muzzleWorld.y.toFixed(2), z: +t.muzzleWorld.z.toFixed(2) } : null,
          // Distance from ship center
          distFromShip: t.groupWorld && msAfter.position ? +Math.sqrt(
            (t.groupWorld.x - msAfter.position.x) ** 2 +
            (t.groupWorld.y - msAfter.position.y) ** 2 +
            (t.groupWorld.z - msAfter.position.z) ** 2
          ).toFixed(2) : null,
          stillVisibleSourceCount: (t.sourceVisibility || []).filter(s => s.visible).length,
          totalSourceCount: (t.sourceVisibility || []).length,
          headHasMap: t.headHasMap,
          barrelHasMap: t.barrelHasMap,
        })),
        topCount: (msAfter.turrets || []).filter(t => t.normal.y > 0).length,
        bottomCount: (msAfter.turrets || []).filter(t => t.normal.y < 0).length,
        canFireCount: (msAfter.turrets || []).filter(t => t.canFire).length,
      },
    };
  },
};

if (!scenarios[scenario]) {
  console.error(`Unknown scenario "${scenario}". Available: ${Object.keys(scenarios).join(', ')}`);
  process.exit(2);
}

const consoleLogs = [];
const pageErrors = [];

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1600,900'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });

  page.on('console', msg => consoleLogs.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => pageErrors.push({ message: err.message, stack: err.stack }));

  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });

  const result = await scenarios[scenario](page);

  const ssPath = resolve(OUT_DIR, `${scenario}.png`);
  await page.screenshot({ path: ssPath });

  const reportPath = resolve(OUT_DIR, `${scenario}.json`);
  writeFileSync(reportPath, JSON.stringify({
    scenario, result,
    consoleLogs: consoleLogs.slice(-60),
    pageErrors,
    screenshot: ssPath,
  }, null, 2));

  console.log('=== QA REPORT:', scenario, '===');
  console.log('result:', JSON.stringify(result, null, 2));
  console.log('pageErrors:', pageErrors.length);
  for (const e of pageErrors) console.log('  ERR:', e.message);
  console.log(`consoleLogs (last 30, filtered):`);
  for (const l of consoleLogs.filter(l => l.type !== 'warn' || l.text.startsWith('[')).slice(-30)) {
    console.log(`  [${l.type}] ${l.text.slice(0, 200)}`);
  }
  console.log('screenshot:', ssPath);
  console.log('report:', reportPath);
} finally {
  await browser.close();
}
