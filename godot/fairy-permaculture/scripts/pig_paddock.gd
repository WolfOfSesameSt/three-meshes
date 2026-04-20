## Fairy Permaculture — Pig Paddock habitat.
##
## Fenced rootling paddock at a forest edge. Pigs forage fallen fruit +
## forest floor — the paddock just provides shelter (small A-frame) and
## a mud-wallow for thermoregulation. No milk/egg output buffer; pigs
## produce manure + (eventually) meat-at-death only.
##
## Locked refs (project_animal_system.md):
##   • Unlock chain: storage + kiln → pig_paddock unlocks (same wave
##     as cow_barn + kennel).
##   • 8×8 rootle zone — fence posts ring the shelter.
##   • Mud wallow = a shallow COMPOST-dark disc next to the shelter so
##     the "pigs rootle here" read is immediate.
extends StaticBody3D


signal clicked(paddock: Node3D)
signal hover_changed(paddock: Node3D, hovered: bool)


const PIG_SCENE: PackedScene = preload("res://scenes/animals/pig.tscn")
const HERD_CAP: int = 3
const STARTER_HERD_SIZE: int = 1
const FEEDER_CAPACITY: float = 18.0


var _wall_mat: StandardMaterial3D
var _roof_mat: StandardMaterial3D
var _fence_mat: StandardMaterial3D
var _wallow_mat: StandardMaterial3D


var flock: Array = []
var feeder_contents: Dictionary = { "plant_trim": 0.0, "fruit_scraps": 0.0 }
var _in_construction: bool = false
var _t: float = 0.0


@onready var _walls: MeshInstance3D = $Walls
@onready var _roof: MeshInstance3D = $Roof
@onready var _wallow: MeshInstance3D = $Wallow
@onready var _fence_posts: Node3D = $FencePosts


func _ready() -> void:
	input_ray_pickable = true
	add_to_group("pig_paddocks")
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
	_wall_mat.albedo_color = Palette.EARTH.lerp(Palette.COMPOST, 0.15)
	_walls.material_override = _wall_mat
	_roof_mat = StandardMaterial3D.new()
	_roof_mat.albedo_color = Palette.WARM_STONE.lerp(Palette.STRAW_DRY, 0.30)
	_roof.material_override = _roof_mat
	_wallow_mat = StandardMaterial3D.new()
	_wallow_mat.albedo_color = Palette.COMPOST.lerp(Palette.EARTH, 0.30)
	_wallow.material_override = _wallow_mat
	_fence_mat = StandardMaterial3D.new()
	_fence_mat.albedo_color = Palette.EARTH.lerp(Palette.COMPOST, 0.20)


func _build_fence() -> void:
	# 8×8 rootle zone — 8 posts on a 4-metre ring.
	var ring: Array[Vector3] = [
		Vector3(-4, 0.4, -4), Vector3(0, 0.4, -4), Vector3(4, 0.4, -4),
		Vector3(-4, 0.4, 0), Vector3(4, 0.4, 0),
		Vector3(-4, 0.4, 4), Vector3(0, 0.4, 4), Vector3(4, 0.4, 4),
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
		_roof.position.y = 1.95 + 0.012 * sin(_t * 1.3)


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
		Juice.burst(global_position + Vector3(0, 1.5, 0), Palette.COMPOST, 22)
		Juice.pop(global_position + Vector3(0, 2.2, 0), "PIG PADDOCK READY", Palette.HONEY)
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


func consume_feeder(amt: float) -> float:
	if amt <= 0.0:
		return 0.0
	var remaining: float = amt
	for key in ["fruit_scraps", "plant_trim"]:
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


func spawn_pig(offset: Vector3 = Vector3.ZERO) -> AnimalEntity:
	var p: AnimalEntity = PIG_SCENE.instantiate() as AnimalEntity
	var host: Node = get_parent()
	if host == null:
		host = self
	host.add_child(p)
	var spawn: Vector3 = global_position + Vector3(2.0, 0, 2.0) + offset
	p.global_position = spawn
	p.register_with_habitat(self)
	flock.append(p)
	return p


func get_context_actions() -> Array:
	_prune_flock()
	var out: Array = []
	if flock.size() < HERD_CAP:
		var can_afford: bool = (
			FarmTotals.get_resource(FarmTotals.PLANT_TRIM) >= 8.0
			and FarmTotals.get_resource(FarmTotals.FRUIT_SCRAPS) >= 4.0
			and FarmTotals.get_resource(FarmTotals.SEEDS) >= 3.0
		)
		var add_action: Dictionary = Interactable.make_action(
			"add_piglet", "Add piglet", 40.0,
			{ "plant_trim": 8.0, "fruit_scraps": 4.0, "seeds": 3.0 },
			{}, "", Interactable.DROP_NONE, 1,
		)
		add_action["disabled"] = not can_afford
		out.append(add_action)

	var fill_feeder: Dictionary = Interactable.make_action(
		"fill_feeder", "Fill feeder (slops)", 15.0,
		{ "fruit_scraps": 4.0 }, {}, "", Interactable.DROP_NONE, 1,
	)
	fill_feeder["disabled"] = FarmTotals.get_resource(FarmTotals.FRUIT_SCRAPS) < 4.0
	out.append(fill_feeder)

	out.append(Interactable.make_action(
		"move_paddock", "Move rootling zone", 20.0,
		{}, {}, "", Interactable.DROP_NONE, 2,
	))
	return out


func display_name() -> String:
	return "Pig Paddock (%d/%d)" % [flock.size(), HERD_CAP]


func complete(action: Dictionary) -> void:
	var id: String = String(action.get("id", ""))
	match id:
		"add_piglet":
			for i in range(STARTER_HERD_SIZE):
				var off: Vector3 = Vector3(0.6 * float(i), 0, 0.6 * float(i))
				spawn_pig(off)
			if get_node_or_null("/root/Juice") != null:
				Juice.pop(global_position + Vector3(0, 2.4, 0), "+ PIGLET", Palette.HONEY)
		"fill_feeder":
			add_to_feeder("fruit_scraps", 4.0)
			if get_node_or_null("/root/Juice") != null:
				Juice.pop(global_position + Vector3(0, 2.4, 0), "SLOPS +4", Palette.MEADOW)
		"move_paddock":
			if get_node_or_null("/root/GameLog") != null:
				GameLog.event("paddock_rotated", {
					"pos": [global_position.x, global_position.z],
					"species": "pig",
				})
			if get_node_or_null("/root/Juice") != null:
				Juice.pop(global_position + Vector3(0, 2.4, 0), "MOVED", Palette.MEADOW)
