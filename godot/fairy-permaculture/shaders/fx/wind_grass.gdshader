// Fairy Permaculture — vertex wind sway for grass blades + reed tufts.
//
// Simple wind deformation seeded by world-space Y so blades sway more at
// the tip and are anchored at the base. Palette-authored tip tint applied
// as an unshaded two-band cel ramp matching `shaders/toon.gdshader`.
//
// GL Compatibility safe:
//   • render_mode unshaded — avoids the diffuse_toon + ambient issue.
//   • No ALPHA writes — material stays opaque (transparency footgun).
//   • No source_color defaults relied on at runtime — script should push
//     uniforms from GDScript when swapping seasons. Defaults here are
//     PARCHMENT (safe warm neutral) so a forgotten push never ships grey.
//
// Usage:
//   var mat := ShaderMaterial.new()
//   mat.shader = preload("res://shaders/fx/wind_grass.gdshader")
//   mat.set_shader_parameter("base_color", Vector4(0.545, 0.769, 0.478, 1.0))
//   mat.set_shader_parameter("tip_color",  Vector4(0.95, 0.76, 0.31, 1.0))
//   mat.set_shader_parameter("wind_amplitude", 0.08)
//   mesh_instance.material_override = mat

shader_type spatial;
render_mode unshaded, cull_disabled;

uniform vec4 base_color : source_color = vec4(0.96, 0.92, 0.83, 1.0);
uniform vec4 tip_color  : source_color = vec4(0.96, 0.92, 0.83, 1.0);
uniform float wind_amplitude : hint_range(0.0, 0.5) = 0.08;
uniform float wind_frequency : hint_range(0.1, 6.0) = 1.6;
uniform float wind_phase_scale : hint_range(0.01, 2.0) = 0.35;
uniform float shadow_darkness : hint_range(0.0, 1.0) = 0.55;

// Hardcoded warm sun direction (matches shaders/toon.gdshader).
const vec3 SUN_DIR = vec3(-0.5, 0.707, -0.5);
const vec3 SUN_COLOR = vec3(1.0, 0.96, 0.87);

void vertex() {
	// Tip weight — vertices higher up (world Y) bend more. Clamped so the
	// base is anchored. We use object-space VERTEX.y as the proxy; works
	// fine for upright grass blades authored at origin.
	float tip_w = clamp(VERTEX.y, 0.0, 2.0);
	// Seed the sinusoid with world-space XZ so each blade sways out of
	// phase with its neighbours.
	vec3 world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float phase = world_pos.x * wind_phase_scale + world_pos.z * wind_phase_scale * 0.7;
	float sway = sin(TIME * wind_frequency + phase) * wind_amplitude * tip_w;
	VERTEX.x += sway;
	VERTEX.z += sway * 0.35;
}

void fragment() {
	// Blend base -> tip along Y (object space). Works for blade meshes
	// authored 0..1 tall; taller blades still read since we saturate.
	float tip_t = clamp(UV.y, 0.0, 1.0);
	vec3 base = mix(base_color.rgb, tip_color.rgb, tip_t);
	vec3 n_world = normalize((INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).xyz);
	float ndl = max(dot(n_world, normalize(SUN_DIR)), 0.0);
	float band = step(0.5, ndl);
	vec3 lit = base * mix(vec3(shadow_darkness), vec3(1.0), band) * SUN_COLOR;
	ALBEDO = lit;
	// Intentionally no ALPHA write.
}
