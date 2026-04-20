## Fairy Permaculture — Lab fungus preview.
##
## Builds a species-specific silhouette + substrate combo for each of
## the 11 fungi in data/ecosystem/fungi.json, so the Lab scrubber can
## show a READABLE difference between a turkey-tail shelf, a lion's-mane
## pom-pom, a morel's honeycomb cone, and the mycorrhizal hyphal web.
##
## The life-cycle scrubber drives visibility + scale via `_apply_state_overrides`.
## Per-species builders are grouped by form-family (cap-stem, shelf,
## wine-cap bed-on-chips, lion's-mane cascade, mycorrhizal cross-section).
extends Node3D

const TOON_SHADER_PATH := "res://shaders/toon.gdshader"

## Per-species anatomy. Drives form-family, colours, sizes, substrate.
const SPECIES_CFG: Dictionary = {
	"oyster-mushroom": {
		"form": "cap-stem",
		"substrate": "log",
		"cap_color": Color(0.80, 0.78, 0.73),
		"stem_color": Color(0.96, 0.94, 0.88),
		"cap_shape": "shelf",
		"cap_size": Vector3(1.7, 0.35, 1.7),
		"count": 6,
	},
	"shiitake-mushroom": {
		"form": "cap-stem",
		"substrate": "log",
		"cap_color": Color(0.45, 0.28, 0.18),
		"stem_color": Color(0.92, 0.86, 0.74),
		"cap_shape": "dome",
		"cap_size": Vector3(1.2, 0.7, 1.2),
		"count": 5,
	},
	"wine-cap-mushroom": {
		"form": "cap-stem",
		"substrate": "chips",
		"cap_color": Color(0.58, 0.20, 0.22),
		"stem_color": Color(0.96, 0.93, 0.86),
		"cap_shape": "dome",
		"cap_size": Vector3(1.6, 0.9, 1.6),
		"count": 4,
	},
	"morel-black": {
		"form": "morel",
		"substrate": "burn",
		"cap_color": Color(0.28, 0.22, 0.14),
		"stem_color": Color(0.90, 0.84, 0.70),
		"count": 5,
	},
	"button-mushroom": {
		"form": "cap-stem",
		"substrate": "compost",
		"cap_color": Color(0.94, 0.88, 0.78),
		"stem_color": Color(0.96, 0.92, 0.84),
		"cap_shape": "dome",
		"cap_size": Vector3(1.0, 0.85, 1.0),
		"count": 7,
	},
	"enoki-mushroom": {
		"form": "enoki",
		"substrate": "block",
		"cap_color": Color(0.98, 0.94, 0.82),
		"stem_color": Color(0.98, 0.96, 0.88),
		"count": 14,
	},
	"lions-mane-mushroom": {
		"form": "lions-mane",
		"substrate": "log",
		"cap_color": Color(0.96, 0.93, 0.84),
	},
	"reishi": {
		"form": "shelf",
		"substrate": "stump",
		"cap_color": Color(0.55, 0.12, 0.08),
		"cap_color_b": Color(0.92, 0.70, 0.30),
		"count": 3,
		"varnished": true,
	},
	"chaga": {
		"form": "shelf",
		"substrate": "birch",
		"cap_color": Color(0.14, 0.10, 0.06),
		"cap_color_b": Color(0.35, 0.22, 0.12),
		"count": 2,
		"chunky": true,
	},
	"turkey-tail": {
		"form": "shelf",
		"substrate": "log",
		"cap_color": Color(0.52, 0.38, 0.22),
		"cap_color_b": Color(0.90, 0.85, 0.72),
		"cap_color_c": Color(0.28, 0.42, 0.50),
		"count": 7,
		"banded": true,
	},
	"mycorrhizae-native": {
		"form": "mycorrhizal",
		"substrate": "root-cross-section",
		"hyphae_color": Color(0.55, 0.85, 0.95),
		"mat_color": Color(0.90, 0.92, 0.80),
		"root_color": Color(0.55, 0.35, 0.22),
	},
}

var entity: Dictionary = {}
var state: String = "fruiting"
var form: String = "cap-stem"

