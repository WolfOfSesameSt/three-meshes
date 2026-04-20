## Fairy Permaculture — interactable world-decor node.
##
## One node per tree / rock / deadwood log / twigs pile. Each instance:
##   • Builds its own low-poly mesh based on `kind` (+ scale variation)
##   • Hover rim-light on the same StandardMaterial3D pattern as
##     `plant.gd` (rim_enabled + rim_tint + emission on hover)
##   • Carries an `Interactable`-compatible set of context-menu actions
##     exposed via `get_context_actions()` so the generic right-click
##     path in main.gd can discover them without knowing decor details.
##   • `complete(action_id)` runs when the TaskQueue finishes the job:
##     yields are handed to FarmTotals (best effort — wood/stone/twigs
##     become biomass stand-ins until the sibling agent adds those
##     resource channels), a particle burst plays, and the node fades
##     itself out via a scale-down tween.
##
## Continuous-growth tree model (supersedes the 3-tier discrete system —
## see docs/design/tree-growth-continuous.md):
##   • Every tree carries a `species_id`, `age_days`, `max_age_days`, and
##     a continuous `size_progress` (0..1) derived from a per-species
##     sigmoid: progress = 1 - exp(-age_days / time_constant).
##   • `size_scale` lerps between seedling_scale and max_scale. The node's
##     visual scale follows, so each year produces a visible growth pulse.
##   • `kind` (tree_small/mature/old) is a **visual label** derived from
##     `size_progress`, not a gating mechanic. Mechanics use size_progress
##     directly (yield scaling, branchfall chance, old-growth flourishes).
##   • YEAR-END pulse fires at every day % 120 == 0: soft scale-pop +
##     MEADOW juice glyph + soft chime. Between pulses, daily growth is
##     a micro-interpolation so the player never sees a still tree.
##   • Prune keeps the tree alive — cosmetic scale-pop + brief leaf-loss
##     tween; twigs + plant_trim yielded. Aging continues normally.
##   • Death at max_age_days → desaturate tween, collapse into a
##     deadwood_log at the same XZ.
##   • Branchfall rate scales with size_progress × size_scale.
##
## Emits `clicked` / `hover_changed` so the main scene can treat decor
## uniformly alongside plants and buildings.
extends Node3D

signal clicked(item: Node3D)
signal hover_changed(item: Node3D, hovered: bool)

# Hover highlight — honey-gold. Sourced from Palette so swapping the
# anchor changes every decor item's rim cue in one place.
var HIGHLIGHT: Color = Palette.HONEY

## Variant of decor. One of:
##   "tree_small", "tree_mature", "tree_old",
##   "rock", "deadwood_log", "twigs_pile"
##
## For trees, `kind` is a visual-label alias derived from `size_progress`.
## All gameplay mechanics consult `size_progress` directly; the kind
## string only drives silhouette choice + click-hitbox sizing.
@export var kind: String = "tree_small"

## A single deterministic seed for this item's visual variation so the
## scattered world looks the same on every launch.
@export var variant_seed: int = 0

## How big this prop is relative to its default.
@export var visual_scale: float = 1.0

## Which BC-coastal species this tree represents. "" for non-trees.
@export var species_id: String = ""

## Age of this tree in game-days. Randomised on spawn inside a tier
## band so the scattered forest reads mixed-age.
@export var age_days: int = 0

## Max age for this tree. Rolled per species on spawn. When
## `age_days >= max_age_days`, the tree collapses into a deadwood_log.
@export var max_age_days: int = 0

## Continuous growth progress (0..1), derived each day from a per-species
## sigmoid. Public so the sim + inspector can read it.
var size_progress: float = 0.0

## Current visual scale (lerp between seedling_scale and max_scale on the
## species row). Tween-tracked on year-end pulses.
var size_scale: float = 1.0

# ---- Species biology table — CONTINUOUS model.
# See docs/design/tree-growth-continuous.md for full derivation.
# growth_80pct_days = days to reach 80 % of max scale.
# time_constant = growth_80pct_days / 1.6 (so progress ~ 0.8 at 80pct).
# longevity_mean ± sigma in game days. Seedling/max scale pins the
# visual stretch the sigmoid drives.
const SPECIES_TABLE: Dictionary = {
	"red_alder": {
		"growth_80pct_days": 2400, "longevity_mean": 6000, "longevity_sigma": 900,
		"seedling_scale": 0.25, "max_scale": 2.2,
		"form": "broad_crown_fast", "trunk": "thin_smooth",
	},
	"pacific_crabapple": {
		"growth_80pct_days": 1800, "longevity_mean": 4800, "longevity_sigma": 700,
		"seedling_scale": 0.20, "max_scale": 1.4,
		"form": "compact_fruit", "trunk": "knotted",
	},
	"big_leaf_maple": {
		"growth_80pct_days": 3600, "longevity_mean": 9600, "longevity_sigma": 1200,
		"seedling_scale": 0.30, "max_scale": 2.8,
		"form": "palmate_large", "trunk": "thick_mossy",
	},
	"bigleaf_maple": {
		"growth_80pct_days": 3600, "longevity_mean": 9600, "longevity_sigma": 1200,
		"seedling_scale": 0.30, "max_scale": 2.8,
		"form": "palmate_large", "trunk": "thick_mossy",
	},
	"douglas_fir": {
		"growth_80pct_days": 6000, "longevity_mean": 24000, "longevity_sigma": 4800,
		"seedling_scale": 0.20, "max_scale": 4.5,
		"form": "conifer_cone", "trunk": "straight_deep_bark",
	},
	"western_red_cedar": {
		"growth_80pct_days": 7200, "longevity_mean": 36000, "longevity_sigma": 6000,
		"seedling_scale": 0.20, "max_scale": 4.2,
		"form": "columnar_cedar", "trunk": "fibrous_red_brown",
	},
}

# Visual-label thresholds on size_progress.
const LABEL_SAPLING_MAX: float = 0.25
const LABEL_MATURE_MAX: float  = 0.70

# Spawn-age bands — each band maps to the sigmoid region that yields the
# matching label. The scatter path still hands kind in as a hint; age is
# rolled per-species so the resulting size_progress lands in the band.
const AGE_BAND_SMALL: Array[int]  = [30, 400]
const AGE_BAND_MATURE: Array[int] = [600, 2000]
const AGE_BAND_OLD: Array[int]    = [2800, 4800]

