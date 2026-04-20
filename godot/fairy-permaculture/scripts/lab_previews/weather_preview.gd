## Fairy Permaculture — Lab weather-showcase preview.
##
## Builds a shared diorama (ground + tree + grass tufts + rock) and then
## composes one of eight weather ShaderMaterial variations on top so the
## designer can A/B compare atmospheric looks without leaving the Dev Lab.
##
## Every variation keeps the SAME diorama scaffolding — only the weather
## overlay differs. Each variation exposes a single `intensity` uniform
## that the lab can drive live via `set_intensity(value)`.
##
## Renderer constraints: Godot GL Compatibility / GLES3 safe. No compute,
## no tessellation, no float textures; stick to `texture()`, `TIME`, `UV`,
## `VIEW`, `NORMAL`, and simple hash/sin noise.
extends Node3D

const TOON_SHADER_PATH := "res://shaders/toon.gdshader"

## Overlay plane sizes — shared across variations so dimensions stay in
## sync when we swap shaders.
const SKY_DOME_RADIUS: float = 8.5
const GROUND_SIZE: float = 10.0
const RAIN_SHEET_HEIGHT: float = 5.0

var variation_id: String = "rain_storm"
var entity: Dictionary = {}

var _time_seed: float = 0.0
var _snow_depth_t: float = 0.0
var _last_gust_tick: int = -1
var _last_lightning_tick: int = -1

# Cached references so we can push uniforms every frame (TIME in-shader
# works too, but we still need to scrub `intensity` and `snow_depth`).
var _active_materials: Array[ShaderMaterial] = []
var _overlay_root: Node3D
var _ground_mesh: MeshInstance3D
var _ground_mat: ShaderMaterial
var _tree_leaves: MeshInstance3D
var _tree_leaves_mat: ShaderMaterial
var _grass_tufts: Array[Node3D] = []
var _grass_mats: Array[ShaderMaterial] = []
var _sky_dome: MeshInstance3D
var _sky_mat: ShaderMaterial
var _intensity: float = 0.7


## Entry point — lab_preview_factory dispatches here with the picked
## variation record.
func setup(e: Dictionary, _state: String) -> void:
	entity = e
	variation_id = String(e.get("id", "rain_storm"))
	_build_diorama()
	_apply_variation(variation_id)


## Called by lab.gd once per frame. Some uniforms (TIME) are read
## in-shader; others (snow depth ramp, intensity, discrete event triggers)
## are pushed here.
func animate(_anim: String, t: float, dt: float) -> void:
	_time_seed = t
	# Snow depth ramps 0→0.4 over 4 seconds on preview start, then holds.
	if variation_id == "snow":
		_snow_depth_t = clamp(t / 4.0, 0.0, 1.0) * 0.4
		if _ground_mat:
			_ground_mat.set_shader_parameter("snow_depth", _snow_depth_t)
		for m in _active_materials:
			m.set_shader_parameter("snow_depth", _snow_depth_t)
	# Wind gust event log — once every ~3 s on the wind variation.
	if variation_id == "wind_gusts":
		var tick: int = int(t / 3.0)
		if tick != _last_gust_tick:
			_last_gust_tick = tick
			if tick > 0:
				GameLog.info("weather gust tick=%d" % tick, "lab_weather")
	# Lightning pulse — 1-frame flash roughly every 4 s.
	if variation_id == "lightning":
		var l_tick: int = int(t / 4.0)
		if l_tick != _last_lightning_tick:
			_last_lightning_tick = l_tick
			if l_tick > 0 and _sky_mat:
				_sky_mat.set_shader_parameter("flash_phase", t)
				GameLog.info("lightning strike tick=%d" % l_tick, "lab_weather")
	# Minor vertex-wind parameter — tree / grass vertex shader reads TIME,
	# but we push intensity every frame so slider feels live.
	_push_intensity()
	# Drought plant droop — lerp leaves down over first 2 s.
	if variation_id == "drought" and _tree_leaves:
		var droop: float = clamp(t / 2.0, 0.0, 1.0) * 0.08
		_tree_leaves.position.y = 3.2 - droop
	# keep dt referenced (quietens unused warn).
	if dt < 0.0:
		return


## Public — intensity slider entry point. Clamped; pushed into every
## active material next frame via `_push_intensity`.
func set_intensity(value: float) -> void:
	_intensity = clamp(value, 0.0, 1.0)
	_push_intensity()


func _push_intensity() -> void:
	for m in _active_materials:
		m.set_shader_parameter("intensity", _intensity)


## Diorama --------------------------------------------------------------

