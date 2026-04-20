## Fairy Permaculture — HUD controller.
##
## Displays day/season/fairy-count/food stocks/biomass/compost, the
## goals panel, and the control hint strip. Opens the compost panel
## on demand.
##
## Feedback discipline (per the locked design principle):
##  - HUD counter values scale-pop briefly when they change.
##  - Each goal that flips undone → done plays a chime, pulses the
##    goals panel, and spawns a centre-of-screen "✓ Goal complete" pop.
##  - Day transitions play a subtle wooden tick SFX.
extends CanvasLayer

const SPEED_VALUES: Array = [0, 1, 2, 4, 10]
const COLOR_DONE := Color(0.45, 0.60, 0.35)
const COLOR_PENDING := Color(0.23, 0.16, 0.08)

@onready var _day_label: Label = $TopLeft/VBox/DayLabel
@onready var _season_label: Label = $TopLeft/VBox/SeasonLabel
@onready var _fairies_label: Label = $TopRight/VBox/FairiesLabel
@onready var _food_label: Label = $TopRight/VBox/FoodLabel
@onready var _biomass_label: Label = $TopRight/VBox/BiomassLabel
@onready var _goals_panel: PanelContainer = $Goals
@onready var _goal_header: Button = $Goals/VBox/Header
@onready var _goal_list: VBoxContainer = $Goals/VBox/List
@onready var _goal_hint: Label = $Goals/VBox/Hint
var _goals_collapsed: bool = false
@onready var _speed_bar: HBoxContainer = $Bottom/SpeedBar
@onready var _compost_panel: Control = $CompostPanel
@onready var _lab_button: Button = $LabButton
@onready var _settings_button: Button = $SettingsButton
@onready var _settings_panel: Control = $SettingsPanel

var _build_pile_btn: Button
var _build_pile_cb: Callable

# Remember previous values so we can detect + animate changes.
var _prev_fairies: int = -1
var _prev_food := { "honey": -1.0, "milk": -1.0, "fruit": -1.0 }
var _prev_biomass: float = -1.0
var _prev_compost: float = -1.0
var _prev_goals_done: Array[bool] = []

# Tutorial nudge banner ("parchment" strip at top).
var _nudge_panel: PanelContainer
var _nudge_label: Label
var _nudge_close_btn: Button

# Task-queue widget (top-right, below LabButton) + typed resource bar.
var _queue_panel: PanelContainer
var _queue_list: VBoxContainer
var _queue_cancel_all: Button
var _resource_bar: HBoxContainer
var _resource_labels: Dictionary = {}  # kind → Label
# Storage-full banner (fades in/out when FarmTotals rejects a deposit).
var _storage_full_banner: Label
var _storage_full_timer: float = 0.0


func _ready() -> void:
	FarmTotals.changed.connect(refresh)
	Scheduler.day_advanced.connect(_on_day_advanced)
	Scheduler.speed_changed.connect(_on_speed_changed)
	Game.new_fairy_spawned.connect(_on_new_fairy)
	for i in range(_speed_bar.get_child_count()):
		var b: Button = _speed_bar.get_child(i)
		var v: int = SPEED_VALUES[i]
		b.pressed.connect(func(): Scheduler.set_speed(v))
		b.set_meta("speed", v)
	_compost_panel.visible = false
	if _lab_button:
		_lab_button.pressed.connect(_on_lab_pressed)
	if _settings_button and _settings_panel:
		_settings_button.pressed.connect(_on_settings_pressed)
	_build_pile_btn = Button.new()
	_build_pile_btn.text = "Build Compost Pile (5 plant trim)"
	_build_pile_btn.pressed.connect(_on_build_pile_pressed)
	$Bottom.add_child(_build_pile_btn)
	_build_nudge_banner()
	_build_queue_panel()
	_build_resource_bar()
	_build_storage_full_banner()
	if _goal_header != null:
		_goal_header.pressed.connect(_on_goals_toggle)
	Progression.tutorial_step_changed.connect(_on_tutorial_step_changed)
	TaskQueue.task_queued.connect(_on_queue_changed)
	TaskQueue.task_started.connect(_on_queue_changed)
	TaskQueue.task_picked_up.connect(_on_queue_changed)
	TaskQueue.task_completed.connect(_on_queue_changed)
	TaskQueue.task_deposited.connect(_on_queue_changed)
	TaskQueue.task_cancelled.connect(_on_queue_changed)
	FarmTotals.storage_rejected.connect(_on_storage_rejected)
	refresh()
	_refresh_nudge()
	_refresh_queue_panel()


func set_build_pile_callback(cb: Callable) -> void:
	_build_pile_cb = cb


func _on_build_pile_pressed() -> void:
	if _build_pile_cb.is_valid():
		_build_pile_cb.call()


func _process(delta: float) -> void:
	if _storage_full_timer > 0.0:
		_storage_full_timer = max(0.0, _storage_full_timer - delta)
		if _storage_full_banner != null:
			_storage_full_banner.modulate.a = clamp(_storage_full_timer / 2.0, 0.0, 1.0)
			if _storage_full_timer <= 0.0:
				_storage_full_banner.visible = false


func refresh() -> void:
	_day_label.text = "Day %d" % (Scheduler.day + 1)
	_season_label.text = "%s · Year %d" % [Scheduler.current_season().capitalize(), Scheduler.year + 1]
	_refresh_resource_bar()

	# Fairy count — scale-pop on change.
	_fairies_label.text = "🧚 %d / %d fairies" % [Game.fairy_count, Game.fairy_cap]
	if _prev_fairies >= 0 and Game.fairy_count != _prev_fairies:
		_pulse(_fairies_label, Color(0.95, 0.76, 0.31))
	_prev_fairies = Game.fairy_count

	var f: Dictionary = FarmTotals.fairy_food
	_food_label.text = "🍯 %.1f   🥛 %.1f   🍓 %.1f" % [f["honey"], f["milk"], f["fruit"]]
	for k in ["honey", "milk", "fruit"]:
		if _prev_food[k] >= 0.0 and abs(f[k] - _prev_food[k]) > 0.05:
			_pulse(_food_label, Color(0.95, 0.56, 0.46))
			break
	_prev_food["honey"] = f["honey"]
	_prev_food["milk"] = f["milk"]
	_prev_food["fruit"] = f["fruit"]

	_biomass_label.text = "biomass %.1f  |  compost %.1f" % [FarmTotals.biomass, FarmTotals.compost]
	if _prev_biomass >= 0.0 and abs(FarmTotals.biomass - _prev_biomass) > 0.01:
		_pulse(_biomass_label, Color(0.55, 0.77, 0.48))
	if _prev_compost >= 0.0 and abs(FarmTotals.compost - _prev_compost) > 0.01:
		_pulse(_biomass_label, Color(0.95, 0.76, 0.31))
	_prev_biomass = FarmTotals.biomass
	_prev_compost = FarmTotals.compost

	_refresh_goals()


