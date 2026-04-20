## Fairy Permaculture — juice manager.
##
## Floating number-pops + 3D particle bursts + tiny camera bump + the
## environmental FX framework (sparkles / steam / kiln plume / rain /
## leaves / pollinators / pond ripple / bloom preset).
##
## Port of the JS `ui/juice/index.js`. Scene scripts call:
##
##   Juice.pop(world_pos, "+2 FRUIT", Color.YELLOW)
##   Juice.burst(world_pos, Color(1, 0.8, 0.4), 12)
##   Juice.bump(0.4)
##
## Environmental FX helpers (all are no-ops when the target is null):
##
##   Juice.attach_sparkle(fairy_node)
##   Juice.compost_steam_on(pile_node, true)
##   Juice.kiln_plume_on(kiln_node, true)
##   Juice.rain_on(0.6)
##   Juice.wind_set("autumn", 0.8)
##   Juice.pollinator_cloud_on(plant_node, true)
##   Juice.pond_ripple_at(world_pos)
##   Juice.set_glow_preset("medium")
##
## All visuals resolve against the main camera — no wiring needed.
extends Node

# --- FX subscene resource paths. Preload as PackedScenes so the first
# `.instantiate()` call doesn't stall.
const FX_SPARKLE_PATH      := "res://scenes/fx/fairy_sparkle.tscn"
const FX_COMPOST_STEAM     := "res://scenes/fx/compost_steam.tscn"
const FX_KILN_PLUME        := "res://scenes/fx/kiln_plume.tscn"
const FX_RAIN_STREAKS      := "res://scenes/fx/rain_streaks.tscn"
const FX_WIND_LEAVES       := "res://scenes/fx/wind_leaves.tscn"
const FX_POLLINATORS       := "res://scenes/fx/pollinators.tscn"
const FX_POND_RIPPLE       := "res://scenes/fx/pond_ripple.tscn"

# Names we give to attached FX children so we can find & update them
# across repeated calls without spawning duplicates.
const SPARKLE_CHILD_NAME: String      = "__FxSparkle"
const STEAM_CHILD_NAME: String        = "__FxCompostSteam"
const KILN_CHILD_NAME: String         = "__FxKilnPlume"
const POLLINATOR_CHILD_NAME: String   = "__FxPollinators"

var _camera: Camera3D
var _ui_layer: CanvasLayer
var _world_root: Node3D
var _bump_offset: Vector3 = Vector3.ZERO
var _bump_decay: float = 0.0

# Singletons owned by Juice (only one per scene at a time).
var _rain_instance: Node3D
var _leaves_instance: Node3D


func _ready() -> void:
	_ui_layer = CanvasLayer.new()
	_ui_layer.layer = 200
	add_child(_ui_layer)
	# Deferred look-up — Main may not have entered the tree yet.
	call_deferred("_bind_camera")
	# Connect to TaskQueue.task_work_tick once the autoload is alive so
	# every 1-second beat during the WORKING stage fires a material-
	# specific particle + subtle sfx. Defensive — TaskQueue may not be
	# registered yet depending on autoload order.
	call_deferred("_bind_work_tick")


func _bind_work_tick() -> void:
	var tq: Node = get_node_or_null("/root/TaskQueue")
	if tq != null and tq.has_signal("task_work_tick"):
		if not tq.is_connected("task_work_tick", _on_task_work_tick):
			tq.connect("task_work_tick", _on_task_work_tick)


## Per-second beat while a fairy is working on a task. Picks a material-
## specific particle color + short sfx based on the action id prefix so
## "fairy floating doing nothing" reads as "fairy actively chopping /
## quarrying / digging / scooping / firing".
func _on_task_work_tick(task: Dictionary) -> void:
	var target: Variant = task.get("target")
	if target == null or not (target is Node3D) or not is_instance_valid(target):
		return
	var pos: Vector3 = (target as Node3D).global_position + Vector3(0, 0.5, 0)
	var action: Dictionary = task.get("action", {})
	var id: String = String(action.get("id", ""))
	var fx: Dictionary = _work_fx_for_action_id(id)
	var color: Color = fx.get("color", Color(0.55, 0.77, 0.48))
	var count: int = int(fx.get("count", 4))
	var sfx: String = String(fx.get("sfx", ""))
	var sfx_db: float = float(fx.get("db", -16.0))
	burst(pos, color, count)
	if sfx != "" and AudioManager != null:
		AudioManager.play(sfx, sfx_db)


