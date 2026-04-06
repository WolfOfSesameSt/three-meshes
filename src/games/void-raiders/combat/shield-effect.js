/**
 * Shield bubble with ripple-on-hit effect.
 *
 * A transparent sphere around the vessel with fresnel edge glow.
 * When hit, a pulse ripples outward from the impact point across the surface.
 * Supports up to 4 simultaneous hit ripples.
 */

import * as THREE from "three";

const MAX_HITS = 4;

const vertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vNormal = normalize(normalMatrix * normal);
    vViewDir = cameraPosition - worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uOpacity;

  // Hit ripple data: xyz = hit point (world space), w = hit time
  uniform vec4 uHits[${MAX_HITS}];

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;

  void main() {
    // Fresnel edge glow
    float fresnel = 1.0 - abs(dot(normalize(vNormal), normalize(vViewDir)));
    fresnel = pow(fresnel, 3.0);

    float alpha = fresnel * uOpacity;
    vec3 color = uColor;

    // Hit ripples
    for (int i = 0; i < ${MAX_HITS}; i++) {
      vec3 hitPoint = uHits[i].xyz;
      float hitTime = uHits[i].w;
      if (hitTime < 0.0) continue; // no hit in this slot

      float age = uTime - hitTime;
      if (age > 1.5) continue; // ripple expired

      // Distance from this fragment to the hit point along the sphere surface
      // Approximate with world-space distance
      float dist = distance(vWorldPos, hitPoint);

      // Expanding ring
      float ringRadius = age * 30.0; // expansion speed
      float ringWidth = 3.0 + age * 4.0; // ring gets wider as it fades
      float ring = 1.0 - smoothstep(0.0, ringWidth, abs(dist - ringRadius));

      // Fade over time
      float fade = 1.0 - smoothstep(0.0, 1.5, age);
      fade *= fade; // quadratic falloff

      // Hexagonal pattern for sci-fi look
      float hex = sin(dist * 2.0) * sin(vWorldPos.y * 3.0 + vWorldPos.x * 1.7);
      hex = smoothstep(0.0, 0.4, hex) * 0.3;

      float ripple = ring * fade;
      alpha += ripple * 0.8;
      color += vec3(0.3, 0.6, 1.0) * ripple * 1.5;
      alpha += hex * fade * 0.15;
    }

    gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.9));
  }
`;

/**
 * Create a shield bubble for a vessel.
 * @param {number} radius — shield bubble radius
 * @param {THREE.Color|number} color — shield color
 * @returns {{ mesh, update, hit, setVisible }}
 */
export function createShieldBubble(radius = 12, color = 0x4488ff) {
  const hitSlots = new Array(MAX_HITS).fill(null).map(() => new THREE.Vector4(0, 0, 0, -1));

  const uniforms = {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(color) },
    uOpacity: { value: 0.06 },
    uHits: { value: hitSlots },
  };

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const geometry = new THREE.SphereGeometry(radius, 24, 16);
  const mesh = new THREE.Mesh(geometry, material);

  let nextHitSlot = 0;

  return {
    mesh,

    /**
     * Update the shield time uniform.
     * @param {number} time — elapsed time
     */
    update(time) {
      uniforms.uTime.value = time;
    },

    /**
     * Register a hit at a world-space position.
     * @param {object} worldPos — { x, y, z } impact point
     * @param {number} time — current elapsed time
     */
    hit(worldPos, time) {
      hitSlots[nextHitSlot].set(worldPos.x, worldPos.y, worldPos.z, time);
      nextHitSlot = (nextHitSlot + 1) % MAX_HITS;
    },

    /**
     * Toggle visibility.
     */
    setVisible(visible) {
      mesh.visible = visible;
    },

    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
