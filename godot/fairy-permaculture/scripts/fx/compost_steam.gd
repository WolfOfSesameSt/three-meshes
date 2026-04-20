## Fairy Permaculture — compost steam plume.
##
## Parchment-tinted steam wisps rise from a hot compost pile. Low rate,
## long lifetime, additive so the tint reads as light steam instead of
## solid smoke.
##
## Colors from Palette.* (PARCHMENT + MIST). No raw Color() literals.
## GL Compatibility safe — unshaded standard material, additive blend.
extends Node3D

const EMIT_AMOUNT: int = 18
const LIFETIME_S: float = 3.0

var _particles: GPUParticles3D


func _ready() -> void:
	_particles = _build_particles()
	add_child(_particles)


func _build_particles() -> GPUParticles3D:
	var p: GPUParticles3D = GPUParticles3D.new()
	p.name = "SteamEmitter"
	p.amount = EMIT_AMOUNT
	p.lifetime = LIFETIME_S
	p.one_shot = false
	p.emitting = true
	p.explosiveness = 0.0
	p.randomness = 0.6
	p.local_coords = false
	p.visibility_aabb = AABB(Vector3(-3, -1, -3), Vector3(6, 6, 6))

	var mesh: QuadMesh = QuadMesh.new()
	mesh.size = Vector2(0.6, 0.6)

	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	mat.billboard_keep_scale = true
	# Tint: parchment-warm, low alpha so it reads as wispy steam.
	mat.albedo_color = Color(Palette.PARCHMENT.r, Palette.PARCHMENT.g, Palette.PARCHMENT.b, 0.35)
	mesh.material = mat
	p.draw_pass_1 = mesh

	var pm: ParticleProcessMaterial = ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = Vector3(0.45, 0.05, 0.45)
	pm.direction = Vector3(0, 1, 0)
	pm.spread = 15.0
	pm.initial_velocity_min = 0.4
	pm.initial_velocity_max = 0.8
	pm.gravity = Vector3(0, 0.2, 0)  # buoyant — very mild upward pull
	pm.angular_velocity_min = -20.0
	pm.angular_velocity_max = 20.0
	pm.scale_min = 0.8
	pm.scale_max = 1.4

	var curve: Curve = Curve.new()
	curve.add_point(Vector2(0, 0.2))
	curve.add_point(Vector2(0.3, 1.2))
	curve.add_point(Vector2(1.0, 1.8))
	var ct: CurveTexture = CurveTexture.new()
	ct.curve = curve
	pm.scale_curve = ct

	var grad: Gradient = Gradient.new()
	grad.set_color(0, Color(Palette.PARCHMENT.r, Palette.PARCHMENT.g, Palette.PARCHMENT.b, 0.0))
	grad.add_point(0.15, Color(Palette.PARCHMENT.r, Palette.PARCHMENT.g, Palette.PARCHMENT.b, 0.55))
	grad.add_point(0.6, Color(Palette.MIST.r, Palette.MIST.g, Palette.MIST.b, 0.30))
	grad.set_color(1, Color(Palette.MIST.r, Palette.MIST.g, Palette.MIST.b, 0.0))
	var gt: GradientTexture1D = GradientTexture1D.new()
	gt.gradient = grad
	pm.color_ramp = gt

	p.process_material = pm
	return p


func set_active(on: bool) -> void:
	if _particles == null: return
	_particles.emitting = on
