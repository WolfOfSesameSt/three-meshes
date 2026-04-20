## Fairy Permaculture — a clickable plot of ground.
##
## Three states:
##   bare      — raw soil, thin pioneer OM.
##   planted   — a bush grows here.
##   enriched  — compost applied, rich dark soil + green fuzz.
##
## Visible fertility: every plot tracks an `om_pct` (0–10+). The disc
## albedo shifts grey-brown → mid-brown → rich-dark → near-black as
## OM climbs, and a cluster of tiny grass-blade sprites spawns once
## OM > 3 %. Moisture darkens the surface.
##
## Left-click is intentionally a no-op — actions route through the
## right-click context menu and task queue.
extends Node3D

signal clicked(plot: Node3D)
signal hover_changed(plot: Node3D, hovered: bool)

const STATE_BARE = "bare"
const STATE_ENRICHED = "enriched"
const STATE_PLANTED = "planted"

# Ramial wood-chip mulch: +5 % moisture retention (displayed as a
# multiplier the soil hydrology pass consults), + a visible chipper-tan
# tint laid on the disc surface.
const MULCH_MOISTURE_BONUS: float = 5.0  # percentage points on moisture_pct
const MULCH_RETENTION_BOOST: float = 0.05

const PlantScene = preload("res://scenes/plant.tscn")
const SoilInspectorPanelScene = preload("res://scenes/soil_inspector_panel.tscn")
const SoilOmShader = preload("res://shaders/soil_om.gdshader")

## Max OM we scale the OM shader uniform against. Past this we saturate
## at the COMPOST anchor + light up the mycelial flecks. The number is a
## hair above the Climax (10 %+) threshold so the visual top-out is
## reached deliberately, not accidentally.
const SHADER_OM_MAX: float = 12.0
## Per-tier thresholds for the novel "threshold celebration". Matches the
## six tiers surfaced by the inspector panel.
const TIER_THRESHOLDS: Array[float] = [1.0, 2.0, 3.0, 5.0, 10.0]
const TIER_NAMES: Array[String] = [
	"Barren", "Poor", "Developing", "Rich", "Abundant", "Climax",
]

@onready var _disc: MeshInstance3D = $Disc
@onready var _mound: MeshInstance3D = $Mound
@onready var _click_area: StaticBody3D = $ClickArea

var state: String = STATE_BARE
var om_pct: float = 0.4                 # barren baseline
var moisture_pct: float = 35.0          # 0–100
## Extra moisture-retention multiplier stacked on top of OM. Starts at 1.0
## (no bonus); spreading ramial wood-chip mulch adds MULCH_RETENTION_BOOST
## (permaculture-accurate — chips halve surface evaporation).
var moisture_retention: float = 1.0
var _mulched: bool = false
var _disc_mat: StandardMaterial3D
var _mound_mat: StandardMaterial3D
var _grass_fuzz: Node3D
## Target disc albedo (palette-sourced band color) we tween toward on
## each refresh — so OM ramps read as a gentle fade instead of a sudden
## color swap when the player applies compost. Assigned from the Palette
## inside `_ready()` before first refresh so no raw Color literal ever
## ships from this script.
var _target_albedo: Color
## Optional shader material — when the om_shader scene ships, it layers
## on top of the StandardMaterial3D. The standard material stays as the
## source-of-truth for highlight rim; we route OM colors through both so
## picking + hovering behave as before.
var _disc_shader_mat: ShaderMaterial
var _mound_shader_mat: ShaderMaterial
## OM sparkline history — the inspector panel draws it. Kept short
## (30 days) per the GDD spec.
const OM_HISTORY_MAX: int = 30
var om_history: Array[float] = []
## Last tier we announced a celebration for — so a single soil tier
## bump only fires its chime + scale-pop once (subsequent same-tier
## refreshes are silent).
var _last_tier_idx: int = -1


func _ready() -> void:
	_disc_mat = StandardMaterial3D.new()
	_disc.material_override = _disc_mat
	_mound_mat = StandardMaterial3D.new()
	_mound.material_override = _mound_mat
	_mound.visible = false
	# OM progression shader — sits next to the StandardMaterial3D. We
	# keep both wired: the StandardMaterial handles rim-highlight + hover
	# state (cheap, matches every other interactable) while the shader
	# delivers the warm-muted → rich-dark OM gradient + mycelial flecks
	# at climax. The shader material wins the render via next_pass; the
	# standard material is kept around so set_highlight() still reads.
	_disc_shader_mat = ShaderMaterial.new()
	_disc_shader_mat.shader = SoilOmShader
	_disc_mat.next_pass = _disc_shader_mat
	_mound_shader_mat = ShaderMaterial.new()
	_mound_shader_mat.shader = SoilOmShader
	_mound_mat.next_pass = _mound_shader_mat
	add_to_group("soil_plots")
	_click_area.input_event.connect(_on_click)
	_click_area.mouse_entered.connect(_on_mouse_enter)
	_click_area.mouse_exited.connect(_on_mouse_exit)
	Scheduler.day_advanced.connect(_on_day)
	# Listen to task_queued so we can intercept the zero-labor
	# "open_inspector" action and pop the panel immediately — without
	# forcing a fairy to fly here first. Other actions fall through to
	# the normal TaskQueue flow (travel → work → complete).
	if TaskQueue.has_signal("task_queued"):
		TaskQueue.task_queued.connect(_on_task_queued)
	# Seed the OM history + initial tier so the sparkline reads on first
	# open.
	om_history = []
	for _i in range(OM_HISTORY_MAX):
		om_history.append(om_pct)
	_last_tier_idx = _tier_index_for(om_pct)
	_target_albedo = _om_to_color(om_pct)
	_refresh_soil_appearance()


