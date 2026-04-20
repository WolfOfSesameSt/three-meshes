## Fairy Permaculture — main scene controller.
##
## New intro flow (see DESIGN.md "Progression rings"):
## the player wakes into bare terrain with one fairy, one starter
## compost pile, and a scatter of wild pioneer plants (nettle,
## dandelion) for first chop-and-drop. Soil plots, sprouting bed,
## storage shed — all gone from the opening shot. They land only
## when the player builds them via right-click → Build menu,
## gated by `Progression`.
##
## Interaction model:
##   • hover → rim light on object (handled per-object)
##   • right-click on world object → parchment context menu
##     (Chop / Harvest / Feed Pile / etc.)
##   • right-click on empty ground → Build menu (Storage Shed,
##     Sprouting Bed, etc. — filtered by Progression unlocks +
##     resource affordability)
##   • left-click on world objects is a NO-OP. HUD buttons still
##     work; they live on the CanvasLayer and intercept before we
##     hit world ray-casts.
extends Node3D

const CompostPileScene = preload("res://scenes/compost_pile.tscn")
const FairyScene = preload("res://scenes/fairy.tscn")
const PlantScene = preload("res://scenes/plant.tscn")
const SoilPlotScene = preload("res://scenes/soil_plot.tscn")
const SproutingBedScene = preload("res://scenes/sprouting_bed.tscn")
const StorageShedScene = preload("res://scenes/storage_shed.tscn")
const NurseryPanelScene = preload("res://scenes/nursery_panel.tscn")
const DecorScript = preload("res://scripts/decor.gd")
## HUD-button "new compost pile" shortcut — costs plant_trim (direct
## successor to the old biomass stand-in). The full right-click Build
## menu uses the same number via Progression.BUILD_CATALOG.
const PILE_BUILD_COST_PLANT_TRIM := 5.0
const PILE_PLACE_RADIUS := 6.0  # where newly built piles land relative to camera target

@onready var _hud: CanvasLayer = $Hud
@onready var _camera_rig: Node3D = $CameraRig
@onready var _music_day: AudioStreamPlayer = $Audio/MusicDay
@onready var _music_night: AudioStreamPlayer = $Audio/MusicNight

var _pile_instance: Node3D  # the first pile — kept as the Game.pile_ref anchor
var _piles: Array = []        # all piles (including _pile_instance)
var _fairy_instance: Node3D
var _plants: Array = []
var _nursery_panel: Control
var _started: bool = false


func _ready() -> void:
	# Build the tile-grid terrain before spawning anything so everyone
	# that follows can snap to the real ground height.
	WorldGrid.attach_to_scene(self)
	_camera_rig.set_target(Vector3(0, WorldGrid.sample_height(Vector3.ZERO), 0))
	# New intro: bare ground + decor + wild pioneers + one fairy.
	# The starter compost pile is NOT auto-spawned — the player places
	# their own via right-click → Build Compost Pile. Teaches the build
	# loop on day 1 and avoids spawning a pile in the middle of the
	# stream when the seed happens to put the homestead on water.
	_spawn_decor()
	_spawn_pioneer_plants()
	_spawn_fairy()
	_mount_nursery_panel()
	_wire_hud_build_pile()
	Scheduler.day_advanced.connect(_on_day_advanced)
	Scheduler.season_changed.connect(_on_season_changed)
	_on_season_changed(Scheduler.current_season(), Scheduler.year)
	# Let WorldState see the environment + sun for vitality tweening.
	WorldState.refresh_bindings()
	WorldState.set_vitality(WorldState.vitality)
	# Context-menu panel mounted on the HUD layer.
	_build_context_menu()


## Called by soil plots + nursery + wild-spread when a new plant
## enters the world — registers its click + hover signals.
func register_plant(plant: Node3D) -> void:
	if plant.clicked.is_connected(_on_plant_clicked):
		return
	plant.clicked.connect(_on_plant_clicked)
	plant.hover_changed.connect(_on_interactable_hover)
	_plants.append(plant)


