## Fairy Permaculture — global task queue + fairy worker orchestrator.
##
## Holds the queue of right-click tasks the player has assigned. An
## idle fairy polls the queue, travels to the target, works for the
## action's labor seconds, then (if the action has a drop-off) carries
## the yield to the nearest storage shed and deposits it. Only AFTER
## the deposit are FarmTotals updated — no more magic-instant yields.
##
## Task state machine:
##
##   [queued]
##       │
##       ▼
##   pickup_from == "storage_shed"?   YES ─▶ [traveling_to_source]
##                                                    │ (arrive at shed)
##                                                    ▼
##                                             [picking_up] (~0.6 s)
##                                                    │ debit FarmTotals
##                                                    │ spawn basket (tint by cost)
##                                                    ▼
##                                             [traveling_to_target]
##                                                    ▼
##                                             [working] (basket carried)
##                                                    ▼
##                                             [done] — basket removed
##
##                                    NO ─▶ [traveling_to_target]
##                                                    ▼
##                                             [working] — ticks ─▶
##                                                    │ progress ≥ labor
##                                                    ▼
##                                      target.complete() + callback
##                                                    │
##                                      ┌─────────────┴────────────┐
##                          drop_off_at == ""         drop_off_at = shed
##                                      │                         ▼
##                                      ▼             [traveling_to_dropoff]
##                                   [done]                       │
##                                                   (arrive at shed)
##                                                                ▼
##                                                        [depositing]
##                                                                │
##                                                                ▼
##                                                             [done]
##
## Multiple queued tasks: an idle fairy pops the NEAREST-of-highest-
## priority task so right-clicking many things in quick succession
## causes the same fairy to work through them in order without running
## laps across the farm.
extends Node

signal task_queued(task: Dictionary)
signal task_started(task: Dictionary)
signal task_work_tick(task: Dictionary)
signal task_completed(task: Dictionary)
signal task_deposited(task: Dictionary)
signal task_cancelled(task: Dictionary)
## Fires when a pickup stage completes and the fairy has loaded the
## basket — HUD + debug sims listen so they can verify stage order.
signal task_picked_up(task: Dictionary)

# Task stages — plain strings so they show up nicely in logs.
const STAGE_QUEUED: String         = "queued"
const STAGE_TO_SOURCE: String      = "traveling_to_source"
const STAGE_PICKING_UP: String     = "picking_up"
const STAGE_TO_TARGET: String      = "traveling_to_target"
const STAGE_WORKING: String        = "working"
const STAGE_TO_DROPOFF: String     = "traveling_to_dropoff"
const STAGE_DEPOSITING: String     = "depositing"
const STAGE_DONE: String           = "done"

const ARRIVE_DISTANCE: float       = 1.6   # metres
const PICKUP_SECONDS: float        = 0.6   # short load-up pause at shed
const DEPOSIT_SECONDS: float       = 0.8   # short pause at the shed
const WORK_TICK_INTERVAL: float    = 1.0   # emit task_work_tick each second

# ---------- internal state ----------
var _queue: Array = []            # pending + in-progress tasks (all stages)
var _next_id: int = 1
var _fairies: Array[Node] = []    # registered idle-pollable fairies


func _ready() -> void:
	set_process(true)


# =====================================================================
# Public API
# =====================================================================

## Enqueue a new right-click task. `complete_cb` fires on the WORKING →
## DONE transition (after in-place action) or before the drop-off
## starts (so the target can update its visuals: empty bush, quarried
## rock, etc.). The yield then rides along with the fairy to storage.
func queue_task(
	target: Node3D,
	action: Dictionary,
	priority: int = 10,
	complete_cb: Callable = Callable()
) -> Dictionary:
	var task: Dictionary = {
		"id": _next_id,
		"target": target,
		"action": action,
		"priority": priority,
		"stage": STAGE_QUEUED,
		"worker": null,
		"progress": 0.0,
		"labor_target": float(action.get("base_labor_seconds", 10.0)),
		"complete_cb": complete_cb,
		"deposit_t": 0.0,
		"pickup_t": 0.0,
		"dropoff_target": null,
		"pickup_source": null,
		"pickup_done": false,
		"cumulative_yield": action.get("yield", {}).duplicate(),
		"last_tick_t": 0.0,
	}
	_next_id += 1
	_queue.append(task)
	GameLog.event("task_queued", {
		"id": task["id"],
		"action": action.get("id", ""),
		"target": _safe_node_name(target),
	})
	emit_signal("task_queued", task)
	return task


