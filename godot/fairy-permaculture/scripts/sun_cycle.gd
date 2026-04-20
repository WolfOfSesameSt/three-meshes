## Fairy Permaculture — cinematic sun + sky cycle (C1).
##
## Drives the DirectionalLight3D across a smooth arc in 60 s of real
## game time per in-game day (at Scheduler speed 1x). Seven palette-
## anchored phases — Dawn → Morning → Noon → Afternoon → Sunset →
## Twilight → Night — are interpolated through a single monotonic
## `_phase_t` normalized to [0..1].
##
## All colors come from the canonical `Palette.*` singleton. No raw
## `Color(r, g, b)` literals. See DESIGN.md §Art Direction + the
## feedback_happy_palette_mandatory memory for the rule.
##
## Cooperation with `world_state.gd`:
##   • sun_cycle writes the BASE Environment + Sun state each frame.
##   • world_state runs with `process_priority = 100` and adds a
##     vitality-driven saturation / warmth tint ON TOP.
##   • This script uses `process_priority = 0` so it always runs first.
extends Node

@export_node_path("DirectionalLight3D") var sun_path: NodePath
@export_node_path("WorldEnvironment") var env_path: NodePath

## Full day length in real seconds at Scheduler speed 1x (matches
## `Scheduler.SECONDS_PER_DAY`). Read from Scheduler at _ready so the
## two stay in sync even if we tweak the tick rate.
var _day_length_s: float = 60.0

## Monotonic phase time in seconds. Increments by delta * Scheduler.speed
## while the scheduler is running; wraps modulo `_day_length_s` to give
## a continuous 0..1 cycle across the in-game day.
var _cycle_time_s: float = 0.0

## Where in the 24-hour arc we start the game. 0.22 ≈ late morning so
## new players land in the hero lighting band instead of twilight.
const START_PHASE_T: float = 0.22

## Seasonal noon altitude in degrees (measured from the horizon).
const SEASON_NOON_ALTITUDE: Dictionary = {
	"spring": 60.0,
	"summer": 72.0,
	"autumn": 48.0,
	"winter": 32.0,
}

var _sun: DirectionalLight3D
var _env: WorldEnvironment
var _phases: Array = []


func _ready() -> void:
	# Run before world_state (which uses process_priority 100).
	process_priority = 0
	_day_length_s = max(1.0, Scheduler.SECONDS_PER_DAY)
	_cycle_time_s = START_PHASE_T * _day_length_s
	_build_phases()
	_resolve_refs()
	# One initial apply so scene is correct before first _process tick.
	_apply_lighting(current_phase_t())
	# Defer one frame so WorldGrid has had time to attach its terrain
	# chunks under the scene root; then sanitize render flags that
	# cause the terrain/water to vanish from an isometric vantage.
	call_deferred("_post_terrain_fixup")


## One-shot cleanup: walk the terrain chunks built by WorldGrid and
## make sure they render from our 45° iso viewpoint. The chunk mesh
## winding in `world_grid.gd` (not owned by this agent) produces
## backfaces when viewed from above, so without this fix the game
## shows "sky + a 1-pixel horizon stripe". CULL_DISABLED makes the
## surfaces render from either side until world_grid's winding gets
## flipped by its owner.
##
## Also patches the water shader to include `cull_disabled` for the
## same reason — the water overlay mesh shares the terrain's winding.
func _post_terrain_fixup() -> void:
	var root: Node = get_tree().current_scene
	if root == null:
		return
	var terrain_root: Node = root.find_child("TerrainChunks", true, false)
	if terrain_root == null:
		return
	for child in terrain_root.get_children():
		if not (child is MeshInstance3D):
			continue
		var mi: MeshInstance3D = child
		var mat: Object = mi.material_override
		if mat is StandardMaterial3D:
			(mat as StandardMaterial3D).cull_mode = BaseMaterial3D.CULL_DISABLED
		elif mat is ShaderMaterial:
			var sm: ShaderMaterial = mat as ShaderMaterial
			if sm.shader != null:
				var code: String = sm.shader.code
				if code.find("cull_disabled") == -1 and code.find("render_mode") != -1:
					sm.shader.code = code.replace(
						"render_mode unshaded;",
						"render_mode unshaded, cull_disabled;"
					)


func current_phase_t() -> float:
	return fposmod(_cycle_time_s, _day_length_s) / _day_length_s


func _process(delta: float) -> void:
	var speed: float = max(0.0, float(Scheduler.speed))
	_cycle_time_s += delta * speed
	_apply_lighting(current_phase_t())