## Maps an action id to (particle color, count, sfx, db). Palette-sourced
## so every tint traces back to the canonical warm-pastel set.
func _work_fx_for_action_id(id: String) -> Dictionary:
	# Tree felling / pruning / deadwood / twigs — woody brown chips + thwack.
	if id.begins_with("chop_") or id == "prune" \
			or id == "gather_deadwood" or id == "gather_twigs":
		return {"color": Palette.EARTH, "count": 6, "sfx": "biomass-chop", "db": -12.0}
	# Plant chop-and-drop / harvest / seed gathering / forage — green leaf puff.
	if id == "chop_drop" or id.begins_with("harvest") \
			or id.begins_with("forage"):
		return {"color": Palette.MEADOW, "count": 5, "sfx": "biomass-chop", "db": -16.0}
	# Stone quarry — warm-stone dust + metallic tink (reuse hover-tick).
	if id == "quarry":
		return {"color": Palette.WARM_STONE, "count": 7, "sfx": "hover-tick", "db": -8.0}
	# Compost pile feeding / turning / scooping — earthy thud.
	if id.begins_with("add_") or id == "turn_pile" or id == "scoop_finished":
		return {"color": Palette.COMPOST, "count": 4, "sfx": "compost-scoop", "db": -14.0}
	# Water actions — sky-blue splash.
	if id.begins_with("water_") or id == "draw_water":
		return {"color": Palette.SKY.lerp(Palette.MIST, 0.2), "count": 5, "sfx": "water-splash", "db": -10.0}
	# Kiln firing — honey-coral ember burst + crackle.
	if id.begins_with("fire_"):
		return {"color": Palette.HONEY.lerp(Palette.CORAL, 0.3), "count": 5, "sfx": "kiln-crackle-loop", "db": -18.0}
	# Amendment application — fine dust, appropriate tint per amendment.
	if id.begins_with("apply_"):
		var tint: Color = Palette.COMPOST
		if id == "apply_bone_meal":
			tint = Palette.WARM_STONE
		elif id == "apply_biochar":
			tint = Palette.COMPOST.lerp(Palette.INK, 0.25)
		return {"color": tint, "count": 5, "sfx": "bone-meal-pop", "db": -14.0}
	# Chipper — chip particles.
	if id.begins_with("chip_"):
		return {"color": Palette.EARTH.lerp(Palette.HONEY, 0.3), "count": 6, "sfx": "biomass-chop", "db": -10.0}
	# Earthworks / swales / digging — dirt clods + shovel plank sound.
	if id.begins_with("earthwork:") or id == "dig_swale":
		return {"color": Palette.EARTH, "count": 7, "sfx": "bed-build-plank", "db": -12.0}
	# Build site — plank-settling sound + wood color.
	if id == "build_site" or id.begins_with("build:"):
		return {"color": Palette.EARTH.lerp(Palette.HONEY, 0.2), "count": 5, "sfx": "bed-build-plank", "db": -10.0}
	# Fallback — soft meadow puff + hover tick.
	return {"color": Palette.MEADOW, "count": 3, "sfx": "hover-tick", "db": -18.0}


func _bind_camera() -> void:
	var camera: Camera3D = get_tree().root.get_viewport().get_camera_3d()
	if camera:
		_camera = camera
		_world_root = camera.get_tree().current_scene as Node3D


func _process(delta: float) -> void:
	if _camera == null:
		_bind_camera()
	if _bump_decay > 0.0:
		_bump_decay -= delta * 5.0
		if _bump_decay <= 0.0:
			_bump_decay = 0.0
			_bump_offset = Vector3.ZERO


## Floating number-pop. Projects a world position to the screen and
## animates a Label up + fade + auto-free.
func pop(world_pos: Vector3, text: String, color: Color = Color(0.95, 0.76, 0.31)) -> void:
	if _camera == null: return
	if not _camera.is_position_in_frustum(world_pos): return
	var screen_pos: Vector2 = _camera.unproject_position(world_pos)

	var lbl: Label = Label.new()
	lbl.text = text
	lbl.add_theme_color_override("font_color", color)
	lbl.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
	lbl.add_theme_constant_override("outline_size", 4)
	lbl.add_theme_font_size_override("font_size", 28)
	lbl.position = screen_pos - Vector2(40, 0)
	lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_ui_layer.add_child(lbl)

	var tween: Tween = lbl.create_tween().set_parallel(true)
	tween.tween_property(lbl, "position:y", lbl.position.y - 90.0, 1.1).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_property(lbl, "modulate:a", 0.0, 1.1).set_trans(Tween.TRANS_CUBIC)
	tween.tween_property(lbl, "scale", Vector2(1.15, 1.15), 0.1)
	tween.chain().tween_property(lbl, "scale", Vector2(1.0, 1.0), 0.25)
	tween.finished.connect(lbl.queue_free)


