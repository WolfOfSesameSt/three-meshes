## Fairy Permaculture — Hugelkultur bed (Bed variant 3).
##
## Spec (docs/design/garden-beds.md §Hugelkultur Bed):
##   - Cost: wood x 10, twigs x 8, plant_trim x 6
##   - Labor: 180 s (max_workers = 4)
##   - Growth: plants grow at 1.15x.
##   - Moisture retention: 1.40x; field_capacity += 0.08 (soil engine).
##   - OM reservoir: +0.01 %/day for 10 in-game years (~3650 days).
##   - Supports 3 plant slots (top / mid / base).
##   - Footprint: 2x2 tiles.
##
## THE permaculture signature bed. Big initial labor cost for a 10-year
## compound return. On core-expiry it gracefully degrades to raised-bed
## stats and logs a soft "your hugel has settled" message.
extends Node3D

signal clicked(bed: Node3D)
signal hover_changed(bed: Node3D, hovered: bool)

const BED_ID: String = "hugel_bed"
const BED_LABEL: String = "Hugelkultur Bed"
const GROWTH_MULTIPLIER: float = 1.15
const MOISTURE_RETENTION_MULTIPLIER: float = 1.40
const FIELD_CAPACITY_BONUS: float = 0.08
const SLOT_COUNT: int = 3
const FOOTPRINT_TILES: Vector2i = Vector2i(2, 2)
const MAX_WORKERS: int = 4
const LABOR_S: float = 180.0
const OM_RESERVOIR_YEARS: int = 10
const OM_RESERVOIR_DAYS: int = OM_RESERVOIR_YEARS * 120  # 120 days/year
const OM_PER_DAY: float = 0.01

@onready var _mound: MeshInstance3D = $Mound
@onready var _sticks: Node3D = $Sticks
@onready var _crown: MeshInstance3D = $Crown
@onready var _mulch_band: MeshInstance3D = $MulchBand
@onready var _click_area: StaticBody3D = $ClickArea

var om_pct: float = 4.0
var moisture_pct: float = 60.0
var hugel_core_days_remaining: int = OM_RESERVOIR_DAYS
var slots: Array = [null, null, null]
var _mound_mat: StandardMaterial3D
var _stick_mat: StandardMaterial3D
var _crown_mat: StandardMaterial3D
var _mulch_mat: StandardMaterial3D


func _ready() -> void:
	_mound_mat = StandardMaterial3D.new()
	_mound_mat.albedo_color = Palette.clamp_happy(Palette.EARTH)
	_mound.material_override = _mound_mat
	_stick_mat = StandardMaterial3D.new()
	_stick_mat.albedo_color = Palette.clamp_happy(Palette.COMPOST.lerp(Palette.EARTH, 0.25))
	for child in _sticks.get_children():
		if child is MeshInstance3D:
			(child as MeshInstance3D).material_override = _stick_mat
	_crown_mat = StandardMaterial3D.new()
	_crown_mat.albedo_color = Palette.clamp_happy(Palette.MEADOW)
	_crown.material_override = _crown_mat
	_mulch_mat = StandardMaterial3D.new()
	_mulch_mat.albedo_color = Palette.clamp_happy(Palette.OLIVE_DARK.lerp(Palette.EARTH, 0.3))
	_mulch_band.material_override = _mulch_mat
	add_to_group("garden_beds")
	add_to_group("hugel_beds")
	_click_area.input_event.connect(_on_click)
	_click_area.mouse_entered.connect(_on_mouse_enter)
	_click_area.mouse_exited.connect(_on_mouse_exit)
	Scheduler.day_advanced.connect(_on_day)


func _on_mouse_enter() -> void:
	set_highlight(true)
	emit_signal("hover_changed", self, true)


func _on_mouse_exit() -> void:
	set_highlight(false)
	emit_signal("hover_changed", self, false)


func set_highlight(on: bool) -> void:
	var highlight: Color = Palette.HONEY
	for m in [_mound_mat, _crown_mat, _mulch_mat, _stick_mat]:
		if m == null:
			continue
		m.rim_enabled = on
		m.rim = 0.9 if on else 0.0
		m.rim_tint = 0.75
		m.emission_enabled = on
		m.emission = highlight
		m.emission_energy_multiplier = 0.25 if on else 0.0