var substrate: MeshInstance3D
var mycelium_flecks: Array[MeshInstance3D] = []
var fruits: Array[MeshInstance3D] = []
var hyphae: Array[MeshInstance3D] = []
var shelves: Array[MeshInstance3D] = []
var spines: Array[MeshInstance3D] = []
var stems: Array[MeshInstance3D] = []


func setup(e: Dictionary, s: String) -> void:
	entity = e
	state = s
	_build()
	var id: String = String(entity.get("id", ""))
	GameLog.info("fungus preview ready: %s (%s)" % [id, form], "lab_fungus")


func _build() -> void:
	var id: String = String(entity.get("id", ""))
	var cfg: Dictionary = SPECIES_CFG.get(id, {})
	form = String(cfg.get("form", "cap-stem"))
	match form:
		"cap-stem":
			_build_cap_stem_fungus(cfg)
		"shelf":
			_build_shelf_fungus(cfg)
		"lions-mane":
			_build_lions_mane(cfg)
		"morel":
			_build_morel(cfg)
		"enoki":
			_build_enoki(cfg)
		"mycorrhizal":
			_build_mycorrhizal(cfg)
		_:
			_build_cap_stem_fungus(cfg)
	_apply_state_overrides()


## Substrate builders ---------------------------------------------------

func _build_log_substrate() -> void:
	substrate = _cylinder(Vector3(0, 0.3, 0), 0.3, 0.3, 2.0, Color(0.42, 0.28, 0.18))
	substrate.rotation.z = PI * 0.5
	add_child(substrate)
	# End-cap detail rings for log readability.
	for end_x in [-1.0, 1.0]:
		var ring: MeshInstance3D = _cylinder(Vector3(end_x, 0.3, 0), 0.30, 0.30, 0.04, Color(0.58, 0.42, 0.28))
		ring.rotation.z = PI * 0.5
		add_child(ring)


func _build_birch_substrate() -> void:
	# Standing birch trunk — vertical, for chaga to cling to.
	substrate = _cylinder(Vector3(0, 1.1, 0), 0.32, 0.36, 2.2, Color(0.93, 0.92, 0.86))
	add_child(substrate)
	# Dark birch bark stripes.
	for i in range(5):
		var y: float = 0.3 + float(i) * 0.4
		var stripe: MeshInstance3D = _cube(Vector3(0, y, 0.33), Vector3(0.55, 0.06, 0.02), Color(0.20, 0.15, 0.10))
		add_child(stripe)


func _build_stump_substrate() -> void:
	substrate = _cylinder(Vector3(0, 0.3, 0), 0.55, 0.65, 0.6, Color(0.45, 0.30, 0.18))
	add_child(substrate)
	# Concentric ring cap.
	var top: MeshInstance3D = _cylinder(Vector3(0, 0.61, 0), 0.54, 0.54, 0.04, Color(0.60, 0.42, 0.26))
	add_child(top)


func _build_chip_bed_substrate() -> void:
	substrate = _cube(Vector3(0, 0.1, 0), Vector3(2.2, 0.2, 2.2), Color(0.42, 0.28, 0.16))
	add_child(substrate)
	# Scatter wood-chip specks.
	for i in range(18):
		var ang: float = float(i) * 0.75
		var r: float = 0.3 + fmod(float(i) * 0.37, 0.8)
		var chip: MeshInstance3D = _cube(
			Vector3(cos(ang) * r, 0.22, sin(ang) * r),
			Vector3(0.12, 0.04, 0.08),
			Color(0.58, 0.40, 0.24)
		)
		chip.rotation.y = ang * 1.7
		add_child(chip)


func _build_compost_bed_substrate() -> void:
	# Palette.COMPOST (#3E2F23) — warm dark compost, not cold mud.
	substrate = _cube(Vector3(0, 0.1, 0), Vector3(2.2, 0.2, 2.2), Color(0.243, 0.184, 0.137))
	add_child(substrate)
	# Straw flecks for manure-compost feel.
	for i in range(14):
		var ang: float = float(i) * 0.89
		var r: float = 0.2 + fmod(float(i) * 0.29, 0.85)
		var straw: MeshInstance3D = _cube(
			Vector3(cos(ang) * r, 0.22, sin(ang) * r),
			Vector3(0.18, 0.02, 0.04),
			Color(0.85, 0.72, 0.38)
		)
		straw.rotation.y = ang * 2.1
		add_child(straw)


