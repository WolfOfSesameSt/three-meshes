## Fairy Permaculture — pooled SFX player.
##
## Provides `AudioManager.play(key)` — mirrors the JS `audio-pool` so
## scene scripts don't have to pre-load or juggle `AudioStreamPlayer`
## nodes. Keys match the MP3 filenames in `res://audio/`.
##
## Also owns the per-bus volume + mute state (Master / Music / SFX)
## and persists it to `user://settings.cfg` so the settings panel can
## change volumes live and have them stick across sessions.
extends Node

const SFX_DIR := "res://audio/"
const VOICE_CAP := 16

const CONFIG_PATH := "user://settings.cfg"
const CONFIG_SECTION := "audio"

const BUS_MASTER := "Master"
const BUS_MUSIC := "Music"
const BUS_SFX := "SFX"

const DEFAULT_MASTER: float = 100.0
const DEFAULT_MUSIC: float = 80.0
const DEFAULT_SFX: float = 90.0

# ---------- Sound IDs ----------
# Legacy pre-ElevenLabs-batch-2 SFX already routed through the game.
const SFX_BERRY_PICK := "berry-pick"
const SFX_BIOMASS_CHOP := "biomass-chop"
const SFX_COMPOST_SCOOP := "compost-scoop"
const SFX_NEW_FAIRY := "new-fairy"
const SFX_PILE_HOT := "pile-hot"
const SFX_COMPOST_FINISH := "compost-finish"
const SFX_DAY_TRANSITION := "day-transition"
const SFX_HOVER_TICK := "hover-tick"

# Batch 2 (2026-04-19) — animals / kiln / butcher / bone-meal / forage.
const SFX_CHICKEN_CLUCK_01 := "chicken-cluck-01"
const SFX_CHICKEN_CLUCK_02 := "chicken-cluck-02"
const SFX_EGG_DROP := "egg-drop"
const SFX_KILN_FIRE_START := "kiln-fire-start"
const SFX_KILN_CRACKLE_LOOP := "kiln-crackle-loop"
const SFX_BUTCHER_CLEAVER := "butcher-cleaver"
const SFX_BONE_MEAL_POP := "bone-meal-pop"
const SFX_FORAGE_CHIME := "forage-chime"
const SFX_CHICKEN_EAT_PECK := "chicken-eat-peck"

# Batch 2 — water / planting / building / inspection.
const SFX_WATER_SPLASH := "water-splash"
const SFX_STREAM_DRAW := "stream-draw"
const SFX_SPIRAL_PLANT_SETTLE := "spiral-plant-settle"
const SFX_BED_BUILD_PLANK := "bed-build-plank"
const SFX_SOIL_INSPECT_OPEN := "soil-inspect-open"
const SFX_SEEDLING_SPROUT := "seedling-sprout"
const SFX_BLOSSOM_OPEN := "blossom-open"

# Batch 2 — ambient loops + one-shots.
const SFX_POLLINATOR_HUM_LOOP := "pollinator-hum-loop"
const SFX_FAIRY_FLUTTER_LOOP := "fairy-flutter-loop"
const SFX_RAIN_LIGHT_LOOP := "rain-light-loop"
const SFX_WIND_GENTLE_LOOP := "wind-gentle-loop"
const SFX_THUNDER_DISTANT := "thunder-distant"
const SFX_OWL_HOOT := "owl-hoot"

# Batch 2 — seasonal transitions.
const SFX_SEASON_SPRING := "season-spring"
const SFX_SEASON_SUMMER := "season-summer"
const SFX_SEASON_AUTUMN := "season-autumn"
const SFX_SEASON_WINTER := "season-winter"

# ---------- Music IDs ----------
# 45s looping ambient beds, one per time-of-day.
const MUSIC_DAWN_PIANO := "music-dawn-piano"
const MUSIC_NOON_STRINGS := "music-noon-strings"
const MUSIC_EVENING_FLUTE := "music-evening-flute"
const MUSIC_NIGHT_STARS := "music-night-stars"
# Legacy beds (pre-batch-2) still available.
const MUSIC_DAY := "music-day"
const MUSIC_NIGHT := "music-night"
const MUSIC_MILESTONE := "music-milestone"
const MUSIC_TENSE := "music-tense"

# Linear-percent volume per bus (0..100). Kept in GD-land so the
# settings panel has a single source of truth — audio bus db values
# are computed from these on every change.
var _volumes: Dictionary = {
	BUS_MASTER: DEFAULT_MASTER,
	BUS_MUSIC: DEFAULT_MUSIC,
	BUS_SFX: DEFAULT_SFX,
}
var _mutes: Dictionary = {
	BUS_MASTER: false,
	BUS_MUSIC: false,
	BUS_SFX: false,
}

var _streams: Dictionary = {}  # key → AudioStream (SFX + music share pool)
var _active: Array = []        # AudioStreamPlayer (SFX voices)
var _music_player: AudioStreamPlayer = null  # one dedicated music voice
var _music_key: String = ""                   # currently playing music id

