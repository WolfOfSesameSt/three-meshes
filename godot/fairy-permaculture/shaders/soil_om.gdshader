// Fairy Permaculture — per-plot OM progression shader.
//
// A tiny, palette-driven spatial shader for the soil plot's disc + mound.
// Drives the warm-muted → rich-dark progression by blending three anchor
// colors keyed off an `om_t` [0..1] uniform, with a subtle moisture tint
// and optional mycelial flecks at climax OM levels.
//
// All three color anchors are pushed in from GDScript via palette
// constants — the shader itself never invents a raw color. This keeps
// the warm-pastel clamp honest even at runtime.
//
// GL Compatibility notes (see feedback_qa_gate_mandatory.md, 2026-04-19):
//   • No `source_color` uniform defaults — drivers silently zero them.
//     The GDScript caller always sets the uniforms before the shader
//     runs; these defaults are sane fallbacks only.
//   • No ALPHA writes. Opaque only.
//   • render_mode unshaded — the soil plot sits inside the toon-shaded
//     world but draws its own cel ramp here so the OM color stays true.

shader_type spatial;
render_mode unshaded;

// Three palette anchors blended by om_t. GDScript sets these every
// refresh from Palette.STRAW_DRY / WARM_STONE / EARTH / COMPOST
// depending on the OM band — so the shader itself only blends, never
// invents colors.
uniform vec3 barren_color = vec3(0.847, 0.784, 0.604);   // STRAW_DRY fallback
uniform vec3 mid_color    = vec3(0.710, 0.600, 0.463);   // WARM_STONE→EARTH
uniform vec3 rich_color   = vec3(0.478, 0.361, 0.282);   // EARTH
uniform vec3 climax_color = vec3(0.243, 0.184, 0.137);   // COMPOST

// Linear 0..1 from OM_MIN..OM_MAX (caller normalises).
uniform float om_t : hint_range(0.0, 1.0) = 0.0;

// Moisture 0..1 — wet tiles multiply by 0.85 at the top of the curve.
uniform float moisture_t : hint_range(0.0, 1.0) = 0.35;

// Mulched plots tilt warmer (handled GDScript-side, but we expose a
// slot so the shader reads cleanly).
uniform float mulch_mix : hint_range(0.0, 1.0) = 0.0;
uniform vec3 mulch_tint = vec3(0.820, 0.650, 0.400);   // EARTH→HONEY

// Night emission at climax. GDScript flips this on at OM>10.
uniform float emission_amount : hint_range(0.0, 2.0) = 0.0;
uniform vec3 emission_tint = vec3(0.949, 0.757, 0.306);   // HONEY

// Mycelial fleck parameters. Intensity rises only at climax OM.
uniform float flecks_intensity : hint_range(0.0, 1.0) = 0.0;
uniform vec3 fleck_color = vec3(0.835, 0.933, 0.937);     // MIST

// Hardcoded sun direction so the cel ramp matches toon.gdshader.
const vec3 SUN_DIR = vec3(-0.5, 0.707, -0.5);
const vec3 SUN_COLOR = vec3(1.0, 0.96, 0.87);

// Cheap 2D hash — for the fleck field.
float hash21(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

void fragment() {
	// Three-band OM blend. Matches the GDScript band ramp but lets the
	// shader interpolate per-pixel smoothly — so as om_t climbs the
	// disc face tweens visibly without re-rebuilding the material.
	vec3 soil;
	if (om_t < 0.33) {
		soil = mix(barren_color, mid_color, om_t / 0.33);
	} else if (om_t < 0.66) {
		soil = mix(mid_color, rich_color, (om_t - 0.33) / 0.33);
	} else {
		soil = mix(rich_color, climax_color, (om_t - 0.66) / 0.34);
	}
	soil = mix(soil, mulch_tint, mulch_mix * 0.45);
	// Wet tiles darken — capped at 15% cut for moisture_t = 1.
	float wet_k = clamp((moisture_t - 0.20) / 0.60, 0.0, 1.0);
	soil *= mix(1.0, 0.85, wet_k);

	// Cel ramp — two-band lit / shadow against the fixed sun.
	vec3 n_world = normalize((INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).xyz);
	float ndl = max(dot(n_world, normalize(SUN_DIR)), 0.0);
	float band = step(0.5, ndl);
	vec3 lit = soil * mix(vec3(0.65), vec3(1.0), band) * SUN_COLOR;

	// Mycelial flecks — cheap hash per object-space XZ, very low density
	// so the surface never reads busy. Only shows up at climax OM.
	if (flecks_intensity > 0.0) {
		vec2 cell = floor(UV * 24.0);
		float h = hash21(cell);
		float spark = step(0.985, h) * flecks_intensity;
		lit += fleck_color * spark * 0.6;
	}

	lit += emission_tint * emission_amount;

	ALBEDO = lit;
	// NO ALPHA WRITE — opaque only (GL Compatibility bug avoidance).
}