## Animate a Label: pop its scale briefly and flash the color.
func _pulse(label: Label, tint: Color) -> void:
	label.pivot_offset = label.size * 0.5
	var original_mod: Color = label.modulate
	var tween: Tween = label.create_tween().set_parallel(true)
	tween.tween_property(label, "scale", Vector2(1.15, 1.15), 0.08)
	tween.chain().tween_property(label, "scale", Vector2.ONE, 0.18).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	label.modulate = Color(tint.r * 1.2, tint.g * 1.2, tint.b * 1.2, 1.0)
	var t2: Tween = label.create_tween()
	t2.tween_property(label, "modulate", original_mod, 0.6)


func _refresh_goals() -> void:
	var goals: Array = [
		{ "label": "Gather first biomass", "done": FarmTotals.biomass >= 1.0, "hint": "Right-click a pioneer plant (nettle, dandelion) and Chop-and-drop." },
		{ "label": "Feed the compost pile (3 loads)", "done": FarmTotals.pile_feeds >= 3, "hint": "Right-click the pile. Add plant trim, twigs, or dry leaves (aim 20 to 40 C:N)." },
		{ "label": "Watch the pile heat up", "done": FarmTotals.pile_hot_seen, "hint": "Needs ~1 cubic meter + balanced C:N + 50 to 65% moisture." },
		{ "label": "Scoop finished compost", "done": FarmTotals.compost_harvested > 0, "hint": "Open the pile inspector via right-click when it finishes." },
		{ "label": "Build a Storage Shed", "done": Progression.storage_built, "hint": "Right-click bare ground once compost is harvested." },
		{ "label": "Build a Sprouting Bed", "done": Progression.sprouting_built, "hint": "Right-click bare ground after Storage is built." },
	]
	# Detect goal completions that happened since last refresh.
	if _prev_goals_done.size() == goals.size():
		for i in range(goals.size()):
			if (goals[i]["done"] as bool) and not _prev_goals_done[i]:
				_on_goal_complete(goals[i]["label"])
	_prev_goals_done = []
	for g in goals:
		_prev_goals_done.append(g["done"])

	for child in _goal_list.get_children(): child.queue_free()
	var active_hint: String = "All first goals complete. The farm is yours."
	for g in goals:
		var l: Label = Label.new()
		var tick: String = "✓ " if g["done"] else "◦ "
		l.text = tick + g["label"]
		l.add_theme_color_override("font_color", COLOR_DONE if g["done"] else COLOR_PENDING)
		_goal_list.add_child(l)
		if not (g["done"] as bool) and active_hint.begins_with("All first"):
			active_hint = g["hint"]
	_goal_hint.text = active_hint


