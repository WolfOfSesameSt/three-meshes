## Fairy Permaculture — MultiMesh bee-dot swarm.
##
## Attach one BeeSwarm child to any habitat that wants visible pollinators
## (Warré hive, mason bee tubes). Each habitat calls configure_for_hive()
## or configure_for_tubes() to set instance count + tether radius.
##
## Visibility is STATEFUL: the host writes `bee_swarm_visible: bool` and
## `FORAGE_RADIUS_M: float` on itself each frame, and we read those. When
## off (night, winter, no bees) we hide the MultiMeshInstance3D entirely.
## No silent ticks — visibility state changes always paired with the
## host's logged state transitions (winter/night).
##
## Performance budget:
##   - 15 instances per hive, 6 per mason_bee_tubes.
##   - Per frame: update_instance_transform for each instance (cheap).
##   - Total across farm with 2 hives + 4 tube sets = 54 bees at peak,
##     well under the MultiMesh budget (spec: stay <5000 world-wide).
extends Node3D


const DEFAULT_HIVE_COUNT: int = 15
const DEFAULT_TUBES_COUNT: int = 6
const BODY_SIZE: Vector2 = Vector2(0.12, 0.12)
const WANDER_SPEED: float = 2.8      # m/s cruise speed
const REACH_EPSILON: float = 0.5     # re-target when within this many meters

var host: Node3D
var forage_radius: float = 10.0
var base_height: float = 1.2     # meters above host position
var instance_count: int = DEFAULT_HIVE_COUNT

var _mmi: MultiMeshInstance3D
var _mm: MultiMesh
var _bee_mat: StandardMaterial3D
var _targets: Array = []          # Vector3 per bee
var _positions: Array = []        # Vector3 per bee
var _rng: RandomNumberGenerator = RandomNumberGenerator.new()
var _t: float = 0.0


func _ready() -> void:
	_rng.randomize()
	_build_multimesh()
	# Initial tethering — if configure_* was not called, use sane defaults.
	if host == null:
		host = get_parent() as Node3D
	_init_bees()


func configure_for_hive(parent_hive: Node3D) -> void:
	host = parent_hive
	instance_count = DEFAULT_HIVE_COUNT
	forage_radius = 25.0
	base_height = 1.1
	# Rebuild with new count if already built.
	if _mm != null:
		_mm.instance_count = instance_count
		_init_bees()


func configure_for_tubes(parent_tubes: Node3D) -> void:
	host = parent_tubes
	instance_count = DEFAULT_TUBES_COUNT
	forage_radius = 8.0
	base_height = 0.6
	if _mm != null:
		_mm.instance_count = instance_count
		_init_bees()


func _build_multimesh() -> void:
	_bee_mat = StandardMaterial3D.new()
	_bee_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	# Warm HONEY body with a tiny emission so bee dots stay readable even
	# inside the hive's shadow at dawn/dusk.
	_bee_mat.albedo_color = Palette.HONEY
	_bee_mat.emission_enabled = true
	_bee_mat.emission = Palette.HONEY
	_bee_mat.emission_energy_multiplier = 0.3
	_bee_mat.cull_mode = BaseMaterial3D.CULL_DISABLED

	var quad: QuadMesh = QuadMesh.new()
	quad.size = BODY_SIZE
	quad.material = _bee_mat

	_mm = MultiMesh.new()
	_mm.transform_format = MultiMesh.TRANSFORM_3D
	_mm.use_colors = true
	_mm.mesh = quad
	_mm.instance_count = instance_count

	_mmi = MultiMeshInstance3D.new()
	_mmi.name = "BeeSwarmMMI"
	_mmi.multimesh = _mm
	_mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_mmi)


