# Agent DESIGN-CHECK template (Fairy Permaculture)

Every agent that ships visual work must include the block below at the
bottom of its final report. A report without this block = the work is
not done.

The rule being enforced: warm-pastel Ghibli-lite palette at ALL times.
Barren is warm-muted (sun-bleached straw), NEVER cold grey. Every color
traces back to `autoload/palette.gd` and `DESIGN.md` §Art Direction.

Source docs (both mandatory reads before choosing any color):
- `DESIGN.md` §Art Direction — canonical palette + hex codes
- `~/.claude/projects/.../memory/feedback_happy_palette_mandatory.md` — rule + rationale
- `autoload/palette.gd` — the single source of truth for colors in-engine

---

## DESIGN-CHECK (mandatory for visual agents)
- [ ] I read DESIGN.md §Art Direction before choosing colors.
- [ ] I read feedback_happy_palette_mandatory.md in the user memory.
- [ ] All colors I shipped come from `Palette.*` constants (cite specific entries below).
- [ ] No saturation drops below 0.65 anywhere in my output.
- [ ] No color was chosen because it felt "realistic" — all choices trace to the happy palette.
- [ ] I verified the game looks warm/cheerful at the LOWEST vitality state, not cold/grey.

## UI READABILITY-CHECK (mandatory for any agent shipping labels / panels / text)
Godot's default font color is WHITE. Parchment panels are cream. White-on-cream = unreadable. Shipped broken once (2026-04-20, compost inspector). Never again.
- [ ] Every `Label` / `Button` / `RichTextLabel` on a light panel sets `theme_override_colors/font_color` — in the `.tscn` *or* via `add_theme_color_override("font_color", …)` in `_ready` before the label becomes visible.
- [ ] Every dynamically-created label (`Label.new()` in GDScript) gets a font_color override before `add_child`.
- [ ] Font colors come from `Palette.*` (INK / COMPOST / EARTH / etc.), not raw literals.
- [ ] I opened the scene in the running game and visually confirmed every label is readable against its background (not just "no parse errors").

**Palette entries I used:** (list them)
**Deviations from palette:** (any, with justification)
**Screenshots/visual verification method:** (describe — must mention that you eyeballed labels against their panel background)
