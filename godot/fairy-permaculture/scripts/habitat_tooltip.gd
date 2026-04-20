## Fairy Permaculture — habitat hover tooltip.
##
## Small parchment card that follows the cursor while the player hovers
## a wildlife-habitat placeable. Lists every species that habitat
## attracts and visually distinguishes who's currently present.
##
## Content model (driven by HabitatTooltipData.build):
##   • Header  — habitat display name (e.g. "Owl Box")
##   • Sub     — "Home of:" lead-in line
##   • List    — one row per species
##       ✓ Barn Owl          (present — bold, INK)
##       · Garter Snake      (not yet — meta tone, EARTH-muted)
##   • Drains  — optional "Drains: rodent, slug" footer when a present
##              predator is knocking pest pressure down
##
## Readability rules (non-negotiable):
##   All labels set `theme_override_colors/font_color` either in the
##   `.tscn` (for static rows) or via `add_theme_color_override` before
##   `add_child` (for dynamically-created species rows). White-on-cream
##   failure mode: never again.
##
## Palette usage:
##   Parchment stylebox mirrors `compost_panel.tscn` for visual unity
##   (raw cream + brown border — Ian-approved exception inherited from
##   the compost panel pattern). Species-row font colors trace to the
##   parchment-text ladder:
##     body    = Color(0.23, 0.16, 0.08, 1)   — INK-equivalent
##     header  = Color(0.36, 0.27, 0.16, 1)   — COMPOST-equivalent
##     meta    = Color(0.55, 0.41, 0.27, 1)   — EARTH-equivalent
##   The "present" species also get a honey-tinted glyph so color isn't
##   the only state carrier (✓ vs · glyph + bold weight + tone).
extends Control

## Preload the data helper rather than rely on the `class_name` cache.
## Avoids a cold-boot parse race where main.tscn loads habitat_tooltip
## before Godot has resolved class_name "HabitatTooltipData".
const HabitatTooltipData = preload("res://scripts/habitat_tooltip_data.gd")

const PRESENT_GLYPH: String = "✓"
const ABSENT_GLYPH: String = "·"

# Parchment-text ladder (mirrors compost_panel.tscn + the canonical
# ladder locked in feedback_ui_text_contrast.md). Each constant is
# INK/COMPOST/EARTH-equivalent but pinned locally so the tooltip reads
# identically whether Palette has been edited or not.
const BODY_COLOR: Color = Color(0.23, 0.16, 0.08, 1.0)
const HEADER_COLOR: Color = Color(0.36, 0.27, 0.16, 1.0)
const META_COLOR: Color = Color(0.55, 0.41, 0.27, 1.0)

# Cursor offset so the tooltip tucks to the lower-right of the mouse
# without sitting on top of the rim-hover glint.
const CURSOR_OFFSET: Vector2 = Vector2(16, 14)

# Fade-in duration. Kept under 150 ms so reduced-motion respects the
# feel without requiring a separate flag path (settings hasn't exposed
# one yet). When the flag lands, gate this entire tween on it.
const FADE_IN_S: float = 0.10

@onready var _panel: PanelContainer = $Panel
@onready var _header: Label = $Panel/VBox/Header
@onready var _sub_header: Label = $Panel/VBox/SubHeader
@onready var _species_list: VBoxContainer = $Panel/VBox/SpeciesList
@onready var _drains: Label = $Panel/VBox/Drains
@onready var _drains_sep: HSeparator = $Panel/VBox/Sep

var _current_tag: String = ""
var _tracked_habitat: Node = null
var _fade_tween: Tween


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	top_level = true
	visible = false
	modulate.a = 0.0
	# Subscribe to live wildlife changes so a newly-arrived cohort pops
	# from "·" to "✓" without the player re-hovering.
	var wl: Node = get_node_or_null("/root/Wildlife")
	if wl != null:
		if wl.has_signal("species_arrived"):
			wl.species_arrived.connect(_on_species_arrived)
		if wl.has_signal("species_departed"):
			wl.species_departed.connect(_on_species_departed)


func _process(_delta: float) -> void:
	if not visible:
		return
	# Anchor near the cursor. Uses the viewport mouse so the tooltip
	# tracks 1:1 even as the camera pans under it.
	var mp: Vector2 = get_viewport().get_mouse_position()
	var target: Vector2 = mp + CURSOR_OFFSET
	# Clamp inside the viewport so the tooltip never clips off-screen.
	var vp: Vector2 = get_viewport_rect().size
	var size_px: Vector2 = _panel.size
	if target.x + size_px.x > vp.x:
		target.x = mp.x - size_px.x - CURSOR_OFFSET.x
	if target.y + size_px.y > vp.y:
		target.y = mp.y - size_px.y - CURSOR_OFFSET.y
	_panel.position = target.max(Vector2.ZERO)