# Branchfall tuning. Per-day chance = BASE × size_progress × (size_scale / max_scale).
# Storms multiply ×5. Windfall drop only happens during storms.
const BRANCHFALL_BASE_CHANCE: float   = 0.05
const STORM_MULTIPLIER: float         = 5.0
const BRANCHFALL_OFFSET_MIN: float    = 0.8
const BRANCHFALL_OFFSET_MAX: float    = 2.0

# Drop-kind roll weights (sum = 1.0; windfall only valid during storms).
const DROP_WEIGHT_TWIGS: float      = 0.70
const DROP_WEIGHT_DEADWOOD: float   = 0.25
const DROP_WEIGHT_WINDFALL: float   = 0.05

# Year-end growth pulse cadence — 1 game year == 120 days.
const YEAR_DAYS: int = 120
# Year-end tween duration (scale-pop back-ease).
const YEAR_PULSE_SECONDS: float = 1.2

# Hard safety cap — don't balloon scene size if the player never gathers.
## Mutable at runtime (the headless forest-sim bumps it to keep producing
## drops while a test cohort runs past the normal play-field density).
## Use `set_max_active_decor_items()` to adjust from test harnesses.
static var MAX_ACTIVE_DECOR_ITEMS: int = 80


static func set_max_active_decor_items(n: int) -> void:
	MAX_ACTIVE_DECOR_ITEMS = max(1, n)

var _rng: RandomNumberGenerator = RandomNumberGenerator.new()
var _materials: Array = []    # Array[StandardMaterial3D] we own — rim-toggled on hover
var _click_area: StaticBody3D
var _completing: bool = false
var _scale_tween: Tween
var _spawn_parent: Node = null
var _last_year_age: int = 0


func _ready() -> void:
	_rng.seed = variant_seed if variant_seed != 0 else hash(name)
	_resolve_defaults_for_kind()
	# Compute initial size_progress + label kind BEFORE building visuals so
	# the silhouette matches the derived label (and the click area fits).
	if _is_tree():
		_recompute_size()
		kind = _label_for_progress(size_progress)
		_last_year_age = age_days
	_build_visual()
	_build_click_area()
	add_to_group("decor")
	# Subscribe to the day-tick so we age + roll branchfall without
	# running any per-frame work.
	if has_node("/root/Scheduler"):
		var sch: Node = get_node("/root/Scheduler")
		if sch.has_signal("day_advanced") and not sch.is_connected("day_advanced", _on_day_advanced):
			sch.connect("day_advanced", _on_day_advanced)


## Hook for the scatter script to set up the item in one call.
func configure(p_kind: String, p_scale: float, p_seed: int) -> void:
	kind = p_kind
	visual_scale = p_scale
	variant_seed = p_seed


## Extended configure for trees — sets species + random age inside band.
## The scatter script calls this AFTER `configure()` to stamp the tree's
## living-forest state before `_ready()` runs.
func configure_tree(
	p_kind: String,
	p_scale: float,
	p_seed: int,
	p_species: String,
	p_age_days: int,
) -> void:
	kind = p_kind
	visual_scale = p_scale
	variant_seed = p_seed
	species_id = p_species
	age_days = p_age_days
	max_age_days = _roll_max_age_for_species(p_species, p_seed)


## Rim + emission highlight matching the plant hover pattern. We toggle
## properties on the cached per-item materials — cheap, no allocations.
func set_highlight(on: bool) -> void:
	for m in _materials:
		var mat: StandardMaterial3D = m as StandardMaterial3D
		if mat == null:
			continue
		mat.rim_enabled = on
		mat.rim = 0.9 if on else 0.0
		mat.rim_tint = 0.75
		mat.emission_enabled = on
		mat.emission = HIGHLIGHT
		mat.emission_energy_multiplier = 0.3 if on else 0.0


## Exposed to main.gd — each action row is a standard Interactable
## dictionary (see `scripts/interactable.gd`). Yields are carried back
## to the nearest storage shed by the fairy; FarmTotals deposits happen
## AFTER the drop-off beat, not when `complete()` runs here.
##
## Yields scale with size_progress so a freshly-sprouted sapling gives
## ~10 % while an old-growth gives ~90 % + a heartwood drop.
func get_context_actions() -> Array:
	var out: Array = []
	match kind:
		"tree_small":
			out.append(Interactable.make_action(
				"chop_small_tree", "Fell sapling", 40.0,
				{}, _scaled_yield({"wood": 2, "twigs": 3, "plant_trim": 4}),
				"", Interactable.DROP_STORAGE, 3
			))
		"tree_mature":
			out.append(Interactable.make_action(
				"chop_mature_tree", "Fell mature tree", 120.0,
				{}, _scaled_yield({"wood": 8, "twigs": 5, "plant_trim": 10}),
				"", Interactable.DROP_STORAGE, 4
			))
			out.append(Interactable.make_action(
				"prune", "Prune", 30.0,
				{}, {"twigs": 2, "plant_trim": 6},
				"", Interactable.DROP_STORAGE, 2
			))
			_append_forage_action(out, false)
		"tree_old":
			var base_old: Dictionary = {"wood": 20, "twigs": 8, "plant_trim": 12}
			# Old-growth bonus — heartwood drop for rare, late-game crafting.
			# Age floor gates it so early-spawned old-labels don't cheat in.
			if size_progress >= 0.85:
				base_old["heartwood"] = 1
			out.append(Interactable.make_action(
				"chop_old_tree", "Fell old-growth tree", 180.0,
				{}, _scaled_yield(base_old),
				"", Interactable.DROP_STORAGE, 6
			))
			out.append(Interactable.make_action(
				"prune", "Prune", 30.0,
				{}, {"twigs": 3, "plant_trim": 8},
				"", Interactable.DROP_STORAGE, 2
			))
			_append_forage_action(out, true)
		"rock":
			out.append(Interactable.make_action(
				"quarry", "Quarry rock", 80.0,
				{}, {"stone": 4},
				"", Interactable.DROP_STORAGE, 3
			))
		"deadwood_log":
			out.append(Interactable.make_action(
				"gather_deadwood", "Gather deadwood", 12.0,
				{}, {"wood": 1, "twigs": 2},
				"", Interactable.DROP_STORAGE, 1
			))
		"twigs_pile":
			out.append(Interactable.make_action(
				"gather_twigs", "Gather twigs", 8.0,
				{}, {"twigs": 2},
				"", Interactable.DROP_STORAGE, 1
			))
	return out


