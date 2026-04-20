## Fairy Permaculture — headless pickup-flow simulation.
##
## Boots a tiny farm (one fairy, one storage shed, one compost pile),
## seeds FarmTotals with plant_trim + dry_leaves, queues add_plant_trim
## + add_dry_leaves tasks on the pile, and ticks the TaskQueue until
## both drain.
## Writes a readable trace to logs/pickup-sim.log so Claude + humans
## can verify the full state-machine end-to-end without running the game.
##
## Run with:
##   godot --path . --headless res://scenes/debug/simulate_pickup.tscn \
##     --quit-after 30
##
## Assertions (logged inline):
##   • every task passes through traveling_to_source → picking_up →
##     traveling_to_target → working → done
##   • FarmTotals.plant_trim drops by 1, FarmTotals.dry_leaves drops by 2
##   • pile has accumulated both green + brown ingredients
##   • fairy finishes idle (current_task == null)
extends Node3D


const COMPOST_PILE_SCENE := preload("res://scenes/compost_pile.tscn")
const FAIRY_SCENE := preload("res://scenes/fairy.tscn")
const STORAGE_SCENE := preload("res://scenes/storage_shed.tscn")

const LOG_PATH := "res://logs/pickup-sim.log"
const MAX_TICKS := 3600          # 60 s at 60 Hz worst case
const FRAME_DT := 1.0 / 60.0

