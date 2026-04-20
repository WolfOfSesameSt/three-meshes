## Fairy Permaculture — seasonal wind-borne debris (leaves / petals).
##
## Billboards drift horizontally across the camera view. Seasonal color
## swap driven by set_season():
##   • autumn  → EARTH + CORAL + HONEY brown/red leaves (many)
##   • spring  → CORAL + BERRY blossom petals (few, soft)
##   • summer  → SAGE green specks (very few — idle wind)
##   • winter  → disabled (no emission)
##
## All colors from Palette.*. GL Compat safe.
extends Node3D

enum Season { SPRING, SUMMER, AUTUMN, WINTER }

const LIFETIME_S: float = 4.0
const AMOUNT_AUTUMN: int = 40
const AMOUNT_SPRING: int = 20
const AMOUNT_SUMMER: int = 10

var _particles: GPUParticles3D
var _season: int = Season.AUTUMN
var _strength: float = 0.6


func _ready() -> void:
	_particles = _build_particles()
	add_child(_particles)
	_apply_season()


func _build_particles() -> GPUParticles3D:
	var p: GPUParticles3D = GPUParticles3D.new()
	p.name = "LeafEmitter"
	p.amount = AMOUNT_AUTUMN
	p.lifetime = LIFETIME_S
	p.one_shot = false
	p.emitting = true
	p.randomness = 0.8
	p.local_coords = false
	p.visibility_aabb = AABB(Vector3(-8, -4, -8), Vector3(16, 10, 16))

	var mesh: QuadMesh = QuadMesh.new()
	mesh.size = Vector2(0.22, 0.15)

	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_MIX
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	mat.billboard_keep_scale = true
	# Default albedo — the per-particle color ramp overrides this.
	mat.albedo_color = Color(Palette.EARTH.r, Palette.EARTH.g, Palette.EARTH.b, 1.0)
	mesh.material = mat
	p.draw_pass_1 = mesh

	var pm: ParticleProcessMaterial = ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = Vector3(6.0, 2.5, 0.5)
	pm.direction = Vector3(1.0, -0.1, 0.2)
	pm.spread = 25.0
	pm.initial_velocity_min = 1.8
	pm.initial_velocity_max = 3.2
	pm.gravity = Vector3(0.4, -0.6, 0.2)
	pm.angular_velocity_min = -180.0
	pm.angular_velocity_max = 180.0
	pm.scale_min = 0.7
	pm.scale_max = 1.3

	p.process_material = pm
	return p


## Seasonal swap. Called by juice.wind_set(season, strength).
##   season: "spring" | "summer" | "autumn" | "winter"
func set_season(season_name: String, strength: float = 0.6) -> void:
	_strength = clamp(strength, 0.0, 1.0)
	match season_name:
		"spring": _season = Season.SPRING
		"summer": _season = Season.SUMMER
		"autumn": _season = Season.AUTUMN
		"winter": _season = Season.WINTER
		_:       _season = Season.AUTUMN
	_apply_season()


func _apply_season() -> void:
	if _particles == null: return
	var pm: ParticleProcessMaterial = _particles.process_material as ParticleProcessMaterial
	if pm == null: return
	var grad: Gradient = Gradient.new()
	match _season:
		Season.AUTUMN:
			_particles.amount = max(1, int(float(AMOUNT_AUTUMN) * _strength))
			_particles.emitting = true
			grad.set_color(0, Color(Palette.EARTH.r, Palette.EARTH.g, Palette.EARTH.b, 0.0))
			grad.add_point(0.15, Color(Palette.EARTH.r, Palette.EARTH.g, Palette.EARTH.b, 1.0))
			grad.add_point(0.5, Color(Palette.CORAL.r, Palette.CORAL.g, Palette.CORAL.b, 1.0))
			grad.add_point(0.8, Color(Palette.HONEY.r, Palette.HONEY.g, Palette.HONEY.b, 0.9))
			grad.set_color(1, Color(Palette.EARTH.r, Palette.EARTH.g, Palette.EARTH.b, 0.0))
		Season.SPRING:
			_particles.amount = max(1, int(float(AMOUNT_SPRING) * _strength))
			_particles.emitting = true
			grad.set_color(0, Color(Palette.CORAL.r, Palette.CORAL.g, Palette.CORAL.b, 0.0))
			grad.add_point(0.2, Color(Palette.CORAL.r, Palette.CORAL.g, Palette.CORAL.b, 0.95))
			grad.add_point(0.6, Color(Palette.BERRY.r, Palette.BERRY.g, Palette.BERRY.b, 0.9))
			grad.set_color(1, Color(Palette.PARCHMENT.r, Palette.PARCHMENT.g, Palette.PARCHMENT.b, 0.0))
		Season.SUMMER:
			_particles.amount = max(1, int(float(AMOUNT_SUMMER) * _strength))
			_particles.emitting = true
			grad.set_color(0, Color(Palette.SAGE.r, Palette.SAGE.g, Palette.SAGE.b, 0.0))
			grad.add_point(0.2, Color(Palette.SAGE.r, Palette.SAGE.g, Palette.SAGE.b, 0.9))
			grad.add_point(0.7, Color(Palette.MEADOW.r, Palette.MEADOW.g, Palette.MEADOW.b, 0.8))
			grad.set_color(1, Color(Palette.MEADOW.r, Palette.MEADOW.g, Palette.MEADOW.b, 0.0))
		Season.WINTER:
			_particles.amount = 1
			_particles.emitting = false
			grad.set_color(0, Color(Palette.MIST.r, Palette.MIST.g, Palette.MIST.b, 0.0))
			grad.set_color(1, Color(Palette.MIST.r, Palette.MIST.g, Palette.MIST.b, 0.0))
	var gt: GradientTexture1D = GradientTexture1D.new()
	gt.gradient = grad
	pm.color_ramp = gt
	# Horizontal drift scales with strength.
	pm.direction = Vector3(1.0, -0.1, 0.2)
	pm.initial_velocity_min = 1.0 + _strength * 1.2
	pm.initial_velocity_max = 2.2 + _strength * 1.5
