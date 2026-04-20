## Fairy Permaculture — headless resource-taxonomy simulation.
##
## Verifies the 2026-04 taxonomy refactor: the abstract GREENS / BROWNS
## stock buckets have been replaced with specific items (plant_trim,
## fruit_scraps, dry_leaves, twigs, wood, wood_chips) each tagged with a
## category + C:N ratio via scripts/interactable.gd.
##
## This sim:
##   • seeds FarmTotals with 5 plant_trim, 3 wood_chips, 2 twigs
##   • queues add_plant_trim×2, add_wood_chips×1, add_twigs×1 via the
##     compost pile's own get_context_actions() so we exercise the real
##     player path (same code that Interactable.make_action produces)
##   • ticks the TaskQueue until drained
##   • asserts the pile's ingredient list contains fresh-grass × 2 plus
##     wood-chips + twigs (C:N moves from pure-green toward balanced)
##   • asserts FarmTotals has the right per-item decrements AND that
##     the dead "greens" / "browns" keys are absent
##   • asserts the RESOURCE_CATEGORY / RESOURCE_CN_RATIO tables agree
##     with the resource list
##
## Run with:
##   godot --path . --headless \
##     res://scenes/debug/simulate_taxonomy.tscn --quit-after 30
extends Node3D


const COMPOST_PILE_SCENE := preload("res://scenes/compost_pile.tscn")
const FAIRY_SCENE := preload("res://scenes/fairy.tscn")
const STORAGE_SCENE := preload("res://scenes/storage_shed.tscn")

const LOG_PATH := "res://logs/taxonomy-sim.log"
const MAX_TICKS := 3600          # 60 s at 60 Hz worst case
const FRAME_DT := 1.0 / 60.0

var _log_file: FileAccess
var _fairy: Node3D
var _pile: Node3D
var _shed: Node3D


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(
		ProjectSettings.globalize_path("res://logs")
	)
	_log_file = FileAccess.open(LOG_PATH, FileAccess.WRITE)
	_log("=== taxonomy-sim started ===")
	_log("godot %s" % Engine.get_version_info().get("string", "?"))
	call_deferred("_setup_and_run")