func _mount_nursery_panel() -> void:
	_nursery_panel = NurseryPanelScene.instantiate()
	_nursery_panel.visible = false
	_hud.add_child(_nursery_panel)


func _input(event: InputEvent) -> void:
	if not _started and (event is InputEventMouseButton or event is InputEventKey):
		_started = true
		Scheduler.start()
		_refresh_music()
	# Debug cheats + context-menu trigger.
	if event.is_action_pressed("cycle_vitality"):
		WorldState.cycle_demo_vitality()
		Juice.pop(_camera_rig.position + Vector3(0, 2.0, 0), "VITALITY %.1f" % WorldState.vitality, Color(0.95, 0.76, 0.31))
	elif event.is_action_pressed("debug_rain"):
		WorldGrid.debug_rain(100.0)
		Juice.pop(_camera_rig.position + Vector3(0, 2.0, 0), "RAIN +100mm", Color(0.42, 0.78, 0.88))
	elif event.is_action_pressed("context_menu"):
		_try_open_context_menu(event)


func _spawn_pile() -> void:
	_pile_instance = _make_pile(Vector3(-3, 0, -2))


func _make_pile(pos: Vector3) -> Node3D:
	var p: Node3D = CompostPileScene.instantiate()
	var snapped: Vector3 = pos
	snapped.y = WorldGrid.sample_height(snapped)
	p.position = snapped
	add_child(p)
	p.clicked.connect(_on_pile_clicked)
	p.hover_changed.connect(_on_interactable_hover)
	_piles.append(p)
	return p


## HUD button wiring for the "build a new pile" affordance. Costs
## plant_trim and places a fresh pile near the camera's current target.
func _wire_hud_build_pile() -> void:
	if _hud.has_method("set_build_pile_callback"):
		_hud.set_build_pile_callback(_try_build_pile)


func _try_build_pile() -> bool:
	if not FarmTotals.spend_resource(FarmTotals.PLANT_TRIM, PILE_BUILD_COST_PLANT_TRIM):
		Juice.pop(_camera_rig.position + Vector3(0, 1.5, 0), "need 5 plant trim", Color(0.75, 0.45, 0.25))
		return false
	# Place the new pile a short offset from the camera's current
	# target so the player sees it appear where they're looking.
	var angle: float = randf() * TAU
	var pos: Vector3 = _camera_rig.position + Vector3(cos(angle), 0, sin(angle)) * PILE_PLACE_RADIUS
	pos.y = WorldGrid.sample_height(pos)
	var pile: Node3D = _make_pile(pos)
	Juice.pop(pos + Vector3(0, 2.0, 0), "NEW COMPOST PILE", Color(0.55, 0.77, 0.48))
	Juice.burst(pos + Vector3(0, 0.6, 0), Color(0.48, 0.36, 0.28), 18)
	AudioManager.play("compost-scoop")
	return true


func _spawn_decor() -> void:
	var decor: Node3D = Node3D.new()
	decor.name = "Decor"
	decor.set_script(DecorScript)
	add_child(decor)


## Scatter wild pioneer plants (nettle, dandelion) close to the
## homestead so the player has chop-and-drop biomass sources on their
## first day. Replaces the old salmonberry + comfrey spawn.
func _spawn_pioneer_plants() -> void:
	var pioneers: Array = [
		{ "id": "nettle-stinging", "offset": Vector3(-4, 0, -5) },
		{ "id": "dandelion", "offset": Vector3(3, 0, -6) },
		{ "id": "nettle-stinging", "offset": Vector3(-6, 0, 0) },
		{ "id": "dandelion", "offset": Vector3(5, 0, 2) },
		{ "id": "nettle-stinging", "offset": Vector3(0, 0, 5) },
		{ "id": "dandelion", "offset": Vector3(-2, 0, 5) },
		{ "id": "nettle-stinging", "offset": Vector3(6, 0, -2) },
		{ "id": "dandelion", "offset": Vector3(-7, 0, -6) },
	]
	for entry in pioneers:
		var pos: Vector3 = entry["offset"]
		# Never spawn pioneer plants in the stream/pond. If the picked
		# offset lands on a water tile, nudge radially outward until we
		# find dry ground (or give up after a few tries).
		if WorldGrid.is_water_tile(pos):
			var safe_pos: Vector3 = WorldGrid.suggest_spawn_pos_in_radius(pos, 4.0, 12)
			if safe_pos == Vector3.ZERO:
				continue  # skip this pioneer — no dry land nearby
			pos = safe_pos
		pos.y = WorldGrid.sample_height(pos)
		var p: Node3D = PlantScene.instantiate()
		p.setup(entry["id"])
		p.position = pos
		# Mark as pioneer so visuals + chop yields behave correctly.
		p.is_pioneer = true
		p.stage = "mature"
		p.age_days = 60
		p.growth_stage = VisualState.STAGE_FRUITING
		add_child(p)
		register_plant(p)


