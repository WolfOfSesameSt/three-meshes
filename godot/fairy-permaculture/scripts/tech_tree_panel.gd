## Fairy Permaculture — Tech Tree (upgrade catalogue) panel.
##
## MVP scope: read `Progression.BUILD_CATALOG` + `Progression.unlocked_buildings`
## and render each entry as a parchment card showing icon glyph, label,
## cost string, and the per-entry state (BUILT / AVAILABLE / LOCKED).
##
## See `docs/design/upgrade-tree.md` for the long-form design spec. This
## panel is deliberately non-interactive in MVP — it's a read-only
## legend so the player can see what's unlocked and what it costs without
## opening a right-click menu on every patch of ground.
##
## Open: bound to the `tech_tree` input action ("Y" key by default) and
## the HUD's [Tech Tree] button. ESC closes.
##
## Colors traced to `Palette.*`. No raw `Color()` literals.
##
## DESIGN-CHECK: PARCHMENT bg, EARTH/COMPOST ink, HONEY accent for
## AVAILABLE, MEADOW for BUILT, WARM_STONE for LOCKED. `clamp_happy()`
## sanitizes any derived tint before it ships to a StyleBox.
extends Control

signal closed

# Ring groupings derived from Progression build flow. MVP uses three
# coarse rings matching the progression memory (see DESIGN.md
# §Progression rings). Each building id lives in exactly one ring.
const _RING_0_DAY_ONE: Array[StringName] = [
	&"compost_pile",
	&"storage_shed",
	&"sprouting_bed",
	&"worm_bin",
	&"mason_bee_tubes",
]
const _RING_1_FIRST_HARVEST: Array[StringName] = [
	&"hot_pile",
	&"chipper",
	&"bokashi_bucket",
]
const _RING_2_PRODUCTION: Array[StringName] = [
	&"chicken_coop",
	&"hive",
	&"butcher_station",
	&"kiln",
]
const _RING_3_MASTERY: Array[StringName] = [
	&"compost_tea_brewer",
	&"johnson_su_bioreactor",
]

# Icon glyphs — project-approved characters (no emoji — per task brief).
const _ICON: Dictionary = {
	&"compost_pile":          "◊",
	&"storage_shed":          "◊",
	&"sprouting_bed":         "✦",
	&"worm_bin":              "◊",
	&"mason_bee_tubes":       "✦",
	&"hot_pile":              "♨",
	&"chipper":               "◊",
	&"bokashi_bucket":        "◊",
	&"chicken_coop":          "✦",
	&"hive":                  "✦",
	&"butcher_station":       "◊",
	&"kiln":                  "♨",
	&"compost_tea_brewer":    "↻",
	&"johnson_su_bioreactor": "✦",
}

const _CARD_WIDTH: float = 220.0
const _CARD_HEIGHT: float = 96.0

var _root_panel: PanelContainer
var _content_vbox: VBoxContainer
var _built: bool = false


func _ready() -> void:
	anchor_left = 0.0
	anchor_top = 0.0
	anchor_right = 1.0
	anchor_bottom = 1.0
	offset_left = 0.0
	offset_top = 0.0
	offset_right = 0.0
	offset_bottom = 0.0
	mouse_filter = Control.MOUSE_FILTER_STOP
	visible = false
	_build_chrome()
	_rebuild_cards()
	if Engine.has_singleton("Progression") or Engine.get_main_loop() != null:
		if has_node("/root/Progression"):
			var prog: Node = get_node("/root/Progression")
			if prog.has_signal("unlocks_changed") and not prog.is_connected("unlocks_changed", _on_unlocks_changed):
				prog.connect("unlocks_changed", _on_unlocks_changed)
	GameLog.info("tech_tree_panel ready (%d catalog entries)" % Progression.BUILD_CATALOG.size(), "ui")


func toggle() -> void:
	if visible:
		hide_panel()
	else:
		show_panel()


func show_panel() -> void:
	_rebuild_cards()
	visible = true
	AudioManager.play("hover-tick", -8.0)


func hide_panel() -> void:
	visible = false
	AudioManager.play("hover-tick", -12.0)
	emit_signal("closed")


