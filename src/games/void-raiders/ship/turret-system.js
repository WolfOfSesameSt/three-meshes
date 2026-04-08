/**
 * Mothership turret system — per-slot aim + fire for the loaded glTF
 * mothership's procedural ball turrets.
 *
 * Replaces the global WeaponSystem when the mothership has any turrets.
 * Each turret independently picks the closest enemy in its firing arc,
 * tracks it via the shared aim machinery in turret-rigger.js, and pulses
 * a laser from its actual barrel tip on cooldown.
 *
 * The current targeting is "closest in firing arc + range":
 *   - For each turret, walk the alive enemies, transform each into the
 *     turret's local frame, keep the ones with local +Y > 0 (above the
 *     surface) and within RANGE of the turret muzzle, pick the nearest.
 *
 * Per-turret AI/upgrade hooks (priority weights, range modifiers, fire-rate
 * modifiers) get layered on top of this in a future pass.
 */

import * as THREE from "three";
import { aimTurret } from "./turret-rigger.js";
import { getAttack } from "../combat/attack-defs.js";
import { applyDamage, shieldWouldFullyAbsorb } from "../combat/damage-resolver.js";
import { getRoutine } from "../combat/weapon-routines.js";
import {
  createBeamShaderPool,
  createTrailedProjectilePool,
  createShockwavePool,
  createChargeUpPool,
  createMuzzleFlashPool,
} from "../combat/weapon-shaders.js";

const _muzzleWorld = new THREE.Vector3();
const _barrelDirLocal = new THREE.Vector3();
const _barrelDirWorld = new THREE.Vector3();
const _laserEnd = new THREE.Vector3();
const _enemyVec = new THREE.Vector3();
const _enemyLocal = new THREE.Vector3();
const _tempInvMat = new THREE.Matrix4();

// Default fallbacks when a turret has no attackId (procedural mothership).
const DEFAULT_ATTACK_ID = "point-defense-pulse";

// Fire-rate jitter percentages — applied to whichever attack def's fireRate
// the turret is using, so two flak guns don't sync up to volley together.
const FIRE_JITTER_FRAC = 0.25;

// Missile launcher revolver step + reload sequence — these are visual-only
// constants for the procedural revolver hardware, independent of the
// per-attack burstInterval/burstCount which the def supplies.
const MISSILE_REVOLVER_STEP_TIME = 0.18; // seconds rotating between shots

// Reload sequence — instead of lowering into the hull, the launcher tilts
// up to point at the sky, then loads one missile at a time (revolver
// clicks between each load), then drops back to combat aim. The aim
// function resumes naturally after RELOADING completes and lerps the
// barrel back onto the next target.
const MISSILE_TILT_UP_TIME = 0.55;
const MISSILE_TILT_SKY_ANGLE = -1.35;  // radians on pitchPivot.rotation.x ≈ 77° up
const MISSILE_RELOAD_STEP_TIME = 0.55; // per-missile load delay
const MISSILE_RELOAD_ROTATE_TIME = 0.18;

// Default revolver chamber count — overridden by attack def burstCount when
// the equipped attack supplies one.
const DEFAULT_MISSILE_BURST_COUNT = 6;

// Launcher state machine constants
const LAUNCHER_STATE = {
  LOADED: "loaded",
  ROTATING: "rotating",       // between firing shots
  TILTING_UP: "tilting_up",   // raising the barrel toward the sky after a burst
  RELOADING: "reloading",     // tips reappear one at a time, revolver clicks between
  RELOAD_ROTATE: "reload_rotate", // between-tip rotation during reload
};

export class TurretSystem {
  /**
   * @param {THREE.Scene} scene - for the laser pool to attach beams to
   * @param {object} [opts]
   * @param {object} [opts.audioManager] - optional, for fire sound
   * @param {object} [opts.combatEffects] - for impact flashes / debris on heavy hits
   * @param {function} [opts.getEnemies] - returns the live enemy array (for AOE damage)
   * @param {object} [opts.screenShake] - shake on heavy impact
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.audioManager = opts.audioManager || null;
    this.combatEffects = opts.combatEffects || null;
    this.getEnemies = opts.getEnemies || null;
    this.screenShake = opts.screenShake || null;

    // ── Shader-based weapon FX pools ──
    // Replaces the legacy cylinder/sphere pools with full ShaderMaterial
    // beams, contrail-ribbon projectiles, fresnel shockwaves, charge-up
    // glows, and per-shot muzzle flashes. Each pool is sized small because
    // the active turret count tops out around 9.
    this.lasers = createBeamShaderPool(scene, { poolSize: 30 });
    this.heavyProjectiles = createTrailedProjectilePool(scene, {
      poolSize: 16,
      size: 3.0, // bolt sphere radius — reads as a clear glowing missile head
    });
    this.shockwaves = createShockwavePool(scene, { poolSize: 12 });
    this.chargeUps = createChargeUpPool(scene, { poolSize: 6 });
    this.muzzleFlashes = createMuzzleFlashPool(scene, { poolSize: 24 });
  }

  /**
   * Late-bind the combat helper hooks. Called from main.js once
   * combatEffects + screenShake + the enemy list are all available.
   */
  setCombatHooks({ combatEffects, getEnemies, screenShake }) {
    if (combatEffects !== undefined) this.combatEffects = combatEffects;
    if (getEnemies !== undefined) this.getEnemies = getEnemies;
    if (screenShake !== undefined) this.screenShake = screenShake;
  }

