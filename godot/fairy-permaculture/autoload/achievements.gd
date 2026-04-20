## Fairy Permaculture — achievements autoload.
##
## Tracks the 30+ achievements from docs/design/replayability.md. Each
## entry lives in `data/achievements.json` with either:
##   - signal:   a literal signal id handled by `report_signal(id)`,
##               optionally "id:payload" (e.g. `structure_built:hugel_bed`)
##   - threshold_field / threshold: a numeric field we poll each
##               FarmTotals.changed tick against an internal map.
##
## Unlocks persist to `user://achievements.json` (a global player profile,
## not per-farm), so the stamp collection survives across runs.
##
## Signals:
##   achievement_unlocked(id: String)  — fired once per id per profile.
##
## Integration notes (NOT modified here — see FOLLOW-UP in the agent
## report):
##   - progression.gd fires `structure_built` via `mark_structure_built()`.
##     Achievements listens for that signal when it's available.
##   - RandomEvents.event_triggered: we forward to "event_fired:<id>"
##     internal signals so the firefly / chanterelle achievements chain.
##   - FarmTotals.changed: we poll thresholds (compost_harvested,
##     fairy_count, max_om across tiles, honey / milk, comfrey_tea_doses).
extends Node

signal achievement_unlocked(id: String)
signal progress_changed(id: String, value: float, threshold: float)

const CATALOGUE_PATH: String = "res://data/achievements.json"
const PROFILE_PATH: String = "user://achievements.json"

var catalogue: Array = []
## Unlocked achievement ids -> ISO date unlocked.
var unlocked: Dictionary = {}
## Reported numeric thresholds — tests + systems bump these via
## `report_threshold(field, value)`.
var thresholds: Dictionary = {
	"compost_harvested": 0.0,
	"fairy_count": 0.0,
	"max_om_pct": 0.0,
	"honey_total": 0.0,
	"milk_total": 0.0,
	"comfrey_tea_doses": 0.0,
}


func _ready() -> void:
	_load_catalogue()
	_load_profile()
	# FarmTotals.changed -> re-check the threshold achievements cheaply.
	if has_node("/root/FarmTotals"):
		FarmTotals.changed.connect(_on_farm_totals_changed)
	# Progression structure-built hook (wired by follow-up integration).
	if has_node("/root/Progression") and Progression.has_signal("unlocks_changed"):
		Progression.unlocks_changed.connect(_on_unlocks_changed)
	# Random events -> event_fired:<id> signals.
	if has_node("/root/RandomEvents") and RandomEvents.has_signal("event_triggered"):
		RandomEvents.event_triggered.connect(_on_random_event)
	# First pass now, in case thresholds already satisfy anything at boot.
	_on_farm_totals_changed()
	GameLog.info("achievements loaded (%d catalogue, %d unlocked)" % [
		catalogue.size(), unlocked.size(),
	], "replayability")


func _load_catalogue() -> void:
	if not FileAccess.file_exists(CATALOGUE_PATH):
		GameLog.warn("achievements: missing catalogue %s" % CATALOGUE_PATH, "replayability")
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


func _load_profile() -> void:
	if not FileAccess.file_exists(PROFILE_PATH):
		unlocked = {}
		return
	var f: FileAccess = FileAccess.open(PROFILE_PATH, FileAccess.READ)
	if f == null:
		unlocked = {}
		return
	var text: String = f.get_as_text()
	f.close()
	var parsed: Variant = JSON.parse_string(text)
	if parsed is Dictionary:
		unlocked = parsed
	else:
		unlocked = {}


func _save_profile() -> void:
	var f: FileAccess = FileAccess.open(PROFILE_PATH, FileAccess.WRITE)
	if f == null:
		GameLog.warn("achievements: could not open profile for write", "replayability")
		return
	f.store_string(JSON.stringify(unlocked))
	f.close()


