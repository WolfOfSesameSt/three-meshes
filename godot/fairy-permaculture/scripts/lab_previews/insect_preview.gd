## Fairy Permaculture — Lab insect preview.
##
## Insects are tiny in the world but need to read clearly in the lab
## scrubber, so each silhouette is built at generous scale relative to
## the pad (the viewport auto-frames by AABB in lab.gd). Species are
## grouped by form-family: beetles, winged fliers, butterflies/moths,
## lacewing, mite, aphid cluster, slug, worm, caterpillar.
extends Node3D

const TOON_SHADER_PATH := "res://shaders/toon.gdshader"

## Per-species anatomy. Drives colours, family, wings, legs, antennae.
const SPECIES_CFG: Dictionary = {
	# --- Beetles -------------------------------------------------------
	"ladybug": {
		"family": "beetle",
		"body_color": Color(0.92, 0.14, 0.14),
		"detail_color": Color(0.08, 0.06, 0.06),
		"head_color": Color(0.08, 0.06, 0.06),
		"body_scale": Vector3(1.0, 0.55, 1.15),
		"body_radius": 0.48,
		"spots": 7,
		"has_wing_case_split": true,
	},
	"ground-beetle": {
		"family": "beetle",
		"body_color": Color(0.14, 0.11, 0.16),
		"detail_color": Color(0.22, 0.18, 0.24),
		"head_color": Color(0.18, 0.14, 0.20),
		"body_scale": Vector3(0.9, 0.48, 1.55),
		"body_radius": 0.42,
		"spots": 0,
		"has_wing_case_split": true,
		"iridescent_rim": true,
	},
	"flea-beetle": {
		"family": "beetle",
		"body_color": Color(0.10, 0.18, 0.12),
		"detail_color": Color(0.25, 0.45, 0.32),
		"head_color": Color(0.12, 0.20, 0.14),
		"body_scale": Vector3(1.0, 0.55, 1.3),
		"body_radius": 0.22,
		"spots": 0,
		"has_wing_case_split": true,
		"has_hopper_legs": true,
		"iridescent_rim": true,
	},
	# --- Winged fliers -------------------------------------------------
	"dragonfly": {
		"family": "winged",
		"body_color": Color(0.28, 0.55, 0.38),
		"head_color": Color(0.45, 0.82, 0.52),
		"wing_color": Color(0.92, 0.97, 0.98),
		"body_length": 1.8,
		"body_radius": 0.07,
		"wing_size": Vector3(0.85, 0.02, 0.22),
		"wing_pairs": 2,
	},
	"hoverfly-syrphid": {
		"family": "winged",
		"body_color": Color(0.96, 0.82, 0.22),
		"head_color": Color(0.28, 0.24, 0.18),
		"wing_color": Color(0.92, 0.96, 0.98),
		"body_length": 0.65,
		"body_radius": 0.22,
		"wing_size": Vector3(0.15, 0.02, 0.4),
		"wing_pairs": 1,
		"stripes": 3,
		"stripe_color": Color(0.10, 0.08, 0.06),
	},
	"parasitic-wasp-trichogramma": {
		"family": "winged",
		"body_color": Color(0.24, 0.18, 0.10),
		"head_color": Color(0.30, 0.22, 0.14),
		"wing_color": Color(0.95, 0.97, 1.0),
		"body_length": 0.6,
		"body_radius": 0.08,
		"wing_size": Vector3(0.10, 0.01, 0.25),
		"wing_pairs": 1,
		"has_wasp_waist": true,
		"has_ovipositor": true,
	},
	"apple-maggot": {
		"family": "winged",
		"body_color": Color(0.18, 0.16, 0.20),
		"head_color": Color(0.70, 0.36, 0.14),
		"wing_color": Color(0.95, 0.95, 0.98),
		"wing_stripe_color": Color(0.22, 0.18, 0.10),
		"body_length": 0.45,
		"body_radius": 0.15,
		"wing_size": Vector3(0.12, 0.01, 0.28),
		"wing_pairs": 1,
		"striped_wings": true,
	},
	# --- Butterflies / moths -------------------------------------------
	"butterfly-painted-lady": {
		"family": "butterfly",
		"body_color": Color(0.22, 0.16, 0.10),
		"head_color": Color(0.18, 0.12, 0.08),
		"wing_upper_color": Color(0.92, 0.48, 0.22),
		"wing_lower_color": Color(0.55, 0.28, 0.15),
		"wing_marking_color": Color(0.12, 0.10, 0.08),
		"wing_size_upper": Vector3(0.8, 0.02, 0.55),
		"wing_size_lower": Vector3(0.65, 0.02, 0.45),
		"has_markings": true,
	},
	"codling-moth": {
		"family": "butterfly",
		"body_color": Color(0.38, 0.32, 0.22),
		"head_color": Color(0.28, 0.22, 0.16),
		"wing_upper_color": Color(0.52, 0.42, 0.30),
		"wing_lower_color": Color(0.40, 0.32, 0.22),
		"wing_marking_color": Color(0.22, 0.15, 0.10),
		"wing_size_upper": Vector3(0.5, 0.02, 0.32),
		"wing_size_lower": Vector3(0.38, 0.02, 0.26),
		"mottled": true,
	},
	# --- Lacewing ------------------------------------------------------
	"lacewing-green": {
		"family": "lacewing",
		"body_color": Color(0.55, 0.82, 0.42),
		"head_color": Color(0.65, 0.88, 0.48),
		"wing_color": Color(0.82, 0.96, 0.88),
		"wing_size": Vector3(0.30, 0.015, 0.72),
	},
	# --- Mite ----------------------------------------------------------
	"predatory-mite": {
		"family": "mite",
		"body_color": Color(0.92, 0.38, 0.22),
		"cluster_count": 5,
	},
	# --- Aphid ---------------------------------------------------------
	"aphid-green": {
		"family": "aphid",
		"body_color": Color(0.55, 0.85, 0.38),
		"head_color": Color(0.48, 0.78, 0.34),
		"stem_color": Color(0.42, 0.62, 0.26),
		"leaf_color": Color(0.40, 0.68, 0.32),
		"cluster_count": 8,
	},
	# --- Soil / mollusk ------------------------------------------------
	"earthworm": {
		"family": "worm",
		"body_color": Color(0.76, 0.48, 0.44),
		"segment_color": Color(0.62, 0.32, 0.32),
		"segment_count": 10,
	},
	"slug-banana": {
		"family": "slug",
		"body_color": Color(0.94, 0.82, 0.28),
		"spot_color": Color(0.30, 0.22, 0.10),
		"wet_rim_color": Color(0.98, 0.92, 0.55),
	},
	# --- Caterpillar (cabbage looper) ----------------------------------
	"cabbage-looper": {
		"family": "caterpillar",
		"body_color": Color(0.45, 0.78, 0.38),
		"segment_color": Color(0.32, 0.60, 0.28),
		"head_color": Color(0.38, 0.66, 0.28),
		"segment_count": 6,
	},
}

