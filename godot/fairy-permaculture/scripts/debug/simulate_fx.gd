## Fairy Permaculture — FX gallery screenshot tool.
##
## Spawns all 7 environmental FX subscenes in a horizontal row inside a
## SubViewport, waits for particles to settle, then saves
##   res://logs/shots/fx-gallery.png
##
## The screenshot is the ground truth for QA (tech art polish agent).
## Per feedback_qa_gate_mandatory.md, QA must visually confirm that:
##   • sparkles are visible (honey dots)
##   • compost steam is visible (parchment wisps)
##   • kiln plume is visible (warm flicker)
##   • rain streaks are visible (angled lines)
##   • wind-leaves are visible (scattered colored dots)
##   • pollinators are visible (dot swarm)
##   • pond ripple is visible (circle ring on blue stand-in)
##
## Usage:
##   godot --path . scenes/debug/simulate_fx.tscn
extends Node3D

const SHOTS_DIR := "res://logs/shots"
const OUT_NAME := "fx-gallery"
const SETTLE_FRAMES := 120  # ~2 seconds @ 60fps for particles to fill

@onready var _viewport: SubViewport = $Sub
@onready var _stage: Node3D = $Sub/Stage
@onready var _camera: Camera3D = $Sub/Stage/Rig/Camera

var _countdown: int = SETTLE_FRAMES
var _captured: bool = false

# FX column positions along +X. Each column is a station labelled by its
# palette-tinted stand-in floor tile so QA can tell which fx is which
# even if the fx itself fails to render.
const STATION_SPACING: float = 4.2
const STATIONS := [
	"fairy_sparkle",
	"compost_steam",
	"kiln_plume",
	"rain_streaks",
	"wind_leaves",
	"pollinators",
	"pond_ripple",
]


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(SHOTS_DIR))
	_setup_camera()
	_build_stations()


func _setup_camera() -> void:
	# Orthographic side-elevated view — gives each station a clean box
	# to verify rendering without mutual occlusion. Camera looks at the
	# center of the station row and frames the row tightly so each FX
	# reads across a wide 1792×512 capture.
	var row_center_x: float = (STATIONS.size() - 1) * STATION_SPACING * 0.5
	var pitch: float = deg_to_rad(18.0)
	var dist: float = 10.0
	_camera.global_position = Vector3(row_center_x, sin(pitch) * dist + 1.8, cos(pitch) * dist)
	_camera.look_at(Vector3(row_center_x, 1.6, 0.0), Vector3.UP)
	_camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	# Ortho size in Godot = vertical world extent. For our wide 1792×512
	# viewport (aspect 3.5), height 10 gives ~35 world units horizontally
	# which fits the 7-station row span (7 × 4.2 ≈ 29.4) with margin and
	# leaves vertical headroom for labels above + FX plumes above that.
	_camera.size = 10.0
	_camera.near = 0.1
	_camera.far = 100.0


func _build_stations() -> void:
	for i in range(STATIONS.size()):
		var key: String = STATIONS[i]
		var x: float = float(i) * STATION_SPACING
		# Alternate Y offset per station so text labels don't overlap
		# horizontally in the final capture.
		var label_y: float = 4.0 if (i % 2 == 0) else 5.0
		_build_station(key, Vector3(x, 0, 0), label_y)


