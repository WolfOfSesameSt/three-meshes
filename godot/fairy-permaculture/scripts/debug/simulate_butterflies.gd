## Fairy Permaculture — headless butterfly system simulation.
##
## Asserts:
##   1. Butterflies autoload exists at /root/Butterflies.
##   2. Default state is inactive.
##   3. Setting vitality > 0.6 + spring season activates butterflies next
##      day-tick and stamps first_butterfly_day in LifetimeStats.firsts.
##   4. Setting vitality to 0.2 + low species count deactivates.
##   5. first_butterfly_day stamp is stable — does not re-stamp on
##      reactivation.
##
## Writes PASS/FAIL to logs/butterflies-sim.log.
extends Node

const LOG_PATH := "res://logs/butterflies-sim.log"

var _log_file: FileAccess
var _errors: int = 0


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(
		ProjectSettings.globalize_path("res://logs")
	)
	_log_file = FileAccess.open(LOG_PATH, FileAccess.WRITE)
	_log("=== butterflies-sim started ===")
	call_deferred("_run")


func _run() -> void:
	# ----- 1. Autoload exists -----------------------------------------
	var bf: Node = get_node_or_null("/root/Butterflies")
	if bf == null:
		_fail("Butterflies autoload missing")
		_finish()
		return
	_pass("Butterflies autoload registered")

	# ----- 2. Default inactive ----------------------------------------
	# Run one evaluation first — no high vitality, no species yet.
	bf.call("_evaluate_activation")
	if not bool(bf.get("active")):
		_pass("default state inactive")
	else:
		_fail("default state was active")

	# ----- 3. High vitality activates --------------------------------
	# Set a spring season via Scheduler so season_ok passes.
	Scheduler.season_index = 0
	WorldState.set_vitality(0.8)
	# Clear any prior firsts that might be lingering from a previous test
	# pass so we can assert a fresh stamp.
	LifetimeStats.firsts.erase("first_butterfly_day")
	# Trigger day_advanced to fire _on_day_advanced.
	bf.call("_on_day_advanced", 1, "spring", 0)
	if bool(bf.get("active")):
		_pass("activated after vitality=0.8 + spring")
	else:
		_fail("did NOT activate on vitality=0.8 + spring")
	# Firsts stamp
	if LifetimeStats.firsts.has("first_butterfly_day"):
		_pass("first_butterfly_day stamped: %s" % str(LifetimeStats.firsts["first_butterfly_day"]))
	else:
		_fail("first_butterfly_day NOT stamped")

	# ----- 4. Low vitality deactivates -------------------------------
	WorldState.set_vitality(0.2)
	bf.call("_on_day_advanced", 2, "spring", 0)
	if not bool(bf.get("active")):
		_pass("deactivated after vitality=0.2")
	else:
		_fail("did NOT deactivate on vitality=0.2")

	# ----- 5. Reactivation does NOT re-stamp first_butterfly_day -----
	var original_stamp: Variant = LifetimeStats.firsts.get("first_butterfly_day", -1)
	WorldState.set_vitality(0.8)
	# Bump Scheduler.day so a "later day" re-activation would, if buggy,
	# re-stamp to a different value.
	Scheduler.day = 42
	bf.call("_on_day_advanced", 42, "spring", 0)
	var later_stamp: Variant = LifetimeStats.firsts.get("first_butterfly_day", -1)
	if str(original_stamp) == str(later_stamp):
		_pass("first_butterfly_day stable across reactivation: %s" % str(later_stamp))
	else:
		_fail("first_butterfly_day re-stamped (%s → %s)" % [str(original_stamp), str(later_stamp)])

	_finish()


func _finish() -> void:
	if _errors == 0:
		_log("=== butterflies-sim: ALL PASS ===")
	else:
		_log("=== butterflies-sim: %d FAIL ===" % _errors)
	if _log_file:
		_log_file.flush()
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
