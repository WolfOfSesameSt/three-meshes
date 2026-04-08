/**
 * Minimal Three.js mock for unit testing game logic without WebGL.
 *
 * Only implements the math and data structures used by game systems.
 * Add methods as needed — keep it minimal.
 */

export class Vector2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  set(x, y) { this.x = x; this.y = y; return this; }
  copy(v) { this.x = v.x; this.y = v.y; return this; }
  clone() { return new Vector2(this.x, this.y); }
  normalize() {
    const len = Math.hypot(this.x, this.y) || 1;
    this.x /= len; this.y /= len;
    return this;
  }
  length() { return Math.hypot(this.x, this.y); }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y); }
}

export class Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  normalize() {
    const len = Math.hypot(this.x, this.y, this.z) || 1;
    this.x /= len; this.y /= len; this.z /= len;
    return this;
  }
  length() { return Math.hypot(this.x, this.y, this.z); }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  setScalar(s) { this.x = s; this.y = s; this.z = s; return this; }
  lerp(v, t) {
    this.x += (v.x - this.x) * t;
    this.y += (v.y - this.y) * t;
    this.z += (v.z - this.z) * t;
    return this;
  }
}

export class Color {
  constructor(r = 1, g = 1, b = 1) {
    if (typeof r === 'number' && g === undefined) {
      this.r = ((r >> 16) & 255) / 255;
      this.g = ((r >> 8) & 255) / 255;
      this.b = (r & 255) / 255;
    } else {
      this.r = r; this.g = g; this.b = b;
    }
  }
  setHex(hex) {
    this.r = ((hex >> 16) & 255) / 255;
    this.g = ((hex >> 8) & 255) / 255;
    this.b = (hex & 255) / 255;
    return this;
  }
  setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; return this; }
  multiplyScalar(s) { this.r *= s; this.g *= s; this.b *= s; return this; }
  clone() { return new Color(this.r, this.g, this.b); }
}

export class Object3D {
  constructor() {
    this.position = new Vector3();
    this.rotation = new Vector3();
    this.scale = new Vector3(1, 1, 1);
    this.children = [];
    this.parent = null;
    this.visible = true;
  }
  add(child) { this.children.push(child); child.parent = this; }
  remove(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) { this.children.splice(i, 1); child.parent = null; }
  }
  updateMatrix() {}
  updateMatrixWorld() {}
  lookAt() {}
  localToWorld(v) { return v; }
  worldToLocal(v) { return v; }
}

export class Group extends Object3D {
  constructor() {
    super();
    this.type = 'Group';
  }
  traverse(fn) {
    fn(this);
    for (const child of this.children) {
      fn(child);
      if (child.children) child.children.forEach(fn);
    }
  }
}

export class Scene extends Object3D {
  constructor() {
    super();
    this.type = 'Scene';
  }
}

export class Mesh extends Object3D {
  constructor(geometry, material) {
    super();
    this.geometry = geometry || {};
    this.material = material || {};
    this.type = 'Mesh';
  }
}

export class InstancedMesh extends Mesh {
  constructor(geometry, material, count) {
    super(geometry, material);
    this.count = count;
    this.instanceMatrix = { needsUpdate: false, setUsage() {} };
    this.instanceColor = null;
    this.type = 'InstancedMesh';
  }
  setMatrixAt() {}
  setColorAt() {}
}

export class BoxGeometry {
  constructor(w = 1, h = 1, d = 1) {
    this.parameters = { width: w, height: h, depth: d };
  }
  dispose() {}
}

export class SphereGeometry {
  constructor(r = 1, ws = 8, hs = 6) {
    this.parameters = { radius: r };
  }
  dispose() {}
}

export class CircleGeometry {
  constructor(r = 1, s = 8) {
    this.parameters = { radius: r, segments: s };
  }
  rotateX() { return this; }
  dispose() {}
}

export class CylinderGeometry {
  constructor(rt = 1, rb = 1, h = 1, rs = 8) {
    this.parameters = { radiusTop: rt, radiusBottom: rb, height: h, radialSegments: rs };
  }
  rotateX() { return this; }
  dispose() {}
}

