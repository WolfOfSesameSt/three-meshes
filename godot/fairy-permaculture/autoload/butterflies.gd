## Fairy Permaculture — butterfly presence autoload.
##
## Pure visual reward for biodiversity + vitality. Butterflies appear
## once ANY of these hold AND it's spring or summer:
##   • WorldState.vitality > 0.6
##   • LifetimeStats.distinct_species_count() > 5
##   • Progression.is_biodiversity_unlocked("guild_design")
##
## First arrival stamps LifetimeStats.firsts["first_butterfly_day"] and
## fires a parchment banner + paired chime. No production effect.
##
## Implementation:
##   • One MultiMeshInstance3D attached to the scene root on first
##     activation. Instance count = 8 + min(species, 12).
##   • Each butterfly wanders between random flowering tiles (read from
##     WorldGrid.tile_flora_at) and nearby tree tops. Sinusoidal Y bob +
##     tilted quads for flap readability.
##   • Deactivation when conditions drop below threshold: hide the MMI.
##     (Re-activation on next threshold cross — no duplicate banner.)
##
## Save/load: first_butterfly_day is already handled via LifetimeStats.firsts
## (additive key). Current visibility + species count are derived state so
## no persistence needed here.

extends Node


signal butterfly_seen(species_count: int)


const MAX_INSTANCES: int = 20
const BASE_INSTANCES: int = 8
const WANDER_SPEED: float = 1.5
const REACH_EPSILON: float = 0.7
const BODY_SIZE: Vector2 = Vector2(0.26, 0.26)


var active: bool = false
var _first_arrival_fired: bool = false
var _mmi: MultiMeshInstance3D
var _mm: MultiMesh
var _bmat: StandardMaterial3D
var _positions: Array = []
var _targets: Array = []
var _colors: Array = []
var _instance_count: int = 0
var _rng: RandomNumberGenerator = RandomNumberGenerator.new()
var _t: float = 0.0


func _ready() -> void:
	_rng.randomize()
	var sched: Node = get_node_or_null("/root/Scheduler")
	if sched != null and sched.has_signal("day_advanced"):
		if not sched.is_connected("day_advanced", _on_day_advanced):
			sched.day_advanced.connect(_on_day_advanced)
	# Check activation at each scene change so the MMI attaches to the
	# correct scene root.
	call_deferred("_evaluate_activation")


func _process(delta: float) -> void:
	_t += delta
	if not active or _mm == null or not _mmi.visible:
		return
	_update_positions(delta)


# =====================================================================
# Activation gating
# =====================================================================

func _on_day_advanced(_day: int, _season: String, _year: int) -> void:
	_evaluate_activation()


func _evaluate_activation() -> void:
	var season: String = "summer"
	var sched: Node = get_node_or_null("/root/Scheduler")
	if sched != null and sched.has_method("current_season"):
		season = String(sched.call("current_season"))

	var vitality_ok: bool = false
	var ws: Node = get_node_or_null("/root/WorldState")
	if ws != null:
		vitality_ok = float(ws.get("vitality")) > 0.6

	var diversity_ok: bool = false
	var ls: Node = get_node_or_null("/root/LifetimeStats")
	var species_count: int = 0
	if ls != null and ls.has_method("distinct_species_count"):
		species_count = int(ls.call("distinct_species_count"))
		diversity_ok = species_count > 5

	var unlock_ok: bool = false
	var prog: Node = get_node_or_null("/root/Progression")
	if prog != null and prog.has_method("is_biodiversity_unlocked"):
		unlock_ok = bool(prog.call("is_biodiversity_unlocked", "guild_design"))

	var season_ok: bool = season in ["spring", "summer"]
	var should_be_active: bool = (vitality_ok or diversity_ok or unlock_ok) and season_ok

	if should_be_active and not active:
		_activate(species_count)
	elif not should_be_active and active:
		_deactivate()


func _activate(species_count: int) -> void:
	active = true
	_ensure_multimesh()
	_instance_count = clamp(BASE_INSTANCES + min(species_count, 12), BASE_INSTANCES, MAX_INSTANCES)
	# MultiMesh stays sized to MAX_INSTANCES; hidden slots are zero-scaled
	# in `_push_instances`. Resizing here would invalidate the indices that
	# the per-frame zero-out loop touches.
	if _mm != null:
		_init_butterflies()
	if _mmi != null:
		_mmi.visible = true
	if not _first_arrival_fired:
		_first_arrival_fired = true
		_fire_first_arrival_banner()
	emit_signal("butterfly_seen", species_count)


func _deactivate() -> void:
	active = false
	if _mmi != null:
		_mmi.visible = false


func _fire_first_arrival_banner() -> void:
	# Stamp the first-butterfly day via LifetimeStats.stamp_first — keeps
	# the firsts catalogue in one place (UX scroll reads it).
	var ls: Node = get_node_or_null("/root/LifetimeStats")
	if ls != null and ls.has_method("stamp_first"):
		ls.call("stamp_first", "first_butterfly_day")
	# Center-screen parchment pop. We aim at the current camera anchor so
	# the banner reads regardless of where the player is looking.
	var root: Node = get_tree().current_scene
	var anchor: Vector3 = Vector3(0.0, 3.0, 0.0)
	if root != null:
		var cam: Camera3D = root.find_child("Camera3D", true, false) as Camera3D
		if cam != null:
			anchor = cam.global_position + cam.global_transform.basis.z * -6.0 + Vector3(0, 1.5, 0)
	if get_node_or_null("/root/Juice") != null:
		Juice.pop(anchor, "Butterflies have arrived. Your farm is alive.", Palette.CORAL)
		Juice.burst(anchor, Palette.CORAL.lerp(Palette.HONEY, 0.30), 30)
		Juice.bump(0.18)
	if get_node_or_null("/root/AudioManager") != null and AudioManager.has_method("play"):
		AudioManager.play("compost-finish", -3.0)
	if get_node_or_null("/root/GameLog") != null:
		GameLog.event("butterflies_arrived", {})


