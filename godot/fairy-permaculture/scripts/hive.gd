## Fairy Permaculture — Warré hive (late-game honey scaling).
##
## The mason_bee_tubes habitat drips 0.5 honey/day day-1. The Warré
## hive is the late-game scaling path that eclipses that trickle — a
## proper honeybee colony whose output is gated by the richness of the
## flora in its FORAGE_RADIUS_M and ramps with bee_count.
##
## Visible state changes (game-feedback philosophy):
##   - comb_fullness drives a visible comb-fill mesh inside the top tier
##     that scales 0→1 in Y. Player can see "ready to harvest" at a glance.
##   - bee_swarm_visible flag reads by fx/bee_swarm — daytime + bloom
##     season + bee_count>0 spawns a small multimesh of bee dots around
##     the hive. Visibility is entirely stateful, no silent ticks.
##   - Full comb fires a one-shot paired banner + chime.
##
## Production math (per day-tick):
##   nectar = sum_over_tiles_in_range(flower_density × season_match × nectar_value)
##   diversity_bonus = 1.0 + 0.05 × min(distinct_species_in_range, 6)
##   ramp = clamp(bee_count / BEE_CAP, 0.0, 1.0)
##   honey_per_day = nectar × diversity_bonus × ramp × HONEY_PER_NECTAR
##   comb_fullness += honey_per_day / COMB_CAP
##
## Harvest yields 5 honey and resets comb_fullness to 0.1 (capping starves
## exploit of spamming harvest).
##
## Links to Wildlife: on placement we force-arrive a "honeybee" cohort so
## the bestiary + distinct_species count reflects the new colony. Cohort
## departure (N-dist lifespan expiry) leaves the hive intact — the player
## can re-seed by inspecting / future "repopulate" flow.
extends StaticBody3D


signal clicked(hive: Node3D)
signal hover_changed(hive: Node3D, hovered: bool)


const FORAGE_RADIUS_M: float = 25.0
const BEE_CAP: int = 50
const STARTING_BEES: int = 25
const COMB_CAP: float = 50.0   # honey units per fill
const HARVEST_YIELD: float = 5.0
const HARVEST_FULLNESS_RESET: float = 0.1
const HARVEST_THRESHOLD: float = 0.8
const HONEY_PER_NECTAR: float = 0.08  # global scaling — tuned so 6 flower species = ~1.0/day
const DIVERSITY_BONUS_PER_SPECIES: float = 0.05
const DIVERSITY_BONUS_CAP: int = 6


var bee_count: int = 0
var comb_fullness: float = 0.0
var honey_per_day: float = 0.0
var flowers_in_range_cache: int = 0
var distinct_species_cache: int = 0
var linked_cohort_id: String = ""
var bee_swarm_visible: bool = false

var _wood_mat: StandardMaterial3D
var _trim_mat: StandardMaterial3D
var _roof_mat: StandardMaterial3D
var _comb_mat: StandardMaterial3D
var _comb_fill: MeshInstance3D
var _full_banner_fired: bool = false


func _ready() -> void:
	input_ray_pickable = true
	add_to_group("hives")
	add_to_group("warre_hives")     # matches Wildlife HABITAT_GROUPS
	add_to_group("wildlife_habitats")
	add_to_group("animal_habitats")
	_build_materials()
	_build_visual()
	_build_click_area()
	mouse_entered.connect(_on_mouse_enter)
	mouse_exited.connect(_on_mouse_exit)
	input_event.connect(_on_click_input)

	# Seed starter bees + force-arrive a honeybee cohort so Wildlife /
	# LifetimeStats / biodiversity thresholds register the hive.
	bee_count = STARTING_BEES
	_force_honeybee_arrival()

	# Day-tick hook.
	var sched: Node = get_node_or_null("/root/Scheduler")
	if sched != null and sched.has_signal("day_advanced"):
		if not sched.is_connected("day_advanced", _on_day_advanced):
			sched.connect("day_advanced", _on_day_advanced)

	# Sun-cycle hook for bee_swarm_visible — read on _process so it's
	# always current. No connect needed; cheaper than signal thrash.
	_update_bee_swarm_visibility()

	# Instance the bee-dot swarm child (Phase 3). Gracefully no-op if the
	# scene isn't present yet so the hive builds cleanly during Phase 1
	# before Phase 3 ships.
	_attach_bee_swarm()

	if get_node_or_null("/root/GameLog") != null:
		GameLog.event("hive_placed", {
			"pos_x": global_position.x,
			"pos_z": global_position.z,
			"bee_count": bee_count,
		})


