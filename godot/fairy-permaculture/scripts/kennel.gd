## Fairy Permaculture — Kennel habitat (LGD + Barn Cat shared).
##
## A small wooden kennel at the barn corner. Houses one LGD and one
## barn cat — they share the structure rather than each needing their
## own building. Neither is a flock animal so FLOCK_CAP caps out at 2
## total (1 dog + 1 cat).
##
## Locked refs (project_animal_system.md):
##   • Unlock chain: storage + kiln → kennel unlocks (same wave as
##     cow_barn + pig_paddock).
##   • "Adopt LGD" costs fruit + plant_trim + meat (represents the
##     greens + meat adoption fee the spec calls out).
##   • "Adopt Barn Cat" costs fruit only (represents the fruit bribe
##     to a feral cat moving in).
##   • Cats auto-hunt rodents via Rodents.cat_hunt_at in their day_tick.
extends StaticBody3D


signal clicked(kennel: Node3D)
signal hover_changed(kennel: Node3D, hovered: bool)


const LGD_SCENE: PackedScene = preload("res://scenes/animals/lgd_dog.tscn")
const CAT_SCENE: PackedScene = preload("res://scenes/animals/barn_cat.tscn")
const FLOCK_CAP: int = 2

# Phase-3 containment — cats + dogs are FREE-RANGING. Zero radius means
# AnimalEntity skips the clamp entirely (its guard is `radius > 0.1`).
# They patrol a wide territory (cat: 8m rodent hunt; dog: 8m LGD protect).
@export var containment_radius: float = 0.0
@export var containment_strength: float = 0.0
var escaped_animals: Array = []


var _wall_mat: StandardMaterial3D
var _roof_mat: StandardMaterial3D
var _bowl_mat: StandardMaterial3D


# We still call this `flock` so AnimalEntity._flockmate_count works —
# inter-species flockmate counting is fine since dogs/cats don't really
# flock (the mood malus for "no flockmates" is a small penalty anyway).
var flock: Array = []
var feeder_contents: Dictionary = { "meat": 0.0, "plant_trim": 0.0 }
var _in_construction: bool = false
var _t: float = 0.0


@onready var _walls: MeshInstance3D = $Walls
@onready var _roof: MeshInstance3D = $Roof
@onready var _bowl: MeshInstance3D = $Bowl


func _ready() -> void:
	input_ray_pickable = true
	add_to_group("kennels")
	add_to_group("animal_habitats")
	_build_materials()
	mouse_entered.connect(_on_mouse_enter)
	mouse_exited.connect(_on_mouse_exit)
	input_event.connect(_on_click)


func _build_materials() -> void:
	_wall_mat = StandardMaterial3D.new()
	_wall_mat.albedo_color = Palette.EARTH.lerp(Palette.WARM_STONE, 0.30)
	_walls.material_override = _wall_mat
	_roof_mat = StandardMaterial3D.new()
	_roof_mat.albedo_color = Palette.HONEY.lerp(Palette.STRAW_DRY, 0.30)
	_roof.material_override = _roof_mat
	_bowl_mat = StandardMaterial3D.new()
	_bowl_mat.albedo_color = Palette.MOON.lerp(Palette.WARM_STONE, 0.35)
	_bowl.material_override = _bowl_mat


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
		_roof.position.y = 1.2 + 0.01 * sin(_t * 1.5)


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
		Juice.burst(global_position + Vector3(0, 1.1, 0), Palette.EARTH, 18)
		Juice.pop(global_position + Vector3(0, 1.8, 0), "KENNEL READY", Palette.HONEY)
	if get_node_or_null("/root/AudioManager") != null:
		AudioManager.play("compost-scoop", -4.0)


# =============================================================
# Flock + feeder API — the kennel's "feeder" is a meat bowl.
# =============================================================

func consume_feeder(amt: float) -> float:
	if amt <= 0.0:
		return 0.0
	var remaining: float = amt
	for key in ["meat", "plant_trim"]:
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
	feeder_contents[kind] = float(feeder_contents[kind]) + amount


func on_animal_died(a: AnimalEntity) -> void:
	flock.erase(a)


