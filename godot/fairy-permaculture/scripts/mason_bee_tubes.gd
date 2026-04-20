## Fairy Permaculture — Mason Bee Tubes habitat buildable.
##
## Cheap day-0 pollinator habitat — per `feedback_self_balancing_ecology.md`,
## we don't spawn bees directly. The Tubes are a BUILDABLE; once placed +
## with flowering plants in range, mason bees "arrive" (a one-time juice
## pop + soft hum) and the surrounding flowering plants get a +20 % fruit
## bonus the next time they cycle through FLOWERING.
##
## Visual: a small wooden box ~0.45 m tall with ~10 hollow reed-like
## tubes tucked inside. All colors trace to Palette.* per the happy-
## palette rule.
##
## Cost + labor:
##   wood: 2, twigs: 4, labor: 20 s.
##
## Aura mechanic:
##   Every ~2 seconds we sweep plants-in-group within POLLINATION_RADIUS.
##   When a flowering plant is found within range, we set its `pollinated`
##   meta flag. The plant's fruit ripening loop reads that flag elsewhere
##   (future wire-up) to bump yield by 20 %. The aura is active while the
##   tubes exist.
##
## Paired feedback:
##   One-time "Mason bees arrived" pop the first time both conditions hold
##   (tubes placed + flowering plant in range). Short `pollinator-hum-loop`
##   pulse plays with it.
extends StaticBody3D


signal clicked(tubes: Node3D)
signal hover_changed(tubes: Node3D, hovered: bool)


const POLLINATION_RADIUS: float = 8.0
const AURA_TICK_INTERVAL_S: float = 2.0
const FRUIT_YIELD_BONUS: float = 0.20   # +20 % when `pollinated` meta is set


var _wood_mat: StandardMaterial3D
var _tube_mat: StandardMaterial3D
var _arrival_announced: bool = false
var _t_since_aura: float = 0.0
var _in_construction: bool = false
## Phase 3 — Bee-dot visibility flag read by fx/bee_swarm. Updated from
## process loop based on daytime + non-winter + mason bees arrived.
var bee_swarm_visible: bool = false


func _ready() -> void:
	add_to_group("mason_bee_tubes")
	add_to_group("animal_habitats")
	add_to_group("wildlife_habitats")
	input_ray_pickable = true
	_build_visual()
	_build_click_area()
	mouse_entered.connect(_on_mouse_enter)
	mouse_exited.connect(_on_mouse_exit)
	input_event.connect(_on_click_input)
	# Honey trickle — after mason bees have arrived, the pollinator
	# support lets wild floral honey deposit into fairy_food.honey each
	# game-day. This is a MINIMAL honey producer scaffolded day-1 so the
	# fairy-food math works at all (the real Warre hive + bee-keeping
	# loop is future work per `feedback_full_soil_engine.md` scope).
	# See `feedback_self_balancing_ecology.md` — the mechanic reads as
	# "wildlife auto-immigrates when habitat exists, ecology runs itself."
	if has_node("/root/Scheduler"):
		var sched: Node = get_node("/root/Scheduler")
		if sched.has_signal("day_advanced") and not sched.is_connected("day_advanced", _on_day_advanced):
			sched.connect("day_advanced", _on_day_advanced)
	# Phase 3 — attach a bee_swarm child. Defensive load so mason_bee_tubes
	# still works if the swarm scene is absent.
	_attach_bee_swarm()


func _attach_bee_swarm() -> void:
	if not ResourceLoader.exists("res://scenes/fx/bee_swarm.tscn"):
		return
	var packed: PackedScene = load("res://scenes/fx/bee_swarm.tscn") as PackedScene
	if packed == null:
		return
	var swarm: Node = packed.instantiate()
	swarm.name = "BeeSwarm"
	add_child(swarm)
	if swarm.has_method("configure_for_tubes"):
		swarm.call("configure_for_tubes", self)


func _process(delta: float) -> void:
	if _in_construction:
		return
	_update_bee_swarm_visibility()
	_t_since_aura += delta
	if _t_since_aura < AURA_TICK_INTERVAL_S:
		return
	_t_since_aura = 0.0
	_tick_aura()