func _on_goal_complete(label: String) -> void:
	# Audio chime.
	AudioManager.play("compost-finish")
	# Centre-of-screen pop.
	var screen_centre: Vector2 = get_viewport().get_visible_rect().size * 0.5
	var pop: Label = Label.new()
	pop.text = "✓ " + label
	pop.add_theme_color_override("font_color", COLOR_DONE)
	pop.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	pop.add_theme_constant_override("outline_size", 5)
	pop.add_theme_font_size_override("font_size", 30)
	add_child(pop)
	pop.size_flags_horizontal = 0
	pop.position = screen_centre - Vector2(pop.get_theme_font("font").get_string_size(pop.text).x * 0.5, 40)
	var tw: Tween = pop.create_tween().set_parallel(true)
	tw.tween_property(pop, "position:y", pop.position.y - 80.0, 1.6).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.tween_property(pop, "modulate:a", 0.0, 1.6)
	tw.tween_property(pop, "scale", Vector2(1.25, 1.25), 0.18)
	tw.chain().tween_property(pop, "scale", Vector2.ONE, 0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.finished.connect(pop.queue_free)
	# Parchment panel pulse.
	_flash_panel(_goals_panel, Color(1.25, 1.15, 1.0, 1.0), 0.5)


func _flash_panel(panel: Control, tint: Color, dur: float) -> void:
	var original: Color = panel.modulate
	panel.modulate = tint
	var tw: Tween = panel.create_tween()
	tw.tween_property(panel, "modulate", original, dur).set_trans(Tween.TRANS_SINE)


func _on_day_advanced(_day: int, _season: String, _year: int) -> void:
	AudioManager.play("day-transition", -12.0)
	refresh()


func _on_new_fairy(_name: String) -> void:
	AudioManager.play("new-fairy")
	# Could also trigger a full-screen flash; keep this light for now.


func _on_speed_changed(speed: int) -> void:
	for i in range(_speed_bar.get_child_count()):
		var b: Button = _speed_bar.get_child(i)
		b.button_pressed = (SPEED_VALUES[i] == speed)


func open_compost_panel(pile: Pile, mesh: Node3D) -> void:
	_compost_panel.show_for(pile, mesh)


## Swap to the developer Lab scene. Main game state persists only
## implicitly via autoloads (DataStore / FarmTotals / Scheduler /
## Game) — the farm world rebuilds on return since Main._ready()
## re-spawns starter contents. Good enough for MVP.
func _on_lab_pressed() -> void:
	AudioManager.play("compost-scoop", -6.0)
	get_tree().change_scene_to_file("res://scenes/lab.tscn")


## Toggle the audio settings panel. The panel owns ESC-to-close and
## click-outside-to-close, so this button only needs to open it.
func _on_settings_pressed() -> void:
	AudioManager.play("hover-tick", -6.0)
	if _settings_panel and _settings_panel.has_method("toggle"):
		_settings_panel.toggle()


## Parchment-styled nudge banner along the bottom of the screen.
## Built programmatically so hud.tscn doesn't need hand-edits.
func _build_nudge_banner() -> void:
	_nudge_panel = PanelContainer.new()
	_nudge_panel.anchor_left = 0.5
	_nudge_panel.anchor_right = 0.5
	_nudge_panel.anchor_top = 1.0
	_nudge_panel.anchor_bottom = 1.0
	_nudge_panel.offset_left = -280.0
	_nudge_panel.offset_right = 280.0
	_nudge_panel.offset_top = -120.0
	_nudge_panel.offset_bottom = -60.0
	_nudge_panel.grow_horizontal = 2
	_nudge_panel.grow_vertical = 0
	_nudge_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	var style: StyleBoxFlat = StyleBoxFlat.new()
	style.bg_color = Color(0.97, 0.92, 0.82, 0.95)
	style.border_color = Color(0.79, 0.72, 0.54)
	style.border_width_left = 2
	style.border_width_top = 2
	style.border_width_right = 2
	style.border_width_bottom = 2
	style.corner_radius_top_left = 6
	style.corner_radius_top_right = 6
	style.corner_radius_bottom_left = 6
	style.corner_radius_bottom_right = 6
	style.content_margin_left = 14.0
	style.content_margin_top = 10.0
	style.content_margin_right = 14.0
	style.content_margin_bottom = 10.0
	_nudge_panel.add_theme_stylebox_override("panel", style)
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	_nudge_panel.add_child(row)
	_nudge_label = Label.new()
	_nudge_label.text = ""
	_nudge_label.add_theme_color_override("font_color", Color(0.36, 0.27, 0.16))
	_nudge_label.add_theme_font_size_override("font_size", 14)
	_nudge_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_nudge_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(_nudge_label)
	_nudge_close_btn = Button.new()
	_nudge_close_btn.text = "x"
	_nudge_close_btn.custom_minimum_size = Vector2(24, 24)
	_nudge_close_btn.pressed.connect(_on_nudge_dismissed)
	row.add_child(_nudge_close_btn)
	add_child(_nudge_panel)
	_nudge_panel.visible = false


func _on_nudge_dismissed() -> void:
	Progression.dismiss_current_nudge()
	_refresh_nudge()


func _on_tutorial_step_changed(_step: int) -> void:
	_refresh_nudge()


func _refresh_nudge() -> void:
	if _nudge_panel == null:
		return
	var text: String = Progression.current_nudge()
	if text == "":
		_nudge_panel.visible = false
		return
	_nudge_label.text = text
	_nudge_panel.visible = true


# =====================================================================
# Task queue widget + typed resource bar
# =====================================================================

const _QUEUE_ROW_LIMIT: int = 5

# Inventory grouping — taxonomy refactor. Each group renders a small
# header (tinted per category) followed by its item rows. Order within
# a group is stable + readable, not alphabetical, so the panel reads
# like a field-book sheet.
const _GROUP_GREENS: String  = "GREENS"
const _GROUP_BROWNS: String  = "BROWNS"
const _GROUP_OTHER: String   = "OTHER"
const _INVENTORY_GROUPS: Array = [
	{ "name": _GROUP_GREENS, "kinds": ["plant_trim", "fruit_scraps", "fruit", "wild_berries"] },
	{ "name": _GROUP_BROWNS, "kinds": ["wood_chips", "twigs", "wood", "dry_leaves", "wild_mushrooms"] },
	{ "name": _GROUP_OTHER,  "kinds": ["stone", "seeds", "compost", "water", "imo"] },
]

# Flat order used by the legacy resource-bar refresh path (no grouping).
# Kept in sync with _INVENTORY_GROUPS by construction.
const _RESOURCE_ORDER: Array[String] = [
	"plant_trim", "fruit_scraps", "fruit", "wild_berries",
	"wood_chips", "twigs", "wood", "dry_leaves", "wild_mushrooms",
	"stone", "seeds", "compost", "water", "imo",
]

const _RESOURCE_NAMES: Dictionary = {
	"plant_trim":     "Plant Trim",
	"fruit_scraps":   "Fruit Scraps",
	"fruit":          "Fruit",
	"wood_chips":     "Wood Chips",
	"twigs":          "Twigs",
	"wood":           "Wood",
	"dry_leaves":     "Dry Leaves",
	"stone":          "Stone",
	"seeds":          "Seeds",
	"compost":        "Compost",
	"water":          "Water",
	"wild_berries":   "Wild Berries",
	"wild_mushrooms": "Wild Mushrooms",
	"imo":            "Forest Duff (IMO)",
}

# Per-item swatch tints. Hardcoded hex here so the StyleBox constants
# compile at parse time; `_build_resource_bar()` patches the palette-
# derived entries (wood_chips, water, dry_leaves) through the live
# Palette autoload so every shipped color traces back to Palette.*.
const _RESOURCE_TINTS: Dictionary = {
	"plant_trim":   Color(0.55, 0.77, 0.48),   # MEADOW
	"fruit_scraps": Color(0.95, 0.56, 0.46),   # CORAL (coral reads as "scrap fruit")
	"fruit":        Color(0.95, 0.56, 0.46),   # CORAL
	"wood":         Color(0.48, 0.36, 0.28),   # EARTH
	"twigs":        Color(0.58, 0.48, 0.32),
	"wood_chips":   Color(0.72, 0.55, 0.34),   # patched to Palette.EARTH.lerp(HONEY, 0.30)
	"dry_leaves":   Color(0.78, 0.58, 0.32),   # patched to Palette.EARTH.lerp(HONEY, 0.22)
	"stone":        Color(0.71, 0.60, 0.46),   # WARM_STONE
	"seeds":        Color(0.90, 0.82, 0.52),
	"compost":      Color(0.42, 0.30, 0.22),   # COMPOST
	"water":        Color(0.72, 0.85, 0.91),   # patched to Palette.SKY
	# Forage finds — patched at runtime against Palette in _build_resource_bar.
	"wild_berries":   Color(0.74, 0.38, 0.54),  # BERRY-ish
	"wild_mushrooms": Color(0.76, 0.66, 0.48),  # PARCHMENT.lerp(WARM_STONE)
	"imo":            Color(0.50, 0.45, 0.32),  # COMPOST.lerp(MEADOW)
}

# Category header tints. Greens → MEADOW, Browns → EARTH, Other →
# WARM_STONE. Kept light (alpha-scaled) at render time so the header
# reads as a subtle band, not a hard stripe.
const _GROUP_HEADER_TINTS: Dictionary = {
	_GROUP_GREENS: Color(0.55, 0.77, 0.48),
	_GROUP_BROWNS: Color(0.48, 0.36, 0.28),
	_GROUP_OTHER:  Color(0.71, 0.60, 0.46),
}


func _build_queue_panel() -> void:
	_queue_panel = PanelContainer.new()
	_queue_panel.name = "QueuePanel"
	_queue_panel.anchor_left = 1.0
	_queue_panel.anchor_right = 1.0
	_queue_panel.anchor_top = 0.0
	_queue_panel.anchor_bottom = 0.0
	_queue_panel.offset_left = -260.0
	_queue_panel.offset_right = -14.0
	# Right column stack: LabButton (110-142), SettingsButton (150-182),
	# TechTree (190-222), Saves (230-262), Legacy (270-302). QueuePanel
	# sits below the button cluster.
	_queue_panel.offset_top = 314.0
	_queue_panel.offset_bottom = 514.0
	_queue_panel.grow_horizontal = 0
	var style: StyleBoxFlat = StyleBoxFlat.new()
	style.bg_color = Color(0.95, 0.90, 0.79, 0.95)
	style.border_color = Color(0.79, 0.72, 0.54)
	style.border_width_left = 2
	style.border_width_top = 2
	style.border_width_right = 2
	style.border_width_bottom = 2
	style.corner_radius_top_left = 4
	style.corner_radius_top_right = 4
	style.corner_radius_bottom_left = 4
	style.corner_radius_bottom_right = 4
	style.content_margin_left = 10.0
	style.content_margin_top = 8.0
	style.content_margin_right = 10.0
	style.content_margin_bottom = 8.0
	_queue_panel.add_theme_stylebox_override("panel", style)
	var vb: VBoxContainer = VBoxContainer.new()
	vb.add_theme_constant_override("separation", 4)
	_queue_panel.add_child(vb)
	var header: Label = Label.new()
	header.text = "TASK QUEUE"
	header.add_theme_color_override("font_color", Color(0.55, 0.41, 0.27))
	header.add_theme_font_size_override("font_size", 12)
	vb.add_child(header)
	_queue_list = VBoxContainer.new()
	_queue_list.add_theme_constant_override("separation", 2)
	vb.add_child(_queue_list)
	_queue_cancel_all = Button.new()
	_queue_cancel_all.text = "Cancel all"
	_queue_cancel_all.pressed.connect(_on_cancel_all)
	vb.add_child(_queue_cancel_all)
	add_child(_queue_panel)


func _on_queue_changed(_task: Dictionary) -> void:
	_refresh_queue_panel()


func _on_cancel_all() -> void:
	TaskQueue.cancel_all()
	AudioManager.play("hover-tick", -4.0)


func _refresh_queue_panel() -> void:
	if _queue_list == null:
		return
	for c in _queue_list.get_children():
		c.queue_free()
	var tasks: Array = TaskQueue.active_tasks()
	if tasks.is_empty():
		var idle: Label = Label.new()
		idle.text = "  idle — no tasks queued"
		idle.add_theme_color_override("font_color", Color(0.55, 0.41, 0.27))
		idle.add_theme_font_size_override("font_size", 11)
		_queue_list.add_child(idle)
		_queue_cancel_all.visible = false
		return
	_queue_cancel_all.visible = true
	var shown: int = 0
	for t in tasks:
		if shown >= _QUEUE_ROW_LIMIT:
			break
		var row: HBoxContainer = HBoxContainer.new()
		row.add_theme_constant_override("separation", 6)
		var label: String = _queue_row_label_for(t)
		var l: Label = Label.new()
		l.text = label
		l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		l.add_theme_color_override("font_color", Color(0.23, 0.16, 0.08))
		l.add_theme_font_size_override("font_size", 11)
		row.add_child(l)
		var x: Button = Button.new()
		x.text = "x"
		x.custom_minimum_size = Vector2(20, 20)
		var tid: int = int(t["id"])
		x.pressed.connect(func(): TaskQueue.cancel_task(tid))
		row.add_child(x)
		_queue_list.add_child(row)
		shown += 1
	if tasks.size() > _QUEUE_ROW_LIMIT:
		var more: Label = Label.new()
		more.text = "  + %d more…" % (tasks.size() - _QUEUE_ROW_LIMIT)
		more.add_theme_color_override("font_color", Color(0.55, 0.41, 0.27))
		more.add_theme_font_size_override("font_size", 11)
		_queue_list.add_child(more)


func _on_goals_toggle() -> void:
	_goals_collapsed = not _goals_collapsed
	if _goal_list != null:
		_goal_list.visible = not _goals_collapsed
	if _goal_hint != null:
		_goal_hint.visible = not _goals_collapsed
	if _goal_header != null:
		var tag: String = "▸" if _goals_collapsed else "▾"
		_goal_header.text = "%s FIRST GOALS" % tag
	# Goals panel has a fixed offset_bottom in the .tscn (180), so hiding
	# children alone leaves a giant empty parchment box. Shrink the panel
	# itself when collapsed so only the header strip shows.
	if _goals_panel != null:
		_goals_panel.offset_bottom = 50.0 if _goals_collapsed else 180.0
	AudioManager.play("hover-tick", -8.0)


## Task-queue row label. Surfaces the PICKUP stage with human-readable
## text so the player sees "Picking up greens… → Compost Pile" instead
## of "Add greens · traveling_to_source".
func _queue_row_label_for(t: Dictionary) -> String:
	var action: Dictionary = t.get("action", {})
	var act_label: String = String(action.get("label", "?"))
	var stage: String = String(t.get("stage", ""))
	var target_name: String = ""
	var target: Variant = t.get("target")
	if target != null and target is Node and is_instance_valid(target):
		var nd: Node = target
		if nd.has_method("display_name"):
			target_name = String(nd.call("display_name"))
		else:
			target_name = String(nd.name)
	var cost: Dictionary = action.get("cost", {})
	var pickup_kind: String = ""
	if action.has("pickup_from") and String(action["pickup_from"]) != "":
		pickup_kind = Interactable.pickup_kind_for_cost(cost)
	match stage:
		TaskQueue.STAGE_TO_SOURCE:
			var k: String = pickup_kind if pickup_kind != "" else "materials"
			if target_name != "":
				return "Picking up %s… → %s" % [k, target_name]
			return "Picking up %s…" % k
		TaskQueue.STAGE_PICKING_UP:
			if target_name != "":
				return "Loading basket… → %s" % target_name
			return "Loading basket…"
		TaskQueue.STAGE_WORKING:
			# "Adding greens…" / "Feeding…" — use the action verb label.
			return "%s…" % act_label
		TaskQueue.STAGE_TO_TARGET:
			if target_name != "":
				return "%s → %s" % [act_label, target_name]
			return "%s · %s" % [act_label, stage]
		_:
			return "%s · %s" % [act_label, stage]


## Group-total Label handles per category — patched every refresh so
## the header reads "GREENS · 8 total" etc. (the key strategic readout
## from the taxonomy refactor).
var _group_total_labels: Dictionary = {}


func _build_resource_bar() -> void:
	# Parchment "Inventory" panel on the left edge, below the Day badge.
	# Resources are grouped under GREENS / BROWNS / OTHER headers so the
	# player reads C:N balance at a glance without opening the pile.
	# Each row: colored swatch · name · current/cap.
	var panel: PanelContainer = PanelContainer.new()
	panel.name = "InventoryPanel"
	panel.anchor_left = 0.0
	panel.anchor_right = 0.0
	panel.anchor_top = 0.0
	panel.anchor_bottom = 0.0
	panel.offset_left = 14.0
	panel.offset_right = 220.0
	panel.offset_top = 90.0
	# Eleven item rows + three group headers — give plenty of vertical
	# room so the panel doesn't crop the bottom category.
	panel.offset_bottom = 470.0
	var style: StyleBoxFlat = StyleBoxFlat.new()
	style.bg_color = Color(0.95, 0.90, 0.79, 0.95)
	style.border_color = Color(0.79, 0.72, 0.54)
	style.border_width_left = 2
	style.border_width_top = 2
	style.border_width_right = 2
	style.border_width_bottom = 2
	style.corner_radius_top_left = 4
	style.corner_radius_top_right = 4
	style.corner_radius_bottom_left = 4
	style.corner_radius_bottom_right = 4
	style.content_margin_left = 10.0
	style.content_margin_top = 8.0
	style.content_margin_right = 10.0
	style.content_margin_bottom = 8.0
	panel.add_theme_stylebox_override("panel", style)

	var vb: VBoxContainer = VBoxContainer.new()
	vb.add_theme_constant_override("separation", 3)
	panel.add_child(vb)

	var header: Label = Label.new()
	header.text = "INVENTORY"
	header.add_theme_color_override("font_color", Color(0.55, 0.41, 0.27))
	header.add_theme_font_size_override("font_size", 12)
	vb.add_child(header)

	_resource_bar = HBoxContainer.new()  # retained for legacy refs — unused now
	_resource_bar.name = "ResourceBar_Legacy"
	_resource_bar.visible = false
	add_child(_resource_bar)

	# Palette-patched swatch tints — every Ghibli-lite color traces back
	# to the Palette autoload. DESIGN-CHECK: no raw Color() shipped.
	var tints: Dictionary = _RESOURCE_TINTS.duplicate()
	tints["plant_trim"]   = Palette.MEADOW
	tints["fruit_scraps"] = Palette.CORAL
	tints["fruit"]        = Palette.CORAL
	tints["wood"]         = Palette.EARTH
	tints["twigs"]        = Palette.EARTH.lerp(Palette.WARM_STONE, 0.25)
	tints["wood_chips"]   = Palette.EARTH.lerp(Palette.HONEY, 0.30)
	tints["dry_leaves"]   = Palette.EARTH.lerp(Palette.HONEY, 0.22)
	tints["stone"]        = Palette.WARM_STONE
	tints["seeds"]        = Palette.HONEY.lerp(Palette.PARCHMENT, 0.25)
	tints["compost"]      = Palette.COMPOST
	tints["water"]        = Palette.SKY
	tints["wild_berries"]   = Palette.BERRY.lerp(Palette.CORAL, 0.35)
	tints["wild_mushrooms"] = Palette.PARCHMENT.lerp(Palette.WARM_STONE, 0.45)
	tints["imo"]            = Palette.COMPOST.lerp(Palette.MEADOW, 0.30)

	# Render each category: tinted header row + its item rows.
	for group in _INVENTORY_GROUPS:
		_build_group_header(vb, group["name"])
		for k in (group["kinds"] as Array):
			_build_resource_row(vb, k, tints)
	add_child(panel)


## Build one category header row: "GREENS · 0 total" with a palette-
## tinted swatch so the category reads at a glance. The running total
## Label is stashed in `_group_total_labels` keyed by group name.
func _build_group_header(parent: VBoxContainer, group_name: String) -> void:
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	var tint: Color = _GROUP_HEADER_TINTS.get(group_name, Palette.WARM_STONE)
	var stripe: ColorRect = ColorRect.new()
	stripe.color = Color(tint.r, tint.g, tint.b, 0.85)
	stripe.custom_minimum_size = Vector2(8, 12)
	stripe.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(stripe)
	var label: Label = Label.new()
	label.text = "%s · 0 total" % group_name
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.add_theme_color_override("font_color", tint.darkened(0.35))
	label.add_theme_font_size_override("font_size", 11)
	row.add_child(label)
	parent.add_child(row)
	_group_total_labels[group_name] = label


func _build_resource_row(parent: VBoxContainer, kind: String, tints: Dictionary) -> void:
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	# Indent the rows under their header so the grouping reads visually.
	var indent: Control = Control.new()
	indent.custom_minimum_size = Vector2(10, 1)
	row.add_child(indent)
	# Colored swatch — small 12×12 square tinted per resource.
	var swatch: ColorRect = ColorRect.new()
	swatch.color = Color(tints.get(kind, Palette.WARM_STONE))
	swatch.custom_minimum_size = Vector2(12, 12)
	swatch.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(swatch)
	# Name — left-aligned, fills horizontal.
	var name_lbl: Label = Label.new()
	name_lbl.text = String(_RESOURCE_NAMES.get(kind, kind))
	name_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_lbl.add_theme_color_override("font_color", Color(0.23, 0.16, 0.08))
	name_lbl.add_theme_font_size_override("font_size", 12)
	row.add_child(name_lbl)
	# Count / capacity — right-aligned.
	var count_lbl: Label = Label.new()
	count_lbl.text = "0/5"
	count_lbl.add_theme_color_override("font_color", Color(0.55, 0.41, 0.27))
	count_lbl.add_theme_font_size_override("font_size", 12)
	count_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	row.add_child(count_lbl)
	parent.add_child(row)
	_resource_labels[kind] = count_lbl


func _refresh_resource_bar() -> void:
	# Per-group totals — surfaces the strategic "how much green vs brown
	# do I have?" readout without needing the compost panel open.
	var totals: Dictionary = { _GROUP_GREENS: 0.0, _GROUP_BROWNS: 0.0, _GROUP_OTHER: 0.0 }
	for k in _RESOURCE_ORDER:
		var amt: float = FarmTotals.get_resource(k)
		var cap: float = FarmTotals.capacity_for(k)
		var label: Label = _resource_labels.get(k) as Label
		if label != null:
			label.text = "%.0f/%.0f" % [amt, cap]
	for group in _INVENTORY_GROUPS:
		var group_name: String = group["name"]
		var sum_amt: float = 0.0
		for k in (group["kinds"] as Array):
			sum_amt += FarmTotals.get_resource(k)
		totals[group_name] = sum_amt
		var hdr: Label = _group_total_labels.get(group_name) as Label
		if hdr != null:
			hdr.text = "%s · %.0f total" % [group_name, sum_amt]


func _build_storage_full_banner() -> void:
	_storage_full_banner = Label.new()
	_storage_full_banner.add_theme_color_override("font_color", Color(0.75, 0.45, 0.25))
	_storage_full_banner.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	_storage_full_banner.add_theme_constant_override("outline_size", 5)
	_storage_full_banner.add_theme_font_size_override("font_size", 26)
	_storage_full_banner.anchor_left = 0.5
	_storage_full_banner.anchor_right = 0.5
	_storage_full_banner.anchor_top = 0.5
	_storage_full_banner.anchor_bottom = 0.5
	_storage_full_banner.offset_left = -220.0
	_storage_full_banner.offset_right = 220.0
	_storage_full_banner.offset_top = -16.0
	_storage_full_banner.offset_bottom = 16.0
	_storage_full_banner.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_storage_full_banner.visible = false
	_storage_full_banner.text = ""
	add_child(_storage_full_banner)


func _on_storage_rejected(resource_type: String, amount: float) -> void:
	if _storage_full_banner == null:
		return
	_storage_full_banner.text = "STORAGE FULL — dropped %.0f %s" % [amount, resource_type]
	_storage_full_banner.visible = true
	_storage_full_banner.modulate.a = 1.0
	_storage_full_timer = 2.0
	AudioManager.play("hover-tick", -2.0)


# =====================================================================
# UI-polish batch (appended 2026-04 — intro/tech-tree/toast sweep)
#
# Adds three new HUD elements without editing any existing code:
#   1. Parchment toast listener for WeatherSystem.warning_fired
#   2. Parchment toast listener for CompostPile.turn_window_entered
#   3. Small "Tech Tree" button mounted next to Lab/Settings
#
# Setup runs via `@onready` — the bottom-of-file var initializer fires
# before _ready() completes, so every wiring lands in a single engine
# tick alongside the original HUD init.
# =====================================================================

const _POLISH_TOAST_LIFETIME_S: float = 4.2
const _POLISH_TECH_TREE_SCENE: String = "res://scenes/tech_tree_panel.tscn"

var _polish_toast_stack: VBoxContainer
var _polish_tech_tree_btn: Button
var _polish_tech_tree_panel: Control
var _polish_connected_piles: Array = []


@onready var _polish_init_ok: bool = _polish_setup()


func _polish_setup() -> bool:
	# Called as an @onready initializer. Safe to call even if _ready()
	# hasn't fired yet — we defer the heavier wiring to the next frame
	# so $Hud's scene tree is fully settled.
	call_deferred("_polish_wire_deferred")
	return true


func _polish_wire_deferred() -> void:
	_polish_build_toast_stack()
	_polish_build_tech_tree_button()
	_polish_mount_tech_tree_panel()
	_polish_connect_weather()
	_polish_connect_piles()
	_polish_connect_content_bundle()
	# Overnight batch (2026-04-20) — Saves + Farm Legacy HUD buttons.
	_overnight_build_saves_cluster()
	# Watch for piles that spawn after the HUD (player-built compost piles).
	get_tree().node_added.connect(_polish_on_node_added)
	# Keyboard shortcut for the tech tree panel.
	set_process_input(true)


## Content-bundle signal wiring — Achievements + RandomEvents.
## Both are optional autoloads; we null-check and no-op if absent so the
## HUD still boots in scenes that don't register them.
func _polish_connect_content_bundle() -> void:
	var ach: Node = get_node_or_null("/root/Achievements")
	if ach != null and ach.has_signal("achievement_unlocked") \
			and not ach.is_connected("achievement_unlocked", _polish_on_achievement):
		ach.connect("achievement_unlocked", _polish_on_achievement)
	var events: Node = get_node_or_null("/root/RandomEvents")
	if events != null and events.has_signal("event_triggered") \
			and not events.is_connected("event_triggered", _polish_on_random_event):
		events.connect("event_triggered", _polish_on_random_event)


func _polish_on_achievement(id: String) -> void:
	var label: String = "ACHIEVEMENT · " + id.replace("-", " ").replace("_", " ").to_upper()
	_polish_push_toast(label, Palette.HONEY)
	if AudioManager != null:
		AudioManager.play("compost-finish", -4.0)


func _polish_on_random_event(id: String, payload: Dictionary) -> void:
	var name: String = String(payload.get("_event_name", id)) if payload else id
	var desc: String = String(payload.get("_event_description", "")) if payload else ""
	var text: String = name if desc == "" else name + " — " + desc
	_polish_push_toast(text, Palette.CORAL)
	if AudioManager != null:
		AudioManager.play("hover-tick", -4.0)


## Parchment toast stack — stacks at top-center below the day label.
## Messages auto-expire after `_POLISH_TOAST_LIFETIME_S`.
func _polish_build_toast_stack() -> void:
	_polish_toast_stack = VBoxContainer.new()
	_polish_toast_stack.name = "PolishToastStack"
	_polish_toast_stack.anchor_left = 0.5
	_polish_toast_stack.anchor_right = 0.5
	_polish_toast_stack.anchor_top = 0.0
	_polish_toast_stack.anchor_bottom = 0.0
	_polish_toast_stack.offset_left = -280.0
	_polish_toast_stack.offset_right = 280.0
	_polish_toast_stack.offset_top = 200.0
	_polish_toast_stack.offset_bottom = 380.0
	_polish_toast_stack.add_theme_constant_override("separation", 6)
	_polish_toast_stack.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_polish_toast_stack)