func _input(event: InputEvent) -> void:
	if not visible:
		return
	if event is InputEventKey and (event as InputEventKey).pressed and (event as InputEventKey).keycode == KEY_ESCAPE:
		hide_panel()
		get_viewport().set_input_as_handled()


func _on_unlocks_changed() -> void:
	if visible:
		_rebuild_cards()


# =====================================================================
# Panel chrome — parchment backdrop + scrollable card grid
# =====================================================================

func _build_chrome() -> void:
	# Dim layer so the world behind reads as "paused reading".
	var dim: ColorRect = ColorRect.new()
	dim.color = Color(Palette.COMPOST.r, Palette.COMPOST.g, Palette.COMPOST.b, 0.55)
	dim.anchor_left = 0.0
	dim.anchor_top = 0.0
	dim.anchor_right = 1.0
	dim.anchor_bottom = 1.0
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(dim)
	# Parchment frame centered.
	_root_panel = PanelContainer.new()
	_root_panel.anchor_left = 0.5
	_root_panel.anchor_top = 0.5
	_root_panel.anchor_right = 0.5
	_root_panel.anchor_bottom = 0.5
	_root_panel.offset_left = -540.0
	_root_panel.offset_top = -340.0
	_root_panel.offset_right = 540.0
	_root_panel.offset_bottom = 340.0
	var style: StyleBoxFlat = StyleBoxFlat.new()
	style.bg_color = Palette.PARCHMENT
	style.border_color = Palette.EARTH
	style.border_width_left = 3
	style.border_width_top = 3
	style.border_width_right = 3
	style.border_width_bottom = 3
	style.corner_radius_top_left = 8
	style.corner_radius_top_right = 8
	style.corner_radius_bottom_left = 8
	style.corner_radius_bottom_right = 8
	style.content_margin_left = 20.0
	style.content_margin_top = 16.0
	style.content_margin_right = 20.0
	style.content_margin_bottom = 16.0
	_root_panel.add_theme_stylebox_override("panel", style)
	add_child(_root_panel)
	var vbox: VBoxContainer = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 10)
	_root_panel.add_child(vbox)
	# Header row with title + close button.
	var header: HBoxContainer = HBoxContainer.new()
	var title: Label = Label.new()
	title.text = "Tech Tree  ✦  Permaculture Upgrades"
	title.add_theme_color_override("font_color", Palette.INK)
	title.add_theme_font_size_override("font_size", 22)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)
	var close_btn: Button = Button.new()
	close_btn.text = "Close"
	close_btn.custom_minimum_size = Vector2(80, 28)
	close_btn.pressed.connect(hide_panel)
	header.add_child(close_btn)
	vbox.add_child(header)
	var subtitle: Label = Label.new()
	subtitle.text = "Read-only catalogue. Build through the right-click menu on bare ground."
	subtitle.add_theme_color_override("font_color", Palette.EARTH)
	subtitle.add_theme_font_size_override("font_size", 12)
	vbox.add_child(subtitle)
	# Scroll area for the card rows.
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.custom_minimum_size = Vector2(1020, 520)
	vbox.add_child(scroll)
	_content_vbox = VBoxContainer.new()
	_content_vbox.add_theme_constant_override("separation", 14)
	_content_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_content_vbox)
	_built = true


func _rebuild_cards() -> void:
	if not _built:
		return
	for c in _content_vbox.get_children():
		c.queue_free()
	_build_ring_row("Ring 0  —  Day-one crafts", _RING_0_DAY_ONE)
	_build_ring_row("Ring 1  —  First harvest", _RING_1_FIRST_HARVEST)
	_build_ring_row("Ring 2  —  Production", _RING_2_PRODUCTION)
	_build_ring_row("Ring 3  —  Mastery", _RING_3_MASTERY)


func _build_ring_row(ring_label: String, ring_ids: Array[StringName]) -> void:
	var header: Label = Label.new()
	header.text = ring_label
	header.add_theme_color_override("font_color", Palette.COMPOST)
	header.add_theme_font_size_override("font_size", 14)
	_content_vbox.add_child(header)
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	_content_vbox.add_child(row)
	for id in ring_ids:
		var meta: Dictionary = Progression.BUILD_CATALOG.get(id, {})
		if meta.is_empty():
			continue
		row.add_child(_build_card(id, meta))


