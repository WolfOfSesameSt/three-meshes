## Fairy Permaculture — lifetime farm statistics.
##
## Cumulative counters that never decrement, plus a "firsts" dict that
## stamps the day each milestone was achieved. The parchment Farm Legacy
## scroll (fp-ux-engineer, parallel) reads from this autoload. Headless
## sims read too — a farm that's run 120 days should be able to report
## "47 eggs laid, first chicken on day 3, first owl on day 22".
##
## Design principles (locked by Ian):
##   • Cumulative — only increments, never decrements. Save-slot totals
##     reflect the full lifespan of the farm.
##   • Subscribe to existing signals rather than adding emit sites
##     everywhere. Scheduler.day_advanced, Wildlife.species_arrived,
##     FarmTotals.changed, Game.new_fairy_spawned already exist —
##     we just listen.
##   • Public read API: `LifetimeStats.get(key)`, `firsts()`, `get_all()`.
##     Keep the UI agent's read path clean + future-stable.
##   • Save/load round-trip via SaveSystem capture/restore hooks (added
##     additively to save_system.gd — see `_capture_lifetime_stats`).
##
## Autoload load order (project.godot): appended at END of the autoload
## block, so all upstream autoloads (Scheduler, FarmTotals, Wildlife,
## Game) have already been registered when our `_ready()` fires.
extends Node


signal changed(key: String, value)


# ---- Cumulative counter keys. All default to 0 on a fresh run. ----
const KEY_EGGS_LAID: String             = "eggs_laid_total"
const KEY_MILK_PRODUCED: String         = "milk_produced_total"
const KEY_FRUIT_HARVESTED: String       = "fruit_harvested_total"
const KEY_COMPOST_SCOOPS: String        = "compost_scoops_total"
const KEY_FAIRIES_HATCHED: String       = "fairies_hatched_total"
const KEY_FAIRIES_DIED: String          = "fairies_died_total"
const KEY_ANIMALS_BORN: String          = "animals_born_total"
const KEY_ANIMALS_DIED: String          = "animals_died_total"
const KEY_WILDLIFE_ARRIVALS: String     = "wildlife_arrivals_total"
const KEY_PLANTS_PLANTED: String        = "plants_planted_total"
const KEY_PLANTS_HARVESTED: String      = "plants_harvested_total"
const KEY_DAYS_ELAPSED: String          = "days_elapsed_total"
const KEY_FARM_AGE_SEASONS: String      = "farm_age_seasons"
# Secondary counters reflected from derived signals.
const KEY_CARCASSES_SPAWNED: String     = "carcasses_spawned_total"
const KEY_BUTCHERS_DONE: String         = "butchers_done_total"
const KEY_BONE_MEAL_FIRED: String       = "bone_meal_fired_total"

const ALL_KEYS: Array[String] = [
	KEY_EGGS_LAID,
	KEY_MILK_PRODUCED,
	KEY_FRUIT_HARVESTED,
	KEY_COMPOST_SCOOPS,
	KEY_FAIRIES_HATCHED,
	KEY_FAIRIES_DIED,
	KEY_ANIMALS_BORN,
	KEY_ANIMALS_DIED,
	KEY_WILDLIFE_ARRIVALS,
	KEY_PLANTS_PLANTED,
	KEY_PLANTS_HARVESTED,
	KEY_DAYS_ELAPSED,
	KEY_FARM_AGE_SEASONS,
	KEY_CARCASSES_SPAWNED,
	KEY_BUTCHERS_DONE,
	KEY_BONE_MEAL_FIRED,
]

# Main storage. Floats so continuous feeds (milk liters, etc.) don't lose
# precision; the UI casts to int for counter displays.
var stats: Dictionary = {}
# "Firsts" timestamps — key_of_event -> day_number (-1 means never).
# Populated on the first bump of the counter that the first-event tracks.
var firsts: Dictionary = {}

# Previous-frame values we diff against FarmTotals. Snapshotted on every
# FarmTotals.changed and diffed to produce lifetime deltas.
var _prev_fruit_picked: int = 0
var _prev_compost_harvested: int = 0
var _prev_milk_stock: float = 0.0
var _prev_eggs_food: float = 0.0
var _prev_fruit_food: float = 0.0
var _last_season: String = "spring"
## Swallow the next `FarmTotals.changed` event — set during save restore
## to avoid double-counting a big stock-jump. Cleared by the listener
## on the first fire.
var _suppress_ft_diff: bool = false


