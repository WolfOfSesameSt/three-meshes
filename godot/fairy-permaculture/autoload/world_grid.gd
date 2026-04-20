## Fairy Permaculture — tile grid, heightfield, water CA.
##
## Source of truth for the world's terrain. A 2D array of Tile records
## drives:
##   - Chunked ArrayMesh heightfield rendering (vertex-color ground).
##   - A water overlay mesh rebuilt on day-tick from tiles flagged
##     persistent-water (stream, pond) PLUS transient surface water
##     above a threshold. The persistent flag means the stream never
##     "disappears" between CA ticks even if infiltration temporarily
##     drains the channel.
##   - A simple cellular-automaton water simulation (rain, infiltration,
##     downhill spill, evaporation). Persistent-water tiles are
##     immune to depth drain — rain adds, evap caps at `base_depth_cm`.
##   - A `sample_height(world_pos)` helper so in-scene objects (compost
##     pile, sprouting bed, fairy, plants, decor) can snap their Y to
##     the terrain surface.
##   - Helper APIs so spawners avoid placing things in water:
##     `is_water_tile`, `tile_material_at`, `suggest_spawn_pos_in_radius`.
##
## Registered as an autoload singleton (`WorldGrid`). The Main scene
## asks it to build the terrain + attach chunks on first frame.
extends Node

## Tile record. Fields match the worldgen + design spec.
class Tile:
	var elevation_m: float = 0.0
	var moisture: float = 0.3
	var surface_water_cm: float = 0.0
	var om_pct: float = 2.0
	var material: String = "loam"
	var sun_exposure: float = 1.0
	## Persistent-water marker. stream_bed + pond tiles set this.
	## A persistent-water tile always renders water; its depth drifts
	## between base_depth and base_depth + rain accumulation.
	var is_persistent_water: bool = false
	## Baseline depth for persistent-water tiles (cm).
	var base_water_depth_cm: float = 0.0


signal tiles_updated()
signal terrain_built()

## World size in tiles. 128 × 128 is the MVP target (500 × 500 is the
## design-doc end-state, but we start smaller for fast iteration).
const GRID_SIZE: int = 128
const TILE_SIZE_M: float = 1.0
const CHUNK_SIZE: int = 32  # tiles per side per chunk (16 chunks total)
const WORLD_HALF_M: float = GRID_SIZE * TILE_SIZE_M * 0.5

# Rain / infiltration / evap tunables.
const BASE_FIELD_CAPACITY: float = 0.35
const INFILTRATION_RATE_PER_DAY: float = 0.8   # cm of surface water absorbed per day
const EVAP_BASE_CM_PER_DAY: float = 0.5        # bumped from 0.25 — net-zero daily vs spring rain
# Hard ceiling on non-persistent-water tiles' surface water. Represents
# runoff off the tile — real soil can't hold a pond on flat ground, it
# sheds toward streams + off the map edge. Without this the whole grid
# slowly pooled up to the render threshold over ~7 game-days of spring.
const RUNOFF_CEILING_CM: float = 2.0
# Minimum surface water before the translucent water mesh renders the
# tile as "flooded". Raises from 1 cm to 3 cm so transient puddles from
# a single rain event don't turn the whole map blue.
const WATER_RENDER_THRESHOLD_CM: float = 3.0
const FLOW_CAP_FRACTION: float = 0.45          # max fraction of tile water that can leave per tick
const MIN_FLOW_HEAD_CM: float = 0.5            # below this head we don't bother moving water
const TRANSIENT_WATER_THRESHOLD_CM: float = 1.8  # raised from 1.0 — prevents "whole map floods" at saturation
const PERSISTENT_STREAM_BASE_DEPTH_CM: float = 25.0

# Visual palette for soil-by-OM (interpolated).
const SOIL_BARREN := Color(0.46, 0.42, 0.34)    # grey-brown, 0% OM
const SOIL_MEADOW := Color(0.36, 0.52, 0.28)    # meadow green, ~5%
const SOIL_LUSH := Color(0.25, 0.44, 0.22)      # deep green, 10%+
const SOIL_STREAM_BED := Color(0.42, 0.38, 0.28) # warm wet-pebble brown

# Elevation-based contour tint. High ground biases darker, low bright.
const CONTOUR_HIGH_TINT := Color(0.94, 0.94, 0.94)  # multiplied in — darkens (softened; ±22% was patchy)
const CONTOUR_LOW_TINT := Color(1.06, 1.06, 1.06)   # multiplied in — brightens

