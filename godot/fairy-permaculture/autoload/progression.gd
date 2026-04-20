## Fairy Permaculture — tutorial / progression gating.
##
## Tracks which buildings the player has unlocked, the active tutorial
## step, and the HUD nudge that should be shown. A single autoload so
## any scene (main, HUD, soil plot, context menu) can read the current
## state without threading the reference through call sites.
##
## Tutorial flow (see DESIGN.md "Progression rings → Tutorial"):
##   Step 0 — Chop wild plants into biomass
##   Step 1 — Feed compost pile
##   Step 2 — Scoop finished compost → enriched soil
##   Step 3 — Build Storage Shed (right-click ground)
##   Step 4 — Build Sprouting Bed (right-click ground)
##   Step 5 — All buildables unlocked
##
## The HUD reads `current_nudge()` each frame and renders the parchment
## banner. Each progression advancement fires a GameLog.event so runs
## are replayable from the log.
extends Node

signal tutorial_step_changed(step: int)
signal unlocks_changed()

# Building ids — must match the BUILD_CATALOG keys below.
const BUILDING_COMPOST_PILE: StringName = &"compost_pile"
const BUILDING_STORAGE_SHED: StringName = &"storage_shed"
const BUILDING_SPROUTING_BED: StringName = &"sprouting_bed"
const BUILDING_CHICKEN_COOP: StringName = &"chicken_coop"
const BUILDING_HIVE: StringName = &"hive"
const BUILDING_WORM_BIN: StringName = &"worm_bin"
const BUILDING_CHIPPER: StringName = &"chipper"
# Compost tier variants (2026-04 pile-variants batch). Each is a distinct
# Node3D scene with its own cook multiplier / throughput. Unlock chain:
#   cold pile (default)  → hot pile (after first compost harvested)
#   worm bin (ring 0 R3) → unlocked alongside sprouting + chipper
#   bokashi bucket       → ring 2 (after first storage shed)
#   tea brewer           → after first Hot Pile Q3+ batch
#   johnson-su           → ring 4 branch F (late-game)
const BUILDING_HOT_PILE: StringName = &"hot_pile"
const BUILDING_BOKASHI_BUCKET: StringName = &"bokashi_bucket"
const BUILDING_COMPOST_TEA_BREWER: StringName = &"compost_tea_brewer"
const BUILDING_JOHNSON_SU: StringName = &"johnson_su_bioreactor"
# Animal-system additions (phase 1). Butcher + Kiln advance on the death
# outputs → soil engine loop. Ring 3.0 = coop → first egg. Ring 3.1 =
# first carcass → butcher unlocks. Ring 3.2 = first butcher → kiln unlocks.
const BUILDING_BUTCHER_STATION: StringName = &"butcher_station"
const BUILDING_KILN: StringName = &"kiln"
# Day-0 Activities Engineer — cheap pollinator habitat, unlocked at start.
const BUILDING_MASON_BEE_TUBES: StringName = &"mason_bee_tubes"

# Tutorial step constants.
const STEP_HARVEST_BIOMASS: int = 0
const STEP_FEED_COMPOST: int = 1
const STEP_SCOOP_COMPOST: int = 2
const STEP_BUILD_STORAGE: int = 3
const STEP_BUILD_SPROUTING: int = 4
const STEP_OPEN_CATALOG: int = 5
# Animal-system milestones — once a coop is built and the first egg
# lands, each ring auto-fires the next unlock. These live outside the
# linear STEP_* tutorial flow because players hit them organically.
const STEP_RAISE_FIRST_FLOCK: int = 6
const STEP_FIRST_BUTCHER: int = 7
const STEP_FIRST_BONE_MEAL: int = 8

