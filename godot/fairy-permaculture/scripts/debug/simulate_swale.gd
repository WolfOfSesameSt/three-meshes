## Fairy Permaculture — headless swale earthwork simulation.
##
## Exercises the Earthworks autoload end-to-end without the full scene:
##   1. Spawn the terrain (WorldGrid autoload) and wait one frame.
##   2. Query `has_slope_at(pos)` at 3 points and assert that at least
##      two resolve as sloped (terrain has a NW → SE gradient; picks
##      should hit it).
##   3. Call `add_swale_at(valid_point)` on a sloped tile and assert
##      the record contains >=3 trench tiles + >=2 berm tiles.
##   4. Tick 30 days. On day 10 force a storm via WeatherSystem (rain
##      proxy). Assert:
##      • trench accumulated >= WET_THRESHOLD_CM at some point
##      • at least one adjacent tile reports a non-zero bonus
##
## Writes the trace to logs/swale-sim.log. Exits 0 on PASS, 1 on FAIL.
extends Node3D


const LOG_PATH: String = "res://logs/swale-sim.log"


var _log_file: FileAccess
var _errors: int = 0


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(
		ProjectSettings.globalize_path("res://logs")
	)
	_log_file = FileAccess.open(LOG_PATH, FileAccess.WRITE)
	_log("=== swale-sim started ===")
	_log("godot %s" % Engine.get_version_info().get("string", "?"))
	call_deferred("_run")


