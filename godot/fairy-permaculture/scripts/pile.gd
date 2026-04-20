## Fairy Permaculture — compost pile state machine.
##
## Port of `compost/pile.js` + `compost/state-machine.js` + `compost/ingredients.js`.
## Pure data + methods — no rendering; the visual mesh is a separate
## scene (`scenes/compost_pile.tscn`) that reads `state` and updates
## its steam/sparkle.
##
## States (matches the JS enum):
##   empty → filling → triggered → hot → turn-window → cooling → curing → finished
##   (failure lanes: anaerobic, stalled, ammonia-loss — each with a
##   salvage path back into filling)
class_name Pile
extends RefCounted

signal state_changed(new_state: String, old_state: String)
signal ingredient_added(id: String, mass_kg: float)
signal harvested(quality: int, kg: float, flags: Array)

# Primary states
const S_EMPTY = "empty"
const S_FILLING = "filling"
const S_TRIGGERED = "triggered"
const S_HOT = "hot"
const S_TURN_WINDOW = "turn-window"
const S_COOLING = "cooling"
const S_CURING = "curing"
const S_FINISHED = "finished"
# Failure states
const S_ANAEROBIC = "anaerobic"
const S_STALLED = "stalled"
const S_AMMONIA = "ammonia-loss"

# Thresholds (mirror data/compost.json — read live from DataStore).
const HOT_VOLUME_M3 := 1.0
const CN_BAND := [18.0, 45.0]        # widened slightly — real piles heat across a broader range
const MOISTURE_BAND := [45.0, 72.0]  # fresh-green piles sit near 70 % before they dry; be generous
const HOT_RAMP_DAYS := 3
const COOLING_DAYS := 4
const CURING_DAYS := 10
const TURN_WINDOW_MIN := 5
const TURN_WINDOW_MAX := 7
const DRY_STALL_MOISTURE := 30.0
const DRY_STALL_DAYS := 3
const WET_ANAEROBIC_DAYS := 3
const AMMONIA_CN_THRESHOLD := 12.0  # only true ammonia territory — was 15 (overlapped happy-band)
const FULLY_COOKED_TURNS := 3
const TURN_MOISTURE_BUMP := 6.0
const HOT_MOISTURE_DROP_PER_DAY := 1.2
const HOT_VOLUME_DECAY_PER_DAY := 0.015
const COOLING_VOLUME_DECAY_PER_DAY := 0.005
const RAIN_MOISTURE_BUMP := 4.0
const VOLUME_KG_PER_M3 := 250.0

