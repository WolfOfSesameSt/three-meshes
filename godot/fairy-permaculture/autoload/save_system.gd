## Fairy Permaculture — save / load system.
##
## Persists a full run to disk so the player can close the game and
## resume the same farm later. Writes to `user://saves/<slot>.sav` as
## JSON wrapped in gzip. Every autoload snapshot pairs with a restore
## pass — and every world-object scene path + position + key state is
## captured from the live scene tree.
##
## Public API:
##   SaveSystem.save(slot) -> bool
##   SaveSystem.load(slot) -> bool
##   SaveSystem.list_saves() -> Array[Dictionary]
##   SaveSystem.delete(slot) -> bool
##
## Triggers (input actions bound in project.godot):
##   F5 → save_game → save("quicksave") + Juice pop "Saved"
##   F9 → load_game → load("quicksave") + Juice pop "Loaded"
##   Every 5 in-game days → silent autosave to slot "autosave".
##   App-exit / window-close → final autosave.
##
## Schema version 1. A header dictionary rides alongside the payload so
## future migrations can opt into a per-section hydrator. Missing fields
## are tolerated — absence degrades to whatever default the target
## autoload / node already carries. Unknown scene paths are skipped with
## a warning instead of crashing the restore.
##
## Read-only dependencies — every other autoload (FarmTotals, Scheduler,
## Progression, WorldState, WorldGrid, TaskQueue, StorageIndex) is
## accessed through its public API or already-existing serialize /
## hydrate helpers. No file outside this save system is edited.
extends Node

signal save_completed(slot: String, ok: bool)
signal load_completed(slot: String, ok: bool)

const SCHEMA_VERSION: int = 1
const SAVE_DIR: String = "user://saves"
const AUTOSAVE_SLOT: String = "autosave"
const QUICK_SLOT: String = "quicksave"
const AUTOSAVE_EVERY_N_DAYS: int = 5

## Scene-path → group-name routing for restore. Each capture_world_object
## helper tags the object dict with a `scene` path; on restore we load
## that scene and call a per-type rehydrator.
const SCENE_PLANT: String          = "res://scenes/plant.tscn"
const SCENE_COMPOST_PILE: String   = "res://scenes/compost_pile.tscn"
const SCENE_SOIL_PLOT: String      = "res://scenes/soil_plot.tscn"
const SCENE_SPROUTING_BED: String  = "res://scenes/sprouting_bed.tscn"
const SCENE_STORAGE_SHED: String   = "res://scenes/storage_shed.tscn"
const SCENE_CHIPPER: String        = "res://scenes/chipper.tscn"
const SCENE_FAIRY: String          = "res://scenes/fairy.tscn"
const SCENE_DECOR: String          = "res://scenes/decor_item.tscn"

## Groups that get wiped on a load before respawning from the snapshot.
const WIPE_GROUPS: Array[String] = [
	"plants", "soil_plots", "sprouting_beds", "compost_piles",
	"storage_sheds", "chippers", "decor", "animals", "fairies",
	"carcasses",
]

var _autosave_countdown_days: int = AUTOSAVE_EVERY_N_DAYS
var _exit_save_fired: bool = false


func _ready() -> void:
	# Ensure the save directory exists up front — cheap, idempotent.
	DirAccess.make_dir_recursive_absolute(
		ProjectSettings.globalize_path(SAVE_DIR)
	)
	# Intercept the window-close so we get a last-chance autosave. The
	# GameLog autoload already set `auto_accept_quit = true`; we check
	# that in _notification.
	set_process_input(true)
	# Hook day-tick for silent autosaves. Scheduler is an autoload that
	# booted before us (order defined in project.godot).
	if Engine.has_singleton("Scheduler") or has_node("/root/Scheduler"):
		Scheduler.day_advanced.connect(_on_day_advanced)


func _input(event: InputEvent) -> void:
	if event.is_action_pressed("save_game"):
		var ok: bool = save(QUICK_SLOT)
		_toast("Saved" if ok else "Save failed", ok)
	elif event.is_action_pressed("load_game"):
		var ok: bool = self.load(QUICK_SLOT)
		_toast("Loaded" if ok else "Load failed", ok)


func _notification(what: int) -> void:
	# Last-chance autosave on window close / app quit. Guarded so we
	# don't hit the disk twice when Godot fires both NOTIFICATION_WM_
	# CLOSE_REQUEST and NOTIFICATION_PREDELETE in the same shutdown.
	if _exit_save_fired:
		return
	if what == NOTIFICATION_WM_CLOSE_REQUEST or what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		_exit_save_fired = true
		save(AUTOSAVE_SLOT)


# =====================================================================
# Public API
# =====================================================================