## Scale each yield entry by size_progress. Saplings give ~10 %, old
## growth gives ~90 % — matches the design doc exactly. Heartwood + other
## non-scaling specials stay at 1 (they're rare drops, not volume).
func _scaled_yield(base: Dictionary) -> Dictionary:
	var out: Dictionary = {}
	var p: float = clamp(size_progress, 0.10, 1.0)   # floor so a sapling still yields something
	for k in base.keys():
		var key: String = String(k)
		if key == "heartwood":
			out[key] = int(base[key])
			continue
		# Round at the last step so we don't lose e.g. 0.1 × 4 = 0.4 → 0.
		var scaled: float = float(base[k]) * p
		out[key] = max(1, int(round(scaled)))
	return out


## Display label for the parchment menu header.
func display_name() -> String:
	match kind:
		"tree_small":
			return "Sapling"
		"tree_mature":
			return "Mature Tree"
		"tree_old":
			return "Old-Growth Tree"
		"rock":
			return "Rock Outcrop"
		"deadwood_log":
			return "Deadwood Log"
		"twigs_pile":
			return "Twigs"
		_:
			return "Decor"


## Called by the TaskQueue once the fairy has worked the full labor
## time. We handle the VISUAL transition here (tree falls, rock breaks
## into chunks, log vanishes) — the yields themselves ride back with
## the fairy to storage and are deposited by TaskQueue after arrival.
func complete(action: Dictionary) -> void:
	if _completing:
		return
	var id: String = action.get("id", "")
	# Day-0 forage branch — tree stays alive, just marks a cooldown so
	# the same trunk can't be re-foraged for 14 game-days. Rewrites the
	# yield dict in `action` so the TaskQueue deposit stage actually
	# ships the rolled goods (wild_berries / wild_mushrooms / imo / seeds).
	if id == "forage_understory":
		_complete_forage_understory(action)
		return
	# Prune keeps the tree alive. Yield stays in the action (TaskQueue
	# deposits to storage). Visual beat: cosmetic scale-pop + brief
	# leaf-loss tween. Tree continues aging normally.
	if id == "prune":
		_complete_prune(action)
		return
	_completing = true
	var label: String = action.get("label", id).to_upper()
	Juice.pop(global_position + Vector3(0, 2.4, 0), label, HIGHLIGHT)
	Juice.burst(global_position + Vector3(0, 0.6, 0), _burst_color(), 18)
	Juice.bump(0.16)
	var name_for_log: String = display_name()
	GameLog.info("decor action complete kind=%s id=%s" % [kind, id], "decor")
	if AudioManager.has_method("play"):
		AudioManager.play("biomass-chop")
	var tw: Tween = create_tween()
	tw.tween_property(self, "scale", Vector3.ZERO, 0.6).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_IN)
	tw.tween_callback(queue_free)
	GameLog.event("decor_harvested", {
		"kind": kind,
		"name": name_for_log,
		"id": id,
	})


## Prune completion — tree stays alive. Scale pops down, then a brief
## leaf-loss tween ruffles the canopy opacity, then returns to base. All
## aging continues normally on subsequent day-ticks.
func _complete_prune(action: Dictionary) -> void:
	var label: String = action.get("label", "PRUNE").to_upper()
	if AudioManager.has_method("play"):
		AudioManager.play("biomass-chop", -6.0)
	Juice.pop(global_position + Vector3(0, 2.4, 0), "- " + label, Palette.MEADOW)
	Juice.burst(global_position + Vector3(0, 1.4, 0), Palette.MEADOW.lerp(Palette.OLIVE_DARK, 0.4), 10)
	GameLog.event("decor_pruned", {
		"kind": kind,
		"species": species_id,
		"age_days": age_days,
		"size_progress": size_progress,
	})
	# Scale pop — 0.92× then settle back. Small + quick.
	var base_scale: Vector3 = Vector3.ONE * (visual_scale * size_scale)
	var tw: Tween = create_tween()
	tw.tween_property(self, "scale", base_scale * 0.92, 0.2).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(self, "scale", base_scale, 0.25).set_trans(Tween.TRANS_SINE)
	# Brief leaf-loss — dim canopy materials a hair for ~0.6 s. We dim
	# every material (trunk included; it's a tiny effect) and tween back.
	for m in _materials:
		var mat: StandardMaterial3D = m as StandardMaterial3D
		if mat == null:
			continue
		var base_albedo: Color = mat.albedo_color
		var dim: Color = Palette.clamp_happy(base_albedo.darkened(0.18))
		var mt: Tween = create_tween()
		mt.tween_property(mat, "albedo_color", dim, 0.2)
		mt.tween_property(mat, "albedo_color", base_albedo, 0.5).set_trans(Tween.TRANS_SINE)


# ==================================================================== #
# Continuous-growth engine — sigmoid aging + year-end pulses
# ==================================================================== #

## Day-tick driver. Ages the tree, recomputes sigmoid scale, fires a
## year-end pulse every 120 days, and rolls branchfall.
## Only runs for actual trees — rocks / deadwood / twigs ignore.
func _on_day_advanced(_day: int, _season: String, _year: int) -> void:
	if _completing:
		return
	if not _is_tree():
		return
	age_days += 1

	# Old-age death — collapses into a deadwood_log at the same XZ.
	if max_age_days > 0 and age_days >= max_age_days:
		_die_of_old_age()
		return

	# Recompute size_progress + size_scale from the sigmoid.
	_recompute_size()

	# Label transitions: sapling → mature (celebration) → old-growth (rare).
	var new_label: String = _label_for_progress(size_progress)
	if new_label != kind:
		_rebuild_for_label(new_label)

	# Year-end pulse — visible scale-pop + MEADOW glyph + chime.
	if (age_days % YEAR_DAYS) == 0 and age_days != _last_year_age:
		_last_year_age = age_days
		_year_end_pulse()
	else:
		# Micro-interpolation day-to-day so the tree never sits frozen.
		scale = Vector3.ONE * (visual_scale * size_scale)

	# Branchfall for anything past sapling — chance scales with size.
	if size_progress > LABEL_SAPLING_MAX:
		_roll_branchfall()


