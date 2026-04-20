## Fairy Permaculture — Lab animal preview.
##
## Builds a recognizable primitive-mesh silhouette for every one of the
## 19 species in data/ecosystem/animals.json and wires up procedural
## animation tied to gameplay states (peck, graze, hover, pounce, ...).
##
## Anatomy lives in SPECIES_CFG at the top of the file. Each species
## picks a body_form, the form-family builder reads the cfg and assembles
## a thoughtful silhouette (chicken = round body + skinny yellow legs +
## red comb, NOT a generic quadruped).
##
## Mood/health tints overlay on top of life-stage scale: hungry = mild
## desaturate + droopy head, sick = heavier desaturate + droopy tail,
## scared = body low + alert head, resting = eyes tucked. The lab feeds
## state via setup(); animate() runs per-frame from lab._process().
extends Node3D

const TOON_SHADER_PATH := "res://shaders/toon.gdshader"

## Per-species anatomy table. Keyed by animal id.
## Missing entries fall back to generic_quadruped / bird by `category`.
const SPECIES_CFG: Dictionary = {
	"chicken-layer": {
		"form": "fowl",
		"body_scale": Vector3(1.3, 1.0, 0.9),
		"body_color": Color(0.88, 0.78, 0.52),    # buff-orange layer
		"head_color": Color(0.88, 0.78, 0.52),
		"comb_color": Color(0.86, 0.16, 0.20),    # red comb + wattle
		"beak_color": Color(0.95, 0.72, 0.28),
		"leg_color":  Color(0.95, 0.78, 0.32),    # skinny yellow legs
		"has_comb": true, "has_wattle": true, "comb_size": 0.09,
		"tail_style": "upright", "tail_color": Color(0.78, 0.60, 0.32),
		"beak_style": "short",
	},
	"duck-runner": {
		"form": "fowl",
		"body_scale": Vector3(0.85, 1.35, 1.0),   # tall upright runner
		"body_color": Color(0.92, 0.90, 0.80),
		"head_color": Color(0.92, 0.90, 0.80),
		"comb_color": Color(0.95, 0.78, 0.30),
		"beak_color": Color(0.95, 0.76, 0.26),    # orange bill
		"leg_color":  Color(0.94, 0.62, 0.20),
		"has_comb": false, "has_wattle": false,
		"tail_style": "flat", "tail_color": Color(0.82, 0.80, 0.70),
		"beak_style": "bill",
	},
	"goose-embden": {
		"form": "fowl",
		"body_scale": Vector3(1.2, 1.1, 1.0),
		"body_color": Color(0.98, 0.98, 0.96),    # white goose
		"head_color": Color(0.98, 0.98, 0.96),
		"comb_color": Color(0.96, 0.80, 0.28),
		"beak_color": Color(0.96, 0.70, 0.20),
		"leg_color":  Color(0.96, 0.60, 0.18),
		"has_comb": false, "has_wattle": false, "long_neck": true,
		"tail_style": "flat", "tail_color": Color(0.92, 0.92, 0.90),
		"beak_style": "bill",
	},
	"turkey-heritage": {
		"form": "fowl",
		"body_scale": Vector3(1.35, 1.05, 1.0),
		"body_color": Color(0.40, 0.28, 0.18),    # bronze
		"head_color": Color(0.55, 0.35, 0.32),
		"comb_color": Color(0.82, 0.22, 0.22),    # snood
		"beak_color": Color(0.90, 0.78, 0.40),
		"leg_color":  Color(0.55, 0.38, 0.22),
		"has_comb": true, "has_wattle": true, "comb_size": 0.12, "has_snood": true,
		"tail_style": "fan", "tail_color": Color(0.48, 0.34, 0.22),
		"beak_style": "short",
	},
	"rabbit-californian": {
		"form": "rodent",
		"body_scale": Vector3(1.0, 0.95, 1.0),
		"body_color": Color(0.96, 0.94, 0.90),    # white with dark points
		"ear_color":  Color(0.20, 0.18, 0.16),    # dark Californian points
		"nose_color": Color(0.20, 0.18, 0.16),
		"tail_color": Color(1.0, 0.98, 0.94),
	},
	"honeybee": {
		"form": "bee",
		"body_color": Color(0.98, 0.82, 0.28),    # golden
		"stripe_color": Color(0.12, 0.08, 0.04),
		"head_color": Color(0.14, 0.10, 0.06),
		"fuzz": true, "abdomen_len": 1.9,
	},
	"mason-bee": {
		"form": "bee",
		"body_color": Color(0.26, 0.42, 0.72),    # metallic blue
		"stripe_color": Color(0.10, 0.18, 0.32),
		"head_color": Color(0.10, 0.12, 0.18),
		"fuzz": false, "abdomen_len": 1.5,
	},
	"bumblebee": {
		"form": "bee",
		"body_color": Color(0.96, 0.82, 0.18),    # bright yellow
		"stripe_color": Color(0.08, 0.06, 0.04),
		"head_color": Color(0.08, 0.06, 0.04),
		"fuzz": true, "abdomen_len": 1.4, "chubby": true, "face_yellow": true,
	},
	"dairy-goat-nigerian": {
		"form": "quadruped",
		"body_scale": Vector3(0.80, 0.55, 0.45),  # compact dwarf
		"body_color": Color(0.55, 0.40, 0.26),    # brown
		"leg_color":  Color(0.30, 0.22, 0.14),
		"head_alert": true, "has_horns": true, "has_beard": true,
		"has_udder": true, "ear_style": "perk",
		"hoof_color": Color(0.14, 0.10, 0.08),
	},
	"dairy-sheep-east-friesian": {
		"form": "quadruped",
		"body_scale": Vector3(1.1, 0.7, 0.55),
		"body_color": Color(0.95, 0.94, 0.90),    # fleece white
		"face_color": Color(0.95, 0.93, 0.88),    # bare white face + thin tail
		"leg_color":  Color(0.90, 0.86, 0.78),
		"is_fleece": true, "has_udder": true, "ear_style": "perk",
	},
	"dexter-cow": {
		"form": "quadruped",
		"body_scale": Vector3(1.6, 0.95, 0.82),   # big barrel
		"body_color": Color(0.12, 0.10, 0.08),    # Dexter black
		"leg_color":  Color(0.12, 0.10, 0.08),
		"has_horns": true, "horn_color": Color(0.88, 0.82, 0.62),
		"has_udder": true, "big_udder": true,
		"ear_style": "flop-side", "hoof_color": Color(0.05, 0.04, 0.03),
	},
	"pig-silvopasture": {
		"form": "quadruped",
		"body_scale": Vector3(1.25, 0.7, 0.62),   # low barrel
		"body_color": Color(0.16, 0.12, 0.10),    # Berkshire black
		"leg_color":  Color(0.85, 0.80, 0.70),    # white socks
		"has_snout": true, "snout_color": Color(0.35, 0.25, 0.20),
		"curly_tail": true, "ear_style": "forward-flop",
	},
	"llama-guardian": {
		"form": "quadruped",
		"body_scale": Vector3(1.15, 0.75, 0.55),
		"body_color": Color(0.82, 0.72, 0.55),    # tan fleece
		"leg_color":  Color(0.62, 0.52, 0.35),
		"long_neck": true, "has_banana_ears": true,
		"ear_style": "banana",
	},
	"dog-lgd": {
		"form": "carnivore",
		"body_scale": Vector3(1.0, 0.55, 0.52),
		"body_color": Color(0.96, 0.95, 0.92),    # Great Pyrenees white
		"leg_color":  Color(0.92, 0.90, 0.86),
		"snout_color": Color(0.20, 0.14, 0.10),
		"ear_style": "flop", "tail_style": "curl-up", "big_head": true,
	},
	"barn-cat": {
		"form": "carnivore",
		"body_scale": Vector3(0.55, 0.30, 0.28),
		"body_color": Color(0.35, 0.32, 0.26),    # tabby dark
		"stripe_color": Color(0.22, 0.20, 0.16),
		"leg_color":  Color(0.30, 0.28, 0.22),
		"ear_style": "triangle", "tail_style": "long-upright", "slinky": true,
	},
	"rainbow-trout": {
		"form": "fish",
		"body_color": Color(0.70, 0.72, 0.78),    # silvery
		"stripe_color": Color(0.88, 0.38, 0.45),  # rainbow stripe
		"is_crayfish": false,
	},
	"crayfish": {
		"form": "fish",
		"body_color": Color(0.52, 0.28, 0.20),
		"stripe_color": Color(0.72, 0.40, 0.28),
		"is_crayfish": true,
	},
	"earthworm-red-wiggler": {
		"form": "micro",
		"body_color": Color(0.62, 0.20, 0.22),    # red wiggler
		"segment_count": 7,
		"segment_scale": Vector3(0.85, 0.85, 1.25),
		"is_larva": false,
	},
	"bsf-larvae": {
		"form": "micro",
		"body_color": Color(0.88, 0.82, 0.55),    # pale yellow-brown
		"segment_count": 6,
		"segment_scale": Vector3(1.0, 0.9, 1.05),
		"is_larva": true,
	},
}


