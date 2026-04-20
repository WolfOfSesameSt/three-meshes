## Fairy Permaculture — Barn Cat.
##
## The rodent-hunter. Cats tile-hunt every day within ~8 tiles of their
## home position, asking the Rodents autoload to drain the local rodent
## population. If rodent pressure is below threshold, the cat falls back
## to 0.1 meat/day from FarmTotals (matches feedback_self_balancing_ecology
## — cats only dip into stored meat when there's nothing to hunt).
##
## Locked design refs (project_animal_system.md):
##   hunt_radius   : 8 tiles (matches Rodents.CAT_HUNT_RADIUS)
##   hunger_rate   : 1.0 / day
##   thirst_rate   : 1.0 / day
##   lifespan      : N(5040, 900) days — ≈14 game years
##   outputs       : none (service animal — rodent control)
##   yields (death): none (we don't butcher our cats — carcass decays to OM)
##
## The soft invisible win (per feedback_self_balancing_ecology): a barn
## cat saves ~2 seeds/week spoilage. The player notices its value only
## when they don't have one.
extends AnimalEntity


# Warm charcoal tabby — INK body with WARM_STONE belly stripe so it still
# reads as a happy warm silhouette against the coop. Colors trace to
# Palette.* only.
var _body_color: Color = Palette.COMPOST.lerp(Palette.EARTH, 0.4)
var _belly_color: Color = Palette.WARM_STONE.lerp(Palette.MOON, 0.35)
var _muzzle_color: Color = Palette.MOON.lerp(Palette.STRAW_DRY, 0.30)
var _paw_color: Color  = Palette.EARTH.lerp(Palette.COMPOST, 0.40)
var _ear_color: Color  = Palette.COMPOST.lerp(Palette.EARTH, 0.30)
var _eye_color: Color  = Palette.HONEY


## Tile radius in which the cat hunts rodents. Matches the Rodents
## autoload default.
const HUNT_RADIUS: float = 8.0


func _species_configure() -> void:
	species_id = "barn_cat"
	species_display_name = "Barn Cat"
	species_lifespan_mean = 5040.0
	species_lifespan_stddev = 900.0
	if override_max_age_days <= 0:
		max_age_days = int(_rand_normal(species_lifespan_mean, species_lifespan_stddev))
	daily_hunger_rate = 1.0
	daily_thirst_rate = 1.0
	forage_tiles = []
	forage_range = HUNT_RADIUS
	move_speed = 1.4  # m/s — stalk-speed.
	output_per_day = {}


# Phase-3 env influence: cats leave a dead-rodent pellet decor at barn
# door (just the log for now — decor hook lands later). Drains rodent
# pressure AND songbird count (the cat's PROBLEM — indicator species
# decline). No tile change.
func _species_env_influence() -> String:
	var wildlife: Node = get_node_or_null("/root/Wildlife")
	if wildlife != null and wildlife.has_method("bump_pest_pressure"):
		wildlife.call("bump_pest_pressure", "rodent", -1.0)
	return "Cat-patrolled (-rodent pressure; songbird disturbance)"


func _on_clicked() -> void:
	if state == STATE_DEAD: return
	super._on_clicked()
	# Pet-purr: a longer heart trail + soft aura chime (morale aura
	# hook for nearby fairies lands when fairy behavior lets us poke
	# their mood — for now it's the visual beat).
	if get_node_or_null("/root/Juice") != null:
		Juice.burst(global_position + Vector3(0, 0.6, 0),
			Palette.CORAL.lerp(Palette.MOON, 0.45), 10)


