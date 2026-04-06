/**
 * Spatial 3D Audio Manager for Void Raiders.
 *
 * Uses the Web Audio API with PannerNodes for positional 3D sound.
 * Sound pools prevent rapid node creation during combat.
 *
 * Usage:
 *   const audio = new AudioManager();
 *   await audio.preload({ 'weapon-pulse': '/audio/sfx/weapon-pulse.mp3' });
 *   audio.playSFX('weapon-pulse', { x: 100, y: 50, z: 200 });
 *   audio.updateListener(camera.position, camera.quaternion);
 */

const POOL_SIZE = 5;

// Default PannerNode settings tuned for a space game
const PANNER_DEFAULTS = {
  distanceModel: "inverse",
  refDistance: 50,
  maxDistance: 1000,
  rolloffFactor: 0.8,
  panningModel: "HRTF",
};

/**
 * A single pooled voice — AudioBufferSourceNode + PannerNode + GainNode.
 */
class PooledVoice {
  constructor(ctx, buffer, output) {
    this.ctx = ctx;
    this.buffer = buffer;
    this.output = output;

    this.panner = ctx.createPanner();
    Object.assign(this.panner, PANNER_DEFAULTS);

    this.gain = ctx.createGain();
    this.panner.connect(this.gain);
    this.gain.connect(output);

    this.source = null;
    this.startTime = 0;
    this.playing = false;
  }

  play(x, y, z, volume) {
    // Stop previous if still playing
    if (this.source) {
      try { this.source.stop(); } catch (_) { /* already stopped */ }
    }

    this.source = this.ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.connect(this.panner);
    this.source.onended = () => { this.playing = false; };

    this.panner.positionX.value = x;
    this.panner.positionY.value = y;
    this.panner.positionZ.value = z;
    this.gain.gain.value = volume;

    this.source.start();
    this.startTime = this.ctx.currentTime;
    this.playing = true;
  }

  stop() {
    if (this.source) {
      try { this.source.stop(); } catch (_) { /* already stopped */ }
      this.playing = false;
    }
  }

  disconnect() {
    this.stop();
    this.panner.disconnect();
    this.gain.disconnect();
  }
}

/**
 * Manages a pool of voices for a single sound effect name.
 */
class SoundPool {
  constructor(ctx, buffer, output, size = POOL_SIZE) {
    this.voices = [];
    for (let i = 0; i < size; i++) {
      this.voices.push(new PooledVoice(ctx, buffer, output));
    }
    this._nextIndex = 0;
  }

  play(x, y, z, volume) {
    // Find a free voice
    let voice = null;
    for (let i = 0; i < this.voices.length; i++) {
      const idx = (this._nextIndex + i) % this.voices.length;
      if (!this.voices[idx].playing) {
        voice = this.voices[idx];
        this._nextIndex = (idx + 1) % this.voices.length;
        break;
      }
    }

    // If all busy, steal the oldest one
    if (!voice) {
      let oldest = this.voices[0];
      for (const v of this.voices) {
        if (v.startTime < oldest.startTime) oldest = v;
      }
      voice = oldest;
      this._nextIndex = (this.voices.indexOf(voice) + 1) % this.voices.length;
    }

    voice.play(x, y, z, volume);
    return voice;
  }

  dispose() {
    for (const v of this.voices) v.disconnect();
    this.voices.length = 0;
  }
}

/**
 * Main audio manager — spatial 3D audio for Void Raiders.
 */
export class AudioManager {
  constructor() {
    this.ctx = null; // created lazily on first user interaction
    this._resumed = false;

    // Gain nodes for volume categories
    this._masterGain = null;
    this._sfxGain = null;
    this._musicGain = null;
    this._ambientGain = null;

    // Volume levels (0-1)
    this._volumes = { master: 1.0, sfx: 0.8, music: 0.5, ambient: 0.6 };

    // Sound pools keyed by name
    this._pools = new Map();

    // Decoded audio buffers keyed by name
    this._buffers = new Map();

    // Music state
    this._currentMusic = null;
    this._nextMusic = null;
    this._musicFading = false;

    // Initialize audio context on first user interaction
    this._initPromise = null;
    this._boundResume = this._handleUserInteraction.bind(this);
    if (typeof window !== "undefined") {
      window.addEventListener("click", this._boundResume, { once: false });
      window.addEventListener("keydown", this._boundResume, { once: false });
    }
  }