func _run() -> void:
	await get_tree().process_frame
	await get_tree().process_frame

	_assert(has_node("/root/WorldGrid"), "WorldGrid autoload missing")
	_assert(has_node("/root/Earthworks"), "Earthworks autoload missing")

	# ------------------------------------------------------------------
	# Phase 1 — slope probing. We sample 3 world positions and log the
	# slope read. The NW → SE ramp gives most off-centre tiles >4° slope
	# once we leave the central homestead plateau.
	# ------------------------------------------------------------------
	var probes: Array[Vector3] = [
		Vector3(0, 0, 0),        # homestead centre — likely flat
		Vector3(-40, 0, -40),    # NW corner — steep
		Vector3(30, 0, 30),      # SE corner — steep
	]
	var sloped_hits: int = 0
	var sloped_points: Array[Vector3] = []
	for p in probes:
		var sloped: bool = Earthworks.has_slope_at(p)
		_log("has_slope_at%s = %s" % [p, sloped])
		if sloped:
			sloped_hits += 1
			sloped_points.append(p)
	if sloped_hits >= 2:
		_log("PASS phase 1: %d/3 probes returned sloped" % sloped_hits)
	else:
		_log("FAIL phase 1: expected >=2 sloped probes, got %d" % sloped_hits)
		_errors += 1

	# Pick a known-sloped probe for swale placement. Fall back to the
	# first probe if none returned true (defensive — still exercise the
	# registration path so we catch a regression in add_swale_at itself).
	var valid_point: Vector3 = sloped_points[0] if sloped_points.size() > 0 else probes[1]
	_log("picking swale centre: %s" % valid_point)

	# ------------------------------------------------------------------
	# Phase 2 — register the swale.
	# ------------------------------------------------------------------
	var before_count: int = Earthworks.swale_count()
	var record: Dictionary = Earthworks.add_swale_at(valid_point)
	var after_count: int = Earthworks.swale_count()
	_log("swale_count %d → %d" % [before_count, after_count])
	_log("swale record trench=%d berm=%d dir=%s" % [
		(record.get("trench", []) as Array).size(),
		(record.get("berm", []) as Array).size(),
		record.get("dir", Vector3.ZERO),
	])
	if (record.get("trench", []) as Array).size() >= 3:
		_log("PASS phase 2a: trench has 3+ tiles")
	else:
		_log("FAIL phase 2a: trench missing tiles")
		_errors += 1
	if (record.get("berm", []) as Array).size() >= 2:
		_log("PASS phase 2b: berm has 2+ tiles")
	else:
		_log("FAIL phase 2b: berm missing tiles")
		_errors += 1
	if after_count == before_count + 1:
		_log("PASS phase 2c: swale registered in autoload")
	else:
		_log("FAIL phase 2c: swale_count did not increment")
		_errors += 1

	# Confirm is_swale / is_berm positive reads.
	var trench0: Array = record.get("trench", [])
	if trench0.size() > 0:
		var tv: Vector2i = trench0[0]
		var wp: Vector3 = _tile_to_world(tv)
		if Earthworks.is_swale(wp):
			_log("PASS phase 2d: is_swale(trench_tile) = true")
		else:
			_log("FAIL phase 2d: is_swale misreporting trench tile")
			_errors += 1

	# ------------------------------------------------------------------
	# Phase 3 — 30 day-ticks with a forced storm on day 10.
	#
	# We don't run the Scheduler — the real day-tick loop is slow. We
	# drive Earthworks.tick_day() directly so the simulation completes
	# in a single frame. WeatherSystem.force_event activates `storm`
	# for the requested day count; the Earthworks day-tick then sees
	# rain-on and accumulates trench water.
	# ------------------------------------------------------------------
	var max_trench_water: float = 0.0
	var max_bonus: float = 0.0
	var any_bonus_tile: Vector2i = Vector2i(-1, -1)
	var ws: Node = null
	if has_node("/root/WeatherSystem"):
		ws = get_node("/root/WeatherSystem")
	for day in range(30):
		if day == 10 and ws != null and ws.has_method("force_event"):
			ws.call("force_event", "storm", 3, 1.0)
			_log("day %d: forced storm (3 days, sev=1.0)" % day)
		Earthworks.tick_day()
		# Probe the first trench tile for water + bonus.
		if trench0.size() > 0:
			var wp2: Vector3 = _tile_to_world(trench0[0])
			var w: float = Earthworks.trench_water_cm_at(wp2)
			max_trench_water = max(max_trench_water, w)
		# Probe a neighbor of the swale centre for adjacency bonus.
		for dx in range(-3, 4):
			for dz in range(-3, 4):
				var probe_world: Vector3 = valid_point + Vector3(float(dx), 0.0, float(dz))
				var b: float = Earthworks.adjacent_bonus_moisture(probe_world)
				if b > max_bonus:
					max_bonus = b
					any_bonus_tile = Vector2i(dx, dz)
	_log("after 30 days: max_trench_water=%.2f cm  max_bonus=%.3f at %s" % [
		max_trench_water, max_bonus, any_bonus_tile,
	])
	if max_trench_water >= Earthworks.WET_THRESHOLD_CM:
		_log("PASS phase 3a: trench accumulated water >= threshold")
	else:
		_log("FAIL phase 3a: trench never wet (%.2f < %.2f)" % [
			max_trench_water, Earthworks.WET_THRESHOLD_CM,
		])
		_errors += 1
	if max_bonus > 0.0:
		_log("PASS phase 3b: adjacency bonus accrued")
	else:
		_log("FAIL phase 3b: no adjacency bonus observed")
		_errors += 1

	# ------------------------------------------------------------------
	# Phase 4 — report.
	# ------------------------------------------------------------------
	if _errors == 0:
		_log("PASS — swale earthwork behaves end-to-end.")
	else:
		_log("FAIL — %d assertion(s) failed" % _errors)
	_log_file.flush()
	get_tree().quit(0 if _errors == 0 else 1)


func _tile_to_world(tv: Vector2i) -> Vector3:
	var tile_size: float = float(WorldGrid.TILE_SIZE_M)
	var half: float = float(WorldGrid.WORLD_HALF_M)
	return Vector3(float(tv.x) * tile_size - half, 0.0, float(tv.y) * tile_size - half)


func _assert(cond: bool, msg: String) -> void:
	if not cond:
		_log("FAIL: " + msg)
		_errors += 1


func _log(s: String) -> void:
	print(s)
	if _log_file != null:
		_log_file.store_line(s)
		_log_file.flush()