func _spawn_fairy() -> void:
	_fairy_instance = FairyScene.instantiate()
	var y: float = WorldGrid.sample_height(Vector3.ZERO)
	_fairy_instance.position = Vector3(0, y, 0)
	add_child(_fairy_instance)


func _on_day_advanced(_day: int, _season: String, _year: int) -> void:
	_hud.refresh()


func _on_season_changed(_season: String, _year: int) -> void:
	_refresh_music()


func _refresh_music() -> void:
	if not _started: return
	var s: String = Scheduler.current_season()
	var night: bool = s == "autumn" or s == "winter"
	if night:
		_fade(_music_day, 0.0); _fade(_music_night, 0.6)
	else:
		_fade(_music_night, 0.0); _fade(_music_day, 0.6)


func _fade(player: AudioStreamPlayer, target_linear: float) -> void:
	if not player.playing:
		player.play()
	var tween: Tween = create_tween()
	var target_db: float = linear_to_db(max(0.0001, target_linear))
	tween.tween_property(player, "volume_db", target_db, 1.2)


## Interactable hover — each object toggles its own rim highlight
## inside `set_highlight()`. This handler stays connected for any
## side effects (cursor change, audio ticks) we might add later.
func _on_interactable_hover(_node: Node3D, _hovered: bool) -> void:
	pass


func _on_pile_clicked(pile: Pile) -> void:
	# Legacy LMB-clicked signal — plants emit nothing now, but this
	# handler stays wired in case a future hover-select re-enables it.
	var mesh: Node3D = _pile_instance
	for p in _piles:
		if p.pile == pile:
			mesh = p
			break
	_hud.open_compost_panel(pile, mesh)


func _on_plant_clicked(_plant: Node3D) -> void:
	# LMB on plants is a no-op — actions are right-click delegated.
	pass


# ---------- Right-click context menu ----------

var _ctx_menu: PopupMenu
var _ctx_target: Node3D = null
var _ctx_ground_pos: Vector3 = Vector3.ZERO
var _ctx_is_ground: bool = false
var _ctx_actions: Array = []


func _build_context_menu() -> void:
	_ctx_menu = PopupMenu.new()
	_ctx_menu.transient = true
	_ctx_menu.id_pressed.connect(_on_ctx_action_selected)
	_hud.add_child(_ctx_menu)