## Serialize the live run into `user://saves/<slot>.sav`. Returns false
## if the scene tree is missing a current_scene (headless-boot edge) or
## the file couldn't be opened. Autoloads remain the source of truth
## for FarmTotals / Scheduler / Progression / WorldState / WorldGrid /
## TaskQueue; world objects come from the scene tree groups.
func save(slot: String = AUTOSAVE_SLOT) -> bool:
	var payload: Dictionary = {
		"schema": SCHEMA_VERSION,
		"meta": _build_meta(slot),
		"farm_totals": _capture_farm_totals(),
		"scheduler": Scheduler.serialize(),
		"progression": _capture_progression(),
		"world_state": _capture_world_state(),
		"world_grid": _capture_world_grid(),
		"tasks": _capture_tasks(),
		"objects": _capture_world_objects(),
	}
	var ok: bool = _write_payload(slot, payload)
	GameLog.event("save_%s" % ("ok" if ok else "fail"), {
		"slot": slot,
		"schema": SCHEMA_VERSION,
		"objects": (payload["objects"] as Array).size(),
	})
	emit_signal("save_completed", slot, ok)
	return ok


## Restore the run from `user://saves/<slot>.sav`. Clears every wipe-
## group member, re-applies autoload state, then respawns every world
## object from its scene + saved fields. Returns false if the slot
## doesn't exist or the file is unreadable; the live run is left
## untouched in that case.
func load(slot: String = AUTOSAVE_SLOT) -> bool:
	var payload: Dictionary = _read_payload(slot)
	if payload.is_empty():
		GameLog.event("load_fail", {"slot": slot, "reason": "missing"})
		emit_signal("load_completed", slot, false)
		return false
	# Accept older schemas by falling through the optional-section reads.
	var schema: int = int(payload.get("schema", 0))
	if schema > SCHEMA_VERSION:
		GameLog.warn("save_system: slot '%s' has future schema %d (game is %d), attempting best-effort load" % [
			slot, schema, SCHEMA_VERSION,
		], "save_system")
	var main: Node = get_tree().current_scene
	if main == null:
		emit_signal("load_completed", slot, false)
		return false
	# Cancel every queued task so the fresh worker assignments don't race
	# with the stale ones during wipe.
	if has_node("/root/TaskQueue"):
		TaskQueue.cancel_all()
	_wipe_world_groups(main)
	# Restore in deterministic order: data layer first (FarmTotals,
	# Scheduler, Progression, WorldState, WorldGrid tiles), then world
	# objects (so their _ready() hooks see fresh autoload state), then
	# TaskQueue (which needs its target Nodes to exist).
	_restore_farm_totals(payload.get("farm_totals", {}))
	Scheduler.hydrate(payload.get("scheduler", {}))
	_restore_progression(payload.get("progression", {}))
	_restore_world_state(payload.get("world_state", {}))
	_restore_world_grid(payload.get("world_grid", {}))
	_restore_world_objects(main, payload.get("objects", []))
	# Defer task restore by a frame so the new spawn's _ready() hooks
	# (StorageIndex.register_shed, TaskQueue.register_fairy) run first.
	call_deferred("_restore_tasks_deferred", payload.get("tasks", []))
	# Nudge HUD + any listeners.
	FarmTotals.emit_signal("changed")
	WorldGrid.emit_signal("tiles_updated")
	GameLog.event("load_ok", {
		"slot": slot,
		"schema": schema,
		"objects": (payload.get("objects", []) as Array).size(),
	})
	emit_signal("load_completed", slot, true)
	return true


## Enumerate `user://saves/*.sav`. Each entry is the header that was
## written at save time (slot, timestamp, day, season, year, schema,
## preview). Sorted newest-first.
func list_saves() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var dir: DirAccess = DirAccess.open(SAVE_DIR)
	if dir == null:
		return out
	dir.list_dir_begin()
	var fname: String = dir.get_next()
	while fname != "":
		if not dir.current_is_dir() and fname.ends_with(".sav"):
			var slot: String = fname.get_basename()
			var payload: Dictionary = _read_payload(slot)
			if not payload.is_empty():
				var meta: Dictionary = payload.get("meta", {})
				meta["slot"] = slot
				meta["schema"] = int(payload.get("schema", 0))
				out.append(meta)
		fname = dir.get_next()
	dir.list_dir_end()
	out.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return String(a.get("timestamp", "")) > String(b.get("timestamp", ""))
	)
	return out


## Delete a slot. Returns true when the file was present and removed.
func delete(slot: String) -> bool:
	var path: String = _slot_path(slot)
	if not FileAccess.file_exists(path):
		return false
	var err: int = DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	return err == OK


# =====================================================================
# Capture helpers — read-only probes against autoloads + scene tree
# =====================================================================

