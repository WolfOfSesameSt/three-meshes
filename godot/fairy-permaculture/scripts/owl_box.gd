## Fairy Permaculture — Owl Box habitat buildable.
##
## Pole-mounted wooden box (~0.6 m). Passive habitat: once placed, the
## `Wildlife` autoload rolls barn-owl immigration on day-tick when the
## rodent-pressure and season conditions are met (spring/summer/autumn,
## rodent pressure >= 20).
##
## A barn-owl cohort's drain on rodent pressure is substantial (12/day)
## — the "my orchard is quiet at night now" feeling the player earns by
## building the box + waiting.
##
## Paired feedback on arrival is owned by `Wildlife.gd` — this script
## only ships the buildable. Hover + context-menu follow the other
## habitat scripts (chicken_coop, mason_bee_tubes) for consistency.
##
## Cost (flagged to progression-designer in future pass):
##   wood: 3, twigs: 2, labor: 40 s.
extends StaticBody3D


signal clicked(box: Node3D)
signal hover_changed(box: Node3D, hovered: bool)


var _wood_mat: StandardMaterial3D
var _post_mat: StandardMaterial3D
var _in_construction: bool = false


func _ready() -> void:
	add_to_group("owl_boxes")
	add_to_group("animal_habitats")
	add_to_group("wildlife_habitats")
	input_ray_pickable = true
	_build_visual()
	_build_click_area()
	mouse_entered.connect(_on_mouse_enter)
	mouse_exited.connect(_on_mouse_exit)
	input_event.connect(_on_click_input)


func _build_visual() -> void:
	# Warm EARTH box at the top of a WARM_STONE pole. All palette.
	_wood_mat = StandardMaterial3D.new()
	_wood_mat.albedo_color = Palette.clamp_happy(
		Palette.EARTH.lerp(Palette.COMPOST, 0.20)
	)
	_wood_mat.roughness = 0.95
	_post_mat = StandardMaterial3D.new()
	_post_mat.albedo_color = Palette.clamp_happy(
		Palette.WARM_STONE.lerp(Palette.EARTH, 0.35)
	)

	# Pole (1.8 m tall).
	var pole: MeshInstance3D = MeshInstance3D.new()
	var cm: CylinderMesh = CylinderMesh.new()
	cm.top_radius = 0.05
	cm.bottom_radius = 0.07
	cm.height = 1.8
	pole.mesh = cm
	pole.material_override = _post_mat
	pole.position.y = 0.9
	add_child(pole)

	# Box (0.35 × 0.42 × 0.30) at the top.
	var box: MeshInstance3D = MeshInstance3D.new()
	var bm: BoxMesh = BoxMesh.new()
	bm.size = Vector3(0.35, 0.42, 0.30)
	box.mesh = bm
	box.position = Vector3(0, 1.95, 0)
	box.material_override = _wood_mat
	box.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(box)

	# Sloped roof (prism).
	var roof: MeshInstance3D = MeshInstance3D.new()
	var pm: PrismMesh = PrismMesh.new()
	pm.size = Vector3(0.42, 0.12, 0.36)
	roof.mesh = pm
	roof.position = Vector3(0, 2.22, 0)
	roof.material_override = _wood_mat
	roof.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(roof)

	# Hole on the front face — a darker circle disc.
	var hole: MeshInstance3D = MeshInstance3D.new()
	var sm: SphereMesh = SphereMesh.new()
	sm.radius = 0.06
	sm.height = 0.02
	hole.mesh = sm
	var hole_mat: StandardMaterial3D = StandardMaterial3D.new()
	hole_mat.albedo_color = Palette.INK
	hole.material_override = hole_mat
	hole.position = Vector3(0, 2.05, 0.16)
	add_child(hole)


func _build_click_area() -> void:
	var cs: CollisionShape3D = CollisionShape3D.new()
	var box: BoxShape3D = BoxShape3D.new()
	box.size = Vector3(0.42, 2.3, 0.36)
	cs.position.y = 1.15
	cs.shape = box
	add_child(cs)


func _on_mouse_enter() -> void:
	_set_highlight(true)
	emit_signal("hover_changed", self, true)


func _on_mouse_exit() -> void:
	_set_highlight(false)
	emit_signal("hover_changed", self, false)


func _set_highlight(on: bool) -> void:
	for m in [_wood_mat, _post_mat]:
		if m == null:
			continue
		m.rim_enabled = on
		m.rim = 0.9 if on else 0.0
		m.rim_tint = 0.75
		m.emission_enabled = on
		m.emission = Palette.HONEY
		m.emission_energy_multiplier = 0.35 if on else 0.0


func _on_click_input(_cam: Node, event: InputEvent, _pos: Vector3, _norm: Vector3, _shape: int) -> void:
	var mb: InputEventMouseButton = event as InputEventMouseButton
	if mb == null or not mb.pressed:
		return
	if mb.button_index == MOUSE_BUTTON_LEFT:
		emit_signal("clicked", self)


# ---- Universal right-click contract ----

func get_context_actions() -> Array:
	# Passive habitat — no actions for MVP. Future: "Clean box" (removes
	# pellet cast, small nutrient micro-dose), "Inspect" (shows cohort
	# age / drain stats).
	return []


func display_name() -> String:
	var cohort_present: bool = false
	var wl: Node = get_node_or_null("/root/Wildlife")
	if wl != null and wl.has_method("is_present"):
		cohort_present = bool(wl.call("is_present", "barn-owl"))
	return "Owl Box" + (" — occupied" if cohort_present else "")


func complete(_action: Dictionary) -> void:
	pass