func _try_open_context_menu(event: InputEvent) -> void:
	if _ctx_menu == null:
		return
	var mb: InputEventMouseButton = event as InputEventMouseButton
	if mb == null:
		return
	var camera: Camera3D = _camera_rig.get_node("Camera3D") as Camera3D
	var from: Vector3 = camera.project_ray_origin(mb.position)
	var dir: Vector3 = camera.project_ray_normal(mb.position)
	var space_state: PhysicsDirectSpaceState3D = get_world_3d().direct_space_state
	var params: PhysicsRayQueryParameters3D = PhysicsRayQueryParameters3D.create(from, from + dir * 500.0)
	params.collide_with_areas = false
	params.collide_with_bodies = true
	var hit: Dictionary = space_state.intersect_ray(params)
	var actions: Array = []
	var is_ground: bool = false
	var ground_pos: Vector3 = Vector3.ZERO
	var target: Node3D = null
	if not hit.is_empty():
		var collider: Object = hit.get("collider")
		target = _find_interactable_parent(collider)
		if target != null:
			actions = _actions_for(target)
	# If we didn't hit an interactable (or there was no ray hit at
	# all), treat the ray as "clicked on bare ground" and offer the
	# Build menu. Estimate ground position via plane intersection
	# with the camera target y.
	if target == null or actions.is_empty():
		is_ground = true
		ground_pos = _plane_intersect(from, dir, WorldGrid.sample_height(Vector3.ZERO))
		if not hit.is_empty() and hit.has("position"):
			ground_pos = hit["position"]
		# Stream / pond? Offer the single "Draw water" action instead of
		# the build menu. Keeps the two flows from ever colliding — the
		# player can't build in water and shouldn't see build-menu rows
		# on a wet tile. "Cheap when a stream is present" is literal:
		# +3 water per 8 s of labor ≈ ~22 l / fairy-hour at full speed.
		if WorldGrid.is_water_tile(ground_pos):
			actions = _stream_water_actions(ground_pos)
		else:
			actions = _build_ground_actions()
	if actions.is_empty():
		return
	_ctx_target = target
	_ctx_is_ground = is_ground
	_ctx_ground_pos = ground_pos
	_ctx_actions = actions
	_ctx_menu.clear()
	var display_name: String
	if is_ground:
		if WorldGrid.is_water_tile(ground_pos):
			var mat: String = WorldGrid.tile_material_at(ground_pos)
			display_name = "Pond" if mat == "pond" else "Stream"
		else:
			display_name = "Bare Ground"
	else:
		display_name = _display_name_for(target)
	_ctx_menu.add_item(display_name, -1)
	_ctx_menu.set_item_disabled(0, true)
	for i in range(actions.size()):
		var a: Dictionary = actions[i]
		var label: String = "%s (~%ds)" % [a["label"], int(a["base_labor_seconds"])]
		var disabled: bool = bool(a.get("disabled", false))
		_ctx_menu.add_item(label, i)
		if disabled:
			_ctx_menu.set_item_disabled(_ctx_menu.item_count - 1, true)
	_ctx_menu.position = Vector2i(int(mb.position.x), int(mb.position.y))
	_ctx_menu.popup()


## Intersect a camera ray with a horizontal y-plane. Returns a point
## at the plane; used when the player right-clicks empty space to pick
## a build position.
func _plane_intersect(origin: Vector3, direction: Vector3, plane_y: float) -> Vector3:
	if abs(direction.y) < 0.0001:
		return origin
	var t: float = (plane_y - origin.y) / direction.y
	if t <= 0.0:
		return origin
	return origin + direction * t


func _find_interactable_parent(n: Object) -> Node3D:
	var cur: Node = n as Node
	while cur != null:
		if cur is Node3D:
			var nd: Node3D = cur as Node3D
			# The universal contract is `get_context_actions()`. If a
			# node implements it we treat it as interactable.
			if nd.has_method("get_context_actions"):
				return nd
			# Legacy detection fallbacks — piles/plants implement
			# get_context_actions now but other scripts may not yet.
			if nd.has_method("harvest") or nd.has_method("chop_and_drop"):
				return nd
			if nd.has_method("sow") or nd.has_method("transplant_first_ready"):
				return nd
			if nd.is_in_group("storage_sheds") or nd.is_in_group("soil_plots"):
				return nd
			if nd.get("pile") != null:
				return nd
		cur = cur.get_parent()
	return null


func _display_name_for(node: Node3D) -> String:
	if node.has_method("display_name"):
		return String(node.call("display_name"))
	if node.is_in_group("sprouting_beds"):
		return "Sprouting Bed"
	if node.is_in_group("storage_sheds"):
		return "Storage Shed"
	if node.is_in_group("soil_plots"):
		return "Soil Plot"
	if node.get("pile") != null:
		return "Compost Pile"
	return node.name


func _actions_for(node: Node3D) -> Array:
	if node.has_method("get_context_actions"):
		return node.call("get_context_actions")
	return []