func _build_meta(slot: String) -> Dictionary:
	var season_name: String = "spring"
	var day: int = 0
	var year: int = 0
	if has_node("/root/Scheduler"):
		season_name = Scheduler.current_season()
		day = Scheduler.day
		year = Scheduler.year
	return {
		"slot": slot,
		"timestamp": Time.get_datetime_string_from_system(),
		"day": day,
		"season": season_name,
		"year": year,
		"godot": Engine.get_version_info().get("string", ""),
		"preview": "Year %d, %s day %d" % [year, season_name.capitalize(), day],
	}


## Snapshot every FarmTotals stock plus the fairy-food bucket + tutorial
## flags. FarmTotals.stocks is a Dictionary of String → float; we copy
## it through `get_resource` so we lean on the public accessor and stay
## robust to any future internal storage change.
func _capture_farm_totals() -> Dictionary:
	var stocks: Dictionary = {}
	for k in FarmTotals.RESOURCE_TYPES:
		stocks[String(k)] = FarmTotals.get_resource(String(k))
	return {
		"stocks": stocks,
		"fairy_food": (FarmTotals.fairy_food as Dictionary).duplicate(),
		"fruit_picked": FarmTotals.fruit_picked,
		"pile_feeds": FarmTotals.pile_feeds,
		"compost_harvested": FarmTotals.compost_harvested,
		"pile_hot_seen": FarmTotals.pile_hot_seen,
	}


func _capture_progression() -> Dictionary:
	var unlocks: Array[String] = []
	for id in Progression.unlocked_buildings:
		unlocks.append(String(id))
	return {
		"tutorial_step": Progression.tutorial_step,
		"unlocked_buildings": unlocks,
		"storage_built": Progression.storage_built,
		"sprouting_built": Progression.sprouting_built,
		"first_egg_collected": Progression.first_egg_collected,
		"first_carcass_spawned": Progression.first_carcass_spawned,
		"first_butcher_done": Progression.first_butcher_done,
		"first_bone_meal_fired": Progression.first_bone_meal_fired,
	}


func _capture_world_state() -> Dictionary:
	return { "vitality": WorldState.vitality }


## Encode the whole 128×128 tile grid. Seven per-tile floats → a single
## PackedFloat32Array, packed as base64 so JSON stays compact. Restore
## unpacks in the same order.
func _capture_world_grid() -> Dictionary:
	var size: int = WorldGrid.GRID_SIZE
	var total: int = size * size * 7
	var buf: PackedFloat32Array = PackedFloat32Array()
	buf.resize(total)
	var i: int = 0
	for z in range(size):
		var row: Array = WorldGrid.tiles[z]
		for x in range(size):
			var t: WorldGrid.Tile = row[x]
			buf[i + 0] = t.elevation_m
			buf[i + 1] = t.moisture
			buf[i + 2] = t.surface_water_cm
			buf[i + 3] = t.om_pct
			buf[i + 4] = t.base_water_depth_cm
			# Packed booleans + material index live in the 2 remaining floats.
			buf[i + 5] = 1.0 if t.is_persistent_water else 0.0
			buf[i + 6] = _material_to_id(t.material)
			i += 7
	# Convert to bytes → base64. PackedFloat32Array.to_byte_array() gives
	# little-endian IEEE-754 which restore reverses.
	var bytes: PackedByteArray = buf.to_byte_array()
	return {
		"size": size,
		"bytes_b64": Marshalls.raw_to_base64(bytes),
	}


## Snapshot the live TaskQueue. We capture task id / priority / stage /
## progress / action + target_path so restore can re-queue the exact
## same jobs. Fairies re-register themselves with TaskQueue on spawn
## and pick the tasks back up via the normal idle-assignment loop.
func _capture_tasks() -> Array:
	var out: Array = []
	var main: Node = get_tree().current_scene
	if main == null:
		return out
	for t in TaskQueue.active_tasks():
		var target: Node = t.get("target") as Node
		if target == null or not is_instance_valid(target):
			continue
		# Store the main-relative path so restore can resolve it after
		# the world objects are respawned under the same node names.
		var target_path: String = main.get_path_to(target) if main.is_ancestor_of(target) else target.get_path()
		out.append({
			"id": int(t.get("id", 0)),
			"priority": int(t.get("priority", 10)),
			"stage": String(t.get("stage", TaskQueue.STAGE_QUEUED)),
			"progress": float(t.get("progress", 0.0)),
			"labor_target": float(t.get("labor_target", 0.0)),
			"pickup_done": bool(t.get("pickup_done", false)),
			"action": t.get("action", {}).duplicate(true),
			"target_path": String(target_path),
			"cumulative_yield": t.get("cumulative_yield", {}).duplicate(true),
		})
	return out


