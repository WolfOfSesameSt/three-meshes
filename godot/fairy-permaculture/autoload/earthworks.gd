## Fairy Permaculture — earthworks registry (swales + berms).
##
## Small autoload that tracks player-carved contour earthworks. A "swale"
## is a 3-tile on-contour trench with a matching downhill berm. The
## trench slows + captures surface runoff; the berm reads as a raised
## planting mound whose adjacent tiles stay wetter through drought.
##
## We cannot mutate `autoload/world_grid.gd` (file-ownership forbids it).
## So the public API only READS elevation / material / water from
## WorldGrid and the moisture bonus lives in a parallel dict indexed by
## tile coord. `Scheduler.day_advanced` hooks apply the bonus so the
## effect shows up over time. The bonus decays slowly so a neglected
## swale (no rain) loses its retention advantage — a hook that lets a
## later agent add sediment/OM accrual without breaking saves.
##
## Public surface:
##   has_slope_at(pos, min_slope_deg = 4.0) -> bool
##   add_swale_at(pos) -> Dictionary  { trench_tiles, berm_tiles, dir }
##   is_swale(pos) -> bool
##   is_berm(pos) -> bool
##   adjacent_bonus_moisture(pos) -> float   — 0..0.5 applied by callers
##   swale_count() -> int
##   tick_day()   — debug/sim shortcut; production boot auto-subscribes
##
## Registered as autoload singleton `Earthworks`.
extends Node

# -----------------------------------------------------------------------
# Tunables. Kept low-magnitude so a single swale is useful but not a
# "moisture god-mode" — the player still needs mulch + OM + shade for a
# drought-proof patch.
# -----------------------------------------------------------------------

## Tiles on the uphill side that donate to the trench per day (fraction
## of their surface water).
const SWALE_CAPTURE_FRACTION: float = 0.30
## Direct moisture bonus applied to berm tiles when the trench is wet.
const BERM_WET_MOISTURE_PER_DAY: float = 0.05
## Adjacency bonus radius around swale/berm (metres).
const ADJACENCY_RADIUS_M: float = 6.0
## Adjacency moisture bonus per day while swale is wet.
const ADJACENCY_WET_MOISTURE_PER_DAY: float = 0.03
## Bonus decay per day (applied when trench is dry). Prevents runaway
## accumulation — without rain the swale advantage slowly fades.
const BONUS_DECAY_PER_DAY: float = 0.02
## Max accumulated moisture bonus per tile (0..1 moisture units).
const MAX_ACCUMULATED_BONUS: float = 0.35
## Minimum trench surface-water depth (cm) to consider the swale "wet".
const WET_THRESHOLD_CM: float = 0.5
## Default min slope (degrees) — below this the action is hidden.
const DEFAULT_MIN_SLOPE_DEG: float = 4.0

# -----------------------------------------------------------------------
# State.
# -----------------------------------------------------------------------

## Each swale record:
##   {
##     "trench": Array[Vector2i]   — tile coords (x, z)
##     "berm":   Array[Vector2i]
##     "dir":    Vector3            — downhill direction (xz)
##     "center": Vector3            — world-space anchor
##   }
var _swales: Array[Dictionary] = []
## Fast lookups keyed by tile coord.
var _trench_set: Dictionary = {}   # Vector2i -> true
var _berm_set: Dictionary = {}     # Vector2i -> true
## Moisture bonus accumulator per tile coord. Callers (soil_plot / plant
## / any per-tile water consumer) can query `adjacent_bonus_moisture` to
## fold into their moisture math. We don't mutate WorldGrid tiles
## directly — that's reserved for a later patch when WorldGrid exposes
## a public moisture setter.
var _moisture_bonus: Dictionary = {}   # Vector2i -> float
## Virtual trench surface water — counted separately from WorldGrid so
## we don't touch its tiles. Still usable by callers who want to know
## "is this swale holding water right now".
var _trench_water_cm: Dictionary = {}  # Vector2i -> float


func _ready() -> void:
	if has_node("/root/Scheduler"):
		var sch: Node = get_node("/root/Scheduler")
		if sch.has_signal("day_advanced") and not sch.is_connected("day_advanced", _on_day_advanced):
			sch.connect("day_advanced", _on_day_advanced)
	_log_event("boot", {"info": "earthworks ready"})


# =====================================================================
# Public API
# =====================================================================

