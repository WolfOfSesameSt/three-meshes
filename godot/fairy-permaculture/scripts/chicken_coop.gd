## Fairy Permaculture — Chicken Coop habitat structure.
##
## Spawns + shelters a chicken flock. Owns the feeder fallback contents,
## the egg buffer (one whole egg per 1.25 days at 0.8/day, per hen), and
## the "close for night" toggle that will gate predator events in a
## later agent pass.
##
## Locked design refs (project_animal_system.md):
##   • Habitat-gated introduction — chickens spawn via right-click →
##     "Add chicks" (cost: plant_trim + seeds starter fee).
##   • Feeder is the winter safety net, not the default. Fill via
##     right-click → "Fill feeder" (plant_trim hauled from storage).
##   • Nightly close toggle protects flock from predators (predator
##     event framework is OUT OF SCOPE for phase 1 — TODO).
##
## Visuals: wooden box body + gabled roof + 4 fence posts forming a
## small yard. All colors trace to Palette.* per the happy-palette rule.
extends StaticBody3D


signal clicked(coop: Node3D)
signal hover_changed(coop: Node3D, hovered: bool)


const CHICKEN_SCENE: PackedScene = preload("res://scenes/animals/chicken.tscn")
const FLOCK_CAP: int = 6
const STARTER_FLOCK_SIZE: int = 2
const FEEDER_CAPACITY: float = 12.0
const EGG_COLLECT_THRESHOLD: int = 1

# Phase-3 containment model. AnimalEntity pulls these via
# register_with_habitat(). Chickens get a neutral fence — 1.0 = hard clamp
# baseline, slightly reduced by their fence_strength_bias (data/animals.json).
@export var containment_radius: float = 5.0
@export var containment_strength: float = 0.95
# Fairies walk up to these animals (right-click "Round up ...") when an
# escape roll lands. Appended by AnimalEntity._trigger_escape.
var escaped_animals: Array = []


# ---- Materials (all colors traced to Palette.*) ----
var _wall_mat: StandardMaterial3D
var _roof_mat: StandardMaterial3D
var _yard_mat: StandardMaterial3D


# ---- Persistent state ----
var flock: Array = []            # AnimalEntity subclasses
var feeder_contents: Dictionary = { "plant_trim": 0.0, "seeds": 0.0 }
var is_closed: bool = false
var egg_buffer: float = 0.0      # fractional eggs laid but uncollected
var accumulated_eggs: int = 0    # whole eggs awaiting player collection
var _in_construction: bool = false
var _t: float = 0.0
var _lay_pulse_t: float = 0.0


# ---- Cached mesh nodes ----
@onready var _walls: MeshInstance3D = $Walls
@onready var _roof: MeshInstance3D = $Roof
@onready var _door: MeshInstance3D = $Door
@onready var _nest: MeshInstance3D = $Nest
@onready var _egg_badge: MeshInstance3D = $EggBadge
@onready var _click_shape: CollisionShape3D = $CollisionShape3D
@onready var _fence_posts: Node3D = $FencePosts


func _ready() -> void:
	input_ray_pickable = true
	add_to_group("chicken_coops")
	add_to_group("animal_habitats")
	_build_materials()
	_build_fence_yard()
	mouse_entered.connect(_on_mouse_enter)
	mouse_exited.connect(_on_mouse_exit)
	input_event.connect(_on_click)
	var sched: Node = get_node_or_null("/root/Scheduler")
	if sched != null and sched.has_signal("day_advanced"):
		sched.day_advanced.connect(_on_day_advanced)


func _build_materials() -> void:
	# Warm wooden walls — EARTH. Slightly lightened top (roof) with
	# HONEY-tinted straw bedding vibe.
	_wall_mat = StandardMaterial3D.new()
	_wall_mat.albedo_color = Palette.EARTH
	_walls.material_override = _wall_mat

	_roof_mat = StandardMaterial3D.new()
	# Gabled roof reads as weathered shingles: WARM_STONE lerped toward
	# HONEY so it sits warm under the ortho camera light.
	_roof_mat.albedo_color = Palette.WARM_STONE.lerp(Palette.HONEY, 0.30)
	_roof.material_override = _roof_mat

	var door_mat: StandardMaterial3D = StandardMaterial3D.new()
	door_mat.albedo_color = Palette.COMPOST.lerp(Palette.EARTH, 0.4)
	_door.material_override = door_mat

	# Straw nest — honey + straw-dry so the eggs read clearly when laid.
	var nest_mat: StandardMaterial3D = StandardMaterial3D.new()
	nest_mat.albedo_color = Palette.STRAW_DRY.lerp(Palette.HONEY, 0.35)
	_nest.material_override = nest_mat

	# Egg badge — starts invisible, pops when an egg lands. Parchment-
	# tinted so it reads as a clean egg against the EARTH walls.
	var egg_mat: StandardMaterial3D = StandardMaterial3D.new()
	egg_mat.albedo_color = Color(Palette.PARCHMENT.r, Palette.PARCHMENT.g, Palette.PARCHMENT.b, 0.0)
	egg_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	egg_mat.shading_mode = BaseMaterial3D.SHADING_MODE_PER_PIXEL
	_egg_badge.material_override = egg_mat
	_egg_badge.visible = false

	_yard_mat = StandardMaterial3D.new()
	_yard_mat.albedo_color = Palette.EARTH.lerp(Palette.WARM_STONE, 0.35)