## Walk the scene tree and snapshot every world object we know how to
## rehydrate. We match on scene_file_path — decor_item / plant / pile /
## shed / etc. all share clean root scenes so the mapping is 1:1.
func _capture_world_objects() -> Array:
	var out: Array = []
	var main: Node = get_tree().current_scene
	if main == null:
		return out
	for group_name in WIPE_GROUPS:
		for n in get_tree().get_nodes_in_group(group_name):
			if n == null or not is_instance_valid(n):
				continue
			if not (n is Node3D):
				continue
			var node3d: Node3D = n
			var dict: Dictionary = _capture_object_common(node3d)
			# Merge the per-type fields. Each branch below is cheap —
			# only reads properties that already exist on the node.
			match group_name:
				"plants":          _capture_plant_fields(node3d, dict)
				"soil_plots":      _capture_soil_plot_fields(node3d, dict)
				"sprouting_beds":  _capture_sprouting_bed_fields(node3d, dict)
				"compost_piles":   _capture_pile_fields(node3d, dict)
				"storage_sheds":   _capture_shed_fields(node3d, dict)
				"chippers":        _capture_chipper_fields(node3d, dict)
				"decor":           _capture_decor_fields(node3d, dict)
				"fairies":         _capture_fairy_fields(node3d, dict)
				"animals":         _capture_animal_fields(node3d, dict)
				"carcasses":       _capture_carcass_fields(node3d, dict)
			# The pile scene registers into the "compost_piles" group on
			# first _ready() call, but the live project adds piles via
			# main.gd's _piles array — they're not in any group. Handle
			# that fallback by scanning for the compost_pile scene path
			# in the second pass below.
			dict["group"] = group_name
			out.append(dict)
	# Second pass: scripts that don't add_to_group (compost_pile, fairy).
	# Walk the main's direct children + recurse one level.
	_capture_ungrouped_piles_and_fairies(main, out)
	return out


func _capture_ungrouped_piles_and_fairies(root: Node, out: Array) -> void:
	# Piles + fairies aren't auto-added to groups today; scan by scene
	# path instead. Cheap — only one level deep in the live main scene.
	var seen: Dictionary = {}
	for entry in out:
		seen[String(entry.get("path", ""))] = true
	var stack: Array = [root]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		for c in n.get_children():
			if c is Node3D:
				var sfp: String = (c as Node).scene_file_path
				var rel: String = String(root.get_path_to(c)) if root.is_ancestor_of(c) else ""
				if sfp == SCENE_COMPOST_PILE and not seen.has(rel):
					var dict: Dictionary = _capture_object_common(c)
					_capture_pile_fields(c, dict)
					dict["group"] = "compost_piles"
					out.append(dict)
					seen[String(dict.get("path", ""))] = true
				elif sfp == SCENE_FAIRY and not seen.has(rel):
					var dict2: Dictionary = _capture_object_common(c)
					_capture_fairy_fields(c, dict2)
					dict2["group"] = "fairies"
					out.append(dict2)
					seen[String(dict2.get("path", ""))] = true
			# Recurse only into Node3D containers that might hold these
			# — keeps the walk bounded.
			if c.get_child_count() > 0 and not (c is Camera3D):
				stack.append(c)


func _capture_object_common(n: Node3D) -> Dictionary:
	var main: Node = get_tree().current_scene
	var path: String = String(main.get_path_to(n)) if (main != null and main.is_ancestor_of(n)) else String(n.get_path())
	return {
		"name": n.name,
		"path": path,
		"scene": n.scene_file_path,
		"position": [n.position.x, n.position.y, n.position.z],
		"rotation": [n.rotation.x, n.rotation.y, n.rotation.z],
		"scale":    [n.scale.x, n.scale.y, n.scale.z],
	}


func _capture_plant_fields(n: Node3D, d: Dictionary) -> void:
	d["species_id"]   = String(n.get("species_id"))
	d["stage"]        = String(n.get("stage"))
	d["growth_stage"] = String(n.get("growth_stage"))
	d["age_days"]     = int(n.get("age_days"))
	d["ripe_amount"]  = float(n.get("ripe_amount"))
	d["ripe_count"]   = int(n.get("ripe_count"))
	d["is_pioneer"]   = bool(n.get("is_pioneer"))


func _capture_soil_plot_fields(n: Node3D, d: Dictionary) -> void:
	d["state"]              = String(n.get("state"))
	d["om_pct"]             = float(n.get("om_pct"))
	d["moisture_pct"]       = float(n.get("moisture_pct"))
	d["moisture_retention"] = float(n.get("moisture_retention"))
	d["mulched"]            = bool(n.get("_mulched"))


func _capture_sprouting_bed_fields(n: Node3D, d: Dictionary) -> void:
	# Slots are a plain Array[null | {species, days}], safe to dup.
	var slots_v: Variant = n.get("slots")
	if slots_v is Array:
		d["slots"] = (slots_v as Array).duplicate(true)