func _build_block_substrate() -> void:
	# Sawdust / grain brick for enoki.
	substrate = _cube(Vector3(0, 0.25, 0), Vector3(1.1, 0.5, 0.8), Color(0.72, 0.58, 0.38))
	add_child(substrate)


func _build_burn_substrate() -> void:
	# Post-fire hardwood chip bed for morels.
	substrate = _cube(Vector3(0, 0.1, 0), Vector3(2.2, 0.2, 2.2), Color(0.22, 0.16, 0.10))
	add_child(substrate)
	# Charcoal chunks.
	for i in range(10):
		var ang: float = float(i) * 1.17
		var r: float = 0.25 + fmod(float(i) * 0.41, 0.9)
		var char_chunk: MeshInstance3D = _cube(
			Vector3(cos(ang) * r, 0.24, sin(ang) * r),
			Vector3(0.16, 0.08, 0.12),
			Color(0.10, 0.08, 0.06)
		)
		char_chunk.rotation.y = ang * 1.3
		add_child(char_chunk)
	# A few ash specks.
	for i in range(8):
		var ang2: float = float(i) * 0.77 + 0.3
		var r2: float = 0.4 + fmod(float(i) * 0.51, 0.8)
		add_child(_sphere(
			Vector3(cos(ang2) * r2, 0.23, sin(ang2) * r2),
			0.04,
			Color(0.75, 0.72, 0.68)
		))


func _build_substrate_by_key(key: String) -> void:
	match key:
		"log": _build_log_substrate()
		"birch": _build_birch_substrate()
		"stump": _build_stump_substrate()
		"chips": _build_chip_bed_substrate()
		"compost": _build_compost_bed_substrate()
		"block": _build_block_substrate()
		"burn": _build_burn_substrate()
		_: _build_log_substrate()


func _seed_mycelium_flecks(kind: String) -> void:
	var on_log: bool = (kind == "log" or kind == "birch" or kind == "stump")
	for i in range(8):
		var ang: float = float(i) * TAU / 8.0
		var px: float
		var py: float
		var pz: float
		if kind == "birch":
			px = cos(ang) * 0.36
			py = 0.5 + sin(float(i) * 0.7) * 0.6
			pz = sin(ang) * 0.36
		elif kind == "stump":
			px = cos(ang) * 0.5
			py = 0.62
			pz = sin(ang) * 0.5
		elif on_log:
			px = cos(ang) * 0.48
			py = 0.45
			pz = sin(ang) * 0.48
		else:
			px = cos(ang) * 0.8
			py = 0.22
			pz = sin(ang) * 0.8
		var fleck: MeshInstance3D = _sphere(Vector3(px, py, pz), 0.05, Color(0.96, 0.94, 0.86))
		add_child(fleck)
		mycelium_flecks.append(fleck)


## Cap-stem family (oyster, shiitake, wine-cap, button) -----------------

