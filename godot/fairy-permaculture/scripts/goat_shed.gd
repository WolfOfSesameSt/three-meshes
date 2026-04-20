## Fairy Permaculture — Goat Shed habitat.
##
## Wooden A-frame shed + small fenced pasture. Home base for a goat herd.
## Surfaces "Add doe (x1)" context action that pays the stud fee +
## starter seed cost. Milk output routes to fairy_food.milk via
## AnimalEntity._deliver_output (no habitat-side batch buffer like eggs).
##
## Locked refs (project_animal_system.md):
##   • Unlock chain: first egg collected → goat_shed unlocks.
##   • 6×6 paddock (DESIGN-CHECK visualization — the fence marker is a
##     small primitive ring around the shed).
##   • Habitat-gated: "Add doe" costs plant_trim + seeds + water + a
##     stud-fee paid in fruit (represents seasonal breeding fee).
extends StaticBody3D


signal clicked(shed: Node3D)
signal hover_changed(shed: Node3D, hovered: bool)


const GOAT_SCENE: PackedScene = preload("res://scenes/animals/goat.tscn")
const HERD_CAP: int = 4
const STARTER_HERD_SIZE: int = 1
const FEEDER_CAPACITY: float = 15.0

# Phase-3 containment. Goats are ESCAPE-PRONE (-0.3 fence_strength_bias
# vs chicken baseline) — the daily escape roll fires noticeably more.
@export var containment_radius: float = 7.0
@export var containment_strength: float = 0.75
var escaped_animals: Array = []


var _wall_mat: StandardMaterial3D
var _roof_mat: StandardMaterial3D
var _fence_mat: StandardMaterial3D


var flock: Array = []  # API name kept "flock" for AnimalEntity._flockmate_count
var feeder_contents: Dictionary = { "plant_trim": 0.0 }
var _in_construction: bool = false
var _t: float = 0.0


@onready var _walls: MeshInstance3D = $Walls
@onready var _roof: MeshInstance3D = $Roof
@onready var _fence_posts: Node3D = $FencePosts


func _ready() -> void:
	input_ray_pickable = true
	add_to_group("goat_sheds")
	add_to_group("animal_habitats")
	_build_materials()
	_build_fence()
	mouse_entered.connect(_on_mouse_enter)
	mouse_exited.connect(_on_mouse_exit)
	input_event.connect(_on_click)
	var sched: Node = get_node_or_null("/root/Scheduler")
	if sched != null and sched.has_signal("day_advanced"):
		sched.day_advanced.connect(_on_day_advanced)


func _build_materials() -> void:
	_wall_mat = StandardMaterial3D.new()
	_wall_mat.albedo_color = Palette.EARTH.lerp(Palette.WARM_STONE, 0.25)
	_walls.material_override = _wall_mat
	_roof_mat = StandardMaterial3D.new()
	_roof_mat.albedo_color = Palette.WARM_STONE.lerp(Palette.HONEY, 0.30)
	_roof.material_override = _roof_mat
	_fence_mat = StandardMaterial3D.new()
	_fence_mat.albedo_color = Palette.EARTH.lerp(Palette.COMPOST, 0.30)


func _build_fence() -> void:
	# 6×6 paddock fence — 8 posts around the shed.
	var ring: Array[Vector3] = [
		Vector3(-3, 0.4, -3), Vector3(0, 0.4, -3), Vector3(3, 0.4, -3),
		Vector3(-3, 0.4, 0), Vector3(3, 0.4, 0),
		Vector3(-3, 0.4, 3), Vector3(0, 0.4, 3), Vector3(3, 0.4, 3),
	]
	for c in ring:
		var post: MeshInstance3D = MeshInstance3D.new()
		var cm: CylinderMesh = CylinderMesh.new()
		cm.top_radius = 0.07
		cm.bottom_radius = 0.09
		cm.height = 0.8
		post.mesh = cm
		post.material_override = _fence_mat
		post.position = c
		_fence_posts.add_child(post)


func _on_mouse_enter() -> void:
	set_highlight(true)
	emit_signal("hover_changed", self, true)


func _on_mouse_exit() -> void:
	set_highlight(false)
	emit_signal("hover_changed", self, false)


func set_highlight(on: bool) -> void:
	for m in [_wall_mat, _roof_mat]:
		if m == null:
			continue
		m.rim_enabled = on
		m.rim = 0.9 if on else 0.0
		m.rim_tint = 0.75
		m.emission_enabled = on
		m.emission = Palette.HONEY
		m.emission_energy_multiplier = 0.3 if on else 0.0


func _on_click(_cam: Node, _event: InputEvent, _pos: Vector3, _norm: Vector3, _shape: int) -> void:
	emit_signal("clicked", self)


func _process(delta: float) -> void:
	_t += delta
	if _in_construction:
		return
	if _roof:
		_roof.position.y = 2.35 + 0.015 * sin(_t * 1.2)


func start_construction(duration_s: float) -> void:
	_in_construction = true
	scale = Vector3.ONE * 0.1
	for m in [_wall_mat, _roof_mat]:
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		m.albedo_color.a = 0.35
	var tw: Tween = create_tween()
	tw.tween_property(self, "scale", Vector3.ONE, duration_s) \
		.set_trans(Tween.TRANS_SINE)
	tw.tween_callback(_on_construction_complete)


