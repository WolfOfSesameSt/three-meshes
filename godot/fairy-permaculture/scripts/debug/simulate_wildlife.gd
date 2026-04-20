## Fairy Permaculture — headless wildlife ecology simulation.
##
## Verifies the self-balancing ecology loop shipped by fp-permaculture-designer:
##
##   1. Wildlife autoload loads the wild-species pool from DataStore.
##   2. A force-spawned "owl-box" node in the `owl_boxes` group is picked
##      up by _collect_habitats on the next day-tick.
##   3. Rodent pressure is bumped past the 20-threshold and a barn owl
##      cohort immigrates within ~30 day ticks (prob 0.12/day).
##   4. Once the cohort is alive, it drains rodent pressure 12/day and the
##      pressure curve bends back toward zero.
##   5. The cohort ages out on its N-dist lifespan and fires
##      `species_departed` with a quiet OM bump.
##
## Writes a trace + PASS/FAIL to logs/wildlife-sim.log.
extends Node

const LOG_PATH := "res://logs/wildlife-sim.log"

var _log_file: FileAccess
var _arrivals: Array[String] = []
var _departures: Array[String] = []


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(
		ProjectSettings.globalize_path("res://logs")
	)
	_log_file = FileAccess.open(LOG_PATH, FileAccess.WRITE)
	_log("=== wildlife-sim started ===")
	call_deferred("_run")


func _run() -> void:
	var errors: int = 0

	# ----- 1. Wildlife species pool loaded ------------------------------
	if Wildlife.wild_defs.size() < 10:
		_log("FAIL: wild_defs has %d species (< 10)" % Wildlife.wild_defs.size())
		errors += 1
	else:
		_log("PASS: wild_defs loaded %d species" % Wildlife.wild_defs.size())

	# ----- 2. Ship a fake owl-box into the tree -------------------------
	var owl_box: Node3D = Node3D.new()
	owl_box.name = "FakeOwlBox"
	owl_box.add_to_group("owl_boxes")
	add_child(owl_box)
	owl_box.global_position = Vector3(2.0, 0.0, 2.0)
	_log("Placed fake owl-box in owl_boxes group")

	# ----- 3. Subscribe + bump rodent pressure --------------------------
	Wildlife.species_arrived.connect(func(id: String, _pos: Vector3, _n: int) -> void:
		_arrivals.append(id)
		_log("species_arrived: %s" % id)
	)
	Wildlife.species_departed.connect(func(id: String, _pos: Vector3) -> void:
		_departures.append(id)
		_log("species_departed: %s" % id)
	)
	Wildlife.debug_clear()
	Wildlife.bump_pest_pressure("rodent", 40.0)

	# ----- 4. Run up to 80 day-ticks; barn-owl SHOULD arrive ------------
	var ticked: int = 0
	for d in range(80):
		Wildlife._on_day_advanced(d, "spring", 0)
		ticked += 1
		if Wildlife.is_present("barn-owl"):
			break
	_log("Ran %d day-ticks before arrival (or timeout)" % ticked)
	if not Wildlife.is_present("barn-owl"):
		_log("FAIL: barn-owl never arrived within 80 day-ticks")
		errors += 1
	else:
		_log("PASS: barn-owl arrived after ~%d day-ticks" % ticked)

	# ----- 5. Predator drains the pest pressure down --------------------
	# Pump rodent back up so we can watch the drain.
	Wildlife.bump_pest_pressure("rodent", 100.0)
	var pressure_before: float = Wildlife.get_pest_pressure("rodent")
	for d in range(5):
		Wildlife._on_day_advanced(100 + d, "summer", 1)
	var pressure_after: float = Wildlife.get_pest_pressure("rodent")
	# The drift is +2/day up vs -12/day down with an owl on-site -> net -10/day.
	# Over 5 days should drop clearly.
	if pressure_after >= pressure_before:
		_log("FAIL: rodent pressure did not drain (before=%.1f, after=%.1f)" % [pressure_before, pressure_after])
		errors += 1
	else:
		_log("PASS: rodent pressure drained %.1f -> %.1f over 5 days" % [pressure_before, pressure_after])

	# ----- 6. N-dist lifespan ages the cohort out -----------------------
	# Force-age the cohort to its max age. We can't easily wait 7 in-game
	# years — reach into the cohort dict and set age past max.
	var c: Dictionary = Wildlife.cohorts.get("barn-owl", {})
	if c.is_empty():
		_log("SKIP: cohort already departed before age test")
	else:
		c["age_days"] = c["max_age_days"] + 1
		Wildlife.cohorts["barn-owl"] = c
		Wildlife._on_day_advanced(999, "autumn", 5)
		if Wildlife.is_present("barn-owl"):
			_log("FAIL: cohort did not retire after age >= max_age_days")
			errors += 1
		elif "barn-owl" in _departures:
			_log("PASS: cohort aged out + species_departed fired")
		else:
			_log("FAIL: cohort gone but species_departed signal didn't fire")
			errors += 1

	# ----- 7. Force-arrival debug path works ----------------------------
	Wildlife.debug_clear()
	var ok: bool = Wildlife.debug_force_arrival("ladybug", Vector3(5, 0, 5))
	if not ok:
		_log("FAIL: debug_force_arrival(ladybug) returned false")
		errors += 1
	elif not Wildlife.is_present("ladybug"):
		_log("FAIL: ladybug not present after force-arrival")
		errors += 1
	else:
		_log("PASS: debug_force_arrival(ladybug) worked")

	# ----- Done ---------------------------------------------------------
	if errors == 0:
		_log("=== wildlife-sim PASS (0 errors) ===")
	else:
		_log("=== wildlife-sim FAIL (%d errors) ===" % errors)
	_log_file.close()
	get_tree().quit(errors)


func _log(msg: String) -> void:
	print("[wildlife-sim] ", msg)
	if _log_file != null:
		_log_file.store_line(msg)
