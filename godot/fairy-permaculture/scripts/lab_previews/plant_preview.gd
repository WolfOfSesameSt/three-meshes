## Fairy Permaculture — Lab plant preview.
##
## Builds a recognizable species-specific composed mesh for a plant entity
## and exposes per-state visual overrides (scale, leaf count, flower/fruit
## visibility, seasonal tinting). `animate(name, t, dt)` plays breathing /
## sway / harvest / chop tweens.
##
## The preview is designed so silhouette + colour + state behaviour are
## enough to distinguish five similar species at a glance:
##   * apple (tall tree, pink-white blossom, red fruit)
##   * plum (medium tree, white blossom, purple fruit)
##   * cherry (medium tree, pink blossom, red fruit)
##   * pacific-crabapple (medium tree, white blossom, orange fruit)
##   * hazelnut (shrub-tree, catkins, brown nut clusters)
##
## Species data is declared once in `SPECIES_CFG` at the top of the file.
## Builders dispatch by growth form (tree / shrub / cane / herb / grass /
## vine / bulb / root / groundcover / rosette / fern / aquatic / cover-legume).
## Missing species fall back to a sensible form-default via `_cfg_for()`.
extends Node3D

const TOON_SHADER_PATH := "res://shaders/toon.gdshader"

## Flower-cluster patterns.
const FL_TIP := "tip"        # herb top, e.g. nettle, rosemary
const FL_RACEME := "raceme"  # vertical spike, e.g. lavender, comfrey
const FL_UMBEL := "umbel"    # flat umbrella, e.g. yarrow, carrot
const FL_CLUSTER := "cluster" # globe on canopy, e.g. apple blossom
const FL_BELL := "bell"      # pendant bells, e.g. blueberry
const FL_GLOBE := "globe"    # round head, e.g. dandelion, clover
const FL_CATKIN := "catkin"  # dangling string, e.g. hazelnut
const FL_TASSEL := "tassel"  # corn tassel

## Leaf shapes drive the leaf mesh geometry.
const LF_OVAL := "oval"
const LF_NEEDLE := "needle"
const LF_GRASS := "grass_blade"
const LF_LANCE := "lanceolate"
const LF_PALM := "palmate"
const LF_PINNATE := "pinnate"
const LF_BROAD := "broad"  # flat rosette disc (plantain, cabbage)

