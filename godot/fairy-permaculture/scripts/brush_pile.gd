## Fairy Permaculture — Brush Pile habitat buildable.
##
## Free-form pile of prunings + deadwood. THE keystone biodiversity
## habitat for edges — overwinters ground beetles, lacewing cocoons,
## songbirds, and hosts slug-eating salamanders in damp corners.
##
## Predator-prey loops enabled (guilds.json#hedgerow-beetle-bank +
## orchard-wildlife-stack):
##   • ground-beetle -> slug, snail, weed seed
##   • northwestern-salamander -> slug
##   • song-sparrow stops by (if paired with hedgerow)
##
## Cost (free-labor habitat — just stacked scraps):
##   twigs: 3, labor: 15 s.
##
## Paired feedback on arrival of attracted species is owned by
## `Wildlife.gd`. This script is a passive placeable.
extends StaticBody3D


signal clicked(pile: Node3D)
signal hover_changed(pile: Node3D, hovered: bool)


var _bark_mat: StandardMaterial3D
var _twig_mat: StandardMaterial3D
var _moss_mat: StandardMaterial3D


func _ready() -> void:
	add_to_group("brush_piles")
	add_to_group("wildlife_habitats")
	input_ray_pickable = true
	_build_visual()
	_build_click_area()
	mouse_entered.connect(_on_mouse_enter)
	mouse_exited.connect(_on_mouse_exit)
	input_event.connect(_on_click_input)


func _build_visual() -> void:
	_bark_mat = StandardMaterial3D.new()
	_bark_mat.albedo_color = Palette.clamp_happy(
		Palette.EARTH.lerp(Palette.COMPOST, 0.25)
	)
	_bark_mat.roughness = 1.0
	_twig_mat = StandardMaterial3D.new()
	_twig_mat.albedo_color = Palette.clamp_happy(
		Palette.EARTH.lerp(Palette.WARM_STONE, 0.25)
	)
	_twig_mat.roughness = 1.0
	_moss_mat = StandardMaterial3D.new()
	_moss_mat.albedo_color = Palette.clamp_happy(
		Palette.SAGE.lerp(Palette.OLIVE_DARK, 0.35)
	)
	_moss_mat.roughness = 1.0

	var rng: RandomNumberGenerator = RandomNumberGenerator.new()
	rng.seed = hash(name) & 0x7fffffff

	# 6 stacked "logs" (long boxes) at random angles + 8 "twigs" (thin
	# cylinders) on top. A moss patch on one end for the salamander-read.
	for i in range(6):
		var log_i: MeshInstance3D = MeshInstance3D.new()
		var lm: BoxMesh = BoxMesh.new()
		lm.size = Vector3(0.12, 0.10, 0.90 + rng.randf_range(-0.1, 0.2))
		log_i.mesh = lm
		log_i.position = Vector3(
			rng.randf_range(-0.25, 0.25),
			0.08 + (i / 3) * 0.14,
			rng.randf_range(-0.20, 0.20),
		)
		log_i.rotation.y = rng.randf_range(-PI, PI)
		log_i.rotation.z = rng.randf_range(-0.2, 0.2)
		log_i.material_override = _bark_mat
		log_i.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		add_child(log_i)

	for i in range(8):
		var twig: MeshInstance3D = MeshInstance3D.new()
		var cm: CylinderMesh = CylinderMesh.new()
		cm.top_radius = 0.01
		cm.bottom_radius = 0.015
		cm.height = 0.45 + rng.randf_range(-0.1, 0.2)
		twig.mesh = cm
		twig.position = Vector3(
			rng.randf_range(-0.35, 0.35),
			0.30 + rng.randf_range(-0.05, 0.15),
			rng.randf_range(-0.25, 0.25),
		)
		twig.rotation = Vector3(
			rng.randf_range(-0.4, 0.4),
			rng.randf_range(-PI, PI),
			rng.randf_range(1.2, 1.9),  # mostly horizontal
		)
		twig.material_override = _twig_mat
		add_child(twig)

	# Moss pad — low flat disc at one end, suggesting damp microhabitat.
	var moss: MeshInstance3D = MeshInstance3D.new()
	var mm: SphereMesh = SphereMesh.new()
	mm.radius = 0.28
	mm.height = 0.08
	moss.mesh = mm
	moss.position = Vector3(-0.3, 0.05, 0.2)
	moss.scale = Vector3(1.0, 0.25, 0.8)
	moss.material_override = _moss_mat
	add_child(moss)


func _build_click_area() -> void:
	var cs: CollisionShape3D = CollisionShape3D.new()
	var box: BoxShape3D = BoxShape3D.new()
	box.size = Vector3(1.1, 0.5, 0.9)
	cs.position.y = 0.25
	cs.shape = box
	add_child(cs)


func _on_mouse_enter() -> void:
	_set_highlight(true)
	emit_signal("hover_changed", self, true)


func _on_mouse_exit() -> void:
	_set_highlight(false)
	emit_signal("hover_changed", self, false)


func _set_highlight(on: bool) -> void:
	for m in [_bark_mat, _twig_mat, _moss_mat]:
		if m == null:
			continue
		m.rim_enabled = on
		m.rim = 0.9 if on else 0.0
		m.rim_tint = 0.75
		m.emission_enabled = on
		m.emission = Palette.HONEY
		m.emission_energy_multiplier = 0.22 if on else 0.0


func _on_click_input(_cam: Node, event: InputEvent, _pos: Vector3, _norm: Vector3, _shape: int) -> void:
	var mb: InputEventMouseButton = event as InputEventMouseButton
	if mb == null or not mb.pressed:
		return
	if mb.button_index == MOUSE_BUTTON_LEFT:
		emit_signal("clicked", self)


func get_context_actions() -> Array:
	return []


func display_name() -> String:
	return "Brush Pile"


func complete(_action: Dictionary) -> void:
	pass
