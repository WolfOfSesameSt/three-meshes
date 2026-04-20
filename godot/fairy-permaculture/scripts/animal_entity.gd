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
## Escape event — the containment roll failed. `challenge-designer`
## listens to fire a banner; the right-click "Round up" task targets
## this animal via habitat's `escaped_animals` array.
signal escaped(entity: AnimalEntity)
## Bond milestone — fires at 3 (animal walks toward approaching fairies)
## and 5 (procgen name stamped). UX/ux-engineer listens to paint the
## bond meter in the animal inspector.
signal bond_changed(entity: AnimalEntity, new_level: int)
## Thriving tier transition — THRIVING / content / stressed / suffering.
## Visible mesh shift happens in `_apply_tint`; this signal carries the
## enum + old-tier name so event listeners can log transitions.
signal thriving_tier_changed(entity: AnimalEntity, tier: String, old_tier: String)
## Animal was clicked (pet). Forwarded to UX for the on-world hover
## and to Juice for the heart-pop.
signal clicked(entity: AnimalEntity)


# ---- Lifecycle states ----
const STATE_IDLE: String      = "idle"
const STATE_FORAGING: String  = "foraging"
const STATE_EATING: String    = "eating"
const STATE_DRINKING: String  = "drinking"
const STATE_RESTING: String   = "resting"
const STATE_RETURNING: String = "returning"
const STATE_SLEEPING: String  = "sleeping"
const STATE_HUNGRY: String    = "hungry"
const STATE_STARVING: String  = "starving"
const STATE_PANIC: String     = "panic"
const STATE_BONDED: String    = "bonded"
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

# ---- Phase-3 Animal AI: locomotion / thriving / bond / containment ----
##
## NOTE — these fields are all ADDITIVE. The existing day-tick sim and
## subclass overrides (barn_cat.day_tick, lgd_dog.day_tick) keep working
## as before; the new behavior only kicks in on _process(delta) and on
## the new post-day thriving+environment step at the end of day_tick.
##
## Per-species walking speed, assigned by subclass in _species_configure.
@export var move_speed: float = 0.8  # m/s, chicken default
## Current per-frame steering target in world space. Re-picked on arrival.
var _move_target: Vector3 = Vector3.ZERO
var _move_target_set: bool = false
## IDLE jitter timer — a small Y-rotation tick every 2-4 s so even
## standing animals look alive. Mirrors the fairy idle wobble.
var _idle_jitter_t: float = 0.0
var _idle_jitter_interval: float = 3.0
## EATING timer — when the animal arrives at a forage target, it
## stands in EATING for `_eating_time_left` seconds before re-picking.
var _eating_time_left: float = 0.0
## Panic — set by predator/event handlers (challenge-designer). Fleeing
## source position; locomotion moves away at 1.8× move_speed until cleared.
var _threat_pos: Vector3 = Vector3.INF
var _panic_time_left: float = 0.0

## Bond level 0..5. 1/day cap on increment (enforced via _bond_tick_day).
## Bond 3 → animal walks toward approaching fairies (future tie-in).
## Bond 5 → procgen nickname stamped + paired "Bonded with Henrietta" feedback.
var bond_level: int = 0
var _last_bond_day: int = -1
## Procgen nickname. Blank until bond 5 or name forced on spawn.
var nickname: String = ""

## Thriving score 0..100, computed daily after day_tick. Public so UI
## can read it. Tier names: "thriving" / "content" / "stressed" /
## "suffering" (gated at 80 / 40 / 20 thresholds). Golden-sparkle emit
## on THRIVING runs every 30 s via _thriving_emit_t.
var thriving_score: int = 50
var thriving_tier: String = "content"
var _thriving_emit_t: float = 0.0

## Environmental influence day-trace. Last-day summary written per tick
## so the soil-inspector panel can read a plain-English entry for the
## tile under this animal. Also emitted to GameLog so replays stay
## debuggable.
var last_env_note: String = ""
var _starve_day_count: int = 0        # consecutive days hunger==100
var _last_output_mul: float = 1.0     # thriving-scaled output multiplier for today