func _on_construction_complete() -> void:
	_in_construction = false
	for m in [_wall_mat, _roof_mat]:
		m.transparency = BaseMaterial3D.TRANSPARENCY_DISABLED
		m.albedo_color.a = 1.0
	if get_node_or_null("/root/Juice") != null:
		Juice.burst(global_position + Vector3(0, 1.8, 0), Palette.EARTH, 22)
		Juice.pop(global_position + Vector3(0, 2.4, 0), "GOAT SHED READY", Palette.HONEY)
	if get_node_or_null("/root/AudioManager") != null:
		AudioManager.play("compost-scoop", -4.0)


func _on_day_advanced(_d: int, _s: String, _y: int) -> void:
	_prune_flock()


func _prune_flock() -> void:
	var live: Array = []
	for a in flock:
		if a != null and is_instance_valid(a):
			live.append(a)
	flock = live


# =============================================================
# Herd + feeder API (same contract as chicken coop so AnimalEntity works)
# =============================================================

func consume_feeder(amt: float) -> float:
	if amt <= 0.0:
		return 0.0
	var remaining: float = amt
	for key in ["plant_trim"]:
		var have: float = float(feeder_contents.get(key, 0.0))
		if have <= 0.0:
			continue
		var take: float = min(have, remaining)
		feeder_contents[key] = have - take
		remaining -= take
		if remaining <= 0.0:
			break
	return amt - remaining


func add_to_feeder(kind: String, amount: float) -> void:
	if not feeder_contents.has(kind):
		feeder_contents[kind] = 0.0
	var cap_left: float = FEEDER_CAPACITY - _total_feeder()
	var actual: float = min(amount, max(0.0, cap_left))
	feeder_contents[kind] = float(feeder_contents[kind]) + actual


func _total_feeder() -> float:
	var s: float = 0.0
	for k in feeder_contents.keys():
		s += float(feeder_contents[k])
	return s


func on_animal_died(a: AnimalEntity) -> void:
	flock.erase(a)


func spawn_goat(offset: Vector3 = Vector3.ZERO) -> AnimalEntity:
	var g: AnimalEntity = GOAT_SCENE.instantiate() as AnimalEntity
	var host: Node = get_parent()
	if host == null:
		host = self
	host.add_child(g)
	var spawn: Vector3 = global_position + Vector3(1.8, 0, 1.8) + offset
	g.global_position = spawn
	g.register_with_habitat(self)
	flock.append(g)
	return g


# =============================================================
# Context menu
# =============================================================

func get_context_actions() -> Array:
	_prune_flock()
	var out: Array = []
	if flock.size() < HERD_CAP:
		# Add doe. Starter/stud fee paid in fruit (represents the
		# seasonal service payment to a neighbouring stud — keeps the
		# economy honest instead of just free-spawning goats).
		var can_afford: bool = (
			FarmTotals.get_resource(FarmTotals.PLANT_TRIM) >= 6.0
			and FarmTotals.get_resource(FarmTotals.SEEDS) >= 3.0
			and FarmTotals.get_resource(FarmTotals.FRUIT) >= 4.0
		)
		var add_action: Dictionary = Interactable.make_action(
			"add_doe", "Add doe (stud fee)", 30.0,
			{ "plant_trim": 6.0, "seeds": 3.0, "fruit": 4.0 },
			{}, "", Interactable.DROP_NONE, 1,
		)
		add_action["disabled"] = not can_afford
		out.append(add_action)

	var fill_feeder: Dictionary = Interactable.make_action(
		"fill_feeder", "Fill feeder", 15.0,
		{ "plant_trim": 4.0 }, {}, "", Interactable.DROP_NONE, 1,
	)
	fill_feeder["disabled"] = FarmTotals.get_resource(FarmTotals.PLANT_TRIM) < 4.0
	out.append(fill_feeder)

	out.append(Interactable.make_action(
		"clean_shed", "Clean shed (bump nearby OM)", 18.0,
		{}, {}, "", Interactable.DROP_NONE, 2,
	))
	return out


func display_name() -> String:
	return "Goat Shed (%d/%d)" % [flock.size(), HERD_CAP]


func complete(action: Dictionary) -> void:
	var id: String = String(action.get("id", ""))
	match id:
		"add_doe":
			for i in range(STARTER_HERD_SIZE):
				var off: Vector3 = Vector3(0.5 * float(i), 0, 0.5 * float(i))
				spawn_goat(off)
			if get_node_or_null("/root/Juice") != null:
				Juice.pop(global_position + Vector3(0, 2.4, 0), "+ DOE", Palette.HONEY)
		"fill_feeder":
			add_to_feeder("plant_trim", 4.0)
			if get_node_or_null("/root/Juice") != null:
				Juice.pop(global_position + Vector3(0, 2.4, 0), "FEEDER +4", Palette.MEADOW)
		"clean_shed":
			if get_node_or_null("/root/GameLog") != null:
				GameLog.event("goat_shed_cleaned", { "pos": [global_position.x, global_position.z] })
			if get_node_or_null("/root/Juice") != null:
				Juice.pop(global_position + Vector3(0, 2.4, 0), "CLEANED", Palette.MEADOW)
