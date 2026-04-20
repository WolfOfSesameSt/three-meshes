## Fairy Permaculture — generic Interactable attachment.
##
## Extendable component for any scene node that wants the player to
## right-click and pick a delegated task. Each interactable object
## implements either of:
##   - `get_context_actions() -> Array[Dictionary]`   — canonical path
##   - plus `complete(action: Dictionary)`             — fired when the
##     TaskQueue finishes the work + the fairy deposits
##
## Action schema (a plain Dictionary so JSON export is trivial):
##   id                   — stable action id ("harvest_all", "fell", ...)
##   label                — UI label
##   base_labor_seconds   — solo-fairy work time (size-scaled)
##   cost                 — { resource: amount }  (debited at PICKUP stage
##                          when pickup_from is set, otherwise at queue
##                          time; blocks the action if unmet)
##   yield                — { resource: amount }  (deposited on complete
##                          AFTER the drop-off beat, if drop_off_at set)
##   required_role        — "" or role id ("composter" etc.)
##   drop_off_at          — "" (in-place deposit, no travel)
##                        | "storage_shed"
##                        | "soil_plot"
##                        | "compost_pile"
##   pickup_from          — "" (no pickup — cost is debited at queue-time)
##                        | "storage_shed" (fairy visits nearest shed
##                          FIRST, loads a basket tinted to the cost
##                          resource, then travels to target)
##   max_workers          — int, >=1. Multi-fairy stacking cap.
##   disabled             — bool, UI hint (cost unmet / role-locked)
##   priority             — int, 10 player-order, 5 ambient, 20 emergency
extends RefCounted
class_name Interactable


## Canonical drop-off targets.
const DROP_NONE: String          = ""
const DROP_STORAGE: String       = "storage_shed"
const DROP_SOIL_PLOT: String     = "soil_plot"
const DROP_COMPOST_PILE: String  = "compost_pile"

## Canonical pickup sources.
const PICKUP_NONE: String        = ""
const PICKUP_STORAGE: String     = "storage_shed"

## Resource kinds that live in storage sheds — if a cost contains any
## of these AND the action has no drop-off target, the pickup-first
## flow auto-engages so the fairy visually hauls the ingredient to the
## target. Fairy-food (honey/milk) and biomass-legacy stay at-queue-time.
##
## Note: "greens" / "browns" are intentionally NOT in this list anymore —
## the taxonomy refactor replaced them with the specific items they
## used to aggregate (plant_trim, fruit_scraps, dry_leaves, twigs, wood,
## wood_chips). See RESOURCE_CATEGORY / RESOURCE_CN_RATIO below.
const MATERIAL_RESOURCES: Array[String] = [
	"plant_trim", "fruit_scraps", "dry_leaves",
	"wood", "stone", "seeds", "fruit", "compost", "twigs", "wood_chips", "water",
	# Animal-system additions (phase 1). These live in storage sheds and
	# route through the pickup flow when a structure lists them as a cost
	# (Kiln consuming bones, Butcher Station future feather trim, etc.).
	"meat", "bones", "bone_meal", "blood", "blood_meal",
	"hide", "feathers", "down", "lard", "biochar",
	# Day-0 forage additions (Day-0 Activities Engineer).
	# wild_berries: green compost input + fairy food supplement.
	# wild_mushrooms: rare foraged neutral food.
	# imo: indigenous microorganism inoculant for piles (+biology boost).
	"wild_berries", "wild_mushrooms", "imo",
]