## True when the tile under `world_pos` has enough slope to host a swale.
## Uses 4-neighbor elevation deltas and converts max rise/run into a
## degree measure. `min_slope_deg` default is 4° — a gentle but
## unmistakable slope the player can read visually.
func has_slope_at(world_pos: Vector3, min_slope_deg: float = DEFAULT_MIN_SLOPE_DEG) -> bool:
	if not has_node("/root/WorldGrid"):
		return false
	var tile_size: float = _tile_size_m()
	var h_center: float = WorldGrid.sample_height(world_pos)
	var best_rise: float = 0.0
	for d in [Vector3(1, 0, 0), Vector3(-1, 0, 0), Vector3(0, 0, 1), Vector3(0, 0, -1)]:
		var np: Vector3 = world_pos + d * tile_size
		var h_n: float = WorldGrid.sample_height(np)
		var rise: float = abs(h_n - h_center)
		if rise > best_rise:
			best_rise = rise
	# run = one tile. slope = atan2(rise, run) in degrees.
	var deg: float = rad_to_deg(atan2(best_rise, tile_size))
	return deg >= min_slope_deg


## Register a swale centered at `center`. Returns the trench + berm tile
## coords so the visual layer (SwaleSite) can spawn matched meshes.
## Idempotent: calling twice with the same center returns the existing
## record. The trench lies perpendicular to the downhill gradient; the
## berm sits one tile downhill.
func add_swale_at(center: Vector3) -> Dictionary:
	if not has_node("/root/WorldGrid"):
		return {}
	var tile_size: float = _tile_size_m()
	var down: Vector3 = _downhill_xz(center, tile_size)
	# If the terrain is functionally flat we still build something — pick
	# +Z as the downhill axis so the sim has a deterministic answer.
	if down.length() < 0.01:
		down = Vector3(0, 0, 1)
	# Trench axis is perpendicular to downhill (rotate 90° on XZ).
	var perp: Vector3 = Vector3(-down.z, 0.0, down.x).normalized()
	var center_tile: Vector2i = _world_to_tile(center)
	var trench: Array[Vector2i] = []
	var berm: Array[Vector2i] = []
	# 3-tile trench + 3-tile berm one tile downhill of each trench tile.
	for i in [-1, 0, 1]:
		var tv: Vector2i = Vector2i(
			center_tile.x + int(round(perp.x * float(i))),
			center_tile.y + int(round(perp.z * float(i))),
		)
		trench.append(tv)
		var bv: Vector2i = Vector2i(
			tv.x + int(round(down.x)),
			tv.y + int(round(down.z)),
		)
		berm.append(bv)
	# De-dupe any trench/berm overlap (pathological on very flat ground).
	var berm_clean: Array[Vector2i] = []
	for b in berm:
		if not trench.has(b):
			berm_clean.append(b)
	berm = berm_clean
	var record: Dictionary = {
		"trench": trench,
		"berm": berm,
		"dir": down,
		"center": center,
	}
	_swales.append(record)
	for t in trench:
		_trench_set[t] = true
		if not _trench_water_cm.has(t):
			_trench_water_cm[t] = 0.0
	for b in berm:
		_berm_set[b] = true
	_log_event("swale_added", {
		"trench": trench.size(),
		"berm": berm.size(),
		"center": center,
	})
	return record


## True if the tile under `world_pos` is part of any registered trench.
func is_swale(world_pos: Vector3) -> bool:
	return _trench_set.has(_world_to_tile(world_pos))


## True if the tile under `world_pos` is part of any registered berm.
func is_berm(world_pos: Vector3) -> bool:
	return _berm_set.has(_world_to_tile(world_pos))


## Returns the accumulated moisture bonus for the tile under `world_pos`.
## Soil plots + plants can add this value to their own moisture read.
## 0..MAX_ACCUMULATED_BONUS.
func adjacent_bonus_moisture(world_pos: Vector3) -> float:
	return float(_moisture_bonus.get(_world_to_tile(world_pos), 0.0))


## True if the trench tile at `world_pos` is currently holding at least
## WET_THRESHOLD_CM of water. Drives the trench-puddle visual alpha.
func trench_is_wet_at(world_pos: Vector3) -> bool:
	var tv: Vector2i = _world_to_tile(world_pos)
	if not _trench_set.has(tv):
		return false
	return float(_trench_water_cm.get(tv, 0.0)) >= WET_THRESHOLD_CM