## Per-species configuration. Keys are plants.json id strings.
## Any entry may be partial; `_cfg_for()` falls back to growth-form defaults.
##   form: growth form selector — "tree", "shrub", "cane", "herb", "grass",
##         "vine", "bulb", "root", "groundcover", "rosette", "fern",
##         "aquatic", "cover-legume", "brassica-head"
##   height_scale: world-scale multiplier (comfrey 1.0, cedar 1.8, strawberry 0.35)
##   trunk: { color:Color, radius:float, bark_tone:float }
##   leaf: { shape:String, color:Color, count:int, size:float }
##   flower: { pattern:String, color:Color, count:int, size:float }
##   fruit: { color:Color, shape:String, count:int, size:float }
const SPECIES_CFG: Dictionary = {
	# ---- Pioneers / groundcovers ------------------------------------
	"dandelion": {
		"form": "rosette",
		"height_scale": 0.4,
		"leaf": { "shape": LF_LANCE, "color": Color(0.42, 0.58, 0.26), "count": 7, "size": 0.35 },
		"flower": { "pattern": FL_GLOBE, "color": Color(0.98, 0.82, 0.18), "count": 3, "size": 0.11 },
	},
	"stinging-nettle": {
		"form": "herb",
		"height_scale": 0.9,
		"leaf": { "shape": LF_LANCE, "color": Color(0.24, 0.50, 0.24), "count": 10, "size": 0.22 },
		"flower": { "pattern": FL_RACEME, "color": Color(0.56, 0.70, 0.44), "count": 6, "size": 0.06 },
	},
	"yarrow-common": {
		"form": "herb",
		"height_scale": 0.6,
		"leaf": { "shape": LF_PINNATE, "color": Color(0.44, 0.62, 0.36), "count": 8, "size": 0.18 },
		"flower": { "pattern": FL_UMBEL, "color": Color(0.96, 0.96, 0.92), "count": 5, "size": 0.26 },
	},
	"plantain-broadleaf": {
		"form": "rosette",
		"height_scale": 0.3,
		"leaf": { "shape": LF_BROAD, "color": Color(0.40, 0.58, 0.30), "count": 6, "size": 0.40 },
		"flower": { "pattern": FL_RACEME, "color": Color(0.55, 0.52, 0.35), "count": 3, "size": 0.05 },
	},
	"clover-white": {
		"form": "groundcover",
		"height_scale": 0.3,
		"leaf": { "shape": LF_PALM, "color": Color(0.42, 0.66, 0.32), "count": 9, "size": 0.14 },
		"flower": { "pattern": FL_GLOBE, "color": Color(0.96, 0.96, 0.90), "count": 5, "size": 0.08 },
	},
	"crimson-clover": {
		"form": "groundcover",
		"height_scale": 0.4,
		"leaf": { "shape": LF_PALM, "color": Color(0.38, 0.62, 0.30), "count": 9, "size": 0.14 },
		"flower": { "pattern": FL_RACEME, "color": Color(0.80, 0.18, 0.22), "count": 6, "size": 0.08 },
	},
	"vetch-hairy": {
		"form": "cover-legume",
		"height_scale": 0.5,
		"leaf": { "shape": LF_PINNATE, "color": Color(0.38, 0.58, 0.28), "count": 10, "size": 0.10 },
		"flower": { "pattern": FL_RACEME, "color": Color(0.54, 0.38, 0.72), "count": 6, "size": 0.05 },
	},
	# ---- Grains / covers -------------------------------------------
	"winter-rye": {
		"form": "grass",
		"height_scale": 1.1,
		"leaf": { "shape": LF_GRASS, "color": Color(0.60, 0.72, 0.34), "count": 12, "size": 1.2 },
		"fruit": { "color": Color(0.90, 0.82, 0.42), "shape": "spike", "count": 12, "size": 0.05 },
	},
	"buckwheat": {
		"form": "grass",
		"height_scale": 0.7,
		"leaf": { "shape": LF_OVAL, "color": Color(0.48, 0.66, 0.36), "count": 9, "size": 0.15 },
		"flower": { "pattern": FL_CLUSTER, "color": Color(0.96, 0.94, 0.92), "count": 6, "size": 0.10 },
		"fruit": { "color": Color(0.58, 0.40, 0.28), "shape": "seed", "count": 6, "size": 0.05 },
	},
	"tillage-radish": {
		"form": "root",
		"height_scale": 0.8,
		"leaf": { "shape": LF_PINNATE, "color": Color(0.40, 0.60, 0.28), "count": 7, "size": 0.30 },
		"fruit": { "color": Color(0.96, 0.94, 0.90), "shape": "taproot", "count": 1, "size": 0.25 },
	},
	"quinoa": {
		"form": "grass",
		"height_scale": 1.0,
		"leaf": { "shape": LF_OVAL, "color": Color(0.42, 0.60, 0.30), "count": 10, "size": 0.18 },
		"fruit": { "color": Color(0.84, 0.48, 0.18), "shape": "panicle", "count": 8, "size": 0.15 },
	},
	# ---- Chop-and-drop / herb greats -------------------------------
	"comfrey-bocking14": {
		"form": "herb",
		"height_scale": 0.8,
		"leaf": { "shape": LF_LANCE, "color": Color(0.42, 0.62, 0.30), "count": 10, "size": 0.32 },
		"flower": { "pattern": FL_BELL, "color": Color(0.64, 0.40, 0.78), "count": 6, "size": 0.10 },
	},
	"rosemary": {
		"form": "herb-shrub",
		"height_scale": 0.9,
		"leaf": { "shape": LF_NEEDLE, "color": Color(0.30, 0.46, 0.30), "count": 14, "size": 0.10 },
		"flower": { "pattern": FL_TIP, "color": Color(0.55, 0.62, 0.82), "count": 10, "size": 0.05 },
	},
	"lavender-english": {
		"form": "herb-shrub",
		"height_scale": 0.7,
		"leaf": { "shape": LF_NEEDLE, "color": Color(0.58, 0.62, 0.52), "count": 14, "size": 0.09 },
		"flower": { "pattern": FL_RACEME, "color": Color(0.52, 0.34, 0.76), "count": 9, "size": 0.06 },
	},
	# ---- Canefruits / shrubs ---------------------------------------
	"salmonberry": {
		"form": "cane",
		"height_scale": 1.1,
		"leaf": { "shape": LF_PALM, "color": Color(0.38, 0.60, 0.34), "count": 12, "size": 0.22 },
		"flower": { "pattern": FL_TIP, "color": Color(0.88, 0.44, 0.54), "count": 8, "size": 0.09 },
		"fruit": { "color": Color(0.96, 0.58, 0.30), "shape": "aggregate", "count": 8, "size": 0.12 },
	},
	"thimbleberry": {
		"form": "cane",
		"height_scale": 1.0,
		"leaf": { "shape": LF_PALM, "color": Color(0.42, 0.62, 0.32), "count": 10, "size": 0.28 },
		"flower": { "pattern": FL_TIP, "color": Color(0.98, 0.96, 0.92), "count": 6, "size": 0.12 },
		"fruit": { "color": Color(0.88, 0.32, 0.30), "shape": "thimble", "count": 6, "size": 0.13 },
	},
	"blueberry-highbush": {
		"form": "shrub",
		"height_scale": 1.0,
		"leaf": { "shape": LF_OVAL, "color": Color(0.28, 0.46, 0.32), "count": 16, "size": 0.16 },
		"flower": { "pattern": FL_BELL, "color": Color(0.96, 0.94, 0.88), "count": 8, "size": 0.08 },
		"fruit": { "color": Color(0.24, 0.30, 0.56), "shape": "berry", "count": 10, "size": 0.09 },
	},
	"raspberry-red": {
		"form": "cane",
		"height_scale": 1.2,
		"leaf": { "shape": LF_PALM, "color": Color(0.36, 0.58, 0.34), "count": 12, "size": 0.20 },
		"flower": { "pattern": FL_TIP, "color": Color(0.96, 0.94, 0.90), "count": 6, "size": 0.08 },
		"fruit": { "color": Color(0.82, 0.18, 0.24), "shape": "aggregate", "count": 9, "size": 0.11 },
	},
	"blackberry-marionberry": {
		"form": "cane",
		"height_scale": 1.0,
		"leaf": { "shape": LF_PALM, "color": Color(0.32, 0.52, 0.30), "count": 12, "size": 0.20 },
		"flower": { "pattern": FL_TIP, "color": Color(0.94, 0.92, 0.94), "count": 6, "size": 0.08 },
		"fruit": { "color": Color(0.12, 0.06, 0.14), "shape": "aggregate", "count": 9, "size": 0.11 },
	},
	"strawberry": {
		"form": "groundcover",
		"height_scale": 0.25,
		"leaf": { "shape": LF_PALM, "color": Color(0.36, 0.60, 0.30), "count": 9, "size": 0.18 },
		"flower": { "pattern": FL_TIP, "color": Color(0.98, 0.98, 0.94), "count": 4, "size": 0.07 },
		"fruit": { "color": Color(0.92, 0.22, 0.26), "shape": "heart", "count": 5, "size": 0.09 },
	},
	"saskatoon": {
		"form": "shrub",
		"height_scale": 1.2,
		"leaf": { "shape": LF_OVAL, "color": Color(0.38, 0.56, 0.36), "count": 14, "size": 0.17 },
		"flower": { "pattern": FL_CLUSTER, "color": Color(0.98, 0.98, 0.94), "count": 8, "size": 0.08 },
		"fruit": { "color": Color(0.32, 0.22, 0.40), "shape": "berry", "count": 9, "size": 0.09 },
	},
	# ---- Pome / stone / nut trees ----------------------------------
	"apple": {
		"form": "tree",
		"height_scale": 1.4,
		"trunk": { "color": Color(0.38, 0.26, 0.16), "radius": 0.28 },
		"leaf": { "shape": LF_OVAL, "color": Color(0.32, 0.54, 0.28), "count": 4, "size": 1.35 },
		"flower": { "pattern": FL_CLUSTER, "color": Color(0.98, 0.84, 0.88), "count": 10, "size": 0.10 },
		"fruit": { "color": Color(0.90, 0.22, 0.18), "shape": "round", "count": 9, "size": 0.19 },
	},
	"pear-anjou": {
		"form": "tree",
		"height_scale": 1.4,
		"trunk": { "color": Color(0.40, 0.28, 0.18), "radius": 0.26 },
		"leaf": { "shape": LF_OVAL, "color": Color(0.34, 0.56, 0.28), "count": 4, "size": 1.25 },
		"flower": { "pattern": FL_CLUSTER, "color": Color(0.98, 0.96, 0.94), "count": 10, "size": 0.10 },
		"fruit": { "color": Color(0.70, 0.76, 0.38), "shape": "pear", "count": 9, "size": 0.20 },
	},
	"pacific-crabapple": {
		"form": "tree",
		"height_scale": 1.2,
		"trunk": { "color": Color(0.34, 0.24, 0.16), "radius": 0.22 },
		"leaf": { "shape": LF_OVAL, "color": Color(0.30, 0.52, 0.26), "count": 4, "size": 1.15 },
		"flower": { "pattern": FL_CLUSTER, "color": Color(0.98, 0.94, 0.92), "count": 9, "size": 0.09 },
		"fruit": { "color": Color(0.86, 0.50, 0.20), "shape": "round", "count": 9, "size": 0.11 },
	},
	"plum-italian": {
		"form": "tree",
		"height_scale": 1.3,
		"trunk": { "color": Color(0.32, 0.20, 0.14), "radius": 0.24 },
		"leaf": { "shape": LF_OVAL, "color": Color(0.30, 0.48, 0.28), "count": 4, "size": 1.2 },
		"flower": { "pattern": FL_CLUSTER, "color": Color(0.98, 0.98, 0.94), "count": 10, "size": 0.09 },
		"fruit": { "color": Color(0.30, 0.16, 0.42), "shape": "oval", "count": 10, "size": 0.14 },
	},
	"cherry-sweet": {
		"form": "tree",
		"height_scale": 1.3,
		"trunk": { "color": Color(0.30, 0.18, 0.12), "radius": 0.24 },
		"leaf": { "shape": LF_OVAL, "color": Color(0.28, 0.50, 0.26), "count": 4, "size": 1.2 },
		"flower": { "pattern": FL_CLUSTER, "color": Color(0.98, 0.80, 0.85), "count": 12, "size": 0.10 },
		"fruit": { "color": Color(0.68, 0.12, 0.24), "shape": "round", "count": 12, "size": 0.09 },
	},
	"hazelnut": {
		"form": "shrub-tree",
		"height_scale": 1.1,
		"trunk": { "color": Color(0.34, 0.22, 0.14), "radius": 0.14 },
		"leaf": { "shape": LF_OVAL, "color": Color(0.36, 0.56, 0.30), "count": 5, "size": 0.9 },
		"flower": { "pattern": FL_CATKIN, "color": Color(0.84, 0.78, 0.42), "count": 6, "size": 0.14 },
		"fruit": { "color": Color(0.58, 0.38, 0.20), "shape": "nut", "count": 7, "size": 0.11 },
	},
	"chestnut-sweet": {
		"form": "tree",
		"height_scale": 1.8,
		"trunk": { "color": Color(0.32, 0.22, 0.14), "radius": 0.40 },
		"leaf": { "shape": LF_OVAL, "color": Color(0.30, 0.50, 0.24), "count": 5, "size": 2.0 },
		"flower": { "pattern": FL_CATKIN, "color": Color(0.92, 0.88, 0.52), "count": 8, "size": 0.22 },
		"fruit": { "color": Color(0.36, 0.22, 0.14), "shape": "burr", "count": 9, "size": 0.16 },
	},
	"walnut-english": {
		"form": "tree",
		"height_scale": 1.9,
		"trunk": { "color": Color(0.28, 0.20, 0.14), "radius": 0.42 },
		"leaf": { "shape": LF_PINNATE, "color": Color(0.30, 0.48, 0.22), "count": 5, "size": 2.1 },
		"flower": { "pattern": FL_CATKIN, "color": Color(0.78, 0.70, 0.40), "count": 8, "size": 0.18 },
		"fruit": { "color": Color(0.45, 0.55, 0.30), "shape": "round", "count": 9, "size": 0.17 },
	},
	# ---- Annual vegetables + grains --------------------------------
	"pole-bean": {
		"form": "vine",
		"height_scale": 1.3,
		"leaf": { "shape": LF_OVAL, "color": Color(0.40, 0.64, 0.32), "count": 10, "size": 0.20 },
		"flower": { "pattern": FL_TIP, "color": Color(0.96, 0.92, 0.88), "count": 5, "size": 0.06 },
		"fruit": { "color": Color(0.44, 0.68, 0.32), "shape": "pod", "count": 6, "size": 0.22 },
	},
	"pea-snap": {
		"form": "vine",
		"height_scale": 1.0,
		"leaf": { "shape": LF_PINNATE, "color": Color(0.50, 0.70, 0.36), "count": 10, "size": 0.14 },
		"flower": { "pattern": FL_TIP, "color": Color(0.98, 0.98, 0.96), "count": 5, "size": 0.06 },
		"fruit": { "color": Color(0.58, 0.76, 0.38), "shape": "pod", "count": 7, "size": 0.18 },
	},
	"corn-flint": {
		"form": "grass",
		"height_scale": 2.0,
		"leaf": { "shape": LF_GRASS, "color": Color(0.42, 0.64, 0.30), "count": 8, "size": 1.6 },
		"flower": { "pattern": FL_TASSEL, "color": Color(0.86, 0.76, 0.42), "count": 1, "size": 0.6 },
		"fruit": { "color": Color(0.92, 0.74, 0.22), "shape": "ear", "count": 2, "size": 0.30 },
	},
	"winter-squash": {
		"form": "vine",
		"height_scale": 0.6,
		"leaf": { "shape": LF_PALM, "color": Color(0.36, 0.56, 0.28), "count": 8, "size": 0.40 },
		"flower": { "pattern": FL_TIP, "color": Color(0.98, 0.82, 0.28), "count": 4, "size": 0.18 },
		"fruit": { "color": Color(0.82, 0.58, 0.20), "shape": "gourd", "count": 3, "size": 0.30 },
	},
	"potato-russet": {
		"form": "root",
		"height_scale": 0.7,
		"leaf": { "shape": LF_PINNATE, "color": Color(0.34, 0.52, 0.28), "count": 9, "size": 0.22 },
		"flower": { "pattern": FL_TIP, "color": Color(0.92, 0.90, 0.98), "count": 5, "size": 0.07 },
		"fruit": { "color": Color(0.74, 0.56, 0.34), "shape": "taproot", "count": 4, "size": 0.16 },
	},
	"carrot": {
		"form": "root",
		"height_scale": 0.5,
		"leaf": { "shape": LF_PINNATE, "color": Color(0.34, 0.58, 0.28), "count": 8, "size": 0.22 },
		"flower": { "pattern": FL_UMBEL, "color": Color(0.98, 0.98, 0.96), "count": 1, "size": 0.28 },
		"fruit": { "color": Color(0.95, 0.48, 0.18), "shape": "taproot", "count": 1, "size": 0.18 },
	},
	"beet": {
		"form": "root",
		"height_scale": 0.45,
		"leaf": { "shape": LF_BROAD, "color": Color(0.38, 0.50, 0.24), "count": 6, "size": 0.28 },
		"fruit": { "color": Color(0.55, 0.15, 0.24), "shape": "globe-root", "count": 1, "size": 0.18 },
	},
	"brassica-cabbage": {
		"form": "brassica-head",
		"height_scale": 0.5,
		"leaf": { "shape": LF_BROAD, "color": Color(0.46, 0.62, 0.36), "count": 8, "size": 0.44 },
		"fruit": { "color": Color(0.60, 0.72, 0.40), "shape": "head", "count": 1, "size": 0.32 },
	},
	"kale-lacinato": {
		"form": "rosette",
		"height_scale": 0.9,
		"leaf": { "shape": LF_LANCE, "color": Color(0.26, 0.38, 0.28), "count": 11, "size": 0.32 },
	},
	"lettuce-salanova": {
		"form": "rosette",
		"height_scale": 0.35,
		"leaf": { "shape": LF_BROAD, "color": Color(0.54, 0.74, 0.36), "count": 10, "size": 0.28 },
		"flower": { "pattern": FL_RACEME, "color": Color(0.92, 0.88, 0.50), "count": 4, "size": 0.06 },
	},
	"tomato-cherokee": {
		"form": "nightshade",
		"height_scale": 1.2,
		"leaf": { "shape": LF_PINNATE, "color": Color(0.30, 0.52, 0.26), "count": 9, "size": 0.22 },
		"flower": { "pattern": FL_TIP, "color": Color(0.96, 0.86, 0.42), "count": 5, "size": 0.06 },
		"fruit": { "color": Color(0.44, 0.18, 0.28), "shape": "round", "count": 6, "size": 0.17 },
	},
	"pepper-bell": {
		"form": "nightshade",
		"height_scale": 0.8,
		"leaf": { "shape": LF_OVAL, "color": Color(0.28, 0.50, 0.26), "count": 8, "size": 0.20 },
		"flower": { "pattern": FL_TIP, "color": Color(0.96, 0.94, 0.90), "count": 4, "size": 0.06 },
		"fruit": { "color": Color(0.98, 0.78, 0.26), "shape": "bell", "count": 4, "size": 0.18 },
	},
	"onion-walla-walla": {
		"form": "bulb",
		"height_scale": 0.7,
		"leaf": { "shape": LF_GRASS, "color": Color(0.42, 0.66, 0.32), "count": 8, "size": 0.9 },
		"flower": { "pattern": FL_GLOBE, "color": Color(0.92, 0.90, 0.96), "count": 1, "size": 0.14 },
		"fruit": { "color": Color(0.96, 0.86, 0.58), "shape": "bulb", "count": 1, "size": 0.22 },
	},
	"garlic-hardneck": {
		"form": "bulb",
		"height_scale": 0.7,
		"leaf": { "shape": LF_GRASS, "color": Color(0.40, 0.60, 0.30), "count": 6, "size": 0.9 },
		"flower": { "pattern": FL_GLOBE, "color": Color(0.88, 0.88, 0.96), "count": 1, "size": 0.10 },
		"fruit": { "color": Color(0.96, 0.92, 0.84), "shape": "bulb", "count": 1, "size": 0.18 },
	},
	# ---- Niche / water / shade -------------------------------------
	"watercress": {
		"form": "aquatic",
		"height_scale": 0.3,
		"leaf": { "shape": LF_OVAL, "color": Color(0.42, 0.72, 0.36), "count": 9, "size": 0.14 },
		"flower": { "pattern": FL_TIP, "color": Color(0.96, 0.96, 0.94), "count": 4, "size": 0.04 },
	},
	"sword-fern": {
		"form": "fern",
		"height_scale": 0.9,
		"leaf": { "shape": LF_PINNATE, "color": Color(0.24, 0.46, 0.26), "count": 9, "size": 0.6 },
	},
}

