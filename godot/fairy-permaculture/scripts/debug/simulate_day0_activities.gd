## Fairy Permaculture — headless day-0 activities simulation.
##
## Verifies the four parallel day-0 loops the Day-0 Activities Engineer
## added so the player always has something to do while the compost cook
## cycle runs. Each activity is invoked independently + inspected.
##
##   1. Harvest seeds from a flowering plant (plant.gd — "harvest_seeds")
##   2. Plant clover cover crop on an empty soil plot (soil_plot.gd —
##      "plant_clover")
##   3. Forage the understory of a mature tree (decor_item.gd —
##      "forage_understory")
##   4. Mason Bee Tubes buildable appears in Progression.available_buildings()
##
## Writes a readable trace to logs/day0-sim.log and exits 0 on pass /
## 1 on any assertion failure.
extends Node3D


const PLANT_SCENE := preload("res://scenes/plant.tscn")
const SOIL_PLOT_SCENE := preload("res://scenes/soil_plot.tscn")
const DECOR_ITEM_SCENE := preload("res://scenes/decor_item.tscn")
const FAIRY_SCENE := preload("res://scenes/fairy.tscn")
const STORAGE_SCENE := preload("res://scenes/storage_shed.tscn")
const MASON_BEE_TUBES_SCENE := preload("res://scenes/mason_bee_tubes.tscn")

const LOG_PATH := "res://logs/day0-sim.log"
const MAX_TICKS := 3600
const FRAME_DT := 1.0 / 60.0

var _log_file: FileAccess
var _fairies: Array[Node3D] = []


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(
		ProjectSettings.globalize_path("res://logs")
	)
	_log_file = FileAccess.open(LOG_PATH, FileAccess.WRITE)
	_log("=== day0-sim started ===")
	_log("godot %s" % Engine.get_version_info().get("string", "?"))
	call_deferred("_setup_and_run")