## Category tag per resource type — "green" (wet N-rich), "brown" (dry
## C-rich), or "neutral". The HUD groups inventory rows by this value so
## players see per-group totals for C:N balance at a glance without
## opening the pile panel. `fruit` is "green" for compost-math purposes
## (when the player dumps rotten fruit into a pile it's functionally a
## high-moisture green) even though the primary role is player/fairy food.
const RESOURCE_CATEGORY: Dictionary = {
	"wood":         "brown",
	"twigs":        "brown",
	"wood_chips":   "brown",
	"dry_leaves":   "brown",
	"plant_trim":   "green",
	"fruit_scraps": "green",
	"fruit":        "green",
	"compost":      "neutral",
	"seeds":        "neutral",
	"stone":        "neutral",
	"water":        "neutral",
	# Animal-system outputs.
	# Feathers read as "brown" for compost-math purposes — they're a slow
	# N release, but their high keratin C content pushes them toward the
	# browns bucket in the HUD grouping (same rule-of-thumb as dry leaves).
	"feathers":     "brown",
	"down":         "brown",
	# Meat, bones, hide, lard are neutral — not compost inputs. Meat
	# routes to dogs + trade; bones + blood get fired into amendments.
	"meat":         "neutral",
	"bones":        "neutral",
	"hide":         "neutral",
	"blood":        "neutral",
	"lard":         "neutral",
	# Finished amendments — neutral (they're outputs of the Kiln, not
	# inputs to the pile) but they feed soil_plot directly. The soil
	# engine agent will wire per-nutrient routing; for now "amendment"
	# behaviour is expressed via the RESOURCE_AMENDMENT dict below.
	"bone_meal":    "neutral",
	"blood_meal":   "neutral",
	"biochar":      "neutral",
	# Day-0 forage additions.
	# Wild berries behave like the "fruit" compost input — juicy green, C:N
	# in the 25-35 band. Mushrooms + IMO are neutrals (food / inoculant).
	"wild_berries":   "green",
	"wild_mushrooms": "neutral",
	"imo":            "neutral",
}


## Amendment tag — resources that feed a soil_plot directly once the
## soil-engine agent wires per-nutrient channels. For phase 1 we just
## keep the metadata so a later agent can read it without another
## taxonomy migration. Values are the *primary* nutrient they supply.
##   bone_meal  → P  (15–30 % phosphorus)
##   blood_meal → N  (8–12 % nitrogen, fast-release)
##   feathers   → N  (slow-release N mulch, also reads as brown compost)
##   biochar    → C  (structure + water retention, permanent)
const RESOURCE_AMENDMENT: Dictionary = {
	"bone_meal":  "P",
	"blood_meal": "N",
	"feathers":   "N",
	"biochar":    "C",
}


## Real-world-ish C:N ratio per resource type. Used by the compost pile
## math + tooltips. Numbers mirror the values in scripts/pile.gd's
## INGREDIENTS table; this dict is the *resource-space* view so any
## system that only has a FarmTotals key can look up the ratio.
const RESOURCE_CN_RATIO: Dictionary = {
	"wood":         350.0,
	"twigs":        200.0,
	"wood_chips":   400.0,
	"dry_leaves":   60.0,
	"plant_trim":   20.0,
	"fruit_scraps": 35.0,
	"fruit":        25.0,
	# Animal outputs that are legitimate compost inputs: feathers are
	# ~100:1 (keratin slows N release, reads brown). Down is similar but
	# fluffier so air-space is higher — listed the same for now.
	"feathers":     100.0,
	"down":         100.0,
	# Neutrals get 0.0 — not a valid C:N input. Callers should skip.
	"compost":      0.0,
	"seeds":        0.0,
	"stone":        0.0,
	"water":        0.0,
	"meat":         0.0,
	"bones":        0.0,
	"hide":         0.0,
	"blood":        0.0,
	"lard":         0.0,
	"bone_meal":    0.0,
	"blood_meal":   0.0,
	"biochar":      0.0,
	# Day-0 forage additions. Wild berries sit at ~30 (between fruit + fruit
	# scraps — slightly higher C than lab-grown fruit). Mushrooms + IMO are
	# not compost feedstock on their own (IMO is an INOCULANT added via a
	# pile's ingredient list, not dumped as bulk).
	"wild_berries":   30.0,
	"wild_mushrooms": 0.0,
	"imo":            0.0,
}


## Category tag lookup for a FarmTotals resource key. Defaults to
## "neutral" for unknown kinds so callers don't crash on typos.
static func category_for(kind: String) -> String:
	return String(RESOURCE_CATEGORY.get(kind, "neutral"))


## C:N ratio lookup for a FarmTotals resource key. Returns 0.0 for
## non-compost-input neutrals; callers should test for > 0 before
## treating it as a real ratio.
static func cn_ratio_for(kind: String) -> float:
	return float(RESOURCE_CN_RATIO.get(kind, 0.0))