var entity: Dictionary = {}
var state: String = "adult"
var family: String = "beetle"

var body: MeshInstance3D
var head: MeshInstance3D
var wings: Array[MeshInstance3D] = []
var legs: Array[MeshInstance3D] = []
var antennae: Array[MeshInstance3D] = []
var extras: Array[MeshInstance3D] = []
var segments: Array[MeshInstance3D] = []
var _body_base_pos: Vector3
var _wing_base_rot: Array[float] = []
var _segment_base_pos: Array[Vector3] = []


func setup(e: Dictionary, s: String) -> void:
	entity = e
	state = s
	_build()
	var id: String = String(entity.get("id", ""))
	GameLog.info("insect preview ready: %s (%s)" % [id, family], "lab_insect")


func _build() -> void:
	var id: String = String(entity.get("id", ""))
	var cfg: Dictionary = SPECIES_CFG.get(id, {})
	family = String(cfg.get("family", "beetle"))
	match family:
		"beetle":
			_build_beetle(cfg)
		"winged":
			_build_winged(cfg)
		"butterfly":
			_build_butterfly(cfg)
		"lacewing":
			_build_lacewing(cfg)
		"mite":
			_build_mite(cfg)
		"aphid":
			_build_aphid_cluster(cfg)
		"worm":
			_build_worm(cfg)
		"slug":
			_build_slug(cfg)
		"caterpillar":
			_build_caterpillar(cfg)
		_:
			_build_generic()
	_apply_state_overrides()


## Beetles (ladybug, ground, flea) --------------------------------------

func _build_beetle(cfg: Dictionary) -> void:
	var body_color: Color = cfg.get("body_color", Color(0.3, 0.2, 0.15))
	var detail_color: Color = cfg.get("detail_color", Color(0.1, 0.08, 0.06))
	var head_color: Color = cfg.get("head_color", Color(0.15, 0.12, 0.10))
	var radius: float = cfg.get("body_radius", 0.4)
	var body_scale: Vector3 = cfg.get("body_scale", Vector3(1.0, 0.55, 1.25))
	var spots: int = int(cfg.get("spots", 0))
	var has_split: bool = bool(cfg.get("has_wing_case_split", true))
	var has_hopper: bool = bool(cfg.get("has_hopper_legs", false))
	var iridescent: bool = bool(cfg.get("iridescent_rim", false))

	var body_y: float = 0.50
	body = _sphere(Vector3(0, body_y, 0), radius, body_color)
	body.scale = body_scale
	if iridescent:
		_set_rim(body, 0.5)
	add_child(body)
	_body_base_pos = body.position

	# Head lobe up front.
	head = _sphere(Vector3(0, body_y, radius * body_scale.z * 0.85), radius * 0.35, head_color)
	head.scale = Vector3(1.1, 0.8, 0.9)
	add_child(head)

	# Pronotum (neck shield).
	extras.append(_add_child_mesh(_sphere(
		Vector3(0, body_y + radius * body_scale.y * 0.4, radius * body_scale.z * 0.55),
		radius * 0.5,
		head_color
	)))

	# Wing-case split line — two flat plates on top with a dark groove between.
	if has_split:
		var half: MeshInstance3D = _cube(
			Vector3(0, body_y + radius * body_scale.y * 0.65, 0),
			Vector3(radius * 2.1 * body_scale.x, 0.015, radius * 2.0 * body_scale.z),
			detail_color
		)
		half.scale = Vector3(1.0, 1.0, 1.0)
		add_child(half)
		# Only keep a thin stripe visible — the groove.
		half.scale = Vector3(0.04, 1.5, 1.0)

	# Spots (ladybug gets exactly 7).
	if spots > 0:
		var spot_positions: Array = _ladybug_spot_positions(spots, radius, body_scale)
		for sp_pos in spot_positions:
			var dot: MeshInstance3D = _sphere(
				Vector3(sp_pos.x, body_y + radius * body_scale.y * 0.9, sp_pos.y),
				radius * 0.15,
				detail_color
			)
			add_child(dot)

	# 6 legs — three per side.
	for side in [-1.0, 1.0]:
		for i in range(3):
			var fz: float = -radius * body_scale.z * 0.55 + float(i) * radius * body_scale.z * 0.55
			var leg: MeshInstance3D = _cylinder(
				Vector3(radius * body_scale.x * 0.92 * side, body_y - radius * 0.15, fz),
				0.025, 0.025, radius * 0.55,
				detail_color
			)
			leg.rotation.z = PI * 0.5 * side
			add_child(leg)
			legs.append(leg)
			# Hopper legs — back pair enlarged for flea beetle.
			if has_hopper and i == 2:
				leg.scale = Vector3(1.0, 1.8, 1.6)

	# Antennae.
	for side in [-1.0, 1.0]:
		var ant: MeshInstance3D = _cylinder(
			Vector3(radius * 0.2 * side, body_y + radius * 0.3, radius * body_scale.z * 1.0),
			0.015, 0.018, radius * 0.55,
			detail_color
		)
		ant.rotation.x = -0.6
		ant.rotation.y = 0.3 * side
		add_child(ant)
		antennae.append(ant)