## Build the single-item action menu for a right-click on a stream or
## pond tile. `draw_water` is a low-labor (~8 s) yield-to-storage action
## that ships +3 water into the nearest shed per trip — deliberately
## cheap because we assume the stream is always present in MVP. Future
## biomes without surface water will drought-gate this same action.
func _stream_water_actions(_pos: Vector3) -> Array:
	var out: Array = []
	out.append(Interactable.make_action(
		"draw_water", "Draw water (from stream)", 8.0,
		{}, {"water": 3.0},
		"", Interactable.DROP_STORAGE, 2
	))
	return out


## Assemble the context menu for an empty-ground right-click. Only
## shows buildings that are unlocked; cost-gating greys unaffordable
## ones but still surfaces them as a hint.
func _build_ground_actions() -> Array:
	var out: Array = []
	# Day-0 earthwork: contour swale on sloped ground. Added at the TOP so
	# the "Dig swale" row sits above the build catalogue — the intent is
	# for the player to have something meaningful to do while the compost
	# pile cooks. Hidden on flat terrain (no slope → no swale).
	if has_node("/root/Earthworks") and Earthworks.has_slope_at(_ctx_ground_pos):
		var swale_action: Dictionary = {
			"id": "earthwork:dig_swale",
			"label": "Dig swale",
			"base_labor_seconds": 90.0,
			"cost": {},
			"yield": {},
			"drop_off_at": "",
			"pickup_from": "",
			"description": "Carve a contour trench + downhill berm. Catches rainwater for adjacent tiles.",
		}
		out.append(swale_action)
	for b in Progression.available_buildings():
		var labor_s: float = float(b.get("labor", 60.0))
		var affordable: bool = bool(b.get("affordable", false))
		var label: String = b["label"]
		var cost_txt: String = _cost_text(b.get("cost", {}))
		if cost_txt != "":
			label = "%s  [%s]" % [label, cost_txt]
		var action: Dictionary = Interactable.make_action(
			"build:" + String(b["id"]), label, labor_s, b.get("cost", {}), {}, ""
		)
		action["disabled"] = not affordable
		action["building_id"] = b["id"]
		action["scene"] = b.get("scene", "")
		out.append(action)
	return out


func _cost_text(cost: Dictionary) -> String:
	var parts: Array[String] = []
	for k in cost.keys():
		parts.append("%d %s" % [int(cost[k]), String(k)])
	return ", ".join(parts)


func _on_ctx_action_selected(id: int) -> void:
	if id < 0 or id >= _ctx_actions.size():
		return
	var action: Dictionary = _ctx_actions[id]
	# Build actions (ground target, spawn a new node) stay on the
	# immediate-effect path — infrastructure isn't a "carry yield" task.
	var id_str: String = action.get("id", "")
	if id_str.begins_with("build:"):
		_handle_build_action(action)
		return
	# Earthwork — spawn a SwaleSite ghost at the clicked ground tile and
	# route the task through TaskQueue exactly like a BuildSite. On
	# completion the ghost registers with the Earthworks autoload.
	if id_str == "earthwork:dig_swale" and _ctx_is_ground:
		_handle_dig_swale_action(action)
		_clear_ctx()
		return
	# Draw-water on a stream/pond tile spawns a transient dip-point
	# proxy Node3D at the clicked position — it gives the TaskQueue a
	# concrete target to fly to, and deletes itself on completion.
	if id_str == "draw_water" and _ctx_is_ground:
		_queue_draw_water(action, _ctx_ground_pos)
		_clear_ctx()
		return
	var target: Node3D = _ctx_target
	if target == null:
		return
	# Immediate-effect, zero-labor actions (open inspector panels).
	if id_str == "open_pile_panel":
		_on_pile_clicked((target as Node3D).pile)
		_clear_ctx()
		return
	if id_str == "inspect_shed":
		Juice.pop(target.global_position + Vector3(0, 2.4, 0), "STORAGE (MVP stub)", Color(0.72, 0.62, 0.45))
		_clear_ctx()
		return
	# Spend cost upfront — keeps the action "committed" even if the
	# fairy takes a while to start. Refund if target dies before work.
	#
	# EXCEPTION: actions with `pickup_from` defer their debit to the
	# PICKUP stage inside TaskQueue (the fairy visually loads the
	# material at the shed). We still pre-check affordability here so
	# the player gets immediate "NOT ENOUGH" feedback, but we don't
	# spend — the TaskQueue pickup-flow owns the actual debit.
	var cost: Dictionary = action.get("cost", {})
	var defer_cost: bool = Interactable.requires_pickup(action)
	if defer_cost:
		if not _can_afford_cost(cost):
			Juice.pop(target.global_position + Vector3(0, 2.4, 0), "NOT ENOUGH", Color(0.75, 0.45, 0.25))
			_clear_ctx()
			return
	elif not _spend_action_cost(cost):
		Juice.pop(target.global_position + Vector3(0, 2.4, 0), "NOT ENOUGH", Color(0.75, 0.45, 0.25))
		_clear_ctx()
		return
	# Queue the task. Target.complete() runs when the labor timer fires;
	# yield deposit happens after the fairy reaches the shed.
	TaskQueue.queue_task(target, action, 10)
	var world_pos: Vector3 = target.global_position + Vector3(0, 2.4, 0)
	Juice.pop(world_pos, "> " + action["label"].to_upper(), Color(0.95, 0.76, 0.31))
	AudioManager.play("hover-tick", -4.0)
	_clear_ctx()