# Ingredient table — mirror of compost/ingredients.js.
# { id → { cn, moisture, default_kg, bulker? } }.
# `bulker = true` marks structural/airflow ingredients that keep the pile
# from matting down. Wood chips are the canonical bulker — their C:N of
# ~400 is far outside the 20-40 cooking band on their own, but mixed
# with greens they prevent anaerobic slumping + speed fungal succession.
static var INGREDIENTS := {
	# NOTE: the player-facing "Add Plant Trim" action maps to "fresh-grass"
	# because the real-world C:N (~20) + high moisture (~75%) of fresh
	# clippings is the same pile-behaviour. The taxonomy refactor tagged
	# plant_trim at C:N 20 in interactable.gd::RESOURCE_CN_RATIO; the
	# ~15 we store here is the moisture-weighted average a real pile sees.
	"fresh-grass":           { "cn": 20.0, "moisture": 70.0, "default_kg": 20.0 },
	"comfrey-chop":          { "cn": 11.0, "moisture": 80.0, "default_kg": 20.0 },
	"kitchen-scraps":        { "cn": 18.0, "moisture": 80.0, "default_kg": 10.0 },
	"fresh-manure":          { "cn": 18.0, "moisture": 78.0, "default_kg": 25.0 },
	"coffee-grounds":        { "cn": 20.0, "moisture": 60.0, "default_kg": 5.0 },
	"fish-trim":             { "cn": 4.0,  "moisture": 70.0, "default_kg": 2.0 },
	# Fruit scraps — rotten/windfall fruit. Green input, C:N ~35; high
	# moisture, sugary, attracts microbial bloom. Good "starter" for a
	# sluggish pile; needs browns to balance or you get a stink.
	"fruit-scraps":          { "cn": 35.0, "moisture": 80.0, "default_kg": 5.0 },
	"dry-leaves":            { "cn": 60.0, "moisture": 15.0, "default_kg": 15.0, "bulker": true },
	"straw":                 { "cn": 80.0, "moisture": 12.0, "default_kg": 20.0, "bulker": true },
	# Twigs — small-branch prunings. Structural bulker, moderately high
	# C:N. NOT an ideal compost feedstock on their own (too woody to
	# break down fast) but excellent mixed into a wet pile.
	"twigs":                 { "cn": 200.0, "moisture": 18.0, "default_kg": 10.0, "bulker": true },
	# Wood chunks — large-branch / log pieces. Very high C:N; player
	# hint via the compost_pile action label notes "wasteful — chip
	# it first". Marked bulker because they obviously keep airflow.
	"wood-chunks":           { "cn": 350.0, "moisture": 20.0, "default_kg": 15.0, "bulker": true },
	"wood-chips":            { "cn": 400.0, "moisture": 30.0, "default_kg": 20.0, "bulker": true },
	"cardboard":             { "cn": 350.0, "moisture": 10.0, "default_kg": 5.0 },
	"dead-corn-stalks":      { "cn": 60.0, "moisture": 18.0, "default_kg": 10.0, "bulker": true },
	"forest-duff-imo":       { "cn": 25.0, "moisture": 50.0, "default_kg": 1.0 },
	"finished-compost-seed": { "cn": 14.0, "moisture": 55.0, "default_kg": 1.0 },
	"worm-castings":         { "cn": 12.0, "moisture": 55.0, "default_kg": 1.0 },
}


## True when the ingredient acts as a structural bulker (keeps airflow,
## prevents anaerobic mats). Future C:N-balancing UI can use this to
## recommend "add a bulker" alongside the raw C:N readout.
static func is_bulker(id: String) -> bool:
	var meta: Variant = INGREDIENTS.get(id, null)
	if meta == null:
		return false
	return bool((meta as Dictionary).get("bulker", false))


## Category tag for a pile ingredient id — "green" for N-rich wet inputs,
## "brown" for C-rich dry inputs, "neutral" for inoculants. The taxonomy
## mirror lives in scripts/interactable.gd::RESOURCE_CATEGORY; this helper
## is for code that only has the pile-ingredient id (compost_pile juice
## pops, future AI heuristics).
static func category_for_ingredient(id: String) -> String:
	match id:
		"fresh-grass", "comfrey-chop", "kitchen-scraps", \
		"fresh-manure", "coffee-grounds", "fish-trim", "fruit-scraps":
			return "green"
		"dry-leaves", "straw", "twigs", "wood-chunks", \
		"wood-chips", "cardboard", "dead-corn-stalks":
			return "brown"
		"forest-duff-imo", "finished-compost-seed", "worm-castings":
			return "neutral"
		_:
			return "neutral"

## Pile variant id — drives the cook time multiplier + display label:
##   "cold-pile"  — legacy, 1.0× cook time (the tutorial pile)
##   "hot-pile"   — 0.5× cook time IF turned; penalty if skipped
##   "worm-bin"   — continuous throughput (bypasses state machine)
##   "bokashi-bucket" — anaerobic 14d seal + 28d bury (custom path)
##   "compost-tea-brewer" — 24-36h brew (custom path)
##   "johnson-su" — 12-month static fungal cook (scaled multiplier)
##
## Default "cold-pile" preserves pre-variant behavior (compost_pile.gd
## and hot_pile.gd are the two state-machine-driven mounds; worm-bin,
## bokashi, tea-brewer, and johnson-su use their own day-driven
## productivity schedules and don't share the Pile state machine).
var variant: String = "cold-pile"
## Cook time multiplier. Applied to the HOT_RAMP_DAYS / TURN_WINDOW_MIN /
## COOLING_DAYS / CURING_DAYS thresholds via `cook_ramp_days()` etc. so
## a variant with 0.5× cuts every wait time in half. Matches DESIGN.md
## §Compost Mini-System Pile Variants table.
var cook_multiplier: float = 1.0
var state: String = S_EMPTY
var ingredients: Array = []  # [{id, dryMassKg}, …]
var volume_m3: float = 0.0
var current_cn: float = 0.0
var moisture_pct: float = 0.0
var temp_c: float = 15.0
var turns_total: int = 0
var days_in_state: int = 0
var days_until_turn_window: int = TURN_WINDOW_MIN
var days_dry: int = 0
var rain_days_streak: int = 0
var covered: bool = false