## Build one action row. Optional fields default to sensible no-ops.
## Pickup-from auto-lights when the cost lists a material resource AND
## no drop-off is set (avoids double-carrying complexity — we don't
## chain pickup + deposit in the same task yet).
static func make_action(
	id: String,
	label: String,
	base_labor_seconds: float,
	cost: Dictionary = {},
	yield_preview: Dictionary = {},
	role_required: String = "",
	drop_off_at: String = DROP_NONE,
	max_workers: int = 2,
	pickup_from: String = PICKUP_NONE,
) -> Dictionary:
	var resolved_pickup: String = pickup_from
	if resolved_pickup == PICKUP_NONE \
			and drop_off_at == DROP_NONE \
			and _cost_has_material_resource(cost):
		resolved_pickup = PICKUP_STORAGE
	return {
		"id": id,
		"label": label,
		"base_labor_seconds": base_labor_seconds,
		"cost": cost,
		"yield": yield_preview,
		"role_required": role_required,
		"drop_off_at": drop_off_at,
		"pickup_from": resolved_pickup,
		"max_workers": max_workers,
	}


## Returns true iff the cost dict has at least one material-resource
## entry with a positive amount. Fairy-food costs (honey/milk) and
## the legacy "biomass" key don't trigger the pickup flow.
static func _cost_has_material_resource(cost: Dictionary) -> bool:
	if cost == null or cost.is_empty():
		return false
	for k in cost.keys():
		var key: String = String(k)
		if not MATERIAL_RESOURCES.has(key):
			continue
		if float(cost[k]) > 0.0:
			return true
	return false


## Returns the first material-resource kind named in the cost (in
## MATERIAL_RESOURCES order for determinism). "" if none. Used by the
## TaskQueue to pick which shed to pull from + to tint the basket.
static func pickup_kind_for_cost(cost: Dictionary) -> String:
	if cost == null or cost.is_empty():
		return ""
	for kind in MATERIAL_RESOURCES:
		if cost.has(kind) and float(cost[kind]) > 0.0:
			return kind
	return ""


## Amount of the pickup resource needed. Matches pickup_kind_for_cost.
static func pickup_amount_for_cost(cost: Dictionary) -> float:
	var kind: String = pickup_kind_for_cost(cost)
	if kind == "":
		return 0.0
	return float(cost.get(kind, 0.0))


## Pickup-flow awareness: does this action send the fairy to a shed
## BEFORE the target work? TaskQueue + HUD consult this.
static func requires_pickup(action: Dictionary) -> bool:
	return String(action.get("pickup_from", "")) != ""


## Basket tint for a PICKUP load. Shares the palette mapping used for
## the yield basket so green items always read meadow, brown items read
## earth, etc. Wood chips read as a warm chipper-tan (EARTH lerped toward
## HONEY) so they're visually distinct from the darker wood/twig baskets.
static func pickup_basket_color_for(action: Dictionary) -> Color:
	var cost: Dictionary = action.get("cost", {})
	var kind: String = pickup_kind_for_cost(cost)
	match kind:
		"fruit", "fruit_scraps":
			# Fruit basket — berry coral. Fruit-scraps gets the same tint
			# so a "load rotten fruit → pile" trip reads as fruit-colored.
			return Palette.CORAL
		"seeds":
			return Palette.CORAL
		"plant_trim":
			return Palette.MEADOW
		"dry_leaves":
			# Autumn-leaf basket — EARTH lerped toward HONEY so it reads
			# as warm dry-litter, distinct from the darker wood/twig haul.
			return Palette.EARTH.lerp(Palette.HONEY, 0.25)
		"wood", "twigs":
			return Palette.EARTH
		"stone":
			return Palette.WARM_STONE
		"compost":
			return Palette.COMPOST
		"wood_chips":
			return Palette.EARTH.lerp(Palette.HONEY, 0.40)
		"water":
			# Sky-pastel lerped 20% toward mist — a cool, readable water
			# basket that still sits inside the Ghibli-lite palette.
			return Palette.SKY.lerp(Palette.MIST, 0.20)
		# ---- Animal-system baskets ----
		# Meat + blood read CORAL-toward-EARTH so they stay warm but
		# clearly distinct from fresh fruit coral.
		"meat":
			return Palette.CORAL.lerp(Palette.EARTH, 0.35)
		"blood":
			return Palette.CORAL.darkened(0.20)
		# Bones + bone_meal read as bleached WARM_STONE (bone meal lighter).
		"bones":
			return Palette.WARM_STONE
		"bone_meal":
			return Palette.WARM_STONE.lerp(Palette.PARCHMENT, 0.40)
		"blood_meal":
			return Palette.CORAL.lerp(Palette.COMPOST, 0.35)
		"hide":
			return Palette.EARTH.lerp(Palette.WARM_STONE, 0.30)
		"feathers", "down":
			# Soft straw-gold — matches the buff layer body color.
			return Palette.STRAW_DRY
		"lard":
			return Palette.MOON
		"biochar":
			return Palette.INK.lerp(Palette.COMPOST, 0.35)
		# Day-0 forage baskets.
		"wild_berries":
			# Forest berry — BERRY purple toward CORAL so it's distinct from
			# orchard fruit (pure CORAL).
			return Palette.BERRY.lerp(Palette.CORAL, 0.35)
		"wild_mushrooms":
			# Earthy mushroom — PARCHMENT lerped toward WARM_STONE.
			return Palette.PARCHMENT.lerp(Palette.WARM_STONE, 0.45)
		"imo":
			# Duff-inoculant — COMPOST lerped toward MEADOW (forest-floor life).
			return Palette.COMPOST.lerp(Palette.MEADOW, 0.30)
		_:
			return Palette.WARM_STONE


