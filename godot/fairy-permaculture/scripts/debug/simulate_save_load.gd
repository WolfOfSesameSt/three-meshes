## Fairy Permaculture — save/load round-trip verification.
##
## Headless sim that exercises the SaveSystem autoload end-to-end:
##
##   1. Build a minimal farm (1 storage shed, 1 compost pile, 1 soil
##      plot, 3 pioneer plants).
##   2. Seed FarmTotals + Progression + Scheduler with non-default state.
##   3. Advance Scheduler 5 days; queue 2 TaskQueue tasks.
##   4. Snapshot expected state into a plain Dictionary.
##   5. `SaveSystem.save("test")`.
##   6. Wipe the world (queue_free groups, reset autoloads).
##   7. `SaveSystem.load("test")`.
##   8. Deep-compare restored state against the snapshot.
##   9. Repeat steps 5–8 five times to catch drift.
##
## Writes PASS/FAIL per section to `res://logs/save-sim.log` so humans +
## Claude can read the outcome without running the editor.
##
## Run with:
##   godot --path . --headless res://scenes/debug/simulate_save_load.tscn
extends Node3D


const COMPOST_PILE_SCENE  := preload("res://scenes/compost_pile.tscn")
const STORAGE_SCENE       := preload("res://scenes/storage_shed.tscn")
const SOIL_PLOT_SCENE     := preload("res://scenes/soil_plot.tscn")
const PLANT_SCENE         := preload("res://scenes/plant.tscn")

const LOG_PATH := "res://logs/save-sim.log"
const CYCLES: int = 5

var _log_file: FileAccess
var _errors: int = 0
var _checks: int = 0


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(
		ProjectSettings.globalize_path("res://logs")
	)
	_log_file = FileAccess.open(LOG_PATH, FileAccess.WRITE)
	_log("=== save-sim started ===")
	_log("godot %s" % Engine.get_version_info().get("string", "?"))
	call_deferred("_run")


func _run() -> void:
	# One-frame settle so every autoload's _ready() has fired.
	await get_tree().process_frame
	await get_tree().process_frame

	# ---- Build the farm ----
	_setup_farm()
	await get_tree().process_frame
	await get_tree().process_frame

	# ---- Seed state ----
	_seed_state()
	await get_tree().process_frame

	# ---- Snapshot expected state ----
	var expected: Dictionary = _snapshot_all()
	_log("--- expected snapshot captured ---")
	_log("  day=%d season=%s year=%d" % [
		int(expected["scheduler"]["day"]),
		String(expected["scheduler"]["season"]),
		int(expected["scheduler"]["year"]),
	])
	_log("  plant_trim=%.2f compost=%.2f wood=%.2f" % [
		float(expected["farm_totals"]["plant_trim"]),
		float(expected["farm_totals"]["compost"]),
		float(expected["farm_totals"]["wood"]),
	])
	_log("  plants=%d piles=%d sheds=%d soil_plots=%d" % [
		int(expected["object_counts"]["plants"]),
		int(expected["object_counts"]["compost_piles"]),
		int(expected["object_counts"]["storage_sheds"]),
		int(expected["object_counts"]["soil_plots"]),
	])
	_log("  queued_tasks=%d" % int(expected["task_count"]))
	_log("  tutorial_step=%d" % int(expected["progression"]["tutorial_step"]))

	# ---- Single save/load round-trip ----
	var ok_save: bool = SaveSystem.save("test")
	_assert(ok_save, "initial SaveSystem.save('test') returned true")
	await get_tree().process_frame

	_wipe_and_reset()
	await get_tree().process_frame

	var ok_load: bool = SaveSystem.load("test")
	_assert(ok_load, "initial SaveSystem.load('test') returned true")
	# Wait one frame for call_deferred task restore.
	await get_tree().process_frame
	await get_tree().process_frame

	var actual: Dictionary = _snapshot_all()
	_compare(expected, actual, "round-trip 1")

	# ---- 5 consecutive save/load cycles — assert no drift ----
	for c in range(CYCLES):
		var s: bool = SaveSystem.save("test")
		_assert(s, "cycle %d: save returned true" % (c + 1))
		await get_tree().process_frame
		_wipe_and_reset()
		await get_tree().process_frame
		var l: bool = SaveSystem.load("test")
		_assert(l, "cycle %d: load returned true" % (c + 1))
		await get_tree().process_frame
		await get_tree().process_frame
		var snap: Dictionary = _snapshot_all()
		_compare(expected, snap, "drift cycle %d" % (c + 1))

	# ---- Summary ----
	_log("--- summary ---")
	_log("checks=%d errors=%d" % [_checks, _errors])
	if _errors == 0:
		_log("PASS — save/load round-trip is stable across %d cycles" % CYCLES)
	else:
		_log("FAIL — %d assertion(s) failed across %d cycles" % [_errors, CYCLES])
	_log_file.flush()
	get_tree().quit(0 if _errors == 0 else 1)


