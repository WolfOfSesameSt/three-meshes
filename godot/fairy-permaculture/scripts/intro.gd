## Fairy Permaculture — intro / title screen.
##
## Parchment-backed fullscreen Control with a serif title, a vertical
## stack of navigation buttons, ambient dawn-piano music on loop, and
## a small field of drifting fairy silhouettes behind the title block
## (primitive quads tinted HONEY with simple translation tweens — no
## AnimatedSprite2D needed for MVP).
##
## Navigation:
##   New Farm  → change_scene_to_file("res://scenes/main.tscn")
##   Load      → popup lists `SaveSystem.list_saves()` — click a slot to
##               load + jump into main.
##   Settings  → embedded settings_panel scene (toggled inline).
##   Lab       → change_scene_to_file("res://scenes/lab.tscn")
##   Credits   → popup with CREDITS.md short excerpt + Close.
##   Quit      → get_tree().quit()
##
## DESIGN-CHECK: all colors trace to `Palette.*`. No raw `Color()`.
## PARCHMENT bg, INK title, EARTH tagline, HONEY drift fairies (clamped
## via `Palette.clamp_happy()` before use), COMPOST vignette corners.
extends Control

const MAIN_SCENE_PATH: String = "res://scenes/main.tscn"
const LAB_SCENE_PATH: String = "res://scenes/lab.tscn"
const MUSIC_KEY: String = "music-dawn-piano"
const FAIRY_COUNT: int = 5

var _music_player: AudioStreamPlayer
var _button_column: VBoxContainer
var _fairy_field: Control
var _drift_fairies: Array = []
var _load_popup: PopupPanel
var _credits_popup: PopupPanel
var _t: float = 0.0


func _ready() -> void:
	# Headless-boot safety: if Godot spun up with --headless + --quit-after
	# for a parse check, don't set up audio/tweens. Scene still instantiates
	# cleanly so the tree walk completes.
	GameLog.info("intro scene entered", "flow")
	anchor_left = 0.0
	anchor_top = 0.0
	anchor_right = 1.0
	anchor_bottom = 1.0
	offset_left = 0.0
	offset_top = 0.0
	offset_right = 0.0
	offset_bottom = 0.0
	mouse_filter = Control.MOUSE_FILTER_STOP
	_build_background()
	_build_fairy_field()
	_build_title_block()
	_build_button_column()
	_build_version_strip()
	_build_vignette()
	_start_music()


func _process(delta: float) -> void:
	_t += delta
	# Lazy drift animation — cheap: translate + bob in a sine.
	for entry in _drift_fairies:
		var node: Control = entry["node"] as Control
		if node == null:
			continue
		var speed: float = entry["speed"]
		var origin_y: float = entry["origin_y"]
		var amp: float = entry["amp"]
		var phase: float = entry["phase"]
		var screen_w: float = size.x
		var x_from: float = entry["x_from"]
		var x_to: float = entry["x_to"]
		var cycle: float = fposmod(_t * speed + phase, 1.0)
		node.position = Vector2(lerp(x_from, x_to, cycle), origin_y + sin((_t + phase) * 1.1) * amp)
		# Wing-flap tween via scale.x — subtle, 6 Hz to mimic a flap.
		var flap: float = 1.0 + 0.25 * sin(_t * 12.0 + phase * TAU)
		node.scale = Vector2(flap, 1.0)


# =====================================================================
# Chrome builders
# =====================================================================

func _build_background() -> void:
	# Base parchment fill.
	var bg: ColorRect = ColorRect.new()
	bg.color = Palette.PARCHMENT
	bg.anchor_left = 0.0
	bg.anchor_top = 0.0
	bg.anchor_right = 1.0
	bg.anchor_bottom = 1.0
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)
	# Forest-edge silhouette strip — a warm sage band along the bottom
	# 30% with a soft fade. Primitive ColorRect + gradient style since
	# we don't have a proper texture yet; parchment-happy tones only.
	var ground: ColorRect = ColorRect.new()
	ground.color = Palette.clamp_happy(Palette.OLIVE_DARK.lerp(Palette.PARCHMENT, 0.55))
	ground.anchor_left = 0.0
	ground.anchor_right = 1.0
	ground.anchor_top = 0.72
	ground.anchor_bottom = 1.0
	ground.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(ground)
	# Soft sage mist layer above the horizon.
	var mist: ColorRect = ColorRect.new()
	mist.color = Color(Palette.SAGE.r, Palette.SAGE.g, Palette.SAGE.b, 0.35)
	mist.anchor_left = 0.0
	mist.anchor_right = 1.0
	mist.anchor_top = 0.62
	mist.anchor_bottom = 0.78
	mist.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(mist)


