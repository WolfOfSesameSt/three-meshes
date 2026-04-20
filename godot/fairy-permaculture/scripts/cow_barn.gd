## Fairy Permaculture — Cow Barn habitat (Dexter cattle).
##
## Large wooden barn with a 12×12 rotational-paddock fence footprint.
## Mirrors GoatShed structure (feeder + herd + milk output via
## AnimalEntity._deliver_output, no habitat-side milk buffer). The key
## differences: higher feeder capacity, higher herd cap, and the
## "Move paddock" action stub (DESIGN.md §Plant-animal synergies —
## Salatin cascade) that will wire into the grid-tile renderer once
## the paddock system agent ships.
##
## Locked refs (project_animal_system.md):
##   • Unlock chain: storage + kiln + first egg → cow_barn unlocks.
##   • Herd cap: 3 Dexters (small heritage breed, BC-homestead scale).
##   • 12×12 paddock fence visible.
extends StaticBody3D


signal clicked(barn: Node3D)
signal hover_changed(barn: Node3D, hovered: bool)


const COW_SCENE: PackedScene = preload("res://scenes/animals/cow.tscn")
const HERD_CAP: int = 3
const STARTER_HERD_SIZE: int = 1
const FEEDER_CAPACITY: float = 30.0

# Phase-3 containment. Cows are STABLE — +0.2 fence_strength_bias vs
# chicken baseline. Hard clamp in practice.
@export var containment_radius: float = 10.0
@export var containment_strength: float = 1.0
var escaped_animals: Array = []


var _wall_mat: StandardMaterial3D
var _roof_mat: StandardMaterial3D
var _fence_mat: StandardMaterial3D


var flock: Array = []
var feeder_contents: Dictionary = { "plant_trim": 0.0 }
var _in_construction: bool = false
var _t: float = 0.0


@onready var _walls: MeshInstance3D = $Walls
@onready var _roof: MeshInstance3D = $Roof
@onready var _door: MeshInstance3D = $Door
@onready var _fence_posts: Node3D = $FencePosts


func _ready() -> void:
	input_ray_pickable = true
	add_to_group("cow_barns")
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
	_wall_mat.albedo_color = Palette.EARTH
	_walls.material_override = _wall_mat
	_roof_mat = StandardMaterial3D.new()
	# Red-stone roof with HONEY warmth — classic "painted barn" cue.
	_roof_mat.albedo_color = Palette.CORAL.lerp(Palette.EARTH, 0.55)
	_roof.material_override = _roof_mat
	var door_mat: StandardMaterial3D = StandardMaterial3D.new()
	door_mat.albedo_color = Palette.COMPOST.lerp(Palette.EARTH, 0.4)
	_door.material_override = door_mat
	_fence_mat = StandardMaterial3D.new()
	_fence_mat.albedo_color = Palette.EARTH.lerp(Palette.WARM_STONE, 0.30)


func _build_fence() -> void:
	# 12×12 paddock — 12 posts in a ring at distance 6.
	var ring: Array[Vector3] = [
		Vector3(-6, 0.5, -6), Vector3(-3, 0.5, -6), Vector3(3, 0.5, -6), Vector3(6, 0.5, -6),
		Vector3(-6, 0.5, -3), Vector3(6, 0.5, -3),
		Vector3(-6, 0.5, 3), Vector3(6, 0.5, 3),
		Vector3(-6, 0.5, 6), Vector3(-3, 0.5, 6), Vector3(3, 0.5, 6), Vector3(6, 0.5, 6),
	]
	for c in ring:
		var post: MeshInstance3D = MeshInstance3D.new()
		var cm: CylinderMesh = CylinderMesh.new()
		cm.top_radius = 0.08
		cm.bottom_radius = 0.10
		cm.height = 1.0
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
		_roof.position.y = 3.3 + 0.02 * sin(_t * 1.0)


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
		Juice.burst(global_position + Vector3(0, 2.5, 0), Palette.EARTH, 28)
		Juice.pop(global_position + Vector3(0, 3.2, 0), "BARN READY", Palette.HONEY)
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
	var have: float = float(feeder_contents.get("plant_trim", 0.0))
	if have <= 0.0:
		return 0.0
	var take: float = min(have, amt)
	feeder_contents["plant_trim"] = have - take
	return take


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


