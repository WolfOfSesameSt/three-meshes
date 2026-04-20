## Fairy Permaculture — transient build-site ghost.
##
## Spawned by main.gd when the player picks "Build X" from the right-click
## ground menu. Gives the TaskQueue a concrete Node3D target with a
## ghost-outline preview of the final structure, a `display_name()` for
## HUD queue rows, and a `complete()` hook that swaps in the real scene.
##
## This replaces the old _handle_build_action path that instantiated the
## scene immediately + manually set fairy target_pos. That path was
## bypassing the queue entirely and stranding the fairy when another
## task was active. Routing through TaskQueue is consistent with every
## other interaction in the game and inherits FIFO + cancel-all.
extends Node3D

var building_id: StringName = &""
var scene_path: String = ""
var display_label: String = "Build site"
var _ghost_mesh: MeshInstance3D = null
var _pulse_tween: Tween = null


func display_name() -> String:
	return display_label


func set_ghost(id: StringName, path: String, label: String) -> void:
	building_id = id
	scene_path = path
	display_label = label
	_build_ghost_preview()


func _build_ghost_preview() -> void:
	# Low-fi primitive ghost so the player sees "building planned here".
	# A semi-transparent box roughly the footprint of the target scene.
	_ghost_mesh = MeshInstance3D.new()
	var mesh: BoxMesh = BoxMesh.new()
	mesh.size = _ghost_size_for(building_id)
	_ghost_mesh.mesh = mesh
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	var palette: Node = get_node_or_null("/root/Palette")
	var honey: Color = Color(0.95, 0.76, 0.31)
	if palette != null:
		honey = palette.get("HONEY")
	mat.albedo_color = Color(honey.r, honey.g, honey.b, 0.35)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.no_depth_test = false
	_ghost_mesh.material_override = mat
	_ghost_mesh.position.y = mesh.size.y * 0.5
	add_child(_ghost_mesh)
	# Pulse the ghost gently so it reads as "planned / under construction".
	# Store the tween so we can kill it explicitly on complete().
	_pulse_tween = create_tween().set_loops()
	_pulse_tween.tween_property(_ghost_mesh, "scale", Vector3.ONE * 1.04, 0.6).set_trans(Tween.TRANS_SINE)
	_pulse_tween.tween_property(_ghost_mesh, "scale", Vector3.ONE, 0.6).set_trans(Tween.TRANS_SINE)


func _ghost_size_for(id: StringName) -> Vector3:
	match id:
		&"compost_pile":      return Vector3(2.0, 1.2, 2.0)
		&"storage_shed":      return Vector3(3.0, 2.4, 2.4)
		&"sprouting_bed":     return Vector3(2.0, 0.8, 2.0)
		&"chicken_coop":      return Vector3(3.2, 2.2, 3.2)
		&"kiln":              return Vector3(1.8, 1.8, 1.8)
		&"butcher_station":   return Vector3(1.6, 1.6, 1.6)
		&"chipper":           return Vector3(1.8, 1.8, 1.8)
		&"hive":              return Vector3(1.2, 1.2, 1.2)
		&"worm_bin":          return Vector3(1.0, 0.8, 1.0)
		_:                    return Vector3(2.0, 1.4, 2.0)


## Called by TaskQueue after the labor timer finishes. Instantiates the
## real scene at our position and frees this ghost — aggressively, so
## the pulsing translucent box doesn't linger on top of the new build.
func complete(_action: Dictionary) -> void:
	_cleanup_ghost()
	if scene_path == "":
		_self_free()
		return
	var packed: PackedScene = load(scene_path)
	if packed == null:
		push_warning("build_site: failed to load %s" % scene_path)
		_self_free()
		return
	var built: Node3D = packed.instantiate()
	var parent: Node = get_parent()
	if parent == null:
		_self_free()
		return
	parent.add_child(built)
	built.global_position = global_position
	# Mark progression + fire juice.
	var prog: Node = get_node_or_null("/root/Progression")
	if prog != null:
		prog.call("mark_structure_built", building_id)
	var juice: Node = get_node_or_null("/root/Juice")
	if juice != null:
		var palette: Node = get_node_or_null("/root/Palette")
		var honey: Color = Color(0.95, 0.76, 0.31)
		if palette != null:
			honey = palette.get("HONEY")
		juice.call("pop", global_position + Vector3(0, 2.6, 0), "BUILT — " + display_label.to_upper(), honey)
		juice.call("burst", global_position + Vector3(0, 0.6, 0), honey, 22)
	var am: Node = get_node_or_null("/root/AudioManager")
	if am != null:
		am.call("play", "compost-finish", -4.0)
	# Emit main's "clicked" / "hover_changed" connections by re-announcing.
	if parent.has_method("_rebind_interactable"):
		parent.call("_rebind_interactable", built, building_id)
	_self_free()


## Kill the ghost pulse + hide + remove the ghost mesh IMMEDIATELY so the
## translucent pulse doesn't briefly overlay the real building. The
## deferred queue_free on the root happens one frame later.
func _cleanup_ghost() -> void:
	if _pulse_tween != null and _pulse_tween.is_valid():
		_pulse_tween.kill()
	_pulse_tween = null
	if _ghost_mesh != null and is_instance_valid(_ghost_mesh):
		_ghost_mesh.visible = false
		_ghost_mesh.get_parent().remove_child(_ghost_mesh)
		_ghost_mesh.queue_free()
	_ghost_mesh = null


func _self_free() -> void:
	_cleanup_ghost()
	# One-frame deferred free so TaskQueue's bookkeeping finishes cleanly.
	call_deferred("queue_free")
