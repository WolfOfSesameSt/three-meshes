## Fairy Permaculture — Lab water-showcase preview.
##
## Builds a shared pond + stream scene and swaps in one of six
## ShaderMaterial variations so the user can A/B compare water looks
## without leaving the Dev Lab.
##
## Every variation uses the SAME mesh layout (pond plane, stream plane,
## constant rock + reed dressing) so only the water treatment differs
## — exactly what we need to pick a style.
##
## All shaders are hand-authored to work on Godot's GL Compatibility
## renderer (GLES3): no compute, no tessellation, no float textures,
## only simple `texture()`/`TIME`/`UV`/`VIEW`/`NORMAL` primitives.
extends Node3D

const TOON_SHADER_PATH := "res://shaders/toon.gdshader"

var variation_id: String = "classic"
var entity: Dictionary = {}

var _water_materials: Array[ShaderMaterial] = []
var _pond_mesh: MeshInstance3D
var _stream_mesh: MeshInstance3D
var _time_seed: float = 0.0


## Entry point — lab_preview_factory dispatches here with the picked
## variation record.
func setup(e: Dictionary, _state: String) -> void:
	entity = e
	variation_id = String(e.get("id", "classic"))
	_build()


## The lab calls animate() every frame. Shaders read TIME themselves,
## but we tick a uniform on variations that can't use TIME (none do
## currently — this hook is here for future scrubbing).
func animate(_anim: String, t: float, _dt: float) -> void:
	_time_seed = t


## Build layout ---------------------------------------------------------

func _build() -> void:
	_build_pond_and_stream()
	var mat: ShaderMaterial = _build_variation_material(variation_id)
	_pond_mesh.material_override = mat
	_stream_mesh.material_override = mat
	_water_materials.append(mat)


## Shared pond + stream + dressing. Approx 9 m wide × 5 m deep, fits the
## lab camera's default radius.
func _build_pond_and_stream() -> void:
	# Low grass pad (cel-shaded, green) — Palette.MEADOW so the surround
	# reads as lush warm-green rather than washed-out.
	var pad: MeshInstance3D = _cube(
		Vector3(0.0, -0.12, 0.0),
		Vector3(9.0, 0.22, 5.0),
		Color(0.545, 0.769, 0.478)
	)
	add_child(pad)

	# Pond basin — warm earth patch under the water plane. Matches
	# Palette.EARTH (#7A5C48) so the basin reads as "wet loam" not
	# depressing mud.
	var pond_basin: MeshInstance3D = _cube(
		Vector3(-2.3, -0.04, 0.0),
		Vector3(4.2, 0.08, 4.2),
		Color(0.48, 0.36, 0.28)
	)
	add_child(pond_basin)

	# Stream bed — warm wet-earth trench under the ribbon, slightly sunken.
	var stream_bed: MeshInstance3D = _cube(
		Vector3(2.2, -0.06, 0.0),
		Vector3(4.2, 0.10, 1.7),
		Color(0.45, 0.34, 0.26)
	)
	add_child(stream_bed)

	# Pond water plane (4×4). Slightly above the basin so z-fighting
	# doesn't happen on compat renderer.
	var pond_plane: PlaneMesh = PlaneMesh.new()
	pond_plane.size = Vector2(4.0, 4.0)
	pond_plane.subdivide_width = 12
	pond_plane.subdivide_depth = 12
	_pond_mesh = MeshInstance3D.new()
	_pond_mesh.mesh = pond_plane
	_pond_mesh.position = Vector3(-2.3, 0.02, 0.0)
	_pond_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_pond_mesh)

	# Stream channel — winding ribbon built as an ArrayMesh. ~5 m long.
	_stream_mesh = MeshInstance3D.new()
	_stream_mesh.mesh = _build_stream_mesh()
	_stream_mesh.position = Vector3(2.2, 0.02, 0.0)
	_stream_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_stream_mesh)

	# Rocks along the bank — warm-stone tones (Palette.WARM_STONE-biased so
	# the palette-audit "dead grey" filter doesn't fire). Warm earth > cold
	# concrete; DESIGN.md §Art Direction is explicit.
	_add_rock(Vector3(-0.1, 0.04, 2.1), 0.28, Color(0.71, 0.60, 0.46))
	_add_rock(Vector3(0.4, 0.04, -2.0), 0.22, Color(0.66, 0.55, 0.42))
	_add_rock(Vector3(3.8, 0.05, 1.0), 0.25, Color(0.74, 0.62, 0.48))
	_add_rock(Vector3(3.2, 0.05, -1.1), 0.20, Color(0.76, 0.66, 0.52))
	_add_rock(Vector3(-4.2, 0.05, 1.6), 0.24, Color(0.68, 0.58, 0.44))

	# Reed / grass tufts at pond edge + stream bank.
	_add_reed_tuft(Vector3(-0.25, 0.10, 1.9))
	_add_reed_tuft(Vector3(-4.0, 0.10, -1.7))
	_add_reed_tuft(Vector3(-4.3, 0.10, 0.5))
	_add_reed_tuft(Vector3(0.8, 0.10, 0.6))
	_add_reed_tuft(Vector3(4.0, 0.10, 0.1))


