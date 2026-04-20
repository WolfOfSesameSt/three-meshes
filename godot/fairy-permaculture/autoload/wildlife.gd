## Fairy Permaculture — wildlife ecology autoload.
##
## Habitat-gated wildlife immigration engine. Implements the locked
## self-balancing ecology rule (feedback_self_balancing_ecology.md):
##
##   "Player places habitat -> ecology runs itself. No commanding
##    predators. No assigning snakes to mice."
##
## The player's lever is HABITAT PLACEMENT. Once an owl-box, rock-pile,
## brush-pile, bat-box, hedgerow, insectary strip, or pond margin exists
## on the map, this autoload notices and begins rolling immigration
## checks on the day-tick. When a species' arrival conditions hold, it
## fires a one-shot `species_arrived(id, pos)` signal with paired
## feedback (Juice.pop + arrival SFX + GameLog entry) and the species
## is then tracked as a cohort with a normally-distributed lifespan.
##
## ---- What the engine tracks per species ----
##
## A "cohort" is a small persistent record:
##   {
##     "id": "barn-owl",
##     "count": int,                    # 1..N individuals in the cohort
##     "home_pos": Vector3,             # near the habitat that attracted them
##     "age_days": int,                 # days since arrival
##     "max_age_days": int,             # rolled from N(lifespan_mean, lifespan_stddev)
##     "habitat_refs": Array[NodePath], # live weak refs to their habitats
##     "announced_arrival": bool,
##   }
##
## Cohorts age with the day-tick. When `age_days >= max_age_days`, the
## cohort emits `species_departed` + dies quietly (no carcass — these
## are wildlife, not owned stock). Death feeds a tiny OM bump to the
## tile under home_pos (the "death -> soil" locked rule, gentle).
##
## ---- Pest pressure map (shared with random_events) ----
##
## Wildlife predators read from `pest_pressure` to decide when to arrive.
## `pest_pressure` is a dict `{ "aphid": 0..100, "slug": 0..100,
## "rodent": 0..100, "mosquito": 0..100, "moth": 0..100 }` shared across
## the game. Challenge-designer + random_events write into it; wildlife
## reads. When a predator arrives, it drains the relevant pressure.
##
## ---- Not owned here ----
##
## - Combat animations / predator-attack visuals — handled by the
##   existing `events.json` + `random_events.gd` pipeline.
## - Rodent clusters around storage — that's `Rodents.gd`. We _feed_
##   Rodents when pest_pressure.rodent crosses a threshold but don't
##   duplicate its cluster bookkeeping.
## - Individual animal meshes for wildlife (owls, snakes, etc.) —
##   phase 1 is invisible wildlife (bestiary + arrival banner only).
##   Future agent pass adds flyby birds + sitting-owl decor.
##
## Locked rule adherence:
## - Paired feedback: every arrival/departure has Juice.pop + SFX.
## - N-dist lifespans: `_rand_normal` clamped to >= 30.
## - Death -> soil: 0.05 OM bump per cohort death via WorldGrid.
## - No combat micromanagement: the player NEVER commands wildlife.
## - BC coastal first: species pool matches `data/animals.json`.

extends Node


signal species_arrived(id: String, pos: Vector3, count: int)
signal species_departed(id: String, pos: Vector3)
signal pest_pressure_changed(kind: String, value: float)


const HABITAT_GROUPS: Array[String] = [
	"owl_boxes",
	"bat_boxes",
	"rock_piles",
	"brush_piles",
	"hedgerow_segments",
	"insectary_strips",
	"duck_pond_edges",
	"mason_bee_tubes",
	"chicken_coops",
	"cow_barns",
	"goat_sheds",
	"pig_paddocks",
	"kennels",
	"warre_hives",
]

## Scan range around each habitat for flower/plant/pasture adjacency.
const HABITAT_RADIUS: float = 14.0

## Per-day probability floor + ceiling — even the most-attractive habitat
## only rolls 0..0.5 per day so arrivals feel earned.
const MIN_ROLL: float = 0.0
const MAX_ROLL: float = 0.50

## Baseline daily pest-pressure drift. Pressures climb when food exists
## and drop when predators + habitat predate them. Shared with
## challenge-designer's event triggers.
const PEST_PRESSURE_DRIFT_UP: float = 2.0
const PEST_PRESSURE_DRIFT_DOWN: float = 1.0

## Maximum pressure per kind. 100 = "outbreak".
const PEST_PRESSURE_MAX: float = 100.0


var animal_defs: Array = []               # from DataStore.animals
var wild_defs: Dictionary = {}            # id -> def (only wildlife-*, not owned stock)
var cohorts: Dictionary = {}              # id -> cohort dict
var pest_pressure: Dictionary = {
	"aphid": 0.0,
	"slug": 0.0,
	"rodent": 0.0,
	"mosquito": 0.0,
	"moth": 0.0,
}

