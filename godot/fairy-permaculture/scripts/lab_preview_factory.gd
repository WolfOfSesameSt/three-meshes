## Fairy Permaculture — Lab Preview Factory.
##
## Static library that builds placeholder-primitive 3D previews for
## every kind of ecosystem entity. The lab hosts each preview inside
## its SubViewport; the preview exposes an `animate(name, t, dt)` hook
## that the lab calls each frame so the scrubbed animation plays live.
##
## Each kind → its own builder. Each builder composes scaled/coloured
## cubes/spheres/cylinders into a recognizable shape, attaches a cel-
## shaded ShaderMaterial, and wires up per-state colour/scale overrides.
##
## This is intentionally cheap and uniform; art will replace the
## primitives later via glTF imports, but data + animation scaffolds
## stay stable.
class_name LabPreviewFactory
extends Node


const TOON_SHADER_PATH := "res://shaders/toon.gdshader"


static func build(kind: String, entity: Dictionary, state: String) -> Node3D:
	match kind:
		"plant": return _plant(entity, state)
		"animal": return _animal(entity, state)
		"fungus": return _fungus(entity, state)
		"insect": return _insect(entity, state)
		"biome": return _biome(entity, state)
		"soil": return _soil_tier(entity, state)
		"shader": return _shader_demo(entity, state)
		"weather": return _weather(entity, state)
		"water": return _water(entity, state)
		"earthwork": return _earthwork(entity, state)
		_: return _placeholder_cube()


## Helpers --------------------------------------------------------------

static func _cel_material(color: Color) -> ShaderMaterial:
	var mat: ShaderMaterial = ShaderMaterial.new()
	var sh: Shader = load(TOON_SHADER_PATH)
	if sh:
		mat.shader = sh
		mat.set_shader_parameter("albedo_color", Vector4(color.r, color.g, color.b, color.a))
		mat.set_shader_parameter("shadow_darkness", 0.35)
		mat.set_shader_parameter("rim_strength", 0.15)
	return mat


static func _std_material(color: Color) -> StandardMaterial3D:
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.albedo_color = color
	return mat


static func _cube(pos: Vector3, size: Vector3, color: Color) -> MeshInstance3D:
	var m: BoxMesh = BoxMesh.new()
	m.size = size
	var mi: MeshInstance3D = MeshInstance3D.new()
	mi.mesh = m
	mi.material_override = _cel_material(color)
	mi.position = pos
	return mi


static func _sphere(pos: Vector3, radius: float, color: Color) -> MeshInstance3D:
	var m: SphereMesh = SphereMesh.new()
	m.radius = radius
	m.height = radius * 2.0
	var mi: MeshInstance3D = MeshInstance3D.new()
	mi.mesh = m
	mi.material_override = _cel_material(color)
	mi.position = pos
	return mi


static func _cylinder(pos: Vector3, radius_top: float, radius_bot: float, height: float, color: Color) -> MeshInstance3D:
	var m: CylinderMesh = CylinderMesh.new()
	m.top_radius = radius_top
	m.bottom_radius = radius_bot
	m.height = height
	var mi: MeshInstance3D = MeshInstance3D.new()
	mi.mesh = m
	mi.material_override = _cel_material(color)
	mi.position = pos
	return mi


static func _placeholder_cube() -> Node3D:
	var root: Node3D = Node3D.new()
	root.add_child(_cube(Vector3(0, 0.5, 0), Vector3.ONE, Color(0.7, 0.7, 0.7)))
	return root


## Plants ---------------------------------------------------------------
## Each plant is a small composed mesh keyed off its `category`.
## Per-state scale/colour overrides drive the life-cycle scrub.

static func _plant(entity: Dictionary, state: String) -> Node3D:
	var category: String = entity.get("category", "herbaceous")
	var script: Script = load("res://scripts/lab_previews/plant_preview.gd")
	var preview: Node3D = Node3D.new()
	preview.set_script(script)
	preview.call("setup", entity, state, category)
	return preview


## Animals --------------------------------------------------------------

static func _animal(entity: Dictionary, state: String) -> Node3D:
	var category: String = entity.get("category", "poultry")
	var script: Script = load("res://scripts/lab_previews/animal_preview.gd")
	var preview: Node3D = Node3D.new()
	preview.set_script(script)
	preview.call("setup", entity, state, category)
	return preview


## Fungi ----------------------------------------------------------------

static func _fungus(entity: Dictionary, state: String) -> Node3D:
	var script: Script = load("res://scripts/lab_previews/fungus_preview.gd")
	var preview: Node3D = Node3D.new()
	preview.set_script(script)
	preview.call("setup", entity, state)
	return preview


## Insects --------------------------------------------------------------