var tiles: Array = []              # Tile[z][x]
var _chunks: Array = []            # {mesh: MeshInstance3D, body: StaticBody3D, shape: CollisionShape3D}
var _water_mesh_instance: MeshInstance3D
var _water_mesh: ArrayMesh
var _water_mat: ShaderMaterial
var _terrain_material: StandardMaterial3D
var _terrain_root: Node3D
var _built: bool = false

# Cached min/max elevation across the whole grid, used for the contour
# tint normalization and for logging.
var _min_elev_m: float = 0.0
var _max_elev_m: float = 0.0


func _ready() -> void:
	_generate_tiles()
	Scheduler.day_advanced.connect(_on_day_advanced)


## Build the chunk MeshInstance3D / StaticBody3D children under `parent_node`.
## Called once by the Main scene after its own _ready(). Re-entry safe.
func attach_to_scene(parent_node: Node) -> void:
	if _built:
		return
	_terrain_root = Node3D.new()
	_terrain_root.name = "TerrainChunks"
	parent_node.add_child(_terrain_root)

	_terrain_material = StandardMaterial3D.new()
	_terrain_material.vertex_color_use_as_albedo = true
	_terrain_material.roughness = 0.95
	_terrain_material.metallic = 0.0

	var chunks_per_side: int = GRID_SIZE / CHUNK_SIZE
	for cz in range(chunks_per_side):
		for cx in range(chunks_per_side):
			var chunk: Dictionary = _build_chunk(cx, cz)
			_chunks.append(chunk)
			_terrain_root.add_child(chunk["mesh"])
			_terrain_root.add_child(chunk["body"])

	# Water overlay.
	_water_mesh_instance = MeshInstance3D.new()
	_water_mesh_instance.name = "WaterOverlay"
	_water_mat = _build_water_material()
	_water_mesh_instance.material_override = _water_mat
	_water_mesh_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_terrain_root.add_child(_water_mesh_instance)

	_rebuild_water_mesh()
	_built = true
	emit_signal("terrain_built")


## World-pos → terrain elevation (meters). Raycasts are expensive and
## not yet set up in-scene when called during _ready(), so we sample
## the tile grid directly via bilinear lookup.
func sample_height(world_pos: Vector3) -> float:
	var tx: float = (world_pos.x + WORLD_HALF_M) / TILE_SIZE_M
	var tz: float = (world_pos.z + WORLD_HALF_M) / TILE_SIZE_M
	return _sample_elevation_bilinear(tx, tz)


## True if the tile under `world_pos` is a streambed or pond (persistent
## water). Used by spawners (plants, decor) to avoid dropping objects
## into the channel.
func is_water_tile(world_pos: Vector3) -> bool:
	var t: Tile = _tile_at_world(world_pos)
	if t == null:
		return false
	return t.is_persistent_water or t.material == "stream_bed" or t.material == "pond"


## Returns the material label at `world_pos` ("stream_bed" / "pond" /
## "bank" / "meadow" / "forest_floor" / "bare" / "loam" fallback).
func tile_material_at(world_pos: Vector3) -> String:
	var t: Tile = _tile_at_world(world_pos)
	if t == null:
		return "bare"
	return t.material


## Bump the organic-matter percent of the tile under `world_pos`. Used
## by chop-and-drop to deposit mulch directly on the tile (instead of
## carrying plant_trim back to storage). Returns the new OM value, or
## 0.0 if the position is off-grid. Clamps to 20 % (climax ceiling).
func add_tile_om(world_pos: Vector3, delta: float) -> float:
	var t: Tile = _tile_at_world(world_pos)
	if t == null:
		return 0.0
	t.om_pct = clamp(t.om_pct + delta, 0.0, 20.0)
	emit_signal("tiles_updated")
	return t.om_pct


## Pick a dry spawn position within `radius_m` of `center`. Returns
## `Vector3.ZERO` if no non-water tile was found in `attempts` tries.
## The returned position has its Y pre-snapped to terrain elevation, so
## callers can use it directly without a second sample_height call.
func suggest_spawn_pos_in_radius(center: Vector3, radius_m: float, attempts: int = 16) -> Vector3:
	for _i in range(attempts):
		var angle: float = randf() * TAU
		var r: float = sqrt(randf()) * radius_m
		var candidate: Vector3 = Vector3(center.x + cos(angle) * r, 0.0, center.z + sin(angle) * r)
		if is_water_tile(candidate):
			continue
		candidate.y = sample_height(candidate)
		return candidate
	return Vector3.ZERO


## Force a rain event NOW and refresh visuals. Used from the debug
## cheat and the daily rain schedule. Runs several infiltration + flow
## passes so puddles visibly migrate into low spots instead of sitting
## everywhere the rain landed.
func debug_rain(rain_mm: float) -> void:
	_add_rain(rain_mm)
	for _i in range(6):
		_infiltrate_and_evaporate()
		_flow_water()
	_rebuild_water_mesh()
	emit_signal("tiles_updated")