func _ladybug_spot_positions(count: int, radius: float, body_scale: Vector3) -> Array:
	# Classic 7-spot pattern: 1 central + 2 front + 2 mid + 2 rear.
	var rx: float = radius * body_scale.x * 0.55
	var rz: float = radius * body_scale.z * 0.55
	if count == 7:
		return [
			Vector2(0, 0),  # central
			Vector2(-rx * 0.7, rz * 0.5),
			Vector2(rx * 0.7, rz * 0.5),
			Vector2(-rx * 0.9, -rz * 0.2),
			Vector2(rx * 0.9, -rz * 0.2),
			Vector2(-rx * 0.6, -rz * 0.85),
			Vector2(rx * 0.6, -rz * 0.85),
		]
	var pts: Array = []
	for i in range(count):
		var ang: float = float(i) * TAU / float(count)
		pts.append(Vector2(cos(ang) * rx * 0.7, sin(ang) * rz * 0.7))
	return pts


## Winged fliers (dragonfly, hoverfly, wasp, apple maggot fly) ----------

func _build_winged(cfg: Dictionary) -> void:
	var body_color: Color = cfg.get("body_color", Color(0.3, 0.55, 0.8))
	var head_color: Color = cfg.get("head_color", Color(0.5, 0.8, 0.9))
	var wing_color: Color = cfg.get("wing_color", Color(0.9, 0.95, 0.98))
	var body_len: float = cfg.get("body_length", 1.0)
	var body_radius: float = cfg.get("body_radius", 0.08)
	var wing_size: Vector3 = cfg.get("wing_size", Vector3(0.4, 0.01, 0.2))
	var wing_pairs: int = int(cfg.get("wing_pairs", 1))
	var stripes: int = int(cfg.get("stripes", 0))
	var stripe_color: Color = cfg.get("stripe_color", Color(0.1, 0.08, 0.06))
	var has_waist: bool = bool(cfg.get("has_wasp_waist", false))
	var has_ovipositor: bool = bool(cfg.get("has_ovipositor", false))
	var striped_wings: bool = bool(cfg.get("striped_wings", false))
	var wing_stripe_color: Color = cfg.get("wing_stripe_color", Color(0.3, 0.2, 0.1))

	var body_y: float = 0.5

	if has_waist:
		# Thorax + pinched-waist + abdomen for wasp.
		var thorax: MeshInstance3D = _sphere(Vector3(0, body_y, body_len * 0.2), body_radius * 1.4, body_color)
		thorax.scale = Vector3(1.0, 0.9, 1.2)
		add_child(thorax)
		body = thorax
		var waist: MeshInstance3D = _cylinder(Vector3(0, body_y, -body_len * 0.05), body_radius * 0.35, body_radius * 0.35, body_len * 0.22, body_color)
		waist.rotation.x = PI * 0.5
		add_child(waist)
		var abdomen: MeshInstance3D = _sphere(Vector3(0, body_y, -body_len * 0.35), body_radius * 1.25, body_color)
		abdomen.scale = Vector3(1.0, 1.0, 1.6)
		add_child(abdomen)
		extras.append(abdomen)
		# Yellow band on abdomen.
		var band: MeshInstance3D = _cube(Vector3(0, body_y, -body_len * 0.4), Vector3(body_radius * 2.6, body_radius * 2.4, 0.03), Color(0.95, 0.78, 0.20))
		add_child(band)
	else:
		body = _cylinder(Vector3(0, body_y, 0), body_radius, body_radius * 1.3, body_len, body_color)
		body.rotation.x = PI * 0.5
		add_child(body)
	_body_base_pos = body.position

	head = _sphere(Vector3(0, body_y, body_len * 0.55), body_radius * 1.9, head_color)
	add_child(head)

	# Stripes (hoverfly bee-mimic).
	for i in range(stripes):
		var zp: float = -body_len * 0.3 + float(i) * body_len * 0.25
		var stripe: MeshInstance3D = _cube(Vector3(0, body_y + body_radius * 0.5, zp), Vector3(body_radius * 2.2, body_radius * 1.6, 0.04), stripe_color)
		add_child(stripe)

	# Wings — pairs stacked along body.
	for pair_idx in range(wing_pairs):
		var z_off: float = 0.1 - float(pair_idx) * 0.3
		for side in [-1.0, 1.0]:
			var wx: float = (wing_size.x * 0.5 + body_radius) * side
			var w: MeshInstance3D = _cube(Vector3(wx, body_y + body_radius * 0.8, z_off), wing_size, wing_color)
			add_child(w)
			wings.append(w)
			_wing_base_rot.append(0.0)
			# Apple-maggot striped wings: add dark chevrons on top.
			if striped_wings:
				for ci in range(2):
					var chevron: MeshInstance3D = _cube(
						Vector3(wx, body_y + body_radius * 0.9, z_off - wing_size.z * 0.25 + float(ci) * wing_size.z * 0.4),
						Vector3(wing_size.x * 0.85, 0.006, wing_size.z * 0.08),
						wing_stripe_color
					)
					add_child(chevron)

	# Ovipositor (parasitic wasp) — thin dark spike trailing behind.
	if has_ovipositor:
		var ovi: MeshInstance3D = _cylinder(Vector3(0, body_y, -body_len * 0.65), 0.01, 0.015, 0.25, Color(0.15, 0.10, 0.06))
		ovi.rotation.x = PI * 0.5
		add_child(ovi)
		extras.append(ovi)

	# Antennae.
	for side in [-1.0, 1.0]:
		var ant: MeshInstance3D = _cylinder(
			Vector3(body_radius * 0.8 * side, body_y + body_radius * 1.2, body_len * 0.7),
			0.012, 0.012, body_radius * 3.5,
			head_color.darkened(0.3)
		)
		ant.rotation.x = -0.7
		ant.rotation.y = 0.4 * side
		add_child(ant)
		antennae.append(ant)

	# Legs (6) — tucked under.
	for side in [-1.0, 1.0]:
		for i in range(3):
			var fz: float = -body_len * 0.1 + float(i) * body_len * 0.18
			var l: MeshInstance3D = _cylinder(
				Vector3(body_radius * 1.2 * side, body_y - body_radius * 0.5, fz),
				0.013, 0.013, body_radius * 1.8,
				body_color.darkened(0.3)
			)
			l.rotation.z = PI * 0.4 * side
			add_child(l)
			legs.append(l)


