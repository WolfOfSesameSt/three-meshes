// Toroidal shell vertex shader
// Passes normals, view direction, and world position to fragment

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
