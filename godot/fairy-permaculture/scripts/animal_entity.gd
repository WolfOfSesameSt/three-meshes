## Fairy Permaculture — AnimalEntity base class.
##
## Every species (chicken, duck, goat, cow, pig, LGD dog, barn cat) is a
## subclass of this node. The base handles the shared day-tick needs
## simulation (hunger / thirst / health / mood / aging + death) and the
## forage-first → feeder-fallback AI from the locked animal-system spec.
## Subclasses override `_species_configure()` to set their stats +
## visual overrides (forage_tiles, rates, output_per_day, mesh).
##
## Locked design references (must stay consistent):
## - Lifespans roll from a normal distribution (`_rand_normal`) at spawn
##   so no cohort cliffs — some chickens die at 2 years, most at 3, a
##   handful reach 4.5.
## - Meat is NOT fairy food. Products like eggs + milk flow into
##   FarmTotals.fairy_food + typed-resource channels; carcass outputs
##   feed the soil engine via Kiln / Butcher Station pipelines.
## - Visible state changes (see feedback_visible_state_changes.md): mood,
##   health, age tint, sleeping, foraging, dead — every state has a
##   visible mesh/color shift. No hidden stats.
##
## The node is a `Node3D` (not StaticBody3D) because animals don't need
## click-to-context-menu routing in phase 1 — that'll come in a later
## HUD-animal-roster agent. Subclasses can attach a ClickArea later.
extends Node3D
class_name AnimalEntity


signal died(entity: AnimalEntity)
signal state_changed(new_state: String, old_state: String)


# ---- Lifecycle states ----
const STATE_IDLE: String      = "idle"
const STATE_FORAGING: String  = "foraging"
const STATE_DRINKING: String  = "drinking"
const STATE_RETURNING: String = "returning"
const STATE_SLEEPING: String  = "sleeping"
const STATE_DEAD: String      = "dead"


# ---- Species identity (subclass overrides) ----
@export var species_id: String = "generic"
@export var species_display_name: String = "Animal"

# ---- Age / lifespan ----
var age_days: int = 0
## Rolled at _ready() from `rand_normal(species_mean, species_stddev)`.
## Clamped to >= 30 days so we never spawn an already-dying animal. The
## debug sim overrides this via `override_max_age_days` before `_ready`.
var max_age_days: int = 1080
@export var species_lifespan_mean: float = 1080.0    # chicken default
@export var species_lifespan_stddev: float = 180.0
## Debug / sim override. When > 0 we skip the normal-dist roll and use
## this value directly — the 20-day-tick sim needs determinism and short
## lifespans to witness a death during the test window.
var override_max_age_days: int = 0

# ---- Needs (0 = satisfied, 100 = critical) ----
var hunger: float = 0.0
var thirst: float = 0.0
var health: float = 100.0
var mood: float = 80.0

# ---- Behaviour state ----
var state: String = STATE_IDLE
var home_pos: Vector3 = Vector3.ZERO
## The habitat that owns this animal (chicken_coop, etc.). Set by
## `register_with_habitat()` on spawn. The habitat exposes a feeder
## fallback when forage fails; animals return here at night.
var habitat: Node3D = null

# ---- Species consumption + output rates (subclass tunes) ----
@export var daily_hunger_rate: float = 2.0
@export var daily_thirst_rate: float = 2.5
## Forage tile material strings this species can eat from. Matched
## against `WorldGrid.tile_material_at(pos)` during the feeding step.
## Phase 1: we just check tile-type equality; later agents will pull a
## real forage_quality number off the tile.
@export var forage_tiles: Array[String] = ["meadow", "forest_edge", "bare"]
## Max distance (metres) from home_pos we'll wander to forage.
@export var forage_range: float = 10.0

## What this animal produces per healthy day. Fractional values are
## tracked in _output_accum so a 0.8 eggs/day chicken drops one whole egg
## every ~1.25 days without losing precision.
var output_per_day: Dictionary = { "manure": 0.4 }

## Fractional output tracker — increments each day, flushes whole units
## to FarmTotals when it crosses 1.0.
var _output_accum: Dictionary = {}