static func _insect(entity: Dictionary, state: String) -> Node3D:
	var script: Script = load("res://scripts/lab_previews/insect_preview.gd")
	var preview: Node3D = Node3D.new()
	preview.set_script(script)
	preview.call("setup", entity, state)
	return preview


## Biome ----------------------------------------------------------------

static func _biome(entity: Dictionary, _state: String) -> Node3D:
	var root: Node3D = Node3D.new()
	var palette: Dictionary = entity.get("ambient_palette", {})
	var ground_color: Color = Color(0.55, 0.70, 0.40)
	# Guess a ground tint from the palette "mood".
	match String(palette.get("mood", "")):
		"misty-rich-green": ground_color = Color(0.42, 0.62, 0.38)
		"cold-clear-pine": ground_color = Color(0.74, 0.80, 0.82)
		"lush-hot-humid": ground_color = Color(0.32, 0.58, 0.34)
		"wide-dry-bright": ground_color = Color(0.68, 0.68, 0.44)
	root.add_child(_cube(Vector3(0, -0.2, 0), Vector3(14, 0.4, 14), ground_color))
	# A single representative tree + a boulder + a stream shimmer.
	var trunk_color := Color(0.40, 0.27, 0.18)
	var canopy_color := Color(0.30, 0.50, 0.28)
	root.add_child(_cylinder(Vector3(-2.5, 1.2, -1.5), 0.25, 0.35, 2.4, trunk_color))
	root.add_child(_sphere(Vector3(-2.5, 3.0, -1.5), 1.4, canopy_color))
	root.add_child(_sphere(Vector3(2.6, 0.2, 1.5), 0.8, Color(0.65, 0.65, 0.65)))
	var stream: MeshInstance3D = _cube(Vector3(0.0, 0.02, 3.2), Vector3(10, 0.05, 1.5), Color(0.35, 0.55, 0.75))
	root.add_child(stream)
	return root


## Soil tier swatches ---------------------------------------------------

static func _soil_tier(entity: Dictionary, state: String) -> Node3D:
	var root: Node3D = Node3D.new()
	var id: String = String(entity.get("id", "barren"))
	var wet: bool = state == "wet"
	var color: Color = Color(0.50, 0.40, 0.30)
	match id:
		"barren": color = Color(0.62, 0.54, 0.43)
		"poor": color = Color(0.56, 0.48, 0.36)
		"developing": color = Color(0.42, 0.36, 0.24)
		"rich": color = Color(0.30, 0.24, 0.16)
		"abundant": color = Color(0.22, 0.17, 0.10)
		"climax": color = Color(0.14, 0.10, 0.06)
	if wet:
		color = color.darkened(0.15)
	root.add_child(_cube(Vector3(0, -0.1, 0), Vector3(5, 0.6, 5), color))
	# Stacked growth swatches showing what tiers this soil supports.
	var tier_order: Array = ["barren", "poor", "developing", "rich", "abundant", "climax"]
	var my_idx: int = tier_order.find(id)
	for i in range(tier_order.size()):
		var height: float = 0.2 + 0.5 * float(i)
		var lit: bool = i <= my_idx
		var swatch_color: Color = (Color(0.55, 0.77, 0.48) if lit else Color(0.35, 0.35, 0.35))
		root.add_child(_cube(
			Vector3(-2.2 + 0.9 * float(i), 0.2 + height * 0.5, 2.6),
			Vector3(0.6, height, 0.4),
			swatch_color
		))
	return root


## Shader demo ----------------------------------------------------------

static func _shader_demo(entity: Dictionary, _state: String) -> Node3D:
	var root: Node3D = Node3D.new()
	# Showcase the toon shader on different primitives with 3 tints.
	root.add_child(_sphere(Vector3(-2, 1.0, 0), 0.9, Color(0.95, 0.56, 0.46)))
	root.add_child(_sphere(Vector3(0, 1.0, 0), 0.9, Color(0.55, 0.77, 0.48)))
	root.add_child(_sphere(Vector3(2, 1.0, 0), 0.9, Color(0.95, 0.76, 0.31)))
	root.add_child(_cylinder(Vector3(-2, 2.6, 0), 0.1, 0.1, 2.0, Color(0.23, 0.16, 0.08)))
	root.add_child(_cube(Vector3(0, 2.6, 0), Vector3(0.8, 0.8, 0.8), Color(0.63, 0.47, 0.71)))
	# Ground pad to sit on.
	root.add_child(_cube(Vector3(0, -0.2, 0), Vector3(8, 0.4, 6), Color(0.60, 0.72, 0.48)))
	return root


## Water showcase -------------------------------------------------------

static func _water(entity: Dictionary, state: String) -> Node3D:
	var script: Script = load("res://scripts/lab_previews/water_preview.gd")
	var preview: Node3D = Node3D.new()
	preview.set_script(script)
	preview.call("setup", entity, state)
	return preview