## Resolves the sun / environment node references. Uses exported
## NodePaths first (if main.tscn wires them) then falls back to a
## name-based lookup under the current scene.
func _resolve_refs() -> void:
	if sun_path != NodePath(""):
		_sun = get_node_or_null(sun_path) as DirectionalLight3D
	if env_path != NodePath(""):
		_env = get_node_or_null(env_path) as WorldEnvironment
	if _sun == null or _env == null:
		var root: Node = get_tree().current_scene
		if root == null:
			return
		if _sun == null:
			_sun = root.find_child("Sun", true, false) as DirectionalLight3D
		if _env == null:
			_env = root.find_child("WorldEnvironment", true, false) as WorldEnvironment


## Allow callers to force a rebind (e.g. after a scene change in the
## headless screenshot tool). Safe to call at any time.
func rebind() -> void:
	_sun = null
	_env = null
	_resolve_refs()


## Public testing hook — set the cycle time directly. Used by the
## headless screenshot tool to capture specific times of day.
func set_phase_t(t: float) -> void:
	_cycle_time_s = clamp(t, 0.0, 0.9999) * _day_length_s
	_resolve_refs()
	_apply_lighting(current_phase_t())


# ---------- phase table ----------

## Build the 7-phase dictionary table. Each entry anchors to a point
## in the cycle and provides the full visual state — sun altitude +
## azimuth, sky color, ambient color, sun color, sun energy, shadow
## tint (applied via env.adjustment_color_correction when enabled).
##
## Color choices cite DESIGN.md §Art Direction. Palette constants only.
func _build_phases() -> void:
	# t, altitude_deg, azimuth_deg_offset, sky, ambient, sun_color, sun_energy, ambient_energy
	_phases = [
		{
			"t": 0.00, "label": "night_dark",
			"alt_scale": -0.45, "az": -95.0,
			"sky": Palette.BERRY.lerp(Palette.INK, 0.70),
			"ambient": Palette.BERRY.lerp(Palette.SKY, 0.30).darkened(0.35),
			"sun": Palette.MOON.lerp(Palette.SKY, 0.55),
			"sun_energy": 0.08,
			"ambient_energy": 0.38,
		},
		{
			"t": 0.08, "label": "predawn",
			"alt_scale": -0.12, "az": -88.0,
			"sky": Palette.BERRY.lerp(Palette.CORAL, 0.35),
			"ambient": Palette.BERRY.lerp(Palette.HONEY_SKY, 0.45),
			"sun": Palette.CORAL.lerp(Palette.HONEY, 0.35),
			"sun_energy": 0.35,
			"ambient_energy": 0.48,
		},
		{
			"t": 0.18, "label": "dawn",
			"alt_scale": 0.18, "az": -78.0,
			"sky": Palette.CORAL.lerp(Palette.HONEY_SKY, 0.55),
			"ambient": Palette.MOON.lerp(Palette.HONEY_SKY, 0.60),
			"sun": Palette.HONEY.lerp(Palette.PARCHMENT, 0.40),
			"sun_energy": 0.85,
			"ambient_energy": 0.62,
		},
		{
			"t": 0.30, "label": "morning",
			"alt_scale": 0.45, "az": -45.0,
			"sky": Palette.SKY.lerp(Palette.HONEY_SKY, 0.25),
			"ambient": Palette.MOON.lerp(Palette.MEADOW, 0.18),
			"sun": Palette.PARCHMENT.lerp(Palette.HONEY, 0.25),
			"sun_energy": 1.25,
			"ambient_energy": 0.75,
		},
		{
			"t": 0.50, "label": "noon",
			"alt_scale": 1.00, "az": 0.0,
			"sky": Palette.SKY,
			"ambient": Palette.MOON.lerp(Palette.HONEY_SKY, 0.35),
			"sun": Palette.PARCHMENT,
			"sun_energy": 1.55,
			"ambient_energy": 0.85,
		},
		{
			"t": 0.68, "label": "afternoon",
			"alt_scale": 0.55, "az": 45.0,
			"sky": Palette.SKY.lerp(Palette.HONEY_SKY, 0.50),
			"ambient": Palette.MOON.lerp(Palette.HONEY, 0.25),
			"sun": Palette.HONEY.lerp(Palette.PARCHMENT, 0.50),
			"sun_energy": 1.25,
			"ambient_energy": 0.75,
		},
		{
			"t": 0.80, "label": "sunset",
			"alt_scale": 0.14, "az": 78.0,
			"sky": Palette.CORAL.lerp(Palette.BERRY, 0.35),
			"ambient": Palette.CORAL.lerp(Palette.HONEY_SKY, 0.50),
			"sun": Palette.HONEY.lerp(Palette.CORAL, 0.65),
			"sun_energy": 0.90,
			"ambient_energy": 0.60,
		},
		{
			"t": 0.88, "label": "twilight",
			"alt_scale": -0.08, "az": 88.0,
			"sky": Palette.BERRY.lerp(Palette.CORAL, 0.25),
			"ambient": Palette.BERRY.lerp(Palette.CORAL, 0.45),
			"sun": Palette.CORAL.lerp(Palette.BERRY, 0.55),
			"sun_energy": 0.22,
			"ambient_energy": 0.45,
		},
		# Wrap anchor — same state as 0.00 so the loop is continuous.
		{
			"t": 1.00, "label": "night_dark_wrap",
			"alt_scale": -0.45, "az": 95.0,
			"sky": Palette.BERRY.lerp(Palette.INK, 0.70),
			"ambient": Palette.BERRY.lerp(Palette.SKY, 0.30).darkened(0.35),
			"sun": Palette.MOON.lerp(Palette.SKY, 0.55),
			"sun_energy": 0.08,
			"ambient_energy": 0.38,
		},
	]