## Affordability-only check — does not modify FarmTotals. Used by the
## pickup-flow path so the debit can happen later (at the shed) while
## still short-circuiting unaffordable orders at queue time.
##
## The legacy `biomass` key stays supported because the FarmTotals
## property getter still sums plant_trim + twigs + wood. After the
## taxonomy refactor new content should emit specific-item costs; this
## branch exists for save-game forward-compat.
func _can_afford_cost(cost: Dictionary) -> bool:
	if cost.is_empty():
		return true
	for k in cost.keys():
		var need: float = float(cost[k])
		var key: String = String(k)
		if key == "biomass":
			if FarmTotals.biomass < need:
				return false
		elif FarmTotals.get_resource(key) < need:
			return false
	return true


## Spend every cost entry from FarmTotals. Returns false without partial
## spend when any channel lacks supply.
func _spend_action_cost(cost: Dictionary) -> bool:
	if cost.is_empty():
		return true
	# All-or-nothing: verify first.
	if not _can_afford_cost(cost):
		return false
	for k in cost.keys():
		var need2: float = float(cost[k])
		var key2: String = String(k)
		if key2 == "biomass":
			FarmTotals.spend_biomass(need2)
		else:
			FarmTotals.spend_resource(key2, need2)
	return true


func _clear_ctx() -> void:
	_ctx_target = null
	_ctx_actions = []
	_ctx_is_ground = false


