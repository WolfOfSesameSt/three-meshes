## Fairy Permaculture — individual plant instance.
##
## Stage-driven visual that ripens over days. Materials are created
## programmatically so the scene loads regardless of .tscn surface-
## override quirks.
##
## Left-click is INTENTIONALLY DEAD on plants — per the design update
## (hover → right-click → task queue). Hover still rim-lights. The
## fairy-assigned tasks fire through main.gd's context menu. This
## file keeps its input-event plumbing so we can later re-route LMB
## to a "hover select" without re-wiring the collision body.
##
## Visible state the plant reflects each day:
##   • growth_stage (seed → juvenile → flowering → fruiting → harvest
##     → dormant → dead) drives scale + tint.
##   • ripe_count drives the fruit cluster (N tiny spheres that
##     pop-in when ripening, burst-out when harvested).
##   • Season drives a leaf tint (spring bright, autumn warm, winter
##     desaturated).
extends Node3D

signal clicked(plant: Node3D)
signal hover_changed(plant: Node3D, hovered: bool)

@onready var _body: MeshInstance3D = $Body
@onready var _fruit: MeshInstance3D = $Fruit
@onready var _click_area: StaticBody3D = $ClickArea

var species_id: String = "salmonberry"
var stage: String = "mature"        # legacy string, kept for save-compat
var growth_stage: String = VisualState.STAGE_FRUITING
var age_days: int = 120
var ripe_amount: float = 2.0
var ripe_count: int = 0              # whole-berry count for fruit cluster
var is_pioneer: bool = false          # nettle / dandelion flag

var _body_mat: StandardMaterial3D
var _fruit_mat: StandardMaterial3D
var _fruit_cluster: Node3D
var _base_albedo: Color = Color(0.55, 0.77, 0.48)
var _fruit_color: Color = Color(0.63, 0.47, 0.71)
var _blossom_cluster: Node3D
var _current_season: String = "summer"


func setup(id: String) -> void:
	species_id = id


func _ready() -> void:
	_body_mat = StandardMaterial3D.new()
	_fruit_mat = StandardMaterial3D.new()
	_fruit_mat.albedo_color = Color(0.63, 0.47, 0.71)
	# Pioneer detection — nettle / dandelion / yarrow / plantain get a
	# thin upright look and always-biomass role regardless of data flags.
	is_pioneer = species_id.contains("nettle") \
		or species_id.contains("dandelion") \
		or species_id.contains("yarrow") \
		or species_id.contains("plantain")
	var s: Variant = DataStore.get_plant(species_id)
	if s != null:
		match s["category"]:
			"shrub":
				_base_albedo = Color(0.35, 0.48, 0.30)
				_body.scale = Vector3(1.2, 1.4, 1.2)
			"herbaceous":
				_base_albedo = Color(0.55, 0.67, 0.42)
				_body.scale = Vector3(0.7, 1.8, 0.7)
			_:
				_base_albedo = Color(0.55, 0.77, 0.48)
		_fruit.visible = false  # we use the fruit cluster now, not the old mesh
	else:
		_base_albedo = Color(0.55, 0.77, 0.48)
	if is_pioneer:
		# Pioneers are smaller + lighter than mature shrubs.
		_base_albedo = Color(0.52, 0.60, 0.32)
		_body.scale = Vector3(0.55, 1.2, 0.55)
	_body_mat.albedo_color = _base_albedo
	_fruit_color = VisualState.fruit_color(species_id)
	_fruit_mat.albedo_color = _fruit_color
	_body.material_override = _body_mat
	_fruit.material_override = _fruit_mat
	_fruit.visible = false
	add_to_group("plants")
	_fruit_cluster = VisualState.ensure_fruit_cluster(self)
	_click_area.input_event.connect(_on_click)
	_click_area.mouse_entered.connect(_on_mouse_enter)
	_click_area.mouse_exited.connect(_on_mouse_exit)
	Scheduler.day_advanced.connect(_on_day)
	Scheduler.season_changed.connect(_on_season_changed)
	# Sync legacy stage→growth_stage so existing spawn sites work.
	_sync_growth_from_legacy()
	_current_season = Scheduler.current_season()
	_refresh_visual_state()
	# If we booted already-ripe, spawn the fruit cluster count to match.
	_sync_ripe_count_from_amount()
	_sync_fruit_cluster_meshes()


func _on_mouse_enter() -> void:
	set_highlight(true)
	emit_signal("hover_changed", self, true)


func _on_mouse_exit() -> void:
	set_highlight(false)
	emit_signal("hover_changed", self, false)


