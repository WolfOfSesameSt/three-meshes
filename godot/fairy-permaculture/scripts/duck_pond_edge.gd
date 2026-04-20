## Fairy Permaculture — Duck Pond Edge shelter.
##
## Small wooden shelter on the edge of a pond. Home base for a duck flock.
## Mirrors the ChickenCoop structure: feeder fallback contents, egg
## buffer + accumulated_eggs, Add ducklings / Fill feeder / Collect eggs
## context actions.
##
## Locked design refs (project_animal_system.md):
##   • Habitat-gated introduction — ducks spawn via right-click →
##     "Add ducklings" (cost: plant_trim + seeds + water).
##   • Pond-adjacent: the pond provides continuous water so ducks don't
##     rely on the trough. Forage routes pond / wetland / shallows.
##   • Unlock chain: Chicken Coop → first coop built exposes duck_pond
##     edge (Progression.mark_structure_built).
##
## Visuals: open-front wooden shelter + small thatch roof + pond-side
## reed fringe marker. All colors trace to Palette.* per happy-palette.
extends StaticBody3D


signal clicked(coop: Node3D)
signal hover_changed(coop: Node3D, hovered: bool)


const DUCK_SCENE: PackedScene = preload("res://scenes/animals/duck.tscn")
const FLOCK_CAP: int = 5
const STARTER_FLOCK_SIZE: int = 2
const FEEDER_CAPACITY: float = 10.0


# ---- Materials ----
var _wall_mat: StandardMaterial3D
var _roof_mat: StandardMaterial3D
var _reed_mat: StandardMaterial3D


# ---- State ----
var flock: Array = []
var feeder_contents: Dictionary = { "plant_trim": 0.0, "seeds": 0.0 }
var egg_buffer: float = 0.0
var accumulated_eggs: int = 0
var _in_construction: bool = false
var _t: float = 0.0


@onready var _walls: MeshInstance3D = $Walls
@onready var _roof: MeshInstance3D = $Roof
@onready var _reed: MeshInstance3D = $Reeds
@onready var _egg_badge: MeshInstance3D = $EggBadge


func _ready() -> void:
	input_ray_pickable = true
	add_to_group("duck_pond_edges")
	add_to_group("animal_habitats")
	_build_materials()
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
	# Thatched roof — STRAW_DRY warm cream.
	_roof_mat.albedo_color = Palette.STRAW_DRY.lerp(Palette.HONEY, 0.30)
	_roof.material_override = _roof_mat

	_reed_mat = StandardMaterial3D.new()
	_reed_mat.albedo_color = Palette.OLIVE_DARK.lerp(Palette.SAGE, 0.35)
	_reed.material_override = _reed_mat

	var egg_mat: StandardMaterial3D = StandardMaterial3D.new()
	egg_mat.albedo_color = Color(Palette.PARCHMENT.r, Palette.PARCHMENT.g, Palette.PARCHMENT.b, 0.0)
	egg_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	egg_mat.shading_mode = BaseMaterial3D.SHADING_MODE_PER_PIXEL
	_egg_badge.material_override = egg_mat
	_egg_badge.visible = false


# =============================================================
# Hover + construction + process
# =============================================================

func _on_mouse_enter() -> void:
	set_highlight(true)
	emit_signal("hover_changed", self, true)


func _on_mouse_exit() -> void:
	set_highlight(false)
	emit_signal("hover_changed", self, false)


func set_highlight(on: bool) -> void:
	for m in [_wall_mat, _roof_mat, _reed_mat]:
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
		_roof.position.y = 1.85 + 0.012 * sin(_t * 1.1)
	if accumulated_eggs > 0:
		_egg_badge.visible = true
		var pulse: float = 0.7 + 0.25 * sin(_t * 2.2)
		var m: StandardMaterial3D = _egg_badge.material_override as StandardMaterial3D
		if m != null:
			m.albedo_color.a = pulse
	else:
		var m2: StandardMaterial3D = _egg_badge.material_override as StandardMaterial3D
		if m2 != null:
			m2.albedo_color.a = lerp(m2.albedo_color.a, 0.0, 0.1)
			if m2.albedo_color.a < 0.03:
				_egg_badge.visible = false


func start_construction(duration_s: float) -> void:
	_in_construction = true
	scale = Vector3.ONE * 0.1
	for m in [_wall_mat, _roof_mat, _reed_mat]:
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		m.albedo_color.a = 0.35
	var tw: Tween = create_tween()
	tw.tween_property(self, "scale", Vector3.ONE, duration_s) \
		.set_trans(Tween.TRANS_SINE)
	tw.tween_callback(_on_construction_complete)


