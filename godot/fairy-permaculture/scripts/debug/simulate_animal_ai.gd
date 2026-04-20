## Fairy Permaculture — headless sim: Phase-3 Animal AI contract.
##
## Verifies the AnimalBehaviorContract invariants from the
## fp-animal-ai-engineer AGENT.md. Mirrors the existing sim-harness
## idioms (simulate_animals.gd, simulate_animal_phase2.gd) so CI can
## run the whole lot with one command.
##
## What it asserts:
##   1. Locomotion: position changes over N process-frames in IDLE.
##   2. Hunger → STARVING → DEAD → Carcass spawns.
##   3. Click interaction: bond_level increments (max 1/day cap).
##   4. Thriving tier transitions fire on needs restored.
##   5. Containment: animal beyond radius clamps back OR escape flag fires.
##   6. Escape recovery: round_up() resets flag + teleports home.
##   7. Environmental influence: chicken-scratched note appears on day-tick.
##   8. LifetimeStats: animals_born counter bumped, first_chicken_day stamped.
##   9. Biodiversity unlock: 3 species → companion_planting unlocked.
##  10. Save/load: phase3 fields round-trip through
##      AnimalEntity.serialize_phase3 / hydrate_phase3.
##
## Log → logs/animal-ai-sim.log + stdout. PASS / FAIL per assertion.
extends Node3D


const CHICKEN_SCENE: PackedScene = preload("res://scenes/animals/chicken.tscn")
const PIG_SCENE: PackedScene = preload("res://scenes/animals/pig.tscn")
const GOAT_SCENE: PackedScene = preload("res://scenes/animals/goat.tscn")
const COOP_SCENE: PackedScene = preload("res://scenes/chicken_coop.tscn")
const PADDOCK_SCENE: PackedScene = preload("res://scenes/pig_paddock.tscn")
const GOAT_SHED_SCENE: PackedScene = preload("res://scenes/goat_shed.tscn")

const LOG_PATH: String = "res://logs/animal-ai-sim.log"


var _log_file: FileAccess
var _errors: int = 0
var _assertions: int = 0
var _death_fired: bool = false


func _on_hen_died(_h: AnimalEntity) -> void:
	_death_fired = true


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(
		ProjectSettings.globalize_path("res://logs")
	)
	_log_file = FileAccess.open(LOG_PATH, FileAccess.WRITE)
	_log("=== animal-ai-sim started ===")
	_log("godot %s" % Engine.get_version_info().get("string", "?"))
	call_deferred("_run_all_phases")


func _run_all_phases() -> void:
	# Reset lifetime stats so the assertions start from a known baseline.
	if get_node_or_null("/root/LifetimeStats") != null and LifetimeStats.has_method("debug_reset"):
		LifetimeStats.call("debug_reset")
	await _phase_01_locomotion()
	await _phase_02_hunger_starve_die()
	await _phase_03_click_bond()
	await _phase_04_thriving_tier()
	await _phase_05_containment_and_escape()
	await _phase_06_env_influence()
	await _phase_07_lifetime_stats()
	await _phase_08_biodiversity_unlock()
	await _phase_09_save_load_round_trip()
	_finish()


# =============================================================
# Phase 1 — Locomotion
# =============================================================
func _phase_01_locomotion() -> void:
	_log("--- Phase 1: locomotion (IDLE jitter) ---")
	var coop: Node3D = COOP_SCENE.instantiate()
	add_child(coop)
	coop.global_position = Vector3(0, 0, 0)
	await get_tree().process_frame
	var hen: AnimalEntity = _spawn_chicken(coop, 200)
	var start_pos: Vector3 = hen.global_position
	# Run ~120 frames of _process so IDLE jitter moves the animal.
	for i in range(120):
		await get_tree().process_frame
	var drift: float = (hen.global_position - start_pos).length()
	_assert(drift > 0.05, "Locomotion: chicken drifted %.3f m from spawn in 120 frames" % drift)
	coop.queue_free()
	hen.queue_free()
	await get_tree().process_frame


