// Toroidal particle fragment shader
// Soft circular glow with energy-based color ramp

uniform vec3 uColorCore;
uniform vec3 uColorMid;
uniform vec3 uColorEdge;

varying float vIntensity;

void main() {
  // Soft circular falloff from center of point sprite
  vec2 center = gl_PointCoord - 0.5;
  float dist = length(center) * 2.0;

  if (dist > 1.0) discard;

  // Sharp falloff — sparks not blobs
  float glow = exp(-dist * dist * 6.0);

  // Color ramp: violet edges, blue mids, bright-blue cores
  vec3 color = mix(uColorEdge, uColorMid, glow);
  color = mix(color, uColorCore, glow * glow * vIntensity);

  // Low base brightness, only bright at the very center
  float brightness = glow * glow * (0.15 + 0.4 * vIntensity);

  gl_FragColor = vec4(color * brightness, brightness * 0.7);
}