## Read-only accessor used by WorldState to compute vitality.
func average_om_pct() -> float:
	var total: float = 0.0
	var n: int = 0
	for z in range(GRID_SIZE):
		var row: Array = tiles[z]
		for x in range(GRID_SIZE):
			total += (row[x] as Tile).om_pct
			n += 1
	if n == 0:
		return 0.0
	return total / float(n)


# ---------- Internals ----------

func _generate_tiles() -> void:
	# Seeds are channel-split via WorldSeed so a shared seed reproduces
	# the same terrain + undulation + stream across runs. Defensive null-
	# check lets headless sims that skip WorldSeed fall back to the old
	# fixed seeds.
	var ws: Node = get_node_or_null("/root/WorldSeed")
	var noise: FastNoiseLite = FastNoiseLite.new()
	noise.seed = ws.get_channel_seed("terrain") if (ws != null and ws.has_method("get_channel_seed")) else 1337
	noise.noise_type = FastNoiseLite.TYPE_SIMPLEX
	noise.frequency = 0.02

	var undulation_noise: FastNoiseLite = FastNoiseLite.new()
	undulation_noise.seed = ws.get_channel_seed("undulation") if (ws != null and ws.has_method("get_channel_seed")) else 9173
	undulation_noise.noise_type = FastNoiseLite.TYPE_SIMPLEX
	undulation_noise.frequency = 0.04

	var stream_noise: FastNoiseLite = FastNoiseLite.new()
	stream_noise.seed = ws.get_channel_seed("stream") if (ws != null and ws.has_method("get_channel_seed")) else 4242
	stream_noise.noise_type = FastNoiseLite.TYPE_SIMPLEX
	stream_noise.frequency = 0.015

	var min_e: float = INF
	var max_e: float = -INF

	tiles.resize(GRID_SIZE)
	for z in range(GRID_SIZE):
		var row: Array = []
		row.resize(GRID_SIZE)
		for x in range(GRID_SIZE):
			var tile: Tile = Tile.new()

			# Primary NW-to-SE coastal slope. The design spec asks for
			# a 6–9 m peak-to-trough swing across the 128-tile grid,
			# gentler in the homestead zone (center 40×40) and steeper
			# toward the forest edge.
			var tx: float = float(x) / float(GRID_SIZE - 1)
			var tz: float = float(z) / float(GRID_SIZE - 1)
			# Normalized "distance from center" in [0..1].
			var dx_center: float = abs(tx - 0.5) * 2.0
			var dz_center: float = abs(tz - 0.5) * 2.0
			var dist_center: float = clamp(max(dx_center, dz_center), 0.0, 1.0)
			# Homestead square ≈ center 40 tiles ≈ 0.3 radius.
			var homestead_k: float = clamp((dist_center - 0.3) / 0.7, 0.0, 1.0)
			# Edge amplifier: smoothstep-ish curve so gradient ramps
			# gently inside the homestead and steeply at the rim.
			var edge_amp: float = homestead_k * homestead_k * (3.0 - 2.0 * homestead_k)
			# Raw NW→SE ramp in [0..1]: 1 at NW corner, 0 at SE corner.
			var ramp: float = 1.0 - 0.5 * (tx + tz)
			# Inner homestead: 2 m swing. Outer edge: adds up to 5 m on
			# top, yielding ~7 m peak-to-trough overall.
			var slope_h: float = ramp * 2.0 + edge_amp * ramp * 5.0

			# FastNoiseLite undulation — 0.8..1.2 m amplitude on top.
			var undulation: float = undulation_noise.get_noise_2d(float(x), float(z)) * 1.1

			# Visible ridge perpendicular to the stream. The stream
			# runs roughly along the z == x diagonal, so a ridge on
			# z + x ≈ 0.75 * GRID_SIZE (placed between homestead and
			# SE edge) reads as a natural spine. Use a narrow 2-tile
			# gaussian at ~2.5 m spike above baseline.
			var ridge_axis: float = (float(x) + float(z)) - 0.75 * float(GRID_SIZE - 1)
			var ridge_dist: float = abs(ridge_axis)
			var ridge_spike: float = 0.0
			if ridge_dist < 6.0:
				var k: float = 1.0 - (ridge_dist / 6.0)
				ridge_spike = 2.5 * k * k

			# Winding stream channel carved along the diagonal.
			var diag: float = (float(x) + float(z)) * 0.5
			var channel_offset: float = stream_noise.get_noise_2d(diag, 0.0) * 14.0
			var channel_axis: float = float(z) - float(x) + channel_offset
			var dist_to_stream: float = abs(channel_axis)
			var channel_drop: float = 0.0
			if dist_to_stream < 2.0:
				# Soft valley 2 tiles wide with a steeper interior trench.
				var k2: float = 1.0 - (dist_to_stream / 2.0)
				channel_drop = -0.6 * k2 * k2
				tile.material = "stream_bed"
				tile.moisture = 0.9
				tile.om_pct = 1.2  # rocky streambed, low OM
				tile.is_persistent_water = true
				tile.base_water_depth_cm = PERSISTENT_STREAM_BASE_DEPTH_CM
			elif dist_to_stream < 4.0:
				var k3: float = 1.0 - ((dist_to_stream - 2.0) / 2.0)
				channel_drop = -0.15 * k3
				tile.material = "bank"
				tile.moisture = 0.6
				tile.om_pct = 3.0
			else:
				tile.material = "meadow"
				tile.moisture = 0.3 + 0.1 * noise.get_noise_2d(float(x) + 99.0, float(z) + 99.0)
				tile.om_pct = 2.0 + 1.5 * max(0.0, noise.get_noise_2d(float(x) - 11.0, float(z) - 11.0))

			# Suppress the ridge inside the stream channel so it doesn't
			# fight the water.
			if dist_to_stream < 3.0:
				ridge_spike = 0.0

			tile.elevation_m = slope_h + undulation + ridge_spike + channel_drop

			# Seed persistent depth so water renders immediately.
			if tile.is_persistent_water:
				tile.surface_water_cm = tile.base_water_depth_cm

			min_e = min(min_e, tile.elevation_m)
			max_e = max(max_e, tile.elevation_m)

			row[x] = tile
		tiles[z] = row

	_min_elev_m = min_e
	_max_elev_m = max_e
	GameLog.info(
		"terrain elevation range %.2f m to %.2f m (swing %.2f m)" % [
			_min_elev_m,
			_max_elev_m,
			_max_elev_m - _min_elev_m,
		],
		"world_grid",
	)