# =============================================================
# Phase 2 — Hunger → STARVING → Dead → Carcass
# =============================================================
func _phase_02_hunger_starve_die() -> void:
	_log("--- Phase 2: hunger → starvation → carcass ---")
	var coop: Node3D = COOP_SCENE.instantiate()
	add_child(coop)
	coop.global_position = Vector3(40, 0, 0)
	await get_tree().process_frame
	# Short max_age + zero forage_tiles so only the feeder can feed.
	var hen: AnimalEntity = _spawn_chicken(coop, 60)
	hen.forage_tiles = []  # block forage path
	# Reset feeder contents so hen starves.
	if coop.has_method("consume_feeder"):
		# nothing to do — feeder starts empty-ish; we also zero explicit.
		pass
	coop.feeder_contents["plant_trim"] = 0.0
	coop.feeder_contents["seeds"] = 0.0
	# Hunger rate = 2.0/day; forage blocked → hunger climbs. Tick until dead.
	# Use a member flag (not a local captured by lambda) so the death signal
	# has a stable target. GDScript closures copy locals at capture time.
	_death_fired = false
	hen.died.connect(_on_hen_died)
	for day in range(80):
		hen.day_tick()
		if hen.state == "dead":
			break
	_assert(_death_fired, "Starve → die fired `died` signal within 80 days")
	# Carcass — scene tree should now hold a Carcass_chicken sibling.
	await get_tree().process_frame
	await get_tree().process_frame
	var carcass_count: int = 0
	for n in get_children():
		if String(n.name).begins_with("Carcass_"):
			carcass_count += 1
	_assert(carcass_count >= 1, "Carcass node spawned after death (found %d)" % carcass_count)
	coop.queue_free()
	await get_tree().process_frame


# =============================================================
# Phase 3 — Click bond (1/day cap + max 5)
# =============================================================
func _phase_03_click_bond() -> void:
	_log("--- Phase 3: click interaction + bond cap ---")
	var coop: Node3D = COOP_SCENE.instantiate()
	add_child(coop)
	coop.global_position = Vector3(80, 0, 0)
	await get_tree().process_frame
	var hen: AnimalEntity = _spawn_chicken(coop, 400)
	# Force multi-click same day — bond should only increment once.
	hen._on_clicked()
	hen._on_clicked()
	hen._on_clicked()
	_assert(hen.bond_level == 1, "Bond capped at 1/day (got %d)" % hen.bond_level)
	# Advance 5 "days" — `_on_clicked()` reads Scheduler.day, so we bump
	# that directly (the animal's `day_tick()` alone doesn't change the
	# scheduler clock, it just ages the animal).
	for d in range(5):
		Scheduler.day += 1
		hen.day_tick()
		hen._on_clicked()
	_assert(hen.bond_level == 5, "Bond reaches 5 after 5 days of petting (got %d)" % hen.bond_level)
	# 6th day — should stay capped at 5.
	Scheduler.day += 1
	hen.day_tick()
	hen._on_clicked()
	_assert(hen.bond_level == 5, "Bond hard-capped at 5 (got %d)" % hen.bond_level)
	_assert(hen.nickname != "", "Nickname stamped at bond 5 (got '%s')" % hen.nickname)
	coop.queue_free()
	hen.queue_free()
	await get_tree().process_frame


# =============================================================
# Phase 4 — Thriving tier transitions
# =============================================================
func _phase_04_thriving_tier() -> void:
	_log("--- Phase 4: thriving tier transitions ---")
	var coop: Node3D = COOP_SCENE.instantiate()
	add_child(coop)
	coop.global_position = Vector3(120, 0, 0)
	await get_tree().process_frame
	var hen: AnimalEntity = _spawn_chicken(coop, 500)
	# Baseline — at content.
	hen.day_tick()
	var tier_start: String = hen.thriving_tier
	# Drive toward suffering — force hunger + thirst high, clear flock.
	hen.hunger = 95.0
	hen.thirst = 95.0
	hen.health = 40.0
	hen.mood = 20.0
	hen.day_tick()
	_assert(hen.thriving_tier in ["stressed", "suffering"],
		"Thriving drops to stressed/suffering under high need (got %s, started %s)" % [hen.thriving_tier, tier_start])
	# Recover — reset needs high + bond.
	hen.hunger = 5.0
	hen.thirst = 5.0
	hen.health = 100.0
	hen.mood = 95.0
	hen.bond_level = 5
	hen.day_tick()
	_assert(hen.thriving_score >= 70,
		"Thriving score recovers to >=70 (got %d)" % hen.thriving_score)
	coop.queue_free()
	hen.queue_free()
	await get_tree().process_frame


