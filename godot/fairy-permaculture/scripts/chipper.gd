## Fairy Permaculture — Chipper structure.
##
## Converts wood + twigs into wood_chips. Wood chips are the quiet
## workhorse of a permaculture farm: ramial mulch for paths + orchard
## drip lines, structural bulker for the compost pile (high C:N keeps
## airflow, prevents anaerobic mats), fungal substrate for wine-cap +
## stropharia beds.
##
## Two right-click actions:
##   chip_wood   — cost {wood: 1}, yield {wood_chips: 3}, 20 s labor
##   chip_twigs  — cost {twigs: 3}, yield {wood_chips: 2}, 15 s labor
##
## Both actions drop the chips at the nearest storage shed. During the
## working beat the hopper shakes + tiny chip particles fall; the audio
## cue is `biomass-chop` pitched higher (-2 dB gain so it sits above
## ambient).
##
## Visual mesh: warm-earth wooden box (Palette.EARTH), WARM_STONE metal
## hopper on top, angled spout — kept to a handful of primitive meshes
## so the draw-call cost stays tiny. Materials trace to Palette.*
## constants per the happy-palette rule.
extends StaticBody3D

signal clicked(node: Node3D)
signal hover_changed(node: Node3D, hovered: bool)

@onready var _base: MeshInstance3D = $Base
@onready var _hopper: MeshInstance3D = $Hopper
@onready var _spout: MeshInstance3D = $Spout
@onready var _feet: MeshInstance3D = $Feet
@onready var _click_shape: CollisionShape3D = $CollisionShape3D

var _base_mat: StandardMaterial3D
var _hopper_mat: StandardMaterial3D
var _spout_mat: StandardMaterial3D
var _feet_mat: StandardMaterial3D

# Particle pool: a cluster of tiny box meshes parented under the spout.
# During `_working` they fall a short distance then reset. No shader
# allocations — just TRS animation — so the perf cost is negligible.
const _CHIP_COUNT: int = 8
var _chip_particles: Array[MeshInstance3D] = []
var _chip_rng: RandomNumberGenerator = RandomNumberGenerator.new()

var _in_construction: bool = false
var _working: bool = false
var _work_t: float = 0.0
var _t: float = 0.0


func _ready() -> void:
	_chip_rng.seed = (hash(name) ^ 0x77) & 0x7fffffff
	_build_materials()
	_build_chip_particles()
	add_to_group("chippers")
	input_ray_pickable = true
	input_event.connect(_on_click)
	mouse_entered.connect(_on_mouse_enter)
	mouse_exited.connect(_on_mouse_exit)
	TaskQueue.task_work_tick.connect(_on_task_work_tick)
	TaskQueue.task_started.connect(_on_task_started)
	TaskQueue.task_completed.connect(_on_task_ended)
	TaskQueue.task_cancelled.connect(_on_task_ended)


func _build_materials() -> void:
	# Wooden base — the EARTH brown the rest of the farm uses for wood.
	_base_mat = StandardMaterial3D.new()
	_base_mat.albedo_color = Palette.EARTH
	_base.material_override = _base_mat
	# Metal hopper — WARM_STONE so it reads as weathered tinplate, not
	# cold steel.
	_hopper_mat = StandardMaterial3D.new()
	_hopper_mat.albedo_color = Palette.WARM_STONE
	_hopper_mat.metallic = 0.35
	_hopper_mat.roughness = 0.55
	_hopper.material_override = _hopper_mat
	# Spout — slightly darker WARM_STONE so it reads as a tube, not as
	# the same slab as the hopper.
	_spout_mat = StandardMaterial3D.new()
	_spout_mat.albedo_color = Palette.WARM_STONE.darkened(0.15)
	_spout_mat.metallic = 0.35
	_spout_mat.roughness = 0.55
	_spout.material_override = _spout_mat
	# Feet — COMPOST-dark wooden stubs so the chipper reads anchored.
	_feet_mat = StandardMaterial3D.new()
	_feet_mat.albedo_color = Palette.COMPOST
	_feet.material_override = _feet_mat


## Spawn a pool of tiny chip primitives under the spout. We reuse them
## to avoid per-frame allocations; each chip animates on its own timer.
func _build_chip_particles() -> void:
	var chip_tint: Color = Palette.EARTH.lerp(Palette.HONEY, 0.40)
	var chip_mat: StandardMaterial3D = StandardMaterial3D.new()
	chip_mat.albedo_color = chip_tint
	chip_mat.shading_mode = BaseMaterial3D.SHADING_MODE_PER_PIXEL
	for i in range(_CHIP_COUNT):
		var mi: MeshInstance3D = MeshInstance3D.new()
		var bm: BoxMesh = BoxMesh.new()
		bm.size = Vector3(0.08, 0.04, 0.14)
		mi.mesh = bm
		mi.material_override = chip_mat
		mi.visible = false
		mi.position = _chip_spawn_offset(i)
		add_child(mi)
		_chip_particles.append(mi)


func _chip_spawn_offset(i: int) -> Vector3:
	# Tuck the particles just below the spout mouth.
	var theta: float = float(i) * (TAU / float(_CHIP_COUNT))
	return Vector3(
		0.95 + cos(theta) * 0.12,
		0.55,
		sin(theta) * 0.12,
	)


func _on_mouse_enter() -> void:
	set_highlight(true)
	emit_signal("hover_changed", self, true)


func _on_mouse_exit() -> void:
	set_highlight(false)
	emit_signal("hover_changed", self, false)