func _build_cap_stem_fungus(cfg: Dictionary) -> void:
	var substrate_key: String = String(cfg.get("substrate", "log"))
	_build_substrate_by_key(substrate_key)
	_seed_mycelium_flecks(substrate_key)

	var cap_color: Color = cfg.get("cap_color", Color(0.72, 0.58, 0.42))
	var stem_color: Color = cfg.get("stem_color", Color(0.96, 0.92, 0.84))
	var cap_size: Vector3 = cfg.get("cap_size", Vector3(1.4, 0.6, 1.4))
	var cap_shape: String = String(cfg.get("cap_shape", "dome"))
	var count: int = int(cfg.get("count", 5))

	var on_vert_log: bool = false  # reserved; cap-stem species use horizontal logs or beds
	var top_y: float = 0.60
	var ring_r: float = 0.5
	if substrate_key == "chips" or substrate_key == "compost" or substrate_key == "burn":
		top_y = 0.22
		ring_r = 0.7
	elif substrate_key == "block":
		top_y = 0.52
		ring_r = 0.35

	for i in range(count):
		var ang: float = float(i) * TAU / float(count)
		# Oyster mushroom: cluster shelves on the SIDE of the log rather than top.
		if String(entity.get("id", "")) == "oyster-mushroom":
			var side_angle: float = float(i) * TAU / float(count)
			var sx: float = cos(side_angle) * 0.28
			var sz: float = sin(side_angle) * 0.28
			var sy: float = 0.3 + sin(float(i) * 1.3) * 0.25
			var cap: MeshInstance3D = _sphere(Vector3(sx + sign(sx) * 0.25, sy, sz), 0.22, cap_color)
			cap.scale = cap_size
			cap.rotation.y = side_angle
			add_child(cap)
			fruits.append(cap)
			continue
		var px: float = cos(ang) * ring_r
		var pz: float = sin(ang) * ring_r
		# Stem
		var stem_h: float = 0.35
		var stem: MeshInstance3D = _cylinder(Vector3(px, top_y + stem_h * 0.5, pz), 0.06, 0.08, stem_h, stem_color)
		add_child(stem)
		stems.append(stem)
		# Cap (dome or shelf)
		var cap2: MeshInstance3D
		if cap_shape == "shelf":
			cap2 = _cube(Vector3(px, top_y + stem_h + 0.08, pz), Vector3(0.45, 0.08, 0.45), cap_color)
		else:
			cap2 = _sphere(Vector3(px, top_y + stem_h + 0.1, pz), 0.19, cap_color)
		cap2.scale = cap_size
		add_child(cap2)
		fruits.append(cap2)
		# Button mushroom needs a small annulus (ring) under the cap.
		if String(entity.get("id", "")) == "button-mushroom":
			var ring: MeshInstance3D = _cylinder(
				Vector3(px, top_y + stem_h - 0.02, pz),
				0.09, 0.09, 0.03,
				Color(0.92, 0.88, 0.78)
			)
			add_child(ring)


## Shelf / polypore family (reishi, chaga, turkey tail) -----------------

func _build_shelf_fungus(cfg: Dictionary) -> void:
	var substrate_key: String = String(cfg.get("substrate", "log"))
	_build_substrate_by_key(substrate_key)
	_seed_mycelium_flecks(substrate_key)

	var cap_color: Color = cfg.get("cap_color", Color(0.5, 0.35, 0.22))
	var cap_color_b: Color = cfg.get("cap_color_b", cap_color.lightened(0.3))
	var cap_color_c: Color = cfg.get("cap_color_c", cap_color.lightened(0.5))
	var count: int = int(cfg.get("count", 4))
	var banded: bool = bool(cfg.get("banded", false))
	var chunky: bool = bool(cfg.get("chunky", false))
	var varnished: bool = bool(cfg.get("varnished", false))

	# Chaga clings to a standing birch trunk — conks at mid-height.
	var vertical: bool = (substrate_key == "birch")
	var stump: bool = (substrate_key == "stump")

	for i in range(count):
		var ang: float = float(i) * TAU / float(count) + 0.2
		var shelf_x: float
		var shelf_y: float
		var shelf_z: float
		if vertical:
			shelf_x = cos(ang) * 0.45
			shelf_y = 0.6 + float(i) * 0.55
			shelf_z = sin(ang) * 0.45
		elif stump:
			shelf_x = cos(ang) * 0.55
			shelf_y = 0.25 + float(i) * 0.1
			shelf_z = sin(ang) * 0.55
		else:
			# Horizontal log — shelves on the upper-side half.
			shelf_x = cos(ang) * 0.0
			shelf_y = 0.55
			shelf_z = sin(ang) * 0.35
			# Distribute along the log length instead.
			shelf_x = float(i - count / 2) * 0.35
			shelf_z = (0.32 if (i % 2 == 0) else -0.32)

		var shelf: MeshInstance3D
		if chunky:
			# Chaga: lumpy black conk.
			shelf = _sphere(Vector3(shelf_x, shelf_y, shelf_z), 0.22, cap_color)
			shelf.scale = Vector3(1.3, 1.2, 1.0)
		else:
			# Kidney-shaped shelf — flattened ellipsoid.
			shelf = _sphere(Vector3(shelf_x, shelf_y, shelf_z), 0.22, cap_color)
			shelf.scale = Vector3(1.8, 0.45, 1.1)
		# Orient outward.
		var yaw: float = atan2(shelf_z, shelf_x) if (vertical or stump) else (PI * 0.5 if shelf_z > 0.0 else -PI * 0.5)
		shelf.rotation.y = yaw
		add_child(shelf)
		fruits.append(shelf)
		shelves.append(shelf)

		# Banded (turkey tail) — two concentric rings of alternate colour on the outer edge.
		if banded and not chunky:
			var mid: MeshInstance3D = _sphere(Vector3(shelf_x, shelf_y + 0.002, shelf_z), 0.14, cap_color_b)
			mid.scale = Vector3(1.6, 0.4, 1.0)
			mid.rotation.y = yaw
			add_child(mid)
			var inner: MeshInstance3D = _sphere(Vector3(shelf_x, shelf_y + 0.004, shelf_z), 0.08, cap_color_c)
			inner.scale = Vector3(1.35, 0.35, 0.9)
			inner.rotation.y = yaw
			add_child(inner)

		# Varnished (reishi) — glossy red-brown layer under a lighter rim.
		if varnished:
			var rim: MeshInstance3D = _sphere(Vector3(shelf_x, shelf_y + 0.003, shelf_z), 0.06, cap_color_b)
			rim.scale = Vector3(1.9, 0.42, 1.12)
			rim.rotation.y = yaw
			add_child(rim)


