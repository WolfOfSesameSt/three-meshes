## Fairy Permaculture — Compost Tea Brewer.
##
## Steeps finished compost in aerated water for 24–36 hours to produce a
## liquid biological inoculant. One brew covers 1 tile for 3–5 days. The
## output is announced via the `tea_buff_emitted` signal so main.gd (or
## the future soil-engine agent) can apply the buff to a targeted tile
## — for MVP we just deposit a single "compost" unit back into storage
## tagged as a foliar buff (stubbed — the soil-engine agent will wire it
## properly when the per-tile NPK channels land).
##
## Design contract (DESIGN.md §Compost Mini-System, Tea Brewer row):
##   - Unlock: after first Hot Pile Q3+ batch
##   - Build cost: wood × 3, water × 2
##   - 24–36 h per brew → 1.5 days (we snap to 2 day-ticks so the state
##     machine doesn't stall mid-day)
##   - Needs: water × 1 + compost × 1 to start
##   - Output: 1 foliar buff (stubbed as compost output + TEA_BUFF signal)
extends Node3D

signal clicked(brewer: Node3D)
signal hover_changed(mesh: Node3D, hovered: bool)
## Fires when a brew finishes. main.gd (or later the soil-engine agent)
## picks this up to apply the 3–5 day tile buff.
signal tea_buff_emitted(brewer: Node3D, days: int)

@onready var _tank: MeshInstance3D = $Tank
@onready var _cap: MeshInstance3D = $Cap
@onready var _click_area: StaticBody3D = $ClickArea

var _tank_mat: StandardMaterial3D
var _cap_mat: StandardMaterial3D

const S_EMPTY: String = "empty"
const S_BREWING: String = "brewing"
const S_DONE: String = "done"

## 24–36 h real-time brew → 2 in-game day ticks (1.5 days rounded up so
## state machine has a full tick to latch).
const BREW_DAYS: int = 2
const BUFF_DAYS: int = 4   # 3–5 day buff window; split the middle
const BUFF_COMPOST_UNITS: float = 1.0

var _state: String = S_EMPTY
var _days_in_state: int = 0


func _ready() -> void:
	_tank_mat = StandardMaterial3D.new()
	_tank_mat.albedo_color = Palette.EARTH
	if _tank:
		_tank.material_override = _tank_mat
	_cap_mat = StandardMaterial3D.new()
	_cap_mat.albedo_color = Palette.SKY.lerp(Palette.MIST, 0.3)
	if _cap:
		_cap.material_override = _cap_mat
	Scheduler.day_advanced.connect(_on_day_advanced)
	_click_area.input_event.connect(_on_click)
	_click_area.mouse_entered.connect(_on_mouse_enter)
	_click_area.mouse_exited.connect(_on_mouse_exit)


func _on_day_advanced(_day: int, _season: String, _year: int) -> void:
	if _state == S_BREWING:
		_days_in_state += 1
		if _days_in_state >= BREW_DAYS:
			_state = S_DONE
			_days_in_state = 0
			AudioManager.play("compost-finish", -6.0)
			Juice.pop(global_position + Vector3(0, 1.6, 0), "✦ TEA READY", Palette.MEADOW)
			emit_signal("tea_buff_emitted", self, BUFF_DAYS)


func _on_mouse_enter() -> void:
	set_highlight(true)
	emit_signal("hover_changed", self, true)


func _on_mouse_exit() -> void:
	set_highlight(false)
	emit_signal("hover_changed", self, false)


func set_highlight(on: bool) -> void:
	for m in [_tank_mat, _cap_mat]:
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
		var act_brew: Dictionary = Interactable.make_action(
			"brewer_start", "Brew compost tea (1 water + 1 compost)", 6.0,
			{"water": 1.0, "compost": 1.0}, {},
			"", Interactable.DROP_NONE, 1
		)
		var short: bool = FarmTotals.get_resource(FarmTotals.WATER) < 1.0 \
			or FarmTotals.get_resource(FarmTotals.COMPOST) < 1.0
		act_brew["disabled"] = short
		out.append(act_brew)
	elif _state == S_DONE:
		out.append(Interactable.make_action(
			"brewer_scoop", "Scoop tea (foliar buff)", 8.0,
			{}, {"compost": BUFF_COMPOST_UNITS},
			"", Interactable.DROP_STORAGE, 2
		))
	return out


func display_name() -> String:
	return "Compost Tea Brewer"


func complete(action: Dictionary) -> void:
	var id: String = action.get("id", "")
	match id:
		"brewer_start":
			_state = S_BREWING
			_days_in_state = 0
			AudioManager.play("water-splash", -6.0)
			Juice.pop(global_position + Vector3(0, 1.6, 0), "BREWING", Palette.MEADOW)
		"brewer_scoop":
			_state = S_EMPTY
			_days_in_state = 0
			AudioManager.play("compost-scoop")
			Juice.pop(global_position + Vector3(0, 1.6, 0), "+TEA BUFF 4 DAYS", Palette.MEADOW)


func current_state() -> String:
	return _state