## Cancel a specific task (by id or task dict). The worker is released
## to idle; nothing is deposited. Used by the HUD cancel-X button.
func cancel_task(task_or_id: Variant) -> void:
	var t: Dictionary = _find_task(task_or_id)
	if t.is_empty():
		return
	_release_worker(t)
	t["stage"] = STAGE_DONE
	emit_signal("task_cancelled", t)
	_queue.erase(t)


## Cancel every non-finished task — HUD "cancel all" button.
func cancel_all() -> void:
	var snap: Array = _queue.duplicate()
	for t in snap:
		if t["stage"] != STAGE_DONE:
			cancel_task(t)


## Fairy-facing registration. Fairies call this in `_ready()`. Each
## registered fairy polls the queue every frame when idle.
func register_fairy(f: Node) -> void:
	if f == null or not is_instance_valid(f):
		return
	if not _fairies.has(f):
		_fairies.append(f)
	if not f.tree_exited.is_connected(_on_fairy_freed.bind(f)):
		f.tree_exited.connect(_on_fairy_freed.bind(f))


func _on_fairy_freed(f: Node) -> void:
	_fairies.erase(f)
	# Unlink any task that was using this fairy.
	for t in _queue:
		if t.get("worker") == f:
			t["worker"] = null
			t["stage"] = STAGE_QUEUED
			t["progress"] = 0.0


## Peek snapshot — UI reads this to render the queue widget.
func active_tasks() -> Array:
	var live: Array = []
	for t in _queue:
		if t["stage"] != STAGE_DONE:
			live.append(t)
	return live


## Count of tasks still pending a worker.
func pending_count() -> int:
	var n: int = 0
	for t in _queue:
		if t["stage"] == STAGE_QUEUED:
			n += 1
	return n


# =====================================================================
# Per-frame tick
# =====================================================================

func _process(delta: float) -> void:
	if _queue.is_empty():
		return
	# Scale task progress by game speed so gathering / construction / pickup
	# all run `Scheduler.speed`× faster at 2×/4× time. Without this the task
	# timers were wall-clock only and the player experienced "days fly, work
	# crawls" at high speed.
	var speed: float = max(0.0, float(Scheduler.speed))
	var sd: float = delta * speed
	# First: hand out pending tasks to idle fairies.
	_assign_idle_fairies()
	# Then: advance each in-progress task.
	var done_ids: Array = []
	for t in _queue:
		match t["stage"]:
			STAGE_TO_SOURCE:
				_advance_to_source(t, sd)
			STAGE_PICKING_UP:
				_advance_picking_up(t, sd)
			STAGE_TO_TARGET:
				_advance_to_target(t, sd)
			STAGE_WORKING:
				_advance_working(t, sd)
			STAGE_TO_DROPOFF:
				_advance_to_dropoff(t, sd)
			STAGE_DEPOSITING:
				_advance_depositing(t, sd)
			STAGE_DONE:
				done_ids.append(t)
	for d in done_ids:
		_queue.erase(d)


# ---------- assignment ----------

