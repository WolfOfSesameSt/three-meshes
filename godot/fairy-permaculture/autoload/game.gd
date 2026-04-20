## Fairy Permaculture — game state singleton.
##
## Wires the scheduler → systems that need to tick per day (pile, plants,
## population) and holds top-level flags (tree-panel-opened, etc.).
## Scene scripts register themselves here rather than reaching across
## the scene tree.
extends Node

signal new_fairy_spawned(name: String)

var player_flags: Dictionary = { "opened_tree": false }
var fairy_count: int = 1
var fairy_cap: int = 25
var pile_ref: Node = null  # set by the Main scene when the pile exists


func _ready() -> void:
	Scheduler.day_advanced.connect(_on_day_advanced)


func _on_day_advanced(_day: int, _season: String, _year: int) -> void:
	# All per-day subsystem ticking happens via direct connections to
	# Scheduler.day_advanced. This is intentionally sparse — Godot's
	# signal system is the orchestration layer, not a god-object.
	pass


## Try to spawn a new fairy using the diversity-gated food cost rule
## from the JS prototype (`fairies/population.js`). Returns true if a
## fairy was spawned.
func try_spawn_fairy() -> bool:
	if fairy_count >= fairy_cap:
		return false
	var food := FarmTotals.fairy_food
	var diversity := 0
	if food["honey"] > 0.0: diversity += 1
	if food["milk"] > 0.0: diversity += 1
	if food["fruit"] > 0.0: diversity += 1
	if diversity == 0:
		return false
	var mult := 1.0
	if diversity == 2: mult = 1.5
	elif diversity == 1: mult = 2.0
	var cost: float = float(DataStore.balance.get("fairy_pop_curve", {}).get("food_unit_cost_per_fairy", 2)) * mult
	var total: float = food["honey"] + food["milk"] + food["fruit"]
	if total < cost:
		return false
	# Spend proportionally.
	for kind in ["honey", "milk", "fruit"]:
		var share = cost * (food[kind] / total)
		FarmTotals.fairy_food[kind] = max(0.0, food[kind] - share)
	fairy_count += 1
	var name = _pick_name()
	emit_signal("new_fairy_spawned", name)
	FarmTotals.emit_signal("changed")
	return true


const _NAMES := [
	"Willow", "Mossflower", "Sable", "Pippin", "Bramble", "Sorrel", "Hazel",
	"Tansy", "Larkspur", "Meadow", "Clover", "Thistle", "Yarrow", "Saffron",
	"Linden", "Rowan", "Heather", "Fennel", "Juniper", "Iris", "Sage",
]
var _name_pool: Array = []


func _pick_name() -> String:
	if _name_pool.is_empty():
		_name_pool = _NAMES.duplicate()
		_name_pool.shuffle()
	if _name_pool.is_empty():
		return "Fairy%d" % fairy_count
	return _name_pool.pop_back()
