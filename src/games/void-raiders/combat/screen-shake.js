/**
 * Screen shake system — adds camera shake on hits and weapon fire.
 *
 * Pure math module: computes an offset vector each frame.
 * The game loop applies this offset to the camera position.
 */

// Default config
const DEFAULT_DECAY = 8;          // how fast shake dies (higher = faster)
const DEFAULT_FREQUENCY = 35;     // shake oscillation speed
const MAX_TRAUMA = 1.0;
const MAX_OFFSET = 2.0;           // max shake displacement in units

/**
 * Screen shake controller.
 * Call addTrauma() when damage occurs, then update() each frame
 * to get the current offset.
 */
export class ScreenShake {
  constructor() {
    this.trauma = 0;       // 0-1, accumulated shake intensity
    this.decay = DEFAULT_DECAY;
    this.frequency = DEFAULT_FREQUENCY;
    this.maxOffset = MAX_OFFSET;
    this._elapsed = 0;

    // Current frame offset (x, y, z)
    this.offset = { x: 0, y: 0, z: 0 };
  }

  /**
   * Add trauma (shake intensity). Clamped to MAX_TRAUMA.
   * @param {number} amount — 0 to 1
   */
  addTrauma(amount) {
    this.trauma = Math.min(MAX_TRAUMA, this.trauma + amount);
  }

  /**
   * Update shake state and compute offset for this frame.
   * @param {number} dt — delta time in seconds
   * @returns {{ x: number, y: number, z: number }} offset to apply to camera
   */
  update(dt) {
    this._elapsed += dt;

    if (this.trauma <= 0) {
      this.offset.x = 0;
      this.offset.y = 0;
      this.offset.z = 0;
      return this.offset;
    }

    // Shake intensity is trauma squared for a nice falloff curve
    const shake = this.trauma * this.trauma;
    const t = this._elapsed * this.frequency;

    // Use sin/cos at different phases for each axis to avoid repetitive patterns
    this.offset.x = this.maxOffset * shake * Math.sin(t * 1.0);
    this.offset.y = this.maxOffset * shake * Math.cos(t * 1.3);
    this.offset.z = this.maxOffset * shake * Math.sin(t * 0.9 + 2.0);

    // Decay trauma over time
    this.trauma = Math.max(0, this.trauma - this.decay * dt);

    return this.offset;
  }

  /**
   * Reset all shake state.
   */
  reset() {
    this.trauma = 0;
    this._elapsed = 0;
    this.offset.x = 0;
    this.offset.y = 0;
    this.offset.z = 0;
  }
}

/**
 * Convert damage amount to trauma value.
 * Small hits = subtle shake, big hits = strong shake.
 * @param {number} damage — raw damage amount
 * @param {number} maxDamage — reference max damage for scaling (default 50)
 * @returns {number} trauma 0-1
 */
export function damageToTrauma(damage, maxDamage = 50) {
  return Math.min(1, damage / maxDamage);
}

/**
 * Small nudge for weapon fire feedback.
 * @returns {number} trauma value
 */
export function weaponFireTrauma() {
  return 0.05;
}