# =====================================================================
# MultiMesh visuals
# =====================================================================

func _ensure_multimesh() -> void:
	if _mmi != null and is_instance_valid(_mmi):
		return
	var root: Node = get_tree().current_scene
	if root == null:
		return
	_bmat = StandardMaterial3D.new()
	_bmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_bmat.albedo_color = Color(1.0, 1.0, 1.0, 1.0)
	_bmat.vertex_color_use_as_albedo = true
	_bmat.cull_mode = BaseMaterial3D.CULL_DISABLED
	# A little emission so butterflies pop against dark tree backdrops.
	_bmat.emission_enabled = true
	_bmat.emission = Palette.CORAL
	_bmat.emission_energy_multiplier = 0.15

	var quad: QuadMesh = QuadMesh.new()
	quad.size = BODY_SIZE
	quad.material = _bmat

	_mm = MultiMesh.new()
	_mm.transform_format = MultiMesh.TRANSFORM_3D
	_mm.use_colors = true
	_mm.mesh = quad
	_mm.instance_count = MAX_INSTANCES

	_mmi = MultiMeshInstance3D.new()
	_mmi.name = "ButterflyFleet"
	_mmi.multimesh = _mm
	_mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(_mmi)


func _init_butterflies() -> void:
	_positions.clear()
	_targets.clear()
	_colors.clear()
	for i in range(MAX_INSTANCES):
		# Spawn radially within 25 m of origin.
		var angle: float = _rng.randf() * TAU
		var r: float = _rng.randf_range(4.0, 25.0)
		var p: Vector3 = Vector3(cos(angle) * r, 1.5 + _rng.randf() * 1.0, sin(angle) * r)
		_positions.append(p)
		_targets.append(_pick_target())
		# Color — pick from CORAL, HONEY, BERRY per-instance so the flock
		# reads as "variety" rather than a monoculture.
		var palette: Array[Color] = [
			Palette.CORAL,
			Palette.HONEY,
			Palette.BERRY,
			Palette.CORAL.lerp(Palette.HONEY, 0.35),
			Palette.BERRY.lerp(Palette.MOON, 0.30),
		]
		var col: Color = palette[_rng.randi() % palette.size()]
		_colors.append(Palette.clamp_happy(col))
	_push_instances()


func _push_instances() -> void:
	if _mm == null:
		return
	var zero_t: Transform3D = Transform3D()
	zero_t.basis = Basis().scaled(Vector3(0, 0, 0))
	for i in range(MAX_INSTANCES):
		if i < _instance_count:
			var t: Transform3D = Transform3D()
			t.origin = _positions[i]
			var s: float = 0.9 + 0.2 * sin(_t * 4.0 + float(i))
			t.basis = Basis().scaled(Vector3(s, s, s))
			_mm.set_instance_transform(i, t)
			_mm.set_instance_color(i, _colors[i])
		else:
			_mm.set_instance_transform(i, zero_t)


func _update_positions(delta: float) -> void:
	for i in range(_instance_count):
		var pos: Vector3 = _positions[i]
		var target: Vector3 = _targets[i]
		var dir: Vector3 = target - pos
		var dist: float = dir.length()
		if dist < REACH_EPSILON:
			_targets[i] = _pick_target()
			target = _targets[i]
			dir = target - pos
			dist = max(dist, 0.01)
		var step: Vector3 = dir.normalized() * WANDER_SPEED * delta
		# Distinct flutter pattern — sharper y-bob + slight x-weave so
		# butterflies read differently from bees.
		var bob: float = sin(_t * 6.0 + float(i) * 0.91) * 0.25 * delta
		var weave: float = cos(_t * 2.5 + float(i) * 1.3) * 0.15 * delta
		pos += step + Vector3(weave, bob, 0)
		if pos.y < 0.6:
			pos.y = 0.6
		_positions[i] = pos
	_push_instances()


func _pick_target() -> Vector3:
	# Prefer a flowering tile; fall back to a random point in a 25 m ring.
	var wg: Node = get_node_or_null("/root/WorldGrid")
	var season: String = "summer"
	var sched: Node = get_node_or_null("/root/Scheduler")
	if sched != null and sched.has_method("current_season"):
		season = String(sched.call("current_season"))
	if wg != null and wg.has_method("tile_flora_at"):
		for _try in range(4):
			var angle: float = _rng.randf() * TAU
			var r: float = _rng.randf_range(3.0, 25.0)
			var probe: Vector3 = Vector3(cos(angle) * r, 0.0, sin(angle) * r)
			var data: Variant = wg.call("tile_flora_at", probe, season)
			if data is Dictionary and float((data as Dictionary).get("density", 0.0)) > 0.1:
				probe.y = 1.2 + _rng.randf() * 0.4
				return probe
	var angle2: float = _rng.randf() * TAU
	var r2: float = _rng.randf_range(6.0, 22.0)
	return Vector3(cos(angle2) * r2, 1.5 + _rng.randf() * 0.8, sin(angle2) * r2)


# =====================================================================
# Debug API
# =====================================================================

func debug_force_activate(species_count: int = 8) -> void:
	_activate(species_count)


func debug_force_deactivate() -> void:
	_deactivate()


func is_active() -> bool:
	return active
