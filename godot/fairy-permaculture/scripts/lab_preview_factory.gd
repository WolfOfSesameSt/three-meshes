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


## Weather --------------------------------------------------------------

static func _weather(entity: Dictionary, state: String) -> Node3D:
	var script: Script = load("res://scripts/lab_previews/weather_preview.gd")
	var preview: Node3D = Node3D.new()
	preview.set_script(script)
	preview.call("setup", entity, state)
	return preview
