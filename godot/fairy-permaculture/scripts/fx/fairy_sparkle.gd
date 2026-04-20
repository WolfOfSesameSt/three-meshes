## Fairy Permaculture — fairy sparkle trail.
##
## Attached behind a fairy (or any Node3D in group "fairy"). GPUParticles3D
## emits a low-rate honey-warm sparkle trail that scales with the host's
## linear velocity — stationary fairy => faint emission, flying fairy =>
## active trail.
##
## Colors sourced exclusively from Palette.* — no raw Color() literals.
## GL Compatibility safe:
##   • Uses StandardMaterial3D with SHADING_MODE_UNSHADED (avoids toon
##     footguns). Transparency via albedo alpha + BLEND_MODE_ADD.
##   • No ALPHA-writes in a custom fragment shader (we don't author one).
##
## Budget: max 30 emit/s, lifetime 0.8 s → peak ~24 live particles.
extends Node3D

const EMIT_RATE_MAX: float = 30.0
const LIFETIME_S: float = 0.8
const AMOUNT_CAP: int = 48

var _particles: GPUParticles3D
var _host_last_pos: Vector3 = Vector3.ZERO
var _host_speed: float = 0.0
var _velocity_smooth: float = 0.0


func _ready() -> void:
	_particles = _build_particles()
	add_child(_particles)
	_host_last_pos = global_position


func _process(delta: float) -> void:
	if _particles == null:
		return
	# Track owner velocity via global_position delta. The host is our
	# parent Node3D. If parent is null just idle.
	var parent: Node = get_parent()
	if parent is Node3D:
		var host: Node3D = parent as Node3D
		var cur: Vector3 = host.global_position
		var inst: float = cur.distance_to(_host_last_pos) / max(delta, 0.001)
		_host_last_pos = cur
		_host_speed = inst
		# Smooth to kill the jitter from frame-to-frame delta noise.
		_velocity_smooth = lerp(_velocity_smooth, _host_speed, clamp(delta * 6.0, 0.0, 1.0))
	else:
		_velocity_smooth = 0.0
	# Stationary: faint passive glow (~25% rate). Moving: scale up to max.
	var mix_t: float = clamp(_velocity_smooth / 4.0, 0.0, 1.0)
	var target_amount: int = int(lerp(8.0, float(AMOUNT_CAP), mix_t))
	if _particles.amount != target_amount:
		_particles.amount = target_amount


func _build_particles() -> GPUParticles3D:
	var p: GPUParticles3D = GPUParticles3D.new()
	p.name = "SparkleEmitter"
	p.amount = 16
	p.lifetime = LIFETIME_S
	p.one_shot = false
	p.emitting = true
	p.explosiveness = 0.0
	p.randomness = 0.3
	p.local_coords = false
	p.visibility_aabb = AABB(Vector3(-2, -2, -2), Vector3(4, 4, 4))

	var mesh: QuadMesh = QuadMesh.new()
	mesh.size = Vector2(0.08, 0.08)

	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mat.albedo_color = Color(Palette.HONEY.r, Palette.HONEY.g, Palette.HONEY.b, 0.85)
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	mat.billboard_keep_scale = true
	mesh.material = mat

	p.draw_pass_1 = mesh

	var pm: ParticleProcessMaterial = ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	pm.emission_sphere_radius = 0.12
	pm.direction = Vector3(0, 1, 0)
	pm.spread = 40.0
	pm.initial_velocity_min = 0.2
	pm.initial_velocity_max = 0.8
	pm.gravity = Vector3(0, -0.4, 0)
	pm.scale_min = 0.5
	pm.scale_max = 1.2

	# Scale curve: pop-in, fade-out.
	var curve: Curve = Curve.new()
	curve.add_point(Vector2(0, 0.2))
	curve.add_point(Vector2(0.25, 1.0))
	curve.add_point(Vector2(1.0, 0.0))
	var ct: CurveTexture = CurveTexture.new()
	ct.curve = curve
	pm.scale_curve = ct

	# Color ramp: honey -> parchment fade.
	var grad: Gradient = Gradient.new()
	grad.set_color(0, Color(Palette.HONEY.r, Palette.HONEY.g, Palette.HONEY.b, 1.0))
	grad.set_color(1, Color(Palette.PARCHMENT.r, Palette.PARCHMENT.g, Palette.PARCHMENT.b, 0.0))
	grad.add_point(0.3, Color(Palette.HONEY.r, Palette.HONEY.g, Palette.HONEY.b, 0.9))
	var gt: GradientTexture1D = GradientTexture1D.new()
	gt.gradient = grad
	pm.color_ramp = gt

	p.process_material = pm
	return p


## Stop emission externally (e.g. when the fairy enters a building).
func set_active(on: bool) -> void:
	if _particles == null: return
	_particles.emitting = on