var entity: Dictionary = {}
var state: String = "adult"
var category: String = "poultry"
var cfg: Dictionary = {}
var body_form: String = "generic"

## Logical parts. Any may stay null when the form doesn't need it.
var body: MeshInstance3D
var head: MeshInstance3D
var neck: MeshInstance3D
var beak: MeshInstance3D
var comb: MeshInstance3D
var snood: MeshInstance3D
var wattle: MeshInstance3D
var udder: MeshInstance3D
var snout: MeshInstance3D
var tail: MeshInstance3D
var tail_fin: MeshInstance3D
var wings: Array[MeshInstance3D] = []
var legs: Array[MeshInstance3D] = []
var ears: Array[MeshInstance3D] = []
var horns: Array[MeshInstance3D] = []
var fin_pairs: Array[MeshInstance3D] = []
var segments: Array[MeshInstance3D] = []

## Cached transforms for animations.
var _body_base_pos: Vector3 = Vector3.ZERO
var _head_base_pos: Vector3 = Vector3.ZERO
var _tail_base_rot: Vector3 = Vector3.ZERO
var _self_base_pos: Vector3 = Vector3.ZERO
var _self_base_rot: Vector3 = Vector3.ZERO

## Mood modulation (set in _apply_state_overrides, read in animate()).
var _mood_desaturate: float = 0.0
var _mood_head_droop: float = 0.0
var _mood_tail_droop: float = 0.0
var _mood_body_low: float = 0.0
var _mood_breath_scale: float = 1.0

## All meshes remember their original tint so mood tints can apply.
var _orig_colors: Dictionary = {}  # MeshInstance3D (id) -> Color


func setup(e: Dictionary, s: String, c: String) -> void:
	entity = e
	state = s
	category = c
	var id: String = String(entity.get("id", ""))
	cfg = SPECIES_CFG.get(id, {})
	body_form = String(cfg.get("form", _guess_form_from_category(category, id)))
	_build()
	if Engine.has_singleton("GameLog"):
		pass
	# Use the autoload log unconditionally; it always exists in this project.
	var logger: Node = get_node_or_null("/root/GameLog")
	if logger and logger.has_method("info"):
		logger.call("info", "animal preview ready: %s (%s)" % [id, body_form], "lab_animal")


func _guess_form_from_category(cat: String, id: String) -> String:
	if cat == "poultry":
		return "fowl"
	if cat == "insect":
		return "bee"
	if cat in ["small-livestock", "medium-livestock", "guardian-livestock"]:
		return "quadruped"
	if cat in ["guardian", "guardian-small"]:
		return "carnivore"
	if cat in ["fish", "shellfish"]:
		return "fish"
	if cat == "detritivore":
		return "micro"
	if id.begins_with("rabbit"):
		return "rodent"
	return "quadruped"


func _build() -> void:
	match body_form:
		"fowl":      _build_fowl(cfg)
		"bee":       _build_bee(cfg)
		"rodent":    _build_rodent(cfg)
		"quadruped": _build_mammal_quadruped(cfg)
		"carnivore": _build_carnivore(cfg)
		"fish":      _build_fish(cfg)
		"micro":     _build_micro(cfg)
		_:           _build_generic()
	_apply_state_overrides()
	_snapshot_original_colors()
	_apply_mood_tint()


## ---------------------------------------------------------------- Fowl
## chicken / duck / goose / turkey — round body, narrow head, two skinny
## legs, wings tucked at sides, a tail shaped by tail_style.

func _build_fowl(c: Dictionary) -> void:
	var body_color: Color = c.get("body_color", Color(0.90, 0.82, 0.60))
	var head_color: Color = c.get("head_color", body_color)
	var beak_color: Color = c.get("beak_color", Color(0.95, 0.72, 0.30))
	var leg_color: Color = c.get("leg_color", Color(0.95, 0.72, 0.30))
	var body_scale_v: Vector3 = c.get("body_scale", Vector3(1.3, 1.0, 0.9))
	var long_neck_b: bool = c.get("long_neck", false)
	var beak_style: String = c.get("beak_style", "short")
	var tail_style: String = c.get("tail_style", "upright")
	var tail_color: Color = c.get("tail_color", body_color.darkened(0.18))

	# Body
	body = _sphere(Vector3(0, 0.50, 0), 0.36, body_color)
	body.scale = body_scale_v
	add_child(body)

	# Neck bump under head
	if long_neck_b:
		neck = _cylinder(Vector3(0, 0.80, 0.18), 0.08, 0.11, 0.45, head_color)
		neck.rotation.x = -0.25
		add_child(neck)
		head = _sphere(Vector3(0, 1.06, 0.34), 0.17, head_color)
	else:
		head = _sphere(Vector3(0, 0.88, 0.28), 0.19, head_color)
	add_child(head)

	# Beak
	if beak_style == "bill":
		beak = _cube(head.position + Vector3(0, -0.02, 0.22), Vector3(0.14, 0.07, 0.22), beak_color)
	else:
		beak = _cube(head.position + Vector3(0, -0.02, 0.20), Vector3(0.08, 0.07, 0.15), beak_color)
	add_child(beak)

	# Comb / snood / wattle (chicken + turkey)
	if c.get("has_comb", false):
		var comb_size: float = c.get("comb_size", 0.09)
		var comb_color_c: Color = c.get("comb_color", Color(0.86, 0.18, 0.22))
		comb = _sphere(head.position + Vector3(0, 0.17, -0.02), comb_size, comb_color_c)
		comb.scale = Vector3(1.5, 0.55, 0.55)
		add_child(comb)
	if c.get("has_wattle", false):
		var comb_color_w: Color = c.get("comb_color", Color(0.86, 0.18, 0.22))
		wattle = _sphere(head.position + Vector3(0, -0.14, 0.08), 0.06, comb_color_w)
		wattle.scale = Vector3(1.0, 1.2, 0.7)
		add_child(wattle)
	if c.get("has_snood", false):
		var snood_color: Color = c.get("comb_color", Color(0.82, 0.22, 0.22))
		snood = _cylinder(head.position + Vector3(0, 0.03, 0.20), 0.03, 0.04, 0.16, snood_color)
		snood.rotation.x = 0.6
		add_child(snood)

	# Wings
	var wing_color: Color = body_color.darkened(0.15)
	for side in [-1, 1]:
		var w: MeshInstance3D = _cube(
			Vector3(0.26 * float(side), 0.52, -0.02),
			Vector3(0.11, 0.26, 0.48),
			wing_color
		)
		w.rotation.z = -0.12 * float(side)
		add_child(w)
		wings.append(w)

	# Skinny legs — two thin cylinders + little feet
	for side in [-1, 1]:
		var hip: Vector3 = Vector3(0.11 * float(side), 0.20, 0)
		var shin: MeshInstance3D = _cylinder(hip, 0.035, 0.035, 0.30, leg_color)
		add_child(shin)
		legs.append(shin)
		# Foot
		var foot: MeshInstance3D = _cube(hip + Vector3(0, -0.18, 0.08), Vector3(0.10, 0.04, 0.14), leg_color)
		add_child(foot)

	# Tail
	match tail_style:
		"upright":
			tail = _cube(Vector3(0, 0.72, -0.40), Vector3(0.24, 0.28, 0.14), tail_color)
			tail.rotation.x = -0.6
		"flat":
			tail = _cube(Vector3(0, 0.48, -0.42), Vector3(0.22, 0.10, 0.22), tail_color)
		"fan":
			tail = _cube(Vector3(0, 0.70, -0.40), Vector3(0.45, 0.42, 0.08), tail_color)
			tail.rotation.x = -0.4
	if tail != null:
		add_child(tail)
		_tail_base_rot = tail.rotation

	_body_base_pos = body.position
	_head_base_pos = head.position