func _capture_pile_fields(n: Node3D, d: Dictionary) -> void:
	# Pile is a RefCounted nested on compost_pile.gd; it holds all the
	# cook-state. We capture the member fields the pile state machine
	# reads so the restored pile resumes mid-cook.
	var pile_v: Variant = n.get("pile")
	if pile_v == null:
		return
	var pile: Pile = pile_v as Pile
	d["pile"] = {
		"variant":                 pile.variant,
		"state":                   pile.state,
		"ingredients":             (pile.ingredients as Array).duplicate(true),
		"volume_m3":               pile.volume_m3,
		"current_cn":              pile.current_cn,
		"moisture_pct":            pile.moisture_pct,
		"temp_c":                  pile.temp_c,
		"turns_total":             pile.turns_total,
		"days_in_state":           pile.days_in_state,
		"days_until_turn_window":  pile.days_until_turn_window,
		"days_dry":                pile.days_dry,
		"rain_days_streak":        pile.rain_days_streak,
		"covered":                 pile.covered,
		"q_hot_days":              pile.q_hot_days,
		"q_cn_in_band_days":       pile.q_cn_in_band_days,
		"q_moisture_in_band_days": pile.q_moisture_in_band_days,
		"q_inoculants":            (pile.q_inoculants as Array).duplicate(true),
		"q_curing_completed":      pile.q_curing_completed,
		"q_anaerobic_flag":        pile.q_anaerobic_flag,
		"q_ammonia_flag":          pile.q_ammonia_flag,
	}


func _capture_shed_fields(n: Node3D, d: Dictionary) -> void:
	d["capacity_per_type"] = int(n.get("capacity_per_type"))


func _capture_chipper_fields(_n: Node3D, _d: Dictionary) -> void:
	# Chipper is stateless outside of the transient work animation.
	pass


func _capture_decor_fields(n: Node3D, d: Dictionary) -> void:
	d["kind"]          = String(n.get("kind"))
	d["variant_seed"]  = int(n.get("variant_seed"))
	d["visual_scale"]  = float(n.get("visual_scale"))


func _capture_fairy_fields(n: Node3D, d: Dictionary) -> void:
	d["role"] = String(n.get("role"))


func _capture_animal_fields(n: Node3D, d: Dictionary) -> void:
	# Best-effort — AnimalEntity exposes typed fields but most are
	# stateless-ish (age / needs). We grab the common ones.
	d["species_id"]    = String(n.get("species_id"))
	d["age_days"]      = int(n.get("age_days"))
	d["max_age_days"]  = int(n.get("max_age_days"))
	d["hunger"]        = float(n.get("hunger"))
	d["thirst"]        = float(n.get("thirst"))


func _capture_carcass_fields(_n: Node3D, _d: Dictionary) -> void:
	# Carcass schema isn't shipped yet; header-only capture until the
	# animal loop lands it. Missing fields are tolerated on restore.
	pass


# =====================================================================
# Restore helpers
# =====================================================================

func _wipe_world_groups(_main: Node) -> void:
	for group_name in WIPE_GROUPS:
		for n in get_tree().get_nodes_in_group(group_name):
			if n == null or not is_instance_valid(n):
				continue
			if n is Node:
				(n as Node).queue_free()
	# Piles + fairies that weren't in groups still need to go.
	_wipe_ungrouped_by_scene(_main, SCENE_COMPOST_PILE)
	_wipe_ungrouped_by_scene(_main, SCENE_FAIRY)


func _wipe_ungrouped_by_scene(root: Node, scene_path: String) -> void:
	var stack: Array = [root]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		for c in n.get_children():
			if c is Node3D and (c as Node).scene_file_path == scene_path:
				c.queue_free()
				continue
			if c.get_child_count() > 0 and not (c is Camera3D):
				stack.append(c)


func _restore_farm_totals(data: Dictionary) -> void:
	if data.is_empty():
		return
	var stocks: Dictionary = data.get("stocks", {})
	for k in FarmTotals.RESOURCE_TYPES:
		if stocks.has(String(k)):
			FarmTotals.stocks[String(k)] = float(stocks[String(k)])
	var food: Dictionary = data.get("fairy_food", {})
	for fk in food.keys():
		if (FarmTotals.fairy_food as Dictionary).has(String(fk)):
			FarmTotals.fairy_food[String(fk)] = float(food[fk])
	FarmTotals.fruit_picked      = int(data.get("fruit_picked", FarmTotals.fruit_picked))
	FarmTotals.pile_feeds        = int(data.get("pile_feeds", FarmTotals.pile_feeds))
	FarmTotals.compost_harvested = int(data.get("compost_harvested", FarmTotals.compost_harvested))
	FarmTotals.pile_hot_seen     = bool(data.get("pile_hot_seen", FarmTotals.pile_hot_seen))


