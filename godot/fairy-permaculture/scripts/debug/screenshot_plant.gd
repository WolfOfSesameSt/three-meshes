## One-shot plant preview screenshot so we can see what's actually
## rendering for non-water entities.
extends Node3D

const PLANT_PREVIEW := preload("res://scripts/lab_previews/plant_preview.gd")
const SHOTS_DIR := "res://logs/shots"
const FRAMES_BETWEEN := 6

@onready var _viewport: SubViewport = $Sub
@onready var _stage: Node3D = $Sub/Stage

var _countdown: int = 0
var _current: Node3D = null


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(SHOTS_DIR))
	_current = PLANT_PREVIEW.new()
	_stage.add_child(_current)
	var entity: Dictionary = {
		"id": "blueberry-highbush",
		"category": "berries",
		"growth_stages": ["seed", "juvenile", "mature", "flowering", "fruiting"]
	}
	_current.call("setup", entity, "fruiting")
	_countdown = FRAMES_BETWEEN


func _process(_d: float) -> void:
	_countdown -= 1
	if _countdown == 0:
		_shoot()


func _shoot() -> void:
	await RenderingServer.frame_post_draw
	var img: Image = _viewport.get_texture().get_image()
	var path: String = SHOTS_DIR + "/plant-blueberry.png"
	img.save_png(path)
	print("[shot] plant-blueberry.png saved")
	get_tree().quit()
