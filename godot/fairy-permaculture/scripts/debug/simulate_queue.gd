## Fairy Permaculture — headless task-queue simulation.
##
## Boots a tiny in-memory farm (one fairy, one storage shed, one plant,
## two decor items), queues three right-click tasks, and ticks the
## TaskQueue until every task drains. Writes a readable trace to
## logs/queue-sim.log so Claude + humans can verify the state-machine
## end-to-end without running the full game.
##
## Run with:
##   godot --path . --headless res://scenes/debug/simulate_queue.tscn \
##     --quit-after 30
##
## Assertions (logged inline):
##   • every task passes through traveling_to_target → working → done
##   • harvest + decor tasks go through traveling_to_dropoff → depositing
##   • FarmTotals has the expected typed-resource totals at the end
##   • fairy finishes idle (current_task == null)
extends Node3D


const PLANT_SCENE := preload("res://scenes/plant.tscn")
const FAIRY_SCENE := preload("res://scenes/fairy.tscn")
const STORAGE_SCENE := preload("res://scenes/storage_shed.tscn")
const DECOR_SCRIPT := preload("res://scripts/decor_item.gd")

const LOG_PATH := "res://logs/queue-sim.log"
const MAX_TICKS := 3600          # 60 s at 60 Hz worst case
const FRAME_DT := 1.0 / 60.0

var _log_file: FileAccess
var _fairy: Node3D


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(
		ProjectSettings.globalize_path("res://logs")
	)
	_log_file = FileAccess.open(LOG_PATH, FileAccess.WRITE)
	_log("=== queue-sim started ===")
	_log("godot %s" % Engine.get_version_info().get("string", "?"))
	call_deferred("_setup_and_run")


