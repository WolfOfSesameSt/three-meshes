## Fairy Permaculture — Bokashi Bucket.
##
## Anaerobic ferment of fruit scraps + kitchen/dairy/oil (future) in a
## sealed bucket with LAB (lactic acid bacteria) starter. 14-day seal
## phase followed by a 28-day bury-and-break-down phase = 42 days total
## per batch, yielding an acidic compost amendment.
##
## Design contract (DESIGN.md §Compost Mini-System, Bokashi row):
##   - Ring 2 unlock (after first Storage Shed)
##   - Build cost: wood × 3, stone × 2
##   - 14-day seal + 28-day bury = 42-day total per batch
##   - Accepts fruit_scraps (and later: kitchen/dairy/oil scraps — stubbed
##     as a single input channel for MVP)
##   - Output: 1 compost per successfully-completed batch, flagged
##     "acidic" for the future soil-engine agent to pick up on pH routing
##
## States:
##   - empty: awaiting fill
##   - sealed: fermenting (14 days)
##   - buried: breaking down (28 days)
##   - done: 1 compost ready to scoop
extends Node3D

signal clicked(bucket: Node3D)
signal hover_changed(mesh: Node3D, hovered: bool)

@onready var _body: MeshInstance3D = $Body
@onready var _lid: MeshInstance3D = $Lid
@onready var _click_area: StaticBody3D = $ClickArea

var _body_mat: StandardMaterial3D
var _lid_mat: StandardMaterial3D

const S_EMPTY: String = "empty"
const S_SEALED: String = "sealed"
const S_BURIED: String = "buried"
const S_DONE: String = "done"

const SEAL_DAYS: int = 14
const BURY_DAYS: int = 28
const BATCH_COMPOST: float = 1.0

var _state: String = S_EMPTY
var _days_in_state: int = 0
var _fill_kg: float = 0.0
const FILL_TARGET_KG: float = 5.0  # 5 kg of fruit scraps seals the batch


func _ready() -> void:
	_body_mat = StandardMaterial3D.new()
	_body_mat.albedo_color = Palette.WARM_STONE
	if _body:
		_body.material_override = _body_mat
	_lid_mat = StandardMaterial3D.new()
	_lid_mat.albedo_color = Palette.EARTH
	if _lid:
		_lid.material_override = _lid_mat
	Scheduler.day_advanced.connect(_on_day_advanced)
	_click_area.input_event.connect(_on_click)
	_click_area.mouse_entered.connect(_on_mouse_enter)
	_click_area.mouse_exited.connect(_on_mouse_exit)


func _on_day_advanced(_day: int, _season: String, _year: int) -> void:
	if _state == S_SEALED:
		_days_in_state += 1
		if _days_in_state >= SEAL_DAYS:
			_state = S_BURIED
			_days_in_state = 0
			AudioManager.play("hover-tick", -6.0)
			Juice.pop(global_position + Vector3(0, 1.6, 0), "BURY PHASE", Palette.EARTH)
	elif _state == S_BURIED:
		_days_in_state += 1
		if _days_in_state >= BURY_DAYS:
			_state = S_DONE
			_days_in_state = 0
			AudioManager.play("compost-finish", -6.0)
			Juice.pop(global_position + Vector3(0, 1.6, 0), "✦ BOKASHI DONE", Palette.HONEY)


func _on_mouse_enter() -> void:
	set_highlight(true)
	emit_signal("hover_changed", self, true)


func _on_mouse_exit() -> void:
	set_highlight(false)
	emit_signal("hover_changed", self, false)


func set_highlight(on: bool) -> void:
	for m in [_body_mat, _lid_mat]:
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
	if _state == S_EMPTY:
		var act_scraps: Dictionary = Interactable.make_action(
			"bokashi_add_scraps", "Add fruit scraps", 4.0,
			{"fruit_scraps": 1.0}, {},
			"", Interactable.DROP_NONE, 1
		)
		act_scraps["disabled"] = FarmTotals.get_resource(FarmTotals.FRUIT_SCRAPS) < 1.0
		out.append(act_scraps)
		if _fill_kg >= FILL_TARGET_KG:
			out.append(Interactable.make_action(
				"bokashi_seal", "Seal bucket (14-day ferment)", 8.0,
				{}, {}, "", Interactable.DROP_NONE, 1
			))
	elif _state == S_DONE:
		out.append(Interactable.make_action(
			"bokashi_scoop", "Scoop bokashi amendment", 10.0,
			{}, {"compost": BATCH_COMPOST},
			"", Interactable.DROP_STORAGE, 2
		))
	return out


func display_name() -> String:
	return "Bokashi Bucket"


func complete(action: Dictionary) -> void:
	var id: String = action.get("id", "")
	match id:
		"bokashi_add_scraps":
			_fill_kg += 1.0
			AudioManager.play("biomass-chop")
			Juice.pop(global_position + Vector3(0, 1.6, 0), "+ SCRAPS", Palette.CORAL)
		"bokashi_seal":
			_state = S_SEALED
			_days_in_state = 0
			AudioManager.play("compost-scoop", -4.0)
			Juice.pop(global_position + Vector3(0, 1.6, 0), "SEALED", Palette.BERRY)
		"bokashi_scoop":
			_state = S_EMPTY
			_fill_kg = 0.0
			AudioManager.play("compost-scoop")
			Juice.pop(global_position + Vector3(0, 1.6, 0), "+1 COMPOST (acidic)", Palette.HONEY)


## For the debug simulator — inspect the current phase.
func current_state() -> String:
	return _state
