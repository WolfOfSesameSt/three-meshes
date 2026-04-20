## Headless-ish screenshot tool for the six water variations.
##
## Instantiates water_preview.gd with each variation id, waits a few
## frames for shader uniforms + animation to settle, then writes a PNG
## to `logs/shots/water-<id>.png`. Intended to run via:
##
##     godot --path . scenes/debug/screenshot_water.tscn
##
## Exits on its own when all variations have been captured.
extends Node3D

const WATER_PREVIEW := preload("res://scripts/lab_previews/water_preview.gd")

const VARIATIONS: Array[String] = [
	"classic", "toon_banded", "painted_ripple",
	"anime_low_poly", "reflective_glass", "ghibli_stream"
]

const SHOTS_DIR := "res://logs/shots"
const FRAMES_BETWEEN := 6

@onready var _viewport: SubViewport = $Sub
@onready var _stage: Node3D = $Sub/Stage
@onready var _camera: Camera3D = $Sub/Stage/Rig/Camera

var _current_idx: int = -1
var _countdown: int = 0
var _current_preview: Node3D = null


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(SHOTS_DIR))
	get_tree().get_root().size = Vector2i(1200, 800)
	_advance()


func _process(_delta: float) -> void:
	if _current_idx < 0 or _current_idx >= VARIATIONS.size():
		return
	_countdown -= 1
	if _countdown <= 0:
		_capture_and_advance()


func _advance() -> void:
	_current_idx += 1
	if _current_idx >= VARIATIONS.size():
		print("[shot] done — all %d water variations captured" % VARIATIONS.size())
		get_tree().quit()
		return
	if _current_preview != null:
		_stage.remove_child(_current_preview)
		_current_preview.free()  # immediate — no stacking
		_current_preview = null
	_current_preview = WATER_PREVIEW.new()
	_stage.add_child(_current_preview)
	var entity: Dictionary = {"id": VARIATIONS[_current_idx]}
	_current_preview.call("setup", entity, "")
	_countdown = FRAMES_BETWEEN
	print("[shot] rendering %s ..." % VARIATIONS[_current_idx])


func _capture_and_advance() -> void:
	await RenderingServer.frame_post_draw
	var img: Image = _viewport.get_texture().get_image()
	var out_path: String = "%s/water-%s.png" % [SHOTS_DIR, VARIATIONS[_current_idx]]
	var err: int = img.save_png(out_path)
	if err == OK:
		var sample_center: Color = img.get_pixel(img.get_width() / 2, img.get_height() / 2)
		var sample_pond: Color = img.get_pixel(img.get_width() / 3, img.get_height() / 2)
		print("[shot] saved %s | center rgb=(%.2f, %.2f, %.2f) pond rgb=(%.2f, %.2f, %.2f)" % [
			out_path.get_file(),
			sample_center.r, sample_center.g, sample_center.b,
			sample_pond.r, sample_pond.g, sample_pond.b
		])
	else:
		push_warning("[shot] save_png failed err=%d for %s" % [err, out_path])
	_advance()
