## Fairy Permaculture — Dev Lab scene controller.
##
## A developer-mode scene for browsing the entire ecosystem library:
## Biomes · Plants · Animals · Fungi · Insects · Soil · Shaders · Weather.
##
## Layout:
##  - Top-left: back-to-game button (parchment)
##  - Left sidebar: VBox of category tabs + entity list per tab
##  - Right pane: 3D preview viewport + state/animation scrubbers +
##    inspector panel showing the raw JSON for the selected entity
##
## The lab is entirely its own scene (`scenes/lab.tscn`); the main game
## scene is unaffected. The "Lab" HUD button in `hud.gd` swaps the
## current scene to this one.
extends Node3D

# Preload the factory to ensure its `class_name` registers before we call it.
const _LAB_FACTORY := preload("res://scripts/lab_preview_factory.gd")

const TAB_BIOMES := "Biomes"
const TAB_PLANTS := "Plants"
const TAB_ANIMALS := "Animals"
const TAB_FUNGI := "Fungi"
const TAB_INSECTS := "Insects"
const TAB_SOIL := "Soil"
const TAB_SHADERS := "Shaders"
const TAB_WEATHER := "Weather"
const TAB_WATER := "Water"
const TAB_EARTHWORKS := "Earthworks"

const TABS: Array[String] = [
	TAB_BIOMES, TAB_PLANTS, TAB_ANIMALS, TAB_FUNGI,
	TAB_INSECTS, TAB_SOIL, TAB_SHADERS, TAB_WEATHER, TAB_WATER,
	TAB_EARTHWORKS
]

const WATER_PREF_PATH := "user://water_preference.txt"
const WEATHER_PREF_PATH := "user://weather_preference.txt"

const SEASONS: Array[String] = ["spring", "summer", "autumn", "winter"]
const TIMES_OF_DAY: Array[String] = ["dawn", "day", "dusk", "night"]

@onready var _tab_list: VBoxContainer = $Ui/Root/Main/LeftPanel/LeftVBox/TabScroll/TabList
@onready var _entity_list: VBoxContainer = $Ui/Root/Main/LeftPanel/LeftVBox/EntityScroll/EntityList
@onready var _tab_header: Label = $Ui/Root/Main/LeftPanel/LeftVBox/TabHeader
@onready var _entity_header: Label = $Ui/Root/Main/LeftPanel/LeftVBox/EntityHeader
@onready var _inspector_text: RichTextLabel = $Ui/Root/Main/RightPanel/Inspector/InspectorVBox/InspectorScroll/InspectorText
@onready var _inspector_title: Label = $Ui/Root/Main/RightPanel/Inspector/InspectorVBox/Title
@onready var _state_option: OptionButton = $Ui/Root/Main/RightPanel/Controls/ControlsVBox/StateRow/StateOption
@onready var _animation_option: OptionButton = $Ui/Root/Main/RightPanel/Controls/ControlsVBox/AnimRow/AnimOption
@onready var _season_option: OptionButton = $Ui/Root/Main/RightPanel/Controls/ControlsVBox/SeasonRow/SeasonOption
@onready var _time_option: OptionButton = $Ui/Root/Main/RightPanel/Controls/ControlsVBox/TimeRow/TimeOption
@onready var _copy_btn: Button = $Ui/Root/Main/RightPanel/Inspector/InspectorVBox/Footer/CopyBtn
@onready var _inspector_footer: HBoxContainer = $Ui/Root/Main/RightPanel/Inspector/InspectorVBox/Footer
@onready var _back_btn: Button = $Ui/Root/Header/BackBtn
@onready var _title_label: Label = $Ui/Root/Header/Title
@onready var _preview_viewport: SubViewport = $Ui/Root/Main/RightPanel/Viewport/SubViewport
@onready var _preview_camera_rig: Node3D = $Ui/Root/Main/RightPanel/Viewport/SubViewport/Rig
@onready var _preview_camera: Camera3D = $Ui/Root/Main/RightPanel/Viewport/SubViewport/Rig/Camera
@onready var _preview_sun: DirectionalLight3D = $Ui/Root/Main/RightPanel/Viewport/SubViewport/Sun
@onready var _preview_ground: MeshInstance3D = $Ui/Root/Main/RightPanel/Viewport/SubViewport/Ground
@onready var _preview_root: Node3D = $Ui/Root/Main/RightPanel/Viewport/SubViewport/PreviewRoot
@onready var _env: WorldEnvironment = $Ui/Root/Main/RightPanel/Viewport/SubViewport/WorldEnvironment