func trench_water_cm_at(world_pos: Vector3) -> float:
	return float(_trench_water_cm.get(_world_to_tile(world_pos), 0.0))


func swale_count() -> int:
	return _swales.size()


## Exposed so the debug sim can drive ticks without needing Scheduler.
func tick_day() -> void:
	_on_day_advanced(0, _current_season(), 0)


# =====================================================================
# Day-tick core
# =====================================================================

func _on_day_advanced(_day: int, season: String, _year: int) -> void:
	if _swales.is_empty():
		return
	# 1. Pull water from uphill neighbors into each trench tile.
	#    We query WorldGrid.sample_height to read the local gradient;
	#    since we can't debit WorldGrid's surface water (no setter), we
	#    estimate the transferred volume from the rain-day signal. When
	#    WeatherSystem reports active rain (storm/wet_week) the trench
	#    fills faster; during drought it dries out.
	var raining: bool = _is_raining(season)
	var drought: bool = _is_drought()
	for rec in _swales:
		var trench: Array = rec["trench"]
		for tv in trench:
			var cur: float = float(_trench_water_cm.get(tv, 0.0))
			if raining:
				cur += 2.0
			elif drought:
				cur = max(0.0, cur - 0.4)
			else:
				cur = max(0.0, cur - 0.1)
			# Capture from uphill: approximate with a constant gain scaled
			# by SWALE_CAPTURE_FRACTION and the local slope — wetter tile
			# when the ground around is steep.
			var center_world: Vector3 = _tile_to_world(tv)
			var slope: float = _max_neighbor_rise_m(center_world, _tile_size_m())
			cur += SWALE_CAPTURE_FRACTION * slope * 4.0
			# Cap at 8 cm so the trench doesn't visually overflow.
			_trench_water_cm[tv] = clamp(cur, 0.0, 8.0)
	# 2. Apply moisture bonuses.
	for rec in _swales:
		var trench2: Array = rec["trench"]
		var berm: Array = rec["berm"]
		var wet: bool = _trench_any_wet(trench2)
		for btv in berm:
			_accrue_bonus(btv, BERM_WET_MOISTURE_PER_DAY if wet else -BONUS_DECAY_PER_DAY)
		# Adjacent tiles within ADJACENCY_RADIUS_M — compute once per
		# swale center (cheap, 13-tile footprint).
		var center: Vector3 = rec["center"]
		var r: int = int(ceil(ADJACENCY_RADIUS_M / _tile_size_m()))
		var center_tv: Vector2i = _world_to_tile(center)
		for dz in range(-r, r + 1):
			for dx in range(-r, r + 1):
				var ntv: Vector2i = Vector2i(center_tv.x + dx, center_tv.y + dz)
				if _trench_set.has(ntv) or _berm_set.has(ntv):
					continue
				var world_m: Vector3 = _tile_to_world(ntv) - center
				if world_m.length() > ADJACENCY_RADIUS_M:
					continue
				var delta: float = ADJACENCY_WET_MOISTURE_PER_DAY if wet else -BONUS_DECAY_PER_DAY
				_accrue_bonus(ntv, delta)


# =====================================================================
# Helpers
# =====================================================================

func _accrue_bonus(tv: Vector2i, delta: float) -> void:
	var cur: float = float(_moisture_bonus.get(tv, 0.0))
	cur = clamp(cur + delta, 0.0, MAX_ACCUMULATED_BONUS)
	if cur <= 0.0:
		_moisture_bonus.erase(tv)
	else:
		_moisture_bonus[tv] = cur


func _trench_any_wet(trench: Array) -> bool:
	for tv in trench:
		if float(_trench_water_cm.get(tv, 0.0)) >= WET_THRESHOLD_CM:
			return true
	return false


## Local downhill unit vector on the XZ plane — samples 4 neighbors and
## steps toward the lowest. Returns Vector3.ZERO on perfectly flat ground.
func _downhill_xz(world_pos: Vector3, tile_size: float) -> Vector3:
	var best: Vector3 = Vector3.ZERO
	var h_center: float = WorldGrid.sample_height(world_pos)
	var best_drop: float = 0.0
	for d in [Vector3(1, 0, 0), Vector3(-1, 0, 0), Vector3(0, 0, 1), Vector3(0, 0, -1)]:
		var np: Vector3 = world_pos + d * tile_size
		var drop: float = h_center - WorldGrid.sample_height(np)
		if drop > best_drop:
			best_drop = drop
			best = d
	return best


