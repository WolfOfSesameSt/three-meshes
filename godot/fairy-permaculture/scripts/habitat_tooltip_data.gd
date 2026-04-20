## Fairy Permaculture — habitat tooltip data builder.
##
## Pure-data helper. Given a habitat tag (e.g. `owl-box`, `rock-pile`,
## `brush-pile`, `mason-bee-tubes`, `duck-pond-edge`, `hedgerow`,
## `insectary-strip`, etc.) returns a dictionary the tooltip scene
## knows how to render:
##
##   {
##     "tag": "owl-box",
##     "display_name": "Owl Box",
##     "attracted": [
##       { "id": "barn-owl", "name": "Barn Owl", "present": true,
##         "preferred": false, "role": "rodent-control" },
##       ...
##     ],
##     "drains": ["rodent"],          # pest kinds draining while cohort present
##   }
##
## The tooltip UI reads this dict to populate labels. Keeping the driver
## pure makes it trivially testable + keeps the tooltip script a thin
## render layer.
##
## Sources of truth:
##   • DataStore.animals — species defs w/ `habitat_required` +
##     `habitat_preferred` tags (data/animals.json is canonical).
##   • Wildlife.is_present(id) — live presence check per species.
##   • Predator-to-prey drain map mirrors wildlife.gd's literal table.
class_name HabitatTooltipData
extends RefCounted


# Habitat tag → human-readable display name.
const TAG_DISPLAY: Dictionary = {
	"owl-box": "Owl Box",
	"bat-box": "Bat Box",
	"rock-pile": "Rock Pile",
	"brush-pile": "Brush Pile",
	"hedgerow": "Hedgerow",
	"insectary-strip": "Insectary Strip",
	"duck-pond-edge": "Duck Pond Edge",
	"mason-bee-tubes": "Mason Bee Tubes",
	"chicken-coop": "Chicken Coop",
	"cow-barn": "Cow Barn",
	"goat-shed": "Goat Shed",
	"pig-paddock": "Pig Paddock",
	"kennel": "Kennel",
	"warre-hive": "Warré Hive",
	"pond": "Pond",
	"bumblebee-nest-box": "Bumblebee Nest Box",
	"tall-grass-edge": "Tall Grass Edge",
	"rotten-log": "Rotten Log",
	"forest-edge": "Forest Edge",
	"open-pasture": "Open Pasture",
	"mature-tree": "Mature Tree",
}

## Mirror of wildlife.gd `_apply_predator_pressure_drain` — kept here so
## the tooltip can surface "Drains: rodent" without a cross-file call.
## If wildlife.gd evolves, update both tables.
const PREDATOR_DRAINS: Dictionary = {
	"barn-owl": ["rodent"],
	"garter-snake": ["rodent", "slug"],
	"little-brown-bat": ["moth"],
	"dragonfly": ["mosquito"],
	"ladybug": ["aphid"],
	"green-lacewing": ["aphid"],
	"ground-beetle": ["slug"],
	"northwestern-salamander": ["slug"],
	"song-sparrow": ["moth", "aphid"],
	"pacific-treefrog": ["mosquito"],
}


## Build the tooltip payload for a given habitat tag.
## `species_defs` defaults to DataStore.animals; unit tests can inject.
## `present_fn` is an optional callable(id)->bool; defaults to Wildlife.
static func build(tag: String,
		species_defs: Array = [],
		present_fn: Callable = Callable()) -> Dictionary:
	var defs: Array = species_defs
	if defs.is_empty():
		var ds: Node = Engine.get_main_loop().root.get_node_or_null("/root/DataStore") if Engine.get_main_loop() != null else null
		if ds != null:
			defs = ds.get("animals")
		if defs == null:
			defs = []
	var _present: Callable = present_fn
	if not _present.is_valid():
		var wl: Node = Engine.get_main_loop().root.get_node_or_null("/root/Wildlife") if Engine.get_main_loop() != null else null
		if wl != null and wl.has_method("is_present"):
			_present = Callable(wl, "is_present")

	var attracted: Array = []
	var drains_set: Dictionary = {}
	for def in defs:
		if not (def is Dictionary):
			continue
		var req: Array = def.get("habitat_required", [])
		var pref: Array = def.get("habitat_preferred", [])
		var req_hit: bool = tag in req
		var pref_hit: bool = tag in pref
		if not (req_hit or pref_hit):
			continue
		var id: String = String(def.get("id", ""))
		if id == "":
			continue
		var present: bool = false
		if _present.is_valid():
			present = bool(_present.call(id))
		var entry: Dictionary = {
			"id": id,
			"name": String(def.get("name", id)),
			"role": String(def.get("role", "")),
			"required": req_hit,
			"preferred": pref_hit and not req_hit,
			"present": present,
		}
		attracted.append(entry)
		if present and PREDATOR_DRAINS.has(id):
			for kind in PREDATOR_DRAINS[id]:
				drains_set[kind] = true

	# Sort: present first, then required before preferred, then alpha.
	attracted.sort_custom(_cmp_entries)

	var display_name: String = String(TAG_DISPLAY.get(tag, _titleize(tag)))
	var drains: Array = drains_set.keys()
	drains.sort()
	return {
		"tag": tag,
		"display_name": display_name,
		"attracted": attracted,
		"drains": drains,
	}


static func _cmp_entries(a: Dictionary, b: Dictionary) -> bool:
	# Present species bubble to the top.
	if a["present"] != b["present"]:
		return a["present"]
	# Required habitat listings outrank preferred.
	if a["required"] != b["required"]:
		return a["required"]
	return String(a["name"]) < String(b["name"])


## Infer the canonical habitat tag from a live habitat node by sniffing
## its group memberships. Mirrors wildlife.gd's _GROUP_TO_TAG table.
static func tag_from_node(node: Node) -> String:
	if node == null:
		return ""
	var GROUP_TO_TAG: Dictionary = {
		"owl_boxes": "owl-box",
		"bat_boxes": "bat-box",
		"rock_piles": "rock-pile",
		"brush_piles": "brush-pile",
		"hedgerow_segments": "hedgerow",
		"insectary_strips": "insectary-strip",
		"duck_pond_edges": "duck-pond-edge",
		"mason_bee_tubes": "mason-bee-tubes",
		"chicken_coops": "chicken-coop",
		"cow_barns": "cow-barn",
		"goat_sheds": "goat-shed",
		"pig_paddocks": "pig-paddock",
		"kennels": "kennel",
		"warre_hives": "warre-hive",
	}
	for g in GROUP_TO_TAG.keys():
		if node.is_in_group(g):
			return String(GROUP_TO_TAG[g])
	return ""


static func _titleize(tag: String) -> String:
	var parts: PackedStringArray = tag.split("-")
	var out: Array[String] = []
	for p in parts:
		if p.length() == 0:
			continue
		out.append(p.substr(0, 1).to_upper() + p.substr(1))
	return " ".join(out)