## Lion's mane — cascading pom-pom of white spines -----------------------

func _build_lions_mane(cfg: Dictionary) -> void:
	_build_log_substrate()
	_seed_mycelium_flecks("log")

	var spine_color: Color = cfg.get("cap_color", Color(0.96, 0.93, 0.84))
	# Two pom-poms clinging under the log.
	for cluster_idx in range(2):
		var cx: float = -0.5 + float(cluster_idx) * 1.0
		var cy: float = 0.45
		var cz: float = 0.0
		# Pom-pom base ball.
		var base_ball: MeshInstance3D = _sphere(Vector3(cx, cy, cz), 0.30, spine_color)
		base_ball.scale = Vector3(1.1, 0.9, 1.1)
		add_child(base_ball)
		fruits.append(base_ball)
		# Cascading spines (downward-dripping teardrops).
		for i in range(14):
			var ang: float = float(i) * TAU / 14.0
			var rr: float = 0.22 + 0.08 * sin(float(i) * 1.7)
			var drop_len: float = 0.14 + 0.12 * ((i % 3) + 1)
			var spine: MeshInstance3D = _cylinder(
				Vector3(cx + cos(ang) * rr, cy - drop_len * 0.5, cz + sin(ang) * rr),
				0.025, 0.04, drop_len,
				spine_color
			)
			add_child(spine)
			spines.append(spine)


## Morel — honeycomb-pitted cone ----------------------------------------

func _build_morel(cfg: Dictionary) -> void:
	_build_burn_substrate()
	_seed_mycelium_flecks("burn")

	var cap_color: Color = cfg.get("cap_color", Color(0.28, 0.22, 0.14))
	var stem_color: Color = cfg.get("stem_color", Color(0.90, 0.84, 0.70))
	var count: int = int(cfg.get("count", 5))

	for i in range(count):
		var ang: float = float(i) * TAU / float(count)
		var rr: float = 0.55
		var px: float = cos(ang) * rr
		var pz: float = sin(ang) * rr
		# Pale hollow stem.
		var stem_h: float = 0.35
		var stem: MeshInstance3D = _cylinder(Vector3(px, 0.20 + stem_h * 0.5, pz), 0.09, 0.12, stem_h, stem_color)
		add_child(stem)
		stems.append(stem)
		# Conical cap (tall, tapered).
		var cone_y: float = 0.20 + stem_h + 0.28
		var cone: MeshInstance3D = _cylinder(Vector3(px, cone_y, pz), 0.03, 0.18, 0.55, cap_color)
		add_child(cone)
		fruits.append(cone)
		# Honeycomb pits — ring of small dark dots around the cone.
		for row in range(4):
			var ry: float = cone_y - 0.22 + float(row) * 0.14
			var ring_count: int = 6
			for k in range(ring_count):
				var a2: float = float(k) * TAU / float(ring_count) + float(row) * 0.3
				var rr2: float = 0.13 - float(row) * 0.02
				var pit: MeshInstance3D = _sphere(
					Vector3(px + cos(a2) * rr2, ry, pz + sin(a2) * rr2),
					0.03,
					cap_color.darkened(0.4)
				)
				add_child(pit)


