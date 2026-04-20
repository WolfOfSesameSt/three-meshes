## Fairy Permaculture — weather event system.
##
## Drives discrete multi-day weather events (drought, storm, early_frost,
## heat_spike, wet_week) on top of the baseline seasonal weather owned by
## `WorldGrid`. Hooks `Scheduler.day_advanced` so events roll on the
## day-tick, never per-frame.
##
## Design spec: docs/design/weather-events.md.
##
## Public API:
##   WeatherSystem.current_event: String        — "" when idle
##   WeatherSystem.severity: float              — 0..1
##   WeatherSystem.is_active("drought") -> bool
##   WeatherSystem.days_since_rain() -> int
##   WeatherSystem.force_event(id, days, sev)   — debug / simulation
##
## Public signals:
##   event_starting(id, severity)
##   event_active(id, day_remaining)
##   event_ending(id)
##   warning_fired(id, eta_days)
##   anaerobic_risk(on)                         — wet-week listener hook
##
## Interaction with other autoloads:
##   - Subscribes to Scheduler.day_advanced (READ).
##   - Calls Juice.rain_on() + Juice.wind_set() for storm visible coupling
##     (no new FX systems — existing helpers only).
##   - Queries the running TaskQueue (if present) to enqueue a priority-5
##     inspect-pile-cover prep task on a wet-week warning. Never mutates
##     TaskQueue internals — uses the public `queue_task()` API only.
##
## Constraints: typed GDScript, no emojis, colors via Palette.* only,
## headless-clean boot.
extends Node

signal event_starting(event_id: String, severity: float)
signal event_active(event_id: String, day_remaining: int)
signal event_ending(event_id: String)
signal warning_fired(event_id: String, eta_days: int)
signal anaerobic_risk(on: bool)

# -------------------------------------------------------------------
# Probability tables (from docs/design/weather-events.md §Implementation).
# Conservative per-day probabilities; the spec's narrative-level
# "0.35 per summer" figures are season-total drought odds, we convert
# to ~0.08/day here per the task brief's explicit table.
# -------------------------------------------------------------------
const EVENT_IDS: Array[String] = [
	"drought", "storm", "early_frost", "heat_spike", "wet_week",
]

const PROB: Dictionary = {
	"drought":     {"spring": 0.02, "summer": 0.08, "autumn": 0.03, "winter": 0.00},
	"storm":       {"spring": 0.12, "summer": 0.05, "autumn": 0.18, "winter": 0.10},
	"early_frost": {"spring": 0.00, "summer": 0.00, "autumn": 0.15, "winter": 0.00},
	"heat_spike":  {"spring": 0.01, "summer": 0.06, "autumn": 0.02, "winter": 0.00},
	"wet_week":    {"spring": 0.08, "summer": 0.02, "autumn": 0.06, "winter": 0.10},
}

# Duration ranges (inclusive).
const DURATION: Dictionary = {
	"drought":     [5, 15],
	"storm":       [1, 1],
	"early_frost": [1, 3],
	"heat_spike":  [2, 5],
	"wet_week":    [5, 7],
}

# Drought requires a dry run-up; the spec wants 10+ rain-free summer days.
const DROUGHT_MIN_DRY_DAYS: int = 10
# Storm needs a 3-day no-rain setup per spec.
const STORM_MIN_DRY_DAYS: int = 3
# Rain threshold for "this day counted as rainy" (mm).
const RAIN_DAY_THRESHOLD_MM: float = 1.0
# Baseline per-season daily rain chance (mirrors WorldGrid._season_rain
# roughly — we don't import the autoload, we roll our own rain marker so
# we stay decoupled from WorldGrid internals).
const BASE_RAIN_CHANCE: Dictionary = {
	"spring": 0.5,
	"summer": 0.2,
	"autumn": 0.6,
	"winter": 0.8,
}
# Early-frost only fires in the late-autumn window (last 10 days).
const EARLY_FROST_LATE_AUTUMN_ONLY: bool = true
const LATE_AUTUMN_START_DAY: int = 20  # season_day >= 20 means last 10 of 30