var _current_tab: String = TAB_PLANTS
var _current_entity: Dictionary = {}
var _current_preview: Node3D
var _preview_orbit_t: float = 0.0
var _preview_orbit_speed: float = 0.35
var _preview_radius: float = 6.0
var _preview_height: float = 3.5
var _time_accumulator: float = 0.0
var _current_state: String = ""
var _current_animation: String = ""
var _current_season: String = "summer"
var _current_time: String = "day"
var _promote_btn: Button
var _intensity_slider: HSlider
var _intensity_label: Label
var _intensity_row: HBoxContainer
var _weather_intensity: float = 0.8


func _ready() -> void:
	_build_tabs()
	_setup_viewport()
	_populate_season_time()
	_back_btn.pressed.connect(_on_back_pressed)
	_copy_btn.pressed.connect(_on_copy_pressed)
	_state_option.item_selected.connect(_on_state_selected)
	_animation_option.item_selected.connect(_on_animation_selected)
	_season_option.item_selected.connect(_on_season_selected)
	_time_option.item_selected.connect(_on_time_selected)
	_build_promote_button()
	_build_intensity_slider()
	_show_tab(_current_tab)
	_title_label.text = "Fairy Permaculture — Dev Lab"
	GameLog.info("water showcase ready, 6 variations loaded", "lab_water")
	GameLog.info("weather showcase ready, 8 effects loaded", "lab_weather")


## Create the "Promote to game" button once and keep it hidden unless the
## Water tab is active. Placed to the left of the Copy-JSON button so the
## existing inspector layout doesn't shift.
func _build_promote_button() -> void:
	_promote_btn = Button.new()
	_promote_btn.text = "Promote to game"
	_promote_btn.disabled = true
	_promote_btn.add_theme_color_override("font_color", Color(0.23, 0.16, 0.08))
	_promote_btn.pressed.connect(_on_promote_pressed)
	_promote_btn.visible = false
	_inspector_footer.add_child(_promote_btn)
	_inspector_footer.move_child(_promote_btn, 0)


## Weather-tab intensity slider. Lives in its own row inserted above the
## inspector footer so it doesn't reflow the existing layout. Hidden
## unless the Weather tab is active — calls the active preview's
## `set_intensity(value)` hook live.
func _build_intensity_slider() -> void:
	var inspector_vbox: VBoxContainer = _inspector_footer.get_parent() as VBoxContainer
	if inspector_vbox == null:
		return
	_intensity_row = HBoxContainer.new()
	_intensity_label = Label.new()
	_intensity_label.text = "Intensity"
	_intensity_label.add_theme_color_override("font_color", Color(0.23, 0.16, 0.08))
	_intensity_label.custom_minimum_size = Vector2(70, 0)
	_intensity_row.add_child(_intensity_label)
	_intensity_slider = HSlider.new()
	_intensity_slider.min_value = 0.0
	_intensity_slider.max_value = 1.0
	_intensity_slider.step = 0.01
	_intensity_slider.value = _weather_intensity
	_intensity_slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_intensity_slider.value_changed.connect(_on_intensity_changed)
	_intensity_row.add_child(_intensity_slider)
	# Insert the row just before the footer.
	inspector_vbox.add_child(_intensity_row)
	var footer_idx: int = _inspector_footer.get_index()
	inspector_vbox.move_child(_intensity_row, footer_idx)
	_intensity_row.visible = false


func _on_intensity_changed(value: float) -> void:
	_weather_intensity = value
	if _current_preview and _current_preview.has_method("set_intensity"):
		_current_preview.call("set_intensity", value)


func _build_tabs() -> void:
	for t in TABS:
		var b: Button = Button.new()
		b.text = t
		b.toggle_mode = true
		b.add_theme_color_override("font_color", Color(0.23, 0.16, 0.08))
		b.pressed.connect(func(): _show_tab(t))
		_tab_list.add_child(b)


func _populate_season_time() -> void:
	_season_option.clear()
	for s in SEASONS:
		_season_option.add_item(s.capitalize())
	_season_option.select(1)  # summer
	_time_option.clear()
	for t in TIMES_OF_DAY:
		_time_option.add_item(t.capitalize())
	_time_option.select(1)  # day