func _build_diorama() -> void:
	# Grass pad (cel-shaded). This mesh also accepts the snow-accumulation
	# shader swap for the snow variation (we replace its material_override
	# in `_apply_variation`).
	var ground_plane: PlaneMesh = PlaneMesh.new()
	ground_plane.size = Vector2(GROUND_SIZE, GROUND_SIZE)
	ground_plane.subdivide_width = 12
	ground_plane.subdivide_depth = 12
	_ground_mesh = MeshInstance3D.new()
	_ground_mesh.mesh = ground_plane
	_ground_mesh.position = Vector3(0.0, 0.0, 0.0)
	_ground_mesh.material_override = _cel_material(Color(0.52, 0.68, 0.38))
	add_child(_ground_mesh)

	# Tree — trunk + leaves. Leaves are its own MeshInstance so the drought
	# variation can lower them and the wind variation can sway them via a
	# vertex-shader material swap.
	var trunk: MeshInstance3D = _cylinder(
		Vector3(0.0, 1.25, 0.0), 0.22, 0.32, 2.5, Color(0.42, 0.28, 0.18)
	)
	add_child(trunk)
	_tree_leaves = _sphere(Vector3(0.0, 3.2, 0.0), 1.25, Color(0.34, 0.56, 0.30))
	add_child(_tree_leaves)
	# Second canopy puff for volume.
	add_child(_sphere(Vector3(0.55, 2.85, 0.20), 0.85, Color(0.38, 0.58, 0.32)))
	add_child(_sphere(Vector3(-0.55, 2.85, -0.20), 0.85, Color(0.32, 0.54, 0.30)))

	# Grass tufts — 5 small clusters around the tree. Each tuft is its own
	# Node3D so the wind variation can hand it a vertex-animated material.
	var tuft_positions: Array[Vector3] = [
		Vector3(2.4, 0.0, 1.7),
		Vector3(-2.6, 0.0, 1.4),
		Vector3(-1.8, 0.0, -2.3),
		Vector3(2.1, 0.0, -1.9),
		Vector3(0.2, 0.0, 3.2),
	]
	for p in tuft_positions:
		var tuft: Node3D = _build_grass_tuft(p)
		add_child(tuft)
		_grass_tufts.append(tuft)

	# Rock — constant.
	var rock: MeshInstance3D = _sphere(Vector3(3.0, 0.22, -0.6), 0.45, Color(0.56, 0.54, 0.50))
	rock.scale = Vector3(1.3, 0.55, 1.0)
	add_child(rock)

	# Overlay root — all weather effect geometry lives here so we can wipe
	# it on variation changes without disturbing the diorama.
	_overlay_root = Node3D.new()
	_overlay_root.name = "Overlay"
	add_child(_overlay_root)

	# Sky dome — large inside-out sphere for fog/aurora tints. Off by
	# default; variations opt in by setting visible=true.
	var sky_mesh: SphereMesh = SphereMesh.new()
	sky_mesh.radius = SKY_DOME_RADIUS
	sky_mesh.height = SKY_DOME_RADIUS * 2.0
	sky_mesh.radial_segments = 24
	sky_mesh.rings = 12
	_sky_dome = MeshInstance3D.new()
	_sky_dome.mesh = sky_mesh
	_sky_dome.position = Vector3.ZERO
	_sky_dome.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_sky_dome.visible = false
	add_child(_sky_dome)


func _build_grass_tuft(pos: Vector3) -> Node3D:
	var root: Node3D = Node3D.new()
	root.position = pos
	for i in range(6):
		var ang: float = float(i) * TAU / 6.0 + 0.3
		var blade: MeshInstance3D = _cube(
			Vector3(cos(ang) * 0.05, 0.25, sin(ang) * 0.05),
			Vector3(0.035, 0.5, 0.035),
			Color(0.44, 0.64, 0.30)
		)
		blade.rotation.z = sin(ang) * 0.22
		blade.rotation.x = cos(ang) * 0.22
		root.add_child(blade)
	return root


## Variation dispatch ---------------------------------------------------

func _apply_variation(id: String) -> void:
	_active_materials.clear()
	# Wipe any existing overlay geometry before composing.
	for child in _overlay_root.get_children():
		child.queue_free()
	_sky_dome.visible = false
	# Default ground / foliage materials (cel-shaded) — variations may swap.
	_ground_mat = _cel_material(Color(0.52, 0.68, 0.38))
	_ground_mesh.material_override = _ground_mat
	_tree_leaves.position.y = 3.2
	_tree_leaves_mat = _cel_material(Color(0.34, 0.56, 0.30))
	_tree_leaves.material_override = _tree_leaves_mat
	_reset_grass_materials()

	match id:
		"rain_storm": _apply_rain(1.0, Color(0.30, 0.34, 0.42, 0.60))
		"gentle_rain": _apply_rain(0.45, Color(0.66, 0.72, 0.80, 0.45))
		"morning_fog": _apply_fog()
		"wind_gusts": _apply_wind()
		"snow": _apply_snow()
		"drought": _apply_drought()
		"lightning": _apply_lightning()
		"aurora": _apply_aurora()
		_: _apply_rain(1.0, Color(0.30, 0.34, 0.42, 0.60))

	_push_intensity()