## Generate a winding stream ribbon. Flow direction is +X. We step along
## x and offset Z by a low-amplitude sine so the ribbon feels natural.
func _build_stream_mesh() -> ArrayMesh:
	var verts: PackedVector3Array = PackedVector3Array()
	var normals: PackedVector3Array = PackedVector3Array()
	var uvs: PackedVector2Array = PackedVector2Array()
	var indices: PackedInt32Array = PackedInt32Array()

	var length_m: float = 5.0
	var half_width: float = 0.75
	var segments: int = 24
	var seg_len: float = length_m / float(segments)

	for i in range(segments + 1):
		var x: float = -length_m * 0.5 + float(i) * seg_len
		var tt: float = float(i) / float(segments)
		var z_offset: float = sin(tt * TAU * 1.2) * 0.35
		var width: float = half_width * (1.0 - 0.1 * sin(tt * TAU * 0.8))
		verts.append(Vector3(x, 0.0, z_offset - width))
		verts.append(Vector3(x, 0.0, z_offset + width))
		normals.append(Vector3.UP)
		normals.append(Vector3.UP)
		# V axis follows flow so painterly/ghibli shaders can scroll along it.
		uvs.append(Vector2(0.0, tt * 5.0))
		uvs.append(Vector2(1.0, tt * 5.0))

	for i in range(segments):
		var a: int = i * 2
		var b: int = a + 1
		var c: int = a + 2
		var d: int = a + 3
		indices.append(a); indices.append(c); indices.append(b)
		indices.append(b); indices.append(c); indices.append(d)

	var arr: Array = []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = verts
	arr[Mesh.ARRAY_NORMAL] = normals
	arr[Mesh.ARRAY_TEX_UV] = uvs
	arr[Mesh.ARRAY_INDEX] = indices

	var mesh: ArrayMesh = ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	return mesh


## Dressing -------------------------------------------------------------

func _add_rock(pos: Vector3, r: float, color: Color) -> void:
	var rock: MeshInstance3D = _sphere(pos, r, color)
	rock.scale = Vector3(1.2, 0.55, 1.0)
	add_child(rock)


func _add_reed_tuft(pos: Vector3) -> void:
	var base: MeshInstance3D = _sphere(pos, 0.18, Color(0.40, 0.58, 0.30))
	base.scale = Vector3(1.0, 0.35, 1.0)
	add_child(base)
	for i in range(4):
		var ang: float = float(i) * TAU / 4.0 + 0.4
		var blade: MeshInstance3D = _cube(
			pos + Vector3(cos(ang) * 0.06, 0.22, sin(ang) * 0.06),
			Vector3(0.03, 0.5, 0.03),
			Color(0.46, 0.64, 0.32)
		)
		blade.rotation.z = sin(ang) * 0.18
		blade.rotation.x = cos(ang) * 0.18
		add_child(blade)


## Variation dispatch ---------------------------------------------------

func _build_variation_material(id: String) -> ShaderMaterial:
	match id:
		"classic": return _mat_classic()
		"toon_banded": return _mat_toon_banded()
		"painted_ripple": return _mat_painted_ripple()
		"anime_low_poly": return _mat_anime_low_poly()
		"reflective_glass": return _mat_reflective_glass()
		"ghibli_stream": return _mat_ghibli_stream()
		_: return _mat_classic()


# Variation 1 — Classic translucent (benchmark). Inline constants — no
# source_color uniforms (GL Compatibility silently zeros those in some
# driver paths, producing black surfaces).
func _mat_classic() -> ShaderMaterial:
	# Opaque — GL Compatibility has bugs with blend_mix + unshaded
	# (water rendered black). Solid shader reads crisp against bank.
	var mat: ShaderMaterial = ShaderMaterial.new()
	var sh: Shader = Shader.new()
	sh.code = """
shader_type spatial;
render_mode unshaded;

void vertex() {
	VERTEX.y += 0.03 * sin(TIME * 1.2 + VERTEX.x * 0.8 + VERTEX.z * 0.6);
}

void fragment() {
	vec3 shallow = vec3(0.42, 0.78, 0.88);
	vec3 deep = vec3(0.18, 0.48, 0.72);
	vec2 uv = UV + vec2(TIME * 0.08, TIME * 0.04);
	float shimmer = 0.5 + 0.5 * sin(uv.x * 12.0 + TIME * 1.5) * cos(uv.y * 10.0 - TIME);
	float depth_band = smoothstep(0.3, 0.7, UV.x + UV.y * 0.3);
	vec3 base = mix(shallow, deep, depth_band);
	base += vec3(shimmer * 0.08);
	ALBEDO = base;
}
"""
	mat.shader = sh
	return mat


