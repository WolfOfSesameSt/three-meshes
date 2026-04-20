## Fairy Permaculture — isometric overseer camera rig.
##
## Fixed 45° iso orthographic. WASD pans the `target`; mouse wheel
## zooms; camera follows the target at a fixed offset so the view
## stays consistent.
extends Node3D

@export var pan_speed: float = 18.0
@export var zoom_min: float = 10.0
@export var zoom_max: float = 120.0
@export var zoom_default: float = 30.0

@onready var camera: Camera3D = $Camera3D

const YAW_DEG := 45.0
const PITCH_DEG := 45.0
const DISTANCE := 60.0

var _zoom: float = zoom_default


func _ready() -> void:
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = _zoom
	_place_camera()


func set_target(world_pos: Vector3) -> void:
	position = world_pos
	_place_camera()


func _process(delta: float) -> void:
	var mx := 0.0
	var mz := 0.0
	if Input.is_action_pressed("pan_up"):    mz -= 1.0
	if Input.is_action_pressed("pan_down"):  mz += 1.0
	if Input.is_action_pressed("pan_left"):  mx -= 1.0
	if Input.is_action_pressed("pan_right"): mx += 1.0
	if mx != 0.0 or mz != 0.0:
		# Same mapping as the fixed JS rig:
		#   W (mz=-1) → world (-1, 0, -1)  = screen up
		#   D (mx=+1) → world (+1, 0, -1)  = screen right
		var wx := mx + mz
		var wz := mz - mx
		var len := sqrt(wx * wx + wz * wz)
		if len > 0.0:
			wx /= len
			wz /= len
		var speed_mod := pan_speed * (_zoom / zoom_default)
		position.x += wx * speed_mod * delta
		position.z += wz * speed_mod * delta


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("zoom_in"):
		_zoom = clamp(_zoom - 2.0, zoom_min, zoom_max)
		camera.size = _zoom
	elif event.is_action_pressed("zoom_out"):
		_zoom = clamp(_zoom + 2.0, zoom_min, zoom_max)
		camera.size = _zoom


func _place_camera() -> void:
	var p := deg_to_rad(PITCH_DEG)
	var y := deg_to_rad(YAW_DEG)
	var offset := Vector3(
		cos(p) * sin(y) * DISTANCE,
		sin(p) * DISTANCE,
		cos(p) * cos(y) * DISTANCE
	)
	camera.position = offset
	camera.look_at(Vector3.ZERO, Vector3.UP)
