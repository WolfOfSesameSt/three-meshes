#!/usr/bin/env bash
# Runs Fairy Permaculture with logs piped to logs/latest.log inside the
# project, so Claude can Read them without the user pasting output.
#
# Usage:
#   ./run.sh            # run the game
#   ./run.sh --editor   # open the Godot editor
#   ./run.sh --headless # run without a window (parse-check)
#
# Exit code is Godot's exit code. The tee preserves both live terminal
# output AND the file copy.

set -u
cd "$(dirname "$0")"

mkdir -p logs
TS="$(date +%Y%m%d-%H%M%S)"
CONSOLE_LOG="logs/console-${TS}.log"
ln -sf "console-${TS}.log" logs/latest-console.log

GODOT_BIN="${GODOT_BIN:-}"
if [ -z "$GODOT_BIN" ] || ! command -v "$GODOT_BIN" >/dev/null 2>&1; then
  # Try PATH first
  if command -v godot >/dev/null 2>&1; then
    GODOT_BIN="godot"
  elif command -v godot4 >/dev/null 2>&1; then
    GODOT_BIN="godot4"
  else
    # Fallback: well-known install locations
    for CANDIDATE in \
      "$HOME/Godot/Godot_v4.6.2-stable_linux.x86_64" \
      "$HOME/Godot/Godot_v4.6-stable_linux.x86_64" \
      "$HOME/Godot/Godot_v4.5-stable_linux.x86_64" \
      "/usr/local/bin/godot" \
      "/opt/godot/godot"; do
      if [ -x "$CANDIDATE" ]; then
        GODOT_BIN="$CANDIDATE"
        break
      fi
    done
  fi
fi

if [ -z "$GODOT_BIN" ] || { [ "$GODOT_BIN" != "godot" ] && [ "$GODOT_BIN" != "godot4" ] && [ ! -x "$GODOT_BIN" ]; }; then
  echo "run.sh: godot binary not found (tried PATH + ~/Godot/ + /opt/godot)" >&2
  echo "        set GODOT_BIN=/path/to/godot to override" >&2
  exit 127
fi

ARGS=("--path" ".")
for a in "$@"; do
  case "$a" in
    --editor)   ARGS+=("--editor") ;;
    --headless) ARGS+=("--headless" "--quit-after" "60") ;;
    *)          ARGS+=("$a") ;;
  esac
done
ARGS+=("--verbose")

echo "run.sh: logging to $CONSOLE_LOG"
echo "run.sh: $GODOT_BIN ${ARGS[*]}"

# shellcheck disable=SC2024
"$GODOT_BIN" "${ARGS[@]}" 2>&1 | tee "$CONSOLE_LOG"
EXIT="${PIPESTATUS[0]}"

# Trim old console logs — keep last 10.
ls -1t logs/console-*.log 2>/dev/null | tail -n +11 | xargs -r rm -f

# Also surface the Godot-internal session log (the one Logger.gd writes),
# so Claude can Read both.
USER_LOG_DIR="${HOME}/.local/share/godot/app_userdata/fairy-permaculture/logs"
if [ -d "$USER_LOG_DIR" ]; then
  NEWEST="$(ls -1t "$USER_LOG_DIR"/session-*.log 2>/dev/null | head -n1 || true)"
  if [ -n "$NEWEST" ]; then
    cp -f "$NEWEST" logs/latest-session.log
    echo "run.sh: copied session log to logs/latest-session.log"
  fi
  GODOT_LOG="$USER_LOG_DIR/godot.log"
  if [ -f "$GODOT_LOG" ]; then
    cp -f "$GODOT_LOG" logs/latest-godot.log
    echo "run.sh: copied engine log to logs/latest-godot.log"
  fi
fi

exit "$EXIT"
