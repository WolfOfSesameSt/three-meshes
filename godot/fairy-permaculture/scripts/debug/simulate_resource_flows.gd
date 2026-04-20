## Fairy Permaculture — headless resource-flow smoke test.
##
## Closes the resource-flow producer-orphan audit by verifying every new
## producer actually deposits into FarmTotals / fairy_food with paired
## feedback. Each flow is tested in isolation so a break in one doesn't
## mask a break in another.
##
## Covered flows:
##   1. windfall-apples event → FarmTotals.fruit + FarmTotals.fruit_scraps
##      + fairy_food.fruit  (via EventHandlers autoload)
##   2. mushroom-flush event → FarmTotals.wild_mushrooms
##   3. chipmunk-stash event → FarmTotals.seeds
##   4. Plant harvest_all co-yield → FarmTotals.fruit_scraps (0.2× fruit,
##      min 1) AND fairy_food.fruit populated from the primary yield
##   5. Plant ripe→rot→scrap path — simulate ROT_DROP_DAYS game-days
##      with ripe cluster, assert scraps deposited, assert _overripe
##      flag flipped at ROT_DELAY_DAYS
##   6. MasonBeeTubes honey trickle — tubes announce arrival, then
##      fairy_food.honey ticks on each day_advanced call
##
## Writes PASS/FAIL to logs/resource-flows-sim.log.
##
## Run with:
##   godot --path . --headless res://scenes/debug/simulate_resource_flows.tscn \
##     --quit-after 30
extends Node

const LOG_PATH := "res://logs/resource-flows-sim.log"

var _log_file: FileAccess
var _errors: int = 0


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(
		ProjectSettings.globalize_path("res://logs")
	)
	_log_file = FileAccess.open(LOG_PATH, FileAccess.WRITE)
	_log("=== resource-flows-sim started ===")
	call_deferred("_run")


func _run() -> void:
	await get_tree().process_frame
	await get_tree().process_frame

	_test_windfall_apples()
	_test_mushroom_flush()
	_test_chipmunk_stash()
	_test_harvest_co_yield()
	_test_rot_drop()
	_test_mason_bee_honey_trickle()

	_log("=== resource-flows-sim done (errors=%d) ===" % _errors)
	if _log_file:
		_log_file.close()
	get_tree().quit(0 if _errors == 0 else 1)


# ----- Tests --------------------------------------------------------------

func _test_windfall_apples() -> void:
	_reset_totals()
	var before_fruit: float = FarmTotals.get_resource(FarmTotals.FRUIT)
	var before_scraps: float = FarmTotals.get_resource(FarmTotals.FRUIT_SCRAPS)
	var before_food_fruit: float = float(FarmTotals.fairy_food["fruit"])
	var ok: bool = RandomEvents.trigger_by_id("windfall-apples")
	await get_tree().process_frame
	var after_fruit: float = FarmTotals.get_resource(FarmTotals.FRUIT)
	var after_scraps: float = FarmTotals.get_resource(FarmTotals.FRUIT_SCRAPS)
	var after_food_fruit: float = float(FarmTotals.fairy_food["fruit"])
	var df: float = after_fruit - before_fruit
	var ds: float = after_scraps - before_scraps
	var dfood: float = after_food_fruit - before_food_fruit
	if not ok:
		_fail("windfall-apples: trigger_by_id returned false")
		return
	if df <= 0.0 or ds <= 0.0:
		_fail("windfall-apples: expected +fruit and +fruit_scraps, got df=%.2f ds=%.2f" % [df, ds])
		return
	if dfood <= 0.0:
		_fail("windfall-apples: fairy_food.fruit did not increase (dfood=%.2f)" % dfood)
		return
	_pass("windfall-apples deposited: fruit=+%.2f scraps=+%.2f food_fruit=+%.2f" % [df, ds, dfood])


func _test_mushroom_flush() -> void:
	_reset_totals()
	var before: float = FarmTotals.get_resource(FarmTotals.WILD_MUSHROOMS)
	RandomEvents.trigger_by_id("mushroom-flush")
	await get_tree().process_frame
	var after: float = FarmTotals.get_resource(FarmTotals.WILD_MUSHROOMS)
	if after - before <= 0.0:
		_fail("mushroom-flush: no wild_mushrooms deposited (delta=%.2f)" % (after - before))
		return
	_pass("mushroom-flush deposited wild_mushrooms=+%.2f" % (after - before))


func _test_chipmunk_stash() -> void:
	_reset_totals()
	var before: float = FarmTotals.get_resource(FarmTotals.SEEDS)
	RandomEvents.trigger_by_id("chipmunk-stash")
	await get_tree().process_frame
	var after: float = FarmTotals.get_resource(FarmTotals.SEEDS)
	if after - before <= 0.0:
		_fail("chipmunk-stash: no seeds deposited (delta=%.2f)" % (after - before))
		return
	_pass("chipmunk-stash deposited seeds=+%.2f" % (after - before))