func _setup_viewport() -> void:
	# Soft cel-shaded preview setup: neutral meadow ground, directional
	# "sun" + warm ambient, and a cute parchment-compatible sky.
	var env: Environment = Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.88, 0.92, 0.93)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.85, 0.88, 0.95)
	env.ambient_light_energy = 0.5
	env.fog_enabled = false
	_env.environment = env
	var ground_mat: StandardMaterial3D = StandardMaterial3D.new()
	ground_mat.albedo_color = Color(0.62, 0.72, 0.48)
	_preview_ground.material_override = ground_mat


func _show_tab(tab: String) -> void:
	_current_tab = tab
	for child in _tab_list.get_children():
		if child is Button:
			child.button_pressed = (child.text == tab)
	_tab_header.text = tab.to_upper()
	_populate_entity_list()


func _populate_entity_list() -> void:
	for child in _entity_list.get_children():
		child.queue_free()
	var entities: Array = _entities_for_tab(_current_tab)
	for e in entities:
		var row_data: Dictionary = {}
		if e is Dictionary:
			row_data = e
		var b: Button = Button.new()
		b.text = row_data.get("name", row_data.get("id", "(unknown)"))
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.add_theme_color_override("font_color", Color(0.23, 0.16, 0.08))
		var captured: Dictionary = row_data
		b.pressed.connect(func(): _select_entity(captured))
		_entity_list.add_child(b)
	if entities.size() > 0:
		_entity_header.text = "%d ENTRIES" % entities.size()
		_select_entity(entities[0])
	else:
		_entity_header.text = "—"
		_clear_entity()


func _entities_for_tab(tab: String) -> Array:
	match tab:
		TAB_BIOMES: return DataStore.eco_biomes
		TAB_PLANTS: return DataStore.eco_plants
		TAB_ANIMALS: return DataStore.eco_animals
		TAB_FUNGI: return DataStore.eco_fungi
		TAB_INSECTS: return DataStore.eco_insects
		TAB_SOIL: return _synthetic_soil_tiers()
		TAB_SHADERS: return _synthetic_shader_entries()
		TAB_WEATHER: return _synthetic_weather_entries()
		TAB_WATER: return _synthetic_water_variations()
		TAB_EARTHWORKS: return _synthetic_earthwork_entries()
		_: return []


## Six water-look variations shown in the Water tab. Each entry is a
## synthetic "entity" dictionary so it flows through the same selection
## pipeline as plants / animals / etc.
func _synthetic_water_variations() -> Array:
	return [
		{
			"id": "classic",
			"name": "Classic translucent",
			"category": "water",
			"visual_states": ["demo"],
			"animations": [],
			"gpu_cost": "low",
			"best_use": "stream + pond",
			"approach": "Shallow/deep fresnel mix, UV scroll + gentle vertex ripple — the current in-game benchmark.",
		},
		{
			"id": "toon_banded",
			"name": "Toon banded",
			"category": "water",
			"visual_states": ["demo"],
			"animations": [],
			"gpu_cost": "low",
			"best_use": "both — matches cel aesthetic",
			"approach": "Three hard colour bands stepped by view angle + animated foam ring at the bank.",
		},
		{
			"id": "painted_ripple",
			"name": "Painted ripple",
			"category": "water",
			"visual_states": ["demo"],
			"animations": [],
			"gpu_cost": "medium",
			"best_use": "stream",
			"approach": "Overlapping sin-wave stroke field with hash-cell jitter, scrolled along flow direction.",
		},
		{
			"id": "anime_low_poly",
			"name": "Anime low-poly",
			"category": "water",
			"visual_states": ["demo"],
			"animations": [],
			"gpu_cost": "low",
			"best_use": "pond",
			"approach": "Quantized stepped vertex displacement + rhythmic caustic dot pattern on a coarse grid.",
		},
		{
			"id": "reflective_glass",
			"name": "Reflective glass",
			"category": "water",
			"visual_states": ["demo"],
			"animations": [],
			"gpu_cost": "low",
			"best_use": "still pond",
			"approach": "Near-mirror metallic shading with sky tint, fresnel edge glow, and near-zero wave.",
		},
		{
			"id": "ghibli_stream",
			"name": "Ghibli stream",
			"category": "water",
			"visual_states": ["demo"],
			"animations": [],
			"gpu_cost": "medium-high",
			"best_use": "magical set-piece ponds + streams",
			"approach": "Layered translucent base + flowing white sparkle cells + fog fade at the bank edge.",
		},
	]