## Push a parchment toast message. `tint` color traces to Palette.*.
func _polish_push_toast(text: String, tint: Color) -> void:
	if _polish_toast_stack == null:
		return
	var panel: PanelContainer = PanelContainer.new()
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var style: StyleBoxFlat = StyleBoxFlat.new()
	style.bg_color = Palette.PARCHMENT
	style.border_color = Palette.clamp_happy(tint)
	style.border_width_left = 3
	style.border_width_top = 2
	style.border_width_right = 2
	style.border_width_bottom = 2
	style.corner_radius_top_left = 6
	style.corner_radius_top_right = 6
	style.corner_radius_bottom_left = 6
	style.corner_radius_bottom_right = 6
	style.content_margin_left = 14.0
	style.content_margin_right = 14.0
	style.content_margin_top = 8.0
	style.content_margin_bottom = 8.0
	panel.add_theme_stylebox_override("panel", style)
	var label: Label = Label.new()
	label.text = text
	label.add_theme_color_override("font_color", Palette.INK)
	label.add_theme_font_size_override("font_size", 13)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	panel.add_child(label)
	_polish_toast_stack.add_child(panel)
	# Auto-fade + free. At higher game-speeds the world is moving fast,
	# so we extend the toast lifetime proportionally — otherwise a key
	# event banner is gone before the player can read it. Cap at 3× so
	# pause / 1× / 2× stay at the base lifetime and 10× tops out.
	var sched_speed: int = max(1, Scheduler.speed)
	var speed_mul: float = clamp(float(sched_speed) / 2.0, 1.0, 3.0)
	var lifetime: float = _POLISH_TOAST_LIFETIME_S * speed_mul
	var tw: Tween = panel.create_tween().set_parallel(true)
	tw.tween_property(panel, "modulate:a", 1.0, 0.0)
	tw.chain().tween_interval(lifetime - 0.8)
	tw.tween_property(panel, "modulate:a", 0.0, 0.8)
	tw.chain().tween_callback(panel.queue_free)
	AudioManager.play("hover-tick", -10.0)


