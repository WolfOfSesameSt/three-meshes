## Fairy Permaculture — compost pile diagnostics panel (read-only).
##
## REWRITE 2026-04-19: the legacy panel let players spam "+ Greens" /
## "+ Browns" buttons that bypassed FarmTotals (infinite-click bug).
## The panel is now a pure diagnostic read-out — every action routes
## through the right-click context menu on the pile mesh, which already
## debits FarmTotals via the TaskQueue pipeline. Strips the Greens/
## Browns/Water/Turn/Cover/Harvest buttons entirely.
##
## The panel now shows:
##   - Header: pile name + state + tier crossing icon + close button
##   - Live metrics: volume, C:N, moisture, temp, days-in-state,
##     days-until-next-transition
##   - C:N balance bar: visual gauge of current ratio vs. the 20-40 ideal
##   - Ingredient breakdown: kg per ingredient currently in the pile
##   - State-aware "What's happening" educational blurb
##   - Recommended next action (1-line, state-aware)
##
## All colors are sourced from Palette.* — no raw Color() literals except
## the stylebox in the .tscn (matches the soil inspector pattern).
extends Control

@onready var _panel_root: PanelContainer = $Panel
@onready var _title: Label = $Panel/VBox/Header/Title
@onready var _tier_icon: Label = $Panel/VBox/Header/TierIcon
@onready var _close_btn: Button = $Panel/VBox/Header/Close
@onready var _state_label: Label = $Panel/VBox/StateLabel

@onready var _vol_label: Label = $Panel/VBox/Metrics/Volume/Label
@onready var _vol_bar: ProgressBar = $Panel/VBox/Metrics/Volume/Bar
@onready var _cn_label: Label = $Panel/VBox/Metrics/CN/Label
@onready var _cn_bar: ProgressBar = $Panel/VBox/Metrics/CN/Bar
@onready var _moisture_label: Label = $Panel/VBox/Metrics/Moisture/Label
@onready var _moisture_bar: ProgressBar = $Panel/VBox/Metrics/Moisture/Bar
@onready var _temp_label: Label = $Panel/VBox/Metrics/Temp/Label
@onready var _temp_bar: ProgressBar = $Panel/VBox/Metrics/Temp/Bar

@onready var _days_label: Label = $Panel/VBox/Days
@onready var _ingredient_list: VBoxContainer = $Panel/VBox/Ingredients/List
@onready var _ingredient_header: Label = $Panel/VBox/Ingredients/Header
@onready var _blurb_header: Label = $Panel/VBox/Blurb/Header
@onready var _blurb_label: Label = $Panel/VBox/Blurb/Body
@onready var _rec_label: Label = $Panel/VBox/Recommendation

var _pile: Pile
var _mesh: Node3D

# State-aware educational blurbs. One per state per the GDD.
const STATE_BLURBS: Dictionary = {
	Pile.S_EMPTY:        "Start adding greens + browns. Target ~1 m³ to trigger cooking.",
	Pile.S_FILLING:      "Feed the pile. Aim for balanced C:N (20–40) and 50–65 % moisture. Once 1 m³ volume is reached, it heats up.",
	Pile.S_TRIGGERED:    "Microbes are warming up. Temp climbing — active decomposition begins.",
	Pile.S_HOT:          "Active decomposition 55–65 °C. Turn every 5–7 days to aerate — skipping drops quality.",
	Pile.S_TURN_WINDOW:  "↻ Turn now. Without turning, microbes starve of oxygen. Pile will drop to Cooling instead of rebounding Hot.",
	Pile.S_COOLING:      "Microbes slowing. Volume collapses ~50 %. N locks into biomass. No action needed.",
	Pile.S_CURING:       "Mellow fungal phase. 2–4 weeks. Patience. Do not disturb.",
	Pile.S_FINISHED:     "✦ Living soil — ready to scoop. Q-rating stamped. Apply to plots for OM + biology boost.",
	Pile.S_ANAEROBIC:    "⚠ Stinks. Too wet + no air. Add browns (wood chips, twigs, dry leaves) + turn. Salvageable to Q1–Q2.",
	Pile.S_STALLED:      "⚠ Too dry or imbalanced C:N. Add greens + water, or add browns if too N-heavy.",
	Pile.S_AMMONIA:      "⚠ Too much N — ammonia off-gassing. Add browns fast. Some N already lost (quality drop).",
}