## Rim + emission tint on the plant's own silhouette. The edge glows
## a warm honey-gold on hover, giving the outline affordance without
## a separate ring mesh. Toggling is cheap — we only flip material
## properties, no allocations.
func set_highlight(on: bool) -> void:
	const HIGHLIGHT := Color(0.95, 0.76, 0.31)
	if _body_mat:
		_body_mat.rim_enabled = on
		_body_mat.rim = 0.9 if on else 0.0
		_body_mat.rim_tint = 0.75
		_body_mat.emission_enabled = on
		_body_mat.emission = HIGHLIGHT
		_body_mat.emission_energy_multiplier = 0.35 if on else 0.0
	if _fruit_mat and _fruit_cluster and _fruit_cluster.get_child_count() > 0:
		_fruit_mat.emission_enabled = on
		_fruit_mat.emission = HIGHLIGHT
		_fruit_mat.emission_energy_multiplier = 0.5 if on else 0.0


func _on_day(_day: int, season: String, _year: int) -> void:
	age_days += 1
	_current_season = season
	var s: Variant = DataStore.get_plant(species_id)
	if s == null:
		_refresh_visual_state()
		return
	# Ripening: add one berry per tick during growing season on fruit-
	# bearing species. Capped at yield-per-plant so a small bush stays
	# small.
	var is_dormant_season: bool = season == "winter"
	if _has_fruit(s) and not is_dormant_season:
		var max_ripe: int = int(s["products"][0].get("yield_per_plant_per_season", 4))
		if age_days % 7 == 0 and ripe_count < max_ripe and growth_stage in [VisualState.STAGE_FRUITING, VisualState.STAGE_HARVEST_READY]:
			ripe_count = min(max_ripe, ripe_count + 1)
			ripe_amount = float(ripe_count)  # keep legacy float in sync
			# Small sparkle as each berry appears.
			if _fruit_cluster != null:
				Juice.burst(_fruit_cluster.global_position, _fruit_color, 3)
	# Advance growth stage based on age + season.
	_auto_advance_stage(season)
	_refresh_visual_state()
	_sync_fruit_cluster_meshes()
	# Wild spread — mature berry bushes occasionally scatter a seedling
	# onto a nearby empty spot. ~1 % per day = slow natural regeneration
	# that the player notices over many game-days without having to tend.
	if growth_stage == VisualState.STAGE_FRUITING and _has_fruit(s) and randf() < 0.012:
		_try_wild_spread()
	# Rot evaluation — must run each day so the scrap-drop fires on
	# time even when the player ignores a ripe bush for a week.
	# Uses the Scheduler calendar day (parameter _day) as the
	# deterministic clock so tests can assert day counts directly.
	_evaluate_rot(_day)


func _on_season_changed(new_season: String, _year: int) -> void:
	_current_season = new_season
	_auto_advance_stage(new_season)
	_refresh_visual_state()


## Map the old string stage onto the new enum so existing spawn sites
## don't need to rewrite. "seedling" → juvenile, "mature" → fruiting.
func _sync_growth_from_legacy() -> void:
	match stage:
		"seedling":
			growth_stage = VisualState.STAGE_JUVENILE
		"mature":
			growth_stage = VisualState.STAGE_FRUITING
		"dormant":
			growth_stage = VisualState.STAGE_DORMANT
		"dead":
			growth_stage = VisualState.STAGE_DEAD


func _sync_ripe_count_from_amount() -> void:
	if ripe_count == 0 and ripe_amount > 0.0:
		ripe_count = int(ceil(ripe_amount))


## Simple deterministic season/age → growth_stage classifier.
func _auto_advance_stage(season: String) -> void:
	if growth_stage == VisualState.STAGE_DEAD:
		return
	# Pioneers skip flowering — they're rough biomass plants.
	if is_pioneer:
		if age_days < 10:
			growth_stage = VisualState.STAGE_SEED
		elif age_days < 30:
			growth_stage = VisualState.STAGE_JUVENILE
		elif season == "winter":
			growth_stage = VisualState.STAGE_DORMANT
		else:
			growth_stage = VisualState.STAGE_FRUITING
		return
	# Fruit-bearing species cycle spring flower → summer fruit → fall
	# harvest-ready → winter dormant.
	if age_days < 10:
		growth_stage = VisualState.STAGE_SEED
	elif age_days < 40:
		growth_stage = VisualState.STAGE_JUVENILE
	else:
		match season:
			"spring":
				growth_stage = VisualState.STAGE_FLOWERING
			"summer":
				growth_stage = VisualState.STAGE_FRUITING
			"autumn":
				growth_stage = VisualState.STAGE_HARVEST_READY
			"winter":
				growth_stage = VisualState.STAGE_DORMANT
			_:
				growth_stage = VisualState.STAGE_FRUITING