## Build costs. The taxonomy refactor replaced the abstract `biomass`
## stock bucket with specific items; every legacy `biomass` cost was
## remapped to `plant_trim` (the direct successor — plant_trim is what
## chop-and-drop yields, so the early game still pays for structures
## with the same first-action currency). The legacy `FarmTotals.biomass`
## property still exists as a sum for affordability checks that predate
## this migration.
const BUILD_CATALOG: Dictionary = {
	# Compost Pile: straw/biomass heap ringed with a few twigs. No real
	# construction — buildable day 1 from chop-and-drop + one deadwood log.
	BUILDING_COMPOST_PILE: {
		"label": "Build Compost Pile",
		"scene": "res://scenes/compost_pile.tscn",
		"cost": { "plant_trim": 3.0, "twigs": 2.0 },
		"labor": 10.0,
	},
	# Storage Shed: proper wooden box with straw sealing. Requires felling
	# a small tree OR gathering ~4 deadwood logs first — a day-2 build.
	BUILDING_STORAGE_SHED: {
		"label": "Build Storage Shed",
		"scene": "res://scenes/storage_shed.tscn",
		"cost": { "wood": 4.0, "twigs": 2.0, "plant_trim": 2.0 },
		"labor": 60.0,
	},
	# Sprouting Bed: low wooden frame + soil fill.
	BUILDING_SPROUTING_BED: {
		"label": "Build Sprouting Bed",
		"scene": "res://scenes/sprouting_bed.tscn",
		"cost": { "wood": 3.0, "plant_trim": 3.0 },
		"labor": 60.0,
	},
	BUILDING_CHICKEN_COOP: {
		"label": "Build Chicken Coop",
		"scene": "res://scenes/chicken_coop.tscn",
		# Stone foundation + wooden walls + twig perches + straw bedding.
		"cost": { "wood": 8.0, "twigs": 6.0, "plant_trim": 4.0, "stone": 1.0 },
		"labor": 150.0,
	},
	# Butcher Station: wood block + stone anchor.
	BUILDING_BUTCHER_STATION: {
		"label": "Build Butcher Station",
		"scene": "res://scenes/butcher_station.tscn",
		"cost": { "wood": 4.0, "stone": 1.0 },
		"labor": 80.0,
	},
	# Kiln: heat-bearing stone dome + wood frame + bellows twigs.
	BUILDING_KILN: {
		"label": "Build Kiln",
		"scene": "res://scenes/kiln.tscn",
		"cost": { "stone": 6.0, "wood": 4.0, "twigs": 2.0 },
		"labor": 120.0,
	},
	# Hive: Warré wooden box, stacked frames.
	BUILDING_HIVE: {
		"label": "Build Hive",
		"scene": "",
		"cost": { "wood": 4.0 },
		"labor": 50.0,
	},
	# Worm Bin: small wooden crate + bedding.
	BUILDING_WORM_BIN: {
		"label": "Build Worm Bin",
		"scene": "res://scenes/worm_bin.tscn",
		"cost": { "wood": 2.0, "twigs": 3.0, "plant_trim": 1.0 },
		"labor": 40.0,
	},
	BUILDING_CHIPPER: {
		"label": "Build Chipper",
		"scene": "res://scenes/chipper.tscn",
		"cost": { "wood": 4.0, "stone": 2.0, "twigs": 2.0 },
		"labor": 90.0,
	},
	# ---- Compost tier variants ----
	# Hot Pile: wooden frame + bulky biomass, needs turn discipline for
	# the 0.5× cook multiplier to pay off.
	BUILDING_HOT_PILE: {
		"label": "Build Hot Pile",
		"scene": "res://scenes/hot_pile.tscn",
		"cost": { "wood": 4.0, "twigs": 4.0, "plant_trim": 6.0 },
		"labor": 20.0,
	},
	# Bokashi Bucket: sealed wooden bucket with stone weight for the lid.
	BUILDING_BOKASHI_BUCKET: {
		"label": "Build Bokashi Bucket",
		"scene": "res://scenes/bokashi_bucket.tscn",
		"cost": { "wood": 3.0, "stone": 2.0 },
		"labor": 15.0,
	},
	# Compost Tea Brewer: wooden barrel + twig aeration stack + water seed.
	BUILDING_COMPOST_TEA_BREWER: {
		"label": "Build Tea Brewer",
		"scene": "res://scenes/compost_tea_brewer.tscn",
		"cost": { "wood": 3.0, "water": 2.0, "twigs": 1.0 },
		"labor": 15.0,
	},
	# Johnson-Su Bioreactor: standalone wooden tower + stone base. Big
	# late-game craft.
	BUILDING_JOHNSON_SU: {
		"label": "Build Johnson-Su Bioreactor",
		"scene": "res://scenes/johnson_su_bioreactor.tscn",
		"cost": { "wood": 8.0, "stone": 4.0, "twigs": 4.0 },
		"labor": 60.0,
	},
	# Mason Bee Tubes: cheap day-0 pollinator habitat. Small wooden box
	# with ~10 hollow reed tubes. Passive +20 % fruit yield in an 8 m
	# radius. Unlocked from game start so the player has a meaningful
	# day-0 building option parallel to the compost cook cycle.
	BUILDING_MASON_BEE_TUBES: {
		"label": "Build Mason Bee Tubes",
		"scene": "res://scenes/mason_bee_tubes.tscn",
		"cost": { "wood": 2.0, "twigs": 4.0 },
		"labor": 20.0,
	},
}