# State-aware recommended next action.
const STATE_RECS: Dictionary = {
	Pile.S_EMPTY:        "Right-click the pile: add plant trim (green), twigs or dry leaves (brown).",
	Pile.S_FILLING:      "Right-click the pile to add more. Balance greens + browns toward a 1 m³ mound.",
	Pile.S_TRIGGERED:    "Leave it alone. Temperature rising — keep covered if rain is coming.",
	Pile.S_HOT:          "Wait for the turn window. Right-click to cover if heavy rain is forecast.",
	Pile.S_TURN_WINDOW:  "Right-click the pile → Turn compost. The composter fairy will aerate it.",
	Pile.S_COOLING:      "Hands off. The pile is collapsing intentionally.",
	Pile.S_CURING:       "Hands off. Fungal succession needs quiet weeks.",
	Pile.S_FINISHED:     "Right-click the pile → Scoop finished compost. Apply to soil plots.",
	Pile.S_ANAEROBIC:    "Right-click the pile: add wood chips or twigs (brown), then Turn compost.",
	Pile.S_STALLED:      "Right-click the pile: Water pile + add more greens (plant trim).",
	Pile.S_AMMONIA:      "Right-click the pile: add browns (wood chips, dry leaves) immediately.",
}

# Tier-crossing icons — the mound is visibly different at each phase, so
# the header ticks a glyph that matches what the player sees in-world.
const STATE_ICONS: Dictionary = {
	Pile.S_EMPTY:        "◌",
	Pile.S_FILLING:      "◐",
	Pile.S_TRIGGERED:    "◕",
	Pile.S_HOT:          "♨",
	Pile.S_TURN_WINDOW:  "↻",
	Pile.S_COOLING:      "◖",
	Pile.S_CURING:       "●",
	Pile.S_FINISHED:     "✦",
	Pile.S_ANAEROBIC:    "⚠",
	Pile.S_STALLED:      "⚠",
	Pile.S_AMMONIA:      "⚠",
}

# Human-readable names per pile ingredient id — the compost pile stores
# the chemistry id ("fresh-grass"), this dict maps it back to the player-
# facing action label the right-click menu uses.
const INGREDIENT_LABELS: Dictionary = {
	"fresh-grass":           "Plant trim",
	"comfrey-chop":          "Comfrey",
	"kitchen-scraps":        "Kitchen scraps",
	"fresh-manure":          "Manure",
	"coffee-grounds":        "Coffee grounds",
	"fish-trim":             "Fish trim",
	"fruit-scraps":          "Fruit scraps",
	"dry-leaves":            "Dry leaves",
	"straw":                 "Straw",
	"twigs":                 "Twigs",
	"wood-chunks":           "Wood",
	"wood-chips":            "Wood chips",
	"cardboard":             "Cardboard",
	"dead-corn-stalks":      "Corn stalks",
	"forest-duff-imo":       "Forest duff (IMO)",
	"finished-compost-seed": "Compost seed",
	"worm-castings":         "Worm castings",
}


func _ready() -> void:
	_panel_root.visible = false
	_close_btn.pressed.connect(hide_panel)
	_apply_palette_styles()


func _apply_palette_styles() -> void:
	# Tint progress bars — never cold-grey. Every fill traces to Palette.
	_tint_bar(_vol_bar, Palette.EARTH)
	_tint_bar(_cn_bar, Palette.MEADOW)
	_tint_bar(_moisture_bar, Palette.SKY)
	_tint_bar(_temp_bar, Palette.CORAL)
	# Label tints — strong COMPOST for headers, earthy tones for body.
	for node in [_title, _blurb_header, _ingredient_header]:
		if node: node.add_theme_color_override("font_color", Palette.COMPOST)
	if _state_label:
		_state_label.add_theme_color_override("font_color", Palette.EARTH)
	if _blurb_label:
		_blurb_label.add_theme_color_override("font_color", Palette.COMPOST)
	if _rec_label:
		_rec_label.add_theme_color_override("font_color", Palette.EARTH.darkened(0.1))
	if _days_label:
		_days_label.add_theme_color_override("font_color", Palette.EARTH)
	if _tier_icon:
		_tier_icon.add_theme_color_override("font_color", Palette.HONEY)