func _test_harvest_co_yield() -> void:
	# Spawn a fruiting plant, run get_context_actions, assert the
	# harvest_all action has a fruit_scraps co-yield.
	var PlantScene: PackedScene = load("res://scenes/plant.tscn")
	if PlantScene == null:
		_fail("harvest-co-yield: plant.tscn missing")
		return
	var plant: Node3D = PlantScene.instantiate()
	add_child(plant)
	plant.setup("salmonberry")  # fruit-bearing species
	plant.global_position = Vector3(5, 0, 5)
	plant.ripe_count = 5
	plant.ripe_amount = 5.0
	plant.growth_stage = VisualState.STAGE_HARVEST_READY
	await get_tree().process_frame
	var actions: Array = plant.get_context_actions()
	var harvest_all: Dictionary = {}
	for a in actions:
		if String(a.get("id", "")) == "harvest_all":
			harvest_all = a
			break
	if harvest_all.is_empty():
		_fail("harvest-co-yield: no harvest_all action returned")
		plant.queue_free()
		return
	var y: Dictionary = harvest_all.get("yield", {})
	if not y.has("fruit_scraps") or float(y["fruit_scraps"]) <= 0.0:
		_fail("harvest-co-yield: harvest_all yield missing fruit_scraps (yield=%s)" % str(y))
		plant.queue_free()
		return
	# 5 fruit × 0.2 = 1 scrap minimum.
	var expected_scraps: int = max(1, int(ceil(5.0 * 0.2)))
	if int(y["fruit_scraps"]) != expected_scraps:
		_fail("harvest-co-yield: expected %d scraps for 5 fruit, got %d" % [expected_scraps, int(y["fruit_scraps"])])
		plant.queue_free()
		return
	# Also verify complete() routes fruit → fairy_food.fruit.
	_reset_totals()
	var before: float = float(FarmTotals.fairy_food["fruit"])
	plant.complete(harvest_all)
	await get_tree().process_frame
	var after: float = float(FarmTotals.fairy_food["fruit"])
	if after - before < 5.0:
		_fail("harvest-co-yield: fairy_food.fruit did not receive +5 (delta=%.2f)" % (after - before))
		plant.queue_free()
		return
	_pass("harvest-co-yield: fruit=5 scraps=%d fairy_food.fruit+=%.1f" % [
		int(y["fruit_scraps"]), after - before,
	])
	plant.queue_free()


func _test_rot_drop() -> void:
	var PlantScene: PackedScene = load("res://scenes/plant.tscn")
	if PlantScene == null:
		_fail("rot-drop: plant.tscn missing")
		return
	var plant: Node3D = PlantScene.instantiate()
	add_child(plant)
	plant.setup("salmonberry")
	plant.global_position = Vector3(10, 0, 10)
	plant.ripe_count = 4
	plant.ripe_amount = 4.0
	plant.growth_stage = VisualState.STAGE_FRUITING
	await get_tree().process_frame
	_reset_totals()
	# Simulate ROT_DELAY_DAYS → _overripe should flip true.
	for d in range(0, 7):
		plant.call("_evaluate_rot", d)
	if not bool(plant.get("_overripe")):
		_fail("rot-drop: _overripe did not flip at day 7")
		plant.queue_free()
		return
	# Simulate to ROT_DROP_DAYS → scraps drop + ripe_count cleared.
	for d in range(7, 12):
		plant.call("_evaluate_rot", d)
	if int(plant.get("ripe_count")) != 0:
		_fail("rot-drop: ripe_count not cleared after rot drop (%d)" % int(plant.get("ripe_count")))
		plant.queue_free()
		return
	var scraps_after: float = FarmTotals.get_resource(FarmTotals.FRUIT_SCRAPS)
	if scraps_after <= 0.0:
		_fail("rot-drop: no fruit_scraps deposited after rot drop (stocks=%.2f)" % scraps_after)
		plant.queue_free()
		return
	_pass("rot-drop: overripe flipped day 7, scraps=+%.2f at day 12" % scraps_after)
	plant.queue_free()


func _test_mason_bee_honey_trickle() -> void:
	var TubesScene: PackedScene = load("res://scenes/mason_bee_tubes.tscn")
	if TubesScene == null:
		_fail("honey-trickle: mason_bee_tubes.tscn missing")
		return
	var tubes: Node3D = TubesScene.instantiate()
	add_child(tubes)
	tubes.global_position = Vector3(-10, 0, -10)
	await get_tree().process_frame
	# Force arrival state so the trickle gate opens.
	tubes.set("_arrival_announced", true)
	_reset_totals()
	var before: float = float(FarmTotals.fairy_food["honey"])
	# Call the day-advance handler directly — bypasses the Scheduler so
	# the test is synchronous.
	tubes.call("_on_day_advanced", 1, "summer", 1)
	tubes.call("_on_day_advanced", 2, "summer", 1)
	tubes.call("_on_day_advanced", 3, "summer", 1)
	await get_tree().process_frame
	var after: float = float(FarmTotals.fairy_food["honey"])
	if after - before <= 0.0:
		_fail("honey-trickle: fairy_food.honey did not rise after 3 days (delta=%.2f)" % (after - before))
		tubes.queue_free()
		return
	# Winter dormancy — no trickle.
	var winter_before: float = float(FarmTotals.fairy_food["honey"])
	tubes.call("_on_day_advanced", 4, "winter", 1)
	var winter_after: float = float(FarmTotals.fairy_food["honey"])
	if winter_after != winter_before:
		_fail("honey-trickle: honey rose in winter (should be dormant)")
		tubes.queue_free()
		return
	_pass("honey-trickle: +%.2f honey across 3 days, dormant in winter" % (after - before))
	tubes.queue_free()


# ----- helpers ------------------------------------------------------------

func _reset_totals() -> void:
	for k in FarmTotals.RESOURCE_TYPES:
		FarmTotals.stocks[String(k)] = 0.0
	FarmTotals.fairy_food = {"honey": 0.0, "milk": 0.0, "fruit": 0.0}
	FarmTotals.emit_signal("changed")


func _pass(msg: String) -> void:
	_log("PASS: " + msg)


func _fail(msg: String) -> void:
	_errors += 1
	_log("FAIL: " + msg)


func _log(msg: String) -> void:
	print(msg)
	if _log_file:
		_log_file.store_line(msg)