func _on_mouse_enter() -> void:
	set_highlight(true)
	emit_signal("hover_changed", self, true)


func _on_mouse_exit() -> void:
	set_highlight(false)
	emit_signal("hover_changed", self, false)


func set_highlight(on: bool) -> void:
	var highlight: Color = Palette.HONEY
	for m in [_disc_mat, _mound_mat]:
		if m == null: continue
		m.rim_enabled = on
		m.rim = 0.9 if on else 0.0
		m.rim_tint = 0.75
		m.emission_enabled = on
		m.emission = highlight
		m.emission_energy_multiplier = 0.3 if on else 0.0


## Apply a bag of finished compost to this plot. Moves bare → enriched.
## Any plant later placed here spawns already-mature + ripe.
## The compost bag was already debited at action-queue time, so the
## plot just consumes it visually here.
func apply_compost() -> bool:
	if state != STATE_BARE:
		return false
	state = STATE_ENRICHED
	om_pct = max(om_pct, 5.0)
	_mound.visible = true
	AudioManager.play("compost-scoop")
	Juice.pop(global_position + Vector3(0, 1.6, 0), "+1 ENRICHED SOIL", Palette.HONEY)
	Juice.burst(global_position + Vector3(0, 0.6, 0), Palette.EARTH, 18)
	_refresh_soil_appearance()
	return true


## Plant a salmonberry bush on this plot. Bare plots produce a
## seedling; enriched plots produce a mature ripe bush.
## Greens cost was debited at queue time.
func plant_bush() -> bool:
	if state == STATE_PLANTED:
		return false
	var enriched: bool = (state == STATE_ENRICHED)
	state = STATE_PLANTED
	# Spawn a plant here.
	var plant: Node3D = PlantScene.instantiate()
	plant.setup("salmonberry")
	get_parent().add_child(plant)
	plant.global_position = global_position
	# Main connects click + hover signals for any plant via a helper it
	# exposes; fall back to a direct call to the main scene.
	var main: Node = get_tree().current_scene
	if main.has_method("register_plant"):
		main.register_plant(plant)
	# If this plot was enriched, skip the grow timeline.
	if enriched:
		plant.stage = "mature"
		plant.age_days = 120
		plant.ripe_amount = 2.0
		plant.ripe_count = 2
		plant.growth_stage = VisualState.STAGE_FRUITING
	else:
		plant.stage = "seedling"
		plant.age_days = 10
		plant.ripe_amount = 0.0
		plant.ripe_count = 0
		plant.growth_stage = VisualState.STAGE_JUVENILE
		plant.scale = Vector3(0.5, 0.5, 0.5)
		var tw: Tween = plant.create_tween()
		tw.tween_property(plant, "scale", Vector3.ONE, 12.0).set_trans(Tween.TRANS_SINE)
	AudioManager.play("biomass-chop")
	Juice.pop(global_position + Vector3(0, 1.6, 0), "PLANTED" + (" ★" if enriched else ""), Palette.MEADOW)
	Juice.burst(global_position + Vector3(0, 0.6, 0), Palette.MEADOW, 12)
	queue_free()
	return true


func _on_day(_day: int, _season: String, _year: int) -> void:
	# Gentle drift — bare plots lose a trickle of OM, enriched plots
	# hold. Keeps the surface lively without being punishing.
	if state == STATE_BARE:
		om_pct = max(0.2, om_pct - 0.01)
	moisture_pct = clamp(moisture_pct + randf_range(-2.0, 3.0), 15.0, 85.0)
	_push_om_history()
	_refresh_soil_appearance()


func _push_om_history() -> void:
	om_history.append(om_pct)
	if om_history.size() > OM_HISTORY_MAX:
		om_history = om_history.slice(om_history.size() - OM_HISTORY_MAX)


## Additive OM bump — public so the inspector sim + any design agent
## can push OM up programmatically for a test. Clamped to 0–20 to match
## the per-tile range in DESIGN.md. Always refreshes visuals + fires the
## tier-crossing celebration if the new tier is higher.
func add_om(delta: float) -> void:
	om_pct = clamp(om_pct + delta, 0.0, 20.0)
	_push_om_history()
	_refresh_soil_appearance()


## Pop the parchment inspector for this plot. Auto-mounts a fresh panel
## as a child of the scene tree root if one isn't already in the
## `soil_inspector_panel` group — avoids touching hud.tscn (locked).
func open_inspector() -> void:
	var panel: Control = _find_or_spawn_inspector()
	if panel == null:
		return
	panel.call("show_for", self)


func _find_or_spawn_inspector() -> Control:
	var existing: Node = get_tree().get_first_node_in_group(
		"soil_inspector_panel"
	)
	if existing != null and existing is Control:
		return existing as Control
	var panel: Control = SoilInspectorPanelScene.instantiate()
	# Mount as a child of the current scene's HUD CanvasLayer so it
	# renders on top of the world. Fall back to the current scene root
	# if no HUD is reachable (headless sim path).
	var host: Node = null
	var cur_scene: Node = get_tree().current_scene
	if cur_scene:
		host = cur_scene.get_node_or_null("Hud")
		if host == null:
			host = cur_scene
	if host == null:
		host = get_tree().root
	host.add_child(panel)
	return panel