var entity: Dictionary = {}
var state: String = "mature"
var category: String = "herbaceous"
var species_id: String = ""
var growth_form: String = "herb"
var cfg: Dictionary = {}

# Logical parts — any of these may be null for a given form.
var trunk: MeshInstance3D
var canopy: MeshInstance3D
var stem: MeshInstance3D
var leaves: Array[MeshInstance3D] = []
var fruits: Array[MeshInstance3D] = []
var flowers: Array[MeshInstance3D] = []
var ground_swatch: MeshInstance3D

# Original (unwilted) material colours so we can restore from dormant/dead.
var _original_colors: Dictionary = {}
# Cached base scale so animations can tween relative to state scale.
var _base_scale: Vector3 = Vector3.ONE


func setup(e: Dictionary, s: String, c: String) -> void:
	entity = e
	state = s
	category = c
	species_id = String(e.get("id", ""))
	cfg = _cfg_for(species_id, category)
	growth_form = String(cfg.get("form", "herb"))
	_build()
	GameLog.info("plant preview ready: %s (%s)" % [species_id, growth_form], "lab_plant")


## Config resolution ---------------------------------------------------

func _cfg_for(id: String, cat: String) -> Dictionary:
	var base: Dictionary = _default_cfg_for_category(cat)
	var entry: Dictionary = SPECIES_CFG.get(id, {})
	# Merge: entry overrides default; sub-dicts are shallow-merged.
	var result: Dictionary = base.duplicate(true)
	for k in entry.keys():
		var v: Variant = entry[k]
		if v is Dictionary and result.has(k) and result[k] is Dictionary:
			var combined: Dictionary = (result[k] as Dictionary).duplicate(true)
			for sk in (v as Dictionary).keys():
				combined[sk] = (v as Dictionary)[sk]
			result[k] = combined
		else:
			result[k] = v
	return result


func _default_cfg_for_category(cat: String) -> Dictionary:
	# Sensible fallbacks when a species has no SPECIES_CFG entry.
	var leaf_green: Color = Color(0.40, 0.62, 0.34)
	var bark: Color = Color(0.38, 0.26, 0.16)
	match cat:
		"pioneer":
			return {
				"form": "rosette", "height_scale": 0.5,
				"leaf": { "shape": LF_LANCE, "color": leaf_green, "count": 6, "size": 0.28 },
				"flower": { "pattern": FL_GLOBE, "color": Color(0.96, 0.88, 0.40), "count": 3, "size": 0.08 },
			}
		"groundcover":
			return {
				"form": "groundcover", "height_scale": 0.3,
				"leaf": { "shape": LF_PALM, "color": leaf_green, "count": 9, "size": 0.14 },
				"flower": { "pattern": FL_GLOBE, "color": Color(0.94, 0.92, 0.88), "count": 4, "size": 0.07 },
			}
		"herbaceous", "herb":
			return {
				"form": "herb", "height_scale": 0.9,
				"leaf": { "shape": LF_OVAL, "color": leaf_green, "count": 8, "size": 0.24 },
				"flower": { "pattern": FL_TIP, "color": Color(0.86, 0.72, 0.88), "count": 5, "size": 0.08 },
			}
		"grain":
			return {
				"form": "grass", "height_scale": 1.1,
				"leaf": { "shape": LF_GRASS, "color": Color(0.70, 0.78, 0.38), "count": 10, "size": 1.1 },
				"fruit": { "color": Color(0.92, 0.82, 0.38), "shape": "spike", "count": 10, "size": 0.05 },
			}
		"vine":
			return {
				"form": "vine", "height_scale": 1.0,
				"leaf": { "shape": LF_OVAL, "color": leaf_green, "count": 7, "size": 0.18 },
				"flower": { "pattern": FL_TIP, "color": Color(0.96, 0.92, 0.84), "count": 4, "size": 0.06 },
				"fruit": { "color": Color(0.82, 0.50, 0.28), "shape": "pod", "count": 4, "size": 0.15 },
			}
		"shrub":
			return {
				"form": "shrub", "height_scale": 1.0, "trunk": { "color": bark, "radius": 0.14 },
				"leaf": { "shape": LF_OVAL, "color": leaf_green, "count": 12, "size": 0.20 },
				"flower": { "pattern": FL_CLUSTER, "color": Color(0.98, 0.92, 0.88), "count": 6, "size": 0.08 },
				"fruit": { "color": Color(0.78, 0.20, 0.30), "shape": "berry", "count": 8, "size": 0.10 },
			}
		"shrub-tree":
			return {
				"form": "shrub-tree", "height_scale": 1.1, "trunk": { "color": bark, "radius": 0.16 },
				"leaf": { "shape": LF_OVAL, "color": leaf_green, "count": 10, "size": 0.8 },
				"flower": { "pattern": FL_CATKIN, "color": Color(0.82, 0.76, 0.42), "count": 6, "size": 0.12 },
				"fruit": { "color": Color(0.55, 0.38, 0.22), "shape": "nut", "count": 6, "size": 0.10 },
			}
		"small-tree":
			return {
				"form": "tree", "height_scale": 1.3, "trunk": { "color": bark, "radius": 0.25 },
				"leaf": { "shape": LF_OVAL, "color": leaf_green, "count": 4, "size": 1.2 },
				"flower": { "pattern": FL_CLUSTER, "color": Color(0.98, 0.88, 0.90), "count": 10, "size": 0.10 },
				"fruit": { "color": Color(0.86, 0.32, 0.24), "shape": "round", "count": 9, "size": 0.16 },
			}
		"large-tree":
			return {
				"form": "tree", "height_scale": 1.8, "trunk": { "color": bark, "radius": 0.40 },
				"leaf": { "shape": LF_OVAL, "color": leaf_green, "count": 5, "size": 1.9 },
				"flower": { "pattern": FL_CATKIN, "color": Color(0.82, 0.76, 0.40), "count": 6, "size": 0.14 },
				"fruit": { "color": Color(0.52, 0.38, 0.22), "shape": "nut", "count": 8, "size": 0.14 },
			}
		"nightshade":
			return {
				"form": "nightshade", "height_scale": 1.1,
				"leaf": { "shape": LF_PINNATE, "color": leaf_green, "count": 8, "size": 0.22 },
				"flower": { "pattern": FL_TIP, "color": Color(0.96, 0.88, 0.42), "count": 5, "size": 0.06 },
				"fruit": { "color": Color(0.80, 0.28, 0.26), "shape": "round", "count": 5, "size": 0.16 },
			}
		"cole":
			return {
				"form": "brassica-head", "height_scale": 0.5,
				"leaf": { "shape": LF_BROAD, "color": leaf_green, "count": 8, "size": 0.40 },
				"fruit": { "color": Color(0.58, 0.72, 0.40), "shape": "head", "count": 1, "size": 0.30 },
			}
		"leafy-green":
			return {
				"form": "rosette", "height_scale": 0.45,
				"leaf": { "shape": LF_BROAD, "color": Color(0.52, 0.72, 0.38), "count": 9, "size": 0.28 },
			}
		"root":
			return {
				"form": "root", "height_scale": 0.55,
				"leaf": { "shape": LF_PINNATE, "color": leaf_green, "count": 7, "size": 0.22 },
				"fruit": { "color": Color(0.82, 0.55, 0.22), "shape": "taproot", "count": 1, "size": 0.16 },
			}
		"allium":
			return {
				"form": "bulb", "height_scale": 0.7,
				"leaf": { "shape": LF_GRASS, "color": Color(0.44, 0.66, 0.32), "count": 7, "size": 0.9 },
				"flower": { "pattern": FL_GLOBE, "color": Color(0.90, 0.88, 0.96), "count": 1, "size": 0.12 },
				"fruit": { "color": Color(0.94, 0.88, 0.64), "shape": "bulb", "count": 1, "size": 0.18 },
			}
		"aquatic":
			return {
				"form": "aquatic", "height_scale": 0.3,
				"leaf": { "shape": LF_OVAL, "color": Color(0.42, 0.72, 0.36), "count": 8, "size": 0.16 },
				"flower": { "pattern": FL_TIP, "color": Color(0.96, 0.96, 0.94), "count": 3, "size": 0.05 },
			}
		"understory":
			return {
				"form": "fern", "height_scale": 0.9,
				"leaf": { "shape": LF_PINNATE, "color": Color(0.26, 0.48, 0.28), "count": 8, "size": 0.6 },
			}
		_:
			return {
				"form": "herb", "height_scale": 0.9,
				"leaf": { "shape": LF_OVAL, "color": leaf_green, "count": 7, "size": 0.22 },
			}


## Top-level build dispatch -------------------------------------------

func _build() -> void:
	# Tiny earth pad under the plant so it reads well on the lab ground.
	ground_swatch = _cube(Vector3(0, -0.05, 0), Vector3(2.5, 0.1, 2.5), Color(0.45, 0.35, 0.22))
	add_child(ground_swatch)
	match growth_form:
		"tree":
			_build_tree_form(cfg)
		"shrub":
			_build_shrub_form(cfg)
		"shrub-tree":
			_build_shrub_tree_form(cfg)
		"cane":
			_build_cane_form(cfg)
		"herb":
			_build_herb_form(cfg)
		"herb-shrub":
			_build_herb_shrub_form(cfg)
		"grass":
			_build_grass_form(cfg)
		"vine":
			_build_vine_form(cfg)
		"bulb":
			_build_bulb_form(cfg)
		"root":
			_build_root_form(cfg)
		"groundcover":
			_build_groundcover_form(cfg)
		"rosette":
			_build_rosette_form(cfg)
		"fern":
			_build_fern_form(cfg)
		"aquatic":
			_build_aquatic_form(cfg)
		"cover-legume":
			_build_cover_legume_form(cfg)
		"brassica-head":
			_build_brassica_head_form(cfg)
		"nightshade":
			_build_nightshade_form(cfg)
		_:
			_build_herb_form(cfg)
	_apply_state_overrides()


## Growth-form builders ------------------------------------------------