func _reset_grass_materials() -> void:
	_grass_mats.clear()
	for tuft in _grass_tufts:
		for blade in tuft.get_children():
			if blade is MeshInstance3D:
				var mi: MeshInstance3D = blade
				mi.material_override = _cel_material(Color(0.44, 0.64, 0.30))


## Effect 1 / 2 — Rain. Screen-facing vertical streak sheet in front of
## the camera + tinted sky dome to darken scene + ground splash rings.
func _apply_rain(base_intensity: float, sky_tint: Color) -> void:
	var sheet_mesh: PlaneMesh = PlaneMesh.new()
	sheet_mesh.size = Vector2(GROUND_SIZE * 1.2, RAIN_SHEET_HEIGHT)
	var sheet: MeshInstance3D = MeshInstance3D.new()
	sheet.mesh = sheet_mesh
	# Rotate plane upright and face camera orbit (camera orbits around Y).
	sheet.rotation = Vector3(PI * 0.5, 0.0, 0.0)
	sheet.position = Vector3(0.0, RAIN_SHEET_HEIGHT * 0.5 + 0.2, 0.0)
	sheet.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var rain_mat: ShaderMaterial = _rain_material(base_intensity)
	sheet.material_override = rain_mat
	_overlay_root.add_child(sheet)
	# A second rotated sheet so rain is visible from any camera azimuth.
	var sheet2: MeshInstance3D = MeshInstance3D.new()
	sheet2.mesh = sheet_mesh
	sheet2.rotation = Vector3(PI * 0.5, PI * 0.5, 0.0)
	sheet2.position = Vector3(0.0, RAIN_SHEET_HEIGHT * 0.5 + 0.2, 0.0)
	sheet2.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	sheet2.material_override = rain_mat
	_overlay_root.add_child(sheet2)
	# Ground splash ring overlay — thin quad just above the ground.
	var splash_mesh: PlaneMesh = PlaneMesh.new()
	splash_mesh.size = Vector2(GROUND_SIZE, GROUND_SIZE)
	var splash: MeshInstance3D = MeshInstance3D.new()
	splash.mesh = splash_mesh
	splash.position = Vector3(0.0, 0.015, 0.0)
	splash.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var splash_mat: ShaderMaterial = _rain_splash_material(base_intensity)
	splash.material_override = splash_mat
	_overlay_root.add_child(splash)
	# Sky tint dome.
	_sky_dome.visible = true
	_sky_mat = _sky_tint_material(sky_tint)
	_sky_dome.material_override = _sky_mat
	_active_materials.append(rain_mat)
	_active_materials.append(splash_mat)
	_active_materials.append(_sky_mat)


func _rain_material(base_intensity: float) -> ShaderMaterial:
	var mat: ShaderMaterial = ShaderMaterial.new()
	var sh: Shader = Shader.new()
	sh.code = """
shader_type spatial;
render_mode blend_add, depth_draw_never, cull_disabled, unshaded;

uniform float intensity : hint_range(0.0, 1.0) = 0.8;
uniform float base_intensity : hint_range(0.0, 1.0) = 1.0;
uniform vec4 streak_color : source_color = vec4(0.78, 0.88, 1.0, 1.0);

float hash21(vec2 p) {
	p = fract(p * vec2(233.37, 157.17));
	p += dot(p, p + 31.19);
	return fract(p.x * p.y);
}

void fragment() {
	// Streaks: tile UV horizontally into many thin columns and drop
	// each column at its own speed so we get a plausible rain sheet.
	float columns = 80.0;
	vec2 uv = UV;
	float col_id = floor(uv.x * columns);
	float col_u = fract(uv.x * columns);
	float speed = 1.2 + hash21(vec2(col_id, 3.0)) * 1.6;
	float phase = hash21(vec2(col_id, 7.0));
	float v = fract(uv.y * 3.0 - TIME * speed - phase * 4.0);
	// Narrow streak profile — brighter in the middle of each column.
	float streak = smoothstep(0.45, 0.55, 1.0 - abs(col_u - 0.5) * 2.0);
	// Short streak body: visible only for the first ~30 % of each cycle.
	float body = smoothstep(0.65, 0.35, v);
	// Random drop-out so not every column is raining.
	float alive = step(0.25, hash21(vec2(col_id, floor(TIME * speed + phase))));
	float a = streak * body * alive * intensity * base_intensity;
	ALBEDO = streak_color.rgb;
	ALPHA = a;
}
"""
	mat.shader = sh
	mat.set_shader_parameter("base_intensity", base_intensity)
	mat.set_shader_parameter("intensity", _intensity)
	return mat