## Small "Tech Tree" button — mounted in the top-right column below the
## existing Settings button so it shares the Lab / Settings cluster.
func _polish_build_tech_tree_button() -> void:
	_polish_tech_tree_btn = Button.new()
	_polish_tech_tree_btn.name = "TechTreeButton"
	_polish_tech_tree_btn.text = "Tech Tree"
	_polish_tech_tree_btn.anchor_left = 1.0
	_polish_tech_tree_btn.anchor_right = 1.0
	_polish_tech_tree_btn.anchor_top = 0.0
	_polish_tech_tree_btn.anchor_bottom = 0.0
	_polish_tech_tree_btn.offset_left = -110.0
	_polish_tech_tree_btn.offset_right = -14.0
	_polish_tech_tree_btn.offset_top = 190.0
	_polish_tech_tree_btn.offset_bottom = 222.0
	_polish_tech_tree_btn.grow_horizontal = 0
	var style: StyleBoxFlat = StyleBoxFlat.new()
	style.bg_color = Palette.PARCHMENT
	style.border_color = Palette.EARTH
	style.border_width_left = 2
	style.border_width_top = 2
	style.border_width_right = 2
	style.border_width_bottom = 2
	style.corner_radius_top_left = 4
	style.corner_radius_top_right = 4
	style.corner_radius_bottom_left = 4
	style.corner_radius_bottom_right = 4
	style.content_margin_left = 10.0
	style.content_margin_right = 10.0
	style.content_margin_top = 6.0
	style.content_margin_bottom = 6.0
	_polish_tech_tree_btn.add_theme_stylebox_override("normal", style)
	_polish_tech_tree_btn.add_theme_stylebox_override("hover", style)
	_polish_tech_tree_btn.add_theme_stylebox_override("pressed", style)
	_polish_tech_tree_btn.add_theme_color_override("font_color", Palette.INK)
	_polish_tech_tree_btn.add_theme_font_size_override("font_size", 14)
	_polish_tech_tree_btn.pressed.connect(_polish_on_tech_tree_pressed)
	add_child(_polish_tech_tree_btn)