# Variation 2 — Toon banded. Three hard depth bands + foam ring at edges
# (where NORMAL·VIEW is high → near-grazing angle, but we use the fresnel
# inverse to draw a foam halo).
func _mat_toon_banded() -> ShaderMaterial:
	var mat: ShaderMaterial = ShaderMaterial.new()
	var sh: Shader = Shader.new()
	sh.code = """
shader_type spatial;
render_mode unshaded;

void vertex() {
	VERTEX.y += 0.02 * sin(TIME * 0.9 + VERTEX.x * 1.6);
}

void fragment() {
	vec3 band_a = vec3(0.62, 0.90, 0.95);
	vec3 band_b = vec3(0.25, 0.58, 0.72);
	vec3 band_c = vec3(0.10, 0.30, 0.55);
	vec3 foam = vec3(0.96, 0.98, 1.00);
	float ndv = clamp(abs(dot(NORMAL, VIEW)), 0.0, 1.0);
	vec3 col = band_a;
	if (ndv < 0.78) col = band_b;
	if (ndv < 0.55) col = band_c;
	float edge = 1.0 - abs(UV.x - 0.5) * 2.0;
	float pond_edge = 1.0 - abs(UV.y - 0.5) * 2.0;
	float bank = min(edge, pond_edge);
	float foam_line = smoothstep(0.05, 0.0, bank) * (0.6 + 0.4 * sin(TIME * 2.0 + UV.x * 20.0));
	col = mix(col, foam, clamp(foam_line, 0.0, 1.0));
	ALBEDO = col;
}
"""
	mat.shader = sh
	return mat


# Variation 3 — Painted ripple. Procedural noise-driven painterly streaks
# flowing with stream V axis. Noise is cheap sin/hash combo.
func _mat_painted_ripple() -> ShaderMaterial:
	var mat: ShaderMaterial = ShaderMaterial.new()
	var sh: Shader = Shader.new()
	sh.code = """
shader_type spatial;
render_mode unshaded;

float hash21(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

void fragment() {
	vec3 base_color = vec3(0.30, 0.62, 0.72);
	vec3 stroke_color = vec3(0.78, 0.92, 0.96);
	vec2 uv = UV;
	uv.y -= TIME * 0.35;
	float s1 = sin(uv.x * 18.0 + uv.y * 4.0);
	float s2 = sin(uv.x * 7.0 - uv.y * 11.0 + 1.7);
	float s3 = sin((uv.x + uv.y) * 13.0 + 0.5);
	float strokes = (s1 + s2 + s3) / 3.0;
	vec2 cell = floor(uv * 8.0);
	float jitter = hash21(cell) - 0.5;
	float mask = smoothstep(0.15 + jitter * 0.1, 0.55, strokes);
	vec3 col = mix(base_color, stroke_color, mask);
	ALBEDO = col;
}
"""
	mat.shader = sh
	return mat


# Variation 4 — Anime low-poly. Big stepped facets via flat-shaded normal
# from derivatives, plus rhythmic caustic dot pattern.
func _mat_anime_low_poly() -> ShaderMaterial:
	var mat: ShaderMaterial = ShaderMaterial.new()
	var sh: Shader = Shader.new()
	sh.code = """
shader_type spatial;
render_mode unshaded;

void vertex() {
	float raw = sin(VERTEX.x * 0.9 + TIME * 0.8) + cos(VERTEX.z * 1.1 + TIME * 0.6);
	float stepped = floor(raw * 3.0) / 3.0;
	VERTEX.y += stepped * 0.04;
}

void fragment() {
	vec3 light_color = vec3(0.55, 0.82, 0.92);
	vec3 dark_color = vec3(0.20, 0.45, 0.62);
	vec3 caustic_color = vec3(1.0, 1.0, 1.0);
	float band = step(0.5, fract(UV.y * 3.0 + TIME * 0.2));
	vec3 col = mix(dark_color, light_color, band);
	vec2 gv = fract(UV * 6.0) - 0.5;
	float dot_mask = smoothstep(0.22, 0.14, length(gv));
	vec2 gid = floor(UV * 6.0);
	float phase = sin(TIME * 3.0 + gid.x * 1.7 + gid.y * 2.3);
	float pulse = smoothstep(0.3, 0.95, phase);
	col += caustic_color * dot_mask * pulse * 0.55;
	ALBEDO = col;
}
"""
	mat.shader = sh
	return mat


