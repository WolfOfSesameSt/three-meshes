/**
 * Toroidal energy sphere — the atmospheric boundary of a realm.
 *
 * A large translucent torus that surrounds the realm,
 * visible at the horizon with fresnel-based edge glow.
 */

import * as THREE from "three";
import { ATMOSPHERE_RADIUS, ATMOSPHERE_COLOR, ATMOSPHERE_OPACITY } from "../config.js";

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

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;

  float hash(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
          mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
          mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z
    );
  }

  void main() {
    // Fresnel — bright at edges
    float fresnel = 1.0 - abs(dot(normalize(vNormal), normalize(vViewDir)));
    fresnel = pow(fresnel, 2.5);

    // Energy veins flowing across the surface
    vec3 noiseCoord = vWorldPos * 0.002 + vec3(0.0, uTime * 0.05, uTime * 0.03);
    float veins = noise(noiseCoord);
    veins = smoothstep(0.35, 0.65, veins);

    float alpha = fresnel * uOpacity + veins * 0.02;
    vec3 color = uColor * (0.7 + veins * 0.3);

    gl_FragColor = vec4(color, alpha);
  }
`;

/**
 * Create the atmosphere torus mesh.
 * @returns {{ mesh: THREE.Mesh, update: function(number): void }}
 */
export function createAtmosphere() {
  const uniforms = {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(ATMOSPHERE_COLOR) },
    uOpacity: { value: ATMOSPHERE_OPACITY },
  };

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  // Large torus enclosing the realm
  const torusRadius = ATMOSPHERE_RADIUS;
  const tubeRadius = ATMOSPHERE_RADIUS * 0.3;
  const geometry = new THREE.TorusGeometry(torusRadius, tubeRadius, 32, 64);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = Math.PI / 2; // lay flat
  mesh.position.y = tubeRadius * 0.6; // float above terrain

  function update(time) {
    uniforms.uTime.value = time;
  }

  return { mesh, update };
}