## Species random seed. Used for mesh tint jitter + N-dist rolls so
## headless sims stay deterministic when the caller seeds the RNG.
var _rng: RandomNumberGenerator = RandomNumberGenerator.new()


# ---- Visible-state tracking (for feedback_visible_state_changes rule) ----
## Body mesh instances the subclass registered via `_register_body_parts`.
## The base class tints them together on mood / state / elder changes so
## each subclass doesn't re-implement the tint loop.
var _body_parts: Array[MeshInstance3D] = []
var _base_colors: Dictionary = {}  # MeshInstance3D instance_id -> Color
var _elder_applied: bool = false
## Current per-frame render tint (state × mood). Lerps toward target.
var _tint_current: Color = Color(1, 1, 1, 1)
var _tint_target: Color = Color(1, 1, 1, 1)


# =============================================================
# Lifecycle
# =============================================================

func _ready() -> void:
	_rng.randomize()
	# Roll the lifespan from the species normal distribution UNLESS a
	# caller forced an override (sims use this). Lifespan clamped to >= 30
	# so we don't spawn dying animals.
	if override_max_age_days > 0:
		max_age_days = override_max_age_days
	else:
		max_age_days = int(_rand_normal(species_lifespan_mean, species_lifespan_stddev))
	# Subclass hook fills species-specific data (display name, forage_tiles,
	# rates, output_per_day, mesh). Runs AFTER lifespan roll so subclasses
	# can adjust species_lifespan_mean before _ready if they prefer.
	_species_configure()
	_build_visuals()
	# Hook day-tick so aging + needs advance with the world clock. The
	# sim harness skips this (it calls `day_tick()` manually) because
	# the Scheduler singleton isn't free-running during tests.
	if Engine.has_singleton("Scheduler"):
		# Connect via the autoload node path in case Engine.has_singleton
		# returns false on older builds — Scheduler is always in the tree.
		pass
	var sched: Node = get_node_or_null("/root/Scheduler")
	if sched != null and sched.has_signal("day_advanced"):
		sched.day_advanced.connect(_on_day_advanced)
	if home_pos == Vector3.ZERO:
		home_pos = global_position
	# Initial visible-state pass so the first frame reads mood + tint.
	_refresh_tint_target()


## Subclass hook — set species_id / display / forage / rates / output /
## mesh build here. Base class calls once during _ready() after the
## lifespan roll.
func _species_configure() -> void:
	pass


## Subclass hook — build the primitive-mesh silhouette. Register each
## MeshInstance3D body part via `_register_body_part()` so mood + state
## tinting can touch it.
func _build_visuals() -> void:
	pass


## Box-Muller normal distribution. Used to roll lifespan so the same
## species produces a spread of ages. Clamped to a minimum of 30 days so
## the sim doesn't immediately kill freshly-spawned stock.
static func _rand_normal(mean: float, stddev: float) -> float:
	var u1: float = max(0.0001, randf())
	var u2: float = randf()
	var z: float = sqrt(-2.0 * log(u1)) * cos(TAU * u2)
	return max(30.0, mean + stddev * z)


func _register_body_part(mi: MeshInstance3D, base_color: Color) -> void:
	if mi == null:
		return
	_body_parts.append(mi)
	_base_colors[mi.get_instance_id()] = base_color


# =============================================================
# Day-tick (the heart of the lifecycle)
# =============================================================

func _on_day_advanced(_day: int, _season: String, _year: int) -> void:
	day_tick()


