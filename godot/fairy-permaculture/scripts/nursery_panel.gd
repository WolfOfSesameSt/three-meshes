## Fairy Permaculture — nursery sprouting-bed panel.
##
## Shows the 4 slots (state + progress), sow buttons for each species,
## and a Transplant button that pops the first-ready slot out to the
## nearest bare soil plot.
extends Control

@onready var _panel: PanelContainer = $Panel
@onready var _title: Label = $Panel/VBox/Header/Title
@onready var _close_btn: Button = $Panel/VBox/Header/Close
@onready var _slots_label: Label = $Panel/VBox/Slots
@onready var _sow_berry: Button = $Panel/VBox/Actions/SowBerry
@onready var _sow_comfrey: Button = $Panel/VBox/Actions/SowComfrey
@onready var _transplant: Button = $Panel/VBox/Transplant
@onready var _hint: Label = $Panel/VBox/Hint

var _bed: Node3D


func _ready() -> void:
	_close_btn.pressed.connect(hide_panel)
	_sow_berry.pressed.connect(func(): _bed.sow("salmonberry"); _refresh())
	_sow_comfrey.pressed.connect(func(): _bed.sow("comfrey-bocking14"); _refresh())
	_transplant.pressed.connect(func(): _bed.transplant_first_ready(); _refresh())


func _input(event: InputEvent) -> void:
	if visible and event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		hide_panel()


func show_for(bed: Node3D) -> void:
	_bed = bed
	visible = true
	_refresh()


func hide_panel() -> void:
	visible = false
	_bed = null


func _process(_delta: float) -> void:
	if visible and _bed:
		_refresh()


func _refresh() -> void:
	if not _bed: return
	_title.text = "🌱 Sprouting Bed"
	var lines: Array = []
	for i in range(_bed.SLOT_COUNT):
		var s: Variant = _bed.slots[i]
		if s == null:
			lines.append("[%d] empty" % (i + 1))
		else:
			var days: int = int(s["days"])
			if days >= _bed.DAYS_TO_READY:
				lines.append("[%d] %s — READY ✦" % [i + 1, _friendly(s["species"])])
			else:
				lines.append("[%d] %s (%d / %d d)" % [i + 1, _friendly(s["species"]), days, _bed.DAYS_TO_READY])
	_slots_label.text = "\n".join(lines)

	var empty: int = _bed.empty_slot_count()
	var ready: int = _bed.ready_slot_count()
	_sow_berry.disabled = empty == 0 or FarmTotals.biomass < _bed.COST_BIOMASS
	_sow_comfrey.disabled = empty == 0 or FarmTotals.biomass < _bed.COST_BIOMASS
	_transplant.disabled = ready == 0
	_transplant.text = ("Transplant %d ready → nearest bare plot" % ready) if ready > 0 else "Transplant (nothing ready)"
	_sow_berry.text = "Sow Salmonberry\n(1 biomass)"
	_sow_comfrey.text = "Sow Comfrey\n(1 biomass)"
	if empty == 0 and ready == 0:
		_hint.text = "All slots full and growing — come back in a few days."
	elif ready > 0:
		_hint.text = "Click Transplant to drop a mature bush at the nearest bare plot."
	elif FarmTotals.biomass < _bed.COST_BIOMASS:
		_hint.text = "Need 1 biomass per seed — chop a comfrey or a ripe bush for it."
	else:
		_hint.text = "Sow seeds here and they sprout ~10× faster than in the wild."


func _friendly(id: String) -> String:
	match id:
		"salmonberry": return "Salmonberry"
		"comfrey-bocking14": return "Comfrey"
		_: return id