func _assign_idle_fairies() -> void:
	# Gather idle fairies.
	var idle: Array = []
	for f in _fairies:
		if f == null or not is_instance_valid(f):
			continue
		if f.get("current_task") == null:
			idle.append(f)
	if idle.is_empty():
		return
	for fairy in idle:
		var pos: Vector3 = (fairy as Node3D).global_position
		var pick: Dictionary = _pick_task_for(pos)
		if pick.is_empty():
			continue
		pick["worker"] = fairy
		# Route through the pickup stage when the action needs materials
		# that live in a shed. If no shed has them → either cancel (when
		# a shed physically exists but is empty) or fall back to direct
		# travel (no sheds at all → the "pocket" path). See _begin_pickup.
		# If the task already completed pickup (e.g. previous fairy died
		# mid-flight), skip the pickup stage to avoid double-debiting.
		if _action_requires_pickup(pick["action"]) and not bool(pick.get("pickup_done", false)):
			if not _begin_pickup_or_fallback(pick):
				# begin_pickup cancelled the task (empty shed) — skip.
				continue
		else:
			pick["stage"] = STAGE_TO_TARGET
		fairy.set("current_task", pick)
		if fairy.has_method("on_task_assigned"):
			fairy.call("on_task_assigned", pick)
		GameLog.event("task_started", {
			"id": pick["id"],
			"action": pick["action"].get("id", ""),
			"fairy": _safe_node_name(fairy),
			"pickup": String(pick["action"].get("pickup_from", "")),
		})
		emit_signal("task_started", pick)


## FIFO within priority tier: highest priority wins, ties broken by
## queue-order (oldest first). Player intent trumps fairy efficiency —
## if you right-click 3 things in a row, they execute in that order.
func _pick_task_for(_from: Vector3) -> Dictionary:
	var best: Dictionary = {}
	var best_prio: int = -1
	for t in _queue:
		if t["stage"] != STAGE_QUEUED:
			continue
		var target: Node3D = t.get("target") as Node3D
		if target == null or not is_instance_valid(target):
			continue
		var prio: int = int(t["priority"])
		# _queue is in insertion order. First one we see at the highest
		# priority wins — any later entry at the same priority is newer.
		if prio > best_prio:
			best = t
			best_prio = prio
	return best


# ---------- stage advance ----------

func _advance_to_target(t: Dictionary, _delta: float) -> void:
	var worker: Node3D = t.get("worker") as Node3D
	var target: Node3D = t.get("target") as Node3D
	if worker == null or not is_instance_valid(worker):
		t["stage"] = STAGE_QUEUED
		t["worker"] = null
		return
	if target == null or not is_instance_valid(target):
		_finish_task(t)
		return
	# The fairy drives its own drift — we just set target_pos with a
	# small deterministic offset so multiple fairies don't overlap.
	if not t.has("_target_pos_set"):
		var off: Vector3 = _offset_for(t, target.global_position)
		worker.set("target_pos", off)
		t["_target_pos_set"] = true
	var d: float = _xz_distance(worker.global_position, target.global_position)
	if d <= ARRIVE_DISTANCE:
		t["stage"] = STAGE_WORKING
		t["progress"] = 0.0
		t["last_tick_t"] = 0.0
		if worker.has_method("on_task_working"):
			worker.call("on_task_working", t)


func _advance_working(t: Dictionary, delta: float) -> void:
	var worker: Node3D = t.get("worker") as Node3D
	var target: Node3D = t.get("target") as Node3D
	if worker == null or not is_instance_valid(worker):
		t["stage"] = STAGE_QUEUED
		t["worker"] = null
		return
	if target == null or not is_instance_valid(target):
		_finish_task(t)
		return
	t["progress"] = float(t["progress"]) + delta
	t["last_tick_t"] = float(t["last_tick_t"]) + delta
	if float(t["last_tick_t"]) >= WORK_TICK_INTERVAL:
		t["last_tick_t"] = 0.0
		emit_signal("task_work_tick", t)
	if float(t["progress"]) >= float(t["labor_target"]):
		_on_work_complete(t)