## ----------------------------------------------------------------- Bee
## mason / honey / bumble — fuzzy striped abdomen, dark head, transparent
## wing quads that vibrate in hover/forage. Honeybee = golden 3 stripes,
## mason = metallic blue smooth, bumble = chubby bright yellow fuzzy.

func _build_bee(c: Dictionary) -> void:
	var body_color: Color = c.get("body_color", Color(0.95, 0.82, 0.28))
	var stripe_color: Color = c.get("stripe_color", Color(0.10, 0.08, 0.06))
	var head_color: Color = c.get("head_color", stripe_color)
	var abdomen_len: float = c.get("abdomen_len", 1.7)
	var chubby: bool = c.get("chubby", false)
	var fuzz: bool = c.get("fuzz", true)
	var face_yellow: bool = c.get("face_yellow", false)

	# Abdomen (elongated sphere)
	body = _sphere(Vector3(0, 0.62, -0.08), 0.18, body_color)
	var bb_scale: Vector3 = Vector3(1.0, 0.90, abdomen_len)
	if chubby:
		bb_scale = Vector3(1.25, 1.15, abdomen_len)
	body.scale = bb_scale
	add_child(body)

	# Thorax (smaller sphere joining head to abdomen, slightly fuzzier tint)
	var thorax_color: Color = body_color.lerp(stripe_color, 0.15)
	var thorax: MeshInstance3D = _sphere(Vector3(0, 0.62, 0.18), 0.15, thorax_color)
	thorax.scale = Vector3(1.15, 1.0, 1.0)
	add_child(thorax)

	# Three abdomen stripes (black) — thin rings set along the Z axis
	var stripe_count: int = 3
	for i in range(stripe_count):
		var zoff: float = -0.30 + float(i) * 0.18
		var stripe: MeshInstance3D = _cube(Vector3(0, 0.62, zoff), Vector3(0.34, 0.30, 0.05), stripe_color)
		add_child(stripe)

	# Fuzzy shell — bumblebee + honeybee get extra tiny off-tint spheres
	if fuzz:
		for i in range(6):
			var ang: float = float(i) * TAU / 6.0
			var fuzz_ball: MeshInstance3D = _sphere(
				Vector3(cos(ang) * 0.16, 0.62 + sin(ang) * 0.12, -0.05),
				0.04,
				body_color.lightened(0.12)
			)
			add_child(fuzz_ball)

	# Head
	head = _sphere(Vector3(0, 0.62, 0.36), 0.13, head_color if not face_yellow else body_color)
	add_child(head)

	# Antennae
	for side in [-1, 1]:
		var ant: MeshInstance3D = _cylinder(
			Vector3(0.05 * float(side), 0.78, 0.40),
			0.008, 0.008, 0.12, stripe_color
		)
		ant.rotation.x = -0.4
		ant.rotation.z = 0.3 * float(side)
		add_child(ant)

	# Transparent wings (use pale blueish tint; vibration comes from animate).
	for side in [-1, 1]:
		var w: MeshInstance3D = _cube(
			Vector3(0.16 * float(side), 0.82, 0.04),
			Vector3(0.14, 0.015, 0.32),
			Color(0.92, 0.96, 1.0)
		)
		add_child(w)
		wings.append(w)

	# Six spindly legs
	for i in range(6):
		var side: int = -1 if i % 2 == 0 else 1
		var zoff: float = -0.16 + 0.16 * float(i / 2)
		var leg: MeshInstance3D = _cylinder(
			Vector3(0.09 * float(side), 0.48, zoff),
			0.012, 0.012, 0.16, stripe_color
		)
		leg.rotation.z = 0.3 * float(side)
		add_child(leg)
		legs.append(leg)

	_body_base_pos = body.position
	_head_base_pos = head.position


## ------------------------------------------------------------- Rodent
## Rabbit — short front legs, big hind legs tucked, round cottontail,
## long upright ears. Californian breed: white body + dark point ears/nose.

func _build_rodent(c: Dictionary) -> void:
	var body_color: Color = c.get("body_color", Color(0.96, 0.94, 0.90))
	var ear_color: Color = c.get("ear_color", Color(0.25, 0.20, 0.18))
	var nose_color: Color = c.get("nose_color", ear_color)
	var tail_color_l: Color = c.get("tail_color", Color(1.0, 0.98, 0.94))

	body = _sphere(Vector3(0, 0.34, 0), 0.30, body_color)
	body.scale = Vector3(1.15, 0.9, 0.95)
	add_child(body)

	head = _sphere(Vector3(0, 0.52, 0.26), 0.18, body_color)
	add_child(head)
	# Dark nose cap
	add_child(_sphere(Vector3(0, 0.48, 0.42), 0.06, nose_color))

	# Long upright ears
	for side in [-1, 1]:
		var ear: MeshInstance3D = _cube(
			Vector3(0.08 * float(side), 0.82, 0.22),
			Vector3(0.06, 0.38, 0.10),
			ear_color
		)
		ear.rotation.x = -0.1
		add_child(ear)
		ears.append(ear)

	# Cottontail
	tail = _sphere(Vector3(0, 0.36, -0.30), 0.10, tail_color_l)
	add_child(tail)

	# Front legs short, hind legs bigger
	for side in [-1, 1]:
		var front: MeshInstance3D = _cylinder(
			Vector3(0.12 * float(side), 0.12, 0.14), 0.04, 0.05, 0.18, body_color.darkened(0.08)
		)
		add_child(front)
		legs.append(front)
		var hind: MeshInstance3D = _cube(
			Vector3(0.14 * float(side), 0.14, -0.14), Vector3(0.12, 0.12, 0.24), body_color.darkened(0.08)
		)
		add_child(hind)
		legs.append(hind)

	_body_base_pos = body.position
	_head_base_pos = head.position