func _build_fence_yard() -> void:
	# 4 simple posts demarcating the yard. Cheap primitives; the yard
	# "ground paint" will come from the tile renderer in a later agent.
	var corners: Array[Vector3] = [
		Vector3(-1.6, 0.3, -1.6),
		Vector3(1.6, 0.3, -1.6),
		Vector3(-1.6, 0.3, 1.6),
		Vector3(1.6, 0.3, 1.6),
	]
	for c in corners:
		var post: MeshInstance3D = MeshInstance3D.new()
		var cm: CylinderMesh = CylinderMesh.new()
		cm.top_radius = 0.06
		cm.bottom_radius = 0.08
		cm.height = 0.6
		post.mesh = cm
		post.material_override = _yard_mat
		post.position = c
		_fence_posts.add_child(post)


# =============================================================
# Hover + construction + process
# =============================================================

func _on_mouse_enter() -> void:
	set_highlight(true)
	emit_signal("hover_changed", self, true)


func _on_mouse_exit() -> void:
	set_highlight(false)
	emit_signal("hover_changed", self, false)


func set_highlight(on: bool) -> void:
	for m in [_wall_mat, _roof_mat]:
		if m == null:
			continue
		m.rim_enabled = on
		m.rim = 0.9 if on else 0.0
		m.rim_tint = 0.75
		m.emission_enabled = on
		m.emission = Palette.HONEY
		m.emission_energy_multiplier = 0.3 if on else 0.0


func _on_click(_cam: Node, _event: InputEvent, _pos: Vector3, _norm: Vector3, _shape: int) -> void:
	emit_signal("clicked", self)


func _process(delta: float) -> void:
	_t += delta
	if _in_construction:
		return
	# Gentle roof breathe.
	if _roof:
		_roof.position.y = 2.35 + 0.015 * sin(_t * 1.3)
	# Egg badge pulse whenever at least one egg sits in the nest.
	if accumulated_eggs > 0:
		_egg_badge.visible = true
		var pulse: float = 0.7 + 0.25 * sin(_t * 2.4)
		var m: StandardMaterial3D = _egg_badge.material_override as StandardMaterial3D
		if m != null:
			m.albedo_color.a = pulse
	else:
		var m2: StandardMaterial3D = _egg_badge.material_override as StandardMaterial3D
		if m2 != null:
			m2.albedo_color.a = lerp(m2.albedo_color.a, 0.0, 0.1)
			if m2.albedo_color.a < 0.03:
				_egg_badge.visible = false

	# Closed-at-night visual tell: door darkens + roof tint dims.
	var target_door_alpha: float = 1.0 if is_closed else 0.85
	var dm: StandardMaterial3D = _door.material_override as StandardMaterial3D
	if dm != null:
		dm.albedo_color.a = target_door_alpha


func start_construction(duration_s: float) -> void:
	_in_construction = true
	scale = Vector3.ONE * 0.1
	for m in [_wall_mat, _roof_mat]:
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		m.albedo_color.a = 0.35
	var tw: Tween = create_tween()
	tw.tween_property(self, "scale", Vector3.ONE, duration_s) \
		.set_trans(Tween.TRANS_SINE)
	tw.tween_callback(_on_construction_complete)


func _on_construction_complete() -> void:
	_in_construction = false
	for m in [_wall_mat, _roof_mat]:
		m.transparency = BaseMaterial3D.TRANSPARENCY_DISABLED
		m.albedo_color.a = 1.0
	if get_node_or_null("/root/Juice") != null:
		Juice.burst(global_position + Vector3(0, 1.8, 0), Palette.EARTH, 22)
		Juice.pop(global_position + Vector3(0, 2.2, 0), "COOP READY", Palette.HONEY)
	if get_node_or_null("/root/AudioManager") != null:
		AudioManager.play("compost-scoop", -4.0)


# =============================================================
# Day-tick (propagates to flock)
# =============================================================