  /**
   * Per-frame turret update — aim, fire, decay lasers.
   *
   * @param {number} dt
   * @param {import('./mothership.js').Mothership} mothership
   * @param {Array} enemies — alive enemies with `.position` and `.stats.hull`
   */
  update(dt, mothership, enemies) {
    // Always update the pools so existing pulses + projectiles tick down
    // cleanly even when the ship has no turrets or no targets.
    this.lasers.update(dt);
    this.heavyProjectiles.update(dt);
    this.shockwaves.update(dt);
    this.chargeUps.update(dt);
    this.muzzleFlashes.update(dt);

    if (!mothership || !mothership.turrets || mothership.turrets.length === 0) return;
    if (!enemies || enemies.length === 0) {
      // No targets — let any in-flight aim relax back toward zero.
      for (const t of mothership.turrets) {
        if (t.fireCooldown === undefined) this._initTurret(t);
        t.fireCooldown -= dt;
      }
      return;
    }

    // Make sure the mothership transform chain is fresh before we read any
    // turret world matrices. The ship moves + rotates each frame.
    mothership.mesh.updateMatrixWorld(true);

    for (const turret of mothership.turrets) {
      // Inactive slots (locked behind the upgrade system, etc.) — skip
      // entirely. They don't track, don't fire, and their visible mesh
      // should already be hidden by mothership.setTurretActive().
      if (turret.active === false) {
        turret.canFire = false;
        continue;
      }

      if (turret.fireCooldown === undefined) this._initTurret(turret);
      turret.fireCooldown -= dt;

      // Resolve the equipped attack def. Falls back to point-defense-pulse
      // if the slot was set up before attackId existed.
      const attackDef = getAttack(turret.attackId || DEFAULT_ATTACK_ID) || getAttack(DEFAULT_ATTACK_ID);
      const range = attackDef.range;

      const isMissile = turret.weaponType === "missile_launcher";
      const isHeavy = turret.weaponType === "heavy_cannon";

      // Missile launchers tick their state machine every frame regardless
      // of whether there's a current target — the lower/reload/raise
      // animations need to keep advancing once a burst has started.
      if (isMissile) {
        if (!turret._launcherState) this._initLauncher(turret, attackDef);
        this._tickLauncher(turret, dt, enemies, attackDef);
        continue;
      }

      // Pick a target using the attack def's targeting rules. Returns null
      // when no eligible target exists — turret holds fire.
      const target = this._pickTarget(turret, enemies, range, attackDef);
      if (!target) {
        turret.canFire = false;
        continue;
      }

      // Aim — handles tracking lerp + arc clamp + canFire computation
      _enemyVec.set(target.position.x, target.position.y, target.position.z);
      const aim = aimTurret(turret, _enemyVec, dt);
      turret.canFire = aim.canFire;

      // ── Pre-fire charge-up (railgun) ──
      // When the equipped attack def has chargeTime > 0 we spawn a glowing
      // build-up at the muzzle for the last `chargeTime` seconds of the
      // cooldown. The pool tracks one charge per turret-owner, so calling
      // fire() repeatedly while charge-up is active just refreshes its
      // position to follow the moving muzzle.
      const chargeTime = attackDef.chargeTime || 0;
      if (chargeTime > 0 && turret.canFire && turret.muzzleLocal && turret.pitchPivot) {
        const inChargeWindow =
          turret.fireCooldown <= chargeTime && turret.fireCooldown > 0;
        if (inChargeWindow) {
          _muzzleWorld.copy(turret.muzzleLocal);
          turret.pitchPivot.localToWorld(_muzzleWorld);
          if (!turret._chargeActive) {
            this.chargeUps.fire(_muzzleWorld, {
              owner: turret,
              duration: chargeTime,
              size: (attackDef.projectileSize ?? 0.7) * 2.2,
              color: attackDef.chargeColor ?? attackDef.projectileColor ?? 0xeeeeff,
            });
            turret._chargeActive = true;
            // One-shot charge-up audio so the player hears the capacitor
            // whine ramp into the railgun discharge. Only fires once per
            // charge cycle — guarded by _chargeAudioPlayed.
            if (
              this.audioManager &&
              attackDef.chargeSfx &&
              !turret._chargeAudioPlayed
            ) {
              this.audioManager.playSFX(attackDef.chargeSfx, _muzzleWorld);
              turret._chargeAudioPlayed = true;
            }
          } else {
            this.chargeUps.track(turret, _muzzleWorld);
          }
        } else if (turret._chargeActive && turret.fireCooldown > chargeTime) {
          // Cooldown got bumped back up (e.g. burst restart) — cancel
          this.chargeUps.cancel(turret);
          turret._chargeActive = false;
          turret._chargeAudioPlayed = false;
        }
      } else if (turret._chargeActive && (!turret.canFire || chargeTime === 0)) {
        // Lost the target or no longer charging — cancel any in-progress glow
        this.chargeUps.cancel(turret);
        turret._chargeActive = false;
        turret._chargeAudioPlayed = false;
      }

      if (turret.canFire && turret.fireCooldown <= 0 && turret.muzzleLocal && turret.pitchPivot) {
        // Burst handling — if the def specifies burstCount > 1, the turret
        // queues up the remaining shots at burstInterval after the first.
        const burstCount = attackDef.burstCount || 1;
        const burstInterval = attackDef.burstInterval || 0;

        // Charge-up consumed by this fire — clear the flag so the next
        // cooldown cycle can rebuild it from zero.
        if (turret._chargeActive) {
          turret._chargeActive = false;
        }
        turret._chargeAudioPlayed = false;

        if (isHeavy) {
          this._fireHeavy(turret, target, attackDef);
        } else {
          this._fireOnce(turret, target, attackDef);
        }

        if (burstCount > 1) {
          turret._burstShotsLeft = burstCount - 1;
          turret._burstNextDelay = burstInterval;
          turret._burstAttackDef = attackDef;
          // Long cooldown applies AFTER the full burst completes
          turret.fireCooldown = burstInterval; // tick the next burst-shot delay
        } else {
          // Single-shot weapon — apply the def's fire rate (with jitter so
          // multiple turrets don't sync up).
          const baseInterval = 1 / attackDef.fireRate;
          turret.fireCooldown = baseInterval * (1 + (Math.random() - 0.5) * 2 * FIRE_JITTER_FRAC);
        }
      } else if (turret._burstShotsLeft > 0 && turret.fireCooldown <= 0) {
        // Continue an in-progress burst — fire next shot at burstInterval
        const burstDef = turret._burstAttackDef || attackDef;
        if (isHeavy) this._fireHeavy(turret, target, burstDef);
        else this._fireOnce(turret, target, burstDef);
        turret._burstShotsLeft--;
        if (turret._burstShotsLeft <= 0) {
          // Burst complete — long cooldown until next burst
          const baseInterval = 1 / burstDef.fireRate;
          turret.fireCooldown = baseInterval * (1 + (Math.random() - 0.5) * 2 * FIRE_JITTER_FRAC);
          turret._burstAttackDef = null;
        } else {
          turret.fireCooldown = burstDef.burstInterval || 0.1;
        }
      }
    }
  }

