## Fairy Permaculture — data store singleton.
##
## Loads all `data/*.json` files at startup and exposes them as typed
## dictionaries / arrays. Mirrors the data-driven design from the JS
## prototype: species + branches + compost recipe + balance tuning
## all live in JSON so designers can edit without touching code.
extends Node

var plants: Array = []
var animals: Array = []
var branches: Array = []
var events: Array = []
var guilds: Array = []
var compost: Dictionary = {}
var fairies: Dictionary = {}
var balance: Dictionary = {}
var biomes: Dictionary = {} # id → config

## Expanded ecosystem arrays — loaded from data/ecosystem/*.json.
## These feed the Lab and eventually replace the stub plants/animals.
var eco_plants: Array = []
var eco_animals: Array = []
var eco_fungi: Array = []
var eco_insects: Array = []
var eco_biomes: Array = []

## Fast-lookup indices, built after load.
var _plant_by_id: Dictionary = {}
var _animal_by_id: Dictionary = {}
var _eco_index: Dictionary = {}


func _ready() -> void:
	plants = _load_array("res://data/plants.json")
	animals = _load_array("res://data/animals.json")
	branches = _load_array("res://data/branches.json")
	events = _load_array("res://data/events.json")
	guilds = _load_array("res://data/guilds.json")
	compost = _load_dict("res://data/compost.json")
	fairies = _load_dict("res://data/fairies.json")
	balance = _load_dict("res://data/balance.json")
	biomes["bc-coastal"] = _load_dict("res://data/biomes/bc-coastal.json")
	# Ecosystem (Lab) data — rich entity library.
	eco_plants = _load_array("res://data/ecosystem/plants.json")
	eco_animals = _load_array("res://data/ecosystem/animals.json")
	eco_fungi = _load_array("res://data/ecosystem/fungi.json")
	eco_insects = _load_array("res://data/ecosystem/insects.json")
	eco_biomes = _load_array("res://data/ecosystem/biomes.json")
	for p in plants:
		_plant_by_id[p["id"]] = p
	for a in animals:
		_animal_by_id[a["id"]] = a
	_index_eco(eco_plants, "plant")
	_index_eco(eco_animals, "animal")
	_index_eco(eco_fungi, "fungus")
	_index_eco(eco_insects, "insect")
	_index_eco(eco_biomes, "biome")
	_validate_eco()


## Minimal runtime sanity check — every ecosystem entity must have
## an id + name + category/tier fields. Emits push_warning for any
## missing required keys. Lab still renders even if flags fire.
func _validate_eco() -> void:
	var report: Array = []
	for group in [
		["plant", eco_plants], ["animal", eco_animals],
		["fungus", eco_fungi], ["insect", eco_insects],
		["biome", eco_biomes]
	]:
		var kind: String = group[0]
		var entries: Array = group[1]
		var missing: int = 0
		for e in entries:
			if not (e is Dictionary):
				missing += 1
				continue
			if not e.has("id") or not e.has("name"):
				missing += 1
		report.append("%s=%d%s" % [kind, entries.size(), "" if missing == 0 else " (%d bad)" % missing])
		if missing > 0:
			push_warning("DataStore: %d %s entries missing id/name" % [missing, kind])
	print("DataStore ecosystem loaded: ", ", ".join(PackedStringArray(report)))


func get_plant(id: String) -> Variant:
	return _plant_by_id.get(id, null)


func get_animal(id: String) -> Variant:
	return _animal_by_id.get(id, null)


## Returns the ecosystem entity by id regardless of kingdom,
## or null if missing. Value is `{ kind, data }`.
func get_eco(id: String) -> Variant:
	return _eco_index.get(id, null)


func eco_entities_for(kind: String) -> Array:
	match kind:
		"plant": return eco_plants
		"animal": return eco_animals
		"fungus": return eco_fungi
		"insect": return eco_insects
		"biome": return eco_biomes
		_: return []


func _index_eco(entities: Array, kind: String) -> void:
	for e in entities:
		if e is Dictionary and e.has("id"):
			_eco_index[e["id"]] = { "kind": kind, "data": e }


## Helpers --------------------------------------------------------------

func _load_any(path: String) -> Variant:
	var f: FileAccess = FileAccess.open(path, FileAccess.READ)
	if f == null:
		push_warning("DataStore: missing file %s" % path)
		return null
	var text: String = f.get_as_text()
	f.close()
	var result: Variant = JSON.parse_string(text)
	if result == null:
		push_warning("DataStore: failed to parse %s" % path)
	return result


func _load_array(path: String) -> Array:
	var v: Variant = _load_any(path)
	return v if v is Array else []


func _load_dict(path: String) -> Dictionary:
	var v: Variant = _load_any(path)
	return v if v is Dictionary else {}