## Unlock an achievement. Idempotent. Persists the new stamp. Paired
## audio + parchment pop handled by the HUD when it subscribes to the
## signal (follow-up).
func unlock(id: String) -> bool:
	if id == "":
		return false
	if unlocked.has(id):
		return false
	var found: bool = false
	for entry in catalogue:
		if String(entry.get("id", "")) == id:
			found = true
			break
	if not found:
		GameLog.warn("achievements: unknown id %s" % id, "replayability")
		return false
	unlocked[id] = Time.get_datetime_string_from_system()
	_save_profile()
	GameLog.event("achievement_unlocked", {"id": id})
	if has_node("/root/AudioManager"):
		AudioManager.play("compost-finish", -4.0)
	emit_signal("achievement_unlocked", id)
	return true


## Report a signal-style achievement (id or "id:payload"). Each catalogue
## entry's `signal` field is matched as a plain string. Wildcard by id.
func report_signal(sig: String) -> void:
	for entry in catalogue:
		if String(entry.get("signal", "")) == sig:
			unlock(String(entry.get("id", "")))


## Bump a numeric threshold (absolute value, not delta). Then re-evaluate
## every threshold-style entry that watches this field.
func report_threshold(field: String, value: float) -> void:
	thresholds[field] = max(float(thresholds.get(field, 0.0)), value)
	for entry in catalogue:
		if String(entry.get("threshold_field", "")) != field:
			continue
		var target: float = float(entry.get("threshold", 0.0))
		emit_signal("progress_changed", String(entry.get("id", "")), value, target)
		if value >= target:
			unlock(String(entry.get("id", "")))


## Manually queue an event-id -> achievement chain. RandomEvents forwards
## to this via `_on_random_event`.
func _on_random_event(id: String, _payload: Dictionary) -> void:
	report_signal("event_fired:" + id)


func _on_farm_totals_changed() -> void:
	report_threshold("compost_harvested", float(FarmTotals.compost_harvested))
	var honey: float = float((FarmTotals.fairy_food as Dictionary).get("honey", 0.0))
	report_threshold("honey_total", honey)
	var milk: float = float((FarmTotals.fairy_food as Dictionary).get("milk", 0.0))
	report_threshold("milk_total", milk)
	if has_node("/root/Game"):
		report_threshold("fairy_count", float(Game.fairy_count))
	# OM sweep across live soil_plots group (cheap O(n) — typical worlds
	# carry <50 plots). Reads `om_pct` property so any plot / bed variant
	# exposing it contributes.
	var max_om: float = 0.0
	var st: SceneTree = Engine.get_main_loop() as SceneTree
	if st != null:
		for p in st.get_nodes_in_group("soil_plots"):
			if p == null or not is_instance_valid(p):
				continue
			var om_v: Variant = p.get("om_pct")
			if om_v != null:
				max_om = max(max_om, float(om_v))
		for p in st.get_nodes_in_group("garden_beds"):
			if p == null or not is_instance_valid(p):
				continue
			var om_v: Variant = p.get("om_pct")
			if om_v != null:
				max_om = max(max_om, float(om_v))
	report_threshold("max_om_pct", max_om)


func _on_unlocks_changed() -> void:
	# Fired by Progression when a building unlock lands; we inspect the
	# unlocked_buildings list and emit "structure_built:<id>" signals so
	# the catalogue can react. Progression.mark_structure_built is the
	# preferred hook (follow-up) — this is a best-effort until then.
	if not has_node("/root/Progression"):
		return
	for bid in Progression.unlocked_buildings:
		report_signal("structure_built:" + String(bid))


func is_unlocked(id: String) -> bool:
	return unlocked.has(id)


func unlocked_count() -> int:
	return unlocked.size()


func total_count() -> int:
	return catalogue.size()


func list_catalogue() -> Array:
	return catalogue.duplicate(true)


func serialize() -> Dictionary:
	return {
		"unlocked": unlocked.duplicate(),
		"thresholds": thresholds.duplicate(),
	}


func hydrate(data: Dictionary) -> void:
	if data.has("unlocked"):
		unlocked = (data["unlocked"] as Dictionary).duplicate()
	if data.has("thresholds"):
		thresholds = (data["thresholds"] as Dictionary).duplicate()
