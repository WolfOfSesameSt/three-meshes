## Fairy Permaculture — landscape decoration scatter.
##
## Procgen places trees, rocks, and deadwood logs around the starting
## landscape so the world reads as "untamed wild waiting to be healed"
## rather than a flat green disc. Every item is an INTERACTABLE
## `decor_item.tscn` instance carrying a `kind` field — hover rim-light
## and right-click context actions are handled inside `decor_item.gd`.
##
## Living-forest extension: each scattered tree is seeded with a
## species_id (from a BC-coastal palette) and an `age_days` drawn from
## the tier's age band. `decor_item.gd` handles growth + branchfall per
## day-tick; this script only wires the initial state.
##
## Placement rules:
##   • Polar scatter inside an annulus around the homestead.
##   • Snap Y to `WorldGrid.sample_height(pos)` so trees stand on slope.
##   • Skip tiles flagged as water by `WorldGrid.is_water_tile` — no
##     more bushes spawning inside the stream.
##   • Deterministic seed so the scene is consistent across launches.
extends Node3D

const DecorItemScene: PackedScene = preload("res://scenes/decor_item.tscn")
const DecorItemScript: Script = preload("res://scripts/decor_item.gd")

const RADIUS_INNER: float = 14.0   # keep clear around homestead
const RADIUS_OUTER: float = 46.0   # scatter out to here

const TREE_SMALL_COUNT: int = 15
const TREE_MATURE_COUNT: int = 8
const TREE_OLD_COUNT: int = 3
const ROCK_COUNT: int = 14
const DEADWOOD_COUNT: int = 10

const MAX_SPOT_ATTEMPTS: int = 12

var _rng: RandomNumberGenerator = RandomNumberGenerator.new()


func _ready() -> void:
	seed(42)
	_rng.seed = 42
	var placed: int = 0
	placed += _scatter_tree_kind("tree_small", TREE_SMALL_COUNT, 0.85, 1.15)
	placed += _scatter_tree_kind("tree_mature", TREE_MATURE_COUNT, 0.95, 1.25)
	placed += _scatter_tree_kind("tree_old", TREE_OLD_COUNT, 1.1, 1.35)
	placed += _scatter_kind("rock", ROCK_COUNT, 0.6, 1.2)
	placed += _scatter_kind("deadwood_log", DEADWOOD_COUNT, 0.7, 1.1)
	GameLog.info(
		"scattered %d decor items (%d small / %d mature / %d old trees, %d rocks, %d deadwood)" % [
			placed,
			TREE_SMALL_COUNT,
			TREE_MATURE_COUNT,
			TREE_OLD_COUNT,
			ROCK_COUNT,
			DEADWOOD_COUNT,
		],
		"decor",
	)


func _scatter_kind(kind: String, count: int, scale_min: float, scale_max: float) -> int:
	var placed: int = 0
	for i in range(count):
		var pos: Vector3 = _pick_spot()
		if pos == Vector3.INF:
			continue
		var scale_f: float = randf_range(scale_min, scale_max)
		var item: Node3D = DecorItemScene.instantiate()
		item.name = "%s_%d" % [kind, i]
		# Configure visual variation BEFORE adding — so _ready() sees the
		# right kind/scale on first build.
		item.call("configure", kind, scale_f, (hash(kind) ^ (i * 9973)) & 0xffffff)
		item.position = pos
		add_child(item)
		placed += 1
	return placed


## Tree-specific scatter: in addition to kind/scale/seed, stamps a
## species_id (biased by tier) and a randomised `age_days` inside the
## tier's age-band. These fields drive growth + branchfall inside
## decor_item.gd on the Scheduler day-tick.
func _scatter_tree_kind(kind: String, count: int, scale_min: float, scale_max: float) -> int:
	var placed: int = 0
	for i in range(count):
		var pos: Vector3 = _pick_spot()
		if pos == Vector3.INF:
			continue
		var scale_f: float = randf_range(scale_min, scale_max)
		var seed_v: int = (hash(kind) ^ (i * 9973)) & 0xffffff
		var species: String = DecorItemScript.pick_species_for_tier(kind, _rng)
		var age: int = DecorItemScript._roll_age_band_for_tier(kind, _rng)
		var item: Node3D = DecorItemScene.instantiate()
		item.name = "%s_%d" % [kind, i]
		item.call("configure_tree", kind, scale_f, seed_v, species, age)
		item.position = pos
		add_child(item)
		placed += 1
	return placed


## Polar scatter with rejection on homestead keep-out + water tiles.
## Returns `Vector3.INF` if we couldn't find a valid spot in the
## attempt budget — the caller just skips that item (minor density
## loss vs. placing an item underwater).
func _pick_spot() -> Vector3:
	for _try in range(MAX_SPOT_ATTEMPTS):
		var angle: float = randf() * TAU
		var r: float = sqrt(randf()) * RADIUS_OUTER
		if r < RADIUS_INNER:
			continue
		var candidate: Vector3 = Vector3(cos(angle) * r, 0.0, sin(angle) * r)
		if WorldGrid.is_water_tile(candidate):
			continue
		candidate.y = WorldGrid.sample_height(candidate)
		return candidate
	return Vector3.INF