## Butterflies / moths --------------------------------------------------

func _build_butterfly(cfg: Dictionary) -> void:
	var body_color: Color = cfg.get("body_color", Color(0.22, 0.16, 0.10))
	var head_color: Color = cfg.get("head_color", Color(0.18, 0.12, 0.08))
	var wing_upper: Color = cfg.get("wing_upper_color", Color(0.85, 0.55, 0.30))
	var wing_lower: Color = cfg.get("wing_lower_color", Color(0.55, 0.32, 0.18))
	var marking: Color = cfg.get("wing_marking_color", Color(0.12, 0.10, 0.08))
	var size_upper: Vector3 = cfg.get("wing_size_upper", Vector3(0.8, 0.02, 0.55))
	var size_lower: Vector3 = cfg.get("wing_size_lower", Vector3(0.65, 0.02, 0.45))
	var has_markings: bool = bool(cfg.get("has_markings", false))
	var mottled: bool = bool(cfg.get("mottled", false))

	var body_y: float = 0.55
	body = _cylinder(Vector3(0, body_y, 0), 0.06, 0.08, 0.55, body_color)
	body.rotation.x = PI * 0.5
	add_child(body)
	_body_base_pos = body.position

	head = _sphere(Vector3(0, body_y, 0.3), 0.09, head_color)
	add_child(head)

	# Wings — 4 total (2 upper, 2 lower).
	for side in [-1.0, 1.0]:
		var wu: MeshInstance3D = _cube(
			Vector3((size_upper.x * 0.55) * side, body_y + 0.05, 0.08),
			size_upper,
			wing_upper
		)
		add_child(wu)
		wings.append(wu)
		_wing_base_rot.append(0.0)
		var wl: MeshInstance3D = _cube(
			Vector3((size_lower.x * 0.52) * side, body_y, -0.18),
			size_lower,
			wing_lower
		)
		add_child(wl)
		wings.append(wl)
		_wing_base_rot.append(0.0)

		# Markings (painted lady has dark eye-spots + white tips).
		if has_markings:
			# Dark tip at outer corner.
			var tip: MeshInstance3D = _cube(
				Vector3((size_upper.x * 0.85) * side, body_y + 0.055, 0.18),
				Vector3(size_upper.x * 0.25, 0.025, size_upper.z * 0.3),
				marking
			)
			add_child(tip)
			# White speck at tip.
			var white_speck: MeshInstance3D = _cube(
				Vector3((size_upper.x * 0.92) * side, body_y + 0.06, 0.2),
				Vector3(size_upper.x * 0.08, 0.03, size_upper.z * 0.1),
				Color(0.95, 0.92, 0.82)
			)
			add_child(white_speck)
			# Dark eye-spot on lower wing.
			var eye: MeshInstance3D = _sphere(
				Vector3((size_lower.x * 0.65) * side, body_y + 0.02, -0.22),
				0.045,
				marking
			)
			add_child(eye)

		# Mottling (codling moth).
		if mottled:
			for i in range(5):
				var a: float = float(i) * 1.3
				var mx: float = (size_upper.x * 0.5) * side + cos(a) * size_upper.x * 0.25
				var mz: float = 0.08 + sin(a) * size_upper.z * 0.3
				var mott: MeshInstance3D = _cube(
					Vector3(mx, body_y + 0.055, mz),
					Vector3(0.04, 0.025, 0.04),
					marking
				)
				add_child(mott)

	# Antennae.
	for side in [-1.0, 1.0]:
		var ant: MeshInstance3D = _cylinder(
			Vector3(0.04 * side, body_y + 0.12, 0.35),
			0.008, 0.011, 0.16,
			head_color
		)
		ant.rotation.x = -0.5
		ant.rotation.y = 0.3 * side
		add_child(ant)
		antennae.append(ant)


