## Fairy Permaculture — shared hover ring.
##
## One mesh per scene that any interactable can position under itself
## via `HoverRing.show_under(node, radius)` / `HoverRing.hide()`.
## Torus lies flat on the ground, pulsed subtly for life, always-on-top.
extends Node3D

@onready var _ring: MeshInstance3D = $Ring
@onready var _ring_outer: MeshInstance3D = $RingOuter
var _t: float = 0.0
var _base_radius: float = 1.0
var _target: Node3D = null


func _ready() -> void:
	var torus_inner: TorusMesh = TorusMesh.new()
	torus_inner.inner_radius = 0.92
	torus_inner.outer_radius = 1.05
	torus_inner.rings = 48
	_ring.mesh = torus_inner
	var mat_inner: StandardMaterial3D = StandardMaterial3D.new()
	mat_inner.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat_inner.albedo_color = Color(0.95, 0.76, 0.31, 0.95)
	mat_inner.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat_inner.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	mat_inner.no_depth_test = true
	_ring.material_override = mat_inner
	_ring.sorting_offset = 1.0

	var torus_outer: TorusMesh = TorusMesh.new()
	torus_outer.inner_radius = 1.15
	torus_outer.outer_radius = 1.30
	torus_outer.rings = 48
	_ring_outer.mesh = torus_outer
	var mat_outer: StandardMaterial3D = mat_inner.duplicate()
	mat_outer.albedo_color = Color(0.95, 0.76, 0.31, 0.45)
	_ring_outer.material_override = mat_outer
	_ring_outer.sorting_offset = 1.0

	visible = false


func show_under(node: Node3D, radius: float = 1.4) -> void:
	_target = node
	_base_radius = max(1.1, radius)
	_ring.scale = Vector3.ONE * _base_radius
	_ring_outer.scale = Vector3.ONE * _base_radius
	_position_on_target()
	visible = true


func hide_ring() -> void:
	visible = false
	_target = null


func _process(delta: float) -> void:
	if not visible:
		return
	_t += delta
	_position_on_target()
	var pulse: float = 1.0 + 0.06 * sin(_t * 6.0)
	_ring.scale = Vector3.ONE * _base_radius * pulse
	var pulse2: float = 1.0 + 0.08 * sin(_t * 4.0 + 0.5)
	_ring_outer.scale = Vector3.ONE * _base_radius * pulse2


func _position_on_target() -> void:
	if _target == null or not is_instance_valid(_target):
		hide_ring()
		return
	global_position = Vector3(_target.global_position.x, _target.global_position.y + 0.05, _target.global_position.z)
