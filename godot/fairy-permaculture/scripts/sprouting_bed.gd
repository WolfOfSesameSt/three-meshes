## Fairy Permaculture — nursery sprouting bed.
##
## A 4-slot propagation frame. Player sows seeds into a slot (costs 1
## biomass) and the seedling progresses one sprouting-day per in-game
## day. Ready seedlings transplant to the nearest bare soil plot as a
## mature plant — much faster than direct-sowing in the wild.
##
## Build-progress visual: when spawned via `start_construction()` the
## bed starts at 10 % scale, alpha-ghosted. A Tween ramps it up to
## 100 % as the TaskQueue-driven build task completes. When finished
## a small dust puff + chime announces it. In use, the slot markers
## jitter subtly (seeds bulging, wind) so the bed looks alive.
##
## Left-click is a no-op. Right-click → Sow / Transplant actions go
## through the context menu (hooked in main.gd later).
extends Node3D

signal clicked(bed: Node3D)
signal hover_changed(bed: Node3D, hovered: bool)

const SLOT_COUNT := 4
const DAYS_TO_READY := 6
const COST_BIOMASS := 1.0

@onready var _frame: MeshInstance3D = $Frame
@onready var _click_area: StaticBody3D = $ClickArea
@onready var _slot_markers: Array[MeshInstance3D] = [$SlotMarkers/S0, $SlotMarkers/S1, $SlotMarkers/S2, $SlotMarkers/S3]

var _frame_mat: StandardMaterial3D
var _slot_mats: Array[StandardMaterial3D] = []
var _t: float = 0.0
var _in_construction: bool = false

# Each slot is either null (empty) or { species: String, days: int }.
var slots: Array = [null, null, null, null]


func _ready() -> void:
	_frame_mat = StandardMaterial3D.new()
	_frame_mat.albedo_color = Color(0.54, 0.41, 0.27)  # wood plank
	_frame.material_override = _frame_mat
	for i in range(SLOT_COUNT):
		var m: StandardMaterial3D = StandardMaterial3D.new()
		m.albedo_color = Color(0.25, 0.19, 0.14)  # empty compost-rich tone
		_slot_markers[i].material_override = m
		_slot_mats.append(m)
	add_to_group("sprouting_beds")
	_click_area.input_event.connect(_on_click)
	_click_area.mouse_entered.connect(_on_mouse_enter)
	_click_area.mouse_exited.connect(_on_mouse_exit)
	Scheduler.day_advanced.connect(_on_day)


func _process(delta: float) -> void:
	_t += delta
	# Idle "seeds breathing" animation — each marker gently bulges if
	# a seedling is inside. Empty slots rest flat.
	if _in_construction:
		return
	for i in range(SLOT_COUNT):
		var s: Variant = slots[i]
		if s == null:
			continue
		var amp: float = 0.04
		var base_y: float = 0.2
		_slot_markers[i].position.y = base_y + sin(_t * 2.0 + float(i) * 1.3) * amp


func _on_mouse_enter() -> void:
	set_highlight(true)
	emit_signal("hover_changed", self, true)


func _on_mouse_exit() -> void:
	set_highlight(false)
	emit_signal("hover_changed", self, false)


func set_highlight(on: bool) -> void:
	const HIGHLIGHT := Color(0.95, 0.76, 0.31)
	if _frame_mat:
		_frame_mat.rim_enabled = on
		_frame_mat.rim = 0.9 if on else 0.0
		_frame_mat.rim_tint = 0.75
		_frame_mat.emission_enabled = on
		_frame_mat.emission = HIGHLIGHT
		_frame_mat.emission_energy_multiplier = 0.3 if on else 0.0