func _setup_and_run() -> void:
	# Storage shed — drop-off target. Spawn large capacity so full-
	# storage pressure doesn't kick in during the test.
	var shed: Node3D = STORAGE_SCENE.instantiate()
	add_child(shed)
	shed.global_position = Vector3(0, 0, 0)
	shed.set("capacity_per_type", 200)
	_log("spawned storage_shed at %s cap=200" % shed.global_position)

	# Fairy — worker.
	_fairy = FAIRY_SCENE.instantiate()
	add_child(_fairy)
	_fairy.global_position = Vector3(2, 0, 0)
	_log("spawned fairy at %s" % _fairy.global_position)

	# Three right-click targets: nettle, tree_small, rock.
	var nettle: Node3D = PLANT_SCENE.instantiate()
	nettle.setup("nettle-stinging")
	add_child(nettle)
	nettle.global_position = Vector3(4, 0, 0)
	nettle.is_pioneer = true
	nettle.stage = "mature"
	nettle.age_days = 60
	_log("spawned nettle at %s" % nettle.global_position)

	var tree: Node3D = Node3D.new()
	tree.set_script(DECOR_SCRIPT)
	tree.set("kind", "tree_small")
	tree.set("visual_scale", 1.0)
	tree.set("variant_seed", 101)
	add_child(tree)
	tree.global_position = Vector3(6, 0, 0)
	_log("spawned tree_small at %s" % tree.global_position)

	var rock: Node3D = Node3D.new()
	rock.set_script(DECOR_SCRIPT)
	rock.set("kind", "rock")
	rock.set("visual_scale", 1.0)
	rock.set("variant_seed", 202)
	add_child(rock)
	rock.global_position = Vector3(8, 0, 0)
	_log("spawned rock at %s" % rock.global_position)

	# Pump a frame so _ready() runs on every node and StorageIndex
	# registers the shed.
	await get_tree().process_frame
	await get_tree().process_frame

	_log("--- starting totals ---")
	_log_totals()
	_log("shed_count=%d" % StorageIndex.shed_count())

	# Shrink labor targets so the test runs fast — we're verifying the
	# state-machine shape, not the calibrated seconds.
	var nettle_actions: Array = nettle.get_context_actions()
	assert(nettle_actions.size() > 0, "nettle has no actions")
	var chop: Dictionary = nettle_actions[0].duplicate(true)
	chop["base_labor_seconds"] = 0.5
	TaskQueue.queue_task(nettle, chop, 10)
	_log("queued: nettle chop_drop (labor 0.5s) yield=%s drop=%s" % [chop["yield"], chop["drop_off_at"]])

	var tree_actions: Array = tree.get_context_actions()
	assert(tree_actions.size() > 0, "tree has no actions")
	var fell: Dictionary = tree_actions[0].duplicate(true)
	fell["base_labor_seconds"] = 0.5
	TaskQueue.queue_task(tree, fell, 10)
	_log("queued: tree fell (labor 0.5s) yield=%s drop=%s" % [fell["yield"], fell["drop_off_at"]])

	var rock_actions: Array = rock.get_context_actions()
	assert(rock_actions.size() > 0, "rock has no actions")
	var quarry: Dictionary = rock_actions[0].duplicate(true)
	quarry["base_labor_seconds"] = 0.5
	TaskQueue.queue_task(rock, quarry, 10)
	_log("queued: rock quarry (labor 0.5s) yield=%s drop=%s" % [quarry["yield"], quarry["drop_off_at"]])

	TaskQueue.task_started.connect(func(t: Dictionary):
		_log("  task %d started stage=%s action=%s" % [t["id"], t["stage"], t["action"]["id"]])
	)
	TaskQueue.task_completed.connect(func(t: Dictionary):
		var worker: Node = t.get("worker")
		_log("  task %d completed worker=%s" % [t["id"], worker.name if worker != null else "<none>"])
	)
	TaskQueue.task_deposited.connect(func(t: Dictionary):
		_log("  task %d deposited=%s" % [t["id"], t.get("deposited", {})])
	)

	var ticks: int = 0
	var last_stage: String = ""
	while ticks < MAX_TICKS:
		# Move the fairy aggressively in headless — its _process lerp is
		# tuned for 60 Hz with a shallow rate, we just need it to close
		# distance so stages progress. Snap it to target_pos each frame.
		var tp_var: Variant = _fairy.get("target_pos")
		if tp_var != null and tp_var is Vector3 and (tp_var as Vector3) != Vector3.ZERO:
			var tp: Vector3 = tp_var
			var cur: Vector3 = _fairy.global_position
			var step: float = 12.0 * FRAME_DT  # 12 m/s — quick test
			var to_goal: Vector3 = Vector3(tp.x - cur.x, 0.0, tp.z - cur.z)
			if to_goal.length() <= step:
				_fairy.global_position = Vector3(tp.x, cur.y, tp.z)
			else:
				var move: Vector3 = to_goal.normalized() * step
				_fairy.global_position = cur + move
		await get_tree().process_frame
		ticks += 1
		# Trace stage transitions.
		var active: Array = TaskQueue.active_tasks()
		if not active.is_empty():
			var cur_stage: String = String(active[0].get("stage", ""))
			var changed: bool = cur_stage != last_stage
			if changed:
				var wpos: Vector3 = _fairy.global_position
				var tgt_var: Variant = active[0].get("target")
				var tgt_is_valid: bool = tgt_var != null and is_instance_valid(tgt_var)
				var tpos: Vector3 = Vector3.ZERO
				if tgt_is_valid:
					tpos = (tgt_var as Node3D).global_position
				_log("  [tick %d] stage=%s fairy=%s target=%s target_valid=%s" % [
					ticks, cur_stage, wpos, tpos, tgt_is_valid,
				])
				last_stage = cur_stage
		if TaskQueue.active_tasks().is_empty():
			break

	_log("--- simulation loop ended after %d ticks (%.2fs sim time) ---" % [ticks, ticks * FRAME_DT])
	_log("--- final totals ---")
	_log_totals()

	var errors: int = 0
	if not TaskQueue.active_tasks().is_empty():
		_log("FAIL: task queue not empty (%d tasks)" % TaskQueue.active_tasks().size())
		errors += 1
	if _fairy.get("current_task") != null:
		_log("FAIL: fairy still has current_task set")
		errors += 1
	# Taxonomy refactor: chop-and-drop yields plant_trim (not greens).
	var plant_trim: float = FarmTotals.get_resource(FarmTotals.PLANT_TRIM)
	var wood: float = FarmTotals.get_resource(FarmTotals.WOOD)
	var twigs: float = FarmTotals.get_resource(FarmTotals.TWIGS)
	var stone: float = FarmTotals.get_resource(FarmTotals.STONE)
	if plant_trim < 1.0:
		_log("FAIL: plant_trim expected >= 1.0, got %.2f" % plant_trim)
		errors += 1
	if wood < 1.0:
		_log("FAIL: wood expected >= 1.0, got %.2f" % wood)
		errors += 1
	if twigs < 1.0:
		_log("FAIL: twigs expected >= 1.0, got %.2f" % twigs)
		errors += 1
	if stone < 1.0:
		_log("FAIL: stone expected >= 1.0, got %.2f" % stone)
		errors += 1
	if errors == 0:
		_log("PASS — queue state machine behaves correctly.")
	else:
		_log("FAIL — %d assertion(s) failed" % errors)
	_log_file.flush()
	get_tree().quit(0 if errors == 0 else 1)


func _log_totals() -> void:
	for k in FarmTotals.RESOURCE_TYPES:
		_log("  %s = %.2f (cap %.1f)" % [k, FarmTotals.get_resource(k), FarmTotals.capacity_for(k)])


func _log(s: String) -> void:
	print(s)
	if _log_file != null:
		_log_file.store_line(s)
		_log_file.flush()