func _ready() -> void:
	# Initialize all keys to zero so a fresh save always has the full set.
	for k in ALL_KEYS:
		stats[k] = 0.0
	# Hook upstream autoloads. All of these are registered before us in
	# project.godot (Scheduler → FarmTotals → Wildlife → Game → ...), so
	# `/root/*` is live by the time we land here.
	var sched: Node = get_node_or_null("/root/Scheduler")
	if sched != null and sched.has_signal("day_advanced"):
		sched.day_advanced.connect(_on_day_advanced)
		# Seed _last_season so the first season roll is captured.
		if sched.has_method("current_season"):
			_last_season = String(sched.call("current_season"))
	var ft: Node = get_node_or_null("/root/FarmTotals")
	if ft != null and ft.has_signal("changed"):
		ft.changed.connect(_on_farm_totals_changed)
		_snapshot_ft_baseline(ft)
	var wildlife: Node = get_node_or_null("/root/Wildlife")
	if wildlife != null and wildlife.has_signal("species_arrived"):
		wildlife.species_arrived.connect(_on_wildlife_arrived)
	var game: Node = get_node_or_null("/root/Game")
	if game != null and game.has_signal("new_fairy_spawned"):
		game.new_fairy_spawned.connect(_on_fairy_spawned)
	# Progression: milestone firsts roll through GameLog events. We snapshot
	# progression bool flags on day-tick so first_* flips auto-stamp their
	# day. See _on_day_advanced for the sweep.
	GameLog.info("LifetimeStats autoload ready.", "lifetime")


# =====================================================================
# Public API
# =====================================================================

## Read a counter value. Unknown keys return 0.0.
func get_stat(key: String) -> float:
	return float(stats.get(key, 0.0))


## Return a shallow copy of the stats dict. Useful for HUD panels.
func get_all() -> Dictionary:
	return stats.duplicate()


## Return the firsts map. Keys follow `first_<event_name>_day` convention
## (e.g. "first_chicken_day", "first_compost_finish_day", "first_owl_day").
## -1 = never. The UX panel renders the pretty name; this keeps the API
## stable.
func get_firsts() -> Dictionary:
	return firsts.duplicate()


## Bump a stat by `delta`. Emits `changed`. First-time bump (previous
## value == 0) stamps the matching first_<key>_day timestamp if the
## caller passed a `first_event_key`.
func add(key: String, delta: float, first_event_key: String = "") -> void:
	var prev: float = float(stats.get(key, 0.0))
	var next: float = prev + delta
	stats[key] = next
	emit_signal("changed", key, next)
	if first_event_key != "" and prev == 0.0 and next > 0.0:
		_stamp_first(first_event_key)


## Stamp a "first" milestone at the current in-game day.
## Idempotent — subsequent calls are silently dropped.
func _stamp_first(event_key: String) -> void:
	if firsts.has(event_key):
		return
	firsts[event_key] = _current_day()


## Public — external callers (progression.gd, habitat scripts) can stamp
## their own firsts without routing through the counter bump.
func stamp_first(event_key: String) -> void:
	_stamp_first(event_key)


func _current_day() -> int:
	var sched: Node = get_node_or_null("/root/Scheduler")
	if sched == null:
		return 0
	var d: Variant = sched.get("day")
	if d == null:
		return 0
	return int(d)


# =====================================================================
# Signal listeners — the read-only "subscribe to everything" pattern.
# =====================================================================

func _snapshot_ft_baseline(ft: Node) -> void:
	_prev_fruit_picked = int(ft.get("fruit_picked"))
	_prev_compost_harvested = int(ft.get("compost_harvested"))
	var food: Variant = ft.get("fairy_food")
	if food is Dictionary:
		var d: Dictionary = food
		_prev_milk_stock = float(d.get("milk", 0.0))
		_prev_fruit_food = float(d.get("fruit", 0.0))
	_prev_eggs_food = _prev_fruit_food  # Eggs route into fruit channel phase-1.


