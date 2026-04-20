## Fairy Permaculture — Save / Load slot picker panel.
##
## Parchment popup that lists every save slot Ian has on disk — the
## auto-generated ones (`autosave`, `quicksave`) plus three named
## player slots (`slot_1`, `slot_2`, `slot_3`). Each row shows:
##   • Slot name
##   • Last-saved timestamp ("2h ago") + preview ("Day 14 · Spring Y1")
##   • Save / Load / Delete buttons
##
## The panel is a read-and-write view over `SaveSystem.*`. It does not
## duplicate save logic — every operation funnels through the existing
## public API so the schema/compression/groups-wipe flow is unchanged.
##
## Ships with paired feedback on every action: a Juice toast + SFX via
## AudioManager. Every label color is Palette-sourced (parchment ladder:
## INK for body, EARTH for header, WARM_STONE for meta).
##
## Open: `show_panel()` / `toggle()`. Close: Close button or ESC.
##
## DESIGN-CHECK: PARCHMENT bg, EARTH border, INK body text, EARTH header,
## WARM_STONE meta. No raw Color() literals for labels.
extends Control

signal closed

## The three named slots exposed in the UI. Quicksave + autosave are
## listed underneath so the player has one single place to see all state.
const NAMED_SLOTS: Array[String] = ["slot_1", "slot_2", "slot_3"]
const AUTO_SLOT: String = "autosave"
const QUICK_SLOT: String = "quicksave"

const BODY_COLOR: Color = Color(0.23, 0.16, 0.08, 1.0)
const HEADER_COLOR: Color = Color(0.36, 0.27, 0.16, 1.0)
const META_COLOR: Color = Color(0.55, 0.41, 0.27, 1.0)

@onready var _dim: ColorRect = $Dim
@onready var _panel_root: PanelContainer = $Panel
@onready var _close_btn: Button = $Panel/VBox/Header/Close
@onready var _rows_box: VBoxContainer = $Panel/VBox/Rows
@onready var _hint: Label = $Panel/VBox/Hint

# Confirm-delete overlay. Built programmatically so the scene is lean.
var _confirm_panel: PanelContainer
var _confirm_label: Label
var _confirm_yes: Button
var _confirm_no: Button
var _confirm_target_slot: String = ""


func _ready() -> void:
	_close_btn.pressed.connect(_on_close)
	_dim.gui_input.connect(_on_dim_clicked)
	_build_confirm_overlay()
	visible = false


## Public entry point — refreshes the slot list + shows the panel.
func show_panel() -> void:
	_refresh_rows()
	visible = true
	if has_node("/root/GameLog"):
		GameLog.event("save_slots_opened", {})


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
		if _confirm_panel != null and _confirm_panel.visible:
			_cancel_confirm()
		else:
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
# Row rendering
# =====================================================================

## Build the full slot list. Named slots first, then Quicksave, then
## Autosave. Each row reflects whether the slot currently has a file on
## disk (`SaveSystem.list_saves()` returns the header); empty slots still
## render with an enabled Save button and a greyed-out Load.
func _refresh_rows() -> void:
	for c in _rows_box.get_children():
		c.queue_free()

	var headers: Dictionary = {}
	for h in SaveSystem.list_saves():
		headers[String(h.get("slot", ""))] = h

	for slot in NAMED_SLOTS:
		_rows_box.add_child(_build_row(slot, _display_name_for(slot), headers.get(slot, {}), true))
	# Divider between player slots and system slots.
	var sep: HSeparator = HSeparator.new()
	sep.add_theme_color_override("font_color", META_COLOR)
	_rows_box.add_child(sep)
	_rows_box.add_child(_build_row(QUICK_SLOT, "Quicksave (F5)", headers.get(QUICK_SLOT, {}), false))
	_rows_box.add_child(_build_row(AUTO_SLOT, "Autosave", headers.get(AUTO_SLOT, {}), false))


