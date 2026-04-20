## Fairy Permaculture — Chicken (concrete AnimalEntity subclass).
##
## The pilot species for the animal system. Configures the chicken's
## forage + output rates, rolls a normally-distributed ~3 year lifespan,
## and builds a recognizable silhouette (round buff-layer body + red
## comb + yellow legs + tuft tail) using the same primitive-mesh idiom
## as the lab animal preview so the two stay visually consistent.
##
## Locked design refs (project_animal_system.md):
##   forage_tiles  : meadow / forest_edge / bare
##   hunger_rate   : 2.0 / day
##   thirst_rate   : 2.5 / day
##   lifespan      : N(1080, 180) days — clamped >= 30 via rand_normal
##   outputs       : 0.8 eggs/day, 0.4 manure/day
##   yields (death): 2 meat + 3 bones + 4 feathers
extends AnimalEntity


# All colors trace back to Palette.* per feedback_happy_palette_mandatory.
# The body color is a warm buff-layer tint — `Palette.HONEY` softened
# with `STRAW_DRY` so we don't land on a hot-yellow cartoon chicken.
var _body_color: Color = Palette.HONEY.lerp(Palette.STRAW_DRY, 0.45)
var _head_color: Color = Palette.HONEY.lerp(Palette.STRAW_DRY, 0.40)
var _comb_color: Color = Palette.CORAL
var _beak_color: Color = Palette.HONEY
var _leg_color: Color  = Palette.HONEY.lerp(Palette.CORAL, 0.15)
var _tail_color: Color = Palette.EARTH.lerp(Palette.HONEY, 0.30)


func _species_configure() -> void:
	species_id = "chicken"
	species_display_name = "Hen"
	species_lifespan_mean = 1080.0
	species_lifespan_stddev = 180.0
	# Re-roll lifespan with the correct mean/stddev if we landed here
	# BEFORE _species_configure ran (the base _ready sequence rolls once
	# with whatever the exports say; we re-roll using our tuned mean/σ
	# unless the sim locked an override).
	if override_max_age_days <= 0:
		max_age_days = int(_rand_normal(species_lifespan_mean, species_lifespan_stddev))
	daily_hunger_rate = 2.0
	daily_thirst_rate = 2.5
	forage_tiles = ["meadow", "forest_edge", "bare"]
	forage_range = 8.0
	move_speed = 0.8  # m/s — chicken default from the Phase-3 spec.
	# Eggs feed fairies (routed via coop.on_egg_laid → FarmTotals.fairy_food
	# fruit channel in phase 1). Manure silently bumps tile OM.
	output_per_day = { "eggs": 0.8, "manure": 0.4 }


# =============================================================
# Phase-3: species-flavor environmental influence + click.
# =============================================================

## Chickens scratch +0.01 OM per day under them AND emit a scattered
## feather particle. Churned-earth tint is visible via the soil-inspector
## panel's per-tile history. Reduces local rodent/insect pressure (we
## drain from Wildlife's pressure map if exposed).
func _species_env_influence() -> String:
	var wg: Node = get_node_or_null("/root/WorldGrid")
	if wg != null and wg.has_method("add_tile_om"):
		wg.call("add_tile_om", global_position, 0.01)
	# Reduce local rodent + insect pest pressure (tiny amount per hen).
	var wildlife: Node = get_node_or_null("/root/Wildlife")
	if wildlife != null and wildlife.has_method("bump_pest_pressure"):
		wildlife.call("bump_pest_pressure", "rodent", -0.4)
		wildlife.call("bump_pest_pressure", "aphid", -0.2)
	# Scatter a feather particle now and then — not every day, to keep
	# the world quiet.
	if get_node_or_null("/root/Juice") != null and _rng.randf() < 0.3:
		Juice.burst(global_position + Vector3(0, 0.25, 0),
			Palette.STRAW_DRY.lerp(Palette.HONEY, 0.3), 3)
	return "Chicken-scratched (+0.01 OM today)"


