## Fairy Permaculture — compost pile scene script.
##
## Visual transformation maps to pile state so the mound physically
## tells the story of the decomposition:
##   empty         — tiny, pale earth tone
##   filling       — grows with volume, stays brown
##   (threshold)   — at ≥ 1 m³ a soft gold pulse + halo ring says "READY TO COOK"
##   triggered/hot — warm glow, steam, scale peaks
##   turn-window   — warm pulse, "↻ TURN ME"
##   cooling       — settles, ~10 % shrink
##   curing        — dark, fungal mellow
##   finished      — deep rich compost + gold flecks + continuous sparkle
##                   (the celebration state)
##   failures      — red rim cues (anaerobic/stalled/ammonia)
extends Node3D

signal clicked(pile: Pile)
signal hover_changed(mesh: Node3D, hovered: bool)
## Fired the FIRST time this pile enters `Pile.S_TURN_WINDOW` per cook
## cycle. Latches on `_turn_banner_fired` (re-entries during the same
## cook cycle don't re-fire); resets in `_on_state_changed` when the
## pile is harvested back to `S_EMPTY`. HUD listens for this and shows
## a parchment toast "Pile wants turning".
signal turn_window_entered(pile_mesh: Node3D)

@onready var _base: MeshInstance3D = $Base
@onready var _top: MeshInstance3D = $Top
@onready var _steam: MeshInstance3D = $Steam
@onready var _sparkle: MeshInstance3D = $Sparkle
@onready var _click_area: StaticBody3D = $ClickArea

var pile: Pile = Pile.new()
var _base_mat: StandardMaterial3D
var _top_mat: StandardMaterial3D
var _steam_mat: StandardMaterial3D
var _sparkle_mat: StandardMaterial3D
var _ready_ring: MeshInstance3D
var _ready_ring_mat: StandardMaterial3D
var _halo: OmniLight3D
var _t: float = 0.0

# One-time HUD banner when the pile first lands in S_TURN_WINDOW in a
# cook cycle. Resets when the state machine leaves S_TURN_WINDOW so the
# next cook cycle re-arms the alert. Without this, a pile re-entering the
# turn window across multiple sessions would spam toasts.
var _turn_banner_fired: bool = false

# Tier label — subclasses override in _ready(). Plain compost_pile is
# the legacy "cold-pile" (slow 1.0× cook multiplier). The pile state
# machine itself reads this via `pile.variant` so the quality readout
# + panel header know what kind of mound this is.
var _variant_id: String = "cold-pile"
var _cook_multiplier: float = 1.0

# All pile-state colors trace back to Palette.* entries — no hardcoded
# greys/browns. Empty uses WARM_STONE, filling uses EARTH, hot rim uses
# CORAL, finished uses MEADOW + COMPOST, failures use CORAL-dark.
var _col_empty: Color          = Palette.WARM_STONE
var _col_filling_base: Color   = Palette.EARTH
var _col_filling_top: Color    = Palette.EARTH.lerp(Palette.COMPOST, 0.6)
var _col_hot_rim: Color        = Palette.CORAL
var _col_cooling: Color        = Palette.EARTH.lerp(Palette.COMPOST, 0.4)
var _col_curing: Color         = Palette.COMPOST.lerp(Palette.EARTH, 0.25)
var _col_finished_base: Color  = Palette.COMPOST
var _col_finished_top: Color   = Palette.COMPOST.lerp(Palette.MEADOW, 0.15)
var _col_failure: Color        = Palette.CORAL.lerp(Palette.EARTH, 0.4)