func _rain_splash_material(base_intensity: float) -> ShaderMaterial:
	var mat: ShaderMaterial = ShaderMaterial.new()
	var sh: Shader = Shader.new()
	sh.code = """
shader_type spatial;
render_mode blend_add, depth_draw_never, cull_disabled, unshaded;

uniform float intensity : hint_range(0.0, 1.0) = 0.8;
uniform float base_intensity : hint_range(0.0, 1.0) = 1.0;
uniform vec4 ring_color : source_color = vec4(0.72, 0.82, 0.95, 1.0);

float hash21(vec2 p) {
	p = fract(p * vec2(91.23, 217.41));
	p += dot(p, p + 11.77);
	return fract(p.x * p.y);
}

void fragment() {
	// Tile ground plane into cells — each cell spawns one ring, sized and
	// phased by its cell hash. Cells cycle at different rates.
	vec2 cell_uv = UV * 16.0;
	vec2 cell_id = floor(cell_uv);
	vec2 gv = fract(cell_uv) - 0.5;
	float r1 = hash21(cell_id);
	float r2 = hash21(cell_id + vec2(13.0, 7.0));
	float period = 1.0 + r2 * 1.5;
	float phase = fract(TIME / period + r1);
	// Ring radius grows linearly with phase; brightness decays.
	float radius = phase * 0.45;
	float ring = smoothstep(0.02, 0.0, abs(length(gv) - radius)) * (1.0 - phase);
	// Random drop-out (spatial density scales with intensity).
	float alive = step(1.0 - intensity * base_intensity, r1);
	ALBEDO = ring_color.rgb;
	ALPHA = ring * alive * 0.85;
}
"""
	mat.shader = sh
	mat.set_shader_parameter("base_intensity", base_intensity)
	mat.set_shader_parameter("intensity", _intensity)
	return mat


## Effect 3 — Morning fog. Sky dome tinted dawn-cream plus low-lying
## volumetric-fake fog via a stacked set of horizontal quads with noise.
func _apply_fog() -> void:
	_sky_dome.visible = true
	_sky_mat = _sky_tint_material(Color(0.85, 0.82, 0.75, 0.80))
	_sky_dome.material_override = _sky_mat
	# Three stacked fog layers at ~0.4, 0.8, 1.2 m so the bank hugs the
	# ground and thins out with height.
	var fog_mat: ShaderMaterial = _fog_material()
	for i in range(3):
		var layer_mesh: PlaneMesh = PlaneMesh.new()
		layer_mesh.size = Vector2(GROUND_SIZE * 1.4, GROUND_SIZE * 1.4)
		var layer: MeshInstance3D = MeshInstance3D.new()
		layer.mesh = layer_mesh
		layer.position = Vector3(0.0, 0.4 + float(i) * 0.4, 0.0)
		layer.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		layer.material_override = fog_mat
		_overlay_root.add_child(layer)
	_active_materials.append(fog_mat)
	_active_materials.append(_sky_mat)


func _fog_material() -> ShaderMaterial:
	var mat: ShaderMaterial = ShaderMaterial.new()
	var sh: Shader = Shader.new()
	sh.code = """
shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_disabled, unshaded;

uniform float intensity : hint_range(0.0, 1.0) = 0.8;
uniform vec4 fog_color : source_color = vec4(0.92, 0.90, 0.85, 0.55);

float hash21(vec2 p) {
	p = fract(p * vec2(127.1, 311.7));
	p += dot(p, p + 17.17);
	return fract(p.x * p.y);
}

float value_noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	float a = hash21(i);
	float b = hash21(i + vec2(1.0, 0.0));
	float c = hash21(i + vec2(0.0, 1.0));
	float d = hash21(i + vec2(1.0, 1.0));
	return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void fragment() {
	vec2 uv = UV * 4.0 + vec2(TIME * 0.04, TIME * 0.02);
	float n = value_noise(uv) * 0.6 + value_noise(uv * 2.3) * 0.4;
	// Taper alpha toward the edge so the layer reads as drifting fog.
	float edge = smoothstep(0.0, 0.25, UV.x) * smoothstep(1.0, 0.75, UV.x)
		* smoothstep(0.0, 0.25, UV.y) * smoothstep(1.0, 0.75, UV.y);
	float a = n * edge * intensity * fog_color.a;
	ALBEDO = fog_color.rgb;
	ALPHA = a;
}
"""
	mat.shader = sh
	mat.set_shader_parameter("intensity", _intensity)
	return mat