# ---- Containment (exposed on habitat scripts as containment_radius/strength) ----
## Clamp radius pulled off the habitat on spawn. 0 = no clamp (free-ranging
## species like cat/dog). Updated by `register_with_habitat`.
var containment_radius: float = 0.0
## Strength 0..1 — 1.0 = hard clamp, <1.0 rolls an escape chance per day.
## Species fence_strength_bias from data/animals.json shifts this.
var containment_strength: float = 1.0
## Set true once the animal escapes its habitat — locomotion then ignores
## the clamp until a fairy's "Round up" task resets it. The habitat keeps
## a live weak ref so the round-up action can target us.
var escaped_flag: bool = false

## Cached click StaticBody3D. Lazy-added by `_ensure_click_area()` on
## first day_tick so the base class doesn't pay for it in headless sims
## that never fire the per-frame _process().
var _click_body: StaticBody3D = null


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
	# Thriving multiplier applied on top of the elder halving — a thriving
	# hen lays ~1.3× more (AGENT.md §Thriving loop); stressed ~0.7×;
	# suffering ~0.3×. Multiplier comes from the PREVIOUS day's tier so the
	# player feels the swing immediately when care is restored. _last_output_mul
	# is updated at end of day in _compute_thriving_score().
	var base_mul: float = 1.0 if not _is_elder() else 0.5
	if mood + health > 60.0 and age_days > 0:
		_emit_outputs(base_mul * _last_output_mul)

	# ---- Step 7. Elder visuals ----
	if _is_elder() and not _elder_applied:
		_elder_applied = true
		_refresh_tint_target()

	# ---- Step 7.5. Hunger → HUNGRY → STARVING → death spiral.
	# Gate: if hunger is at 100 for 3 consecutive days, animal enters
	# STARVING. Recovery: fed within 2 days of STARVING reverts to
	# HUNGRY. See AGENT.md — no one-missed-refill death cliffs. Setting
	# state HUNGRY/STARVING overrides FORAGING/EATING unless already dead.
	if hunger >= 100.0:
		_starve_day_count += 1
	elif hunger < 85.0:
		_starve_day_count = 0
	if state != STATE_DEAD:
		if _starve_day_count >= 3:
			_enter_state(STATE_STARVING)
		elif hunger > 85.0:
			_enter_state(STATE_HUNGRY)

	# ---- Step 7.6. Thriving score + tier (post-needs, pre-death). ----
	_compute_thriving_score()

	# ---- Step 7.7. Environmental influence on the tile under us. ----
	_apply_env_influence()

	# ---- Step 7.8. Containment roll. Fence_strength < 1.0 rolls a daily
	# escape chance proportional to (1 - strength). Cats/dogs with zero
	# containment are exempt. Once escaped, the animal wanders freely
	# until re-penned by a fairy "Round up" task.
	if not escaped_flag and containment_radius > 0.1 and containment_strength < 1.0:
		var esc_prob: float = clamp(1.0 - containment_strength, 0.0, 1.0) * 0.08
		if _rng.randf() < esc_prob:
			_trigger_escape()

	# ---- Step 7.9. Bond day reset — enables a fresh +1 pet tomorrow. ----
	var day_now: int = _current_day()
	if _last_bond_day > day_now:  # sanity wrap (save/load)
		_last_bond_day = -1

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
	var label: String
	if nickname != "":
		label = "%s (%.1f yr)" % [nickname, years]
	else:
		label = "%s %.1f yr" % [species_display_name, years]
	if get_node_or_null("/root/Juice") != null:
		Juice.pop(global_position + Vector3(0, 2.2, 0), label, Palette.CORAL.lerp(Palette.HONEY, 0.2))
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
	if state == STATE_FORAGING or state == STATE_EATING:
		t = t * Color(0.94, 0.94, 0.94, 1.0)
	elif state == STATE_SLEEPING or state == STATE_RESTING:
		t = t * Color(0.70, 0.68, 0.65, 1.0)
	elif state == STATE_HUNGRY:
		# Hungry: -15 % albedo (AGENT.md §Hunger → death).
		t = t * Color(0.85, 0.85, 0.85, 1.0)
	elif state == STATE_STARVING:
		# Starving: warm-brown drain, scale drop also fires in _process.
		t = t * Color(0.70, 0.66, 0.60, 1.0)
	elif state == STATE_PANIC:
		# Panic: fast-twitch hotter tint.
		t = t.lerp(Color(1.05, 0.92, 0.85, 1.0), 0.4)
	elif state == STATE_DEAD:
		t = t * Color(0.55, 0.50, 0.45, 1.0)
	# Thriving-tier overlay — softer than state tint. Adds a gentle glow
	# to THRIVING animals, pushes STRESSED toward STRAW_DRY.
	match thriving_tier:
		"thriving":
			t = t.lerp(Color(1.05, 1.02, 0.95, 1.0), 0.18)
		"stressed":
			t = t.lerp(Color(0.92, 0.88, 0.80, 1.0), 0.28)
		"suffering":
			t = t.lerp(Color(0.82, 0.78, 0.70, 1.0), 0.45)
		_:
			pass
	if health < 50.0:
		# Sick animals desaturate toward STRAW_DRY a touch.
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
## Also dispatches locomotion by state — see AGENT.md §Domain. Movement
## never stops in IDLE (idle jitter always active). EATING freezes for
## a few seconds. PANIC flees from `_threat_pos` at 1.8× speed. RETURNING
## / SLEEPING lerp to home. FORAGING / BONDED steer to `_move_target`.
func _process(delta: float) -> void:
	match state:
		STATE_SLEEPING:
			scale = scale.lerp(Vector3(1, 0.8, 1), 0.1)
		STATE_DEAD:
			scale = scale.lerp(Vector3(1, 0.1, 1), 0.1)
			return  # Dead animals don't walk.
		_:
			scale = scale.lerp(Vector3.ONE, 0.1)
	# Ensure click area exists once we're in the tree — lazily so headless
	# sims don't pay for a StaticBody3D they never click.
	if _click_body == null and is_inside_tree():
		_ensure_click_area()
	# Locomotion dispatch — additive to the existing scale bob. Movement
	# speed comes from the species export; state picks the target.
	_locomotion_tick(delta)
	# Golden-sparkle emit on THRIVING animals every 30 s. Subtle —
	# matches the "quiet continuous reward" feeling from AGENT.md.
	if thriving_tier == "thriving":
		_thriving_emit_t += delta
		if _thriving_emit_t >= 30.0:
			_thriving_emit_t = 0.0
			_emit_thriving_sparkle()