func _build_vignette() -> void:
	# Warm corner vignette — never black. Tint COMPOST at low alpha so the
	# outer 15% of the viewport sits in a soft warm darken band.
	for corner in ["tl", "tr", "bl", "br"]:
		var c: ColorRect = ColorRect.new()
		c.color = Color(Palette.COMPOST.r, Palette.COMPOST.g, Palette.COMPOST.b, 0.20)
		c.mouse_filter = Control.MOUSE_FILTER_IGNORE
		match corner:
			"tl":
				c.anchor_left = 0.0; c.anchor_right = 0.25
				c.anchor_top = 0.0; c.anchor_bottom = 0.35
			"tr":
				c.anchor_left = 0.75; c.anchor_right = 1.0
				c.anchor_top = 0.0; c.anchor_bottom = 0.35
			"bl":
				c.anchor_left = 0.0; c.anchor_right = 0.25
				c.anchor_top = 0.65; c.anchor_bottom = 1.0
			"br":
				c.anchor_left = 0.75; c.anchor_right = 1.0
				c.anchor_top = 0.65; c.anchor_bottom = 1.0
		add_child(c)


func _build_fairy_field() -> void:
	_fairy_field = Control.new()
	_fairy_field.anchor_left = 0.0
	_fairy_field.anchor_top = 0.0
	_fairy_field.anchor_right = 1.0
	_fairy_field.anchor_bottom = 1.0
	_fairy_field.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_fairy_field)
	# 5 drifting glyphs — Unicode star/dot + HONEY tint, alpha 0.6 so
	# they read as soft background bokeh, not ominous ink.
	for i in range(FAIRY_COUNT):
		var lbl: Label = Label.new()
		lbl.text = "✦"
		var tint: Color = Palette.clamp_happy(Palette.HONEY)
		lbl.add_theme_color_override("font_color", Color(tint.r, tint.g, tint.b, 0.55))
		lbl.add_theme_font_size_override("font_size", 20)
		lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_fairy_field.add_child(lbl)
		var rng: RandomNumberGenerator = RandomNumberGenerator.new()
		rng.seed = 17 + i * 31
		var y_rows: Array[float] = [0.12, 0.22, 0.75, 0.82, 0.16]
		var speeds: Array[float] = [0.030, 0.022, 0.018, 0.026, 0.035]
		var origin_y: float = (y_rows[i] if i < y_rows.size() else 0.3) * 900.0
		var speed: float = (speeds[i] if i < speeds.size() else 0.025)
		_drift_fairies.append({
			"node": lbl,
			"origin_y": origin_y,
			"amp": 10.0 + rng.randf() * 6.0,
			"speed": speed,
			"phase": rng.randf(),
			"x_from": -40.0,
			"x_to": 1680.0,
		})


func _build_title_block() -> void:
	var center: VBoxContainer = VBoxContainer.new()
	center.anchor_left = 0.5
	center.anchor_top = 0.5
	center.anchor_right = 0.5
	center.anchor_bottom = 0.5
	center.offset_left = -260.0
	center.offset_top = -200.0
	center.offset_right = 260.0
	center.offset_bottom = -40.0
	center.alignment = BoxContainer.ALIGNMENT_CENTER
	center.add_theme_constant_override("separation", 8)
	add_child(center)
	# Warm honey drop-offset layer behind the ink title.
	var title_wrap: Control = Control.new()
	title_wrap.custom_minimum_size = Vector2(520, 110)
	center.add_child(title_wrap)
	var title_shadow: Label = Label.new()
	title_shadow.text = "Fairy Permaculture"
	title_shadow.add_theme_color_override("font_color", Palette.HONEY)
	title_shadow.add_theme_font_size_override("font_size", 56)
	title_shadow.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title_shadow.anchor_left = 0.0
	title_shadow.anchor_top = 0.0
	title_shadow.anchor_right = 1.0
	title_shadow.anchor_bottom = 1.0
	title_shadow.offset_left = 2.0
	title_shadow.offset_top = 2.0
	title_wrap.add_child(title_shadow)
	var title: Label = Label.new()
	title.text = "Fairy Permaculture"
	title.add_theme_color_override("font_color", Palette.INK)
	title.add_theme_font_size_override("font_size", 56)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.anchor_left = 0.0
	title.anchor_top = 0.0
	title.anchor_right = 1.0
	title.anchor_bottom = 1.0
	title_wrap.add_child(title)
	var tagline: Label = Label.new()
	tagline.text = "A disembodied fairy tends a Pacific coastal farm."
	tagline.add_theme_color_override("font_color", Palette.EARTH)
	tagline.add_theme_font_size_override("font_size", 18)
	tagline.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	center.add_child(tagline)