func _ready() -> void:
	_base_mat = StandardMaterial3D.new()
	_base_mat.albedo_color = _col_empty
	_base.material_override = _base_mat
	_top_mat = StandardMaterial3D.new()
	_top_mat.albedo_color = _col_filling_top
	_top.material_override = _top_mat

	_steam_mat = StandardMaterial3D.new()
	_steam_mat.transparency = StandardMaterial3D.TRANSPARENCY_ALPHA
	# Parchment-tinted steam reads warmer than a sterile white cloud.
	var steam_rgb: Color = Palette.PARCHMENT
	_steam_mat.albedo_color = Color(steam_rgb.r, steam_rgb.g, steam_rgb.b, 0.0)
	_steam_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_steam.material_override = _steam_mat

	_sparkle_mat = StandardMaterial3D.new()
	_sparkle_mat.transparency = StandardMaterial3D.TRANSPARENCY_ALPHA
	_sparkle_mat.albedo_color = Color(Palette.HONEY.r, Palette.HONEY.g, Palette.HONEY.b, 0.0)
	_sparkle_mat.emission_enabled = true
	_sparkle_mat.emission = Palette.HONEY
	_sparkle_mat.emission_energy_multiplier = 2.0
	_sparkle_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	if _sparkle.mesh == null:
		var m: SphereMesh = SphereMesh.new()
		m.radius = 0.35
		m.height = 0.7
		_sparkle.mesh = m
	_sparkle.material_override = _sparkle_mat

	# "Ready to cook" ground halo — a honey-gold ring that appears when
	# the pile first crosses the 1 m³ volume threshold while still
	# filling / triggered. Tells the player: "this is big enough now."
	_ready_ring = MeshInstance3D.new()
	var ring: TorusMesh = TorusMesh.new()
	ring.inner_radius = 2.0
	ring.outer_radius = 2.4
	ring.rings = 48
	_ready_ring.mesh = ring
	_ready_ring_mat = StandardMaterial3D.new()
	_ready_ring_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_ready_ring_mat.albedo_color = Color(Palette.HONEY.r, Palette.HONEY.g, Palette.HONEY.b, 0.0)
	_ready_ring_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_ready_ring.material_override = _ready_ring_mat
	_ready_ring.position = Vector3(0, 0.05, 0)
	_ready_ring.visible = false
	add_child(_ready_ring)

	# Warm point light above the mound when hot / finished.
	_halo = OmniLight3D.new()
	_halo.light_color = Palette.HONEY
	_halo.light_energy = 0.0
	_halo.omni_range = 6.0
	_halo.position = Vector3(0, 3.2, 0)
	add_child(_halo)

	Scheduler.day_advanced.connect(_on_day_advanced)
	pile.state_changed.connect(_on_state_changed)
	pile.variant = _variant_id
	pile.cook_multiplier = _cook_multiplier
	_click_area.input_event.connect(_on_click)
	_click_area.mouse_entered.connect(_on_mouse_enter)
	_click_area.mouse_exited.connect(_on_mouse_exit)
	Game.pile_ref = self


func _on_mouse_enter() -> void:
	set_highlight(true)
	emit_signal("hover_changed", self, true)


func _on_mouse_exit() -> void:
	set_highlight(false)
	emit_signal("hover_changed", self, false)


## Rim + emission tint on hover. Preserves the state-driven base color.
func set_highlight(on: bool) -> void:
	var highlight: Color = Palette.HONEY
	for m in [_base_mat, _top_mat]:
		if m == null: continue
		m.rim_enabled = on
		m.rim = 0.9 if on else 0.0
		m.rim_tint = 0.75
		# Don't clobber emission if already set by state (hot/finished).
		if pile.state not in [Pile.S_HOT, Pile.S_TURN_WINDOW, Pile.S_FINISHED]:
			m.emission_enabled = on
			m.emission = highlight
			m.emission_energy_multiplier = 0.3 if on else 0.0


func _on_day_advanced(_day: int, season: String, _year: int) -> void:
	pile.tick({
		"rained": false,
		"tempC": 18.0,
		"rain_days_streak": 0,
		"season": season,
	})


