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

**Palette entries I used:** (list them)
**Deviations from palette:** (any, with justification)
**Screenshots/visual verification method:** (describe)