func _tint_bar(bar: ProgressBar, tint: Color) -> void:
	if bar == null: return
	var fill: StyleBoxFlat = StyleBoxFlat.new()
	fill.bg_color = Palette.clamp_happy(tint)
	fill.corner_radius_top_left = 3
	fill.corner_radius_top_right = 3
	fill.corner_radius_bottom_left = 3
	fill.corner_radius_bottom_right = 3
	bar.add_theme_stylebox_override("fill", fill)
	var bg: StyleBoxFlat = StyleBoxFlat.new()
	bg.bg_color = Palette.PARCHMENT.darkened(0.08)
	bg.corner_radius_top_left = 3
	bg.corner_radius_top_right = 3
	bg.corner_radius_bottom_left = 3
	bg.corner_radius_bottom_right = 3
	bar.add_theme_stylebox_override("background", bg)


func show_for(pile: Pile, mesh: Node3D) -> void:
	_pile = pile
	_mesh = mesh
	_panel_root.visible = true
	visible = true
	AudioManager.play("soil-inspect-open", -6.0)
	_refresh()


func hide_panel() -> void:
	_panel_root.visible = false
	visible = false
	_pile = null
	_mesh = null


func _input(event: InputEvent) -> void:
	if visible and event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		hide_panel()
		accept_event()


func _process(_delta: float) -> void:
	if visible and _pile:
		_refresh()


func _refresh() -> void:
	if _pile == null: return
	var state: String = _pile.state
	var variant_name: String = _variant_label(_pile.variant)
	_title.text = "%s — %s" % [variant_name, _state_pretty(state)]
	_tier_icon.text = STATE_ICONS.get(state, "·")
	_state_label.text = _state_subline(state)

	# --- Live metrics ---
	_vol_label.text = "Volume %.2f m³" % _pile.volume_m3
	_vol_bar.value = clamp(_pile.volume_m3 / 2.0 * 100.0, 0.0, 100.0)

	var cn: float = _pile.current_cn
	_cn_label.text = "C:N %d:1 %s" % [int(round(cn)), _cn_qualifier(cn)]
	_cn_bar.value = clamp((cn - 10.0) / 70.0 * 100.0, 0.0, 100.0)

	var moisture: float = _pile.moisture_pct
	_moisture_label.text = "Moisture %d %%%s" % [int(round(moisture)), _moisture_qualifier(moisture)]
	_moisture_bar.value = clamp(moisture, 0.0, 100.0)

	_temp_label.text = "Temp %d °C" % int(round(_pile.temp_c))
	_temp_bar.value = clamp(_pile.temp_c / 70.0 * 100.0, 0.0, 100.0)

	# --- Days in state + days until next transition ---
	var etd: int = _estimate_days_to_next(state)
	var etd_text: String = "—" if etd < 0 else "~%d day(s)" % etd
	_days_label.text = "Day %d in %s · Next: %s" % [_pile.days_in_state, _state_pretty(state), etd_text]

	# --- Ingredient breakdown ---
	_rebuild_ingredient_list()

	# --- Blurb + recommendation ---
	_blurb_label.text = STATE_BLURBS.get(state, "Observing the pile.")
	_rec_label.text = "Next: " + String(STATE_RECS.get(state, "Observe."))


func _rebuild_ingredient_list() -> void:
	if _ingredient_list == null: return
	for c in _ingredient_list.get_children():
		c.queue_free()
	# Aggregate ingredient id → total kg (each add_ingredient pushes a
	# separate entry, so we sum them for readability).
	var totals: Dictionary = {}
	for ing in _pile.ingredients:
		var id: String = String(ing.get("id", ""))
		var kg: float = float(ing.get("dry_mass_kg", 0.0))
		totals[id] = float(totals.get(id, 0.0)) + kg
	if totals.is_empty():
		var empty: Label = Label.new()
		empty.text = "(empty — no inputs yet)"
		empty.add_theme_color_override("font_color", Palette.EARTH.lightened(0.1))
		empty.add_theme_font_size_override("font_size", 11)
		_ingredient_list.add_child(empty)
		return
	# Sort descending by kg so the biggest contributors land at the top.
	var keys: Array = totals.keys()
	keys.sort_custom(func(a, b): return float(totals[a]) > float(totals[b]))
	for k in keys:
		var id: String = String(k)
		var kg: float = float(totals[id])
		var cat: String = Pile.category_for_ingredient(id)
		var label_text: String = INGREDIENT_LABELS.get(id, id.capitalize())
		var row: HBoxContainer = HBoxContainer.new()
		var name_lbl: Label = Label.new()
		name_lbl.text = "· " + label_text + " (" + cat + ")"
		name_lbl.add_theme_color_override("font_color", _color_for_category(cat))
		name_lbl.add_theme_font_size_override("font_size", 11)
		name_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var kg_lbl: Label = Label.new()
		kg_lbl.text = "%d kg" % int(round(kg))
		kg_lbl.add_theme_color_override("font_color", Palette.COMPOST)
		kg_lbl.add_theme_font_size_override("font_size", 11)
		row.add_child(name_lbl)
		row.add_child(kg_lbl)
		_ingredient_list.add_child(row)