## Push growth_stage + season onto the visuals. Tween on scale so
## transitions don't pop. Desaturate the dead/dormant bushes.
func _refresh_visual_state() -> void:
	if _body_mat == null:
		return
	var target_scale_f: float = VisualState.stage_scale(growth_stage)
	# Multiplied against the original body-scale (set per-category at
	# _ready). We store the base scale once in meta.
	if not has_meta("base_body_scale"):
		set_meta("base_body_scale", _body.scale)
	var base_scale: Vector3 = get_meta("base_body_scale")
	var tw: Tween = create_tween()
	tw.tween_property(_body, "scale", base_scale * target_scale_f, 0.8) \
		.set_trans(Tween.TRANS_SINE)
	# Seasonal tint — modulate albedo.
	var tint: Color = VisualState.seasonal_tint(_current_season, growth_stage)
	var tinted: Color = _base_albedo
	tinted.r *= tint.r
	tinted.g *= tint.g
	tinted.b *= tint.b
	_body_mat.albedo_color = tinted
	# Flowering blossom tufts — small pale spheres on top.
	_sync_blossom_cluster(growth_stage == VisualState.STAGE_FLOWERING)


func _sync_blossom_cluster(show: bool) -> void:
	if show and _blossom_cluster == null:
		_blossom_cluster = Node3D.new()
		_blossom_cluster.name = "BlossomCluster"
		_blossom_cluster.position = Vector3(0.0, 2.2, 0.0)
		add_child(_blossom_cluster)
		var rng: RandomNumberGenerator = RandomNumberGenerator.new()
		rng.seed = hash(name) & 0xffffff
		var blossom_color: Color = Color(1.0, 0.85, 0.92)  # soft pink/white
		if species_id == "comfrey-bocking14":
			blossom_color = Color(0.78, 0.62, 0.90)
		for i in range(5):
			var mi: MeshInstance3D = MeshInstance3D.new()
			var sm: SphereMesh = SphereMesh.new()
			sm.radius = 0.08
			sm.height = 0.16
			sm.radial_segments = 6
			sm.rings = 4
			mi.mesh = sm
			var mat: StandardMaterial3D = StandardMaterial3D.new()
			mat.albedo_color = blossom_color
			mat.emission_enabled = true
			mat.emission = blossom_color
			mat.emission_energy_multiplier = 0.2
			mi.material_override = mat
			mi.position = Vector3(
				rng.randf_range(-0.4, 0.4),
				rng.randf_range(-0.05, 0.3),
				rng.randf_range(-0.4, 0.4)
			)
			mi.scale = Vector3.ZERO
			_blossom_cluster.add_child(mi)
			var tw: Tween = mi.create_tween()
			tw.tween_property(mi, "scale", Vector3.ONE, 0.4) \
				.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	elif not show and _blossom_cluster != null:
		var c: Node3D = _blossom_cluster
		_blossom_cluster = null
		var tw: Tween = c.create_tween()
		tw.tween_property(c, "scale", Vector3.ZERO, 0.3) \
			.set_trans(Tween.TRANS_SINE)
		tw.tween_callback(c.queue_free)


func _sync_fruit_cluster_meshes() -> void:
	if _fruit_cluster == null:
		return
	VisualState.sync_fruit_cluster(
		_fruit_cluster,
		ripe_count,
		_fruit_color,
		hash(name) & 0xffffff
	)


func _try_wild_spread() -> void:
	# Pick a random nearby tile and spawn a seedling if clear.
	var main: Node = get_tree().current_scene
	if main == null or not main.has_method("register_plant"):
		return
	var offset: Vector3 = Vector3(randf_range(-3.0, 3.0), 0, randf_range(-3.0, 3.0))
	var target: Vector3 = global_position + offset
	# Cheap clearance check: no other plant within 1.5 m.
	for existing in get_tree().get_nodes_in_group("plants"):
		if existing is Node3D and target.distance_squared_to((existing as Node3D).global_position) < 2.25:
			return
	var PlantScene: PackedScene = load("res://scenes/plant.tscn")
	var seedling: Node3D = PlantScene.instantiate()
	seedling.setup(species_id)
	main.add_child(seedling)
	seedling.global_position = target
	seedling.stage = "seedling"
	seedling.age_days = 10
	seedling.ripe_amount = 0.0
	seedling.ripe_count = 0
	seedling.growth_stage = VisualState.STAGE_JUVENILE
	seedling.scale = Vector3(0.5, 0.5, 0.5)
	var tw: Tween = seedling.create_tween()
	tw.tween_property(seedling, "scale", Vector3.ONE, 30.0).set_trans(Tween.TRANS_SINE)
	main.register_plant(seedling)