## --------------------------------------------------------- Quadruped
## Shared builder for goat / sheep / cow / pig / llama with cfg knobs.

func _build_mammal_quadruped(c: Dictionary) -> void:
	var body_scale_v: Vector3 = c.get("body_scale", Vector3(1.0, 0.7, 0.5))
	var body_color: Color = c.get("body_color", Color(0.60, 0.45, 0.30))
	var leg_color: Color = c.get("leg_color", body_color.darkened(0.15))
	var hoof_color: Color = c.get("hoof_color", Color(0.10, 0.08, 0.06))
	var ear_style: String = c.get("ear_style", "perk")
	var has_horns_b: bool = c.get("has_horns", false)
	var horn_color: Color = c.get("horn_color", Color(0.30, 0.22, 0.14))
	var has_beard_b: bool = c.get("has_beard", false)
	var has_udder_b: bool = c.get("has_udder", false)
	var big_udder: bool = c.get("big_udder", false)
	var is_fleece: bool = c.get("is_fleece", false)
	var long_neck_b: bool = c.get("long_neck", false)
	var has_snout_b: bool = c.get("has_snout", false)
	var snout_color: Color = c.get("snout_color", body_color.lightened(0.15))
	var curly_tail_b: bool = c.get("curly_tail", false)
	var has_banana_ears_b: bool = c.get("has_banana_ears", false)
	var head_alert: bool = c.get("head_alert", false)

	var body_y: float = 0.55 + body_scale_v.y * 0.25
	body = _cube(Vector3(0, body_y, 0), Vector3(body_scale_v.x, body_scale_v.y, body_scale_v.z), body_color)
	add_child(body)

	# Sheep fleece: big fluffy clouds layered over the body
	if is_fleece:
		for i in range(5):
			var x: float = -body_scale_v.x * 0.42 + body_scale_v.x * 0.21 * float(i)
			add_child(_sphere(Vector3(x, body_y + 0.18, 0.0), body_scale_v.y * 0.45, Color(0.97, 0.96, 0.93)))
		for i in range(3):
			var x2: float = -body_scale_v.x * 0.3 + body_scale_v.x * 0.30 * float(i)
			add_child(_sphere(Vector3(x2, body_y + 0.12, body_scale_v.z * 0.35), body_scale_v.y * 0.38, Color(0.97, 0.96, 0.93)))
			add_child(_sphere(Vector3(x2, body_y + 0.12, -body_scale_v.z * 0.35), body_scale_v.y * 0.38, Color(0.97, 0.96, 0.93)))

	# Neck + head
	var head_y: float = body_y + body_scale_v.y * 0.35
	var head_z: float = body_scale_v.z * 0.5 + 0.20
	if long_neck_b:
		neck = _cylinder(
			Vector3(0, body_y + body_scale_v.y * 0.5, body_scale_v.z * 0.4),
			0.12, 0.16, 0.85, body_color
		)
		neck.rotation.x = -0.45
		add_child(neck)
		head_y = body_y + body_scale_v.y * 0.9
		head_z = body_scale_v.z * 0.5 + 0.45
		head = _sphere(Vector3(0, head_y, head_z), 0.17, body_color)
	else:
		# A small neck chunk so the head doesn't float
		neck = _cube(
			Vector3(0, body_y + body_scale_v.y * 0.15, body_scale_v.z * 0.5 + 0.05),
			Vector3(body_scale_v.x * 0.32, body_scale_v.y * 0.45, 0.22),
			body_color
		)
		add_child(neck)
		head = _cube(Vector3(0, head_y, head_z), Vector3(body_scale_v.x * 0.35, body_scale_v.y * 0.55, 0.42), body_color)
	add_child(head)

	# Muzzle accent (sheep/cow paler, goat tighter, pig big snout)
	if has_snout_b:
		snout = _cube(head.position + Vector3(0, -0.02, 0.23), Vector3(0.25, 0.22, 0.15), snout_color)
		add_child(snout)
	else:
		# Small muzzle highlight, slightly lighter than body
		add_child(_cube(head.position + Vector3(0, -0.08, 0.18), Vector3(0.20, 0.13, 0.15), body_color.lightened(0.10)))

	# Ears
	for side in [-1, 1]:
		var s: float = float(side)
		var ear_pos: Vector3 = head.position + Vector3(0.14 * s, 0.15, -0.05)
		var ear: MeshInstance3D = null
		match ear_style:
			"perk":
				ear = _cube(ear_pos, Vector3(0.07, 0.14, 0.05), body_color.darkened(0.12))
			"flop-side":
				ear = _cube(ear_pos + Vector3(0.06 * s, -0.06, 0), Vector3(0.14, 0.08, 0.06), body_color.darkened(0.12))
				ear.rotation.z = 0.6 * s
			"forward-flop":
				ear = _cube(ear_pos + Vector3(0, -0.02, 0.05), Vector3(0.10, 0.18, 0.05), body_color.darkened(0.12))
				ear.rotation.x = 0.55
			"banana":
				ear = _cube(ear_pos + Vector3(0, 0.05, 0), Vector3(0.05, 0.22, 0.05), body_color.darkened(0.12))
				ear.rotation.z = 0.25 * s
			_:
				ear = _cube(ear_pos, Vector3(0.08, 0.12, 0.05), body_color.darkened(0.12))
		add_child(ear)
		ears.append(ear)

	# Goat banana ears override was handled by ear_style; llama banana too.
	var _unused_banana: bool = has_banana_ears_b

	# Horns
	if has_horns_b:
		for side in [-1, 1]:
			var horn: MeshInstance3D = _cylinder(
				head.position + Vector3(0.10 * float(side), 0.20, 0.0),
				0.025, 0.045, 0.22, horn_color
			)
			horn.rotation.z = 0.4 * float(side)
			add_child(horn)
			horns.append(horn)

	# Goat beard
	if has_beard_b:
		add_child(_cube(head.position + Vector3(0, -0.16, 0.14), Vector3(0.06, 0.12, 0.04), body_color.lightened(0.08)))

	# Udder (gameplay signal: big = cow lactating, small = goat)
	if has_udder_b:
		var udder_size: float = (0.22 if big_udder else 0.12)
		udder = _sphere(Vector3(0, body_y - body_scale_v.y * 0.5, -body_scale_v.z * 0.15), udder_size, Color(0.96, 0.86, 0.80))
		add_child(udder)

	# Four thick legs with hooves
	var leg_h: float = body_y - body_scale_v.y * 0.5 - 0.02
	var leg_len: float = leg_h
	for x in [-body_scale_v.x * 0.35, body_scale_v.x * 0.35]:
		for z in [-body_scale_v.z * 0.35, body_scale_v.z * 0.35]:
			var leg_r: float = 0.07
			if body_scale_v.y > 0.85: leg_r = 0.10  # cow thick
			if body_scale_v.y < 0.6: leg_r = 0.06   # goat / sheep
			var leg_mid: float = leg_len * 0.5
			var leg: MeshInstance3D = _cylinder(
				Vector3(x, leg_mid, z), leg_r, leg_r, leg_len, leg_color
			)
			add_child(leg)
			legs.append(leg)
			# Hoof
			add_child(_cube(Vector3(x, 0.02, z), Vector3(0.11, 0.04, 0.11), hoof_color))

	# Tail
	if curly_tail_b:
		tail = _cylinder(Vector3(0, body_y, -body_scale_v.z * 0.55), 0.02, 0.02, 0.22, body_color)
		tail.rotation.z = 1.0
		add_child(tail)
	else:
		tail = _cube(Vector3(0, body_y, -body_scale_v.z * 0.55), Vector3(0.08, 0.08, 0.25), body_color)
		add_child(tail)

	_body_base_pos = body.position
	_head_base_pos = head.position
	_tail_base_rot = tail.rotation
	if head_alert:
		head.rotation.x = -0.18


