## Fairy Permaculture — headless wood-chips end-to-end simulation.
##
## Verifies the full wood_chips pipeline:
##   1. Chipper accepts chip_wood + chip_twigs actions with the right
##      costs/yields (uses the real `get_context_actions()` factory so
##      we exercise the same path the player hits).
##   2. After the TaskQueue drains:
##        • FarmTotals.wood drops by 2    (2× chip_wood @ 1 wood each)
##        • FarmTotals.twigs drops by 3   (1× chip_twigs @ 3 twigs)
##        • FarmTotals.wood_chips gains 8 (2×3 + 1×2 = 8)
##   3. Queueing add_wood_chips on the compost pile fires the pickup
##      flow — the fairy visits the shed (STAGE_TO_SOURCE → PICKING_UP),
##      loads the basket, flies to the pile, and deposits chips.
##   4. Pile.ingredients gains a "wood-chips" entry.
##
## Writes the trace to logs/woodchips-sim.log so humans + Claude can
## verify without launching the interactive game.
extends Node3D


const CHIPPER_SCENE := preload("res://scenes/chipper.tscn")
const COMPOST_PILE_SCENE := preload("res://scenes/compost_pile.tscn")
const FAIRY_SCENE := preload("res://scenes/fairy.tscn")
const STORAGE_SCENE := preload("res://scenes/storage_shed.tscn")

const LOG_PATH := "res://logs/woodchips-sim.log"
const MAX_TICKS := 9000            # generous — fairy has lots of travel
const FRAME_DT := 1.0 / 60.0

var _log_file: FileAccess
var _fairy: Node3D
var _chipper: Node3D
var _pile: Node3D
var _shed: Node3D
var _stage_trace: Dictionary = {}   # tid → [stage, stage, …]


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(
		ProjectSettings.globalize_path("res://logs")
	)
	_log_file = FileAccess.open(LOG_PATH, FileAccess.WRITE)
	_log("=== woodchips-sim started ===")
	_log("godot %s" % Engine.get_version_info().get("string", "?"))
	call_deferred("_setup_and_run")


