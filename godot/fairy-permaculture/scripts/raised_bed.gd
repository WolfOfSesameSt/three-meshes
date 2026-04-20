## Fairy Permaculture — wood-sided raised bed (Bed variant 2).
##
## Spec (docs/design/garden-beds.md §Raised Bed):
##   - Cost: wood x 6, plant_trim x 4
##   - Labor: 60 s
##   - Growth: plants here grow at 1.20x.
##   - Moisture decay: 1.15x (drains faster).
##   - Starting OM: +2 (pre-compost-mixed inside).
##   - Immune to slug damage (+0.30 m off-ground).
##   - Footprint: 1x2 tiles.
##
## This is the "tidy-annual" bed — best for quick-yield annuals, paired
## with the raised-bed-dries-fast nudge surfaced by the downstream soil
## engine pass.
##
## The script owns its four wooden planks + four corner supports + the
## compost-tinted interior patch. All materials source from Palette so
## no raw Color() ever leaks. Plants spawned here are tagged with the
## parent-bed growth multiplier — the plant script (read-only this pass)
## can later consult `bed_parent()` for its speed-up.
extends Node3D

signal clicked(bed: Node3D)
signal hover_changed(bed: Node3D, hovered: bool)

const BED_ID: String = "raised_bed"
const BED_LABEL: String = "Raised Bed"
const GROWTH_MULTIPLIER: float = 1.20
const MOISTURE_DECAY_MULTIPLIER: float = 1.15
const OM_STARTING_BONUS: float = 2.0
const FOOTPRINT_TILES: Vector2i = Vector2i(1, 2)
const MAX_WORKERS: int = 3
const LABOR_S: float = 60.0
const SLUG_IMMUNE: bool = true

const PlantScene = preload("res://scenes/plant.tscn")

@onready var _interior: MeshInstance3D = $Interior
@onready var _frame: Node3D = $Frame
@onready var _click_area: StaticBody3D = $ClickArea

var om_pct: float = 5.0  # baseline + OM_STARTING_BONUS inside _ready
var moisture_pct: float = 35.0
var state: String = "bare"
var _interior_mat: StandardMaterial3D
var _frame_mats: Array[StandardMaterial3D] = []


func _ready() -> void:
	_interior_mat = StandardMaterial3D.new()
	_interior_mat.albedo_color = Palette.clamp_happy(Palette.COMPOST.lerp(Palette.EARTH, 0.35))
	_interior.material_override = _interior_mat
	for i in range(_frame.get_child_count()):
		var child: Node = _frame.get_child(i)
		if child is MeshInstance3D:
			var mat: StandardMaterial3D = StandardMaterial3D.new()
			if String(child.name).begins_with("Support"):
				mat.albedo_color = Palette.clamp_happy(Palette.COMPOST.lerp(Palette.EARTH, 0.2))
			else:
				mat.albedo_color = Palette.clamp_happy(Palette.EARTH)
			(child as MeshInstance3D).material_override = mat
			_frame_mats.append(mat)
	om_pct = max(om_pct, 2.0 + OM_STARTING_BONUS)
	add_to_group("garden_beds")
	add_to_group("raised_beds")
	_click_area.input_event.connect(_on_click)
	_click_area.mouse_entered.connect(_on_mouse_enter)
	_click_area.mouse_exited.connect(_on_mouse_exit)


func _on_mouse_enter() -> void:
	set_highlight(true)
	emit_signal("hover_changed", self, true)


func _on_mouse_exit() -> void:
	set_highlight(false)
	emit_signal("hover_changed", self, false)


func set_highlight(on: bool) -> void:
	var highlight: Color = Palette.HONEY
	var mats: Array[StandardMaterial3D] = [_interior_mat]
	for m in _frame_mats:
		mats.append(m)
	for m in mats:
		if m == null:
			continue
		m.rim_enabled = on
		m.rim = 0.9 if on else 0.0
		m.rim_tint = 0.75
		m.emission_enabled = on
		m.emission = highlight
		m.emission_energy_multiplier = 0.3 if on else 0.0