func _on_work_complete(t: Dictionary) -> void:
	var target: Node3D = t.get("target") as Node3D
	var action: Dictionary = t.get("action", {})
	# 1. Fire the optional caller callback (e.g. main.gd immediate-
	#    effect shims) and any target.complete() hook. The target's
	#    complete() should mutate its visual state NOW (plant empty,
	#    tree falls) but defer FarmTotals updates to the deposit step.
	var cb: Callable = t.get("complete_cb", Callable())
	if cb.is_valid():
		cb.call(t)
	if target != null and is_instance_valid(target) and target.has_method("complete"):
		target.call("complete", action)
	# complete() is allowed to refine action["yield"] (e.g. forage rolls the
	# real find here, replacing the queue-time placeholder). Resync the
	# task's cumulative_yield so the deposit stage ships the real roll.
	t["cumulative_yield"] = action.get("yield", {}).duplicate()
	emit_signal("task_completed", t)
	GameLog.event("task_completed", {
		"id": t["id"],
		"action": action.get("id", ""),
	})
	# 2. Route to drop-off or wrap up.
	var drop: String = String(action.get("drop_off_at", ""))
	if drop == "" or t["cumulative_yield"].is_empty():
		_finish_task(t)
		return
	# Yields need to be carried. Find nearest shed.
	if drop == Interactable.DROP_STORAGE:
		_begin_drop_to_storage(t)
		return
	# Other drop-offs (compost pile, soil plot) aren't carry-bound yet —
	# deposit in place.
	_deposit_and_finish(t)


# ---------- pickup flow (runs BEFORE travel_to_target) ----------

## True when the action demands a shed-sourced ingredient the fairy
## should visually haul to the target.
func _action_requires_pickup(action: Dictionary) -> bool:
	return String(action.get("pickup_from", "")) == Interactable.PICKUP_STORAGE


## Arrange the source → pickup → target sequence. Returns false only
## when the task had to be cancelled (e.g. an empty shed) so the
## caller's assignment loop skips it. On the "no shed at all" fallback
## we log + return TRUE with a direct-travel stage, matching the
## pre-pickup behaviour so tutorial players aren't blocked.
func _begin_pickup_or_fallback(t: Dictionary) -> bool:
	var worker: Node3D = t.get("worker") as Node3D
	var action: Dictionary = t.get("action", {})
	var cost: Dictionary = action.get("cost", {})
	var kind: String = Interactable.pickup_kind_for_cost(cost)
	var amount: float = Interactable.pickup_amount_for_cost(cost)
	if worker == null or not is_instance_valid(worker) or kind == "":
		t["stage"] = STAGE_TO_TARGET
		return true
	# No shed exists anywhere → fall back to direct travel so the old
	# "pocket" flow still works for the pre-shed tutorial. Debit at
	# queue-semantics time so compost_pile doesn't double-debit.
	if StorageIndex.shed_count() == 0:
		if FarmTotals.get_resource(kind) + 0.001 < amount:
			_banner_not_enough(kind, worker.global_position)
			t["stage"] = STAGE_DONE
			emit_signal("task_cancelled", t)
			GameLog.event("task_cancelled_no_stock", {
				"id": t["id"],
				"kind": kind,
				"amount": amount,
			})
			return false
		# Pocket debit now — no visible pickup beat to defer to.
		FarmTotals.spend_resource(kind, amount)
		t["pickup_done"] = true
		t["stage"] = STAGE_TO_TARGET
		GameLog.event("task_pickup_pocket", {
			"id": t["id"],
			"kind": kind,
			"amount": amount,
		})
		return true
	# A shed exists — try to route to the nearest one with the goods.
	var shed: Node3D = StorageIndex.find_nearest_with_stock(
		kind, worker.global_position, amount,
	)
	if shed == null:
		# Shed(s) exist but empty → cancel + banner. Fairy doesn't fly
		# empty-handed to the target.
		_banner_not_enough(kind, worker.global_position)
		t["stage"] = STAGE_DONE
		emit_signal("task_cancelled", t)
		GameLog.event("task_cancelled_no_stock", {
			"id": t["id"],
			"kind": kind,
			"amount": amount,
		})
		return false
	t["pickup_source"] = shed
	t["stage"] = STAGE_TO_SOURCE
	var off: Vector3 = _offset_for(t, shed.global_position)
	worker.set("target_pos", off)
	return true


## Short "storage full / empty" banner style message using Juice.pop.
## Lives here so both the pickup + dropoff flows can reuse it.
func _banner_not_enough(kind: String, at: Vector3) -> void:
	var msg: String = "No %s in storage." % kind
	if has_node("/root/Juice"):
		get_node("/root/Juice").pop(at + Vector3(0, 2.4, 0), msg, Color(0.75, 0.45, 0.25))
	if has_node("/root/AudioManager"):
		get_node("/root/AudioManager").play("hover-tick", -2.0)