## Earthworks -----------------------------------------------------------
## Swale showcase: a tilted slope with TWO variants side-by-side so we
## can iterate the design against a live comparison. On the left, the
## current shipping geometry (two axis-aligned boxes + 14 grass-blade
## cubes) — which Ian flagged as "poorly designed, I don't know what
## I'm looking at." On the right, a proposed redesign: a curved on-
## contour strip, a clearly-taller planted berm with a small fruit-tree
## + companion-ring, and a visibly pooling water surface that reads at
## first glance as "this trench holds rain."

static func _earthwork(_entity: Dictionary, state: String) -> Node3D:
	var root: Node3D = Node3D.new()
	var wet: bool = state == "wet" or state == "finished"
	# Tilted slope (~10°) so "on-contour" actually reads. We group the
	# whole tilted set into a `slope` child so both variants tilt together.
	var slope: Node3D = Node3D.new()
	slope.rotation.z = deg_to_rad(10.0)
	root.add_child(slope)
	var ground_color: Color = Color(0.58, 0.70, 0.46)
	slope.add_child(_cube(Vector3(0, -0.35, 0), Vector3(14, 0.7, 10), ground_color))

	# --- LEFT: current shipping swale (replicates swale_site.gd output) ---
	var left: Node3D = Node3D.new()
	left.position = Vector3(-3.5, 0, 0)
	slope.add_child(left)
	_build_current_swale(left, wet)
	# Floating label: "CURRENT"
	slope.add_child(_floating_label(Vector3(-3.5, 3.0, 0), "CURRENT", Color(0.75, 0.30, 0.22)))

	# --- RIGHT: proposed redesign ---
	var right: Node3D = Node3D.new()
	right.position = Vector3(3.5, 0, 0)
	slope.add_child(right)
	_build_proposed_swale(right, wet)
	slope.add_child(_floating_label(Vector3(3.5, 3.0, 0), "PROPOSED", Color(0.35, 0.58, 0.32)))

	# Arrow-style divider so the A/B comparison reads clearly.
	slope.add_child(_cube(Vector3(0, 0.5, -0.1), Vector3(0.05, 1.0, 8), Color(0.93, 0.86, 0.66)))

	return root


static func _build_current_swale(parent: Node3D, wet: bool) -> void:
	# Matches `swale_site.gd._spawn_final_visual`: flat axis-aligned
	# trench box + flat axis-aligned berm box + 14 thin green "grass"
	# cubes on top. No curve, no visible water until rain.
	var earth := Color(0.48, 0.36, 0.28)
	var compost := Color(0.24, 0.18, 0.14)
	var meadow := Color(0.55, 0.77, 0.48)
	var trench_color := earth.lerp(compost, 0.4)
	# Trench — 3m long × 0.9m wide × 0.3m deep, sunk.
	var trench: MeshInstance3D = _cube(Vector3(0, -0.15, 0.5), Vector3(3.0, 0.3, 0.9), trench_color)
	parent.add_child(trench)
	# Berm — 3m long × 1.0m wide × 0.4m tall, pushed downhill (+Z).
	var berm: MeshInstance3D = _cube(Vector3(0, 0.20, 1.8), Vector3(3.0, 0.4, 1.0), earth)
	parent.add_child(berm)
	# 14 thin grass-blade boxes on top.
	for i in range(14):
		var x: float = (float(i) - 6.5) * (3.0 / 14.0)
		var z: float = ((i * 37) % 9 - 4) * 0.05
		parent.add_child(_cube(Vector3(x, 0.52, 1.8 + z), Vector3(0.05, 0.22, 0.05), meadow))
	# Water plane — alpha 0.05 (dry) default; bumped to 0.55 if wet.
	var water_plane: MeshInstance3D = MeshInstance3D.new()
	var qm: QuadMesh = QuadMesh.new()
	qm.size = Vector2(2.9, 0.85)
	water_plane.mesh = qm
	var wm: StandardMaterial3D = StandardMaterial3D.new()
	var a: float = 0.55 if wet else 0.05
	wm.albedo_color = Color(0.72, 0.85, 0.91, a)
	wm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	wm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	water_plane.material_override = wm
	water_plane.rotation.x = -PI * 0.5
	water_plane.position = Vector3(0, 0.01, 0.5)
	parent.add_child(water_plane)