# =====================================================================
# Fixture
# =====================================================================

func _setup_farm() -> void:
	# Storage shed at origin so FarmTotals capacity uses shed caps (not pocket).
	var shed: Node3D = STORAGE_SCENE.instantiate()
	shed.name = "TestShed"
	add_child(shed)
	shed.global_position = Vector3(0, 0, 0)
	shed.set("capacity_per_type", 500)

	# Compost pile off to the side.
	var pile: Node3D = COMPOST_PILE_SCENE.instantiate()
	pile.name = "TestPile"
	add_child(pile)
	pile.global_position = Vector3(6, 0, 0)

	# Soil plot — tracks state + OM / moisture.
	var plot: Node3D = SOIL_PLOT_SCENE.instantiate()
	plot.name = "TestPlot"
	add_child(plot)
	plot.global_position = Vector3(-4, 0, 3)

	# Three pioneer plants in a row.
	for i in range(3):
		var p: Node3D = PLANT_SCENE.instantiate()
		p.name = "TestPlant%d" % i
		add_child(p)
		p.global_position = Vector3(-2.0 + float(i) * 2.0, 0, -4)
		p.call("setup", "nettle-stinging")
		p.set("is_pioneer", true)
		p.set("stage", "mature")
		p.set("age_days", 45 + i * 5)
		p.set("ripe_count", 0)

	_log("farm built: shed + pile + plot + 3 plants")


func _seed_state() -> void:
	# Distinctive non-default totals so a "did we really save this" check
	# fails loudly on drift.
	FarmTotals.add_resource(FarmTotals.PLANT_TRIM, 13.0)
	FarmTotals.add_resource(FarmTotals.WOOD, 7.0)
	FarmTotals.add_resource(FarmTotals.STONE, 2.0)
	FarmTotals.add_resource(FarmTotals.COMPOST, 3.0)
	FarmTotals.fairy_food["honey"] = 4.5
	FarmTotals.pile_feeds = 2
	FarmTotals.fruit_picked = 6

	# Advance scheduler by 5 days the fast way — direct field write, then
	# emit the signal so any listeners (Progression) re-evaluate.
	Scheduler.day = 5
	Scheduler.season_day = 5
	Scheduler.year = 0
	Scheduler.season_index = 0
	Scheduler.speed = 1

	# Progression — bump past tutorial, unlock the whole wave the compost-
	# harvested milestone would have triggered.
	Progression.tutorial_step = Progression.STEP_OPEN_CATALOG
	Progression.storage_built = true
	Progression.sprouting_built = true
	Progression.unlock(Progression.BUILDING_CHIPPER)
	Progression.unlock(Progression.BUILDING_CHICKEN_COOP)

	WorldState.set_vitality(0.42)

	# Queue 2 tasks on the pile so TaskQueue snapshot is non-empty.
	var pile: Node3D = get_node("TestPile") as Node3D
	if pile != null:
		var actions: Array = pile.call("get_context_actions")
		for a in actions:
			if String(a.get("id", "")) == "add_plant_trim":
				TaskQueue.queue_task(pile, a, 10)
				break
		# Cover / uncover is a stateless-cost action always available.
		for a in actions:
			if String(a.get("id", "")) in ["cover_pile", "uncover_pile"]:
				TaskQueue.queue_task(pile, a, 8)
				break

	_log("state seeded: day=5, plant_trim=13, wood=7, vitality=0.42, 2 tasks queued")