## Sigmoid growth per-species. size_progress = 1 - exp(-age / tau) with
## tau = growth_80pct_days / 1.6 so progress ~0.8 at the 80pct mark.
## size_scale lerps between seedling_scale and max_scale.
func _recompute_size() -> void:
	var row: Dictionary = SPECIES_TABLE.get(species_id, SPECIES_TABLE["red_alder"])
	var tc: float = float(row["growth_80pct_days"]) / 1.6
	var progress: float = 1.0 - exp(-float(age_days) / max(1.0, tc))
	size_progress = clamp(progress, 0.0, 1.0)
	var seedling: float = float(row["seedling_scale"])
	var mx: float = float(row["max_scale"])
	size_scale = lerp(seedling, mx, size_progress)


func _label_for_progress(p: float) -> String:
	if p < LABEL_SAPLING_MAX:
		return "tree_small"
	if p < LABEL_MATURE_MAX:
		return "tree_mature"
	return "tree_old"


## Year-end pulse. Tween the visible scale to the newly-computed target
## with a bouncy back-ease, spawn a MEADOW glyph pop + soft chime. The
## player feels a growth beat once per game-year per tree.
func _year_end_pulse() -> void:
	var target: float = visual_scale * size_scale
	# Start from a slightly compressed scale for a visible pop.
	var start: float = visual_scale * size_scale * 0.92
	scale = Vector3.ONE * start
	if _scale_tween != null and _scale_tween.is_valid():
		_scale_tween.kill()
	_scale_tween = create_tween()
	_scale_tween.tween_property(self, "scale", Vector3.ONE * target, YEAR_PULSE_SECONDS) \
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	Juice.pop(global_position + Vector3(0, 2.4 + size_scale * 0.4, 0), "◊", Palette.MEADOW)
	if AudioManager.has_method("play"):
		AudioManager.play("seedling-sprout", -8.0)
	GameLog.event("tree_year_grew", {
		"species": species_id,
		"age_days": age_days,
		"size_progress": size_progress,
		"size_scale": size_scale,
	})


## Label transition — silhouette choice swaps to match the new band.
## Sapling → mature fires a celebration pop. Mature → old fires a rare
## flourish (longer Juice.burst + honey glyph).
func _rebuild_for_label(new_label: String) -> void:
	var prev_label: String = kind
	kind = new_label
	# Rebuild meshes to match the new silhouette. Click area resizes too.
	for child in get_children():
		if child == _click_area:
			continue
		if child is MeshInstance3D:
			child.queue_free()
	_materials.clear()
	_build_visual()
	if _click_area != null:
		_click_area.queue_free()
		_click_area = null
	_build_click_area()
	# Keep the continuous scale pinned — no pop beyond the year-end pulse.
	scale = Vector3.ONE * (visual_scale * size_scale)
	GameLog.event("tree_label_changed", {
		"from": prev_label, "to": new_label,
		"species": species_id,
		"age_days": age_days,
		"size_progress": size_progress,
	})
	# Celebrations: mature-first tree is a meaningful moment; old-growth
	# is rare. Both get a glyph pop, old-growth gets an extra burst.
	if new_label == "tree_mature":
		Juice.pop(global_position + Vector3(0, 2.4, 0), "MATURE", Palette.MEADOW)
	elif new_label == "tree_old":
		Juice.pop(global_position + Vector3(0, 2.4, 0), "OLD GROWTH", Palette.HONEY)
		Juice.burst(global_position + Vector3(0, 1.8, 0), Palette.HONEY.lerp(Palette.MEADOW, 0.3), 24)


func _is_tree() -> bool:
	return kind == "tree_small" or kind == "tree_mature" or kind == "tree_old"


## Die of old age. Fade to desaturated, then replace with a deadwood_log.
func _die_of_old_age() -> void:
	if _completing:
		return
	_completing = true
	# Tint materials toward EARTH desaturation quickly.
	for m in _materials:
		var mat: StandardMaterial3D = m as StandardMaterial3D
		if mat == null:
			continue
		mat.albedo_color = Palette.clamp_happy(
			mat.albedo_color.lerp(Palette.EARTH, 0.4)
		)
	var pop_color: Color = Palette.COMPOST.lerp(Palette.EARTH, 0.3)
	Juice.pop(global_position + Vector3(0, 2.4, 0), "◊ FELL of old age", pop_color)
	GameLog.event("tree_died_old_age", {
		"species": species_id,
		"kind_at_death": kind,
		"age_days": age_days,
		"max_age_days": max_age_days,
	})
	# Visual fall tween for on-screen gameplay. The actual swap into a
	# deadwood_log is deferred (not tween-callback'd) so headless tests
	# without process_frame still witness the transition.
	var tw: Tween = create_tween()
	tw.tween_property(self, "scale", Vector3.ONE * visual_scale * 0.4, 0.6) \
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	call_deferred("_replace_with_deadwood_log")


func _replace_with_deadwood_log() -> void:
	var parent: Node = get_parent()
	var at: Vector3 = global_position
	if parent == null:
		queue_free()
		return
	if _decor_count(parent) >= MAX_ACTIVE_DECOR_ITEMS:
		queue_free()
		return
	var log_node: Node3D = _spawn_decor_sibling("deadwood_log", at, 0.95, 1.1)
	if log_node != null:
		GameLog.info("deadwood replaces old-growth at %s" % at, "decor")
	queue_free()


# ---- Branchfall ------------------------------------------------------

## Per-day branchfall chance. Scales with continuous size so older/larger
## trees drop more debris than saplings. Storms multiply by STORM_MULTIPLIER.
func _roll_branchfall() -> void:
	var row: Dictionary = SPECIES_TABLE.get(species_id, SPECIES_TABLE["red_alder"])
	var mx_scale: float = max(0.01, float(row["max_scale"]))
	var size_frac: float = clamp(size_scale / mx_scale, 0.0, 1.0)
	var base: float = BRANCHFALL_BASE_CHANCE * size_progress * size_frac
	var storm_on: bool = _storm_active()
	var chance: float = base * (STORM_MULTIPLIER if storm_on else 1.0)
	if _rng.randf() >= chance:
		return
	_drop_branch(storm_on)