func _on_state_changed(new_state: String, _old: String) -> void:
	var wp: Vector3 = global_position + Vector3(0, 3.6, 0)
	if new_state == Pile.S_HOT:
		FarmTotals.mark_pile_hot()
		AudioManager.play("pile-hot")
		Juice.pop(wp, "♨ PILE IS HOT", Palette.CORAL)
		Juice.burst(wp, Palette.CORAL, 18)
	elif new_state == Pile.S_TURN_WINDOW:
		Juice.pop(wp, "↻ TURN ME", Palette.HONEY)
		# Big one-time banner: fires exactly once per cook cycle.
		# `_turn_banner_fired` latches on the FIRST TURN_WINDOW entry of
		# a cycle and only resets when the cycle restarts (see below).
		# Subsequent TURN_WINDOW re-entries during the same cook (the
		# pile needs 3 turns to reach COOLING) don't re-fire the banner.
		if not _turn_banner_fired:
			_turn_banner_fired = true
			AudioManager.play("compost-finish", -10.0)
			Juice.pop(global_position + Vector3(0, 3.0, 0), "↻ TURN NEEDED", Palette.HONEY)
			# HUD listens for this and renders a parchment toast — wired
			# once per pile in hud.gd's _on_pile_entered_tree hook so the
			# signal ownership stays local to the compost_pile node.
			emit_signal("turn_window_entered", self)
	# A new cook cycle starts when the pile returns to EMPTY (harvested)
	# or the state machine lands in any failure state and then rescues
	# back to FILLING. Resetting at EMPTY guarantees "once per cook cycle".
	if new_state == Pile.S_EMPTY:
		_turn_banner_fired = false
	elif new_state == Pile.S_FINISHED:
		AudioManager.play("compost-finish")
		Juice.pop(wp, "✦ FINISHED — LIVING SOIL", Palette.HONEY)
		Juice.burst(wp, Palette.HONEY, 36)
		# Big celebratory tween: mound briefly pops up then settles.
		var tw: Tween = create_tween()
		tw.tween_property(self, "scale", scale * 1.2, 0.25).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		tw.tween_property(self, "scale", scale, 0.4).set_trans(Tween.TRANS_SINE)
	elif new_state == Pile.S_ANAEROBIC or new_state == Pile.S_STALLED or new_state == Pile.S_AMMONIA:
		Juice.pop(wp, "⚠ " + new_state.to_upper().replace("-", " "), Palette.CORAL.darkened(0.15))


func _process(delta: float) -> void:
	_t += delta
	_apply_state_visuals(delta)


