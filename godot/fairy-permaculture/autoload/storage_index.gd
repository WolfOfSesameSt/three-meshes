## Fairy Permaculture — storage shed spatial index.
##
## Thin bookkeeping autoload the TaskQueue uses to pick a drop-off point
## for a fairy carrying a load back from a harvest task. Sheds register
## via `register_shed(node)` in their `_ready()` (the node must also be
## in the `storage_sheds` group); they unregister on `tree_exited`.
##
## The "capacity for type" check is deferred to FarmTotals — a shed has
## capacity if the total across all sheds has room for `amount` of
## `kind`. We don't track per-shed remaining-by-type yet because every
## shed is fungible in MVP. Upgrading to per-shed buckets later only
## requires extending `nearest_for(...)` to filter by shed.remaining(kind).
extends Node

signal sheds_changed()

var _sheds: Array[Node3D] = []


func register_shed(shed: Node3D) -> void:
	if shed == null or not is_instance_valid(shed):
		return
	if _sheds.has(shed):
		return
	_sheds.append(shed)
	if not shed.tree_exited.is_connected(_on_shed_freed.bind(shed)):
		shed.tree_exited.connect(_on_shed_freed.bind(shed))
	emit_signal("sheds_changed")


func _on_shed_freed(shed: Node3D) -> void:
	_sheds.erase(shed)
	emit_signal("sheds_changed")


## Count of live sheds. A zero-return means the player is on "pocket"
## capacity and should be nudged to build a shed.
func shed_count() -> int:
	_prune()
	return _sheds.size()


## Nearest shed that can supply `amount` of `kind`. In MVP all sheds
## share the global FarmTotals stock, so "can supply" = "FarmTotals has
## enough" AND at least one shed exists. The physically-nearest shed
## wins. Returns null when either condition fails — TaskQueue treats
## that as "cancel the task and tell the player why" (see the pickup
## flow in task_queue.gd).
func find_nearest_with_stock(kind: String, world_pos: Vector3, amount: float) -> Node3D:
	_prune()
	if _sheds.is_empty():
		return null
	if FarmTotals.get_resource(kind) < amount - 0.001:
		return null
	var best: Node3D = null
	var best_d: float = INF
	for s in _sheds:
		if s == null or not is_instance_valid(s):
			continue
		var d: float = world_pos.distance_squared_to(s.global_position)
		if d < best_d:
			best_d = d
			best = s
	return best


## Nearest shed with capacity for `amount` of `kind`. Returns null when
## no shed exists OR every shed is effectively at capacity (global
## stocks full). Callers should treat null as "deposit at pocket → may
## overflow with storage_rejected".
func nearest_for(from: Vector3, kind: String, amount: float) -> Node3D:
	_prune()
	if _sheds.is_empty():
		return null
	# Global-capacity check: if FarmTotals has no room for the amount,
	# all sheds are effectively full.
	var room: float = FarmTotals.remaining_capacity(kind)
	if room < amount - 0.001:
		# Still prefer to route to SOMEWHERE so the visible deposit beat
		# happens — the overflow is then reported via storage_rejected.
		pass
	var best: Node3D = null
	var best_d: float = INF
	for s in _sheds:
		if s == null or not is_instance_valid(s):
			continue
		var d: float = from.distance_squared_to(s.global_position)
		if d < best_d:
			best_d = d
			best = s
	return best


## All live sheds (read-only snapshot).
func sheds() -> Array[Node3D]:
	_prune()
	return _sheds.duplicate()


func _prune() -> void:
	var live: Array[Node3D] = []
	for s in _sheds:
		if s != null and is_instance_valid(s):
			live.append(s)
	_sheds = live