func _restore_progression(data: Dictionary) -> void:
	if data.is_empty():
		return
	Progression.tutorial_step   = int(data.get("tutorial_step", Progression.tutorial_step))
	Progression.storage_built   = bool(data.get("storage_built", Progression.storage_built))
	Progression.sprouting_built = bool(data.get("sprouting_built", Progression.sprouting_built))
	Progression.first_egg_collected    = bool(data.get("first_egg_collected", Progression.first_egg_collected))
	Progression.first_carcass_spawned  = bool(data.get("first_carcass_spawned", Progression.first_carcass_spawned))
	Progression.first_butcher_done     = bool(data.get("first_butcher_done", Progression.first_butcher_done))
	Progression.first_bone_meal_fired  = bool(data.get("first_bone_meal_fired", Progression.first_bone_meal_fired))
	var unlocks: Array = data.get("unlocked_buildings", [])
	var typed_unlocks: Array[StringName] = []
	for u in unlocks:
		typed_unlocks.append(StringName(String(u)))
	Progression.unlocked_buildings = typed_unlocks
	Progression.emit_signal("unlocks_changed")


func _restore_world_state(data: Dictionary) -> void:
	if data.is_empty():
		return
	WorldState.set_vitality(float(data.get("vitality", WorldState.vitality)))


func _restore_world_grid(data: Dictionary) -> void:
	if data.is_empty():
		return
	var size: int = int(data.get("size", WorldGrid.GRID_SIZE))
	if size != WorldGrid.GRID_SIZE:
		GameLog.warn("save_system: world grid size mismatch (%d vs %d) — skipping tile restore" % [
			size, WorldGrid.GRID_SIZE,
		], "save_system")
		return
	var b64: String = String(data.get("bytes_b64", ""))
	if b64 == "":
		return
	var bytes: PackedByteArray = Marshalls.base64_to_raw(b64)
	var buf: PackedFloat32Array = bytes.to_float32_array()
	var expected: int = size * size * 7
	if buf.size() < expected:
		GameLog.warn("save_system: world grid buffer truncated (%d < %d)" % [
			buf.size(), expected,
		], "save_system")
		return
	var i: int = 0
	for z in range(size):
		var row: Array = WorldGrid.tiles[z]
		for x in range(size):
			var t: WorldGrid.Tile = row[x]
			t.elevation_m          = buf[i + 0]
			t.moisture             = buf[i + 1]
			t.surface_water_cm     = buf[i + 2]
			t.om_pct               = buf[i + 3]
			t.base_water_depth_cm  = buf[i + 4]
			t.is_persistent_water  = buf[i + 5] > 0.5
			t.material             = _id_to_material(int(buf[i + 6]))
			i += 7
	WorldGrid.emit_signal("tiles_updated")


## Respawn every captured world object. Each entry carries its scene
## path, so we instantiate that scene, add it under `main`, re-apply
## transform + per-type state, and call any `_ready`-driven follow-ups
## the object needs to settle in (e.g. StorageIndex.register_shed runs
## automatically inside shed._ready()).
func _restore_world_objects(main: Node, objects: Array) -> void:
	for raw in objects:
		var o: Dictionary = raw
		var scene_path: String = String(o.get("scene", ""))
		if scene_path == "":
			continue
		if not ResourceLoader.exists(scene_path):
			GameLog.warn("save_system: missing scene %s — skipping" % scene_path, "save_system")
			continue
		var scene: PackedScene = ResourceLoader.load(scene_path) as PackedScene
		if scene == null:
			continue
		var n: Node = scene.instantiate()
		if not (n is Node3D):
			n.queue_free()
			continue
		# Name + attach first so _ready() sees a valid tree.
		var desired_name: String = String(o.get("name", ""))
		if desired_name != "":
			n.name = desired_name
		main.add_child(n)
		var node3d: Node3D = n
		var pos: Array = o.get("position", [0.0, 0.0, 0.0])
		var rot: Array = o.get("rotation", [0.0, 0.0, 0.0])
		var scl: Array = o.get("scale", [1.0, 1.0, 1.0])
		node3d.position = Vector3(float(pos[0]), float(pos[1]), float(pos[2]))
		node3d.rotation = Vector3(float(rot[0]), float(rot[1]), float(rot[2]))
		node3d.scale    = Vector3(float(scl[0]), float(scl[1]), float(scl[2]))
		# Per-type field rehydrate — done after add_child so setters can
		# trigger their own visual updates via connected signals.
		var group_name: String = String(o.get("group", ""))
		match group_name:
			"plants":         _restore_plant_fields(node3d, o, main)
			"soil_plots":     _restore_soil_plot_fields(node3d, o)
			"sprouting_beds": _restore_sprouting_bed_fields(node3d, o)
			"compost_piles":  _restore_pile_fields(node3d, o)
			"storage_sheds":  _restore_shed_fields(node3d, o)
			"chippers":       pass
			"decor":          _restore_decor_fields(node3d, o)
			"fairies":        _restore_fairy_fields(node3d, o)
			"animals":        _restore_animal_fields(node3d, o)
			"carcasses":      pass