func _apply_state_visuals(delta: float) -> void:
	# --- Scale driven by actual volume. 0 m³ = tiny stub (0.5×);
	# 1 m³ = ready (1.0×); beyond that we allow up to 1.2× for a
	# visibly "full" look. Finished piles keep their pre-harvest size.
	var target_scale: float
	if pile.state == Pile.S_FINISHED:
		target_scale = 1.1
	elif pile.state == Pile.S_EMPTY:
		target_scale = 0.4
	else:
		target_scale = 0.5 + clamp(pile.volume_m3, 0.0, 2.0) / 2.0 * 0.7
	scale = scale.lerp(Vector3.ONE * target_scale, 0.08)

	# --- "Ready to cook" gold halo ring when volume hits threshold
	# during filling/triggered, BEFORE the pile heats.
	var ready_to_cook: bool = (
		pile.state in [Pile.S_FILLING, Pile.S_TRIGGERED]
		and pile.volume_m3 >= 1.0
	)
	if ready_to_cook:
		_ready_ring.visible = true
		var pulse: float = 0.5 + 0.35 * sin(_t * 3.0)
		_ready_ring_mat.albedo_color.a = pulse
		_ready_ring.scale = Vector3.ONE * (1.0 + 0.05 * sin(_t * 3.0))
	else:
		_ready_ring_mat.albedo_color.a = lerp(_ready_ring_mat.albedo_color.a, 0.0, 0.1)
		if _ready_ring_mat.albedo_color.a < 0.02:
			_ready_ring.visible = false

	# --- Base color & emission by state.
	var target_base: Color
	var target_top: Color
	var emission_on: bool = false
	var emission_color: Color = Color.BLACK
	var emission_energy: float = 0.0
	var halo_target: float = 0.0
	match pile.state:
		Pile.S_EMPTY:
			target_base = _col_empty; target_top = _col_empty.lightened(0.05)
		Pile.S_FILLING, Pile.S_TRIGGERED:
			target_base = _col_filling_base; target_top = _col_filling_top
			if ready_to_cook:
				emission_on = true; emission_color = Palette.HONEY
				emission_energy = 0.25 + 0.12 * sin(_t * 3.0)
		Pile.S_HOT, Pile.S_TURN_WINDOW:
			target_base = _col_filling_base; target_top = _col_filling_top
			emission_on = true; emission_color = _col_hot_rim
			emission_energy = 0.5 + 0.2 * sin(_t * 5.0)
			halo_target = 1.8
		Pile.S_COOLING:
			target_base = _col_cooling; target_top = _col_cooling.darkened(0.15)
		Pile.S_CURING:
			target_base = _col_curing; target_top = _col_curing.darkened(0.2)
		Pile.S_FINISHED:
			target_base = _col_finished_base; target_top = _col_finished_top
			emission_on = true; emission_color = Palette.HONEY
			emission_energy = 0.35 + 0.15 * sin(_t * 2.0)
			halo_target = 1.2
		Pile.S_ANAEROBIC, Pile.S_STALLED, Pile.S_AMMONIA:
			target_base = _col_failure; target_top = _col_failure.darkened(0.1)
			emission_on = true; emission_color = Palette.CORAL.darkened(0.2)
			emission_energy = 0.3
		_:
			target_base = _col_empty; target_top = _col_empty
	_base_mat.albedo_color = _base_mat.albedo_color.lerp(target_base, 0.05)
	_top_mat.albedo_color = _top_mat.albedo_color.lerp(target_top, 0.05)
	for m in [_base_mat, _top_mat]:
		m.emission_enabled = emission_on
		m.emission = emission_color
		m.emission_energy_multiplier = emission_energy
	_halo.light_energy = lerp(_halo.light_energy, halo_target, 0.06)

	# --- Steam is visible while hot.
	var hot: bool = pile.state in [Pile.S_HOT, Pile.S_TURN_WINDOW]
	var steam_target: float = 0.55 if hot else 0.0
	_steam_mat.albedo_color.a = lerp(_steam_mat.albedo_color.a, steam_target, 0.08)
	_steam.position.y = 3.4 + 0.15 * sin(_t * 2.0)
	_steam.scale = Vector3.ONE * (1.0 + 0.1 * sin(_t * 1.5))

	# --- Gold sparkle only while finished.
	var done: bool = pile.state == Pile.S_FINISHED
	var sparkle_target: float = 1.0 if done else 0.0
	_sparkle_mat.albedo_color.a = lerp(_sparkle_mat.albedo_color.a, sparkle_target, 0.06)
	if done:
		_sparkle.rotate_y(delta * 1.5)
		_sparkle.position.y = 3.1 + 0.15 * sin(_t * 3.0)


## LMB on world objects is a no-op per the new interaction model —
## all actions route through right-click → context menu. The click
## body wiring is preserved so a future "hover select" can hook in.
func _on_click(_cam: Node, _event: InputEvent, _pos: Vector3, _norm: Vector3, _shape: int) -> void:
	pass


# =====================================================================
# Universal right-click contract
# =====================================================================

# The legacy `get_context_actions()` + `complete()` are REPLACED in-place
# below by the System Fixes Engineer block — GDScript does not allow
# duplicate method signatures in a class. The new single-source versions
# preserve every legacy branch verbatim and add the "Add IMO" action.


func display_name() -> String:
	match _variant_id:
		"hot-pile":
			return "Hot Pile"
		"cold-pile":
			return "Cold Pile"
	return "Compost Pile"


## Subclass hook — `hot_pile.gd` etc. invoke this in `_ready()` BEFORE
## super() to set the variant label + cook multiplier. Safe to call on
## the legacy cold pile (no-op changes).
func set_variant(variant_id: String, cook_multiplier: float = 1.0) -> void:
	_variant_id = variant_id
	_cook_multiplier = cook_multiplier
	if pile != null:
		pile.variant = variant_id
		pile.cook_multiplier = cook_multiplier


# =====================================================================
# APPEND-ONLY: System Fixes Engineer — anaerobic_risk listener + IMO.
# --------------------------------------------------------------------
# (1) WeatherSystem emits `anaerobic_risk(true)` when a wet-week is
#     about to push uncovered piles toward anaerobic collapse. If we get
#     the risk-on ping and this pile is uncovered, fire a one-time
#     warning banner ("COVER ME") — paired audio + CORAL glyph pop.
#     Latches off on risk_off or cover.
# (2) New context action: "Add IMO" — pulls 1 `imo` from storage (auto-
#     pickup via Interactable MATERIAL_RESOURCES), takes 6 s of labor,
#     and calls `pile.add_ingredient("forest-duff-imo", 20.0)` to seed
#     the indigenous microorganism inoculant. MEADOW glyph + biology
#     boost text on complete.
#
# We can't modify the existing `_ready()` or `_process()` per APPEND-ONLY.
# We hook into the Scheduler.day_advanced signal via a SECOND listener
# that lazy-wires the anaerobic_risk connection on first tick — Godot
# signals fan out, so stacking a second listener is clean.
# =====================================================================