func _build_chunk(cx: int, cz: int) -> Dictionary:
	var mesh_inst: MeshInstance3D = MeshInstance3D.new()
	mesh_inst.name = "Chunk_%d_%d" % [cx, cz]
	mesh_inst.mesh = _build_chunk_mesh(cx, cz)
	mesh_inst.material_override = _terrain_material
	mesh_inst.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON

	var body: StaticBody3D = StaticBody3D.new()
	body.name = "ChunkBody_%d_%d" % [cx, cz]
	var shape: CollisionShape3D = CollisionShape3D.new()
	var height_shape: HeightMapShape3D = HeightMapShape3D.new()
	height_shape.map_width = CHUNK_SIZE + 1
	height_shape.map_depth = CHUNK_SIZE + 1
	var heights: PackedFloat32Array = PackedFloat32Array()
	heights.resize((CHUNK_SIZE + 1) * (CHUNK_SIZE + 1))
	var i: int = 0
	for lz in range(CHUNK_SIZE + 1):
		for lx in range(CHUNK_SIZE + 1):
			var gx: int = clamp(cx * CHUNK_SIZE + lx, 0, GRID_SIZE - 1)
			var gz: int = clamp(cz * CHUNK_SIZE + lz, 0, GRID_SIZE - 1)
			heights[i] = (tiles[gz][gx] as Tile).elevation_m
			i += 1
	height_shape.map_data = heights
	shape.shape = height_shape

	# HeightMapShape3D is centered at the chunk origin in XZ; offset the
	# body so its center aligns with the chunk's world center.
	var chunk_origin_x: float = cx * CHUNK_SIZE * TILE_SIZE_M - WORLD_HALF_M
	var chunk_origin_z: float = cz * CHUNK_SIZE * TILE_SIZE_M - WORLD_HALF_M
	var chunk_center_x: float = chunk_origin_x + (CHUNK_SIZE * TILE_SIZE_M) * 0.5
	var chunk_center_z: float = chunk_origin_z + (CHUNK_SIZE * TILE_SIZE_M) * 0.5
	body.position = Vector3(chunk_center_x, 0.0, chunk_center_z)
	body.add_child(shape)

	return {"mesh": mesh_inst, "body": body, "shape": shape, "cx": cx, "cz": cz}