## Lacewing — pale green body, huge translucent lacy wings --------------

func _build_lacewing(cfg: Dictionary) -> void:
	var body_color: Color = cfg.get("body_color", Color(0.55, 0.82, 0.42))
	var head_color: Color = cfg.get("head_color", Color(0.65, 0.88, 0.48))
	var wing_color: Color = cfg.get("wing_color", Color(0.82, 0.96, 0.88))
	var wing_size: Vector3 = cfg.get("wing_size", Vector3(0.30, 0.015, 0.72))

	var body_y: float = 0.45
	body = _cylinder(Vector3(0, body_y, 0), 0.06, 0.08, 0.55, body_color)
	body.rotation.x = PI * 0.5
	add_child(body)
	_body_base_pos = body.position

	head = _sphere(Vector3(0, body_y, 0.3), 0.10, head_color)
	add_child(head)

	# Large upper wings + smaller lower wings (net-winged look).
	for side in [-1.0, 1.0]:
		var wu: MeshInstance3D = _cube(
			Vector3((wing_size.x * 0.5 + 0.04) * side, body_y + 0.04, 0.0),
			wing_size,
			wing_color
		)
		add_child(wu)
		wings.append(wu)
		_wing_base_rot.append(0.0)
		var wl: MeshInstance3D = _cube(
			Vector3((wing_size.x * 0.5 + 0.03) * side, body_y - 0.01, -0.05),
			Vector3(wing_size.x * 0.85, wing_size.y, wing_size.z * 0.8),
			wing_color
		)
		add_child(wl)
		wings.append(wl)
		_wing_base_rot.append(0.0)
		# Vein lines — a few dark green threads on the wings for the lacy look.
		for vi in range(3):
			var vein: MeshInstance3D = _cube(
				Vector3((wing_size.x * 0.5 + 0.04) * side, body_y + 0.05, -wing_size.z * 0.3 + float(vi) * wing_size.z * 0.3),
				Vector3(wing_size.x * 0.9, 0.005, 0.008),
				Color(0.35, 0.58, 0.32)
			)
			add_child(vein)

	# Golden compound eyes are iconic.
	for side in [-1.0, 1.0]:
		var eye: MeshInstance3D = _sphere(Vector3(0.05 * side, body_y + 0.02, 0.33), 0.035, Color(0.95, 0.72, 0.25))
		_set_rim(eye, 0.7)
		add_child(eye)

	# Antennae — long, wispy.
	for side in [-1.0, 1.0]:
		var ant: MeshInstance3D = _cylinder(
			Vector3(0.04 * side, body_y + 0.14, 0.36),
			0.008, 0.010, 0.35,
			head_color
		)
		ant.rotation.x = -0.5
		ant.rotation.y = 0.25 * side
		add_child(ant)
		antennae.append(ant)


## Predatory mite — exaggerated cluster of tiny red dots ----------------

func _build_mite(cfg: Dictionary) -> void:
	var body_color: Color = cfg.get("body_color", Color(0.92, 0.38, 0.22))
	var count: int = int(cfg.get("cluster_count", 5))
	# Leaf pad under the cluster so scale reads.
	var leaf: MeshInstance3D = _cube(Vector3(0, 0.12, 0), Vector3(2.4, 0.05, 1.8), Color(0.42, 0.68, 0.32))
	leaf.rotation.z = 0.08
	add_child(leaf)
	# 4-5 mites in a loose cluster.
	for i in range(count):
		var ang: float = float(i) * TAU / float(count) + 0.3
		var rr: float = 0.35 + fmod(float(i) * 0.23, 0.3)
		var mite: MeshInstance3D = _sphere(
			Vector3(cos(ang) * rr, 0.18, sin(ang) * rr),
			0.10,
			body_color
		)
		mite.scale = Vector3(1.1, 0.7, 1.05)
		_set_rim(mite, 0.45)
		add_child(mite)
		segments.append(mite)
		_segment_base_pos.append(mite.position)
		# Tiny legs — 8 for the first mite only (too dense for all).
		if i == 0:
			for side in [-1.0, 1.0]:
				for k in range(4):
					var lang: float = float(k) * 0.45 - 0.6
					var lx: float = cos(ang) * rr + cos(lang) * 0.11 * side
					var lz: float = sin(ang) * rr + sin(lang) * 0.11 * side
					var leg: MeshInstance3D = _cylinder(Vector3(lx, 0.15, lz), 0.008, 0.008, 0.06, body_color.darkened(0.3))
					add_child(leg)
					legs.append(leg)
	body = segments[0]
	_body_base_pos = body.position


## Aphid cluster on a leaf-stem -----------------------------------------

