## Fairy Permaculture — Spiral Herb Garden (Bed variant 4).
##
## Spec (docs/design/garden-beds.md §Spiral Herb Garden):
##   - Cost: stone x 20, plant_trim x 4
##   - Labor: 120 s (max_workers = 3)
##   - 5 plant slots, each with a distinct microclimate:
##       slot 1 (peak, +0.7 m)  — moisture 0.15, +2 C warmth (rosemary,
##                                 lavender, thyme, oregano)
##       slot 2 (upper, +0.5 m) — moisture 0.25 (sage, dill, cilantro)
##       slot 3 (middle, +0.3 m)— moisture 0.40, sun 0.7x shade side
##                                 (parsley, basil, chive)
##       slot 4 (lower, +0.1 m) — moisture 0.55 (mint, lemon balm)
##       slot 5 (base, 0.0 m)   — moisture 0.70 (watercress, vietnamese
##                                 coriander)
##   - Footprint: 2x2 tiles.
##
## The showpiece of the kitchen-garden. Teaches microclimate + vertical
## design. Each slot is an independent sub-target for the task queue —
## harvest slot N, water base, etc.
extends Node3D

signal clicked(bed: Node3D)
signal hover_changed(bed: Node3D, hovered: bool)

const BED_ID: String = "spiral_garden"
const BED_LABEL: String = "Spiral Herb Garden"
const SLOT_COUNT: int = 5
const FOOTPRINT_TILES: Vector2i = Vector2i(2, 2)
const MAX_WORKERS: int = 3
const LABOR_S: float = 120.0
const WARMTH_BONUS_C: float = 2.0  # slot 1 thermal mass

## Per-slot moisture target (drives the microclimate).
const SLOT_MOISTURE: Array[float] = [0.15, 0.25, 0.40, 0.55, 0.70]
const SLOT_HEIGHT: Array[float] = [0.70, 0.50, 0.30, 0.10, 0.00]
const SLOT_SUN_K: Array[float] = [1.00, 1.00, 0.70, 0.70, 1.00]
const SLOT_SUGGEST: Array[String] = [
	"rosemary / lavender / thyme / oregano",
	"sage / dill / cilantro",
	"parsley / basil / chive",
	"mint / lemon balm",
	"watercress / vietnamese coriander",
]

@onready var _stones_root: Node3D = $Stones
@onready var _base: MeshInstance3D = $Base
@onready var _slots_root: Node3D = $SlotMarkers
@onready var _click_area: StaticBody3D = $ClickArea

## Per-slot state: { species: String, planted_days: int, moisture: float }.
var slots: Array = [null, null, null, null, null]
var _slot_moisture: Array[float] = SLOT_MOISTURE.duplicate()
var _stone_mats: Array[StandardMaterial3D] = []
var _base_mat: StandardMaterial3D


func _ready() -> void:
	_base_mat = StandardMaterial3D.new()
	_base_mat.albedo_color = Palette.clamp_happy(Palette.COMPOST.lerp(Palette.EARTH, 0.4))
	_base.material_override = _base_mat
	# Procedurally place ~60 stones along an ascending Archimedean spiral.
	_build_spiral_stones()
	# Mark the 5 slots with small parchment flags (subtle, hide once planted).
	_build_slot_flags()
	add_to_group("garden_beds")
	add_to_group("spiral_gardens")
	_click_area.input_event.connect(_on_click)
	_click_area.mouse_entered.connect(_on_mouse_enter)
	_click_area.mouse_exited.connect(_on_mouse_exit)
	Scheduler.day_advanced.connect(_on_day)


func _build_spiral_stones() -> void:
	var rng: RandomNumberGenerator = RandomNumberGenerator.new()
	rng.seed = hash(name) & 0x7fffffff
	var stone_mat: StandardMaterial3D = StandardMaterial3D.new()
	stone_mat.albedo_color = Palette.clamp_happy(Palette.WARM_STONE)
	_stone_mats.append(stone_mat)
	var stone_count: int = 60
	for i in range(stone_count):
		var t: float = float(i) / float(stone_count - 1)
		var theta: float = t * TAU * 2.0  # two full turns
		var radius: float = lerp(0.95, 0.20, t)  # spiral in as we rise
		var height: float = lerp(0.0, 0.70, t)
		var mi: MeshInstance3D = MeshInstance3D.new()
		var bm: BoxMesh = BoxMesh.new()
		bm.size = Vector3(0.15, 0.10, 0.15)
		mi.mesh = bm
		mi.material_override = stone_mat
		mi.position = Vector3(
			cos(theta) * radius + rng.randf_range(-0.03, 0.03),
			height + rng.randf_range(-0.01, 0.01) + 0.05,
			sin(theta) * radius + rng.randf_range(-0.03, 0.03),
		)
		mi.rotation.y = rng.randf() * TAU
		_stones_root.add_child(mi)


func _build_slot_flags() -> void:
	var flag_mat: StandardMaterial3D = StandardMaterial3D.new()
	flag_mat.albedo_color = Palette.clamp_happy(Palette.PARCHMENT)
	var slot_positions: Array[Vector3] = [
		Vector3(0.0, 0.80, 0.0),
		Vector3(0.30, 0.60, 0.15),
		Vector3(0.45, 0.40, -0.30),
		Vector3(-0.40, 0.20, -0.35),
		Vector3(-0.60, 0.05, 0.55),
	]
	for i in range(SLOT_COUNT):
		var mi: MeshInstance3D = MeshInstance3D.new()
		var bm: BoxMesh = BoxMesh.new()
		bm.size = Vector3(0.06, 0.12, 0.02)
		mi.mesh = bm
		mi.material_override = flag_mat
		mi.position = slot_positions[i]
		mi.name = "SlotFlag%d" % i
		_slots_root.add_child(mi)


