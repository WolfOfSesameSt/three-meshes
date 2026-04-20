## Fairy Permaculture — headless water pipeline simulation.
##
## Verifies the full water pipeline:
##   1. FarmTotals exposes `water` as a typed resource with its own
##      stocks entry, capacity, and getter.
##   2. A "Draw water" action queued on a transient stream-dip-point
##      marker carries yield {water: 3} to storage via the TaskQueue.
##      After drain:
##        • FarmTotals.water 0 → 3 (+3)
##   3. "Water plot" on a soil plot auto-lights the pickup flow (cost
##      {water: 1}), the fairy fetches 1 water from the shed + flies to
##      the plot + bumps moisture. After drain:
##        • FarmTotals.water 3 → 2 (-1)
##        • soil_plot.moisture_pct bumped by +20
##
## Writes the trace to logs/water-sim.log so humans + Claude can verify
## without launching the interactive game.
extends Node3D


const SOIL_PLOT_SCENE := preload("res://scenes/soil_plot.tscn")
const FAIRY_SCENE := preload("res://scenes/fairy.tscn")
const STORAGE_SCENE := preload("res://scenes/storage_shed.tscn")
const STREAM_DIP_SCRIPT := preload("res://scripts/stream_dip_point.gd")

const LOG_PATH := "res://logs/water-sim.log"
const MAX_TICKS := 9000            # generous — fairy has lots of travel
const FRAME_DT := 1.0 / 60.0

var _log_file: FileAccess
var _fairy: Node3D
var _plot: Node3D
var _shed: Node3D
var _stage_trace: Dictionary = {}   # tid → [stage, stage, …]


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(
		ProjectSettings.globalize_path("res://logs")
	)
	_log_file = FileAccess.open(LOG_PATH, FileAccess.WRITE)
	_log("=== water-sim started ===")
	_log("godot %s" % Engine.get_version_info().get("string", "?"))
	call_deferred("_setup_and_run")


func _setup_and_run() -> void:
	# Storage shed at origin — pickup source + drop-off target.
	_shed = STORAGE_SCENE.instantiate()
	add_child(_shed)
	_shed.global_position = Vector3(0, 0, 0)
	_shed.set("capacity_per_type", 40)
	_log("spawned storage_shed at %s cap=40" % _shed.global_position)

	# Soil plot some distance away — the fairy flies here on water_plot.
	_plot = SOIL_PLOT_SCENE.instantiate()
	add_child(_plot)
	_plot.global_position = Vector3(0, 0, 10)
	_log("spawned soil_plot at %s moisture=%.1f" % [
		_plot.global_position, float(_plot.get("moisture_pct")),
	])

	# Fairy — start at origin.
	_fairy = FAIRY_SCENE.instantiate()
	add_child(_fairy)
	_fairy.global_position = Vector3(0, 0, 0)
	_log("spawned fairy at %s" % _fairy.global_position)

	await get_tree().process_frame
	await get_tree().process_frame

	# Assert water is a typed resource with stocks + capacity.
	assert(FarmTotals.RESOURCE_TYPES.has(FarmTotals.WATER),
			"FarmTotals missing WATER in RESOURCE_TYPES")
	assert(FarmTotals.stocks.has(FarmTotals.WATER),
			"FarmTotals.stocks missing water entry")
	var start_water: float = FarmTotals.get_resource(FarmTotals.WATER)
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

	var errors: int = 0

	# --- Phase A: spawn a stream-dip marker + queue "Draw water" ---
	# Simulates the right-click-on-stream flow. The marker is a simple
	# Node3D with the stream_dip_point script, spawned over a stream tile.
	var dip_marker: Node3D = Node3D.new()
	dip_marker.set_script(STREAM_DIP_SCRIPT)
	dip_marker.name = "DipMarker"
	add_child(dip_marker)
	dip_marker.global_position = Vector3(-8, 0, -8)
	_log("spawned stream dip marker at %s" % dip_marker.global_position)

	var draw_action: Dictionary = Interactable.make_action(
		"draw_water", "Draw water (from stream)", 0.3,
		{}, {"water": 3.0},
		"", Interactable.DROP_STORAGE, 2
	)
	_log("draw_water cost=%s yield=%s drop=%s" % [
		draw_action["cost"], draw_action["yield"], draw_action["drop_off_at"],
	])
	TaskQueue.queue_task(dip_marker, draw_action, 10)
	_log("queued draw_water on stream marker")

	await _drain_queue("phase-A draw_water")

	_log("--- phase A totals ---")
	_log_totals()

	var water_after_collect: float = FarmTotals.get_resource(FarmTotals.WATER)
	if abs(water_after_collect - (start_water + 3.0)) > 0.01:
		_log("FAIL: water expected %.1f, got %.2f" % [
			start_water + 3.0, water_after_collect,
		])
		errors += 1
	else:
		_log("PASS phase A: water %.1f → %.1f (+3)" % [
			start_water, water_after_collect,
		])

	# --- Phase B: queue water_plot on the soil plot ---
	var moisture_before: float = float(_plot.get("moisture_pct"))
	# Reposition fairy so it has to make a visible round trip through
	# the shed pickup stage.
	_fairy.global_position = Vector3(14, 0, 14)
	_log("repositioned fairy to %s for phase B" % _fairy.global_position)
	var plot_actions: Array = _plot.get_context_actions()
	var water_plot: Dictionary = _find_action(plot_actions, "water_plot")
	if water_plot.is_empty():
		_log("FAIL: soil_plot missing water_plot action")
		errors += 1
	else:
		assert(String(water_plot.get("pickup_from", "")) == Interactable.PICKUP_STORAGE,
				"water_plot pickup_from not auto-set")
		_log("water_plot cost=%s pickup=%s" % [
			water_plot["cost"], water_plot["pickup_from"],
		])
		var wp: Dictionary = water_plot.duplicate(true)
		wp["base_labor_seconds"] = 0.3
		var tid: int = int(TaskQueue.queue_task(_plot, wp, 10)["id"])
		_log("queued task %d: water_plot" % tid)
		await _drain_queue("phase-B water_plot")

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

	var water_after_plot: float = FarmTotals.get_resource(FarmTotals.WATER)
	if abs(water_after_plot - 2.0) > 0.01:
		_log("FAIL: water expected 2.0 after water_plot, got %.2f" % water_after_plot)
		errors += 1
	else:
		_log("PASS phase B: water %.1f → %.1f (-1)" % [
			water_after_collect, water_after_plot,
		])

	var moisture_after: float = float(_plot.get("moisture_pct"))
	if moisture_after <= moisture_before:
		_log("FAIL: plot moisture did not rise (%.1f → %.1f)" % [
			moisture_before, moisture_after,
		])
		errors += 1
	else:
		_log("PASS phase B: plot moisture %.1f → %.1f (+%.1f)" % [
			moisture_before, moisture_after, moisture_after - moisture_before,
		])

	_log("--- final totals ---")
	_log_totals()

	if errors == 0:
		_log("PASS — water pipeline behaves end-to-end.")
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
