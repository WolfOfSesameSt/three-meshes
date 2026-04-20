## Fairy Permaculture — Butcher Station.
##
## A simple outdoor station: wooden block + hook post. When a Carcass
## sits within 10 tiles, the carcass's right-click menu surfaces a
## "Butcher <species>" action. The TaskQueue pipeline treats the
## carcass as the target — once the labor timer elapses, carcass.butcher()
## fires, species yields flow to storage via the carcass's
## `drop_off_at = storage_shed` on that action.
##
## Locked design refs:
##   • Unlocks as soon as the first carcass spawns (Progression.mark_
##     first_carcass fires the Ring 3.1 unlock).
##   • Meat is NOT fairy food (locked) — yields route to FarmTotals.meat
##     + bones + feathers only.
##
## Visual: wooden block base + vertical hook post. EARTH + WARM_STONE.
extends StaticBody3D


signal clicked(station: Node3D)
signal hover_changed(station: Node3D, hovered: bool)


@onready var _block: MeshInstance3D = $Block
@onready var _post: MeshInstance3D = $Post
@onready var _hook: MeshInstance3D = $Hook

var _block_mat: StandardMaterial3D
var _post_mat: StandardMaterial3D
var _hook_mat: StandardMaterial3D
var _in_construction: bool = false
var _t: float = 0.0


func _ready() -> void:
	input_ray_pickable = true
	add_to_group("butcher_stations")
	_block_mat = StandardMaterial3D.new()
	_block_mat.albedo_color = Palette.EARTH
	_block.material_override = _block_mat
	_post_mat = StandardMaterial3D.new()
	_post_mat.albedo_color = Palette.EARTH.lerp(Palette.COMPOST, 0.35)
	_post.material_override = _post_mat
	_hook_mat = StandardMaterial3D.new()
	_hook_mat.albedo_color = Palette.WARM_STONE
	_hook_mat.metallic = 0.4
	_hook_mat.roughness = 0.5
	_hook.material_override = _hook_mat
	mouse_entered.connect(_on_hover.bind(true))
	mouse_exited.connect(_on_hover.bind(false))
	input_event.connect(_on_click)


func _on_hover(on: bool) -> void:
	for m in [_block_mat, _post_mat, _hook_mat]:
		if m == null: continue
		m.rim_enabled = on
		m.rim = 0.9 if on else 0.0
		m.rim_tint = 0.75
		m.emission_enabled = on
		m.emission = Palette.HONEY
		m.emission_energy_multiplier = 0.3 if on else 0.0
	emit_signal("hover_changed", self, on)


func _on_click(_cam: Node, _event: InputEvent, _pos: Vector3, _norm: Vector3, _shape: int) -> void:
	emit_signal("clicked", self)


func _process(delta: float) -> void:
	_t += delta
	if _in_construction:
		return
	# Idle: tiny hook sway so the station doesn't feel dead.
	if _hook != null:
		_hook.rotation.z = sin(_t * 1.2) * 0.06


func start_construction(duration_s: float) -> void:
	_in_construction = true
	scale = Vector3.ONE * 0.1
	for m in [_block_mat, _post_mat, _hook_mat]:
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		m.albedo_color.a = 0.35
	var tw: Tween = create_tween()
	tw.tween_property(self, "scale", Vector3.ONE, duration_s) \
		.set_trans(Tween.TRANS_SINE)
	tw.tween_callback(_on_construction_complete)


func _on_construction_complete() -> void:
	_in_construction = false
	for m in [_block_mat, _post_mat, _hook_mat]:
		m.transparency = BaseMaterial3D.TRANSPARENCY_DISABLED
		m.albedo_color.a = 1.0
	if get_node_or_null("/root/Juice") != null:
		Juice.burst(global_position + Vector3(0, 1.2, 0), Palette.EARTH, 18)
		Juice.pop(global_position + Vector3(0, 1.8, 0), "BUTCHER READY", Palette.HONEY)
	if get_node_or_null("/root/AudioManager") != null:
		AudioManager.play("compost-scoop", -4.0)


# =============================================================
# Universal right-click contract
# =============================================================

func get_context_actions() -> Array:
	var out: Array = []
	# Always show an inspect row so the player knows what the station
	# does before a carcass is present.
	out.append(Interactable.make_action(
		"inspect_butcher", "Butcher Station — right-click a carcass to use", 0.0,
		{}, {}, "", Interactable.DROP_NONE, 1,
	))
	# List carcasses within range so players can queue from here too.
	var carcasses: Array = get_tree().get_nodes_in_group("carcasses")
	for c in carcasses:
		if c == null or not is_instance_valid(c):
			continue
		var d: float = global_position.distance_squared_to((c as Node3D).global_position)
		if d > 10.0 * 10.0:
			continue
		var yields_dict: Variant = c.get("carcass_yields")
		var sp_display: Variant = c.get("species_display_name")
		if yields_dict == null:
			continue
		var ydict: Dictionary = yields_dict
		var ysummary: String = _summary(ydict)
		var action: Dictionary = Interactable.make_action(
			"butcher_target", "Butcher %s (%s)" % [String(sp_display), ysummary], 15.0,
			{}, ydict.duplicate(),
			"", Interactable.DROP_STORAGE, 2,
		)
		action["carcass_id"] = c.get_instance_id()
		out.append(action)
	return out


func display_name() -> String:
	return "Butcher Station"


## TaskQueue complete() hook. For butcher_target we look the carcass up
## by instance_id and call butcher() — it returns the yield dict the
## TaskQueue deposits during the drop-off beat.
func complete(action: Dictionary) -> void:
	var id: String = String(action.get("id", ""))
	if id != "butcher_target":
		return
	var cid: int = int(action.get("carcass_id", 0))
	if cid <= 0:
		return
	var carcass: Node = instance_from_id(cid)
	if carcass == null or not is_instance_valid(carcass):
		return
	if carcass.has_method("butcher"):
		carcass.call("butcher")


func _summary(y: Dictionary) -> String:
	var parts: Array[String] = []
	for k in y.keys():
		parts.append("+%d %s" % [int(y[k]), String(k)])
	return " ".join(parts)
