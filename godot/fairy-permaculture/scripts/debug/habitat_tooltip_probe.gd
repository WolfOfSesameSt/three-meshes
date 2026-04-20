## Ad-hoc sim harness for HabitatTooltipData. Not wired anywhere —
## invoke via: godot --headless -s res://scripts/debug/habitat_tooltip_probe.gd
extends SceneTree

const HabitatTooltipDataClass = preload("res://scripts/habitat_tooltip_data.gd")


func _init() -> void:
	# Wait a frame so autoloads finish their _ready.
	await process_frame
	var tags: Array = ["owl-box", "rock-pile", "brush-pile",
		"mason-bee-tubes", "duck-pond-edge"]
	for tag in tags:
		var payload: Dictionary = HabitatTooltipDataClass.build(tag)
		print("---- %s ----" % tag)
		print("  display_name: %s" % payload["display_name"])
		print("  attracted:")
		for entry in payload["attracted"]:
			var flag: String = "PRESENT" if entry["present"] else "absent"
			var tier: String = "req" if entry["required"] else "pref"
			print("    [%s][%s] %s (role=%s)" %
				[flag, tier, entry["name"], entry["role"]])
		print("  drains: %s" % str(payload["drains"]))
	# Force-arrive a species and re-probe owl-box.
	print("\n---- Forcing barn-owl arrival ----")
	var wl: Node = root.get_node_or_null("/root/Wildlife")
	if wl != null:
		var ok: bool = wl.call("debug_force_arrival", "barn-owl", Vector3.ZERO)
		print("  debug_force_arrival returned: %s" % ok)
		var payload2: Dictionary = HabitatTooltipDataClass.build("owl-box")
		print("  owl-box post-arrival:")
		for entry in payload2["attracted"]:
			var flag: String = "PRESENT" if entry["present"] else "absent"
			print("    [%s] %s" % [flag, entry["name"]])
		print("  drains: %s" % str(payload2["drains"]))
	quit()