## Paint the disc based on OM + moisture; spawn the grass fuzz at OM>3.
## When mulched, the surface reads as a warm chipper-tan (EARTH toward
## HONEY) laid over the base soil so the player sees the mulch visually.
func _refresh_soil_appearance() -> void:
	var base: Color = _om_to_color(om_pct)
	# Moisture darkens the surface — 15 % cut at saturation.
	var moisture_k: float = clamp((moisture_pct - 20.0) / 60.0, 0.0, 1.0)
	var wet: Color = base.darkened(0.15 * moisture_k)
	if _mulched:
		# Blend toward the ramial chip tint. Kept through Palette.clamp_happy
		# so we never slip into cold-grey territory.
		var chip_tint: Color = Palette.EARTH.lerp(Palette.HONEY, 0.35)
		wet = Palette.clamp_happy(wet.lerp(chip_tint, 0.45))
	_target_albedo = wet
	_disc_mat.albedo_color = wet
	_disc_mat.roughness = lerp(0.95, 0.75, moisture_k)
	_mound_mat.albedo_color = wet.darkened(0.15)
	_sync_grass_fuzz(om_pct > 3.0)
	_update_om_shader(moisture_k)
	# Watch for a crossed tier threshold — fires the celebration.
	_check_tier_transition()


## Push the current palette-anchor colors + OM/moisture/mulch/climax-glow
## into the ShaderMaterial uniforms. We feed THREE anchors so the shader
## can tween per-pixel, and we flip emission on at climax OM for the
## night-glow beat.
func _update_om_shader(moisture_k: float) -> void:
	if _disc_shader_mat == null:
		return
	# Palette-sourced anchor set — matches the same ramp `_om_to_color`
	# uses but surfaced to the GPU as three separate colors so the
	# shader interpolates smoothly.
	var barren: Color = Palette.STRAW_DRY
	var mid: Color = Palette.WARM_STONE.lerp(Palette.EARTH, 0.4)
	var rich: Color = Palette.EARTH
	var climax: Color = Palette.COMPOST
	var mulch_tint: Color = Palette.EARTH.lerp(Palette.HONEY, 0.35)
	var om_t: float = clamp(om_pct / SHADER_OM_MAX, 0.0, 1.0)
	var flecks: float = 0.0
	var glow: float = 0.0
	if om_pct >= 10.0:
		flecks = clamp((om_pct - 10.0) / 2.0, 0.25, 1.0)
		# Subtle HONEY glow at climax — matches the existing emission
		# pattern used for other climax indicators elsewhere in the game.
		glow = 0.08
	_disc_shader_mat.set_shader_parameter("barren_color", _color_to_vec3(barren))
	_disc_shader_mat.set_shader_parameter("mid_color", _color_to_vec3(mid))
	_disc_shader_mat.set_shader_parameter("rich_color", _color_to_vec3(rich))
	_disc_shader_mat.set_shader_parameter("climax_color", _color_to_vec3(climax))
	_disc_shader_mat.set_shader_parameter("mulch_tint", _color_to_vec3(mulch_tint))
	_disc_shader_mat.set_shader_parameter("om_t", om_t)
	_disc_shader_mat.set_shader_parameter("moisture_t", moisture_k)
	_disc_shader_mat.set_shader_parameter("mulch_mix", 1.0 if _mulched else 0.0)
	_disc_shader_mat.set_shader_parameter("emission_amount", glow)
	_disc_shader_mat.set_shader_parameter("emission_tint", _color_to_vec3(Palette.HONEY))
	_disc_shader_mat.set_shader_parameter("flecks_intensity", flecks)
	_disc_shader_mat.set_shader_parameter("fleck_color", _color_to_vec3(Palette.MIST))
	# Mirror the same uniform pack onto the mound so the mound doesn't
	# stand out against a shifted disc.
	if _mound_shader_mat:
		_mound_shader_mat.set_shader_parameter("barren_color", _color_to_vec3(barren))
		_mound_shader_mat.set_shader_parameter("mid_color", _color_to_vec3(mid))
		_mound_shader_mat.set_shader_parameter("rich_color", _color_to_vec3(rich))
		_mound_shader_mat.set_shader_parameter("climax_color", _color_to_vec3(climax))
		_mound_shader_mat.set_shader_parameter("mulch_tint", _color_to_vec3(mulch_tint))
		_mound_shader_mat.set_shader_parameter("om_t", om_t)
		_mound_shader_mat.set_shader_parameter("moisture_t", moisture_k)
		_mound_shader_mat.set_shader_parameter("mulch_mix", 1.0 if _mulched else 0.0)
		_mound_shader_mat.set_shader_parameter("emission_amount", glow)
		_mound_shader_mat.set_shader_parameter("emission_tint", _color_to_vec3(Palette.HONEY))
		_mound_shader_mat.set_shader_parameter("flecks_intensity", flecks * 0.4)
		_mound_shader_mat.set_shader_parameter("fleck_color", _color_to_vec3(Palette.MIST))


func _color_to_vec3(c: Color) -> Vector3:
	return Vector3(c.r, c.g, c.b)


func _tier_index_for(om: float) -> int:
	var idx: int = 0
	for th in TIER_THRESHOLDS:
		if om >= th:
			idx += 1
	return clamp(idx, 0, TIER_NAMES.size() - 1)


func _check_tier_transition() -> void:
	var cur_idx: int = _tier_index_for(om_pct)
	if _last_tier_idx == -1:
		_last_tier_idx = cur_idx
		return
	if cur_idx > _last_tier_idx:
		_last_tier_idx = cur_idx
		var name: String = TIER_NAMES[cur_idx]
		AudioManager.play("compost-finish", -8.0)
		Juice.pop(global_position + Vector3(0, 1.8, 0), "SOIL → " + name.to_upper(), Palette.HONEY)
		Juice.burst(global_position + Vector3(0, 0.4, 0), Palette.MEADOW, 22)
		Juice.bump(0.25)
		# Gentle scale-pop — the disc briefly breathes +5% then settles.
		var tw: Tween = create_tween()
		var orig_scale: Vector3 = scale
		tw.tween_property(self, "scale", orig_scale * 1.05, 0.15).set_trans(Tween.TRANS_BACK)
		tw.tween_property(self, "scale", orig_scale, 0.25).set_trans(Tween.TRANS_SINE)
	elif cur_idx < _last_tier_idx:
		_last_tier_idx = cur_idx   # silent downward — no celebration