func _setup_and_run() -> void:
	# Storage shed at origin — pickup source + drop-off target.
	_shed = STORAGE_SCENE.instantiate()
	add_child(_shed)
	_shed.global_position = Vector3(0, 0, 0)
	_shed.set("capacity_per_type", 200)
	_log("spawned storage_shed at %s cap=200" % _shed.global_position)

	# Chipper to the east.
	_chipper = CHIPPER_SCENE.instantiate()
	add_child(_chipper)
	_chipper.global_position = Vector3(8, 0, 0)
	_log("spawned chipper at %s" % _chipper.global_position)

	# Compost pile to the north — the second half of the sim hits this.
	_pile = COMPOST_PILE_SCENE.instantiate()
	add_child(_pile)
	_pile.global_position = Vector3(0, 0, 10)
	_log("spawned compost_pile at %s" % _pile.global_position)

	# Fairy. Start at the shed so travel paths read naturally.
	_fairy = FAIRY_SCENE.instantiate()
	add_child(_fairy)
	_fairy.global_position = Vector3(0, 0, 0)
	_log("spawned fairy at %s" % _fairy.global_position)

	await get_tree().process_frame
	await get_tree().process_frame

	# Seed the pantry. 3 wood + 6 twigs is enough for 2× chip_wood +
	# 1× chip_twigs with a little slack.
	FarmTotals.add_resource(FarmTotals.WOOD, 3.0)
	FarmTotals.add_resource(FarmTotals.TWIGS, 6.0)
	_log("--- starting totals ---")
	_log_totals()
	_log("shed_count=%d" % StorageIndex.shed_count())

	# Wire task trace signals up front so we capture every transition.
	TaskQueue.task_started.connect(func(t: Dictionary):
		_log("  task %d started action=%s pickup=%s drop=%s" % [
			t["id"], t["action"]["id"],
			String(t["action"].get("pickup_from", "")),
			String(t["action"].get("drop_off_at", "")),
		])
	)
	TaskQueue.task_picked_up.connect(func(t: Dictionary):
		_log("  task %d PICKED UP" % t["id"])
	)
	TaskQueue.task_completed.connect(func(t: Dictionary):
		_log("  task %d completed (work done)" % t["id"])
	)
	TaskQueue.task_deposited.connect(func(t: Dictionary):
		_log("  task %d DEPOSITED deposited=%s" % [t["id"], t.get("deposited", {})])
	)
	TaskQueue.task_cancelled.connect(func(t: Dictionary):
		_log("  task %d CANCELLED" % t["id"])
	)

	# --- Phase A: queue 2× chip_wood + 1× chip_twigs ---
	var actions: Array = _chipper.get_context_actions()
	var chip_wood: Dictionary = _find_action(actions, "chip_wood")
	var chip_twigs: Dictionary = _find_action(actions, "chip_twigs")
	assert(not chip_wood.is_empty(), "chipper missing chip_wood action")
	assert(not chip_twigs.is_empty(), "chipper missing chip_twigs action")
	_log("chip_wood cost=%s yield=%s pickup=%s drop=%s" % [
		chip_wood["cost"], chip_wood["yield"],
		chip_wood["pickup_from"], chip_wood["drop_off_at"],
	])
	_log("chip_twigs cost=%s yield=%s pickup=%s drop=%s" % [
		chip_twigs["cost"], chip_twigs["yield"],
		chip_twigs["pickup_from"], chip_twigs["drop_off_at"],
	])
	# Shrink labor for a fast sim.
	var cw: Dictionary = chip_wood.duplicate(true)
	cw["base_labor_seconds"] = 0.3
	var ct: Dictionary = chip_twigs.duplicate(true)
	ct["base_labor_seconds"] = 0.3
	TaskQueue.queue_task(_chipper, cw, 10)
	TaskQueue.queue_task(_chipper, cw, 10)
	TaskQueue.queue_task(_chipper, ct, 10)
	_log("queued 2× chip_wood + 1× chip_twigs")

	await _drain_queue("phase-A chipping")

	_log("--- phase A totals ---")
	_log_totals()

	var errors: int = 0
	# Expected after phase A:
	#   wood:       3 → 1   (-2)
	#   twigs:      6 → 3   (-3)
	#   wood_chips: 0 → 8   (+8)
	var wood: float = FarmTotals.get_resource(FarmTotals.WOOD)
	var twigs: float = FarmTotals.get_resource(FarmTotals.TWIGS)
	var chips: float = FarmTotals.get_resource(FarmTotals.WOOD_CHIPS)
	if abs(wood - 1.0) > 0.01:
		_log("FAIL: wood expected 1.0, got %.2f" % wood); errors += 1
	if abs(twigs - 3.0) > 0.01:
		_log("FAIL: twigs expected 3.0, got %.2f" % twigs); errors += 1
	if abs(chips - 8.0) > 0.01:
		_log("FAIL: wood_chips expected 8.0, got %.2f" % chips); errors += 1

	# --- Phase B: queue add_wood_chips on the pile, assert pickup flow ---
	# Move the fairy away from the shed so the pickup-flow's TO_SOURCE
	# stage must fire (if it's already at the shed, the pickup-flow skips
	# travel and jumps straight to PICKING_UP — functionally correct, but
	# we want the full visible round-trip in the trace).
	_fairy.global_position = Vector3(14, 0, 14)
	_log("repositioned fairy to %s for phase B" % _fairy.global_position)
	var pile_actions: Array = _pile.get_context_actions()
	var add_chips: Dictionary = _find_action(pile_actions, "add_wood_chips")
	if add_chips.is_empty():
		_log("FAIL: pile missing add_wood_chips action (wood_chips available=%.1f)"
			% FarmTotals.get_resource(FarmTotals.WOOD_CHIPS))
		errors += 1
	else:
		assert(String(add_chips.get("pickup_from", "")) == Interactable.PICKUP_STORAGE,
				"add_wood_chips pickup_from not auto-set")
		_log("add_wood_chips cost=%s pickup=%s" % [
			add_chips["cost"], add_chips["pickup_from"],
		])
		var ac: Dictionary = add_chips.duplicate(true)
		ac["base_labor_seconds"] = 0.3
		var tid: int = int(TaskQueue.queue_task(_pile, ac, 10)["id"])
		_log("queued task %d: add_wood_chips" % tid)
		await _drain_queue("phase-B add_wood_chips")

		# Assert the task visited STAGE_TO_SOURCE + STAGE_PICKING_UP.
		var required: Array[String] = [
			TaskQueue.STAGE_TO_SOURCE,
			TaskQueue.STAGE_PICKING_UP,
			TaskQueue.STAGE_TO_TARGET,
			TaskQueue.STAGE_WORKING,
		]
		var trace: Array = _stage_trace.get(tid, [])
		_log("  task %d stage timeline: %s" % [tid, trace])
		for r in required:
			if not trace.has(r):
				_log("FAIL: task %d never entered stage %s" % [tid, r])
				errors += 1
		# Pile should now have a wood-chips ingredient entry.
		var has_chips: bool = false
		for entry in (_pile.pile.ingredients as Array):
			if entry is Dictionary and String(entry.get("id", "")) == "wood-chips":
				has_chips = true
				break
		if not has_chips:
			_log("FAIL: pile missing wood-chips ingredient")
			errors += 1
		# Wood chips should have dropped by 1.
		var chips_after: float = FarmTotals.get_resource(FarmTotals.WOOD_CHIPS)
		if abs(chips_after - 7.0) > 0.01:
			_log("FAIL: wood_chips expected 7.0 after feed, got %.2f" % chips_after)
			errors += 1

	_log("--- final totals ---")
	_log_totals()

	if errors == 0:
		_log("PASS — wood chips pipeline behaves end-to-end.")
	else:
		_log("FAIL — %d assertion(s) failed" % errors)
	_log_file.flush()
	get_tree().quit(0 if errors == 0 else 1)