## Full day simulation — called by Scheduler OR the debug sim harness.
## Runs in a deterministic order so test asserts stay stable.
##
## 1. age_days++
## 2. needs (hunger, thirst) rise
## 3. try forage → feeder fallback → starvation
## 4. try drink (future: pond/trough) — phase 1 simulates always-sipped
## 5. health + mood updates
## 6. outputs if healthy + productive
## 7. elder tint if age > 0.8 × max_age_days
## 8. death trigger on age >= max OR health < 10
func day_tick() -> void:
	if state == STATE_DEAD:
		return
	age_days += 1
	hunger = min(100.0, hunger + daily_hunger_rate)
	thirst = min(100.0, thirst + daily_thirst_rate)

	# ---- Step 3. Feeding ----
	if hunger > 40.0:
		var ate: bool = _try_forage()
		if not ate:
			ate = _try_feeder()
		if ate:
			_enter_state(STATE_FORAGING)
		# If ate remains false, hunger keeps climbing → health drops below.

	# ---- Step 4. Drinking ----
	# Phase 1: the BC coastal homestead spec says chickens sip from a
	# coop water trough automatically — we simulate that by draining the
	# thirst whenever the habitat has any `feeder_contents.water` or the
	# coop is within range of a water tile. The simpler MVP path just
	# decays thirst by 80 % every day as if the trough is always topped.
	if thirst > 40.0:
		thirst = max(0.0, thirst - 20.0)
		_enter_state(STATE_DRINKING)

	# ---- Step 5. Health + mood ----
	if hunger > 70.0:
		health = max(0.0, health - 6.0)
	if thirst > 70.0:
		health = max(0.0, health - 10.0)
	if hunger < 30.0 and thirst < 30.0:
		# Recover slowly when fed + watered.
		health = min(100.0, health + 1.5)

	if health < 60.0:
		mood = max(0.0, mood - 3.0)
	elif _flockmate_count() < 1:
		mood = max(0.0, mood - 1.0)
	else:
		mood = min(100.0, mood + 1.0)

	# ---- Step 6. Outputs (only while healthy + adult + productive) ----
	if mood + health > 60.0 and age_days > 0 and not _is_elder():
		_emit_outputs(1.0)
	elif mood + health > 60.0 and _is_elder():
		_emit_outputs(0.5)  # elders produce half

	# ---- Step 7. Elder visuals ----
	if _is_elder() and not _elder_applied:
		_elder_applied = true
		_refresh_tint_target()

	# ---- Step 8. Death trigger ----
	if age_days >= max_age_days or health < 10.0:
		die()
		return

	# Refresh visible tint (mood can shift state inside this tick).
	_refresh_tint_target()


## Forage step. Samples the tile under home_pos + a short offset and
## checks against `forage_tiles`. Phase 1 simplification: we just assume
## "forage found" when the world grid reports a matching material and a
## tiny regenerating forage_quality field. The full forage_quality
## regeneration math is marked TODO until C10 (soil fertility
## visibility) lands — for phase 1 this is enough to exercise the AI
## branch, the feeder fallback, and the starvation path.
func _try_forage() -> bool:
	var wg: Node = get_node_or_null("/root/WorldGrid")
	if wg == null or not wg.has_method("tile_material_at"):
		# No grid in the sim harness → pretend every tile is "meadow" so
		# the base AI path still exercises under the test. The sim can
		# disable this by clearing `forage_tiles`.
		if forage_tiles.is_empty():
			return false
		hunger = max(0.0, hunger - 30.0)
		return true
	# Sample home tile + a couple of short offsets. First match wins.
	var probes: Array[Vector3] = [
		home_pos,
		home_pos + Vector3(forage_range * 0.3, 0, 0),
		home_pos + Vector3(-forage_range * 0.3, 0, 0),
		home_pos + Vector3(0, 0, forage_range * 0.3),
		home_pos + Vector3(0, 0, -forage_range * 0.3),
	]
	for p in probes:
		var mat: String = String(wg.call("tile_material_at", p))
		if forage_tiles.has(mat):
			hunger = max(0.0, hunger - 30.0)
			return true
	return false


## Feeder fallback. When foraging fails (winter / overgrazed / penned)
## we pull from the habitat's internal feeder dictionary. One "serving"
## costs 0.2 kg of plant_trim or seeds equivalent; the habitat tracks
## the contents via add_to_feeder(kind, amt) + consume_feeder(amt).
func _try_feeder() -> bool:
	if habitat == null:
		return false
	if not habitat.has_method("consume_feeder"):
		return false
	var consumed: float = float(habitat.call("consume_feeder", 0.2))
	if consumed > 0.0:
		hunger = max(0.0, hunger - 25.0)
		return true
	return false


