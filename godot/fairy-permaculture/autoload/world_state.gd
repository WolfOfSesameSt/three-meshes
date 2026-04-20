## Fairy Permaculture — global world-vitality state.
##
## Holds the 0–1 `vitality` score (rolled up from OM, species, animal
## diversity, biology). Applies a WORLD-WIDE saturation + warmth tint
## ON TOP of whatever `sun_cycle.gd` has already written to the
## Environment + DirectionalLight this frame.
##
## Cooperation contract (see sun_cycle.gd):
##   • sun_cycle writes base sky / ambient / sun each frame @ priority 0.
##   • world_state runs @ priority 100 and NEVER overwrites the base
##     hue. It only:
##       1. Sets `env.adjustment_saturation` (LUT-equivalent).
##       2. Nudges `env.ambient_light_color` partway toward a warm
##          palette anchor using a SMALL, vitality-scaled blend. The
##          nudge is bounded so sun_cycle's dawn/dusk color still reads.
##       3. Scales `_sun.light_energy` by a small multiplier.
##
## Every color comes from `Palette.*`. No raw `Color(r, g, b)` literals.
## Palette + warm-pastel rule: `DESIGN.md` §Art Direction,
## feedback_happy_palette_mandatory.md.
##
## The V key cycles vitality through demo levels (0 / 0.3 / 0.6 / 1.0)
## so you can A/B the four mood bands without waiting for progression.
extends Node

signal vitality_changed(value: float)

const DEMO_LEVELS: Array[float] = [0.0, 0.3, 0.6, 1.0]

# Saturation floor / mid / ceiling. Never dips below the happy floor.
const SAT_LOW: float = 0.85
const SAT_MID: float = 1.05
const SAT_HIGH: float = 1.18

# Max blend weight we're allowed to push ambient/sun toward our anchor.
# Kept small so sun_cycle's dawn/dusk read survives. Barren gets the
# biggest nudge (so cold-grey can never ship); thriving lets the time-
# of-day dominate.
const AMBIENT_NUDGE_MAX: float = 0.28
const AMBIENT_NUDGE_MIN: float = 0.08

# Sun-energy multiplier band. 1.0 at mid vitality.
const SUN_ENERGY_LOW: float = 0.92
const SUN_ENERGY_HIGH: float = 1.12

var vitality: float = 0.15
var _demo_index: int = 0
var _env: Environment
var _sun: DirectionalLight3D


func _ready() -> void:
	# Run AFTER sun_cycle.gd each frame so its base writes land first.
	process_priority = 100
	call_deferred("_late_bind")


func _process(_delta: float) -> void:
	_apply()


func _late_bind() -> void:
	refresh_bindings()
	_apply()


## Scene controller calls this after its _ready() so we can grab
## Environment + Sun for the current scene.
func refresh_bindings() -> void:
	_env = null
	_sun = null
	var root: Node = get_tree().current_scene
	if root == null:
		return
	var we: WorldEnvironment = root.find_child("WorldEnvironment", true, false) as WorldEnvironment
	if we != null:
		_env = we.environment
	var sun_node: Node = root.find_child("Sun", true, false)
	if sun_node is DirectionalLight3D:
		_sun = sun_node


func set_vitality(v: float) -> void:
	vitality = clamp(v, 0.0, 1.0)
	emit_signal("vitality_changed", vitality)
	_apply()


## Cycle through the demo bands; called by `V` key.
func cycle_demo_vitality() -> void:
	_demo_index = (_demo_index + 1) % DEMO_LEVELS.size()
	set_vitality(DEMO_LEVELS[_demo_index])


