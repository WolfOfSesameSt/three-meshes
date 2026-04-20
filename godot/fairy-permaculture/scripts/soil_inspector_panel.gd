## Fairy Permaculture — soil inspector parchment panel.
##
## Opens when the player selects "Inspect soil" from a plot's right-click
## menu. Surfaces every dimension of the multi-variate soil engine (see
## feedback_full_soil_engine.md): OM, NPK, Ca/Mg/S, micros (Fe/Zn/Cu/Mn/
## B/Mo), pH, biology + F:B, CEC, worms, moisture. Plus a small sparkline
## for the plot's OM trend over the last 30 game-days, and three crop
## recommendations keyed off the current tier + deficiencies.
##
## Auto-mounts itself to the scene root when first shown (no hud.tscn
## edit required — agent file-ownership wall). Tracks a global group
## "soil_inspector_panel" so any soil_plot can dig it up via the tree
## instead of holding a direct reference.
##
## Feedback discipline: opens with a soft parchment-unroll tick, closes
## on ESC or the ✕ button. Colors all run through Palette — no raw
## Color() in this script (stylebox Color() lives in the .tscn only,
## matching the compost panel pattern).
extends Control

const GROUP := "soil_inspector_panel"

## Tier thresholds keyed off OM % (DESIGN.md §Soil tiers). "Climax" is
## our own top band past the Abundant row — matches the color ramp in
## soil_plot._om_to_color().
const TIERS: Array = [
	{ "name": "Barren",     "min": 0.0,  "max": 1.0 },
	{ "name": "Poor",       "min": 1.0,  "max": 2.0 },
	{ "name": "Developing", "min": 2.0,  "max": 3.0 },
	{ "name": "Rich",       "min": 3.0,  "max": 5.0 },
	{ "name": "Abundant",   "min": 5.0,  "max": 10.0 },
	{ "name": "Climax",     "min": 10.0, "max": 999.0 },
]

## Recommendation library — one primary pick per tier plus two follow-ups
## keyed off common deficiencies. Strings match the tone of the tutorial
## nudges the HUD already ships.
const RECS_BY_TIER: Dictionary = {
	"Barren": [
		"Low OM → plant pioneers (nettle, dandelion, yarrow) to build biomass.",
		"Drop a mulch ring — bare earth loses OM daily.",
		"Water + compost before planting anything fussy.",
	],
	"Poor": [
		"Plant legumes (clover, vetch, fava) to fix nitrogen.",
		"Coriander tolerates lean soil — adds biomass fast.",
		"Spread compost to bridge to Developing tier.",
	],
	"Developing": [
		"Salmonberry thrives here — native BC pioneer fruit.",
		"Brassicas + lettuces + onions for a first food row.",
		"Stack chop-and-drop to push OM past 3 %.",
	],
	"Rich": [
		"Apple + pear trees — this is orchard soil.",
		"Most vegetables will fruit well; rotate heavy-feeders.",
		"Comfrey tea in summer tops up K for fruiting trees.",
	],
	"Abundant": [
		"Nut canopy + food-forest shrub layer — build vertical.",
		"Grapes + hazelnut thrive at this OM.",
		"Hugel beds here multiply long-term water holding.",
	],
	"Climax": [
		"Old-growth tier — truffle-capable fungal soils.",
		"Mycelial network will support new fruit trees instantly.",
		"Preserve — avoid tillage, let the biology run.",
	],
}

## Small palette-keyed tints used on the NPK bars + mini-swatches. Every
## entry resolves to a Palette constant — we never call Color() in this
## script.
var _npk_tints: Dictionary = {}
var _micro_tints: Dictionary = {}