## Apply a ramial wood-chip mulch layer. Bumps moisture + tags the plot
## as mulched so the surface visibly browns. Paired with a chipper-tan
## particle puff + soft rustle on completion.
func _apply_wood_chip_mulch() -> void:
	if _mulched:
		return
	_mulched = true
	moisture_retention += MULCH_RETENTION_BOOST
	moisture_pct = min(100.0, moisture_pct + MULCH_MOISTURE_BONUS)
	var chip_tint: Color = Palette.EARTH.lerp(Palette.HONEY, 0.35)
	AudioManager.play("biomass-chop", -10.0)
	Juice.pop(global_position + Vector3(0, 1.6, 0), "+ MULCHED", chip_tint)
	Juice.burst(global_position + Vector3(0, 0.3, 0), chip_tint, 14)
	_refresh_soil_appearance()


func _om_to_color(om: float) -> Color:
	# Palette-sourced soil progression.
	#   Barren (<1 %)  = STRAW_DRY (sun-bleached, NOT grey)
	#   Mid    (2–3 %) = WARM_STONE warmed toward EARTH
	#   Rich   (5 %)   = EARTH
	#   Climax (10 %+) = COMPOST
	# Every step runs through Palette.clamp_happy to hold the floor.
	var barren: Color = Palette.STRAW_DRY
	var mid: Color = Palette.WARM_STONE.lerp(Palette.EARTH, 0.4)
	var rich: Color = Palette.EARTH
	var climax: Color = Palette.COMPOST
	var out: Color
	if om <= 1.0:
		out = barren
	elif om <= 3.0:
		out = barren.lerp(mid, (om - 1.0) / 2.0)
	elif om <= 5.0:
		out = mid.lerp(rich, (om - 3.0) / 2.0)
	elif om <= 10.0:
		out = rich.lerp(climax, (om - 5.0) / 5.0)
	else:
		out = climax
	return Palette.clamp_happy(out)


func _sync_grass_fuzz(show: bool) -> void:
	if show and _grass_fuzz == null:
		_grass_fuzz = Node3D.new()
		_grass_fuzz.name = "GrassFuzz"
		_grass_fuzz.position = Vector3(0, 0.15, 0)
		add_child(_grass_fuzz)
		var rng: RandomNumberGenerator = RandomNumberGenerator.new()
		rng.seed = hash(name) & 0xffffff
		var blade_mat: StandardMaterial3D = StandardMaterial3D.new()
		blade_mat.albedo_color = Palette.OLIVE_DARK.lerp(Palette.MEADOW, 0.4)
		for i in range(14):
			var mi: MeshInstance3D = MeshInstance3D.new()
			var bm: BoxMesh = BoxMesh.new()
			bm.size = Vector3(0.04, 0.18, 0.04)
			mi.mesh = bm
			mi.material_override = blade_mat
			var theta: float = rng.randf() * TAU
			var r: float = rng.randf_range(0.1, 1.05)
			mi.position = Vector3(cos(theta) * r, 0.09, sin(theta) * r)
			mi.rotation.z = rng.randf_range(-0.2, 0.2)
			mi.scale = Vector3.ZERO
			_grass_fuzz.add_child(mi)
			var tw: Tween = mi.create_tween()
			tw.tween_property(mi, "scale", Vector3.ONE, 0.5).set_trans(Tween.TRANS_BACK)
	elif not show and _grass_fuzz != null:
		var g: Node = _grass_fuzz
		_grass_fuzz = null
		g.queue_free()


## LMB is a no-op — see plant.gd / compost_pile.gd. Routes go via RMB.
func _on_click(_cam: Node, _event: InputEvent, _pos: Vector3, _norm: Vector3, _shape: int) -> void:
	pass


# =====================================================================
# Universal right-click contract
# =====================================================================

func get_context_actions() -> Array:
	var out: Array = []
	# ALWAYS-surfaced inspector. Zero cost, zero labor — the task_queued
	# listener on this plot intercepts the dispatch and pops the panel
	# synchronously, so the player never has to wait for a fairy to
	# arrive. Kept at the top so it's the first row in the context menu.
	out.append(Interactable.make_action(
		"open_inspector", "Inspect soil", 0.0,
		{}, {},
		"", Interactable.DROP_NONE, 1
	))
	if FarmTotals.get_resource(FarmTotals.COMPOST) >= 1.0:
		out.append(Interactable.make_action(
			"apply_compost", "Spread compost", 6.0,
			{"compost": 1.0}, {},
			"", Interactable.DROP_NONE, 1
		))
	# Plant-bush action pays in plant_trim (the taxonomy-refactor successor
	# of the old "greens" bucket). Seeds alone also satisfy the visibility
	# gate so the player isn't locked out with seed-in-hand but no trim.
	if FarmTotals.get_resource(FarmTotals.PLANT_TRIM) >= 1.0 or FarmTotals.get_resource(FarmTotals.SEEDS) >= 1.0:
		out.append(Interactable.make_action(
			"plant_bush", "Plant bush", 8.0,
			{"plant_trim": 1.0}, {},
			"", Interactable.DROP_NONE, 1
		))
	# Ramial wood-chip mulch. Needs 2 chips; boosts moisture retention +
	# visibly browns the disc. Blocked once already mulched so the player
	# doesn't waste chips stacking. Auto-pickup via wood_chips cost key.
	if FarmTotals.get_resource(FarmTotals.WOOD_CHIPS) >= 2.0 and not _mulched:
		out.append(Interactable.make_action(
			"spread_wood_chip_mulch", "Spread wood chip mulch", 10.0,
			{"wood_chips": 2.0}, {},
			"", Interactable.DROP_NONE, 1
		))
	# Water the plot — spends 1 water, bumps moisture_pct by +20, visibly
	# darkens the surface (wet-earth re-tint on the next _refresh call).
	# Always surfaced so the player sees the option; greyed when no water.
	# Auto-pickup flow lights via the "water" cost key in MATERIAL_RESOURCES.
	var act_water_plot: Dictionary = Interactable.make_action(
		"water_plot", "Water plot", 5.0,
		{"water": 1.0}, {},
		"", Interactable.DROP_NONE, 1
	)
	act_water_plot["disabled"] = FarmTotals.get_resource(FarmTotals.WATER) < 1.0
	out.append(act_water_plot)
	# Amendment actions — appended by Soil Amendment Engineer. Each is
	# always surfaced (so the player sees the option) + disabled when
	# short on stock. Pickup flow auto-lights because the cost key is in
	# Interactable.MATERIAL_RESOURCES (compost / bone_meal / biochar).
	_append_amendment_actions(out)
	# Day-0 Activities Engineer: cover-crop planting. Only appears on
	# empty plots (no active cover crop, not yet planted as a bush).
	# Three species: clover / vetch (N-fixers) + buckwheat (P-accumulator).
	_append_cover_crop_actions(out)
	return out