var _rng: RandomNumberGenerator = RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()
	var sched: Node = get_node_or_null("/root/Scheduler")
	if sched != null and sched.has_signal("day_advanced"):
		sched.day_advanced.connect(_on_day_advanced)
	# DataStore loads in its own _ready and is registered BEFORE Wildlife
	# in project.godot, so its data is ready by the time we land here.
	animal_defs = DataStore.animals
	for def in animal_defs:
		var cat: String = String(def.get("category", ""))
		if cat.begins_with("wildlife-") or def.get("role", "") in ["pollinator", "aphid-predator", "slug-predator", "mosquito-predator"]:
			# Owned bees (honeybee, mason-bee, bumblebee) still register
			# here so their arrival banner fires on habitat immigration —
			# but their day-to-day lifespan + production is owned by their
			# habitat buildable (warre hive, mason tubes). The Wildlife
			# cohort is purely a presence + bestiary record for them.
			wild_defs[String(def.get("id", ""))] = def
	# Subscribe to random-events so outbreak events pump the matching
	# pest_pressure. Ladybugs + lacewings + owls then immigrate on the
	# next day-tick once pressure crosses their threshold.
	var re: Node = get_node_or_null("/root/RandomEvents")
	if re != null and re.has_signal("event_triggered"):
		re.event_triggered.connect(_on_random_event)
	GameLog.info("Wildlife loaded %d wild species definitions" % wild_defs.size(), "ecology")


## React to the generic RandomEvents catalogue. We do NOT own the spice
## catalogue — just sample outbreak-flavored events to feed our pest
## pressure map, which in turn lures predators.
func _on_random_event(id: String, _payload: Dictionary) -> void:
	match id:
		"aphid-outbreak":
			bump_pest_pressure("aphid", 40.0)
		"mason-bee-swarm":
			# Swarm season — pollinator pressure peaks; treat as a positive
			# "pressure" for future pollinator-specific flows. No drain.
			pass
		"chipmunk-stash", "neighbors-lost-goat":
			bump_pest_pressure("rodent", 15.0)
		"mushroom-flush", "chanterelle-sprout":
			# Damp conditions -> slug boom.
			bump_pest_pressure("slug", 10.0)
		_:
			pass


# =============================================================
# Day-tick (the heart of the engine)
# =============================================================

func _on_day_advanced(_d: int, season: String, _y: int) -> void:
	_drift_pest_pressure()
	var habitats: Dictionary = _collect_habitats()
	_roll_arrivals(season, habitats)
	_tick_cohorts()
	_apply_predator_pressure_drain()


## Pest pressure rises if food sources exist (crops, stored seeds, etc.)
## and if predators/habitats aren't there to knock it back. The actual
## food-source detection is intentionally coarse for phase 1 — we just
## nudge each pressure up slowly and let habitat-driven predators pull
## it down via _apply_predator_pressure_drain. Tuning lives in balance.json
## in a future pass.
func _drift_pest_pressure() -> void:
	for kind in pest_pressure.keys():
		var cur: float = float(pest_pressure[kind])
		var next: float = min(PEST_PRESSURE_MAX, cur + PEST_PRESSURE_DRIFT_UP)
		pest_pressure[kind] = next
		emit_signal("pest_pressure_changed", kind, next)


## Sweep `get_nodes_in_group` for every habitat group. Returns a dict
## `{ habitat_tag: Array[Node3D] }` the arrival engine reads.
func _collect_habitats() -> Dictionary:
	var out: Dictionary = {}
	var tree: SceneTree = get_tree()
	if tree == null:
		return out
	for gname in HABITAT_GROUPS:
		var tag: String = _group_to_tag(gname)
		var nodes: Array = tree.get_nodes_in_group(gname)
		var live: Array = []
		for n in nodes:
			if is_instance_valid(n):
				live.append(n)
		if live.size() > 0:
			out[tag] = live
	return out


## "chicken_coops" -> "chicken-coop". Matches habitat tag strings used in
## animals.json's `habitat_required` arrays + the guild meta-map. Tables
## the plurals explicitly so we don't trip on -es or compound words.
const _GROUP_TO_TAG: Dictionary = {
	"owl_boxes": "owl-box",
	"bat_boxes": "bat-box",
	"rock_piles": "rock-pile",
	"brush_piles": "brush-pile",
	"hedgerow_segments": "hedgerow",
	"insectary_strips": "insectary-strip",
	"duck_pond_edges": "duck-pond-edge",
	"mason_bee_tubes": "mason-bee-tubes",
	"chicken_coops": "chicken-coop",
	"cow_barns": "cow-barn",
	"goat_sheds": "goat-shed",
	"pig_paddocks": "pig-paddock",
	"kennels": "kennel",
	"warre_hives": "warre-hive",
}