## Earthwork entries — player-placeable landforms that re-plumb water
## (swales, check dams, terraces, keyline patterns, hugelkultur ridges).
## Currently only the swale is shipping; others are scaffolded for when
## the full earthworks suite lands. Each entry shows intent + how the
## design reads in-world, so the agents can iterate on the shape against
## a live preview instead of against the running farm.
func _synthetic_earthwork_entries() -> Array:
	return [
		{
			"id": "swale",
			"name": "Swale (contour trench + berm)",
			"category": "earthwork",
			"visual_states": ["finished", "wet", "dry"],
			"animations": [],
			"gpu_cost": "low",
			"intent": "On-contour trench with a downhill berm. Catches uphill runoff so summer rain infiltrates instead of running off. Sediment builds the berm into prime planting ground — berm gets constant sub-irrigation.",
			"reads_as": "Curved earthen line across the slope. Trench pools visibly in wet weather; berm is clearly taller, clearly planted (guild of fruit + chop-and-drop companions).",
			"fails_when": "Drawn as straight axis-aligned boxes on flat ground — looks like random dirt strips. Fix: follow contour (sample heightfield), make berm visibly taller + planted, make trench pool water.",
		},
	]


func _synthetic_soil_tiers() -> Array:
	return [
		{ "id": "barren", "name": "Barren (< 1% OM)", "category": "soil-tier", "visual_states": ["dry", "wet"], "animations": [] },
		{ "id": "poor", "name": "Poor (1-2% OM)", "category": "soil-tier", "visual_states": ["dry", "wet"], "animations": [] },
		{ "id": "developing", "name": "Developing (2-3% OM)", "category": "soil-tier", "visual_states": ["dry", "wet"], "animations": [] },
		{ "id": "rich", "name": "Rich (3-5% OM)", "category": "soil-tier", "visual_states": ["dry", "wet"], "animations": [] },
		{ "id": "abundant", "name": "Abundant (5-10% OM)", "category": "soil-tier", "visual_states": ["dry", "wet"], "animations": [] },
		{ "id": "climax", "name": "Climax (10%+ OM)", "category": "soil-tier", "visual_states": ["dry", "wet"], "animations": [] }
	]


func _synthetic_shader_entries() -> Array:
	return [
		{ "id": "toon-2band", "name": "Toon 2-Band Cel", "category": "shader", "visual_states": ["demo"], "animations": [], "shader_path": "res://shaders/toon.gdshader" }
	]