func _init_bees() -> void:
	_positions.clear()
	_targets.clear()
	if host == null:
		return
	var origin: Vector3 = host.global_position + Vector3(0, base_height, 0)
	for i in range(instance_count):
		var p: Vector3 = origin + _random_offset(forage_radius * 0.3)
		_positions.append(p)
		_targets.append(_pick_target())
		var t: Transform3D = Transform3D()
		t.origin = p
		# Tiny jitter scale for visual variety.
		var s: float = 0.85 + _rng.randf() * 0.35
		t.basis = Basis().scaled(Vector3(s, s, s))
		_mm.set_instance_transform(i, t)
		# Body color — alternate HONEY and an EARTH-tinted body for stripe
		# variety (we can't easily texture stripes on a quad, so we fake via
		# per-instance tinting).
		var col: Color = Palette.HONEY if (i % 2 == 0) else Palette.HONEY.lerp(Palette.EARTH, 0.35)
		_mm.set_instance_color(i, Palette.clamp_happy(col))


func _process(delta: float) -> void:
	_t += delta
	if host == null or _mm == null:
		return
	# Gate visibility from host.
	var visible_flag: bool = true
	if host.get("bee_swarm_visible") != null:
		visible_flag = bool(host.get("bee_swarm_visible"))
	if _mmi.visible != visible_flag:
		_mmi.visible = visible_flag
	if not visible_flag:
		return

	var origin: Vector3 = host.global_position + Vector3(0, base_height, 0)
	for i in range(instance_count):
		var pos: Vector3 = _positions[i]
		var target: Vector3 = _targets[i]
		var dir: Vector3 = target - pos
		var dist: float = dir.length()
		if dist < REACH_EPSILON:
			# Re-target — occasionally back to origin, mostly new flower spot.
			if _rng.randf() < 0.2:
				_targets[i] = origin + _random_offset(1.0)
			else:
				_targets[i] = _pick_target()
			target = _targets[i]
			dir = target - pos
			dist = max(dist, 0.01)
		var step: Vector3 = dir.normalized() * WANDER_SPEED * delta
		# Add a small sinusoidal bob for bee-ness.
		var bob: float = sin(_t * 8.0 + float(i) * 1.37) * 0.05
		pos += step + Vector3(0, bob * delta, 0)
		# Clamp Y to host-origin band so bees don't swim through ground.
		if pos.y < host.global_position.y + 0.25:
			pos.y = host.global_position.y + 0.25
		_positions[i] = pos
		var t: Transform3D = Transform3D()
		t.origin = pos
		var s: float = 0.85 + 0.15 * sin(_t * 6.0 + float(i))
		t.basis = Basis().scaled(Vector3(s, s, s))
		_mm.set_instance_transform(i, t)


func _pick_target() -> Vector3:
	if host == null:
		return Vector3.ZERO
	# Bees sample random world positions within forage_radius of the host.
	# If WorldGrid is present we prefer tiles with flower_density > 0 —
	# biased pull that reads as "going to the flowers".
	var origin: Vector3 = host.global_position + Vector3(0, base_height, 0)
	var candidate: Vector3 = origin + _random_offset(forage_radius)
	var wg: Node = get_node_or_null("/root/WorldGrid")
	if wg != null and wg.has_method("tile_flora_at"):
		# Up to 3 rejection rolls — accept on first flowering hit.
		for _try in range(3):
			var probe: Vector3 = origin + _random_offset(forage_radius)
			var season: String = _current_season()
			var data: Variant = wg.call("tile_flora_at", probe, season)
			if data is Dictionary and float((data as Dictionary).get("density", 0.0)) > 0.15:
				candidate = probe
				# Land low — close to the flower.
				candidate.y = probe.y + 0.35
				return candidate
	# Ambient cruise height — 0.4 above base.
	candidate.y = origin.y + _rng.randf_range(-0.3, 0.5)
	return candidate


func _random_offset(radius: float) -> Vector3:
	var angle: float = _rng.randf() * TAU
	var r: float = sqrt(_rng.randf()) * radius
	return Vector3(cos(angle) * r, 0.0, sin(angle) * r)


func _current_season() -> String:
	var sched: Node = get_node_or_null("/root/Scheduler")
	if sched == null:
		return "summer"
	if sched.has_method("current_season"):
		return String(sched.call("current_season"))
	return "summer"