func _build_station(key: String, origin: Vector3, label_y: float = 4.0) -> void:
	# Each station gets a small palette-floor tile so the fx has a
	# visible stand-in even when the particle effect is faint.
	var floor_tile: MeshInstance3D = _make_floor(key)
	floor_tile.position = origin
	_stage.add_child(floor_tile)

	# Label sprite (3D) pops the key name. Alternating y_offset spreads
	# overlapping text across two rows so each station is readable even
	# though the overall row is packed tight.
	var lbl: Label3D = Label3D.new()
	lbl.text = key
	lbl.position = origin + Vector3(0, label_y, 0)
	lbl.font_size = 56
	lbl.pixel_size = 0.008
	lbl.modulate = Palette.INK
	lbl.outline_size = 14
	lbl.outline_modulate = Palette.PARCHMENT
	lbl.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	_stage.add_child(lbl)

	# Spawn the FX.
	match key:
		"fairy_sparkle":
			var scene: PackedScene = load("res://scenes/fx/fairy_sparkle.tscn")
			if scene != null:
				var fx: Node3D = scene.instantiate() as Node3D
				fx.position = origin + Vector3(0, 1.0, 0)
				_stage.add_child(fx)
		"compost_steam":
			var scene: PackedScene = load("res://scenes/fx/compost_steam.tscn")
			if scene != null:
				var fx: Node3D = scene.instantiate() as Node3D
				fx.position = origin + Vector3(0, 0.2, 0)
				_stage.add_child(fx)
		"kiln_plume":
			var scene: PackedScene = load("res://scenes/fx/kiln_plume.tscn")
			if scene != null:
				var fx: Node3D = scene.instantiate() as Node3D
				fx.position = origin + Vector3(0, 0.2, 0)
				_stage.add_child(fx)
		"rain_streaks":
			# The real rain_streaks scene follows the active camera so it
			# fills the whole viewport. For the gallery shot we need the
			# emitter pinned to this column — we spawn a local proxy
			# with identical visuals instead so each station can stay in
			# its assigned cell.
			var proxy: GPUParticles3D = _make_rain_proxy()
			proxy.position = origin + Vector3(0, 5.0, 0)
			_stage.add_child(proxy)
		"wind_leaves":
			var scene: PackedScene = load("res://scenes/fx/wind_leaves.tscn")
			if scene != null:
				var fx: Node3D = scene.instantiate() as Node3D
				fx.position = origin + Vector3(-1.5, 2.5, 0)
				_stage.add_child(fx)
				# Force autumn so it's at peak density for the shot.
				if fx.has_method("set_season"):
					fx.call_deferred("set_season", "autumn", 1.0)
		"pollinators":
			var scene: PackedScene = load("res://scenes/fx/pollinators.tscn")
			if scene != null:
				var fx: Node3D = scene.instantiate() as Node3D
				fx.position = origin + Vector3(0, 1.2, 0)
				_stage.add_child(fx)
		"pond_ripple":
			# Ripple is one-shot, so we respawn a new one every few
			# frames to keep something visible for the screenshot.
			var water_tile: MeshInstance3D = _make_water_tile()
			water_tile.position = origin + Vector3(0, 0.02, 0)
			_stage.add_child(water_tile)
			_respawn_ripple(origin + Vector3(0, 0.06, 0))


func _make_floor(key: String) -> MeshInstance3D:
	var mesh: BoxMesh = BoxMesh.new()
	mesh.size = Vector3(STATION_SPACING * 0.8, 0.15, STATION_SPACING * 0.8)
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	# Rotate through palette floor tints so stations are distinguishable.
	var floor_colors := {
		"fairy_sparkle":  Palette.MEADOW,
		"compost_steam":  Palette.COMPOST.lightened(0.25),
		"kiln_plume":     Palette.WARM_STONE,
		"rain_streaks":   Palette.SAGE,
		"wind_leaves":    Palette.STRAW_DRY,
		"pollinators":    Palette.HONEY.lightened(0.2),
		"pond_ripple":    Palette.SKY,
	}
	mat.albedo_color = floor_colors.get(key, Palette.MEADOW)
	var mi: MeshInstance3D = MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	return mi


func _make_water_tile() -> MeshInstance3D:
	var mesh: BoxMesh = BoxMesh.new()
	mesh.size = Vector3(STATION_SPACING * 0.9, 0.05, STATION_SPACING * 0.9)
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	# SKY-blue surface so the white ripple reads clearly.
	mat.albedo_color = Palette.SKY.lerp(Palette.MIST, 0.5)
	var mi: MeshInstance3D = MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	return mi