  /**
   * One-time launcher initialisation. Sets the burst counter and arms the
   * fire-pacing timer with a small random offset so multiple launchers
   * don't volley in lockstep. Burst count + interval come from the attack
   * def so different missile types can fire different patterns through the
   * same revolver hardware.
   */
  _initLauncher(turret, attackDef) {
    const burstCount = attackDef?.burstCount || DEFAULT_MISSILE_BURST_COUNT;
    const burstInterval = attackDef?.burstInterval || 0.35;
    turret._launcherState = LAUNCHER_STATE.LOADED;
    turret._launcherStateTime = 0;
    turret._launcherChamber = 0;          // index of next chamber to fire
    turret._launcherShotsLeft = burstCount;
    turret._launcherBurstCount = burstCount;
    turret._launcherBurstInterval = burstInterval;
    turret._launcherFireTimer = Math.random() * burstInterval;
    turret._launcherRotateFrom = 0;
    turret._launcherRotateTo = 0;
    turret._launcherRotateT = 0;
    // For the tilt-up animation we need to remember where the pitch was
    // when we started reloading, so we can lerp back to it cleanly.
    turret._launcherTiltFromPitch = 0;
    // Reload sequence cursor — which tip we're loading next.
    turret._launcherReloadCursor = 0;
  }

