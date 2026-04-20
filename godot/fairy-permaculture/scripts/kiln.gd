## Fairy Permaculture — Kiln structure.
##
## Pyrolysis station. Converts bones → bone_meal (the phosphorus
## amendment), blood → blood_meal (fast nitrogen), and later wood →
## biochar (the permanent carbon/water sponge). Bone_meal is the high-
## leverage P unlock — see feedback_full_soil_engine.md §P.
##
## Context actions:
##   fire_bone_meal    — cost {bones: 4}, yield {bone_meal: 1}, 30 s
##   fire_blood_meal   — cost {blood: 2}, yield {blood_meal: 1}, 20 s
##   fire_biochar      — cost {wood: 3},  yield {biochar: 1}, 60 s (stub)
##
## Visual: stone-and-clay dome. Glowing HONEY emission in the interior
## while actively firing. All colors trace to Palette.* per the happy-
## palette rule.
extends StaticBody3D


signal clicked(kiln: Node3D)
signal hover_changed(kiln: Node3D, hovered: bool)


@onready var _dome: MeshInstance3D = $Dome
@onready var _base: MeshInstance3D = $Base
@onready var _chimney: MeshInstance3D = $Chimney
@onready var _mouth: MeshInstance3D = $Mouth

var _dome_mat: StandardMaterial3D
var _base_mat: StandardMaterial3D
var _chimney_mat: StandardMaterial3D
var _mouth_mat: StandardMaterial3D
var _firing: bool = false
var _in_construction: bool = false
var _t: float = 0.0


func _ready() -> void:
	input_ray_pickable = true
	add_to_group("kilns")
	_dome_mat = StandardMaterial3D.new()
	_dome_mat.albedo_color = Palette.WARM_STONE
	_dome.material_override = _dome_mat
	_base_mat = StandardMaterial3D.new()
	_base_mat.albedo_color = Palette.EARTH
	_base.material_override = _base_mat
	_chimney_mat = StandardMaterial3D.new()
	_chimney_mat.albedo_color = Palette.WARM_STONE.darkened(0.10)
	_chimney.material_override = _chimney_mat
	_mouth_mat = StandardMaterial3D.new()
	# Mouth (firing opening) — starts COMPOST-dark; glows HONEY while
	# firing. The emission_enabled toggle + energy multiplier is driven
	# in _process so the glow tells the player the kiln is busy.
	_mouth_mat.albedo_color = Palette.COMPOST
	_mouth_mat.shading_mode = BaseMaterial3D.SHADING_MODE_PER_PIXEL
	_mouth.material_override = _mouth_mat
	mouse_entered.connect(_on_hover.bind(true))
	mouse_exited.connect(_on_hover.bind(false))
	input_event.connect(_on_click)
	TaskQueue.task_started.connect(_on_task_started)
	TaskQueue.task_completed.connect(_on_task_ended)
	TaskQueue.task_cancelled.connect(_on_task_ended)


func _on_hover(on: bool) -> void:
	for m in [_dome_mat, _base_mat, _chimney_mat]:
		if m == null: continue
		m.rim_enabled = on
		m.rim = 0.9 if on else 0.0
		m.rim_tint = 0.75
		m.emission_enabled = on or _firing
		if on:
			m.emission = Palette.HONEY
			m.emission_energy_multiplier = 0.25
	emit_signal("hover_changed", self, on)


func _on_click(_cam: Node, _event: InputEvent, _pos: Vector3, _norm: Vector3, _shape: int) -> void:
	emit_signal("clicked", self)


func _on_task_started(t: Dictionary) -> void:
	if t.get("target") == self:
		_firing = true


func _on_task_ended(t: Dictionary) -> void:
	if t.get("target") == self:
		_firing = false


func _process(delta: float) -> void:
	_t += delta
	if _in_construction:
		return
	# Mouth glow while firing — a warm HONEY pulse through the firing
	# window, crackle audio is fired on start (see TaskQueue hook).
	if _firing:
		_mouth_mat.emission_enabled = true
		_mouth_mat.emission = Palette.HONEY
		_mouth_mat.emission_energy_multiplier = 0.9 + 0.25 * sin(_t * 6.0)
		# Dome gets a tiny warm rim while firing.
		_dome_mat.emission_enabled = true
		_dome_mat.emission = Palette.CORAL
		_dome_mat.emission_energy_multiplier = 0.3 + 0.1 * sin(_t * 4.0)
	else:
		_mouth_mat.emission_energy_multiplier = lerp(_mouth_mat.emission_energy_multiplier, 0.0, 0.05)
		if _mouth_mat.emission_energy_multiplier < 0.02:
			_mouth_mat.emission_enabled = false
		_dome_mat.emission_energy_multiplier = lerp(_dome_mat.emission_energy_multiplier, 0.0, 0.05)
		if _dome_mat.emission_energy_multiplier < 0.02:
			_dome_mat.emission_enabled = false