## Kick off construction animation: ghost-small → full scale over
## `duration_s` seconds. When complete, fires a completion burst and
## clears the "ghost" look. Called by main after a build task lands.
func start_construction(duration_s: float) -> void:
	_in_construction = true
	scale = Vector3.ONE * 0.1
	# Ghost material tint on frame + slots.
	if _frame_mat:
		_frame_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		_frame_mat.albedo_color.a = 0.35
	for m in _slot_mats:
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		m.albedo_color.a = 0.35
	var tw: Tween = create_tween()
	tw.tween_property(self, "scale", Vector3.ONE, duration_s) \
		.set_trans(Tween.TRANS_SINE)
	tw.tween_callback(_on_construction_complete)


func _on_construction_complete() -> void:
	_in_construction = false
	if _frame_mat:
		_frame_mat.transparency = BaseMaterial3D.TRANSPARENCY_DISABLED
		_frame_mat.albedo_color.a = 1.0
	for m in _slot_mats:
		m.transparency = BaseMaterial3D.TRANSPARENCY_DISABLED
		m.albedo_color.a = 1.0
	# Dust-puff announcement.
	var wp: Vector3 = global_position + Vector3(0, 0.6, 0)
	Juice.burst(wp, Color(0.72, 0.62, 0.45), 18)
	AudioManager.play("compost-scoop", -6.0)


## Sow a seed into the first empty slot. Returns true on success.
func sow(species_id: String) -> bool:
	var idx: int = _first_empty_slot()
	if idx < 0: return false
	if not FarmTotals.spend_biomass(COST_BIOMASS): return false
	slots[idx] = { "species": species_id, "days": 0 }
	_refresh_slot_visuals()
	AudioManager.play("biomass-chop")
	Juice.pop(global_position + Vector3(0, 1.9, 0), "SOWN", Color(0.55, 0.77, 0.48))
	Juice.burst(global_position + Vector3(0, 0.7, 0), Color(0.55, 0.77, 0.48), 10)
	return true


## Transplant the first ready slot to a nearby bare soil plot.
## Returns true on success.
func transplant_first_ready() -> bool:
	var idx: int = _first_ready_slot()
	if idx < 0: return false
	var plot: Node3D = _find_nearest_bare_plot()
	if plot == null: return false
	var species_id: String = slots[idx]["species"]
	slots[idx] = null
	_refresh_slot_visuals()

	# Place a mature plant where the plot was, then free the plot.
	var main: Node = get_tree().current_scene
	var PlantScene: PackedScene = load("res://scenes/plant.tscn")
	var plant: Node3D = PlantScene.instantiate()
	plant.setup(species_id)
	main.add_child(plant)
	plant.global_position = plot.global_position
	plant.stage = "mature"
	plant.age_days = 120
	plant.ripe_amount = 2.0
	plant.ripe_count = 2
	plant.growth_stage = VisualState.STAGE_FRUITING
	if main.has_method("register_plant"):
		main.register_plant(plant)
	plot.queue_free()

	AudioManager.play("berry-pick")
	Juice.pop(plant.global_position + Vector3(0, 2.2, 0), "TRANSPLANTED", Color(0.95, 0.76, 0.31))
	Juice.burst(plant.global_position + Vector3(0, 0.8, 0), Color(0.55, 0.77, 0.48), 16)
	return true


func ready_slot_count() -> int:
	var n: int = 0
	for s in slots:
		if s != null and int(s["days"]) >= DAYS_TO_READY:
			n += 1
	return n


func empty_slot_count() -> int:
	var n: int = 0
	for s in slots:
		if s == null: n += 1
	return n


func _first_empty_slot() -> int:
	for i in range(SLOT_COUNT):
		if slots[i] == null: return i
	return -1


func _first_ready_slot() -> int:
	for i in range(SLOT_COUNT):
		var s: Variant = slots[i]
		if s != null and int(s["days"]) >= DAYS_TO_READY: return i
	return -1


func _find_nearest_bare_plot() -> Node3D:
	var best: Node3D = null
	var best_d: float = INF
	for n in get_tree().get_nodes_in_group("soil_plots"):
		if not (n is Node3D): continue
		if n.state != n.STATE_BARE: continue
		var d: float = global_position.distance_squared_to((n as Node3D).global_position)
		if d < best_d:
			best_d = d; best = n
	return best