func _process(_delta: float) -> void:
	_update_bee_swarm_visibility()


# =============================================================
# Visual — 4 stacked Warré boxes + sloped roof + plinth + comb fill.
# =============================================================

func _build_materials() -> void:
	# Warm weathered wood — EARTH lerped toward COMPOST for depth.
	_wood_mat = StandardMaterial3D.new()
	_wood_mat.albedo_color = Palette.clamp_happy(
		Palette.EARTH.lerp(Palette.COMPOST, 0.20)
	)
	_wood_mat.roughness = 0.92

	# HONEY trim on edges — warm accent that reads "bee home" from 20 m.
	_trim_mat = StandardMaterial3D.new()
	_trim_mat.albedo_color = Palette.clamp_happy(
		Palette.HONEY.lerp(Palette.CORAL, 0.10)
	)
	_trim_mat.roughness = 0.85

	# Sloped roof — WARM_STONE lerped toward HONEY for weathered shingles.
	_roof_mat = StandardMaterial3D.new()
	_roof_mat.albedo_color = Palette.clamp_happy(
		Palette.WARM_STONE.lerp(Palette.HONEY, 0.30)
	)
	_roof_mat.roughness = 0.9

	# Comb fill — glowing HONEY interior seen through a small gap. Emission
	# gives it the "full comb" glow when harvest-ready.
	_comb_mat = StandardMaterial3D.new()
	_comb_mat.albedo_color = Palette.HONEY
	_comb_mat.emission_enabled = true
	_comb_mat.emission = Palette.HONEY
	_comb_mat.emission_energy_multiplier = 0.15
	_comb_mat.roughness = 0.8


func _build_visual() -> void:
	# Plinth — EARTH base, 0.6 m wide, 0.1 m tall.
	var plinth: MeshInstance3D = MeshInstance3D.new()
	var plinth_mesh: BoxMesh = BoxMesh.new()
	plinth_mesh.size = Vector3(0.7, 0.1, 0.7)
	plinth.mesh = plinth_mesh
	plinth.position.y = plinth_mesh.size.y * 0.5
	plinth.material_override = _wood_mat
	plinth.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(plinth)

	# 4 stacked tier boxes. Each ~0.18 m tall, 0.55 m wide.
	var tier_count: int = 4
	var tier_height: float = 0.18
	var tier_size: Vector3 = Vector3(0.55, tier_height, 0.55)
	var stack_base: float = plinth_mesh.size.y
	for i in range(tier_count):
		var tier: MeshInstance3D = MeshInstance3D.new()
		var tm: BoxMesh = BoxMesh.new()
		tm.size = tier_size
		tier.mesh = tm
		tier.position.y = stack_base + tier_size.y * (0.5 + i)
		tier.material_override = _wood_mat
		tier.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		add_child(tier)

		# HONEY trim strip between tiers for warmth — thin box.
		if i < tier_count - 1:
			var trim: MeshInstance3D = MeshInstance3D.new()
			var trim_mesh: BoxMesh = BoxMesh.new()
			trim_mesh.size = Vector3(0.60, 0.02, 0.60)
			trim.mesh = trim_mesh
			trim.position.y = stack_base + tier_size.y * (i + 1.0)
			trim.material_override = _trim_mat
			add_child(trim)

	# Sloped wooden roof — PrismMesh angled so it reads as a peaked cap.
	var roof: MeshInstance3D = MeshInstance3D.new()
	var roof_mesh: PrismMesh = PrismMesh.new()
	roof_mesh.size = Vector3(0.65, 0.18, 0.65)
	roof.mesh = roof_mesh
	roof.position.y = stack_base + tier_size.y * tier_count + roof_mesh.size.y * 0.5
	roof.material_override = _roof_mat
	roof.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(roof)

	# Entrance slot — a tiny dark box at the front base of the lowest
	# tier so bees have a visible "front door". COMPOST color.
	var entrance: MeshInstance3D = MeshInstance3D.new()
	var entrance_mesh: BoxMesh = BoxMesh.new()
	entrance_mesh.size = Vector3(0.12, 0.03, 0.01)
	entrance.mesh = entrance_mesh
	entrance.position = Vector3(0.0, stack_base + 0.04, tier_size.z * 0.5 + 0.005)
	var entrance_mat: StandardMaterial3D = StandardMaterial3D.new()
	entrance_mat.albedo_color = Palette.COMPOST
	entrance.material_override = entrance_mat
	add_child(entrance)

	# Comb fill — inside the top tier, scaled in Y by comb_fullness.
	# A small cube slightly smaller than the tier so it reads through
	# (subtle) as the comb filling up. Emission gives it the warm glow.
	_comb_fill = MeshInstance3D.new()
	var comb_mesh: BoxMesh = BoxMesh.new()
	comb_mesh.size = Vector3(0.42, tier_height * 0.85, 0.42)
	_comb_fill.mesh = comb_mesh
	var top_tier_center_y: float = stack_base + tier_size.y * (tier_count - 1 + 0.5)
	_comb_fill.position = Vector3(0.0, top_tier_center_y, 0.0)
	_comb_fill.material_override = _comb_mat
	_comb_fill.scale = Vector3(1.0, 0.05, 1.0)  # starts empty-ish
	_comb_fill.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_comb_fill)


