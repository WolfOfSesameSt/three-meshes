## Fairy Permaculture — audio settings panel.
##
## Parchment popup with three sliders (Master / Music / SFX), per-row
## Mute + Test buttons, and Apply / Cancel / Reset at the bottom.
## Talks to `AudioManager` as its single source of truth for volumes
## and bus routing, and persists on Apply (or on panel close).
##
## Open: `show_panel()`. Close: `hide_panel()` or ESC.
extends Control

const BUS_MASTER := "Master"
const BUS_MUSIC := "Music"
const BUS_SFX := "SFX"

@onready var _dim: ColorRect = $Dim
@onready var _panel_root: PanelContainer = $Panel
@onready var _close_btn: Button = $Panel/VBox/Header/Close
@onready var _master_slider: HSlider = $Panel/VBox/Rows/MasterRow/Slider
@onready var _master_readout: Label = $Panel/VBox/Rows/MasterRow/Readout
@onready var _master_mute: CheckBox = $Panel/VBox/Rows/MasterRow/Mute
@onready var _master_test: Button = $Panel/VBox/Rows/MasterRow/Test
@onready var _music_slider: HSlider = $Panel/VBox/Rows/MusicRow/Slider
@onready var _music_readout: Label = $Panel/VBox/Rows/MusicRow/Readout
@onready var _music_mute: CheckBox = $Panel/VBox/Rows/MusicRow/Mute
@onready var _music_test: Button = $Panel/VBox/Rows/MusicRow/Test
@onready var _sfx_slider: HSlider = $Panel/VBox/Rows/SfxRow/Slider
@onready var _sfx_readout: Label = $Panel/VBox/Rows/SfxRow/Readout
@onready var _sfx_mute: CheckBox = $Panel/VBox/Rows/SfxRow/Mute
@onready var _sfx_test: Button = $Panel/VBox/Rows/SfxRow/Test
@onready var _reset_btn: Button = $Panel/VBox/Footer/Reset
@onready var _cancel_btn: Button = $Panel/VBox/Footer/Cancel
@onready var _apply_btn: Button = $Panel/VBox/Footer/Apply

# Snapshot of the state we opened with — used for Cancel.
var _snapshot: Dictionary = {}


func _ready() -> void:
	_close_btn.pressed.connect(_on_cancel)
	_cancel_btn.pressed.connect(_on_cancel)
	_apply_btn.pressed.connect(_on_apply)
	_reset_btn.pressed.connect(_on_reset)

	_master_slider.value_changed.connect(func(v): _on_slider_changed(BUS_MASTER, v))
	_music_slider.value_changed.connect(func(v): _on_slider_changed(BUS_MUSIC, v))
	_sfx_slider.value_changed.connect(func(v): _on_slider_changed(BUS_SFX, v))

	_master_mute.toggled.connect(func(on): _on_mute_toggled(BUS_MASTER, on))
	_music_mute.toggled.connect(func(on): _on_mute_toggled(BUS_MUSIC, on))
	_sfx_mute.toggled.connect(func(on): _on_mute_toggled(BUS_SFX, on))

	_master_test.pressed.connect(func(): AudioManager.play_test(BUS_MASTER))
	_music_test.pressed.connect(func(): AudioManager.play_test(BUS_MUSIC))
	_sfx_test.pressed.connect(func(): AudioManager.play_test(BUS_SFX))

	# Click-outside-to-close: dim overlay eats clicks that fall outside
	# the parchment panel.
	_dim.gui_input.connect(_on_dim_clicked)

	visible = false


## Public entry point — shows the panel and syncs the sliders from the
## live AudioManager state so the user sees the current volumes.
func show_panel() -> void:
	_snapshot = {
		BUS_MASTER: { "vol": AudioManager.get_bus_volume(BUS_MASTER), "mute": AudioManager.is_bus_muted(BUS_MASTER) },
		BUS_MUSIC:  { "vol": AudioManager.get_bus_volume(BUS_MUSIC), "mute": AudioManager.is_bus_muted(BUS_MUSIC) },
		BUS_SFX:    { "vol": AudioManager.get_bus_volume(BUS_SFX), "mute": AudioManager.is_bus_muted(BUS_SFX) },
	}
	_sync_controls_from_manager()
	visible = true
	GameLog.event("settings_opened", {})


func hide_panel() -> void:
	visible = false


func toggle() -> void:
	if visible:
		_on_cancel()
	else:
		show_panel()


func _input(event: InputEvent) -> void:
	if not visible:
		return
	if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		_on_cancel()
		accept_event()


func _on_dim_clicked(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		# Only treat as outside-click if the press did not land inside
		# the parchment panel's rect.
		var mb: InputEventMouseButton = event
		if not _panel_root.get_global_rect().has_point(mb.global_position):
			_on_cancel()


# ---------- Control ↔ manager sync ----------

func _sync_controls_from_manager() -> void:
	# Set slider values without firing the value_changed signal so we
	# don't re-trigger AudioManager writes on open.
	_set_slider_silent(_master_slider, AudioManager.get_bus_volume(BUS_MASTER))
	_set_slider_silent(_music_slider, AudioManager.get_bus_volume(BUS_MUSIC))
	_set_slider_silent(_sfx_slider, AudioManager.get_bus_volume(BUS_SFX))
	_set_check_silent(_master_mute, AudioManager.is_bus_muted(BUS_MASTER))
	_set_check_silent(_music_mute, AudioManager.is_bus_muted(BUS_MUSIC))
	_set_check_silent(_sfx_mute, AudioManager.is_bus_muted(BUS_SFX))
	_refresh_readouts()


func _set_slider_silent(slider: HSlider, v: float) -> void:
	slider.set_block_signals(true)
	slider.value = clamp(v, 0.0, 100.0)
	slider.set_block_signals(false)


func _set_check_silent(box: CheckBox, on: bool) -> void:
	box.set_block_signals(true)
	box.button_pressed = on
	box.set_block_signals(false)


func _refresh_readouts() -> void:
	_master_readout.text = "%03d / 100" % int(_master_slider.value)
	_music_readout.text = "%03d / 100" % int(_music_slider.value)
	_sfx_readout.text = "%03d / 100" % int(_sfx_slider.value)


# ---------- Event handlers ----------

func _on_slider_changed(bus: String, v: float) -> void:
	AudioManager.set_bus_volume(bus, v)
	_refresh_readouts()
	GameLog.event("volume_changed", { "bus": bus.to_lower(), "value": int(v) })


func _on_mute_toggled(bus: String, on: bool) -> void:
	AudioManager.set_bus_muted(bus, on)
	GameLog.event("mute_toggled", { "bus": bus.to_lower(), "muted": on })


func _on_reset() -> void:
	AudioManager.reset_to_defaults()
	_sync_controls_from_manager()
	GameLog.event("settings_reset", {})


func _on_apply() -> void:
	AudioManager.save_settings()
	hide_panel()


func _on_cancel() -> void:
	# Revert whatever the user twiddled since opening.
	for bus in _snapshot.keys():
		AudioManager.set_bus_volume(bus, _snapshot[bus]["vol"])
		AudioManager.set_bus_muted(bus, _snapshot[bus]["mute"])
	hide_panel()