func _on_click(_cam: Node, _event: InputEvent, _pos: Vector3, _norm: Vector3, _shape: int) -> void:
	pass


func _on_day(_day: int, _season: String, _year: int) -> void:
	if hugel_core_days_remaining > 0:
		om_pct = clamp(om_pct + OM_PER_DAY, 0.0, 20.0)
		hugel_core_days_remaining -= 1
		if hugel_core_days_remaining == 0:
			GameLog.event("hugel_core_expired", {"path": String(get_path())})


# ---------------------------------------------------------------------
# Right-click contract — the hugel exposes 3 slots
# ---------------------------------------------------------------------

func get_context_actions() -> Array:
	var out: Array = []
	for i in range(SLOT_COUNT):
		if slots[i] != null:
			continue
		var act: Dictionary = Interactable.make_action(
			"plant_slot_%d" % i, "Plant slot %d" % (i + 1), 8.0,
			{"plant_trim": 1.0}, {},
			"", Interactable.DROP_NONE, 1
		)
		act["disabled"] = FarmTotals.get_resource(FarmTotals.PLANT_TRIM) < 1.0 and FarmTotals.get_resource(FarmTotals.SEEDS) < 1.0
		out.append(act)
	var act_water: Dictionary = Interactable.make_action(
		"water_plot", "Water hugel (rare)", 5.0,
		{"water": 1.0}, {},
		"", Interactable.DROP_NONE, 1
	)
	act_water["disabled"] = FarmTotals.get_resource(FarmTotals.WATER) < 1.0
	out.append(act_water)
	var act_repair: Dictionary = Interactable.make_action(
		"repair_mound", "Repair mound (wood x 2)", 20.0,
		{"wood": 2.0}, {},
		"", Interactable.DROP_NONE, 1
	)
	act_repair["disabled"] = FarmTotals.get_resource(FarmTotals.WOOD) < 2.0
	out.append(act_repair)
	return out


func display_name() -> String:
	return BED_LABEL


func bed_metadata() -> Dictionary:
	return {
		"id": BED_ID,
		"growth_multiplier": GROWTH_MULTIPLIER,
		"moisture_retention_multiplier": MOISTURE_RETENTION_MULTIPLIER,
		"field_capacity_bonus": FIELD_CAPACITY_BONUS,
		"slot_count": SLOT_COUNT,
		"footprint": FOOTPRINT_TILES,
		"core_days_remaining": hugel_core_days_remaining,
	}


func complete(action: Dictionary) -> void:
	var id: String = String(action.get("id", ""))
	if id.begins_with("plant_slot_"):
		var idx: int = int(id.substr("plant_slot_".length()))
		_plant_slot(idx)
		return
	match id:
		"water_plot":
			moisture_pct = min(100.0, moisture_pct + 15.0)
			Juice.pop(global_position + Vector3(0, 1.8, 0), "+ WATER", Palette.SKY)
			Juice.burst(global_position + Vector3(0, 0.6, 0), Palette.SKY, 10)
			AudioManager.play("hover-tick", -6.0)
		"repair_mound":
			hugel_core_days_remaining = min(OM_RESERVOIR_DAYS, hugel_core_days_remaining + 600)
			AudioManager.play("biomass-chop", -4.0)
			Juice.pop(global_position + Vector3(0, 1.8, 0), "MOUND REPAIRED", Palette.EARTH)
			Juice.burst(global_position + Vector3(0, 0.3, 0), Palette.EARTH, 18)


func _plant_slot(idx: int) -> void:
	if idx < 0 or idx >= SLOT_COUNT:
		return
	if slots[idx] != null:
		return
	slots[idx] = {"species": "salmonberry", "days": 0}
	AudioManager.play("biomass-chop")
	Juice.pop(global_position + Vector3(0, 1.8, 0),
		"PLANTED SLOT %d" % (idx + 1), Palette.MEADOW)
	Juice.burst(global_position + Vector3(0, 0.4, 0), Palette.MEADOW, 14)
