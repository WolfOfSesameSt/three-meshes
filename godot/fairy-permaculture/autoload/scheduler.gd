## Fairy Permaculture — day-tick scheduler (ported from `core/day-tick.js`).
##
## Drives the world clock in real time. 20 min per in-game day at 1× speed;
## scaling via `set_speed(0/1/2/4/10)` (0 = paused, 10 = turbo). Emits
## `day_advanced` each day, `season_changed` at season boundaries,
## `year_advanced` at year boundaries.
extends Node

signal day_advanced(day: int, season: String, year: int)
signal season_changed(season: String, year: int)
signal year_advanced(year: int)
signal speed_changed(speed: int)

const SECONDS_PER_DAY := 1200.0  # 20 minutes per in-game day at 1x (player pick)
const DAYS_PER_SEASON := 30
const SEASONS := ["spring", "summer", "autumn", "winter"]
const DAYS_PER_YEAR := 120

var day: int = 0
var season_day: int = 0
var season_index: int = 0
var year: int = 0
var speed: int = 2            # default 2× so the world feels alive
var _day_timer: float = 0.0
var _started: bool = false


func start() -> void:
	_started = true


func pause() -> void:
	set_speed(0)


func set_speed(new_speed: int) -> void:
	if new_speed not in [0, 1, 2, 4, 10]:
		push_warning("Scheduler.set_speed: invalid %d" % new_speed)
		return
	speed = new_speed
	emit_signal("speed_changed", speed)
	if speed > 0:
		_started = true


func current_season() -> String:
	return SEASONS[season_index]


func _process(delta: float) -> void:
	if not _started or speed == 0:
		return
	_day_timer += delta * speed
	var steps := 0
	while _day_timer >= SECONDS_PER_DAY and steps < 10:
		_day_timer -= SECONDS_PER_DAY
		_advance_one_day()
		steps += 1


func _advance_one_day() -> void:
	emit_signal("day_advanced", day, current_season(), year)
	day += 1
	season_day += 1
	if season_day >= DAYS_PER_SEASON:
		season_day = 0
		season_index = (season_index + 1) % SEASONS.size()
		emit_signal("season_changed", current_season(), year)
		if season_index == 0:
			year += 1
			emit_signal("year_advanced", year)


func serialize() -> Dictionary:
	return {
		"day": day,
		"season_day": season_day,
		"season_index": season_index,
		"year": year,
		"speed": speed,
	}


func hydrate(data: Dictionary) -> void:
	day = int(data.get("day", 0))
	season_day = int(data.get("season_day", 0))
	season_index = int(data.get("season_index", 0))
	year = int(data.get("year", 0))
	speed = int(data.get("speed", 1))