# =============================================================
# Habitat plumbing
# =============================================================

## Called by the habitat (ChickenCoop) on spawn — links the animal to
## its owner so flock + feeder + egg collection can flow both ways.
func register_with_habitat(h: Node3D) -> void:
	habitat = h
	if h != null:
		home_pos = h.global_position
		# Pull containment parameters off the habitat if it exposes them.
		# Habitats that predate the containment system (owl_box, brush_pile)
		# don't need them — they don't contain animals. Defensive reads.
		var cr: Variant = h.get("containment_radius")
		if cr != null:
			containment_radius = float(cr)
		var cs: Variant = h.get("containment_strength")
		if cs != null:
			containment_strength = clamp(float(cs), 0.0, 1.0)


# =============================================================
# PHASE 3 — Locomotion dispatcher (per-frame).
# =============================================================

## Per-frame movement by state. Called from `_process(delta)`. Pure
## pos/rot updates — no resource or needs mutation happens here; the
## day_tick() still owns all economic side-effects.
func _locomotion_tick(delta: float) -> void:
	if state == STATE_DEAD:
		return
	var ground_y: float = global_position.y
	if get_node_or_null("/root/WorldGrid") != null:
		ground_y = WorldGrid.sample_height(global_position)
	# IDLE jitter — tiny Y-rotation tick every 2-4 s + bob. Keeps even
	# static animals visually alive.
	_idle_jitter_t += delta
	if _idle_jitter_t >= _idle_jitter_interval:
		_idle_jitter_t = 0.0
		_idle_jitter_interval = 2.0 + _rng.randf() * 2.0
		rotation.y += (_rng.randf() - 0.5) * 0.8
	match state:
		STATE_FORAGING, STATE_BONDED:
			_steer_toward(_move_target, move_speed * delta)
			_check_arrival_to_target()
		STATE_EATING:
			_eating_time_left -= delta
			if _eating_time_left <= 0.0:
				_eating_time_left = 0.0
				_enter_state(STATE_IDLE)
		STATE_RETURNING, STATE_SLEEPING:
			_steer_toward(home_pos, move_speed * delta * 1.1)
		STATE_PANIC:
			if _threat_pos != Vector3.INF:
				var away: Vector3 = (global_position - _threat_pos)
				away.y = 0.0
				if away.length() > 0.01:
					away = away.normalized()
				var tgt: Vector3 = global_position + away * 2.0
				_steer_toward(tgt, move_speed * 1.8 * delta)
			_panic_time_left -= delta
			if _panic_time_left <= 0.0:
				_threat_pos = Vector3.INF
				_enter_state(STATE_IDLE)
		STATE_IDLE, STATE_HUNGRY:
			# Soft wander: 40% chance per second to pick a short new
			# target within 2 m of home. HUNGRY animals move at 0.7× speed.
			if not _move_target_set or global_position.distance_to(_move_target) < 0.4:
				_pick_idle_target()
			var speed_mul: float = 0.7 if state == STATE_HUNGRY else 0.6
			_steer_toward(_move_target, move_speed * speed_mul * delta)
		STATE_STARVING:
			# Starving: barely moves, tiny drift toward home.
			_steer_toward(home_pos, move_speed * 0.3 * delta)
		_:
			pass
	# Clamp to terrain.
	global_position.y = ground_y
	# Clamp to containment circle unless escaped.
	if not escaped_flag and containment_radius > 0.1 and home_pos != Vector3.ZERO:
		var diff: Vector3 = global_position - home_pos
		diff.y = 0.0
		if diff.length() > containment_radius:
			diff = diff.normalized() * containment_radius
			global_position = Vector3(home_pos.x + diff.x, ground_y, home_pos.z + diff.z)