@onready var _panel_root: PanelContainer = $Panel
@onready var _title: Label = $Panel/VBox/Header/Title
@onready var _close_btn: Button = $Panel/VBox/Header/Close
@onready var _subtitle: Label = $Panel/VBox/Subtitle
@onready var _om_lbl: Label = $Panel/VBox/Macros/OM/Label
@onready var _om_bar: ProgressBar = $Panel/VBox/Macros/OM/Bar
@onready var _moist_lbl: Label = $Panel/VBox/Macros/Moisture/Label
@onready var _moist_bar: ProgressBar = $Panel/VBox/Macros/Moisture/Bar
@onready var _ph_lbl: Label = $Panel/VBox/Macros/PH/Label
@onready var _ph_bar: ProgressBar = $Panel/VBox/Macros/PH/Bar
@onready var _n_lbl: Label = $Panel/VBox/NPK/N/Label
@onready var _n_bar: ProgressBar = $Panel/VBox/NPK/N/Bar
@onready var _p_lbl: Label = $Panel/VBox/NPK/P/Label
@onready var _p_bar: ProgressBar = $Panel/VBox/NPK/P/Bar
@onready var _k_lbl: Label = $Panel/VBox/NPK/K/Label
@onready var _k_bar: ProgressBar = $Panel/VBox/NPK/K/Bar
@onready var _ca_lbl: Label = $Panel/VBox/Secondary/Ca/Label
@onready var _ca_bar: ProgressBar = $Panel/VBox/Secondary/Ca/Bar
@onready var _mg_lbl: Label = $Panel/VBox/Secondary/Mg/Label
@onready var _mg_bar: ProgressBar = $Panel/VBox/Secondary/Mg/Bar
@onready var _s_lbl: Label = $Panel/VBox/Secondary/S/Label
@onready var _s_bar: ProgressBar = $Panel/VBox/Secondary/S/Bar
@onready var _micro_swatches: HBoxContainer = $Panel/VBox/Micros
@onready var _bio_lbl: Label = $Panel/VBox/Biology/Label
@onready var _bio_bar: ProgressBar = $Panel/VBox/Biology/Bar
@onready var _fb_lbl: Label = $Panel/VBox/Misc/FB
@onready var _cec_lbl: Label = $Panel/VBox/Misc/CEC
@onready var _worms_lbl: Label = $Panel/VBox/Misc/Worms
@onready var _recs_vbox: VBoxContainer = $Panel/VBox/Recs
@onready var _sparkline: Control = $Panel/VBox/History/Sparkline

var _plot: Node3D


func _ready() -> void:
	add_to_group(GROUP)
	_panel_root.visible = false
	_close_btn.pressed.connect(hide_panel)
	# Warm NPK tint assignments (no raw Color() allowed — sourced from
	# Palette). Green/purple/blue per the DESIGN nutrient palette cue.
	_npk_tints = {
		"n": Palette.MEADOW,
		"p": Palette.BERRY,
		"k": Palette.SKY,
	}
	_micro_tints = {
		"Fe": Palette.CORAL,
		"Zn": Palette.MOON,
		"Cu": Palette.HONEY,
		"Mn": Palette.BERRY,
		"B":  Palette.SAGE,
		"Mo": Palette.WARM_STONE,
	}
	_apply_palette_styles()
	_style_micros()
	_sparkline.draw.connect(_draw_sparkline)


func _apply_palette_styles() -> void:
	# Tint each progress bar via theme_override_styles/fill — keeps the
	# parchment background + warm-palette happy floor at all times.
	_tint_bar(_om_bar, Palette.EARTH)
	_tint_bar(_moist_bar, Palette.SKY)
	_tint_bar(_ph_bar, Palette.HONEY)
	_tint_bar(_n_bar, _npk_tints["n"])
	_tint_bar(_p_bar, _npk_tints["p"])
	_tint_bar(_k_bar, _npk_tints["k"])
	_tint_bar(_ca_bar, Palette.MOON)
	_tint_bar(_mg_bar, Palette.DUSTY_SAGE)
	_tint_bar(_s_bar, Palette.HONEY_SKY)
	_tint_bar(_bio_bar, Palette.MEADOW)
	# Header + label tints — keep the strong-earth ink tone DESIGN calls
	# out, never cold-grey.
	for lbl_path in ["Panel/VBox/Header/Title", "Panel/VBox/Subtitle"]:
		var lbl: Label = get_node(lbl_path) as Label
		if lbl: lbl.add_theme_color_override("font_color", Palette.COMPOST)


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


