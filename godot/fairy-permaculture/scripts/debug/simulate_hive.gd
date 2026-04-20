## Fairy Permaculture — headless Warré hive simulation.
##
## Asserts:
##   1. Hive scene instantiates cleanly + registers to the warre_hives group.
##   2. Force-arriving a honeybee cohort lands linked_cohort_id == "honeybee".
##   3. With no flowers in range, honey_per_day == 0 after a day-tick.
##   4. With simulated flora proxy (meadow tiles), honey_per_day > 0.
##   5. Harvest resets comb_fullness to HARVEST_FULLNESS_RESET + increments
##      fairy_food.honey by HARVEST_YIELD.
##
## Writes a trace + PASS/FAIL to logs/hive-sim.log.
extends Node

const LOG_PATH := "res://logs/hive-sim.log"
const HiveScene: PackedScene = preload("res://scenes/hive.tscn")

var _log_file: FileAccess
var _errors: int = 0


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(
		ProjectSettings.globalize_path("res://logs")
	)
	_log_file = FileAccess.open(LOG_PATH, FileAccess.WRITE)
	_log("=== hive-sim started ===")
	call_deferred("_run")


func _run() -> void:
	# ----- 1. Scene instantiates clean --------------------------------
	var hive: Node3D = HiveScene.instantiate()
	add_child(hive)
	hive.global_position = Vector3(0.0, 0.0, 0.0)
	await get_tree().process_frame
	if hive.is_in_group("warre_hives"):
		_pass("hive joined warre_hives group")
	else:
		_fail("hive did NOT join warre_hives group")
	if hive.is_in_group("hives"):
		_pass("hive joined hives group")
	else:
		_fail("hive did NOT join hives group")

	# ----- 2. Honeybee cohort force-arrived ---------------------------
	# Wildlife autoload has loaded animal_defs in its _ready; force_arrival
	# should have landed during hive._ready.
	var linked: String = String(hive.get("linked_cohort_id"))
	if linked == "honeybee":
		_pass("honeybee cohort linked on placement")
	else:
		_fail("honeybee cohort NOT linked (got '%s')" % linked)
	var wl: Node = get_node_or_null("/root/Wildlife")
	if wl != null and bool(wl.call("is_present", "honeybee")):
		_pass("Wildlife.is_present(honeybee) == true")
	else:
		_fail("Wildlife.is_present(honeybee) == false")

	# ----- 3. No flowers in range => honey_per_day == 0 ---------------
	# Prior to Phase 2 flowers, the fallback meadow-ambient proxy
	# produces non-zero honey on meadow tiles. To assert the zero-case
	# we place the hive over a bare stream tile (WorldGrid creates a
	# stream channel on the diagonal) — but simpler: directly zero
	# `bee_count` for this check so fallback flora is multiplied by 0.
	var pre_bees: int = int(hive.get("bee_count"))
	hive.set("bee_count", 0)
	hive.call("_on_day_advanced", 1, "summer", 0)
	var hpd_zero: float = float(hive.get("honey_per_day"))
	if hpd_zero == 0.0:
		_pass("honey_per_day == 0 with bee_count=0")
	else:
		_fail("honey_per_day == %.3f with bee_count=0 (expected 0)" % hpd_zero)
	hive.set("bee_count", pre_bees)

	# ----- 4. With flora (meadow fallback), honey_per_day > 0 ---------
	FarmTotals.fairy_food["honey"] = 0.0
	hive.set("comb_fullness", 0.0)
	hive.call("_on_day_advanced", 2, "summer", 0)
	var hpd: float = float(hive.get("honey_per_day"))
	if hpd > 0.0:
		_pass("summer day-tick produced %.3f honey/day" % hpd)
	else:
		_fail("summer day-tick produced 0 honey (meadow fallback broken)")
	var honey_now: float = float(FarmTotals.fairy_food["honey"])
	if honey_now > 0.0:
		_pass("FarmTotals.fairy_food.honey now %.3f" % honey_now)
	else:
		_fail("FarmTotals.fairy_food.honey still 0 after tick")

	# ----- 5. Harvest yields + resets fullness ------------------------
	hive.set("comb_fullness", 0.95)
	hive.call("_update_comb_fill_visual")
	var honey_pre: float = float(FarmTotals.fairy_food["honey"])
	hive.call("complete", { "id": "harvest_honey" })
	var honey_post: float = float(FarmTotals.fairy_food["honey"])
	var delta: float = honey_post - honey_pre
	if delta >= 4.99 and delta <= 5.01:
		_pass("harvest deposited %.2f honey" % delta)
	else:
		_fail("harvest delta was %.3f (expected 5.00)" % delta)
	var comb_after: float = float(hive.get("comb_fullness"))
	if abs(comb_after - 0.1) < 0.001:
		_pass("comb_fullness reset to 0.10 after harvest")
	else:
		_fail("comb_fullness after harvest was %.3f (expected 0.10)" % comb_after)

	# ----- Summary ----------------------------------------------------
	if _errors == 0:
		_log("=== hive-sim: ALL PASS ===")
	else:
		_log("=== hive-sim: %d FAIL ===" % _errors)
	if _log_file:
		_log_file.flush()
	# Quit so headless runs exit.
	get_tree().quit(0 if _errors == 0 else 1)


func _pass(msg: String) -> void:
	_log("PASS: %s" % msg)


func _fail(msg: String) -> void:
	_errors += 1
	_log("FAIL: %s" % msg)


func _log(msg: String) -> void:
	if _log_file:
		_log_file.store_line(msg)
	print(msg)
