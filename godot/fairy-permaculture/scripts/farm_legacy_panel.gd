## Fairy Permaculture — Farm Legacy parchment scroll.
##
## Read-only panel that surfaces the player's cumulative run counters.
## Reads from the `LifetimeStats` autoload that `fp-game-director` is
## landing in a parallel stream. Because the panel may ship before that
## autoload exists, we gate every read through `get_node_or_null` and
## fall back to an "Awaiting first harvest…" placeholder. No crash. No
## hard dependency.
##
## Layout:
##   • Header — "Farm Legacy" + current farm age ("Day 127 · Autumn Y2")
##   • Stat grid — top 6 counters (eggs, milk, fruit, compost scoops,
##     fairies hatched, wildlife arrivals) with swatch + number + label
##   • Firsts timeline — chronological list ("First fairy hatched Day 3",
##     "First compost finished Day 11") inside a ScrollContainer
##
## Colors trace to `Palette.*`. Parchment bg, EARTH accents, INK body.
##
## DESIGN-CHECK: INK body, EARTH headers, WARM_STONE meta. Swatch tints
## pulled from Palette.* (HONEY, MEADOW, CORAL, COMPOST, BERRY, SKY).
extends Control

signal closed

const BODY_COLOR: Color = Color(0.23, 0.16, 0.08, 1.0)
const HEADER_COLOR: Color = Color(0.36, 0.27, 0.16, 1.0)
const META_COLOR: Color = Color(0.55, 0.41, 0.27, 1.0)

## Keys pulled from the LifetimeStats.get(key) API + display metadata.
## Each entry: { key, label, tint, formatter }. The formatter turns the
## raw counter (int/float) into a display string — most are just int
## formatting, but milk/fruit live in float buckets.
const STAT_KEYS: Array = [
	{ "key": "eggs_laid_total",        "label": "Eggs laid",        "tint_name": "HONEY",   "decimals": 0 },
	{ "key": "milk_produced_total",    "label": "Milk produced",    "tint_name": "MIST",    "decimals": 1 },
	{ "key": "fruit_harvested_total",  "label": "Fruit harvested",  "tint_name": "CORAL",   "decimals": 1 },
	{ "key": "compost_scoops_total",   "label": "Compost scooped",  "tint_name": "COMPOST", "decimals": 0 },
	{ "key": "fairies_hatched_total",  "label": "Fairies hatched",  "tint_name": "BERRY",   "decimals": 0 },
	{ "key": "wildlife_arrivals_total","label": "Wildlife arrived", "tint_name": "MEADOW",  "decimals": 0 },
]

## Human-facing label lookup for the "firsts" timeline. LifetimeStats.firsts()
## returns a dict of { first_*_day: N }; anything not listed here falls
## back to a prettified key name so future game-director additions
## surface automatically.
const FIRSTS_LABELS: Dictionary = {
	"first_chicken_day":        "First chicken arrived",
	"first_compost_finish_day": "First compost finished",
	"first_owl_arrival_day":    "First barn owl arrived",
	"first_fairy_hatch_day":    "First fairy hatched",
	"first_egg_day":            "First egg laid",
	"first_harvest_day":        "First harvest",
	"first_wildlife_day":       "First wildlife arrived",
	"first_hugel_day":          "First hügelbed built",
	"first_bone_meal_day":      "First bone meal fired",
}

@onready var _dim: ColorRect = $Dim
@onready var _panel_root: PanelContainer = $Panel
@onready var _close_btn: Button = $Panel/VBox/Header/Close
@onready var _age_label: Label = $Panel/VBox/AgeLabel
@onready var _stats_grid: GridContainer = $Panel/VBox/StatsGrid
@onready var _firsts_list: VBoxContainer = $Panel/VBox/FirstsScroll/FirstsList
@onready var _empty_label: Label = $Panel/VBox/EmptyLabel


func _ready() -> void:
	_close_btn.pressed.connect(_on_close)
	_dim.gui_input.connect(_on_dim_clicked)
	visible = false