## --------------------------------------------------------- Carnivore
## dog (Great Pyrenees) + barn cat — narrow body, four legs, distinct
## head + tail shape from ruminants. Dog = big fluffy white, cat = slinky.

func _build_carnivore(c: Dictionary) -> void:
	var body_color: Color = c.get("body_color", Color(0.95, 0.95, 0.90))
	var leg_color: Color = c.get("leg_color", body_color.darkened(0.10))
	var body_scale_v: Vector3 = c.get("body_scale", Vector3(0.9, 0.5, 0.45))
	var ear_style: String = c.get("ear_style", "flop")
	var tail_style: String = c.get("tail_style", "curl-up")
	var snout_color: Color = c.get("snout_color", Color(0.2, 0.14, 0.10))
	var big_head: bool = c.get("big_head", false)
	var slinky: bool = c.get("slinky", false)
	var stripe_color: Color = c.get("stripe_color", body_color.darkened(0.12))

	var body_y: float = 0.38 + body_scale_v.y * 0.25
	body = _cube(Vector3(0, body_y, 0), Vector3(body_scale_v.x, body_scale_v.y, body_scale_v.z), body_color)
	add_child(body)

	# Cat stripes — subtle tabby bars on top
	if slinky:
		for i in range(4):
			var zoff: float = -body_scale_v.z * 0.5 + body_scale_v.z * 0.32 * float(i)
			add_child(_cube(
				Vector3(0, body_y + body_scale_v.y * 0.5, zoff),
				Vector3(body_scale_v.x * 0.9, 0.04, 0.04),
				stripe_color
			))

	# Head
	var head_r: float = (0.24 if big_head else 0.15)
	head = _sphere(Vector3(0, body_y + body_scale_v.y * 0.35, body_scale_v.z * 0.55 + 0.10), head_r, body_color)
	add_child(head)

	# Snout
	snout = _cube(head.position + Vector3(0, -0.05, 0.20), Vector3(head_r * 1.0, head_r * 0.7, head_r * 1.0), snout_color)
	add_child(snout)

	# Ears
	for side in [-1, 1]:
		var ear_pos: Vector3 = head.position + Vector3(head_r * 0.7 * float(side), head_r * 0.6, -0.02)
		var ear: MeshInstance3D = null
		match ear_style:
			"triangle":
				ear = _cube(ear_pos, Vector3(head_r * 0.5, head_r * 0.9, head_r * 0.4), body_color.darkened(0.15))
				ear.rotation.z = -0.25 * float(side)
			"flop":
				ear = _cube(ear_pos + Vector3(0.03 * float(side), -0.10, 0.02), Vector3(head_r * 0.45, head_r * 1.2, head_r * 0.5), body_color.darkened(0.08))
				ear.rotation.z = 0.6 * float(side)
			_:
				ear = _cube(ear_pos, Vector3(head_r * 0.5, head_r * 0.8, head_r * 0.4), body_color.darkened(0.15))
		add_child(ear)
		ears.append(ear)

	# Legs (four)
	var leg_h: float = body_y - body_scale_v.y * 0.5 - 0.02
	for x in [-body_scale_v.x * 0.34, body_scale_v.x * 0.34]:
		for z in [-body_scale_v.z * 0.32, body_scale_v.z * 0.32]:
			var leg: MeshInstance3D = _cylinder(
				Vector3(x, leg_h * 0.5, z), 0.05, 0.055, leg_h, leg_color
			)
			add_child(leg)
			legs.append(leg)
			add_child(_cube(Vector3(x, 0.03, z), Vector3(0.09, 0.04, 0.10), leg_color.darkened(0.25)))

	# Tail
	match tail_style:
		"curl-up":
			tail = _cylinder(Vector3(0, body_y + 0.22, -body_scale_v.z * 0.5), 0.05, 0.05, 0.5, body_color)
			tail.rotation.x = -0.9
		"long-upright":
			tail = _cylinder(Vector3(0, body_y + 0.08, -body_scale_v.z * 0.55), 0.035, 0.035, 0.55, body_color)
			tail.rotation.x = -1.1
		_:
			tail = _cylinder(Vector3(0, body_y, -body_scale_v.z * 0.5), 0.04, 0.04, 0.4, body_color)
	add_child(tail)
	_tail_base_rot = tail.rotation

	_body_base_pos = body.position
	_head_base_pos = head.position


## ---------------------------------------------------------------- Fish
## trout (lateral stripe) + crayfish (segmented with big claws).