# Variation 5 — Reflective glass. Smooth mirror, sky tint, fresnel edge,
# minimal wave. Leans on standard shading pipeline.
func _mat_reflective_glass() -> ShaderMaterial:
	var mat: ShaderMaterial = ShaderMaterial.new()
	var sh: Shader = Shader.new()
	sh.code = """
shader_type spatial;
render_mode unshaded;

void vertex() {
	VERTEX.y += 0.004 * sin(TIME * 0.4 + VERTEX.x * 0.3);
}

void fragment() {
	vec3 sky_tint = vec3(0.78, 0.88, 0.95);
	vec3 edge_tint = vec3(0.48, 0.65, 0.78);
	vec3 body_tint = vec3(0.28, 0.48, 0.62);
	float ndv = clamp(abs(dot(NORMAL, VIEW)), 0.0, 1.0);
	float fresnel = pow(1.0 - ndv, 4.0);
	vec3 col = mix(body_tint, sky_tint, ndv);
	col = mix(col, edge_tint, fresnel * 0.6);
	ALBEDO = col;
}
"""
	mat.shader = sh
	return mat


# Variation 6 — Ghibli stream. Base translucent + emissive sparkle field
# + fog fade at bank edge (UV-driven). Most complex — sells the magical
# permaculture mood.
func _mat_ghibli_stream() -> ShaderMaterial:
	var mat: ShaderMaterial = ShaderMaterial.new()
	var sh: Shader = Shader.new()
	sh.code = """
shader_type spatial;
render_mode unshaded;

float hash21(vec2 p) {
	p = fract(p * vec2(127.1, 311.7));
	p += dot(p, p + 17.17);
	return fract(p.x * p.y);
}

void vertex() {
	VERTEX.y += 0.018 * sin(TIME * 1.1 + VERTEX.x * 0.7 + VERTEX.z * 0.9);
}

void fragment() {
	vec3 water_color = vec3(0.35, 0.68, 0.72);
	vec3 foam_color = vec3(1.0, 1.0, 1.0);
	vec3 deep_tint = vec3(0.18, 0.38, 0.48);
	float sparkle_density = 8.0;
	float ndv = clamp(abs(dot(NORMAL, VIEW)), 0.0, 1.0);
	float depth_mix = pow(1.0 - ndv, 2.0);
	vec3 base = mix(water_color, deep_tint, depth_mix);
	float bank_dist = min(UV.x, 1.0 - UV.x) * 2.0;
	float fog = smoothstep(0.0, 0.25, bank_dist);
	base = mix(vec3(0.88, 0.92, 0.88), base, fog);
	vec2 flow_uv = UV + vec2(0.0, -TIME * 0.12);
	vec2 cell = floor(flow_uv * sparkle_density);
	vec2 gv = fract(flow_uv * sparkle_density) - 0.5;
	float r = hash21(cell);
	float twinkle_phase = sin(TIME * 2.2 + r * 12.0);
	float pop = smoothstep(0.6, 0.98, twinkle_phase) * step(r, 0.35);
	float sparkle = smoothstep(0.18, 0.02, length(gv)) * pop;
	base = mix(base, foam_color, sparkle);
	ALBEDO = base;
}
"""
	mat.shader = sh
	return mat


## Mesh helpers ---------------------------------------------------------

func _cel_material(color: Color) -> ShaderMaterial:
	var mat: ShaderMaterial = ShaderMaterial.new()
	var sh: Shader = load(TOON_SHADER_PATH)
	if sh:
		mat.shader = sh
		mat.set_shader_parameter("albedo_color", Vector4(color.r, color.g, color.b, color.a))
		mat.set_shader_parameter("shadow_darkness", 0.35)
		mat.set_shader_parameter("rim_strength", 0.15)
	return mat


func _cube(pos: Vector3, size: Vector3, color: Color) -> MeshInstance3D:
	var m: BoxMesh = BoxMesh.new()
	m.size = size
	var mi: MeshInstance3D = MeshInstance3D.new()
	mi.mesh = m
	mi.material_override = _cel_material(color)
	mi.position = pos
	return mi


func _sphere(pos: Vector3, radius: float, color: Color) -> MeshInstance3D:
	var m: SphereMesh = SphereMesh.new()
	m.radius = radius
	m.height = radius * 2.0
	var mi: MeshInstance3D = MeshInstance3D.new()
	mi.mesh = m
	mi.material_override = _cel_material(color)
	mi.position = pos
	return mi