func _advance_to_source(t: Dictionary, _delta: float) -> void:
	var worker: Node3D = t.get("worker") as Node3D
	var source: Node3D = t.get("pickup_source") as Node3D
	if worker == null or not is_instance_valid(worker):
		t["stage"] = STAGE_QUEUED
		t["worker"] = null
		return
	# Source shed vanished mid-flight → try to re-route or fall back.
	if source == null or not is_instance_valid(source):
		if not _begin_pickup_or_fallback(t):
			return
		if t["stage"] == STAGE_TO_TARGET:
			var target: Node3D = t.get("target") as Node3D
			if target != null and is_instance_valid(target):
				var off: Vector3 = _offset_for(t, target.global_position)
				worker.set("target_pos", off)
		return
	var d: float = _xz_distance(worker.global_position, source.global_position)
	if d <= ARRIVE_DISTANCE:
		t["stage"] = STAGE_PICKING_UP
		t["pickup_t"] = 0.0
		if worker.has_method("on_task_picking_up"):
			worker.call("on_task_picking_up", t)
		# Audio cue — reuses compost-scoop (warm wooden scoop).
		if has_node("/root/AudioManager"):
			get_node("/root/AudioManager").play("compost-scoop", -6.0)


## Ticks the pickup timer, debits FarmTotals at the halfway point so
## the basket spawns with stock actually consumed, then transitions to
## traveling_to_target. Debit failure (stock vanished mid-pickup)
## cancels cleanly.
func _advance_picking_up(t: Dictionary, delta: float) -> void:
	var worker: Node3D = t.get("worker") as Node3D
	if worker == null or not is_instance_valid(worker):
		t["stage"] = STAGE_QUEUED
		t["worker"] = null
		return
	t["pickup_t"] = float(t["pickup_t"]) + delta
	if float(t["pickup_t"]) >= PICKUP_SECONDS and not bool(t.get("pickup_done", false)):
		# Debit + spawn basket.
		var action: Dictionary = t.get("action", {})
		var cost: Dictionary = action.get("cost", {})
		var kind: String = Interactable.pickup_kind_for_cost(cost)
		var amount: float = Interactable.pickup_amount_for_cost(cost)
		if kind != "" and not FarmTotals.spend_resource(kind, amount):
			# Stock disappeared between assign + pickup → cancel gracefully.
			_banner_not_enough(kind, worker.global_position)
			GameLog.event("task_cancelled_no_stock_mid_pickup", {
				"id": t["id"],
				"kind": kind,
				"amount": amount,
			})
			emit_signal("task_cancelled", t)
			_finish_task(t)
			return
		t["pickup_done"] = true
		GameLog.event("task_picked_up", {
			"id": t["id"],
			"kind": kind,
			"amount": amount,
		})
		emit_signal("task_picked_up", t)
		if worker.has_method("on_task_loading_done"):
			worker.call("on_task_loading_done", t)
		# Travel to the actual target now.
		t["stage"] = STAGE_TO_TARGET
		var target: Node3D = t.get("target") as Node3D
		if target == null or not is_instance_valid(target):
			_finish_task(t)
			return
		var off: Vector3 = _offset_for(t, target.global_position)
		worker.set("target_pos", off)
		t["_target_pos_set"] = true


func _begin_drop_to_storage(t: Dictionary) -> void:
	var worker: Node3D = t.get("worker") as Node3D
	if worker == null or not is_instance_valid(worker):
		_finish_task(t)
		return
	var shed: Node3D = StorageIndex.nearest_for(
		worker.global_position,
		_first_yield_kind(t["cumulative_yield"]),
		_first_yield_amount(t["cumulative_yield"]),
	)
	if shed == null:
		# No shed → pocket-deposit where the fairy stands.
		_deposit_and_finish(t)
		return
	t["dropoff_target"] = shed
	t["stage"] = STAGE_TO_DROPOFF
	var off: Vector3 = _offset_for(t, shed.global_position)
	worker.set("target_pos", off)
	if worker.has_method("on_task_carrying"):
		worker.call("on_task_carrying", t)