func _build_tree_form(c: Dictionary) -> void:
	var hscale: float = float(c.get("height_scale", 1.3))
	var trunk_cfg: Dictionary = c.get("trunk", { "color": Color(0.38, 0.26, 0.16), "radius": 0.25 })
	var leaf_cfg: Dictionary = c.get("leaf", {})
	var flower_cfg: Dictionary = c.get("flower", {})
	var fruit_cfg: Dictionary = c.get("fruit", {})

	var height: float = 3.2 * hscale
	var trunk_r: float = float(trunk_cfg.get("radius", 0.25))
	var trunk_color: Color = trunk_cfg.get("color", Color(0.38, 0.26, 0.16))
	trunk = _cylinder(Vector3(0, height * 0.5, 0), trunk_r * 0.75, trunk_r, height, trunk_color)
	add_child(trunk)

	# Canopy: foliage cluster whose leaf_shape drives geometry.
	var canopy_r: float = 1.5 * hscale
	var leaf_color: Color = leaf_cfg.get("color", Color(0.34, 0.55, 0.30))
	var leaf_shape: String = String(leaf_cfg.get("shape", LF_OVAL))
	var count: int = int(leaf_cfg.get("count", 4))
	canopy = _make_canopy_lobe(Vector3(0, height + canopy_r * 0.15, 0), canopy_r, leaf_color, leaf_shape)
	add_child(canopy)
	leaves.append(canopy)
	for i in range(count):
		var ang: float = float(i) * TAU / float(max(count, 1))
		var sub_pos: Vector3 = Vector3(cos(ang) * canopy_r * 0.65, height + canopy_r * 0.05, sin(ang) * canopy_r * 0.65)
		var sub: MeshInstance3D = _make_canopy_lobe(sub_pos, canopy_r * 0.55, leaf_color, leaf_shape)
		add_child(sub)
		leaves.append(sub)

	# Flowers hang at the canopy perimeter.
	if not flower_cfg.is_empty():
		_spawn_flowers_for_canopy(flower_cfg, height, canopy_r)
	# Fruits distributed around canopy.
	if not fruit_cfg.is_empty():
		_spawn_fruits_for_canopy(fruit_cfg, height, canopy_r)


func _build_shrub_tree_form(c: Dictionary) -> void:
	# Multi-stem shrub-tree (hazelnut). Shorter, narrower, looser canopy.
	var hscale: float = float(c.get("height_scale", 1.1))
	var trunk_cfg: Dictionary = c.get("trunk", { "color": Color(0.34, 0.22, 0.14), "radius": 0.14 })
	var leaf_cfg: Dictionary = c.get("leaf", {})
	var flower_cfg: Dictionary = c.get("flower", {})
	var fruit_cfg: Dictionary = c.get("fruit", {})
	var bark: Color = trunk_cfg.get("color", Color(0.34, 0.22, 0.14))
	var r: float = float(trunk_cfg.get("radius", 0.14))
	var height: float = 2.3 * hscale
	# Three coppiced stems leaning outward.
	for i in range(3):
		var ang: float = float(i) * TAU / 3.0 + 0.2
		var stem_pos: Vector3 = Vector3(cos(ang) * 0.15, height * 0.5, sin(ang) * 0.15)
		var s: MeshInstance3D = _cylinder(stem_pos, r * 0.6, r, height, bark)
		s.rotation.z = cos(ang) * 0.12
		s.rotation.x = sin(ang) * 0.12
		add_child(s)
		if i == 0:
			trunk = s
	var leaf_color: Color = leaf_cfg.get("color", Color(0.36, 0.56, 0.30))
	var leaf_shape: String = String(leaf_cfg.get("shape", LF_OVAL))
	var canopy_r: float = 1.1 * hscale
	for i in range(5):
		var ang: float = float(i) * TAU / 5.0
		var sub_pos: Vector3 = Vector3(cos(ang) * canopy_r * 0.5, height + canopy_r * 0.1, sin(ang) * canopy_r * 0.5)
		var sub: MeshInstance3D = _make_canopy_lobe(sub_pos, canopy_r * 0.6, leaf_color, leaf_shape)
		add_child(sub)
		leaves.append(sub)
	if not flower_cfg.is_empty():
		_spawn_flowers_for_canopy(flower_cfg, height, canopy_r)
	if not fruit_cfg.is_empty():
		_spawn_fruits_for_canopy(fruit_cfg, height, canopy_r)


func _build_shrub_form(c: Dictionary) -> void:
	var hscale: float = float(c.get("height_scale", 1.0))
	var trunk_cfg: Dictionary = c.get("trunk", { "color": Color(0.38, 0.26, 0.16), "radius": 0.14 })
	var leaf_cfg: Dictionary = c.get("leaf", {})
	var flower_cfg: Dictionary = c.get("flower", {})
	var fruit_cfg: Dictionary = c.get("fruit", {})

	var r: float = float(trunk_cfg.get("radius", 0.14))
	var height: float = 0.8 * hscale
	trunk = _cylinder(Vector3(0, height * 0.5, 0), r * 0.85, r, height, trunk_cfg.get("color", Color(0.38, 0.26, 0.16)))
	add_child(trunk)
	# Canopy: three overlapping lobes at shrub height.
	var leaf_color: Color = leaf_cfg.get("color", Color(0.35, 0.58, 0.34))
	var leaf_shape: String = String(leaf_cfg.get("shape", LF_OVAL))
	var canopy_r: float = 0.75 * hscale
	for i in range(3):
		var ang: float = float(i) * TAU / 3.0
		var lobe_pos: Vector3 = Vector3(cos(ang) * canopy_r * 0.4, height + canopy_r * 0.3 + 0.15 * float(i % 2), sin(ang) * canopy_r * 0.4)
		var lobe: MeshInstance3D = _make_canopy_lobe(lobe_pos, canopy_r * 0.85, leaf_color, leaf_shape)
		add_child(lobe)
		leaves.append(lobe)
	if not flower_cfg.is_empty():
		_spawn_flowers_for_canopy(flower_cfg, height + canopy_r * 0.25, canopy_r)
	if not fruit_cfg.is_empty():
		_spawn_fruits_for_canopy(fruit_cfg, height + canopy_r * 0.2, canopy_r)


func _build_cane_form(c: Dictionary) -> void:
	var hscale: float = float(c.get("height_scale", 1.0))
	var leaf_cfg: Dictionary = c.get("leaf", {})
	var flower_cfg: Dictionary = c.get("flower", {})
	var fruit_cfg: Dictionary = c.get("fruit", {})
	var cane_count: int = 5
	var cane_color: Color = Color(0.42, 0.52, 0.28)
	# Arching canes emerge from a tight base.
	var height: float = 1.4 * hscale
	for i in range(cane_count):
		var ang: float = float(i) * TAU / float(cane_count) + 0.2
		var pos: Vector3 = Vector3(cos(ang) * 0.08, height * 0.5, sin(ang) * 0.08)
		var cane: MeshInstance3D = _cylinder(pos, 0.035, 0.045, height, cane_color)
		cane.rotation.z = cos(ang) * 0.25
		cane.rotation.x = sin(ang) * 0.25
		add_child(cane)
		if i == 0:
			trunk = cane
	# Leaves distributed along canes.
	var leaf_color: Color = leaf_cfg.get("color", Color(0.38, 0.60, 0.34))
	var leaf_shape: String = String(leaf_cfg.get("shape", LF_PALM))
	var leaf_size: float = float(leaf_cfg.get("size", 0.22))
	var leaf_count: int = int(leaf_cfg.get("count", 12))
	for i in range(leaf_count):
		var h: float = 0.3 + (1.0 * hscale) * float(i) / float(max(leaf_count, 1))
		var ang: float = float(i) * 0.7
		var p: Vector3 = Vector3(cos(ang) * 0.45, h, sin(ang) * 0.45)
		var leaf: MeshInstance3D = _make_leaf(p, leaf_size, leaf_color, leaf_shape)
		add_child(leaf)
		leaves.append(leaf)
	# Flowers at cane tips.
	if not flower_cfg.is_empty():
		var fl_count: int = int(flower_cfg.get("count", 5))
		var fl_color: Color = flower_cfg.get("color", Color(0.95, 0.95, 0.92))
		var fl_size: float = float(flower_cfg.get("size", 0.08))
		for i in range(fl_count):
			var ang: float = float(i) * TAU / float(max(fl_count, 1))
			var p: Vector3 = Vector3(cos(ang) * 0.45, height + 0.15, sin(ang) * 0.45)
			var fl: MeshInstance3D = _sphere(p, fl_size, fl_color)
			add_child(fl)
			flowers.append(fl)
	# Fruits in small aggregate clusters at middle height.
	if not fruit_cfg.is_empty():
		var fc: Color = fruit_cfg.get("color", Color(0.82, 0.22, 0.30))
		var fcount: int = int(fruit_cfg.get("count", 8))
		var fsize: float = float(fruit_cfg.get("size", 0.10))
		var fshape: String = String(fruit_cfg.get("shape", "aggregate"))
		for i in range(fcount):
			var ang: float = float(i) * TAU / float(max(fcount, 1))
			var hh: float = 0.6 + 0.3 * sin(float(i) * 1.3)
			var p: Vector3 = Vector3(cos(ang) * 0.45, hh, sin(ang) * 0.45)
			var fr: MeshInstance3D = _make_fruit(p, fsize, fc, fshape)
			add_child(fr)
			fruits.append(fr)


func _build_herb_form(c: Dictionary) -> void:
	var hscale: float = float(c.get("height_scale", 0.9))
	var leaf_cfg: Dictionary = c.get("leaf", {})
	var flower_cfg: Dictionary = c.get("flower", {})
	var stem_color: Color = Color(0.44, 0.62, 0.32)
	var height: float = 1.3 * hscale
	stem = _cylinder(Vector3(0, height * 0.5, 0), 0.05, 0.08, height, stem_color)
	add_child(stem)
	var leaf_color: Color = leaf_cfg.get("color", Color(0.44, 0.64, 0.34))
	var leaf_shape: String = String(leaf_cfg.get("shape", LF_OVAL))
	var leaf_size: float = float(leaf_cfg.get("size", 0.24))
	var leaf_count: int = int(leaf_cfg.get("count", 8))
	for i in range(leaf_count):
		var frac: float = float(i) / float(max(leaf_count - 1, 1))
		var h: float = 0.15 + frac * (height - 0.15)
		var ang: float = float(i) * 1.25
		var p: Vector3 = Vector3(cos(ang) * 0.32, h, sin(ang) * 0.32)
		var leaf: MeshInstance3D = _make_leaf(p, leaf_size, leaf_color, leaf_shape)
		leaf.rotation.y = ang
		add_child(leaf)
		leaves.append(leaf)
	if not flower_cfg.is_empty():
		_spawn_flowers_at_top(flower_cfg, Vector3(0, height + 0.08, 0), 0.28)


func _build_herb_shrub_form(c: Dictionary) -> void:
	# Woody-base herb: rosemary, lavender. Dense needle cluster.
	var hscale: float = float(c.get("height_scale", 0.9))
	var leaf_cfg: Dictionary = c.get("leaf", {})
	var flower_cfg: Dictionary = c.get("flower", {})
	var height: float = 0.55 * hscale
	var woody_color: Color = Color(0.36, 0.28, 0.20)
	trunk = _cylinder(Vector3(0, height * 0.3, 0), 0.06, 0.09, height * 0.6, woody_color)
	add_child(trunk)
	var leaf_color: Color = leaf_cfg.get("color", Color(0.34, 0.48, 0.32))
	var leaf_shape: String = String(leaf_cfg.get("shape", LF_NEEDLE))
	var count: int = int(leaf_cfg.get("count", 14))
	var size: float = float(leaf_cfg.get("size", 0.10))
	for i in range(count):
		var ang: float = float(i) * 0.8
		var rr: float = 0.22 + 0.12 * sin(float(i) * 1.7)
		var h: float = height * 0.5 + 0.25 + 0.15 * cos(float(i) * 1.2)
		var p: Vector3 = Vector3(cos(ang) * rr, h, sin(ang) * rr)
		var leaf: MeshInstance3D = _make_leaf(p, size, leaf_color, leaf_shape)
		leaf.rotation.y = ang
		leaf.rotation.z = 0.6
		add_child(leaf)
		leaves.append(leaf)
	if not flower_cfg.is_empty():
		_spawn_flowers_at_top(flower_cfg, Vector3(0, height * 0.9 + 0.3, 0), 0.3)


