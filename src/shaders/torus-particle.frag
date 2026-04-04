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

  // Glow falloff — exponential for soft halo
  float glow = exp(-dist * dist * 3.0);

  // Color ramp based on intensity + glow
  vec3 color = mix(uColorEdge, uColorMid, glow);
  color = mix(color, uColorCore, glow * vIntensity);

  // Brightness boost for high-energy particles
  float brightness = glow * (0.4 + 0.6 * vIntensity);

  gl_FragColor = vec4(color * brightness * 1.5, brightness);
}