## Effect 4 — Wind gusts. Vertex displacement on grass + leaves plus
## horizontally-scrolling leaf particles.
func _apply_wind() -> void:
	# Replace tree-leaves material with a vertex-wind one.
	_tree_leaves_mat = _wind_foliage_material(Color(0.34, 0.56, 0.30), 0.08)
	_tree_leaves.material_override = _tree_leaves_mat
	_active_materials.append(_tree_leaves_mat)
	# Replace grass blade materials with a wind-wobble version.
	for tuft in _grass_tufts:
		for blade in tuft.get_children():
			if blade is MeshInstance3D:
				var grass_mat: ShaderMaterial = _wind_foliage_material(Color(0.44, 0.64, 0.30), 0.25)
				blade.material_override = grass_mat
				_grass_mats.append(grass_mat)
				_active_materials.append(grass_mat)
	# Leaf-flutter particle sheet — a flat quad facing up, alpha tested so
	# little leaf-shaped specks stream across. Cheap on Compatibility.
	var leaves_mesh: PlaneMesh = PlaneMesh.new()
	leaves_mesh.size = Vector2(GROUND_SIZE * 1.3, 4.0)
	var leaves_a: MeshInstance3D = MeshInstance3D.new()
	leaves_a.mesh = leaves_mesh
	leaves_a.rotation = Vector3(PI * 0.5, 0.0, 0.0)
	leaves_a.position = Vector3(0.0, 2.2, 0.0)
	leaves_a.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var leaf_mat: ShaderMaterial = _leaf_flutter_material()
	leaves_a.material_override = leaf_mat
	_overlay_root.add_child(leaves_a)
	var leaves_b: MeshInstance3D = MeshInstance3D.new()
	leaves_b.mesh = leaves_mesh
	leaves_b.rotation = Vector3(PI * 0.5, PI * 0.5, 0.0)
	leaves_b.position = Vector3(0.0, 2.6, 0.0)
	leaves_b.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	leaves_b.material_override = leaf_mat
	_overlay_root.add_child(leaves_b)
	_active_materials.append(leaf_mat)


func _wind_foliage_material(color: Color, amplitude: float) -> ShaderMaterial:
	var mat: ShaderMaterial = ShaderMaterial.new()
	var sh: Shader = Shader.new()
	sh.code = """
shader_type spatial;
render_mode cull_back;

uniform vec4 foliage_color : source_color = vec4(0.4, 0.6, 0.3, 1.0);
uniform float intensity : hint_range(0.0, 1.0) = 0.7;
uniform float wind_amplitude : hint_range(0.0, 0.6) = 0.15;

void vertex() {
	// Per-vertex wind sway — bigger displacement on higher vertices.
	float height_factor = clamp(VERTEX.y + 0.5, 0.0, 1.5);
	float gust = sin(TIME * 2.3 + VERTEX.x * 0.8 + VERTEX.z * 0.6);
	float flutter = sin(TIME * 6.1 + VERTEX.y * 4.0) * 0.3;
	float sway = (gust + flutter) * wind_amplitude * height_factor * intensity;
	VERTEX.x += sway;
	VERTEX.z += sway * 0.4;
}

void fragment() {
	ALBEDO = foliage_color.rgb;
	ROUGHNESS = 0.8;
	METALLIC = 0.0;
}
"""
	mat.shader = sh
	mat.set_shader_parameter("foliage_color", Vector4(color.r, color.g, color.b, color.a))
	mat.set_shader_parameter("wind_amplitude", amplitude)
	mat.set_shader_parameter("intensity", _intensity)
	return mat


func _leaf_flutter_material() -> ShaderMaterial:
	var mat: ShaderMaterial = ShaderMaterial.new()
	var sh: Shader = Shader.new()
	sh.code = """
shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_disabled, unshaded;

uniform float intensity : hint_range(0.0, 1.0) = 0.8;
uniform vec4 leaf_color : source_color = vec4(0.76, 0.58, 0.24, 1.0);

float hash21(vec2 p) {
	p = fract(p * vec2(53.37, 101.41));
	p += dot(p, p + 23.33);
	return fract(p.x * p.y);
}

void fragment() {
	// Horizontal scroll — leaves stream along UV.x.
	vec2 uv = UV;
	uv.x += TIME * 0.35;
	// Cell grid with jitter for leaf placement.
	vec2 cell = floor(uv * vec2(24.0, 6.0));
	vec2 gv = fract(uv * vec2(24.0, 6.0)) - 0.5;
	float r = hash21(cell);
	// Each leaf is a small ellipse; rotate phase by cell hash.
	float theta = r * 6.28;
	vec2 rv = vec2(gv.x * cos(theta) - gv.y * sin(theta), gv.x * sin(theta) + gv.y * cos(theta));
	float d = length(rv * vec2(1.0, 2.5));
	float leaf = smoothstep(0.22, 0.12, d) * step(0.55, r);
	ALBEDO = leaf_color.rgb;
	ALPHA = leaf * intensity;
}
"""
	mat.shader = sh
	mat.set_shader_parameter("intensity", _intensity)
	return mat


