## Fairy Permaculture — kiln firing plume.
##
## Warm HONEY + CORAL firelight plume when a kiln is firing. Combines
## a flickering OmniLight3D with a narrow additive particle column so
## kilns read as active from 20+ m away.
##
## All colors from Palette.*. GL Compat safe — unshaded additive particles.
extends Node3D

const LIFETIME_S: float = 1.4
const AMOUNT: int = 36

var _particles: GPUParticles3D
var _light: OmniLight3D
var _flicker_phase: float = 0.0


func _ready() -> void:
	_light = _build_light()
	add_child(_light)
	_particles = _build_particles()
	add_child(_particles)


func _process(delta: float) -> void:
	# Flicker the light energy on a couple of overlapping sines — gives
	# a natural fire read without needing a texture/curve.
	if _light == null:
		return
	_flicker_phase += delta * 3.4
	var base: float = 1.8
	var flick: float = sin(_flicker_phase) * 0.25 + sin(_flicker_phase * 2.7) * 0.15
	_light.light_energy = max(0.0, base + flick)


func _build_light() -> OmniLight3D:
	var l: OmniLight3D = OmniLight3D.new()
	l.name = "FireLight"
	# Tint the light toward warm-coral — this is a kiln's core glow.
	l.light_color = Palette.CORAL.lerp(Palette.HONEY, 0.55)
	l.light_energy = 1.8
	l.omni_range = 4.0
	l.omni_attenuation = 1.6
	l.position = Vector3(0, 0.6, 0)
	return l


func _build_particles() -> GPUParticles3D:
	var p: GPUParticles3D = GPUParticles3D.new()
	p.name = "PlumeEmitter"
	p.amount = AMOUNT
	p.lifetime = LIFETIME_S
	p.one_shot = false
	p.emitting = true
	p.randomness = 0.4
	p.local_coords = false
	p.visibility_aabb = AABB(Vector3(-2, 0, -2), Vector3(4, 5, 4))

	var mesh: QuadMesh = QuadMesh.new()
	mesh.size = Vector2(0.25, 0.25)

	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	mat.billboard_keep_scale = true
	# Albedo bright-warm so additive blend reads at any ambient level.
	mat.albedo_color = Color(Palette.HONEY.r, Palette.HONEY.g, Palette.HONEY.b, 1.0)
	mesh.material = mat
	p.draw_pass_1 = mesh

	var pm: ParticleProcessMaterial = ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	pm.emission_sphere_radius = 0.18
	pm.direction = Vector3(0, 1, 0)
	pm.spread = 22.0
	pm.initial_velocity_min = 1.1
	pm.initial_velocity_max = 2.0
	pm.gravity = Vector3(0, 0.6, 0)
	pm.scale_min = 0.7
	pm.scale_max = 1.4

	var curve: Curve = Curve.new()
	curve.add_point(Vector2(0, 1.0))
	curve.add_point(Vector2(0.35, 1.3))
	curve.add_point(Vector2(1.0, 0.0))
	var ct: CurveTexture = CurveTexture.new()
	ct.curve = curve
	pm.scale_curve = ct

	# Color: CORAL bright core -> HONEY -> fade to PARCHMENT-smoke.
	var grad: Gradient = Gradient.new()
	grad.set_color(0, Color(Palette.CORAL.r, Palette.CORAL.g, Palette.CORAL.b, 0.95))
	grad.add_point(0.4, Color(Palette.HONEY.r, Palette.HONEY.g, Palette.HONEY.b, 0.7))
	grad.set_color(1, Color(Palette.PARCHMENT.r, Palette.PARCHMENT.g, Palette.PARCHMENT.b, 0.0))
	var gt: GradientTexture1D = GradientTexture1D.new()
	gt.gradient = grad
	pm.color_ramp = gt

	p.process_material = pm
	return p


func set_active(on: bool) -> void:
	if _particles != null:
		_particles.emitting = on
	if _light != null:
		_light.visible = on