## Emit whole-unit outputs to FarmTotals + mood_scale-scaled. Eggs batch
## via _output_accum so a 0.8/day hen drops an egg every ~1.25 days, not
## zero whole eggs every day.
func _emit_outputs(scale_mul: float) -> void:
	for k in output_per_day.keys():
		var kind: String = String(k)
		var per: float = float(output_per_day[k]) * scale_mul
		_output_accum[kind] = float(_output_accum.get(kind, 0.0)) + per
		var whole: int = int(floor(float(_output_accum[kind])))
		if whole <= 0:
			continue
		_output_accum[kind] = float(_output_accum[kind]) - float(whole)
		_deliver_output(kind, float(whole))


## Subclass hook + base default. Eggs + milk + fruit → fairy_food bucket
## via FarmTotals.add_food; manure → soil OM (TODO once soil engine
## agent lands a per-tile OM channel — for phase 1 we silently bump
## FarmTotals under a `manure` key so the resource is still accounted).
func _deliver_output(kind: String, amount: float) -> void:
	var ft: Node = get_node_or_null("/root/FarmTotals")
	if ft == null:
		return
	match kind:
		"eggs":
			# Eggs read as "fruit" in fairy-food terms (edible food) for
			# phase 1 — a later agent will give eggs their own slot once
			# the HUD animal-roster lands. Also fire a per-coop signal so
			# the coop can tween an egg into its nest mesh.
			if habitat != null and habitat.has_method("on_egg_laid"):
				habitat.call("on_egg_laid", amount)
			else:
				# Orphan egg: deposit straight to FarmTotals so the output
				# loop still closes during sim runs without a coop wired.
				if ft.has_method("add_food"):
					ft.call("add_food", "fruit", amount)
		"milk":
			if ft.has_method("add_food"):
				ft.call("add_food", "milk", amount)
		"manure":
			# Phase 1: manure silently bumps the tile under home_pos once
			# the soil engine exposes `bump_om(pos, kg)`. For now we log
			# it through GameLog so the integrator can grep manure events.
			if get_node_or_null("/root/GameLog") != null:
				GameLog.event("animal_manure", {
					"species": species_id,
					"amount": amount,
					"pos": [home_pos.x, home_pos.z],
				})
		_:
			# Other outputs funnel into the typed resource bucket (e.g.
			# wool from a future sheep → FarmTotals.FEATHERS-analog). If
			# the key doesn't exist on FarmTotals we silently skip.
			if ft.has_method("add_resource"):
				ft.call("add_resource", kind, amount)


## Spawn the Carcass + queue_free self. Paired with a warm-coral pop
## per the "death aesthetic" spec — matter-of-fact, no dirge.
func die() -> void:
	if state == STATE_DEAD:
		return
	_enter_state(STATE_DEAD)
	# Spawn a carcass passive node at our location. Load the scene (not
	# the raw script) because Carcass is StaticBody3D — `Node3D.new() +
	# set_script()` fails Godot's type-compat check for the StaticBody3D
	# base type. The scene supplies the correct root class.
	var carcass_packed: PackedScene = load("res://scenes/carcass.tscn")
	if carcass_packed == null:
		push_error("AnimalEntity.die: missing res://scenes/carcass.tscn")
		queue_free()
		return
	var carcass: Node3D = carcass_packed.instantiate() as Node3D
	carcass.name = "Carcass_" + species_id
	# Parent onto the same tree node as self so main.tscn's scene root
	# keeps a live reference even after we queue_free.
	var host: Node = get_parent()
	if host != null:
		host.add_child(carcass)
		carcass.global_position = global_position
	if carcass.has_method("setup"):
		carcass.call("setup", species_id, species_display_name, species_yields(), float(age_days) / 360.0)
	# Paired feedback — warm-coral pop + gentle thud. Names the animal if
	# a habitat has given it one.
	var years: float = float(age_days) / 360.0
	var nickname: String = "%s %.1f yr" % [species_display_name, years]
	if get_node_or_null("/root/Juice") != null:
		Juice.pop(global_position + Vector3(0, 2.2, 0), nickname, Palette.CORAL.lerp(Palette.HONEY, 0.2))
	if get_node_or_null("/root/AudioManager") != null:
		AudioManager.play("hover-tick", -6.0)
	emit_signal("died", self)
	# Hand off to habitat bookkeeping BEFORE queue_free so the coop can
	# drop us from its flock array.
	if habitat != null and habitat.has_method("on_animal_died"):
		habitat.call("on_animal_died", self)
	# Fire the first-carcass milestone → unlocks butcher.
	var prog: Node = get_node_or_null("/root/Progression")
	if prog != null and prog.has_method("mark_first_carcass"):
		prog.call("mark_first_carcass")
	queue_free()