## Enoki — long thin white stems with tiny caps --------------------------

func _build_enoki(cfg: Dictionary) -> void:
	_build_block_substrate()
	_seed_mycelium_flecks("block")

	var cap_color: Color = cfg.get("cap_color", Color(0.98, 0.94, 0.82))
	var stem_color: Color = cfg.get("stem_color", Color(0.98, 0.96, 0.88))
	var count: int = int(cfg.get("count", 14))

	for i in range(count):
		var ang: float = float(i) * TAU / float(count)
		var rr: float = 0.08 + fmod(float(i) * 0.11, 0.14)
		var px: float = cos(ang) * rr
		var pz: float = sin(ang) * rr
		var stem_h: float = 0.55 + sin(float(i) * 1.3) * 0.12
		var stem: MeshInstance3D = _cylinder(
			Vector3(px, 0.52 + stem_h * 0.5, pz),
			0.018, 0.022, stem_h,
			stem_color
		)
		add_child(stem)
		stems.append(stem)
		var cap: MeshInstance3D = _sphere(
			Vector3(px, 0.52 + stem_h + 0.03, pz),
			0.045,
			cap_color
		)
		cap.scale = Vector3(1.0, 0.7, 1.0)
		add_child(cap)
		fruits.append(cap)


## Mycorrhizal — underground root-cross-section w/ glowing hyphae --------

func _build_mycorrhizal(cfg: Dictionary) -> void:
	var hyphae_color: Color = cfg.get("hyphae_color", Color(0.55, 0.85, 0.95))
	var mat_color: Color = cfg.get("mat_color", Color(0.90, 0.92, 0.80))
	var root_color: Color = cfg.get("root_color", Color(0.55, 0.35, 0.22))

	# Translucent-looking soil slab (cross-section).
	substrate = _cube(Vector3(0, -0.4, 0), Vector3(3.2, 1.0, 3.2), Color(0.32, 0.24, 0.18))
	add_child(substrate)
	# Soil surface mat.
	var mat_surface: MeshInstance3D = _cube(Vector3(0, 0.11, 0), Vector3(3.2, 0.02, 3.2), mat_color)
	add_child(mat_surface)
	mycelium_flecks.append(mat_surface)

	# Tree stub above — sign of a host.
	var tree_trunk: MeshInstance3D = _cylinder(Vector3(0, 0.6, 0), 0.15, 0.22, 1.0, Color(0.40, 0.27, 0.18))
	add_child(tree_trunk)
	var canopy: MeshInstance3D = _sphere(Vector3(0, 1.4, 0), 0.55, Color(0.36, 0.58, 0.32))
	add_child(canopy)

	# Taproot — descending cylinder.
	var taproot: MeshInstance3D = _cylinder(Vector3(0, -0.15, 0), 0.14, 0.08, 0.55, root_color)
	add_child(taproot)
	# Lateral roots.
	for i in range(5):
		var ang: float = float(i) * TAU / 5.0
		var end_x: float = cos(ang) * 1.2
		var end_z: float = sin(ang) * 1.2
		var lateral: MeshInstance3D = _cylinder(
			Vector3(end_x * 0.5, -0.35, end_z * 0.5),
			0.04, 0.07, 1.25,
			root_color
		)
		lateral.rotation.y = ang
		lateral.rotation.z = PI * 0.5 + 0.15
		add_child(lateral)

	# Hyphal network — glowing cyan strands branching from roots.
	for i in range(26):
		var ang2: float = float(i) * TAU / 26.0
		var r_start: float = 0.2 + fmod(float(i) * 0.23, 0.3)
		var r_end: float = 0.9 + fmod(float(i) * 0.37, 0.6)
		var y: float = -0.25 - fmod(float(i) * 0.19, 0.6)
		var sx: float = cos(ang2) * r_start
		var sz: float = sin(ang2) * r_start
		var ex: float = cos(ang2) * r_end
		var ez: float = sin(ang2) * r_end
		var mid_x: float = (sx + ex) * 0.5
		var mid_z: float = (sz + ez) * 0.5
		var length: float = Vector2(ex - sx, ez - sz).length()
		var strand: MeshInstance3D = _cylinder(
			Vector3(mid_x, y, mid_z),
			0.012, 0.012, length,
			hyphae_color
		)
		strand.rotation.z = PI * 0.5
		strand.rotation.y = ang2
		_apply_emissive(strand, hyphae_color, 0.6)
		add_child(strand)
		hyphae.append(strand)
	# Hyphal tips — small glowing nubs at strand ends.
	for i in range(12):
		var ang3: float = float(i) * TAU / 12.0
		var rr: float = 1.1 + fmod(float(i) * 0.17, 0.35)
		var y2: float = -0.3 - fmod(float(i) * 0.23, 0.55)
		var tip: MeshInstance3D = _sphere(
			Vector3(cos(ang3) * rr, y2, sin(ang3) * rr),
			0.035,
			hyphae_color
		)
		_apply_emissive(tip, hyphae_color, 0.8)
		add_child(tip)
		hyphae.append(tip)