## Pump frames + fairy movement until the TaskQueue drains. Aggressively
## snap the fairy toward its `target_pos` so the 60 Hz smoothing doesn't
## stretch sim time out.
func _drain_queue(tag: String) -> void:
	_log("--- draining queue (%s) ---" % tag)
	var ticks: int = 0
	var last_tid_stage: Dictionary = {}
	while ticks < MAX_TICKS:
		# Fairy auto-nav.
		var tp_var: Variant = _fairy.get("target_pos")
		if tp_var != null and tp_var is Vector3 and (tp_var as Vector3) != Vector3.ZERO:
			var tp: Vector3 = tp_var
			var cur: Vector3 = _fairy.global_position
			var step: float = 14.0 * FRAME_DT
			var to_goal: Vector3 = Vector3(tp.x - cur.x, 0.0, tp.z - cur.z)
			if to_goal.length() <= step:
				_fairy.global_position = Vector3(tp.x, cur.y, tp.z)
			else:
				var move: Vector3 = to_goal.normalized() * step
				_fairy.global_position = cur + move
		await get_tree().process_frame
		ticks += 1
		# Stage tracing.
		for t in TaskQueue.active_tasks():
			var tid: int = int(t["id"])
			var stg: String = String(t.get("stage", ""))
			var prev: String = String(last_tid_stage.get(tid, ""))
			if stg != prev:
				last_tid_stage[tid] = stg
				if not _stage_trace.has(tid):
					_stage_trace[tid] = []
				(_stage_trace[tid] as Array).append(stg)
				_log("  [tick %d] task %d stage=%s fairy=%s" % [
					ticks, tid, stg, _fairy.global_position,
				])
		if TaskQueue.active_tasks().is_empty():
			break
	_log("--- drain complete after %d ticks (%.2fs sim time) ---" % [
		ticks, ticks * FRAME_DT,
	])


func _find_action(actions: Array, id: String) -> Dictionary:
	for a in actions:
		if String(a.get("id", "")) == id:
			return a
	return {}


func _log_totals() -> void:
	for k in FarmTotals.RESOURCE_TYPES:
		_log("  %s = %.2f (cap %.1f)" % [
			k, FarmTotals.get_resource(k), FarmTotals.capacity_for(k),
		])


func _log(s: String) -> void:
	print(s)
	if _log_file != null:
		_log_file.store_line(s)
		_log_file.flush()
