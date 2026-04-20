## Fairy Permaculture — per-run farm totals (typed resources).
##
## The farm's storage bookkeeping. Every harvest funnels through this
## node when a fairy deposits into a storage shed; the HUD reads these
## counters for its resource bar.
##
## Taxonomy refactor (2026-04): the old catch-all `greens` / `browns`
## stock buckets are GONE. Each piece of biomass is now a specific item
## with its own C:N ratio and a `category` tag (green / brown / neutral)
## maintained in `scripts/interactable.gd::RESOURCE_CATEGORY`. The HUD
## groups items by tag so players still see "greens total" at a glance,
## but strategic depth comes from the specific items (wood chips C:N 400
## vs twigs C:N 200 vs plant trim C:N 20 etc).
##
## Typed resource channels:
##   plant_trim    — fresh plant clippings from chop-and-drop
##                   (green, C:N ~20). Replaces the old GREENS bucket.
##   fruit_scraps  — rotten/windfall fruit (green, C:N ~35).
##   dry_leaves    — fallen autumn leaves (brown, C:N ~60).
##   wood          — logs from felled trees (brown, C:N ~350).
##   twigs         — small branches / prunings (brown, C:N ~200).
##   wood_chips    — chipped wood/twigs; high-C bulker, fungal substrate,
##                   ramial mulch (brown, C:N ~400, structural airflow
##                   aid).
##   stone         — from quarried rocks (neutral).
##   seeds         — from harvested flowers / seed heads (neutral).
##   fruit         — from berries + orchard (green for compost purposes,
##                   but primarily player food).
##   compost       — finished compost from piles (neutral).
##   water         — litres drawn from the stream / pond. Cheap at a
##                   high rate when a stream runs through the property
##                   (+3 per 8 s of fairy labor = effectively free in
##                   steady state). Without a stream, water is drought-
##                   gated — the player will eventually dig ponds, but
##                   for MVP the stream is always present so draw-water
##                   is a flat +3 action. Spent on watering plots +
##                   piles + (later) animal troughs.
##
## Legacy `biomass` stays as a getter alias (= plant_trim + twigs + wood)
## so older callers (progression build costs, HUD goals text) keep working
## without us having to audit every site in the same PR.
##
## Capacity: each storage shed exposes `capacity_per_type`. Without any
## shed, the player has a tiny "pocket" of 5 per type — enough to get
## going, thin enough that building the first shed is felt.
extends Node

signal changed()
## Emitted when a deposit was rejected because a type was at capacity.
## UI listens and shows a short "storage full" banner.
signal storage_rejected(resource_type: String, amount: float)

# ---------- Typed resource keys ----------
# NOTE: GREENS / BROWNS constants deliberately REMOVED — see module
# docstring. Callers that still need the old aggregate number can read
# `FarmTotals.biomass` or iterate RESOURCE_TYPES themselves.
const PLANT_TRIM: String   = "plant_trim"
const FRUIT_SCRAPS: String = "fruit_scraps"
const DRY_LEAVES: String   = "dry_leaves"
const WOOD: String         = "wood"
const TWIGS: String        = "twigs"
const STONE: String        = "stone"
const SEEDS: String        = "seeds"
const FRUIT: String        = "fruit"
const COMPOST: String      = "compost"
const WOOD_CHIPS: String   = "wood_chips"
const WATER: String        = "water"

# ---------- Animal-system additions (phase 1: chicken pilot) ----------
#
# Resources introduced by the death-outputs → soil-engine loop. Meat is
# NOT fairy food (locked design — fairies eat honey/milk/fruit only);
# meat routes to dogs/cats/NPC trade. Bones + blood get fired at the Kiln
# into the SOIL amendments — bone_meal is the high-leverage phosphorus
# unlock, blood_meal is fast nitrogen, feathers are a slow-release N
# mulch. Hide + down + lard are staged now so later crafting agents can
# drop them in without another FarmTotals migration.
const MEAT: String         = "meat"
const BONES: String        = "bones"
const BONE_MEAL: String    = "bone_meal"
const BLOOD: String        = "blood"
const BLOOD_MEAL: String   = "blood_meal"
const HIDE: String         = "hide"
const FEATHERS: String     = "feathers"
const DOWN: String         = "down"
const LARD: String         = "lard"
const BIOCHAR: String      = "biochar"  # stub: Kiln future-firing

