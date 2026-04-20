## Fairy Permaculture — Dexter Cow (concrete AnimalEntity subclass).
##
## Top-tier dairy + manure producer. Dexters are the small heritage breed
## the spec picked specifically because they fit a BC coastal homestead's
## scale (half-sized vs a Holstein). The Salatin cascade revolves around
## this species → rotational pasture + chickens in their wake = +300 % OM
## over 5 years (DESIGN.md §Plant-animal synergies).
##
## Locked design refs (project_animal_system.md):
##   forage_tiles  : pasture (dedicated) / meadow / forest_edge
##   hunger_rate   : 6.0 / day
##   thirst_rate   : 5.0 / day
##   lifespan      : N(3600, 480) days — clamped >= 30 (≈10 game years)
##   outputs       : 8 milk/day, 2.2 manure/day (king manure producer)
##   yields (death): 40 meat + 15 bones + 1 large hide
extends AnimalEntity


# Dexter cattle ship in a dun-buff coat with darker legs. EARTH body over
# WARM_STONE belly; hooves COMPOST-dark. Colors trace to Palette.* only.
var _body_color: Color = Palette.EARTH.lerp(Palette.STRAW_DRY, 0.35)
var _belly_color: Color = Palette.EARTH.lerp(Palette.MOON, 0.25)
var _head_color: Color = Palette.EARTH.lerp(Palette.COMPOST, 0.25)
var _leg_color: Color  = Palette.COMPOST.lerp(Palette.EARTH, 0.35)
var _hoof_color: Color = Palette.INK
var _horn_color: Color = Palette.MOON.lerp(Palette.WARM_STONE, 0.45)
var _ear_color: Color  = Palette.EARTH.lerp(Palette.STRAW_DRY, 0.45)
var _udder_color: Color = Palette.CORAL.lerp(Palette.MOON, 0.55)


func _species_configure() -> void:
	species_id = "cow"
	species_display_name = "Dexter Cow"
	species_lifespan_mean = 3600.0
	species_lifespan_stddev = 480.0
	if override_max_age_days <= 0:
		max_age_days = int(_rand_normal(species_lifespan_mean, species_lifespan_stddev))
	daily_hunger_rate = 6.0
	daily_thirst_rate = 5.0
	forage_tiles = ["pasture", "meadow", "forest_edge"]
	forage_range = 16.0
	move_speed = 0.5  # m/s — slow, heavy grazer.
	# Milk → fairy_food.milk; manure OM king. Phase 1 approximates
	# lactation as continuous (same pattern as goat).
	output_per_day = { "milk": 8.0, "manure": 2.2 }


# Phase-3 env influence: cows deposit +0.03 OM per day. Wet tiles pick up
# a compaction penalty flag we log for the soil inspector (drainage -%
# for 7 days; the soil engine agent will wire the flag read in a follow-
# up). Wear tracks appear as cow-path decor in a future art pass.
func _species_env_influence() -> String:
	var wg: Node = get_node_or_null("/root/WorldGrid")
	var suffix: String = ""
	if wg != null:
		if wg.has_method("add_tile_om"):
			wg.call("add_tile_om", global_position, 0.03)
		# Check surface water — wet tile = compaction event.
		var mat: String = ""
		if wg.has_method("tile_material_at"):
			mat = String(wg.call("tile_material_at", global_position))
		var is_wet: bool = mat == "pond" or mat == "stream_bed" or mat == "bank"
		if is_wet and get_node_or_null("/root/GameLog") != null:
			GameLog.event("cow_compaction", { "pos": [global_position.x, global_position.z] })
			suffix = "; compaction flagged (wet)"
	return "Cow-grazed (+0.03 OM)%s" % suffix


func _on_clicked() -> void:
	if state == STATE_DEAD: return
	super._on_clicked()
	if get_node_or_null("/root/Juice") != null:
		Juice.burst(global_position + Vector3(0, 1.2, 0),
			Palette.WARM_STONE, 6)


func _build_visuals() -> void:
	# ---- Barrel body: long, heavy, belly-slung lighter belly underside ----
	var body: MeshInstance3D = _sphere(Vector3(0, 1.00, 0), 0.60, _body_color)
	body.scale = Vector3(1.25, 1.05, 2.0)
	add_child(body)
	_register_body_part(body, _body_color)

	# Belly-lighter underside: smaller sphere tucked underneath.
	var belly: MeshInstance3D = _sphere(Vector3(0, 0.75, 0), 0.52, _belly_color)
	belly.scale = Vector3(1.15, 0.7, 1.85)
	add_child(belly)
	_register_body_part(belly, _belly_color)

	# ---- Head: broader sphere on a short neck ----
	var neck: MeshInstance3D = _cylinder(Vector3(0, 1.05, 0.85), 0.22, 0.26, 0.35, _body_color)
	neck.rotation.x = -0.25
	add_child(neck)
	_register_body_part(neck, _body_color)

	var head: MeshInstance3D = _sphere(Vector3(0, 1.15, 1.12), 0.28, _head_color)
	head.scale = Vector3(1.0, 1.0, 1.35)
	add_child(head)
	_register_body_part(head, _head_color)

	# ---- Two short horns ----
	for side in [-1, 1]:
		var horn: MeshInstance3D = _cylinder(
			Vector3(0.16 * float(side), 1.38, 1.02),
			0.03, 0.05, 0.22, _horn_color,
		)
		horn.rotation.z = 0.7 * float(side)
		add_child(horn)
		_register_body_part(horn, _horn_color)

	# ---- Two ears ----
	for side in [-1, 1]:
		var ear: MeshInstance3D = _cube(
			Vector3(0.26 * float(side), 1.22, 1.00),
			Vector3(0.06, 0.10, 0.16),
			_ear_color,
		)
		ear.rotation.z = 0.45 * float(side)
		add_child(ear)
		_register_body_part(ear, _ear_color)

	# ---- Four legs — robust for a Dexter ----
	var leg_offsets: Array = [
		Vector3(-0.30, 0.48, 0.62),
		Vector3(0.30, 0.48, 0.62),
		Vector3(-0.30, 0.48, -0.62),
		Vector3(0.30, 0.48, -0.62),
	]
	for off in leg_offsets:
		var shin: MeshInstance3D = _cylinder(off, 0.09, 0.11, 0.80, _leg_color)
		add_child(shin)
		_register_body_part(shin, _leg_color)
		var hoof: MeshInstance3D = _cube(
			off + Vector3(0, -0.44, 0),
			Vector3(0.18, 0.08, 0.20),
			_hoof_color,
		)
		add_child(hoof)
		_register_body_part(hoof, _hoof_color)

	# ---- Udder: larger CORAL-lerp pouch under the belly (milk king) ----
	var udder: MeshInstance3D = _sphere(Vector3(0, 0.45, -0.32), 0.18, _udder_color)
	udder.scale = Vector3(1.2, 0.9, 1.3)
	add_child(udder)
	_register_body_part(udder, _udder_color)

	# ---- Tail: long thin with a tuft ----
	var tail: MeshInstance3D = _cylinder(Vector3(0, 1.12, -1.05), 0.04, 0.05, 0.60, _body_color)
	tail.rotation.x = -0.5
	add_child(tail)
	_register_body_part(tail, _body_color)
	var tuft: MeshInstance3D = _sphere(Vector3(0, 0.95, -1.35), 0.08, _leg_color)
	add_child(tuft)
	_register_body_part(tuft, _leg_color)


## Locked carcass yields: 40 meat + 15 bones + 1 hide (large).
func species_yields() -> Dictionary:
	return { "meat": 40, "bones": 15, "hide": 1 }


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