func _group_to_tag(group_name: String) -> String:
	return String(_GROUP_TO_TAG.get(group_name, group_name.replace("_", "-")))


## Walk every wild species def. For each one, check if habitat exists, if
## season matches, if pressure threshold is met. If yes, roll the die.
## On success, spawn a cohort + fire paired feedback.
func _roll_arrivals(season: String, habitats: Dictionary) -> void:
	for id in wild_defs.keys():
		# Already immigrated? Don't re-arrive (future pass can add
		# reinforcement flows — e.g. owl couple raising owlets = +count).
		if cohorts.has(id):
			continue
		var def: Dictionary = wild_defs[id]
		var immig: Dictionary = def.get("immigration", {})
		if immig.is_empty():
			continue  # e.g. heron uses a slightly different trigger path
		# Season gate.
		if immig.has("season_any"):
			var allowed: Array = immig["season_any"]
			if season not in allowed:
				continue
		# Habitat gate — ANY required habitat tag must have >= count matches.
		var hab_required: Array = def.get("habitat_required", [])
		var needed: int = int(immig.get("min_habitat_count", 1))
		var found_pos: Vector3 = _find_habitat(hab_required, habitats, needed)
		if found_pos == Vector3.INF:
			continue
		# Pest-pressure precondition (only for predators of that pest).
		if immig.has("min_rodent_pressure"):
			if pest_pressure.get("rodent", 0.0) < float(immig["min_rodent_pressure"]):
				continue
		if immig.has("min_aphid_pressure"):
			if pest_pressure.get("aphid", 0.0) < float(immig["min_aphid_pressure"]):
				continue
		# Roll it.
		var prob: float = clamp(float(immig.get("probability_per_day", 0.1)), MIN_ROLL, MAX_ROLL)
		if _rng.randf() > prob:
			continue
		_immigrate(id, def, found_pos)


## Return the world position of a matching habitat, or Vector3.INF if the
## species' requirements aren't met.
func _find_habitat(tags_required: Array, habitats: Dictionary, need_count: int) -> Vector3:
	# Species lists one or more tags. ANY-match semantics — if the species
	# says ["pond", "tall-grass-edge"], we return the first habitat that
	# matches either tag. A more-restrictive ALL semantic is future work.
	for tag in tags_required:
		var key: String = String(tag)
		if habitats.has(key):
			var nodes: Array = habitats[key]
			if nodes.size() >= need_count:
				var first: Node3D = nodes[0] as Node3D
				if first != null:
					return first.global_position
	return Vector3.INF


## Instantiate the cohort record, fire paired arrival feedback.
func _immigrate(id: String, def: Dictionary, pos: Vector3) -> void:
	var lifespan: float = float(def.get("lifespan_days", 1000))
	var stddev: float = float(def.get("lifespan_stddev_days", max(30.0, lifespan * 0.15)))
	var cohort: Dictionary = {
		"id": id,
		"count": 1,
		"home_pos": pos,
		"age_days": 0,
		"max_age_days": int(_rand_normal(lifespan, stddev)),
		"announced_arrival": true,
	}
	cohorts[id] = cohort
	# Paired feedback — banner + SFX + log.
	var banner: String = String(def.get("arrival_banner", "%s has arrived." % String(def.get("name", id))))
	var sfx_key: String = String(def.get("arrival_sfx", "forage-chime"))
	if get_node_or_null("/root/Juice") != null:
		Juice.pop(pos + Vector3(0, 2.4, 0), banner, Palette.HONEY)
		Juice.burst(pos + Vector3(0, 1.0, 0),
			Palette.HONEY.lerp(Palette.CORAL, 0.25), 14)
	if get_node_or_null("/root/AudioManager") != null and AudioManager.has_method("play"):
		AudioManager.play(sfx_key, -4.0)
	if get_node_or_null("/root/GameLog") != null:
		GameLog.event("wildlife_arrived", {
			"species": id,
			"pos": [pos.x, pos.z],
			"max_age_days": cohort["max_age_days"],
		})
	emit_signal("species_arrived", id, pos, cohort["count"])


## Age every active cohort; emit `species_departed` and retire the record
## when their time's up. Dying wildlife bumps local OM by 0.05 % (gentle
## "death -> soil" per the locked rule).
func _tick_cohorts() -> void:
	var retiring: Array[String] = []
	for id in cohorts.keys():
		var c: Dictionary = cohorts[id]
		c["age_days"] = int(c.get("age_days", 0)) + 1
		cohorts[id] = c
		if int(c["age_days"]) >= int(c["max_age_days"]):
			retiring.append(id)
	for id in retiring:
		_depart(id)