# Quality tracker (matches compost/quality.js).
var q_hot_days: int = 0
var q_cn_in_band_days: int = 0
var q_moisture_in_band_days: int = 0
var q_inoculants: Array = []
var q_curing_completed: bool = false
var q_anaerobic_flag: bool = false
var q_ammonia_flag: bool = false


func add_ingredient(id: String, mass_kg: float = -1.0) -> void:
	if not INGREDIENTS.has(id):
		push_warning("Pile.add_ingredient: unknown id %s" % id)
		return
	var kg = INGREDIENTS[id]["default_kg"] if mass_kg < 0.0 else mass_kg
	ingredients.append({ "id": id, "dry_mass_kg": kg })
	_recompute_mix()
	if _is_inoculant(id) and not q_inoculants.has(id):
		q_inoculants.append(id)
	emit_signal("ingredient_added", id, kg)


func _is_inoculant(id: String) -> bool:
	return id in ["forest-duff-imo", "finished-compost-seed", "worm-castings"]


func _recompute_mix() -> void:
	# Correct compound C:N is NOT a mass-weighted average of ratios; it's
	# total_carbon / total_nitrogen. If we treat dry mass as a proxy for
	# carbon (constant C-fraction cancels out), then:
	#   N_i  = kg_i / ratio_i
	#   C:N  = sum(kg_i) / sum(kg_i / ratio_i)
	# Equivalent to harmonic mean weighted by mass. The old formula
	# (Σ kg·ratio / Σ kg) dramatically over-reports C:N whenever any
	# high-ratio bulker is present — e.g. 2000 kg plant_trim (cn=15) +
	# 300 kg twigs (cn=200) gave 39:1 when real compound is ~17:1. That
	# made piles impossible to heat: game said "add greens" while the
	# pile was already nitrogen-rich → ammonia territory.
	var tm := 0.0
	var n_total := 0.0
	var m_w := 0.0
	for ing in ingredients:
		var meta = INGREDIENTS.get(ing["id"], null)
		if meta == null: continue
		var kg = ing["dry_mass_kg"]
		var cn = float(meta["cn"])
		tm += kg
		if cn > 0.01:
			n_total += kg / cn
		m_w += kg * meta["moisture"]
	if tm > 0.0:
		current_cn = tm / max(0.0001, n_total)
		moisture_pct = m_w / tm
	volume_m3 = tm / VOLUME_KG_PER_M3


func cover(on: bool) -> void:
	covered = on


func water(bump: float = 12.0) -> void:
	moisture_pct = clamp(moisture_pct + bump, 0.0, 100.0)


## Scaled wait times — applied to the state-machine transitions so a
## variant with cook_multiplier = 0.5 cuts every cook window in half.
## Always at least 1 day so the state machine doesn't snap-through.
func cook_ramp_days() -> int:
	return max(1, int(round(HOT_RAMP_DAYS * cook_multiplier)))


func cook_turn_window_min() -> int:
	return max(1, int(round(TURN_WINDOW_MIN * cook_multiplier)))


func cook_turn_window_max() -> int:
	return max(1, int(round(TURN_WINDOW_MAX * cook_multiplier)))


