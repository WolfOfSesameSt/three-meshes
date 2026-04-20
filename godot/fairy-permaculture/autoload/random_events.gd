## Fairy Permaculture — daily "spice" random-events autoload.
##
## On every day-tick this autoload rolls against the catalogue loaded
## from `data/spice_events.json`. One-event-per-day cap; cooldown
## tracked per event id. 25+ entries in the catalogue. Each entry
## surfaces as a `event_triggered(id, payload)` signal that gameplay
## systems (HUD parchment banner, morale, task queue, decor spawner)
## listen to.
##
## Spec (docs/design/replayability.md §3. Daily events):
##   - Catalogue in JSON so designers can iterate.
##   - Low per-event probability, 3-day cooldown baseline (per entry).
##   - One-event-per-day cap for narrative pacing.
##   - Each event carries a payload dict — handlers pick the fields
##     they care about (stay_days, fruit_yield, morale_bonus, etc.).
##
## This module is a CATALOGUE + SCHEDULER. Effect application is left to
## the downstream handlers that subscribe to `event_triggered` — an
## intentional separation so this file owns the timing + sampling, and
## the gameplay-side reactions land in the files that own each system
## (HUD banner, animal spawner, compost pile, etc.).
extends Node

signal event_triggered(id: String, payload: Dictionary)

const CATALOGUE_PATH: String = "res://data/spice_events.json"
const DEFAULT_COOLDOWN_DAYS: int = 3
const ONE_PER_DAY_CAP: bool = true

var catalogue: Array = []
## Map event_id -> int (day when cooldown expires).
var _cooldown_until: Dictionary = {}
## Total events fired this run. Exposed for achievements.gd to watch.
var events_fired_total: int = 0
## Last-fired id so tests / HUD can read it without reconnecting.
var last_event_id: String = ""


func _ready() -> void:
	_load_catalogue()
	if Scheduler.has_signal("day_advanced"):
		Scheduler.day_advanced.connect(_on_day)
	GameLog.info("random_events catalogue loaded (%d entries)" % catalogue.size(), "replayability")


func _load_catalogue() -> void:
	if not FileAccess.file_exists(CATALOGUE_PATH):
		GameLog.warn("random_events: missing catalogue %s" % CATALOGUE_PATH, "replayability")
		catalogue = []
		return
	var f: FileAccess = FileAccess.open(CATALOGUE_PATH, FileAccess.READ)
	if f == null:
		catalogue = []
		return
	var text: String = f.get_as_text()
	f.close()
	var parsed: Variant = JSON.parse_string(text)
	if parsed is Array:
		catalogue = parsed
	else:
		catalogue = []
		GameLog.warn("random_events: catalogue parse failed", "replayability")


func _on_day(day: int, season: String, year: int) -> void:
	if catalogue.is_empty():
		return
	var rng: RandomNumberGenerator = RandomNumberGenerator.new()
	# Seed per-day so a given seed + day produces the same roll (deterministic).
	rng.seed = (WorldSeed.seed if has_node("/root/WorldSeed") else 0) ^ hash("random_events:%d:%d" % [year, day])
	var fired_this_day: int = 0
	var indices: Array[int] = []
	for i in range(catalogue.size()):
		indices.append(i)
	indices.shuffle()
	for i in indices:
		if ONE_PER_DAY_CAP and fired_this_day >= 1:
			break
		var entry: Dictionary = catalogue[i]
		var id: String = String(entry.get("id", ""))
		if id == "":
			continue
		# Cooldown gate.
		if _cooldown_until.has(id) and day < int(_cooldown_until[id]):
			continue
		# Conditions gate.
		if not _conditions_met(entry.get("conditions", {}), day, season, year):
			continue
		var prob: float = float(entry.get("probability", 0.05))
		if rng.randf() > prob:
			continue
		# Fire it.
		var payload: Dictionary = entry.get("payload", {}).duplicate(true)
		payload["_event_name"] = String(entry.get("name", id))
		payload["_event_description"] = String(entry.get("description", ""))
		var cooldown: int = int(entry.get("cooldown_days", DEFAULT_COOLDOWN_DAYS))
		_cooldown_until[id] = day + cooldown
		events_fired_total += 1
		last_event_id = id
		fired_this_day += 1
		GameLog.event("spice_event_fired", {"id": id, "day": day, "year": year})
		emit_signal("event_triggered", id, payload)


func _conditions_met(conditions: Dictionary, day: int, season: String, year: int) -> bool:
	if conditions.is_empty():
		return true
	if conditions.has("min_day") and day < int(conditions["min_day"]):
		return false
	if conditions.has("season") and String(conditions["season"]) != season:
		return false
	if conditions.has("season_any"):
		var seasons: Array = conditions["season_any"]
		if season not in seasons:
			return false
	if conditions.has("min_season_day"):
		if Scheduler.season_day < int(conditions["min_season_day"]):
			return false
	# Soft conditions the effect-handlers recheck at fire-time; we don't
	# resolve has_ruin / has_building / has_guild / flower_diversity / vitality
	# here because that would force dependencies on systems that are
	# write-forbidden to this pass. The handler can short-circuit if the
	# world state doesn't match.
	return true


## Manually trigger an event by id. Used by the sim tests + the debug
## command console. Bypasses cooldown / probability, still emits through
## the same signal so handlers see a normal fire.
func trigger_by_id(id: String, extra_payload: Dictionary = {}) -> bool:
	for entry in catalogue:
		if String(entry.get("id", "")) != id:
			continue
		var payload: Dictionary = entry.get("payload", {}).duplicate(true)
		for k in extra_payload.keys():
			payload[String(k)] = extra_payload[k]
		payload["_event_name"] = String(entry.get("name", id))
		payload["_event_description"] = String(entry.get("description", ""))
		events_fired_total += 1
		last_event_id = id
		_cooldown_until[id] = Scheduler.day + int(entry.get("cooldown_days", DEFAULT_COOLDOWN_DAYS))
		GameLog.event("spice_event_manual", {"id": id})
		emit_signal("event_triggered", id, payload)
		return true
	return false


func list_catalogue() -> Array:
	return catalogue.duplicate(true)


func catalogue_size() -> int:
	return catalogue.size()


func serialize() -> Dictionary:
	return {
		"cooldowns": _cooldown_until.duplicate(),
		"events_fired_total": events_fired_total,
		"last_event_id": last_event_id,
	}


func hydrate(data: Dictionary) -> void:
	if data.has("cooldowns"):
		_cooldown_until = (data["cooldowns"] as Dictionary).duplicate()
	events_fired_total = int(data.get("events_fired_total", 0))
	last_event_id = String(data.get("last_event_id", ""))