# Latch so the COVER-ME warning fires once per anaerobic-risk window.
var _anaerobic_warning_fired: bool = false


## Wire the WeatherSystem anaerobic_risk listener once. Idempotent.
func _ensure_anaerobic_wired() -> void:
	if has_meta("_anaerobic_wired"):
		return
	set_meta("_anaerobic_wired", true)
	if has_node("/root/WeatherSystem"):
		var ws: Node = get_node("/root/WeatherSystem")
		if ws.has_signal("anaerobic_risk") and not ws.is_connected(
			"anaerobic_risk", _on_anaerobic_risk
		):
			ws.connect("anaerobic_risk", _on_anaerobic_risk)


## Second Scheduler.day_advanced handler — the original `_on_day_advanced`
## runs the pile physics; this one just nurses the lazy anaerobic_risk
## wiring. Safe to stack alongside the first handler (Godot signals fan
## out; both listeners fire per tick).
func _on_day_advanced_wire_check(_day: int, _season: String, _year: int) -> void:
	_ensure_anaerobic_wired()


## _enter_tree fires once per node lifetime, before _ready(). We use
## the Node's `ready` signal (emitted after _ready() returns) so the
## wire connects only after the pile's own Scheduler connect has run.
## No collision with existing `_ready()` — we don't redefine it here.
func _enter_tree() -> void:
	if has_meta("_wire_hook_set"):
		return
	set_meta("_wire_hook_set", true)
	if not is_connected("ready", _on_tree_ready_for_wire):
		connect("ready", _on_tree_ready_for_wire)


func _on_tree_ready_for_wire() -> void:
	if Scheduler.has_signal("day_advanced") and not Scheduler.is_connected(
		"day_advanced", _on_day_advanced_wire_check
	):
		Scheduler.connect("day_advanced", _on_day_advanced_wire_check)
	# Also try once right now in case day-tick cadence is slow.
	_ensure_anaerobic_wired()


func _on_anaerobic_risk(on: bool) -> void:
	if not on:
		_anaerobic_warning_fired = false
		return
	if pile.covered:
		return
	if _anaerobic_warning_fired:
		return
	_anaerobic_warning_fired = true
	var warn_pos: Vector3 = global_position + Vector3(0, 3.4, 0)
	if AudioManager.has_method("play"):
		AudioManager.play("thunder-distant", -6.0)
	Juice.pop(warn_pos, "⚠ COVER ME", Palette.CORAL)
	Juice.burst(warn_pos, Palette.CORAL.lerp(Palette.EARTH, 0.35), 16)
	GameLog.event("pile_anaerobic_warn", {
		"covered": pile.covered,
		"state": pile.state,
		"moisture": pile.moisture_pct,
	})