func _build_click_area() -> void:
	var cs: CollisionShape3D = CollisionShape3D.new()
	var box: BoxShape3D = BoxShape3D.new()
	box.size = Vector3(0.75, 1.05, 0.75)
	cs.position.y = 0.52
	cs.shape = box
	add_child(cs)


# =============================================================
# Day-tick production
# =============================================================

func _on_day_advanced(_day: int, season: String, _year: int) -> void:
	# Winter dormancy — bees cluster in the hive, no foraging.
	if season == "winter":
		honey_per_day = 0.0
		return
	# No bees = no honey. Cohort may have departed on its lifespan; the
	# hive remains but production halts until repopulated.
	if bee_count <= 0:
		honey_per_day = 0.0
		return

	var yield_summary: Dictionary = _compute_nectar_yield(season)
	flowers_in_range_cache = int(yield_summary.get("flower_tiles", 0))
	distinct_species_cache = int(yield_summary.get("distinct_species", 0))
	var nectar: float = float(yield_summary.get("nectar", 0.0))
	var diversity_bonus: float = 1.0 + DIVERSITY_BONUS_PER_SPECIES * float(
		min(distinct_species_cache, DIVERSITY_BONUS_CAP)
	)
	var ramp: float = clamp(float(bee_count) / float(BEE_CAP), 0.0, 1.0)
	honey_per_day = nectar * diversity_bonus * ramp * HONEY_PER_NECTAR
	if honey_per_day <= 0.0:
		return

	FarmTotals.add_food("honey", honey_per_day)
	var prev_fullness: float = comb_fullness
	comb_fullness = clamp(comb_fullness + honey_per_day / COMB_CAP, 0.0, 1.0)
	_update_comb_fill_visual()

	# Cross-threshold paired feedback — one-shot when we hit harvest-ready.
	if prev_fullness < HARVEST_THRESHOLD and comb_fullness >= HARVEST_THRESHOLD:
		_fire_harvest_ready_feedback()
	# Reset the full banner cleared flag once comb drops below threshold
	# (after harvest), so the next fill can fire its banner fresh.
	if comb_fullness < HARVEST_THRESHOLD:
		_full_banner_fired = false


