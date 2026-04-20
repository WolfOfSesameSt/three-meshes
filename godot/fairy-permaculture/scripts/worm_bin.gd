## Fairy Permaculture — Worm Bin.
##
## A continuous-throughput micro-compost tier that processes fruit scraps
## + plant trim into compost at a slow but steady rate (~0.3 compost/day
## when fed). Unlike the hot pile, the worm bin bypasses the 3-phase
## state machine — worms just keep eating whatever scraps are present
## and converting biomass into worm castings over time.
##
## Design contract (DESIGN.md §Compost Mini-System, Worm Bin row):
##   - Ring 0 R3 unlock (alongside Compost Pile)
##   - Build cost: wood × 4, plant_trim × 2
##   - Per-day throughput: 0.3 compost while ≥ 1 kg of fresh green input
##     is queued; 0.0 when starving
##   - Right-click adds plant_trim or fruit_scraps (per-load 1 unit)
##   - Output accumulates in `_pending_compost` — scoop to move to storage
##
## Visual: three stacked wooden slats + soil-tinted top + tiny earthworm
## decorations. No steam (cool decomposition, worms don't like >35 °C).
extends Node3D

signal clicked(bin: Node3D)
signal hover_changed(mesh: Node3D, hovered: bool)

@onready var _slat_low: MeshInstance3D = $SlatLow
@onready var _slat_mid: MeshInstance3D = $SlatMid
@onready var _slat_high: MeshInstance3D = $SlatHigh
@onready var _soil_top: MeshInstance3D = $SoilTop
@onready var _click_area: StaticBody3D = $ClickArea

var _slat_mat: StandardMaterial3D
var _soil_mat: StandardMaterial3D

## Stored biomass that the worms are actively processing (kg). Per-day
## ticks consume 1 kg and produce 0.3 compost.
var _feed_kg: float = 0.0
var _pending_compost: float = 0.0
const PRODUCTION_PER_DAY: float = 0.3
const INPUT_CONSUMED_PER_DAY: float = 1.0


func _ready() -> void:
	_slat_mat = StandardMaterial3D.new()
	_slat_mat.albedo_color = Palette.EARTH
	for s in [_slat_low, _slat_mid, _slat_high]:
		if s != null:
			s.material_override = _slat_mat
	_soil_mat = StandardMaterial3D.new()
	_soil_mat.albedo_color = Palette.COMPOST
	if _soil_top != null:
		_soil_top.material_override = _soil_mat
	Scheduler.day_advanced.connect(_on_day_advanced)
	_click_area.input_event.connect(_on_click)
	_click_area.mouse_entered.connect(_on_mouse_enter)
	_click_area.mouse_exited.connect(_on_mouse_exit)


func _on_day_advanced(_day: int, _season: String, _year: int) -> void:
	# Worms process a slice of biomass per day. Idle when starving.
	if _feed_kg >= INPUT_CONSUMED_PER_DAY:
		_feed_kg = max(0.0, _feed_kg - INPUT_CONSUMED_PER_DAY)
		_pending_compost += PRODUCTION_PER_DAY


func _on_mouse_enter() -> void:
	set_highlight(true)
	emit_signal("hover_changed", self, true)


func _on_mouse_exit() -> void:
	set_highlight(false)
	emit_signal("hover_changed", self, false)


func set_highlight(on: bool) -> void:
	for m in [_slat_mat, _soil_mat]:
		if m == null: continue
		m.rim_enabled = on
		m.rim = 0.9 if on else 0.0
		m.rim_tint = 0.75
		m.emission_enabled = on
		m.emission = Palette.HONEY
		m.emission_energy_multiplier = 0.3 if on else 0.0


func _on_click(_cam: Node, _event: InputEvent, _pos: Vector3, _norm: Vector3, _shape: int) -> void:
	pass


# =====================================================================
# Universal right-click contract
# =====================================================================

func get_context_actions() -> Array:
	var out: Array = []
	var act_trim: Dictionary = Interactable.make_action(
		"wormbin_add_plant_trim", "Add plant trim", 4.0,
		{"plant_trim": 1.0}, {},
		"", Interactable.DROP_NONE, 1
	)
	act_trim["disabled"] = FarmTotals.get_resource(FarmTotals.PLANT_TRIM) < 1.0
	out.append(act_trim)

	var act_scraps: Dictionary = Interactable.make_action(
		"wormbin_add_fruit_scraps", "Add fruit scraps", 4.0,
		{"fruit_scraps": 1.0}, {},
		"", Interactable.DROP_NONE, 1
	)
	act_scraps["disabled"] = FarmTotals.get_resource(FarmTotals.FRUIT_SCRAPS) < 1.0
	out.append(act_scraps)

	if _pending_compost >= 1.0:
		out.append(Interactable.make_action(
			"wormbin_scoop", "Scoop worm castings", 10.0,
			{}, {"compost": min(_pending_compost, 10.0)},
			"", Interactable.DROP_STORAGE, 2
		))
	return out


func display_name() -> String:
	return "Worm Bin"


func complete(action: Dictionary) -> void:
	var id: String = action.get("id", "")
	match id:
		"wormbin_add_plant_trim":
			_feed_kg += 20.0
			AudioManager.play("biomass-chop")
			Juice.pop(global_position + Vector3(0, 1.6, 0), "+ TRIM → WORMS", Palette.MEADOW)
		"wormbin_add_fruit_scraps":
			_feed_kg += 15.0
			AudioManager.play("biomass-chop")
			Juice.pop(global_position + Vector3(0, 1.6, 0), "+ SCRAPS → WORMS", Palette.CORAL)
		"wormbin_scoop":
			var scoop: float = min(_pending_compost, 10.0)
			_pending_compost = max(0.0, _pending_compost - scoop)
			AudioManager.play("compost-scoop")
			Juice.pop(global_position + Vector3(0, 1.6, 0), "+%d CASTINGS" % int(scoop), Palette.HONEY)


## Convenience for the debug simulator — external harness can read the
## per-day rate without peeking at private state.
func pending_compost() -> float:
	return _pending_compost