## Steer (position-lerp style — we're a Node3D without physics). Also
## aims the Y rotation toward the heading so the silhouette faces its
## target; subclass meshes are built facing +Z.
func _steer_toward(target: Vector3, step_m: float) -> void:
	var to: Vector3 = target - global_position
	to.y = 0.0
	var dist: float = to.length()
	if dist < 0.001:
		return
	var dir: Vector3 = to / dist
	var move_m: float = min(dist, step_m)
	global_position += dir * move_m
	# Smooth Y-rotation: atan2 gives heading; lerp so the turn is gentle.
	var want_yaw: float = atan2(dir.x, dir.z)
	rotation.y = lerp_angle(rotation.y, want_yaw, 0.12)


## Pick a random idle wander target within ~2 m of home_pos, respecting
## containment if any. Used in STATE_IDLE so animals don't freeze.
func _pick_idle_target() -> void:
	var r: float = 0.8 + _rng.randf() * 1.6
	if containment_radius > 0.1:
		r = min(r, containment_radius * 0.85)
	var a: float = _rng.randf() * TAU
	_move_target = home_pos + Vector3(cos(a) * r, 0, sin(a) * r)
	_move_target_set = true


## Check if we reached our forage target; if yes, enter EATING for 3 s.
func _check_arrival_to_target() -> void:
	if not _move_target_set:
		return
	if global_position.distance_to(_move_target) < 0.35:
		_move_target_set = false
		_eating_time_left = 3.0
		_enter_state(STATE_EATING)


## External trigger — a predator event fires this. Challenge-designer
## owns the predator framework; we expose the public setter so PANIC
## can be entered from outside without reaching into private fields.
func panic_from(threat_pos: Vector3, duration_s: float = 5.0) -> void:
	if state == STATE_DEAD:
		return
	_threat_pos = threat_pos
	_panic_time_left = duration_s
	_enter_state(STATE_PANIC)


# =============================================================
# PHASE 3 — Thriving score + tier transition.
# =============================================================

## Daily thriving compute. See AGENT.md §Thriving loop. Score breakdown:
##   hunger   (0-25)  : 25 - floor(hunger * 0.25)
##   thirst   (0-25)  : 25 - floor(thirst * 0.25)
##   habitat  (0-20)  : preferred-tile match + shade proximity + space
##   social   (0-15)  : flockmate count within species_social_min..max
##   bond     (0-15)  : 3 × bond_level
## Tiers: 80+ THRIVING, 40-79 content, 20-39 stressed, <20 suffering.
func _compute_thriving_score() -> void:
	var hunger_pts: int = int(max(0.0, 25.0 - hunger * 0.25))
	var thirst_pts: int = int(max(0.0, 25.0 - thirst * 0.25))
	var habitat_pts: int = _score_habitat()
	var social_pts: int = _score_social()
	var bond_pts: int = clamp(3 * bond_level, 0, 15)
	var total: int = clamp(hunger_pts + thirst_pts + habitat_pts + social_pts + bond_pts, 0, 100)
	thriving_score = total
	var new_tier: String
	var mul: float
	if total >= 80:
		new_tier = "thriving"; mul = 1.3
	elif total >= 40:
		new_tier = "content"; mul = 1.0
	elif total >= 20:
		new_tier = "stressed"; mul = 0.7
	else:
		new_tier = "suffering"; mul = 0.3
	_last_output_mul = mul
	if new_tier != thriving_tier:
		var old: String = thriving_tier
		thriving_tier = new_tier
		emit_signal("thriving_tier_changed", self, new_tier, old)
		_fire_tier_feedback(new_tier, old)
		_refresh_tint_target()


