## Fairy Permaculture — random-event resource-deposit handlers.
##
## The `RandomEvents` autoload is a CATALOGUE + SCHEDULER; it emits
## `event_triggered(id, payload)` and leaves effect application to
## downstream handlers. The HUD listens for toast-display; achievements
## listen to track milestones. NOBODY was listening to actually deposit
## the `fruit_yield` / `mushroom_yield` / `seed_yield` payloads into
## FarmTotals, which left the `windfall-apples`, `mushroom-flush`,
## `chanterelle-sprout`, and `chipmunk-stash` events as producer-orphans
## on the resource-flow audit.
##
## This autoload is the producer hook — it subscribes to
## `event_triggered`, reads the numeric payload fields the events define,
## and deposits through `FarmTotals.add_resource` with paired Juice +
## AudioManager feedback. No silent successes per
## `feedback_game_feedback_philosophy.md`.
##
## Event → deposit map (payload field → resource kind):
##   windfall-apples    fruit_yield     → fruit (primary) + fruit_scraps
##                                        (0.75×, windfall is half bruised)
##   mushroom-flush     mushroom_yield  → wild_mushrooms
##   chanterelle-sprout mushroom_yield  → wild_mushrooms
##   chipmunk-stash     seed_yield      → seeds
##   bear-visit         fruit_loss      → subtract fruit (negative prod)
##
## Kept deliberately small; events with non-resource payloads (morale,
## cosmetics, etc.) stay owned by their own handlers (HUD toast,
## Wildlife listener, etc.).
extends Node


func _ready() -> void:
	# Wire once after RandomEvents is ready. RandomEvents is an autoload
	# that loads BEFORE this one alphabetically (R < ev... actually no,
	# E < R). We guard with a null-check in case project ordering changes.
	if has_node("/root/RandomEvents"):
		var re: Node = get_node("/root/RandomEvents")
		if re.has_signal("event_triggered") \
				and not re.is_connected("event_triggered", _on_event):
			re.connect("event_triggered", _on_event)
			GameLog.info("event_handlers wired to RandomEvents.event_triggered", "events")


func _on_event(id: String, payload: Dictionary) -> void:
	match id:
		"windfall-apples":
			_handle_windfall_apples(payload)
		"mushroom-flush", "chanterelle-sprout":
			_handle_mushroom_yield(payload, id)
		"chipmunk-stash":
			_handle_chipmunk_stash(payload)
		"bear-visit":
			_handle_bear_visit(payload)


## Windfall apples — a wild crabapple drops fruit across nearby tiles.
## Payload field is `fruit_yield` (float, kg). We split the drop 1:0.75
## between edible `fruit` and bruised `fruit_scraps` since windfalls
## realistically include a mix of intact and ground-impact bruised fruit.
## The scrap channel is the "primary producer-orphan" this ships for.
func _handle_windfall_apples(payload: Dictionary) -> void:
	var fruit_yield: float = float(payload.get("fruit_yield", 0.0))
	if fruit_yield <= 0.0:
		return
	var scrap_yield: float = fruit_yield * 0.75
	var got_fruit: float = FarmTotals.add_resource(FarmTotals.FRUIT, fruit_yield)
	var got_scrap: float = FarmTotals.add_resource(FarmTotals.FRUIT_SCRAPS, scrap_yield)
	# Route some of the fruit into the fairy-food channel too — windfalls
	# are a seasonal fruit burst the player's fairies can eat directly.
	FarmTotals.add_food("fruit", got_fruit)
	_pop(
		"+ %d FRUIT · %d SCRAPS" % [int(got_fruit), int(got_scrap)],
		Palette.CORAL
	)
	_play("berry-pick", -2.0)
	GameLog.event("windfall_deposited", {
		"fruit": got_fruit,
		"fruit_scraps": got_scrap,
	})


## Mushroom flush / chanterelle sprout — forest produces wild mushrooms.
## Payload field is `mushroom_yield` (float, kg). Feeds `wild_mushrooms`
## so the forage channel has a random-event producer on top of the
## decor_item forage action.
func _handle_mushroom_yield(payload: Dictionary, id: String) -> void:
	var mushroom_yield: float = float(payload.get("mushroom_yield", 0.0))
	if mushroom_yield <= 0.0:
		return
	var got: float = FarmTotals.add_resource(FarmTotals.WILD_MUSHROOMS, mushroom_yield)
	var tint: Color = Palette.PARCHMENT.lerp(Palette.WARM_STONE, 0.45)
	_pop("+ %d WILD MUSHROOMS" % int(got), tint)
	_play("forage-chime", -4.0)
	GameLog.event("mushroom_event_deposited", {
		"event": id,
		"mushrooms": got,
	})


## Chipmunk stash — a small pile of assorted seeds. Deposits into seeds.
func _handle_chipmunk_stash(payload: Dictionary) -> void:
	var seed_yield: float = float(payload.get("seed_yield", 0.0))
	if seed_yield <= 0.0:
		return
	var got: float = FarmTotals.add_resource(FarmTotals.SEEDS, seed_yield)
	_pop("+ %d SEEDS" % int(got), Palette.MEADOW.lerp(Palette.HONEY, 0.30))
	_play("seedling-sprout", -4.0)
	GameLog.event("chipmunk_stash_deposited", {"seeds": got})


## Bear visit — a bear eats fruit. We SPEND from stock (bounded by what's
## there; no negative stock). Paired feedback reads as a loss, not a win.
func _handle_bear_visit(payload: Dictionary) -> void:
	var loss: float = float(payload.get("fruit_loss", 0.0))
	if loss <= 0.0:
		return
	var have: float = FarmTotals.get_resource(FarmTotals.FRUIT)
	var taken: float = min(have, loss)
	if taken <= 0.0:
		return
	FarmTotals.spend_resource(FarmTotals.FRUIT, taken)
	_pop("- %d FRUIT (bear)" % int(taken), Palette.EARTH)
	_play("hover-tick", -6.0)
	GameLog.event("bear_fruit_loss", {"fruit": taken})


# ---------- Shared feedback helpers ----------

## Camera-centered Juice pop. We don't know a specific world position for
## random events (they're often farm-wide); anchor near the camera by
## using the main scene's player camera if available, else origin.
func _pop(text: String, tint: Color) -> void:
	if not has_node("/root/Juice"):
		return
	var pos: Vector3 = _pop_anchor()
	Juice.pop(pos, text, tint)
	Juice.burst(pos + Vector3(0, -0.4, 0), tint, 10)


func _play(sound: String, db: float) -> void:
	if has_node("/root/AudioManager") and AudioManager.has_method("play"):
		AudioManager.play(sound, db)


## Where to anchor the event pop. Prefers the scene's active camera; falls
## back to origin so headless tests don't crash.
func _pop_anchor() -> Vector3:
	var st: SceneTree = Engine.get_main_loop() as SceneTree
	if st == null:
		return Vector3(0, 2, 0)
	var cam: Camera3D = st.root.get_viewport().get_camera_3d()
	if cam != null:
		# Offset in front of the camera ~3 m down so it reads as "world event."
		return cam.global_position + cam.global_transform.basis.z * -6.0 + Vector3(0, -1.5, 0)
	return Vector3(0, 2, 0)