## Build an ArrayMesh for one chunk. CHUNK_SIZE × CHUNK_SIZE quads,
## two triangles each. Vertex colors tint by OM% with a subtle
## elevation contour modulation so slope reads even on flat shading.
func _build_chunk_mesh(cx: int, cz: int) -> ArrayMesh:
	var vertices: PackedVector3Array = PackedVector3Array()
	var normals: PackedVector3Array = PackedVector3Array()
	var colors: PackedColorArray = PackedColorArray()
	var uvs: PackedVector2Array = PackedVector2Array()
	var indices: PackedInt32Array = PackedInt32Array()

	var verts_side: int = CHUNK_SIZE + 1
	vertices.resize(verts_side * verts_side)
	normals.resize(verts_side * verts_side)
	colors.resize(verts_side * verts_side)
	uvs.resize(verts_side * verts_side)

	var elev_range: float = max(0.001, _max_elev_m - _min_elev_m)

	for lz in range(verts_side):
		for lx in range(verts_side):
			var gx: int = clamp(cx * CHUNK_SIZE + lx, 0, GRID_SIZE - 1)
			var gz: int = clamp(cz * CHUNK_SIZE + lz, 0, GRID_SIZE - 1)
			var tile: Tile = tiles[gz][gx]
			var wx: float = gx * TILE_SIZE_M - WORLD_HALF_M
			var wz: float = gz * TILE_SIZE_M - WORLD_HALF_M
			var vi: int = lz * verts_side + lx
			vertices[vi] = Vector3(wx, tile.elevation_m, wz)
			uvs[vi] = Vector2(float(lx) / float(CHUNK_SIZE), float(lz) / float(CHUNK_SIZE))
			# Contour shading: normalized height in [0..1], lerp between
			# a brighter low-ground tint and a darker high-ground tint so
			# slope reads even in cel-shaded flat lighting.
			var height_t: float = clamp((tile.elevation_m - _min_elev_m) / elev_range, 0.0, 1.0)
			var tint_mul: Color = CONTOUR_LOW_TINT.lerp(CONTOUR_HIGH_TINT, height_t)
			var base: Color = _soil_color(tile)
			base.r = clamp(base.r * tint_mul.r, 0.0, 1.0)
			base.g = clamp(base.g * tint_mul.g, 0.0, 1.0)
			base.b = clamp(base.b * tint_mul.b, 0.0, 1.0)
			colors[vi] = base

	# Compute normals via cross-product of neighbor deltas.
	for lz in range(verts_side):
		for lx in range(verts_side):
			var vi: int = lz * verts_side + lx
			var h_l: float = vertices[lz * verts_side + max(0, lx - 1)].y
			var h_r: float = vertices[lz * verts_side + min(verts_side - 1, lx + 1)].y
			var h_d: float = vertices[max(0, lz - 1) * verts_side + lx].y
			var h_u: float = vertices[min(verts_side - 1, lz + 1) * verts_side + lx].y
			var n: Vector3 = Vector3(h_l - h_r, 2.0 * TILE_SIZE_M, h_d - h_u).normalized()
			normals[vi] = n

	for lz in range(CHUNK_SIZE):
		for lx in range(CHUNK_SIZE):
			var a: int = lz * verts_side + lx
			var b: int = lz * verts_side + lx + 1
			var c: int = (lz + 1) * verts_side + lx
			var d: int = (lz + 1) * verts_side + lx + 1
			# CCW winding as seen from above (+Y) so CULL_BACK keeps the
			# top surface, culls the bottom. Backwards indices made the
			# entire terrain render face-down → invisible from iso camera.
			indices.append(a); indices.append(b); indices.append(c)
			indices.append(b); indices.append(d); indices.append(c)

	var arrays: Array = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_COLOR] = colors
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_INDEX] = indices

	var mesh: ArrayMesh = ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return mesh


func _soil_color(tile: Tile) -> Color:
	if tile.material == "stream_bed":
		return SOIL_STREAM_BED
	var om: float = tile.om_pct
	if om <= 5.0:
		return SOIL_BARREN.lerp(SOIL_MEADOW, clamp(om / 5.0, 0.0, 1.0))
	return SOIL_MEADOW.lerp(SOIL_LUSH, clamp((om - 5.0) / 5.0, 0.0, 1.0))