## Chicken-specific click: a cluck SFX + small wing-flutter burst +
## baseline pet (bond / heart-pop comes from super).
func _on_clicked() -> void:
	if state == STATE_DEAD:
		return
	super._on_clicked()
	# Extra feather puff so chickens feel springy vs a barn cat's purr.
	if get_node_or_null("/root/Juice") != null:
		Juice.burst(global_position + Vector3(0, 0.6, 0),
			Palette.STRAW_DRY.lerp(Palette.MOON, 0.2), 8)


func _click_sfx() -> String:
	# Falls back to hover-tick if cluck isn't baked yet — sound-designer
	# will register a dedicated chicken-cluck SFX in a follow-up.
	return "hover-tick"


## Build a recognizable chicken silhouette with primitive meshes. No
## shader: we rely on the base StandardMaterial3D path so mood/elder
## tints (driven by AnimalEntity._apply_tint) can just set albedo_color
## on each part. Everything traces to Palette.* constants.
func _build_visuals() -> void:
	# ---- Body: round buff-layer sphere, slightly elongated (tail forward) ----
	var body: MeshInstance3D = _sphere(Vector3(0, 0.35, 0), 0.28, _body_color)
	body.scale = Vector3(1.3, 1.0, 0.9)
	add_child(body)
	_register_body_part(body, _body_color)

	# ---- Head: smaller sphere perched forward ----
	var head: MeshInstance3D = _sphere(Vector3(0, 0.68, 0.22), 0.16, _head_color)
	add_child(head)
	_register_body_part(head, _head_color)

	# ---- Comb: red saw-tooth on top (squashed sphere) ----
	var comb: MeshInstance3D = _sphere(Vector3(0, 0.82, 0.20), 0.07, _comb_color)
	comb.scale = Vector3(1.6, 0.55, 0.6)
	add_child(comb)
	_register_body_part(comb, _comb_color)

	# ---- Wattle: small red under-chin ----
	var wattle: MeshInstance3D = _sphere(Vector3(0, 0.58, 0.30), 0.05, _comb_color)
	wattle.scale = Vector3(1.0, 1.2, 0.7)
	add_child(wattle)
	_register_body_part(wattle, _comb_color)

	# ---- Beak: small honey cube poking forward ----
	var beak: MeshInstance3D = _cube(Vector3(0, 0.67, 0.36), Vector3(0.07, 0.06, 0.12), _beak_color)
	add_child(beak)
	_register_body_part(beak, _beak_color)

	# ---- Two yellow legs (thin cylinders + tiny feet) ----
	for side in [-1, 1]:
		var hip: Vector3 = Vector3(0.09 * float(side), 0.12, 0)
		var shin: MeshInstance3D = _cylinder(hip, 0.03, 0.03, 0.24, _leg_color)
		add_child(shin)
		_register_body_part(shin, _leg_color)
		var foot: MeshInstance3D = _cube(
			hip + Vector3(0, -0.13, 0.06),
			Vector3(0.08, 0.03, 0.11),
			_leg_color,
		)
		add_child(foot)
		_register_body_part(foot, _leg_color)

	# ---- Tail feathers: upright EARTH-toned cube ----
	var tail: MeshInstance3D = _cube(Vector3(0, 0.56, -0.32), Vector3(0.20, 0.24, 0.12), _tail_color)
	tail.rotation.x = -0.55
	add_child(tail)
	_register_body_part(tail, _tail_color)


## Locked-spec carcass yields: 2 meat, 3 bones, 4 feathers. Blood is
## skipped in phase 1 per the spec ("only if you add a blood resource").
func species_yields() -> Dictionary:
	return { "meat": 2, "bones": 3, "feathers": 4 }


# =============================================================
# Primitive-mesh helpers — mirror the lab_preview idiom so the silhouette
# reads the same in-game as it does in the lab preview card.
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


## StandardMaterial3D — mood/elder tinting in AnimalEntity._apply_tint
## writes back into `albedo_color` so each frame stays readable. We use
## per-pixel shading so legs don't read as a flat yellow smear under the
## directional light.
func _simple_mat(color: Color) -> StandardMaterial3D:
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.albedo_color = color
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_PER_PIXEL
	return mat