func _on_mouse_enter() -> void:
	set_highlight(true)
	emit_signal("hover_changed", self, true)


func _on_mouse_exit() -> void:
	set_highlight(false)
	emit_signal("hover_changed", self, false)


func set_highlight(on: bool) -> void:
	var highlight: Color = Palette.HONEY
	for m in _stone_mats:
		if m == null:
			continue
		m.rim_enabled = on
		m.rim = 0.9 if on else 0.0
		m.rim_tint = 0.75
		m.emission_enabled = on
		m.emission = highlight
		m.emission_energy_multiplier = 0.25 if on else 0.0
	if _base_mat:
		_base_mat.rim_enabled = on
		_base_mat.rim = 0.9 if on else 0.0
		_base_mat.rim_tint = 0.75


func _on_click(_cam: Node, _event: InputEvent, _pos: Vector3, _norm: Vector3, _shape: int) -> void:
	pass


func _on_day(_day: int, _season: String, _year: int) -> void:
	for i in range(SLOT_COUNT):
		var s: Variant = slots[i]
		if s == null:
			continue
		var slot: Dictionary = s
		slot["planted_days"] = int(slot.get("planted_days", 0)) + 1
	# Base-slot sub-irrigation: wick +0.02 toward SLOT_MOISTURE[4] target.
	_slot_moisture[4] = lerp(_slot_moisture[4], 0.80, 0.02)


# ---------------------------------------------------------------------
# Right-click contract — surface 5 slots + base water
# ---------------------------------------------------------------------

func get_context_actions() -> Array:
	var out: Array = []
	var have_seeds: float = FarmTotals.get_resource(FarmTotals.SEEDS) + FarmTotals.get_resource(FarmTotals.PLANT_TRIM)
	for i in range(SLOT_COUNT):
		if slots[i] != null:
			out.append(Interactable.make_action(
				"harvest_slot_%d" % i, "Harvest slot %d" % (i + 1), 6.0,
				{}, {"plant_trim": 1.0},
				"", Interactable.DROP_STORAGE, 1
			))
			continue
		var act: Dictionary = Interactable.make_action(
			"plant_slot_%d" % i, "Plant slot %d (%s)" % [i + 1, SLOT_SUGGEST[i]], 8.0,
			{"plant_trim": 1.0}, {},
			"", Interactable.DROP_NONE, 1
		)
		act["disabled"] = have_seeds < 1.0
		out.append(act)
	var act_water: Dictionary = Interactable.make_action(
		"water_base", "Water base slot (wicks up)", 5.0,
		{"water": 1.0}, {},
		"", Interactable.DROP_NONE, 1
	)
	act_water["disabled"] = FarmTotals.get_resource(FarmTotals.WATER) < 1.0
	out.append(act_water)
	out.append(Interactable.make_action(
		"prune_spiral", "Prune spiral (yields plant_trim)", 15.0,
		{}, {"plant_trim": 2.0},
		"", Interactable.DROP_STORAGE, 1
	))
	return out


func display_name() -> String:
	return BED_LABEL


func bed_metadata() -> Dictionary:
	return {
		"id": BED_ID,
		"slot_count": SLOT_COUNT,
		"slot_moisture": SLOT_MOISTURE,
		"slot_height": SLOT_HEIGHT,
		"slot_sun_k": SLOT_SUN_K,
		"warmth_bonus_c": WARMTH_BONUS_C,
		"footprint": FOOTPRINT_TILES,
	}


func complete(action: Dictionary) -> void:
	var id: String = String(action.get("id", ""))
	if id.begins_with("plant_slot_"):
		var idx: int = int(id.substr("plant_slot_".length()))
		_plant_slot(idx)
		return
	if id.begins_with("harvest_slot_"):
		var idx: int = int(id.substr("harvest_slot_".length()))
		_harvest_slot(idx)
		return
	match id:
		"water_base":
			_slot_moisture[4] = min(1.0, _slot_moisture[4] + 0.20)
			Juice.pop(global_position + Vector3(0, 1.8, 0), "+ WATER", Palette.SKY)
			Juice.burst(global_position + Vector3(0, 0.3, 0), Palette.SKY, 10)
			AudioManager.play("hover-tick", -6.0)
		"prune_spiral":
			AudioManager.play("biomass-chop")
			Juice.pop(global_position + Vector3(0, 1.8, 0), "PRUNED", Palette.MEADOW)
			Juice.burst(global_position + Vector3(0, 0.4, 0), Palette.MEADOW, 16)


func _plant_slot(idx: int) -> void:
	if idx < 0 or idx >= SLOT_COUNT:
		return
	if slots[idx] != null:
		return
	slots[idx] = {"species": "herb", "planted_days": 0, "moisture": SLOT_MOISTURE[idx]}
	AudioManager.play("biomass-chop")
	Juice.pop(global_position + Vector3(0, 1.8, 0), "PLANTED SLOT %d" % (idx + 1), Palette.MEADOW)
	Juice.burst(global_position + Vector3(0, 0.4, 0), Palette.MEADOW, 12)


func _harvest_slot(idx: int) -> void:
	if idx < 0 or idx >= SLOT_COUNT:
		return
	if slots[idx] == null:
		return
	slots[idx] = null
	AudioManager.play("biomass-chop")
	Juice.pop(global_position + Vector3(0, 1.8, 0), "HARVESTED", Palette.HONEY)
	Juice.burst(global_position + Vector3(0, 0.4, 0), Palette.HONEY, 14)