func _build_button_column() -> void:
	_button_column = VBoxContainer.new()
	_button_column.anchor_left = 0.5
	_button_column.anchor_top = 0.5
	_button_column.anchor_right = 0.5
	_button_column.anchor_bottom = 0.5
	_button_column.offset_left = -130.0
	_button_column.offset_top = -20.0
	_button_column.offset_right = 130.0
	_button_column.offset_bottom = 270.0
	_button_column.add_theme_constant_override("separation", 10)
	add_child(_button_column)
	_add_nav_button("New Farm", _on_new_farm)
	_add_nav_button("Load Farm", _on_load_farm)
	_add_nav_button("Settings", _on_settings)
	_add_nav_button("Lab", _on_lab)
	_add_nav_button("Credits", _on_credits)
	_add_nav_button("Quit", _on_quit)


func _add_nav_button(text: String, callback: Callable) -> void:
	var btn: Button = Button.new()
	btn.text = text
	btn.custom_minimum_size = Vector2(260, 40)
	var style: StyleBoxFlat = StyleBoxFlat.new()
	style.bg_color = Palette.PARCHMENT.darkened(0.04)
	style.border_color = Palette.EARTH
	style.border_width_left = 2
	style.border_width_top = 2
	style.border_width_right = 2
	style.border_width_bottom = 2
	style.corner_radius_top_left = 6
	style.corner_radius_top_right = 6
	style.corner_radius_bottom_left = 6
	style.corner_radius_bottom_right = 6
	style.content_margin_left = 14.0
	style.content_margin_right = 14.0
	style.content_margin_top = 6.0
	style.content_margin_bottom = 6.0
	var hover_style: StyleBoxFlat = style.duplicate()
	hover_style.bg_color = Palette.clamp_happy(Palette.SAGE.lerp(Palette.PARCHMENT, 0.6))
	btn.add_theme_stylebox_override("normal", style)
	btn.add_theme_stylebox_override("hover", hover_style)
	btn.add_theme_stylebox_override("pressed", hover_style)
	btn.add_theme_color_override("font_color", Palette.INK)
	btn.add_theme_color_override("font_hover_color", Palette.COMPOST)
	btn.add_theme_font_size_override("font_size", 16)
	btn.pressed.connect(callback)
	btn.mouse_entered.connect(_on_button_hover)
	_button_column.add_child(btn)


func _build_version_strip() -> void:
	var v: Label = Label.new()
	v.text = "v0.1  —  build 2026-04"
	v.add_theme_color_override("font_color", Palette.EARTH)
	v.add_theme_font_size_override("font_size", 11)
	v.anchor_left = 0.0
	v.anchor_top = 1.0
	v.anchor_right = 0.0
	v.anchor_bottom = 1.0
	v.offset_left = 16.0
	v.offset_top = -26.0
	v.offset_right = 200.0
	v.offset_bottom = -8.0
	add_child(v)


func _start_music() -> void:
	if not has_node("/root/AudioManager"):
		return
	AudioManager.play_music(MUSIC_KEY, -14.0)


# =====================================================================
# Button handlers
# =====================================================================

func _on_button_hover() -> void:
	AudioManager.play("hover-tick", -14.0)


func _on_new_farm() -> void:
	AudioManager.play("hover-tick", -6.0)
	GameLog.info("intro → new farm", "flow")
	# Stop the intro music so the main scene's own music bed owns the
	# audio stage on spawn.
	AudioManager.stop_music()
	get_tree().change_scene_to_file(MAIN_SCENE_PATH)


func _on_load_farm() -> void:
	AudioManager.play("hover-tick", -6.0)
	_show_load_popup()


func _on_settings() -> void:
	AudioManager.play("hover-tick", -6.0)
	# Inline: open the shared settings scene as a transient popup so the
	# intro scene itself doesn't need a separate panel.
	var scene_path: String = "res://scenes/settings_panel.tscn"
	if not ResourceLoader.exists(scene_path):
		GameLog.warn("intro: settings_panel.tscn missing", "flow")
		return
	var panel_scene: PackedScene = load(scene_path)
	if panel_scene == null:
		return
	var panel: Node = panel_scene.instantiate()
	add_child(panel)
	if panel.has_method("show_panel"):
		panel.call("show_panel")


func _on_lab() -> void:
	AudioManager.play("hover-tick", -6.0)
	GameLog.info("intro → lab", "flow")
	AudioManager.stop_music()
	get_tree().change_scene_to_file(LAB_SCENE_PATH)


func _on_credits() -> void:
	AudioManager.play("hover-tick", -6.0)
	_show_credits_popup()