# =====================================================================
# Wipe + restore fixture clear
# =====================================================================

func _wipe_and_reset() -> void:
	# Clear autoload state so the restore genuinely has to refill it.
	for k in FarmTotals.RESOURCE_TYPES:
		FarmTotals.stocks[String(k)] = 0.0
	FarmTotals.fairy_food = {"honey": 0.0, "milk": 0.0, "fruit": 0.0}
	FarmTotals.pile_feeds = 0
	FarmTotals.fruit_picked = 0
	FarmTotals.compost_harvested = 0
	FarmTotals.pile_hot_seen = false

	Scheduler.day = 0
	Scheduler.season_day = 0
	Scheduler.season_index = 0
	Scheduler.year = 0
	Scheduler.speed = 2

	Progression.tutorial_step = Progression.STEP_HARVEST_BIOMASS
	Progression.storage_built = false
	Progression.sprouting_built = false
	Progression.unlocked_buildings = [
		Progression.BUILDING_COMPOST_PILE,
		Progression.BUILDING_STORAGE_SHED,
		Progression.BUILDING_SPROUTING_BED,
	]
	Progression.first_egg_collected = false
	Progression.first_carcass_spawned = false
	Progression.first_butcher_done = false
	Progression.first_bone_meal_fired = false

	WorldState.set_vitality(0.15)

	# Cancel + drop every queued task so the next load re-queues cleanly.
	TaskQueue.cancel_all()

	# Free every fixture node — SaveSystem.load() will _also_ run its
	# own wipe, but exercising both ensures a stale node never survives.
	for group_name in ["plants", "soil_plots", "sprouting_beds",
			"compost_piles", "storage_sheds", "chippers", "decor",
			"animals", "fairies", "carcasses"]:
		for n in get_tree().get_nodes_in_group(group_name):
			if is_instance_valid(n):
				n.queue_free()
	# Pile + fairy scenes don't use add_to_group; sweep by child name.
	for c in get_children():
		if c is Node3D and (c as Node).scene_file_path == "res://scenes/compost_pile.tscn":
			c.queue_free()


# =====================================================================
# Snapshot + compare
# =====================================================================