## Habitat-quality score (0-20). Preferred-tile-under-foot = 10 pts,
## shade-tree proximity = 5 pts, space-per-animal (flock count under cap)
## = 5 pts. Headless sim tolerates missing WorldGrid — defaults to 6 pts.
func _score_habitat() -> int:
	var pts: int = 6
	var wg: Node = get_node_or_null("/root/WorldGrid")
	if wg != null and wg.has_method("tile_material_at"):
		var mat: String = String(wg.call("tile_material_at", global_position))
		if forage_tiles.has(mat):
			pts = max(pts, 10)
	# Flock-count bonus: if habitat has room for us, +5. FLOCK_CAP /
	# HERD_CAP are `const` on the habitat script — Node.get() returns
	# null for constants so we reach into the script constant map.
	if habitat != null:
		var cap: int = _habitat_cap(habitat)
		var count: int = _flockmate_count()
		if cap > 0 and count + 1 < cap:
			pts += 5
	return clamp(pts, 0, 20)


## Pull FLOCK_CAP or HERD_CAP off a habitat's script. Returns 0 if
## neither is declared (defensive — used for the thriving bonus).
func _habitat_cap(h: Node) -> int:
	var scr: Script = h.get_script() as Script
	if scr == null:
		return 0
	var consts: Dictionary = scr.get_script_constant_map()
	if consts.has("FLOCK_CAP"):
		return int(consts["FLOCK_CAP"])
	if consts.has("HERD_CAP"):
		return int(consts["HERD_CAP"])
	return 0


## Social score (0-15). Counts same-species flockmates. 1-3 flockmates = 15.
## 0 flockmates = 3 (baseline "at least not alone in the world"). For
## solitary species (cat/dog) we return the midpoint.
func _score_social() -> int:
	if species_id == "barn_cat" or species_id == "lgd_dog":
		return 10
	var count: int = _flockmate_count()
	if count <= 0:
		return 3
	if count >= 5:
		return 15
	return 6 + count * 2


## Paired feedback on tier crossing. Scale the SFX + Juice pop by the
## magnitude of the transition — suffering→thriving is a marquee event;
## content→stressed is a quiet warning.
func _fire_tier_feedback(new_tier: String, _old_tier: String) -> void:
	if get_node_or_null("/root/Juice") == null:
		return
	match new_tier:
		"thriving":
			Juice.pop(global_position + Vector3(0, 1.8, 0),
				"%s is thriving" % _display(), Palette.HONEY)
			Juice.burst(global_position + Vector3(0, 1.0, 0),
				Palette.HONEY.lerp(Palette.SAGE, 0.35), 12)
			if get_node_or_null("/root/AudioManager") != null:
				AudioManager.play("forage-chime", -6.0)
		"suffering":
			Juice.pop(global_position + Vector3(0, 1.8, 0),
				"%s is suffering" % _display(),
				Palette.CORAL.lerp(Palette.COMPOST, 0.3))
			if get_node_or_null("/root/AudioManager") != null:
				AudioManager.play("hover-tick", -8.0)
		"stressed":
			Juice.pop(global_position + Vector3(0, 1.6, 0),
				"%s is stressed" % _display(),
				Palette.CORAL.lerp(Palette.STRAW_DRY, 0.25))
		_:
			pass


## Golden-sparkle emit for THRIVING animals — fires every 30 s from
## _process. Scales with bond so a bonded-5 hen sparkles a little bigger.
func _emit_thriving_sparkle() -> void:
	if get_node_or_null("/root/Juice") == null:
		return
	var count: int = 6 + clamp(bond_level, 0, 5)
	Juice.burst(global_position + Vector3(0, 0.8, 0),
		Palette.HONEY.lerp(Palette.MOON, 0.5), count)


# =============================================================
# PHASE 3 — Environmental influence (soil / vegetation / wildlife).
# =============================================================