# Loop-intent table: any key here will have `loop = true` set on its
# stream when first loaded so long ambient beds don't cut off. Music
# is looped via the dedicated music player, not this table.
const _LOOPED_KEYS := [
	"kiln-crackle-loop", "pollinator-hum-loop", "fairy-flutter-loop",
	"rain-light-loop", "wind-gentle-loop",
]


func _ready() -> void:
	var keys: Array = [
		# Batch 1 — legacy.
		"berry-pick", "biomass-chop", "compost-scoop",
		"new-fairy", "pile-hot", "compost-finish",
		"day-transition", "hover-tick",
		# Batch 2 — animals / kiln / butcher / bone-meal / forage.
		"chicken-cluck-01", "chicken-cluck-02", "egg-drop",
		"kiln-fire-start", "kiln-crackle-loop",
		"butcher-cleaver", "bone-meal-pop",
		"forage-chime", "chicken-eat-peck",
		# Batch 2 — water / planting / building / inspection.
		"water-splash", "stream-draw", "spiral-plant-settle",
		"bed-build-plank", "soil-inspect-open",
		"seedling-sprout", "blossom-open",
		# Batch 2 — ambient loops + one-shots.
		"pollinator-hum-loop", "fairy-flutter-loop",
		"rain-light-loop", "wind-gentle-loop",
		"thunder-distant", "owl-hoot",
		# Batch 2 — seasonal transitions.
		"season-spring", "season-summer",
		"season-autumn", "season-winter",
		# Music (so play_music can fetch from the same pool).
		"music-dawn-piano", "music-noon-strings",
		"music-evening-flute", "music-night-stars",
		"music-day", "music-night",
		"music-milestone", "music-tense",
	]
	for k in keys:
		var path: String = SFX_DIR + str(k) + ".mp3"
		var s: Resource = load(path)
		if s != null:
			# Tag ambient-loop SFX so AudioStreamPlayer honours loop=true.
			if s is AudioStreamMP3 and k in _LOOPED_KEYS:
				s.loop = true
			_streams[k] = s
	# Load persisted volumes + apply to the bus layout.
	load_settings()
	_apply_all_buses()


func play(key: String, volume_db: float = 0.0) -> void:
	if not _streams.has(key):
		return
	# Reap finished players.
	_active = _active.filter(func(p): return is_instance_valid(p) and p.playing)
	# Voice cap — evict oldest.
	if _active.size() >= VOICE_CAP:
		var old = _active.pop_front()
		if is_instance_valid(old): old.queue_free()
	var player := AudioStreamPlayer.new()
	player.bus = BUS_SFX
	add_child(player)
	player.stream = _streams[key]
	player.volume_db = volume_db
	player.pitch_scale = 1.0 + (randf() - 0.5) * 0.1
	# Looped ambient SFX keep playing until explicitly stopped — don't
	# auto-free those on `finished` because the signal fires at the
	# seamless loop point.
	if not key in _LOOPED_KEYS:
		player.finished.connect(func(): player.queue_free())
	player.play()
	_active.append(player)


## Pick one of `keys` at random and play it — for chicken-cluck-01/02
## style variation without callers juggling randf themselves.
func play_variant(keys: Array, volume_db: float = 0.0) -> void:
	if keys.is_empty():
		return
	var key: String = keys[randi() % keys.size()]
	play(key, volume_db)


# ---------- Music ----------

## Swap the current music bed. `key` must match a loaded music stream
## (MUSIC_DAWN_PIANO, MUSIC_NOON_STRINGS, etc.). Loops automatically.
## Passing the already-playing key is a no-op.
func play_music(key: String, volume_db: float = -6.0) -> void:
	if not _streams.has(key):
		return
	if _music_key == key and is_instance_valid(_music_player) and _music_player.playing:
		return
	_music_key = key
	if _music_player == null or not is_instance_valid(_music_player):
		_music_player = AudioStreamPlayer.new()
		_music_player.bus = BUS_MUSIC
		add_child(_music_player)
	# Ensure the music stream loops even when reused by a one-shot SFX
	# call earlier — AudioStreamMP3 exposes a bool we can flip live.
	var stream: AudioStream = _streams[key]
	if stream is AudioStreamMP3:
		stream.loop = true
	_music_player.stream = stream
	_music_player.volume_db = volume_db
	_music_player.play()


func stop_music() -> void:
	_music_key = ""
	if is_instance_valid(_music_player):
		_music_player.stop()


func get_current_music() -> String:
	return _music_key


# ---------- Volume API (called from the settings panel) ----------

## Set a bus volume as a 0..100 linear percent. Applies immediately.
func set_bus_volume(bus: String, percent: float) -> void:
	if not _volumes.has(bus):
		return
	percent = clamp(percent, 0.0, 100.0)
	_volumes[bus] = percent
	_apply_bus(bus)


func get_bus_volume(bus: String) -> float:
	return float(_volumes.get(bus, 0.0))