# ---------- Day-0 forage additions (Day-0 Activities Engineer) ----------
#
# Resources yielded by forest-edge foraging + seed-gathering so the player
# has parallel day-0 loops while the compost cook cycle runs.
#
#   WILD_BERRIES   — foraged fruit from mature/old trees (green, C:N ~30).
#                    Fairy food supplement (routed through `fruit` food
#                    bucket when consumed in later passes; for now just
#                    lives in storage).
#   WILD_MUSHROOMS — autumn/winter forest forage (neutral). Rare.
#   IMO            — "indigenous micro-organisms" — inoculant scraped from
#                    forest duff. Drops into compost piles as the
#                    `imo-harvested` ingredient (pile.gd already knows
#                    `forest-duff-imo` at cn=25 moisture=50; the compost
#                    wire-up is a follow-up since compost_pile.gd is
#                    write-forbidden this pass — see report).
const WILD_BERRIES: String   = "wild_berries"
const WILD_MUSHROOMS: String = "wild_mushrooms"
const IMO: String            = "imo"

const RESOURCE_TYPES: Array[String] = [
	PLANT_TRIM, FRUIT_SCRAPS, DRY_LEAVES,
	WOOD, TWIGS, STONE, SEEDS, FRUIT, COMPOST, WOOD_CHIPS, WATER,
	MEAT, BONES, BONE_MEAL, BLOOD, BLOOD_MEAL,
	HIDE, FEATHERS, DOWN, LARD, BIOCHAR,
	WILD_BERRIES, WILD_MUSHROOMS, IMO,
]

## No-shed "pocket" capacity per type. The player can gather a little
## before needing storage — then storage becomes mandatory.
const POCKET_CAPACITY: float = 5.0

# ---------- Current stocks (per type) ----------
var stocks: Dictionary = {
	PLANT_TRIM: 0.0,
	FRUIT_SCRAPS: 0.0,
	DRY_LEAVES: 0.0,
	WOOD: 0.0,
	TWIGS: 0.0,
	STONE: 0.0,
	SEEDS: 0.0,
	FRUIT: 0.0,
	COMPOST: 0.0,
	WOOD_CHIPS: 0.0,
	WATER: 0.0,
	# Animal-system additions (phase 1 seeds the schema — carcass outputs
	# flow through deposit_yield into the same bucket).
	MEAT: 0.0,
	BONES: 0.0,
	BONE_MEAL: 0.0,
	BLOOD: 0.0,
	BLOOD_MEAL: 0.0,
	HIDE: 0.0,
	FEATHERS: 0.0,
	DOWN: 0.0,
	LARD: 0.0,
	BIOCHAR: 0.0,
	# Day-0 forage additions.
	WILD_BERRIES: 0.0,
	WILD_MUSHROOMS: 0.0,
	IMO: 0.0,
}

# ---------- Retained flags + fairy food (unchanged) ----------
var fruit_picked: int = 0
var pile_feeds: int = 0
var compost_harvested: int = 0
var pile_hot_seen: bool = false
var fairy_food: Dictionary = { "honey": 0.0, "milk": 0.0, "fruit": 0.0 }


# ---------- Core API ----------

## Best-effort add. If the gain would exceed capacity the excess is
## rejected (storage_rejected fired). Returns the amount actually added.
func add_resource(kind: String, amount: float) -> float:
	if amount <= 0.0:
		return 0.0
	if not stocks.has(kind):
		return 0.0
	var cap: float = capacity_for(kind)
	var room: float = max(0.0, cap - float(stocks[kind]))
	var taken: float = min(amount, room)
	var rejected: float = amount - taken
	if taken > 0.0:
		stocks[kind] = float(stocks[kind]) + taken
		emit_signal("changed")
	if rejected > 0.0:
		emit_signal("storage_rejected", kind, rejected)
	# Side-channel markers some legacy UI still reads.
	if kind == FRUIT and taken > 0.0:
		fruit_picked += int(ceil(taken))
	if kind == COMPOST and taken > 0.0:
		compost_harvested += int(ceil(taken))
	return taken