## Compute nectar yield for tiles in FORAGE_RADIUS_M of this hive.
## Reads tile.flower_density + tile.flower_species + tile.flower_species_season.
## During Phase 1 (before flower system ships) tiles have no flower state
## so we fall back to a baseline "meadow has ambient flowers" proxy so
## the hive is not totally zero-output at play-test.
func _compute_nectar_yield(season: String) -> Dictionary:
	var wg: Node = get_node_or_null("/root/WorldGrid")
	if wg == null:
		return { "nectar": 0.0, "flower_tiles": 0, "distinct_species": 0 }
	var species_set: Dictionary = {}
	var tiles_count: int = 0
	var nectar_sum: float = 0.0
	# Box scan around the hive — 25 m radius at 1 m tile size = 50x50 tiles.
	var hx: float = global_position.x
	var hz: float = global_position.z
	var step_m: float = 1.0
	var r: float = FORAGE_RADIUS_M
	var r2: float = r * r
	# Iterate tile centers within the bounding square, accept if inside circle.
	var x: float = hx - r
	while x <= hx + r:
		var z: float = hz - r
		while z <= hz + r:
			var dx: float = x - hx
			var dz: float = z - hz
			if dx * dx + dz * dz <= r2:
				var sample: Dictionary = _sample_tile_flora(wg, x, z, season)
				if sample.get("density", 0.0) > 0.0:
					tiles_count += 1
					nectar_sum += float(sample["density"]) * float(sample["nectar_value"])
					var sid: String = String(sample.get("species_id", ""))
					if sid != "":
						species_set[sid] = true
			z += step_m
		x += step_m
	return {
		"nectar": nectar_sum,
		"flower_tiles": tiles_count,
		"distinct_species": species_set.size(),
	}


## Sample a single tile's flora. Reads new Tile fields when present;
## otherwise falls back to a meadow-ambient proxy so the hive still has
## baseline production before Phase 2 flowers ship.
func _sample_tile_flora(wg: Node, wx: float, wz: float, season: String) -> Dictionary:
	var pos: Vector3 = Vector3(wx, 0.0, wz)
	# Skip water — no flowers in the stream.
	if wg.has_method("is_water_tile") and bool(wg.call("is_water_tile", pos)):
		return { "density": 0.0, "nectar_value": 0.0, "species_id": "" }
	# Direct tile accessor — reads the live Tile object if WorldGrid exposes
	# one. We fall through to the meadow-ambient fallback when the tile has
	# no live flower density (density 0 from the accessor can mean "no
	# species seeded" OR "not yet ramped up" — the fallback keeps hives
	# productive on tiles that haven't been ticked in-season yet).
	if wg.has_method("tile_flora_at"):
		var data: Variant = wg.call("tile_flora_at", pos, season)
		if data is Dictionary and float((data as Dictionary).get("density", 0.0)) > 0.0:
			return data
	# Fallback: meadow-ambient baseline. Keeps early-game hives productive
	# (~0.1 nectar per meadow tile, no species diversity).
	var material: String = "bare"
	if wg.has_method("tile_material_at"):
		material = String(wg.call("tile_material_at", pos))
	if material == "meadow" and season in ["spring", "summer", "autumn"]:
		return { "density": 0.10, "nectar_value": 0.5, "species_id": "" }
	if material == "bank" and season in ["spring", "summer"]:
		return { "density": 0.06, "nectar_value": 0.4, "species_id": "" }
	return { "density": 0.0, "nectar_value": 0.0, "species_id": "" }


func _update_comb_fill_visual() -> void:
	if _comb_fill == null:
		return
	# Scale the comb fill Y so it reads like a rising honey level.
	var s: float = max(0.05, comb_fullness)
	_comb_fill.scale = Vector3(1.0, s, 1.0)
	# Subtly boost emission as the hive fills — from 0.15 baseline up to
	# 0.45 when comb-full so harvest-ready hives glow.
	if _comb_mat != null:
		_comb_mat.emission_energy_multiplier = 0.15 + comb_fullness * 0.30


