## Fairy Permaculture — Carcass node.
##
## Passive world node spawned by AnimalEntity.die(). Holds the species
## yield table; right-clicking it (via butcher station proximity check)
## surfaces the "Butcher <species>" action. If left alone for 5 game-days
## the carcass decays into a small OM bump on its tile and queue_frees —
## matches the "ignored corpse decays" rule from the animal-system spec.
##
## Visuals: a desaturated husk — we lerp the usual live-animal palette
## toward COMPOST so it reads matter-of-fact, never gruesome. Stays
## inside the Ghibli-lite happy-palette rule.
extends StaticBody3D


signal butchered(carcass: Node3D, yields_dict: Dictionary)
signal decayed(carcass: Node3D)


const DECAY_DAYS: int = 5


## Populated by AnimalEntity.die() via setup().
var species_id: String = ""
var species_display_name: String = "Animal"
var carcass_yields: Dictionary = {}
var age_years_at_death: float = 0.0

var _decay_days: int = 0
var _body_mat: StandardMaterial3D
var _t: float = 0.0
var _base: MeshInstance3D
var _click_shape: CollisionShape3D
var _butchered: bool = false


func setup(sid: String, display: String, yields_dict: Dictionary, age_yr: float) -> void:
	species_id = sid
	species_display_name = display
	carcass_yields = yields_dict
	age_years_at_death = age_yr
	# If the scene entered the tree BEFORE setup() was called (common —
	# the caller does add_child then setup), we need to (re)build the
	# husk so the color + label reflect the species. _ready() already
	# built a minimal placeholder; just refresh the tint here.
	if _body_mat != null:
		_body_mat.albedo_color = _husk_tint()


func _ready() -> void:
	input_ray_pickable = true
	add_to_group("carcasses")
	# Build the husk mesh — a flattened buff-toned sphere. The body shape
	# stays vague enough to read as "small animal" without committing to
	# a species silhouette (each species species_id tags it for butcher).
	_base = MeshInstance3D.new()
	var m: SphereMesh = SphereMesh.new()
	m.radius = 0.28
	m.height = 0.36
	_base.mesh = m
	_base.scale = Vector3(1.35, 0.55, 1.0)
	_base.position = Vector3(0, 0.12, 0)
	_body_mat = StandardMaterial3D.new()
	_body_mat.albedo_color = _husk_tint()
	_body_mat.shading_mode = BaseMaterial3D.SHADING_MODE_PER_PIXEL
	_base.material_override = _body_mat
	add_child(_base)

	# Click shape so butcher station proximity checks can raycast us.
	_click_shape = CollisionShape3D.new()
	var bs: BoxShape3D = BoxShape3D.new()
	bs.size = Vector3(0.8, 0.5, 0.6)
	_click_shape.shape = bs
	_click_shape.position = Vector3(0, 0.25, 0)
	add_child(_click_shape)

	# Hook day advance for decay timing.
	var sched: Node = get_node_or_null("/root/Scheduler")
	if sched != null and sched.has_signal("day_advanced"):
		sched.day_advanced.connect(_on_day_advanced)

	mouse_entered.connect(_on_hover.bind(true))
	mouse_exited.connect(_on_hover.bind(false))


func _husk_tint() -> Color:
	# Warm-muted "sun-bleached" tone. Species gives a tiny shift so a
	# chicken carcass reads slightly tawnier than a duck would — but
	# everything stays inside WARM_STONE ↔ EARTH.
	match species_id:
		"chicken":
			return Palette.STRAW_DRY.lerp(Palette.WARM_STONE, 0.5)
		"duck":
			return Palette.MOON.lerp(Palette.WARM_STONE, 0.4)
		_:
			return Palette.WARM_STONE


func _on_hover(on: bool) -> void:
	if _body_mat == null:
		return
	_body_mat.rim_enabled = on
	_body_mat.rim = 0.9 if on else 0.0
	_body_mat.rim_tint = 0.75
	_body_mat.emission_enabled = on
	_body_mat.emission = Palette.CORAL
	_body_mat.emission_energy_multiplier = 0.2 if on else 0.0


func _process(delta: float) -> void:
	_t += delta
	# Subtle settle: the husk tips over the first few seconds so the
	# player sees the moment of death read visually.
	if _t < 1.2:
		rotation.z = min(PI * 0.10, rotation.z + delta * 0.25)