func _polish_mount_tech_tree_panel() -> void:
	if not ResourceLoader.exists(_POLISH_TECH_TREE_SCENE):
		return
	var scene: PackedScene = load(_POLISH_TECH_TREE_SCENE)
	if scene == null:
		return
	_polish_tech_tree_panel = scene.instantiate() as Control
	if _polish_tech_tree_panel == null:
		return
	add_child(_polish_tech_tree_panel)


func _polish_on_tech_tree_pressed() -> void:
	AudioManager.play("hover-tick", -6.0)
	if _polish_tech_tree_panel != null and _polish_tech_tree_panel.has_method("toggle"):
		_polish_tech_tree_panel.call("toggle")


func _polish_connect_weather() -> void:
	if has_node("/root/WeatherSystem"):
		var ws: Node = get_node("/root/WeatherSystem")
		if ws.has_signal("warning_fired") and not ws.is_connected("warning_fired", _polish_on_weather_warning):
			ws.connect("warning_fired", _polish_on_weather_warning)


func _polish_on_weather_warning(event_id: String, eta_days: int) -> void:
	var text: String = _polish_weather_text(event_id, eta_days)
	var tint: Color = Palette.HONEY
	match event_id:
		"drought": tint = Palette.CORAL
		"storm": tint = Palette.SKY
		"early_frost": tint = Palette.MIST
		"heat_spike": tint = Palette.HONEY
		"wet_week": tint = Palette.SKY
	_polish_push_toast(text, tint)