# =============================================================
# Phase 5 — Containment + escape + round_up
# =============================================================
func _phase_05_containment_and_escape() -> void:
	_log("--- Phase 5: containment clamp + escape + round-up ---")
	var shed: Node3D = GOAT_SHED_SCENE.instantiate()
	add_child(shed)
	shed.global_position = Vector3(160, 0, 0)
	await get_tree().process_frame
	var doe: AnimalEntity = GOAT_SCENE.instantiate() as AnimalEntity
	doe.override_max_age_days = 600
	add_child(doe)
	doe.global_position = shed.global_position
	doe.register_with_habitat(shed)
	await get_tree().process_frame
	# Clamp test: shove the goat 20 m away; locomotion_tick should clamp
	# it back within containment_radius (7.0).
	doe.global_position = shed.global_position + Vector3(20, 0, 0)
	await get_tree().process_frame
	await get_tree().process_frame
	await get_tree().process_frame
	var d: float = doe.global_position.distance_to(shed.global_position)
	_assert(d <= doe.containment_radius + 0.5,
		"Clamp pulls stray goat within radius (%.2f m vs %.2f)" % [d, doe.containment_radius])
	# Escape test: force escape flag, verify round_up restores.
	doe._trigger_escape()
	_assert(doe.escaped_flag, "Escape flag set by _trigger_escape")
	doe.round_up()
	_assert(not doe.escaped_flag, "round_up clears escape flag")
	shed.queue_free()
	doe.queue_free()
	await get_tree().process_frame


# =============================================================
# Phase 6 — Env influence note appears
# =============================================================
func _phase_06_env_influence() -> void:
	_log("--- Phase 6: env-influence note ---")
	var coop: Node3D = COOP_SCENE.instantiate()
	add_child(coop)
	coop.global_position = Vector3(200, 0, 0)
	await get_tree().process_frame
	var hen: AnimalEntity = _spawn_chicken(coop, 500)
	hen.day_tick()
	# Chicken override returns "Chicken-scratched (+0.01 OM today)".
	_assert(hen.last_env_note.contains("Chicken"),
		"Chicken env-influence note set: '%s'" % hen.last_env_note)
	# Pig env-influence smoke test.
	var pad: Node3D = PADDOCK_SCENE.instantiate()
	add_child(pad)
	pad.global_position = Vector3(220, 0, 0)
	await get_tree().process_frame
	var pig_a: AnimalEntity = PIG_SCENE.instantiate() as AnimalEntity
	pig_a.override_max_age_days = 600
	add_child(pig_a)
	pig_a.global_position = pad.global_position
	pig_a.register_with_habitat(pad)
	await get_tree().process_frame
	pig_a.day_tick()
	_assert(pig_a.last_env_note.contains("Pig"),
		"Pig env-influence note set: '%s'" % pig_a.last_env_note)
	coop.queue_free()
	pad.queue_free()
	hen.queue_free()
	pig_a.queue_free()
	await get_tree().process_frame


# =============================================================
# Phase 7 — LifetimeStats
# =============================================================
func _phase_07_lifetime_stats() -> void:
	_log("--- Phase 7: LifetimeStats counters ---")
	var ls: Node = get_node_or_null("/root/LifetimeStats")
	if ls == null:
		_assert(false, "LifetimeStats autoload not registered")
		return
	ls.call("debug_reset")
	var coop: Node3D = COOP_SCENE.instantiate()
	add_child(coop)
	coop.global_position = Vector3(260, 0, 0)
	await get_tree().process_frame
	var hen: AnimalEntity = _spawn_chicken(coop, 500)
	# Pump a day-tick so LifetimeStats sweeps.
	Scheduler.emit_signal("day_advanced", Scheduler.day, Scheduler.current_season(), Scheduler.year)
	await get_tree().process_frame
	var born: float = float(ls.call("get_stat", "animals_born_total"))
	_assert(born >= 1.0, "animals_born_total bumped (got %.1f)" % born)
	var firsts: Dictionary = ls.call("get_firsts")
	_assert(firsts.has("first_chicken_day"), "first_chicken_day stamped in firsts")
	coop.queue_free()
	hen.queue_free()
	await get_tree().process_frame