## Look up the two phase entries bracketing `t` and the interpolation
## factor between them. Guarantees a valid pair even at t == 1.
func _bracket(t: float) -> Dictionary:
	for i in range(_phases.size() - 1):
		var a: Dictionary = _phases[i]
		var b: Dictionary = _phases[i + 1]
		if t >= float(a["t"]) and t <= float(b["t"]):
			var span: float = float(b["t"]) - float(a["t"])
			var k: float = 0.0 if span <= 0.0 else (t - float(a["t"])) / span
			return {"a": a, "b": b, "k": smoothstep(0.0, 1.0, k)}
	var first: Dictionary = _phases[0]
	return {"a": first, "b": first, "k": 0.0}


# ---------- writer ----------

func _apply_lighting(t: float) -> void:
	if _sun == null or _env == null:
		_resolve_refs()
		if _sun == null or _env == null:
			return
	var pair: Dictionary = _bracket(t)
	var a: Dictionary = pair["a"]
	var b: Dictionary = pair["b"]
	var k: float = pair["k"]

	# Sun transform — rotate around world Y for azimuth, then tilt down
	# by altitude. Directional lights point along -Z of their basis, so
	# we build basis = rot_y(azimuth) * rot_x(-altitude).
	var noon_alt: float = float(SEASON_NOON_ALTITUDE.get(Scheduler.current_season(), 55.0))
	var alt_scale: float = lerp(float(a["alt_scale"]), float(b["alt_scale"]), k)
	var altitude_deg: float = alt_scale * noon_alt
	var azimuth_deg: float = lerp(float(a["az"]), float(b["az"]), k)

	var basis: Basis = Basis()
	basis = basis.rotated(Vector3.UP, deg_to_rad(azimuth_deg))
	basis = basis.rotated(basis.x, deg_to_rad(-altitude_deg))
	_sun.transform.basis = basis

	# Color + energy interpolation. Every endpoint is a Palette-authored
	# blend — the palette's own pastel tones (SKY, MIST, MOON, HONEY_SKY)
	# sit at low-saturation by design, so running `clamp_happy` here
	# would WRECK those hues (push pale sky toward honey-green). We
	# trust the palette endpoints as-is. `world_state.gd` still applies
	# its saturation LUT on top.
	var sky_color: Color = (a["sky"] as Color).lerp(b["sky"] as Color, k)
	var ambient_color: Color = (a["ambient"] as Color).lerp(b["ambient"] as Color, k)
	var sun_color: Color = (a["sun"] as Color).lerp(b["sun"] as Color, k)
	var sun_energy: float = lerp(float(a["sun_energy"]), float(b["sun_energy"]), k)
	var ambient_energy: float = lerp(float(a["ambient_energy"]), float(b["ambient_energy"]), k)

	# Hide the sun at negative altitude — a light pointing up from below
	# the horizon produces nonsense shadow banding on the terrain.
	var below_horizon: bool = altitude_deg < -2.0
	_sun.visible = not below_horizon
	_sun.light_color = sun_color
	_sun.light_energy = max(0.0, sun_energy)

	var env: Environment = _env.environment
	if env == null:
		return
	env.background_color = sky_color
	env.ambient_light_color = ambient_color
	env.ambient_light_energy = ambient_energy
	env.fog_light_color = sky_color