func _build_fish(c: Dictionary) -> void:
	var body_color: Color = c.get("body_color", Color(0.55, 0.62, 0.68))
	var stripe_color: Color = c.get("stripe_color", body_color.darkened(0.2))
	var is_crayfish: bool = c.get("is_crayfish", false)

	# Water pad
	add_child(_cube(Vector3(0, -0.02, 0), Vector3(3.2, 0.04, 3.2), Color(0.35, 0.55, 0.75)))
	# A rippled second layer for depth
	add_child(_cube(Vector3(0, -0.05, 0), Vector3(3.4, 0.04, 3.4), Color(0.28, 0.48, 0.68)))

	if is_crayfish:
		# Segmented cephalothorax + abdomen
		body = _sphere(Vector3(0, 0.18, 0), 0.18, body_color)
		body.scale = Vector3(1.2, 0.7, 1.4)
		add_child(body)
		# Tail segments
		for i in range(4):
			var zoff: float = -0.22 - float(i) * 0.12
			var seg: MeshInstance3D = _cube(Vector3(0, 0.16, zoff), Vector3(0.22 - float(i) * 0.02, 0.10, 0.10), stripe_color)
			add_child(seg)
			segments.append(seg)
		# Tail fan
		tail_fin = _cube(Vector3(0, 0.16, -0.80), Vector3(0.35, 0.06, 0.18), body_color.darkened(0.1))
		add_child(tail_fin)
		# Two big claws
		for side in [-1, 1]:
			var claw: MeshInstance3D = _cube(
				Vector3(0.28 * float(side), 0.18, 0.32),
				Vector3(0.22, 0.10, 0.18),
				stripe_color
			)
			claw.rotation.y = 0.5 * float(side)
			add_child(claw)
			fin_pairs.append(claw)
		# Eyes on stalks
		for side in [-1, 1]:
			add_child(_sphere(Vector3(0.06 * float(side), 0.28, 0.22), 0.025, Color(0.05, 0.05, 0.05)))
		# Thin legs
		for i in range(8):
			var side: int = -1 if i % 2 == 0 else 1
			var leg: MeshInstance3D = _cylinder(
				Vector3(0.18 * float(side), 0.08, -0.1 + 0.08 * float(i / 2)),
				0.015, 0.015, 0.12, stripe_color
			)
			leg.rotation.z = 0.5 * float(side)
			add_child(leg)
			legs.append(leg)
	else:
		# Trout — torpedo body with top/bottom fin and lateral rainbow stripe
		body = _sphere(Vector3(0, 0.40, 0), 0.32, body_color)
		body.scale = Vector3(1.0, 0.55, 2.1)
		add_child(body)
		# Rainbow lateral stripe
		var stripe: MeshInstance3D = _cube(Vector3(0, 0.42, 0), Vector3(0.60, 0.05, 1.20), stripe_color)
		add_child(stripe)
		# Top fin
		add_child(_cube(Vector3(0, 0.64, 0.05), Vector3(0.08, 0.22, 0.38), body_color.darkened(0.15)))
		# Bottom fin
		add_child(_cube(Vector3(0, 0.20, -0.05), Vector3(0.06, 0.14, 0.28), body_color.darkened(0.18)))
		# Pectoral side fins
		for side in [-1, 1]:
			var pec: MeshInstance3D = _cube(
				Vector3(0.24 * float(side), 0.36, 0.18),
				Vector3(0.12, 0.04, 0.22),
				body_color.darkened(0.18)
			)
			pec.rotation.z = 0.4 * float(side)
			add_child(pec)
			fin_pairs.append(pec)
		# Tail fin (vertical)
		tail_fin = _cube(Vector3(0, 0.40, -0.82), Vector3(0.06, 0.36, 0.16), body_color.darkened(0.10))
		add_child(tail_fin)
		# Eye
		add_child(_sphere(Vector3(0.18, 0.46, 0.48), 0.04, Color(0.05, 0.05, 0.05)))

	_body_base_pos = body.position


## ---------------------------------------------------------------- Micro
## red wiggler + BSF larvae — segmented tubes. Wiggler is darker red
## and thinner, BSF is pale yellow and slightly fatter.

func _build_micro(c: Dictionary) -> void:
	var body_color: Color = c.get("body_color", Color(0.58, 0.18, 0.18))
	var segment_count: int = c.get("segment_count", 7)
	var segment_scale_v: Vector3 = c.get("segment_scale", Vector3(0.9, 0.9, 1.3))
	var is_larva: bool = c.get("is_larva", false)

	# Substrate pad (soil for worm, compost for larva)
	var pad_color: Color = (Color(0.30, 0.22, 0.14) if not is_larva else Color(0.45, 0.36, 0.22))
	add_child(_cube(Vector3(0, -0.05, 0), Vector3(2.2, 0.1, 2.2), pad_color))

	for i in range(segment_count):
		var t: float = (float(i) / float(max(1, segment_count - 1))) - 0.5
		var zoff: float = t * float(segment_count) * 0.18
		var seg_color: Color = body_color.lerp(body_color.darkened(0.15), float(i % 2))
		var radius: float = 0.10
		# BSF larva is fatter in middle and narrows at both ends.
		if is_larva:
			var bulge: float = 1.0 - abs(t) * 0.8
			radius = 0.11 * bulge
		var seg: MeshInstance3D = _sphere(Vector3(0, 0.13, zoff), radius, seg_color)
		seg.scale = segment_scale_v
		add_child(seg)
		segments.append(seg)

	# Worm head is just slightly lighter cap at +Z end
	var head_color: Color = body_color.lightened(0.12)
	head = _sphere(Vector3(0, 0.13, float(segment_count) * 0.09), 0.10, head_color)
	add_child(head)

	_body_base_pos = Vector3(0, 0.13, 0)
	_head_base_pos = head.position


func _build_generic() -> void:
	body = _sphere(Vector3(0, 0.40, 0), 0.32, Color(0.72, 0.55, 0.42))
	add_child(body)
	head = _sphere(Vector3(0, 0.60, 0.32), 0.18, Color(0.72, 0.55, 0.42))
	add_child(head)
	_body_base_pos = body.position
	_head_base_pos = head.position


## ---------------------------------------------------- State overrides

func _apply_state_overrides() -> void:
	_self_base_pos = position
	_self_base_rot = rotation
	var base: float = 1.0
	match state:
		"egg", "chick", "duckling", "kitten", "puppy", "poult", "gosling", "piglet", "calf", "lamb", "kit", "cria", "larva", "kid", "fry", "fingerling", "hatchling":
			base = 0.45
		"juvenile", "pullet", "young", "pupa", "cocoon", "prepupa":
			base = 0.72
		"adult", "mature", "worker", "queen", "drone", "breeding", "adult-fly", "male", "senior", "broody", "spawning":
			base = 1.0
		"pregnant":
			base = 1.08
			_mood_breath_scale = 1.02
		"molting", "shorn":
			base = 0.95
		"sick":
			_mood_desaturate = 0.55
			_mood_head_droop = 0.45
			_mood_tail_droop = 0.5
			_mood_breath_scale = 0.6
		"hungry":
			_mood_desaturate = 0.15
			_mood_head_droop = 0.22
		"scared":
			_mood_body_low = 0.1
			_mood_head_droop = -0.3  # alert (up)
		"resting":
			_mood_body_low = 0.05
			_mood_head_droop = 0.15
		"dead":
			rotation.z = PI * 0.5  # tipped over
			_mood_desaturate = 0.8
		_:
			base = 1.0
	scale = Vector3.ONE * base
	# Apply head/body-low immediately so first frame reads the state.
	if head != null:
		head.rotation.x = _head_base_pos_rot_default() + _mood_head_droop
	if body != null:
		body.position = _body_base_pos + Vector3(0, -_mood_body_low, 0)
	if tail != null:
		tail.rotation.x = _tail_base_rot.x + _mood_tail_droop


func _head_base_pos_rot_default() -> float:
	# Quadruped heads have a small forward tilt configured in builder.
	if body_form == "quadruped" and head != null:
		return head.rotation.x
	return 0.0


## Color mood tints --------------------------------------------------

func _snapshot_original_colors() -> void:
	_snapshot_recursive(self)


func _snapshot_recursive(n: Node) -> void:
	if n is MeshInstance3D:
		var mi: MeshInstance3D = n as MeshInstance3D
		var mat: Material = mi.material_override
		if mat is ShaderMaterial:
			var sm: ShaderMaterial = mat as ShaderMaterial
			var v: Variant = sm.get_shader_parameter("albedo_color")
			if v is Vector4:
				var v4: Vector4 = v
				_orig_colors[mi.get_instance_id()] = Color(v4.x, v4.y, v4.z, v4.w)
	for c in n.get_children():
		_snapshot_recursive(c)


func _apply_mood_tint() -> void:
	if _mood_desaturate <= 0.0:
		return
	_tint_recursive(self)


func _tint_recursive(n: Node) -> void:
	if n is MeshInstance3D:
		var mi: MeshInstance3D = n as MeshInstance3D
		var id: int = mi.get_instance_id()
		if _orig_colors.has(id):
			var orig: Color = _orig_colors[id]
			var gray: float = orig.r * 0.3 + orig.g * 0.59 + orig.b * 0.11
			var muted: Color = orig.lerp(Color(gray, gray, gray, orig.a), _mood_desaturate)
			var mat: Material = mi.material_override
			if mat is ShaderMaterial:
				var sm: ShaderMaterial = mat as ShaderMaterial
				sm.set_shader_parameter("albedo_color", Vector4(muted.r, muted.g, muted.b, muted.a))
	for c in n.get_children():
		_tint_recursive(c)