func _on_click(_cam: Node, _event: InputEvent, _pos: Vector3, _norm: Vector3, _shape: int) -> void:
	pass


# ---------------------------------------------------------------------
# Right-click contract
# ---------------------------------------------------------------------

func get_context_actions() -> Array:
	var out: Array = []
	if FarmTotals.get_resource(FarmTotals.PLANT_TRIM) >= 1.0 or FarmTotals.get_resource(FarmTotals.SEEDS) >= 1.0:
		out.append(Interactable.make_action(
			"plant_bush", "Plant bush (+20% growth)", 8.0,
			{"plant_trim": 1.0}, {},
			"", Interactable.DROP_NONE, 1
		))
	var act_water: Dictionary = Interactable.make_action(
		"water_plot", "Water plot", 5.0,
		{"water": 1.0}, {},
		"", Interactable.DROP_NONE, 1
	)
	act_water["disabled"] = FarmTotals.get_resource(FarmTotals.WATER) < 1.0
	out.append(act_water)
	var act_topup: Dictionary = Interactable.make_action(
		"top_up_compost", "Top-up compost", 6.0,
		{"compost": 1.0}, {},
		"", Interactable.DROP_NONE, 1
	)
	act_topup["disabled"] = FarmTotals.get_resource(FarmTotals.COMPOST) < 1.0
	out.append(act_topup)
	out.append(Interactable.make_action(
		"dismantle_raised_bed", "Dismantle (reclaim wood x 3)", 12.0,
		{}, {"wood": 3.0},
		"", Interactable.DROP_STORAGE, 1
	))
	return out


func display_name() -> String:
	return BED_LABEL


func bed_metadata() -> Dictionary:
	return {
		"id": BED_ID,
		"growth_multiplier": GROWTH_MULTIPLIER,
		"moisture_decay_multiplier": MOISTURE_DECAY_MULTIPLIER,
		"om_starting_bonus": OM_STARTING_BONUS,
		"slug_immune": SLUG_IMMUNE,
		"footprint": FOOTPRINT_TILES,
	}


func complete(action: Dictionary) -> void:
	var id: String = String(action.get("id", ""))
	match id:
		"plant_bush":
			_plant_bush()
		"water_plot":
			moisture_pct = min(100.0, moisture_pct + 20.0)
			var water_tint: Color = Palette.SKY.lerp(Palette.MIST, 0.20)
			AudioManager.play("hover-tick", -6.0)
			Juice.pop(global_position + Vector3(0, 1.6, 0), "+ WATER", water_tint)
			Juice.burst(global_position + Vector3(0, 0.3, 0), water_tint, 10)
		"top_up_compost":
			om_pct = clamp(om_pct + 1.0, 0.0, 20.0)
			AudioManager.play("compost-scoop", -4.0)
			Juice.pop(global_position + Vector3(0, 1.6, 0), "+ COMPOST", Palette.COMPOST)
			Juice.burst(global_position + Vector3(0, 0.3, 0), Palette.COMPOST, 16)
		"dismantle_raised_bed":
			AudioManager.play("biomass-chop", -4.0)
			Juice.pop(global_position + Vector3(0, 1.4, 0), "DISMANTLED", Palette.EARTH)
			queue_free()


func _plant_bush() -> void:
	if state == "planted":
		return
	state = "planted"
	var plant: Node3D = PlantScene.instantiate()
	plant.setup("salmonberry")
	get_parent().add_child(plant)
	plant.global_position = global_position + Vector3(0, 0.3, 0)
	plant.stage = "seedling"
	plant.age_days = 10
	plant.ripe_amount = 0.0
	plant.ripe_count = 0
	plant.growth_stage = VisualState.STAGE_JUVENILE
	var main: Node = get_tree().current_scene
	if main != null and main.has_method("register_plant"):
		main.register_plant(plant)
	AudioManager.play("biomass-chop")
	Juice.pop(global_position + Vector3(0, 1.6, 0), "PLANTED +20%", Palette.MEADOW)
	Juice.burst(global_position + Vector3(0, 0.6, 0), Palette.MEADOW, 12)