func _has_species(species_id: String) -> bool:
	for a in flock:
		if a == null or not is_instance_valid(a):
			continue
		if String(a.get("species_id")) == species_id:
			return true
	return false


func spawn_lgd(offset: Vector3 = Vector3.ZERO) -> AnimalEntity:
	var d: AnimalEntity = LGD_SCENE.instantiate() as AnimalEntity
	var host: Node = get_parent()
	if host == null:
		host = self
	host.add_child(d)
	d.global_position = global_position + Vector3(1.5, 0, 1.5) + offset
	d.register_with_habitat(self)
	flock.append(d)
	return d


func spawn_barn_cat(offset: Vector3 = Vector3.ZERO) -> AnimalEntity:
	var c: AnimalEntity = CAT_SCENE.instantiate() as AnimalEntity
	var host: Node = get_parent()
	if host == null:
		host = self
	host.add_child(c)
	c.global_position = global_position + Vector3(-1.2, 0, 1.2) + offset
	c.register_with_habitat(self)
	flock.append(c)
	return c


# =============================================================
# Context menu
# =============================================================

func get_context_actions() -> Array:
	var out: Array = []
	# Adopt LGD — adoption fee in greens + meat. The spec is explicit
	# that meat is part of the fee because the dog has to eat on the
	# walk home; this also prevents the player from cheesing a dog
	# before they've run the butcher → meat loop at least once.
	if not _has_species("lgd_dog"):
		var can_dog: bool = (
			FarmTotals.get_resource(FarmTotals.PLANT_TRIM) >= 4.0
			and FarmTotals.get_resource(FarmTotals.FRUIT) >= 2.0
			and FarmTotals.get_resource(FarmTotals.MEAT) >= 3.0
		)
		var adopt_dog: Dictionary = Interactable.make_action(
			"adopt_lgd", "Adopt Guardian Dog", 30.0,
			{ "plant_trim": 4.0, "fruit": 2.0, "meat": 3.0 },
			{}, "", Interactable.DROP_NONE, 1,
		)
		adopt_dog["disabled"] = not can_dog
		out.append(adopt_dog)

	# Adopt Barn Cat — cheaper, fruit-only fee (feral cat "moves in").
	if not _has_species("barn_cat"):
		var can_cat: bool = FarmTotals.get_resource(FarmTotals.FRUIT) >= 2.0
		var adopt_cat: Dictionary = Interactable.make_action(
			"adopt_barn_cat", "Adopt Barn Cat", 15.0,
			{ "fruit": 2.0 },
			{}, "", Interactable.DROP_NONE, 1,
		)
		adopt_cat["disabled"] = not can_cat
		out.append(adopt_cat)

	# Fill bowl — keep the dog's meat fallback topped. Pickup flow
	# auto-engages because meat is in MATERIAL_RESOURCES.
	var fill_bowl: Dictionary = Interactable.make_action(
		"fill_bowl", "Fill bowl (meat)", 12.0,
		{ "meat": 1.0 }, {}, "", Interactable.DROP_NONE, 1,
	)
	fill_bowl["disabled"] = FarmTotals.get_resource(FarmTotals.MEAT) < 1.0
	out.append(fill_bowl)
	return out


func display_name() -> String:
	return "Kennel (%d/%d)" % [flock.size(), FLOCK_CAP]


func complete(action: Dictionary) -> void:
	var id: String = String(action.get("id", ""))
	match id:
		"adopt_lgd":
			spawn_lgd()
			if get_node_or_null("/root/Juice") != null:
				Juice.pop(global_position + Vector3(0, 2.2, 0), "+ GUARDIAN DOG", Palette.HONEY)
		"adopt_barn_cat":
			spawn_barn_cat()
			if get_node_or_null("/root/Juice") != null:
				Juice.pop(global_position + Vector3(0, 2.2, 0), "+ BARN CAT", Palette.HONEY)
		"fill_bowl":
			add_to_feeder("meat", 1.0)
			if get_node_or_null("/root/Juice") != null:
				Juice.pop(global_position + Vector3(0, 2.0, 0), "BOWL +1", Palette.CORAL)
