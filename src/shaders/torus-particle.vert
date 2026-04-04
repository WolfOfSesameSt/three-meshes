// Toroidal particle vertex shader
// Passes energy intensity and size to fragment shader

attribute float aIntensity;
attribute float aSize;

varying float vIntensity;
varying vec2 vUv;

void main() {
  vIntensity = aIntensity;
  vUv = uv;

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

  // Size attenuation — particles shrink with distance
  gl_PointSize = aSize * (300.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}