var unlocked_buildings: Array[StringName] = [
	BUILDING_COMPOST_PILE,
	BUILDING_STORAGE_SHED,   # day-zero unlock — storage is essential, not gated behind compost
	BUILDING_SPROUTING_BED,
	BUILDING_WORM_BIN,       # Ring 0 R3 per DESIGN.md — unlocked alongside compost pile
	BUILDING_MASON_BEE_TUBES,# Day-0 Activities Engineer — cheap pollinator habitat.
]
var tutorial_step: int = STEP_HARVEST_BIOMASS
var storage_built: bool = false
var sprouting_built: bool = false
var _nudge_dismissed_for_step: int = -1


func _ready() -> void:
	# Hook FarmTotals so progression advances automatically as the
	# player completes steps without any manual "tell me" calls.
	FarmTotals.changed.connect(_evaluate_step)
	_evaluate_step()


## Re-check and advance the tutorial step based on current totals.
## Idempotent — safe to call any time.
func _evaluate_step() -> void:
	var prev: int = tutorial_step
	match tutorial_step:
		STEP_HARVEST_BIOMASS:
			if FarmTotals.biomass >= 1.0:
				_advance_to(STEP_FEED_COMPOST)
		STEP_FEED_COMPOST:
			if FarmTotals.pile_feeds >= 1:
				_advance_to(STEP_SCOOP_COMPOST)
		STEP_SCOOP_COMPOST:
			if FarmTotals.compost_harvested >= 1:
				_advance_to(STEP_BUILD_STORAGE)
				# Compost produced: unlock storage + sprouting at once
				# (either one can be built first). Chipper unlocks in the
				# same wave — once the player has wood + stone from decor
				# gathering, they can turn wood into wood_chips (ramial
				# mulch / pile bulker / fungal substrate).
				unlock(BUILDING_STORAGE_SHED)
				unlock(BUILDING_SPROUTING_BED)
				unlock(BUILDING_CHIPPER)
				# Hot Pile tier — unlocked after the first cold batch
				# finishes. Faster cook multiplier (0.5×) rewards the
				# player for actually completing a cold pile first.
				unlock(BUILDING_HOT_PILE)
		STEP_BUILD_STORAGE:
			if storage_built:
				_advance_to(STEP_BUILD_SPROUTING)
				# Ring 2 — Bokashi bucket needs a storage shed to land
				# its output cleanly, so we unlock it once the shed is up.
				unlock(BUILDING_BOKASHI_BUCKET)
		STEP_BUILD_SPROUTING:
			if sprouting_built:
				_advance_to(STEP_OPEN_CATALOG)
				unlock(BUILDING_CHICKEN_COOP)
				unlock(BUILDING_HIVE)
				unlock(BUILDING_WORM_BIN)
	if prev != tutorial_step:
		_fire_milestone()
	# Johnson-Su proxy unlock: ≥ 10 compost harvested = late-game soil
	# mastery. Fires once per save; replace the threshold when the
	# branch F gate exists.
	if not first_johnson_su_fired and FarmTotals.compost_harvested >= 10:
		mark_johnson_su_unlocked()


func _advance_to(new_step: int) -> void:
	tutorial_step = new_step
	emit_signal("tutorial_step_changed", new_step)
	GameLog.event("progression_step", { "step": new_step, "unlocked": unlocked_buildings.size() })


func _fire_milestone() -> void:
	# Shared milestone juice — paired audio + visual.
	AudioManager.play("compost-finish", -6.0)


## Called by main when a structure actually lands in the world.
func mark_structure_built(building_id: StringName) -> void:
	if building_id == BUILDING_STORAGE_SHED:
		storage_built = true
	elif building_id == BUILDING_SPROUTING_BED:
		sprouting_built = true
	GameLog.event("structure_built", { "building": String(building_id) })
	_evaluate_step()


func unlock(building_id: StringName) -> void:
	if unlocked_buildings.has(building_id):
		return
	unlocked_buildings.append(building_id)
	emit_signal("unlocks_changed")
	GameLog.event("building_unlocked", { "building": String(building_id) })


## Animal-system milestone hooks. Called from chicken_coop /
## carcass / butcher_station. Each triggers the next ring unlock and
## fires a GameLog.event so runs stay replayable. Idempotent — calling
## twice is a no-op.
var first_egg_collected: bool = false
var first_carcass_spawned: bool = false
var first_butcher_done: bool = false
var first_bone_meal_fired: bool = false

func mark_first_egg() -> void:
	if first_egg_collected:
		return
	first_egg_collected = true
	# Egg landed in storage → the flock-raise loop is real. Ring 3.0
	# satisfied; butcher unlocks once a carcass spawns (Ring 3.1).
	tutorial_step = max(tutorial_step, STEP_RAISE_FIRST_FLOCK)
	GameLog.event("animal_milestone_first_egg", {})
	_fire_milestone()


func mark_first_carcass() -> void:
	if first_carcass_spawned:
		return
	first_carcass_spawned = true
	unlock(BUILDING_BUTCHER_STATION)
	tutorial_step = max(tutorial_step, STEP_FIRST_BUTCHER)
	GameLog.event("animal_milestone_first_carcass", {})
	_fire_milestone()