## State overrides ------------------------------------------------------

func _apply_state_overrides() -> void:
	match state:
		"spawn":
			for f in fruits:
				f.visible = false
			for m in mycelium_flecks:
				m.visible = false
			for sp in spines:
				sp.visible = false
			for st in stems:
				st.visible = false
		"inoculated", "inoculated-log", "inoculated-chips", "inoculated-bed", "sclerotia":
			for f in fruits:
				f.visible = false
			for sp in spines:
				sp.visible = false
			for st in stems:
				st.visible = false
			for m in mycelium_flecks:
				m.visible = true
				m.scale = Vector3.ONE * 0.5
		"colonized", "colonizing", "colonizing-bed", "colonized-block", "mycelium-running", "networked", "casing":
			for f in fruits:
				f.visible = false
			for sp in spines:
				sp.visible = false
			for st in stems:
				st.visible = false
			for m in mycelium_flecks:
				m.visible = true
				m.scale = Vector3.ONE * 1.0
		"primordia", "pinning", "young-shelf", "young-conk", "antler":
			for f in fruits:
				f.visible = true
				f.scale = f.scale * 0.3
			for sp in spines:
				sp.visible = true
				sp.scale = sp.scale * 0.3
			for st in stems:
				st.visible = true
				st.scale.y = 0.3
		"fruiting", "mature", "mature-shelf", "mature-conk", "shelf-conk", "sporulating":
			for f in fruits:
				f.visible = true
				_boost_emissive(f, 0.3)
			for sp in spines:
				sp.visible = true
			for st in stems:
				st.visible = true
		"spent", "spent-log", "spent-bed", "spent-block", "harvested":
			for f in fruits:
				f.visible = false
			for sp in spines:
				sp.visible = false
			for st in stems:
				st.visible = false
			for m in mycelium_flecks:
				m.visible = false
			if substrate and substrate.material_override is ShaderMaterial:
				var mat: ShaderMaterial = substrate.material_override
				mat.set_shader_parameter("albedo_color", Vector4(0.22, 0.15, 0.10, 1.0))
		"harvested-scar":
			for f in fruits:
				f.visible = false
			if substrate and substrate.material_override is ShaderMaterial:
				var mat: ShaderMaterial = substrate.material_override
				mat.set_shader_parameter("albedo_color", Vector4(0.30, 0.20, 0.15, 1.0))
		"dormant":
			for f in fruits:
				f.scale = f.scale * 0.5
		_:
			pass


func _boost_emissive(mi: MeshInstance3D, amount: float) -> void:
	if mi == null:
		return
	if mi.material_override is ShaderMaterial:
		var mat: ShaderMaterial = mi.material_override
		mat.set_shader_parameter("rim_strength", amount + 0.15)