func show_panel() -> void:
	_refresh()
	visible = true
	if has_node("/root/GameLog"):
		GameLog.event("farm_legacy_opened", {})


func hide_panel() -> void:
	visible = false
	emit_signal("closed")


func toggle() -> void:
	if visible:
		_on_close()
	else:
		show_panel()


func _input(event: InputEvent) -> void:
	if not visible:
		return
	if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		_on_close()
		accept_event()


func _on_close() -> void:
	if has_node("/root/AudioManager"):
		AudioManager.play("hover-tick", -10.0)
	hide_panel()


func _on_dim_clicked(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		var mb: InputEventMouseButton = event
		if not _panel_root.get_global_rect().has_point(mb.global_position):
			_on_close()


# =====================================================================
# Content refresh — gracefully degrades when LifetimeStats is absent.
# =====================================================================

func _refresh() -> void:
	_age_label.text = _format_age()
	# Clear both content sections before repopulating.
	for c in _stats_grid.get_children():
		c.queue_free()
	for c in _firsts_list.get_children():
		c.queue_free()

	var stats_node: Node = get_node_or_null("/root/LifetimeStats")
	if stats_node == null:
		_empty_label.text = "The scribe has not yet begun her record.\nReturn after your first harvest."
		_empty_label.visible = true
		_stats_grid.visible = false
		_firsts_list.get_parent().visible = false
		return

	_empty_label.visible = false
	_stats_grid.visible = true
	_firsts_list.get_parent().visible = true

	_populate_stats(stats_node)
	_populate_firsts(stats_node)


func _format_age() -> String:
	if not has_node("/root/Scheduler"):
		return "—"
	var day: int = Scheduler.day + 1
	var season: String = Scheduler.current_season().capitalize()
	var year: int = Scheduler.year + 1
	return "Day %d · %s Y%d" % [day, season, year]


## Render the 6-stat grid. Each stat is a small parchment sub-card:
## tinted swatch + big number + label. Uses two columns.
func _populate_stats(stats_node: Node) -> void:
	for entry in STAT_KEYS:
		var key: String = String(entry["key"])
		var value: Variant = _safe_get(stats_node, key)
		var number: String = _format_number(value, int(entry.get("decimals", 0)))
		var tint: Color = _tint_by_name(String(entry["tint_name"]))
		_stats_grid.add_child(_build_stat_card(number, String(entry["label"]), tint))


func _safe_get(stats_node: Node, key: String) -> Variant:
	if stats_node.has_method("get"):
		# LifetimeStats.get(key) is a first-class API per the handoff spec.
		var v: Variant = stats_node.call("get", key)
		if v != null:
			return v
	# Fallback: property lookup.
	return stats_node.get(key)


func _format_number(v: Variant, decimals: int) -> String:
	if v == null:
		return "—"
	var f: float = 0.0
	match typeof(v):
		TYPE_INT:
			f = float(int(v))
		TYPE_FLOAT:
			f = float(v)
		TYPE_STRING:
			f = float(String(v))
		_:
			return "—"
	if decimals <= 0:
		return "%d" % int(round(f))
	var fmt: String = "%." + str(decimals) + "f"
	return fmt % f


## Stat card — swatch strip + number label + small body label.
func _build_stat_card(number: String, label: String, tint: Color) -> PanelContainer:
	var card: PanelContainer = PanelContainer.new()
	card.custom_minimum_size = Vector2(170, 56)
	var s: StyleBoxFlat = StyleBoxFlat.new()
	s.bg_color = Color(0.97, 0.93, 0.83, 0.6)
	s.border_color = Color(tint.r, tint.g, tint.b, 0.75)
	s.border_width_left = 4  # Warm accent band on the left edge.
	s.border_width_top = 1
	s.border_width_right = 1
	s.border_width_bottom = 1
	s.corner_radius_top_left = 4
	s.corner_radius_top_right = 4
	s.corner_radius_bottom_left = 4
	s.corner_radius_bottom_right = 4
	s.content_margin_left = 10.0
	s.content_margin_right = 10.0
	s.content_margin_top = 6.0
	s.content_margin_bottom = 6.0
	card.add_theme_stylebox_override("panel", s)

	var vb: VBoxContainer = VBoxContainer.new()
	vb.add_theme_constant_override("separation", 0)
	card.add_child(vb)

	var big: Label = Label.new()
	big.text = number
	big.add_theme_color_override("font_color", HEADER_COLOR)
	big.add_theme_font_size_override("font_size", 20)
	vb.add_child(big)

	var small: Label = Label.new()
	small.text = label
	small.add_theme_color_override("font_color", META_COLOR)
	small.add_theme_font_size_override("font_size", 11)
	vb.add_child(small)

	return card


## Render the chronological firsts timeline. Entries are sorted by the
## day number (ascending) so the list reads top-to-bottom as the farm's
## life story. Each row is a parchment-ruled line.
func _populate_firsts(stats_node: Node) -> void:
	var firsts: Dictionary = {}
	if stats_node.has_method("firsts"):
		var v: Variant = stats_node.call("firsts")
		if v is Dictionary:
			firsts = v
	if firsts.is_empty():
		var placeholder: Label = Label.new()
		placeholder.text = "— no firsts yet —"
		placeholder.add_theme_color_override("font_color", META_COLOR)
		placeholder.add_theme_font_size_override("font_size", 12)
		placeholder.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_firsts_list.add_child(placeholder)
		return

	var ordered: Array = []
	for k in firsts.keys():
		var day_v: Variant = firsts[k]
		var day: int = -1
		match typeof(day_v):
			TYPE_INT:    day = int(day_v)
			TYPE_FLOAT:  day = int(day_v)
			TYPE_STRING: day = int(String(day_v))
			_: continue
		if day < 0:
			continue
		ordered.append({ "key": String(k), "day": day })
	ordered.sort_custom(func(a, b): return int(a["day"]) < int(b["day"]))

	for entry in ordered:
		_firsts_list.add_child(_build_first_row(String(entry["key"]), int(entry["day"])))


func _build_first_row(key: String, day: int) -> HBoxContainer:
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)

	# Hand-drawn bullet character — parchment rule.
	var bullet: Label = Label.new()
	bullet.text = "·"
	bullet.add_theme_color_override("font_color", META_COLOR)
	bullet.add_theme_font_size_override("font_size", 14)
	bullet.custom_minimum_size = Vector2(12, 0)
	row.add_child(bullet)

	var label: Label = Label.new()
	label.text = _label_for_first(key)
	label.add_theme_color_override("font_color", BODY_COLOR)
	label.add_theme_font_size_override("font_size", 13)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(label)

	var day_label: Label = Label.new()
	day_label.text = "Day %d" % day
	day_label.add_theme_color_override("font_color", META_COLOR)
	day_label.add_theme_font_size_override("font_size", 12)
	day_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	row.add_child(day_label)

	return row


func _label_for_first(key: String) -> String:
	if FIRSTS_LABELS.has(key):
		return String(FIRSTS_LABELS[key])
	# Best-effort prettification: "first_foo_bar_day" → "First foo bar".
	var pretty: String = key.replace("first_", "").replace("_day", "").replace("_", " ")
	pretty = pretty.strip_edges()
	if pretty.length() == 0:
		return key
	return "First %s" % pretty


# =====================================================================
# Palette lookup — traces every swatch to Palette.*.
# =====================================================================

func _tint_by_name(name: String) -> Color:
	if not has_node("/root/Palette"):
		# Safe fallback tint if Palette autoload is somehow absent.
		return Color(0.55, 0.41, 0.27, 1.0)
	match name:
		"HONEY":     return Palette.HONEY
		"MEADOW":    return Palette.MEADOW
		"CORAL":     return Palette.CORAL
		"COMPOST":   return Palette.COMPOST
		"BERRY":     return Palette.BERRY
		"SKY":       return Palette.SKY
		"MIST":      return Palette.MIST
		"EARTH":     return Palette.EARTH
		"WARM_STONE":return Palette.WARM_STONE
		_: return Palette.EARTH