func _max_neighbor_rise_m(world_pos: Vector3, tile_size: float) -> float:
	var h_center: float = WorldGrid.sample_height(world_pos)
	var best: float = 0.0
	for d in [Vector3(1, 0, 0), Vector3(-1, 0, 0), Vector3(0, 0, 1), Vector3(0, 0, -1)]:
		var np: Vector3 = world_pos + d * tile_size
		best = max(best, abs(WorldGrid.sample_height(np) - h_center))
	return best


func _world_to_tile(world_pos: Vector3) -> Vector2i:
	var half: float = _world_half_m()
	var tile_size: float = _tile_size_m()
	var tx: int = int(round((world_pos.x + half) / tile_size))
	var tz: int = int(round((world_pos.z + half) / tile_size))
	return Vector2i(tx, tz)


func _tile_to_world(tv: Vector2i) -> Vector3:
	var half: float = _world_half_m()
	var tile_size: float = _tile_size_m()
	var wx: float = float(tv.x) * tile_size - half
	var wz: float = float(tv.y) * tile_size - half
	return Vector3(wx, 0.0, wz)


func _tile_size_m() -> float:
	if has_node("/root/WorldGrid"):
		return float(WorldGrid.TILE_SIZE_M)
	return 1.0


func _world_half_m() -> float:
	if has_node("/root/WorldGrid"):
		return float(WorldGrid.WORLD_HALF_M)
	return 64.0


func _is_raining(_season: String) -> bool:
	if has_node("/root/WeatherSystem"):
		var ws: Node = get_node("/root/WeatherSystem")
		if ws.has_method("is_active"):
			if bool(ws.call("is_active", "storm")) or bool(ws.call("is_active", "wet_week")):
				return true
	return false


func _is_drought() -> bool:
	if has_node("/root/WeatherSystem"):
		var ws: Node = get_node("/root/WeatherSystem")
		if ws.has_method("is_active"):
			return bool(ws.call("is_active", "drought"))
	return false


func _current_season() -> String:
	if has_node("/root/Scheduler"):
		return String(get_node("/root/Scheduler").current_season())
	return "spring"


func _log_event(event_name: String, data: Dictionary) -> void:
	if has_node("/root/GameLog"):
		var gl: Node = get_node("/root/GameLog")
		if gl.has_method("event"):
			gl.call("event", "earthworks_" + event_name, data)


# =====================================================================
# Save/load stubs — keeps SaveSystem happy when it probes autoloads.
# =====================================================================

func serialize() -> Dictionary:
	# Vector2i isn't JSON-safe; flatten to [x, y] pairs on serialize.
	var out_swales: Array = []
	for rec in _swales:
		var flat: Dictionary = {
			"trench": _flatten_tile_list(rec.get("trench", [])),
			"berm":   _flatten_tile_list(rec.get("berm", [])),
			"dir":    rec.get("dir", Vector3.ZERO),
			"center": rec.get("center", Vector3.ZERO),
		}
		out_swales.append(flat)
	return {
		"swales": out_swales,
	}


func hydrate(data: Dictionary) -> void:
	_swales.clear()
	_trench_set.clear()
	_berm_set.clear()
	_moisture_bonus.clear()
	_trench_water_cm.clear()
	var arr: Array = data.get("swales", [])
	for rec in arr:
		if not (rec is Dictionary):
			continue
		var trench: Array[Vector2i] = _rehydrate_tile_list(rec.get("trench", []))
		var berm: Array[Vector2i] = _rehydrate_tile_list(rec.get("berm", []))
		var fresh: Dictionary = {
			"trench": trench,
			"berm":   berm,
			"dir":    rec.get("dir", Vector3.ZERO),
			"center": rec.get("center", Vector3.ZERO),
		}
		_swales.append(fresh)
		for t in trench:
			_trench_set[t] = true
		for b in berm:
			_berm_set[b] = true


func _flatten_tile_list(list: Array) -> Array:
	var out: Array = []
	for v in list:
		if v is Vector2i:
			out.append([int((v as Vector2i).x), int((v as Vector2i).y)])
	return out


func _rehydrate_tile_list(list: Array) -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	for pair in list:
		if pair is Array and (pair as Array).size() >= 2:
			out.append(Vector2i(int(pair[0]), int(pair[1])))
	return out