func set_bus_muted(bus: String, muted: bool) -> void:
	if not _mutes.has(bus):
		return
	_mutes[bus] = muted
	_apply_bus(bus)


func is_bus_muted(bus: String) -> bool:
	return bool(_mutes.get(bus, false))


## Convenience setters (parity with the UX brief's names).
func set_master_volume(percent: float) -> void: set_bus_volume(BUS_MASTER, percent)
func set_music_volume(percent: float) -> void: set_bus_volume(BUS_MUSIC, percent)
func set_sfx_volume(percent: float) -> void: set_bus_volume(BUS_SFX, percent)
func get_master_volume() -> float: return get_bus_volume(BUS_MASTER)
func get_music_volume() -> float: return get_bus_volume(BUS_MUSIC)
func get_sfx_volume() -> float: return get_bus_volume(BUS_SFX)


## Reset every bus to its default value + unmute everything.
func reset_to_defaults() -> void:
	_volumes[BUS_MASTER] = DEFAULT_MASTER
	_volumes[BUS_MUSIC] = DEFAULT_MUSIC
	_volumes[BUS_SFX] = DEFAULT_SFX
	for b in _mutes.keys():
		_mutes[b] = false
	_apply_all_buses()


## Play a short one-shot on the given bus so the player can preview
## a volume setting. Uses `compost-scoop` for SFX and `hover-tick`
## as a fallback; music bus test picks any loaded sample — we have
## no short music preview, so re-use a gentle SFX routed to music.
func play_test(bus: String) -> void:
	var key: String = "compost-scoop"
	if bus == BUS_MUSIC:
		# Use the gentler pile-hot sample, routed to the music bus
		# so the player hears the music slider doing something.
		key = "pile-hot" if _streams.has("pile-hot") else "compost-scoop"
	elif bus == BUS_MASTER:
		key = "new-fairy" if _streams.has("new-fairy") else "compost-scoop"
	else:
		key = "berry-pick" if _streams.has("berry-pick") else "compost-scoop"
	if not _streams.has(key):
		return
	var player := AudioStreamPlayer.new()
	player.bus = bus
	add_child(player)
	player.stream = _streams[key]
	player.volume_db = 0.0
	player.finished.connect(func(): player.queue_free())
	player.play()


# ---------- Persistence ----------

func save_settings() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value(CONFIG_SECTION, "master_volume", _volumes[BUS_MASTER])
	cfg.set_value(CONFIG_SECTION, "music_volume", _volumes[BUS_MUSIC])
	cfg.set_value(CONFIG_SECTION, "sfx_volume", _volumes[BUS_SFX])
	cfg.set_value(CONFIG_SECTION, "master_muted", _mutes[BUS_MASTER])
	cfg.set_value(CONFIG_SECTION, "music_muted", _mutes[BUS_MUSIC])
	cfg.set_value(CONFIG_SECTION, "sfx_muted", _mutes[BUS_SFX])
	var err: int = cfg.save(CONFIG_PATH)
	if err == OK:
		GameLog.info("settings saved", "settings")
	else:
		GameLog.warn("settings save failed err=%d" % err, "settings")


func load_settings() -> void:
	var cfg := ConfigFile.new()
	var err: int = cfg.load(CONFIG_PATH)
	if err != OK:
		# No file yet — defaults already in _volumes.
		return
	_volumes[BUS_MASTER] = float(cfg.get_value(CONFIG_SECTION, "master_volume", DEFAULT_MASTER))
	_volumes[BUS_MUSIC] = float(cfg.get_value(CONFIG_SECTION, "music_volume", DEFAULT_MUSIC))
	_volumes[BUS_SFX] = float(cfg.get_value(CONFIG_SECTION, "sfx_volume", DEFAULT_SFX))
	_mutes[BUS_MASTER] = bool(cfg.get_value(CONFIG_SECTION, "master_muted", false))
	_mutes[BUS_MUSIC] = bool(cfg.get_value(CONFIG_SECTION, "music_muted", false))
	_mutes[BUS_SFX] = bool(cfg.get_value(CONFIG_SECTION, "sfx_muted", false))


func apply_from_config() -> void:
	load_settings()
	_apply_all_buses()


# ---------- Internals ----------

func _apply_all_buses() -> void:
	for b in _volumes.keys():
		_apply_bus(b)


func _apply_bus(bus: String) -> void:
	var idx: int = AudioServer.get_bus_index(bus)
	if idx < 0:
		# Bus layout not registered — quietly skip so the game still
		# boots if the default_bus_layout resource is missing.
		return
	var pct: float = float(_volumes.get(bus, 100.0)) / 100.0
	var db: float
	if pct <= 0.0001:
		db = -80.0
	else:
		db = linear_to_db(pct)
	db = clamp(db, -80.0, 6.0)
	AudioServer.set_bus_volume_db(idx, db)
	AudioServer.set_bus_mute(idx, bool(_mutes.get(bus, false)))