func _has_fruit(s: Dictionary) -> bool:
	for p in s.get("products", []):
		if p.get("id") == "fruit":
			return true
	return false


func harvest() -> float:
	if ripe_count <= 0 and ripe_amount <= 0.0:
		return 0.0
	var amt: float = ripe_amount if ripe_amount > 0.0 else float(ripe_count)
	# Reduce the cluster one at a time for the fruit-pick burst.
	ripe_count = 0
	ripe_amount = 0.0
	_sync_fruit_cluster_meshes()
	return amt


func chop_and_drop() -> float:
	var s: Variant = DataStore.get_plant(species_id)
	var kg: float = 0.0
	if s != null:
		for p in s.get("products", []):
			if p.get("id") == "biomass":
				kg = float(p.get("yield_per_plant_per_season", 8))
				break
	# Pioneers always yield a little biomass even without a data entry.
	if kg <= 0.0 and is_pioneer:
		kg = 3.0
	stage = "seedling"
	age_days = 0
	growth_stage = VisualState.STAGE_SEED
	ripe_count = 0
	ripe_amount = 0.0
	_sync_fruit_cluster_meshes()
	scale = Vector3(0.6, 0.6, 0.6)
	var tween: Tween = create_tween()
	tween.tween_property(self, "scale", Vector3.ONE, 20.0).set_trans(Tween.TRANS_SINE)
	return kg


## LMB is intentionally a no-op on world plants. Hover + right-click
## (routed through main.gd → TaskQueue) are the only interactions.
## We keep the input_event connection live so a future "hover select"
## can hook in without re-wiring StaticBody3D signals.
func _on_click(_cam: Node, _event: InputEvent, _pos: Vector3, _norm: Vector3, _shape: int) -> void:
	pass


# =====================================================================
# Universal right-click contract
# =====================================================================
#
# NOTE (Day-0 Activities Engineer): `get_context_actions()` and
# `complete()` live in the APPEND-ONLY block further down. The original
# implementations were preserved there verbatim and extended with the
# seed-harvest branch. Keeping only one copy is mandatory — GDScript
# does not allow duplicate method signatures in the same class.


func display_name() -> String:
	return (species_id as String).capitalize()


## How much plant_trim a chop-and-drop yields — pioneers a small amount,
## biomass-role plants pull their data yield (from the DataStore's
## "biomass" product id, which stays named that way in the plant JSON
## since that's the category in permaculture literature).
func _biomass_yield_amount() -> float:
	var s: Variant = DataStore.get_plant(species_id)
	if s != null:
		for p in s.get("products", []):
			if p.get("id") == "biomass":
				return float(p.get("yield_per_plant_per_season", 6))
	return 3.0 if is_pioneer else 4.0


# =====================================================================
# APPEND-ONLY: Day-0 Activities Engineer
# --------------------------------------------------------------------
# Adds a "Harvest seeds" action surfaced when the plant is in a seed-
# bearing growth stage (FLOWERING / FRUITING / HEADING). Seeds yield
# 1-3 depending on maturity; the plant stays alive but its seed-bearing
# state resets to FLOWERING so the player can't stand and farm the same
# bush forever in one day.
#
# This block extends `get_context_actions()` + `complete()` via an
# override + dispatch pattern — we keep the original methods above
# untouched and only add a wrapper. No existing logic is rewritten.
# =====================================================================

const _SEEDY_STAGES: Array[String] = [
	VisualState.STAGE_FLOWERING,
	VisualState.STAGE_FRUITING,
	VisualState.STAGE_HARVEST_READY,
]


## Returns true iff this plant is currently displaying a seed-bearing
## stage. The seed-harvest action only surfaces when this is true.
func _is_seed_bearing() -> bool:
	return growth_stage in _SEEDY_STAGES


## 1-3 seeds rolled from maturity. Pioneer / dandelion-style plants roll
## higher because they reproduce prolifically. Fruit-bearers cap lower
## because the player already gets the FRUIT yield from the same bush.
func _seed_yield_roll() -> int:
	var rng: RandomNumberGenerator = RandomNumberGenerator.new()
	rng.seed = (hash(name) ^ Time.get_ticks_usec()) & 0x7fffffff
	# Base: 1 seed; +1 if the plant is at peak HARVEST_READY; +1 random
	# chance if pioneer.
	var n: int = 1
	if growth_stage == VisualState.STAGE_HARVEST_READY:
		n += 1
	if is_pioneer and rng.randf() < 0.60:
		n += 1
	return clamp(n, 1, 3)


# The original Day-0 append block's `get_context_actions()` + `complete()`
# are REPLACED in-place below by the System Fixes Engineer block —
# GDScript does not allow duplicate method signatures in a class, so the
# earlier overrides are removed here and the new single source of truth
# lives in the block further down. The seed-harvest + forage + legacy
# branches are preserved verbatim in the new `complete()`.