func _handle_build_action(action: Dictionary) -> void:
	var building_id: StringName = action.get("building_id", &"")
	var scene_path: String = action.get("scene", "")
	var cost: Dictionary = action.get("cost", {})
	var label_raw: String = String(action.get("label", "Build site"))
	if building_id == &"" or scene_path == "":
		Juice.pop(_ctx_ground_pos + Vector3(0, 2.0, 0), "NOT IMPLEMENTED", Palette.CORAL.darkened(0.1))
		_clear_ctx()
		return
	# Water-tile guard — land buildings can't sit in the stream/pond.
	# Buildings that explicitly want water (duck_pond_edge) set
	# `action["water_ok"] = true` when surfacing.
	if WorldGrid.is_water_tile(_ctx_ground_pos) and not bool(action.get("water_ok", false)):
		Juice.pop(_ctx_ground_pos + Vector3(0, 2.0, 0), "CAN'T BUILD IN WATER", Palette.CORAL.darkened(0.1))
		AudioManager.play("hover-tick", -4.0)
		_clear_ctx()
		return
	if not Progression.spend_cost(cost):
		Juice.pop(_ctx_ground_pos + Vector3(0, 2.0, 0), "NOT ENOUGH", Palette.CORAL.darkened(0.1))
		_clear_ctx()
		return
	# Preload a quick scene validity check so we debit only when we can build.
	if load(scene_path) == null:
		Juice.pop(_ctx_ground_pos + Vector3(0, 2.0, 0), "MISSING SCENE", Palette.CORAL.darkened(0.1))
		_clear_ctx()
		return
	# Spawn a transparent BuildSite ghost at the target — fairy will
	# physically fly to it and tween through the labor time via TaskQueue.
	# No more instant scene spawns, no more stuck-fairy-on-direct-target_pos.
	var BuildSiteScript: Script = load("res://scripts/build_site.gd")
	var spawn_pos: Vector3 = _ctx_ground_pos
	spawn_pos.y = WorldGrid.sample_height(spawn_pos)
	var site: Node3D = Node3D.new()
	site.set_script(BuildSiteScript)
	site.name = "BuildSite_" + String(building_id)
	add_child(site)
	site.global_position = spawn_pos
	site.call("set_ghost", building_id, scene_path, label_raw.replace("Build ", ""))
	# Queue the task through the normal pipeline so FIFO + cancel-all + work-tick
	# feedback work exactly like every other right-click action.
	var task_action: Dictionary = action.duplicate()
	# Clear the build: prefix so the queue label reads clean.
	task_action["id"] = "build_site"
	task_action["drop_off_at"] = Interactable.DROP_NONE
	task_action["pickup_from"] = Interactable.PICKUP_NONE
	task_action["cost"] = {}  # already debited
	task_action["yield"] = {}
	TaskQueue.queue_task(site, task_action, 10)
	Juice.pop(spawn_pos + Vector3(0, 2.2, 0), "QUEUED — " + label_raw.to_upper(), Palette.HONEY)
	AudioManager.play("hover-tick", -4.0)
	_clear_ctx()


## Re-hook common signals after a BuildSite swaps its ghost for the real
## scene. Called by build_site.gd once the real node is parented here.
func _rebind_interactable(node: Node3D, building_id: StringName) -> void:
	if node == null or not is_instance_valid(node):
		return
	if node.has_signal("clicked"):
		node.clicked.connect(_on_generic_clicked)
	if node.has_signal("hover_changed"):
		node.hover_changed.connect(_on_interactable_hover)
	# Sprouting bed opens the nursery panel via the legacy "clicked" signal.
	if building_id == Progression.BUILDING_SPROUTING_BED and node.has_signal("clicked"):
		node.clicked.connect(_on_sprouting_bed_clicked)


## Queue a "Draw water" task. Spawns an invisible proxy Node3D over the
## stream tile as the fairy's flight target, then lets the normal
## TaskQueue pipeline handle travel → work → carry yield to storage.
## The proxy self-frees when its `complete()` fires, so no book-keeping
## leaks even if the player queues a dozen back-to-back.
func _queue_draw_water(action: Dictionary, pos: Vector3) -> void:
	var StreamDipPointScript: Script = load("res://scripts/stream_dip_point.gd")
	var marker: Node3D = Node3D.new()
	marker.set_script(StreamDipPointScript)
	marker.name = "StreamDipPoint"
	add_child(marker)
	marker.global_position = Vector3(pos.x, WorldGrid.sample_height(pos) + 0.1, pos.z)
	# Play the "dipping bucket" cue on queue so the player hears
	# immediate feedback, paired with a sky-tinted pop on the stream.
	var water_tint: Color = Palette.SKY.lerp(Palette.MIST, 0.20)
	Juice.pop(marker.global_position + Vector3(0, 1.8, 0), "> DRAW WATER", water_tint)
	AudioManager.play("hover-tick", -4.0)
	TaskQueue.queue_task(marker, action, 10)


func _on_generic_clicked(_target: Node3D) -> void:
	# LMB is a no-op on all world objects per the new interaction model.
	pass