func _on_day_advanced(_d: int, _s: String, _y: int) -> void:
	if _butchered:
		return
	_decay_days += 1
	# Visual fade: alpha dips as decay progresses so the player reads
	# "this is rotting." We don't enable full transparency until we're
	# really ready to vanish to avoid the transparent-on-GL-Compatibility
	# pitfall documented in feedback_qa_gate_mandatory.md.
	if _decay_days >= DECAY_DAYS - 1:
		_body_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		_body_mat.albedo_color.a = 0.5
	if _decay_days >= DECAY_DAYS:
		# OM bump on tile. Phase 1 uses GameLog.event so the soil-engine
		# agent can wire `WorldGrid.bump_om(pos, kg)` without touching
		# this file.
		if get_node_or_null("/root/GameLog") != null:
			GameLog.event("carcass_decayed", {
				"species": species_id,
				"pos": [global_position.x, global_position.z],
			})
		emit_signal("decayed", self)
		queue_free()


## Called by ButcherStation.complete() once the butcher labor finishes.
## Returns the yield dict back to the caller so it can deposit the
## correct items to storage via the normal TaskQueue path.
func butcher() -> Dictionary:
	if _butchered:
		return {}
	_butchered = true
	emit_signal("butchered", self, carcass_yields)
	# Mark the first-butcher progression milestone → unlocks kiln.
	var prog: Node = get_node_or_null("/root/Progression")
	if prog != null and prog.has_method("mark_first_butcher"):
		prog.call("mark_first_butcher")
	# Paired visual + audio. CORAL-toward-HONEY pop so the moment reads
	# respectful/permaculture-accepting, not gruesome.
	if get_node_or_null("/root/Juice") != null:
		var yields_str: String = _yield_summary()
		Juice.pop(global_position + Vector3(0, 2.2, 0), yields_str, Palette.HONEY.lerp(Palette.CORAL, 0.35))
	if get_node_or_null("/root/AudioManager") != null:
		AudioManager.play("compost-scoop", -4.0)
	queue_free()
	return carcass_yields


func _yield_summary() -> String:
	var parts: Array[String] = []
	for k in carcass_yields.keys():
		parts.append("+%d %s" % [int(carcass_yields[k]), String(k)])
	return " ".join(parts)


# =============================================================
# Universal right-click contract
# =============================================================
#
# The butcher station proximity check is owned by butcher_station.gd —
# it surfaces the "Butcher <species>" action when the player right-
# clicks a carcass AND a station is within range. The carcass itself
# reports an empty list when no station is nearby, so players can't
# butcher freestyle without the tool. An inspector row stays visible
# either way so the node still responds to right-click.

func get_context_actions() -> Array:
	var out: Array = []
	# Always-visible row so the player sees the yield summary on hover.
	out.append(Interactable.make_action(
		"inspect_carcass", "Inspect carcass (%s)" % _yield_summary(), 0.0,
		{}, {}, "", Interactable.DROP_NONE, 1,
	))
	# Check for a butcher station within 10 tiles. If present, surface
	# the butcher action — it delegates through ButcherStation.complete
	# so the station remains the true origin of the labor.
	var station: Node3D = _nearest_butcher_station()
	if station != null:
		var cost_empty: Dictionary = {}
		var action: Dictionary = Interactable.make_action(
			"butcher_carcass",
			"Butcher %s (%s)" % [species_display_name, _yield_summary()],
			15.0,
			cost_empty,
			carcass_yields.duplicate(),
			"", Interactable.DROP_STORAGE, 2,
		)
		# Flag the station the TaskQueue should credit on complete.
		action["butcher_station_id"] = station.get_instance_id()
		out.append(action)
	return out


func display_name() -> String:
	return "%s Carcass" % species_display_name


## Handle the TaskQueue `complete()` callback when the player queued
## the butcher_carcass action directly on us. The station (if any)
## takes over; we just call butcher() which publishes yields.
func complete(action: Dictionary) -> void:
	var id: String = String(action.get("id", ""))
	if id == "butcher_carcass":
		butcher()


func _nearest_butcher_station() -> Node3D:
	var st: SceneTree = get_tree()
	if st == null:
		return null
	var stations: Array = st.get_nodes_in_group("butcher_stations")
	var best: Node3D = null
	var best_d: float = INF
	for s in stations:
		if s == null or not is_instance_valid(s):
			continue
		var d: float = global_position.distance_squared_to((s as Node3D).global_position)
		if d < best_d and d < 10.0 * 10.0:
			best = s
			best_d = d
	return best
