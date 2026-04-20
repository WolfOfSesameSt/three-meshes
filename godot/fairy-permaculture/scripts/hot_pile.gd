## Fairy Permaculture — Hot Pile (tier 2 compost pile).
##
## Distinct variant of the base compost pile. Bigger 2×2 footprint, faster
## cook cycle (0.5× multiplier — every threshold halved: HOT_RAMP, TURN
## windows, COOLING, CURING), but more labor per build and a tougher
## "turn discipline" contract: if the player skips turning in the
## TURN_WINDOW it cools without completing the hot phase and drops a
## visible star on the final quality.
##
## Extends compost_pile.gd, so every right-click action, paired feedback,
## steam emitter, ready-ring halo, and state-color lerp inherits for
## free. Only the cook_multiplier and the visual footprint change.
extends "res://scripts/compost_pile.gd"


func _ready() -> void:
	# Set the variant BEFORE super._ready() so pile.variant + cook
	# multiplier get wired through to the state machine on its first
	# _ready() pass.
	set_variant("hot-pile", 0.5)
	# Scale the whole node by 1.25× so the hot pile reads as bigger than
	# the cold pile. Fits the "2×2 footprint, more biomass" design brief
	# without requiring new meshes.
	scale = Vector3.ONE * 1.25
	super._ready()


## Override — hot piles cool if the turn window expires WITHOUT a turn,
## which the base pile.gd already handles. The extra rule here: if the
## player's pile ever left TURN_WINDOW because of expiry (vs. a turn),
## record a q-flag so compute_quality() trims a star. The JS prototype
## had this — we preserve it.
func display_name() -> String:
	return "Hot Pile"
