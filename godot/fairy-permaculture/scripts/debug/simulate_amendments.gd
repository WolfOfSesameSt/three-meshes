## Fairy Permaculture — headless soil-amendment simulation.
##
## Verifies the deliverables from the Soil Amendment Engineer pass:
##
##   1. Three soil plots spawn with deficient starting stats
##      (OM 0.5, P 10, CEC 8). FarmTotals seeded with 1 compost,
##      1 bone_meal, 1 biochar + a storage shed.
##   2. Apply actions (apply_compost_amend / apply_bone_meal /
##      apply_biochar) queue and resolve through the pickup flow,
##      spending the amendment from storage.
##   3. After ~10 s of simulated ticking, each plot shows the right
##      stat bumps and FarmTotals has decremented by 1 per type.
##
## Writes a readable trace to logs/amendments-sim.log. PASS/FAIL at
## the end; process exits 0 on pass, 1 on any assertion failure.
extends Node3D


const SOIL_PLOT_SCENE := preload("res://scenes/soil_plot.tscn")
const FAIRY_SCENE := preload("res://scenes/fairy.tscn")
const STORAGE_SCENE := preload("res://scenes/storage_shed.tscn")

const LOG_PATH := "res://logs/amendments-sim.log"
const MAX_TICKS := 3600            # 60 s at 60 Hz ceiling
const FRAME_DT := 1.0 / 60.0

var _log_file: FileAccess
var _shed: Node3D
var _fairies: Array[Node3D] = []
var _plots: Array[Node3D] = []


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(
		ProjectSettings.globalize_path("res://logs")
	)
	_log_file = FileAccess.open(LOG_PATH, FileAccess.WRITE)
	_log("=== amendments-sim started ===")
	_log("godot %s" % Engine.get_version_info().get("string", "?"))
	call_deferred("_setup_and_run")