func _build_visuals() -> void:
	# ---- Barrel body: slim + long ----
	var body: MeshInstance3D = _sphere(Vector3(0, 0.35, 0), 0.20, _body_color)
	body.scale = Vector3(1.1, 0.9, 1.6)
	add_child(body)
	_register_body_part(body, _body_color)

	# Lighter belly stripe
	var belly: MeshInstance3D = _sphere(Vector3(0, 0.28, 0), 0.18, _belly_color)
	belly.scale = Vector3(1.05, 0.55, 1.55)
	add_child(belly)
	_register_body_part(belly, _belly_color)

	# ---- Head: small round ----
	var head: MeshInstance3D = _sphere(Vector3(0, 0.54, 0.34), 0.15, _body_color)
	add_child(head)
	_register_body_part(head, _body_color)

	# Muzzle
	var muzzle: MeshInstance3D = _sphere(Vector3(0, 0.46, 0.46), 0.07, _muzzle_color)
	muzzle.scale = Vector3(1.1, 0.7, 0.9)
	add_child(muzzle)
	_register_body_part(muzzle, _muzzle_color)

	# ---- Two pointy ears ----
	for side in [-1, 1]:
		var ear: MeshInstance3D = _cube(
			Vector3(0.10 * float(side), 0.66, 0.30),
			Vector3(0.06, 0.10, 0.06),
			_ear_color,
		)
		ear.rotation.z = 0.3 * float(side)
		add_child(ear)
		_register_body_part(ear, _ear_color)

	# ---- Two HONEY eye dots (sits above muzzle) ----
	for side in [-1, 1]:
		var eye: MeshInstance3D = _sphere(
			Vector3(0.05 * float(side), 0.55, 0.45),
			0.02,
			_eye_color,
		)
		add_child(eye)
		_register_body_part(eye, _eye_color)

	# ---- Four slim legs ----
	var leg_offsets: Array = [
		Vector3(-0.10, 0.17, 0.24),
		Vector3(0.10, 0.17, 0.24),
		Vector3(-0.10, 0.17, -0.24),
		Vector3(0.10, 0.17, -0.24),
	]
	for off in leg_offsets:
		var shin: MeshInstance3D = _cylinder(off, 0.03, 0.035, 0.28, _body_color)
		add_child(shin)
		_register_body_part(shin, _body_color)
		var paw: MeshInstance3D = _cube(
			off + Vector3(0, -0.16, 0),
			Vector3(0.06, 0.03, 0.07),
			_paw_color,
		)
		add_child(paw)
		_register_body_part(paw, _paw_color)

	# ---- Long tail: tipped upward ----
	var tail: MeshInstance3D = _cylinder(Vector3(0, 0.45, -0.38), 0.025, 0.035, 0.50, _body_color)
	tail.rotation.x = 0.6
	add_child(tail)
	_register_body_part(tail, _body_color)


func species_yields() -> Dictionary:
	# Cats aren't butchered — their carcass decays to OM same as the dog.
	return {}


# =============================================================
# Barn-cat-specific: tile-based rodent hunting + meat fallback.
# =============================================================

func day_tick() -> void:
	if state == STATE_DEAD:
		return
	# Ask Rodents how many mice are within hunt radius. If there are any,
	# the cat eats rodents and skips the meat debit entirely. If there
	# aren't, the cat dips into meat storage at the tiny 0.1/day rate.
	_hunt_or_meat_fallback()
	super.day_tick()


func _hunt_or_meat_fallback() -> void:
	var rodents: Node = get_node_or_null("/root/Rodents")
	var hunted: bool = false
	if rodents != null and rodents.has_method("cat_hunt_at"):
		var kills: float = float(rodents.call("cat_hunt_at", global_position, HUNT_RADIUS))
		if kills > 0.0:
			hunted = true
			hunger = max(0.0, hunger - 25.0)
			if get_node_or_null("/root/GameLog") != null:
				GameLog.event("cat_hunted", {
					"species": species_id,
					"kills": kills,
					"pos": [global_position.x, global_position.z],
				})
	if hunted:
		return
	# Fallback: 0.1 meat/day. Tiny so ONE cat doesn't drain the dog food.
	var ft: Node = get_node_or_null("/root/FarmTotals")
	if ft == null:
		return
	if float(ft.call("get_resource", "meat")) >= 0.1:
		ft.call("spend_resource", "meat", 0.1)
		hunger = max(0.0, hunger - 15.0)


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
