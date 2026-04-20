## Fairy Permaculture — Rodent population tracker (autoload).
##
## Tracks tile-based rodent pressure around stored seeds/grain. Rodent
## population grows daily inside 8 tiles of any storage shed (food
## source), then hunted down by barn cats within their hunt radius. If
## nothing keeps the population in check, rodents spoil `seeds` at a
## slow rate (0.1/day per active boom).
##
## This autoload intentionally stays tiny + single-owner. Cats hunt via
## `cat_hunt_at(pos, radius)`; the day-tick loop handles boom + spoilage
## bookkeeping. A `rodent_boom(pos)` signal fires when the population
## crosses BOOM_THRESHOLD for the first time in a cluster so future UI
## (owl-box nudges) can subscribe. `rodent_controlled(pos)` fires when
## a cat knocks pressure below CONTROLLED_THRESHOLD.
##
## Locked refs: project_animal_system.md "Cats: rodent hunters, not meat
## eaters" + feedback_self_balancing_ecology.md "rodent boom → predator
## arrival (owl, snake, cat)".
##
## Cluster map: keyed by stringified tile-cell (the 8-tile radius around
## each storage shed is folded into a single cluster so we don't spawn
## a new stat per tile). Each cluster entry is:
##   {
##     "pos": Vector3,        # cluster centre (shed position)
##     "population": float,   # 0–100 pressure
##     "announced_boom": bool,
##     "announced_controlled": bool,
##   }
extends Node


signal rodent_boom(pos: Vector3)
signal rodent_controlled(pos: Vector3)
signal changed()


## How many tiles from a storage shed count as "rodent country".
const FOOD_SOURCE_RADIUS: float = 8.0

## Rate the population grows per day when seeds are stored and no cat is
## hunting. Pressure caps at 100.
const GROWTH_PER_DAY: float = 6.0

## Rate the population grows even faster when seeds are overflowing the
## pocket cap (boom scenario). Triggers on seeds >= 10.
const GROWTH_BOOM_PER_DAY: float = 12.0

## Max population a single cluster can reach.
const POP_MAX: float = 100.0

## A cluster at or above this pressure spoils seeds.
const SPOILAGE_THRESHOLD: float = 30.0

## Seeds spoiled per day per active cluster over SPOILAGE_THRESHOLD.
const SPOILAGE_PER_DAY: float = 0.1

## Cats within this pressure cap cannot do useful work (rodent pressure
## is already zero; `rodent_controlled` fires + fallback-meat triggers).
const CONTROLLED_THRESHOLD: float = 5.0

## Cross this upward and the boom announcement fires (once per cluster).
const BOOM_THRESHOLD: float = 60.0

## Kills per cat per day when rodents are present. Uncapped by stock
## because cat fitness IS the cap — one cat handles one cluster.
const CAT_KILLS_PER_DAY: float = 20.0


var clusters: Dictionary = {}  # String cluster_key -> cluster dict


func _ready() -> void:
	var sched: Node = get_node_or_null("/root/Scheduler")
	if sched != null and sched.has_signal("day_advanced"):
		sched.day_advanced.connect(_on_day_advanced)


func _on_day_advanced(_d: int, _s: String, _y: int) -> void:
	_refresh_clusters()
	_grow_populations()
	_spoil_seeds()


# =============================================================
# Cluster tracking — clusters are tied to storage sheds (food source).
# =============================================================

## Rebuild cluster entries from the live storage_sheds group. Sheds
## added or removed between ticks → clusters appear/retire. We keep
## populations across tick boundaries so a shed that loses rodents
## doesn't reset next time.
func _refresh_clusters() -> void:
	var st: SceneTree = get_tree()
	if st == null:
		return
	var seen: Dictionary = {}
	var sheds: Array = st.get_nodes_in_group("storage_sheds")
	for s in sheds:
		if s == null or not is_instance_valid(s):
			continue
		var pos: Vector3 = (s as Node3D).global_position
		var key: String = _cluster_key(pos)
		seen[key] = true
		if not clusters.has(key):
			clusters[key] = {
				"pos": pos,
				"population": 0.0,
				"announced_boom": false,
				"announced_controlled": false,
			}
		else:
			clusters[key]["pos"] = pos
	# Retire clusters whose shed is gone.
	for key in clusters.keys().duplicate():
		if not seen.has(key):
			clusters.erase(key)


func _cluster_key(pos: Vector3) -> String:
	# Snap to integer metre grid so nearby sheds merge into one cluster.
	return "%d_%d" % [int(round(pos.x)), int(round(pos.z))]