## Eight shader-driven weather effects shown in the Weather tab. Each
## variation is a self-contained ShaderMaterial dispatched through the
## weather_preview script (see lab_preview_factory._weather).
func _synthetic_weather_entries() -> Array:
	return [
		{
			"id": "rain_storm",
			"name": "Rain storm",
			"category": "weather",
			"visual_states": ["demo"],
			"animations": [],
			"gpu_cost": "medium",
			"best_use": "summer drought mitigation — triggers during storm events; gameplay: tiles gain +surface_water_cm",
			"approach": "Screen-space vertical streak shader on two crossed quads + per-hit instanced ground-splash rings + tinted sky dome.",
		},
		{
			"id": "gentle_rain",
			"name": "Gentle rain",
			"category": "weather",
			"visual_states": ["demo"],
			"animations": [],
			"gpu_cost": "low",
			"best_use": "autumn showers — cosmetic mood rain; gameplay: slow +moisture for all tiles",
			"approach": "Softer variant of the storm streak shader: fewer active columns, lighter sky tint, denser mist fall-off.",
		},
		{
			"id": "morning_fog",
			"name": "Morning fog",
			"category": "weather",
			"visual_states": ["demo"],
			"animations": [],
			"gpu_cost": "low",
			"best_use": "BC coastal ambience — dawn only; gameplay: photosynthesis paused until lift",
			"approach": "Three stacked ground-hugging noise quads with edge-tapered alpha + dawn-tinted sky dome drifting on scrolled value-noise.",
		},
		{
			"id": "wind_gusts",
			"name": "Wind gusts",
			"category": "weather",
			"visual_states": ["demo"],
			"animations": [],
			"gpu_cost": "low",
			"best_use": "everyday atmospheric motion — permanent low-grade; gameplay: biomass abrades unmulched tiles",
			"approach": "Vertex-sway shader on grass + leaves (sin+flutter driven by height) + streaming leaf-particle billboard sheet.",
		},
		{
			"id": "snow",
			"name": "Snow",
			"category": "weather",
			"visual_states": ["demo"],
			"animations": [],
			"gpu_cost": "medium",
			"best_use": "winter set-piece — reveals swales; gameplay: halts growth, traps air, reveals structure",
			"approach": "Billboard flake streams + ground-shader accumulation lerping albedo toward white by snow_depth uniform (ramps 0→0.4 over 4 s).",
		},
		{
			"id": "drought",
			"name": "Summer drought heat shimmer",
			"category": "weather",
			"visual_states": ["demo"],
			"animations": [],
			"gpu_cost": "low",
			"best_use": "heat-dome weeks — visible moisture stress; gameplay: -moisture/day, wilting visuals",
			"approach": "Ground-level refraction-style UV distortion quad + yellow-brown sky tint + drooping tree-leaves keyframed on the preview node.",
		},
		{
			"id": "lightning",
			"name": "Lightning strike",
			"category": "weather",
			"visual_states": ["demo"],
			"animations": [],
			"gpu_cost": "medium",
			"best_use": "dramatic storm punctuation — paired with rain_storm; gameplay: 1 % ignition on dead grass tiles",
			"approach": "Dark sky tint with timed flash uniform + additive jittered vertical beam shader firing once every 4 s.",
		},
		{
			"id": "aurora",
			"name": "Aurora",
			"category": "weather",
			"visual_states": ["demo"],
			"animations": [],
			"gpu_cost": "high",
			"best_use": "climax-tier flourish — farm_vitality > 0.95, night only; gameplay: pure signal that the farm healed",
			"approach": "Sky-dome shader painting banded green/blue/pink curtains via scrolling value-noise + sin wobble; only the upper dome half lights.",
		},
	]


func _clear_entity() -> void:
	_current_entity = {}
	_inspector_title.text = "(select an entity)"
	_inspector_text.text = ""
	_state_option.clear()
	_animation_option.clear()
	_clear_preview()
	_update_promote_button()


func _select_entity(entity: Dictionary) -> void:
	_current_entity = entity
	_inspector_title.text = entity.get("name", entity.get("id", "?"))
	_inspector_text.text = _format_inspector(entity)
	_populate_state_options(entity)
	_populate_animation_options(entity)
	_rebuild_preview(entity)
	_update_promote_button()


func _update_promote_button() -> void:
	if _promote_btn == null:
		return
	var is_water: bool = _current_tab == TAB_WATER and not _current_entity.is_empty()
	var is_weather: bool = _current_tab == TAB_WEATHER and not _current_entity.is_empty()
	var promotable: bool = is_water or is_weather
	_promote_btn.visible = promotable
	_promote_btn.disabled = not promotable
	if is_water:
		_promote_btn.tooltip_text = "Logs your preferred water look to user://water_preference.txt. In-game water is NOT touched from the lab."
	elif is_weather:
		_promote_btn.tooltip_text = "Logs your preferred weather effect to user://weather_preference.txt. Preview-only — in-game weather system is not yet hooked up."
	# Intensity slider only makes sense in the weather tab.
	if _intensity_row:
		_intensity_row.visible = is_weather


func _populate_state_options(entity: Dictionary) -> void:
	_state_option.clear()
	var states: Array = entity.get("visual_states", [])
	if states.is_empty():
		_state_option.add_item("—")
		_state_option.set_item_disabled(0, true)
		_current_state = ""
		return
	for s in states:
		_state_option.add_item(String(s))
	# Default to "mature" if present, else first.
	var idx: int = 0
	for i in range(states.size()):
		if String(states[i]) == "mature" or String(states[i]) == "adult":
			idx = i
			break
	_state_option.select(idx)
	_current_state = String(states[idx])


func _populate_animation_options(entity: Dictionary) -> void:
	_animation_option.clear()
	var anims: Array = entity.get("animations", [])
	if anims.is_empty():
		_animation_option.add_item("—")
		_animation_option.set_item_disabled(0, true)
		_current_animation = ""
		return
	for a in anims:
		_animation_option.add_item(String(a))
	_animation_option.select(0)
	_current_animation = String(anims[0])