## Species yield table — override per subclass.
## Chicken: 2 meat + 3 bones + 4 feathers (locked design spec).
func species_yields() -> Dictionary:
	return { "meat": 2, "bones": 3, "feathers": 4 }


# =============================================================
# Visible state + helpers
# =============================================================

func _enter_state(new_state: String) -> void:
	if state == new_state:
		return
	var old: String = state
	state = new_state
	emit_signal("state_changed", new_state, old)
	_refresh_tint_target()


func _is_elder() -> bool:
	return age_days >= int(float(max_age_days) * 0.8)


## Count flockmates (same-species siblings parented to the habitat). A
## chicken with no flockmates has a small mood malus.
func _flockmate_count() -> int:
	if habitat == null:
		return 0
	var flock: Variant = habitat.get("flock")
	if flock == null:
		return 0
	var n: int = 0
	for a in (flock as Array):
		if a != self and is_instance_valid(a):
			n += 1
	return n


## Base → state-scaled tint. Elder = warm-muted, sleeping = darker,
## foraging = slightly darker than idle, dead = heavy desaturate.
func _refresh_tint_target() -> void:
	var t: Color = Color(1, 1, 1, 1)
	if _is_elder():
		# Warm-muted: lerp base albedo toward WARM_STONE. Stays inside the
		# happy palette — "elder chicken" reads as wise straw-grey, never
		# cold grey.
		t = Color(0.88, 0.84, 0.78, 1.0)
	if state == STATE_FORAGING:
		t = t * Color(0.94, 0.94, 0.94, 1.0)
	elif state == STATE_SLEEPING:
		t = t * Color(0.70, 0.68, 0.65, 1.0)
	elif state == STATE_DEAD:
		t = t * Color(0.55, 0.50, 0.45, 1.0)
	if health < 50.0:
		# Sick chickens desaturate toward STRAW_DRY a touch.
		t = t.lerp(Color(0.88, 0.82, 0.65, 1.0), 0.45)
	_tint_target = t
	_apply_tint()


func _apply_tint() -> void:
	for mi in _body_parts:
		if mi == null or not is_instance_valid(mi):
			continue
		var mat: Material = mi.material_override
		if mat == null:
			continue
		var base: Color = _base_colors.get(mi.get_instance_id(), Color.WHITE)
		var final: Color = Color(
			base.r * _tint_target.r,
			base.g * _tint_target.g,
			base.b * _tint_target.b,
			base.a,
		)
		if mat is StandardMaterial3D:
			(mat as StandardMaterial3D).albedo_color = final


## Per-frame micro-animation: hover breathing, sleeping scale, dead tip.
func _process(delta: float) -> void:
	match state:
		STATE_SLEEPING:
			scale = scale.lerp(Vector3(1, 0.8, 1), 0.1)
		STATE_DEAD:
			scale = scale.lerp(Vector3(1, 0.1, 1), 0.1)
		_:
			scale = scale.lerp(Vector3.ONE, 0.1)


# =============================================================
# Habitat plumbing
# =============================================================

## Called by the habitat (ChickenCoop) on spawn — links the animal to
## its owner so flock + feeder + egg collection can flow both ways.
func register_with_habitat(h: Node3D) -> void:
	habitat = h
	if h != null:
		home_pos = h.global_position