static func _build_proposed_swale(parent: Node3D, wet: bool) -> void:
	# The redesign lever: the swale is a CURVED on-contour line (not an
	# axis-aligned box). The berm is clearly taller AND planted — a small
	# fruit-tree marker + a companion guild ring. The trench pools visible
	# water even in the dry state (just lower alpha) so the player sees
	# "this earthwork holds water" at a glance.
	var earth := Color(0.48, 0.36, 0.28)
	var compost := Color(0.24, 0.18, 0.14)
	var meadow := Color(0.55, 0.77, 0.48)
	var trench_color: Color = earth.lerp(compost, 0.4)
	var trunk := Color(0.36, 0.24, 0.14)
	var canopy := Color(0.32, 0.56, 0.30)
	var honey := Color(0.95, 0.76, 0.31)
	var coral := Color(0.95, 0.56, 0.46)
	var berry := Color(0.63, 0.47, 0.71)

	# Curved trench — 7 short segments rotated progressively so the line
	# reads as a gentle arc matching a contour. Width of each segment
	# stays 0.8 m so the curve feels continuous.
	var n_seg: int = 7
	var seg_len: float = 3.0 / float(n_seg)
	for i in range(n_seg):
		var t: float = (float(i) - float(n_seg - 1) * 0.5) / float(n_seg)
		var x: float = t * 3.0
		var z_off: float = -0.18 * (1.0 - pow(t * 2.0, 2))  # shallow arc (up-slope bow)
		var seg: MeshInstance3D = _cube(
			Vector3(x, -0.20, 0.45 + z_off),
			Vector3(seg_len * 1.08, 0.4, 0.8),
			trench_color
		)
		# Small yaw so each segment tangents the arc.
		seg.rotation.y = -t * 0.35
		parent.add_child(seg)

	# Berm — 7 segments, taller (0.7 m vs current 0.4) and pushed
	# downhill of the trench so it reads as a planting mound.
	for i in range(n_seg):
		var t2: float = (float(i) - float(n_seg - 1) * 0.5) / float(n_seg)
		var x2: float = t2 * 3.0
		var z_off2: float = -0.18 * (1.0 - pow(t2 * 2.0, 2)) + 1.35
		var bseg: MeshInstance3D = _cube(
			Vector3(x2, 0.35, z_off2),
			Vector3(seg_len * 1.08, 0.70, 1.05),
			earth
		)
		bseg.rotation.y = -t2 * 0.35
		parent.add_child(bseg)

	# Planted fruit-tree marker at the berm apex — trunk + canopy puff.
	parent.add_child(_cylinder(Vector3(0.0, 1.25, 1.35), 0.07, 0.10, 0.9, trunk))
	parent.add_child(_sphere(Vector3(0.0, 2.00, 1.35), 0.55, canopy))
	# Companion guild ring — 5 small coloured dots (honey / coral / berry)
	# around the base, visually representing the planted guild.
	var guild_colors: Array[Color] = [honey, coral, berry, honey, meadow]
	for i in range(5):
		var ang: float = float(i) * TAU / 5.0
		var gx: float = cos(ang) * 0.55
		var gz: float = sin(ang) * 0.35
		parent.add_child(_sphere(Vector3(gx, 0.78, 1.35 + gz), 0.12, guild_colors[i]))

	# Visible pooling water — always readable (alpha 0.35 dry, 0.75 wet),
	# stepped wave bands hint at the water-harvesting function.
	var sky := Color(0.55, 0.78, 0.87)
	var mist := Color(0.78, 0.91, 0.93)
	var water_tint: Color = sky.lerp(mist, 0.30)
	var a2: float = 0.75 if wet else 0.35
	for i in range(3):
		var band: MeshInstance3D = MeshInstance3D.new()
		var qm: QuadMesh = QuadMesh.new()
		qm.size = Vector2(2.9 - float(i) * 0.3, 0.22)
		band.mesh = qm
		var wm: StandardMaterial3D = StandardMaterial3D.new()
		wm.albedo_color = Color(water_tint.r, water_tint.g, water_tint.b, a2 - float(i) * 0.12)
		wm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		wm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		band.material_override = wm
		band.rotation.x = -PI * 0.5
		band.position = Vector3(0, 0.02 + float(i) * 0.003, 0.45)
		parent.add_child(band)


static func _floating_label(pos: Vector3, text: String, color: Color) -> Node3D:
	var root: Node3D = Node3D.new()
	root.position = pos
	var lbl: Label3D = Label3D.new()
	lbl.text = text
	lbl.font_size = 36
	lbl.modulate = color
	lbl.outline_size = 8
	lbl.outline_modulate = Color(1, 1, 1, 0.85)
	lbl.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	root.add_child(lbl)
	return root


## Weather --------------------------------------------------------------

static func _weather(entity: Dictionary, state: String) -> Node3D:
	var script: Script = load("res://scripts/lab_previews/weather_preview.gd")
	var preview: Node3D = Node3D.new()
	preview.set_script(script)
	preview.call("setup", entity, state)
	return preview