func _restore_plant_fields(n: Node3D, o: Dictionary, main: Node) -> void:
	if o.has("species_id"):
		if n.has_method("setup"):
			n.call("setup", String(o["species_id"]))
	n.set("stage",        String(o.get("stage", "mature")))
	n.set("growth_stage", String(o.get("growth_stage", "fruiting")))
	n.set("age_days",     int(o.get("age_days", 0)))
	n.set("ripe_amount",  float(o.get("ripe_amount", 0.0)))
	n.set("ripe_count",   int(o.get("ripe_count", 0)))
	n.set("is_pioneer",   bool(o.get("is_pioneer", false)))
	# Register with the main scene so hover + click signals connect.
	if main != null and main.has_method("register_plant"):
		main.call("register_plant", n)


func _restore_soil_plot_fields(n: Node3D, o: Dictionary) -> void:
	n.set("state",              String(o.get("state", "bare")))
	n.set("om_pct",             float(o.get("om_pct", 0.4)))
	n.set("moisture_pct",       float(o.get("moisture_pct", 35.0)))
	n.set("moisture_retention", float(o.get("moisture_retention", 1.0)))
	n.set("_mulched",           bool(o.get("mulched", false)))


func _restore_sprouting_bed_fields(n: Node3D, o: Dictionary) -> void:
	var slots: Variant = o.get("slots", null)
	if slots is Array:
		n.set("slots", (slots as Array).duplicate(true))


func _restore_pile_fields(n: Node3D, o: Dictionary) -> void:
	var d: Dictionary = o.get("pile", {})
	if d.is_empty():
		return
	var pile_v: Variant = n.get("pile")
	if pile_v == null:
		return
	var pile: Pile = pile_v as Pile
	pile.variant                 = String(d.get("variant", pile.variant))
	pile.state                   = String(d.get("state", pile.state))
	pile.ingredients             = (d.get("ingredients", []) as Array).duplicate(true)
	pile.volume_m3               = float(d.get("volume_m3", pile.volume_m3))
	pile.current_cn              = float(d.get("current_cn", pile.current_cn))
	pile.moisture_pct            = float(d.get("moisture_pct", pile.moisture_pct))
	pile.temp_c                  = float(d.get("temp_c", pile.temp_c))
	pile.turns_total             = int(d.get("turns_total", pile.turns_total))
	pile.days_in_state           = int(d.get("days_in_state", pile.days_in_state))
	pile.days_until_turn_window  = int(d.get("days_until_turn_window", pile.days_until_turn_window))
	pile.days_dry                = int(d.get("days_dry", pile.days_dry))
	pile.rain_days_streak        = int(d.get("rain_days_streak", pile.rain_days_streak))
	pile.covered                 = bool(d.get("covered", pile.covered))
	pile.q_hot_days              = int(d.get("q_hot_days", pile.q_hot_days))
	pile.q_cn_in_band_days       = int(d.get("q_cn_in_band_days", pile.q_cn_in_band_days))
	pile.q_moisture_in_band_days = int(d.get("q_moisture_in_band_days", pile.q_moisture_in_band_days))
	pile.q_inoculants            = (d.get("q_inoculants", []) as Array).duplicate(true)
	pile.q_curing_completed      = bool(d.get("q_curing_completed", pile.q_curing_completed))
	pile.q_anaerobic_flag        = bool(d.get("q_anaerobic_flag", pile.q_anaerobic_flag))
	pile.q_ammonia_flag          = bool(d.get("q_ammonia_flag", pile.q_ammonia_flag))


func _restore_shed_fields(n: Node3D, o: Dictionary) -> void:
	if o.has("capacity_per_type"):
		n.set("capacity_per_type", int(o["capacity_per_type"]))


func _restore_decor_fields(n: Node3D, o: Dictionary) -> void:
	# decor_item reads kind / variant_seed / visual_scale in _ready(), so
	# we have to override BEFORE the scene body runs. _ready() has already
	# fired by this point, but decor_item.configure() reassigns safely;
	# we call it and trigger a rebuild if it hasn't been built yet.
	if n.has_method("configure"):
		n.call(
			"configure",
			String(o.get("kind", "rock")),
			float(o.get("visual_scale", 1.0)),
			int(o.get("variant_seed", 0)),
		)


