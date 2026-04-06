/**
 * Combat visual effects — weapon beams, hit explosions, muzzle flashes.
 *
 * Uses additive blending and custom shaders for sci-fi energy weapon feel.
 */

import * as THREE from "three";

const BEAM_DURATION = 0.15;
const MAX_BEAMS = 10;
const HIT_DURATION = 0.4;
const MAX_HIT_PARTICLES = 30;
const DEBRIS_DURATION = 2.0;
const MAX_DEBRIS = 60;
const DEBRIS_GRAVITY = -40;
const FLASH_DURATION = 0.12;

// ─── Weapon Beam ─────────────────────────────────────────────

const beamVertexShader = /* glsl */ `
  attribute float aOffset;
  uniform vec3 uFrom;
  uniform vec3 uTo;
  uniform float uWidth;

  varying float vOffset;

  void main() {
    vOffset = aOffset;

    // Line direction
    vec3 dir = uTo - uFrom;
    vec3 pos = uFrom + dir * position.x; // position.x is 0-1 along beam

    // Billboard: expand perpendicular to view and beam direction
    vec3 viewDir = cameraPosition - pos;
    vec3 side = normalize(cross(dir, viewDir));
    pos += side * position.y * uWidth;

    gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
  }
`;

const beamFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uAge;
  uniform vec3 uColor;

  varying float vOffset;

  void main() {
    float fade = 1.0 - smoothstep(0.0, 1.0, uAge / ${BEAM_DURATION.toFixed(2)});
    float core = smoothstep(0.5, 0.0, abs(vOffset));
    float glow = smoothstep(1.0, 0.0, abs(vOffset)) * 0.4;

    float intensity = (core + glow) * fade;

    vec3 color = uColor * intensity;
    // Hot white core
    color += vec3(1.0) * core * core * fade * 0.6;

    gl_FragColor = vec4(color, intensity * 0.9);
  }