## Translucent water shader. Two-color depth mix, fresnel, a 3D-noise
## normal ripple so the surface reads as fluid instead of a flat plane,
## a subtle caustic shimmer, and vertex Y wobble for visible motion.
## depth_draw_opaque + blend_mix gives correct alpha sorting against
## the terrain below.
func _build_water_material() -> ShaderMaterial:
	# User picked Toon banded + Ghibli stream in the Dev Lab (2026-04-19).
	# Hybrid shader: 3-band cel by view angle + Ghibli flowing sparkles.
	# Opaque + unshaded to sidestep the Godot 4.6 GL Compatibility black-
	# rectangle bug where ALPHA or blend_mix makes surfaces invisible.
	var sm: ShaderMaterial = ShaderMaterial.new()
	var shader: Shader = Shader.new()
	shader.code = """
shader_type spatial;
render_mode unshaded;

float hash21(vec2 p) {
	p = fract(p * vec2(127.1, 311.7));
	p += dot(p, p + 17.17);
	return fract(p.x * p.y);
}

void vertex() {
	VERTEX.y += 0.03 * sin(TIME * 1.1 + VERTEX.x * 0.7 + VERTEX.z * 0.5);
}

void fragment() {
	vec3 band_a = vec3(0.62, 0.90, 0.95);
	vec3 band_b = vec3(0.35, 0.68, 0.78);
	vec3 band_c = vec3(0.18, 0.44, 0.58);
	float ndv = clamp(abs(dot(NORMAL, VIEW)), 0.0, 1.0);
	vec3 col = band_a;
	if (ndv < 0.78) col = band_b;
	if (ndv < 0.52) col = band_c;
	vec2 flow_uv = vec2(VERTEX.x * 0.7, VERTEX.z * 0.7) + vec2(0.0, -TIME * 0.12);
	vec2 cell = floor(flow_uv * 6.0);
	vec2 gv = fract(flow_uv * 6.0) - 0.5;
	float r = hash21(cell);
	float twinkle = sin(TIME * 2.2 + r * 12.0);
	float pop = smoothstep(0.6, 0.98, twinkle) * step(r, 0.35);
	float sparkle = smoothstep(0.20, 0.04, length(gv)) * pop;
	col = mix(col, vec3(1.0, 1.0, 1.0), sparkle);
	ALBEDO = col;
}
"""
	sm.shader = shader
	return sm


func _sample_elevation_bilinear(tx: float, tz: float) -> float:
	var x0: int = clamp(int(floor(tx)), 0, GRID_SIZE - 1)
	var z0: int = clamp(int(floor(tz)), 0, GRID_SIZE - 1)
	var x1: int = clamp(x0 + 1, 0, GRID_SIZE - 1)
	var z1: int = clamp(z0 + 1, 0, GRID_SIZE - 1)
	var fx: float = tx - float(x0)
	var fz: float = tz - float(z0)
	var h00: float = (tiles[z0][x0] as Tile).elevation_m
	var h10: float = (tiles[z0][x1] as Tile).elevation_m
	var h01: float = (tiles[z1][x0] as Tile).elevation_m
	var h11: float = (tiles[z1][x1] as Tile).elevation_m
	var hx0: float = lerp(h00, h10, fx)
	var hx1: float = lerp(h01, h11, fx)
	return lerp(hx0, hx1, fz)


func _tile_at_world(world_pos: Vector3) -> Tile:
	var tx: int = int(round((world_pos.x + WORLD_HALF_M) / TILE_SIZE_M))
	var tz: int = int(round((world_pos.z + WORLD_HALF_M) / TILE_SIZE_M))
	if tx < 0 or tz < 0 or tx >= GRID_SIZE or tz >= GRID_SIZE:
		return null
	return tiles[tz][tx] as Tile


# ---------- Water CA ----------

func _on_day_advanced(_day: int, season: String, _year: int) -> void:
	var rain_mm: float = _season_rain(season)
	_add_rain(rain_mm)
	_infiltrate_and_evaporate()
	_flow_water()
	_rebuild_water_mesh()
	emit_signal("tiles_updated")


func _season_rain(season: String) -> float:
	# BC coastal: wet winters (~8mm avg daily), dry summers (~1mm).
	match season:
		"winter":
			return 6.0 + randf() * 6.0
		"spring":
			return 2.0 + randf() * 4.0
		"summer":
			return randf() * 2.0
		"autumn":
			return 3.0 + randf() * 5.0
		_:
			return 2.0


func _add_rain(rain_mm: float) -> void:
	if rain_mm <= 0.0:
		return
	var cm: float = rain_mm * 0.1
	for z in range(GRID_SIZE):
		var row: Array = tiles[z]
		for x in range(GRID_SIZE):
			(row[x] as Tile).surface_water_cm += cm