func cook_cooling_days() -> int:
	return max(1, int(round(COOLING_DAYS * cook_multiplier)))


func cook_curing_days() -> int:
	return max(1, int(round(CURING_DAYS * cook_multiplier)))


func turn() -> bool:
	if state != S_TURN_WINDOW:
		return false
	turns_total += 1
	moisture_pct = clamp(moisture_pct + TURN_MOISTURE_BUMP, 0.0, 100.0)
	if turns_total >= FULLY_COOKED_TURNS:
		_set_state(S_COOLING)
	else:
		_set_state(S_HOT)
	return true


## Run one in-game day. `env` contains { rained, tempC, rain_days_streak }.
func tick(env: Dictionary) -> void:
	if state == S_FINISHED:
		return
	_apply_weather(env)
	_apply_physics()
	_track_quality_metrics()
	var next := _next_state(env)
	if next != state:
		_set_state(next)
	else:
		days_in_state += 1
		if state == S_HOT and days_until_turn_window > 0:
			days_until_turn_window -= 1


func _apply_weather(env: Dictionary) -> void:
	var rained: bool = env.get("rained", false)
	rain_days_streak = int(env.get("rain_days_streak", 0))
	if rained:
		var bump: float = RAIN_MOISTURE_BUMP * (0.25 if covered else 1.0)
		moisture_pct = clamp(moisture_pct + bump, 0.0, 100.0)


func _apply_physics() -> void:
	if state == S_HOT or state == S_TURN_WINDOW:
		moisture_pct = max(0.0, moisture_pct - HOT_MOISTURE_DROP_PER_DAY)
		volume_m3 *= (1.0 - HOT_VOLUME_DECAY_PER_DAY)
	elif state == S_COOLING:
		volume_m3 *= (1.0 - COOLING_VOLUME_DECAY_PER_DAY)
	if moisture_pct < DRY_STALL_MOISTURE:
		days_dry += 1
	else:
		days_dry = 0
	# Simple temp lerp toward state target.
	var target := _target_temp()
	temp_c += (target - temp_c) * 0.35


func _target_temp() -> float:
	match state:
		S_HOT, S_TURN_WINDOW: return 58.0
		S_TRIGGERED: return 38.0
		S_COOLING: return 30.0
		S_CURING: return 22.0
		S_FINISHED: return 18.0
		_: return 18.0


func _track_quality_metrics() -> void:
	if state == S_HOT or state == S_TURN_WINDOW:
		q_hot_days += 1
		if current_cn >= CN_BAND[0] and current_cn <= CN_BAND[1]: q_cn_in_band_days += 1
		if moisture_pct >= MOISTURE_BAND[0] and moisture_pct <= MOISTURE_BAND[1]: q_moisture_in_band_days += 1
	if state == S_ANAEROBIC: q_anaerobic_flag = true
	if state == S_AMMONIA: q_ammonia_flag = true


func _hot_ready() -> bool:
	return volume_m3 >= HOT_VOLUME_M3 \
		and current_cn >= CN_BAND[0] and current_cn <= CN_BAND[1] \
		and moisture_pct >= MOISTURE_BAND[0] and moisture_pct <= MOISTURE_BAND[1]


func _next_state(_env: Dictionary) -> String:
	match state:
		S_EMPTY:
			return S_FILLING if ingredients.size() > 0 else state
		S_FILLING:
			if current_cn > 0.0 and current_cn < AMMONIA_CN_THRESHOLD and volume_m3 > 0.0:
				return S_AMMONIA
			return S_TRIGGERED if _hot_ready() else state
		S_TRIGGERED:
			return S_HOT if days_in_state >= cook_ramp_days() else state
		S_HOT:
			if not covered and rain_days_streak >= WET_ANAEROBIC_DAYS:
				return S_ANAEROBIC
			if days_dry >= DRY_STALL_DAYS: return S_STALLED
			if current_cn < AMMONIA_CN_THRESHOLD: return S_AMMONIA
			if days_until_turn_window <= 0: return S_TURN_WINDOW
			return state
		S_TURN_WINDOW:
			if not covered and rain_days_streak >= WET_ANAEROBIC_DAYS: return S_ANAEROBIC
			if days_dry >= DRY_STALL_DAYS: return S_STALLED
			if days_in_state >= cook_turn_window_max(): return S_COOLING
			return state
		S_COOLING:
			return S_CURING if days_in_state >= cook_cooling_days() else state
		S_CURING:
			if days_in_state >= cook_curing_days():
				q_curing_completed = true
				return S_FINISHED
			return state
		S_ANAEROBIC:
			return S_FILLING if covered and moisture_pct <= MOISTURE_BAND[1] else state
		S_STALLED:
			return S_FILLING if moisture_pct >= MOISTURE_BAND[0] else state
		S_AMMONIA:
			return S_FILLING if current_cn >= CN_BAND[0] else state
		_:
			return state