func _restore_fairy_fields(n: Node3D, o: Dictionary) -> void:
	n.set("role", String(o.get("role", "composter")))


func _restore_animal_fields(n: Node3D, o: Dictionary) -> void:
	if o.has("species_id") and n.has_method("setup"):
		n.call("setup", String(o["species_id"]))
	n.set("age_days",     int(o.get("age_days", 0)))
	n.set("max_age_days", int(o.get("max_age_days", 1080)))
	n.set("hunger",       float(o.get("hunger", 0.0)))
	n.set("thirst",       float(o.get("thirst", 0.0)))


func _restore_tasks_deferred(tasks: Array) -> void:
	var main: Node = get_tree().current_scene
	if main == null:
		return
	for raw in tasks:
		var t: Dictionary = raw
		var path: String = String(t.get("target_path", ""))
		if path == "":
			continue
		var target: Node = main.get_node_or_null(path)
		if target == null and path.begins_with("/"):
			target = get_node_or_null(path)
		if target == null or not is_instance_valid(target):
			continue
		var action: Dictionary = t.get("action", {})
		var priority: int = int(t.get("priority", 10))
		var qt: Dictionary = TaskQueue.queue_task(target as Node3D, action, priority)
		# Seed the progress / pickup flags so mid-cook restores resume
		# where they left off instead of redoing whole labor from scratch.
		qt["progress"] = float(t.get("progress", 0.0))
		qt["pickup_done"] = bool(t.get("pickup_done", false))
		var cy: Variant = t.get("cumulative_yield", null)
		if cy is Dictionary:
			qt["cumulative_yield"] = (cy as Dictionary).duplicate(true)


# =====================================================================
# Autosave on day-tick + HUD toast
# =====================================================================

func _on_day_advanced(_day: int, _season: String, _year: int) -> void:
	_autosave_countdown_days -= 1
	if _autosave_countdown_days <= 0:
		_autosave_countdown_days = AUTOSAVE_EVERY_N_DAYS
		save(AUTOSAVE_SLOT)


func _toast(text: String, ok: bool) -> void:
	if has_node("/root/Juice"):
		var col: Color = Color(0.95, 0.76, 0.31) if ok else Color(0.75, 0.45, 0.25)
		var pos: Vector3 = Vector3.ZERO
		var cam: Node = get_viewport().get_camera_3d() if get_viewport() != null else null
		if cam is Camera3D:
			pos = (cam as Camera3D).global_position + (cam as Camera3D).global_transform.basis.z * -4.0
		Juice.pop(pos + Vector3(0, 1.2, 0), text, col)
	if has_node("/root/AudioManager"):
		AudioManager.play("compost-finish" if ok else "hover-tick", -6.0)


# =====================================================================
# Disk IO
# =====================================================================

func _slot_path(slot: String) -> String:
	var clean: String = slot.strip_edges()
	if clean == "":
		clean = AUTOSAVE_SLOT
	return "%s/%s.sav" % [SAVE_DIR, clean]


func _write_payload(slot: String, payload: Dictionary) -> bool:
	DirAccess.make_dir_recursive_absolute(
		ProjectSettings.globalize_path(SAVE_DIR)
	)
	var path: String = _slot_path(slot)
	var f: FileAccess = FileAccess.open_compressed(
		path, FileAccess.WRITE, FileAccess.COMPRESSION_GZIP
	)
	if f == null:
		GameLog.error("save_system: FileAccess.open_compressed failed for %s (err %d)" % [
			path, FileAccess.get_open_error(),
		], "save_system")
		return false
	var text: String = JSON.stringify(payload)
	f.store_string(text)
	f.close()
	return true


func _read_payload(slot: String) -> Dictionary:
	var path: String = _slot_path(slot)
	if not FileAccess.file_exists(path):
		return {}
	var f: FileAccess = FileAccess.open_compressed(
		path, FileAccess.READ, FileAccess.COMPRESSION_GZIP
	)
	if f == null:
		return {}
	var text: String = f.get_as_text()
	f.close()
	var parsed: Variant = JSON.parse_string(text)
	if parsed is Dictionary:
		return parsed
	return {}


# =====================================================================
# Tile material id ↔ name table
# =====================================================================

const _MATERIALS: Array[String] = [
	"loam", "sandy", "clay", "meadow", "bank",
	"stream_bed", "pond", "bare", "forest_floor",
]


func _material_to_id(m: String) -> float:
	var idx: int = _MATERIALS.find(m)
	return float(idx) if idx >= 0 else 0.0


func _id_to_material(id: int) -> String:
	if id < 0 or id >= _MATERIALS.size():
		return "loam"
	return _MATERIALS[id]