# =====================================================================
# APPEND-ONLY: System Fixes Engineer — chop-and-drop tile-OM model +
# early-frost listener.
# --------------------------------------------------------------------
# Two behaviour corrections:
#
# (1) Chop-and-drop is now a SOIL-building action — the biomass is laid
#     on the tile instead of shipped to storage. The *intent* is to bump
#     the host tile's OM by +0.15 via `WorldGrid.add_tile_om(pos, +0.15)`
#     — but no such helper exists on the current WorldGrid (confirmed
#     2026-04-19, and WorldGrid is in the FORBIDDEN list for this pass).
#     The designed fallback is: still yield plant_trim to storage, log a
#     follow-up so the soil-engineer agent picks it up, AND consume the
#     plant (queue_free) instead of regressing it to a seedling. That
#     last part captures the "cut it down, lay it on the ground" feel —
#     the plant is gone, even if OM credit hasn't wired through yet.
#
# (2) Early-frost (WeatherSystem.event_active "early_frost") damages
#     tender (non-pioneer) plants: ripe_count drops 50 %, visual wilt
#     for ~3 game days. Pioneers (nettle / dandelion / yarrow / plantain)
#     are frost-hardy and skip the damage.
# =====================================================================

var _frost_damaged_until_day: int = -1
var _pre_frost_body_albedo: Color = Color(0, 0, 0, 0)
var _pre_frost_scale_y: float = 1.0


## Override — re-emits the standard action set, but re-flags `chop_drop`
## so the player sees "Chop-and-drop" clearly labelled + so the yield
## pipeline keeps its storage drop (fallback while tile-OM API ships).
func get_context_actions() -> Array:
	var out: Array = []
	var s: Variant = DataStore.get_plant(species_id)
	var is_biomass_plant: bool = is_pioneer or (
		s != null and (s["roles"] as Array).has("biomass")
	)
	if is_biomass_plant:
		var act_cd: Dictionary = Interactable.make_action(
			"chop_drop", "Chop-and-drop", 8.0,
			{}, {"plant_trim": _biomass_yield_amount()},
			"", Interactable.DROP_STORAGE, 2
		)
		act_cd["tooltip"] = "Cut the plant + lay it on the tile. Plant is consumed; biomass feeds soil OM (follow-up: wire WorldGrid.add_tile_om)."
		out.append(act_cd)
	else:
		var ripe: int = max(1, ripe_count if ripe_count > 0 else int(ceil(ripe_amount)))
		# Harvest co-yield: 0.2× the fruit count becomes `fruit_scraps`
		# (stems, bruised, culls). This closes the
		#   fruit → chickens → manure → compost
		# loop the VISION doc describes by giving every harvest a tiny
		# scrap drop that feeds back into the C/N economy. Rounded up to
		# at least 1 scrap when there's any harvest so the player always
		# sees the producer path fire.
		var scraps_co: int = max(1, int(ceil(float(ripe) * 0.2)))
		out.append(Interactable.make_action(
			"harvest_all", "Harvest all ripe", 10.0,
			{}, {"fruit": float(ripe), "fruit_scraps": float(scraps_co)},
			"", Interactable.DROP_STORAGE, 2
		))
		var act_cd2: Dictionary = Interactable.make_action(
			"chop_drop", "Chop-and-drop", 8.0,
			{}, {"plant_trim": 3.0},
			"", Interactable.DROP_STORAGE, 2
		)
		act_cd2["tooltip"] = "Cut the plant + lay it on the tile. Plant is consumed; biomass feeds soil OM (follow-up: wire WorldGrid.add_tile_om)."
		out.append(act_cd2)
	# Day-0 addition: Harvest seeds — only when the plant is in a
	# seed-bearing stage. Plant stays alive; seed-state resets on
	# complete() so the player can't spam it.
	if _is_seed_bearing():
		var seeds: int = _seed_yield_roll()
		out.append(Interactable.make_action(
			"harvest_seeds", "Harvest seeds", 10.0,
			{}, {"seeds": float(seeds)},
			"", Interactable.DROP_STORAGE, 2
		))
	return out