func _build_aphid_cluster(cfg: Dictionary) -> void:
	var body_color: Color = cfg.get("body_color", Color(0.55, 0.85, 0.38))
	var head_color: Color = cfg.get("head_color", Color(0.48, 0.78, 0.34))
	var stem_color: Color = cfg.get("stem_color", Color(0.42, 0.62, 0.26))
	var leaf_color: Color = cfg.get("leaf_color", Color(0.40, 0.68, 0.32))
	var count: int = int(cfg.get("cluster_count", 8))

	# Diagonal host stem running through the scene.
	var stem: MeshInstance3D = _cylinder(Vector3(0, 0.7, 0), 0.06, 0.08, 1.8, stem_color)
	stem.rotation.z = PI * 0.15
	add_child(stem)
	# One leaf sprouting off.
	var leaf: MeshInstance3D = _cube(Vector3(0.7, 1.1, 0), Vector3(0.7, 0.04, 0.4), leaf_color)
	leaf.rotation.z = 0.3
	add_child(leaf)

	# Cluster of pear-shaped aphids on the stem.
	for i in range(count):
		var t: float = float(i) / float(count - 1)
		var along_y: float = 0.3 + t * 1.1
		var along_x: float = -0.25 + t * 0.5
		var side_off: float = 0.06 * (1.0 if i % 2 == 0 else -1.0)
		var px: float = along_x + side_off
		var pz: float = -0.08 + 0.16 * (1.0 if i % 3 == 0 else (0.0 if i % 3 == 1 else -1.0))
		var a_body: MeshInstance3D = _sphere(Vector3(px, along_y, pz), 0.14, body_color)
		a_body.scale = Vector3(0.9, 1.0, 1.25)
		add_child(a_body)
		segments.append(a_body)
		_segment_base_pos.append(a_body.position)
		# Tiny head.
		var a_head: MeshInstance3D = _sphere(Vector3(px, along_y, pz + 0.13), 0.06, head_color)
		add_child(a_head)
		# Cornicles (twin tubes on rear).
		for side in [-1.0, 1.0]:
			var corn: MeshInstance3D = _cylinder(
				Vector3(px + 0.04 * side, along_y + 0.1, pz - 0.1),
				0.012, 0.012, 0.06,
				head_color.darkened(0.3)
			)
			add_child(corn)
	body = segments[0] if segments.size() > 0 else null
	if body != null:
		_body_base_pos = body.position


## Earthworm — segmented pink tube --------------------------------------

func _build_worm(cfg: Dictionary) -> void:
	var body_color: Color = cfg.get("body_color", Color(0.76, 0.48, 0.44))
	var seg_color: Color = cfg.get("segment_color", Color(0.62, 0.32, 0.32))
	var count: int = int(cfg.get("segment_count", 10))

	var total_len: float = 1.8
	var seg_len: float = total_len / float(count)
	for i in range(count):
		var z_off: float = -total_len * 0.5 + float(i) * seg_len + seg_len * 0.5
		var tapered: float = 1.0 - abs(float(i) - float(count) * 0.5) / float(count) * 0.3
		var seg: MeshInstance3D = _sphere(
			Vector3(0, 0.13, z_off),
			0.11 * tapered,
			body_color if i % 2 == 0 else seg_color
		)
		seg.scale = Vector3(0.9, 0.8, 1.2)
		add_child(seg)
		segments.append(seg)
		_segment_base_pos.append(seg.position)
	# Clitellum — the thick pale band near head.
	var clitellum: MeshInstance3D = _sphere(Vector3(0, 0.14, total_len * 0.15), 0.13, Color(0.88, 0.72, 0.65))
	clitellum.scale = Vector3(0.95, 0.85, 1.1)
	add_child(clitellum)
	body = segments[count / 2]
	_body_base_pos = body.position


## Banana slug — elongated glossy yellow body ---------------------------

func _build_slug(cfg: Dictionary) -> void:
	var body_color: Color = cfg.get("body_color", Color(0.94, 0.82, 0.28))
	var spot_color: Color = cfg.get("spot_color", Color(0.30, 0.22, 0.10))
	var wet_color: Color = cfg.get("wet_rim_color", Color(0.98, 0.92, 0.55))

	# Elongated body — series of scaled spheres.
	var body_y: float = 0.18
	var total_len: float = 1.6
	for i in range(5):
		var t: float = float(i) / 4.0
		var z: float = -total_len * 0.5 + t * total_len
		var rad: float = 0.26
		if i == 0:
			rad = 0.18  # tail tip
		elif i == 4:
			rad = 0.24  # head front
		var seg: MeshInstance3D = _sphere(Vector3(0, body_y, z), rad, body_color)
		seg.scale = Vector3(1.15, 0.85, 1.15)
		_set_rim(seg, 0.6)  # glossy wet look
		add_child(seg)
		segments.append(seg)
	# Dark dorsal spots (BC native pattern).
	for i in range(8):
		var z2: float = -total_len * 0.4 + fmod(float(i) * 0.27, 0.85) * total_len
		var x2: float = -0.12 + fmod(float(i) * 0.53, 0.24)
		var spot: MeshInstance3D = _sphere(Vector3(x2, body_y + 0.18, z2), 0.05, spot_color)
		spot.scale = Vector3(1.4, 0.3, 0.9)
		add_child(spot)
	# Foot hem — a thin wet rim along the ground.
	var hem: MeshInstance3D = _cube(Vector3(0, body_y - 0.15, 0), Vector3(0.52, 0.02, total_len * 0.95), wet_color)
	add_child(hem)
	# Antennae (2 optical + 2 tactile).
	var head_z: float = total_len * 0.5 - 0.05
	for side in [-1.0, 1.0]:
		var tall_ant: MeshInstance3D = _cylinder(Vector3(0.04 * side, body_y + 0.25, head_z), 0.014, 0.018, 0.18, body_color)
		tall_ant.rotation.x = -0.2
		add_child(tall_ant)
		antennae.append(tall_ant)
		# Bulb tip (eye).
		var bulb: MeshInstance3D = _sphere(Vector3(0.04 * side, body_y + 0.35, head_z - 0.03), 0.025, spot_color)
		add_child(bulb)
		var low_ant: MeshInstance3D = _cylinder(Vector3(0.06 * side, body_y + 0.12, head_z + 0.04), 0.010, 0.012, 0.08, body_color)
		low_ant.rotation.x = -0.9
		add_child(low_ant)
		antennae.append(low_ant)
	body = segments[2] if segments.size() > 2 else null
	if body != null:
		_body_base_pos = body.position