## Rim + emission flash on hover. Preserves the base material albedo.
func set_highlight(on: bool) -> void:
	var highlight: Color = Palette.HONEY
	for m in [_base_mat, _hopper_mat, _spout_mat, _feet_mat]:
		if m == null: continue
		m.rim_enabled = on
		m.rim = 0.9 if on else 0.0
		m.rim_tint = 0.75
		m.emission_enabled = on
		m.emission = highlight
		m.emission_energy_multiplier = 0.3 if on else 0.0


## LMB is a no-op per the universal interaction model — all actions
## route through right-click → context menu.
func _on_click(_cam: Node, _event: InputEvent, _pos: Vector3, _norm: Vector3, _shape: int) -> void:
	emit_signal("clicked", self)


func _process(delta: float) -> void:
	_t += delta
	if _working:
		_work_t += delta
		_advance_chip_particles(delta)
		# Hopper shake: jitter Y + tiny rotation so it reads as "actively
		# chomping." Easy to animate, cheap on the CPU.
		var jitter: float = sin(_work_t * 34.0) * 0.04
		_hopper.position.y = 1.45 + jitter
		_hopper.rotation.z = sin(_work_t * 22.0) * 0.05
	else:
		# Idle breathing.
		_hopper.position.y = lerp(_hopper.position.y, 1.45, 0.1)
		_hopper.rotation.z = lerp(_hopper.rotation.z, 0.0, 0.1)
		for p in _chip_particles:
			p.visible = false


## Pull each chip toward a small downward arc. Once it falls past the
## ground plane we reset it to a fresh spawn offset.
func _advance_chip_particles(delta: float) -> void:
	for i in range(_chip_particles.size()):
		var p: MeshInstance3D = _chip_particles[i]
		p.visible = true
		p.position.y -= delta * (0.9 + _chip_rng.randf() * 0.4)
		p.position.x += delta * (0.15 * sin(_work_t * 7.0 + float(i)))
		p.rotate_y(delta * 3.0)
		if p.position.y <= 0.05:
			p.position = _chip_spawn_offset(i)


func _on_task_started(t: Dictionary) -> void:
	if t.get("target") == self:
		_working = true
		_work_t = 0.0


func _on_task_ended(t: Dictionary) -> void:
	if t.get("target") == self:
		_working = false


## Audio cue each work-tick — biomass-chop at a brighter gain reads as a
## chipper bite. AudioManager doesn't expose pitch in MVP; the louder
## envelope gives it the "higher" feel until the audio-lab adds a pitch
## override.
func _on_task_work_tick(t: Dictionary) -> void:
	if t.get("target") != self:
		return
	AudioManager.play("biomass-chop", -2.0)


## Called by main.gd after the scene instantiates. Matches the storage
## shed contract so the build flow can trigger the scale-up.
func start_construction(duration_s: float) -> void:
	_in_construction = true
	scale = Vector3.ONE * 0.1
	for m in [_base_mat, _hopper_mat, _spout_mat, _feet_mat]:
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		m.albedo_color.a = 0.35
	var tw: Tween = create_tween()
	tw.tween_property(self, "scale", Vector3.ONE, duration_s) \
		.set_trans(Tween.TRANS_SINE)
	tw.tween_callback(_on_construction_complete)


func _on_construction_complete() -> void:
	_in_construction = false
	for m in [_base_mat, _hopper_mat, _spout_mat, _feet_mat]:
		m.transparency = BaseMaterial3D.TRANSPARENCY_DISABLED
		m.albedo_color.a = 1.0
	var wp: Vector3 = global_position + Vector3(0, 1.8, 0)
	Juice.burst(wp, Palette.EARTH.lerp(Palette.HONEY, 0.40), 22)
	AudioManager.play("compost-scoop", -4.0)


# =====================================================================
# Universal right-click contract
# =====================================================================

func get_context_actions() -> Array:
	var out: Array = []
	# chip_wood — 1 wood in, 3 chips out. Costs flow via pickup-flow
	# (auto-lit by Interactable.MATERIAL_RESOURCES), yield carried back
	# to storage. The labor of 20 s reads as a real chunk of chipping.
	if FarmTotals.get_resource(FarmTotals.WOOD) >= 1.0:
		out.append(Interactable.make_action(
			"chip_wood", "Chip wood → wood chips", 20.0,
			{"wood": 1.0}, {"wood_chips": 3.0},
			"", Interactable.DROP_STORAGE, 2,
			Interactable.PICKUP_STORAGE,
		))
	# chip_twigs — 3 twigs in, 2 chips out. Twigs are smaller so the
	# yield-per-input is lower; fits the prunings → ramial mulch route.
	if FarmTotals.get_resource(FarmTotals.TWIGS) >= 3.0:
		out.append(Interactable.make_action(
			"chip_twigs", "Chip twigs → wood chips", 15.0,
			{"twigs": 3.0}, {"wood_chips": 2.0},
			"", Interactable.DROP_STORAGE, 2,
			Interactable.PICKUP_STORAGE,
		))
	return out


func display_name() -> String:
	return "Chipper"


## TaskQueue completion hook. The yield is attached to the action dict
## and auto-deposits at storage via the drop-off flow — we just play the
## paired visual cue locally.
func complete(action: Dictionary) -> void:
	var id: String = action.get("id", "")
	match id:
		"chip_wood", "chip_twigs":
			var chip_tint: Color = Palette.EARTH.lerp(Palette.HONEY, 0.40)
			Juice.pop(global_position + Vector3(0, 2.2, 0), "+ CHIPS", chip_tint)
			Juice.burst(global_position + Vector3(0, 1.4, 0), chip_tint, 14)