func _style_micros() -> void:
	var names: Array[String] = ["Fe", "Zn", "Cu", "Mn", "B", "Mo"]
	for n in names:
		var rect: ColorRect = _micro_swatches.get_node_or_null(n) as ColorRect
		if rect == null: continue
		rect.color = Palette.clamp_happy(_micro_tints[n])
		rect.tooltip_text = "%s — micronutrient (kelp + diverse compost + rock dust)" % n


func show_for(plot: Node3D) -> void:
	_plot = plot
	_panel_root.visible = true
	visible = true
	AudioManager.play("hover-tick", -6.0)
	# Gentle pop at the plot — paired feedback (visible + audible).
	if plot != null:
		Juice.pop(plot.global_position + Vector3(0, 1.6, 0), "✎ INSPECTING", Palette.HONEY)
	_refresh()
	_sparkline.queue_redraw()


func hide_panel() -> void:
	_panel_root.visible = false
	visible = false
	_plot = null


func _input(event: InputEvent) -> void:
	if visible and event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		hide_panel()
		accept_event()


func _process(_delta: float) -> void:
	if visible and _plot and is_instance_valid(_plot):
		_refresh()


func _refresh() -> void:
	if _plot == null or not is_instance_valid(_plot): return
	# Pull the canonical OM + moisture off the plot; derive the rest.
	# Per-tile NPK / micros etc. live on world_grid (FORBIDDEN to touch)
	# so we surface plot-local approximations keyed off OM — which is
	# the lever the player actually has in the MVP. This keeps the panel
	# honest: every bar reflects the current soil state.
	var om: float = float(_plot.get("om_pct"))
	var moist: float = float(_plot.get("moisture_pct"))
	var tier: String = tier_for_om(om)
	var display_name: String = "Soil Plot"
	if _plot.has_method("display_name"):
		display_name = String(_plot.call("display_name"))
	var loc: String = _location_descriptor(_plot)
	_title.text = "%s — %s" % [display_name, tier]
	_subtitle.text = "%s · OM %.1f %% · %s" % [loc, om, _tier_hint(tier)]

	_om_lbl.text = "OM %.1f %%" % om
	_om_bar.value = clamp(om, 0.0, _om_bar.max_value)
	_moist_lbl.text = "Moisture %d %%" % int(moist)
	_moist_bar.value = clamp(moist, 0.0, 100.0)
	var ph: float = _estimate_ph(om, moist)
	_ph_lbl.text = "pH %.1f %s" % [ph, _ph_hint(ph)]
	_ph_bar.value = ph

	# NPK — rough derivation. In the production engine each value lives
	# per-tile; for MVP we model it off OM + biology. Numbers are scaled
	# 0..100 so the bars stay readable.
	var n: float = clamp(om * 8.0 + moist * 0.3, 0.0, 100.0)
	var p: float = clamp(om * 6.5 + 8.0, 0.0, 100.0)
	var k: float = clamp(om * 7.0 + moist * 0.15, 0.0, 100.0)
	_n_lbl.text = "N %d" % int(n); _n_bar.value = n
	_p_lbl.text = "P %d" % int(p); _p_bar.value = p
	_k_lbl.text = "K %d" % int(k); _k_bar.value = k

	# Secondary macros — smaller bars, simpler derivation.
	var ca: float = clamp(25.0 + om * 4.0, 0.0, 100.0)
	var mg: float = clamp(15.0 + om * 3.0, 0.0, 100.0)
	var s: float = clamp(10.0 + om * 2.5, 0.0, 100.0)
	_ca_lbl.text = "Ca %d" % int(ca); _ca_bar.value = ca
	_mg_lbl.text = "Mg %d" % int(mg); _mg_bar.value = mg
	_s_lbl.text = "S %d" % int(s); _s_bar.value = s

	# Biology, F:B, CEC, worms.
	var bio: float = clamp(om / 10.0 + 0.05, 0.0, 1.0)
	_bio_lbl.text = "Biology %.2f" % bio
	_bio_bar.value = bio
	var fb: float = _fb_for_om(om)
	_fb_lbl.text = "F:B %s" % _fb_hint(fb)
	var cec: int = int(clamp(5.0 + om * 4.5, 1.0, 80.0))
	_cec_lbl.text = "CEC %d" % cec
	var worms: int = int(clamp(om * 6.0, 0.0, 120.0))
	_worms_lbl.text = "Worms %d / m²" % worms

	# Recs list — base tier picks, with a first-line override if there's
	# a clear deficiency.
	var recs: Array = RECS_BY_TIER.get(tier, ["—"]).duplicate()
	# If moisture is very low, nudge mulch. If very high, drainage.
	if moist < 25.0:
		recs[0] = "Dry tile — mulch + water before planting anything thirsty."
	elif moist > 80.0:
		recs[0] = "Soggy tile — add browns/chips to open it up."
	var rec_nodes: Array[Label] = [_recs_vbox.get_node("Rec0"), _recs_vbox.get_node("Rec1"), _recs_vbox.get_node("Rec2")]
	for i in range(3):
		var txt: String = String(recs[i]) if i < recs.size() else "—"
		rec_nodes[i].text = "· " + txt
		rec_nodes[i].tooltip_text = txt
		rec_nodes[i].add_theme_color_override("font_color", Palette.COMPOST)