func _setup_and_run() -> void:
	var errors: int = 0

	# --- Phase 1: setup world ------------------------------------------
	_shed = STORAGE_SCENE.instantiate()
	add_child(_shed)
	_shed.global_position = Vector3(0, 0, 0)
	_shed.set("capacity_per_type", 200)
	_log("spawned storage_shed at %s cap=200" % _shed.global_position)

	# Three deficient plots spaced around origin.
	var plot_a: Node3D = _spawn_plot(Vector3(6, 0, 0))
	var plot_b: Node3D = _spawn_plot(Vector3(0, 0, 6))
	var plot_c: Node3D = _spawn_plot(Vector3(-6, 0, 0))
	_plots = [plot_a, plot_b, plot_c]

	# Three worker fairies (one per plot) so the three tasks can run
	# in parallel — cuts sim time.
	for i in range(3):
		var f: Node3D = FAIRY_SCENE.instantiate()
		add_child(f)
		f.global_position = Vector3(0, 0, 0)
		_fairies.append(f)
	_log("spawned 3 fairies")

	# Pump a few frames so StorageIndex registers the shed + every
	# scene _ready() fires.
	await get_tree().process_frame
	await get_tree().process_frame

	# Seed FarmTotals — exactly one of each amendment.
	FarmTotals.add_resource(FarmTotals.COMPOST, 1.0)
	FarmTotals.add_resource(FarmTotals.BONE_MEAL, 1.0)
	FarmTotals.add_resource(FarmTotals.BIOCHAR, 1.0)
	_log("--- starting totals ---")
	_log_totals()

	# Snapshot the per-plot starting stats for later diffing.
	var before_a: Dictionary = _snapshot(plot_a)
	var before_b: Dictionary = _snapshot(plot_b)
	var before_c: Dictionary = _snapshot(plot_c)
	_log("plot A before: %s" % before_a)
	_log("plot B before: %s" % before_b)
	_log("plot C before: %s" % before_c)

	# --- Phase 2: queue one amendment per plot --------------------------
	errors += _queue_action(plot_a, "apply_compost_amend")
	errors += _queue_action(plot_b, "apply_bone_meal")
	errors += _queue_action(plot_c, "apply_biochar")

	# --- Phase 3: tick ~10 s of simulated time --------------------------
	var ticks: int = 0
	while ticks < MAX_TICKS:
		# Snap every fairy directly toward its current target each tick
		# so the sim doesn't stall on the production lerp.
		for f in _fairies:
			if f == null or not is_instance_valid(f):
				continue
			var tp_var: Variant = f.get("target_pos")
			if tp_var != null and tp_var is Vector3 and (tp_var as Vector3) != Vector3.ZERO:
				var tp: Vector3 = tp_var
				var cur: Vector3 = f.global_position
				var step: float = 14.0 * FRAME_DT
				var to_goal: Vector3 = Vector3(tp.x - cur.x, 0.0, tp.z - cur.z)
				if to_goal.length() <= step:
					f.global_position = Vector3(tp.x, cur.y, tp.z)
				else:
					f.global_position = cur + to_goal.normalized() * step
		await get_tree().process_frame
		ticks += 1
		if TaskQueue.active_tasks().is_empty():
			break

	_log("--- sim loop ended after %d ticks (%.2fs sim time) ---" % [
		ticks, ticks * FRAME_DT,
	])
	_log("--- final totals ---")
	_log_totals()
	var after_a: Dictionary = _snapshot(plot_a)
	var after_b: Dictionary = _snapshot(plot_b)
	var after_c: Dictionary = _snapshot(plot_c)
	_log("plot A after : %s" % after_a)
	_log("plot B after : %s" % after_b)
	_log("plot C after : %s" % after_c)

	# --- Phase 4: assertions -------------------------------------------
	# Plot A — compost applied: om +1, biology +0.15, worms +10.
	if abs(float(after_a["om"]) - (float(before_a["om"]) + 1.0)) > 0.05:
		_log("FAIL: plot A om expected +1, got %.3f -> %.3f" % [before_a["om"], after_a["om"]])
		errors += 1
	else:
		_log("PASS: plot A OM rose by +1")
	if abs(float(after_a["biology"]) - (float(before_a["biology"]) + 0.15)) > 0.02:
		_log("FAIL: plot A biology expected +0.15, got %.3f -> %.3f" % [before_a["biology"], after_a["biology"]])
		errors += 1
	else:
		_log("PASS: plot A biology rose by +0.15")

	# Plot B — bone meal applied: P +30, Ca +15.
	if abs(float(after_b["p"]) - (float(before_b["p"]) + 30.0)) > 0.5:
		_log("FAIL: plot B p_avail expected +30, got %.1f -> %.1f" % [before_b["p"], after_b["p"]])
		errors += 1
	else:
		_log("PASS: plot B P rose by +30")
	if abs(float(after_b["ca"]) - (float(before_b["ca"]) + 15.0)) > 0.5:
		_log("FAIL: plot B ca_ppm expected +15, got %.1f -> %.1f" % [before_b["ca"], after_b["ca"]])
		errors += 1
	else:
		_log("PASS: plot B Ca rose by +15")

	# Plot C — biochar applied: CEC +5, biology +0.10.
	if abs(float(after_c["cec"]) - (float(before_c["cec"]) + 5.0)) > 0.5:
		_log("FAIL: plot C cec expected +5, got %.1f -> %.1f" % [before_c["cec"], after_c["cec"]])
		errors += 1
	else:
		_log("PASS: plot C CEC rose by +5")
	if abs(float(after_c["biology"]) - (float(before_c["biology"]) + 0.10)) > 0.02:
		_log("FAIL: plot C biology expected +0.10, got %.3f -> %.3f" % [before_c["biology"], after_c["biology"]])
		errors += 1
	else:
		_log("PASS: plot C biology rose by +0.10")

	# FarmTotals each decremented by 1.
	var compost_left: float = FarmTotals.get_resource(FarmTotals.COMPOST)
	var bone_left: float = FarmTotals.get_resource(FarmTotals.BONE_MEAL)
	var biochar_left: float = FarmTotals.get_resource(FarmTotals.BIOCHAR)
	if compost_left > 0.01:
		_log("FAIL: compost not fully consumed (left=%.2f)" % compost_left)
		errors += 1
	else:
		_log("PASS: compost consumed")
	if bone_left > 0.01:
		_log("FAIL: bone_meal not fully consumed (left=%.2f)" % bone_left)
		errors += 1
	else:
		_log("PASS: bone_meal consumed")
	if biochar_left > 0.01:
		_log("FAIL: biochar not fully consumed (left=%.2f)" % biochar_left)
		errors += 1
	else:
		_log("PASS: biochar consumed")

	# Amendment recommendation sanity — plot A before compost had OM 0.5,
	# so it should have surfaced both "Low OM" + "Low CEC" + "Low P" +
	# "Low N" recs. Verify against a fresh deficient plot.
	var rec_probe: Node3D = _spawn_plot(Vector3(-12, 0, -12))
	var recs: Array[String] = rec_probe.call("amendment_recommendations")
	_log("probe recs = %s" % [recs])
	var joined: String = " ".join(recs).to_lower()
	if not joined.contains("bone meal"):
		_log("FAIL: deficient plot should recommend bone meal")
		errors += 1
	if not joined.contains("biochar"):
		_log("FAIL: deficient plot should recommend biochar")
		errors += 1
	if not joined.contains("compost"):
		_log("FAIL: deficient plot should recommend compost")
		errors += 1

	if errors == 0:
		_log("PASS - amendment loop behaves end-to-end.")
	else:
		_log("FAIL - %d assertion(s) failed" % errors)
	_log_file.flush()
	get_tree().quit(0 if errors == 0 else 1)