func _advance_to_dropoff(t: Dictionary, _delta: float) -> void:
	var worker: Node3D = t.get("worker") as Node3D
	var shed: Node3D = t.get("dropoff_target") as Node3D
	if worker == null or not is_instance_valid(worker):
		t["stage"] = STAGE_QUEUED
		t["worker"] = null
		return
	if shed == null or not is_instance_valid(shed):
		# Shed vanished mid-flight; drop in place.
		_deposit_and_finish(t)
		return
	var d: float = _xz_distance(worker.global_position, shed.global_position)
	if d <= ARRIVE_DISTANCE:
		t["stage"] = STAGE_DEPOSITING
		t["deposit_t"] = 0.0
		if worker.has_method("on_task_depositing"):
			worker.call("on_task_depositing", t)


func _advance_depositing(t: Dictionary, delta: float) -> void:
	t["deposit_t"] = float(t["deposit_t"]) + delta
	if float(t["deposit_t"]) >= DEPOSIT_SECONDS:
		_deposit_and_finish(t)


func _deposit_and_finish(t: Dictionary) -> void:
	var action: Dictionary = t.get("action", {})
	var y: Dictionary = t.get("cumulative_yield", {})
	if not y.is_empty():
		var deposited: Dictionary = FarmTotals.deposit_yield(y)
		t["deposited"] = deposited
		GameLog.event("task_deposited", {
			"id": t["id"],
			"action": action.get("id", ""),
			"deposited": deposited,
		})
	var shed: Node3D = t.get("dropoff_target") as Node3D
	if shed != null and is_instance_valid(shed) and shed.has_method("on_deposit_received"):
		shed.call("on_deposit_received", y)
	emit_signal("task_deposited", t)
	_finish_task(t)


func _finish_task(t: Dictionary) -> void:
	var worker: Node3D = t.get("worker") as Node3D
	t["stage"] = STAGE_DONE
	if worker != null and is_instance_valid(worker):
		if worker.has_method("on_task_done"):
			worker.call("on_task_done", t)
		worker.set("current_task", null)
		worker.set("target_pos", worker.global_position)
	# The task is erased in the next _process sweep.


# =====================================================================
# Helpers
# =====================================================================

func _release_worker(t: Dictionary) -> void:
	var worker: Node3D = t.get("worker") as Node3D
	if worker != null and is_instance_valid(worker):
		worker.set("current_task", null)
		if worker.has_method("on_task_cancelled"):
			worker.call("on_task_cancelled", t)


func _find_task(task_or_id: Variant) -> Dictionary:
	if task_or_id is Dictionary:
		return task_or_id
	if task_or_id is int:
		for t in _queue:
			if int(t["id"]) == int(task_or_id):
				return t
	return {}


func _first_yield_kind(y: Dictionary) -> String:
	for k in y.keys():
		return String(k)
	return ""


func _first_yield_amount(y: Dictionary) -> float:
	for k in y.keys():
		return float(y[k])
	return 0.0


## Small deterministic offset around a target so N fairies don't stack.
func _offset_for(t: Dictionary, center: Vector3) -> Vector3:
	var seed_val: int = int(t["id"]) * 37
	var a: float = float(seed_val % 360) * (PI / 180.0)
	var r: float = 0.9 + float((seed_val / 360) % 3) * 0.3
	return Vector3(
		center.x + cos(a) * r,
		center.y,
		center.z + sin(a) * r,
	)


func _safe_node_name(n: Node) -> String:
	if n == null or not is_instance_valid(n):
		return "<invalid>"
	return n.name


## Horizontal distance — the fairy hovers at HOVER_HEIGHT above ground
## so 3D distance always overshoots the arrival threshold.
func _xz_distance(a: Vector3, b: Vector3) -> float:
	var dx: float = a.x - b.x
	var dz: float = a.z - b.z
	return sqrt(dx * dx + dz * dz)