func _on_day_advanced(_d: int, _s: String, _y: int) -> void:
	# Each chicken runs its own day_tick via AnimalEntity's Scheduler
	# subscription — the coop just watches for flock size drift and
	# nudges the egg badge. We DON'T call day_tick on the flock here to
	# avoid double-ticking; see AnimalEntity._ready for the subscription.
	_prune_flock()


func _prune_flock() -> void:
	var live: Array = []
	for a in flock:
		if a != null and is_instance_valid(a):
			live.append(a)
	flock = live


# =============================================================
# Flock + feeder + egg API (called by AnimalEntity + TaskQueue hooks)
# =============================================================

## Consume up to `amt` of feeder contents. Returns the amount actually
## consumed (0.0 when empty). Animals call this as the forage fallback.
func consume_feeder(amt: float) -> float:
	if amt <= 0.0:
		return 0.0
	# Draw proportionally from plant_trim first, then seeds.
	var remaining: float = amt
	for key in ["plant_trim", "seeds"]:
		var have: float = float(feeder_contents.get(key, 0.0))
		if have <= 0.0:
			continue
		var take: float = min(have, remaining)
		feeder_contents[key] = have - take
		remaining -= take
		if remaining <= 0.0:
			break
	return amt - remaining


## Add to the feeder from a fairy-delivered pickup-flow task. Called by
## the TaskQueue complete() hook (see fill_feeder action below).
func add_to_feeder(kind: String, amount: float) -> void:
	if not feeder_contents.has(kind):
		feeder_contents[kind] = 0.0
	var cap_left: float = FEEDER_CAPACITY - _total_feeder()
	var actual: float = min(amount, max(0.0, cap_left))
	feeder_contents[kind] = float(feeder_contents[kind]) + actual


func _total_feeder() -> float:
	var s: float = 0.0
	for k in feeder_contents.keys():
		s += float(feeder_contents[k])
	return s


## Called by AnimalEntity on egg output. We buffer the fractional count
## so a 0.8 eggs/day hen drops one whole egg every ~1.25 days, then
## surface the accumulated count as a collectible nest pile.
func on_egg_laid(amount: float) -> void:
	egg_buffer += amount
	var whole: int = int(floor(egg_buffer))
	if whole > 0:
		egg_buffer -= float(whole)
		accumulated_eggs += whole
		_lay_pulse_t = 0.6
		if get_node_or_null("/root/Juice") != null:
			Juice.pop(global_position + Vector3(0, 2.6, 0), "+ EGG", Palette.HONEY)
		if get_node_or_null("/root/AudioManager") != null:
			AudioManager.play("hover-tick", -4.0)


## AnimalEntity.die() notifies us so we can drop the dead hen from the
## flock array. The carcass itself is a separate node parented to the
## scene root, NOT to us — so it stays visible after queue_free here.
func on_animal_died(a: AnimalEntity) -> void:
	flock.erase(a)


## Spawn a new chicken into the yard. Called by the add_chicks context
## action once the starter fee is debited. Returns the spawned animal.
func spawn_chicken(offset: Vector3 = Vector3.ZERO) -> AnimalEntity:
	var chick: AnimalEntity = CHICKEN_SCENE.instantiate() as AnimalEntity
	# Parent onto the scene root so the chicken lives through coop
	# destruction and any `Scheduler` day-tick signals route to the
	# animal directly — plus the main scene script can decorate it
	# later (hover ring, click area) without touching the coop.
	var host: Node = get_parent()
	if host == null:
		host = self
	host.add_child(chick)
	var spawn: Vector3 = global_position + Vector3(1.4, 0, 1.4) + offset
	chick.global_position = spawn
	chick.register_with_habitat(self)
	flock.append(chick)
	return chick


# =============================================================
# Context menu
# =============================================================