## Build a single node card. Layout: icon glyph / label / cost /
## state-strip color stripe on the left. State is one of BUILT /
## AVAILABLE / LOCKED inferred from Progression flags + affordability.
func _build_card(id: StringName, meta: Dictionary) -> PanelContainer:
	var state: String = _card_state_for(id, meta)
	var accent: Color
	var accent_label: String
	match state:
		"BUILT":
			accent = Palette.MEADOW
			accent_label = "BUILT"
		"AVAILABLE":
			accent = Palette.HONEY
			accent_label = "AVAILABLE"
		"UNAFFORDABLE":
			accent = Palette.CORAL
			accent_label = "NEEDS MATERIALS"
		_:
			accent = Palette.WARM_STONE
			accent_label = "LOCKED"
	accent = Palette.clamp_happy(accent)
	var card: PanelContainer = PanelContainer.new()
	card.custom_minimum_size = Vector2(_CARD_WIDTH, _CARD_HEIGHT)
	var style: StyleBoxFlat = StyleBoxFlat.new()
	style.bg_color = Palette.PARCHMENT.darkened(0.04)
	style.border_color = accent
	style.border_width_left = 6
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
	card.add_theme_stylebox_override("panel", style)
	var vbox: VBoxContainer = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 2)
	card.add_child(vbox)
	# Top row: glyph + label.
	var top_row: HBoxContainer = HBoxContainer.new()
	top_row.add_theme_constant_override("separation", 6)
	vbox.add_child(top_row)
	var glyph: Label = Label.new()
	glyph.text = String(_ICON.get(id, "◊"))
	glyph.add_theme_color_override("font_color", accent)
	glyph.add_theme_font_size_override("font_size", 18)
	top_row.add_child(glyph)
	var label: Label = Label.new()
	label.text = String(meta.get("label", String(id))).replace("Build ", "")
	label.add_theme_color_override("font_color", Palette.INK)
	label.add_theme_font_size_override("font_size", 13)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top_row.add_child(label)
	# Cost line.
	var cost_lbl: Label = Label.new()
	cost_lbl.text = "Cost: " + _cost_string(meta.get("cost", {}))
	cost_lbl.add_theme_color_override("font_color", Palette.EARTH)
	cost_lbl.add_theme_font_size_override("font_size", 11)
	vbox.add_child(cost_lbl)
	# Labor line.
	var labor_lbl: Label = Label.new()
	labor_lbl.text = "Labor: ~%ds" % int(meta.get("labor", 60.0))
	labor_lbl.add_theme_color_override("font_color", Palette.EARTH)
	labor_lbl.add_theme_font_size_override("font_size", 11)
	vbox.add_child(labor_lbl)
	# State badge.
	var state_lbl: Label = Label.new()
	state_lbl.text = accent_label
	state_lbl.add_theme_color_override("font_color", accent.darkened(0.2))
	state_lbl.add_theme_font_size_override("font_size", 11)
	vbox.add_child(state_lbl)
	return card


func _card_state_for(id: StringName, _meta: Dictionary) -> String:
	# BUILT — specific flags on Progression. MVP covers the two canonical
	# flags; other buildings read as AVAILABLE or LOCKED until the
	# progression autoload grows per-building built bookkeeping.
	if id == Progression.BUILDING_STORAGE_SHED and Progression.storage_built:
		return "BUILT"
	if id == Progression.BUILDING_SPROUTING_BED and Progression.sprouting_built:
		return "BUILT"
	if not Progression.is_unlocked(id):
		return "LOCKED"
	# Unlocked — differentiate AVAILABLE (affordable) from UNAFFORDABLE so
	# the player can see at a glance "I could build this RIGHT NOW" vs
	# "unlocked but I need more materials."
	var cost: Dictionary = _meta.get("cost", {})
	if Progression._can_afford(cost):
		return "AVAILABLE"
	return "UNAFFORDABLE"


func _cost_string(cost: Dictionary) -> String:
	if cost.is_empty():
		return "free"
	var parts: Array[String] = []
	for k in cost.keys():
		parts.append("%d %s" % [int(cost[k]), String(k)])
	return ", ".join(parts)
