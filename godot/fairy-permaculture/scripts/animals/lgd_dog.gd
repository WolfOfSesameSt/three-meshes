## Fairy Permaculture — Livestock Guardian Dog (LGD).
##
## The ONLY species that eats meat (besides the barn cat's tiny fallback).
## Patrols the paddock stack — its aura prevents predator-event damage
## within a radius. The predator framework itself is stubbed: every
## hour-tick we emit an `lgd_protects(pos, radius)` signal the future
## predator-system agent will listen for, so the wiring is ready today.
##
## Locked design refs (project_animal_system.md):
##   diet          : 0.5 meat/day from storage; falls back to plant_trim
##   thirst_rate   : 1.2 / day
##   lifespan      : N(4320, 720) days — ≈12 game years
##   outputs       : none (service animal)
##   yields (death): none (we don't butcher our dogs — carcass decays to OM)
##
## A working dog is the centerpiece of the Salatin / Tamera polyculture
## layer: without a guardian, free-range flocks cost you ~2 chickens/week
## to predation in year-2+ biomes. The LGD is what makes rotational
## pasture safe.
extends AnimalEntity


# Buff warm-toned body (golden-retriever-ish) — we want the dog to read as
# friendly, warm, high-empathy. Colors trace to Palette.* only.
var _body_color: Color = Palette.HONEY.lerp(Palette.STRAW_DRY, 0.35)
var _muzzle_color: Color = Palette.MOON.lerp(Palette.STRAW_DRY, 0.35)
var _paw_color: Color  = Palette.EARTH.lerp(Palette.HONEY, 0.30)
var _nose_color: Color = Palette.COMPOST
var _ear_color: Color  = Palette.HONEY.lerp(Palette.EARTH, 0.35)
var _collar_color: Color = Palette.CORAL


## Radius (tiles) in which the LGD keeps predators at bay. DESIGN.md says
## a single guardian covers one full paddock (6-8 tiles). The future
## predator system subscribes to `lgd_protects` and clips events inside
## this zone.
const PROTECT_RADIUS: float = 8.0

## How often (in seconds of real time) we re-fire the lgd_protects
## signal. 60 s matches the in-game hour step (SECONDS_PER_DAY / 24).
const PROTECT_EMIT_HZ: float = 60.0

signal lgd_protects(pos: Vector3, radius: float)

var _protect_t: float = 0.0


func _species_configure() -> void:
	species_id = "lgd_dog"
	species_display_name = "Guardian Dog"
	species_lifespan_mean = 4320.0
	species_lifespan_stddev = 720.0
	if override_max_age_days <= 0:
		max_age_days = int(_rand_normal(species_lifespan_mean, species_lifespan_stddev))
	# Low direct hunger rate — the MEAT debit is applied in an override of
	# day_tick below (direct 0.5 meat/day pull from FarmTotals).
	daily_hunger_rate = 1.5
	daily_thirst_rate = 1.2
	# No forage tiles — dogs don't graze. The base class will fall through
	# to the feeder path which we override below.
	forage_tiles = []
	forage_range = 20.0
	output_per_day = {}


