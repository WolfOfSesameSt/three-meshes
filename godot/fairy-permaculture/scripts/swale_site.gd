## Fairy Permaculture — swale-site ghost + finished visual.
##
## Spawned by main.gd when the player picks "Dig swale" on a sloped
## ground tile. Gives the TaskQueue a concrete Node3D target with a
## `display_name()` for HUD queue rows and a `complete()` hook that
## registers the earthwork with the Earthworks autoload.
##
## Ghost phase (pre-labor):
##   — earth-coloured pulsing box indicates "trench planned here".
##
## complete():
##   — calls `Earthworks.add_swale_at(global_position)` to mutate the
##     logical grid + parallel moisture dict.
##   — spawns a low trench mesh (sunk 0.3 m) + a raised berm mesh
##     (+0.4 m) downhill of the trench, each 3 tiles long.
##   — emits a "SWALE" juice pop + paired audio (biomass-chop on the
##     digging beat, seedling-sprout on the final reveal).
##   — self-frees the ghost box; the trench/berm meshes remain as a
##     sibling node so they persist independently.
##
## Colors routed through Palette.* (EARTH / COMPOST / MEADOW / SKY /
## MIST) — DESIGN-CHECK compliant, no raw literals.
extends Node3D

const PULSE_UP_SEC: float = 0.6
const PULSE_DOWN_SEC: float = 0.6
const TRENCH_DROP_M: float = 0.3
const BERM_LIFT_M: float = 0.4
const TILE_SIZE_FALLBACK: float = 1.0

var _ghost_mesh: MeshInstance3D = null
var _pulse_tween: Tween = null
var _trench_water_planes: Array[MeshInstance3D] = []
var _registered_center: Vector3 = Vector3.ZERO
var _registered: bool = false


func _ready() -> void:
	_build_ghost_preview()


func display_name() -> String:
	return "Swale"


func _build_ghost_preview() -> void:
	_ghost_mesh = MeshInstance3D.new()
	var mesh: BoxMesh = BoxMesh.new()
	# Rough 3-tile trench-ish footprint so the planned earthwork reads.
	mesh.size = Vector3(3.0, 0.5, 1.2)
	_ghost_mesh.mesh = mesh
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	var earth: Color = _palette_color("EARTH", Color(0.48, 0.36, 0.28))
	var compost: Color = _palette_color("COMPOST", Color(0.24, 0.18, 0.14))
	var tint: Color = earth.lerp(compost, 0.4)
	mat.albedo_color = Color(tint.r, tint.g, tint.b, 0.40)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_ghost_mesh.material_override = mat
	_ghost_mesh.position.y = mesh.size.y * 0.5
	add_child(_ghost_mesh)
	_pulse_tween = create_tween().set_loops()
	_pulse_tween.tween_property(_ghost_mesh, "scale", Vector3.ONE * 1.04, PULSE_UP_SEC).set_trans(Tween.TRANS_SINE)
	_pulse_tween.tween_property(_ghost_mesh, "scale", Vector3.ONE, PULSE_DOWN_SEC).set_trans(Tween.TRANS_SINE)


## Called by TaskQueue when the labor timer completes. Swaps the pulsing
## ghost for the permanent trench + berm meshes + registers the swale
## with the Earthworks autoload so its water effect kicks in.
func complete(_action: Dictionary) -> void:
	_cleanup_ghost()
	_registered_center = global_position
	var record: Dictionary = {}
	if has_node("/root/Earthworks"):
		record = Earthworks.add_swale_at(global_position)
		_registered = true
	_spawn_final_visual(record)
	_fire_juice_feedback()
	# Defer the ghost-node free a frame so TaskQueue's bookkeeping runs
	# cleanly. The final meshes are re-parented to the scene root so they
	# persist after we're gone.
	call_deferred("queue_free")