## 3D particle burst at a world position. Color tints the particles;
## count tunes density. Cheap — spawns a GPUParticles3D that emits once
## and frees itself.
func burst(world_pos: Vector3, color: Color = Color(1, 0.85, 0.5), count: int = 16) -> void:
	if _world_root == null:
		_bind_camera()
		if _world_root == null: return

	var p: GPUParticles3D = GPUParticles3D.new()
	p.position = world_pos
	p.amount = count
	p.one_shot = true
	p.emitting = true
	p.lifetime = 0.8
	p.explosiveness = 1.0

	var mesh: BoxMesh = BoxMesh.new()
	mesh.size = Vector3(0.14, 0.14, 0.14)
	p.draw_pass_1 = mesh

	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.albedo_color = color
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mesh.material = mat

	var pmat: ParticleProcessMaterial = ParticleProcessMaterial.new()
	pmat.direction = Vector3(0, 1, 0)
	pmat.spread = 120.0
	pmat.initial_velocity_min = 2.0
	pmat.initial_velocity_max = 4.5
	pmat.gravity = Vector3(0, -9.8, 0)
	pmat.scale_min = 0.6
	pmat.scale_max = 1.3
	var curve: Curve = Curve.new()
	curve.add_point(Vector2(0, 1))
	curve.add_point(Vector2(1, 0))
	var ct: CurveTexture = CurveTexture.new()
	ct.curve = curve
	pmat.scale_curve = ct
	p.process_material = pmat

	_world_root.add_child(p)
	# Free after the particles finish.
	var timer: SceneTreeTimer = get_tree().create_timer(p.lifetime + 0.1)
	timer.timeout.connect(p.queue_free)


## Mild camera bump. Pure visual — re-apply per harvest.
func bump(strength: float = 0.4) -> void:
	if _camera == null: return
	var angle: float = randf() * TAU
	_bump_offset = Vector3(cos(angle) * strength, 0, sin(angle) * strength)
	_bump_decay = 1.0
	# The main camera rig doesn't read this directly yet — we apply the
	# bump by nudging the camera's position each frame below.
	_camera.position += _bump_offset * 0.3
	var tween: Tween = _camera.create_tween()
	tween.tween_property(_camera, "position", _camera.position - _bump_offset * 0.3, 0.25)


# ==================================================================== #
# Environmental FX helpers. Each helper is a no-op when target is null.
# ==================================================================== #


## Attach a fairy sparkle trail to a Node3D (typically a fairy). Idempotent:
## calling repeatedly on the same node is a no-op after the first call.
func attach_sparkle(node: Node3D) -> Node3D:
	if node == null: return null
	var existing: Node = node.get_node_or_null(SPARKLE_CHILD_NAME)
	if existing != null:
		return existing as Node3D
	var scene: PackedScene = load(FX_SPARKLE_PATH)
	if scene == null: return null
	var inst: Node3D = scene.instantiate() as Node3D
	if inst == null: return null
	inst.name = SPARKLE_CHILD_NAME
	node.add_child(inst)
	return inst


## Toggle compost steam on a pile node. `on=true` spawns the emitter as
## a child if absent, or re-enables emission. `on=false` disables it.
func compost_steam_on(node: Node3D, on: bool) -> void:
	if node == null: return
	var existing: Node = node.get_node_or_null(STEAM_CHILD_NAME)
	if on:
		if existing == null:
			var scene: PackedScene = load(FX_COMPOST_STEAM)
			if scene == null: return
			var inst: Node3D = scene.instantiate() as Node3D
			if inst == null: return
			inst.name = STEAM_CHILD_NAME
			node.add_child(inst)
		else:
			if existing.has_method("set_active"):
				existing.call("set_active", true)
	else:
		if existing != null and existing.has_method("set_active"):
			existing.call("set_active", false)