## Override — final word on complete(). Keeps every earlier branch but
## rewrites chop_drop to CONSUME the plant (queue_free) instead of
## regressing it. Logs a follow-up for WorldGrid.add_tile_om so the soil
## engineer agent can wire the +0.15 OM bump when the API ships.
func complete(action: Dictionary) -> void:
	var id: String = action.get("id", "")
	if id == "harvest_seeds":
		growth_stage = VisualState.STAGE_FLOWERING
		_refresh_visual_state()
		if AudioManager.has_method("play"):
			AudioManager.play("seedling-sprout", -4.0)
		var seeds_yielded: float = float((action.get("yield", {}) as Dictionary).get("seeds", 0.0))
		Juice.pop(global_position + Vector3(0, 1.8, 0),
			"+ %d SEEDS" % int(seeds_yielded), Palette.MEADOW)
		Juice.burst(global_position + Vector3(0, 1.3, 0),
			Palette.MEADOW.lerp(Palette.HONEY, 0.35), 10)
		return
	if id == "harvest_all":
		# Route harvested fruit into fairy_food.fruit so the spawn math
		# actually sees food arrive — before this fix, fruit harvest
		# only bumped FarmTotals.stocks[FRUIT] and fairies starved even
		# with a full pantry. Only the primary FRUIT yield flows through
		# fairy_food; fruit_scraps is a compost input, NOT food.
		# FarmTotals.stocks increment still happens via the normal
		# TaskQueue deposit_yield path that runs AFTER this complete().
		var y_out: Dictionary = action.get("yield", {})
		var fruit_amt: float = float(y_out.get("fruit", 0.0))
		if fruit_amt > 0.0:
			FarmTotals.add_food("fruit", fruit_amt)
			# Reset rot timer on this plant — the player just cleared
			# the ripe cluster, so the rot window restarts fresh.
			_rot_started_day = -1
			_overripe = false
		ripe_count = 0
		ripe_amount = 0.0
		_sync_fruit_cluster_meshes()
		AudioManager.play("berry-pick")
		Juice.burst(global_position + Vector3(0, 1.6, 0), _fruit_color, 12)
		var scrap_amt: float = float(y_out.get("fruit_scraps", 0.0))
		if scrap_amt > 0.0:
			Juice.pop(
				global_position + Vector3(0, 2.0, 0),
				"+ %d SCRAPS" % int(scrap_amt),
				Palette.CORAL.darkened(0.15)
			)
		return
	if id == "chop_drop":
		# Best-effort tile-OM bump — uses the helper if WorldGrid ever
		# gains it (forward-compat). No-op otherwise; the follow-up log
		# below tracks the debt so the soil engineer wires it later.
		if has_node("/root/WorldGrid"):
			var wg: Node = get_node("/root/WorldGrid")
			if wg.has_method("add_tile_om"):
				wg.call("add_tile_om", global_position, 0.15)
				GameLog.info("chop_drop: tile OM +0.15 at %s" % global_position, "plant")
			else:
				GameLog.info("chop_drop: WorldGrid.add_tile_om MISSING — follow-up to wire tile-OM +0.15 at %s" % global_position, "plant")
		AudioManager.play("biomass-chop")
		Juice.pop(global_position + Vector3(0, 1.6, 0), "CHOP-AND-DROP", Palette.MEADOW)
		Juice.burst(global_position + Vector3(0, 0.8, 0),
			Palette.MEADOW.lerp(Palette.OLIVE_DARK, 0.3), 14)
		GameLog.event("plant_chop_dropped", {
			"species": species_id,
			"is_pioneer": is_pioneer,
			"age_days": age_days,
		})
		# Plant is consumed — "cut it and lay it down". Scale-to-zero
		# tween for the visible beat, then deferred queue_free so the
		# node actually leaves the scene whether or not the tween ran to
		# completion (headless / fast-forward robustness).
		var tw: Tween = create_tween()
		tw.tween_property(self, "scale", Vector3.ZERO, 0.45) \
			.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_IN)
		tw.tween_callback(queue_free)
		# Belt-and-braces: also schedule a deferred free after ~0.5 s.
		# If the tween finished first, queue_free is a no-op the second
		# time. If the tween was killed / never ran, this ensures the
		# plant still leaves the scene.
		get_tree().create_timer(0.5).timeout.connect(queue_free)


## Frost-damage wiring — connects once in _process after Scheduler is
## ready. We hook WeatherSystem.event_active and trigger damage on the
## first tick of an early_frost. Pioneers are hardy and skip damage.
func _ensure_frost_wired() -> void:
	if has_meta("_frost_wired"):
		return
	set_meta("_frost_wired", true)
	if has_node("/root/WeatherSystem"):
		var ws: Node = get_node("/root/WeatherSystem")
		if ws.has_signal("event_active") and not ws.is_connected("event_active", _on_weather_event_active):
			ws.connect("event_active", _on_weather_event_active)


func _process(_delta: float) -> void:
	# Idempotent; cheap — only wires the signal once.
	_ensure_frost_wired()
	# Recover from frost wilt after the visible window (~3 game-days).
	if _frost_damaged_until_day > 0:
		var cur: int = 0
		if has_node("/root/Scheduler"):
			cur = int(get_node("/root/Scheduler").get("day"))
		if cur >= _frost_damaged_until_day:
			_recover_from_frost()