## Infiltration + evaporation pass. Persistent-water tiles have a
## floor — their `surface_water_cm` never drops below `base_water_depth_cm`,
## so the stream channel stays visible even during a drought.
func _infiltrate_and_evaporate() -> void:
	for z in range(GRID_SIZE):
		var row: Array = tiles[z]
		for x in range(GRID_SIZE):
			var tile: Tile = row[x]
			# Infiltration — soil absorbs surface water until FC reached.
			var fc: float = BASE_FIELD_CAPACITY + tile.om_pct * 0.03
			var capacity_left: float = max(0.0, fc - tile.moisture)
			var absorbed: float = min(INFILTRATION_RATE_PER_DAY, tile.surface_water_cm)
			absorbed = min(absorbed, capacity_left * 10.0)  # 1 unit moisture ≈ 10 cm
			tile.surface_water_cm -= absorbed
			tile.moisture = clamp(tile.moisture + absorbed * 0.1, 0.0, 1.0)
			# Evaporation.
			var evap_mod: float = clamp(tile.sun_exposure, 0.4, 1.2)
			tile.surface_water_cm = max(0.0, tile.surface_water_cm - EVAP_BASE_CM_PER_DAY * evap_mod)
			tile.moisture = max(0.0, tile.moisture - 0.01 * evap_mod)
			# Runoff ceiling — real flat soil can't hold more than a few cm
			# before it sheets off toward lower ground + the map edge. Any
			# excess above the ceiling just drains. Persistent-water tiles
			# are exempt (they're ponds/streams by definition).
			if not tile.is_persistent_water and tile.surface_water_cm > RUNOFF_CEILING_CM:
				tile.surface_water_cm = RUNOFF_CEILING_CM
			# Persistent-water floor — stream/pond stays wet regardless.
			if tile.is_persistent_water and tile.surface_water_cm < tile.base_water_depth_cm:
				tile.surface_water_cm = tile.base_water_depth_cm


func _flow_water() -> void:
	# Compute deltas in a scratch buffer so this pass is order-independent.
	var deltas: Array = []
	deltas.resize(GRID_SIZE)
	for z in range(GRID_SIZE):
		var drow: PackedFloat32Array = PackedFloat32Array()
		drow.resize(GRID_SIZE)
		deltas[z] = drow

	for z in range(GRID_SIZE):
		var row: Array = tiles[z]
		for x in range(GRID_SIZE):
			var tile: Tile = row[x]
			if tile.surface_water_cm < 1.0:
				continue
			var my_head: float = tile.elevation_m + tile.surface_water_cm * 0.01
			# Find lowest neighbor by head.
			var best_dx: int = 0
			var best_dz: int = 0
			var best_head: float = my_head
			for d in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
				var nx: int = x + d.x
				var nz: int = z + d.y
				if nx < 0 or nz < 0 or nx >= GRID_SIZE or nz >= GRID_SIZE:
					continue
				var n_tile: Tile = tiles[nz][nx]
				var n_head: float = n_tile.elevation_m + n_tile.surface_water_cm * 0.01
				if n_head < best_head:
					best_head = n_head
					best_dx = d.x
					best_dz = d.y
			if best_dx == 0 and best_dz == 0:
				continue
			var head_diff: float = my_head - best_head
			if head_diff * 100.0 < MIN_FLOW_HEAD_CM:
				continue
			# Volume moved — cap at FLOW_CAP_FRACTION of source water and
			# at half the head difference (so we never over-equalize).
			# For persistent-water tiles, only the water ABOVE base
			# depth is eligible to drain — the channel keeps its floor.
			var drainable_cm: float = tile.surface_water_cm
			if tile.is_persistent_water:
				drainable_cm = max(0.0, tile.surface_water_cm - tile.base_water_depth_cm)
			if drainable_cm <= 0.0:
				continue
			var move_cm: float = min(drainable_cm * FLOW_CAP_FRACTION, head_diff * 100.0 * 0.5)
			if move_cm <= 0.0:
				continue
			var nx2: int = x + best_dx
			var nz2: int = z + best_dz
			var src_row: PackedFloat32Array = deltas[z]
			var dst_row: PackedFloat32Array = deltas[nz2]
			src_row[x] = src_row[x] - move_cm
			dst_row[nx2] = dst_row[nx2] + move_cm
			deltas[z] = src_row
			deltas[nz2] = dst_row

	for z in range(GRID_SIZE):
		var drow: PackedFloat32Array = deltas[z]
		var row: Array = tiles[z]
		for x in range(GRID_SIZE):
			var t: Tile = row[x]
			t.surface_water_cm = max(0.0, t.surface_water_cm + drow[x])
			if t.is_persistent_water and t.surface_water_cm < t.base_water_depth_cm:
				t.surface_water_cm = t.base_water_depth_cm


# ---------- Water mesh ----------

## Returns true if the tile at (x, z) should render water this frame.
## Persistent-water tiles are always included; transient rain puddles
## only render above the CA threshold.
func _is_rendered_water_tile(x: int, z: int) -> bool:
	var t: Tile = tiles[z][x] as Tile
	if t.is_persistent_water:
		return true
	return t.surface_water_cm >= TRANSIENT_WATER_THRESHOLD_CM