var _log_file: FileAccess
var _fairy: Node3D
var _pile: Node3D
var _shed: Node3D
# Stage timeline per task id — we assert required stages are visited.
var _stage_trace: Dictionary = {}


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(
		ProjectSettings.globalize_path("res://logs")
	)
	_log_file = FileAccess.open(LOG_PATH, FileAccess.WRITE)
	_log("=== pickup-sim started ===")
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

	# Fairy — worker. Start at the pile to exercise the "travel BACK to
	# source" direction of the pickup flow.
	_fairy = FAIRY_SCENE.instantiate()
	add_child(_fairy)
	_fairy.global_position = Vector3(10, 0, 0)
	_log("spawned fairy at %s" % _fairy.global_position)

	# Pump a frame so _ready() runs on every node and StorageIndex
	# registers the shed.
	await get_tree().process_frame
	await get_tree().process_frame

	# Seed the pantry. Capacity-for-type comes from the shed (200 each).
	FarmTotals.add_resource(FarmTotals.PLANT_TRIM, 5.0)
	FarmTotals.add_resource(FarmTotals.DRY_LEAVES, 5.0)
	_log("--- starting totals ---")
	_log_totals()
	_log("shed_count=%d" % StorageIndex.shed_count())

	# Queue two tasks via the pile's own get_context_actions() — this is
	# the real path the player takes, so we're exercising the same
	# Interactable.make_action() factory that auto-lights pickup_from.
	# Post-taxonomy-refactor: add_plant_trim + add_dry_leaves replace
	# the old add_greens + add_browns.
	var actions: Array = _pile.get_context_actions()
	var add_plant_trim: Dictionary = _find_action(actions, "add_plant_trim")
	var add_dry_leaves: Dictionary = _find_action(actions, "add_dry_leaves")
	assert(not add_plant_trim.is_empty(), "pile missing add_plant_trim action")
	assert(not add_dry_leaves.is_empty(), "pile missing add_dry_leaves action")
	assert(String(add_plant_trim.get("pickup_from", "")) == Interactable.PICKUP_STORAGE,
			"add_plant_trim pickup_from not auto-set")
	assert(String(add_dry_leaves.get("pickup_from", "")) == Interactable.PICKUP_STORAGE,
			"add_dry_leaves pickup_from not auto-set")
	_log("add_plant_trim pickup_from=%s cost=%s" % [add_plant_trim["pickup_from"], add_plant_trim["cost"]])
	_log("add_dry_leaves pickup_from=%s cost=%s" % [add_dry_leaves["pickup_from"], add_dry_leaves["cost"]])

	# Shrink labor to 0.3s so the test runs fast.
	var g: Dictionary = add_plant_trim.duplicate(true)
	g["base_labor_seconds"] = 0.3
	var b: Dictionary = add_dry_leaves.duplicate(true)
	b["base_labor_seconds"] = 0.3
	var tg: Dictionary = TaskQueue.queue_task(_pile, g, 10)
	_log("queued task %d: add_plant_trim" % tg["id"])
	var tb: Dictionary = TaskQueue.queue_task(_pile, b, 10)
	_log("queued task %d: add_dry_leaves" % tb["id"])

	TaskQueue.task_started.connect(func(t: Dictionary):
		_log("  task %d started stage=%s action=%s pickup=%s" % [
			t["id"], t["stage"], t["action"]["id"],
			String(t["action"].get("pickup_from", "")),
		])
	)
	TaskQueue.task_picked_up.connect(func(t: Dictionary):
		_log("  task %d PICKED UP (basket loaded)" % t["id"])
	)
	TaskQueue.task_completed.connect(func(t: Dictionary):
		_log("  task %d completed" % t["id"])
	)
	TaskQueue.task_cancelled.connect(func(t: Dictionary):
		_log("  task %d cancelled" % t["id"])
	)

	var ticks: int = 0
	var last_tid_stage: Dictionary = {}  # tid → last-seen stage
	while ticks < MAX_TICKS:
		# Snap the fairy toward target_pos aggressively — its production
		# lerp is tuned for 60 Hz smoothness; we just need stage
		# transitions to fire.
		var tp_var: Variant = _fairy.get("target_pos")
		if tp_var != null and tp_var is Vector3 and (tp_var as Vector3) != Vector3.ZERO:
			var tp: Vector3 = tp_var
			var cur: Vector3 = _fairy.global_position
			var step: float = 12.0 * FRAME_DT
			var to_goal: Vector3 = Vector3(tp.x - cur.x, 0.0, tp.z - cur.z)
			if to_goal.length() <= step:
				_fairy.global_position = Vector3(tp.x, cur.y, tp.z)
			else:
				var move: Vector3 = to_goal.normalized() * step
				_fairy.global_position = cur + move
		await get_tree().process_frame
		ticks += 1
		# Trace stage transitions per-task.
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

	_log("--- simulation loop ended after %d ticks (%.2fs sim time) ---" % [ticks, ticks * FRAME_DT])
	_log("--- final totals ---")
	_log_totals()
	_log("pile ingredients=%s" % [str(_pile.pile.ingredients)])

	var errors: int = 0
	# Each task must have visited the full pickup→work sequence.
	var required: Array[String] = [
		TaskQueue.STAGE_TO_SOURCE,
		TaskQueue.STAGE_PICKING_UP,
		TaskQueue.STAGE_TO_TARGET,
		TaskQueue.STAGE_WORKING,
	]
	for tid in _stage_trace.keys():
		var trace: Array = _stage_trace[tid]
		_log("  task %d stage timeline: %s" % [tid, trace])
		for r in required:
			if not trace.has(r):
				_log("FAIL: task %d never entered stage %s" % [tid, r])
				errors += 1
	if _stage_trace.keys().size() < 2:
		_log("FAIL: expected 2 traced tasks, saw %d" % _stage_trace.keys().size())
		errors += 1
	if not TaskQueue.active_tasks().is_empty():
		_log("FAIL: task queue not empty (%d tasks)" % TaskQueue.active_tasks().size())
		errors += 1
	if _fairy.get("current_task") != null:
		_log("FAIL: fairy still has current_task set")
		errors += 1
	# FarmTotals.plant_trim started at 5, should now be 4 (1 consumed).
	# FarmTotals.dry_leaves started at 5, should now be 3 (2 consumed —
	# the taxonomy-refactor add_dry_leaves costs 2 per action).
	var plant_trim: float = FarmTotals.get_resource(FarmTotals.PLANT_TRIM)
	var dry_leaves: float = FarmTotals.get_resource(FarmTotals.DRY_LEAVES)
	if abs(plant_trim - 4.0) > 0.01:
		_log("FAIL: plant_trim expected 4.0, got %.2f" % plant_trim)
		errors += 1
	if abs(dry_leaves - 3.0) > 0.01:
		_log("FAIL: dry_leaves expected 3.0, got %.2f" % dry_leaves)
		errors += 1
	# Pile should have both green + brown ingredients recorded.
	var ing: Array = _pile.pile.ingredients
	var has_grass: bool = false
	var has_leaves: bool = false
	for entry in ing:
		if entry is Dictionary:
			var eid: String = String((entry as Dictionary).get("id", ""))
			if eid == "fresh-grass":
				has_grass = true
			elif eid == "dry-leaves":
				has_leaves = true
	if not has_grass:
		_log("FAIL: pile missing fresh-grass ingredient (from add_plant_trim)")
		errors += 1
	if not has_leaves:
		_log("FAIL: pile missing dry-leaves ingredient (from add_dry_leaves)")
		errors += 1

	if errors == 0:
		_log("PASS — pickup state machine behaves correctly.")
	else:
		_log("FAIL — %d assertion(s) failed" % errors)
	_log_file.flush()
	get_tree().quit(0 if errors == 0 else 1)


func _find_action(actions: Array, id: String) -> Dictionary:
	for a in actions:
		if String(a.get("id", "")) == id:
			return a
	return {}


func _log_totals() -> void:
	for k in FarmTotals.RESOURCE_TYPES:
		_log("  %s = %.2f (cap %.1f)" % [k, FarmTotals.get_resource(k), FarmTotals.capacity_for(k)])


func _log(s: String) -> void:
	print(s)
	if _log_file != null:
		_log_file.store_line(s)
		_log_file.flush()
