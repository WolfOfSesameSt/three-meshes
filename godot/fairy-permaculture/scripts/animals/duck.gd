## Fairy Permaculture — Duck (concrete AnimalEntity subclass).
##
## Second species after the chicken pilot. Ducks forage pond / wetland /
## shallows tiles and never stress thirst — they drink continuously off
## their attached pond edge habitat. Slightly lower egg output than a
## chicken (0.6/day) but a larger carcass yield and a future slug-eating
## role (see DESIGN.md §Self-balancing wildlife ecology — ducks cap slug
## populations in wet-season orchards).
##
## Locked design refs (project_animal_system.md):
##   forage_tiles  : pond / wetland / shallows
##   hunger_rate   : 2.2 / day
##   thirst_rate   : 0.0 / day (pond-sitting)
##   lifespan      : N(1440, 240) days — clamped >= 30
##   outputs       : 0.6 eggs/day, 0.5 manure/day (wetter manure → bigger OM)
##   yields (death): 3 meat + 3 bones + 2 down
extends AnimalEntity


# Warm buff-cream body with a dusky MOON highlight on the head. Beak is a
# warm CORAL-honey shift so the silhouette still reads like a duck instead
# of a pale chicken. Colors trace back to Palette.* per happy-palette rule.
var _body_color: Color = Palette.MOON.lerp(Palette.STRAW_DRY, 0.35)
var _head_color: Color = Palette.SAGE.lerp(Palette.OLIVE_DARK, 0.45)
var _neck_color: Color = Palette.MOON.lerp(Palette.HONEY, 0.20)
var _beak_color: Color = Palette.CORAL.lerp(Palette.HONEY, 0.35)
var _leg_color: Color  = Palette.HONEY.lerp(Palette.CORAL, 0.15)
var _wing_color: Color = Palette.MOON.lerp(Palette.WARM_STONE, 0.30)


func _species_configure() -> void:
	species_id = "duck"
	species_display_name = "Duck"
	species_lifespan_mean = 1440.0
	species_lifespan_stddev = 240.0
	if override_max_age_days <= 0:
		max_age_days = int(_rand_normal(species_lifespan_mean, species_lifespan_stddev))
	daily_hunger_rate = 2.2
	# Pond-sitting — thirst drains automatically via the always-water path.
	# We keep the rate tiny so the day-tick drink code still triggers once
	# in a while (exercises the STATE_DRINKING visible-state cue).
	daily_thirst_rate = 0.4
	forage_tiles = ["pond", "wetland", "shallows", "meadow"]
	forage_range = 9.0
	# 0.6 eggs/day → whole egg every ~1.67 days. Manure slightly higher
	# than chicken (ducks eat more bulk greens), routed to OM same way.
	output_per_day = { "eggs": 0.6, "manure": 0.5 }


func _build_visuals() -> void:
	# ---- Body: elongated egg-shape along Z (tail → head) ----
	var body: MeshInstance3D = _sphere(Vector3(0, 0.32, 0), 0.28, _body_color)
	body.scale = Vector3(1.1, 0.95, 1.5)
	add_child(body)
	_register_body_part(body, _body_color)

	# ---- Neck: tall slender cylinder angling forward + up ----
	var neck: MeshInstance3D = _cylinder(Vector3(0, 0.60, 0.28), 0.08, 0.10, 0.45, _neck_color)
	neck.rotation.x = -0.35
	add_child(neck)
	_register_body_part(neck, _neck_color)

	# ---- Head: compact SAGE-OLIVE sphere on top of the neck ----
	var head: MeshInstance3D = _sphere(Vector3(0, 0.84, 0.42), 0.14, _head_color)
	add_child(head)
	_register_body_part(head, _head_color)

	# ---- Beak: flat wide box poking forward ----
	var beak: MeshInstance3D = _cube(Vector3(0, 0.80, 0.60), Vector3(0.14, 0.06, 0.18), _beak_color)
	add_child(beak)
	_register_body_part(beak, _beak_color)

	# ---- Two wings: folded flat cubes along the body flanks ----
	for side in [-1, 1]:
		var wing: MeshInstance3D = _cube(
			Vector3(0.22 * float(side), 0.36, 0.0),
			Vector3(0.08, 0.14, 0.36),
			_wing_color,
		)
		wing.rotation.z = 0.25 * float(side)
		add_child(wing)
		_register_body_part(wing, _wing_color)

	# ---- Two short orange legs (webbed feet implied by wide low box) ----
	for side in [-1, 1]:
		var hip: Vector3 = Vector3(0.09 * float(side), 0.10, -0.05)
		var shin: MeshInstance3D = _cylinder(hip, 0.03, 0.035, 0.18, _leg_color)
		add_child(shin)
		_register_body_part(shin, _leg_color)
		var foot: MeshInstance3D = _cube(
			hip + Vector3(0, -0.10, 0.05),
			Vector3(0.11, 0.02, 0.14),
			_leg_color,
		)
		add_child(foot)
		_register_body_part(foot, _leg_color)

	# ---- Tail: small upright wedge ----
	var tail: MeshInstance3D = _cube(Vector3(0, 0.42, -0.42), Vector3(0.16, 0.12, 0.10), _wing_color)
	tail.rotation.x = 0.35
	add_child(tail)
	_register_body_part(tail, _wing_color)


## Locked carcass yields (project_animal_system.md): 3 meat + 3 bones + 2 down.
func species_yields() -> Dictionary:
	return { "meat": 3, "bones": 3, "down": 2 }


# =============================================================
# Primitive-mesh helpers — mirror the chicken.gd idiom so the
# silhouettes stay visually consistent across species.
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