## ----------------------------------------------------------- Animations
## Procedural tweens driven by (anim_name, t_seconds, dt).

func animate(anim: String, t: float, _dt: float) -> void:
	if anim == null or anim == "" or anim == "—":
		# Still breathe in idle when no animation given.
		_breathe(t)
		return

	# Many animations share a gentle breathing envelope beneath the
	# specific motion. We apply that first, then layer the anim.
	_breathe(t)

	match anim:
		# --- shared basics ---
		"idle":
			if head != null:
				head.rotation.y = sin(t * 0.6) * 0.18
			if tail != null and body_form == "carnivore":
				tail.rotation.y = sin(t * 2.2) * 0.35  # tail wag
		"walk":
			_walk_cycle(t, 4.0)
		"run":
			_walk_cycle(t, 7.5)
		"death":
			rotation.z = min(PI * 0.5, _self_base_rot.z + t * 0.6)
			position.y = _self_base_pos.y - min(0.15, t * 0.15)

		# --- fowl ---
		"peck":
			if head != null:
				var cycle: float = fmod(t * 2.2, 1.0)
				var dip: float = sin(cycle * PI) * 0.18
				head.position = _head_base_pos - Vector3(0, dip, -dip * 0.4)
				head.rotation.x = 0.7 * dip / 0.18
		"roost":
			scale = Vector3(1.0, 0.62, 1.0) * 0.96
			for leg in legs:
				leg.visible = false
		"flap-fear", "flap-alarm":
			for i in range(wings.size()):
				var w: MeshInstance3D = wings[i]
				var side: float = 1.0 if i == 0 else -1.0
				w.rotation.z = side * (0.1 + sin(t * 18.0) * 0.9)
			if head != null:
				head.rotation.x = -0.4  # head up alert
		"dust-bathe":
			rotation.y = sin(t * 4.0) * 0.3
			if body != null:
				body.rotation.z = sin(t * 3.0) * 0.12
		"display-fan":
			if tail != null:
				tail.scale = Vector3(1.0, 1.0, 1.0) + Vector3(0.8, 0.8, 0.0) * abs(sin(t * 0.9))
				tail.rotation.x = _tail_base_rot.x + sin(t * 0.9) * 0.2
		"preen":
			if head != null:
				head.rotation.z = sin(t * 2.5) * 0.45
				head.position = _head_base_pos + Vector3(0, -0.10, -0.04)
		"hiss":
			if head != null:
				head.rotation.x = -0.25 + sin(t * 6.0) * 0.10
				head.position = _head_base_pos + Vector3(0, 0.04, 0.08)
		"forage":
			if head != null:
				head.position = _head_base_pos + Vector3(0, -0.12 + sin(t * 3.0) * 0.04, 0)
				head.rotation.x = 0.5

		# --- waterfowl ---
		"swim":
			position = _self_base_pos + Vector3(sin(t * 0.8) * 0.8, 0.02 + sin(t * 2.0) * 0.02, cos(t * 0.8) * 0.8)
			rotation.y = _self_base_rot.y + t * 0.4
			# Hide legs to fake "paddling under water"
			for leg in legs:
				leg.visible = false
		"paddle":
			position.y = _self_base_pos.y + sin(t * 2.2) * 0.02
			for leg in legs:
				leg.visible = false
		"dabble":
			if head != null:
				head.rotation.x = 1.2 + sin(t * 4.0) * 0.08
				head.position = _head_base_pos + Vector3(0, -0.18, 0.08)

		# --- bees ---
		"hover":
			if body != null:
				body.position = _body_base_pos + Vector3(0, sin(t * 6.0) * 0.05, 0)
			_flap_wings_fast(t)
		"forage-fly":
			position = _self_base_pos + Vector3(cos(t * 0.8) * 1.2, 0.4 + sin(t * 1.2) * 0.25, sin(t * 0.8) * 1.2)
			rotation.y = _self_base_rot.y + t * 0.8 + PI * 0.5
			if body != null:
				body.rotation.x = -0.25  # nose-dive forward
			_flap_wings_fast(t)
		"dance-waggle":
			# Figure-8 in XZ, with a waggle on the straight run
			var tau_cycle: float = fmod(t, 3.0) / 3.0
			var loop_x: float = sin(tau_cycle * TAU * 2.0) * 0.25
			var loop_z: float = sin(tau_cycle * TAU) * 0.15
			position = _self_base_pos + Vector3(loop_x, 0, loop_z)
			rotation.y = _self_base_rot.y + sin(t * 1.8) * 0.6
			if body != null:
				body.position = _body_base_pos + Vector3(sin(t * 22.0) * 0.02, 0, 0)  # waggle
			_flap_wings_fast(t)
		"hive-idle":
			if body != null:
				body.position = _body_base_pos + Vector3(0, sin(t * 3.0) * 0.01, 0)
			_flap_wings_slow(t)
		"land":
			if body != null:
				body.position = _body_base_pos + Vector3(0, max(0.0, 0.3 - t * 0.3), 0)
			_flap_wings_fast(t)
		"enter-tube":
			if body != null:
				body.position = _body_base_pos + Vector3(0, 0, min(t * 0.5, 0.8))
		"exit-tube":
			if body != null:
				body.position = _body_base_pos + Vector3(0, 0, max(0.8 - t * 0.5, 0.0))
		"pollen-pack":
			_flap_wings_slow(t)
			if head != null:
				head.rotation.x = sin(t * 3.0) * 0.2
		"buzz-pollinate":
			if body != null:
				body.position = _body_base_pos + Vector3(0, sin(t * 90.0) * 0.015, 0)
			_flap_wings_fast(t)
		"cluster":
			# Tuck under hive — stay small, slow breath.
			scale = Vector3.ONE * 0.9
		"swarm":
			position = _self_base_pos + Vector3(cos(t * 2.0) * 0.5, 0.4 + sin(t * 1.7) * 0.15, sin(t * 2.0) * 0.5)
			_flap_wings_fast(t)

		# --- rodent ---
		"hop":
			var hop_cycle: float = fmod(t * 1.8, 1.0)
			position.y = _self_base_pos.y + abs(sin(hop_cycle * PI)) * 0.35
			rotation.x = _self_base_rot.x + sin(hop_cycle * PI) * 0.15
		"eat":
			if head != null:
				head.position = _head_base_pos + Vector3(0, -0.08 + sin(t * 8.0) * 0.02, 0.02)
				head.rotation.x = 0.35
		"groom":
			if head != null:
				head.position = _head_base_pos + Vector3(0, -0.02, -0.04)
				head.rotation.z = sin(t * 3.0) * 0.35
		"thump":
			if fmod(t, 1.2) < 0.15:
				position.y = _self_base_pos.y + 0.05
			else:
				position.y = _self_base_pos.y

		# --- ruminants / cow / pig / llama ---
		"graze":
			if head != null:
				head.position = _head_base_pos + Vector3(0, -0.22, 0.04)
				head.rotation.x = 0.75 + sin(t * 1.5) * 0.08
		"browse":
			if head != null:
				head.position = _head_base_pos + Vector3(0, 0.18, 0.04)  # head up to trees
				head.rotation.x = -0.25 + sin(t * 1.2) * 0.10
		"chew-cud", "chew":
			if head != null:
				head.rotation.x = _head_base_pos_rot_default() + sin(t * 4.5) * 0.08
				head.rotation.z = sin(t * 4.5) * 0.05  # jaw wiggle
		"low":
			if head != null:
				head.rotation.x = _head_base_pos_rot_default() - 0.35
				head.position = _head_base_pos + Vector3(0, 0.06, 0.04)
		"butt":
			if head != null:
				var phb: float = fmod(t * 2.0, 1.0)
				head.position = _head_base_pos + Vector3(0, 0, sin(phb * PI) * 0.28)
		"climb":
			position.y = _self_base_pos.y + 0.3 * (0.5 + 0.5 * sin(t * 0.8))
			rotation.x = _self_base_rot.x - 0.15
		"nurse":
			scale = Vector3.ONE * (1.0 + 0.02 * sin(t * 3.0))
			if head != null:
				head.rotation.x = _head_base_pos_rot_default() + 0.35
		"rootle":
			if head != null:
				head.position = _head_base_pos + Vector3(sin(t * 6.0) * 0.05, -0.20, 0.06)
				head.rotation.x = 0.65
		"wallow":
			rotation.z = _self_base_rot.z + sin(t * 1.5) * 0.25
			position.y = _self_base_pos.y - 0.05
		"alarm":
			if head != null:
				head.rotation.x = _head_base_pos_rot_default() - 0.45  # head up
			for ear in ears:
				ear.rotation.x = sin(t * 4.0) * 0.15
		"charge":
			position.z = _self_base_pos.z + sin(t * 3.0) * 0.5
			if head != null:
				head.rotation.x = _head_base_pos_rot_default() - 0.2
		"lie_down":
			position.y = _self_base_pos.y - 0.25
			rotation.z = _self_base_rot.z + 0.15
		"moo":
			if head != null:
				head.rotation.x = _head_base_pos_rot_default() - 0.35
				head.position = _head_base_pos + Vector3(0, 0.08, 0)
		"shear":
			# Quick spin effect
			rotation.y = _self_base_rot.y + sin(t * 4.0) * 0.3

		# --- carnivore / dog / cat ---
		"patrol":
			position = _self_base_pos + Vector3(sin(t * 0.5) * 1.8, 0, cos(t * 0.5) * 1.8)
			rotation.y = _self_base_rot.y + t * 0.5 + PI * 0.5
			_walk_cycle(t, 5.0)
		"bark":
			if head != null:
				head.rotation.x = _head_base_pos_rot_default() + sin(t * 10.0) * 0.25
				head.position = _head_base_pos + Vector3(0, 0.04 + abs(sin(t * 10.0)) * 0.03, 0.02)
			if tail != null:
				tail.rotation.y = sin(t * 6.0) * 0.4
		"sit":
			position.y = _self_base_pos.y - 0.12
			rotation.x = _self_base_rot.x + 0.15
		"sleep":
			position.y = _self_base_pos.y - 0.20
			rotation.z = _self_base_rot.z + 0.05
			if head != null:
				head.rotation.x = _head_base_pos_rot_default() + 0.4
		"hunt-crouch":
			scale = Vector3(1.05, 0.6, 1.2)
			position.y = _self_base_pos.y - 0.05
			if head != null:
				head.rotation.x = _head_base_pos_rot_default() + 0.15
		"pounce":
			var pc: float = fmod(t * 1.5, 1.0)
			position.y = _self_base_pos.y + abs(sin(pc * PI)) * 0.55
			position.z = _self_base_pos.z + pc * 0.3

		# --- fish / crayfish ---
		"feed":
			if head != null:
				head.position = _head_base_pos + Vector3(0, sin(t * 6.0) * 0.03, 0)
		"jump":
			position.y = _self_base_pos.y + max(0.0, sin(t * 2.0) * 0.6)
			rotation.x = _self_base_rot.x + sin(t * 2.0) * 0.5
		"dart":
			position = _self_base_pos + Vector3(sin(t * 6.0) * 0.3, 0, cos(t * 6.0) * 0.3)
			if tail_fin != null:
				tail_fin.rotation.y = sin(t * 12.0) * 0.6
		"crawl":
			position.x = _self_base_pos.x + sin(t * 0.8) * 0.4
			for leg in legs:
				leg.rotation.z = 0.5 + sin(t * 8.0 + leg.position.z * 6.0) * 0.2
		"swim-backward":
			position.z = _self_base_pos.z + sin(t * 1.2) * 0.5
			if tail_fin != null:
				tail_fin.rotation.y = sin(t * 6.0) * 0.5
		"molt":
			scale = Vector3.ONE * (1.0 + 0.1 * sin(t * 2.0))

		# --- micro / worm / BSF ---
		"wriggle":
			for i in range(segments.size()):
				var seg: MeshInstance3D = segments[i]
				seg.rotation.y = sin(t * 5.0 + float(i) * 0.7) * 0.35
				seg.position.x = sin(t * 5.0 + float(i) * 0.7) * 0.04
		"burrow":
			position.y = _self_base_pos.y - min(0.12, t * 0.2)
			for i in range(segments.size()):
				var seg: MeshInstance3D = segments[i]
				seg.rotation.y = sin(t * 3.0 + float(i) * 0.5) * 0.2
		"surface":
			position.y = _self_base_pos.y - 0.12 + min(0.12, t * 0.2)
		"crawl-self-harvest":
			for i in range(segments.size()):
				var seg: MeshInstance3D = segments[i]
				seg.position.y = 0.13 + sin(t * 4.0 + float(i) * 0.8) * 0.03
		"pupate":
			scale = Vector3.ONE * (0.9 + 0.05 * sin(t * 1.5))
		"fly":
			position.y = _self_base_pos.y + 0.4 + sin(t * 4.0) * 0.15
			rotation.y = _self_base_rot.y + t * 2.0

		_:
			pass