func _storm_active() -> bool:
	var ws: Node = get_node_or_null("/root/WeatherSystem")
	if ws == null:
		return false
	if not ws.has_method("is_active"):
		return false
	var res: Variant = ws.call("is_active", "storm")
	return res is bool and (res as bool)


## Spawn a drop at a small random offset from this tree. We cap total
## active decor items globally so the scene can't balloon if the player
## never gathers.
func _drop_branch(storm_on: bool) -> void:
	var parent: Node = get_parent()
	if parent == null:
		return
	if _decor_count(parent) >= MAX_ACTIVE_DECOR_ITEMS:
		return
	var roll: float = _rng.randf()
	var drop_kind: String = "twigs_pile"
	var is_windfall: bool = false
	if roll < DROP_WEIGHT_TWIGS:
		drop_kind = "twigs_pile"
	elif roll < DROP_WEIGHT_TWIGS + DROP_WEIGHT_DEADWOOD:
		drop_kind = "deadwood_log"
	else:
		# Windfall only during storms; outside storms fall back to twigs.
		if storm_on:
			drop_kind = "deadwood_log"
			is_windfall = true
		else:
			drop_kind = "twigs_pile"

	var angle: float = _rng.randf() * TAU
	var r: float = _rng.randf_range(BRANCHFALL_OFFSET_MIN, BRANCHFALL_OFFSET_MAX)
	var offset: Vector3 = Vector3(cos(angle) * r, 0.0, sin(angle) * r)
	var pos: Vector3 = global_position + offset
	# Snap Y to terrain if WorldGrid is around (scatter path does this
	# already; branchfall-on-slope should too).
	if has_node("/root/WorldGrid"):
		var wg: Node = get_node("/root/WorldGrid")
		if wg.has_method("sample_height"):
			pos.y = wg.call("sample_height", pos)
	var scale_min: float = 0.8
	var scale_max: float = 1.1
	if is_windfall:
		scale_min = 1.1
		scale_max = 1.35
	var dropped: Node3D = _spawn_decor_sibling(drop_kind, pos, scale_min, scale_max)
	if dropped == null:
		return

	# Windfall yields are beefier — override the default gather_deadwood
	# yield by tagging the item so its context action can notice.
	if is_windfall:
		dropped.set_meta("windfall", true)

	# Paired feedback — soft leaf rustle + tiny EARTH burst + glyph pop.
	var canopy_pos: Vector3 = global_position + Vector3(0, 2.4, 0)
	Juice.burst(canopy_pos, Palette.EARTH, 6)
	Juice.pop(canopy_pos, "◊", Palette.EARTH)
	if AudioManager.has_method("play"):
		AudioManager.call("play", "biomass-chop", -14.0)
	GameLog.event("branchfall", {
		"from_kind": kind,
		"species": species_id,
		"drop": drop_kind,
		"windfall": is_windfall,
		"storm": storm_on,
	})


# ---- Decor-spawn helper ---------------------------------------------

## Count active decor items on the scatter parent — used to cap scene
## growth without crashing. Groups-based count (`decor`) is broader
## than just scatter children, but that's what we want to cap.
func _decor_count(_parent: Node) -> int:
	var tree: SceneTree = get_tree()
	if tree == null:
		return 0
	return tree.get_nodes_in_group("decor").size()


## Spawn a sibling decor_item of the given kind as a child of our
## scatter parent. Returns the spawned node or null on failure.
func _spawn_decor_sibling(p_kind: String, pos: Vector3, sc_min: float, sc_max: float) -> Node3D:
	var parent: Node = get_parent()
	if parent == null:
		return null
	var scene: PackedScene = load("res://scenes/decor_item.tscn")
	if scene == null:
		return null
	var item: Node3D = scene.instantiate()
	if item == null:
		return null
	item.name = "%s_%d" % [p_kind, Time.get_ticks_msec()]
	var scale_f: float = _rng.randf_range(sc_min, sc_max)
	var seed_v: int = (hash(p_kind) ^ int(Time.get_ticks_usec())) & 0xffffff
	# Trees (shouldn't happen from branchfall, but keep the path safe)
	# use configure_tree to also stamp species + age.
	if p_kind == "tree_small" or p_kind == "tree_mature" or p_kind == "tree_old":
		item.call("configure_tree", p_kind, scale_f, seed_v, "red_alder", 0)
	else:
		item.call("configure", p_kind, scale_f, seed_v)
	parent.add_child(item)
	item.global_position = pos
	return item


# ---- Defaults & species --------------------------------------------

## If the scatter path didn't set species / age (e.g. branchfall drops
## or hand-placed decor), roll sensible defaults so the tree still
## ticks happily.
func _resolve_defaults_for_kind() -> void:
	if not _is_tree():
		return
	if species_id == "":
		species_id = _pick_default_species_for_tier(kind, _rng)
	if max_age_days == 0:
		max_age_days = _roll_max_age_for_species(species_id, variant_seed)
	if age_days == 0:
		age_days = _roll_age_band_for_tier(kind, _rng)


## Pull a species_id at random biased by tier.
static func pick_species_for_tier(p_kind: String, rng: RandomNumberGenerator) -> String:
	return _pick_default_species_for_tier(p_kind, rng)


static func _pick_default_species_for_tier(p_kind: String, rng: RandomNumberGenerator) -> String:
	# Pioneer-heavy small bias, conifer-heavy old bias.
	match p_kind:
		"tree_small":
			var pool_s: Array[String] = [
				"red_alder", "red_alder", "red_alder",
				"big_leaf_maple", "big_leaf_maple",
				"pacific_crabapple",
				"douglas_fir",
				"western_red_cedar",
			]
			return pool_s[rng.randi_range(0, pool_s.size() - 1)]
		"tree_mature":
			var pool_m: Array[String] = [
				"red_alder", "red_alder",
				"big_leaf_maple", "big_leaf_maple",
				"pacific_crabapple",
				"douglas_fir", "douglas_fir",
				"western_red_cedar",
			]
			return pool_m[rng.randi_range(0, pool_m.size() - 1)]
		"tree_old":
			var pool_o: Array[String] = [
				"douglas_fir", "douglas_fir", "douglas_fir",
				"western_red_cedar", "western_red_cedar", "western_red_cedar",
				"big_leaf_maple",
				"red_alder",
			]
			return pool_o[rng.randi_range(0, pool_o.size() - 1)]
	return "red_alder"