## Effect 5 — Snow. Accumulation shader lerps ground albedo → white by
## snow_depth uniform; falling flake particles on a billboard sheet.
func _apply_snow() -> void:
	_ground_mat = _snow_ground_material()
	_ground_mesh.material_override = _ground_mat
	_active_materials.append(_ground_mat)
	# Falling flake sheets — two rotated quads so flakes are visible from
	# any camera azimuth.
	var flake_mesh: PlaneMesh = PlaneMesh.new()
	flake_mesh.size = Vector2(GROUND_SIZE * 1.2, 6.0)
	var flakes_mat: ShaderMaterial = _snowflake_material()
	var fa: MeshInstance3D = MeshInstance3D.new()
	fa.mesh = flake_mesh
	fa.rotation = Vector3(PI * 0.5, 0.0, 0.0)
	fa.position = Vector3(0.0, 3.0, 0.0)
	fa.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	fa.material_override = flakes_mat
	_overlay_root.add_child(fa)
	var fb: MeshInstance3D = MeshInstance3D.new()
	fb.mesh = flake_mesh
	fb.rotation = Vector3(PI * 0.5, PI * 0.5, 0.0)
	fb.position = Vector3(0.0, 3.0, 0.0)
	fb.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	fb.material_override = flakes_mat
	_overlay_root.add_child(fb)
	_active_materials.append(flakes_mat)
	# Cool-grey sky.
	_sky_dome.visible = true
	_sky_mat = _sky_tint_material(Color(0.80, 0.82, 0.88, 0.55))
	_sky_dome.material_override = _sky_mat
	_active_materials.append(_sky_mat)


func _snow_ground_material() -> ShaderMaterial:
	var mat: ShaderMaterial = ShaderMaterial.new()
	var sh: Shader = Shader.new()
	sh.code = """
shader_type spatial;
render_mode cull_back;

uniform vec4 base_color : source_color = vec4(0.52, 0.68, 0.38, 1.0);
uniform vec4 snow_color : source_color = vec4(0.96, 0.98, 1.0, 1.0);
uniform float snow_depth : hint_range(0.0, 1.0) = 0.0;
uniform float intensity : hint_range(0.0, 1.0) = 0.8;

float hash21(vec2 p) {
	p = fract(p * vec2(127.1, 311.7));
	p += dot(p, p + 17.17);
	return fract(p.x * p.y);
}

void fragment() {
	// Snow accumulates preferentially in low-frequency noise peaks so
	// patches form before the ground goes fully white.
	float n = hash21(floor(UV * 32.0));
	float depth = clamp(snow_depth * intensity * 2.4, 0.0, 1.0);
	float mask = smoothstep(n - 0.05, n + 0.05, depth);
	vec3 col = mix(base_color.rgb, snow_color.rgb, mask);
	ALBEDO = col;
	ROUGHNESS = mix(0.85, 0.35, mask);
	METALLIC = 0.0;
}
"""
	mat.shader = sh
	mat.set_shader_parameter("snow_depth", _snow_depth_t)
	mat.set_shader_parameter("intensity", _intensity)
	return mat


func _snowflake_material() -> ShaderMaterial:
	var mat: ShaderMaterial = ShaderMaterial.new()
	var sh: Shader = Shader.new()
	sh.code = """
shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_disabled, unshaded;

uniform float intensity : hint_range(0.0, 1.0) = 0.8;
uniform vec4 flake_color : source_color = vec4(1.0, 1.0, 1.0, 1.0);

float hash21(vec2 p) {
	p = fract(p * vec2(91.23, 217.41));
	p += dot(p, p + 11.77);
	return fract(p.x * p.y);
}

void fragment() {
	vec2 uv = UV;
	// Slight horizontal drift so flakes read like they're carried on wind.
	uv.x += TIME * 0.04;
	uv.y -= TIME * 0.16;
	vec2 cell = floor(uv * vec2(40.0, 20.0));
	vec2 gv = fract(uv * vec2(40.0, 20.0)) - 0.5;
	float r = hash21(cell);
	// Per-flake drift so not every flake falls at identical rate.
	gv.x += sin(TIME * (1.0 + r * 2.0) + r * 6.0) * 0.2;
	float d = length(gv);
	float flake = smoothstep(0.14, 0.06, d) * step(0.55, r);
	ALBEDO = flake_color.rgb;
	ALPHA = flake * intensity;
}
"""
	mat.shader = sh
	mat.set_shader_parameter("intensity", _intensity)
	return mat