# -------------------------------------------------------------------
# State
# -------------------------------------------------------------------
var current_event: String = ""
var event_day_start: int = -1
var event_duration_days: int = 0
var severity: float = 0.0

var _days_since_rain: int = 0
var _consecutive_rain_days: int = 0
# Cooldown map: event_id -> day when it can fire again.
var _cooldown_until: Dictionary = {}
# Pending event rolled one day early so we can telegraph a warning.
# {id, duration, severity, fire_day}.
var _pending: Dictionary = {}

var _rng: RandomNumberGenerator = RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()
	# Hook the scheduler day-tick. Safe to connect even before Scheduler
	# has started its internal timer — connections just wait for signals.
	if has_node("/root/Scheduler"):
		var sch: Node = get_node("/root/Scheduler")
		if sch.has_signal("day_advanced") and not sch.is_connected("day_advanced", _on_day_advanced):
			sch.connect("day_advanced", _on_day_advanced)
	_log_event("boot", {"info": "weather_system ready"})


# =====================================================================
# Public API
# =====================================================================

func is_active(ev: String = "") -> bool:
	if ev == "":
		return current_event != ""
	return current_event == ev


func days_since_rain() -> int:
	return _days_since_rain


## Force an event to start immediately. Used by debug cheats + the
## headless sim. Bypasses the warning stage.
##
## `event_day_start` is backed up by one day so the NEXT day_advanced
## signal counts as day 1 of the event. That way
## `force_event(id, N)` yields exactly N day-ticks of `event_active`
## before the event ends, matching the player-facing duration.
func force_event(event_id: String, duration_days: int, sev: float) -> void:
	if not EVENT_IDS.has(event_id):
		push_warning("WeatherSystem.force_event: unknown %s" % event_id)
		return
	if current_event != "":
		_end_event(_current_day())
	var day: int = _current_day() - 1
	_begin_event(event_id, max(1, duration_days), clamp(sev, 0.0, 1.0), day)


# =====================================================================
# Day-tick core
# =====================================================================

func _on_day_advanced(day: int, season: String, _year: int) -> void:
	# 1. Roll rain for today. Override to "no rain" if a drought is active;
	#    force rain on storm / wet_week days so downstream counters track.
	var raining: bool = _roll_rain_for_day(season)

	# 2. Update dry-streak / wet-streak counters.
	if raining:
		_days_since_rain = 0
		_consecutive_rain_days += 1
	else:
		_days_since_rain += 1
		_consecutive_rain_days = 0

	# 3. Advance an active event.
	if current_event != "":
		_tick_active_event(day)
		# If the event ended this tick, fall through so a new pending /
		# rolled event can still fire THIS same tick — weather never
		# stalls for a free day after an event ends (cooldown gates it).
		if current_event != "":
			return

	# 4. Promote any pending (warned) event whose fire-day has arrived.
	if not _pending.is_empty() and int(_pending.get("fire_day", -1)) <= day:
		var p: Dictionary = _pending.duplicate()
		_pending = {}
		_begin_event(
			String(p["id"]),
			int(p["duration"]),
			float(p["severity"]),
			day,
		)
		return

	# 5. Roll for a new event. On hit, warn 1 day ahead AND stash it.
	var rolled: String = _roll_event(season, day)
	if rolled == "":
		return
	var dur: int = _roll_duration(rolled)
	var sev: float = _roll_severity(rolled, dur)
	# Fire the warning today; actual event begins next day-tick.
	_pending = {
		"id": rolled,
		"duration": dur,
		"severity": sev,
		"fire_day": day + 1,
	}
	emit_signal("warning_fired", rolled, 1)
	_log_event("warning_fired", {
		"id": rolled, "eta_days": 1, "duration": dur, "severity": sev,
	})
	_auto_queue_prep_tasks(rolled)


func _tick_active_event(day: int) -> void:
	var elapsed: int = day - event_day_start
	var remaining: int = max(0, event_duration_days - elapsed)
	if remaining <= 0:
		_end_event(day)
		return
	emit_signal("event_active", current_event, remaining)
	_apply_active_visuals()


