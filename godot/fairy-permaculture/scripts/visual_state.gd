## Fairy Permaculture — shared visual-state helper.
##
## Static utility used by every world object so seasonal tinting,
## growth-stage scaling, and fruit-cluster construction live in one
## place instead of being duplicated across plant / soil / bed scripts.
##
## All methods are pure: pass in the node + data, get a side-effect
## (material tint, child mesh added, tween started). No scene-tree
## lookups — callers own the references they pass in.
extends RefCounted
class_name VisualState

# Growth stage enum — strings for save-friendliness and debug print.
const STAGE_SEED: String = "seed"
const STAGE_JUVENILE: String = "juvenile"
const STAGE_FLOWERING: String = "flowering"
const STAGE_FRUITING: String = "fruiting"
const STAGE_HARVEST_READY: String = "harvest_ready"
const STAGE_DORMANT: String = "dormant"
const STAGE_DEAD: String = "dead"

# Scale-by-stage table. Matches DESIGN "B. Plant seasonal/growth state".
const STAGE_SCALE: Dictionary = {
	STAGE_SEED: 0.15,
	STAGE_JUVENILE: 0.55,
	STAGE_FLOWERING: 1.0,
	STAGE_FRUITING: 1.0,
	STAGE_HARVEST_READY: 1.0,
	STAGE_DORMANT: 0.9,
	STAGE_DEAD: 0.85,
}

# Seasonal leaf tints — applied as a Color multiplier over the base
# species color so the bush reads "autumn red" without losing species
# identity.
const SEASON_TINT: Dictionary = {
	"spring": Color(1.05, 1.05, 0.95, 1.0),  # fresh bright green
	"summer": Color(1.0, 1.0, 1.0, 1.0),     # true color
	"autumn": Color(1.25, 0.85, 0.55, 1.0),  # warm orange/red shift
	"winter": Color(0.65, 0.65, 0.72, 1.0),  # desaturated dormant
}

# Species → ripe berry color. Falls through to default purple.
const FRUIT_COLOR_BY_SPECIES: Dictionary = {
	"salmonberry": Color(0.95, 0.45, 0.30),      # deep red-orange
	"blueberry": Color(0.32, 0.40, 0.70),        # blue-purple
	"huckleberry": Color(0.22, 0.10, 0.32),      # near-black purple
	"blackcap-raspberry": Color(0.18, 0.08, 0.12),
	"gooseberry": Color(0.78, 0.85, 0.42),       # pale yellow-green
	"currant-red": Color(0.85, 0.25, 0.25),
	"currant-black": Color(0.10, 0.08, 0.12),
	"apple": Color(0.82, 0.22, 0.22),
	"pear": Color(0.85, 0.78, 0.42),
	"cherry": Color(0.78, 0.14, 0.18),
	"plum": Color(0.45, 0.18, 0.32),
	"quince": Color(0.88, 0.78, 0.32),
}

const DEFAULT_FRUIT_COLOR: Color = Color(0.63, 0.47, 0.71)  # deep purple


## Return a Color multiplier for the current season. Dormant stages
## desaturate further so a dormant-in-winter plant reads dead-grass.
static func seasonal_tint(season: String, stage: String) -> Color:
	var tint: Color = SEASON_TINT.get(season, Color.WHITE)
	if stage == STAGE_DORMANT or stage == STAGE_DEAD:
		# Further desaturation for dead/dormant.
		tint = tint.lerp(Color(0.55, 0.55, 0.55, 1.0), 0.45)
	return tint


## Scale factor for a given growth stage. 1.0 is "mature".
static func stage_scale(stage: String) -> float:
	return float(STAGE_SCALE.get(stage, 1.0))


## Fruit albedo for a species_id. Pulls from the curated palette,
## falling back to a safe default.
static func fruit_color(species_id: String) -> Color:
	return FRUIT_COLOR_BY_SPECIES.get(species_id, DEFAULT_FRUIT_COLOR)


## Build the child FruitCluster container on a plant root. Idempotent:
## calling twice returns the same node. Uses a deterministic RNG seeded
## from the plant's name so fruit positions don't drift between frames.
static func ensure_fruit_cluster(plant_root: Node3D) -> Node3D:
	var existing: Node = plant_root.get_node_or_null("FruitCluster")
	if existing != null and existing is Node3D:
		return existing
	var n: Node3D = Node3D.new()
	n.name = "FruitCluster"
	n.position = Vector3(0.0, 1.6, 0.0)  # roughly plant-top height
	plant_root.add_child(n)
	return n


## Grow the cluster to exactly `count` fruit meshes, with a per-berry
## pop-in tween on any new sphere and a pick-burst on any removed one.
## `seed_hint` produces stable positions so berries re-appear in the
## same spots day after day.
static func sync_fruit_cluster(
	cluster: Node3D,
	count: int,
	fruit_color_: Color,
	seed_hint: int
) -> void:
	var current_count: int = cluster.get_child_count()
	if count == current_count:
		return
	if count > current_count:
		# Add new berries at deterministic-but-random positions.
		var rng: RandomNumberGenerator = RandomNumberGenerator.new()
		rng.seed = seed_hint
		# Burn existing positions so new ones sit between them.
		for i in range(current_count):
			rng.randf()
			rng.randf()
			rng.randf()
		for i in range(count - current_count):
			var berry: MeshInstance3D = _make_berry_mesh(fruit_color_)
			var theta: float = rng.randf() * TAU
			var radius: float = 0.45 + rng.randf() * 0.55
			var y_off: float = -0.15 + rng.randf() * 0.45
			berry.position = Vector3(cos(theta) * radius, y_off, sin(theta) * radius)
			berry.scale = Vector3.ZERO
			cluster.add_child(berry)
			# Pop-in tween.
			var tw: Tween = berry.create_tween()
			tw.tween_property(berry, "scale", Vector3.ONE, 0.35) \
				.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	else:
		# Remove extras with a pick-burst + scale-to-zero tween.
		var to_remove: int = current_count - count
		var kids: Array = cluster.get_children()
		for i in range(to_remove):
			var idx: int = kids.size() - 1 - i
			if idx < 0:
				break
			var child: Node = kids[idx]
			if child is Node3D:
				var node3d: Node3D = child as Node3D
				var wp: Vector3 = node3d.global_position
				Juice.burst(wp, fruit_color_, 4)
				var tw: Tween = node3d.create_tween()
				tw.tween_property(node3d, "scale", Vector3.ZERO, 0.25) \
					.set_trans(Tween.TRANS_SINE)
				tw.tween_callback(node3d.queue_free)


## Derive season from Scheduler. Falls through to a day-mod-120 guess
## if the scheduler isn't running yet.
static func current_season_safe() -> String:
	if Engine.has_singleton("Scheduler"):
		return (Engine.get_singleton("Scheduler") as Node).call("current_season")
	var root_tree: SceneTree = Engine.get_main_loop() as SceneTree
	if root_tree == null:
		return "summer"
	var node: Node = root_tree.root.get_node_or_null("Scheduler")
	if node != null and node.has_method("current_season"):
		return node.call("current_season")
	return "summer"


static func _make_berry_mesh(col: Color) -> MeshInstance3D:
	var mi: MeshInstance3D = MeshInstance3D.new()
	var sm: SphereMesh = SphereMesh.new()
	sm.radius = 0.11
	sm.height = 0.22
	sm.radial_segments = 8
	sm.rings = 6
	mi.mesh = sm
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.albedo_color = col
	mat.roughness = 0.45
	mi.material_override = mat
	mi.name = "Berry"
	return mi
