## Fairy Permaculture — Goat (concrete AnimalEntity subclass).
##
## The milk-producer mid-tier. Goats browse brush + forest_edge + meadow
## (they're not grazers — they nibble tall woody leaves, which is why
## they're the rotational-cascade partner in the aigamo-of-uplands
## branch). Produces 1.5 milk/day as a doe — MVP approximates the
## lactation cycle as continuous, full milk output whenever healthy.
##
## Locked design refs (project_animal_system.md):
##   forage_tiles  : meadow / forest_edge / brush
##   hunger_rate   : 3.5 / day
##   thirst_rate   : 2.5 / day
##   lifespan      : N(1800, 240) days — clamped >= 30
##   outputs       : 1.5 milk/day, 0.9 manure/day (richer pellet manure)
##   yields (death): 12 meat + 6 bones + 1 hide
extends AnimalEntity


# Creamy STRAW_DRY body with deeper EARTH-toned legs + horns. Fleece-ish
# body reads as "warm buff doe" without committing to a specific breed
# silhouette. Colors trace to Palette.* per happy-palette rule.
var _body_color: Color = Palette.STRAW_DRY.lerp(Palette.MOON, 0.35)
var _head_color: Color = Palette.STRAW_DRY.lerp(Palette.WARM_STONE, 0.25)
var _leg_color: Color  = Palette.EARTH.lerp(Palette.COMPOST, 0.15)
var _hoof_color: Color = Palette.COMPOST
var _horn_color: Color = Palette.WARM_STONE.lerp(Palette.EARTH, 0.4)
var _ear_color: Color  = Palette.STRAW_DRY.lerp(Palette.WARM_STONE, 0.5)
var _udder_color: Color = Palette.CORAL.lerp(Palette.MOON, 0.55)


func _species_configure() -> void:
	species_id = "goat"
	species_display_name = "Doe"
	species_lifespan_mean = 1800.0
	species_lifespan_stddev = 240.0
	if override_max_age_days <= 0:
		max_age_days = int(_rand_normal(species_lifespan_mean, species_lifespan_stddev))
	daily_hunger_rate = 3.5
	daily_thirst_rate = 2.5
	forage_tiles = ["meadow", "forest_edge", "brush", "shrub"]
	forage_range = 12.0
	move_speed = 1.2  # m/s — goats are springy browsers.
	# Milk routes straight to fairy_food.milk via base class _deliver_output.
	# Manure bigger than chicken — DESIGN.md Salatin cascade → rotational
	# pasture gets top-tier OM deposit.
	output_per_day = { "milk": 1.5, "manure": 0.9 }


# Phase-3 env influence: goats trim decor shrubs in 5m — reduced here to
# a light OM bump + log entry; plant-damage hook lands when the plant
# registry exposes a neighbor-query. Escape-prone (fence_strength -0.3)
# is set via data/animals.json.
func _species_env_influence() -> String:
	var wg: Node = get_node_or_null("/root/WorldGrid")
	if wg != null and wg.has_method("add_tile_om"):
		wg.call("add_tile_om", global_position, 0.008)
	return "Goat-browsed (+0.008 OM, brush trimmed)"


func _on_clicked() -> void:
	if state == STATE_DEAD: return
	super._on_clicked()
	if get_node_or_null("/root/Juice") != null:
		Juice.burst(global_position + Vector3(0, 0.8, 0),
			Palette.STRAW_DRY, 5)


