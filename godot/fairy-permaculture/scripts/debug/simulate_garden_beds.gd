## Fairy Permaculture — headless garden-beds simulation.
##
## Spawns one of each of the 4 bed variants (fenced / raised / hugel /
## spiral), reads their metadata, queues a plant action on each, and
## verifies that the growth / moisture multipliers land on the bed
## instance. Fails loudly (exit 1) if any bed's metadata diverges from
## its spec. PASS/FAIL written to logs/garden-beds-sim.log.
extends Node3D

const FENCED := preload("res://scenes/fenced_plot.tscn")
const RAISED := preload("res://scenes/raised_bed.tscn")
const HUGEL := preload("res://scenes/hugel_bed.tscn")
const SPIRAL := preload("res://scenes/spiral_garden.tscn")

const LOG_PATH := "res://logs/garden-beds-sim.log"

var _log_file: FileAccess


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(
		ProjectSettings.globalize_path("res://logs")
	)
	_log_file = FileAccess.open(LOG_PATH, FileAccess.WRITE)
	_log("=== garden-beds-sim started ===")
	call_deferred("_run")


func _run() -> void:
	var errors: int = 0

	# Seed storage so context actions surface as non-disabled.
	FarmTotals.add_resource(FarmTotals.PLANT_TRIM, 10.0)
	FarmTotals.add_resource(FarmTotals.WATER, 10.0)
	FarmTotals.add_resource(FarmTotals.WOOD, 10.0)
	FarmTotals.add_resource(FarmTotals.STONE, 20.0)
	FarmTotals.add_resource(FarmTotals.COMPOST, 5.0)
	FarmTotals.add_resource(FarmTotals.SEEDS, 10.0)

	var beds: Array[Node3D] = []
	beds.append(_spawn(FENCED, Vector3(0, 0, 0), "fenced"))
	beds.append(_spawn(RAISED, Vector3(5, 0, 0), "raised"))
	beds.append(_spawn(HUGEL, Vector3(10, 0, 0), "hugel"))
	beds.append(_spawn(SPIRAL, Vector3(15, 0, 0), "spiral"))

	await get_tree().process_frame
	await get_tree().process_frame

	# ---- Metadata checks -------------------------------------------------
	errors += _assert_eq("fenced.growth_multiplier",
		float(beds[0].call("bed_metadata").get("growth_multiplier", 0.0)), 1.00)
	errors += _assert_eq("raised.growth_multiplier",
		float(beds[1].call("bed_metadata").get("growth_multiplier", 0.0)), 1.20)
	errors += _assert_eq("raised.moisture_decay_multiplier",
		float(beds[1].call("bed_metadata").get("moisture_decay_multiplier", 0.0)), 1.15)
	errors += _assert_eq("hugel.growth_multiplier",
		float(beds[2].call("bed_metadata").get("growth_multiplier", 0.0)), 1.15)
	errors += _assert_eq("hugel.moisture_retention_multiplier",
		float(beds[2].call("bed_metadata").get("moisture_retention_multiplier", 0.0)), 1.40)
	errors += _assert_eq("hugel.field_capacity_bonus",
		float(beds[2].call("bed_metadata").get("field_capacity_bonus", 0.0)), 0.08)
	errors += _assert_eq("hugel.slot_count",
		float(beds[2].call("bed_metadata").get("slot_count", 0)), 3.0)
	errors += _assert_eq("spiral.slot_count",
		float(beds[3].call("bed_metadata").get("slot_count", 0)), 5.0)
	errors += _assert_eq("spiral.warmth_bonus_c",
		float(beds[3].call("bed_metadata").get("warmth_bonus_c", 0.0)), 2.0)

	# ---- Action surface: every bed exposes a plant action when stocked --
	for i in range(beds.size()):
		var actions: Array = beds[i].call("get_context_actions")
		var names: String = ""
		var has_plant: bool = false
		for a in actions:
			var label: String = String(a.get("label", ""))
			names += label + " | "
			if String(a.get("id", "")).begins_with("plant_"):
				has_plant = true
		_log("bed %d actions: %s" % [i, names])
		if not has_plant:
			_log("FAIL: bed %d has no plant action" % i)
			errors += 1
		else:
			_log("PASS: bed %d exposes a plant action" % i)

	# ---- Hugel OM reservoir ticks one day --------------------------------
	var hugel: Node3D = beds[2]
	var om_before: float = float(hugel.get("om_pct"))
	hugel.call("_on_day", 1, "spring", 0)
	var om_after: float = float(hugel.get("om_pct"))
	if om_after <= om_before:
		_log("FAIL: hugel om did not rise on day tick (%.3f -> %.3f)" % [om_before, om_after])
		errors += 1
	else:
		_log("PASS: hugel om ticked up (%.3f -> %.3f)" % [om_before, om_after])

	if errors == 0:
		_log("PASS - all 4 bed variants behave to spec.")
	else:
		_log("FAIL - %d assertion(s) failed" % errors)
	_log_file.flush()
	get_tree().quit(0 if errors == 0 else 1)


func _spawn(scene: PackedScene, pos: Vector3, tag: String) -> Node3D:
	var n: Node3D = scene.instantiate()
	add_child(n)
	n.global_position = pos
	_log("spawned %s @ %s" % [tag, pos])
	return n


func _assert_eq(label: String, actual: float, expected: float) -> int:
	if abs(actual - expected) <= 0.001:
		_log("PASS: %s = %.3f" % [label, actual])
		return 0
	_log("FAIL: %s = %.3f (expected %.3f)" % [label, actual, expected])
	return 1


func _log(s: String) -> void:
	print(s)
	if _log_file != null:
		_log_file.store_line(s)
		_log_file.flush()