## Override — adds the "Add IMO" action on top of the legacy menu.
## GDScript resolves the later definition, so this is what main.gd calls.
func get_context_actions() -> Array:
	var out: Array = []
	# Open inspector (zero-labor effect).
	out.append(Interactable.make_action(
		"open_pile_panel", "Open pile inspector", 0.0,
		{}, {}, "", Interactable.DROP_NONE, 1
	))
	# Greens.
	var act_trim: Dictionary = Interactable.make_action(
		"add_plant_trim", "Add plant trim", 4.0,
		{"plant_trim": 1.0}, {},
		"", Interactable.DROP_NONE, 1
	)
	act_trim["disabled"] = FarmTotals.get_resource(FarmTotals.PLANT_TRIM) < 1.0
	out.append(act_trim)

	var act_scraps: Dictionary = Interactable.make_action(
		"add_fruit_scraps", "Add fruit scraps", 4.0,
		{"fruit_scraps": 1.0}, {},
		"", Interactable.DROP_NONE, 1
	)
	act_scraps["disabled"] = FarmTotals.get_resource(FarmTotals.FRUIT_SCRAPS) < 1.0
	out.append(act_scraps)

	# Browns.
	var act_twigs: Dictionary = Interactable.make_action(
		"add_twigs", "Add twigs", 4.0,
		{"twigs": 2.0}, {},
		"", Interactable.DROP_NONE, 1
	)
	act_twigs["disabled"] = FarmTotals.get_resource(FarmTotals.TWIGS) < 2.0
	out.append(act_twigs)

	var act_wood: Dictionary = Interactable.make_action(
		"add_wood", "Add wood (wasteful — chip first)", 4.0,
		{"wood": 1.0}, {},
		"", Interactable.DROP_NONE, 1
	)
	act_wood["disabled"] = FarmTotals.get_resource(FarmTotals.WOOD) < 1.0
	out.append(act_wood)

	var act_leaves: Dictionary = Interactable.make_action(
		"add_dry_leaves", "Add dry leaves", 4.0,
		{"dry_leaves": 2.0}, {},
		"", Interactable.DROP_NONE, 1
	)
	act_leaves["disabled"] = FarmTotals.get_resource(FarmTotals.DRY_LEAVES) < 2.0
	out.append(act_leaves)

	var act_chips: Dictionary = Interactable.make_action(
		"add_wood_chips", "Add wood chips", 4.0,
		{"wood_chips": 1.0}, {},
		"", Interactable.DROP_NONE, 1
	)
	act_chips["disabled"] = FarmTotals.get_resource(FarmTotals.WOOD_CHIPS) < 1.0
	out.append(act_chips)

	var act_water: Dictionary = Interactable.make_action(
		"water_pile", "Water pile", 6.0,
		{"water": 1.0}, {},
		"", Interactable.DROP_NONE, 1
	)
	act_water["disabled"] = FarmTotals.get_resource(FarmTotals.WATER) < 1.0
	out.append(act_water)

	# Cover / uncover.
	out.append(Interactable.make_action(
		"uncover_pile" if pile.covered else "cover_pile",
		"Uncover pile" if pile.covered else "Cover pile",
		6.0, {}, {}, "", Interactable.DROP_NONE, 1
	))
	# NEW: Add IMO — indigenous microorganism inoculant. Auto-pickup
	# from storage via the `imo` material key. Biology + inoculant boost.
	var act_imo: Dictionary = Interactable.make_action(
		"add_imo", "Add IMO (biology boost)", 6.0,
		{"imo": 1.0}, {},
		"", Interactable.DROP_NONE, 1
	)
	act_imo["disabled"] = FarmTotals.get_resource("imo") < 1.0
	act_imo["tooltip"] = "Forest-duff IMO — seeds indigenous microbes into the pile. Accelerates biology + counts toward the inoculant-quality star."
	out.append(act_imo)

	var act_turn: Dictionary = Interactable.make_action(
		"turn_pile", "Turn compost", 20.0,
		{}, {}, "composter", Interactable.DROP_NONE, 2
	)
	act_turn["description"] = "Aerates the pile. Prevents anaerobic crash. Turn every 5–7 days during Hot state."
	out.append(act_turn)
	if pile.state == Pile.S_FINISHED:
		out.append(Interactable.make_action(
			"scoop_finished", "Scoop finished compost", 10.0,
			{}, {"compost": 1.0},
			"", Interactable.DROP_STORAGE, 2
		))
	return out