  /**
   * Per-frame tick for the missile launcher state machine.
   *
   * Sequence:
   *   LOADED → fire chamber → ROTATING (60° step) → LOADED → ... ×6
   *   → TILTING_UP (lift barrel toward sky)
   *   → RELOADING (restore tip 0)
   *   → RELOAD_ROTATE (rotate revolver 60°) → RELOADING (tip 1) → ... ×6
   *   → LOADED (aim function takes over and lerps barrel back to next target)
   *
   * Aim runs in LOADED + ROTATING. While reloading we DRIVE the pitch
   * directly so the aim function doesn't fight us. yaw stays where it
   * last was, which keeps the launcher facing the threat sector.
   */
  _tickLauncher(turret, dt, enemies, attackDef) {
    const st = turret._launcherState;
    turret._launcherStateTime += dt;
    const burstCount = turret._launcherBurstCount || DEFAULT_MISSILE_BURST_COUNT;
    const burstInterval = turret._launcherBurstInterval || 0.35;

    // Aim while in combat states
    if (st === LAUNCHER_STATE.LOADED || st === LAUNCHER_STATE.ROTATING) {
      const target = this._pickTarget(turret, enemies, attackDef.range, attackDef);
      if (target) {
        _enemyVec.set(target.position.x, target.position.y, target.position.z);
        const aim = aimTurret(turret, _enemyVec, dt);
        turret.canFire = aim.canFire;
        turret._currentTarget = target;
      } else {
        turret.canFire = false;
        turret._currentTarget = null;
      }
    }

    if (st === LAUNCHER_STATE.LOADED) {
      turret._launcherFireTimer -= dt;
      if (
        turret.canFire &&
        turret._launcherFireTimer <= 0 &&
        turret._currentTarget &&
        turret._launcherShotsLeft > 0
      ) {
        this._fireMissile(turret, turret._currentTarget, attackDef);
        turret._launcherShotsLeft--;
        turret._launcherFireTimer = burstInterval;

        if (turret._launcherShotsLeft <= 0) {
          // Burst complete — start tilt-up. Save current pitch so we
          // know where to lerp from.
          turret._launcherTiltFromPitch = turret.pitchPivot?.rotation.x || 0;
          turret._launcherState = LAUNCHER_STATE.TILTING_UP;
          turret._launcherStateTime = 0;
          turret._launcherReloadCursor = 0;
        } else {
          // Step the revolver to the next chamber
          turret._launcherRotateFrom = turret.revolver?.rotation.z || 0;
          turret._launcherRotateTo = turret._launcherRotateFrom + (Math.PI * 2) / burstCount;
          turret._launcherRotateT = 0;
          turret._launcherState = LAUNCHER_STATE.ROTATING;
          turret._launcherStateTime = 0;
        }
      }
      return;
    }

    if (st === LAUNCHER_STATE.ROTATING) {
      turret._launcherRotateT += dt / MISSILE_REVOLVER_STEP_TIME;
      const t = Math.min(1, turret._launcherRotateT);
      const eased = t * t * (3 - 2 * t);
      if (turret.revolver) {
        turret.revolver.rotation.z = turret._launcherRotateFrom + (turret._launcherRotateTo - turret._launcherRotateFrom) * eased;
      }
      if (t >= 1) {
        turret._launcherChamber = (turret._launcherChamber + 1) % burstCount;
        turret._launcherState = LAUNCHER_STATE.LOADED;
        turret._launcherStateTime = 0;
      }
      return;
    }

    if (st === LAUNCHER_STATE.TILTING_UP) {
      const t = Math.min(1, turret._launcherStateTime / MISSILE_TILT_UP_TIME);
      const eased = 1 - (1 - t) * (1 - t); // ease-out
      if (turret.pitchPivot) {
        turret.pitchPivot.rotation.x =
          turret._launcherTiltFromPitch +
          (MISSILE_TILT_SKY_ANGLE - turret._launcherTiltFromPitch) * eased;
      }
      // While tilting we also reset the aim lerp's currentPitch to track
      // where we actually are, so when LOADED resumes the aim function
      // doesn't snap from a stale value.
      turret.currentPitch = -(turret.pitchPivot?.rotation.x || 0);
      if (t >= 1) {
        turret._launcherState = LAUNCHER_STATE.RELOADING;
        turret._launcherStateTime = 0;
      }
      return;
    }

    if (st === LAUNCHER_STATE.RELOADING) {
      // Hold the barrel pointed at the sky
      if (turret.pitchPivot) turret.pitchPivot.rotation.x = MISSILE_TILT_SKY_ANGLE;
      turret.currentPitch = -MISSILE_TILT_SKY_ANGLE;

      if (turret._launcherStateTime >= MISSILE_RELOAD_STEP_TIME) {
        // Pop the next tip into existence. The cursor walks the same
        // chamber order the firing sequence used.
        if (turret.missileTips) {
          const idx = turret._launcherReloadCursor % burstCount;
          const tip = turret.missileTips[idx];
          if (tip) tip.visible = true;
        }
        turret._launcherReloadCursor++;

        if (turret._launcherReloadCursor >= burstCount) {
          // Fully reloaded — drop straight back to LOADED. The aim
          // function takes over and lerps the barrel back to the next
          // target naturally on subsequent frames.
          turret._launcherShotsLeft = burstCount;
          turret._launcherState = LAUNCHER_STATE.LOADED;
          turret._launcherStateTime = 0;
          turret._launcherFireTimer = burstInterval;
        } else {
          // Click the revolver one chamber so the next tip pops into
          // a fresh slot — visually mirrors the firing rotation.
          turret._launcherRotateFrom = turret.revolver?.rotation.z || 0;
          turret._launcherRotateTo = turret._launcherRotateFrom + (Math.PI * 2) / burstCount;
          turret._launcherRotateT = 0;
          turret._launcherState = LAUNCHER_STATE.RELOAD_ROTATE;
          turret._launcherStateTime = 0;
        }
      }
      return;
    }

    if (st === LAUNCHER_STATE.RELOAD_ROTATE) {
      // Hold the barrel pointed at the sky during the click
      if (turret.pitchPivot) turret.pitchPivot.rotation.x = MISSILE_TILT_SKY_ANGLE;
      turret.currentPitch = -MISSILE_TILT_SKY_ANGLE;

      turret._launcherRotateT += dt / MISSILE_RELOAD_ROTATE_TIME;
      const t = Math.min(1, turret._launcherRotateT);
      const eased = t * t * (3 - 2 * t);
      if (turret.revolver) {
        turret.revolver.rotation.z = turret._launcherRotateFrom + (turret._launcherRotateTo - turret._launcherRotateFrom) * eased;
      }
      if (t >= 1) {
        turret._launcherState = LAUNCHER_STATE.RELOADING;
        turret._launcherStateTime = 0;
      }
      return;
    }
  }