func _fire_harvest_ready_feedback() -> void:
	if _full_banner_fired:
		return
	_full_banner_fired = true
	if get_node_or_null("/root/Juice") != null:
		Juice.pop(global_position + Vector3(0, 2.6, 0),
			"HIVE — READY TO HARVEST", Palette.HONEY)
		Juice.burst(global_position + Vector3(0, 1.6, 0),
			Palette.HONEY.lerp(Palette.CORAL, 0.20), 18)
	if get_node_or_null("/root/AudioManager") != null and AudioManager.has_method("play"):
		AudioManager.play("pollinator-hum-loop", -6.0)
	if get_node_or_null("/root/GameLog") != null:
		GameLog.event("hive_full", {
			"pos_x": global_position.x,
			"pos_z": global_position.z,
			"bees": bee_count,
		})


func _force_honeybee_arrival() -> void:
	var wl: Node = get_node_or_null("/root/Wildlife")
	if wl == null or not wl.has_method("debug_force_arrival"):
		return
	if wl.has_method("is_present") and bool(wl.call("is_present", "honeybee")):
		linked_cohort_id = "honeybee"
		return
	var ok: bool = bool(wl.call("debug_force_arrival", "honeybee", global_position))
	if ok:
		linked_cohort_id = "honeybee"


func _attach_bee_swarm() -> void:
	# Phase 3 scene — load defensively so Phase 1 ships even before swarm is built.
	var packed: Resource = ResourceLoader.load("res://scenes/fx/bee_swarm.tscn") \
		if ResourceLoader.exists("res://scenes/fx/bee_swarm.tscn") else null
	if packed == null:
		return
	var swarm: Node = (packed as PackedScene).instantiate()
	swarm.name = "BeeSwarm"
	add_child(swarm)
	if swarm.has_method("configure_for_hive"):
		swarm.call("configure_for_hive", self)


func _update_bee_swarm_visibility() -> void:
	# Daytime + non-winter + live bees = visible swarm.
	var is_day: bool = _is_daytime()
	var is_warm: bool = _current_season() != "winter"
	bee_swarm_visible = is_day and is_warm and bee_count > 0


func _current_season() -> String:
	var sched: Node = get_node_or_null("/root/Scheduler")
	if sched == null:
		return "spring"
	if sched.has_method("current_season"):
		return String(sched.call("current_season"))
	return "spring"


func _is_daytime() -> bool:
	# SunCycle writes a "time_of_day" hint to root if present; otherwise
	# fall back to "always day".
	var root: Node = get_tree().current_scene
	if root == null:
		return true
	var sun: Node = root.find_child("Sun", true, false)
	if sun != null:
		var light: DirectionalLight3D = sun as DirectionalLight3D
		if light != null:
			# Sun above horizon ≈ daytime. Cheap, correct enough.
			# A negative Y direction means sun casts downward (daytime).
			return light.light_energy > 0.05 and light.global_transform.basis.y.y > 0.0
	return true


# =============================================================
# Context menu (right-click actions)
# =============================================================

func get_context_actions() -> Array:
	var out: Array = []
	var harvest: Dictionary = Interactable.make_action(
		"harvest_honey",
		"Harvest honey (comb %d%%)" % int(comb_fullness * 100.0),
		8.0,
		{},                                  # no cost
		{ "honey": HARVEST_YIELD },          # yields 5 honey -> fairy_food.honey
		"",
		Interactable.DROP_NONE,              # honey routes through add_food, no storage hop
		1,
	)
	if comb_fullness < HARVEST_THRESHOLD:
		harvest["disabled"] = true
		harvest["label"] = "Harvest honey (needs %d%%)" % int(HARVEST_THRESHOLD * 100.0)
	out.append(harvest)

	# Inspect — instant, zero-cost, zero-yield. Just reads back stats.
	out.append(Interactable.make_action(
		"inspect_hive", "Inspect hive", 0.1,
		{}, {}, "", Interactable.DROP_NONE, 1,
	))
	return out


func display_name() -> String:
	return "Warré Hive (%d bees · %.2f honey/day)" % [bee_count, honey_per_day]