func _polish_weather_text(event_id: String, eta_days: int) -> String:
	var eta: String = "today" if eta_days <= 0 else "in %d day%s" % [eta_days, "" if eta_days == 1 else "s"]
	match event_id:
		"drought":
			return "Drought approaches %s — irrigate!" % eta
		"storm":
			return "Storm approaches %s — cover piles!" % eta
		"early_frost":
			return "Early frost %s — mulch tender plants!" % eta
		"heat_spike":
			return "Heat spike %s — water thirsty beds!" % eta
		"wet_week":
			return "Wet week approaches %s — cover piles!" % eta
	return "Weather warning: %s %s" % [event_id, eta]


func _polish_connect_piles() -> void:
	# Existing piles in-scene.
	for p in get_tree().get_nodes_in_group("compost_piles"):
		_polish_hook_pile(p as Node)
	# Fallback — the legacy compost_pile.gd doesn't `add_to_group`. Walk
	# the current scene once, in case the piles are parented loose.
	var main: Node = get_tree().current_scene
	if main != null:
		_polish_walk_for_piles(main)


func _polish_on_node_added(n: Node) -> void:
	# Piles spawned mid-run (player built a new one) — hook them up.
	if n == null:
		return
	if n is Node3D and n.has_signal("turn_window_entered"):
		_polish_hook_pile(n)