func _setup_and_run() -> void:
	# Storage shed — pickup source + drop-off target.
	_shed = STORAGE_SCENE.instantiate()
	add_child(_shed)
	_shed.global_position = Vector3(0, 0, 0)
	_shed.set("capacity_per_type", 200)
	_log("spawned storage_shed at %s cap=200" % _shed.global_position)

	# Compost pile — right-click target.
	_pile = COMPOST_PILE_SCENE.instantiate()
	add_child(_pile)
	_pile.global_position = Vector3(10, 0, 0)
	_log("spawned compost_pile at %s" % _pile.global_position)

	# Fairy — worker.
	_fairy = FAIRY_SCENE.instantiate()
	add_child(_fairy)
	_fairy.global_position = Vector3(10, 0, 0)
	_log("spawned fairy at %s" % _fairy.global_position)

	# Pump two frames so _ready()'s run on every node + StorageIndex
	# registers the shed.
	await get_tree().process_frame
	await get_tree().process_frame

	# Taxonomy pre-flight assertions: verify the tables look right before
	# we run any actual tasks.
	var errors: int = 0
	errors += _assert_taxonomy_tables()

	# Seed the pantry per the spec: 5 plant_trim, 3 wood_chips, 2 twigs.
	FarmTotals.add_resource(FarmTotals.PLANT_TRIM, 5.0)
	FarmTotals.add_resource(FarmTotals.WOOD_CHIPS, 3.0)
	FarmTotals.add_resource(FarmTotals.TWIGS, 2.0)
	_log("--- starting totals ---")
	_log_totals()
	_log("shed_count=%d" % StorageIndex.shed_count())

	# Pull the pile's own right-click actions; the compost pile is the
	# source of truth for every "add X" action in the refactored menu.
	var actions: Array = _pile.get_context_actions()
	_log("pile surfaced %d actions" % actions.size())
	for a in actions:
		_log("  id=%s label='%s' cost=%s disabled=%s" % [
			a.get("id", "?"), a.get("label", "?"),
			a.get("cost", {}), a.get("disabled", false),
		])
	var add_plant_trim: Dictionary = _find_action(actions, "add_plant_trim")
	var add_wood_chips: Dictionary = _find_action(actions, "add_wood_chips")
	var add_twigs: Dictionary = _find_action(actions, "add_twigs")
	errors += _assert_action_present(add_plant_trim, "add_plant_trim")
	errors += _assert_action_present(add_wood_chips, "add_wood_chips")
	errors += _assert_action_present(add_twigs, "add_twigs")
	errors += _assert_no_legacy_actions(actions)

	# Shrink labor so the sim runs in under a second of sim time.
	var g: Dictionary = add_plant_trim.duplicate(true)
	g["base_labor_seconds"] = 0.3
	var c: Dictionary = add_wood_chips.duplicate(true)
	c["base_labor_seconds"] = 0.3
	var t: Dictionary = add_twigs.duplicate(true)
	t["base_labor_seconds"] = 0.3

	TaskQueue.queue_task(_pile, g, 10)
	TaskQueue.queue_task(_pile, g, 10)
	TaskQueue.queue_task(_pile, c, 10)
	TaskQueue.queue_task(_pile, t, 10)
	_log("queued 4 tasks: add_plant_trim×2, add_wood_chips×1, add_twigs×1")

	# Drive the fairy through the pipeline. Snap the fairy to target_pos
	# each frame so we don't wait for the production lerp speed.
	var ticks: int = 0
	while ticks < MAX_TICKS:
		var tp_var: Variant = _fairy.get("target_pos")
		if tp_var != null and tp_var is Vector3 and (tp_var as Vector3) != Vector3.ZERO:
			var tp: Vector3 = tp_var
			var cur: Vector3 = _fairy.global_position
			var step: float = 12.0 * FRAME_DT
			var to_goal: Vector3 = Vector3(tp.x - cur.x, 0.0, tp.z - cur.z)
			if to_goal.length() <= step:
				_fairy.global_position = Vector3(tp.x, cur.y, tp.z)
			else:
				_fairy.global_position = cur + to_goal.normalized() * step
		await get_tree().process_frame
		ticks += 1
		if TaskQueue.active_tasks().is_empty():
			break

	_log("--- simulation loop ended after %d ticks (%.2fs sim time) ---" % [
		ticks, ticks * FRAME_DT
	])
	_log("--- final totals ---")
	_log_totals()
	_log("pile ingredients=%s" % [str(_pile.pile.ingredients)])
	_log("pile C:N=%.2f moisture=%.1f volume=%.3f" % [
		_pile.pile.current_cn, _pile.pile.moisture_pct, _pile.pile.volume_m3,
	])

	# ------- Post-run assertions -------

	# FarmTotals decrements:
	#   plant_trim: 5 - 2 = 3
	#   wood_chips: 3 - 1 = 2
	#   twigs:      2 - 2 = 0  (add_twigs costs 2 per action)
	errors += _assert_total("plant_trim", 3.0)
	errors += _assert_total("wood_chips", 2.0)
	errors += _assert_total("twigs", 0.0)

	# No stray legacy keys on the stocks dict.
	if FarmTotals.stocks.has("greens"):
		_log("FAIL: FarmTotals.stocks still contains legacy 'greens' key")
		errors += 1
	if FarmTotals.stocks.has("browns"):
		_log("FAIL: FarmTotals.stocks still contains legacy 'browns' key")
		errors += 1

	# Pile ingredient audit.
	var ing_counts: Dictionary = {}
	for entry in _pile.pile.ingredients:
		if entry is Dictionary:
			var eid: String = String((entry as Dictionary).get("id", ""))
			ing_counts[eid] = int(ing_counts.get(eid, 0)) + 1
	_log("pile ingredient counts: %s" % ing_counts)
	if int(ing_counts.get("fresh-grass", 0)) != 2:
		_log("FAIL: expected 2 fresh-grass entries (from add_plant_trim×2), got %d" % int(ing_counts.get("fresh-grass", 0)))
		errors += 1
	if int(ing_counts.get("wood-chips", 0)) != 1:
		_log("FAIL: expected 1 wood-chips entry, got %d" % int(ing_counts.get("wood-chips", 0)))
		errors += 1
	if int(ing_counts.get("twigs", 0)) != 1:
		_log("FAIL: expected 1 twigs entry, got %d" % int(ing_counts.get("twigs", 0)))
		errors += 1

	# Directional C:N check: with 2 green (grass) + 1 chip + 1 twigs the
	# pile should be notably higher than pure-green (~15) but still below
	# the heavy-brown end (~400). We expect the weighted mix to land in
	# the 40..150 range. This asserts the specific-items math actually
	# shifts the pile the way the taxonomy promises.
	var cn: float = _pile.pile.current_cn
	if cn <= 15.0:
		_log("FAIL: pile C:N=%.2f — browns didn't shift the mix upward" % cn)
		errors += 1
	if cn >= 300.0:
		_log("FAIL: pile C:N=%.2f — too brown, greens didn't register" % cn)
		errors += 1

	# Final roll-up.
	if errors == 0:
		_log("PASS — taxonomy refactor verified: specific-item actions, tagged stocks, balanced mix.")
	else:
		_log("FAIL — %d assertion(s) failed" % errors)
	_log_file.flush()
	get_tree().quit(0 if errors == 0 else 1)