# =============================================================
# Public API — called from main.gd hover handler.
# =============================================================

## Show the tooltip anchored near the cursor for `habitat_node`. The node
## must be in group `wildlife_habitats`. Pulls species list from
## HabitatTooltipData.build(tag) where `tag` is derived from the node's
## group membership.
func show_for(habitat_node: Node) -> void:
	if habitat_node == null:
		hide_tooltip()
		return
	var tag: String = HabitatTooltipData.tag_from_node(habitat_node)
	if tag == "":
		hide_tooltip()
		return
	_current_tag = tag
	_tracked_habitat = habitat_node
	_populate(tag)
	visible = true
	# Short fade so the card doesn't pop harshly under the cursor.
	if _fade_tween != null and _fade_tween.is_valid():
		_fade_tween.kill()
	modulate.a = 0.0
	_fade_tween = create_tween()
	_fade_tween.tween_property(self, "modulate:a", 1.0, FADE_IN_S) \
		.set_trans(Tween.TRANS_SINE)


func hide_tooltip() -> void:
	_current_tag = ""
	_tracked_habitat = null
	if _fade_tween != null and _fade_tween.is_valid():
		_fade_tween.kill()
	visible = false
	modulate.a = 0.0


# =============================================================
# Populate the card from the HabitatTooltipData payload.
# =============================================================

func _populate(tag: String) -> void:
	var data: Dictionary = HabitatTooltipData.build(tag)
	_header.text = String(data.get("display_name", "Habitat"))
	_header.add_theme_color_override("font_color", HEADER_COLOR)

	_sub_header.text = "Home of:"
	_sub_header.add_theme_color_override("font_color", META_COLOR)

	# Wipe + rebuild the species list.
	for child in _species_list.get_children():
		child.queue_free()

	var attracted: Array = data.get("attracted", [])
	if attracted.is_empty():
		var empty_row: Label = Label.new()
		empty_row.text = "  (no species)"
		empty_row.add_theme_color_override("font_color", META_COLOR)
		empty_row.add_theme_font_size_override("font_size", 11)
		_species_list.add_child(empty_row)
	else:
		for entry in attracted:
			_species_list.add_child(_make_species_row(entry))

	# Drains footer — only visible when at least one predator is
	# currently eating pest pressure.
	var drains: Array = data.get("drains", [])
	if drains.size() > 0:
		_drains.text = "Drains: %s" % ", ".join(PackedStringArray(drains))
		_drains.add_theme_color_override("font_color", META_COLOR)
		_drains.visible = true
		_drains_sep.visible = true
	else:
		_drains.visible = false
		_drains_sep.visible = false

	# Force a layout pass so _panel.size reflects the new content before
	# _process next anchors it.
	_panel.reset_size()


func _make_species_row(entry: Dictionary) -> Label:
	var present: bool = bool(entry.get("present", false))
	var name: String = String(entry.get("name", entry.get("id", "?")))
	var glyph: String = PRESENT_GLYPH if present else ABSENT_GLYPH
	var row: Label = Label.new()
	row.text = "%s %s" % [glyph, name]
	# Readability rule: set font_color BEFORE add_child.
	if present:
		# Present species get the full-body INK tone for max contrast +
		# are effectively "bold" by living in the darker ladder tier.
		row.add_theme_color_override("font_color", BODY_COLOR)
	else:
		# Not-yet-arrived species get the muted meta tone so the
		# present-vs-absent distinction reads at a glance.
		row.add_theme_color_override("font_color", META_COLOR)
	row.add_theme_font_size_override("font_size", 12)
	return row


# =============================================================
# Live cohort updates — refresh while hovered.
# =============================================================

func _on_species_arrived(_id: String, _pos: Vector3, _count: int) -> void:
	_refresh_if_open()


func _on_species_departed(_id: String, _pos: Vector3) -> void:
	_refresh_if_open()


func _refresh_if_open() -> void:
	# Rebuild from scratch whenever a cohort changes state while the
	# tooltip is visible. Cheap — a handful of labels.
	if not visible or _current_tag == "":
		return
	if _tracked_habitat != null and not is_instance_valid(_tracked_habitat):
		hide_tooltip()
		return
	_populate(_current_tag)