# =============================================================
# Phase 8 — Biodiversity unlock
# =============================================================
func _phase_08_biodiversity_unlock() -> void:
	_log("--- Phase 8: biodiversity unlocks (3 species → companion_planting) ---")
	# 3 distinct owned species: chicken + pig + goat.
	var coop: Node3D = COOP_SCENE.instantiate()
	add_child(coop)
	coop.global_position = Vector3(300, 0, 0)
	var pad: Node3D = PADDOCK_SCENE.instantiate()
	add_child(pad)
	pad.global_position = Vector3(320, 0, 0)
	var shed: Node3D = GOAT_SHED_SCENE.instantiate()
	add_child(shed)
	shed.global_position = Vector3(340, 0, 0)
	await get_tree().process_frame
	_spawn_chicken(coop, 500)
	var pig_a: AnimalEntity = PIG_SCENE.instantiate() as AnimalEntity
	pig_a.override_max_age_days = 500
	add_child(pig_a)
	pig_a.register_with_habitat(pad)
	pig_a.add_to_group("animals")
	var doe: AnimalEntity = GOAT_SCENE.instantiate() as AnimalEntity
	doe.override_max_age_days = 500
	add_child(doe)
	doe.register_with_habitat(shed)
	doe.add_to_group("animals")
	await get_tree().process_frame
	# Pump the biodiversity check.
	if Progression.has_method("_check_biodiversity_thresholds"):
		Progression.call("_check_biodiversity_thresholds")
	_assert(Progression.call("is_biodiversity_unlocked", Progression.BIODIVERSITY_NODE_COMPANION),
		"3-species count → companion_planting unlocked")
	# Specific-species: chicken → egg_recipes.
	_assert(Progression.call("is_biodiversity_unlocked", Progression.BIODIVERSITY_NODE_EGG_RECIPES),
		"chicken owned → egg_recipes unlocked")
	coop.queue_free()
	pad.queue_free()
	shed.queue_free()
	await get_tree().process_frame


# =============================================================
# Phase 9 — Save/load round-trip for phase3 fields
# =============================================================
func _phase_09_save_load_round_trip() -> void:
	_log("--- Phase 9: phase3 save/load round-trip ---")
	var coop: Node3D = COOP_SCENE.instantiate()
	add_child(coop)
	coop.global_position = Vector3(400, 0, 0)
	await get_tree().process_frame
	var hen: AnimalEntity = _spawn_chicken(coop, 500)
	hen.bond_level = 3
	hen.nickname = "Henrietta"
	hen.thriving_tier = "thriving"
	hen.thriving_score = 88
	hen.escaped_flag = false
	hen.containment_radius = 5.0
	hen.containment_strength = 0.95
	var payload: Dictionary = hen.serialize_phase3()
	_assert(int(payload.get("bond_level")) == 3, "serialize_phase3 carries bond_level")
	# Fresh animal; hydrate.
	var hen2: AnimalEntity = _spawn_chicken(coop, 500)
	hen2.hydrate_phase3(payload)
	_assert(hen2.bond_level == 3, "hydrate_phase3 restores bond")
	_assert(hen2.nickname == "Henrietta", "hydrate_phase3 restores nickname")
	_assert(hen2.thriving_tier == "thriving", "hydrate_phase3 restores tier")
	coop.queue_free()
	await get_tree().process_frame


# =============================================================
# Helpers
# =============================================================
func _spawn_chicken(coop: Node3D, max_age: int) -> AnimalEntity:
	var hen: AnimalEntity = CHICKEN_SCENE.instantiate() as AnimalEntity
	hen.override_max_age_days = max_age
	add_child(hen)
	hen.global_position = coop.global_position
	hen.register_with_habitat(coop)
	hen.add_to_group("animals")
	# Wire into the coop's flock list for flockmate counting.
	if coop.get("flock") is Array:
		(coop.flock as Array).append(hen)
	return hen


func _assert(cond: bool, msg: String) -> void:
	_assertions += 1
	if cond:
		_log("PASS: %s" % msg)
	else:
		_errors += 1
		_log("FAIL: %s" % msg)


func _log(s: String) -> void:
	print(s)
	if _log_file != null:
		_log_file.store_line(s)
		_log_file.flush()


func _finish() -> void:
	_log("=== animal-ai-sim complete: %d / %d assertions passed (%d errors) ===" % [
		_assertions - _errors, _assertions, _errors,
	])
	if _log_file != null:
		_log_file.close()
	# Exit code — 0 = green, 1 = red. Headless CI flag.
	var exit_code: int = 0 if _errors == 0 else 1
	get_tree().quit(exit_code)
