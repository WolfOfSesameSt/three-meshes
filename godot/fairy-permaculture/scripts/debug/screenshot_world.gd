## Headless-ish screenshot tool for the live world at multiple
## time-of-day and vitality states. Captures six PNGs into
## `logs/shots/` so the environment engineer can eyeball the cycle
## without loading the full game loop.
##
## Usage:
##   godot --path . scenes/debug/screenshot_world.tscn
##
## The script instantiates a SubViewport with its own Environment +
## Sun (mirroring the shape of `main.tscn`), adds a SunCycle node
## parented to the viewport scene, spawns the terrain via WorldGrid,
## then iterates through (phase_t, vitality) combinations. For each
## combo we call `sun_cycle.set_phase_t(t)` and `WorldState.set_vitality(v)`,
## wait a couple of frames for tweens to settle, and save a PNG.
extends Node3D

const SHOTS_DIR := "res://logs/shots"
const FRAMES_BETWEEN := 12

## Each sample is (phase_t, vitality, label). phase_t matches the 0..1
## cycle from sun_cycle.gd — dawn ≈ 0.18, noon ≈ 0.50, sunset ≈ 0.80.
const SAMPLES: Array = [
	{"t": 0.18, "v": 0.20, "label": "world-dawn-barren"},
	{"t": 0.18, "v": 0.90, "label": "world-dawn-lush"},
	{"t": 0.50, "v": 0.20, "label": "world-noon-barren"},
	{"t": 0.50, "v": 0.90, "label": "world-noon-lush"},
	{"t": 0.80, "v": 0.20, "label": "world-sunset-barren"},
	{"t": 0.80, "v": 0.90, "label": "world-sunset-lush"},
]

@onready var _viewport: SubViewport = $Sub
@onready var _stage: Node3D = $Sub/Stage
@onready var _env: WorldEnvironment = $Sub/Stage/WorldEnvironment
@onready var _sun: DirectionalLight3D = $Sub/Stage/Sun
@onready var _camera: Camera3D = $Sub/Stage/Rig/Camera

var _sample_idx: int = -1
var _countdown: int = 0
var _sun_cycle: Node
var _terrain_root: Node3D


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(SHOTS_DIR))
	# Aim the camera with the in-game iso rig's angle (pitch 45°, yaw 45°)
	# and pull it back enough to frame the full 128m grid. Ortho size
	# 120 covers the iso-projected diagonal of a 128×128 tile world
	# plus a little margin.
	var pitch: float = deg_to_rad(45.0)
	var yaw: float = deg_to_rad(45.0)
	var dist: float = 140.0
	var cam_pos: Vector3 = Vector3(
		cos(pitch) * sin(yaw) * dist,
		sin(pitch) * dist,
		cos(pitch) * cos(yaw) * dist,
	)
	_camera.global_position = cam_pos
	_camera.look_at(Vector3.ZERO, Vector3.UP)
	_camera.size = 120.0
	_camera.near = 0.5
	_camera.far = 600.0
	# Wire the SunCycle node into our stage — it needs a scene-tree
	# sibling named "Sun" + a "WorldEnvironment" to find via its
	# fallback lookup, and that's exactly what we have under Stage.
	var SunCycleScript: Script = load("res://scripts/sun_cycle.gd")
	_sun_cycle = Node.new()
	_sun_cycle.name = "SunCycle"
	_sun_cycle.set_script(SunCycleScript)
	_stage.add_child(_sun_cycle)

	# Build the full terrain + water inside our stage so we see what
	# the live game would see.
	WorldGrid.attach_to_scene(_stage)
	var terrain_node: Node = _stage.get_node_or_null("TerrainChunks")
	if terrain_node != null:
		print("[shot] terrain attached — %d children" % terrain_node.get_child_count())
	else:
		print("[shot] WARNING: no TerrainChunks under stage")
	print("[shot] camera pos=%s basis=%s proj=%d size=%.1f" % [
		_camera.global_position, _camera.global_transform.basis, _camera.projection, _camera.size,
	])
	# Poke WorldState to rebind against our stage's Environment/Sun.
	# The headless viewport isn't `current_scene` so we manually set
	# bindings via reflection-ish access.
	_bind_worldstate_to_stage()

	_advance()


func _process(_delta: float) -> void:
	if _sample_idx < 0 or _sample_idx >= SAMPLES.size():
		return
	_countdown -= 1
	if _countdown <= 0:
		_capture_and_advance()


func _advance() -> void:
	_sample_idx += 1
	if _sample_idx >= SAMPLES.size():
		print("[shot] done — %d world shots captured" % SAMPLES.size())
		get_tree().quit()
		return
	var sample: Dictionary = SAMPLES[_sample_idx]
	var t: float = float(sample["t"])
	var v: float = float(sample["v"])
	# Force the cycle to this phase + vitality BEFORE rendering so the
	# first frame is already correct.
	if _sun_cycle != null and _sun_cycle.has_method("set_phase_t"):
		_sun_cycle.call("set_phase_t", t)
	WorldState.set_vitality(v)
	_countdown = FRAMES_BETWEEN
	print("[shot] rendering %s (t=%.2f, vitality=%.2f)" % [sample["label"], t, v])


func _capture_and_advance() -> void:
	await RenderingServer.frame_post_draw
	var img: Image = _viewport.get_texture().get_image()
	var sample: Dictionary = SAMPLES[_sample_idx]
	var out_path: String = "%s/%s.png" % [SHOTS_DIR, sample["label"]]
	var err: int = img.save_png(out_path)
	if err == OK:
		var center: Color = img.get_pixel(img.get_width() / 2, img.get_height() / 2)
		var top: Color = img.get_pixel(img.get_width() / 2, img.get_height() / 5)
		var bottom: Color = img.get_pixel(img.get_width() / 2, int(img.get_height() * 0.85))
		print("[shot] saved %s | sky=(%.2f,%.2f,%.2f) mid=(%.2f,%.2f,%.2f) ground=(%.2f,%.2f,%.2f)" % [
			out_path.get_file(),
			top.r, top.g, top.b,
			center.r, center.g, center.b,
			bottom.r, bottom.g, bottom.b,
		])
	else:
		push_warning("[shot] save_png failed err=%d for %s" % [err, out_path])
	_advance()


## WorldState.refresh_bindings() uses `get_tree().current_scene` which
## points at our root Node3D, not our SubViewport's Stage. So we do the
## same lookup manually but against the Stage.
func _bind_worldstate_to_stage() -> void:
	WorldState.set("_env", _env.environment)
	WorldState.set("_sun", _sun)