  /**
   * Spawn a missile projectile from the chamber currently in the firing
   * position. Hides the missile tip on that chamber to leave an empty bore.
   *
   * Reuses the heavyProjectiles pool with the equipped attack def's config
   * (damage, speed, AOE, optional PID homing or flak fuse). The actual
   * tactical behavior (homing-vs-cluster-vs-straight) lives entirely in the
   * attack def — this method is just the spawn site.
   *
   * @param {object} turret
   * @param {object} target
   * @param {object} attackDef
   */
  _fireMissile(turret, target, attackDef) {
    // Hide the tip on the chamber that's about to fire
    if (turret.missileTips) {
      const tip = turret.missileTips[turret._launcherChamber];
      if (tip) tip.visible = false;
    }

    // Muzzle = front of the firing chamber, in pitchPivot local space.
    // tubes[chamber].position is in revolver-local; we need to walk through
    // revolver → pitchPivot. Easier: use the tube mesh's worldPosition then
    // pitchPivot.worldToLocal isn't needed because we just want world for
    // the projectile spawn.
    const tube = turret.tubes?.[turret._launcherChamber];
    if (!tube || !turret.pitchPivot) return;
    tube.updateMatrixWorld(true);
    _muzzleWorld.setFromMatrixPosition(tube.matrixWorld);
    // Offset forward along the barrel direction (out of the bore)
    const yo = turret.barrelYawOffset || 0;
    const po = turret.barrelPitchOffset || 0;
    _barrelDirLocal.set(
      Math.sin(yo) * Math.cos(po),
      Math.sin(po),
      Math.cos(yo) * Math.cos(po),
    );
    _barrelDirWorld.copy(_barrelDirLocal).transformDirection(turret.pitchPivot.matrixWorld);
    _muzzleWorld.addScaledVector(_barrelDirWorld, 0.5); // start a bit ahead of the bore

    const trackedTarget = target;
    const trackedDef = attackDef;

    this.heavyProjectiles.fire(_muzzleWorld, _barrelDirWorld, {
      speed: attackDef.speed,
      damage: attackDef.damage,
      aoeRadius: attackDef.aoeRadius || 0,
      lifetime: attackDef.range / Math.max(attackDef.speed, 1) * 1.6,
      target: trackedTarget,
      // PID homing — guided missiles steer in flight
      homing: attackDef.homing || null,
      // Flak fuse — cluster missiles detonate on proximity
      flakDetonationRange: attackDef.flakDetonationRange || 0,
      flakArmingDistance: attackDef.flakArmingDistance || 0,
      getFlakEnemies: this.getEnemies,
      onImpact: (impactPos) => this._onProjectileImpact(impactPos, trackedTarget, trackedDef),
      // Visual cfg — guided missiles get the puffy contrail by default so
      // the player can track the homing curve through the sky
      color: attackDef.projectileColor ?? 0xffaa44,
      trailColor: attackDef.trailColor ?? attackDef.projectileColor ?? 0xff8844,
      trailWidth: attackDef.trailWidth ?? 0.85,
      smokey: attackDef.smokeyTrail ?? 1.0,
      pulseFreq: 12,
    });

    // Muzzle flash at the firing tube
    this.muzzleFlashes.fire(_muzzleWorld, {
      color: attackDef.muzzleFlashColor ?? attackDef.projectileColor ?? 0xffcc66,
      size: attackDef.muzzleFlashSize ?? 1.4,
      duration: attackDef.muzzleFlashDuration ?? 0.14,
    });

    if (this.audioManager) {
      const sfx = attackDef.fireSfx || "weapon-pulse";
      this.audioManager.playSFX(sfx, _muzzleWorld);
    }
  }

  _initTurret(turret) {
    const def = getAttack(turret.attackId || DEFAULT_ATTACK_ID) || getAttack(DEFAULT_ATTACK_ID);
    const baseInterval = def && def.fireRate > 0 ? 1 / def.fireRate : 1.0;
    turret.fireCooldown = Math.random() * baseInterval; // initial offset
    turret.canFire = false;
    turret._burstShotsLeft = 0;
    turret._burstAttackDef = null;
  }