## Override — extends complete() with the add_imo branch. Every other
## branch delegates through to the legacy dispatch.
func complete(action: Dictionary) -> void:
	var id: String = action.get("id", "")
	if id == "add_imo":
		# Seed the IMO. 20 kg lands inside the pile chemistry as a
		# high-biology neutral + marks the pile's inoculant quality tracker
		# (Pile.add_ingredient auto-appends to q_inoculants).
		pile.add_ingredient("forest-duff-imo", 20.0)
		FarmTotals.mark_pile_feed()
		if AudioManager.has_method("play"):
			AudioManager.play("seedling-sprout", -4.0)
		var imo_tint: Color = Palette.COMPOST.lerp(Palette.MEADOW, 0.30)
		Juice.pop(global_position + Vector3(0, 2.2, 0), "+ IMO · biology boost", imo_tint)
		Juice.burst(global_position + Vector3(0, 1.6, 0), imo_tint, 14)
		GameLog.event("pile_imo_added", {
			"pile": _variant_id,
			"biology_inoculants": pile.q_inoculants.size(),
		})
		return
	# Fallback — identical to the legacy match-statement dispatch, with
	# the covered latch-off on the cover_pile path so the anaerobic-risk
	# warning re-arms cleanly.
	match id:
		"add_plant_trim":
			pile.add_ingredient("fresh-grass", 100.0)
			FarmTotals.mark_pile_feed()
			AudioManager.play("biomass-chop")
			Juice.pop(global_position + Vector3(0, 2.2, 0), "+ PLANT TRIM", Palette.MEADOW)
		"add_fruit_scraps":
			pile.add_ingredient("fruit-scraps", 80.0)
			FarmTotals.mark_pile_feed()
			AudioManager.play("biomass-chop")
			Juice.pop(global_position + Vector3(0, 2.2, 0), "+ FRUIT SCRAPS", Palette.CORAL)
		"add_twigs":
			pile.add_ingredient("twigs", 100.0)
			FarmTotals.mark_pile_feed()
			AudioManager.play("biomass-chop")
			Juice.pop(global_position + Vector3(0, 2.2, 0), "+ TWIGS", Palette.EARTH)
		"add_wood":
			pile.add_ingredient("wood-chunks", 100.0)
			FarmTotals.mark_pile_feed()
			AudioManager.play("biomass-chop", -4.0)
			Juice.pop(global_position + Vector3(0, 2.2, 0), "+ WOOD", Palette.EARTH.darkened(0.15))
		"add_dry_leaves":
			pile.add_ingredient("dry-leaves", 80.0)
			FarmTotals.mark_pile_feed()
			AudioManager.play("biomass-chop")
			var leaf_tint: Color = Palette.EARTH.lerp(Palette.HONEY, 0.25)
			Juice.pop(global_position + Vector3(0, 2.2, 0), "+ DRY LEAVES", leaf_tint)
		"add_wood_chips":
			pile.add_ingredient("wood-chips", 100.0)
			FarmTotals.mark_pile_feed()
			AudioManager.play("biomass-chop", -2.0)
			var chip_tint: Color = Palette.EARTH.lerp(Palette.HONEY, 0.35)
			Juice.pop(global_position + Vector3(0, 2.2, 0), "+ CHIPS", chip_tint)
			Juice.burst(global_position + Vector3(0, 1.6, 0), chip_tint, 10)
		"turn_pile":
			pile.turn()
			AudioManager.play("compost-scoop")
			Juice.pop(global_position + Vector3(0, 2.2, 0), "TURNED", Palette.HONEY)
		"water_pile":
			pile.water(15.0)
			AudioManager.play("hover-tick", -4.0)
			var water_tint: Color = Palette.SKY.lerp(Palette.MIST, 0.20)
			Juice.pop(global_position + Vector3(0, 2.2, 0), "+ WATER", water_tint)
			Juice.burst(global_position + Vector3(0, 1.6, 0), water_tint, 10)
		"scoop_finished":
			var out_harvest: Dictionary = pile.harvest()
			if _variant_id == "hot-pile" and int(out_harvest.get("quality", 0)) >= 3:
				Progression.mark_first_hot_q3_batch()
			Juice.pop(global_position + Vector3(0, 2.2, 0), "SCOOPED", Palette.HONEY)
		"cover_pile":
			pile.cover(true)
			# Latch-off the anaerobic warning now that the pile is covered.
			_anaerobic_warning_fired = false
			AudioManager.play("hover-tick", -4.0)
			Juice.pop(global_position + Vector3(0, 2.2, 0), "COVERED", Palette.EARTH)
		"uncover_pile":
			pile.cover(false)
			AudioManager.play("hover-tick", -4.0)
			Juice.pop(global_position + Vector3(0, 2.2, 0), "UNCOVERED", Palette.HONEY)