## Rain-streaks gallery proxy — we can't let the full scene's
## `_process()` move itself to the camera position (would exit the
## column). So we ship an inline emitter with the same visuals pinned
## to the column's position.
func _make_rain_proxy() -> GPUParticles3D:
	var p: GPUParticles3D = GPUParticles3D.new()
	p.amount = 80
	p.lifetime = 0.6
	p.one_shot = false
	p.emitting = true
	p.randomness = 0.8
	p.local_coords = false
	p.visibility_aabb = AABB(Vector3(-4, -5, -4), Vector3(8, 10, 8))
	var mesh: QuadMesh = QuadMesh.new()
	mesh.size = Vector2(0.03, 0.45)
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_MIX
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	mat.albedo_color = Color(Palette.MIST.r, Palette.MIST.g, Palette.MIST.b, 0.7)
	mesh.material = mat
	p.draw_pass_1 = mesh
	var pm: ParticleProcessMaterial = ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = Vector3(1.3, 0.1, 1.3)
	pm.direction = Vector3(-0.3, -1.0, 0.2)
	pm.spread = 3.0
	pm.initial_velocity_min = 8.0
	pm.initial_velocity_max = 11.0
	pm.gravity = Vector3(0, -6.0, 0)
	pm.scale_min = 0.8
	pm.scale_max = 1.4
	var grad: Gradient = Gradient.new()
	grad.set_color(0, Color(Palette.MIST.r, Palette.MIST.g, Palette.MIST.b, 0.0))
	grad.add_point(0.1, Color(Palette.MIST.r, Palette.MIST.g, Palette.MIST.b, 0.7))
	grad.set_color(1, Color(Palette.MIST.r, Palette.MIST.g, Palette.MIST.b, 0.0))
	var gt: GradientTexture1D = GradientTexture1D.new()
	gt.gradient = grad
	pm.color_ramp = gt
	p.process_material = pm
	return p


func _respawn_ripple(pos: Vector3) -> void:
	# The ripple is self-freeing after 1.1s. Use a timer to spawn a new
	# one on a tight cadence so the screenshot always catches a ring in
	# flight.
	var timer: Timer = Timer.new()
	timer.one_shot = false
	timer.wait_time = 0.4
	timer.autostart = true
	add_child(timer)
	timer.timeout.connect(func():
		var scene: PackedScene = load("res://scenes/fx/pond_ripple.tscn")
		if scene == null: return
		var fx: Node3D = scene.instantiate() as Node3D
		_stage.add_child(fx)
		fx.global_position = pos
	)


func _process(_delta: float) -> void:
	if _captured:
		return
	_countdown -= 1
	if _countdown <= 0:
		_captured = true
		_capture()


func _capture() -> void:
	await RenderingServer.frame_post_draw
	var img: Image = _viewport.get_texture().get_image()
	var out_path: String = "%s/%s.png" % [SHOTS_DIR, OUT_NAME]
	var err: int = img.save_png(out_path)
	if err == OK:
		_sanity_check(img)
		print("[fx-shot] saved %s (%d×%d)" % [out_path, img.get_width(), img.get_height()])
	else:
		push_warning("[fx-shot] save_png failed err=%d" % err)
	# Give the scheduler a beat to flush, then quit.
	await get_tree().create_timer(0.2).timeout
	get_tree().quit()


## Palette sanity check — assert the screenshot isn't a black rectangle.
## Palette floor and label text produce >0 pixels per station column; a
## true all-black output would mean the FX pipeline itself is broken.
func _sanity_check(img: Image) -> void:
	var w: int = img.get_width()
	var h: int = img.get_height()
	var black_count: int = 0
	var total: int = 0
	# Sample a grid of pixels and count any that are near-black (< 0.05
	# total RGB). We expect <5% near-black pixels (just label outlines).
	for y in range(0, h, 16):
		for x in range(0, w, 16):
			total += 1
			var c: Color = img.get_pixel(x, y)
			if c.r + c.g + c.b < 0.05:
				black_count += 1
	var pct: float = float(black_count) / max(1.0, float(total))
	print("[fx-shot] sanity near-black %d / %d = %.1f%%" % [black_count, total, pct * 100.0])
	if pct > 0.5:
		push_warning("[fx-shot] WARNING: >50%% of sampled pixels near-black — possible render failure")