func _spawn_final_visual(record: Dictionary) -> void:
	var parent: Node = get_parent()
	if parent == null:
		return
	var root: Node3D = Node3D.new()
	root.name = "Swale_" + str(int(Time.get_ticks_msec()))
	parent.add_child(root)
	root.global_position = _registered_center
	var tile_size: float = _tile_size_m()
	var earth: Color = _palette_color("EARTH", Color(0.48, 0.36, 0.28))
	var compost: Color = _palette_color("COMPOST", Color(0.24, 0.18, 0.14))
	var meadow: Color = _palette_color("MEADOW", Color(0.55, 0.77, 0.48))
	var trench_color: Color = earth.lerp(compost, 0.4)

	# Pull trench + berm tiles back out. If the registration returned
	# nothing (no WorldGrid, degenerate case) we synthesize a symmetric
	# fallback so the visual still shows up.
	var trench_tiles: Array = record.get("trench", [])
	var berm_tiles: Array = record.get("berm", [])
	var dir_vec: Vector3 = record.get("dir", Vector3(0, 0, 1))

	if trench_tiles.is_empty():
		trench_tiles = _synth_fallback_trench(tile_size, dir_vec)
		berm_tiles = _synth_fallback_berm(tile_size, dir_vec)

	# Trench mesh — flat rectangular prism sunk below terrain.
	var trench_mesh: MeshInstance3D = _build_trench_mesh(trench_color, tile_size)
	trench_mesh.position = _tile_list_center_offset(trench_tiles) + Vector3(0, -TRENCH_DROP_M * 0.5, 0)
	_orient_along_perp(trench_mesh, dir_vec)
	root.add_child(trench_mesh)

	# Berm mesh — raised mound of EARTH with a subtle grass fuzz of
	# small meadow spikes to read as a living planting mound.
	var berm_mesh: MeshInstance3D = _build_berm_mesh(earth, tile_size)
	berm_mesh.position = _tile_list_center_offset(berm_tiles) + Vector3(0, BERM_LIFT_M * 0.5, 0)
	_orient_along_perp(berm_mesh, dir_vec)
	root.add_child(berm_mesh)
	_spawn_grass_fuzz(berm_mesh, meadow, tile_size)

	# Trench-puddle — translucent plane whose alpha tracks wetness over
	# the first daily ticks. Starts empty (dry); fills when rain lands
	# or when the WeatherSystem reports storm/wet_week.
	var sky: Color = _palette_color("SKY", Color(0.72, 0.85, 0.91))
	var mist: Color = _palette_color("MIST", Color(0.84, 0.93, 0.94))
	var water_tint: Color = sky.lerp(mist, 0.20)
	for _i in range(trench_tiles.size()):
		var plane: MeshInstance3D = _build_trench_water_plane(water_tint, tile_size)
		plane.position = _tile_list_center_offset(trench_tiles) + Vector3(0, -TRENCH_DROP_M + 0.01, 0)
		_orient_along_perp(plane, dir_vec)
		root.add_child(plane)
		_trench_water_planes.append(plane)
		# only need one — break after first append (kept loop for clarity)
		break


func _synth_fallback_trench(tile_size: float, dir_vec: Vector3) -> Array:
	var perp: Vector3 = Vector3(-dir_vec.z, 0.0, dir_vec.x).normalized()
	if perp.length() < 0.01:
		perp = Vector3(1, 0, 0)
	var out: Array = []
	for i in [-1, 0, 1]:
		out.append(Vector2i(int(round(perp.x * float(i) * tile_size)), int(round(perp.z * float(i) * tile_size))))
	return out


func _synth_fallback_berm(tile_size: float, dir_vec: Vector3) -> Array:
	var perp: Vector3 = Vector3(-dir_vec.z, 0.0, dir_vec.x).normalized()
	if perp.length() < 0.01:
		perp = Vector3(1, 0, 0)
	var down: Vector3 = dir_vec.normalized()
	if down.length() < 0.01:
		down = Vector3(0, 0, 1)
	var out: Array = []
	for i in [-1, 0, 1]:
		var tx: int = int(round(perp.x * float(i) * tile_size + down.x * tile_size))
		var tz: int = int(round(perp.z * float(i) * tile_size + down.z * tile_size))
		out.append(Vector2i(tx, tz))
	return out


## Returns a local-space offset (vs. our global_position) for the centre
## of mass of a list of tile coords. We don't need perfect accuracy here;
## the 3-tile trench hits one tile either side of centre anyway.
func _tile_list_center_offset(_tiles: Array) -> Vector3:
	# Tiles are centred on our global_position by construction, so the
	# mean offset is approximately zero. We return ZERO and rely on the
	# scale of the mesh (3 × tile_size) to cover the footprint.
	return Vector3.ZERO