func _begin_event(id: String, duration: int, sev: float, day: int) -> void:
	current_event = id
	event_duration_days = duration
	severity = sev
	event_day_start = day
	emit_signal("event_starting", id, sev)
	_log_event("event_starting", {
		"id": id, "duration": duration, "severity": sev, "day": day,
	})
	# Schedule cooldown after the event: duration + 5 days grace, per spec.
	_cooldown_until[id] = day + duration + 5
	# Visible coupling — start FX now. event_active fires on subsequent
	# day-ticks via _tick_active_event so the total active-count matches
	# the declared duration exactly.
	_apply_start_visuals()


func _end_event(day: int) -> void:
	var ending_id: String = current_event
	emit_signal("event_ending", ending_id)
	_log_event("event_ending", {"id": ending_id, "day": day})
	_apply_end_visuals(ending_id)
	current_event = ""
	event_day_start = -1
	event_duration_days = 0
	severity = 0.0


# =====================================================================
# Rolling helpers
# =====================================================================

## A day is "rainy" if we'd normally roll rain for the season OR an
## active storm / wet-week forces it. Drought forces a 0-rain day.
func _roll_rain_for_day(season: String) -> bool:
	if current_event == "drought":
		return false
	if current_event == "storm" or current_event == "wet_week":
		return true
	var p: float = float(BASE_RAIN_CHANCE.get(season, 0.3))
	return _rng.randf() < p


## Pick an event for this day-tick, honoring season probabilities,
## cooldowns, and preconditions. Returns "" on a miss.
func _roll_event(season: String, day: int) -> String:
	# Iterate in EVENT_IDS order for determinism. Only one event fires
	# per day — the first to hit its probability wins.
	for id in EVENT_IDS:
		if not _can_trigger(id, season, day):
			continue
		var p: float = float((PROB[id] as Dictionary).get(season, 0.0))
		if p <= 0.0:
			continue
		if _rng.randf() < p:
			return id
	return ""


func _can_trigger(id: String, season: String, day: int) -> bool:
	# Cooldown gate.
	if int(_cooldown_until.get(id, -1)) > day:
		return false
	# Per-event preconditions.
	match id:
		"drought":
			if season != "summer":
				# Spec: drought mostly-summer; we still let a low-prob
				# spring/autumn roll through IF the dry streak is long.
				return _days_since_rain >= DROUGHT_MIN_DRY_DAYS
			return _days_since_rain >= DROUGHT_MIN_DRY_DAYS
		"storm":
			return _days_since_rain >= STORM_MIN_DRY_DAYS
		"early_frost":
			if not EARLY_FROST_LATE_AUTUMN_ONLY:
				return true
			# Only the last 10 days of autumn (season_day >= 20).
			var sd: int = _season_day()
			return season == "autumn" and sd >= LATE_AUTUMN_START_DAY
		"heat_spike":
			return _days_since_rain >= 3
		"wet_week":
			# Needs 5+ consecutive rain days to have any bite per spec.
			# We allow the roll once 3+ consecutive days have accrued —
			# the event itself forces 5–7 more rain days.
			return _consecutive_rain_days >= 3
	return true


func _roll_duration(id: String) -> int:
	var rng: Array = DURATION.get(id, [1, 1])
	var lo: int = int(rng[0])
	var hi: int = int(rng[1])
	if hi <= lo:
		return lo
	return lo + _rng.randi_range(0, hi - lo)


func _roll_severity(id: String, duration: int) -> float:
	match id:
		"drought":
			return clamp(float(duration) / 20.0, 0.25, 1.0)
		"storm":
			return 1.0
		"early_frost":
			return clamp(0.4 + 0.2 * float(duration), 0.0, 1.0)
		"heat_spike":
			return clamp(0.4 + 0.12 * float(duration), 0.0, 1.0)
		"wet_week":
			return clamp(0.3 + 0.1 * float(duration), 0.0, 1.0)
	return 0.5


# =====================================================================
# Visible coupling — existing Juice helpers only, no new FX systems.
# =====================================================================