func _on_state_selected(idx: int) -> void:
	_current_state = _state_option.get_item_text(idx)
	_rebuild_preview(_current_entity)


func _on_animation_selected(idx: int) -> void:
	_current_animation = _animation_option.get_item_text(idx)
	_time_accumulator = 0.0


func _on_season_selected(idx: int) -> void:
	_current_season = SEASONS[idx]
	_apply_season()
	_rebuild_preview(_current_entity)


func _on_time_selected(idx: int) -> void:
	_current_time = TIMES_OF_DAY[idx]
	_apply_time_of_day()


func _apply_season() -> void:
	# Tint the ground material to reflect the season, so plants read
	# against appropriate backdrops (snow in winter, browner in autumn).
	if _preview_ground == null or _preview_ground.material_override == null:
		return
	var mat: StandardMaterial3D = _preview_ground.material_override
	match _current_season:
		"spring": mat.albedo_color = Color(0.55, 0.78, 0.48)
		"summer": mat.albedo_color = Color(0.62, 0.75, 0.42)
		"autumn": mat.albedo_color = Color(0.67, 0.55, 0.32)
		"winter": mat.albedo_color = Color(0.82, 0.85, 0.88)


func _apply_time_of_day() -> void:
	# Simple 4-step LUT for the preview sun+sky.
	if _env == null or _env.environment == null:
		return
	var env: Environment = _env.environment
	match _current_time:
		"dawn":
			env.background_color = Color(0.78, 0.72, 0.62)
			_preview_sun.light_color = Color(1.0, 0.82, 0.65)
			_preview_sun.light_energy = 0.8
			env.ambient_light_energy = 0.35
		"day":
			env.background_color = Color(0.85, 0.93, 0.95)
			_preview_sun.light_color = Color(1.0, 0.96, 0.87)
			_preview_sun.light_energy = 1.2
			env.ambient_light_energy = 0.55
		"dusk":
			env.background_color = Color(0.82, 0.58, 0.42)
			_preview_sun.light_color = Color(1.0, 0.60, 0.38)
			_preview_sun.light_energy = 0.75
			env.ambient_light_energy = 0.35
		"night":
			env.background_color = Color(0.10, 0.13, 0.22)
			_preview_sun.light_color = Color(0.60, 0.72, 1.0)
			_preview_sun.light_energy = 0.25
			env.ambient_light_energy = 0.20


func _format_inspector(entity: Dictionary) -> String:
	# Water + weather variations get friendly inspector cards; everything
	# else falls through to the raw-JSON view (for Copy-JSON round-trip).
	if _current_tab == TAB_WATER:
		return _format_variation_card(entity, "six")
	if _current_tab == TAB_WEATHER:
		return _format_variation_card(entity, "eight")
	return JSON.stringify(entity, "  ")


## Shared card formatter for water + weather variations. `count_word` is
## inserted into the "cycle through all X to compare" footer so the same
## layout covers both tabs.
func _format_variation_card(entity: Dictionary, count_word: String) -> String:
	var name_str: String = String(entity.get("name", entity.get("id", "?")))
	var cost: String = String(entity.get("gpu_cost", "?"))
	var best: String = String(entity.get("best_use", "?"))
	var approach: String = String(entity.get("approach", ""))
	var lines: Array[String] = [
		"Name: %s" % name_str,
		"GPU cost: %s" % cost,
		"Best use: %s" % best,
		"",
		"Approach: %s" % approach,
		"",
		"Note: this is a prototype — cycle through all %s to compare." % count_word,
	]
	return "\n".join(lines)


func _on_promote_pressed() -> void:
	if _current_entity.is_empty():
		return
	var id: String = String(_current_entity.get("id", ""))
	if id == "":
		return
	var pref_path: String = WATER_PREF_PATH
	var category: String = "lab_water"
	var selected_key: String = "water_variation_selected"
	if _current_tab == TAB_WEATHER:
		pref_path = WEATHER_PREF_PATH
		category = "lab_weather"
		selected_key = "weather_variation_selected"
	GameLog.info("%s id=%s" % [selected_key, id], category)
	var file: FileAccess = FileAccess.open(pref_path, FileAccess.WRITE)
	if file:
		file.store_string(id)
		file.close()
	else:
		GameLog.warn("failed to write %s" % pref_path, category)
	var prev_text: String = _promote_btn.text
	_promote_btn.text = "Saved!"
	var t: SceneTreeTimer = get_tree().create_timer(1.0)
	t.timeout.connect(func(): _promote_btn.text = prev_text)