func spawn_cow(offset: Vector3 = Vector3.ZERO) -> AnimalEntity:
	var c: AnimalEntity = COW_SCENE.instantiate() as AnimalEntity
	var host: Node = get_parent()
	if host == null:
		host = self
	host.add_child(c)
	var spawn: Vector3 = global_position + Vector3(3.0, 0, 3.0) + offset
	c.global_position = spawn
	c.register_with_habitat(self)
	flock.append(c)
	return c


func get_context_actions() -> Array:
	_prune_flock()
	var out: Array = []
	if flock.size() < HERD_CAP:
		# "Bull service" is the Dexter equivalent of the goat's stud
		# fee — represents paying a neighbour for the bull visit. Costs
		# more than a goat doe since Dexters are rarer + longer-lived.
		var can_afford: bool = (
			FarmTotals.get_resource(FarmTotals.PLANT_TRIM) >= 10.0
			and FarmTotals.get_resource(FarmTotals.SEEDS) >= 5.0
			and FarmTotals.get_resource(FarmTotals.FRUIT) >= 10.0
			and FarmTotals.get_resource(FarmTotals.WOOD) >= 2.0
		)
		var add_action: Dictionary = Interactable.make_action(
			"add_heifer", "Add heifer (bull service)", 60.0,
			{ "plant_trim": 10.0, "seeds": 5.0, "fruit": 10.0, "wood": 2.0 },
			{}, "", Interactable.DROP_NONE, 1,
		)
		add_action["disabled"] = not can_afford
		out.append(add_action)

	var fill_feeder: Dictionary = Interactable.make_action(
		"fill_feeder", "Fill feeder (big)", 20.0,
		{ "plant_trim": 8.0 }, {}, "", Interactable.DROP_NONE, 1,
	)
	fill_feeder["disabled"] = FarmTotals.get_resource(FarmTotals.PLANT_TRIM) < 8.0
	out.append(fill_feeder)

	out.append(Interactable.make_action(
		"rotate_paddock", "Rotate paddock (Salatin cascade)", 25.0,
		{}, {}, "", Interactable.DROP_NONE, 2,
	))
	out.append(Interactable.make_action(
		"clean_barn", "Clean barn (OM bump)", 22.0,
		{}, {}, "", Interactable.DROP_NONE, 2,
	))
	return out


func display_name() -> String:
	return "Cow Barn (%d/%d)" % [flock.size(), HERD_CAP]


func complete(action: Dictionary) -> void:
	var id: String = String(action.get("id", ""))
	match id:
		"add_heifer":
			for i in range(STARTER_HERD_SIZE):
				var off: Vector3 = Vector3(0.8 * float(i), 0, 0.8 * float(i))
				spawn_cow(off)
			if get_node_or_null("/root/Juice") != null:
				Juice.pop(global_position + Vector3(0, 3.0, 0), "+ HEIFER", Palette.HONEY)
		"fill_feeder":
			add_to_feeder("plant_trim", 8.0)
			if get_node_or_null("/root/Juice") != null:
				Juice.pop(global_position + Vector3(0, 3.0, 0), "FEEDER +8", Palette.MEADOW)
		"rotate_paddock":
			# Stub — the future paddock-rotation system subscribes to the
			# GameLog event + shifts the fenced footprint. For phase 2
			# we fire the paired feedback so the player sees the
			# cascade-teaching beat land.
			if get_node_or_null("/root/GameLog") != null:
				GameLog.event("paddock_rotated", {
					"pos": [global_position.x, global_position.z],
					"species": "cow",
				})
			if get_node_or_null("/root/Juice") != null:
				Juice.pop(global_position + Vector3(0, 3.0, 0), "ROTATED ~SALATIN", Palette.MEADOW)
		"clean_barn":
			if get_node_or_null("/root/GameLog") != null:
				GameLog.event("cow_barn_cleaned", { "pos": [global_position.x, global_position.z] })
			if get_node_or_null("/root/Juice") != null:
				Juice.pop(global_position + Vector3(0, 3.0, 0), "CLEANED", Palette.MEADOW)
