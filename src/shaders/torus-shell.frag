// Toroidal shell fragment shader
// Fresnel-based ghost shell with animated energy veins

uniform float uTime;
uniform vec3 uColor;
uniform float uOpacity;

varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vWorldPos;

// Simple 3D noise for energy veins
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
  // Fresnel — bright at edges, transparent at center
  float fresnel = 1.0 - abs(dot(normalize(vNormal), normalize(vViewDir)));
  fresnel = pow(fresnel, 2.5);

  // Animated energy veins flowing along the torus
  vec3 noiseCoord = vWorldPos * 3.0 + vec3(0.0, uTime * 0.3, uTime * 0.15);
  float veins = noise(noiseCoord);
  veins = smoothstep(0.35, 0.65, veins);

  // Combine fresnel shell with energy veins
  float alpha = fresnel * uOpacity + veins * 0.08;
  vec3 color = uColor * (1.0 + veins * 0.5);

  gl_FragColor = vec4(color, alpha);
}
