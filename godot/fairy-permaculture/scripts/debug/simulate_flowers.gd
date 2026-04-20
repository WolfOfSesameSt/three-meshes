## Fairy Permaculture — headless flower system simulation.
##
## Asserts:
##   1. DataStore.flowers loaded ≥ 10 species.
##   2. WorldGrid seeded flower_species on > 500 meadow/bank/bare tiles.
##   3. Calling day_advanced with a spring season ramps flower_density on
##      spring-flower tiles to > 0 within a few ticks.
##   4. Summer season zeroes spring-only tiles and opens summer-only tiles.
##   5. tile_flora_at() returns > 0 density on a known flowering tile.
##   6. A hive placed over a force-bloomed meadow tile produces > honey
##      than its meadow-ambient fallback would.
##
## Writes PASS/FAIL to logs/flowers-sim.log.
extends Node

const LOG_PATH := "res://logs/flowers-sim.log"
const HiveScene: PackedScene = preload("res://scenes/hive.tscn")

var _log_file: FileAccess
var _errors: int = 0


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(
		ProjectSettings.globalize_path("res://logs")
	)
	_log_file = FileAccess.open(LOG_PATH, FileAccess.WRITE)
	_log("=== flowers-sim started ===")
	call_deferred("_run")


func _run() -> void:
	# ----- 1. DataStore loads flowers.json -----------------------------
	var ds: Node = get_node_or_null("/root/DataStore")
	if ds == null:
		_fail("no DataStore autoload")
		_finish()
		return
	var flowers: Array = ds.get("flowers")
	if flowers.size() >= 10:
		_pass("DataStore.flowers loaded %d species" % flowers.size())
	else:
		_fail("DataStore.flowers only loaded %d species (<10)" % flowers.size())

	# ----- 2. WorldGrid seeded flowers on many tiles -------------------
	var wg: Node = get_node_or_null("/root/WorldGrid")
	if wg == null:
		_fail("no WorldGrid autoload")
		_finish()
		return
	var tiles: Array = wg.get("tiles")
	var seeded_count: int = 0
	var spring_tiles: Array = []
	var summer_tiles: Array = []
	var grid_size: int = int(wg.get("GRID_SIZE"))
	for z in range(grid_size):
		var row: Array = tiles[z]
		for x in range(grid_size):
			var tile = row[x]
			if tile.flower_target_density > 0.0:
				seeded_count += 1
				# Bucket tiles by species season for assertions 3/4.
				var sid: String = tile.flower_species
				if sid != "":
					var def: Dictionary = {}
					for d in flowers:
						if d is Dictionary and String(d.get("id", "")) == sid:
							def = d
							break
					if def.has("season"):
						if "spring" in def["season"] and spring_tiles.size() < 20:
							spring_tiles.append([x, z, sid])
						if "summer" in def["season"] and summer_tiles.size() < 20:
							summer_tiles.append([x, z, sid])
	if seeded_count >= 500:
		_pass("%d tiles seeded with flower_target_density > 0" % seeded_count)
	else:
		_fail("only %d tiles seeded (<500)" % seeded_count)
	_log("  spring-sampled: %d, summer-sampled: %d" % [spring_tiles.size(), summer_tiles.size()])

	# ----- 3. Spring day-tick ramps density --------------------------
	# Run 10 consecutive spring day-ticks; all spring tiles should be > 0.
	for t in range(10):
		wg.call("_flower_day_tick", "spring")
	var spring_nonzero: int = 0
	for info in spring_tiles:
		var tile = tiles[info[1]][info[0]]
		if tile.flower_density > 0.05:
			spring_nonzero += 1
	if spring_tiles.size() == 0:
		_log("  (no spring tiles sampled — skipping assertion 3)")
	elif spring_nonzero >= int(spring_tiles.size() * 0.7):
		_pass("%d/%d spring tiles bloomed after 10 spring ticks" % [spring_nonzero, spring_tiles.size()])
	else:
		_fail("only %d/%d spring tiles bloomed after 10 ticks" % [spring_nonzero, spring_tiles.size()])

	# ----- 4. Summer swap — spring zeroes, summer opens ---------------
	for t in range(20):
		wg.call("_flower_day_tick", "summer")
	var spring_zero: int = 0
	for info in spring_tiles:
		var tile = tiles[info[1]][info[0]]
		if tile.flower_density < 0.05:
			spring_zero += 1
	var summer_nonzero: int = 0
	for info in summer_tiles:
		var tile = tiles[info[1]][info[0]]
		if tile.flower_density > 0.05:
			summer_nonzero += 1
	if spring_tiles.size() > 0:
		if spring_zero >= int(spring_tiles.size() * 0.6):
			_pass("%d/%d spring tiles faded to ~0 in summer" % [spring_zero, spring_tiles.size()])
		else:
			_fail("only %d/%d spring tiles faded in summer" % [spring_zero, spring_tiles.size()])
	if summer_tiles.size() > 0:
		if summer_nonzero >= int(summer_tiles.size() * 0.6):
			_pass("%d/%d summer tiles bloomed in summer" % [summer_nonzero, summer_tiles.size()])
		else:
			_fail("only %d/%d summer tiles bloomed in summer" % [summer_nonzero, summer_tiles.size()])

	# ----- 5. tile_flora_at reads density + species_id ---------------
	if summer_tiles.size() > 0:
		var info = summer_tiles[0]
		var tx: int = info[0]
		var tz: int = info[1]
		var world_pos: Vector3 = Vector3(
			tx * 1.0 - 64.0,  # WORLD_HALF_M is 64 for GRID_SIZE=128
			0.0,
			tz * 1.0 - 64.0,
		)
		var data: Dictionary = wg.call("tile_flora_at", world_pos, "summer")
		if float(data.get("density", 0.0)) > 0.0:
			_pass("tile_flora_at returned density %.3f species=%s" % [data["density"], data["species_id"]])
		else:
			_fail("tile_flora_at returned zero density on a known summer tile")

	# ----- 6. Hive over force-bloomed tile out-produces fallback ------
	var hive: Node3D = HiveScene.instantiate()
	add_child(hive)
	hive.global_position = Vector3(0.0, 0.0, 0.0)
	await get_tree().process_frame
	# Force-bloom a ring of high-density tiles around the hive for summer.
	for dx in range(-5, 6):
		for dz in range(-5, 6):
			wg.call("debug_force_bloom_at",
				Vector3(dx * 1.0, 0.0, dz * 1.0),
				"fireweed", 0.9)
	hive.call("_on_day_advanced", 50, "summer", 0)
	var forced_hpd: float = float(hive.get("honey_per_day"))
	if forced_hpd > 3.5:
		_pass("force-bloomed summer hive produced %.2f honey/day (> fallback 3.5)" % forced_hpd)
	else:
		_fail("force-bloomed summer hive only produced %.2f honey/day (fallback was 3.5)" % forced_hpd)

	_finish()


func _finish() -> void:
	if _errors == 0:
		_log("=== flowers-sim: ALL PASS ===")
	else:
		_log("=== flowers-sim: %d FAIL ===" % _errors)
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