  /**
   * Ensure the AudioContext exists and is resumed.
   */
  _ensureContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();

      this._masterGain = this.ctx.createGain();
      this._masterGain.connect(this.ctx.destination);

      this._sfxGain = this.ctx.createGain();
      this._sfxGain.connect(this._masterGain);

      this._musicGain = this.ctx.createGain();
      this._musicGain.connect(this._masterGain);

      this._ambientGain = this.ctx.createGain();
      this._ambientGain.connect(this._masterGain);

      // Apply stored volumes
      this._masterGain.gain.value = this._volumes.master;
      this._sfxGain.gain.value = this._volumes.sfx;
      this._musicGain.gain.value = this._volumes.music;
      this._ambientGain.gain.value = this._volumes.ambient;
    }
    return this.ctx;
  }

  /**
   * Handle first user interaction — resume the audio context.
   */
  _handleUserInteraction() {
    this._ensureContext();
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    if (!this._resumed) {
      this._resumed = true;
      // Keep listeners alive — some browsers re-suspend
    }
  }

  /**
   * Preload a map of sound names to URLs.
   * @param {Object<string, string>} manifest — { name: url }
   */
  async preload(manifest) {
    this._ensureContext();

    const entries = Object.entries(manifest);
    const results = await Promise.allSettled(
      entries.map(async ([name, url]) => {
        if (this._buffers.has(name)) return; // already loaded

        const resp = await fetch(url);
        if (!resp.ok) {
          console.warn(`AudioManager: failed to load ${url} (${resp.status})`);
          return;
        }
        const arrayBuf = await resp.arrayBuffer();
        const audioBuffer = await this.ctx.decodeAudioData(arrayBuf);
        this._buffers.set(name, audioBuffer);

        // Create sound pool
        this._pools.set(name, new SoundPool(this.ctx, audioBuffer, this._sfxGain));
      })
    );

    // Log any failures
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === "rejected") {
        console.warn(`AudioManager: preload failed for "${entries[i][0]}":`, results[i].reason);
      }
    }
  }

  /**
   * Play a spatial SFX at a world position.
   * @param {string} name — sound name (must be preloaded)
   * @param {object} position — { x, y, z }
   * @param {object} [options] — { volume: 1.0 }
   */
  playSFX(name, position, options = {}) {
    if (!this.ctx) return null;
    // Auto-resume if browser suspended the context
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
      return null; // skip this frame, will play next time
    }

    const pool = this._pools.get(name);
    if (!pool) {
      console.warn(`AudioManager: sound "${name}" not loaded`);
      return null;
    }

    const x = position.x ?? 0;
    const y = position.y ?? 0;
    const z = position.z ?? 0;
    const volume = options.volume ?? 1.0;

    return pool.play(x, y, z, volume);
  }

  /**
   * Play a non-spatial SFX (UI sounds, etc).
   * @param {string} name
   * @param {object} [options] — { volume: 1.0 }
   */
  playUI(name, options = {}) {
    if (!this.ctx || this.ctx.state === "suspended") return null;

    const buffer = this._buffers.get(name);
    if (!buffer) {
      console.warn(`AudioManager: sound "${name}" not loaded`);
      return null;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gain = this.ctx.createGain();
    gain.gain.value = options.volume ?? 1.0;

    source.connect(gain);
    gain.connect(this._sfxGain);
    source.start();

    return source;
  }

  /**
   * Play background music with optional crossfade.
   * @param {string} url — music file URL
   * @param {object} [options] — { fadeDuration: 2, loop: true }
   */
  async playMusic(url, options = {}) {
    this._ensureContext();

    const fadeDuration = options.fadeDuration ?? 2;
    const loop = options.loop !== false;

    // Fetch and decode
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn(`AudioManager: failed to load music ${url}`);
      return;
    }
    const arrayBuf = await resp.arrayBuffer();
    const audioBuffer = await this.ctx.decodeAudioData(arrayBuf);

    // Crossfade from current music
    if (this._currentMusic) {
      const oldGain = this._currentMusic.gain;
      const oldSource = this._currentMusic.source;
      oldGain.gain.setValueAtTime(oldGain.gain.value, this.ctx.currentTime);
      oldGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + fadeDuration);
      setTimeout(() => {
        try { oldSource.stop(); } catch (_) { /* ok */ }
        oldGain.disconnect();
      }, fadeDuration * 1000 + 100);
    }

    // Start new music
    const source = this.ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.loop = loop;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, this.ctx.currentTime + fadeDuration);

    source.connect(gain);
    gain.connect(this._musicGain);
    source.start();

    this._currentMusic = { source, gain, url };
  }

  /**
   * Stop current music with fade-out.
   * @param {number} fadeDuration — seconds
   */
  stopMusic(fadeDuration = 2) {
    if (!this._currentMusic) return;

    const { source, gain } = this._currentMusic;
    gain.gain.setValueAtTime(gain.gain.value, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + fadeDuration);
    setTimeout(() => {
      try { source.stop(); } catch (_) { /* ok */ }
      gain.disconnect();
    }, fadeDuration * 1000 + 100);

    this._currentMusic = null;
  }

  /**
   * Update the listener position/orientation from the camera.
   * Call this every frame.
   *
   * @param {object} position — camera.position (THREE.Vector3)
   * @param {object} quaternion — camera.quaternion (THREE.Quaternion)
   */
  updateListener(position, quaternion) {
    if (!this.ctx) return;

    const listener = this.ctx.listener;

    // Position
    if (listener.positionX) {
      // Modern API
      listener.positionX.value = position.x;
      listener.positionY.value = position.y;
      listener.positionZ.value = position.z;
    } else {
      listener.setPosition(position.x, position.y, position.z);
    }

    // Orientation — derive forward and up vectors from quaternion
    // THREE.js camera looks down -Z in local space
    if (quaternion) {
      const fx = 2 * (quaternion.x * quaternion.z + quaternion.w * quaternion.y);
      const fy = 2 * (quaternion.y * quaternion.z - quaternion.w * quaternion.x);
      const fz = 1 - 2 * (quaternion.x * quaternion.x + quaternion.y * quaternion.y);

      const ux = 2 * (quaternion.x * quaternion.y - quaternion.w * quaternion.z);
      const uy = 1 - 2 * (quaternion.x * quaternion.x + quaternion.z * quaternion.z);
      const uz = 2 * (quaternion.y * quaternion.z + quaternion.w * quaternion.x);

      if (listener.forwardX) {
        // Modern API
        listener.forwardX.value = -fx;
        listener.forwardY.value = -fy;
        listener.forwardZ.value = -fz;
        listener.upX.value = ux;
        listener.upY.value = uy;
        listener.upZ.value = uz;
      } else {
        listener.setOrientation(-fx, -fy, -fz, ux, uy, uz);
      }
    }
  }

  /**
   * Set volume for a category.
   * @param {'sfx'|'music'|'ambient'} category
   * @param {number} value — 0 to 1
   */
  setVolume(category, value) {
    this._volumes[category] = Math.max(0, Math.min(1, value));

    const gainMap = {
      sfx: this._sfxGain,
      music: this._musicGain,
      ambient: this._ambientGain,
    };

    const node = gainMap[category];
    if (node) {
      node.gain.value = this._volumes[category];
    }
  }

  /**
   * Set master volume.
   * @param {number} value — 0 to 1
   */
  setMasterVolume(value) {
    this._volumes.master = Math.max(0, Math.min(1, value));
    if (this._masterGain) {
      this._masterGain.gain.value = this._volumes.master;
    }
  }

  /**
   * Get current volume for a category.
   */
  getVolume(category) {
    return this._volumes[category] ?? this._volumes.master;
  }

  /**
   * Clean up all audio resources.
   */
  dispose() {
    // Stop music
    this.stopMusic(0);

    // Dispose all pools
    for (const pool of this._pools.values()) {
      pool.dispose();
    }
    this._pools.clear();
    this._buffers.clear();

    // Close context
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }

    // Remove event listeners
    if (typeof window !== "undefined") {
      window.removeEventListener("click", this._boundResume);
      window.removeEventListener("keydown", this._boundResume);
    }
  }
}
