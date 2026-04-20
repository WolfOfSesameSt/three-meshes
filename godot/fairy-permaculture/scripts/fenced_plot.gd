## Fairy Permaculture — fenced garden plot (standard variant).
##
## The baseline garden bed: the same soil mechanics as the current
## soil_plot, wrapped in four low wooden posts + two horizontal rails
## so the player can see "I-have-been-gardened-here" at a glance.
##
## Mechanical spec (docs/design/garden-beds.md §Standard):
##   - Cost: wood x 3
##   - Labor: 40 s
##   - Growth / moisture: identical to a bare soil_plot — this is a
##     pure legibility + +2 % morale upgrade.
##   - Footprint: 1x1 tile.
##
## Right-click flow mirrors the soil_plot: plant / water / mulch /
## inspect. This variant delegates its action catalogue to the same
## Interactable helpers so an amendment pipeline that lands on soil_plot
## works here too (scripts/soil_plot.gd is read-only to this pass —
## we therefore re-implement the action surface here).
##
## The parent variant constant (growth_multiplier = 1.0) is provided so
## downstream soil-engine passes can read a uniform handle across the 4
## bed variants. Spiral + hugel override this via their own metadata.
extends Node3D

signal clicked(plot: Node3D)
signal hover_changed(plot: Node3D, hovered: bool)

const BED_ID: String = "fenced_plot"
const BED_LABEL: String = "Fenced Plot"
const GROWTH_MULTIPLIER: float = 1.0
const MOISTURE_DECAY_MULTIPLIER: float = 1.0
const MORALE_BONUS_PCT: float = 2.0
const FOOTPRINT_TILES: Vector2i = Vector2i(1, 1)
const MAX_WORKERS: int = 2
const LABOR_S: float = 40.0

const PlantScene = preload("res://scenes/plant.tscn")

@onready var _disc: MeshInstance3D = $Disc
@onready var _frame: Node3D = $Frame
@onready var _click_area: StaticBody3D = $ClickArea

var om_pct: float = 0.4
var moisture_pct: float = 35.0
var state: String = "bare"
var _disc_mat: StandardMaterial3D
var _frame_mats: Array[StandardMaterial3D] = []
var _mulched: bool = false


func _ready() -> void:
	_disc_mat = StandardMaterial3D.new()
	_disc_mat.albedo_color = Palette.clamp_happy(Palette.WARM_STONE.lerp(Palette.EARTH, 0.3))
	_disc.material_override = _disc_mat
	for i in range(_frame.get_child_count()):
		var child: Node = _frame.get_child(i)
		if child is MeshInstance3D:
			var mat: StandardMaterial3D = StandardMaterial3D.new()
			mat.albedo_color = Palette.clamp_happy(Palette.EARTH)
			(child as MeshInstance3D).material_override = mat
			_frame_mats.append(mat)
	add_to_group("garden_beds")
	add_to_group("fenced_plots")
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
	var mats: Array[StandardMaterial3D] = [_disc_mat]
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
		m.emission_energy_multiplier = 0.25 if on else 0.0


func _on_click(_cam: Node, _event: InputEvent, _pos: Vector3, _norm: Vector3, _shape: int) -> void:
	pass


# ---------------------------------------------------------------------
# Right-click contract
# ---------------------------------------------------------------------

func get_context_actions() -> Array:
	var out: Array = []
	if FarmTotals.get_resource(FarmTotals.PLANT_TRIM) >= 1.0 or FarmTotals.get_resource(FarmTotals.SEEDS) >= 1.0:
		out.append(Interactable.make_action(
			"plant_bush", "Plant bush", 8.0,
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
	if FarmTotals.get_resource(FarmTotals.WOOD_CHIPS) >= 2.0 and not _mulched:
		out.append(Interactable.make_action(
			"spread_wood_chip_mulch", "Spread wood chip mulch", 10.0,
			{"wood_chips": 2.0}, {},
			"", Interactable.DROP_NONE, 1
		))
	return out


func display_name() -> String:
	return BED_LABEL


func bed_metadata() -> Dictionary:
	return {
		"id": BED_ID,
		"growth_multiplier": GROWTH_MULTIPLIER,
		"moisture_decay_multiplier": MOISTURE_DECAY_MULTIPLIER,
		"morale_bonus_pct": MORALE_BONUS_PCT,
		"footprint": FOOTPRINT_TILES,
	}


func complete(action: Dictionary) -> void:
	var id: String = String(action.get("id", ""))
	match id:
		"plant_bush":
			_plant_bush()
		"water_plot":
			moisture_pct = min(100.0, moisture_pct + 20.0)
			AudioManager.play("hover-tick", -6.0)
			var water_tint: Color = Palette.SKY.lerp(Palette.MIST, 0.20)
			Juice.pop(global_position + Vector3(0, 1.6, 0), "+ WATER", water_tint)
			Juice.burst(global_position + Vector3(0, 0.3, 0), water_tint, 10)
		"spread_wood_chip_mulch":
			_mulched = true
			var chip_tint: Color = Palette.EARTH.lerp(Palette.HONEY, 0.35)
			_disc_mat.albedo_color = Palette.clamp_happy(_disc_mat.albedo_color.lerp(chip_tint, 0.5))
			AudioManager.play("biomass-chop", -10.0)
			Juice.pop(global_position + Vector3(0, 1.6, 0), "+ MULCHED", chip_tint)
			Juice.burst(global_position + Vector3(0, 0.3, 0), chip_tint, 14)


func _plant_bush() -> void:
	if state == "planted":
		return
	state = "planted"
	var plant: Node3D = PlantScene.instantiate()
	plant.setup("salmonberry")
	get_parent().add_child(plant)
	plant.global_position = global_position
	plant.stage = "seedling"
	plant.age_days = 10
	plant.ripe_amount = 0.0
	plant.ripe_count = 0
	plant.growth_stage = VisualState.STAGE_JUVENILE
	var main: Node = get_tree().current_scene
	if main != null and main.has_method("register_plant"):
		main.register_plant(plant)
	AudioManager.play("biomass-chop")
	Juice.pop(global_position + Vector3(0, 1.6, 0), "PLANTED", Palette.MEADOW)
	Juice.burst(global_position + Vector3(0, 0.6, 0), Palette.MEADOW, 12)