func _on_copy_pressed() -> void:
	if _current_entity.is_empty():
		return
	var text: String = JSON.stringify(_current_entity, "  ")
	DisplayServer.clipboard_set(text)
	_copy_btn.text = "Copied!"
	var t: SceneTreeTimer = get_tree().create_timer(1.0)
	t.timeout.connect(func(): _copy_btn.text = "Copy JSON")


func _on_back_pressed() -> void:
	get_tree().change_scene_to_file("res://scenes/main.tscn")


## Preview construction ------------------------------------------------

func _clear_preview() -> void:
	if _current_preview:
		_current_preview.queue_free()
		_current_preview = null


func _rebuild_preview(entity: Dictionary) -> void:
	_clear_preview()
	if entity.is_empty():
		return
	var kind: String = "plant"
	match _current_tab:
		TAB_PLANTS: kind = "plant"
		TAB_ANIMALS: kind = "animal"
		TAB_FUNGI: kind = "fungus"
		TAB_INSECTS: kind = "insect"
		TAB_BIOMES: kind = "biome"
		TAB_SOIL: kind = "soil"
		TAB_SHADERS: kind = "shader"
		TAB_WEATHER: kind = "weather"
		TAB_WATER: kind = "water"
		TAB_EARTHWORKS: kind = "earthwork"
	# `LabPreviewFactory` is declared via `class_name`. Static methods
	# are dispatched through the class name directly.
	var preview: Node3D = LabPreviewFactory.build(kind, entity, _current_state)
	if preview == null:
		return
	_preview_root.add_child(preview)
	_current_preview = preview
	# If the preview supports intensity (weather shaders), push the slider
	# value straight away so the effect is scaled on first frame.
	if _current_tab == TAB_WEATHER:
		if _current_preview.has_method("set_intensity"):
			_current_preview.call("set_intensity", _weather_intensity)
		var wid: String = String(entity.get("id", ""))
		if wid != "":
			GameLog.info("weather variation: %s" % wid, "lab_weather")
	# Auto-tune camera radius by bounding.
	var aabb: AABB = _estimate_aabb(preview)
	_preview_radius = max(3.0, aabb.size.length() * 1.3)
	_preview_height = max(1.5, aabb.size.y * 0.6 + 1.5)
	_apply_season()
	_apply_time_of_day()


func _estimate_aabb(node: Node3D) -> AABB:
	var out: AABB = AABB(Vector3.ZERO, Vector3.ONE)
	var first: bool = true
	for child in node.get_children():
		if child is MeshInstance3D:
			var mi: MeshInstance3D = child
			var ab: AABB = mi.get_aabb()
			ab.position += mi.position
			if first:
				out = ab
				first = false
			else:
				out = out.merge(ab)
		elif child is Node3D:
			var sub: AABB = _estimate_aabb(child)
			sub.position += (child as Node3D).position
			if first:
				out = sub
				first = false
			else:
				out = out.merge(sub)
	return out


func _process(delta: float) -> void:
	_time_accumulator += delta
	# Fixed isometric camera to match the in-game 45° yaw / 45° pitch
	# orthographic overseer view — the preview should show the entity
	# exactly as it would appear on the farm, not orbit around it.
	if _preview_camera_rig and _preview_camera:
		if _preview_camera.projection != Camera3D.PROJECTION_ORTHOGONAL:
			_preview_camera.projection = Camera3D.PROJECTION_ORTHOGONAL
		_preview_camera.size = max(3.0, _preview_radius * 1.4)
		var dist: float = max(10.0, _preview_radius * 2.0)
		var p: float = deg_to_rad(45.0)
		var y: float = deg_to_rad(45.0)
		var offset: Vector3 = Vector3(
			cos(p) * sin(y) * dist,
			sin(p) * dist,
			cos(p) * cos(y) * dist
		)
		_preview_camera_rig.position = offset
		_preview_camera_rig.look_at(Vector3(0, _preview_height * 0.35, 0), Vector3.UP)
	if _current_preview and _current_preview.has_method("animate"):
		_current_preview.animate(_current_animation, _time_accumulator, delta)