func _build_grass_form(c: Dictionary) -> void:
	# Grass / grain: a dense stand of blades with optional seed heads.
	var hscale: float = float(c.get("height_scale", 1.1))
	var leaf_cfg: Dictionary = c.get("leaf", {})
	var flower_cfg: Dictionary = c.get("flower", {})
	var fruit_cfg: Dictionary = c.get("fruit", {})
	var blade_count: int = int(leaf_cfg.get("count", 10))
	var blade_color: Color = leaf_cfg.get("color", Color(0.60, 0.76, 0.36))
	var blade_h: float = 1.2 * hscale
	for i in range(blade_count):
		var ang: float = float(i) * TAU / float(max(blade_count, 1))
		var rr: float = 0.08 + 0.12 * float(i % 3)
		var p: Vector3 = Vector3(cos(ang) * rr, blade_h * 0.5, sin(ang) * rr)
		var blade: MeshInstance3D = _cube(p, Vector3(0.04, blade_h, 0.04), blade_color)
		blade.rotation.z = cos(ang) * 0.08
		blade.rotation.x = sin(ang) * 0.08
		add_child(blade)
		leaves.append(blade)
	# Corn tassel: giant dangling plume off a single-leader stalk.
	if not flower_cfg.is_empty() and String(flower_cfg.get("pattern", "")) == FL_TASSEL:
		var fl_color: Color = flower_cfg.get("color", Color(0.86, 0.76, 0.40))
		for i in range(7):
			var fl: MeshInstance3D = _cube(Vector3(0.06 * float(i - 3), blade_h + 0.3 + 0.05 * float(i), 0.0), Vector3(0.03, 0.5, 0.03), fl_color)
			fl.rotation.z = 0.2 * float(i - 3) * 0.3
			add_child(fl)
			flowers.append(fl)
	elif not flower_cfg.is_empty():
		_spawn_flowers_at_top(flower_cfg, Vector3(0, blade_h + 0.12, 0), 0.22)
	# Seed heads: a ring of narrow spikes at the top.
	if not fruit_cfg.is_empty():
		var fc: Color = fruit_cfg.get("color", Color(0.90, 0.82, 0.38))
		var fshape: String = String(fruit_cfg.get("shape", "spike"))
		var fcount: int = int(fruit_cfg.get("count", 10))
		for i in range(fcount):
			var ang: float = float(i) * TAU / float(max(fcount, 1))
			var rr: float = 0.10 + 0.15 * float(i % 3)
			var p: Vector3 = Vector3(cos(ang) * rr, blade_h + 0.15, sin(ang) * rr)
			var fr: MeshInstance3D = _make_fruit(p, 0.08, fc, fshape)
			add_child(fr)
			fruits.append(fr)


func _build_vine_form(c: Dictionary) -> void:
	var hscale: float = float(c.get("height_scale", 1.0))
	var leaf_cfg: Dictionary = c.get("leaf", {})
	var flower_cfg: Dictionary = c.get("flower", {})
	var fruit_cfg: Dictionary = c.get("fruit", {})
	var is_sprawling: bool = species_id == "winter-squash"
	if is_sprawling:
		# Sprawling ground vine with large leaves and gourds on ground.
		var runner: MeshInstance3D = _cylinder(Vector3(0, 0.12, 0), 0.05, 0.07, 1.6, Color(0.38, 0.52, 0.28))
		runner.rotation.z = PI * 0.5
		add_child(runner)
		stem = runner
		var leaf_count: int = int(leaf_cfg.get("count", 8))
		for i in range(leaf_count):
			var ang: float = float(i) * TAU / float(max(leaf_count, 1))
			var rr: float = 0.4 + 0.3 * float(i % 3)
			var p: Vector3 = Vector3(cos(ang) * rr, 0.22, sin(ang) * rr)
			var leaf: MeshInstance3D = _make_leaf(p, float(leaf_cfg.get("size", 0.4)), leaf_cfg.get("color", Color(0.36, 0.56, 0.28)), String(leaf_cfg.get("shape", LF_PALM)))
			add_child(leaf)
			leaves.append(leaf)
		if not flower_cfg.is_empty():
			_spawn_flowers_at_top(flower_cfg, Vector3(0, 0.3, 0), 0.6)
		if not fruit_cfg.is_empty():
			var fc: Color = fruit_cfg.get("color", Color(0.82, 0.58, 0.20))
			var fcount: int = int(fruit_cfg.get("count", 3))
			var fshape: String = String(fruit_cfg.get("shape", "gourd"))
			for i in range(fcount):
				var ang: float = float(i) * TAU / float(max(fcount, 1))
				var p: Vector3 = Vector3(cos(ang) * 0.6, 0.2, sin(ang) * 0.6)
				var fr: MeshInstance3D = _make_fruit(p, float(fruit_cfg.get("size", 0.28)), fc, fshape)
				add_child(fr)
				fruits.append(fr)
		return
	# Climbing vine: vertical stake + wrapping stem.
	var height: float = 2.0 * hscale
	var stake: MeshInstance3D = _cylinder(Vector3(0.0, height * 0.5, 0), 0.03, 0.03, height, Color(0.50, 0.36, 0.22))
	add_child(stake)
	stem = _cylinder(Vector3(0.05, height * 0.5, 0), 0.035, 0.045, height, Color(0.42, 0.58, 0.30))
	add_child(stem)
	var leaf_count: int = int(leaf_cfg.get("count", 9))
	var leaf_size: float = float(leaf_cfg.get("size", 0.2))
	var leaf_color: Color = leaf_cfg.get("color", Color(0.42, 0.66, 0.34))
	var leaf_shape: String = String(leaf_cfg.get("shape", LF_OVAL))
	for i in range(leaf_count):
		var frac: float = float(i) / float(max(leaf_count - 1, 1))
		var h: float = 0.25 + frac * (height - 0.3)
		var ang: float = frac * TAU * 1.6
		var p: Vector3 = Vector3(cos(ang) * 0.22, h, sin(ang) * 0.22)
		var leaf: MeshInstance3D = _make_leaf(p, leaf_size, leaf_color, leaf_shape)
		leaf.rotation.y = ang
		add_child(leaf)
		leaves.append(leaf)
	if not flower_cfg.is_empty():
		var fl_count: int = int(flower_cfg.get("count", 4))
		var fl_color: Color = flower_cfg.get("color", Color(0.95, 0.90, 0.86))
		var fl_size: float = float(flower_cfg.get("size", 0.06))
		for i in range(fl_count):
			var ang: float = float(i) * 1.3
			var h: float = 0.6 + 0.3 * float(i)
			var fl: MeshInstance3D = _sphere(Vector3(cos(ang) * 0.24, h, sin(ang) * 0.24), fl_size, fl_color)
			add_child(fl)
			flowers.append(fl)
	if not fruit_cfg.is_empty():
		var fc: Color = fruit_cfg.get("color", Color(0.70, 0.50, 0.28))
		var fshape: String = String(fruit_cfg.get("shape", "pod"))
		var fcount: int = int(fruit_cfg.get("count", 5))
		var fsize: float = float(fruit_cfg.get("size", 0.16))
		for i in range(fcount):
			var frac: float = float(i) / float(max(fcount - 1, 1))
			var h: float = 0.5 + frac * (height - 0.6)
			var ang: float = frac * TAU * 1.3
			var p: Vector3 = Vector3(cos(ang) * 0.22, h, sin(ang) * 0.22)
			var fr: MeshInstance3D = _make_fruit(p, fsize, fc, fshape)
			fr.rotation.y = ang
			add_child(fr)
			fruits.append(fr)


func _build_nightshade_form(c: Dictionary) -> void:
	# Tomato / pepper: staked, bushy with hanging fruit.
	var hscale: float = float(c.get("height_scale", 1.1))
	var leaf_cfg: Dictionary = c.get("leaf", {})
	var flower_cfg: Dictionary = c.get("flower", {})
	var fruit_cfg: Dictionary = c.get("fruit", {})
	var height: float = 1.3 * hscale
	stem = _cylinder(Vector3(0, height * 0.5, 0), 0.05, 0.08, height, Color(0.40, 0.54, 0.28))
	add_child(stem)
	# Stake
	add_child(_cylinder(Vector3(0.14, height * 0.55, 0), 0.03, 0.03, height + 0.4, Color(0.48, 0.32, 0.20)))
	var leaf_count: int = int(leaf_cfg.get("count", 8))
	var leaf_color: Color = leaf_cfg.get("color", Color(0.30, 0.52, 0.26))
	var leaf_shape: String = String(leaf_cfg.get("shape", LF_PINNATE))
	var leaf_size: float = float(leaf_cfg.get("size", 0.22))
	for i in range(leaf_count):
		var frac: float = float(i) / float(max(leaf_count - 1, 1))
		var h: float = 0.25 + frac * (height - 0.25)
		var ang: float = float(i) * 1.15
		var p: Vector3 = Vector3(cos(ang) * 0.28, h, sin(ang) * 0.28)
		var leaf: MeshInstance3D = _make_leaf(p, leaf_size, leaf_color, leaf_shape)
		leaf.rotation.y = ang
		add_child(leaf)
		leaves.append(leaf)
	if not flower_cfg.is_empty():
		var fl_count: int = int(flower_cfg.get("count", 5))
		var fl_color: Color = flower_cfg.get("color", Color(0.96, 0.86, 0.42))
		var fl_size: float = float(flower_cfg.get("size", 0.06))
		for i in range(fl_count):
			var ang: float = float(i) * 1.2
			var h: float = 0.5 + 0.2 * float(i)
			var fl: MeshInstance3D = _sphere(Vector3(cos(ang) * 0.26, h, sin(ang) * 0.26), fl_size, fl_color)
			add_child(fl)
			flowers.append(fl)
	if not fruit_cfg.is_empty():
		var fc: Color = fruit_cfg.get("color", Color(0.80, 0.28, 0.26))
		var fshape: String = String(fruit_cfg.get("shape", "round"))
		var fcount: int = int(fruit_cfg.get("count", 5))
		var fsize: float = float(fruit_cfg.get("size", 0.16))
		for i in range(fcount):
			var ang: float = float(i) * 1.6
			var h: float = 0.45 + 0.2 * float(i)
			var p: Vector3 = Vector3(cos(ang) * 0.22, h, sin(ang) * 0.22)
			var fr: MeshInstance3D = _make_fruit(p, fsize, fc, fshape)
			add_child(fr)
			fruits.append(fr)