func _setup_and_run() -> void:
	var errors: int = 0

	# ---- Phase 1: world setup ------------------------------------------
	var shed: Node3D = STORAGE_SCENE.instantiate()
	add_child(shed)
	shed.global_position = Vector3(0, 0, 0)
	shed.set("capacity_per_type", 200)
	_log("spawned storage_shed cap=200")

	# Three fairies so the three tasks can run in parallel.
	for i in range(3):
		var f: Node3D = FAIRY_SCENE.instantiate()
		add_child(f)
		f.global_position = Vector3(0, 0, 0)
		_fairies.append(f)
	_log("spawned 3 fairies")

	# Plant — force into flowering stage so harvest_seeds surfaces.
	var plant: Node3D = PLANT_SCENE.instantiate()
	plant.setup("salmonberry")
	add_child(plant)
	plant.global_position = Vector3(4, 0, 0)
	plant.set("age_days", 60)
	plant.set("growth_stage", "flowering")
	_log("spawned plant (flowering) at %s" % plant.global_position)

	# Empty soil plot.
	var plot: Node3D = SOIL_PLOT_SCENE.instantiate()
	add_child(plot)
	plot.global_position = Vector3(-4, 0, 0)
	_log("spawned soil_plot at %s" % plot.global_position)

	# Mature tree — forage_understory target.
	var tree: Node3D = DECOR_ITEM_SCENE.instantiate()
	add_child(tree)
	tree.global_position = Vector3(0, 0, 5)
	# Configure as mature tree so the context action surfaces.
	if tree.has_method("configure_tree"):
		tree.call("configure_tree", "tree_mature", 1.0, 12345, "red_alder", 1000)
	_log("spawned decor_item tree_mature at %s" % tree.global_position)

	# Pump a few frames so StorageIndex + _ready() all run.
	await get_tree().process_frame
	await get_tree().process_frame

	# Seed FarmTotals — fairy needs 1 seed for the clover planting.
	FarmTotals.add_resource(FarmTotals.SEEDS, 3.0)
	_log("seeded FarmTotals: seeds=3")

	# ---- Phase 2: verify resource registry -----------------------------
	# New typed resources exist + have keys wired.
	for key in ["wild_berries", "wild_mushrooms", "imo"]:
		if not FarmTotals.stocks.has(key):
			_log("FAIL: FarmTotals.stocks missing %s" % key)
			errors += 1
		else:
			_log("PASS: FarmTotals has %s stock entry" % key)
	if not Interactable.MATERIAL_RESOURCES.has("wild_berries"):
		_log("FAIL: Interactable.MATERIAL_RESOURCES missing wild_berries")
		errors += 1
	else:
		_log("PASS: MATERIAL_RESOURCES includes wild_berries")

	# ---- Phase 3: Mason Bee Tubes in progression -----------------------
	var buildings: Array = Progression.available_buildings()
	var found_mason: bool = false
	for b in buildings:
		if String(b.get("id", "")) == "mason_bee_tubes":
			found_mason = true
			_log("mason_bee_tubes building: cost=%s labor=%s affordable=%s" % [
				b.get("cost"), b.get("labor"), b.get("affordable"),
			])
			break
	if not found_mason:
		_log("FAIL: BUILDING_MASON_BEE_TUBES not in available_buildings()")
		errors += 1
	else:
		_log("PASS: BUILDING_MASON_BEE_TUBES in available_buildings()")

	# Instantiate the mason bee tubes scene so we verify the build path.
	var tubes: Node3D = MASON_BEE_TUBES_SCENE.instantiate()
	add_child(tubes)
	tubes.global_position = Vector3(4, 0, -2)   # within 8 m of the plant
	_log("spawned mason_bee_tubes at %s" % tubes.global_position)
	# Pump a couple of aura ticks so pollination flagging fires.
	for i in range(6):
		await get_tree().process_frame

	# ---- Phase 4: queue the three real tasks + drain the queue ---------
	var seeds_before: float = FarmTotals.get_resource(FarmTotals.SEEDS)
	_log("seeds before harvest = %.2f" % seeds_before)

	errors += _queue_action(plant, "harvest_seeds")
	errors += _queue_action(plot,  "plant_clover")
	errors += _queue_action(tree,  "forage_understory")

	var ticks: int = 0
	while ticks < MAX_TICKS:
		for f in _fairies:
			if f == null or not is_instance_valid(f):
				continue
			var tp_var: Variant = f.get("target_pos")
			if tp_var != null and tp_var is Vector3 and (tp_var as Vector3) != Vector3.ZERO:
				var tp: Vector3 = tp_var
				var cur: Vector3 = f.global_position
				var step: float = 20.0 * FRAME_DT
				var to_goal: Vector3 = Vector3(tp.x - cur.x, 0.0, tp.z - cur.z)
				if to_goal.length() <= step:
					f.global_position = Vector3(tp.x, cur.y, tp.z)
				else:
					f.global_position = cur + to_goal.normalized() * step
		await get_tree().process_frame
		ticks += 1
		if TaskQueue.active_tasks().is_empty():
			break
	_log("sim loop ended after %d ticks (%.2fs)" % [ticks, ticks * FRAME_DT])

	# ---- Phase 5: assertions -------------------------------------------
	# 1) Seed harvest: seeds went up by >=1 (plant yielded), but was
	#    initially DEBITED by 1 for the clover cost. Net: seeds_before - 1
	#    (clover cost) + seed_harvest_yield (1..3) >= seeds_before.
	var seeds_after: float = FarmTotals.get_resource(FarmTotals.SEEDS)
	_log("seeds after harvest = %.2f" % seeds_after)
	# The plant stayed alive — growth stage reset to flowering.
	var plant_stage: String = String(plant.get("growth_stage"))
	if plant_stage != "flowering":
		_log("WARN: plant stage after harvest_seeds = %s (expected flowering)" % plant_stage)
	else:
		_log("PASS: plant stage post-harvest = flowering (plant alive)")
	# Seed count should NET higher or equal vs pre-harvest (minus 1 clover).
	# Min net: 3 (init) - 1 (clover) + 1 (seed yield) = 3. So final >= 3.
	if seeds_after < seeds_before - 1.0 + 0.5:
		_log("FAIL: seeds did not net the harvest yield (before=%.1f after=%.1f)" % [seeds_before, seeds_after])
		errors += 1
	else:
		_log("PASS: seeds harvested (before=%.1f after=%.1f)" % [seeds_before, seeds_after])

	# 2) Clover cover-crop state.
	var cc_state: Dictionary = plot.call("cover_crop_state")
	if String(cc_state.get("species", "")) != "clover":
		_log("FAIL: plot cover_crop_active=%s (expected clover)" % cc_state.get("species"))
		errors += 1
	else:
		_log("PASS: plot cover_crop_active = clover")

	# 3) Forage cooldown marker set + one of the 4 resources gained.
	var last_foraged: int = int(tree.get("_last_foraged_day"))
	if last_foraged <= -9000:
		_log("FAIL: tree _last_foraged_day not updated (still sentinel %d)" % last_foraged)
		errors += 1
	else:
		_log("PASS: tree _last_foraged_day = %d (forage fired)" % last_foraged)

	var total_forage: float = 0.0
	for key in ["wild_berries", "wild_mushrooms", "imo", "seeds"]:
		total_forage += FarmTotals.get_resource(key)
	_log("forage totals: wild_berries=%.1f wild_mushrooms=%.1f imo=%.1f seeds=%.1f" % [
		FarmTotals.get_resource("wild_berries"),
		FarmTotals.get_resource("wild_mushrooms"),
		FarmTotals.get_resource("imo"),
		FarmTotals.get_resource("seeds"),
	])
	# We already counted seeds above; the forage either added seeds OR one
	# of the three forest items. Confirm by checking wild totals specifically.
	var forage_wild_total: float = (
		FarmTotals.get_resource("wild_berries") +
		FarmTotals.get_resource("wild_mushrooms") +
		FarmTotals.get_resource("imo")
	)
	# seeds_after already includes the +1..3 from the plant harvest + possible
	# forage-seeds. If forage rolled seeds, forage_wild_total can be 0 and
	# seeds_after will be 1 higher than the plant-only path; either way the
	# forage task completed and the cooldown was set (checked above).
	if forage_wild_total <= 0.0 and seeds_after <= seeds_before:
		_log("FAIL: forage appeared to yield nothing (wild=%.1f, seeds diff=%.1f)" % [forage_wild_total, seeds_after - seeds_before])
		errors += 1
	else:
		_log("PASS: forage yielded either wild_* (%.1f) or seeds (diff %.1f)" % [forage_wild_total, seeds_after - seeds_before])

	# 4) Mason bee tubes exist + pollinated flag landed on the plant.
	var tubes_exist: bool = is_instance_valid(tubes)
	if not tubes_exist:
		_log("FAIL: mason_bee_tubes node went away unexpectedly")
		errors += 1
	else:
		_log("PASS: mason_bee_tubes instance alive post-tick")
	# Force-run the aura once directly so headless sims don't rely on real
	# delta accumulation (process_frame in a tight loop doesn't give real
	# wall-clock delta reliably). This verifies the aura method works.
	if tubes.has_method("_tick_aura"):
		tubes.call("_tick_aura")
	if plant.has_meta("pollinated") and plant.get_meta("pollinated"):
		_log("PASS: plant was flagged pollinated by tubes aura")
	else:
		_log("FAIL: plant not flagged pollinated (tubes aura did not reach plant within 8m)")
		errors += 1

	if errors == 0:
		_log("PASS - all four day-0 activities wired end-to-end.")
	else:
		_log("FAIL - %d assertion(s) failed" % errors)
	_log_file.flush()
	get_tree().quit(0 if errors == 0 else 1)


func _queue_action(target: Node, action_id: String) -> int:
	var actions: Array = target.call("get_context_actions")
	var picked: Dictionary = {}
	for a in actions:
		if String(a.get("id", "")) == action_id:
			picked = a
			break
	if picked.is_empty():
		_log("FAIL: action %s not found on %s" % [action_id, target])
		return 1
	var dup: Dictionary = picked.duplicate(true)
	dup["base_labor_seconds"] = 0.3
	var t: Dictionary = TaskQueue.queue_task(target, dup, 10)
	_log("queued %s (task id=%s pickup=%s drop=%s)" % [
		action_id, t.get("id"), dup.get("pickup_from", ""), dup.get("drop_off_at", ""),
	])
	return 0


func _log(s: String) -> void:
	print(s)
	if _log_file != null:
		_log_file.store_line(s)
		_log_file.flush()
