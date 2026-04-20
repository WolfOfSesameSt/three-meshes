## Fairy Permaculture — rain streaks (camera-following veil).
##
## A camera-locked emitter of tall thin translucent streaks that fall at
## a slight forward angle. The emitter parent follows the active camera
## (if one is found) so the streaks appear to fill the screen regardless
## of where the camera moves.
##
## Framework only — the weather event system is not implemented yet. This
## scene can be instanced and its intensity tweened via set_intensity().
##
## Palette colors: MIST tint (cool but warm-shifted by clamp_happy — the
## constant is already above the happy floor).
extends Node3D

const LIFETIME_S: float = 0.6
const BASE_AMOUNT: int = 180

var _particles: GPUParticles3D
var _intensity: float = 0.7
var _camera: Camera3D


func _ready() -> void:
	_particles = _build_particles()
	add_child(_particles)
	# Try to find a camera to follow — if none, the scene stays anchored.
	call_deferred("_find_camera")


func _process(_delta: float) -> void:
	if _camera == null:
		_find_camera()
		return
	# Park just above the camera; streaks spawn in a wide box overhead
	# and fall past the view. Using global_position avoids parenting issues.
	global_position = _camera.global_position + Vector3(0, 8.0, 0)


func _find_camera() -> void:
	var cam: Camera3D = get_viewport().get_camera_3d() if get_viewport() else null
	if cam != null:
		_camera = cam


func _build_particles() -> GPUParticles3D:
	var p: GPUParticles3D = GPUParticles3D.new()
	p.name = "RainEmitter"
	p.amount = BASE_AMOUNT
	p.lifetime = LIFETIME_S
	p.one_shot = false
	p.emitting = true
	p.randomness = 0.8
	p.local_coords = false
	p.visibility_aabb = AABB(Vector3(-12, -8, -12), Vector3(24, 16, 24))

	# Tall thin quads read as streaks without needing a motion-stretch
	# shader (which Forward+ has via trail features but Compat doesn't).
	var mesh: QuadMesh = QuadMesh.new()
	mesh.size = Vector2(0.03, 0.45)

	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_MIX
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	# Use MIST as a cool-but-palette-compliant streak tint. Low alpha so
	# the streaks layer into a soft veil, not a solid curtain.
	mat.albedo_color = Color(Palette.MIST.r, Palette.MIST.g, Palette.MIST.b, 0.55)
	mesh.material = mat
	p.draw_pass_1 = mesh

	var pm: ParticleProcessMaterial = ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = Vector3(10.0, 0.1, 10.0)
	pm.direction = Vector3(-0.3, -1.0, 0.2)
	pm.spread = 3.0
	pm.initial_velocity_min = 12.0
	pm.initial_velocity_max = 16.0
	pm.gravity = Vector3(0, -6.0, 0)
	pm.scale_min = 0.8
	pm.scale_max = 1.4

	var grad: Gradient = Gradient.new()
	grad.set_color(0, Color(Palette.MIST.r, Palette.MIST.g, Palette.MIST.b, 0.0))
	grad.add_point(0.1, Color(Palette.MIST.r, Palette.MIST.g, Palette.MIST.b, 0.6))
	grad.set_color(1, Color(Palette.MIST.r, Palette.MIST.g, Palette.MIST.b, 0.0))
	var gt: GradientTexture1D = GradientTexture1D.new()
	gt.gradient = grad
	pm.color_ramp = gt

	p.process_material = pm
	return p


## 0 = off, 1 = heavy. Drives amount scale + emitting flag.
func set_intensity(intensity: float) -> void:
	_intensity = clamp(intensity, 0.0, 1.0)
	if _particles == null:
		return
	_particles.amount = max(1, int(float(BASE_AMOUNT) * _intensity))
	_particles.emitting = _intensity > 0.02