func _polish_hook_pile(n: Node) -> void:
	if n == null or not is_instance_valid(n):
		return
	if not n.has_signal("turn_window_entered"):
		return
	if _polish_connected_piles.has(n):
		return
	n.connect("turn_window_entered", _polish_on_pile_turn_window)
	_polish_connected_piles.append(n)


func _polish_walk_for_piles(root: Node) -> void:
	var stack: Array = [root]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		for c in n.get_children():
			if c.has_signal("turn_window_entered"):
				_polish_hook_pile(c)
			if c.get_child_count() > 0:
				stack.append(c)


func _polish_on_pile_turn_window(_pile_mesh: Node3D) -> void:
	_polish_push_toast("Pile wants turning", Palette.HONEY)


func _input(event: InputEvent) -> void:
	# Guarded so the keyboard shortcut doesn't eat input when the panel
	# isn't mounted yet (e.g. headless-boot parse).
	if _polish_tech_tree_panel == null:
		return
	if event.is_action_pressed("tech_tree"):
		_polish_on_tech_tree_pressed()
		get_viewport().set_input_as_handled()


# =====================================================================
# Overnight batch (2026-04-20) — named save-slot + Farm Legacy panels.
#
# Mounts two new HUD buttons ("Saves", "Legacy") under the existing Lab/
# Settings/Tech-Tree cluster and instantiates the paired panels as
# children of the HUD canvas layer. Everything here is additive — the
# original HUD layout is untouched. DESIGN-CHECK: all fills, borders,
# and font colors trace to Palette.* constants through the parchment
# stylebox on the scenes.
# =====================================================================

const _OVERNIGHT_SAVES_SCENE: String = "res://scenes/save_slots_panel.tscn"
const _OVERNIGHT_LEGACY_SCENE: String = "res://scenes/farm_legacy_panel.tscn"

var _overnight_saves_btn: Button
var _overnight_legacy_btn: Button
var _overnight_saves_panel: Control
var _overnight_legacy_panel: Control


func _overnight_build_saves_cluster() -> void:
	_overnight_saves_btn = _overnight_make_button("Saves", 230.0, 262.0)
	_overnight_saves_btn.pressed.connect(_overnight_on_saves_pressed)
	add_child(_overnight_saves_btn)

	_overnight_legacy_btn = _overnight_make_button("Legacy", 270.0, 302.0)
	_overnight_legacy_btn.pressed.connect(_overnight_on_legacy_pressed)
	add_child(_overnight_legacy_btn)

	_overnight_saves_panel = _overnight_mount_panel(_OVERNIGHT_SAVES_SCENE)
	_overnight_legacy_panel = _overnight_mount_panel(_OVERNIGHT_LEGACY_SCENE)


func _overnight_make_button(label: String, y_top: float, y_bot: float) -> Button:
	var btn: Button = Button.new()
	btn.text = label
	btn.anchor_left = 1.0
	btn.anchor_right = 1.0
	btn.anchor_top = 0.0
	btn.anchor_bottom = 0.0
	btn.offset_left = -110.0
	btn.offset_right = -14.0
	btn.offset_top = y_top
	btn.offset_bottom = y_bot
	btn.grow_horizontal = 0
	var style: StyleBoxFlat = StyleBoxFlat.new()
	style.bg_color = Palette.PARCHMENT
	style.border_color = Palette.EARTH
	style.border_width_left = 2
	style.border_width_top = 2
	style.border_width_right = 2
	style.border_width_bottom = 2
	style.corner_radius_top_left = 4
	style.corner_radius_top_right = 4
	style.corner_radius_bottom_left = 4
	style.corner_radius_bottom_right = 4
	style.content_margin_left = 10.0
	style.content_margin_right = 10.0
	style.content_margin_top = 6.0
	style.content_margin_bottom = 6.0
	btn.add_theme_stylebox_override("normal", style)
	btn.add_theme_stylebox_override("hover", style)
	btn.add_theme_stylebox_override("pressed", style)
	btn.add_theme_color_override("font_color", Palette.INK)
	btn.add_theme_font_size_override("font_size", 14)
	return btn


func _overnight_mount_panel(scene_path: String) -> Control:
	if not ResourceLoader.exists(scene_path):
		return null
	var scene: PackedScene = load(scene_path)
	if scene == null:
		return null
	var inst: Control = scene.instantiate() as Control
	if inst == null:
		return null
	add_child(inst)
	return inst


func _overnight_on_saves_pressed() -> void:
	if AudioManager != null:
		AudioManager.play("hover-tick", -6.0)
	if _overnight_saves_panel != null and _overnight_saves_panel.has_method("toggle"):
		_overnight_saves_panel.call("toggle")


func _overnight_on_legacy_pressed() -> void:
	if AudioManager != null:
		AudioManager.play("hover-tick", -6.0)
	if _overnight_legacy_panel != null and _overnight_legacy_panel.has_method("toggle"):
		_overnight_legacy_panel.call("toggle")