## Caterpillar (cabbage looper) — segmented green worm w/ inch-gait -----

func _build_caterpillar(cfg: Dictionary) -> void:
	var body_color: Color = cfg.get("body_color", Color(0.45, 0.78, 0.38))
	var seg_color: Color = cfg.get("segment_color", Color(0.32, 0.60, 0.28))
	var head_color: Color = cfg.get("head_color", Color(0.38, 0.66, 0.28))
	var count: int = int(cfg.get("segment_count", 6))

	var total_len: float = 1.4
	var seg_len: float = total_len / float(count)
	for i in range(count):
		var z_off: float = -total_len * 0.5 + float(i) * seg_len + seg_len * 0.5
		var rad: float = 0.18
		var seg: MeshInstance3D = _sphere(
			Vector3(0, 0.22, z_off),
			rad,
			body_color if i % 2 == 0 else seg_color
		)
		seg.scale = Vector3(1.0, 0.95, 1.05)
		add_child(seg)
		segments.append(seg)
		_segment_base_pos.append(seg.position)
	# Head — darker sphere at the front.
	head = _sphere(Vector3(0, 0.22, total_len * 0.5), 0.19, head_color)
	add_child(head)
	# Thin white dorsal stripes (cabbage looper marking).
	for i in range(count):
		var z_off2: float = -total_len * 0.5 + float(i) * seg_len + seg_len * 0.5
		var stripe: MeshInstance3D = _cube(Vector3(0, 0.38, z_off2), Vector3(0.06, 0.02, seg_len * 0.4), Color(0.88, 0.95, 0.85))
		add_child(stripe)
	# Prolegs under the rear.
	for side in [-1.0, 1.0]:
		for k in range(3):
			var lz: float = -0.3 + float(k) * 0.25
			var l: MeshInstance3D = _cylinder(Vector3(0.13 * side, 0.08, lz), 0.024, 0.024, 0.12, seg_color)
			add_child(l)
			legs.append(l)
	body = segments[count / 2]
	_body_base_pos = body.position


func _build_generic() -> void:
	body = _sphere(Vector3(0, 0.3, 0), 0.2, Color(0.65, 0.45, 0.32))
	add_child(body)
	_body_base_pos = body.position


## State scrub ----------------------------------------------------------

func _apply_state_overrides() -> void:
	var base: float = 1.0
	match state:
		"egg":
			base = 0.35
		"larva", "nymph":
			base = 0.65
		"caterpillar":
			base = 0.8
		"pupa", "chrysalis", "cocoon", "protonymph":
			base = 0.85
		"deutonymph":
			base = 0.95
		"adult", "worker", "queen":
			base = 1.0
		"overwintering":
			base = 0.9
			# Tuck wings in.
			for w in wings:
				w.scale = w.scale * 0.6
		"winged-adult":
			base = 1.05
		"wingless-adult":
			base = 0.95
			for w in wings:
				w.visible = false
		"mating", "egg-cluster", "juvenile":
			base = 1.0
		"dead":
			base = 1.0
			rotation.x = PI * 0.5
		"mature-conk", "mature-shelf":
			base = 1.0
		_:
			base = 1.0
	scale = Vector3.ONE * base


## Animation hook -------------------------------------------------------