## Quick helper: does this action produce anything that should be
## carried back to a shed?
static func yields_storage_goods(action: Dictionary) -> bool:
	return String(action.get("drop_off_at", "")) == DROP_STORAGE


## Sum the numeric yield amounts — used to tint the carrying basket.
static func yield_total(action: Dictionary) -> float:
	var y: Dictionary = action.get("yield", {})
	var s: float = 0.0
	for k in y.keys():
		s += float(y[k])
	return s


## Best-fit color tag for the basket carried back to storage. Warm
## plant_trim + fruit lean meadow; woody items earth; stone warm-stone.
static func basket_color_for(action: Dictionary) -> Color:
	var y: Dictionary = action.get("yield", {})
	# Prefer the dominant yield type.
	var dominant: String = ""
	var best: float = -1.0
	for k in y.keys():
		var amt: float = float(y[k])
		if amt > best:
			best = amt
			dominant = String(k)
	match dominant:
		"fruit", "fruit_scraps":
			return Palette.CORAL
		"seeds":
			return Palette.CORAL
		"plant_trim":
			return Palette.MEADOW
		"dry_leaves":
			return Palette.EARTH.lerp(Palette.HONEY, 0.25)
		"wood", "twigs":
			return Palette.EARTH
		"stone":
			return Palette.WARM_STONE
		"wood_chips":
			return Palette.EARTH.lerp(Palette.HONEY, 0.40)
		"water":
			# Matches pickup basket: SKY lerped 20% toward MIST so the
			# draw-water trip reads as water from source → storage.
			return Palette.SKY.lerp(Palette.MIST, 0.20)
		# Animal-system yield baskets (same tinting as pickup side).
		"meat":
			return Palette.CORAL.lerp(Palette.EARTH, 0.35)
		"blood":
			return Palette.CORAL.darkened(0.20)
		"bones":
			return Palette.WARM_STONE
		"bone_meal":
			return Palette.WARM_STONE.lerp(Palette.PARCHMENT, 0.40)
		"blood_meal":
			return Palette.CORAL.lerp(Palette.COMPOST, 0.35)
		"hide":
			return Palette.EARTH.lerp(Palette.WARM_STONE, 0.30)
		"feathers", "down":
			return Palette.STRAW_DRY
		"lard":
			return Palette.MOON
		"biochar":
			return Palette.INK.lerp(Palette.COMPOST, 0.35)
		# Day-0 forage yield baskets — match pickup-side tinting so a
		# forage trip reads identically whether the fairy is collecting or
		# depositing.
		"wild_berries":
			return Palette.BERRY.lerp(Palette.CORAL, 0.35)
		"wild_mushrooms":
			return Palette.PARCHMENT.lerp(Palette.WARM_STONE, 0.45)
		"imo":
			return Palette.COMPOST.lerp(Palette.MEADOW, 0.30)
		_:
			return Palette.WARM_STONE
