## Fairy Permaculture — Navi-based fairy character.
##
## Imports the Fairy Navi gltf (CC BY-NC-SA, author: Kaniksu) with a
## built-in idle animation. The Fairy root does the hover bob and drift
## over the terrain; the AnimationPlayer inside the imported model plays
## the idle clip on a loop.
##
## TaskQueue wiring (see autoload/task_queue.gd):
##   • On _ready() the fairy registers itself with TaskQueue.
##   • `current_task` = null ⇒ idle, will be assigned by TaskQueue.
##   • TaskQueue stage hooks fire on_task_assigned / working / carrying
##     / depositing / done so we can switch animation states + spawn /
##     remove the carrying basket visual.
extends Node3D

const IDLE_CLIP: String = "idle_Armature"

@onready var _model: Node3D = $Model
@onready var _glow: OmniLight3D = $Glow

var role: String = "composter"
var target_pos: Vector3 = Vector3.ZERO
# null when idle; a task Dictionary while the fairy is working a job.
var current_task: Variant = null

var _t: float = 0.0
# Hover height in meters ABOVE the terrain beneath the fairy (not absolute Y).
const HOVER_HEIGHT: float = 1.6
var _anim: AnimationPlayer = null

# Carrying basket visual — parented under the fairy while in the
# traveling_to_dropoff stage, removed on deposit-done.
var _basket: Node3D = null
# Work-state scale pulse. While WORKING we scale-pulse the model so the
# player sees the fairy actually doing something even without a
# dedicated work clip in the imported gltf.
var _work_pulse_t: float = 0.0
var _working: bool = false


func _ready() -> void:
	# Snap to terrain + hover height on spawn.
	position.y = _sample_terrain_y(position) + HOVER_HEIGHT
	Scheduler.day_advanced.connect(_on_day)
	_anim = _find_animation_player(_model)
	if _anim != null:
		if _anim.has_animation(IDLE_CLIP):
			var a: Animation = _anim.get_animation(IDLE_CLIP)
			a.loop_mode = Animation.LOOP_LINEAR
			_anim.play(IDLE_CLIP)
		else:
			var names: PackedStringArray = _anim.get_animation_list()
			if names.size() > 0:
				_anim.play(names[0])
		if has_node("/root/GameLog"):
			get_node("/root/GameLog").info("fairy animation: playing %s" % _anim.current_animation, "fairy")
	else:
		if has_node("/root/GameLog"):
			get_node("/root/GameLog").warn("fairy: no AnimationPlayer found in imported gltf", "fairy")
	# Register with the TaskQueue so it can hand us jobs.
	TaskQueue.register_fairy(self)


func _process(delta: float) -> void:
	_t += delta
	# Scale drift + travel by game speed — at 4× the fairy should cover
	# ground four times faster so task turnaround matches the sped-up day.
	# Cap at 8× so teleporty-looking lerps don't break.
	var speed_mul: float = 1.0
	if has_node("/root/Scheduler"):
		speed_mul = clamp(float(Scheduler.speed), 0.0, 8.0)
	# Drift toward target + face direction of travel.
	var prev: Vector3 = position
	var goal: Vector3 = target_pos
	if goal != Vector3.ZERO:
		goal.y = position.y
		var drift_t: float = clamp(0.05 * speed_mul, 0.0, 0.5)
		position = position.lerp(goal, drift_t)
		var motion: Vector3 = position - prev
		motion.y = 0.0
		if motion.length_squared() > 0.00001:
			var yaw: float = atan2(motion.x, motion.z)
			rotation.y = lerp_angle(rotation.y, yaw, 0.1)
	# Keep hovering above terrain (handles slopes + moving over stream).
	var terrain_y: float = _sample_terrain_y(position)
	var hover: float = terrain_y + HOVER_HEIGHT + sin(_t * 3.0) * 0.15
	position.y = lerp(position.y, hover, 0.2)
	# Work pulse — subtle scale bounce while actively working on a task.
	if _working and _model != null:
		_work_pulse_t += delta * 6.0
		var p: float = 1.0 + sin(_work_pulse_t) * 0.08
		_model.scale = Vector3.ONE * 0.15 * p
	elif _model != null and not _working:
		_model.scale = _model.scale.lerp(Vector3.ONE * 0.15, 0.15)
	# Keep the basket parented above us.
	if _basket != null:
		_basket.position = Vector3(0, 0.6 + sin(_t * 2.0) * 0.08, 0)