func mark_first_butcher() -> void:
	if first_butcher_done:
		return
	first_butcher_done = true
	unlock(BUILDING_KILN)
	GameLog.event("animal_milestone_first_butcher", {})
	_fire_milestone()


func mark_first_bone_meal() -> void:
	if first_bone_meal_fired:
		return
	first_bone_meal_fired = true
	tutorial_step = max(tutorial_step, STEP_FIRST_BONE_MEAL)
	GameLog.event("animal_milestone_first_bone_meal", {})
	_fire_milestone()


## Hot Pile produced a Q3+ batch — unlock the Tea Brewer. Triggered by
## the compost_pile's harvest hook when the variant is "hot-pile" and the
## returned quality is ≥ 3 stars. Called once per save.
var first_hot_q3_fired: bool = false

func mark_first_hot_q3_batch() -> void:
	if first_hot_q3_fired:
		return
	first_hot_q3_fired = true
	unlock(BUILDING_COMPOST_TEA_BREWER)
	GameLog.event("compost_milestone_first_hot_q3", {})
	_fire_milestone()


## Ring 4 Branch F — Johnson-Su unlock. For MVP we surface it once the
## player has ≥ 10 compost harvested (late-game proxy for "Ring 4 Branch
## F"). The soil-engine agent will refine this gate when the branch
## system lands. Called by _evaluate_step each time FarmTotals.changed
## fires so the unlock lands the first time the threshold is crossed.
var first_johnson_su_fired: bool = false

func mark_johnson_su_unlocked() -> void:
	if first_johnson_su_fired:
		return
	first_johnson_su_fired = true
	unlock(BUILDING_JOHNSON_SU)
	GameLog.event("compost_milestone_johnson_su_unlocked", {})
	_fire_milestone()


func is_unlocked(building_id: StringName) -> bool:
	return unlocked_buildings.has(building_id)


## Buildings buildable given the current unlocks AND resource supply.
## Each entry: { id, label, scene, cost, labor, affordable: bool }.
func available_buildings() -> Array:
	var out: Array = []
	for id in unlocked_buildings:
		var meta: Dictionary = BUILD_CATALOG.get(id, {})
		if meta.is_empty():
			continue
		var cost: Dictionary = meta.get("cost", {})
		var affordable: bool = _can_afford(cost)
		out.append({
			"id": id,
			"label": meta.get("label", String(id)),
			"scene": meta.get("scene", ""),
			"cost": cost,
			"labor": float(meta.get("labor", 60.0)),
			"affordable": affordable,
		})
	return out


func _can_afford(cost: Dictionary) -> bool:
	for k in cost.keys():
		var need: float = float(cost[k])
		var key: String = String(k)
		# Legacy "biomass" cost (no longer emitted by BUILD_CATALOG but
		# might still appear in a player save from before the taxonomy
		# refactor) routes through the property getter so the sum stays
		# compatible.
		if key == "biomass":
			if FarmTotals.biomass < need:
				return false
		else:
			# Every typed resource (plant_trim/wood/stone/twigs/compost
			# /wood_chips/dry_leaves/fruit_scraps…) flows through the
			# same generic getter.
			if FarmTotals.get_resource(key) < need:
				return false
	return true


func spend_cost(cost: Dictionary) -> bool:
	# All-or-nothing debit. Check first.
	if not _can_afford(cost):
		return false
	for k in cost.keys():
		var need: float = float(cost[k])
		var key: String = String(k)
		if key == "biomass":
			FarmTotals.spend_biomass(need)
		else:
			FarmTotals.spend_resource(key, need)
	return true


## What nudge text to show in the HUD banner. Returns empty string if
## the current step's nudge has been dismissed or we're past tutorial.
func current_nudge() -> String:
	if _nudge_dismissed_for_step == tutorial_step:
		return ""
	match tutorial_step:
		STEP_HARVEST_BIOMASS:
			return "Right-click bare ground → Build Storage Shed (and right-click a wild plant → Chop-and-drop for biomass)."
		STEP_FEED_COMPOST:
			return "Right-click the compost pile to feed it your biomass."
		STEP_SCOOP_COMPOST:
			return "Wait for the pile to finish cooking. Then scoop it for enriched soil."
		STEP_BUILD_STORAGE:
			return "You need storage. Right-click bare ground → Build Storage Shed."
		STEP_BUILD_SPROUTING:
			return "Sprout seeds fast: right-click ground → Build Sprouting Bed."
		STEP_OPEN_CATALOG:
			return ""
	return ""


func dismiss_current_nudge() -> void:
	_nudge_dismissed_for_step = tutorial_step