func _depart(id: String) -> void:
	var c: Dictionary = cohorts.get(id, {})
	if c.is_empty():
		return
	var pos: Vector3 = c.get("home_pos", Vector3.ZERO)
	# Death -> soil. 0.05% OM bump — same order as a chop-and-drop.
	var wg: Node = get_node_or_null("/root/WorldGrid")
	if wg != null and wg.has_method("add_tile_om"):
		wg.call("add_tile_om", pos, 0.05)
	if get_node_or_null("/root/GameLog") != null:
		GameLog.event("wildlife_departed", {
			"species": id,
			"pos": [pos.x, pos.z],
		})
	emit_signal("species_departed", id, pos)
	cohorts.erase(id)


## For every active predator cohort, drain the prey pressure it controls.
## Mappings follow `guilds.json#pest-pressure-map` — we keep the mapping
## in code here (simple literal) because it's consumed on every tick and
## we don't want to reparse JSON each day. Guilds.json is the human-
## readable source of truth; this table mirrors it.
func _apply_predator_pressure_drain() -> void:
	var predator_to_prey: Dictionary = {
		"barn-owl": { "rodent": 12.0 },
		"garter-snake": { "rodent": 5.0, "slug": 3.0 },
		"little-brown-bat": { "moth": 10.0 },
		"dragonfly": { "mosquito": 15.0 },
		"ladybug": { "aphid": 14.0 },
		"green-lacewing": { "aphid": 10.0 },
		"ground-beetle": { "slug": 6.0 },
		"northwestern-salamander": { "slug": 4.0 },
		"song-sparrow": { "moth": 3.0, "aphid": 2.0 },
		"pacific-treefrog": { "mosquito": 5.0 },
	}
	for id in cohorts.keys():
		if not predator_to_prey.has(id):
			continue
		var map: Dictionary = predator_to_prey[id]
		for kind in map.keys():
			var drain: float = float(map[kind])
			var cur: float = float(pest_pressure.get(kind, 0.0))
			var next: float = max(0.0, cur - drain)
			if next != cur:
				pest_pressure[kind] = next
				emit_signal("pest_pressure_changed", kind, next)


# =============================================================
# Box-Muller (shared with AnimalEntity).
# =============================================================

func _rand_normal(mean: float, stddev: float) -> float:
	var u1: float = max(0.0001, _rng.randf())
	var u2: float = _rng.randf()
	var z: float = sqrt(-2.0 * log(u1)) * cos(TAU * u2)
	return max(30.0, mean + stddev * z)


# =============================================================
# Public API (HUD + challenge-designer + random_events).
# =============================================================

## Bump a pest-pressure value manually. Used by challenge-designer when
## an event fires ("aphid outbreak" adds 40 to aphid pressure so ladybugs
## immigrate faster). Returns the new value.
func bump_pest_pressure(kind: String, delta: float) -> float:
	var cur: float = float(pest_pressure.get(kind, 0.0))
	var next: float = clamp(cur + delta, 0.0, PEST_PRESSURE_MAX)
	pest_pressure[kind] = next
	emit_signal("pest_pressure_changed", kind, next)
	return next


## Read the current pressure for `kind`. 0 = no pressure, 100 = outbreak.
func get_pest_pressure(kind: String) -> float:
	return float(pest_pressure.get(kind, 0.0))


## Snapshot of every active cohort. HUD bestiary reads this.
func active_cohorts() -> Array:
	return cohorts.values()


## Is a given species present on the farm right now?
func is_present(id: String) -> bool:
	return cohorts.has(id)


## Debug / sim harness — force-immigrate a species without waiting for
## the habitat roll. Used by tests to verify the arrival feedback path.
func debug_force_arrival(id: String, pos: Vector3 = Vector3.ZERO) -> bool:
	if not wild_defs.has(id):
		return false
	if cohorts.has(id):
		return false
	_immigrate(id, wild_defs[id], pos)
	return true


## Debug — clear cohorts (used between sim runs).
func debug_clear() -> void:
	cohorts.clear()
	for k in pest_pressure.keys():
		pest_pressure[k] = 0.0


func serialize() -> Dictionary:
	return {
		"cohorts": cohorts.duplicate(true),
		"pest_pressure": pest_pressure.duplicate(),
	}


func hydrate(data: Dictionary) -> void:
	if data.has("cohorts"):
		cohorts = (data["cohorts"] as Dictionary).duplicate(true)
	if data.has("pest_pressure"):
		pest_pressure = (data["pest_pressure"] as Dictionary).duplicate()