func _update_bee_swarm_visibility() -> void:
	# Mason bees only visible once arrived, daytime, and not winter.
	var season: String = "summer"
	var sched: Node = get_node_or_null("/root/Scheduler")
	if sched != null and sched.has_method("current_season"):
		season = String(sched.call("current_season"))
	var is_day: bool = true
	var root: Node = get_tree().current_scene
	if root != null:
		var sun: Node = root.find_child("Sun", true, false)
		if sun is DirectionalLight3D:
			var light: DirectionalLight3D = sun
			is_day = light.light_energy > 0.05 and light.global_transform.basis.y.y > 0.0
	bee_swarm_visible = _arrival_announced and is_day and season != "winter"


## Sweep plants-in-group within POLLINATION_RADIUS. Flag flowering plants
## as pollinated. Announce the arrival once both conditions hold.
func _tick_aura() -> void:
	var tree: SceneTree = get_tree()
	if tree == null:
		return
	var plants: Array = tree.get_nodes_in_group("plants")
	var any_flowering: bool = false
	for p in plants:
		if p == null or not is_instance_valid(p):
			continue
		var plant_node: Node3D = p as Node3D
		if plant_node == null:
			continue
		var d2: float = plant_node.global_position.distance_squared_to(global_position)
		if d2 > POLLINATION_RADIUS * POLLINATION_RADIUS:
			continue
		# Flag the plant so its next flowering/fruiting cycle reads the
		# pollinator boost. Meta-based — no coupling to plant.gd internals.
		plant_node.set_meta("pollinated", true)
		plant_node.set_meta("pollination_bonus", FRUIT_YIELD_BONUS)
		var stage_var: Variant = plant_node.get("growth_stage")
		if stage_var != null and String(stage_var) == "flowering":
			any_flowering = true
	if any_flowering and not _arrival_announced:
		_announce_arrival()


## Fire the one-time "mason bees arrived" celebration.
func _announce_arrival() -> void:
	_arrival_announced = true
	if AudioManager.has_method("play"):
		AudioManager.play("pollinator-hum-loop", -6.0)
	Juice.pop(global_position + Vector3(0, 1.2, 0),
		"Mason bees arrived", Palette.HONEY)
	Juice.burst(global_position + Vector3(0, 0.7, 0),
		Palette.HONEY.lerp(Palette.CORAL, 0.25), 18)
	Juice.bump(0.12)
	if Engine.has_singleton("GameLog") or Engine.get_main_loop() != null:
		var gl: Node = get_node_or_null("/root/GameLog")
		if gl != null and gl.has_method("event"):
			gl.call("event", "mason_bees_arrived", {
				"pos_x": global_position.x,
				"pos_z": global_position.z,
			})


## Per-game-day honey trickle. Only fires once the mason bees have
## arrived (requires flowering plants in range + the tubes placed).
## Drips 0.5 honey/day into fairy_food.honey so the fairy-food spawn
## math sees a honey channel day-1. The value is intentionally small;
## a full Warre hive / honey-harvest loop is the proper scaling path
## later — this is the MINIMAL producer that unblocks progression.
const HONEY_TRICKLE_PER_DAY: float = 0.5
const HONEY_POP_INTERVAL_DAYS: int = 3   # pop the +honey visual every N days

var _days_since_honey_pop: int = 0


func _on_day_advanced(_day: int, _season: String, _year: int) -> void:
	if not _arrival_announced:
		return
	# Winter dormancy — bees don't forage in freezing weather.
	if _season == "winter":
		return
	if not has_node("/root/FarmTotals"):
		return
	FarmTotals.add_food("honey", HONEY_TRICKLE_PER_DAY)
	_days_since_honey_pop += 1
	# Paired feedback — pop every few days so we're not spamming text
	# every single game-day but the player still sees the honey arrive.
	if _days_since_honey_pop >= HONEY_POP_INTERVAL_DAYS:
		_days_since_honey_pop = 0
		if has_node("/root/Juice"):
			var batched: float = HONEY_TRICKLE_PER_DAY * float(HONEY_POP_INTERVAL_DAYS)
			Juice.pop(global_position + Vector3(0, 1.5, 0),
				"+ %.1f HONEY" % batched, Palette.HONEY)
			Juice.burst(global_position + Vector3(0, 1.0, 0),
				Palette.HONEY.lerp(Palette.CORAL, 0.15), 10)
		if has_node("/root/AudioManager") and AudioManager.has_method("play"):
			AudioManager.play("pollinator-hum-loop", -12.0)


