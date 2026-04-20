## Fairy Permaculture — pollinator cloud (bees).
##
## Small yellow + black dots orbiting a flowering plant. Attach to a
## plant in flowering state via juice.pollinator_cloud_on(plant, on).
##
## Uses EMISSION_SHAPE_SPHERE with tangential + radial acceleration to
## give particles an orbital vibe (cheap but reads as insects).
##
## Colors from Palette.*. GL Compat safe.
extends Node3D

const AMOUNT: int = 18
const LIFETIME_S: float = 2.5

var _particles: GPUParticles3D


func _ready() -> void:
	_particles = _build_particles()
	add_child(_particles)


func _build_particles() -> GPUParticles3D:
	var p: GPUParticles3D = GPUParticles3D.new()
	p.name = "PollinatorEmitter"
	p.amount = AMOUNT
	p.lifetime = LIFETIME_S
	p.one_shot = false
	p.emitting = true
	p.randomness = 0.6
	p.local_coords = false
	p.visibility_aabb = AABB(Vector3(-1.5, -0.5, -1.5), Vector3(3, 3, 3))

	var mesh: QuadMesh = QuadMesh.new()
	mesh.size = Vector2(0.06, 0.06)

	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_MIX
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	mat.billboard_keep_scale = true
	mat.albedo_color = Color(Palette.HONEY.r, Palette.HONEY.g, Palette.HONEY.b, 1.0)
	mesh.material = mat
	p.draw_pass_1 = mesh

	var pm: ParticleProcessMaterial = ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	pm.emission_sphere_radius = 0.8
	pm.direction = Vector3(0, 1, 0)
	pm.spread = 180.0
	pm.initial_velocity_min = 0.6
	pm.initial_velocity_max = 1.4
	pm.gravity = Vector3(0, 0, 0)
	# Tangential + radial give a buzzing orbital feel cheaply.
	pm.tangential_accel_min = 2.0
	pm.tangential_accel_max = 4.0
	pm.radial_accel_min = -1.5
	pm.radial_accel_max = 1.5
	pm.damping_min = 0.5
	pm.damping_max = 1.2
	pm.scale_min = 0.8
	pm.scale_max = 1.3

	# Alternate honey/ink colors over life for the classic bee stripe look
	# via color ramp keyframes (no per-particle texture needed).
	var grad: Gradient = Gradient.new()
	grad.set_color(0, Color(Palette.HONEY.r, Palette.HONEY.g, Palette.HONEY.b, 0.0))
	grad.add_point(0.15, Color(Palette.HONEY.r, Palette.HONEY.g, Palette.HONEY.b, 1.0))
	grad.add_point(0.45, Color(Palette.INK.r, Palette.INK.g, Palette.INK.b, 0.9))
	grad.add_point(0.75, Color(Palette.HONEY.r, Palette.HONEY.g, Palette.HONEY.b, 0.95))
	grad.set_color(1, Color(Palette.HONEY.r, Palette.HONEY.g, Palette.HONEY.b, 0.0))
	var gt: GradientTexture1D = GradientTexture1D.new()
	gt.gradient = grad
	pm.color_ramp = gt

	p.process_material = pm
	return p


func set_active(on: bool) -> void:
	if _particles == null: return
	_particles.emitting = on