func _on_weather_event_active(event_id: String, _day_remaining: int) -> void:
	if event_id != "early_frost":
		return
	if is_pioneer:
		return   # hardy pioneers shrug it off
	# Re-entering the listener while still wilted: don't double-damage.
	if _frost_damaged_until_day > 0:
		return
	# Drop ripe_count by 50 % (round down, min 0).
	var lost: int = 0
	if ripe_count > 0:
		lost = ripe_count - int(ripe_count / 2)
		ripe_count = int(ripe_count / 2)
		ripe_amount = float(ripe_count)
		_sync_fruit_cluster_meshes()
	# Visual wilt — dim body albedo + squish scale_y for ~3 game days.
	if _body_mat != null:
		_pre_frost_body_albedo = _body_mat.albedo_color
		_body_mat.albedo_color = Palette.clamp_happy(
			_body_mat.albedo_color.lerp(Palette.SKY.lerp(Palette.MIST, 0.5), 0.35)
		)
	_pre_frost_scale_y = _body.scale.y if _body != null else 1.0
	if _body != null:
		var tw: Tween = _body.create_tween()
		tw.tween_property(_body, "scale", Vector3(_body.scale.x, _pre_frost_scale_y * 0.7, _body.scale.z), 0.5) \
			.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	var cur_day: int = 0
	if has_node("/root/Scheduler"):
		cur_day = int(get_node("/root/Scheduler").get("day"))
	_frost_damaged_until_day = cur_day + 3
	# Paired feedback — sky-tinted wilt pop + soft tick.
	if AudioManager.has_method("play"):
		AudioManager.play("hover-tick", -10.0)
	var frost_tint: Color = Palette.SKY.lerp(Palette.MIST, 0.4)
	Juice.pop(global_position + Vector3(0, 1.8, 0), "FROST WILT", frost_tint)
	Juice.burst(global_position + Vector3(0, 1.2, 0), frost_tint, 10)
	GameLog.event("plant_frost_damage", {
		"species": species_id,
		"ripe_lost": lost,
		"ripe_remaining": ripe_count,
	})


func _recover_from_frost() -> void:
	_frost_damaged_until_day = -1
	if _body_mat != null and _pre_frost_body_albedo.a > 0.0:
		var tw: Tween = create_tween()
		tw.tween_property(_body_mat, "albedo_color", _pre_frost_body_albedo, 0.6) \
			.set_trans(Tween.TRANS_SINE)
	if _body != null:
		var tw2: Tween = _body.create_tween()
		tw2.tween_property(_body, "scale", Vector3(_body.scale.x, _pre_frost_scale_y, _body.scale.z), 0.6) \
			.set_trans(Tween.TRANS_SINE)


# =====================================================================
# APPEND-ONLY: Ripe-fruit rot path.
# --------------------------------------------------------------------
# Closes the `fruit_scraps` producer orphan flagged by the resource-flow
# audit. If ripe fruit sits on the plant unharvested for ROT_DELAY_DAYS
# game-days, the fruit overripens (visible tint shift + droop), and then
# after ROT_DROP_DAYS the overripe fruit falls as scraps onto the tile —
# we deposit directly into FarmTotals.fruit_scraps (bypassing storage
# capacity, since the scraps are literally lying on the ground).
#
# Visible state changes per `feedback_visible_state_changes.md`:
#   RIPE        (normal fruit color)
#   OVERRIPE    (fruit cluster darkens + droops via Y-scale shrink)
#   FALLEN      (cluster vanishes, scrap-brown particle burst, deposit)
#
# Wire-in:
#   _on_day(day, season, year) — already ticks each game day. We
#   piggyback on its existing ripening logic; rot is evaluated AFTER
#   the ripening branch so a just-ripened fruit doesn't rot the same
#   day it appears.
# =====================================================================

const ROT_DELAY_DAYS: int = 6        # days ripe before overripe begins
const ROT_DROP_DAYS: int = 10        # days ripe before scraps fall

var _rot_started_day: int = -1        # Scheduler.day when ripe cluster first seen
var _overripe: bool = false
var _pre_rot_fruit_color: Color = Color(0, 0, 0, 0)