func _on_construction_complete() -> void:
	_in_construction = false
	for m in [_wall_mat, _roof_mat, _reed_mat]:
		m.transparency = BaseMaterial3D.TRANSPARENCY_DISABLED
		m.albedo_color.a = 1.0
	if get_node_or_null("/root/Juice") != null:
		Juice.burst(global_position + Vector3(0, 1.5, 0), Palette.OLIVE_DARK, 18)
		Juice.pop(global_position + Vector3(0, 2.0, 0), "POND EDGE READY", Palette.HONEY)
	if get_node_or_null("/root/AudioManager") != null:
		AudioManager.play("compost-scoop", -4.0)


# =============================================================
# Day-tick
# =============================================================

func _on_day_advanced(_d: int, _s: String, _y: int) -> void:
	_prune_flock()


func _prune_flock() -> void:
	var live: Array = []
	for a in flock:
		if a != null and is_instance_valid(a):
			live.append(a)
	flock = live


# =============================================================
# Flock + feeder + egg API
# =============================================================

func consume_feeder(amt: float) -> float:
	if amt <= 0.0:
		return 0.0
	var remaining: float = amt
	for key in ["plant_trim", "seeds"]:
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


func on_egg_laid(amount: float) -> void:
	egg_buffer += amount
	var whole: int = int(floor(egg_buffer))
	if whole > 0:
		egg_buffer -= float(whole)
		accumulated_eggs += whole
		if get_node_or_null("/root/Juice") != null:
			Juice.pop(global_position + Vector3(0, 2.2, 0), "+ DUCK EGG", Palette.HONEY)


func on_animal_died(a: AnimalEntity) -> void:
	flock.erase(a)


func spawn_duck(offset: Vector3 = Vector3.ZERO) -> AnimalEntity:
	var d: AnimalEntity = DUCK_SCENE.instantiate() as AnimalEntity
	var host: Node = get_parent()
	if host == null:
		host = self
	host.add_child(d)
	var spawn: Vector3 = global_position + Vector3(1.2, 0, 1.2) + offset
	d.global_position = spawn
	d.register_with_habitat(self)
	flock.append(d)
	return d


# =============================================================
# Context menu
# =============================================================

func get_context_actions() -> Array:
	_prune_flock()
	var out: Array = []
	if flock.size() < STARTER_FLOCK_SIZE + 2:
		var can_afford: bool = (
			FarmTotals.get_resource(FarmTotals.PLANT_TRIM) >= 4.0
			and FarmTotals.get_resource(FarmTotals.SEEDS) >= 2.0
			and FarmTotals.get_resource(FarmTotals.WATER) >= 2.0
		)
		var add_action: Dictionary = Interactable.make_action(
			"add_ducklings", "Add ducklings (x2)", 20.0,
			{ "plant_trim": 4.0, "seeds": 2.0, "water": 2.0 },
			{}, "", Interactable.DROP_NONE, 1,
		)
		add_action["disabled"] = not can_afford
		out.append(add_action)

	var fill_feeder: Dictionary = Interactable.make_action(
		"fill_feeder", "Fill feeder", 15.0,
		{ "plant_trim": 3.0 }, {}, "", Interactable.DROP_NONE, 1,
	)
	fill_feeder["disabled"] = FarmTotals.get_resource(FarmTotals.PLANT_TRIM) < 3.0
	out.append(fill_feeder)

	if accumulated_eggs > 0:
		var collect: Dictionary = Interactable.make_action(
			"collect_eggs", "Collect duck eggs (%d)" % accumulated_eggs, 6.0,
			{}, { "fruit": float(accumulated_eggs) },
			"", Interactable.DROP_STORAGE, 1,
		)
		out.append(collect)

	return out


func display_name() -> String:
	return "Duck Pond Edge (%d/%d)" % [flock.size(), FLOCK_CAP]


func complete(action: Dictionary) -> void:
	var id: String = String(action.get("id", ""))
	match id:
		"add_ducklings":
			for i in range(STARTER_FLOCK_SIZE):
				var off: Vector3 = Vector3(0.3 * float(i), 0, 0.3 * float(i))
				spawn_duck(off)
			if get_node_or_null("/root/Juice") != null:
				Juice.pop(global_position + Vector3(0, 2.4, 0), "+ 2 DUCKLINGS", Palette.HONEY)
		"fill_feeder":
			add_to_feeder("plant_trim", 3.0)
			if get_node_or_null("/root/Juice") != null:
				Juice.pop(global_position + Vector3(0, 2.2, 0), "FEEDER +3", Palette.MEADOW)
		"collect_eggs":
			var taken: int = accumulated_eggs
			accumulated_eggs = 0
			if get_node_or_null("/root/Juice") != null:
				Juice.pop(global_position + Vector3(0, 2.4, 0), "✦ %d EGGS" % taken, Palette.HONEY)