// Minimal stubs for math/transform classes used by ship rigging code paths.
// The test runners don't exercise the actual matrix math; they just need
// these to be importable + constructible without throwing.
export class Matrix3 {
  constructor() {}
  getNormalMatrix() { return this; }
}

export class Matrix4 {
  constructor() {}
  copy() { return this; }
  invert() { return this; }
  clone() { return new Matrix4(); }
  applyMatrix4() {}
}

export class Quaternion {
  constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
  setFromUnitVectors() { return this; }
  clone() { return new Quaternion(this.x, this.y, this.z, this.w); }
  invert() { return this; }
  identity() { return this; }
}

export class Box3 {
  constructor() { this.min = new Vector3(); this.max = new Vector3(); }
  setFromObject() { return this; }
  getCenter(target) { return target || new Vector3(); }
  getSize(target) { return target || new Vector3(1, 1, 1); }
  containsPoint() { return false; }
}

export const MathUtils = {
  degToRad(d) { return d * Math.PI / 180; },
  radToDeg(r) { return r * 180 / Math.PI; },
  clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); },
  lerp(a, b, t) { return a + (b - a) * t; },
};

export class BufferGeometry {
  constructor() { this.attributes = {}; this.index = null; }
  setAttribute(name, attr) { this.attributes[name] = attr; }
  setIndex(index) { this.index = index; }
  computeVertexNormals() {}
  dispose() {}
}

export class Float32BufferAttribute {
  constructor(array, itemSize) {
    this.array = array instanceof Float32Array ? array : new Float32Array(array);
    this.itemSize = itemSize;
    this.needsUpdate = false;
  }
}

export class InstancedBufferAttribute {
  constructor(array, itemSize) {
    this.array = array;
    this.itemSize = itemSize;
    this.needsUpdate = false;
  }
}

export class MeshStandardMaterial {
  constructor(params = {}) { Object.assign(this, params); }
  dispose() {}
}

export class MeshBasicMaterial {
  constructor(params = {}) { Object.assign(this, params); }
  dispose() {}
}

export class ShaderMaterial {
  constructor(params = {}) { Object.assign(this, params); }
  dispose() {}
}

// RingGeometry / PlaneGeometry / IcosahedronGeometry stubs — used by the
// shader pools in combat/weapon-shaders.js. None of the test suites
// instantiate these directly, but the file imports them transitively if a
// future test ever pulls turret-system in.
export class RingGeometry {
  constructor(inner = 0.5, outer = 1, segments = 16) {
    this.parameters = { innerRadius: inner, outerRadius: outer, segments };
  }
  rotateX() { return this; }
  dispose() {}
}

export class PlaneGeometry {
  constructor(w = 1, h = 1) {
    this.parameters = { width: w, height: h };
  }
  dispose() {}
}

export class IcosahedronGeometry {
  constructor(r = 1, detail = 0) {
    this.parameters = { radius: r, detail };
  }
  dispose() {}
}

export class AmbientLight extends Object3D {
  constructor(color, intensity) { super(); this.color = color; this.intensity = intensity; }
}

export class DirectionalLight extends Object3D {
  constructor(color, intensity) { super(); this.color = color; this.intensity = intensity; }
}

// TextureLoader stub — turret-rigger.js instantiates one at module load
// time to support optional skin loading. Tests don't actually load
// textures, so the load() method is a no-op (calls the error callback so
// the surrounding promise resolves to null).
export class TextureLoader {
  constructor() {}
  load(url, onLoad, onProgress, onError) {
    if (onError) onError(new Error("test mock"));
    return null;
  }
}

export class ConeGeometry {
  constructor(r = 1, h = 1, s = 8) {
    this.parameters = { radius: r, height: h, radialSegments: s };
  }
  rotateX() { return this; }
  dispose() {}
}

// Constants
export const DynamicDrawUsage = 35048;
export const DoubleSide = 2;
export const FrontSide = 0;
export const BackSide = 1;
export const NormalBlending = 1;
export const AdditiveBlending = 2;
export const SRGBColorSpace = "srgb";
export const RepeatWrapping = 1000;