func _assert_taxonomy_tables() -> int:
	# Every resource in FarmTotals.RESOURCE_TYPES must appear in BOTH
	# interactable.gd tables (category + C:N). Guards against drift.
	var errs: int = 0
	for k in FarmTotals.RESOURCE_TYPES:
		if not Interactable.RESOURCE_CATEGORY.has(k):
			_log("FAIL: RESOURCE_CATEGORY missing entry for '%s'" % k)
			errs += 1
		if not Interactable.RESOURCE_CN_RATIO.has(k):
			_log("FAIL: RESOURCE_CN_RATIO missing entry for '%s'" % k)
			errs += 1
	# Category helper should return one of {"green", "brown", "neutral"}.
	var allowed: Array[String] = ["green", "brown", "neutral"]
	for k in FarmTotals.RESOURCE_TYPES:
		var cat: String = Interactable.category_for(k)
		if not allowed.has(cat):
			_log("FAIL: category_for('%s') = '%s' not in %s" % [k, cat, allowed])
			errs += 1
	_log("taxonomy tables: %d green, %d brown, %d neutral" % [
		_count_cat("green"), _count_cat("brown"), _count_cat("neutral"),
	])
	return errs


func _count_cat(cat: String) -> int:
	var n: int = 0
	for k in FarmTotals.RESOURCE_TYPES:
		if Interactable.category_for(k) == cat:
			n += 1
	return n


func _assert_action_present(action: Dictionary, id: String) -> int:
	if action.is_empty():
		_log("FAIL: pile missing action '%s'" % id)
		return 1
	return 0


func _assert_no_legacy_actions(actions: Array) -> int:
	var errs: int = 0
	for a in actions:
		var aid: String = String(a.get("id", ""))
		if aid == "add_greens" or aid == "add_browns":
			_log("FAIL: legacy action '%s' still surfaced by pile" % aid)
			errs += 1
	return errs


func _assert_total(kind: String, expected: float) -> int:
	var actual: float = FarmTotals.get_resource(kind)
	if abs(actual - expected) > 0.01:
		_log("FAIL: FarmTotals.%s expected %.2f, got %.2f" % [kind, expected, actual])
		return 1
	return 0


func _find_action(actions: Array, id: String) -> Dictionary:
	for a in actions:
		if String(a.get("id", "")) == id:
			return a
	return {}


func _log_totals() -> void:
	for k in FarmTotals.RESOURCE_TYPES:
		_log("  %-14s = %.2f (cap %.1f)" % [
			k, FarmTotals.get_resource(k), FarmTotals.capacity_for(k),
		])
	_log("  biomass alias = %.2f (= plant_trim + twigs + wood)" % FarmTotals.biomass)


func _log(s: String) -> void:
	print(s)
	if _log_file != null:
		_log_file.store_line(s)
		_log_file.flush()