func display_name() -> String:
	return "Soil Plot"


## Intercept `open_inspector` at queue time — it's a zero-labor UI pop,
## not real work, so we pop the panel immediately + cancel the task so
## no fairy wastes a trip. All other actions fall through to the normal
## TaskQueue flow (travel → work → `complete()` hook below).
func _on_task_queued(t: Dictionary) -> void:
	if t.get("target") != self:
		return
	var action: Dictionary = t.get("action", {})
	if String(action.get("id", "")) != "open_inspector":
		return
	open_inspector()
	TaskQueue.cancel_task(t["id"])


## TaskQueue completion hook — runs the in-place effect.
func complete(action: Dictionary) -> void:
	var id: String = action.get("id", "")
	match id:
		"open_inspector":
			# Fallback — if the task_queued intercept somehow didn't fire
			# (e.g. the plot was added to the group AFTER queue) the
			# complete() call still pops the panel.
			open_inspector()
		"apply_compost":
			apply_compost()
		"plant_bush":
			plant_bush()
		"water_plot":
			# +20 moisture — permaculture-accurate bucket. The soil paint
			# immediately reads wetter (moisture_k term inside _om_to_color
			# darkens the surface toward a wet-earth tone).
			moisture_pct = min(100.0, moisture_pct + 20.0)
			AudioManager.play("hover-tick", -6.0)
			var water_tint: Color = Palette.SKY.lerp(Palette.MIST, 0.20)
			Juice.pop(global_position + Vector3(0, 1.6, 0), "+ WATER", water_tint)
			Juice.burst(global_position + Vector3(0, 0.3, 0), water_tint, 10)
			_refresh_soil_appearance()
		"spread_wood_chip_mulch":
			_apply_wood_chip_mulch()
		"apply_compost_amend":
			_apply_compost_amendment()
		"apply_bone_meal":
			_apply_bone_meal_amendment()
		"apply_biochar":
			_apply_biochar_amendment()
		# Day-0 cover-crop paths. Three species feed three different
		# soil channels (see _append_cover_crop_actions + _cover_crop_*).
		"plant_clover":
			_plant_cover_crop("clover")
		"plant_vetch":
			_plant_cover_crop("vetch")
		"plant_buckwheat":
			_plant_cover_crop("buckwheat")
		"chop_cover_crop":
			_chop_cover_crop()


# =====================================================================
# Amendment engine — Soil Amendment Engineer (append-only block).
#
# Closes the death → soil + compost → plot loops. Three finished
# amendments funnel into three soil-engine dimensions:
#
#   compost    → OM + biology + worms          (broad spectrum)
#   bone_meal  → P + Ca                        (hardest to acquire,
#                                               chickens → butcher →
#                                               kiln fire → bone_meal)
#   biochar    → CEC (permanent) + biology     (late-game charged-char)
#
# Per-nutrient state is tracked on this plot via the nutrient fields
# declared below — the inspector panel reads them for its bars when
# `has_nutrient_state()` returns true, otherwise it falls back to the
# OM-derived estimators.
# =====================================================================

## Phosphorus as ppm of plant-available (Bray/Mehlich). 0–100 band.
## Bumps ~+30 per bone_meal application (consistent with the 15–30%
## P content of calcined bone meal).
var p_avail: float = 10.0
## Available nitrogen (nitrate + ammonium combined), 0–100 band.
## Not amended in this batch — blood_meal lands the nitrogen channel
## on a later pass.
var n_avail: float = 10.0
## Potassium, 0–100 band. Left at a gentle baseline.
var k_avail: float = 15.0
## Calcium (ppm-ish). Bone meal nudges this by +15 per application
## since calcined bone is ~35 % Ca.
var ca_ppm: float = 25.0
## Magnesium, 0–100 band. Placeholder for the dolomite amendment.
var mg_ppm: float = 15.0
## Sulfur, 0–100 band. Placeholder for gypsum / elemental S.
var s_ppm: float = 10.0
## Cation-exchange capacity, 0–80 meq/100g. Charged biochar pushes
## this up PERMANENTLY (no decay path) — the feedback_full_soil_engine
## doc names biochar as the only structural CEC amendment we ship.
var cec: float = 8.0
## Microbial biology index, 0–1. Compost + biochar both seed biology.
var biology_pct: float = 0.10
## Fungal:Bacterial ratio. Young bacterial-dominant, climax fungal.
var fb_ratio: float = 0.5
## Earthworms per m² — climbs with OM + compost + biology.
var worm_density: float = 0.0
## Last-applied amendment trail — so the soil shader can overlay a
## darker/richer tint for ~2 seconds after each amendment apply. The
## inspector panel could read this later for a "last amended" line.
var _last_amend_tint: Color = Palette.COMPOST
var _last_amend_t: float = -1.0
const AMEND_DARKEN_WINDOW: float = 2.0