## Best-effort spend. Returns false (no change) if we don't have enough.
func spend_resource(kind: String, amount: float) -> bool:
	if amount <= 0.0:
		return true
	if not stocks.has(kind):
		return false
	if float(stocks[kind]) < amount:
		return false
	stocks[kind] = float(stocks[kind]) - amount
	emit_signal("changed")
	return true


## Read a stock without modifying it.
func get_resource(kind: String) -> float:
	return float(stocks.get(kind, 0.0))


## Total room remaining for a given type (cap − current).
func remaining_capacity(kind: String) -> float:
	return max(0.0, capacity_for(kind) - get_resource(kind))


## Capacity for a given type: sum of shed capacities, or POCKET_CAPACITY
## if there are no sheds. Piggybacks on the `storage_sheds` group so we
## don't need a hard reference — StorageIndex is still the primary fast
## path for fairy routing, but capacity is cheap to recompute.
func capacity_for(_kind: String) -> float:
	var sheds: Array = []
	var st: SceneTree = Engine.get_main_loop() as SceneTree
	if st != null:
		sheds = st.get_nodes_in_group("storage_sheds")
	if sheds.is_empty():
		return POCKET_CAPACITY
	var total: float = 0.0
	for s in sheds:
		if s == null or not is_instance_valid(s):
			continue
		var per: Variant = s.get("capacity_per_type")
		if per == null:
			total += 40.0
		else:
			total += float(per)
	return total


# ---------- Legacy aliases (biomass, compost, water, wood_chips) ----------
#
# `biomass` is a modest sum — only plant_trim + twigs + wood — so the
# progression gate (`biomass >= 1.0` after first chop-and-drop) still
# fires on a single successful chop without being trivially satisfied by
# a stray wood_chip or fruit_scrap. Legacy build costs that spent
# "biomass" are remapped to `plant_trim` in progression.gd; this alias
# is kept only for affordability checks + goal text.
var biomass: float:
	get:
		return float(stocks[PLANT_TRIM]) + float(stocks[TWIGS]) + float(stocks[WOOD])
	set(value):
		# Setter rebalances: dump extra into plant_trim (the direct
		# successor to the old greens bucket).
		var delta: float = value - (float(stocks[PLANT_TRIM]) + float(stocks[TWIGS]) + float(stocks[WOOD]))
		stocks[PLANT_TRIM] = max(0.0, float(stocks[PLANT_TRIM]) + delta)
		emit_signal("changed")


## Property getter — `FarmTotals.compost` still works.
var compost: float:
	get:
		return float(stocks[COMPOST])
	set(value):
		stocks[COMPOST] = max(0.0, value)
		emit_signal("changed")


## Property getter — `FarmTotals.wood_chips` for parity with other typed
## shortcuts. Chippers produce chips; piles, soil plots, and fungal beds
## consume them.
var wood_chips: float:
	get:
		return float(stocks[WOOD_CHIPS])
	set(value):
		stocks[WOOD_CHIPS] = max(0.0, value)
		emit_signal("changed")


## Property getter — `FarmTotals.water` for parity with the other typed
## shortcuts. Drawn from stream/pond tiles, spent on watering piles + plots.
var water: float:
	get:
		return float(stocks[WATER])
	set(value):
		stocks[WATER] = max(0.0, value)
		emit_signal("changed")


## Property getter — `FarmTotals.plant_trim` for parity. Direct successor
## to the old `greens` bucket. Yielded by plant chop-and-drop.
var plant_trim: float:
	get:
		return float(stocks[PLANT_TRIM])
	set(value):
		stocks[PLANT_TRIM] = max(0.0, value)
		emit_signal("changed")


