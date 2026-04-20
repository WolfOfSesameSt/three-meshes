## Fairy Permaculture — headless replayability simulation.
##
## Verifies the three replayability autoloads:
##   1. WorldSeed — same seed produces the same sub-channel rolls.
##   2. RandomEvents — catalogue loads (>= 25 entries), a manual trigger
##      emits event_triggered and increments events_fired_total.
##   3. Achievements — catalogue loads (>= 30 entries); report_threshold
##      unlocks bronze-soil; report_signal unlocks seed-shared;
##      event-forward unlocks the chanterelle-wild entry.
##
## Writes a trace + PASS/FAIL to logs/replayability-sim.log.
extends Node

const LOG_PATH := "res://logs/replayability-sim.log"

var _log_file: FileAccess
var _captured_event_id: String = ""
var _captured_achievement_ids: Array[String] = []


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(
		ProjectSettings.globalize_path("res://logs")
	)
	_log_file = FileAccess.open(LOG_PATH, FileAccess.WRITE)
	_log("=== replayability-sim started ===")
	call_deferred("_run")


func _run() -> void:
	var errors: int = 0

	# ----- 1. WorldSeed determinism --------------------------------------
	WorldSeed.set_seed(42)
	var rng_a: RandomNumberGenerator = WorldSeed.get_channel_rng("plant_scatter")
	var roll_a1: float = rng_a.randf()
	var roll_a2: float = rng_a.randf()

	WorldSeed.set_seed(42)
	var rng_b: RandomNumberGenerator = WorldSeed.get_channel_rng("plant_scatter")
	var roll_b1: float = rng_b.randf()
	var roll_b2: float = rng_b.randf()

	if abs(roll_a1 - roll_b1) > 0.0001 or abs(roll_a2 - roll_b2) > 0.0001:
		_log("FAIL: seed 42 not deterministic (%.4f,%.4f vs %.4f,%.4f)" % [
			roll_a1, roll_a2, roll_b1, roll_b2,
		])
		errors += 1
	else:
		_log("PASS: seed 42 deterministic (%.4f, %.4f)" % [roll_a1, roll_a2])

	# Different seed produces different rolls.
	WorldSeed.set_seed(9001)
	var rng_c: RandomNumberGenerator = WorldSeed.get_channel_rng("plant_scatter")
	var roll_c1: float = rng_c.randf()
	if abs(roll_c1 - roll_a1) < 0.0001:
		_log("FAIL: seed 9001 collided with seed 42's plant_scatter roll")
		errors += 1
	else:
		_log("PASS: seed 9001 differs from seed 42 (%.4f vs %.4f)" % [roll_c1, roll_a1])

	# Share code round-trip.
	var code: String = WorldSeed.share_code("bc-coastal", "challenge-drought")
	var parsed: Dictionary = WorldSeed.parse_share_code(code)
	if parsed.get("seed") != 9001 or String(parsed.get("challenge", "")) != "challenge-drought":
		_log("FAIL: share_code round-trip broken (%s -> %s)" % [code, parsed])
		errors += 1
	else:
		_log("PASS: share_code round-trip (%s)" % code)

	# ----- 2. RandomEvents catalogue + trigger ---------------------------
	if RandomEvents.catalogue_size() < 25:
		_log("FAIL: random_events catalogue has %d entries (< 25)" % RandomEvents.catalogue_size())
		errors += 1
	else:
		_log("PASS: random_events catalogue = %d entries" % RandomEvents.catalogue_size())

	RandomEvents.event_triggered.connect(_capture_event)
	var ok: bool = RandomEvents.trigger_by_id("windfall-apples")
	await get_tree().process_frame
	if not ok or _captured_event_id != "windfall-apples":
		_log("FAIL: manual trigger of windfall-apples did not fire (ok=%s, captured=%s)" % [ok, _captured_event_id])
		errors += 1
	else:
		_log("PASS: manual trigger windfall-apples -> event_triggered signal received")

	if RandomEvents.events_fired_total < 1:
		_log("FAIL: events_fired_total still 0 after trigger")
		errors += 1

	# ----- 3. Achievements catalogue + unlock ----------------------------
	if Achievements.total_count() < 30:
		_log("FAIL: achievements catalogue has %d entries (< 30)" % Achievements.total_count())
		errors += 1
	else:
		_log("PASS: achievements catalogue = %d entries" % Achievements.total_count())

	Achievements.achievement_unlocked.connect(_capture_achievement)

	# Threshold unlock — bronze-soil (om_pct >= 3.0).
	var before_unlocked: int = Achievements.unlocked_count()
	Achievements.report_threshold("max_om_pct", 3.5)
	await get_tree().process_frame
	if not Achievements.is_unlocked("bronze-soil"):
		_log("FAIL: bronze-soil not unlocked after reporting max_om_pct=3.5")
		errors += 1
	else:
		_log("PASS: bronze-soil unlocked via threshold")

	# Signal unlock — seed-shared.
	Achievements.report_signal("seed_share_copied")
	if not Achievements.is_unlocked("seed-shared"):
		_log("FAIL: seed-shared not unlocked via report_signal")
		errors += 1
	else:
		_log("PASS: seed-shared unlocked via report_signal")

	# Event-forward unlock — chanterelle-wild listens for event_fired:chanterelle-sprout.
	RandomEvents.trigger_by_id("chanterelle-sprout")
	await get_tree().process_frame
	if not Achievements.is_unlocked("chanterelle-wild"):
		_log("FAIL: chanterelle-wild not unlocked via event forward")
		errors += 1
	else:
		_log("PASS: chanterelle-wild unlocked via random-event forward")

	if Achievements.unlocked_count() - before_unlocked < 3:
		_log("FAIL: expected >=3 new unlocks in sim (got %d)" % (Achievements.unlocked_count() - before_unlocked))
		errors += 1
	else:
		_log("PASS: %d new achievements unlocked" % (Achievements.unlocked_count() - before_unlocked))

	if errors == 0:
		_log("PASS - replayability autoloads behave end-to-end.")
	else:
		_log("FAIL - %d assertion(s) failed" % errors)
	_log_file.flush()
	get_tree().quit(0 if errors == 0 else 1)


func _capture_event(id: String, _payload: Dictionary) -> void:
	_captured_event_id = id


func _capture_achievement(id: String) -> void:
	_captured_achievement_ids.append(id)


func _log(s: String) -> void:
	print(s)
	if _log_file != null:
		_log_file.store_line(s)
		_log_file.flush()