## Expose a flag for the inspector — true once this build ships the
## nutrient fields (always, post-engineer pass). The inspector can
## choose to read p_avail etc. directly instead of OM-estimating.
func has_nutrient_state() -> bool:
	return true


## Append the three amendment actions to `out`. Kept in a helper so
## `get_context_actions()` stays a tiny one-liner call. Always surfaces
## each action (disabled=true when short) so the player learns the
## amendment pathway exists even before they have stock.
func _append_amendment_actions(out: Array) -> void:
	var compost_stock: float = FarmTotals.get_resource(FarmTotals.COMPOST)
	var act_compost: Dictionary = Interactable.make_action(
		"apply_compost_amend", "Apply compost (OM + biology)", 8.0,
		{"compost": 1.0}, {},
		"", Interactable.DROP_NONE, 1,
	)
	act_compost["disabled"] = compost_stock < 1.0
	act_compost["tooltip"] = "Finished compost — balanced OM + microbial biology. Apply to any plot to raise OM, biology, and worm density. See soil inspector → Biology bar."
	out.append(act_compost)

	var bone_stock: float = FarmTotals.get_resource(FarmTotals.BONE_MEAL)
	var act_bone: Dictionary = Interactable.make_action(
		"apply_bone_meal", "Apply bone meal (P amendment)", 6.0,
		{"bone_meal": 1.0}, {},
		"", Interactable.DROP_NONE, 1,
	)
	act_bone["disabled"] = bone_stock < 1.0
	act_bone["tooltip"] = "Bone meal — 15-30 % P amendment. Apply to plots deficient in phosphorus. See soil inspector -> NPK bars."
	out.append(act_bone)

	var biochar_stock: float = FarmTotals.get_resource(FarmTotals.BIOCHAR)
	var act_biochar: Dictionary = Interactable.make_action(
		"apply_biochar", "Apply biochar (CEC, permanent)", 8.0,
		{"biochar": 1.0}, {},
		"", Interactable.DROP_NONE, 1,
	)
	act_biochar["disabled"] = biochar_stock < 1.0
	act_biochar["tooltip"] = "Biochar — permanent CEC (cation exchange). Fires with compost to charge soil microbes. See soil inspector -> CEC."
	out.append(act_biochar)


## Compost application: +OM, +biology, +worms. Paired audio + juice
## pop + particle burst. Shader nudges darker via _mark_amendment_tint.
func _apply_compost_amendment() -> void:
	om_pct = clamp(om_pct + 1.0, 0.0, 20.0)
	biology_pct = clamp(biology_pct + 0.15, 0.0, 1.0)
	worm_density = min(worm_density + 10.0, 250.0)
	_push_om_history()
	_mark_amendment_tint(Palette.COMPOST)
	AudioManager.play("compost-scoop", -4.0)
	Juice.pop(global_position + Vector3(0, 1.6, 0), "+ COMPOST", Palette.COMPOST)
	Juice.burst(global_position + Vector3(0, 0.4, 0), Palette.COMPOST, 18)
	_refresh_soil_appearance()


## Bone-meal application: +P (cap 100), +Ca. Paired feedback.
## The hardest amendment to acquire (chicken death → butcher → kiln).
func _apply_bone_meal_amendment() -> void:
	p_avail = clamp(p_avail + 30.0, 0.0, 100.0)
	ca_ppm = clamp(ca_ppm + 15.0, 0.0, 100.0)
	var bone_tint: Color = Palette.WARM_STONE
	_mark_amendment_tint(bone_tint.lerp(Palette.PARCHMENT, 0.35))
	AudioManager.play("bone-meal-pop", -4.0)
	Juice.pop(global_position + Vector3(0, 1.6, 0), "+ BONE MEAL · P", bone_tint)
	Juice.burst(global_position + Vector3(0, 0.4, 0), bone_tint.lerp(Palette.PARCHMENT, 0.35), 16)
	_refresh_soil_appearance()


## Biochar application: +CEC (cap 80, PERMANENT), +biology.
## Charged biochar is the only structural CEC lever in the engine.
func _apply_biochar_amendment() -> void:
	cec = clamp(cec + 5.0, 0.0, 80.0)
	biology_pct = clamp(biology_pct + 0.10, 0.0, 1.0)
	var biochar_tint: Color = Palette.COMPOST.lerp(Palette.INK, 0.3)
	_mark_amendment_tint(biochar_tint)
	AudioManager.play("hover-tick", -2.0)
	Juice.pop(global_position + Vector3(0, 1.6, 0), "+ BIOCHAR · CEC", biochar_tint)
	Juice.burst(global_position + Vector3(0, 0.4, 0), biochar_tint, 18)
	_refresh_soil_appearance()