func _apply_emissive(mi: MeshInstance3D, color: Color, strength: float) -> void:
	if mi.material_override is ShaderMaterial:
		var mat: ShaderMaterial = mi.material_override
		# Toon shader doesn't have an emissive uniform, so nudge rim for that glowy look.
		mat.set_shader_parameter("rim_strength", strength)
		mat.set_shader_parameter("albedo_color", Vector4(color.r, color.g, color.b, 1.0))


## Animation hook -------------------------------------------------------

func animate(anim: String, t: float, _dt: float) -> void:
	match anim:
		"breathing":
			scale = Vector3.ONE * (1.0 + 0.02 * sin(t * 1.5))
		"grow-flush":
			var phase: float = clamp(fmod(t * 0.4, 1.2), 0.0, 1.0)
			for f in fruits:
				f.scale = f.scale.normalized() * f.scale.length() * max(0.3, phase)
		"grow-cascade":
			for i in range(spines.size()):
				var sp: MeshInstance3D = spines[i]
				var ph: float = clamp(fmod(t * 0.3 + float(i) * 0.1, 1.5), 0.0, 1.0)
				sp.scale.y = max(0.3, ph)
		"grow-shelf":
			for sh in shelves:
				sh.scale.y = sh.scale.y + 0.0  # stable; visual is from breathing
			scale = Vector3.ONE * (1.0 + 0.03 * sin(t * 1.2))
		"grow-fan":
			for i in range(shelves.size()):
				var sh2: MeshInstance3D = shelves[i]
				sh2.rotation.y = sh2.rotation.y + sin(t * 0.4 + float(i) * 0.5) * 0.001
			scale = Vector3.ONE * (1.0 + 0.02 * sin(t * 1.4))
		"shock-soak":
			position.y = sin(t * 3.0) * 0.04
		"spore-release", "spore-dust":
			# Very slow drift of mycelial flecks upward + wobble.
			for m in mycelium_flecks:
				m.position.y = m.position.y + sin(t * 4.0 + m.position.x) * 0.0005
			rotation.y = t * 0.1
		"root-extension":
			# Pulse the hyphae — the glowing trade network in motion.
			for i in range(hyphae.size()):
				var h: MeshInstance3D = hyphae[i]
				var pulse: float = 0.6 + 0.4 * sin(t * 1.6 + float(i) * 0.5)
				if h.material_override is ShaderMaterial:
					var mat: ShaderMaterial = h.material_override
					mat.set_shader_parameter("rim_strength", pulse)
		_:
			pass


## Mesh helpers ---------------------------------------------------------

func _cel_material(color: Color) -> ShaderMaterial:
	var mat: ShaderMaterial = ShaderMaterial.new()
	var sh: Shader = load(TOON_SHADER_PATH)
	if sh:
		mat.shader = sh
		mat.set_shader_parameter("albedo_color", Vector4(color.r, color.g, color.b, color.a))
		mat.set_shader_parameter("shadow_darkness", 0.35)
		mat.set_shader_parameter("rim_strength", 0.15)
	return mat


func _cube(pos: Vector3, size: Vector3, color: Color) -> MeshInstance3D:
	var m: BoxMesh = BoxMesh.new()
	m.size = size
	var mi: MeshInstance3D = MeshInstance3D.new()
	mi.mesh = m
	mi.material_override = _cel_material(color)
	mi.position = pos
	return mi


func _sphere(pos: Vector3, radius: float, color: Color) -> MeshInstance3D:
	var m: SphereMesh = SphereMesh.new()
	m.radius = radius
	m.height = radius * 2.0
	var mi: MeshInstance3D = MeshInstance3D.new()
	mi.mesh = m
	mi.material_override = _cel_material(color)
	mi.position = pos
	return mi


func _cylinder(pos: Vector3, radius_top: float, radius_bot: float, height: float, color: Color) -> MeshInstance3D:
	var m: CylinderMesh = CylinderMesh.new()
	m.top_radius = radius_top
	m.bottom_radius = radius_bot
	m.height = height
	var mi: MeshInstance3D = MeshInstance3D.new()
	mi.mesh = m
	mi.material_override = _cel_material(color)
	mi.position = pos
	return mi