## Called by TaskQueue after the labor timer finishes. Honey yield is
## normally auto-deposited via the yield dict's drop_off_at path, but our
## action uses DROP_NONE so we deposit manually to hit fairy_food.honey
## rather than the storage shed.
func complete(action: Dictionary) -> void:
	var id: String = String(action.get("id", ""))
	match id:
		"harvest_honey":
			if comb_fullness < HARVEST_THRESHOLD:
				return
			var yielded: float = HARVEST_YIELD
			FarmTotals.add_food("honey", yielded)
			comb_fullness = HARVEST_FULLNESS_RESET
			_full_banner_fired = false
			_update_comb_fill_visual()
			if get_node_or_null("/root/Juice") != null:
				Juice.pop(global_position + Vector3(0, 2.6, 0),
					"+ %.1f HONEY" % yielded, Palette.HONEY)
				Juice.burst(global_position + Vector3(0, 1.0, 0),
					Palette.HONEY, 20)
			if get_node_or_null("/root/AudioManager") != null and AudioManager.has_method("play"):
				AudioManager.play("pollinator-hum-loop", -5.0)
			if get_node_or_null("/root/GameLog") != null:
				GameLog.event("hive_harvested", {
					"yield": yielded,
					"bees": bee_count,
				})
		"inspect_hive":
			_fire_inspect_popup()
		_:
			pass


func _fire_inspect_popup() -> void:
	if get_node_or_null("/root/Juice") == null:
		return
	# Parchment-panel via a stacked pop (cheap MVP — a full panel is future
	# work). Two lines so both stats are legible.
	var line1: String = "%d bees · %d flowers · %d species" % [
		bee_count, flowers_in_range_cache, distinct_species_cache
	]
	var line2: String = "%.2f honey/day · comb %d%%" % [
		honey_per_day, int(comb_fullness * 100.0)
	]
	Juice.pop(global_position + Vector3(0, 3.4, 0), line1, Palette.PARCHMENT)
	Juice.pop(global_position + Vector3(0, 2.8, 0), line2, Palette.HONEY)
	if get_node_or_null("/root/AudioManager") != null and AudioManager.has_method("play"):
		AudioManager.play("hover-tick", -10.0)


# =============================================================
# Hover / click wiring
# =============================================================

func _on_mouse_enter() -> void:
	_set_highlight(true)
	emit_signal("hover_changed", self, true)


func _on_mouse_exit() -> void:
	_set_highlight(false)
	emit_signal("hover_changed", self, false)


func _set_highlight(on: bool) -> void:
	for m in [_wood_mat, _trim_mat, _roof_mat]:
		if m == null:
			continue
		m.rim_enabled = on
		m.rim = 0.9 if on else 0.0
		m.rim_tint = 0.75
		m.emission_enabled = on
		m.emission = Palette.HONEY
		m.emission_energy_multiplier = 0.35 if on else 0.0


func _on_click_input(_cam: Node, event: InputEvent, _pos: Vector3, _norm: Vector3, _shape: int) -> void:
	var mb: InputEventMouseButton = event as InputEventMouseButton
	if mb == null or not mb.pressed:
		return
	if mb.button_index == MOUSE_BUTTON_LEFT:
		emit_signal("clicked", self)


# =============================================================
# Save/load hooks — additive, default-tolerant.
# =============================================================

func serialize() -> Dictionary:
	return {
		"bee_count": bee_count,
		"comb_fullness": comb_fullness,
		"linked_cohort_id": linked_cohort_id,
		"full_banner_fired": _full_banner_fired,
	}


func hydrate(data: Dictionary) -> void:
	if data.is_empty():
		return
	bee_count = int(data.get("bee_count", STARTING_BEES))
	comb_fullness = clamp(float(data.get("comb_fullness", 0.0)), 0.0, 1.0)
	linked_cohort_id = String(data.get("linked_cohort_id", ""))
	_full_banner_fired = bool(data.get("full_banner_fired", false))
	_update_comb_fill_visual()