## Effect 6 — Drought heat shimmer. Thin quad just above ground with a UV
## refraction-style distortion, plus yellow-brown sky tint, plus tree
## leaves drooping (handled in animate()).
func _apply_drought() -> void:
	# Brown-tinted ground.
	_ground_mat = _cel_material(Color(0.72, 0.58, 0.32))
	_ground_mesh.material_override = _ground_mat
	# Yellowed, wilted tree leaves.
	_tree_leaves_mat = _cel_material(Color(0.58, 0.56, 0.24))
	_tree_leaves.material_override = _tree_leaves_mat
	# Heat-shimmer quad above ground.
	var shimmer_mesh: PlaneMesh = PlaneMesh.new()
	shimmer_mesh.size = Vector2(GROUND_SIZE, GROUND_SIZE)
	var shimmer: MeshInstance3D = MeshInstance3D.new()
	shimmer.mesh = shimmer_mesh
	shimmer.position = Vector3(0.0, 0.35, 0.0)
	shimmer.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var shimmer_mat: ShaderMaterial = _heat_shimmer_material()
	shimmer.material_override = shimmer_mat
	_overlay_root.add_child(shimmer)
	# Sky — hazy hot.
	_sky_dome.visible = true
	_sky_mat = _sky_tint_material(Color(0.92, 0.82, 0.55, 0.55))
	_sky_dome.material_override = _sky_mat
	_active_materials.append(shimmer_mat)
	_active_materials.append(_sky_mat)


func _heat_shimmer_material() -> ShaderMaterial:
	var mat: ShaderMaterial = ShaderMaterial.new()
	var sh: Shader = Shader.new()
	sh.code = """
shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_disabled, unshaded;

uniform float intensity : hint_range(0.0, 1.0) = 0.8;
uniform vec4 shimmer_tint : source_color = vec4(0.95, 0.84, 0.52, 0.28);

void fragment() {
	// Fake refraction — sample a "world-space" distortion band and tint.
	float wave1 = sin(TIME * 3.0 + UV.x * 22.0 + UV.y * 9.0);
	float wave2 = sin(TIME * 1.8 - UV.x * 13.0 + UV.y * 17.0);
	float shimmer = (wave1 + wave2) * 0.5;
	// Narrow heat-band mask along the lower half of the quad so it reads
	// as rising heat off the ground.
	float band = smoothstep(0.45, 0.0, UV.y) * (0.5 + 0.5 * shimmer);
	ALBEDO = shimmer_tint.rgb;
	ALPHA = band * shimmer_tint.a * intensity;
}
"""
	mat.shader = sh
	mat.set_shader_parameter("intensity", _intensity)
	return mat


## Effect 7 — Lightning strike. Dark sky tint + beam-pillar volumetric
## fake + timed screen flash via sky alpha pulse.
func _apply_lightning() -> void:
	_sky_dome.visible = true
	_sky_mat = _lightning_sky_material()
	_sky_dome.material_override = _sky_mat
	# Vertical beam pillar — a thin tall box with unshaded additive shader.
	var beam_mesh: BoxMesh = BoxMesh.new()
	beam_mesh.size = Vector3(0.2, 5.0, 0.2)
	var beam: MeshInstance3D = MeshInstance3D.new()
	beam.mesh = beam_mesh
	beam.position = Vector3(1.8, 2.5, 0.6)
	beam.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var beam_mat: ShaderMaterial = _lightning_beam_material()
	beam.material_override = beam_mat
	_overlay_root.add_child(beam)
	_active_materials.append(beam_mat)
	_active_materials.append(_sky_mat)


func _lightning_sky_material() -> ShaderMaterial:
	var mat: ShaderMaterial = ShaderMaterial.new()
	var sh: Shader = Shader.new()
	sh.code = """
shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_front, unshaded;

uniform float intensity : hint_range(0.0, 1.0) = 0.8;
uniform vec4 sky_color : source_color = vec4(0.10, 0.12, 0.18, 0.80);
uniform vec4 flash_color : source_color = vec4(0.85, 0.88, 1.0, 1.0);
uniform float flash_phase = -10.0;

void fragment() {
	float dt = TIME - flash_phase;
	// 1-frame bright flash that decays over 0.3 s.
	float flash = clamp(1.0 - dt / 0.3, 0.0, 1.0);
	flash *= step(0.0, dt);
	vec3 col = mix(sky_color.rgb, flash_color.rgb, flash);
	ALBEDO = col;
	ALPHA = mix(sky_color.a, 1.0, flash) * intensity;
}
"""
	mat.shader = sh
	mat.set_shader_parameter("intensity", _intensity)
	return mat


