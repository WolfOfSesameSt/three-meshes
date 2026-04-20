## Fairy Permaculture — Pig (concrete AnimalEntity subclass).
##
## Forest-floor rootler + prime manure producer. Pigs forage fallen fruit
## + forest_floor (acorns, roots, mast) and churn the soil as they go —
## DESIGN.md's pig→chicken→orchard guild counts on this species for the
## initial-break-up tillage step.
##
## MVP note: pigs produce NO regular product — meat only at death. Huge
## manure volume (1.4/day) keeps them economically worthwhile while
## alive; the big carcass yield closes the loop at the end.
##
## Locked design refs (project_animal_system.md):
##   forage_tiles  : forest_floor / fallen_fruit / orchard_floor
##   hunger_rate   : 5.0 / day
##   thirst_rate   : 3.0 / day
##   lifespan      : N(1440, 180) days — clamped >= 30
##   outputs       : 1.4 manure/day (king manure producer)
##   yields (death): 20 meat + 4 bones + 2 lard
extends AnimalEntity


# Pink-cream body via CORAL lerped into MOON. Keep saturation deliberately
# muted so the pig doesn't read as candy-pink — permaculture vibe. Ears +
# snout shift slightly darker. Colors trace to Palette.* only.
var _body_color: Color = Palette.CORAL.lerp(Palette.MOON, 0.55)
var _head_color: Color = Palette.CORAL.lerp(Palette.MOON, 0.50)
var _snout_color: Color = Palette.CORAL.lerp(Palette.WARM_STONE, 0.45)
var _ear_color: Color  = Palette.CORAL.lerp(Palette.EARTH, 0.35)
var _hoof_color: Color = Palette.COMPOST
var _leg_color: Color  = Palette.CORAL.lerp(Palette.WARM_STONE, 0.40)


func _species_configure() -> void:
	species_id = "pig"
	species_display_name = "Pig"
	species_lifespan_mean = 1440.0
	species_lifespan_stddev = 180.0
	if override_max_age_days <= 0:
		max_age_days = int(_rand_normal(species_lifespan_mean, species_lifespan_stddev))
	daily_hunger_rate = 5.0
	daily_thirst_rate = 3.0
	forage_tiles = ["forest_floor", "fallen_fruit", "orchard_floor", "forest_edge"]
	forage_range = 9.0
	# No regular product — meat-at-death only. Manure is the big payoff.
	output_per_day = { "manure": 1.4 }


func _build_visuals() -> void:
	# ---- Barrel body: very rotund, low to the ground ----
	var body: MeshInstance3D = _sphere(Vector3(0, 0.55, 0), 0.45, _body_color)
	body.scale = Vector3(1.2, 0.95, 1.55)
	add_child(body)
	_register_body_part(body, _body_color)

	# ---- Head: medium sphere forward + slightly down ----
	var head: MeshInstance3D = _sphere(Vector3(0, 0.72, 0.58), 0.24, _head_color)
	head.scale = Vector3(1.0, 0.85, 1.2)
	add_child(head)
	_register_body_part(head, _head_color)

	# ---- Snout: flat disk jutting forward, slightly darker ----
	var snout: MeshInstance3D = _cylinder(Vector3(0, 0.66, 0.86), 0.12, 0.12, 0.08, _snout_color)
	snout.rotation.x = PI * 0.5
	add_child(snout)
	_register_body_part(snout, _snout_color)

	# ---- Two ears: small forward-flopping triangular boxes ----
	for side in [-1, 1]:
		var ear: MeshInstance3D = _cube(
			Vector3(0.14 * float(side), 0.90, 0.50),
			Vector3(0.06, 0.14, 0.10),
			_ear_color,
		)
		ear.rotation.z = 0.4 * float(side)
		add_child(ear)
		_register_body_part(ear, _ear_color)

	# ---- Four short stumpy legs ----
	var leg_offsets: Array = [
		Vector3(-0.20, 0.22, 0.35),
		Vector3(0.20, 0.22, 0.35),
		Vector3(-0.20, 0.22, -0.35),
		Vector3(0.20, 0.22, -0.35),
	]
	for off in leg_offsets:
		var shin: MeshInstance3D = _cylinder(off, 0.08, 0.09, 0.30, _leg_color)
		add_child(shin)
		_register_body_part(shin, _leg_color)
		var hoof: MeshInstance3D = _cube(
			off + Vector3(0, -0.18, 0),
			Vector3(0.14, 0.05, 0.14),
			_hoof_color,
		)
		add_child(hoof)
		_register_body_part(hoof, _hoof_color)

	# ---- Curly tail: small back-sphere stand-in ----
	var tail: MeshInstance3D = _sphere(Vector3(0, 0.72, -0.66), 0.06, _body_color)
	add_child(tail)
	_register_body_part(tail, _body_color)


## Locked carcass yields: 20 meat + 4 bones + 2 lard.
func species_yields() -> Dictionary:
	return { "meat": 20, "bones": 4, "lard": 2 }


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