## Optional: rebuild vitality from world state. Lightweight — it only
## samples OM right now; wildlife diversity / biology come later.
func recompute_from_world() -> void:
	var avg_om: float = WorldGrid.average_om_pct()
	var om_norm: float = clamp(avg_om / 10.0, 0.0, 1.0)
	var species_count: int = 0
	var scene_root: Node = get_tree().current_scene
	if scene_root != null:
		var seen: Dictionary = {}
		for p in scene_root.get_tree().get_nodes_in_group("plants"):
			var sid: String = (p as Node).get("species_id")
			if sid != null and sid != "":
				seen[sid] = true
		species_count = seen.size()
	var species_norm: float = clamp(float(species_count) / 30.0, 0.0, 1.0)
	var animal_norm: float = 0.0
	var biology_norm: float = om_norm * 0.5
	var v: float = om_norm * 0.4 + species_norm * 0.3 + animal_norm * 0.2 + biology_norm * 0.1
	set_vitality(v)


func _apply() -> void:
	if _env == null or _sun == null:
		refresh_bindings()
	if _env != null:
		_env.adjustment_enabled = true
		_env.adjustment_saturation = _saturation_for(vitality)
		# Single-shot, bounded nudge toward the vitality ambient anchor.
		# Runs every frame but because `lerp(x, y, t)` with small t just
		# pulls x closer to y — sun_cycle rewrites ambient from scratch
		# next frame, so there is no runaway drift.
		var amb_anchor: Color = _ambient_anchor(vitality)
		var nudge: float = _ambient_nudge_for(vitality)
		# Palette anchors are trusted as-authored. `clamp_happy` would
		# wreck low-saturation pastel hues (MOON, HONEY_SKY) by forcing
		# them over the saturation floor and rotating their hue toward
		# HONEY. Skip it here; the adjustment_saturation LUT above gives
		# us the vitality-saturation effect correctly without mangling
		# the source colors.
		_env.ambient_light_color = (_env.ambient_light_color as Color).lerp(amb_anchor, nudge)
	if _sun != null:
		# Multiply sun energy by a small vitality band. 1.0 at mid
		# vitality, slightly down/up at extremes. Never clamps the sun
		# out at night — sun_cycle already handled below-horizon vis.
		var mul: float = lerp(SUN_ENERGY_LOW, SUN_ENERGY_HIGH, vitality)
		_sun.light_energy = _sun.light_energy * mul


# ---------- LUT anchors (all derived from Palette.*) ----------

## Saturation piecewise.
##   vitality 0.0 → 0.85  (warm-muted, no washed-out grey)
##   vitality 0.3 → 0.95
##   vitality 0.6 → 1.05  (full palette)
##   vitality 1.0 → 1.18
func _saturation_for(v: float) -> float:
	if v <= 0.3:
		return lerp(SAT_LOW, 0.95, v / 0.3)
	elif v <= 0.6:
		return lerp(0.95, SAT_MID, (v - 0.3) / 0.3)
	return lerp(SAT_MID, SAT_HIGH, (v - 0.6) / 0.4)


## Vitality-scaled ambient anchor. At barren we bias toward the warm
## HONEY_SKY tone (so cold grey can never ship). At climax we let the
## sky cycle dominate and only hint toward MEADOW.
func _ambient_anchor(v: float) -> Color:
	if v <= 0.3:
		return Palette.HONEY_SKY.lerp(Palette.MOON, v / 0.3 * 0.35)
	elif v <= 0.6:
		var base: Color = Palette.MOON.lerp(Palette.HONEY_SKY, 0.40)
		return base.lerp(Palette.MEADOW, (v - 0.3) / 0.3 * 0.20)
	return Palette.MOON.lerp(Palette.MEADOW, 0.25)


## Nudge weight — how strongly we pull ambient toward the anchor.
## Barren gets the biggest (so it can't ship cold-grey). Thriving +
## climax let sun_cycle's colors dominate.
func _ambient_nudge_for(v: float) -> float:
	if v <= 0.3:
		return lerp(AMBIENT_NUDGE_MAX, 0.18, v / 0.3)
	return lerp(0.18, AMBIENT_NUDGE_MIN, clamp((v - 0.3) / 0.7, 0.0, 1.0))