func _on_sprouting_bed_clicked(bed: Node3D) -> void:
	if _nursery_panel != null and _nursery_panel.has_method("show_for"):
		_nursery_panel.show_for(bed)


## Spawn a SwaleSite ghost at the clicked ground tile and hand it to
## TaskQueue. Mirrors the BuildSite flow so the fairy travels + works
## the labor tween through the normal pipeline; on `complete()` the
## ghost registers with the Earthworks autoload (parallel moisture
## bookkeeping) and swaps its visual for the permanent trench + berm.
func _handle_dig_swale_action(action: Dictionary) -> void:
	var SwaleSiteScene: PackedScene = load("res://scenes/swale_site.tscn")
	var pos: Vector3 = _ctx_ground_pos
	pos.y = WorldGrid.sample_height(pos)
	var site: Node3D
	if SwaleSiteScene != null:
		site = SwaleSiteScene.instantiate()
	else:
		var SwaleSiteScript: Script = load("res://scripts/swale_site.gd")
		site = Node3D.new()
		site.set_script(SwaleSiteScript)
	site.name = "SwaleSite"
	add_child(site)
	site.global_position = pos
	# Earth-tone juice pop on queue so the player sees immediate intent.
	var earth_tint: Color = Palette.EARTH
	Juice.pop(pos + Vector3(0, 2.2, 0), "QUEUED — DIG SWALE", earth_tint)
	AudioManager.play("hover-tick", -4.0)
	# Route through TaskQueue — priority 10, no pickup, no drop-off.
	TaskQueue.queue_task(site, action, 10)


# =====================================================================
# UI-polish batch (appended 2026-04 — tech-tree + PopupMenu tooltips)
#
# Two features without editing any existing code:
#   1. PopupMenu tooltip rendering — reads `description` off each action
#      dict built by `_actions_for` / `_build_ground_actions` and calls
#      `set_item_tooltip` on the matching row. Hooked via the menu's
#      `about_to_popup` signal so it runs on every open without
#      rewriting `_try_open_context_menu`.
#   2. Keyboard shortcut `tech_tree` (Y by default) opens the panel that
#      the HUD mounts. We reach into the HUD to toggle it.
# =====================================================================

@onready var _polish_main_init: bool = _polish_main_setup()


func _polish_main_setup() -> bool:
	call_deferred("_polish_main_wire_deferred")
	return true


func _polish_main_wire_deferred() -> void:
	if _ctx_menu != null and not _ctx_menu.about_to_popup.is_connected(_polish_apply_tooltips):
		_ctx_menu.about_to_popup.connect(_polish_apply_tooltips)


## Re-scan `_ctx_actions` and set a tooltip on each PopupMenu row. The
## first row is the disabled header (name of the clicked object) — skip
## it. Subsequent rows map 1:1 onto `_ctx_actions` in insertion order.
func _polish_apply_tooltips() -> void:
	if _ctx_menu == null:
		return
	for i in range(_ctx_actions.size()):
		var action: Dictionary = _ctx_actions[i]
		var tooltip: String = String(action.get("description", ""))
		if tooltip == "":
			continue
		# Menu rows: index 0 is the header. Action `i` is at menu row `i+1`.
		var menu_row: int = i + 1
		if menu_row < _ctx_menu.item_count:
			_ctx_menu.set_item_tooltip(menu_row, tooltip)


## Ctrl-key shortcut handler — forwards to the HUD's tech-tree toggle.
## Uses the same action name as the HUD listener so the player feels
## one unified shortcut. Never consumes input when the HUD panel is
## missing (headless-boot edge).
func _unhandled_input(event: InputEvent) -> void:
	if not event.is_action_pressed("tech_tree"):
		return
	if _hud == null:
		return
	var panel: Node = _hud.get_node_or_null("TechTreePanel")
	if panel == null:
		# HUD builds the panel lazily; fall back to scanning children.
		for c in _hud.get_children():
			if c.has_method("toggle") and c is Control:
				panel = c
				break
	if panel != null and panel.has_method("toggle"):
		panel.call("toggle")
		get_viewport().set_input_as_handled()