func _apply_start_visuals() -> void:
	if not has_node("/root/Juice"):
		return
	var juice: Node = get_node("/root/Juice")
	match current_event:
		"storm":
			if juice.has_method("rain_on"):
				juice.call("rain_on", clamp(severity, 0.4, 1.0))
			if juice.has_method("wind_set"):
				juice.call("wind_set", _current_season(), 0.8)
		"wet_week":
			if juice.has_method("rain_on"):
				juice.call("rain_on", clamp(0.3 + 0.3 * severity, 0.3, 0.7))
			emit_signal("anaerobic_risk", true)
		"drought":
			# Stop any residual rain emitter so the scene reads dry.
			if juice.has_method("rain_on"):
				juice.call("rain_on", 0.0)


func _apply_active_visuals() -> void:
	# Per-tick refresh — keeps the rain / wind dialled at the right
	# intensity across the event's lifespan. Juice helpers are
	# idempotent (they reuse the same emitter instance).
	_apply_start_visuals()


func _apply_end_visuals(ending_id: String) -> void:
	if not has_node("/root/Juice"):
		return
	var juice: Node = get_node("/root/Juice")
	match ending_id:
		"storm", "wet_week":
			if juice.has_method("rain_on"):
				juice.call("rain_on", 0.0)
			if juice.has_method("wind_set"):
				juice.call("wind_set", _current_season(), 0.0)
			if ending_id == "wet_week":
				emit_signal("anaerobic_risk", false)


# =====================================================================
# Auto-queue prep tasks on warning (defensive: TaskQueue public API only)
# =====================================================================

func _auto_queue_prep_tasks(warning_id: String) -> void:
	if warning_id != "wet_week":
		return
	if not has_node("/root/TaskQueue"):
		return
	var tq: Node = get_node("/root/TaskQueue")
	if not tq.has_method("queue_task"):
		return
	var piles: Array = get_tree().get_nodes_in_group("compost_pile") if get_tree() else []
	if piles.is_empty():
		return
	var action: Dictionary = {
		"id": "inspect_pile_cover",
		"label": "Inspect pile cover (wet week incoming)",
		"base_labor_seconds": 4.0,
		"cost": {},
		"yield": {},
		"pickup_from": "",
		"drop_off_at": "",
	}
	for p in piles:
		if p == null or not is_instance_valid(p):
			continue
		tq.call("queue_task", p, action, 5)
		_log_event("prep_task_queued", {"action": action["id"], "target": String(p.name)})


# =====================================================================
# Utility
# =====================================================================

func _current_day() -> int:
	if has_node("/root/Scheduler"):
		return int(get_node("/root/Scheduler").day)
	return 0


func _season_day() -> int:
	if has_node("/root/Scheduler"):
		return int(get_node("/root/Scheduler").season_day)
	return 0


func _current_season() -> String:
	if has_node("/root/Scheduler"):
		return String(get_node("/root/Scheduler").current_season())
	return "spring"


func _log_event(name: String, data: Dictionary) -> void:
	if has_node("/root/GameLog"):
		var gl: Node = get_node("/root/GameLog")
		if gl.has_method("event"):
			gl.call("event", "weather_" + name, data)


# =====================================================================
# Serialization (keep save_system happy — it may probe autoloads).
# =====================================================================

func serialize() -> Dictionary:
	return {
		"current_event": current_event,
		"event_day_start": event_day_start,
		"event_duration_days": event_duration_days,
		"severity": severity,
		"days_since_rain": _days_since_rain,
		"consecutive_rain_days": _consecutive_rain_days,
		"cooldown_until": _cooldown_until.duplicate(),
		"pending": _pending.duplicate(),
	}


func hydrate(data: Dictionary) -> void:
	current_event = String(data.get("current_event", ""))
	event_day_start = int(data.get("event_day_start", -1))
	event_duration_days = int(data.get("event_duration_days", 0))
	severity = float(data.get("severity", 0.0))
	_days_since_rain = int(data.get("days_since_rain", 0))
	_consecutive_rain_days = int(data.get("consecutive_rain_days", 0))
	var cd: Variant = data.get("cooldown_until", {})
	_cooldown_until = (cd as Dictionary).duplicate() if cd is Dictionary else {}
	var pd: Variant = data.get("pending", {})
	_pending = (pd as Dictionary).duplicate() if pd is Dictionary else {}
