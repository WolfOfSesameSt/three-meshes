## Fairy Permaculture — Johnson-Su Bioreactor.
##
## Fungal-dominant static compost bioreactor. Unlike turn-driven hot
## piles, the Johnson-Su sits sealed for 12 months with no turning — the
## long cook produces a premium fungal-dominant biological inoculant that
## the soil-engine agent will eventually wire into the biology channel.
##
## For MVP we yield 1 bone_meal-equivalent amendment (the rarest
## amendment currently in the game) after the 365-day cook, plus bonus
## compost. This lines up with the DESIGN row's "0.1 bone_meal equivalent
## amendment" using the premium-tier accounting.
##
## Design contract (DESIGN.md §Compost Mini-System, Johnson-Su row):
##   - Ring 4 Branch F unlock
##   - Build cost: wood × 10, stone × 6
##   - 12-month (365-day) static cook
##   - Inputs: wood_chips + plant_trim (fungal substrate + N)
##   - Output: bone_meal (amendment) + compost (bonus)
extends Node3D

signal clicked(reactor: Node3D)
signal hover_changed(mesh: Node3D, hovered: bool)

@onready var _frame: MeshInstance3D = $Frame
@onready var _pipe: MeshInstance3D = $Pipe
@onready var _cap: MeshInstance3D = $Cap
@onready var _click_area: StaticBody3D = $ClickArea

var _frame_mat: StandardMaterial3D
var _pipe_mat: StandardMaterial3D
var _cap_mat: StandardMaterial3D

const S_EMPTY: String = "empty"
const S_FILLING: String = "filling"
const S_COOKING: String = "cooking"
const S_DONE: String = "done"

const COOK_DAYS: int = 365
const BATCH_WOOD_CHIPS: float = 5.0
const BATCH_PLANT_TRIM: float = 5.0
const YIELD_BONE_MEAL: float = 1.0
const YIELD_COMPOST: float = 2.0

var _state: String = S_EMPTY
var _days_in_state: int = 0
var _chips_kg: float = 0.0
var _trim_kg: float = 0.0


func _ready() -> void:
	_frame_mat = StandardMaterial3D.new()
	_frame_mat.albedo_color = Palette.EARTH
	if _frame:
		_frame.material_override = _frame_mat
	_pipe_mat = StandardMaterial3D.new()
	_pipe_mat.albedo_color = Palette.WARM_STONE
	if _pipe:
		_pipe.material_override = _pipe_mat
	_cap_mat = StandardMaterial3D.new()
	_cap_mat.albedo_color = Palette.COMPOST
	if _cap:
		_cap.material_override = _cap_mat
	Scheduler.day_advanced.connect(_on_day_advanced)
	_click_area.input_event.connect(_on_click)
	_click_area.mouse_entered.connect(_on_mouse_enter)
	_click_area.mouse_exited.connect(_on_mouse_exit)


func _on_day_advanced(_day: int, _season: String, _year: int) -> void:
	if _state == S_COOKING:
		_days_in_state += 1
		if _days_in_state >= COOK_DAYS:
			_state = S_DONE
			_days_in_state = 0
			AudioManager.play("compost-finish", -4.0)
			Juice.pop(global_position + Vector3(0, 2.2, 0), "✦ BIO-INOCULANT READY", Palette.HONEY)
			Juice.burst(global_position + Vector3(0, 2.2, 0), Palette.HONEY, 28)


func _on_mouse_enter() -> void:
	set_highlight(true)
	emit_signal("hover_changed", self, true)


func _on_mouse_exit() -> void:
	set_highlight(false)
	emit_signal("hover_changed", self, false)


func set_highlight(on: bool) -> void:
	for m in [_frame_mat, _pipe_mat, _cap_mat]:
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
	if _state == S_EMPTY or _state == S_FILLING:
		var act_chips: Dictionary = Interactable.make_action(
			"js_add_chips", "Add wood chips", 6.0,
			{"wood_chips": 1.0}, {},
			"", Interactable.DROP_NONE, 1
		)
		act_chips["disabled"] = FarmTotals.get_resource(FarmTotals.WOOD_CHIPS) < 1.0
		out.append(act_chips)
		var act_trim: Dictionary = Interactable.make_action(
			"js_add_trim", "Add plant trim", 6.0,
			{"plant_trim": 1.0}, {},
			"", Interactable.DROP_NONE, 1
		)
		act_trim["disabled"] = FarmTotals.get_resource(FarmTotals.PLANT_TRIM) < 1.0
		out.append(act_trim)
		if _chips_kg >= BATCH_WOOD_CHIPS and _trim_kg >= BATCH_PLANT_TRIM:
			out.append(Interactable.make_action(
				"js_seal", "Seal reactor (12-month cook)", 20.0,
				{}, {}, "", Interactable.DROP_NONE, 1
			))
	elif _state == S_DONE:
		out.append(Interactable.make_action(
			"js_scoop", "Scoop bio-inoculant", 20.0,
			{}, {"bone_meal": YIELD_BONE_MEAL, "compost": YIELD_COMPOST},
			"", Interactable.DROP_STORAGE, 2
		))
	return out


func display_name() -> String:
	return "Johnson-Su Bioreactor"


func complete(action: Dictionary) -> void:
	var id: String = action.get("id", "")
	match id:
		"js_add_chips":
			_chips_kg += 1.0
			_state = S_FILLING
			AudioManager.play("biomass-chop")
			Juice.pop(global_position + Vector3(0, 2.0, 0), "+ CHIPS", Palette.EARTH.lerp(Palette.HONEY, 0.35))
		"js_add_trim":
			_trim_kg += 1.0
			_state = S_FILLING
			AudioManager.play("biomass-chop")
			Juice.pop(global_position + Vector3(0, 2.0, 0), "+ TRIM", Palette.MEADOW)
		"js_seal":
			_state = S_COOKING
			_days_in_state = 0
			AudioManager.play("compost-scoop", -4.0)
			Juice.pop(global_position + Vector3(0, 2.0, 0), "SEALED — 12 MONTHS", Palette.BERRY)
		"js_scoop":
			_state = S_EMPTY
			_chips_kg = 0.0
			_trim_kg = 0.0
			AudioManager.play("compost-scoop")
			Juice.pop(global_position + Vector3(0, 2.0, 0), "+BONE MEAL +COMPOST", Palette.HONEY)


func current_state() -> String:
	return _state


func days_remaining() -> int:
	if _state != S_COOKING:
		return 0
	return max(0, COOK_DAYS - _days_in_state)