func _build_visuals() -> void:
	# ---- Barrel body: medium-large, long ----
	var body: MeshInstance3D = _sphere(Vector3(0, 0.55, 0), 0.30, _body_color)
	body.scale = Vector3(1.05, 0.95, 1.55)
	add_child(body)
	_register_body_part(body, _body_color)

	# ---- Head: medium sphere + muzzle ----
	var head: MeshInstance3D = _sphere(Vector3(0, 0.78, 0.50), 0.18, _body_color)
	add_child(head)
	_register_body_part(head, _body_color)

	var muzzle: MeshInstance3D = _cube(Vector3(0, 0.68, 0.74), Vector3(0.16, 0.14, 0.20), _muzzle_color)
	add_child(muzzle)
	_register_body_part(muzzle, _muzzle_color)

	var nose: MeshInstance3D = _sphere(Vector3(0, 0.70, 0.88), 0.04, _nose_color)
	add_child(nose)
	_register_body_part(nose, _nose_color)

	# ---- Two floppy ears ----
	for side in [-1, 1]:
		var ear: MeshInstance3D = _cube(
			Vector3(0.14 * float(side), 0.85, 0.42),
			Vector3(0.06, 0.16, 0.12),
			_ear_color,
		)
		ear.rotation.z = 0.5 * float(side)
		add_child(ear)
		_register_body_part(ear, _ear_color)

	# ---- Four legs ----
	var leg_offsets: Array = [
		Vector3(-0.15, 0.24, 0.38),
		Vector3(0.15, 0.24, 0.38),
		Vector3(-0.15, 0.24, -0.38),
		Vector3(0.15, 0.24, -0.38),
	]
	for off in leg_offsets:
		var shin: MeshInstance3D = _cylinder(off, 0.05, 0.06, 0.40, _body_color)
		add_child(shin)
		_register_body_part(shin, _body_color)
		var paw: MeshInstance3D = _cube(
			off + Vector3(0, -0.22, 0),
			Vector3(0.10, 0.05, 0.11),
			_paw_color,
		)
		add_child(paw)
		_register_body_part(paw, _paw_color)

	# ---- Tail: curled up ----
	var tail: MeshInstance3D = _cylinder(Vector3(0, 0.70, -0.56), 0.04, 0.05, 0.34, _body_color)
	tail.rotation.x = -0.7
	add_child(tail)
	_register_body_part(tail, _body_color)

	# ---- Collar: CORAL band around neck so the dog reads as owned/friendly
	var collar: MeshInstance3D = _cylinder(Vector3(0, 0.68, 0.34), 0.16, 0.16, 0.05, _collar_color)
	collar.rotation.x = PI * 0.5
	add_child(collar)
	_register_body_part(collar, _collar_color)


func species_yields() -> Dictionary:
	# Dogs don't get butchered — the spec says carcass decays to OM only.
	# Returning empty keeps the butcher station's menu blank on click.
	return {}


# =============================================================
# LGD-specific: meat consumption + protection aura emission.
# =============================================================

func day_tick() -> void:
	if state == STATE_DEAD:
		return
	# Pull meat from storage FIRST so the base day_tick doesn't try to
	# forage a non-existent pasture tile.
	_consume_meat_or_fallback()
	super.day_tick()


func _consume_meat_or_fallback() -> void:
	var ft: Node = get_node_or_null("/root/FarmTotals")
	if ft == null:
		return
	var meat_on_hand: float = float(ft.call("get_resource", "meat"))
	if meat_on_hand >= 0.5:
		ft.call("spend_resource", "meat", 0.5)
		# Satisfies the day's hunger in one bite.
		hunger = max(0.0, hunger - 40.0)
		if get_node_or_null("/root/GameLog") != null:
			GameLog.event("lgd_ate_meat", { "species": species_id })
	else:
		# Fallback to plant_trim (dogs WILL eat scraps if meat runs out).
		var trim_on_hand: float = float(ft.call("get_resource", "plant_trim"))
		if trim_on_hand >= 0.5:
			ft.call("spend_resource", "plant_trim", 0.5)
			hunger = max(0.0, hunger - 25.0)
			if get_node_or_null("/root/GameLog") != null:
				GameLog.event("lgd_ate_fallback", { "species": species_id })


func _process(delta: float) -> void:
	super._process(delta)
	# Hourly protection pulse. The predator-system agent subscribes to
	# this signal + clips spawn rolls inside our radius.
	_protect_t += delta
	if _protect_t >= PROTECT_EMIT_HZ:
		_protect_t = 0.0
		if state != STATE_DEAD:
			emit_signal("lgd_protects", global_position, PROTECT_RADIUS)


# =============================================================
# Primitive helpers.
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