func get_context_actions() -> Array:
	_prune_flock()
	var out: Array = []
	# Add chicks — starter fee. Costs plant_trim (straw bedding starter)
	# + seeds (chicken scratch). We haul via the pickup flow; the labor
	# covers transport + placement of the chicks in the yard.
	if flock.size() < STARTER_FLOCK_SIZE + 2:
		var can_afford_chicks: bool = (
			FarmTotals.get_resource(FarmTotals.PLANT_TRIM) >= 4.0
			and FarmTotals.get_resource(FarmTotals.SEEDS) >= 2.0
		)
		var add_chicks_action: Dictionary = Interactable.make_action(
			"add_chicks", "Add chicks (x2)", 20.0,
			# Pickup only carries one resource type in phase 1; we debit
			# BOTH here at queue time by marking the action "no pickup"
			# (drop_off_at NONE + no pickup_from) — main.gd spends the
			# cost upfront via _spend_action_cost before enqueuing. This
			# keeps the double-debit logic out of the TaskQueue.
			{ "plant_trim": 4.0, "seeds": 2.0 },
			{}, "", Interactable.DROP_NONE, 1,
		)
		add_chicks_action["disabled"] = not can_afford_chicks
		out.append(add_chicks_action)

	# Fill feeder — pickup-flow: fairy hauls plant_trim from the nearest
	# shed to the coop. Cost is material so pickup auto-engages.
	var fill_feeder: Dictionary = Interactable.make_action(
		"fill_feeder", "Fill feeder", 15.0,
		{ "plant_trim": 3.0 }, {}, "", Interactable.DROP_NONE, 1,
	)
	fill_feeder["disabled"] = FarmTotals.get_resource(FarmTotals.PLANT_TRIM) < 3.0
	out.append(fill_feeder)

	# Collect eggs — yield flows to storage via the normal drop-off path.
	if accumulated_eggs > 0:
		var collect: Dictionary = Interactable.make_action(
			"collect_eggs",
			"Collect eggs (%d)" % accumulated_eggs,
			6.0,
			{},
			{ "fruit": float(accumulated_eggs) },  # eggs route into fruit-food channel for phase 1
			"", Interactable.DROP_STORAGE, 1,
		)
		out.append(collect)

	# Close / open coop toggle. Zero labor: the player is just issuing
	# the directive; a fairy would come close it in a later pass.
	out.append(Interactable.make_action(
		"open_coop" if is_closed else "close_coop",
		"Open coop" if is_closed else "Close coop for night",
		4.0, {}, {}, "", Interactable.DROP_NONE, 1,
	))

	# Clean coop — manual OM bump on nearest soil plot. Polish / optional.
	out.append(Interactable.make_action(
		"clean_coop", "Clean coop (bump nearby OM)", 14.0,
		{}, {}, "", Interactable.DROP_NONE, 2,
	))
	return out


func display_name() -> String:
	return "Chicken Coop (%d/%d)" % [flock.size(), FLOCK_CAP]


## Called by TaskQueue after the labor timer finishes (in-place action)
## or before drop-off (yield-carrying action).
func complete(action: Dictionary) -> void:
	var id: String = String(action.get("id", ""))
	match id:
		"add_chicks":
			# Starter flock: 2 chicks. main.gd already debited the cost.
			for i in range(STARTER_FLOCK_SIZE):
				var off: Vector3 = Vector3(0.4 * float(i), 0, 0.4 * float(i))
				spawn_chicken(off)
			if get_node_or_null("/root/Juice") != null:
				Juice.pop(global_position + Vector3(0, 2.6, 0), "+ 2 CHICKS", Palette.HONEY)
			if get_node_or_null("/root/AudioManager") != null:
				AudioManager.play("compost-scoop", -4.0)
		"fill_feeder":
			# The TaskQueue pickup stage already debited plant_trim from
			# storage; we just add to the feeder bucket here.
			add_to_feeder("plant_trim", 3.0)
			if get_node_or_null("/root/Juice") != null:
				Juice.pop(global_position + Vector3(0, 2.6, 0), "FEEDER +3", Palette.MEADOW)
		"collect_eggs":
			# Eggs route to storage via drop_off_at=storage_shed. The
			# yield on the action dict is auto-deposited; we just zero
			# our nest buffer + fire the first-egg milestone.
			var taken: int = accumulated_eggs
			accumulated_eggs = 0
			if taken > 0:
				var prog: Node = get_node_or_null("/root/Progression")
				if prog != null and prog.has_method("mark_first_egg"):
					prog.call("mark_first_egg")
			if get_node_or_null("/root/Juice") != null:
				Juice.pop(global_position + Vector3(0, 2.6, 0), "✦ %d EGGS" % taken, Palette.HONEY)
		"close_coop":
			is_closed = true
			# TODO: wire predator-event protection here in the predator
			# system agent pass (out of phase 1 scope).
			if get_node_or_null("/root/Juice") != null:
				Juice.pop(global_position + Vector3(0, 2.4, 0), "COOP CLOSED", Palette.COMPOST)
		"open_coop":
			is_closed = false
			if get_node_or_null("/root/Juice") != null:
				Juice.pop(global_position + Vector3(0, 2.4, 0), "COOP OPEN", Palette.HONEY)
		"clean_coop":
			# Phase 1: just emit the event; the soil-engine agent wires
			# the OM bump. Keeps the loop visible in GameLog so sim tests
			# can assert it ran.
			if get_node_or_null("/root/GameLog") != null:
				GameLog.event("coop_cleaned", { "pos": [global_position.x, global_position.z] })
			if get_node_or_null("/root/Juice") != null:
				Juice.pop(global_position + Vector3(0, 2.4, 0), "CLEANED", Palette.MEADOW)
