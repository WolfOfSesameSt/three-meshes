## Fairy Permaculture — Storage Shed.
##
## Holds every FarmTotals typed resource (plant_trim, fruit_scraps,
## dry_leaves, wood, twigs, stone, seeds, fruit, compost, wood_chips,
## water — see FarmTotals.RESOURCE_TYPES for the canonical list). Every
## shed contributes `capacity_per_type` room to each type; FarmTotals
## sums them. The HUD inventory panel reads from FarmTotals; this node
## is the physical anchor players see. For MVP, construction animation
## + idle chimney wisp are the visible contract.
extends Node3D

signal clicked(shed: Node3D)
signal hover_changed(shed: Node3D, hovered: bool)

@onready var _walls: MeshInstance3D = $Walls
@onready var _roof: MeshInstance3D = $Roof
@onready var _door: MeshInstance3D = $Door
@onready var _click_area: StaticBody3D = $ClickArea

var _walls_mat: StandardMaterial3D
var _roof_mat: StandardMaterial3D
var _door_mat: StandardMaterial3D
var _in_construction: bool = false
var _t: float = 0.0
var _fill_pulse_t: float = 0.0

## Per-type storage cap added by THIS shed. Multiple sheds stack;
## FarmTotals.capacity_for(...) sums across every registered shed.
@export var capacity_per_type: int = 40


func _ready() -> void:
	_walls_mat = StandardMaterial3D.new()
	_walls_mat.albedo_color = Color(0.58, 0.44, 0.29)  # weathered plank
	_walls.material_override = _walls_mat
	_roof_mat = StandardMaterial3D.new()
	_roof_mat.albedo_color = Color(0.32, 0.24, 0.17)   # dark shingle
	_roof.material_override = _roof_mat
	_door_mat = StandardMaterial3D.new()
	_door_mat.albedo_color = Color(0.43, 0.30, 0.18)
	_door.material_override = _door_mat
	add_to_group("storage_sheds")
	StorageIndex.register_shed(self)
	_click_area.input_event.connect(_on_click)
	_click_area.mouse_entered.connect(_on_mouse_enter)
	_click_area.mouse_exited.connect(_on_mouse_exit)


func _process(delta: float) -> void:
	_t += delta
	if _in_construction:
		return
	# Subtle breathing so the building doesn't feel dead. Just a tiny
	# roof shimmer.
	if _roof:
		_roof.position.y = 1.55 + 0.02 * sin(_t * 1.2)
	# Deposit fill-pulse: after a drop-off the shed emission briefly
	# warms up, then fades back.
	if _fill_pulse_t > 0.0:
		_fill_pulse_t = max(0.0, _fill_pulse_t - delta)
		var a: float = _fill_pulse_t / 0.6
		for m in [_walls_mat, _roof_mat]:
			if m == null: continue
			m.emission_enabled = true
			m.emission = Color(0.95, 0.76, 0.31)
			m.emission_energy_multiplier = 0.4 * a


func _on_mouse_enter() -> void:
	set_highlight(true)
	emit_signal("hover_changed", self, true)


func _on_mouse_exit() -> void:
	set_highlight(false)
	emit_signal("hover_changed", self, false)


func set_highlight(on: bool) -> void:
	const HIGHLIGHT := Color(0.95, 0.76, 0.31)
	for m in [_walls_mat, _roof_mat, _door_mat]:
		if m == null: continue
		m.rim_enabled = on
		m.rim = 0.9 if on else 0.0
		m.rim_tint = 0.75
		m.emission_enabled = on
		m.emission = HIGHLIGHT
		m.emission_energy_multiplier = 0.3 if on else 0.0


func start_construction(duration_s: float) -> void:
	_in_construction = true
	scale = Vector3.ONE * 0.1
	for m in [_walls_mat, _roof_mat, _door_mat]:
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		m.albedo_color.a = 0.35
	var tw: Tween = create_tween()
	tw.tween_property(self, "scale", Vector3.ONE, duration_s) \
		.set_trans(Tween.TRANS_SINE)
	tw.tween_callback(_on_construction_complete)


func _on_construction_complete() -> void:
	_in_construction = false
	for m in [_walls_mat, _roof_mat, _door_mat]:
		m.transparency = BaseMaterial3D.TRANSPARENCY_DISABLED
		m.albedo_color.a = 1.0
	var wp: Vector3 = global_position + Vector3(0, 1.6, 0)
	Juice.burst(wp, Color(0.72, 0.62, 0.45), 22)
	AudioManager.play("compost-scoop", -4.0)


func _on_click(_cam: Node, _event: InputEvent, _pos: Vector3, _norm: Vector3, _shape: int) -> void:
	pass


# =====================================================================
# Universal right-click contract
# =====================================================================

## Storage-shed actions — inspect-inventory is MVP-only right now.
func get_context_actions() -> Array:
	var out: Array = []
	out.append(Interactable.make_action(
		"inspect_shed", "Open inventory", 0.0,
		{}, {}, "", Interactable.DROP_NONE, 1
	))
	return out


func display_name() -> String:
	return "Storage Shed"


## Called by TaskQueue after a fairy deposits a load. Fires the fill-
## pulse + a soft coin-drop chime.
func on_deposit_received(_yield_dict: Dictionary) -> void:
	_fill_pulse_t = 0.6
	AudioManager.play("compost-scoop", -4.0)
	Juice.burst(global_position + Vector3(0, 1.8, 0), Color(0.95, 0.76, 0.31), 8)