## FarmTotals.changed fires on every resource mutation. We diff against
## the previous snapshot to produce a cumulative lifetime delta.
func _on_farm_totals_changed() -> void:
	# During save restore the FarmTotals values jump from zero to the
	# saved stock in a single `changed` fire — the diff would count every
	# stored unit as "just harvested". `_suppress_ft_diff` gates this.
	if _suppress_ft_diff:
		_suppress_ft_diff = false
		var ft2: Node = get_node_or_null("/root/FarmTotals")
		if ft2 != null:
			_snapshot_ft_baseline(ft2)
		return
	var ft: Node = get_node_or_null("/root/FarmTotals")
	if ft == null:
		return
	var fp_now: int = int(ft.get("fruit_picked"))
	var ch_now: int = int(ft.get("compost_harvested"))
	var food: Variant = ft.get("fairy_food")
	var milk_now: float = _prev_milk_stock
	var fruit_now: float = _prev_fruit_food
	if food is Dictionary:
		var d: Dictionary = food
		milk_now = float(d.get("milk", 0.0))
		fruit_now = float(d.get("fruit", 0.0))
	# Fruit harvested — plant_harvested is tracked separately via plant
	# signals (future pass). The fruit_picked counter is the best proxy.
	var fp_delta: int = max(0, fp_now - _prev_fruit_picked)
	if fp_delta > 0:
		add(KEY_FRUIT_HARVESTED, float(fp_delta), "first_fruit_picked_day")
	var ch_delta: int = max(0, ch_now - _prev_compost_harvested)
	if ch_delta > 0:
		add(KEY_COMPOST_SCOOPS, float(ch_delta), "first_compost_scoop_day")
	# Milk + eggs: we watch the fairy_food bucket. Eggs land in `fruit`
	# phase-1 but we can't cleanly disentangle an egg-delta from a
	# berry-delta without a dedicated channel — so we track "fruit food
	# delta" as an aggregate proxy. A follow-up pass can split eggs out.
	var milk_delta: float = max(0.0, milk_now - _prev_milk_stock)
	if milk_delta > 0.01:
		add(KEY_MILK_PRODUCED, milk_delta, "first_milk_day")
	# Eggs-laid proxy: we bump whenever fruit bucket rises AND there's a
	# coop in the world. Best-effort until a dedicated `eggs` bucket lands.
	var fruit_delta: float = max(0.0, fruit_now - _prev_fruit_food)
	if fruit_delta > 0.01:
		if get_tree().get_nodes_in_group("chicken_coops").size() > 0:
			add(KEY_EGGS_LAID, fruit_delta, "first_egg_day")
	_prev_fruit_picked = fp_now
	_prev_compost_harvested = ch_now
	_prev_milk_stock = milk_now
	_prev_fruit_food = fruit_now


func _on_day_advanced(_day: int, season: String, _year: int) -> void:
	add(KEY_DAYS_ELAPSED, 1.0)
	if season != _last_season:
		_last_season = season
		add(KEY_FARM_AGE_SEASONS, 1.0)
	# Sweep Progression firsts on day-tick. Flips are rare; idempotent
	# stamps are cheap.
	_sweep_progression_firsts()
	# Sweep the scene tree for newly-spawned animals / carcasses. This
	# covers the "animals_born" counter without requiring each habitat
	# to emit a signal.
	_sweep_animal_births()


## Watch Progression bool flags and stamp firsts the first day they flip.
func _sweep_progression_firsts() -> void:
	var prog: Node = get_node_or_null("/root/Progression")
	if prog == null:
		return
	if bool(prog.get("first_egg_collected")):
		_stamp_first("first_egg_collected_day")
	if bool(prog.get("first_carcass_spawned")):
		_stamp_first("first_carcass_day")
	if bool(prog.get("first_butcher_done")):
		_stamp_first("first_butcher_day")
	if bool(prog.get("first_bone_meal_fired")):
		_stamp_first("first_bone_meal_day")


## Walk the live animal group and count how many new instances landed
## since yesterday. We use a cached id-set to avoid double-counting.
var _known_animal_ids: Dictionary = {}


func _sweep_animal_births() -> void:
	var tree: SceneTree = get_tree()
	if tree == null:
		return
	var seen: Dictionary = {}
	for n in tree.get_nodes_in_group("animals"):
		if not is_instance_valid(n):
			continue
		var id: int = n.get_instance_id()
		seen[id] = true
		if not _known_animal_ids.has(id):
			_known_animal_ids[id] = true
			var species: String = String(n.get("species_id"))
			var first_key: String = "first_%s_day" % species if species != "" else ""
			add(KEY_ANIMALS_BORN, 1.0, first_key)
	# Carcasses — count each one once.
	for c in tree.get_nodes_in_group("carcasses"):
		if not is_instance_valid(c):
			continue
		var cid: int = c.get_instance_id()
		if not _known_animal_ids.has(cid):
			_known_animal_ids[cid] = true
			add(KEY_CARCASSES_SPAWNED, 1.0)
			add(KEY_ANIMALS_DIED, 1.0)