func _on_day(_day: int, _season: String, _year: int) -> void:
	var someone_became_ready: bool = false
	for i in range(SLOT_COUNT):
		var s: Variant = slots[i]
		if s == null: continue
		var was_ready: bool = int(s["days"]) >= DAYS_TO_READY
		s["days"] = int(s["days"]) + 1
		if not was_ready and int(s["days"]) >= DAYS_TO_READY:
			someone_became_ready = true
	_refresh_slot_visuals()
	if someone_became_ready:
		AudioManager.play("compost-finish")
		Juice.pop(global_position + Vector3(0, 1.9, 0), "READY TO PLANT", Color(0.45, 0.60, 0.35))
		Juice.burst(global_position + Vector3(0, 0.7, 0), Color(0.55, 0.77, 0.48), 14)


func _refresh_slot_visuals() -> void:
	for i in range(SLOT_COUNT):
		var m: StandardMaterial3D = _slot_mats[i]
		var s: Variant = slots[i]
		if s == null:
			m.albedo_color = Color(0.25, 0.19, 0.14)
			m.emission_enabled = false
			_slot_markers[i].scale = Vector3.ONE * 0.6
		else:
			var days: int = int(s["days"])
			if days >= DAYS_TO_READY:
				m.albedo_color = Color(0.55, 0.77, 0.48)  # ready — meadow green
				m.emission_enabled = true
				m.emission = Color(0.95, 0.76, 0.31)
				m.emission_energy_multiplier = 0.35
				_slot_markers[i].scale = Vector3.ONE * 1.0
			else:
				# sprouting — sage green, grow over time.
				var t: float = float(days) / float(DAYS_TO_READY)
				m.albedo_color = Color(0.35, 0.48, 0.30).lerp(Color(0.55, 0.67, 0.42), t)
				m.emission_enabled = false
				_slot_markers[i].scale = Vector3(0.6, 0.6 + t * 0.7, 0.6)


## LMB is a no-op; RMB routes through the context menu in main.gd.
func _on_click(_cam: Node, _event: InputEvent, _pos: Vector3, _norm: Vector3, _shape: int) -> void:
	pass


# =====================================================================
# Universal right-click contract
# =====================================================================

func get_context_actions() -> Array:
	var out: Array = []
	# Sow-seed pays in plant_trim (successor to the old "greens" bucket
	# under the taxonomy refactor). The per-seed cost constant name stays
	# COST_BIOMASS for historical continuity with nursery_panel.gd.
	if empty_slot_count() > 0 and FarmTotals.get_resource(FarmTotals.PLANT_TRIM) >= COST_BIOMASS:
		out.append(Interactable.make_action(
			"sow_seed", "Sow pioneer seed", 5.0,
			{"plant_trim": COST_BIOMASS}, {},
			"", Interactable.DROP_NONE, 1
		))
	if ready_slot_count() > 0:
		out.append(Interactable.make_action(
			"transplant_ready", "Transplant ready seedling", 8.0,
			{}, {},
			"", Interactable.DROP_NONE, 1
		))
	return out


func display_name() -> String:
	return "Sprouting Bed"


## TaskQueue completion hook.
func complete(action: Dictionary) -> void:
	var id: String = action.get("id", "")
	match id:
		"sow_seed":
			# Cost already spent at queue time, so pass a "skip-cost"
			# variant: sow directly without double-spending biomass.
			_sow_without_cost("nettle")
		"transplant_ready":
			transplant_first_ready()


func _sow_without_cost(species_id: String) -> void:
	var idx: int = _first_empty_slot()
	if idx < 0: return
	slots[idx] = { "species": species_id, "days": 0 }
	_refresh_slot_visuals()
	AudioManager.play("biomass-chop")
	Juice.pop(global_position + Vector3(0, 1.9, 0), "SOWN", Color(0.55, 0.77, 0.48))
	Juice.burst(global_position + Vector3(0, 0.7, 0), Color(0.55, 0.77, 0.48), 10)