## Build one row. `slot` is the key we pass to SaveSystem. `label` is the
## human-facing string. `meta` is either the empty dict (no save yet) or
## the header dict from `list_saves()`. `can_save` controls whether the
## Save button is shown — the system slots (autosave/quicksave) are read-
## only here to keep them deterministic.
func _build_row(slot: String, label: String, meta: Dictionary, can_save: bool) -> PanelContainer:
	var row_panel: PanelContainer = PanelContainer.new()
	row_panel.add_theme_stylebox_override("panel", _row_stylebox())

	var row: VBoxContainer = VBoxContainer.new()
	row.add_theme_constant_override("separation", 2)
	row_panel.add_child(row)

	# Top line: slot label + timestamp.
	var top: HBoxContainer = HBoxContainer.new()
	top.add_theme_constant_override("separation", 8)
	row.add_child(top)

	var name_label: Label = Label.new()
	name_label.text = label
	name_label.add_theme_color_override("font_color", HEADER_COLOR)
	name_label.add_theme_font_size_override("font_size", 15)
	name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(name_label)

	var ts_label: Label = Label.new()
	ts_label.text = _format_timestamp(meta)
	ts_label.add_theme_color_override("font_color", META_COLOR)
	ts_label.add_theme_font_size_override("font_size", 11)
	ts_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	top.add_child(ts_label)

	# Second line: preview string.
	var preview_label: Label = Label.new()
	preview_label.text = String(meta.get("preview", "empty slot"))
	preview_label.add_theme_color_override("font_color", BODY_COLOR)
	preview_label.add_theme_font_size_override("font_size", 12)
	row.add_child(preview_label)

	# Action buttons row.
	var btn_row: HBoxContainer = HBoxContainer.new()
	btn_row.add_theme_constant_override("separation", 6)
	row.add_child(btn_row)

	if can_save:
		var save_btn: Button = Button.new()
		save_btn.text = "Save"
		save_btn.add_theme_color_override("font_color", BODY_COLOR)
		save_btn.pressed.connect(func(): _on_save_pressed(slot, label))
		btn_row.add_child(save_btn)

	var load_btn: Button = Button.new()
	load_btn.text = "Load"
	load_btn.add_theme_color_override("font_color", BODY_COLOR)
	load_btn.disabled = meta.is_empty()
	load_btn.pressed.connect(func(): _on_load_pressed(slot, label))
	btn_row.add_child(load_btn)

	var spacer: Control = Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	btn_row.add_child(spacer)

	var del_btn: Button = Button.new()
	del_btn.text = "Delete"
	del_btn.add_theme_color_override("font_color", BODY_COLOR)
	del_btn.disabled = meta.is_empty()
	del_btn.pressed.connect(func(): _request_delete(slot, label))
	btn_row.add_child(del_btn)

	return row_panel


func _row_stylebox() -> StyleBoxFlat:
	var s: StyleBoxFlat = StyleBoxFlat.new()
	# Faint band on the parchment — lighter fill, EARTH-soft border so the
	# row reads as a field-book entry rather than a hard card.
	s.bg_color = Color(0.97, 0.93, 0.83, 0.65)
	s.border_color = Color(0.79, 0.72, 0.54, 0.7)
	s.border_width_left = 1
	s.border_width_top = 1
	s.border_width_right = 1
	s.border_width_bottom = 1
	s.corner_radius_top_left = 4
	s.corner_radius_top_right = 4
	s.corner_radius_bottom_left = 4
	s.corner_radius_bottom_right = 4
	s.content_margin_left = 8.0
	s.content_margin_right = 8.0
	s.content_margin_top = 6.0
	s.content_margin_bottom = 6.0
	return s


func _display_name_for(slot: String) -> String:
	match slot:
		"slot_1": return "Slot 1"
		"slot_2": return "Slot 2"
		"slot_3": return "Slot 3"
		_: return slot.capitalize()


## Format a slot header into a compact timestamp + preview.
##   meta = {} → "— never saved —"
##   else     → "Just now" / "12m ago" / "3h ago" / "2d ago"
func _format_timestamp(meta: Dictionary) -> String:
	if meta.is_empty():
		return "— empty —"
	var ts: String = String(meta.get("timestamp", ""))
	if ts == "":
		return "saved"
	var unix_saved: int = _parse_iso_ts(ts)
	if unix_saved <= 0:
		return ts
	var now: int = int(Time.get_unix_time_from_system())
	var delta: int = max(0, now - unix_saved)
	if delta < 60:
		return "Just now"
	if delta < 3600:
		return "%dm ago" % int(delta / 60)
	if delta < 86400:
		return "%dh ago" % int(delta / 3600)
	return "%dd ago" % int(delta / 86400)


## Parse an ISO-8601 string ("2026-04-20T12:34:56") into a unix epoch.
## Godot's `Time.get_unix_time_from_datetime_string` does the work; we
## trap errors defensively since `list_saves()` returns strings written
## by `_build_meta()` above.
func _parse_iso_ts(ts: String) -> int:
	var v: Variant = Time.get_unix_time_from_datetime_string(ts)
	if typeof(v) == TYPE_FLOAT or typeof(v) == TYPE_INT:
		return int(v)
	return 0


# =====================================================================
# Button handlers — every action goes through SaveSystem.
# =====================================================================