## Apply the per-species environmental effect on the tile under us.
## Subclasses override `_species_env_influence()` to do the real work
## (chicken scratch +0.01 OM, pig rootle +0.05, cow grazing, etc).
## Base class calls subclass + appends to GameLog and last_env_note.
func _apply_env_influence() -> void:
	if state == STATE_DEAD:
		return
	var note: String = _species_env_influence()
	if note != "":
		last_env_note = note
		if get_node_or_null("/root/GameLog") != null:
			GameLog.event("animal_env_influence", {
				"species": species_id,
				"note": note,
				"pos": [global_position.x, global_position.z],
			})


## Subclass hook. Returns a short plain-English note the soil-inspector
## panel reads ("Chicken-scratched (+0.01 OM today)"). Blank = no effect.
## The base default is a tiny OM bump so every animal leaves SOME trace
## (AGENT.md §2: shipping an animal that walks over soil and leaves no
## trace is a bug).
func _species_env_influence() -> String:
	var wg: Node = get_node_or_null("/root/WorldGrid")
	if wg == null or not wg.has_method("add_tile_om"):
		return ""
	wg.call("add_tile_om", global_position, 0.005)
	return "%s deposited trace OM (+0.005)" % species_display_name


# =============================================================
# PHASE 3 — Click interaction (bond + paired feedback).
# =============================================================

## Lazily build the ClickArea. Called from `_process` once the animal
## is in the tree. The body is a StaticBody3D child with a 0.6 m capsule
## so every species reads as pickable under the overseer cursor.
func _ensure_click_area() -> void:
	if _click_body != null:
		return
	_click_body = StaticBody3D.new()
	_click_body.name = "ClickArea"
	_click_body.input_ray_pickable = true
	var shape: CollisionShape3D = CollisionShape3D.new()
	var cap: CapsuleShape3D = CapsuleShape3D.new()
	cap.radius = 0.45
	cap.height = 1.1
	shape.shape = cap
	shape.position = Vector3(0, 0.55, 0)
	_click_body.add_child(shape)
	add_child(_click_body)
	_click_body.input_event.connect(_on_click_input)


## Route Godot's raw click into `_on_clicked`. Any left-click on the
## capsule counts as a pet.
func _on_click_input(_cam: Node, event: InputEvent, _hit: Vector3, _normal: Vector3, _shape_idx: int) -> void:
	if not (event is InputEventMouseButton):
		return
	var mb: InputEventMouseButton = event
	if mb.button_index != MOUSE_BUTTON_LEFT or not mb.pressed:
		return
	_on_clicked()


## Default click behavior — "pet" + heart pop + bond++ (1/day cap).
## Subclasses override to add species flavor (duck-quack + water ripple,
## pig-snort + scratch, cat purr aura, etc). Always call super._on_clicked()
## so the bond/pop/SFX baseline still fires.
func _on_clicked() -> void:
	if state == STATE_DEAD:
		return
	emit_signal("clicked", self)
	# Bond increment — capped at 5, 1/day. _current_day() reads the scheduler
	# so cross-day the cap resets automatically.
	var day_now: int = _current_day()
	if day_now != _last_bond_day and bond_level < 5:
		bond_level += 1
		_last_bond_day = day_now
		emit_signal("bond_changed", self, bond_level)
		if bond_level == 5 and nickname == "":
			nickname = _roll_nickname()
			_fire_bond_milestone_feedback()
	# Paired feedback: heart pop + sound.
	if get_node_or_null("/root/Juice") != null:
		Juice.pop(global_position + Vector3(0, 1.6, 0), "♥", Palette.CORAL)
		Juice.burst(global_position + Vector3(0, 1.2, 0),
			Palette.CORAL.lerp(Palette.HONEY, 0.4), 6)
	if get_node_or_null("/root/AudioManager") != null:
		AudioManager.play(_click_sfx(), -6.0)


## Subclass hook for species-flavored click SFX. Default is a gentle
## hover-tick so nothing is silent.
func _click_sfx() -> String:
	return "hover-tick"


## Bond-5 marquee feedback. Big pop + chime + stamped nickname.
func _fire_bond_milestone_feedback() -> void:
	if get_node_or_null("/root/Juice") != null:
		Juice.pop(global_position + Vector3(0, 2.3, 0),
			"Bonded with %s" % nickname, Palette.HONEY)
		Juice.burst(global_position + Vector3(0, 1.4, 0),
			Palette.HONEY.lerp(Palette.CORAL, 0.25), 22)
	if get_node_or_null("/root/AudioManager") != null:
		AudioManager.play("compost-finish", -3.0)