# =============================================================
# Day-tick: grow population + fire boom announcements.
# =============================================================

func _grow_populations() -> void:
	var ft: Node = get_node_or_null("/root/FarmTotals")
	var seeds: float = 0.0
	if ft != null and ft.has_method("get_resource"):
		seeds = float(ft.call("get_resource", "seeds"))
	if seeds <= 0.0:
		return  # No food source, no growth.
	for key in clusters.keys():
		var c: Dictionary = clusters[key]
		var pop: float = float(c.get("population", 0.0))
		var rate: float = GROWTH_BOOM_PER_DAY if seeds >= 10.0 else GROWTH_PER_DAY
		pop = min(POP_MAX, pop + rate)
		c["population"] = pop
		if pop >= BOOM_THRESHOLD and not bool(c.get("announced_boom", false)):
			c["announced_boom"] = true
			c["announced_controlled"] = false
			emit_signal("rodent_boom", c["pos"])
			if get_node_or_null("/root/GameLog") != null:
				GameLog.event("rodent_boom", {
					"pos": [c["pos"].x, c["pos"].z],
					"pop": pop,
				})
		clusters[key] = c
	emit_signal("changed")


func _spoil_seeds() -> void:
	var ft: Node = get_node_or_null("/root/FarmTotals")
	if ft == null:
		return
	var total_spoil: float = 0.0
	for key in clusters.keys():
		var c: Dictionary = clusters[key]
		var pop: float = float(c.get("population", 0.0))
		if pop >= SPOILAGE_THRESHOLD:
			total_spoil += SPOILAGE_PER_DAY
	if total_spoil > 0.0:
		ft.call("spend_resource", "seeds", total_spoil)
		if get_node_or_null("/root/GameLog") != null:
			GameLog.event("rodent_spoilage", { "seeds_lost": total_spoil })


# =============================================================
# Cat API — called once per cat per day via barn_cat.day_tick.
# =============================================================

## A cat at `pos` hunts every cluster within `radius` tiles. Returns the
## total rodent population drained this tick (0 if no clusters in range
## or every cluster is already at zero). A cat with zero kills falls
## back to its tiny meat-from-storage loop (see barn_cat.gd).
func cat_hunt_at(pos: Vector3, radius: float) -> float:
	var killed: float = 0.0
	var per_cluster: float = CAT_KILLS_PER_DAY
	for key in clusters.keys():
		var c: Dictionary = clusters[key]
		var cpos: Vector3 = c.get("pos", Vector3.ZERO)
		if cpos.distance_to(pos) > radius:
			continue
		var pop: float = float(c.get("population", 0.0))
		if pop <= 0.0:
			continue
		var take: float = min(pop, per_cluster)
		pop -= take
		killed += take
		c["population"] = pop
		if pop <= CONTROLLED_THRESHOLD and not bool(c.get("announced_controlled", false)):
			c["announced_controlled"] = true
			c["announced_boom"] = false
			emit_signal("rodent_controlled", cpos)
			if get_node_or_null("/root/GameLog") != null:
				GameLog.event("rodent_controlled", { "pos": [cpos.x, cpos.z] })
		clusters[key] = c
	if killed > 0.0:
		emit_signal("changed")
	return killed


# =============================================================
# Introspection helpers (HUD + sim harness).
# =============================================================

## Population at the cluster containing `pos`, or 0.0 if none.
func population_at(pos: Vector3) -> float:
	var best: float = 0.0
	for key in clusters.keys():
		var c: Dictionary = clusters[key]
		var cpos: Vector3 = c.get("pos", Vector3.ZERO)
		if cpos.distance_to(pos) <= FOOD_SOURCE_RADIUS:
			best = max(best, float(c.get("population", 0.0)))
	return best


## Total rodent pressure across all clusters (HUD readout).
func total_population() -> float:
	var s: float = 0.0
	for key in clusters.keys():
		s += float(clusters[key].get("population", 0.0))
	return s


## Debug / sim: bump a cluster's population directly. The sim uses this
## to pre-load a boom without waiting 10 day-ticks for growth.
func debug_set_population(pos: Vector3, pop: float) -> void:
	var key: String = _cluster_key(pos)
	if not clusters.has(key):
		clusters[key] = {
			"pos": pos,
			"population": 0.0,
			"announced_boom": false,
			"announced_controlled": false,
		}
	var c: Dictionary = clusters[key]
	c["population"] = clamp(pop, 0.0, POP_MAX)
	clusters[key] = c
	emit_signal("changed")