## Water surface height for a tile, in world meters. Persistent-water
## tiles clamp to their base depth so the stream reads as continuous.
func _water_surface_y(x: int, z: int) -> float:
	var t: Tile = tiles[z][x] as Tile
	var depth_cm: float = t.surface_water_cm
	if t.is_persistent_water:
		depth_cm = max(t.base_water_depth_cm, depth_cm)
	return t.elevation_m + depth_cm * 0.01


## Build a vertex-welded continuous water mesh. A vertex at integer
## tile corner (vx, vz) is emitted once if any of the four neighbouring
## tiles is a water tile. Its Y is the average of those neighbours'
## water-surface Y, which smooths the staircase between tiles with
## slightly different depth/elevation. Triangles are emitted per tile
## that is itself a water tile.
func _rebuild_water_mesh() -> void:
	if _water_mesh_instance == null:
		return
	var verts: PackedVector3Array = PackedVector3Array()
	var normals: PackedVector3Array = PackedVector3Array()
	var uvs: PackedVector2Array = PackedVector2Array()
	var indices: PackedInt32Array = PackedInt32Array()

	var verts_side: int = GRID_SIZE + 1
	# vertex_index[vz * verts_side + vx] = int index into `verts`, or -1.
	var vertex_index: PackedInt32Array = PackedInt32Array()
	vertex_index.resize(verts_side * verts_side)
	for i in range(vertex_index.size()):
		vertex_index[i] = -1

	# Walk every water tile, emit/reuse its 4 corner vertices, then
	# build two triangles.
	for z in range(GRID_SIZE):
		for x in range(GRID_SIZE):
			if not _is_rendered_water_tile(x, z):
				continue
			var a: int = _ensure_water_vertex(x, z, vertex_index, verts, normals, uvs, verts_side)
			var b: int = _ensure_water_vertex(x + 1, z, vertex_index, verts, normals, uvs, verts_side)
			var c: int = _ensure_water_vertex(x, z + 1, vertex_index, verts, normals, uvs, verts_side)
			var d: int = _ensure_water_vertex(x + 1, z + 1, vertex_index, verts, normals, uvs, verts_side)
			# CCW from +Y (matches terrain winding fix).
			indices.append(a); indices.append(b); indices.append(c)
			indices.append(b); indices.append(d); indices.append(c)

	_water_mesh = ArrayMesh.new()
	if verts.size() > 0:
		var arrays: Array = []
		arrays.resize(Mesh.ARRAY_MAX)
		arrays[Mesh.ARRAY_VERTEX] = verts
		arrays[Mesh.ARRAY_NORMAL] = normals
		arrays[Mesh.ARRAY_TEX_UV] = uvs
		arrays[Mesh.ARRAY_INDEX] = indices
		_water_mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	_water_mesh_instance.mesh = _water_mesh


## Grab-or-create a shared corner vertex. Y is averaged across the (up
## to 4) water tiles touching this corner so the surface is smooth.
func _ensure_water_vertex(
	vx: int,
	vz: int,
	vertex_index: PackedInt32Array,
	verts: PackedVector3Array,
	normals: PackedVector3Array,
	uvs: PackedVector2Array,
	verts_side: int,
) -> int:
	var key: int = vz * verts_side + vx
	var existing: int = vertex_index[key]
	if existing >= 0:
		return existing
	# Four tiles share this corner. Any that are water contribute their
	# surface Y; non-water tiles are skipped. If none are water (can
	# happen at edge seams because of flood-fill behaviour) we fall back
	# to terrain height so the vertex still resolves.
	var sum_y: float = 0.0
	var count: int = 0
	for dz in [-1, 0]:
		for dx in [-1, 0]:
			var tx: int = vx + dx
			var tz: int = vz + dz
			if tx < 0 or tz < 0 or tx >= GRID_SIZE or tz >= GRID_SIZE:
				continue
			if _is_rendered_water_tile(tx, tz):
				sum_y += _water_surface_y(tx, tz)
				count += 1
	var y: float
	if count > 0:
		y = sum_y / float(count) + 0.02  # tiny lift to avoid z-fight
	else:
		# Fall back to terrain corner height.
		var sx: int = clamp(vx, 0, GRID_SIZE - 1)
		var sz: int = clamp(vz, 0, GRID_SIZE - 1)
		y = (tiles[sz][sx] as Tile).elevation_m + 0.02
	var wx: float = vx * TILE_SIZE_M - WORLD_HALF_M
	var wz: float = vz * TILE_SIZE_M - WORLD_HALF_M
	var idx: int = verts.size()
	verts.append(Vector3(wx, y, wz))
	normals.append(Vector3.UP)
	uvs.append(Vector2(float(vx) / 4.0, float(vz) / 4.0))
	vertex_index[key] = idx
	return idx