## Roll a species-appropriate cutesy nickname from a small pool.
func _roll_nickname() -> String:
	var pool: Array[String]
	match species_id:
		"chicken":
			pool = ["Henrietta", "Clover", "Biscuit", "Nora", "Pippa", "Marigold"]
		"duck":
			pool = ["Puddle", "Mallowen", "Quackers", "Willa", "Juniper"]
		"goat":
			pool = ["Nibbles", "Thistle", "Rosemary", "Bramble", "Gwen"]
		"cow":
			pool = ["Buttercup", "Daisy", "Opal", "Heather", "Juniper"]
		"pig":
			pool = ["Hamlet", "Truffle", "Porcelina", "Snuggy", "Persimmon"]
		"barn_cat":
			pool = ["Mittens", "Saffron", "Pumpernickel", "Clover", "Shadow"]
		"lgd_dog":
			pool = ["Barley", "Atlas", "Captain", "Juno", "Sable"]
		_:
			pool = ["Friend", "Buddy"]
	return pool[_rng.randi() % pool.size()]


# =============================================================
# PHASE 3 — Containment (escape roll + re-pen).
# =============================================================

## Fire an escape event. The habitat's `escaped_animals` array is
## appended so fairies know this animal needs rounding up. Paired
## banner + SFX live in the challenge-designer listener.
func _trigger_escape() -> void:
	escaped_flag = true
	if habitat != null:
		var ea: Variant = habitat.get("escaped_animals")
		if ea is Array:
			(ea as Array).append(self)
	emit_signal("escaped", self)
	# Paired nudge — small banner + thud. Not a marquee; we don't want
	# escapes to feel punishing, just noticeable.
	if get_node_or_null("/root/Juice") != null:
		Juice.pop(global_position + Vector3(0, 2.0, 0),
			"%s escaped!" % _display(),
			Palette.CORAL.lerp(Palette.STRAW_DRY, 0.25))
	if get_node_or_null("/root/AudioManager") != null:
		AudioManager.play("hover-tick", -4.0)
	if get_node_or_null("/root/GameLog") != null:
		GameLog.event("animal_escaped", {
			"species": species_id,
			"pos": [global_position.x, global_position.z],
		})


## Public API — called by fairies finishing a "Round up" task. Restores
## the clamp and teleports the animal home. Idempotent.
func round_up() -> void:
	escaped_flag = false
	global_position = home_pos
	_move_target_set = false
	_enter_state(STATE_IDLE)


# =============================================================
# PHASE 3 — Small helpers.
# =============================================================

func _current_day() -> int:
	var sched: Node = get_node_or_null("/root/Scheduler")
	if sched == null:
		return age_days
	var d: Variant = sched.get("day")
	if d == null:
		return age_days
	return int(d)


func _display() -> String:
	if nickname != "":
		return nickname
	return species_display_name


## Capture/restore helpers for SaveSystem. Kept public + small so the
## SaveSystem additive hooks can round-trip the new fields without
## reaching into private state. Fields not listed are either already
## covered by the pre-existing capture (age/hunger/thirst) or are
## per-frame transients (move_target, idle_jitter_t).
func serialize_phase3() -> Dictionary:
	return {
		"bond_level": bond_level,
		"nickname": nickname,
		"last_bond_day": _last_bond_day,
		"thriving_score": thriving_score,
		"thriving_tier": thriving_tier,
		"starve_day_count": _starve_day_count,
		"escaped_flag": escaped_flag,
		"containment_radius": containment_radius,
		"containment_strength": containment_strength,
	}


func hydrate_phase3(d: Dictionary) -> void:
	bond_level           = int(d.get("bond_level", 0))
	nickname             = String(d.get("nickname", ""))
	_last_bond_day       = int(d.get("last_bond_day", -1))
	thriving_score       = int(d.get("thriving_score", 50))
	thriving_tier        = String(d.get("thriving_tier", "content"))
	_starve_day_count    = int(d.get("starve_day_count", 0))
	escaped_flag         = bool(d.get("escaped_flag", false))
	containment_radius   = float(d.get("containment_radius", containment_radius))
	containment_strength = clamp(float(d.get("containment_strength", containment_strength)), 0.0, 1.0)