## Property getter — `FarmTotals.fruit_scraps`. Rotten/windfall fruit
## green compost input. Yield paths come later; constant + stock live
## here so the HUD + compost pile can surface it immediately.
var fruit_scraps: float:
	get:
		return float(stocks[FRUIT_SCRAPS])
	set(value):
		stocks[FRUIT_SCRAPS] = max(0.0, value)
		emit_signal("changed")


## Property getter — `FarmTotals.dry_leaves`. Seasonal autumn leaf fall
## brown compost input. Source path (autumn decor shedding) is future
## work; constant + stock live here so the HUD + compost pile already
## support it.
var dry_leaves: float:
	get:
		return float(stocks[DRY_LEAVES])
	set(value):
		stocks[DRY_LEAVES] = max(0.0, value)
		emit_signal("changed")


## Legacy: add biomass → route to plant_trim (direct successor to the
## old "greens" bucket).
func add_biomass(kg: float) -> void:
	add_resource(PLANT_TRIM, kg)


## Legacy: spend biomass → draw from plant_trim first, then twigs, then
## wood (cheapest-to-priciest). Returns true only if the total debit
## succeeds.
func spend_biomass(kg: float) -> bool:
	if kg <= 0.0:
		return true
	var have: float = float(stocks[PLANT_TRIM]) + float(stocks[TWIGS]) + float(stocks[WOOD])
	if have < kg:
		return false
	var remaining: float = kg
	var from_trim: float = min(float(stocks[PLANT_TRIM]), remaining)
	stocks[PLANT_TRIM] = float(stocks[PLANT_TRIM]) - from_trim
	remaining -= from_trim
	if remaining > 0.0:
		var from_twigs: float = min(float(stocks[TWIGS]), remaining)
		stocks[TWIGS] = float(stocks[TWIGS]) - from_twigs
		remaining -= from_twigs
	if remaining > 0.0:
		stocks[WOOD] = max(0.0, float(stocks[WOOD]) - remaining)
	emit_signal("changed")
	return true


## Legacy: add compost bags.
func add_compost(bags: float) -> void:
	add_resource(COMPOST, bags)


## Legacy: apply compost bags (spend).
func apply_compost(bags: float) -> bool:
	return spend_resource(COMPOST, bags)


# ---------- Fairy food (unchanged shape) ----------

func add_food(kind: String, amount: float) -> void:
	if not fairy_food.has(kind):
		return
	fairy_food[kind] += amount
	emit_signal("changed")


func mark_fruit_picked() -> void:
	fruit_picked += 1
	emit_signal("changed")


func mark_pile_feed() -> void:
	pile_feeds += 1
	emit_signal("changed")


func mark_pile_hot() -> void:
	if not pile_hot_seen:
		pile_hot_seen = true
		emit_signal("changed")


# ---------- Convenience: batch deposit for TaskQueue ----------

## Drop a whole yield dictionary in one call. Returns the dict of
## actually-deposited amounts per type (so callers can show what spilled).
##
## Back-compat: callers that still emit "greens" / "browns" / "biomass"
## get silently remapped onto the new taxonomy so nothing breaks while
## the caller sites migrate.
func deposit_yield(yield_dict: Dictionary) -> Dictionary:
	var out: Dictionary = {}
	for k in yield_dict.keys():
		var key: String = String(k)
		var amt: float = float(yield_dict[k])
		# Fruit + honey + milk still flow through the fairy-food bucket
		# so the existing population spawn logic keeps working.
		if key == "honey" or key == "milk":
			add_food(key, amt)
			out[key] = amt
			continue
		# Legacy aggregate buckets → route to their successor item.
		if key == "biomass" or key == "greens":
			var taken: float = add_resource(PLANT_TRIM, amt)
			out[PLANT_TRIM] = taken
			continue
		if key == "browns":
			var taken_b: float = add_resource(DRY_LEAVES, amt)
			out[DRY_LEAVES] = taken_b
			continue
		if stocks.has(key):
			out[key] = add_resource(key, amt)
		else:
			# Unknown channel — silently ignore, but log via GameLog if
			# available so we see which agents are emitting unknown keys.
			if Engine.has_singleton("GameLog"):
				pass
	return out