## Nudge the disc + mound materials a shade darker for ~2 s after an
## amendment apply — paired visible feedback. The StandardMaterial3D
## albedo is the source-of-truth for the debug readback so we tween it
## toward the amendment tint, then release back to the OM-derived base.
func _mark_amendment_tint(tint: Color) -> void:
	_last_amend_tint = tint
	_last_amend_t = 0.0
	if _disc_mat == null:
		return
	var tw: Tween = create_tween()
	var base: Color = _om_to_color(om_pct)
	var dark_mix: Color = Palette.clamp_happy(base.lerp(tint, 0.40).darkened(0.05))
	tw.tween_property(_disc_mat, "albedo_color", dark_mix, 0.35)
	tw.tween_property(_disc_mat, "albedo_color", base, AMEND_DARKEN_WINDOW).set_trans(Tween.TRANS_SINE)
	if _mound_mat != null:
		var tw2: Tween = create_tween()
		var dark_mix_m: Color = Palette.clamp_happy(base.darkened(0.15).lerp(tint, 0.40))
		tw2.tween_property(_mound_mat, "albedo_color", dark_mix_m, 0.35)
		tw2.tween_property(_mound_mat, "albedo_color", base.darkened(0.15), AMEND_DARKEN_WINDOW).set_trans(Tween.TRANS_SINE)


## Soil-inspector helper — build a small array of amendment hints for
## the plot given its current deficiency profile. Returns entries like
## "Low P. Apply bone meal (from kiln: bones → bone meal)." so the
## inspector panel can read+render them append-only without owning the
## full recommendation taxonomy.
func amendment_recommendations() -> Array[String]:
	var out: Array[String] = []
	if p_avail < 20.0:
		out.append("Low P. Apply bone meal (from kiln: bones -> bone meal).")
	if n_avail < 20.0:
		out.append("Low N. Plant legumes (clover, vetch) or apply blood meal.")
	if cec < 15.0:
		out.append("Low CEC. Apply biochar for permanent nutrient holding.")
	if om_pct < 2.0:
		out.append("Low OM. Apply compost + chop-and-drop cover crops.")
	return out


# =====================================================================
# APPEND-ONLY: Day-0 Activities Engineer — cover-crop planting.
# --------------------------------------------------------------------
# Three species the player can plant on any empty plot to kick a slow
# fertility loop while the compost cook runs:
#
#   clover    — Rhizobium N-fixer. +1 n_avail / 3 days. 60-day cycle.
#   vetch     — faster N-fixer, winter-tolerant. +1 n_avail / 2 days.
#   buckwheat — P-accumulator (scavenges soil phosphorus via fine roots).
#               +1 p_avail / 3 days. 45-day cycle (summer-fast).
#
# On chop-and-drop the cover crop yields plant_trim + a final burst of
# its channel (N or P). We reuse the existing `_grass_fuzz` approach for
# the visual — a tinted halo of tiny meshes that tint per species.
#
# Cost: 1 seed per plant. Each tick increments `cover_crop_days` and
# advances the visible mesh scale. After the species' cycle completes
# the "Chop cover crop" action surfaces.
# =====================================================================

const COVER_CROP_SCHEDULE: Dictionary = {
	"clover":    { "n_per_day": 1.0 / 3.0, "p_per_day": 0.0,       "cycle_days": 60, "blades": 14 },
	"vetch":     { "n_per_day": 1.0 / 2.0, "p_per_day": 0.0,       "cycle_days": 50, "blades": 12 },
	"buckwheat": { "n_per_day": 0.0,       "p_per_day": 1.0 / 3.0, "cycle_days": 45, "blades": 16 },
}

var cover_crop_active: String = ""
var cover_crop_days: int = 0
var _cover_crop_mesh: Node3D = null


## Surface a planting row per species when the plot is empty (no bush,
## no active cover crop). Always-disabled-when-short-on-seeds so the
## player learns the option exists even before their first seed harvest.
func _append_cover_crop_actions(out: Array) -> void:
	if state == STATE_PLANTED:
		return
	if cover_crop_active != "":
		# Chop-and-drop surfaces once the cycle completes — yields
		# plant_trim back to storage + dumps the residual N/P into the
		# plot. Also covers the mid-cycle abort case (partial yield).
		var ready: bool = cover_crop_days >= int(COVER_CROP_SCHEDULE[cover_crop_active]["cycle_days"])
		var label: String = "Chop cover crop"
		if ready:
			label = "Chop %s (ready)" % cover_crop_active.capitalize()
		else:
			label = "Chop %s (early)" % cover_crop_active.capitalize()
		out.append(Interactable.make_action(
			"chop_cover_crop", label, 10.0,
			{}, {"plant_trim": 2.0 if ready else 1.0},
			"", Interactable.DROP_STORAGE, 1
		))
		return
	var have_seeds: float = FarmTotals.get_resource(FarmTotals.SEEDS)
	for species in ["clover", "vetch", "buckwheat"]:
		var act: Dictionary = Interactable.make_action(
			"plant_%s" % species, "Plant %s (cover crop)" % species, 15.0,
			{"seeds": 1.0}, {},
			"", Interactable.DROP_NONE, 1
		)
		act["disabled"] = have_seeds < 1.0
		var hint: String = "N-fixer — builds soil nitrogen over ~60 days."
		if species == "vetch":
			hint = "Winter-tolerant N-fixer — fast nitrogen."
		elif species == "buckwheat":
			hint = "P-accumulator — summer-fast, scavenges phosphorus."
		act["tooltip"] = hint
		out.append(act)