  /**
   * Walk the enemies list, transform each into this turret's local frame,
   * keep the ones we can see (local +Y > 0), filter by the attack def's
   * targetingRules, score by priority, and return the best target. Returns
   * null when no eligible target exists — the turret will hold fire.
   *
   * @param {object} turret
   * @param {Array} enemies
   * @param {number} range — engagement range (from attack def)
   * @param {object} attackDef — full attack def with optional targetingRules
   */
  _pickTarget(turret, enemies, range, attackDef) {
    if (!turret.group) return null;
    turret.group.updateMatrixWorld(true);
    _tempInvMat.copy(turret.group.matrixWorld).invert();

    const rules = attackDef?.targetingRules || null;
    const rangeSq = range * range;

    // ── Routine path ─────────────────────────────────────────
    // If the attack def opts into a weapon routine, delegate scoring to the
    // routine engine in combat/weapon-routines.js. Hemisphere + range +
    // shieldIfAbsorbs filters still apply so the railgun's "wait for the
    // shield-breaker" synergy survives. NaN / negative scores are ineligible.
    const routine = getRoutine(attackDef?.routineId);
    if (routine) {
      let best = null;
      let bestScore = -Infinity;
      for (const enemy of enemies) {
        if (!enemy.position) continue;
        if (enemy.stats && enemy.stats.hull <= 0) continue;
        _enemyLocal.set(enemy.position.x, enemy.position.y, enemy.position.z);
        _enemyLocal.applyMatrix4(_tempInvMat);
        if (_enemyLocal.y < 0.05) continue; // wrong side of the hull
        if (_enemyLocal.lengthSq() > rangeSq) continue;

        // Catalog-level "wait for shields to drop" filter — the railgun
        // relies on this to pair with the shield-breaker, so it must still
        // run under the routine path.
        if (rules?.skipIfShieldsAbsorb && shieldWouldFullyAbsorb(enemy, attackDef)) continue;

        const score = routine.evaluate(turret, enemy, enemies, { rules });
        if (score == null || Number.isNaN(score) || score < 0) continue;
        if (score > bestScore) {
          bestScore = score;
          best = enemy;
        }
      }
      return best;
    }

    // First pass: filter eligible candidates (in arc, in range, passing rules)
    const candidates = [];
    for (const enemy of enemies) {
      if (!enemy.position) continue;
      if (enemy.stats && enemy.stats.hull <= 0) continue;
      _enemyLocal.set(enemy.position.x, enemy.position.y, enemy.position.z);
      _enemyLocal.applyMatrix4(_tempInvMat);
      if (_enemyLocal.y < 0.05) continue; // wrong side of the hull
      const distSq = _enemyLocal.lengthSq();
      if (distSq > rangeSq) continue;

      // Targeting-rule filters
      if (rules) {
        if (rules.minHull !== undefined && (enemy.stats?.hull ?? 0) < rules.minHull) continue;
        if (rules.maxHull !== undefined && (enemy.stats?.hull ?? 0) > rules.maxHull) continue;
        if (rules.requireShields && !(enemy.stats?.shields > 0)) continue;
        if (rules.skipShielded && enemy.stats?.shields > 0) continue;
        if (rules.skipIfShieldsAbsorb && shieldWouldFullyAbsorb(enemy, attackDef)) continue;
      }

      candidates.push({ enemy, distSq });
    }

    if (candidates.length === 0) return null;

    // Second pass: prioritize. Default = nearest.
    const priority = rules?.priority || "nearest";
    let best = null;
    let bestScore = -Infinity;

    for (const c of candidates) {
      let score;
      switch (priority) {
        case "preferFast": {
          const v = c.enemy.velocity;
          const speed = v ? Math.sqrt((v.x ?? 0) ** 2 + (v.y ?? 0) ** 2 + (v.z ?? 0) ** 2) : 0;
          // Higher speed = higher score, with mild distance penalty
          score = speed * 10 - Math.sqrt(c.distSq) * 0.1;
          break;
        }
        case "preferShielded": {
          // Prefer the highest-shield target — that's what we're built for
          score = (c.enemy.stats?.shields ?? 0) - Math.sqrt(c.distSq) * 0.05;
          break;
        }
        case "preferUnshielded": {
          score = ((c.enemy.stats?.shields ?? 0) <= 0 ? 1000 : 0) - Math.sqrt(c.distSq) * 0.1;
          break;
        }
        case "preferHighestHull": {
          score = (c.enemy.stats?.hull ?? 0) - Math.sqrt(c.distSq) * 0.05;
          break;
        }
        case "preferLargeSlow": {
          // Big enemies (hull >= 60 already filtered) — pick largest hull,
          // tie-break on lowest speed.
          const hull = c.enemy.stats?.hull ?? 0;
          const v = c.enemy.velocity;
          const speed = v ? Math.sqrt((v.x ?? 0) ** 2 + (v.y ?? 0) ** 2 + (v.z ?? 0) ** 2) : 0;
          score = hull * 2 - speed * 5 - Math.sqrt(c.distSq) * 0.05;
          break;
        }
        case "preferCluster": {
          // Score = number of OTHER alive enemies within clusterRadius of
          // this candidate. Skip if below minClusterSize.
          const cr = rules.clusterRadius || 30;
          const cr2 = cr * cr;
          let neighbours = 0;
          for (const other of enemies) {
            if (other === c.enemy) continue;
            if (!other.position) continue;
            if (other.stats && other.stats.hull <= 0) continue;
            const dx = other.position.x - c.enemy.position.x;
            const dy = other.position.y - c.enemy.position.y;
            const dz = other.position.z - c.enemy.position.z;
            if (dx * dx + dy * dy + dz * dz < cr2) neighbours++;
          }
          if (rules.minClusterSize && neighbours + 1 < rules.minClusterSize) continue;
          score = neighbours * 100 - Math.sqrt(c.distSq) * 0.1;
          break;
        }
        case "nearest":
        default:
          score = -c.distSq;
          break;
      }
      if (score > bestScore) {
        bestScore = score;
        best = c.enemy;
      }
    }

    return best;
  }