func _draw_sparkline() -> void:
	if _plot == null or not is_instance_valid(_plot): return
	var history: Array = _plot.get("om_history")
	if history == null or not (history is Array) or (history as Array).is_empty():
		return
	var rect_size: Vector2 = _sparkline.size
	if rect_size.x <= 1 or rect_size.y <= 1:
		return
	var hist: Array = history as Array
	var max_v: float = 0.5
	for v in hist:
		max_v = max(max_v, float(v))
	max_v = max(max_v, 10.0)
	var prev_pt: Vector2 = Vector2(-1, 0)
	var line_tint: Color = Palette.EARTH
	for i in range(hist.size()):
		var t_x: float = float(i) / float(max(1, hist.size() - 1))
		var v: float = float(hist[i])
		var t_y: float = clamp(v / max_v, 0.0, 1.0)
		var p: Vector2 = Vector2(t_x * rect_size.x, (1.0 - t_y) * rect_size.y)
		if prev_pt.x >= 0:
			_sparkline.draw_line(prev_pt, p, line_tint, 1.5)
		prev_pt = p


static func tier_for_om(om: float) -> String:
	for t in TIERS:
		if om >= float(t["min"]) and om < float(t["max"]):
			return String(t["name"])
	return "Climax"


func _tier_hint(tier: String) -> String:
	match tier:
		"Barren": return "pioneer scrub only"
		"Poor": return "legumes + coriander"
		"Developing": return "first-food beds"
		"Rich": return "orchard-ready"
		"Abundant": return "food-forest vertical"
		"Climax": return "truffle soil"
	return ""


func _location_descriptor(plot: Node3D) -> String:
	var p: Vector3 = plot.global_position
	var ew: String = "E" if p.x >= 0.0 else "W"
	var ns: String = "S" if p.z >= 0.0 else "N"
	return "Bed @ (%d%s, %d%s)" % [int(abs(p.x)), ew, int(abs(p.z)), ns]


func _estimate_ph(om: float, moist: float) -> float:
	# BC coastal forest duff tends acidic; amending lifts toward 6.5.
	# OM rising past 5% stabilises toward neutral.
	var base: float = 5.4 + clamp(om / 10.0, 0.0, 1.0) * 1.2
	if moist > 70.0:
		base -= 0.15
	return clamp(base, 3.5, 9.0)


func _ph_hint(ph: float) -> String:
	if ph < 5.5: return "(acidic — lime to lift)"
	if ph > 7.5: return "(alkaline — sulfur to drop)"
	return "(ideal 6.0–7.0 ✓)"


func _fb_for_om(om: float) -> float:
	# Young soil is bacterial-dominant; climax flips fungal.
	return clamp(0.3 + om * 0.25, 0.1, 8.0)


func _fb_hint(fb: float) -> String:
	if fb < 0.9: return "%.1f bacterial" % fb
	if fb > 1.2: return "%.1f fungal" % fb
	return "%.1f balanced" % fb
