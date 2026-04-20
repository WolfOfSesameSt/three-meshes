extends Node
## Structured session logger. Writes to user://logs/session-<ts>.log
## AND mirrors to res://logs/latest.log when running from the editor,
## so Claude (and humans) can Read the log file directly inside the project.
##
## Also installs a crash-breadcrumb — the last 200 log lines get flushed
## on any unhandled error via `NOTIFICATION_WM_CLOSE_REQUEST` + `_notification`.

const LOG_TAIL_SIZE: int = 200
const LOG_DIR_USER: String = "user://logs"
const LATEST_IN_PROJECT: String = "res://logs/latest.log"

var _session_path: String = ""
var _file: FileAccess = null
var _mirror: FileAccess = null
var _tail: Array[String] = []

func _ready() -> void:
	_open_log()
	_write_boot_banner()
	# Route all engine logs through our file as well (best-effort).
	get_tree().auto_accept_quit = true

func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST or what == NOTIFICATION_WM_GO_BACK_REQUEST:
		_flush("shutdown requested")
	elif what == NOTIFICATION_CRASH:
		_flush("CRASH notification received")

func info(msg: String, category: String = "") -> void:
	_emit("INFO ", msg, category)

func warn(msg: String, category: String = "") -> void:
	_emit("WARN ", msg, category)
	push_warning(_fmt(msg, category))

func error(msg: String, category: String = "") -> void:
	_emit("ERROR", msg, category)
	push_error(_fmt(msg, category))

func event(name: String, data: Dictionary = {}) -> void:
	_emit("EVENT", "%s %s" % [name, JSON.stringify(data)], "")

func dump_tail() -> Array[String]:
	return _tail.duplicate()

# ---------- internals ----------

func _open_log() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(LOG_DIR_USER))
	var ts: String = Time.get_datetime_string_from_system().replace(":", "-")
	_session_path = "%s/session-%s.log" % [LOG_DIR_USER, ts]
	_file = FileAccess.open(_session_path, FileAccess.WRITE)
	if _file == null:
		push_warning("Logger: could not open %s (err %d)" % [_session_path, FileAccess.get_open_error()])

	# Mirror into the project folder so Claude + humans can read it locally.
	# This only works when running from the editor (res:// is writable then).
	if OS.has_feature("editor"):
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://logs"))
		_mirror = FileAccess.open(LATEST_IN_PROJECT, FileAccess.WRITE)

func _write_boot_banner() -> void:
	var banner: String = "=== fairy-permaculture session %s | godot %s | feature=%s ===" % [
		Time.get_datetime_string_from_system(),
		Engine.get_version_info().get("string", "?"),
		"editor" if OS.has_feature("editor") else "exported"
	]
	_emit("INFO ", banner, "boot")
	_emit("INFO ", "user_dir=%s" % OS.get_user_data_dir(), "boot")
	_emit("INFO ", "session_log=%s" % _session_path, "boot")
	if _mirror != null:
		_emit("INFO ", "mirror_log=%s (readable from host)" % ProjectSettings.globalize_path(LATEST_IN_PROJECT), "boot")

func _emit(level: String, msg: String, category: String) -> void:
	var line: String = "[%s] %s %s%s" % [
		Time.get_datetime_string_from_system(),
		level,
		("[" + category + "] ") if category != "" else "",
		msg
	]
	_tail.append(line)
	if _tail.size() > LOG_TAIL_SIZE:
		_tail.pop_front()
	print(line)
	if _file != null:
		_file.store_line(line)
		_file.flush()
	if _mirror != null:
		_mirror.store_line(line)
		_mirror.flush()

func _fmt(msg: String, category: String) -> String:
	return ("[" + category + "] " + msg) if category != "" else msg

func _flush(reason: String) -> void:
	_emit("INFO ", "logger flush — %s" % reason, "boot")
	if _file != null:
		_file.flush()
	if _mirror != null:
		_mirror.flush()