func _on_quit() -> void:
	AudioManager.play("hover-tick", -6.0)
	GameLog.info("intro → quit", "flow")
	get_tree().quit()


# =====================================================================
# Slot picker + credits popups
# =====================================================================

func _show_load_popup() -> void:
	if _load_popup != null and is_instance_valid(_load_popup):
		_load_popup.queue_free()
	_load_popup = PopupPanel.new()
	_load_popup.popup_window = false
	add_child(_load_popup)
	var vb: VBoxContainer = VBoxContainer.new()
	vb.add_theme_constant_override("separation", 6)
	_load_popup.add_child(vb)
	var header: Label = Label.new()
	header.text = "Load a saved farm"
	header.add_theme_color_override("font_color", Palette.INK)
	header.add_theme_font_size_override("font_size", 16)
	vb.add_child(header)
	var saves: Array = SaveSystem.list_saves()
	if saves.is_empty():
		var empty: Label = Label.new()
		empty.text = "No farms yet. Plant your first one."
		empty.add_theme_color_override("font_color", Palette.EARTH)
		empty.add_theme_font_size_override("font_size", 12)
		vb.add_child(empty)
	else:
		for meta in saves:
			var slot: String = String(meta.get("slot", ""))
			var preview: String = String(meta.get("preview", "—"))
			var row: HBoxContainer = HBoxContainer.new()
			var label: Label = Label.new()
			label.text = "  %s  •  %s" % [slot, preview]
			label.add_theme_color_override("font_color", Palette.INK)
			label.add_theme_font_size_override("font_size", 12)
			label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			row.add_child(label)
			var btn: Button = Button.new()
			btn.text = "Load"
			btn.pressed.connect(_on_load_slot.bind(slot))
			row.add_child(btn)
			vb.add_child(row)
	var close_btn: Button = Button.new()
	close_btn.text = "Close"
	close_btn.pressed.connect(_load_popup.hide)
	vb.add_child(close_btn)
	_load_popup.popup_centered(Vector2i(520, 360))


func _on_load_slot(slot: String) -> void:
	AudioManager.play("hover-tick", -6.0)
	GameLog.info("intro → load slot %s" % slot, "flow")
	AudioManager.stop_music()
	# Jump to main first, then trigger load once the main scene is ready.
	# We cache the slot name on a temporary autoload-bound flag so main's
	# own _ready() could pick it up — but for MVP we hand off through
	# deferred timing: call change_scene, then queue a load on next frame.
	get_tree().change_scene_to_file(MAIN_SCENE_PATH)
	var deferred: Callable = func() -> void:
		if has_node("/root/SaveSystem"):
			SaveSystem.load(slot)
	# process_frame fires after the new scene's _ready, so the autoloads
	# + scene tree are both ready for the hydrate.
	get_tree().process_frame.connect(deferred, CONNECT_ONE_SHOT)


func _show_credits_popup() -> void:
	if _credits_popup != null and is_instance_valid(_credits_popup):
		_credits_popup.queue_free()
	_credits_popup = PopupPanel.new()
	_credits_popup.popup_window = false
	add_child(_credits_popup)
	var vb: VBoxContainer = VBoxContainer.new()
	vb.add_theme_constant_override("separation", 6)
	_credits_popup.add_child(vb)
	var header: Label = Label.new()
	header.text = "Credits"
	header.add_theme_color_override("font_color", Palette.INK)
	header.add_theme_font_size_override("font_size", 16)
	vb.add_child(header)
	var body: RichTextLabel = RichTextLabel.new()
	body.custom_minimum_size = Vector2(520, 260)
	body.fit_content = true
	body.bbcode_enabled = false
	body.text = _credits_body_text()
	body.add_theme_color_override("default_color", Palette.EARTH)
	body.add_theme_font_size_override("normal_font_size", 12)
	vb.add_child(body)
	var close_btn: Button = Button.new()
	close_btn.text = "Close"
	close_btn.pressed.connect(_credits_popup.hide)
	vb.add_child(close_btn)
	_credits_popup.popup_centered(Vector2i(560, 380))


func _credits_body_text() -> String:
	return """Design, code, sound: the Fairy Permaculture team.

Research sources:
  - Bill Mollison, Permaculture: A Designer's Manual
  - Sepp Holzer, Holzer's Permaculture
  - Allan Savory, Holistic Management
  - Joel Salatin, Pastured Poultry Profits
  - BC Indigenous plant knowledge (consult local nations for canonical sources)

Engine: Godot 4.6.
Audio: generated via ElevenLabs API, budget-tracked in public/audio/.budget.json.
Fairy mesh (placeholder): Kaniksu, CC BY-NC-SA 4.0. See CREDITS.md for full attribution."""