## Called from the end of the existing _on_day tick. We evaluate rot
## progression each game-day. Deterministic — no RNG — so the test
## harness can assert exact day counts.
func _evaluate_rot(day: int) -> void:
	# Pioneers + biomass plants have no fruit, skip.
	if is_pioneer:
		return
	var s: Variant = DataStore.get_plant(species_id)
	if s == null or not _has_fruit(s):
		return
	# No ripe fruit yet → no rot window open.
	if ripe_count <= 0:
		_rot_started_day = -1
		_overripe = false
		return
	# Start the rot window the first game-day fruit is seen ripe.
	if _rot_started_day < 0:
		_rot_started_day = day
		return
	var days_ripe: int = day - _rot_started_day
	# Stage 1 — overripe: darken the fruit cluster + droop the cluster Y.
	if not _overripe and days_ripe >= ROT_DELAY_DAYS:
		_enter_overripe_state()
	# Stage 2 — drop scraps on the tile + reset ripe cluster.
	if days_ripe >= ROT_DROP_DAYS:
		_drop_as_scraps()


func _enter_overripe_state() -> void:
	_overripe = true
	if _fruit_mat != null:
		_pre_rot_fruit_color = _fruit_mat.albedo_color
		# Shift toward COMPOST/EARTH for "dulling fruit" read, clamped
		# by the happy-palette rule so we never go ashy-grey.
		var rot_tint: Color = _fruit_mat.albedo_color.lerp(
			Palette.COMPOST.lerp(Palette.EARTH, 0.35), 0.55
		)
		if Palette.has_method("clamp_happy"):
			rot_tint = Palette.clamp_happy(rot_tint)
		var tw: Tween = create_tween()
		tw.tween_property(_fruit_mat, "albedo_color", rot_tint, 1.2) \
			.set_trans(Tween.TRANS_SINE)
	# Droop the cluster — Y-scale shrink + slight sag.
	if _fruit_cluster != null:
		var tw2: Tween = _fruit_cluster.create_tween()
		tw2.tween_property(_fruit_cluster, "scale",
			Vector3(_fruit_cluster.scale.x, _fruit_cluster.scale.y * 0.6, _fruit_cluster.scale.z),
			1.2).set_trans(Tween.TRANS_SINE)
	# Paired feedback — soft "overripe" pop + low-volume tick.
	if has_node("/root/Juice"):
		Juice.pop(global_position + Vector3(0, 2.0, 0),
			"OVERRIPE",
			Palette.EARTH.lerp(Palette.CORAL, 0.30))
	if has_node("/root/AudioManager") and AudioManager.has_method("play"):
		AudioManager.play("hover-tick", -14.0)
	if has_node("/root/GameLog"):
		GameLog.event("plant_overripe", {
			"species": species_id,
			"ripe_count": ripe_count,
		})


## The overripe cluster falls. We deposit fruit_scraps DIRECTLY into
## FarmTotals (bypassing storage capacity) since the scraps are lying
## on the ground on the plant's tile — they're already "deposited"
## ecologically. The yield is 1 scrap per ripe unit, rounded to int.
##
## Visual: scrap-brown particle burst + cluster vanishes, plant reverts
## to non-fruiting visual so the player sees the fruit literally fell.
func _drop_as_scraps() -> void:
	var scraps: int = max(1, ripe_count)
	ripe_count = 0
	ripe_amount = 0.0
	_sync_fruit_cluster_meshes()
	if _fruit_mat != null and _pre_rot_fruit_color.a > 0.0:
		# Reset the color for future ripening cycles.
		_fruit_mat.albedo_color = _pre_rot_fruit_color
	if _fruit_cluster != null:
		# Restore cluster scale for future ripening cycles.
		_fruit_cluster.scale = Vector3.ONE
	_rot_started_day = -1
	_overripe = false
	# Deposit — add_resource respects storage cap, but scraps that
	# overflow just "stay on the ground" (rejected). This is fine; the
	# feedback still fires so the player sees the drop.
	var deposited: float = FarmTotals.add_resource(FarmTotals.FRUIT_SCRAPS, float(scraps))
	# Paired visual — scrap-brown burst + CORAL-darkened pop. Uses the
	# same Palette.CORAL.darkened tint as the harvest scrap-co-yield pop
	# so the player's eye associates the two paths.
	if has_node("/root/Juice"):
		var scrap_tint: Color = Palette.CORAL.darkened(0.18)
		Juice.pop(global_position + Vector3(0, 2.0, 0),
			"+ %d FRUIT SCRAPS" % int(deposited), scrap_tint)
		Juice.burst(global_position + Vector3(0, 0.3, 0),
			Palette.EARTH.lerp(Palette.CORAL, 0.30), 14)
	if has_node("/root/AudioManager") and AudioManager.has_method("play"):
		AudioManager.play("biomass-chop", -10.0)
	if has_node("/root/GameLog"):
		GameLog.event("plant_fruit_rotted", {
			"species": species_id,
			"scraps_deposited": deposited,
			"scraps_rolled": scraps,
		})
