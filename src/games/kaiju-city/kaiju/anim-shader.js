/**
 * Procedural vertex shader animation for the Godzilla mesh.
 *
 * Deforms the mesh based on normalized vertex position (0=feet, 1=head)
 * to create walking, breathing, tail swing, and idle sway.
 *
 * The model's local-space Y axis is height. We use the bounding box
 * to normalize positions into a 0-1 range for the deformation functions.
 */

import * as THREE from "three";

// Vertex shader: applies procedural deformation
const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uWalkSpeed;    // 0 = idle, 1 = full walk
  uniform float uBreathing;    // 0 = not breathing, 1 = breathing
  uniform float uTailSwipe;    // 0-1 tail swipe intensity
  uniform vec3 uBoundsMin;     // model bounding box min
  uniform vec3 uBoundsMax;     // model bounding box max

  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vNormal = normal;

    vec3 pos = position;

    // Normalize position to 0-1 range within bounding box
    vec3 normalized = (pos - uBoundsMin) / (uBoundsMax - uBoundsMin);
    float height = normalized.y;     // 0 = feet, 1 = head
    float depth = normalized.z;      // 0 = front, 1 = back (tail)
    float side = normalized.x - 0.5; // -0.5 = left, 0.5 = right

    float walkCycle = uTime * 8.0;

    // ── Walking: leg stride ──────────────────────────────
    // Low vertices (feet area) swing forward/back
    if (height < 0.2) {
      float legPhase = step(0.0, side); // left vs right leg
      float stride = sin(walkCycle + legPhase * 3.14159) * uWalkSpeed;
      pos.z += stride * 8.0 * (0.2 - height) * 5.0;
      // Slight vertical lift on forward stride
      pos.y += abs(stride) * 3.0 * (0.2 - height) * 5.0;
    }

    // ── Walking: body bob ────────────────────────────────
    float bob = sin(walkCycle * 2.0) * 2.0 * uWalkSpeed;
    pos.y += bob * smoothstep(0.2, 0.5, height);

    // ── Walking: body sway ───────────────────────────────
    float sway = sin(walkCycle) * 3.0 * uWalkSpeed;
    pos.x += sway * height * 0.5;

    // ── Idle: gentle breathing swell ─────────────────────
    float breathe = sin(uTime * 2.5) * 1.5;
    float torsoMask = smoothstep(0.2, 0.5, height) * smoothstep(0.8, 0.5, height);
    pos.x += side * breathe * torsoMask * 2.0;
    pos.z += (depth - 0.5) * breathe * torsoMask * 1.0;

    // ── Tail swing ───────────────────────────────────────
    // Back of model (high depth value) swings side to side
    float tailMask = smoothstep(0.6, 1.0, depth) * smoothstep(0.5, 0.2, height);
    float tailSwing = sin(uTime * 3.0) * 12.0;
    // Add extra swing on tail swipe attack
    tailSwing += sin(uTime * 12.0) * 20.0 * uTailSwipe;
    pos.x += tailSwing * tailMask;

    // ── Atomic breath: lean forward + chest swell ────────
    float breathLean = uBreathing * -5.0;
    pos.z += breathLean * smoothstep(0.5, 1.0, height);
    // Chest swell
    float chestSwell = uBreathing * sin(uTime * 15.0) * 2.0;
    float chestMask = smoothstep(0.5, 0.7, height) * smoothstep(0.9, 0.7, height);
    pos.x += side * chestSwell * chestMask * 3.0;

    // ── Head bob (idle) ──────────────────────────────────
    float headMask = smoothstep(0.8, 1.0, height);
    pos.y += sin(uTime * 1.8 + 0.5) * 1.0 * headMask;
    pos.z += sin(uTime * 1.2) * 0.8 * headMask;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

// Fragment shader: simple textured with basic lighting
const fragmentShader = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uBreathing;

  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vec4 texColor = texture2D(uTexture, vUv);

    // Simple hemisphere lighting
    float light = 0.5 + 0.5 * dot(normalize(vNormal), normalize(vec3(0.3, 1.0, 0.2)));
    vec3 color = texColor.rgb * light;

    // Atomic breath glow on the upper body
    float glowMask = smoothstep(0.6, 0.9, vUv.y) * uBreathing;
    color += vec3(0.1, 0.3, 0.8) * glowMask * 0.5;

    gl_FragColor = vec4(color, texColor.a);
  }
`;

/**
 * Create an animated ShaderMaterial from the Godzilla model's original material.
 * @param {THREE.Mesh} mesh - the loaded glTF mesh
 * @returns {{ material: THREE.ShaderMaterial, uniforms: object }}
 */
export function createAnimatedMaterial(mesh) {
  // Get the original texture from the mesh
  const originalMat = mesh.material;
  const texture = originalMat.map || originalMat.pbrMetallicRoughness?.baseColorTexture;

  // Compute bounding box
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;

  const uniforms = {
    uTime: { value: 0 },
    uWalkSpeed: { value: 0 },
    uBreathing: { value: 0 },
    uTailSwipe: { value: 0 },
    uTexture: { value: texture || new THREE.Texture() },
    uBoundsMin: { value: box.min.clone() },
    uBoundsMax: { value: box.max.clone() },
  };

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    side: THREE.DoubleSide,
  });

  return { material, uniforms };
}

/**
 * Update animation uniforms each frame.
 * @param {object} uniforms - from createAnimatedMaterial
 * @param {number} time - elapsed time
 * @param {boolean} isMoving - kaiju is walking
 * @param {boolean} isBreathing - atomic breath active
 * @param {number} tailSwipe - 0-1 tail swipe intensity (decays over time)
 */
export function updateAnimation(uniforms, time, isMoving, isBreathing, tailSwipe) {
  uniforms.uTime.value = time;
  // Smooth transitions
  const targetWalk = isMoving ? 1 : 0;
  uniforms.uWalkSpeed.value += (targetWalk - uniforms.uWalkSpeed.value) * 0.1;
  const targetBreath = isBreathing ? 1 : 0;
  uniforms.uBreathing.value += (targetBreath - uniforms.uBreathing.value) * 0.15;
  uniforms.uTailSwipe.value = tailSwipe;
}
