## Fairy Permaculture — world seed autoload.
##
## The replayability backbone: every procgen roll (terrain, stream path,
## plant scatter, POI placement, ruin coords) reads from a single seeded
## RNG. Same seed => same farm.
##
## Spec (docs/design/replayability.md §1. Seed system):
##   - `seed` is an int. Default: randi() at New Farm time (unless the
##     player types or pastes a seed at the Intro screen).
##   - Sub-seeds: `sub_rng(channel)` returns a dedicated RNG keyed by
##     seed + hash(channel) so adding a new procgen channel later does
##     not shift the existing terrain / plant / POI placements.
##   - Seed shares as "seed#config" (e.g. `42#bc-coastal#challenge-drought`).
##   - Curated challenge seeds documented at Palette-friendly level —
##     lookup is declarative here so the intro screen can surface the
##     pack without reading JSON.
##
## Persistence: the seed is captured via a public `serialize()` helper;
## the save_system hook will pick it up on its next schema pass (not
## modified here). The intro screen calls `set_seed(int)` before the
## main scene loads; WorldGrid reads `get_channel_seed("terrain")` at
## `_generate_tiles()` time.
extends Node

signal seed_changed(new_seed: int)

## Curated challenge seeds per the replayability doc. Each entry is a
## display-ready tuple the intro screen's "challenge" tab can surface.
const CHALLENGE_SEEDS: Array = [
	{"seed": 42,   "name": "The Quiet Valley", "note": "Default tutorial seed - gentle slope, easy stream, rich ruin."},
	{"seed": 1871, "name": "Cascade Pass",     "note": "Steep slopes, forced terracing play."},
	{"seed": 2077, "name": "Desert-Me",        "note": "Dry variance spike, drought-every-summer."},
	{"seed": 1906, "name": "The Great Flood",  "note": "Wet variance, frequent storms."},
	{"seed": 3141, "name": "Ridge-Line",       "note": "No stream - dig a well or rain-catch early."},
	{"seed": 9001, "name": "The Rock Garden",  "note": "Triple stone outcrops, weak soil."},
]

var seed: int = 0
var _rng: RandomNumberGenerator = RandomNumberGenerator.new()
## Per-channel RNG cache. A channel is any string id the caller picks
## (e.g. "terrain", "stream", "pois", "plant_scatter") and is hashed into
## a sub-seed so adding new channels does not shift existing rolls.
var _channel_rngs: Dictionary = {}


func _ready() -> void:
	# Default seed: randomize if nothing has been set before boot. The
	# intro screen may overwrite via set_seed() before the main scene
	# attaches to the tree.
	if seed == 0:
		var rng: RandomNumberGenerator = RandomNumberGenerator.new()
		rng.randomize()
		seed = int(rng.randi() & 0x7fffffff)
	_rng.seed = seed
	GameLog.info("world seed = %d" % seed, "replayability")


func set_seed(new_seed: int) -> void:
	seed = new_seed
	_rng.seed = seed
	_channel_rngs.clear()
	emit_signal("seed_changed", seed)
	GameLog.info("world seed reset to %d" % seed, "replayability")


## Per-channel sub-RNG. Prefer this over the root RNG so adding new
## procgen channels later doesn't shift existing ones. Usage:
##     var rng := WorldSeed.get_channel_rng("plant_scatter")
##     for i in 100: var t := rng.randf()
func get_channel_rng(channel: String) -> RandomNumberGenerator:
	if not _channel_rngs.has(channel):
		var rng: RandomNumberGenerator = RandomNumberGenerator.new()
		rng.seed = seed ^ hash(channel)
		_channel_rngs[channel] = rng
	return _channel_rngs[channel]


## Integer sub-seed for systems that want to feed their own RNG /
## FastNoiseLite. `WorldGrid._generate_tiles` already builds its own
## FastNoiseLite nodes; it can swap the hard-coded seeds for
## `WorldSeed.get_channel_seed("terrain")` on its next edit pass.
func get_channel_seed(channel: String) -> int:
	return seed ^ hash(channel)


## "42#bc-coastal#challenge-drought" style string. Biome + challenge
## toggles are optional; pass null / empty to omit.
func share_code(biome_id: String = "bc-coastal", challenge_id: String = "") -> String:
	var parts: Array[String] = [str(seed), biome_id]
	if challenge_id != "":
		parts.append(challenge_id)
	return "#".join(parts)


## Parse a share code into a dict { seed, biome, challenge }. Returns an
## empty dict on malformed input so callers can fall through to their
## default seed behaviour.
func parse_share_code(code: String) -> Dictionary:
	var clean: String = code.strip_edges()
	if clean == "":
		return {}
	var parts: PackedStringArray = clean.split("#")
	if parts.size() == 0:
		return {}
	var s: int = int(parts[0])
	if s == 0 and parts[0] != "0":
		return {}
	var biome: String = "bc-coastal"
	if parts.size() > 1 and parts[1] != "":
		biome = parts[1]
	var challenge: String = ""
	if parts.size() > 2:
		challenge = parts[2]
	return {"seed": s, "biome": biome, "challenge": challenge}


func serialize() -> Dictionary:
	return {"seed": seed}


func hydrate(data: Dictionary) -> void:
	if data.has("seed"):
		set_seed(int(data["seed"]))


## List the curated challenge seeds for intro-screen display.
func list_challenge_seeds() -> Array:
	return CHALLENGE_SEEDS.duplicate(true)