func start_construction(duration_s: float) -> void:
	_in_construction = true
	scale = Vector3.ONE * 0.1
	for m in [_dome_mat, _base_mat, _chimney_mat]:
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		m.albedo_color.a = 0.35
	var tw: Tween = create_tween()
	tw.tween_property(self, "scale", Vector3.ONE, duration_s) \
		.set_trans(Tween.TRANS_SINE)
	tw.tween_callback(_on_construction_complete)


func _on_construction_complete() -> void:
	_in_construction = false
	for m in [_dome_mat, _base_mat, _chimney_mat]:
		m.transparency = BaseMaterial3D.TRANSPARENCY_DISABLED
		m.albedo_color.a = 1.0
	if get_node_or_null("/root/Juice") != null:
		Juice.burst(global_position + Vector3(0, 1.6, 0), Palette.WARM_STONE, 22)
		Juice.pop(global_position + Vector3(0, 2.2, 0), "KILN READY", Palette.HONEY)
	if get_node_or_null("/root/AudioManager") != null:
		AudioManager.play("compost-scoop", -4.0)


# =============================================================
# Universal right-click contract
# =============================================================

func get_context_actions() -> Array:
	var out: Array = []
	# Fire bone meal — THE unlock. Bones are the neutral-raw input; the
	# pickup flow auto-engages because "bones" is in MATERIAL_RESOURCES.
	var can_bm: bool = FarmTotals.get_resource(FarmTotals.BONES) >= 4.0
	var bm: Dictionary = Interactable.make_action(
		"fire_bone_meal", "Fire bone meal (P amendment)", 30.0,
		{ "bones": 4.0 }, { "bone_meal": 1.0 },
		"", Interactable.DROP_STORAGE, 2,
	)
	bm["disabled"] = not can_bm
	out.append(bm)

	# Fire blood meal — only surfaces when blood stock exists (phase 1
	# doesn't ship a blood resource drop from butcher yet, but the slot
	# is stubbed so soil agent can turn it on later by bumping the
	# chicken yield to include blood).
	if FarmTotals.get_resource(FarmTotals.BLOOD) >= 2.0:
		var bdm: Dictionary = Interactable.make_action(
			"fire_blood_meal", "Fire blood meal (fast N)", 20.0,
			{ "blood": 2.0 }, { "blood_meal": 1.0 },
			"", Interactable.DROP_STORAGE, 2,
		)
		out.append(bdm)

	# Fire biochar — future, but the slot exists so the late-game soil
	# amendment path is visible to the player as a "locked" row.
	var can_bc: bool = FarmTotals.get_resource(FarmTotals.WOOD) >= 3.0
	var bc: Dictionary = Interactable.make_action(
		"fire_biochar", "Fire biochar (water sponge)", 60.0,
		{ "wood": 3.0 }, { "biochar": 1.0 },
		"", Interactable.DROP_STORAGE, 2,
	)
	bc["disabled"] = not can_bc
	out.append(bc)
	return out


func display_name() -> String:
	return "Kiln"


## TaskQueue complete() hook — fires the paired feedback. Yields land in
## storage via the normal drop-off beat.
func complete(action: Dictionary) -> void:
	var id: String = String(action.get("id", ""))
	match id:
		"fire_bone_meal":
			if get_node_or_null("/root/Juice") != null:
				Juice.pop(global_position + Vector3(0, 2.4, 0), "+ BONE MEAL", Palette.WARM_STONE.lerp(Palette.PARCHMENT, 0.40))
				Juice.burst(global_position + Vector3(0, 1.2, 0), Palette.HONEY, 20)
			if get_node_or_null("/root/AudioManager") != null:
				AudioManager.play("pile-hot", -4.0)
			var prog: Node = get_node_or_null("/root/Progression")
			if prog != null and prog.has_method("mark_first_bone_meal"):
				prog.call("mark_first_bone_meal")
		"fire_blood_meal":
			if get_node_or_null("/root/Juice") != null:
				var blood_meal_tint: Color = Palette.CORAL.lerp(Palette.COMPOST, 0.35)
				Juice.pop(global_position + Vector3(0, 2.4, 0), "+ BLOOD MEAL", blood_meal_tint)
				Juice.burst(global_position + Vector3(0, 1.2, 0), blood_meal_tint, 14)
			if get_node_or_null("/root/AudioManager") != null:
				AudioManager.play("pile-hot", -6.0)
		"fire_biochar":
			# Paired feedback — HONEY plume during firing (handled by the
			# _process glow loop while _firing=true), plus a finished-pile
			# chime + dark-biochar particle burst at complete-time.
			if get_node_or_null("/root/Juice") != null:
				var biochar_tint: Color = Palette.COMPOST.lerp(Palette.INK, 0.3)
				Juice.pop(global_position + Vector3(0, 2.4, 0), "+ BIOCHAR", biochar_tint)
				Juice.burst(global_position + Vector3(0, 1.2, 0), Palette.HONEY, 18)
				Juice.burst(global_position + Vector3(0, 0.8, 0), biochar_tint, 12)
			if get_node_or_null("/root/AudioManager") != null:
				AudioManager.play("pile-hot", -5.0)
				AudioManager.play("compost-finish", -8.0)
