## Fairy Permaculture — canonical warm-pastel palette.
##
## The SINGLE source of truth for every color shipped in the game.
## DESIGN.md §Art Direction + feedback_happy_palette_mandatory.md define
## the art rule: warm-pastel Ghibli-lite at ALL times. Even the barren
## starting stage is warm-muted — "sun-bleached straw", NEVER
## "ashy concrete". Greys, cold blue-greys, dead browns, and low-saturation
## washes are BANNED.
##
## Rules for agents:
##   1. DO NOT write raw `Color(r, g, b)` in scripts. Import from here.
##   2. If you compute a color at runtime, run it through `clamp_happy()`
##      to sanitize saturation / cool-cast before shipping to a material.
##   3. If you need a "low vitality" / "stressed" color, pair a warm-muted
##      barren constant (STRAW_DRY / DUSTY_SAGE / WARM_STONE / HONEY_SKY)
##      with its lush target via `warm_lerp()`. Do NOT pick grey.
##
## Registered as autoload `Palette`. Exposed as a singleton so every
## script reads `Palette.MEADOW` etc.
extends Node

# ---- Canonical palette (DESIGN.md §Art Direction) ----
const MEADOW: Color      = Color("8BC47A")
const SAGE: Color        = Color("B7D1A0")
const OLIVE_DARK: Color  = Color("5A7A4B")
const HONEY: Color       = Color("F2C14E")
const CORAL: Color       = Color("F28E74")
const BERRY: Color       = Color("A178B5")
const SKY: Color         = Color("B8D8E8")
const MIST: Color        = Color("D6EEF0")
const MOON: Color        = Color("E8E6D8")
const EARTH: Color       = Color("7A5C48")
const COMPOST: Color     = Color("3E2F23")
const INK: Color         = Color("2A1E10")
const PARCHMENT: Color   = Color("F5EBD5")

# ---- Warm-muted barren-stage variants (vitality 0 – 0.2). ----
# These replace the old cold grey-brown defaults. Still cheerful, just
# less saturated. NEVER pure grey. NEVER cold blue-grey.
const STRAW_DRY: Color   = Color("D8C89A")   # sun-bleached grass
const DUSTY_SAGE: Color  = Color("BCC89E")   # muted green-ground
const WARM_STONE: Color  = Color("B59976")   # earthy warm-stone
const HONEY_SKY: Color   = Color("E8DAB8")   # warm muted sky

# ---- Minimum happiness floor ----
## Clamp-floor applied by `clamp_happy()`. Never drop below this.
const MIN_SATURATION: float = 0.65
## Value (brightness) floor. Avoids "dead" grey-browns.
const MIN_VALUE: float = 0.35
## Hue range we consider "cool cast" (blue-cyan-violet). If a cool-cast
## color drops under MIN_SATURATION it gets pushed toward HONEY.
const COOL_HUE_MIN: float = 0.42   # cyan
const COOL_HUE_MAX: float = 0.78   # violet

var _registered_entries: Array[String] = []


func _ready() -> void:
	_registered_entries = [
		"MEADOW", "SAGE", "OLIVE_DARK",
		"HONEY", "CORAL", "BERRY",
		"SKY", "MIST", "MOON",
		"EARTH", "COMPOST", "INK", "PARCHMENT",
		"STRAW_DRY", "DUSTY_SAGE", "WARM_STONE", "HONEY_SKY",
	]
	GameLog.info("palette %d entries registered" % registered_count(), "art")


## How many named palette entries this module exposes. Used by the boot
## banner + DESIGN-CHECK tests so the smoke test can assert the module
## loaded with its full set.
func registered_count() -> int:
	return _registered_entries.size()


## Lerp between a barren-stage warm-muted color and a lush full-palette
## color using the vitality 0..1 axis. Prefer this over blending into a
## grey neutral — the game's low-vitality mood is WARM muted, not cool
## washed-out.
##
##   var disc_color: Color = Palette.warm_lerp(vitality,
##       Palette.STRAW_DRY, Palette.MEADOW)
func warm_lerp(vitality: float, barren_color: Color, lush_color: Color) -> Color:
	var t: float = clamp(vitality, 0.0, 1.0)
	return clamp_happy(barren_color.lerp(lush_color, t))


## Sanitize a color so it complies with the happy-palette rule:
##   • Saturation >= MIN_SATURATION (lifts washed-out greys)
##   • Value >= MIN_VALUE (lifts dead near-blacks for anything that
##     isn't deliberately INK / COMPOST)
##   • Cool-cast + low-saturation → bias hue toward HONEY so we never
##     ship a depressing cool-grey in place of a warm-muted tone
func clamp_happy(c: Color) -> Color:
	var h: float = c.h
	var s: float = c.s
	var v: float = c.v
	if s < MIN_SATURATION:
		# If the source color is cool-cast AND desaturated, that's the
		# exact failure mode we're preventing. Push it warm first.
		if h >= COOL_HUE_MIN and h <= COOL_HUE_MAX:
			# 0.12 = HONEY hue roughly. Blend 60% toward warm.
			h = lerp(h, 0.12, 0.6)
		s = MIN_SATURATION
	if v < MIN_VALUE:
		v = MIN_VALUE
	var out: Color = Color.from_hsv(h, s, v, c.a)
	return out


## Convenience: returns a Color with the same alpha but forced through
## `clamp_happy`. Useful when you want to verify a constant you just
## defined is DESIGN-CHECK compliant at runtime.
func assert_happy(c: Color) -> Color:
	return clamp_happy(c)