func _build_bulb_form(c: Dictionary) -> void:
	var hscale: float = float(c.get("height_scale", 0.7))
	var leaf_cfg: Dictionary = c.get("leaf", {})
	var flower_cfg: Dictionary = c.get("flower", {})
	var fruit_cfg: Dictionary = c.get("fruit", {})
	# Bulb sits at ground level.
	var bulb_color: Color = fruit_cfg.get("color", Color(0.94, 0.86, 0.60))
	var bulb_size: float = float(fruit_cfg.get("size", 0.18))
	var bulb: MeshInstance3D = _sphere(Vector3(0, bulb_size * 0.75, 0), bulb_size, bulb_color)
	bulb.scale = Vector3(1.0, 0.8, 1.0)
	add_child(bulb)
	fruits.append(bulb)
	# Vertical spear leaves.
	var blade_count: int = int(leaf_cfg.get("count", 7))
	var blade_color: Color = leaf_cfg.get("color", Color(0.42, 0.66, 0.32))
	var blade_h: float = 0.95 * hscale
	for i in range(blade_count):
		var ang: float = float(i) * TAU / float(max(blade_count, 1))
		var rr: float = 0.04
		var p: Vector3 = Vector3(cos(ang) * rr, blade_h * 0.5 + 0.15, sin(ang) * rr)
		var blade: MeshInstance3D = _cube(p, Vector3(0.03, blade_h, 0.035), blade_color)
		blade.rotation.z = cos(ang) * 0.18
		blade.rotation.x = sin(ang) * 0.18
		add_child(blade)
		leaves.append(blade)
	# Flower: a single globe atop a scape (garlic scape curls).
	if not flower_cfg.is_empty():
		var scape: MeshInstance3D = _cylinder(Vector3(0, blade_h * 0.5 + 0.15 + 0.2, 0), 0.025, 0.03, 0.5, Color(0.46, 0.64, 0.30))
		add_child(scape)
		leaves.append(scape)
		var fl_color: Color = flower_cfg.get("color", Color(0.92, 0.88, 0.96))
		var fl_size: float = float(flower_cfg.get("size", 0.12))
		var fl: MeshInstance3D = _sphere(Vector3(0, blade_h + 0.55, 0), fl_size, fl_color)
		add_child(fl)
		flowers.append(fl)


func _build_root_form(c: Dictionary) -> void:
	var hscale: float = float(c.get("height_scale", 0.6))
	var leaf_cfg: Dictionary = c.get("leaf", {})
	var flower_cfg: Dictionary = c.get("flower", {})
	var fruit_cfg: Dictionary = c.get("fruit", {})
	# Above-ground leaf rosette.
	var leaf_count: int = int(leaf_cfg.get("count", 7))
	var leaf_color: Color = leaf_cfg.get("color", Color(0.36, 0.58, 0.28))
	var leaf_shape: String = String(leaf_cfg.get("shape", LF_PINNATE))
	var leaf_size: float = float(leaf_cfg.get("size", 0.22))
	var top_h: float = 0.7 * hscale
	for i in range(leaf_count):
		var ang: float = float(i) * TAU / float(max(leaf_count, 1))
		var p: Vector3 = Vector3(cos(ang) * 0.06, top_h * 0.5 + 0.08, sin(ang) * 0.06)
		var leaf: MeshInstance3D = _cube(p, Vector3(0.05, top_h, 0.05), leaf_color)
		leaf.rotation.z = cos(ang) * 0.18
		leaf.rotation.x = sin(ang) * 0.18
		add_child(leaf)
		leaves.append(leaf)
		# Leafy tip so pinnate reads.
		var tip: MeshInstance3D = _make_leaf(Vector3(cos(ang) * 0.14, top_h + 0.05, sin(ang) * 0.14), leaf_size, leaf_color, leaf_shape)
		tip.rotation.y = ang
		add_child(tip)
		leaves.append(tip)
	# Below-ground taproot sits in the ground pad cutaway.
	var tap_color: Color = fruit_cfg.get("color", Color(0.82, 0.55, 0.22))
	var tap_shape: String = String(fruit_cfg.get("shape", "taproot"))
	var tap_size: float = float(fruit_cfg.get("size", 0.18))
	var tap: MeshInstance3D = _make_fruit(Vector3(0, -tap_size * 0.6, 0), tap_size, tap_color, tap_shape)
	add_child(tap)
	fruits.append(tap)
	if not flower_cfg.is_empty():
		_spawn_flowers_at_top(flower_cfg, Vector3(0, top_h + 0.4, 0), 0.25)


func _build_groundcover_form(c: Dictionary) -> void:
	var hscale: float = float(c.get("height_scale", 0.3))
	var leaf_cfg: Dictionary = c.get("leaf", {})
	var flower_cfg: Dictionary = c.get("flower", {})
	var fruit_cfg: Dictionary = c.get("fruit", {})
	var leaf_count: int = int(leaf_cfg.get("count", 9))
	var leaf_color: Color = leaf_cfg.get("color", Color(0.40, 0.62, 0.32))
	var leaf_shape: String = String(leaf_cfg.get("shape", LF_PALM))
	var leaf_size: float = float(leaf_cfg.get("size", 0.15))
	var h: float = 0.15 * max(hscale, 0.2)
	for i in range(leaf_count):
		var ang: float = float(i) * TAU / float(max(leaf_count, 1))
		var rr: float = 0.3 + 0.1 * float(i % 3)
		var p: Vector3 = Vector3(cos(ang) * rr, h, sin(ang) * rr)
		var leaf: MeshInstance3D = _make_leaf(p, leaf_size, leaf_color, leaf_shape)
		leaf.rotation.y = ang
		add_child(leaf)
		leaves.append(leaf)
	if not flower_cfg.is_empty():
		var fl_count: int = int(flower_cfg.get("count", 4))
		var fl_color: Color = flower_cfg.get("color", Color(0.94, 0.94, 0.90))
		var fl_size: float = float(flower_cfg.get("size", 0.07))
		var pattern: String = String(flower_cfg.get("pattern", FL_GLOBE))
		for i in range(fl_count):
			var ang: float = float(i) * TAU / float(max(fl_count, 1))
			var p: Vector3 = Vector3(cos(ang) * 0.25, h + 0.12, sin(ang) * 0.25)
			if pattern == FL_RACEME:
				var spike: MeshInstance3D = _cube(p + Vector3(0, 0.08, 0), Vector3(fl_size * 0.8, fl_size * 3.0, fl_size * 0.8), fl_color)
				add_child(spike)
				flowers.append(spike)
			else:
				var fl: MeshInstance3D = _sphere(p, fl_size, fl_color)
				add_child(fl)
				flowers.append(fl)
	if not fruit_cfg.is_empty():
		var fc: Color = fruit_cfg.get("color", Color(0.90, 0.28, 0.28))
		var fshape: String = String(fruit_cfg.get("shape", "heart"))
		var fcount: int = int(fruit_cfg.get("count", 4))
		var fsize: float = float(fruit_cfg.get("size", 0.08))
		for i in range(fcount):
			var ang: float = float(i) * TAU / float(max(fcount, 1))
			var p: Vector3 = Vector3(cos(ang) * 0.24, h + 0.02, sin(ang) * 0.24)
			var fr: MeshInstance3D = _make_fruit(p, fsize, fc, fshape)
			add_child(fr)
			fruits.append(fr)


func _build_rosette_form(c: Dictionary) -> void:
	var hscale: float = float(c.get("height_scale", 0.4))
	var leaf_cfg: Dictionary = c.get("leaf", {})
	var flower_cfg: Dictionary = c.get("flower", {})
	var leaf_count: int = int(leaf_cfg.get("count", 7))
	var leaf_color: Color = leaf_cfg.get("color", Color(0.40, 0.60, 0.28))
	var leaf_shape: String = String(leaf_cfg.get("shape", LF_LANCE))
	var leaf_size: float = float(leaf_cfg.get("size", 0.32))
	var base_h: float = 0.2 * max(hscale, 0.3)
	for i in range(leaf_count):
		var ang: float = float(i) * TAU / float(max(leaf_count, 1))
		var rr: float = leaf_size * 0.9
		var p: Vector3 = Vector3(cos(ang) * rr, base_h, sin(ang) * rr)
		var leaf: MeshInstance3D = _make_leaf(p, leaf_size, leaf_color, leaf_shape)
		leaf.rotation.y = ang + PI * 0.5
		leaf.rotation.z = -0.12
		add_child(leaf)
		leaves.append(leaf)
	# A few inner leaves for density.
	for i in range(int(leaf_count / 2)):
		var ang: float = float(i) * TAU / float(max(leaf_count / 2, 1)) + 0.3
		var rr: float = leaf_size * 0.4
		var p: Vector3 = Vector3(cos(ang) * rr, base_h + 0.1, sin(ang) * rr)
		var inner: MeshInstance3D = _make_leaf(p, leaf_size * 0.7, leaf_color, leaf_shape)
		inner.rotation.y = ang + PI * 0.5
		inner.rotation.z = -0.25
		add_child(inner)
		leaves.append(inner)
	if not flower_cfg.is_empty():
		# Rosette flower scape rises from centre.
		var scape: MeshInstance3D = _cylinder(Vector3(0, 0.4 * hscale + 0.3, 0), 0.03, 0.04, 0.6 * hscale + 0.4, Color(0.50, 0.64, 0.30))
		add_child(scape)
		leaves.append(scape)
		_spawn_flowers_at_top(flower_cfg, Vector3(0, 0.6 * hscale + 0.8, 0), 0.18)


func _build_fern_form(c: Dictionary) -> void:
	var hscale: float = float(c.get("height_scale", 0.9))
	var leaf_cfg: Dictionary = c.get("leaf", {})
	var frond_count: int = int(leaf_cfg.get("count", 9))
	var frond_color: Color = leaf_cfg.get("color", Color(0.26, 0.48, 0.28))
	var frond_len: float = 1.1 * hscale
	for i in range(frond_count):
		var ang: float = float(i) * TAU / float(max(frond_count, 1))
		var rr: float = 0.42
		var base: Vector3 = Vector3(cos(ang) * rr, frond_len * 0.55, sin(ang) * rr)
		var frond: MeshInstance3D = _cube(base, Vector3(0.12, frond_len, 0.44), frond_color)
		frond.rotation.y = -ang + PI * 0.5
		frond.rotation.z = 0.25
		add_child(frond)
		leaves.append(frond)
		# Feathery pinnae as a narrow strip at the tip.
		var tip: MeshInstance3D = _cube(base + Vector3(cos(ang) * 0.1, 0.3, sin(ang) * 0.1), Vector3(0.08, 0.35, 0.28), frond_color)
		tip.rotation.y = -ang + PI * 0.5
		tip.rotation.z = 0.4
		add_child(tip)
		leaves.append(tip)


func _build_aquatic_form(c: Dictionary) -> void:
	# Water pad + floating leaves.
	add_child(_cube(Vector3(0, 0.0, 0), Vector3(3, 0.08, 3), Color(0.32, 0.55, 0.72)))
	var leaf_cfg: Dictionary = c.get("leaf", {})
	var leaf_count: int = int(leaf_cfg.get("count", 9))
	var leaf_color: Color = leaf_cfg.get("color", Color(0.42, 0.72, 0.36))
	var leaf_shape: String = String(leaf_cfg.get("shape", LF_OVAL))
	var leaf_size: float = float(leaf_cfg.get("size", 0.16))
	for i in range(leaf_count):
		var ang: float = float(i) * TAU / float(max(leaf_count, 1))
		var rr: float = 0.3 + 0.2 * float(i % 3)
		var p: Vector3 = Vector3(cos(ang) * rr, 0.14, sin(ang) * rr)
		var leaf: MeshInstance3D = _make_leaf(p, leaf_size, leaf_color, leaf_shape)
		leaf.rotation.y = ang
		add_child(leaf)
		leaves.append(leaf)
	var flower_cfg: Dictionary = c.get("flower", {})
	if not flower_cfg.is_empty():
		_spawn_flowers_at_top(flower_cfg, Vector3(0, 0.22, 0), 0.4)