## Toggle a kiln plume on a kiln node. Same pattern as compost steam.
func kiln_plume_on(node: Node3D, on: bool) -> void:
	if node == null: return
	var existing: Node = node.get_node_or_null(KILN_CHILD_NAME)
	if on:
		if existing == null:
			var scene: PackedScene = load(FX_KILN_PLUME)
			if scene == null: return
			var inst: Node3D = scene.instantiate() as Node3D
			if inst == null: return
			inst.name = KILN_CHILD_NAME
			node.add_child(inst)
		else:
			if existing.has_method("set_active"):
				existing.call("set_active", true)
	else:
		if existing != null and existing.has_method("set_active"):
			existing.call("set_active", false)


## Global rain dial. `intensity 0..1`. Spawns a single camera-following
## streak emitter if needed.
func rain_on(intensity: float) -> void:
	if _world_root == null:
		_bind_camera()
	if _world_root == null: return
	if _rain_instance == null or not is_instance_valid(_rain_instance):
		var scene: PackedScene = load(FX_RAIN_STREAKS)
		if scene == null: return
		_rain_instance = scene.instantiate() as Node3D
		if _rain_instance == null: return
		_world_root.add_child(_rain_instance)
	if _rain_instance.has_method("set_intensity"):
		_rain_instance.call("set_intensity", clamp(intensity, 0.0, 1.0))


## Global wind-borne debris (leaves / petals) for the current season.
##   season: "spring" | "summer" | "autumn" | "winter"
##   strength: 0..1
func wind_set(season: String, strength: float) -> void:
	if _world_root == null:
		_bind_camera()
	if _world_root == null: return
	if _leaves_instance == null or not is_instance_valid(_leaves_instance):
		var scene: PackedScene = load(FX_WIND_LEAVES)
		if scene == null: return
		_leaves_instance = scene.instantiate() as Node3D
		if _leaves_instance == null: return
		_world_root.add_child(_leaves_instance)
	if _leaves_instance.has_method("set_season"):
		_leaves_instance.call("set_season", season, clamp(strength, 0.0, 1.0))


## Toggle pollinator cloud on a flowering plant.
func pollinator_cloud_on(node: Node3D, on: bool) -> void:
	if node == null: return
	var existing: Node = node.get_node_or_null(POLLINATOR_CHILD_NAME)
	if on:
		if existing == null:
			var scene: PackedScene = load(FX_POLLINATORS)
			if scene == null: return
			var inst: Node3D = scene.instantiate() as Node3D
			if inst == null: return
			inst.name = POLLINATOR_CHILD_NAME
			node.add_child(inst)
		else:
			if existing.has_method("set_active"):
				existing.call("set_active", true)
	else:
		if existing != null and existing.has_method("set_active"):
			existing.call("set_active", false)


## Spawn a one-shot pond ripple at a world position. Self-frees on finish.
func pond_ripple_at(pos: Vector3) -> Node3D:
	if _world_root == null:
		_bind_camera()
	if _world_root == null: return null
	var scene: PackedScene = load(FX_POND_RIPPLE)
	if scene == null: return null
	var inst: Node3D = scene.instantiate() as Node3D
	if inst == null: return null
	_world_root.add_child(inst)
	inst.global_position = pos
	return inst


## Patch the scene's WorldEnvironment bloom/glow at runtime. `level` is
## one of "off" | "subtle" | "medium" | "strong". Default is off. This
## only writes when a WorldEnvironment is found — does nothing otherwise.
## GL Compatibility ignores the actual glow render pass, but we still
## set the properties so that when we ship on Forward+ the same call
## takes effect, and so that headless parse-checks stay clean.
func set_glow_preset(level: String) -> void:
	var root: Node = get_tree().current_scene if get_tree() else null
	if root == null: return
	var we: WorldEnvironment = root.find_child("WorldEnvironment", true, false) as WorldEnvironment
	if we == null or we.environment == null: return
	var env: Environment = we.environment
	match level:
		"off":
			env.glow_enabled = false
		"subtle":
			env.glow_enabled = true
			env.glow_intensity = 0.4
			env.glow_bloom = 0.1
			env.glow_hdr_threshold = 1.1
			env.glow_strength = 0.8
		"medium":
			env.glow_enabled = true
			env.glow_intensity = 0.8
			env.glow_bloom = 0.2
			env.glow_hdr_threshold = 1.0
			env.glow_strength = 1.0
		"strong":
			env.glow_enabled = true
			env.glow_intensity = 1.4
			env.glow_bloom = 0.35
			env.glow_hdr_threshold = 0.9
			env.glow_strength = 1.2
		_:
			env.glow_enabled = false