func _color_for_category(cat: String) -> Color:
	match cat:
		"green":
			return Palette.MEADOW
		"brown":
			return Palette.EARTH
		"neutral":
			return Palette.BERRY
		_:
			return Palette.COMPOST


func _state_pretty(state: String) -> String:
	return state.replace("-", " ").capitalize()


func _state_subline(state: String) -> String:
	# Short state-of-the-pile line that sits under the header.
	match state:
		Pile.S_EMPTY:        return "Awaiting inputs"
		Pile.S_FILLING:      return "Filling — balance C:N + moisture"
		Pile.S_TRIGGERED:    return "Heating up — microbes waking"
		Pile.S_HOT:          return "Hot cooking — 55–65 °C target"
		Pile.S_TURN_WINDOW:  return "↻ Turn window open — aerate now"
		Pile.S_COOLING:      return "Cooling — volume collapse"
		Pile.S_CURING:       return "Curing — fungal mellow"
		Pile.S_FINISHED:     return "✦ Finished — ready to scoop"
		Pile.S_ANAEROBIC:    return "⚠ Anaerobic — smells bad"
		Pile.S_STALLED:      return "⚠ Stalled — dry or imbalanced"
		Pile.S_AMMONIA:      return "⚠ Ammonia loss — too much N"
	return state


func _cn_qualifier(cn: float) -> String:
	if cn <= 0.0:
		return "— (empty)"
	if cn < Pile.CN_BAND[0]:
		return "— too N-rich, add BROWNS"
	if cn > Pile.CN_BAND[1]:
		return "— too C-rich, add GREENS"
	return "— balanced ✓"


func _moisture_qualifier(moisture: float) -> String:
	if moisture <= 0.0:
		return ""
	if moisture < Pile.MOISTURE_BAND[0]:
		return " — too dry, water or add greens"
	if moisture > Pile.MOISTURE_BAND[1]:
		return " — too wet, add browns"
	return " — balanced ✓"


# Rough "days remaining" estimate — useful for the player but not a hard
# contract. Uses the same thresholds pile.gd drives its state machine on.
func _estimate_days_to_next(state: String) -> int:
	match state:
		Pile.S_TRIGGERED:
			return max(0, Pile.HOT_RAMP_DAYS - _pile.days_in_state)
		Pile.S_HOT:
			return max(0, _pile.days_until_turn_window)
		Pile.S_TURN_WINDOW:
			return max(0, Pile.TURN_WINDOW_MAX - _pile.days_in_state)
		Pile.S_COOLING:
			return max(0, Pile.COOLING_DAYS - _pile.days_in_state)
		Pile.S_CURING:
			return max(0, Pile.CURING_DAYS - _pile.days_in_state)
	return -1


# Display label for a pile variant — the variant field on Pile is one of
# "cold-pile", "hot-pile", etc. Keeps the header informative when the
# player rotates across tier scenes.
func _variant_label(variant: String) -> String:
	match variant:
		"cold-pile":
			return "Cold Pile"
		"hot-pile":
			return "Hot Pile"
		"worm-bin":
			return "Worm Bin"
		"bokashi-bucket":
			return "Bokashi Bucket"
		"compost-tea-brewer":
			return "Tea Brewer"
		"johnson-su":
			return "Johnson-Su Bioreactor"
	return "Compost Pile"