`;

function createBeamGeometry() {
  // Quad strip along the beam: 2 triangles, position.x = along beam (0-1), position.y = width (-1 to 1)
  const positions = new Float32Array([
    0, -1, 0, 1, -1, 0, 1, 1, 0,
    0, -1, 0, 1, 1, 0, 0, 1, 0,
  ]);
  const offsets = new Float32Array([
    -1, -1, 1, -1, 1, 1,
  ]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("aOffset", new THREE.Float32BufferAttribute(offsets, 1));
  return geo;
}

// ─── Hit Particle Pool ───────────────────────────────────────

const _particleDummy = new THREE.Object3D();

// ─── Main Effects Class ──────────────────────────────────────

export class CombatEffects {
  constructor(scene) {
    this.scene = scene;
    this.beams = [];
    this.hitParticles = [];
    this.debris = [];
    this.impactFlashes = [];

    // Simple beam: bright line with glow
    this._beamCoreMat = new THREE.LineBasicMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this._beamGlowMat = new THREE.LineBasicMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    // Hit flash — instanced small spheres
    const hitGeo = new THREE.OctahedronGeometry(0.8, 0);
    const hitMat = new THREE.MeshBasicMaterial({
      color: 0xffaa44,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this._hitMesh = new THREE.InstancedMesh(hitGeo, hitMat, MAX_HIT_PARTICLES);
    this._hitMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._hitMesh.count = 0;
    this._hitMesh.frustumCulled = false;
    this.scene.add(this._hitMesh);

    // Debris — instanced small boxes that fall with gravity
    const debrisGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const debrisMat = new THREE.MeshStandardMaterial({
      color: 0xcc6644,
      roughness: 0.8,
      metalness: 0.4,
      flatShading: true,
    });
    this._debrisMesh = new THREE.InstancedMesh(debrisGeo, debrisMat, MAX_DEBRIS);
    this._debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._debrisMesh.count = 0;
    this._debrisMesh.frustumCulled = false;
    this.scene.add(this._debrisMesh);

    // Impact flash — instanced bright spheres at weapon hit points
    const flashGeo = new THREE.SphereGeometry(1, 6, 4);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this._flashMesh = new THREE.InstancedMesh(flashGeo, flashMat, 10);
    this._flashMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._flashMesh.count = 0;
    this._flashMesh.frustumCulled = false;
    this.scene.add(this._flashMesh);
  }

  /**
   * Add a weapon beam from source to target.
   */
  addBeam(from, to) {
    if (this.beams.length >= MAX_BEAMS) {
      const old = this.beams.shift();
      this._removeBeam(old);
    }

    // Core bright line
    const coreGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(from.x, from.y, from.z),
      new THREE.Vector3(to.x, to.y, to.z),
    ]);
    const coreLine = new THREE.Line(coreGeo, this._beamCoreMat);
    this.scene.add(coreLine);

    // Wider glow line
    const glowGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(from.x, from.y, from.z),
      new THREE.Vector3(to.x, to.y, to.z),
    ]);
    const glowLine = new THREE.Line(glowGeo, this._beamGlowMat);
    this.scene.add(glowLine);

    this.beams.push({ core: coreLine, glow: glowLine, timer: BEAM_DURATION });

    // Hit flash at impact point
    this.addHitFlash(to);
  }

  /**
   * Spawn hit particles at a position.
   */
  addHitFlash(pos) {
    const count = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
      this.hitParticles.push({
        x: pos.x,
        y: pos.y,
        z: pos.z,
        vx: (Math.random() - 0.5) * 40,
        vy: (Math.random() - 0.5) * 40,
        vz: (Math.random() - 0.5) * 40,
        timer: HIT_DURATION,
        scale: 0.5 + Math.random() * 1.5,
      });
    }
    // Cap total particles
    while (this.hitParticles.length > MAX_HIT_PARTICLES) {
      this.hitParticles.shift();
    }
  }

  /**
   * Spawn debris burst at a position (enemy death explosion).
   * @param {object} pos — { x, y, z }
   * @param {string} size — "small" | "medium" | "large" — controls chunk count
   * @param {number} color — hex color for debris tint
   */
  addDebris(pos, size = "small", color = 0xcc6644) {
    const counts = { small: 5, medium: 12, large: 20 };
    const count = counts[size] || counts.small;
    const speed = size === "large" ? 60 : size === "medium" ? 45 : 30;

    for (let i = 0; i < count; i++) {
      this.debris.push({
        x: pos.x + (Math.random() - 0.5) * 2,
        y: pos.y + (Math.random() - 0.5) * 2,
        z: pos.z + (Math.random() - 0.5) * 2,
        vx: (Math.random() - 0.5) * speed,
        vy: Math.random() * speed * 0.7 + 10,
        vz: (Math.random() - 0.5) * speed,
        timer: DEBRIS_DURATION,
        scale: 0.3 + Math.random() * 0.8,
        rotSpeed: (Math.random() - 0.5) * 10,
        rot: Math.random() * Math.PI * 2,
        color,
      });
    }

    // Cap total debris
    while (this.debris.length > MAX_DEBRIS) {
      this.debris.shift();
    }
  }

  /**
   * Add a bright weapon impact flash at a position.
   * Bigger damage = bigger flash.
   * @param {object} pos — { x, y, z }
   * @param {number} damage — for scaling flash size
   */
  addImpactFlash(pos, damage = 15) {
    const scale = 1.0 + (damage / 15) * 1.5;
    this.impactFlashes.push({
      x: pos.x,
      y: pos.y,
      z: pos.z,
      timer: FLASH_DURATION,
      scale,
    });
    // Cap
    while (this.impactFlashes.length > 10) {
      this.impactFlashes.shift();
    }
  }

  /**
   * Spawn death effect for an enemy — white flash + debris explosion.
   * @param {object} pos — { x, y, z }
   * @param {string} enemyType — "scout-fighter" | "patrol-cruiser" | etc.
   * @param {number} color — enemy color hex
   */
  addDeathEffect(pos, enemyType, color) {
    // Bright flash at death location
    this.addImpactFlash(pos, 40);

    // Debris burst scaled to enemy type
    const size = enemyType === "patrol-cruiser" ? "large" : "small";
    this.addDebris(pos, size, color);

    // Extra hit particles for visual pop
    const count = enemyType === "patrol-cruiser" ? 8 : 4;
    for (let i = 0; i < count; i++) {
      this.hitParticles.push({
        x: pos.x,
        y: pos.y,
        z: pos.z,
        vx: (Math.random() - 0.5) * 60,
        vy: (Math.random() - 0.5) * 60,
        vz: (Math.random() - 0.5) * 60,
        timer: HIT_DURATION,
        scale: 0.8 + Math.random() * 2.0,
      });
    }
    while (this.hitParticles.length > MAX_HIT_PARTICLES) {
      this.hitParticles.shift();
    }
  }

  /**
   * Update all effects.
   */
  update(dt) {
    // Beams
    for (let i = this.beams.length - 1; i >= 0; i--) {
      this.beams[i].timer -= dt;
      // Fade glow
      const t = this.beams[i].timer / BEAM_DURATION;
      this.beams[i].core.material.opacity = t;
      this.beams[i].glow.material.opacity = t * 0.4;

      if (this.beams[i].timer <= 0) {
        this._removeBeam(this.beams[i]);
        this.beams.splice(i, 1);
      }
    }

    // Hit particles
    let pIdx = 0;
    for (let i = this.hitParticles.length - 1; i >= 0; i--) {
      const p = this.hitParticles[i];
      p.timer -= dt;
      if (p.timer <= 0) {
        this.hitParticles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      // Slow down
      p.vx *= 0.95;
      p.vy *= 0.95;
      p.vz *= 0.95;
    }

    // Update instanced hit particle mesh
    for (let i = 0; i < this.hitParticles.length; i++) {
      const p = this.hitParticles[i];
      const fade = p.timer / HIT_DURATION;
      _particleDummy.position.set(p.x, p.y, p.z);
      _particleDummy.scale.setScalar(p.scale * fade);
      _particleDummy.updateMatrix();
      this._hitMesh.setMatrixAt(i, _particleDummy.matrix);
    }
    this._hitMesh.count = this.hitParticles.length;
    if (this.hitParticles.length > 0) {
      this._hitMesh.instanceMatrix.needsUpdate = true;
    }

    // Debris (with gravity)
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.timer -= dt;
      if (d.timer <= 0) {
        this.debris.splice(i, 1);
        continue;
      }
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      d.vy += DEBRIS_GRAVITY * dt; // gravity
      d.rot += d.rotSpeed * dt;
      // Air resistance
      d.vx *= 0.98;
      d.vz *= 0.98;
    }

    // Update instanced debris mesh
    for (let i = 0; i < this.debris.length; i++) {
      const d = this.debris[i];
      const fade = d.timer / DEBRIS_DURATION;
      _particleDummy.position.set(d.x, d.y, d.z);
      _particleDummy.rotation.set(d.rot, d.rot * 0.7, 0);
      _particleDummy.scale.setScalar(d.scale * fade);
      _particleDummy.updateMatrix();
      this._debrisMesh.setMatrixAt(i, _particleDummy.matrix);
    }
    this._debrisMesh.count = this.debris.length;
    if (this.debris.length > 0) {
      this._debrisMesh.instanceMatrix.needsUpdate = true;
    }

    // Impact flashes
    for (let i = this.impactFlashes.length - 1; i >= 0; i--) {
      this.impactFlashes[i].timer -= dt;
      if (this.impactFlashes[i].timer <= 0) {
        this.impactFlashes.splice(i, 1);
      }
    }

    for (let i = 0; i < this.impactFlashes.length; i++) {
      const f = this.impactFlashes[i];
      const fade = f.timer / FLASH_DURATION;
      _particleDummy.position.set(f.x, f.y, f.z);
      _particleDummy.scale.setScalar(f.scale * fade);
      _particleDummy.rotation.set(0, 0, 0);
      _particleDummy.updateMatrix();
      this._flashMesh.setMatrixAt(i, _particleDummy.matrix);
    }
    this._flashMesh.count = this.impactFlashes.length;
    if (this.impactFlashes.length > 0) {
      this._flashMesh.instanceMatrix.needsUpdate = true;
    }
  }

  _removeBeam(beam) {
    this.scene.remove(beam.core);
    this.scene.remove(beam.glow);
    beam.core.geometry.dispose();
    beam.glow.geometry.dispose();
  }

  dispose() {
    for (const b of this.beams) this._removeBeam(b);
    this.beams = [];
    this._beamCoreMat.dispose();
    this._beamGlowMat.dispose();
    this._hitMesh.geometry.dispose();
    this._hitMesh.material.dispose();
    this.scene.remove(this._hitMesh);
    this._debrisMesh.geometry.dispose();
    this._debrisMesh.material.dispose();
    this.scene.remove(this._debrisMesh);
    this._flashMesh.geometry.dispose();
    this._flashMesh.material.dispose();
    this.scene.remove(this._flashMesh);
  }
}