static func _roll_age_band_for_tier(p_kind: String, rng: RandomNumberGenerator) -> int:
	match p_kind:
		"tree_small":
			return rng.randi_range(AGE_BAND_SMALL[0], AGE_BAND_SMALL[1])
		"tree_mature":
			return rng.randi_range(AGE_BAND_MATURE[0], AGE_BAND_MATURE[1])
		"tree_old":
			return rng.randi_range(AGE_BAND_OLD[0], AGE_BAND_OLD[1])
	return 0


static func _roll_max_age_for_species(species: String, seed_v: int) -> int:
	var row: Dictionary = SPECIES_TABLE.get(species, SPECIES_TABLE["red_alder"])
	var mean: float = float(row["longevity_mean"])
	var sigma: float = float(row["longevity_sigma"])
	var local_rng: RandomNumberGenerator = RandomNumberGenerator.new()
	local_rng.seed = int(seed_v) if seed_v != 0 else int(Time.get_ticks_usec())
	# Clamp a normal-ish draw inside [mean - 2σ, mean + 2σ].
	var draw: float = mean + local_rng.randfn(0.0, 1.0) * sigma
	return int(clamp(draw, mean - 2.0 * sigma, mean + 2.0 * sigma))


## Static helper so other systems (lab preview / sim) can resolve
## species info without instantiating a node. Returns the full row dict.
static func species_row(species: String) -> Dictionary:
	return SPECIES_TABLE.get(species, SPECIES_TABLE["red_alder"])


## Back-compat helper for the previous 4-element tempo array. Returns
## [growth_80pct_days, longevity_mean, longevity_sigma, max_scale].
## Preserved so any sim still importing the old API compiles; new code
## should use `species_row()`.
static func species_tempo(species: String) -> Array:
	var row: Dictionary = species_row(species)
	return [
		int(row["growth_80pct_days"]),
		int(row["longevity_mean"]),
		int(row["longevity_sigma"]),
		float(row["max_scale"]),
	]


# ---------- Visual construction ----------

func _build_visual() -> void:
	# For trees we honour the continuous size_scale alongside visual_scale
	# so the silhouette actually reflects the computed growth. Non-trees
	# use visual_scale only (rocks / logs / twigs).
	if _is_tree():
		scale = Vector3.ONE * (visual_scale * size_scale)
	else:
		scale = Vector3.ONE * visual_scale
	rotate_y(_rng.randf() * TAU)
	# Tree foliage bands come straight from the Palette meadow/sage/olive
	# trio. Young trees lean brighter (MEADOW-to-SAGE), mature toward
	# classic (SAGE-to-OLIVE_DARK), old-growth deepest (OLIVE_DARK with a
	# touch more darkness) — all still inside the happy palette.
	match kind:
		"tree_small":
			_build_tree(0.85,
				Palette.OLIVE_DARK.lerp(Palette.MEADOW, 0.55),
				Palette.MEADOW)
		"tree_mature":
			_build_tree(1.0,
				Palette.OLIVE_DARK.lerp(Palette.MEADOW, 0.35),
				Palette.MEADOW.lerp(Palette.SAGE, 0.4))
		"tree_old":
			_build_tree(1.25,
				Palette.OLIVE_DARK,
				Palette.OLIVE_DARK.lerp(Palette.MEADOW, 0.3))
		"rock":
			_build_rock()
		"deadwood_log":
			_build_deadwood()
		"twigs_pile":
			_build_twigs_pile()
		_:
			_build_rock()


func _build_tree(scale_mult: float, leaf_lo: Color, leaf_hi: Color) -> void:
	# Trunk — simple tapered cylinder.
	var trunk: MeshInstance3D = MeshInstance3D.new()
	var trunk_mesh: CylinderMesh = CylinderMesh.new()
	var radius_scale: float = 1.0
	var height_scale: float = 1.0
	match kind:
		"tree_small":
			radius_scale = 0.8
			height_scale = 0.8
		"tree_mature":
			radius_scale = 1.2
			height_scale = 1.3
		"tree_old":
			radius_scale = 1.7
			height_scale = 1.7
	trunk_mesh.top_radius = 0.18 * radius_scale
	trunk_mesh.bottom_radius = 0.28 * radius_scale
	trunk_mesh.height = 2.4 * height_scale
	trunk.mesh = trunk_mesh
	var trunk_mat: StandardMaterial3D = StandardMaterial3D.new()
	# Trunks vary between COMPOST-deep and EARTH-warm — no dead-brown.
	trunk_mat.albedo_color = Palette.clamp_happy(
		Palette.COMPOST.lerp(Palette.EARTH, _rng.randf_range(0.35, 0.9))
	)
	trunk_mat.roughness = 0.95
	trunk.material_override = trunk_mat
	trunk.position.y = trunk_mesh.height * 0.5
	trunk.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(trunk)
	_materials.append(trunk_mat)

	# Canopy — 2..3 offset blobs so the silhouette reads fluffier.
	var canopy_mat: StandardMaterial3D = StandardMaterial3D.new()
	canopy_mat.albedo_color = leaf_lo.lerp(leaf_hi, _rng.randf())
	canopy_mat.roughness = 0.9
	_materials.append(canopy_mat)
	var blob_count: int = 2 + (1 if _rng.randf() > 0.45 else 0)
	if kind == "tree_old":
		blob_count = 4
	var canopy_base_y: float = trunk_mesh.height * 0.9 * scale_mult
	for b in range(blob_count):
		var mi: MeshInstance3D = MeshInstance3D.new()
		var sm: SphereMesh = SphereMesh.new()
		sm.radius = _rng.randf_range(0.9, 1.3) * radius_scale * 1.1
		sm.height = sm.radius * 1.8
		mi.mesh = sm
		mi.material_override = canopy_mat
		var off := Vector3(
			_rng.randf_range(-0.5, 0.5) * radius_scale,
			canopy_base_y + _rng.randf_range(-0.1, 0.4) * scale_mult,
			_rng.randf_range(-0.5, 0.5) * radius_scale,
		)
		mi.position = off
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		add_child(mi)