## Plant the named cover-crop. Stamps state + daily-tick listener via the
## existing Scheduler connection (_on_day) — we hook an additional
## callback here so the main `_on_day` stays untouched.
func _plant_cover_crop(species: String) -> void:
	if cover_crop_active != "" or not COVER_CROP_SCHEDULE.has(species):
		return
	cover_crop_active = species
	cover_crop_days = 0
	_spawn_cover_crop_mesh(species)
	# Paired feedback — MEADOW pop + small burst per species tint.
	AudioManager.play("seedling-sprout", -4.0)
	var tint: Color = _cover_crop_tint(species)
	Juice.pop(global_position + Vector3(0, 1.6, 0),
		"PLANTED " + species.to_upper(), tint)
	Juice.burst(global_position + Vector3(0, 0.4, 0), tint, 14)
	# Register the per-day advance — idempotent, cheap to reconnect.
	if Scheduler.has_signal("day_advanced") and not Scheduler.is_connected("day_advanced", _on_cover_crop_day):
		Scheduler.day_advanced.connect(_on_cover_crop_day)


## Daily tick driven by Scheduler.day_advanced — advances the cover
## crop + deposits its channel's increment onto the plot.
func _on_cover_crop_day(_day: int, _season: String, _year: int) -> void:
	if cover_crop_active == "":
		return
	cover_crop_days += 1
	var sched: Dictionary = COVER_CROP_SCHEDULE[cover_crop_active]
	n_avail = clamp(n_avail + float(sched["n_per_day"]), 0.0, 100.0)
	p_avail = clamp(p_avail + float(sched["p_per_day"]), 0.0, 100.0)
	# Visible growth — scale the mesh from 0.3 to 1.0 over the cycle.
	if _cover_crop_mesh != null and is_instance_valid(_cover_crop_mesh):
		var t: float = clamp(float(cover_crop_days) / float(sched["cycle_days"]), 0.0, 1.0)
		_cover_crop_mesh.scale = Vector3.ONE * (0.3 + 0.7 * t)


## End the cover-crop: yield plant_trim back (via the action's yield dict
## — already in the basket) + dump a bonus to the channel for completion.
## Clears state + kills the mesh. The plant_trim yield is handled by the
## TaskQueue → FarmTotals deposit pipeline (we don't touch FarmTotals
## directly here).
func _chop_cover_crop() -> void:
	if cover_crop_active == "":
		return
	var species: String = cover_crop_active
	var sched: Dictionary = COVER_CROP_SCHEDULE[species]
	var ready: bool = cover_crop_days >= int(sched["cycle_days"])
	# Bonus nutrient dump on completion — the decomposing residue
	# releases its channel in one push. Early-chop loses the bonus.
	if ready:
		if species == "clover" or species == "vetch":
			n_avail = clamp(n_avail + 5.0, 0.0, 100.0)
		elif species == "buckwheat":
			p_avail = clamp(p_avail + 5.0, 0.0, 100.0)
	# Also bumps OM via the decomposing biomass.
	om_pct = clamp(om_pct + (0.5 if ready else 0.2), 0.0, 20.0)
	_push_om_history()
	AudioManager.play("biomass-chop")
	var tint: Color = _cover_crop_tint(species)
	Juice.pop(global_position + Vector3(0, 1.6, 0),
		"CHOPPED " + species.to_upper(), tint)
	Juice.burst(global_position + Vector3(0, 0.3, 0), tint, 18)
	cover_crop_active = ""
	cover_crop_days = 0
	if _cover_crop_mesh != null and is_instance_valid(_cover_crop_mesh):
		_cover_crop_mesh.queue_free()
		_cover_crop_mesh = null
	_refresh_soil_appearance()


## Per-species tint — kept inside the palette (MEADOW/SAGE/HONEY/CORAL).
func _cover_crop_tint(species: String) -> Color:
	match species:
		"clover":
			# Clover — classic MEADOW green with a warm honey edge.
			return Palette.MEADOW.lerp(Palette.HONEY, 0.15)
		"vetch":
			# Vetch — deeper SAGE, flowering purple undertone via BERRY.
			return Palette.SAGE.lerp(Palette.BERRY, 0.25)
		"buckwheat":
			# Buckwheat — creamy-white flower + pinkish stem; PARCHMENT
			# lerped toward CORAL.
			return Palette.PARCHMENT.lerp(Palette.CORAL, 0.30)
	return Palette.MEADOW


## Build a cheap cluster of tiny tinted box-meshes to indicate the cover
## crop. Mirrors `_sync_grass_fuzz` in shape so the visual language is
## consistent with the OM-3%+ fuzz the plot already shows.
func _spawn_cover_crop_mesh(species: String) -> void:
	if _cover_crop_mesh != null and is_instance_valid(_cover_crop_mesh):
		_cover_crop_mesh.queue_free()
	var sched: Dictionary = COVER_CROP_SCHEDULE[species]
	var host: Node3D = Node3D.new()
	host.name = "CoverCrop_%s" % species
	host.position = Vector3(0, 0.15, 0)
	add_child(host)
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.albedo_color = Palette.clamp_happy(_cover_crop_tint(species))
	var rng: RandomNumberGenerator = RandomNumberGenerator.new()
	rng.seed = (hash(name) ^ hash(species)) & 0x7fffffff
	var blades: int = int(sched["blades"])
	for i in range(blades):
		var mi: MeshInstance3D = MeshInstance3D.new()
		var bm: BoxMesh = BoxMesh.new()
		bm.size = Vector3(0.06, 0.14, 0.06)
		mi.mesh = bm
		mi.material_override = mat
		var theta: float = rng.randf() * TAU
		var r: float = rng.randf_range(0.15, 1.1)
		mi.position = Vector3(cos(theta) * r, 0.07, sin(theta) * r)
		mi.rotation.z = rng.randf_range(-0.25, 0.25)
		host.add_child(mi)
	host.scale = Vector3.ONE * 0.3  # starts small, grows with cover_crop_days
	_cover_crop_mesh = host


## Expose a read-only snapshot for the debug sim / save system.
func cover_crop_state() -> Dictionary:
	return {
		"species": cover_crop_active,
		"days": cover_crop_days,
	}