func _build_cover_legume_form(c: Dictionary) -> void:
	# Sprawling twining legume (vetch): thin vines + pinnate leaves + purple racemes.
	var hscale: float = float(c.get("height_scale", 0.5))
	var leaf_cfg: Dictionary = c.get("leaf", {})
	var flower_cfg: Dictionary = c.get("flower", {})
	var h: float = 0.5 * hscale
	# Tangle of thin stems.
	for i in range(5):
		var ang: float = float(i) * TAU / 5.0
		var s: MeshInstance3D = _cylinder(Vector3(cos(ang) * 0.2, h * 0.5, sin(ang) * 0.2), 0.02, 0.025, h, Color(0.42, 0.58, 0.30))
		s.rotation.z = cos(ang) * 0.3
		s.rotation.x = sin(ang) * 0.3
		add_child(s)
	var leaf_count: int = int(leaf_cfg.get("count", 10))
	var leaf_color: Color = leaf_cfg.get("color", Color(0.38, 0.58, 0.28))
	for i in range(leaf_count):
		var ang: float = float(i) * TAU / float(max(leaf_count, 1))
		var rr: float = 0.2 + 0.15 * float(i % 2)
		var p: Vector3 = Vector3(cos(ang) * rr, h * 0.3 + 0.1 * float(i % 3), sin(ang) * rr)
		var leaf: MeshInstance3D = _make_leaf(p, float(leaf_cfg.get("size", 0.10)), leaf_color, LF_PINNATE)
		leaf.rotation.y = ang
		add_child(leaf)
		leaves.append(leaf)
	if not flower_cfg.is_empty():
		var fl_count: int = int(flower_cfg.get("count", 6))
		var fl_color: Color = flower_cfg.get("color", Color(0.52, 0.36, 0.72))
		var fl_size: float = float(flower_cfg.get("size", 0.05))
		for i in range(fl_count):
			var ang: float = float(i) * TAU / float(max(fl_count, 1))
			var p: Vector3 = Vector3(cos(ang) * 0.28, h + 0.2, sin(ang) * 0.28)
			var fl: MeshInstance3D = _cube(p, Vector3(fl_size, fl_size * 2.2, fl_size), fl_color)
			add_child(fl)
			flowers.append(fl)


func _build_brassica_head_form(c: Dictionary) -> void:
	# Cabbage: outer loose leaves + tight inner head sphere.
	var hscale: float = float(c.get("height_scale", 0.5))
	var leaf_cfg: Dictionary = c.get("leaf", {})
	var fruit_cfg: Dictionary = c.get("fruit", {})
	var leaf_count: int = int(leaf_cfg.get("count", 7))
	var leaf_color: Color = leaf_cfg.get("color", Color(0.46, 0.62, 0.36))
	var leaf_size: float = float(leaf_cfg.get("size", 0.44))
	var base_h: float = 0.25 * hscale
	for i in range(leaf_count):
		var ang: float = float(i) * TAU / float(max(leaf_count, 1))
		var rr: float = 0.42
		var p: Vector3 = Vector3(cos(ang) * rr, base_h, sin(ang) * rr)
		var leaf: MeshInstance3D = _make_leaf(p, leaf_size, leaf_color, LF_BROAD)
		leaf.rotation.y = ang + PI * 0.5
		leaf.rotation.z = -0.15
		add_child(leaf)
		leaves.append(leaf)
	var head_color: Color = fruit_cfg.get("color", Color(0.60, 0.72, 0.40))
	var head_size: float = float(fruit_cfg.get("size", 0.30))
	var head: MeshInstance3D = _sphere(Vector3(0, base_h + head_size * 0.8, 0), head_size, head_color)
	head.scale = Vector3(1.0, 0.9, 1.0)
	add_child(head)
	fruits.append(head)


## Leaf / flower / fruit shape helpers ---------------------------------

func _make_canopy_lobe(pos: Vector3, radius: float, color: Color, leaf_shape: String) -> MeshInstance3D:
	# Needle canopies compress vertically into a conical spire; palmate/oval stay spheroid.
	var m: SphereMesh = SphereMesh.new()
	m.radius = radius
	m.height = radius * 2.0
	var mi: MeshInstance3D = MeshInstance3D.new()
	mi.mesh = m
	mi.material_override = _cel_material(color)
	mi.position = pos
	match leaf_shape:
		LF_NEEDLE:
			mi.scale = Vector3(0.65, 1.6, 0.65)
		LF_PALM:
			mi.scale = Vector3(1.15, 0.75, 1.15)
		LF_PINNATE:
			mi.scale = Vector3(1.25, 0.6, 1.25)
		LF_LANCE:
			mi.scale = Vector3(0.85, 1.2, 0.85)
		_:
			mi.scale = Vector3(1.0, 0.9, 1.0)
	return mi


func _make_leaf(pos: Vector3, size: float, color: Color, shape: String) -> MeshInstance3D:
	match shape:
		LF_NEEDLE:
			var mi: MeshInstance3D = _cube(pos, Vector3(size * 0.15, size * 2.0, size * 0.15), color)
			return mi
		LF_GRASS:
			var mi2: MeshInstance3D = _cube(pos, Vector3(size * 0.06, size, size * 0.06), color)
			return mi2
		LF_PALM:
			var mi3: MeshInstance3D = _sphere(pos, size, color)
			mi3.scale = Vector3(1.2, 0.22, 1.2)
			return mi3
		LF_PINNATE:
			var mi4: MeshInstance3D = _cube(pos, Vector3(size * 0.4, size * 0.12, size * 1.4), color)
			return mi4
		LF_LANCE:
			var mi5: MeshInstance3D = _cube(pos, Vector3(size * 0.5, size * 0.18, size * 1.3), color)
			return mi5
		LF_BROAD:
			var mi6: MeshInstance3D = _sphere(pos, size, color)
			mi6.scale = Vector3(1.5, 0.2, 1.2)
			return mi6
		_:
			var mi7: MeshInstance3D = _sphere(pos, size, color)
			mi7.scale = Vector3(1.2, 0.3, 1.0)
			return mi7


func _make_fruit(pos: Vector3, size: float, color: Color, shape: String) -> MeshInstance3D:
	match shape:
		"round", "berry":
			return _sphere(pos, size, color)
		"oval":
			var mi: MeshInstance3D = _sphere(pos, size, color)
			mi.scale = Vector3(0.85, 1.25, 0.85)
			return mi
		"pear":
			var mi2: MeshInstance3D = _sphere(pos, size, color)
			mi2.scale = Vector3(0.9, 1.35, 0.9)
			return mi2
		"aggregate", "thimble":
			# Cluster of tiny drupelets.
			var cluster: MeshInstance3D = _sphere(pos, size, color)
			cluster.scale = Vector3(0.95, 1.0, 0.95)
			return cluster
		"pod":
			var mi3: MeshInstance3D = _cube(pos, Vector3(size * 0.35, size * 1.6, size * 0.35), color)
			return mi3
		"ear":
			var mi4: MeshInstance3D = _cylinder(pos, size * 0.55, size * 0.55, size * 2.0, color)
			return mi4
		"spike":
			var mi5: MeshInstance3D = _cube(pos, Vector3(size * 0.25, size * 2.0, size * 0.25), color)
			return mi5
		"panicle":
			var mi6: MeshInstance3D = _sphere(pos, size, color)
			mi6.scale = Vector3(0.7, 1.6, 0.7)
			return mi6
		"seed":
			return _sphere(pos, size, color)
		"gourd":
			var mi7: MeshInstance3D = _sphere(pos, size, color)
			mi7.scale = Vector3(1.0, 0.75, 1.4)
			return mi7
		"nut":
			var mi8: MeshInstance3D = _sphere(pos, size, color)
			mi8.scale = Vector3(1.0, 1.1, 1.0)
			return mi8
		"burr":
			# Spiky nut husk — approximated as a fluffier sphere.
			var mi9: MeshInstance3D = _sphere(pos, size, color)
			mi9.scale = Vector3(1.15, 1.0, 1.15)
			return mi9
		"taproot":
			var mi10: MeshInstance3D = _cylinder(pos, size * 0.35, size * 0.75, size * 2.2, color)
			mi10.rotation.x = PI
			return mi10
		"globe-root":
			var mi11: MeshInstance3D = _sphere(pos, size, color)
			mi11.scale = Vector3(1.05, 1.0, 1.05)
			return mi11
		"bulb":
			var mi12: MeshInstance3D = _sphere(pos, size, color)
			mi12.scale = Vector3(1.0, 0.85, 1.0)
			return mi12
		"head":
			var mi13: MeshInstance3D = _sphere(pos, size, color)
			mi13.scale = Vector3(1.0, 0.9, 1.0)
			return mi13
		"heart":
			var mi14: MeshInstance3D = _sphere(pos, size, color)
			mi14.scale = Vector3(1.0, 1.15, 0.9)
			return mi14
		"bell":
			var mi15: MeshInstance3D = _sphere(pos, size, color)
			mi15.scale = Vector3(1.0, 1.3, 1.0)
			return mi15
		_:
			return _sphere(pos, size, color)


func _spawn_flowers_for_canopy(flower_cfg: Dictionary, height: float, canopy_r: float) -> void:
	var pattern: String = String(flower_cfg.get("pattern", FL_CLUSTER))
	var fl_count: int = int(flower_cfg.get("count", 8))
	var fl_color: Color = flower_cfg.get("color", Color(0.98, 0.88, 0.92))
	var fl_size: float = float(flower_cfg.get("size", 0.10))
	if pattern == FL_CATKIN:
		for i in range(fl_count):
			var ang: float = float(i) * TAU / float(max(fl_count, 1))
			var r: float = canopy_r * 0.85
			var p: Vector3 = Vector3(cos(ang) * r, height + 0.05, sin(ang) * r)
			var catkin: MeshInstance3D = _cube(p, Vector3(fl_size * 0.4, fl_size * 3.2, fl_size * 0.4), fl_color)
			add_child(catkin)
			flowers.append(catkin)
	else:
		for i in range(fl_count):
			var ang: float = float(i) * TAU / float(max(fl_count, 1))
			var r: float = canopy_r * 0.85
			var p: Vector3 = Vector3(cos(ang) * r, height + canopy_r * 0.05, sin(ang) * r)
			var fl: MeshInstance3D = _sphere(p, fl_size, fl_color)
			add_child(fl)
			flowers.append(fl)


func _spawn_fruits_for_canopy(fruit_cfg: Dictionary, height: float, canopy_r: float) -> void:
	var fc: Color = fruit_cfg.get("color", Color(0.82, 0.30, 0.22))
	var fshape: String = String(fruit_cfg.get("shape", "round"))
	var fcount: int = int(fruit_cfg.get("count", 6))
	var fsize: float = float(fruit_cfg.get("size", 0.17))
	for i in range(fcount):
		var ang: float = float(i) * TAU / float(max(fcount, 1))
		var r: float = canopy_r * 0.8
		var p: Vector3 = Vector3(cos(ang) * r, height - canopy_r * 0.05, sin(ang) * r)
		var fr: MeshInstance3D = _make_fruit(p, fsize, fc, fshape)
		add_child(fr)
		fruits.append(fr)


