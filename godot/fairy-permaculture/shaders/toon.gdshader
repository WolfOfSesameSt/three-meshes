// Fairy Permaculture — 2-band cel shading.
//
// **Unshaded** pipeline — bypasses Godot's GL Compatibility lighting
// entirely (which was producing black/invisible surfaces for opaque
// meshes — see feedback_qa_gate_mandatory.md entry dated 2026-04-19).
// The cel ramp is computed manually against a hardcoded sun direction.
//
// Usage: `ShaderMaterial.set_shader_parameter("albedo_color", Vector4(r,g,b,1))`
// on any Node3D mesh. `use_texture`/`albedo_tex` optional for GLB models.

shader_type spatial;
render_mode unshaded;

uniform vec4 albedo_color : source_color = vec4(0.55, 0.77, 0.48, 1.0);
uniform sampler2D albedo_tex : source_color, hint_default_white;
uniform bool use_texture = false;
uniform float shadow_darkness : hint_range(0.0, 1.0) = 0.55;
uniform float rim_strength : hint_range(0.0, 1.0) = 0.15;

// Hardcoded warm sun direction in world space (matches in-game sun arc
// at roughly 45° altitude, SW origin). Normalised.
const vec3 SUN_DIR = vec3(-0.5, 0.707, -0.5);
const vec3 SUN_COLOR = vec3(1.0, 0.96, 0.87);

void fragment() {
	vec4 base = albedo_color;
	if (use_texture) {
		base *= texture(albedo_tex, UV);
	}
	// Two-band ramp against a fixed sun direction. NORMAL is in view
	// space by default; convert to world via INV_VIEW_MATRIX.
	vec3 n_world = normalize((INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).xyz);
	float ndl = max(dot(n_world, normalize(SUN_DIR)), 0.0);
	float band = step(0.5, ndl);
	vec3 lit = base.rgb * mix(vec3(shadow_darkness), vec3(1.0), band) * SUN_COLOR;
	// Subtle rim for silhouette legibility.
	float rim = pow(1.0 - clamp(abs(dot(NORMAL, VIEW)), 0.0, 1.0), 3.0);
	lit += rim * rim_strength * SUN_COLOR * band;
	ALBEDO = lit;
	// Intentionally NOT writing ALPHA. Opaque only — see 2026-04-19 fix.
}