func _build_visuals() -> void:
	# ---- Barrel body: elongated along Z ----
	var body: MeshInstance3D = _sphere(Vector3(0, 0.65, 0), 0.38, _body_color)
	body.scale = Vector3(1.15, 1.0, 1.55)
	add_child(body)
	_register_body_part(body, _body_color)

	# ---- Head: smaller sphere forward ----
	var head: MeshInstance3D = _sphere(Vector3(0, 0.92, 0.52), 0.20, _head_color)
	head.scale = Vector3(0.9, 0.9, 1.2)
	add_child(head)
	_register_body_part(head, _head_color)

	# ---- Two horns: small back-swept cylinders ----
	for side in [-1, 1]:
		var horn: MeshInstance3D = _cylinder(
			Vector3(0.08 * float(side), 1.10, 0.46),
			0.02, 0.04, 0.18, _horn_color,
		)
		horn.rotation.x = 0.5
		add_child(horn)
		_register_body_part(horn, _horn_color)

	# ---- Two flop ears: small flat boxes on the side of the head ----
	for side in [-1, 1]:
		var ear: MeshInstance3D = _cube(
			Vector3(0.18 * float(side), 0.95, 0.50),
			Vector3(0.05, 0.08, 0.14),
			_ear_color,
		)
		ear.rotation.z = 0.35 * float(side)
		add_child(ear)
		_register_body_part(ear, _ear_color)

	# ---- Four legs: cylinders + dark hooves ----
	var leg_offsets: Array = [
		Vector3(-0.18, 0.32, 0.38),
		Vector3(0.18, 0.32, 0.38),
		Vector3(-0.18, 0.32, -0.38),
		Vector3(0.18, 0.32, -0.38),
	]
	for off in leg_offsets:
		var shin: MeshInstance3D = _cylinder(off, 0.05, 0.06, 0.50, _leg_color)
		add_child(shin)
		_register_body_part(shin, _leg_color)
		var hoof: MeshInstance3D = _cube(
			off + Vector3(0, -0.28, 0),
			Vector3(0.10, 0.06, 0.12),
			_hoof_color,
		)
		add_child(hoof)
		_register_body_part(hoof, _hoof_color)

	# ---- Udder: CORAL bump under the belly to read "milk-producing doe" ----
	var udder: MeshInstance3D = _sphere(Vector3(0, 0.42, -0.15), 0.10, _udder_color)
	udder.scale = Vector3(1.2, 0.9, 1.3)
	add_child(udder)
	_register_body_part(udder, _udder_color)

	# ---- Stubby tail ----
	var tail: MeshInstance3D = _cube(Vector3(0, 0.80, -0.62), Vector3(0.08, 0.10, 0.14), _body_color)
	tail.rotation.x = -0.4
	add_child(tail)
	_register_body_part(tail, _body_color)


## Locked carcass yields: 12 meat + 6 bones + 1 hide.
func species_yields() -> Dictionary:
	return { "meat": 12, "bones": 6, "hide": 1 }


# =============================================================
# Primitive helpers — mirror the chicken.gd idiom.
# =============================================================

func _cube(pos: Vector3, size: Vector3, color: Color) -> MeshInstance3D:
	var m: BoxMesh = BoxMesh.new()
	m.size = size
	var mi: MeshInstance3D = MeshInstance3D.new()
	mi.mesh = m
	mi.material_override = _simple_mat(color)
	mi.position = pos
	return mi


func _sphere(pos: Vector3, radius: float, color: Color) -> MeshInstance3D:
	var m: SphereMesh = SphereMesh.new()
	m.radius = radius
	m.height = radius * 2.0
	var mi: MeshInstance3D = MeshInstance3D.new()
	mi.mesh = m
	mi.material_override = _simple_mat(color)
	mi.position = pos
	return mi


func _cylinder(pos: Vector3, top_r: float, bot_r: float, h: float, color: Color) -> MeshInstance3D:
	var m: CylinderMesh = CylinderMesh.new()
	m.top_radius = top_r
	m.bottom_radius = bot_r
	m.height = h
	var mi: MeshInstance3D = MeshInstance3D.new()
	mi.mesh = m
	mi.material_override = _simple_mat(color)
	mi.position = pos
	return mi


func _simple_mat(color: Color) -> StandardMaterial3D:
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.albedo_color = color
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_PER_PIXEL
	return mat