func _set_state(new_state: String) -> void:
	if new_state == state:
		return
	var old := state
	state = new_state
	days_in_state = 0
	if new_state == S_HOT:
		days_until_turn_window = cook_turn_window_min()
	emit_signal("state_changed", new_state, old)


## Harvest finished compost. Returns { quality (1-5), kg, flags, bias }.
func harvest() -> Dictionary:
	if state != S_FINISHED:
		return { "quality": 0, "kg": 0.0, "flags": [] }
	var result := compute_quality()
	var kg: float = volume_m3 * VOLUME_KG_PER_M3 * 0.6  # 40% decay into finished compost
	var flags: Array = result.get("flags", [])
	_reset()
	emit_signal("harvested", result["stars"], kg, flags)
	return { "quality": result["stars"], "kg": kg, "flags": flags, "bias": result["bias"] }


func compute_quality() -> Dictionary:
	var hot = max(1, q_hot_days)
	var cn_ratio = float(q_cn_in_band_days) / float(hot)
	var m_ratio = float(q_moisture_in_band_days) / float(hot)
	var stars := 1
	if cn_ratio >= 0.7: stars += 1
	if m_ratio >= 0.7: stars += 1
	if turns_total >= 3 and turns_total <= 6: stars += 1
	if q_curing_completed: stars += 1
	if q_inoculants.size() >= 3: stars += 1
	stars = min(5, stars)
	var flags: Array = []
	if q_anaerobic_flag:
		stars = min(stars, 1); flags.append("anaerobic-capped")
	if q_ammonia_flag:
		stars = min(stars, 3); flags.append("ammonia-capped")
	stars = max(1, stars)
	var bias := "balanced"
	if turns_total <= 1: bias = "fungal"
	elif turns_total >= 7: bias = "bacterial"
	return { "stars": stars, "bias": bias, "flags": flags }


func _reset() -> void:
	state = S_EMPTY
	ingredients = []
	volume_m3 = 0.0
	current_cn = 0.0
	moisture_pct = 0.0
	turns_total = 0
	days_in_state = 0
	days_until_turn_window = TURN_WINDOW_MIN
	days_dry = 0
	q_hot_days = 0
	q_cn_in_band_days = 0
	q_moisture_in_band_days = 0
	q_inoculants = []
	q_curing_completed = false
	q_anaerobic_flag = false
	q_ammonia_flag = false


## Project what the mix would look like if you added this ingredient.
static func project_add(pile: Pile, id: String, mass_kg: float) -> Dictionary:
	var meta = INGREDIENTS.get(id, null)
	if meta == null:
		return { "cn": pile.current_cn, "moisture": pile.moisture_pct }
	var tm := pile.volume_m3 * VOLUME_KG_PER_M3
	var cn_w: float = tm * pile.current_cn
	var m_w: float = tm * pile.moisture_pct
	tm += mass_kg
	cn_w += mass_kg * meta["cn"]
	m_w += mass_kg * meta["moisture"]
	if tm <= 0.0:
		return { "cn": pile.current_cn, "moisture": pile.moisture_pct }
	return { "cn": cn_w / tm, "moisture": m_w / tm }