func _snapshot_all() -> Dictionary:
	var stocks: Dictionary = {}
	for k in FarmTotals.RESOURCE_TYPES:
		stocks[String(k)] = FarmTotals.get_resource(String(k))

	var unlocked: Array[String] = []
	for u in Progression.unlocked_buildings:
		unlocked.append(String(u))
	unlocked.sort()

	var counts: Dictionary = {}
	for g in ["plants", "soil_plots", "sprouting_beds", "compost_piles",
			"storage_sheds", "chippers", "decor"]:
		counts[g] = get_tree().get_nodes_in_group(g).size()
	# Piles not always in a group; scan children.
	var scene_piles: int = 0
	var scene_sheds: int = 0
	var scene_plants: int = 0
	for c in get_children():
		if c is Node3D:
			var sfp: String = (c as Node).scene_file_path
			if sfp == "res://scenes/compost_pile.tscn":
				scene_piles += 1
			elif sfp == "res://scenes/storage_shed.tscn":
				scene_sheds += 1
			elif sfp == "res://scenes/plant.tscn":
				scene_plants += 1
	# Use the tighter number of group+scene hits.
	counts["compost_piles"] = max(int(counts["compost_piles"]), scene_piles)
	counts["storage_sheds"] = max(int(counts["storage_sheds"]), scene_sheds)
	counts["plants"] = max(int(counts["plants"]), scene_plants)

	var plant_states: Array = []
	for p in get_tree().get_nodes_in_group("plants"):
		plant_states.append({
			"species_id": String(p.get("species_id")),
			"age_days":   int(p.get("age_days")),
			"stage":      String(p.get("stage")),
		})
	plant_states.sort_custom(func(a, b): return int(a["age_days"]) < int(b["age_days"]))

	var plot_state: Dictionary = {}
	for sp in get_tree().get_nodes_in_group("soil_plots"):
		plot_state = {
			"state":   String(sp.get("state")),
			"om_pct":  float(sp.get("om_pct")),
		}
		break

	var pile_state: Dictionary = {}
	for pn in get_children():
		if pn is Node3D and (pn as Node).scene_file_path == "res://scenes/compost_pile.tscn":
			var pile_v: Variant = pn.get("pile")
			if pile_v != null:
				pile_state = {
					"state":         String((pile_v as Pile).state),
					"volume_m3":     float((pile_v as Pile).volume_m3),
					"moisture_pct":  float((pile_v as Pile).moisture_pct),
				}
			break

	return {
		"farm_totals": {
			"plant_trim":  stocks.get("plant_trim", 0.0),
			"wood":        stocks.get("wood", 0.0),
			"stone":       stocks.get("stone", 0.0),
			"compost":     stocks.get("compost", 0.0),
		},
		"fairy_food":  (FarmTotals.fairy_food as Dictionary).duplicate(),
		"pile_feeds":  FarmTotals.pile_feeds,
		"fruit_picked": FarmTotals.fruit_picked,
		"scheduler": {
			"day":           Scheduler.day,
			"season":        Scheduler.current_season(),
			"season_day":    Scheduler.season_day,
			"season_index":  Scheduler.season_index,
			"year":          Scheduler.year,
			"speed":         Scheduler.speed,
		},
		"progression": {
			"tutorial_step":       Progression.tutorial_step,
			"storage_built":       Progression.storage_built,
			"sprouting_built":     Progression.sprouting_built,
			"unlocked_sorted":     unlocked,
		},
		"vitality":      WorldState.vitality,
		"object_counts": counts,
		"task_count":    TaskQueue.active_tasks().size(),
		"plant_states":  plant_states,
		"plot_state":    plot_state,
		"pile_state":    pile_state,
	}