func _lightning_beam_material() -> ShaderMaterial:
	var mat: ShaderMaterial = ShaderMaterial.new()
	var sh: Shader = Shader.new()
	sh.code = """
shader_type spatial;
render_mode blend_add, depth_draw_never, cull_disabled, unshaded;

uniform float intensity : hint_range(0.0, 1.0) = 0.8;
uniform vec4 beam_color : source_color = vec4(0.88, 0.92, 1.0, 1.0);

void fragment() {
	// Strike every 4 seconds; visible only during a 0.2 s window. Beam
	// has vertical jitter along V so it reads as a crooked bolt.
	float cycle = mod(TIME, 4.0);
	float alive = smoothstep(0.0, 0.05, cycle) * smoothstep(0.25, 0.05, cycle);
	float jitter = sin(UV.y * 48.0 + TIME * 30.0) * 0.5 + 0.5;
	float edge = smoothstep(0.0, 0.15, UV.x) * smoothstep(1.0, 0.85, UV.x);
	float core = edge * jitter * alive;
	ALBEDO = beam_color.rgb;
	ALPHA = core * intensity;
}
"""
	mat.shader = sh
	mat.set_shader_parameter("intensity", _intensity)
	return mat


## Effect 8 — Aurora. Sky dome with animated vertical colored curtains.
func _apply_aurora() -> void:
	_sky_dome.visible = true
	_sky_mat = _aurora_material()
	_sky_dome.material_override = _sky_mat
	_active_materials.append(_sky_mat)


func _aurora_material() -> ShaderMaterial:
	var mat: ShaderMaterial = ShaderMaterial.new()
	var sh: Shader = Shader.new()
	sh.code = """
shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_front, unshaded;

uniform float intensity : hint_range(0.0, 1.0) = 0.9;
uniform vec4 night_tint : source_color = vec4(0.04, 0.06, 0.12, 1.0);
uniform vec4 band_a : source_color = vec4(0.25, 0.95, 0.68, 1.0);
uniform vec4 band_b : source_color = vec4(0.45, 0.55, 0.95, 1.0);
uniform vec4 band_c : source_color = vec4(0.95, 0.52, 0.72, 1.0);

float hash21(vec2 p) {
	p = fract(p * vec2(127.1, 311.7));
	p += dot(p, p + 17.17);
	return fract(p.x * p.y);
}

float value_noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	float a = hash21(i);
	float b = hash21(i + vec2(1.0, 0.0));
	float c = hash21(i + vec2(0.0, 1.0));
	float d = hash21(i + vec2(1.0, 1.0));
	return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void fragment() {
	// Only paint the upper half of the dome so the horizon stays dark.
	float upper = smoothstep(0.45, 0.85, UV.y);
	// Vertical curtain pattern — noise varies in U, scroll in V.
	float noise = value_noise(vec2(UV.x * 8.0, UV.y * 2.0 + TIME * 0.15));
	float curtain = smoothstep(0.3, 0.9, noise);
	float wobble = sin(UV.x * 22.0 + TIME * 0.7) * 0.5 + 0.5;
	float curtain_line = curtain * wobble;
	// Three color bands stacked vertically in UV.y.
	vec3 col = mix(band_a.rgb, band_b.rgb, smoothstep(0.5, 0.75, UV.y));
	col = mix(col, band_c.rgb, smoothstep(0.75, 0.95, UV.y));
	vec3 sky = mix(night_tint.rgb, col, curtain_line * upper * intensity);
	ALBEDO = sky;
	ALPHA = 1.0;
}
"""
	mat.shader = sh
	mat.set_shader_parameter("intensity", _intensity)
	return mat


## Shared ---------------------------------------------------------------

func _sky_tint_material(tint: Color) -> ShaderMaterial:
	var mat: ShaderMaterial = ShaderMaterial.new()
	var sh: Shader = Shader.new()
	sh.code = """
shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_front, unshaded;

uniform float intensity : hint_range(0.0, 1.0) = 0.8;
uniform vec4 tint : source_color = vec4(0.7, 0.75, 0.82, 0.55);

void fragment() {
	// Fade from full tint at zenith to transparent at horizon so diorama
	// ground still reads.
	float vertical = smoothstep(0.35, 0.85, UV.y);
	ALBEDO = tint.rgb;
	ALPHA = tint.a * vertical * intensity;
}
"""
	mat.shader = sh
	mat.set_shader_parameter("tint", Vector4(tint.r, tint.g, tint.b, tint.a))
	mat.set_shader_parameter("intensity", _intensity)
	return mat


## Primitive helpers (match the factory style) --------------------------

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


func _cylinder(pos: Vector3, radius_top: float, radius_bot: float, height: float, color: Color) -> MeshInstance3D:
	var m: CylinderMesh = CylinderMesh.new()
	m.top_radius = radius_top
	m.bottom_radius = radius_bot
	m.height = height
	var mi: MeshInstance3D = MeshInstance3D.new()
	mi.mesh = m
	mi.material_override = _cel_material(color)
	mi.position = pos
	return mi