func _spawn_flowers_at_top(flower_cfg: Dictionary, top: Vector3, spread: float) -> void:
	var pattern: String = String(flower_cfg.get("pattern", FL_TIP))
	var fl_count: int = int(flower_cfg.get("count", 5))
	var fl_color: Color = flower_cfg.get("color", Color(0.90, 0.75, 0.92))
	var fl_size: float = float(flower_cfg.get("size", 0.08))
	match pattern:
		FL_UMBEL:
			# Flat umbrella disc.
			var disc: MeshInstance3D = _sphere(top, fl_size, fl_color)
			disc.scale = Vector3(1.8, 0.25, 1.8)
			add_child(disc)
			flowers.append(disc)
			for i in range(fl_count):
				var ang: float = float(i) * TAU / float(max(fl_count, 1))
				var p: Vector3 = top + Vector3(cos(ang) * spread * 0.8, 0.0, sin(ang) * spread * 0.8)
				var fl: MeshInstance3D = _sphere(p, fl_size * 0.6, fl_color)
				add_child(fl)
				flowers.append(fl)
		FL_RACEME:
			# Vertical spike of small flowers.
			for i in range(fl_count):
				var frac: float = float(i) / float(max(fl_count - 1, 1))
				var p: Vector3 = top + Vector3(0.0, frac * spread * 1.2, 0.0)
				var fl: MeshInstance3D = _cube(p, Vector3(fl_size * 1.3, fl_size * 1.1, fl_size * 1.3), fl_color)
				add_child(fl)
				flowers.append(fl)
		FL_GLOBE:
			var globe: MeshInstance3D = _sphere(top, fl_size * 1.6, fl_color)
			add_child(globe)
			flowers.append(globe)
			# Little spikelets for dandelion texture.
			for i in range(fl_count):
				var ang: float = float(i) * TAU / float(max(fl_count, 1))
				var p: Vector3 = top + Vector3(cos(ang) * fl_size * 1.4, fl_size * 0.6, sin(ang) * fl_size * 1.4)
				var fl: MeshInstance3D = _sphere(p, fl_size * 0.5, fl_color)
				add_child(fl)
				flowers.append(fl)
		FL_CLUSTER:
			for i in range(fl_count):
				var ang: float = float(i) * TAU / float(max(fl_count, 1))
				var p: Vector3 = top + Vector3(cos(ang) * spread * 0.5, 0.0, sin(ang) * spread * 0.5)
				var fl: MeshInstance3D = _sphere(p, fl_size, fl_color)
				add_child(fl)
				flowers.append(fl)
		FL_BELL:
			# Pendant bells dangling downward.
			for i in range(fl_count):
				var ang: float = float(i) * TAU / float(max(fl_count, 1))
				var p: Vector3 = top + Vector3(cos(ang) * spread * 0.6, -fl_size * 1.2, sin(ang) * spread * 0.6)
				var bell: MeshInstance3D = _sphere(p, fl_size, fl_color)
				bell.scale = Vector3(1.0, 1.3, 1.0)
				add_child(bell)
				flowers.append(bell)
		_:
			# Default: tip-of-stem small cluster.
			for i in range(fl_count):
				var ang: float = float(i) * TAU / float(max(fl_count, 1))
				var p: Vector3 = top + Vector3(cos(ang) * spread * 0.4, sin(float(i) * 1.3) * 0.04, sin(ang) * spread * 0.4)
				var fl: MeshInstance3D = _sphere(p, fl_size, fl_color)
				add_child(fl)
				flowers.append(fl)


## State overrides ------------------------------------------------------

func _apply_state_overrides() -> void:
	var base: float = 1.0
	var leaf_scale: float = 1.0
	var show_fruits: bool = false
	var show_flowers: bool = false
	var leaf_tint: Color = Color(1, 1, 1)
	var harvest_ready: bool = false
	match state:
		"seed":
			base = 0.15
			leaf_scale = 0.15
		"seedling", "sprout":
			base = 0.3
			leaf_scale = 0.4
		"sapling", "juvenile":
			base = 0.55
			leaf_scale = 0.7
		"young":
			base = 0.8
			leaf_scale = 0.9
		"mature":
			base = 1.0
			leaf_scale = 1.0
		"flowering":
			base = 1.0
			leaf_scale = 1.0
			show_flowers = true
		"fruiting":
			base = 1.0
			leaf_scale = 1.0
			show_fruits = true
			harvest_ready = true
		"budding":
			base = 0.95
			leaf_scale = 0.35
			show_flowers = true
		"catkin":
			base = 1.0
			leaf_scale = 0.7
			show_flowers = true
		"leaf-fall":
			base = 1.0
			leaf_scale = 0.7
			leaf_tint = Color(1.1, 0.8, 0.5)
		"bare", "dormant":
			base = 1.0
			leaf_scale = 0.0
		"heading", "bolting", "tasseling", "scaping":
			base = 1.0
			leaf_scale = 1.0
			show_flowers = true
		"bulbing":
			base = 1.0
			leaf_scale = 0.85
			show_fruits = true
			harvest_ready = true
		"chopped-stump":
			base = 0.25
			leaf_scale = 0.0
		"regrowth":
			base = 0.55
			leaf_scale = 0.5
			leaf_tint = Color(1.2, 1.2, 0.9)
		"dead":
			base = 0.95
			leaf_scale = 0.0
			leaf_tint = Color(0.55, 0.5, 0.4)
		"hilling":
			base = 0.85
			leaf_scale = 0.8
		_:
			pass
	# Evergreen conifers and some needle herbs keep their leaves through dormancy.
	var needle_leaf: bool = String(cfg.get("leaf", {}).get("shape", "")) == LF_NEEDLE
	if state in ["bare", "dormant", "leaf-fall"] and needle_leaf:
		leaf_scale = max(leaf_scale, 0.95)
	scale = Vector3.ONE * base
	_base_scale = scale
	for leaf in leaves:
		leaf.visible = leaf_scale > 0.01
		leaf.scale = Vector3.ONE * leaf_scale
	for fr in fruits:
		# Taproot / bulb / head fruits stay visible — they are the plant itself.
		if fr == _primary_body_fruit():
			fr.visible = true
		else:
			fr.visible = show_fruits
		# Emissive ripe glow.
		if show_fruits and harvest_ready:
			_set_emission(fr, fr.material_override, 0.32)
		else:
			_set_emission(fr, fr.material_override, 0.0)
	for fl in flowers:
		fl.visible = show_flowers
	# Leaf seasonal tinting.
	for leaf in leaves:
		_tint_material(leaf.material_override, leaf_tint)
	# Trunk darkens when dead.
	if trunk:
		var bark_tint: Color = Color(1, 1, 1)
		if state == "dead":
			bark_tint = Color(0.6, 0.5, 0.4)
		elif state == "leaf-fall":
			bark_tint = Color(1.0, 0.9, 0.75)
		_tint_material(trunk.material_override, bark_tint)


func _primary_body_fruit() -> MeshInstance3D:
	# For root/bulb/head forms the 'fruit' is the plant's body — always visible.
	if fruits.is_empty():
		return null
	if growth_form in ["root", "bulb", "brassica-head"]:
		return fruits[0]
	return null


## Animations -----------------------------------------------------------

func animate(anim: String, t: float, _dt: float) -> void:
	if anim == null or anim == "" or anim == "—":
		return
	match anim:
		"breathing":
			var pulse: float = 1.0 + 0.02 * sin(t * 2.0)
			scale = _base_scale * pulse
		"sway":
			rotation.z = sin(t * 1.5) * 0.05
			rotation.x = cos(t * 0.9) * 0.03
		"harvest":
			for fr in fruits:
				fr.position.y = fr.position.y + sin(t * 8.0) * 0.003
			scale = _base_scale * (1.0 + 0.03 * sin(t * 6.0))
		"chop":
			rotation.x = sin(t * 4.0) * 0.15
		"leaf-fall":
			for i in range(leaves.size()):
				var leaf: MeshInstance3D = leaves[i]
				leaf.rotation.z = sin(t * 1.5 + float(i)) * 0.3
		"flower-burst":
			for fl in flowers:
				fl.visible = true
				fl.scale = Vector3.ONE * (0.8 + 0.2 * sin(t * 4.0))
		"regrow":
			var phase: float = fmod(t * 0.4, 1.0)
			scale = _base_scale * (0.3 + 0.7 * phase)
		"coppice":
			rotation.x = sin(t * 3.0) * 0.1
			scale = _base_scale * (0.9 + 0.05 * sin(t * 3.0))
		"death":
			rotation.x = min(1.3, t * 0.3)
			scale = _base_scale * max(0.5, 1.0 - t * 0.05)
		_:
			scale = _base_scale


## Material helpers -----------------------------------------------------

func _cel_material(color: Color) -> ShaderMaterial:
	var mat: ShaderMaterial = ShaderMaterial.new()
	var sh: Shader = load(TOON_SHADER_PATH)
	if sh:
		mat.shader = sh
		mat.set_shader_parameter("albedo_color", Vector4(color.r, color.g, color.b, color.a))
		mat.set_shader_parameter("shadow_darkness", 0.35)
		mat.set_shader_parameter("rim_strength", 0.15)
	return mat


func _tint_material(mat: Material, tint: Color) -> void:
	if mat == null:
		return
	var sm: ShaderMaterial = mat as ShaderMaterial
	if sm == null:
		return
	# Remember the original colour once so we can restore.
	var key: int = sm.get_instance_id()
	var orig: Color
	if _original_colors.has(key):
		orig = _original_colors[key]
	else:
		var cur: Variant = sm.get_shader_parameter("albedo_color")
		if cur is Vector4:
			orig = Color((cur as Vector4).x, (cur as Vector4).y, (cur as Vector4).z, 1.0)
		else:
			orig = Color(1, 1, 1)
		_original_colors[key] = orig
	var tinted: Color = Color(orig.r * tint.r, orig.g * tint.g, orig.b * tint.b, 1.0)
	sm.set_shader_parameter("albedo_color", Vector4(tinted.r, tinted.g, tinted.b, 1.0))


func _set_emission(_mi: MeshInstance3D, mat: Material, energy: float) -> void:
	var sm: ShaderMaterial = mat as ShaderMaterial
	if sm == null:
		return
	# Use rim_strength as a poor-man's glow since toon.gdshader may not have
	# a dedicated emission channel — this reads as a harvest-ready halo.
	if energy > 0.01:
		sm.set_shader_parameter("rim_strength", 0.15 + energy)
	else:
		sm.set_shader_parameter("rim_strength", 0.15)


## Low-level mesh helpers ----------------------------------------------

func _cube(pos: Vector3, size: Vector3, color: Color) -> MeshInstance3D:
	var m: BoxMesh = BoxMesh.new()
	m.size = size
	var mi: MeshInstance3D = MeshInstance3D.new()
	mi.mesh = m
	mi.material_override = _cel_material(color)
	mi.position = pos
	return mi


func _sphere(pos: Vector3, radius: float, color: Color) -> MeshInstance3D:
	var m: SphereMesh = SphereMesh.new()
	m.radius = radius
	m.height = radius * 2.0
	var mi: MeshInstance3D = MeshInstance3D.new()
	mi.mesh = m
	mi.material_override = _cel_material(color)
	mi.position = pos
	return mi


func _cylinder(pos: Vector3, radius_top: float, radius_bot: float, height: float, color: Color) -> MeshInstance3D:
	var m: CylinderMesh = CylinderMesh.new()
	m.top_radius = radius_top
	m.bottom_radius = radius_bot
	m.height = height
	var mi: MeshInstance3D = MeshInstance3D.new()
	mi.mesh = m
	mi.material_override = _cel_material(color)
	mi.position = pos
	return mi