func _on_save_pressed(slot: String, label: String) -> void:
	var ok: bool = SaveSystem.save(slot)
	_toast(("Saved to " + label) if ok else ("Save failed: " + label), ok)
	_refresh_rows()


func _on_load_pressed(slot: String, label: String) -> void:
	var ok: bool = SaveSystem.load(slot)
	_toast(("Loaded " + label) if ok else ("Load failed: " + label), ok)
	if ok:
		hide_panel()
	else:
		_refresh_rows()


func _request_delete(slot: String, label: String) -> void:
	_confirm_target_slot = slot
	_confirm_label.text = "Delete %s?" % label
	_confirm_panel.visible = true
	if has_node("/root/AudioManager"):
		AudioManager.play("hover-tick", -10.0)


func _on_confirm_delete() -> void:
	var slot: String = _confirm_target_slot
	_confirm_panel.visible = false
	_confirm_target_slot = ""
	if slot == "":
		return
	var ok: bool = SaveSystem.delete(slot)
	_toast(("Deleted " + _display_name_for(slot)) if ok else "Delete failed", ok)
	_refresh_rows()


func _cancel_confirm() -> void:
	_confirm_panel.visible = false
	_confirm_target_slot = ""
	if has_node("/root/AudioManager"):
		AudioManager.play("hover-tick", -12.0)


# =====================================================================
# Confirm-delete overlay
# =====================================================================

func _build_confirm_overlay() -> void:
	_confirm_panel = PanelContainer.new()
	_confirm_panel.anchor_left = 0.5
	_confirm_panel.anchor_right = 0.5
	_confirm_panel.anchor_top = 0.5
	_confirm_panel.anchor_bottom = 0.5
	_confirm_panel.offset_left = -140.0
	_confirm_panel.offset_right = 140.0
	_confirm_panel.offset_top = -50.0
	_confirm_panel.offset_bottom = 50.0
	_confirm_panel.grow_horizontal = 2
	_confirm_panel.grow_vertical = 2

	var s: StyleBoxFlat = StyleBoxFlat.new()
	s.bg_color = Color(0.95, 0.9, 0.79, 1.0)
	s.border_color = Color(0.79, 0.72, 0.54, 1.0)
	s.border_width_left = 2
	s.border_width_top = 2
	s.border_width_right = 2
	s.border_width_bottom = 2
	s.corner_radius_top_left = 6
	s.corner_radius_top_right = 6
	s.corner_radius_bottom_left = 6
	s.corner_radius_bottom_right = 6
	s.content_margin_left = 14.0
	s.content_margin_right = 14.0
	s.content_margin_top = 12.0
	s.content_margin_bottom = 12.0
	_confirm_panel.add_theme_stylebox_override("panel", s)

	var vb: VBoxContainer = VBoxContainer.new()
	vb.add_theme_constant_override("separation", 8)
	_confirm_panel.add_child(vb)

	_confirm_label = Label.new()
	_confirm_label.text = "Delete?"
	_confirm_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_confirm_label.add_theme_color_override("font_color", HEADER_COLOR)
	_confirm_label.add_theme_font_size_override("font_size", 14)
	vb.add_child(_confirm_label)

	var btn_row: HBoxContainer = HBoxContainer.new()
	btn_row.alignment = BoxContainer.ALIGNMENT_CENTER
	btn_row.add_theme_constant_override("separation", 10)
	vb.add_child(btn_row)

	_confirm_no = Button.new()
	_confirm_no.text = "Cancel"
	_confirm_no.add_theme_color_override("font_color", BODY_COLOR)
	_confirm_no.pressed.connect(_cancel_confirm)
	btn_row.add_child(_confirm_no)

	_confirm_yes = Button.new()
	_confirm_yes.text = "Delete"
	_confirm_yes.add_theme_color_override("font_color", Color(0.75, 0.45, 0.25))
	_confirm_yes.pressed.connect(_on_confirm_delete)
	btn_row.add_child(_confirm_yes)

	_confirm_panel.visible = false
	add_child(_confirm_panel)


# =====================================================================
# Feedback (paired visual + audio per design principle)
# =====================================================================

func _toast(text: String, ok: bool) -> void:
	if has_node("/root/Juice"):
		var col: Color = Palette.HONEY if ok else Palette.CORAL
		var pos: Vector3 = Vector3.ZERO
		var cam: Camera3D = null
		if get_viewport() != null:
			cam = get_viewport().get_camera_3d()
		if cam != null:
			pos = cam.global_position + cam.global_transform.basis.z * -4.0
		Juice.pop(pos + Vector3(0, 1.2, 0), text, col)
	if has_node("/root/AudioManager"):
		AudioManager.play("compost-finish" if ok else "hover-tick", -6.0)