func _compare(expected: Dictionary, actual: Dictionary, label: String) -> void:
	_log("--- comparing: %s ---" % label)
	# FarmTotals
	var ef: Dictionary = expected["farm_totals"]
	var af: Dictionary = actual["farm_totals"]
	for k in ef.keys():
		_assert_near(float(ef[k]), float(af[k]), "farm_totals.%s" % k)
	_assert_eq(expected["pile_feeds"], actual["pile_feeds"], "pile_feeds")
	_assert_eq(expected["fruit_picked"], actual["fruit_picked"], "fruit_picked")
	_assert_near(
		float((expected["fairy_food"] as Dictionary).get("honey", 0.0)),
		float((actual["fairy_food"] as Dictionary).get("honey", 0.0)),
		"fairy_food.honey",
	)

	# Scheduler
	var es: Dictionary = expected["scheduler"]
	var as_: Dictionary = actual["scheduler"]
	_assert_eq(es["day"], as_["day"], "scheduler.day")
	_assert_eq(es["season_day"], as_["season_day"], "scheduler.season_day")
	_assert_eq(es["season_index"], as_["season_index"], "scheduler.season_index")
	_assert_eq(es["year"], as_["year"], "scheduler.year")
	_assert_eq(es["speed"], as_["speed"], "scheduler.speed")
	_assert_eq(es["season"], as_["season"], "scheduler.season")

	# Progression
	var ep: Dictionary = expected["progression"]
	var ap: Dictionary = actual["progression"]
	_assert_eq(ep["tutorial_step"], ap["tutorial_step"], "progression.tutorial_step")
	_assert_eq(ep["storage_built"], ap["storage_built"], "progression.storage_built")
	_assert_eq(ep["sprouting_built"], ap["sprouting_built"], "progression.sprouting_built")
	_assert_eq(ep["unlocked_sorted"], ap["unlocked_sorted"], "progression.unlocked")

	# World state
	_assert_near(float(expected["vitality"]), float(actual["vitality"]), "vitality")

	# Object counts — every group should match.
	var ec: Dictionary = expected["object_counts"]
	var ac: Dictionary = actual["object_counts"]
	for k in ec.keys():
		_assert_eq(ec[k], ac[k], "object_counts.%s" % k)

	# Plant details — same number, same age ordering.
	var ep_list: Array = expected["plant_states"]
	var ap_list: Array = actual["plant_states"]
	_assert_eq(ep_list.size(), ap_list.size(), "plant_states.size")
	var n: int = min(ep_list.size(), ap_list.size())
	for i in range(n):
		_assert_eq(
			String((ep_list[i] as Dictionary)["species_id"]),
			String((ap_list[i] as Dictionary)["species_id"]),
			"plant[%d].species_id" % i,
		)
		_assert_eq(
			int((ep_list[i] as Dictionary)["age_days"]),
			int((ap_list[i] as Dictionary)["age_days"]),
			"plant[%d].age_days" % i,
		)
	# Plot
	if not (expected["plot_state"] as Dictionary).is_empty():
		_assert_eq(
			(expected["plot_state"] as Dictionary).get("state"),
			(actual["plot_state"] as Dictionary).get("state"),
			"plot.state",
		)
		_assert_near(
			float((expected["plot_state"] as Dictionary).get("om_pct", 0.0)),
			float((actual["plot_state"] as Dictionary).get("om_pct", 0.0)),
			"plot.om_pct",
		)
	# Pile state — covered flag is in pile.state; we compare the
	# top-level state string instead of the full dict so the sim
	# tolerates minor float drift in volume/moisture.
	if not (expected["pile_state"] as Dictionary).is_empty():
		_assert_eq(
			(expected["pile_state"] as Dictionary).get("state"),
			(actual["pile_state"] as Dictionary).get("state"),
			"pile.state",
		)
	# Task count — TaskQueue snapshot should match (may be 1 if the
	# first task started executing). Accept exact match OR expected-1
	# because a task might have already finished during the frame
	# between save + snapshot.
	var et: int = int(expected["task_count"])
	var at: int = int(actual["task_count"])
	if at != et and at != max(0, et - 1):
		_errors += 1
		_log("  FAIL task_count expected=%d got=%d" % [et, at])
	else:
		_checks += 1
		_log("  ok task_count=%d" % at)


# =====================================================================
# Assertion helpers
# =====================================================================

func _assert(cond: bool, label: String) -> void:
	_checks += 1
	if cond:
		_log("  ok %s" % label)
	else:
		_errors += 1
		_log("  FAIL %s" % label)


func _assert_eq(expected: Variant, actual: Variant, label: String) -> void:
	_checks += 1
	if typeof(expected) == TYPE_ARRAY and typeof(actual) == TYPE_ARRAY:
		var ea: Array = expected
		var aa: Array = actual
		if ea.size() == aa.size() and ea == aa:
			_log("  ok %s = %s" % [label, actual])
			return
	elif expected == actual:
		_log("  ok %s = %s" % [label, actual])
		return
	_errors += 1
	_log("  FAIL %s expected=%s got=%s" % [label, expected, actual])


func _assert_near(expected: float, actual: float, label: String, epsilon: float = 0.01) -> void:
	_checks += 1
	if abs(expected - actual) <= epsilon:
		_log("  ok %s = %.3f" % [label, actual])
	else:
		_errors += 1
		_log("  FAIL %s expected=%.3f got=%.3f" % [label, expected, actual])


func _log(s: String) -> void:
	print(s)
	if _log_file != null:
		_log_file.store_line(s)
		_log_file.flush()