func _sample_terrain_y(at: Vector3) -> float:
	if has_node("/root/WorldGrid"):
		return get_node("/root/WorldGrid").sample_height(at)
	return 0.0


func _on_day(_day: int, _season: String, _year: int) -> void:
	# Legacy composter auto-behavior — only fires when we have NO task
	# so the TaskQueue gets first dibs. Keeps the pile breathing.
	if current_task == null and role == "composter" and Game.pile_ref != null:
		var pile_pos: Vector3 = Game.pile_ref.position
		target_pos = Vector3(pile_pos.x, position.y, pile_pos.z + 1.5)


# =====================================================================
# TaskQueue stage hooks
# =====================================================================

func on_task_assigned(_task: Dictionary) -> void:
	# Scale-pop "acknowledge" bow.
	var tw: Tween = create_tween()
	tw.tween_property(self, "scale", Vector3.ONE * 1.12, 0.1).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(self, "scale", Vector3.ONE, 0.2).set_trans(Tween.TRANS_SINE)
	AudioManager.play("hover-tick", -8.0)


func on_task_working(_task: Dictionary) -> void:
	_working = true
	_work_pulse_t = 0.0
	# Tiny thud when arriving at the target carrying a basket — signals
	# "load dropped onto the worksite" before the work animation begins.
	if _basket != null and is_instance_valid(_basket):
		AudioManager.play("biomass-chop", -10.0)


## PICKUP stage — fairy arrived at shed, no basket yet. Empty-handed
## work-pulse reads as "loading up". Paired with compost-scoop chime.
func on_task_picking_up(_task: Dictionary) -> void:
	_working = true
	_work_pulse_t = 0.0
	_remove_basket()


## PICKUP stage finished — basket spawns tinted to the cost resource.
## Fairy now travels to the target with the basket visible.
func on_task_loading_done(task: Dictionary) -> void:
	_working = false
	_spawn_basket(Interactable.pickup_basket_color_for(task.get("action", {})))
	# Tiny pop on the basket when it appears so the load-up beat lands.
	_pulse_basket()


func on_task_carrying(task: Dictionary) -> void:
	_working = false
	_spawn_basket(Interactable.basket_color_for(task.get("action", {})))


func on_task_depositing(_task: Dictionary) -> void:
	# Short pause — animated via TaskQueue DEPOSIT_SECONDS.
	_working = false


func on_task_done(_task: Dictionary) -> void:
	_working = false
	_remove_basket()


func on_task_cancelled(_task: Dictionary) -> void:
	_working = false
	_remove_basket()


# =====================================================================
# Basket visual (carrying load back to storage)
# =====================================================================

func _spawn_basket(tint: Color) -> void:
	_remove_basket()
	var basket: Node3D = Node3D.new()
	basket.name = "Basket"
	var mi: MeshInstance3D = MeshInstance3D.new()
	var box: BoxMesh = BoxMesh.new()
	box.size = Vector3(0.35, 0.25, 0.35)
	mi.mesh = box
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.albedo_color = tint
	mat.emission_enabled = true
	mat.emission = tint
	mat.emission_energy_multiplier = 0.25
	mat.roughness = 0.9
	mi.material_override = mat
	basket.add_child(mi)
	basket.position = Vector3(0, 0.6, 0)
	add_child(basket)
	_basket = basket


func _remove_basket() -> void:
	if _basket != null and is_instance_valid(_basket):
		_basket.queue_free()
	_basket = null


## Scale-pulse on the basket the moment it first appears so the player
## sees the load-up beat land. Uses a short back-ease tween.
func _pulse_basket() -> void:
	if _basket == null or not is_instance_valid(_basket):
		return
	_basket.scale = Vector3.ONE * 0.3
	var tw: Tween = _basket.create_tween()
	tw.tween_property(_basket, "scale", Vector3.ONE * 1.15, 0.12) \
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(_basket, "scale", Vector3.ONE, 0.18) \
		.set_trans(Tween.TRANS_SINE)


func _find_animation_player(root: Node) -> AnimationPlayer:
	if root == null:
		return null
	if root is AnimationPlayer:
		return root
	for child in root.get_children():
		var found: AnimationPlayer = _find_animation_player(child)
		if found != null:
			return found
	return null