func _on_wildlife_arrived(id: String, _pos: Vector3, count: int) -> void:
	add(KEY_WILDLIFE_ARRIVALS, float(count), "first_wildlife_day")
	_stamp_first("first_%s_day" % id)


func _on_fairy_spawned(_name: String) -> void:
	add(KEY_FAIRIES_HATCHED, 1.0, "first_fairy_hatch_day")


# =====================================================================
# Biodiversity helpers — backs the progression unlocks path.
# =====================================================================

## Distinct-species count across owned stock + wildlife cohorts.
## Progression unlock thresholds read from this (3/5/8/12 species).
func distinct_species_count() -> int:
	var seen: Dictionary = {}
	var tree: SceneTree = get_tree()
	if tree != null:
		for n in tree.get_nodes_in_group("animals"):
			if is_instance_valid(n):
				seen[String(n.get("species_id"))] = true
	var wildlife: Node = get_node_or_null("/root/Wildlife")
	if wildlife != null and wildlife.has_method("active_cohorts"):
		var cohorts: Array = wildlife.call("active_cohorts")
		for c in cohorts:
			if c is Dictionary:
				seen[String((c as Dictionary).get("id", ""))] = true
	return seen.size()


## Is a specific species currently present (owned OR wildlife)?
func has_species(species_id: String) -> bool:
	var tree: SceneTree = get_tree()
	if tree != null:
		for n in tree.get_nodes_in_group("animals"):
			if is_instance_valid(n) and String(n.get("species_id")) == species_id:
				return true
	var wildlife: Node = get_node_or_null("/root/Wildlife")
	if wildlife != null and wildlife.has_method("is_present"):
		return bool(wildlife.call("is_present", species_id))
	return false


# =====================================================================
# Save/load round-trip. SaveSystem.gd reads serialize() + calls hydrate
# via the new _capture_lifetime_stats / _restore_lifetime_stats bridges.
# =====================================================================

func serialize() -> Dictionary:
	return {
		"stats": stats.duplicate(),
		"firsts": firsts.duplicate(),
		"prev_fruit_picked": _prev_fruit_picked,
		"prev_compost_harvested": _prev_compost_harvested,
		"prev_milk_stock": _prev_milk_stock,
		"prev_fruit_food": _prev_fruit_food,
		"last_season": _last_season,
	}


func hydrate(data: Dictionary) -> void:
	if data.is_empty():
		return
	var incoming: Dictionary = data.get("stats", {})
	for k in ALL_KEYS:
		if incoming.has(k):
			stats[k] = float(incoming[k])
	firsts = (data.get("firsts", {}) as Dictionary).duplicate()
	_prev_fruit_picked = int(data.get("prev_fruit_picked", 0))
	_prev_compost_harvested = int(data.get("prev_compost_harvested", 0))
	_prev_milk_stock = float(data.get("prev_milk_stock", 0.0))
	_prev_fruit_food = float(data.get("prev_fruit_food", 0.0))
	_last_season = String(data.get("last_season", "spring"))
	# Critical save/load invariant: re-stamp _known_animal_ids with every
	# live animal/carcass so the next day-tick doesn't falsely count them
	# as "newly born" and bump animals_born_total. Without this, every
	# save/load cycle inflates the counter by the current flock size.
	_known_animal_ids.clear()
	var tree: SceneTree = get_tree()
	if tree != null:
		for g in ["animals", "carcasses"]:
			for n in tree.get_nodes_in_group(g):
				if is_instance_valid(n):
					_known_animal_ids[n.get_instance_id()] = true
	# Swallow the next FarmTotals.changed emission. SaveSystem fires
	# `FarmTotals.emit_signal("changed")` once at the end of load to nudge
	# the HUD; that hit would otherwise diff our (just-restored) prev
	# values against the same post-load stock and produce a zero delta,
	# but better safe than sorry against future restore-order changes.
	_suppress_ft_diff = true
	emit_signal("changed", "__hydrated__", null)


# =====================================================================
# Debug API — sim harness uses these to force counters + firsts.
# =====================================================================

func debug_reset() -> void:
	for k in ALL_KEYS:
		stats[k] = 0.0
	firsts.clear()
	_known_animal_ids.clear()
