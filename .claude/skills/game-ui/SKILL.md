---
name: game-ui
description: Create clean, fast in-game UI components for Void Raiders — station screens, mission HUD, panels, and controls matching the holographic sci-fi aesthetic
argument-hint: [component name]
user-invocable: true
allowed-tools: Read Write Edit Grep Glob
---

# Game UI Builder

Build UI components for Void Raiders. All UI is HTML/CSS overlay on the Three.js canvas.

## Theme

```css
:root {
  /* Backgrounds */
  --ui-bg-primary: rgba(8, 12, 30, 0.85);
  --ui-bg-secondary: rgba(15, 22, 50, 0.75);
  --ui-bg-hover: rgba(25, 35, 70, 0.8);

  /* Borders */
  --ui-border: rgba(80, 140, 220, 0.3);
  --ui-border-active: rgba(80, 180, 255, 0.6);
  --ui-glow: 0 0 8px rgba(80, 160, 255, 0.2);

  /* Text */
  --ui-text: #c8d8f0;
  --ui-text-bright: #e8f0ff;
  --ui-text-dim: #6880a0;

  /* Accents */
  --ui-accent: #4a9eff;
  --ui-warning: #ffaa30;
  --ui-danger: #ff4444;
  --ui-success: #44dd88;

  /* Typography */
  --ui-font: 'Courier New', monospace;
  --ui-font-size: 13px;

  /* Spacing */
  --ui-padding: 12px;
  --ui-gap: 8px;
  --ui-radius: 2px;

  /* Animation */
  --ui-transition: 150ms ease-out;
}
```

## Component Patterns

### Panel
```html
<div class="vr-panel">
  <div class="vr-panel-header">Title</div>
  <div class="vr-panel-body">Content</div>
</div>
```

### Bar (health, shield, energy)
```html
<div class="vr-bar" data-label="Shields" data-value="75">
  <div class="vr-bar-fill" style="width: 75%"></div>
</div>
```

### Button
```html
<button class="vr-btn">Action</button>
<button class="vr-btn vr-btn--danger">Extract</button>
<button class="vr-btn vr-btn--disabled">Locked</button>
```

## Rules

1. **No frameworks** — vanilla JS + DOM. Keep it light
2. **Event-driven** — UI subscribes to game state events, doesn't poll
3. **Minimal DOM updates** — only touch elements that changed
4. **CSS transitions** — no JS animation libraries. Use CSS for all motion
5. **Responsive** — panels adapt to viewport. No fixed pixel sizes for layout
6. **Accessible hotkeys** — critical actions have keyboard shortcuts
7. **Holographic feel** — semi-transparent, luminous borders, subtle glow. Not solid/opaque panels
8. **Information density** — dense but readable. Tooltips for detail, not clutter

## File Structure

```
src/games/void-raiders/ui/
  theme.css             — all CSS custom properties and base styles
  shared/               — reusable components (panel, button, bar, tooltip)
  station/              — station screen UIs
  mission/              — mission HUD components
```

## Instructions

When building $ARGUMENTS:
1. Check if a similar component exists in `src/games/void-raiders/ui/`
2. Use the theme variables — never hardcode colors or sizes
3. Keep the DOM structure flat and simple
4. Wire to game state via events, not direct coupling
5. Test at both station (full screen) and mission (overlay) contexts
