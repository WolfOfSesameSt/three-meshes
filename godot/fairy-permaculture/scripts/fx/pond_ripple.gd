## Fairy Permaculture — pond ripple on click.
##
## Spawns a single-shot expanding concentric circle ring at the hit point.
## Self-frees when the tween finishes.
##
## Uses a flat ring mesh (TorusMesh flattened) with an unshaded palette-
## tinted material + alpha tween + scale tween. No ALPHA writes in a
## fragment shader — StandardMaterial3D handles transparency safely on
## GL Compat when blend_mode is MIX.
extends Node3D

const EXPAND_DURATION: float = 1.1
const START_RADIUS: float = 0.15
const END_RADIUS: float = 1.8

var _mi: MeshInstance3D
var _mat: StandardMaterial3D


func _ready() -> void:
	_build()
	_animate()


func _build() -> void:
	var mesh: TorusMesh = TorusMesh.new()
	mesh.inner_radius = START_RADIUS - 0.02
	mesh.outer_radius = START_RADIUS
	mesh.rings = 32
	mesh.ring_segments = 8
	_mat = StandardMaterial3D.new()
	_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_mat.blend_mode = BaseMaterial3D.BLEND_MODE_MIX
	_mat.albedo_color = Color(Palette.MIST.r, Palette.MIST.g, Palette.MIST.b, 0.85)
	_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mesh.material = _mat

	_mi = MeshInstance3D.new()
	_mi.mesh = mesh
	# Torus is authored in XZ-plane when rotated -90° on X.
	_mi.rotation = Vector3(deg_to_rad(-90.0), 0.0, 0.0)
	_mi.scale = Vector3(1, 1, 1)
	add_child(_mi)


func _animate() -> void:
	var tween: Tween = create_tween().set_parallel(true)
	# Scale the ring mesh up. We animate scale instead of rebuilding the
	# torus so the tween stays cheap.
	var end_scale: float = END_RADIUS / START_RADIUS
	tween.tween_property(_mi, "scale", Vector3(end_scale, end_scale, end_scale), EXPAND_DURATION).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	# Fade alpha out via a custom tween on the material.
	tween.tween_method(_set_alpha, 0.85, 0.0, EXPAND_DURATION).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
	tween.chain().tween_callback(queue_free)


func _set_alpha(a: float) -> void:
	if _mat == null: return
	var c: Color = _mat.albedo_color
	c.a = a
	_mat.albedo_color = c
