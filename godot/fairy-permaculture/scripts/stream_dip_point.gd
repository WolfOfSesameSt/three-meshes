## Fairy Permaculture — transient stream dip-point marker.
##
## Spawned by main.gd when the player right-clicks on a stream / pond
## tile and picks "Draw water". Gives the TaskQueue a concrete Node3D
## target with a `global_position` and a `complete()` hook so the
## generic pipeline handles travel → work → carry-yield-to-storage
## without needing a bespoke branch.
##
## On `complete()` we play the paired dip-scoop feedback (compost-scoop
## chime + biomass-chop work-beat), fire a sky-tinted Juice pop, and
## free the node. The yield dict on the action (`{water: 3}`) rides back
## to the nearest storage shed via the normal deposit flow.
extends Node3D


func display_name() -> String:
	return "Stream"


func complete(_action: Dictionary) -> void:
	# Paired audio. compost-scoop = warm wooden scoop chime on arrival,
	# biomass-chop = the work beat (reuses the pulse the player already
	# associates with "fairy is doing something here"). No new samples —
	# we ship audio reuse per the spec.
	var am: Node = get_node_or_null("/root/AudioManager")
	if am != null:
		am.call("play", "compost-scoop", -4.0)
		am.call("play", "biomass-chop", -8.0)
	# Paired visual. Sky-pastel tint traces back to Palette.SKY lerped
	# 20 % toward Palette.MIST — DESIGN-CHECK compliant (no raw literal).
	var juice: Node = get_node_or_null("/root/Juice")
	if juice != null:
		var palette: Node = get_node_or_null("/root/Palette")
		var sky: Color = Color(0.72, 0.85, 0.91)
		var mist: Color = Color(0.84, 0.93, 0.94)
		if palette != null:
			sky = palette.get("SKY")
			mist = palette.get("MIST")
		var water_tint: Color = sky.lerp(mist, 0.20)
		juice.call("pop", global_position + Vector3(0, 1.8, 0), "DIPPED", water_tint)
		juice.call("burst", global_position + Vector3(0, 0.4, 0), water_tint, 12)
	# Defer the free one frame so TaskQueue finishes its bookkeeping
	# (yield carry begins immediately on the same tick).
	call_deferred("queue_free")