func _build_rock() -> void:
	var mi: MeshInstance3D = MeshInstance3D.new()
	var box: BoxMesh = BoxMesh.new()
	box.size = Vector3(
		_rng.randf_range(0.7, 1.6),
		_rng.randf_range(0.45, 1.0),
		_rng.randf_range(0.7, 1.6),
	)
	mi.mesh = box
	mi.position.y = box.size.y * 0.5
	mi.rotation = Vector3(
		_rng.randf_range(-0.2, 0.2),
		_rng.randf() * TAU,
		_rng.randf_range(-0.15, 0.15),
	)
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	# Rocks are WARM_STONE, never cold grey. Slight variation between
	# WARM_STONE and a dustier version (blended toward PARCHMENT).
	var stone_hi: Color = Palette.WARM_STONE.lerp(Palette.PARCHMENT, 0.15)
	mat.albedo_color = Palette.clamp_happy(
		Palette.WARM_STONE.lerp(stone_hi, _rng.randf())
	)
	mat.roughness = 1.0
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(mi)
	_materials.append(mat)


func _build_deadwood() -> void:
	var mi: MeshInstance3D = MeshInstance3D.new()
	var cm: CylinderMesh = CylinderMesh.new()
	cm.top_radius = 0.12
	cm.bottom_radius = 0.18
	cm.height = 2.0
	mi.mesh = cm
	# Laid-down log: rotate around X so it lies along Z-ish.
	mi.rotation = Vector3(PI / 2.0 + _rng.randf_range(-0.2, 0.2), 0.0, _rng.randf_range(-0.3, 0.3))
	mi.position.y = 0.22
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	# Deadwood is EARTH-tinted with a hint of WARM_STONE weathering.
	mat.albedo_color = Palette.clamp_happy(
		Palette.EARTH.lerp(Palette.WARM_STONE, _rng.randf_range(0.15, 0.45))
	)
	mat.roughness = 1.0
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	add_child(mi)
	_materials.append(mat)


## Small bundle of 4–6 cylindrical twigs laid across each other. EARTH-
## tinted, ~0.4 m footprint. Shares the hover rim-light setup of the
## other decor so it reads as pickable.
func _build_twigs_pile() -> void:
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.albedo_color = Palette.clamp_happy(
		Palette.EARTH.lerp(Palette.COMPOST, 0.2)
	)
	mat.roughness = 1.0
	_materials.append(mat)
	var count: int = _rng.randi_range(4, 6)
	for i in range(count):
		var mi: MeshInstance3D = MeshInstance3D.new()
		var cm: CylinderMesh = CylinderMesh.new()
		cm.top_radius = _rng.randf_range(0.025, 0.045)
		cm.bottom_radius = cm.top_radius
		cm.height = _rng.randf_range(0.35, 0.55)
		mi.mesh = cm
		# Lay across each other at mixed angles — keeps footprint ~0.4 m.
		mi.rotation = Vector3(
			PI / 2.0 + _rng.randf_range(-0.15, 0.15),
			_rng.randf() * TAU,
			_rng.randf_range(-0.25, 0.25),
		)
		mi.position = Vector3(
			_rng.randf_range(-0.12, 0.12),
			0.05 + float(i) * 0.035,
			_rng.randf_range(-0.12, 0.12),
		)
		mi.material_override = mat
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		add_child(mi)


## StaticBody3D + CollisionShape3D so the main scene's ray-cast picker
## finds this object. The shape is sized to fit the visual family.
func _build_click_area() -> void:
	_click_area = StaticBody3D.new()
	_click_area.name = "ClickArea"
	_click_area.input_ray_pickable = true
	var cs: CollisionShape3D = CollisionShape3D.new()
	var box: BoxShape3D = BoxShape3D.new()
	match kind:
		"tree_small":
			box.size = Vector3(1.6, 3.4, 1.6)
			cs.position.y = 1.7
		"tree_mature":
			box.size = Vector3(2.4, 4.6, 2.4)
			cs.position.y = 2.3
		"tree_old":
			box.size = Vector3(3.6, 6.0, 3.6)
			cs.position.y = 3.0
		"rock":
			box.size = Vector3(1.6, 1.2, 1.6)
			cs.position.y = 0.6
		"deadwood_log":
			box.size = Vector3(2.2, 0.8, 0.8)
			cs.position.y = 0.4
		"twigs_pile":
			box.size = Vector3(0.6, 0.4, 0.6)
			cs.position.y = 0.2
	cs.shape = box
	_click_area.add_child(cs)
	add_child(_click_area)
	_click_area.input_event.connect(_on_click_input)
	_click_area.mouse_entered.connect(_on_mouse_enter)
	_click_area.mouse_exited.connect(_on_mouse_exit)


func _on_mouse_enter() -> void:
	set_highlight(true)
	emit_signal("hover_changed", self, true)


func _on_mouse_exit() -> void:
	set_highlight(false)
	emit_signal("hover_changed", self, false)


## LMB is intentionally inert — decor actions are delegated through the
## right-click menu like every other interactable. We still emit the
## `clicked` signal so any future hover-select / inspector panel can
## hook in without re-wiring signals on the click area.
func _on_click_input(_cam: Node, event: InputEvent, _pos: Vector3, _norm: Vector3, _shape: int) -> void:
	var mb: InputEventMouseButton = event as InputEventMouseButton
	if mb == null or not mb.pressed:
		return
	if mb.button_index == MOUSE_BUTTON_LEFT:
		emit_signal("clicked", self)


func _burst_color() -> Color:
	match kind:
		"rock":
			return Palette.WARM_STONE
		"deadwood_log":
			return Palette.EARTH
		"twigs_pile":
			return Palette.EARTH
		_:
			return Palette.MEADOW