## Spawn + configure a plot with a deficient profile. Touches the
## nutrient-state fields directly — these are newly appended to
## soil_plot.gd by the Soil Amendment Engineer pass.
func _spawn_plot(pos: Vector3) -> Node3D:
	var plot: Node3D = SOIL_PLOT_SCENE.instantiate()
	add_child(plot)
	plot.global_position = pos
	plot.set("om_pct", 0.5)
	plot.set("moisture_pct", 35.0)
	plot.set("p_avail", 10.0)
	plot.set("cec", 8.0)
	plot.set("biology_pct", 0.10)
	plot.set("worm_density", 0.0)
	if plot.has_method("_refresh_soil_appearance"):
		plot.call("_refresh_soil_appearance")
	_log("spawned plot @ %s (OM 0.5, P 10, CEC 8)" % pos)
	return plot


func _snapshot(plot: Node3D) -> Dictionary:
	return {
		"om":      float(plot.get("om_pct")),
		"p":       float(plot.get("p_avail")),
		"ca":      float(plot.get("ca_ppm")),
		"cec":     float(plot.get("cec")),
		"biology": float(plot.get("biology_pct")),
		"worms":   float(plot.get("worm_density")),
	}


## Queue an amendment action by id via the plot's own
## get_context_actions() factory so we exercise the same path the
## player's right-click menu hits. Returns 1 on error, 0 on success
## (so the caller can accumulate errors).
func _queue_action(plot: Node3D, action_id: String) -> int:
	var actions: Array = plot.call("get_context_actions")
	var action: Dictionary = {}
	for a in actions:
		if String(a.get("id", "")) == action_id:
			action = a
			break
	if action.is_empty():
		_log("FAIL: action %s not found on plot" % action_id)
		return 1
	# Shrink labor so the sim finishes quickly.
	var dup: Dictionary = action.duplicate(true)
	dup["base_labor_seconds"] = 0.3
	var t: Dictionary = TaskQueue.queue_task(plot, dup, 10)
	_log("queued %s (task id=%d, pickup_from=%s)" % [
		action_id, t["id"], String(dup.get("pickup_from", "")),
	])
	return 0


func _log_totals() -> void:
	for k in [
		FarmTotals.COMPOST, FarmTotals.BONE_MEAL, FarmTotals.BIOCHAR,
	]:
		_log("  %s = %.2f" % [k, FarmTotals.get_resource(k)])


func _log(s: String) -> void:
	print(s)
	if _log_file != null:
		_log_file.store_line(s)
		_log_file.flush()