func animate(anim: String, t: float, _dt: float) -> void:
	match anim:
		"crawl":
			position.x = sin(t * 0.8) * 1.2
			rotation.y = cos(t * 0.8) * 0.3
			_wiggle_antennae(t, 2.0, 0.15)
		"fly", "take-off":
			position = Vector3(cos(t * 0.9) * 1.2, 0.9 + sin(t * 1.4) * 0.3, sin(t * 0.9) * 1.2)
			_flap_wings(t, 40.0, 0.8)
		"flap":
			_flap_wings(t, 3.0, 1.3)
			position.y = 0.2 + sin(t * 3.0) * 0.15
		"hover":
			position.y = 0.6 + sin(t * 3.0) * 0.12
			_flap_wings(t, 40.0, 0.7)
		"hover-mimic-bee":
			position.y = 0.6 + sin(t * 4.5) * 0.12
			_flap_wings(t, 60.0, 0.5)
		"hover-search":
			position = Vector3(sin(t * 0.6) * 0.8, 0.7 + sin(t * 2.0) * 0.2, cos(t * 0.6) * 0.8)
			_flap_wings(t, 50.0, 0.6)
		"land":
			position.y = max(0.0, 1.0 - t * 0.6)
			_flap_wings(t, 30.0, 0.4)
		"dart-hunt", "dart":
			position.x = sin(t * 3.0) * 1.2
			position.z = cos(t * 2.4) * 1.2
			position.y = 0.7 + sin(t * 5.0) * 0.08
			_flap_wings(t, 45.0, 0.7)
		"buzz-pollinate":
			position.y = sin(t * 60.0) * 0.02
			_flap_wings(t, 60.0, 0.5)
		"predate-aphid":
			if head != null:
				head.position.z = head.position.z + sin(t * 6.0) * 0.01
			position.x = sin(t * 0.5) * 0.3
		"hunt":
			if body != null:
				body.position.y = max(0.15, _body_base_pos.y - 0.05 + sin(t * 3.0) * 0.02)
			_wiggle_antennae(t, 4.0, 0.3)
		"hunt-sickle-jaw":
			_wiggle_antennae(t, 5.0, 0.5)
			if head != null:
				head.rotation.y = sin(t * 3.0) * 0.4
		"burrow":
			position.y = -sin(t * 0.4) * 0.3
		"surface", "surface-at-night":
			position.y = max(-0.1, sin(t * 0.3) * 0.15)
		"wriggle":
			_wiggle_segments(t, 3.0, 0.25)
		"loop-crawl":
			# Inchworm arc: middle segments rise + tail meets head.
			if segments.size() > 0 and _segment_base_pos.size() == segments.size():
				var cycle: float = fmod(t * 1.8, TAU)
				var scrunch: float = (sin(cycle) + 1.0) * 0.5  # 0..1
				for i in range(segments.size()):
					var basep: Vector3 = _segment_base_pos[i]
					var tt: float = float(i) / float(segments.size() - 1)
					var arch: float = sin(tt * PI) * scrunch * 0.35
					var pull: float = (tt - 0.5) * scrunch * 0.35
					segments[i].position = Vector3(basep.x, basep.y + arch, basep.z - pull)
			position.x = sin(t * 0.6) * 0.9
		"glide":
			position.x = sin(t * 0.3) * 0.8
			position.z = cos(t * 0.3) * 0.8
			# Very subtle slug-foot ripple.
			for i in range(segments.size()):
				var bp: Vector3 = _segment_base_pos[i] if i < _segment_base_pos.size() else segments[i].position
				segments[i].position.y = bp.y + sin(t * 4.0 + float(i) * 0.6) * 0.01
		"flea-hop":
			position.y = max(0.0, abs(sin(t * 4.0)) * 0.7)
		"oviposit":
			if body != null:
				body.position.y = _body_base_pos.y - abs(sin(t * 4.0)) * 0.08
			# Ovipositor + antennae twitch.
			_wiggle_antennae(t, 6.0, 0.3)
		"emerge-chrysalis", "emerge-from-nymph":
			scale = Vector3.ONE * min(1.0, t * 0.3)
		"pupate":
			scale = Vector3.ONE * max(0.6, 1.0 - min(0.4, t * 0.1))
		"pollen-pack", "nectar-sip":
			if head != null:
				head.rotation.y = sin(t * 2.0) * 0.3
				head.position.y = head.position.y + sin(t * 1.5) * 0.004
		"mate-tandem", "mate-double-penis":
			rotation.y = sin(t * 0.4) * 0.2
		"retract-antennae":
			for i in range(antennae.size()):
				antennae[i].scale.y = 0.3 + 0.7 * (0.5 + 0.5 * cos(t * 1.0))
		"graze":
			position.x = sin(t * 0.4) * 0.3
			if head != null:
				head.rotation.x = sin(t * 1.2) * 0.2
		"suck-sap", "feed":
			if body != null:
				body.scale = Vector3.ONE * (1.0 + 0.05 * sin(t * 2.0))
			# Aphid cluster gently pulses.
			for i in range(segments.size()):
				segments[i].scale = Vector3.ONE * (1.0 + 0.03 * sin(t * 1.5 + float(i) * 0.4))
		"molt", "birth-live-young", "lay-stalked-egg":
			rotation.y = sin(t * 0.6) * 0.3
		"larva-tunnel":
			position.y = -0.1 + sin(t * 1.4) * 0.08
		"larva-slug-hunt":
			position.x = sin(t * 1.2) * 0.6
		"shock-soak":
			position.y = sin(t * 3.0) * 0.04
		"mate-tandem":
			rotation.y = sin(t * 0.5) * 0.25
		"forage-fly":
			position = Vector3(cos(t * 0.9) * 1.2, 0.6 + sin(t * 1.4) * 0.2, sin(t * 0.9) * 1.2)
			_flap_wings(t, 35.0, 0.8)
		_:
			# Default idle — gentle breathing + antennae wiggle.
			scale = Vector3.ONE * (1.0 + 0.02 * sin(t * 1.5))
			_wiggle_antennae(t, 1.5, 0.1)


func _flap_wings(t: float, hz: float, amp: float) -> void:
	for i in range(wings.size()):
		var w: MeshInstance3D = wings[i]
		var side: float = 1.0 if i % 2 == 0 else -1.0
		# Wing-scale jitter for bees/flies — tiny buzz.
		w.rotation.z = side * sin(t * hz) * amp
		if hz >= 30.0:
			w.scale.x = 1.0 + sin(t * hz * 1.3) * 0.02


func _wiggle_antennae(t: float, hz: float, amp: float) -> void:
	for i in range(antennae.size()):
		var a: MeshInstance3D = antennae[i]
		var side: float = 1.0 if i % 2 == 0 else -1.0
		a.rotation.y = side * sin(t * hz + float(i) * 0.5) * amp


func _wiggle_segments(t: float, hz: float, amp: float) -> void:
	for i in range(segments.size()):
		var bp: Vector3 = _segment_base_pos[i] if i < _segment_base_pos.size() else segments[i].position
		segments[i].position.x = bp.x + sin(t * hz + float(i) * 0.7) * amp


func _add_child_mesh(mi: MeshInstance3D) -> MeshInstance3D:
	add_child(mi)
	return mi


func _set_rim(mi: MeshInstance3D, strength: float) -> void:
	if mi.material_override is ShaderMaterial:
		var mat: ShaderMaterial = mi.material_override
		mat.set_shader_parameter("rim_strength", strength)


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
