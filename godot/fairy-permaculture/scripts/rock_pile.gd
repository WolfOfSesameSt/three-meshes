## Fairy Permaculture — Rock Pile habitat buildable.
##
## Stacked WARM_STONE cobbles. Passive habitat for garter snakes +
## northwestern salamanders. Also a microclimate feature (thermal mass
## per DESIGN.md §Sun + microclimate + research-animals-systems.md#12.3).
##
## Predator-prey loops this enables (guilds.json#rock-pile-microclimate):
##   • garter-snake -> slug
##   • garter-snake -> small rodent
##   • northwestern-salamander -> slug
##
## Cost (flagged to progression-designer):
##   stone: 6, labor: 30 s.
extends StaticBody3D


signal clicked(pile: Node3D)
signal hover_changed(pile: Node3D, hovered: bool)


var _rock_mat_a: StandardMaterial3D
var _rock_mat_b: StandardMaterial3D


func _ready() -> void:
	add_to_group("rock_piles")
	add_to_group("wildlife_habitats")
	input_ray_pickable = true
	_build_visual()
	_build_click_area()
	mouse_entered.connect(_on_mouse_enter)
	mouse_exited.connect(_on_mouse_exit)
	input_event.connect(_on_click_input)


func _build_visual() -> void:
	# Two warm-stone tones so the pile doesn't read flat.
	_rock_mat_a = StandardMaterial3D.new()
	_rock_mat_a.albedo_color = Palette.clamp_happy(
		Palette.WARM_STONE.lerp(Palette.STRAW_DRY, 0.15)
	)
	_rock_mat_a.roughness = 1.0
	_rock_mat_b = StandardMaterial3D.new()
	_rock_mat_b.albedo_color = Palette.clamp_happy(
		Palette.WARM_STONE.lerp(Palette.COMPOST, 0.25)
	)
	_rock_mat_b.roughness = 1.0

	# Deterministic layout based on node name (stable across sessions).
	var rng: RandomNumberGenerator = RandomNumberGenerator.new()
	rng.seed = hash(name) & 0x7fffffff
	# Bottom layer — 5 stones in a rough oval.
	for i in range(5):
		var r: float = 0.20 + rng.randf_range(-0.04, 0.04)
		_spawn_stone(
			Vector3(rng.randf_range(-0.45, 0.45), r * 0.6,
				rng.randf_range(-0.35, 0.35)),
			r, i % 2 == 0
		)
	# Middle layer — 3 stones.
	for i in range(3):
		var r2: float = 0.18 + rng.randf_range(-0.03, 0.03)
		_spawn_stone(
			Vector3(rng.randf_range(-0.25, 0.25), 0.30 + r2 * 0.5,
				rng.randf_range(-0.18, 0.18)),
			r2, i % 2 == 0
		)
	# Top capstone.
	_spawn_stone(Vector3(0, 0.52, 0), 0.16, true)


func _spawn_stone(pos: Vector3, radius: float, alt_mat: bool) -> void:
	var mi: MeshInstance3D = MeshInstance3D.new()
	var sm: SphereMesh = SphereMesh.new()
	sm.radius = radius
	sm.height = radius * 1.3
	mi.mesh = sm
	mi.position = pos
	mi.scale = Vector3(1.0, 0.78, 0.92)
	mi.material_override = _rock_mat_b if alt_mat else _rock_mat_a
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(mi)


func _build_click_area() -> void:
	var cs: CollisionShape3D = CollisionShape3D.new()
	var box: BoxShape3D = BoxShape3D.new()
	box.size = Vector3(1.2, 0.9, 1.0)
	cs.position.y = 0.4
	cs.shape = box
	add_child(cs)


func _on_mouse_enter() -> void:
	_set_highlight(true)
	emit_signal("hover_changed", self, true)


func _on_mouse_exit() -> void:
	_set_highlight(false)
	emit_signal("hover_changed", self, false)


func _set_highlight(on: bool) -> void:
	for m in [_rock_mat_a, _rock_mat_b]:
		if m == null:
			continue
		m.rim_enabled = on
		m.rim = 0.9 if on else 0.0
		m.rim_tint = 0.75
		m.emission_enabled = on
		m.emission = Palette.HONEY
		m.emission_energy_multiplier = 0.25 if on else 0.0


func _on_click_input(_cam: Node, event: InputEvent, _pos: Vector3, _norm: Vector3, _shape: int) -> void:
	var mb: InputEventMouseButton = event as InputEventMouseButton
	if mb == null or not mb.pressed:
		return
	if mb.button_index == MOUSE_BUTTON_LEFT:
		emit_signal("clicked", self)


func get_context_actions() -> Array:
	return []


func display_name() -> String:
	return "Rock Pile"


func complete(_action: Dictionary) -> void:
	pass