  /**
   * Spawn a laser pulse from the turret muzzle along the barrel forward
   * direction (NOT muzzle-to-target — that would be a "magic line" that
   * always hits even if the barrel is pointing elsewhere). Damage uses the
   * shared damage resolver so shield/hull modifiers from the attack def
   * are honored consistently.
   *
   * @param {object} turret
   * @param {object} target
   * @param {object} attackDef — equipped weapon's attack def (range, damage,
   *   damageVsShields, damageVsHull, projectileColor, etc.)
   */
  _fireOnce(turret, target, attackDef) {
    // World-space muzzle position via the rotated pitch pivot
    _muzzleWorld.copy(turret.muzzleLocal);
    turret.pitchPivot.localToWorld(_muzzleWorld);

    // Barrel forward direction in pitchPivot local space — the same offset
    // logic the aim function uses to know "where the gun naturally points"
    const yo = turret.barrelYawOffset || 0;
    const po = turret.barrelPitchOffset || 0;
    _barrelDirLocal.set(
      Math.sin(yo) * Math.cos(po),
      Math.sin(po),
      Math.cos(yo) * Math.cos(po),
    );
    // Transform local DIRECTION into world (rotation only — not the position)
    _barrelDirLocal.transformDirection(turret.pitchPivot.matrixWorld);

    // Laser endpoint = muzzle + (range × barrel direction)
    _laserEnd.copy(_muzzleWorld).addScaledVector(_barrelDirLocal, attackDef.range);

    // Per-attack beam style — drives shaderStyle inside the shader pool.
    // "lightning" jitters verts + draws branching arcs (arc-emitter), the
    // "shield-breaker" / "railgun" styles are tighter and brighter than
    // "standard". Falls back to standard for any def that didn't opt in.
    const beamStyle = attackDef.shaderStyle || "standard";
    // Width scales with the def's projectileSize. The 3.0x multiplier I
    // tried first produced 1.95m wide arc-emitter beams which, combined
    // with the lightning style's perpendicular vertex jitter (×6 width),
    // filled the camera view with purple additive fog whenever the camera
    // was close to the beam line. 1.2x is the sweet spot — visible beams
    // without sucking up the whole frustum near the muzzle.
    const beamWidth = (attackDef.projectileSize ?? 0.3) * 1.2;
    this.lasers.fire(_muzzleWorld, _laserEnd, {
      color: attackDef.projectileColor ?? 0x66ffff,
      width: beamWidth,
      lifetime: attackDef.beamDuration ?? 0.18,
      style: beamStyle,
    });

    // Per-shot muzzle flash — every weapon gets one
    this.muzzleFlashes.fire(_muzzleWorld, {
      color: attackDef.muzzleFlashColor ?? attackDef.projectileColor ?? 0xffffff,
      size: attackDef.muzzleFlashSize ?? 0.6,
      duration: attackDef.muzzleFlashDuration ?? 0.1,
    });

    // Per-attack fire SFX (PD pulse, arc emitter, shield breaker, railgun)
    if (this.audioManager && attackDef.fireSfx) {
      this.audioManager.playSFX(attackDef.fireSfx, _muzzleWorld);
    }

    // Damage routed through the resolver — handles damageVsShields and
    // damageVsHull modifiers, calls target.takeDamage when present so the
    // existing shield ripple visuals at impactPos still anchor correctly.
    const impactPos = { x: target.position.x, y: target.position.y, z: target.position.z };
    applyDamage(target, attackDef, impactPos);

    // Railgun-class hits get an expanding fresnel shockwave centred on the
    // impact point. Anything with a shockwaveRadius gets one — currently
    // only heavy-railgun on the beam path, but the cfg is data-driven so
    // any future hitscan can opt in by adding shockwaveRadius to its def.
    if (attackDef.shockwaveRadius > 0) {
      this.shockwaves.fire(impactPos, {
        color: attackDef.shockwaveColor ?? attackDef.impactColor ?? 0xffffff,
        radius: attackDef.shockwaveRadius,
        duration: attackDef.shockwaveDuration ?? 0.6,
      });
    }

    // Per-attack impact SFX for hitscan weapons. Plays on shockwave hits
    // (railgun) or any hull strike on an unshielded target so the player
    // hears the difference between a shield ricochet and a hull bite.
    if (this.audioManager && attackDef.impactSfx) {
      const hitsHull = !(target.stats?.shields > 0);
      if (attackDef.shockwaveRadius > 0 || hitsHull) {
        this.audioManager.playSFX(attackDef.impactSfx, impactPos);
      }
    }

    // Per-shot visual feedback scaled by attack def (small/medium/large flash)
    if (this.combatEffects && attackDef.impactEffect && attackDef.impactEffect !== "none") {
      const flashSize = attackDef.impactEffect === "large" ? 80
        : attackDef.impactEffect === "medium" ? 40
        : 18;
      this.combatEffects.addImpactFlash(impactPos, flashSize);
    }
    if (this.screenShake && attackDef.screenShake > 0) {
      this.screenShake.addTrauma(attackDef.screenShake);
    }
    // For railgun-class hits, spawn a small AOE damage ring like the heavy
    // cannon path so kinetic impacts have splash if the def asks for it.
    if (attackDef.aoeDamage > 0 && attackDef.aoeRadius > 0 && this.getEnemies) {
      const enemies = this.getEnemies();
      if (enemies) {
        const r2 = attackDef.aoeRadius * attackDef.aoeRadius;
        for (const e of enemies) {
          if (!e || !e.position) continue;
          if (e === target) continue;
          if (e.stats && e.stats.hull <= 0) continue;
          const dx = e.position.x - impactPos.x;
          const dy = e.position.y - impactPos.y;
          const dz = e.position.z - impactPos.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < r2) {
            const falloff = 1 - Math.sqrt(d2) / attackDef.aoeRadius;
            applyDamage(e, { ...attackDef, damage: attackDef.aoeDamage * falloff }, impactPos);
          }
        }
      }
    }
  }

  /**
   * Heavy / projectile shot. Spawns a slow-travelling glowing bolt from the
   * turret's muzzle along its barrel direction. The projectile pool checks
   * proximity to the assigned target each frame; on impact (or flak fuse
   * detonation) it calls our onImpact callback which spawns the explosion
   * and applies AOE damage to every enemy within `attackDef.aoeRadius`.
   *
   * Also handles flak weapons: if `attackDef.flakDetonationRange > 0`, the
   * pool's flak fuse takes over from the standard target-proximity check.
   *
   * @param {object} turret
   * @param {object} target
   * @param {object} attackDef — equipped weapon (damage, aoeDamage, speed,
   *   damageVsShields, damageVsHull, optional flakDetonationRange / homing)
   */
  _fireHeavy(turret, target, attackDef) {
    // Same muzzle + barrel-direction math as the laser path so the visible
    // bolt emerges from the actual gun tip in the direction the gun points.
    _muzzleWorld.copy(turret.muzzleLocal);
    turret.pitchPivot.localToWorld(_muzzleWorld);

    const yo = turret.barrelYawOffset || 0;
    const po = turret.barrelPitchOffset || 0;
    _barrelDirLocal.set(
      Math.sin(yo) * Math.cos(po),
      Math.sin(po),
      Math.cos(yo) * Math.cos(po),
    );
    _barrelDirWorld.copy(_barrelDirLocal).transformDirection(turret.pitchPivot.matrixWorld);

    const trackedTarget = target;
    const trackedDef = attackDef;

    this.heavyProjectiles.fire(_muzzleWorld, _barrelDirWorld, {
      speed: attackDef.speed,
      damage: attackDef.damage,
      aoeRadius: attackDef.aoeRadius || 0,
      lifetime: attackDef.range / Math.max(attackDef.speed, 1) * 1.5,
      target: trackedTarget,
      // Flak fuse — if set, projectile detonates as soon as ANY enemy comes
      // within flakDetonationRange after the arming distance is reached.
      flakDetonationRange: attackDef.flakDetonationRange || 0,
      flakArmingDistance: attackDef.flakArmingDistance || 0,
      getFlakEnemies: this.getEnemies,
      // Homing config — non-flak projectiles can also use this to PID-steer
      // toward their assigned target. The pool reads target.velocity for the
      // derivative term.
      homing: attackDef.homing || null,
      onImpact: (impactPos) => this._onProjectileImpact(impactPos, trackedTarget, trackedDef),
      // Visual cfg consumed by the trailed-projectile shader pool
      color: attackDef.projectileColor ?? 0xffaa44,
      trailColor: attackDef.trailColor ?? attackDef.projectileColor ?? 0xffaa44,
      trailWidth: attackDef.trailWidth ?? 0.6,
      smokey: attackDef.smokeyTrail ?? 0.5,
      pulseFreq: 8,
    });

    // Per-shot muzzle flash for heavy / projectile weapons too
    this.muzzleFlashes.fire(_muzzleWorld, {
      color: attackDef.muzzleFlashColor ?? attackDef.projectileColor ?? 0xffaa44,
      size: attackDef.muzzleFlashSize ?? 1.2,
      duration: attackDef.muzzleFlashDuration ?? 0.12,
    });

    // Per-attack fire SFX — driven by attack def field, fall back to the
    // legacy heavy cannon sound for procedural projectile weapons that
    // haven't opted into a custom cue yet.
    if (this.audioManager) {
      const sfx = attackDef.fireSfx || "weapon-heavy-cannon";
      this.audioManager.playSFX(sfx, _muzzleWorld);
    }
  }

  /**
   * Shared impact handler for all projectile-pool weapons (heavy cannon /
   * flak / guided missile). Routes direct damage through the resolver, runs
   * the AOE pass with falloff, and triggers the visual + screen shake from
   * the attack def.
   */
  _onProjectileImpact(impactPos, trackedTarget, attackDef) {
    // Direct hit damage on the tracked target if still alive
    if (trackedTarget && trackedTarget.stats && trackedTarget.stats.hull > 0) {
      applyDamage(trackedTarget, attackDef, impactPos);
    }
    // AOE pass — every other live enemy inside the blast radius
    if (attackDef.aoeDamage > 0 && attackDef.aoeRadius > 0 && this.getEnemies) {
      const enemies = this.getEnemies();
      if (enemies) {
        const r = attackDef.aoeRadius;
        const r2 = r * r;
        for (const e of enemies) {
          if (!e || !e.position) continue;
          if (e === trackedTarget) continue;
          if (e.stats && e.stats.hull <= 0) continue;
          const dx = e.position.x - impactPos.x;
          const dy = e.position.y - impactPos.y;
          const dz = e.position.z - impactPos.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < r2) {
            const falloff = 1 - Math.sqrt(d2) / r;
            applyDamage(e, { ...attackDef, damage: attackDef.aoeDamage * falloff }, impactPos);
          }
        }
      }
    }
    // Visual: flash + debris scaled to the attack def's impact tier
    if (this.combatEffects) {
      const flashSize = attackDef.impactEffect === "large" ? 80
        : attackDef.impactEffect === "medium" ? 40
        : 18;
      this.combatEffects.addImpactFlash(impactPos, flashSize);
      const debrisSize = attackDef.impactEffect === "large" ? "large"
        : attackDef.impactEffect === "medium" ? "medium" : "small";
      this.combatEffects.addDebris(impactPos, debrisSize, attackDef.impactColor || 0xffaa44);
    }
    // Expanding shader shockwave — the cinematic READ for flak detonations
    // and big missile bursts. Data-driven via shockwaveRadius so any
    // projectile def can opt in.
    if (this.shockwaves && attackDef.shockwaveRadius > 0) {
      this.shockwaves.fire(impactPos, {
        color: attackDef.shockwaveColor ?? attackDef.impactColor ?? 0xffaa44,
        radius: attackDef.shockwaveRadius,
        duration: attackDef.shockwaveDuration ?? 0.55,
      });
    }
    if (this.screenShake && attackDef.screenShake > 0) {
      this.screenShake.addTrauma(attackDef.screenShake);
    }
    if (this.audioManager) {
      // Prefer the per-attack impact SFX (e.g. flak airburst) so each
      // weapon's hit reads with its own character. Falls back to the
      // generic explosion bank when the def hasn't opted in.
      const sfx = attackDef.impactSfx
        || (attackDef.impactEffect === "large" ? "explosion-large" : "explosion-small");
      this.audioManager.playSFX(sfx, impactPos);
    }
  }

  dispose() {
    if (this.lasers) this.lasers.dispose();
    if (this.heavyProjectiles) this.heavyProjectiles.dispose();
    if (this.shockwaves) this.shockwaves.dispose();
    if (this.chargeUps) this.chargeUps.dispose();
    if (this.muzzleFlashes) this.muzzleFlashes.dispose();
  }
}