func _build_visual() -> void:
	# Wooden box body — warm EARTH.
	_wood_mat = StandardMaterial3D.new()
	_wood_mat.albedo_color = Palette.clamp_happy(
		Palette.EARTH.lerp(Palette.COMPOST, 0.15)
	)
	_wood_mat.roughness = 0.95
	_tube_mat = StandardMaterial3D.new()
	# Reed tubes — STRAW_DRY lerped toward HONEY for warm hollow-straw look.
	_tube_mat.albedo_color = Palette.clamp_happy(
		Palette.STRAW_DRY.lerp(Palette.HONEY, 0.25)
	)
	_tube_mat.roughness = 0.9

	var box: MeshInstance3D = MeshInstance3D.new()
	var box_mesh: BoxMesh = BoxMesh.new()
	box_mesh.size = Vector3(0.55, 0.45, 0.35)
	box.mesh = box_mesh
	box.position.y = box_mesh.size.y * 0.5
	box.material_override = _wood_mat
	box.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(box)

	# Roof — slanted wedge.
	var roof: MeshInstance3D = MeshInstance3D.new()
	var roof_mesh: PrismMesh = PrismMesh.new()
	roof_mesh.size = Vector3(0.62, 0.12, 0.38)
	roof.mesh = roof_mesh
	roof.position.y = box_mesh.size.y + roof_mesh.size.y * 0.5
	roof.material_override = _wood_mat
	roof.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(roof)

	# Reed tubes — 10 hollow cylinders inset into the front face. We fake
	# the "hollow" look with a slightly darker capped cylinder; the reed
	# color already reads straw-like.
	var rng: RandomNumberGenerator = RandomNumberGenerator.new()
	rng.seed = hash(name) & 0x7fffffff
	var rows: int = 3
	var cols: int = 4
	var spacing_x: float = 0.10
	var spacing_y: float = 0.10
	var start_x: float = -0.5 * (cols - 1) * spacing_x
	var start_y: float = 0.12
	for ry in range(rows):
		for cx in range(cols):
			if ry == 2 and cx == 3:
				continue   # 10 tubes, not 12 — one corner stays wood
			var tube: MeshInstance3D = MeshInstance3D.new()
			var cm: CylinderMesh = CylinderMesh.new()
			cm.top_radius = 0.035 + rng.randf_range(-0.005, 0.005)
			cm.bottom_radius = cm.top_radius
			cm.height = 0.32
			tube.mesh = cm
			# Lay along Z so the open ends face the player from the front.
			tube.rotation = Vector3(PI / 2.0, 0.0, 0.0)
			tube.position = Vector3(
				start_x + cx * spacing_x,
				start_y + ry * spacing_y,
				0.0,
			)
			tube.material_override = _tube_mat
			add_child(tube)


func _build_click_area() -> void:
	var cs: CollisionShape3D = CollisionShape3D.new()
	var box: BoxShape3D = BoxShape3D.new()
	box.size = Vector3(0.65, 0.6, 0.45)
	cs.position.y = 0.3
	cs.shape = box
	add_child(cs)


func _on_mouse_enter() -> void:
	_set_highlight(true)
	emit_signal("hover_changed", self, true)


func _on_mouse_exit() -> void:
	_set_highlight(false)
	emit_signal("hover_changed", self, false)


func _set_highlight(on: bool) -> void:
	var highlight: Color = Palette.HONEY
	for m in [_wood_mat, _tube_mat]:
		if m == null:
			continue
		m.rim_enabled = on
		m.rim = 0.9 if on else 0.0
		m.rim_tint = 0.75
		m.emission_enabled = on
		m.emission = highlight
		m.emission_energy_multiplier = 0.35 if on else 0.0


func _on_click_input(_cam: Node, event: InputEvent, _pos: Vector3, _norm: Vector3, _shape: int) -> void:
	var mb: InputEventMouseButton = event as InputEventMouseButton
	if mb == null or not mb.pressed:
		return
	if mb.button_index == MOUSE_BUTTON_LEFT:
		emit_signal("clicked", self)


# ---- Universal right-click contract ----


func get_context_actions() -> Array:
	# Mason bee tubes are passive — no context actions for MVP. Later we
	# might add "Clean tubes" (removes parasites) or "Inspect" to read the
	# pollination radius. For now, the habitat just exists + does its job.
	return []


func display_name() -> String:
	return "Mason Bee Tubes"


func complete(_action: Dictionary) -> void:
	# No actions to complete yet.
	pass