## Anim helpers ------------------------------------------------------

func _breathe(t: float) -> void:
	if body != null:
		var amp: float = 0.015 * _mood_breath_scale
		var freq: float = 1.3
		body.position = _body_base_pos + Vector3(0, sin(t * freq) * amp, 0)


func _walk_cycle(t: float, freq: float) -> void:
	if body != null:
		body.position = _body_base_pos + Vector3(0, abs(sin(t * freq)) * 0.04, 0)
	for i in range(legs.size()):
		var leg: MeshInstance3D = legs[i]
		var ph: float = t * freq + float(i) * PI * 0.5
		leg.rotation.x = sin(ph) * 0.35


func _flap_wings_fast(t: float) -> void:
	for i in range(wings.size()):
		var w: MeshInstance3D = wings[i]
		var side: float = 1.0 if i == 0 else -1.0
		# 60 Hz-style blur (visual only — just high-frequency rotation).
		w.rotation.z = side * (0.2 + sin(t * 70.0) * 0.85)


func _flap_wings_slow(t: float) -> void:
	for i in range(wings.size()):
		var w: MeshInstance3D = wings[i]
		var side: float = 1.0 if i == 0 else -1.0
		w.rotation.z = side * sin(t * 8.0) * 0.4


## ----------------------------------------------------------- Mesh helpers

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