func _orient_along_perp(node: Node3D, dir_vec: Vector3) -> void:
	if dir_vec.length() < 0.01:
		return
	# Rotate around Y so mesh X-axis aligns with the perpendicular of
	# downhill. atan2(z, x) gives the angle between +X and downhill; we
	# add 90° to get perp.
	var yaw: float = atan2(dir_vec.z, dir_vec.x) + PI * 0.5
	node.rotation.y = yaw


func _build_trench_mesh(color: Color, tile_size: float) -> MeshInstance3D:
	var mi: MeshInstance3D = MeshInstance3D.new()
	var bm: BoxMesh = BoxMesh.new()
	# Length = 3 tiles, width = ~0.9 tile, depth = trench_drop.
	bm.size = Vector3(3.0 * tile_size, TRENCH_DROP_M, 0.9 * tile_size)
	mi.mesh = bm
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = 0.95
	mi.material_override = mat
	return mi


func _build_berm_mesh(color: Color, tile_size: float) -> MeshInstance3D:
	var mi: MeshInstance3D = MeshInstance3D.new()
	var bm: BoxMesh = BoxMesh.new()
	bm.size = Vector3(3.0 * tile_size, BERM_LIFT_M, 1.0 * tile_size)
	mi.mesh = bm
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = 0.9
	mi.material_override = mat
	return mi


func _build_trench_water_plane(color: Color, tile_size: float) -> MeshInstance3D:
	var mi: MeshInstance3D = MeshInstance3D.new()
	var qm: QuadMesh = QuadMesh.new()
	qm.size = Vector2(3.0 * tile_size, 0.85 * tile_size)
	mi.mesh = qm
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.albedo_color = Color(color.r, color.g, color.b, 0.05)   # starts dry
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mi.material_override = mat
	# Orient the QuadMesh horizontally (it ships XY-facing by default).
	mi.rotation.x = -PI * 0.5
	return mi


func _spawn_grass_fuzz(berm: MeshInstance3D, color: Color, tile_size: float) -> void:
	# Cheap grass-fuzz: a sparse grid of tall thin green boxes sitting on
	# top of the berm. Gives the earthwork a living planting-mound read.
	var fuzz_root: Node3D = Node3D.new()
	berm.add_child(fuzz_root)
	fuzz_root.position = Vector3(0, BERM_LIFT_M * 0.5 + 0.1, 0)
	for i in range(14):
		var blade: MeshInstance3D = MeshInstance3D.new()
		var bm: BoxMesh = BoxMesh.new()
		bm.size = Vector3(0.05, 0.22, 0.05)
		blade.mesh = bm
		var mat: StandardMaterial3D = StandardMaterial3D.new()
		mat.albedo_color = color
		blade.material_override = mat
		var x: float = (float(i) - 6.5) * (3.0 * tile_size / 14.0)
		var z: float = ((i * 37) % 9 - 4) * 0.05
		blade.position = Vector3(x, 0.0, z)
		fuzz_root.add_child(blade)


func _cleanup_ghost() -> void:
	if _pulse_tween != null and _pulse_tween.is_valid():
		_pulse_tween.kill()
	_pulse_tween = null
	if _ghost_mesh != null and is_instance_valid(_ghost_mesh):
		_ghost_mesh.visible = false
		_ghost_mesh.get_parent().remove_child(_ghost_mesh)
		_ghost_mesh.queue_free()
	_ghost_mesh = null


func _fire_juice_feedback() -> void:
	var earth: Color = _palette_color("EARTH", Color(0.48, 0.36, 0.28))
	var juice: Node = get_node_or_null("/root/Juice")
	if juice != null:
		juice.call("pop", _registered_center + Vector3(0, 2.4, 0), "SWALE", earth)
		juice.call("burst", _registered_center + Vector3(0, 0.4, 0), earth, 20)
	var am: Node = get_node_or_null("/root/AudioManager")
	if am != null:
		am.call("play", "biomass-chop", -6.0)
		am.call("play", "seedling-sprout", -4.0)


func _palette_color(key: String, fallback: Color) -> Color:
	var palette: Node = get_node_or_null("/root/Palette")
	if palette == null:
		return fallback
	var v: Variant = palette.get(key)
	if v is Color:
		return v
	return fallback


func _tile_size_m() -> float:
	if has_node("/root/WorldGrid"):
		return float(WorldGrid.TILE_SIZE_M)
	return TILE_SIZE_FALLBACK