# =====================================================================
# APPEND-ONLY: Day-0 Activities Engineer — forest-edge foraging.
# --------------------------------------------------------------------
# Mature + old-growth trees surface a "Forage understory" action. The
# fairy rummages around the base for ~15 s and returns with a weighted
# random roll:
#   40 %  wild_berries      (spring / summer / autumn)
#   30 %  wild_mushrooms    (autumn / winter weighted)
#   20 %  imo               (duff inoculant — old-growth bumps odds)
#   10 %  seeds             (any season)
# 14-day cooldown per tree to prevent spam.
#
# The yield dict is computed at `complete()` time by rolling + patching
# the `action["yield"]` dict — the TaskQueue deposits to storage after
# that. The roll respects the current season (mushrooms rare in summer,
# berries scarce in winter).
# =====================================================================

const FORAGE_COOLDOWN_DAYS: int = 14
var _last_foraged_day: int = -9999  # sentinel so first forage is always allowed


## Current Scheduler day — safe to call from anywhere, even in headless
## sims where the autoload may not be fully up.
func _current_game_day() -> int:
	var sched: Node = get_node_or_null("/root/Scheduler")
	if sched == null:
		return 0
	return int(sched.get("day"))


## Returns true iff this tree is eligible for a forage sweep right now
## (i.e. past its cooldown window).
func _forage_off_cooldown() -> bool:
	return _current_game_day() - _last_foraged_day >= FORAGE_COOLDOWN_DAYS


## Append the forage action row. Always surfaced so the player sees the
## pathway exists; disabled flag fires when the tree is still on cooldown.
## `is_old` toggles the yield-odds bias (old-growth has higher IMO odds).
func _append_forage_action(out: Array, is_old: bool) -> void:
	var act: Dictionary = Interactable.make_action(
		"forage_understory", "Forage understory", 15.0,
		{},
		# Preview yield is just an informational placeholder — the real
		# roll happens in _complete_forage_understory(). We show "+ 1 find"
		# here so the action row has a non-empty yield + basket color.
		{"wild_berries": 1.0},
		"", Interactable.DROP_STORAGE, 1
	)
	if not _forage_off_cooldown():
		act["disabled"] = true
		var days_left: int = FORAGE_COOLDOWN_DAYS - (_current_game_day() - _last_foraged_day)
		act["tooltip"] = "Recovering — re-forage in %d days." % max(1, days_left)
	else:
		act["tooltip"] = ("Sweep the understory for berries, mushrooms, IMO, or seeds."
			if not is_old else
			"Old-growth duff is rich — higher IMO odds.")
	act["forage_is_old"] = is_old  # read by _roll_forage_yield
	out.append(act)


## Roll the forage yield based on season + tree age. Returns a Dictionary
## matching FarmTotals resource keys → amounts.
func _roll_forage_yield(is_old: bool) -> Dictionary:
	var rng: RandomNumberGenerator = RandomNumberGenerator.new()
	rng.seed = (hash(name) ^ Time.get_ticks_usec()) & 0x7fffffff
	var season: String = "summer"
	var sched: Node = get_node_or_null("/root/Scheduler")
	if sched != null and sched.has_method("current_season"):
		season = String(sched.call("current_season"))
	# Base weights: 40/30/20/10. Season + age shift these before the roll.
	var w_berries: float = 0.40
	var w_mushrooms: float = 0.30
	var w_imo: float = 0.20
	var w_seeds: float = 0.10
	# Season adjustments.
	if season == "winter":
		# Winter: no berries, more mushrooms.
		w_berries = 0.05
		w_mushrooms = 0.50
	elif season == "autumn":
		# Autumn: mushrooms peak, berries still common.
		w_mushrooms = 0.40
		w_berries = 0.35
	elif season == "summer":
		# Summer: mushrooms scarce, berries + seeds plentiful.
		w_mushrooms = 0.10
		w_berries = 0.50
	elif season == "spring":
		# Spring: balance slightly toward seeds + IMO (flush of growth).
		w_seeds = 0.20
		w_imo = 0.25
		w_berries = 0.35
		w_mushrooms = 0.20
	# Old-growth bonus: extra IMO odds (richer duff).
	if is_old:
		w_imo *= 1.5
	# Normalize + roll.
	var total: float = w_berries + w_mushrooms + w_imo + w_seeds
	var roll: float = rng.randf() * total
	var yield_dict: Dictionary = {}
	if roll < w_berries:
		yield_dict["wild_berries"] = 1.0
	elif roll < w_berries + w_mushrooms:
		yield_dict["wild_mushrooms"] = 1.0
	elif roll < w_berries + w_mushrooms + w_imo:
		yield_dict["imo"] = 1.0
	else:
		yield_dict["seeds"] = 1.0
	return yield_dict


## Complete a forage sweep. Patches the action's yield in-place so the
## TaskQueue deposit stage ships the rolled goods to storage. Marks the
## cooldown timestamp + fires paired audio/juice feedback. Tree lives on.
func _complete_forage_understory(action: Dictionary) -> void:
	var is_old: bool = bool(action.get("forage_is_old", false))
	var rolled: Dictionary = _roll_forage_yield(is_old)
	# Rewrite the action's yield so TaskQueue's deposit uses the real roll.
	action["yield"] = rolled
	_last_foraged_day = _current_game_day()
	# Paired feedback — forage-chime + MEADOW-ish pop listing the find.
	if AudioManager.has_method("play"):
		AudioManager.play("forage-chime", -2.0)
	var kind_key: String = (rolled.keys()[0] as String) if rolled.size() > 0 else "seeds"
	var tint: Color = Palette.MEADOW
	match kind_key:
		"wild_berries":
			tint = Palette.BERRY.lerp(Palette.CORAL, 0.35)
		"wild_mushrooms":
			tint = Palette.PARCHMENT.lerp(Palette.WARM_STONE, 0.45)
		"imo":
			tint = Palette.COMPOST.lerp(Palette.MEADOW, 0.30)
		"seeds":
			tint = Palette.MEADOW.lerp(Palette.HONEY, 0.30)
	Juice.pop(global_position + Vector3(0, 2.4, 0),
		"+ %s" % kind_key.to_upper().replace("_", " "), tint)
	Juice.burst(global_position + Vector3(0, 0.8, 0), tint, 12)
	GameLog.event("decor_foraged", {
		"kind": kind,
		"species": species_id,
		"roll": kind_key,
		"is_old": is_old,
	})
