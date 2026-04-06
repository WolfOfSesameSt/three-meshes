# Pixi.js Changelog

Tracks Pixi.js releases relevant to this project. Auto-updated weekly by scheduled agent.

**Installed version:** v8.17.1
**Latest known version:** v8.17.1 (as of 2026-04-06)

---

<!-- New entries are prepended below this line by the scheduled agent -->

## v8.17.1 (2026-03-16)
### Bug Fixes
- Fixed compressed textures ignoring resolution from URL (e.g. `@0.75x`)
- Fixed center-align text when words exceed `wordWrapWidth`
- Fixed BitmapFont char keys from char codes to character strings

---

## v8.17.0 (2026-03-09)
### New Features
- **Tagged text for `SplitText`**: `SplitText` now supports `tagStyles`, so styled runs are correctly split into per-character `Text` objects with individual styles preserved
- **Improved text rendering**: Bitmap text now supports `whiteSpace` modes (`normal`, `pre`, `nowrap`, `pre-line`, `pre-wrap`); bitmap text word wrap supports break-after characters; canvas/split text render `align: 'justify'` with distributed spacing
- **`visibleChanged` event on Container**:
  ```js
  container.on('visibleChanged', (visible) => { /* ... */ });
  ```
- Added function for removing aliases from resolver

### Bug Fixes
- Fixed filter corruption with `TexturePool` mipmap separation
- Fixed `BlurFilter` strength reduction on each pass
- Fixed `ColorMatrixFilter` offset handling
- Fixed global filter offset applied to `ParticleContainer` rendering
- Fixed texture trim offset in `NineSliceSprite`
- Fixed `Graphics` returning empty bounds from empty objects
- Fixed `Graphics.getLocalBounds()` returning stale data between operations in same frame
- Fixed `Graphics` bounds accounting for miter joins at sharp angles
- Fixed `BindGroup` crash when resource destroyed in batched group
- Fixed `Ticker` `minFPS`/`maxFPS` mutual clamping
- Fixed `color.setAlpha()` stale alpha cache invalidation
- Fixed `removed` event when using `addChildAt`
- Fixed `removeAllListeners()` on `Renderer.destroy()`
- Fixed Web font loading quote handling for old Chrome versions

### Behavior Changes
- `BlurFilter` now uses an optimized halving strength scheme by default — **visual output changes**. Set `legacy: true` to restore old behavior:
  ```js
  new BlurFilter({ legacy: true });
  ```
- Text with `align: 'justify'` now uses `wordWrapWidth` for width calculation instead of `maxLineWidth`; last line is no longer stretched
- `breakWords: true` in `HTMLText` now correctly uses CSS `word-break: break-word` instead of `break-all`

---

## v8.16.0 (2026-02-03)
### New Features
- **Experimental Canvas renderer** — opt in via `preference: 'canvas'`:
  ```js
  await app.init({ preference: 'canvas' });
  ```
- **Tagged text** for `Text`/`HTMLText` — use `tagStyles` in `TextStyle` for inline styled runs:
  ```js
  new Text({
    text: '<bold>Important:</bold> This is <highlight>highlighted</highlight> text',
    style: {
      tagStyles: {
        bold: { fontWeight: 'bold', fill: 'yellow' },
        highlight: { fill: 'cyan', fontSize: 32 },
      },
    },
  });
  ```
- **`SplitText` stability improvements** — mirrors `Text` behavior, regenerates on `styleChanged()`
- External texture support
- `Spritesheet.parseSync()` added
- Cube texture support
- Mip level rendering support
- Render to array layer support

### Bug Fixes
- Fixed `Container.cullArea` now correctly interpreted in local coordinate space before culling
- Fixed `SplitBitmapText` now correctly defaults to white fill
- Fixed `HTMLText` respecting `breakWords` and alpha on fill/stroke
- Fixed `Text` alignment for `right`/`center` (small positional adjustment)
- Fixed `graphics.texture(texture, 0x000000)` now correctly applies black tint
- Fixed `GC` system ensuring render groups are marked dirty
- Fixed `VAO` cache preservation in `GlGeometrySystem`
- Fixed tree-shaking by optimizing module imports

### Behavior Changes
- `SplitText` more accurately splits across wider `TextStyle` configurations — may cause slight character repositioning
- `SplitText.from` from an existing `Text` now transfers anchor to pivot coordinates — changes layout vs. previous behavior
- `Container.cullArea` is now interpreted in local coordinate space (was previously global)

---

## v8.15.0 (2026-01-05)
### New Features
- **Unified GC system** — `TextureGCSystem`/`RenderableGCSystem` consolidated into `GCSystem`:
  ```js
  // New API
  await app.init({
    gcActive: true,
    gcMaxUnusedTime: 60000,
    gcFrequency: 30000,
  });
  ```
- **`unload()` method** — manually release GPU resources from any node; node is re-created automatically when needed:
  ```js
  sprite.unload();
  text.unload();
  mesh.unload();
  ```
- `autoGarbageCollect` option on display objects to opt out of auto-GC:
  ```js
  new Sprite({ autoGarbageCollect: false });
  ```
- `RenderTexture.create` now accepts `dynamic` option

### Bug Fixes
- Fixed SVG parser allowing negative values for polygons/polylines
- Fixed double-returning of batches to pool
- Fixed `RenderTexture` ignoring format setting (WebGL)
- Fixed Multiple Render Targets (MRT) support
- Fixed garbage collection for bitmap text

### Deprecations
- `textureGCActive`, `textureGCMaxIdle`, `textureGCCheckCountMax`, `renderableGCActive`, `renderableGCMaxUnusedTime`, `renderableGCFrequency` init options deprecated — use `gcActive`, `gcMaxUnusedTime`, `gcFrequency` instead

---

## v8.14.3 (2025-11-20)
### Bug Fixes
- Fixed: Only create stage `Container` on init if it doesn't already exist (fixes app reuse)

---

## v8.14.2 (2025-11-18)
### Bug Fixes
- Fixed graphics memory leak and cleanup
- Fixed asset URL resolution parsing for resolution and format
- Fixed proper application reinitialization
- Fixed `uBackTexture` binding for filters with `blendRequired`
- Fixed `Container.filters` TypeScript type resolution
- Fixed `TextureSource` resize listener not removed on `Texture.destroy()`

---

## v8.14.1 (2025-11-10)
### Bug Fixes
- Fixed `bytesPerRow` calculation for `BufferImageSource` in WebGPU
- Fixed null reference guard on mask reset
- Fixed errors during worker manager reset

---

## v8.14.0 (2025-10-06)
### New Features
- **Asset loading strategies** — `throw` (default), `skip`, `retry`:
  ```js
  await Assets.load('unstable.png', { strategy: 'retry', retryCount: 5 });
  ```
- **Progress size for assets** — provide `progressSize` per asset for accurate loading percentage
- `Point.rotate(radians)` added to math-extras
- `TextStyle` setters now have change guards to prevent redundant updates

### Bug Fixes
- Fixed `filter.enabled` state being ignored
- Fixed `IRenderLayer` as part of `ContainerOptions.children` array
- Fixed accessibility system event listener removal

---

## v8.13.2 (2025-09-10)
### Bug Fixes
- Fixed application destroy for graphics
- Fixed `GraphicsContext` boundary recalculation ignoring dirty state
- Fixed destroy of prepared-but-not-rendered text throwing errors

---

## v8.13.1 (2025-09-03)
### Bug Fixes
- Fixed text texture incorrectly released when destroyed

---

## v8.13.0 (2025-09-02)
### New Features
- **Shared texture caching for `Text`** — `Text` objects sharing the same `TextStyle` instance now share the same GPU texture, improving performance for repeated text
- **LRU cache for text measuring**
- **Deprecation control**:
  ```js
  import { deprecation } from 'pixi.js';
  deprecation.quiet = true;   // suppress warnings
  deprecation.noColor = true; // remove color formatting
  ```

### Bug Fixes
- Fixed multiple memory leaks in `Text` and renderer systems
- Fixed advanced blending modes within render groups cached as texture render groups
- Fixed `HTMLText` texture preserved until new texture generation completes
- Fixed BitmapText newline rendering
- Fixed renderer system memory leaks
- Fixed `buildGeometryFromPath` functionality

---

## v8.12.0 (2025-08-05)
### New Features
- **`cacheAsTexture` scaleMode option**:
  ```js
  container.cacheAsTexture({ scaleMode: 'nearest' });
  ```
- **Max anisotropy passthrough**: `texture.source.maxAnisotropy = 16`
- **Shared WebGPU device** — allow sharing adapter/device with other engines:
  ```js
  await app.init({ gpu: { adapter, device } });
  ```
- **Asset parser name refactor** — parser names simplified (e.g. `loadJson` → `json`, `loadSvg` → `svg`, `loadTextures` → `texture`)
- `WorkerManager.reset()` added for worker pool reuse after app destroy

### Bug Fixes
- Fixed numerous `Text` and `BitmapText` rendering issues (padding, fill, stroke, anchor, lineHeight)
- Fixed `Graphics` resource leaks
- Fixed `AnimatedSprite` destroy
- Fixed asset bundle progress tracking
- Fixed earcut triangulation issues
- Fixed masking when mask texture is out of viewport bounds

### Behavior Changes
- `BitmapText` `lineHeight` now correctly calculated — may cause slight positional adjustments

### Migration Notes
- Asset parser `data.loadParser` renamed to `data.parser` with new short names. Old names still work but may be deprecated in future

---

## v8.11.0 (2025-07-03)
### New Features
- **`SplitText` / `SplitBitmapText`** — split text into per-character display objects for animation
- **`Container.replaceChild(oldChild, newChild)`** added
- **`origin` point for containers** — transform origin for rotation/scale without moving anchor
- **`breakWords` for BitmapText**

### Bug Fixes
- Fixed text bounds calculation to account for anchor and padding
- Fixed text position with `textStyle.padding` when `anchor` is set
- Fixed dynamic bitmap font shadow applied twice
- Fixed `TextMetrics` tokenize not handling CRLF line endings

### Behavior Changes
- `textStyle.padding` no longer incorrectly offsets text when `anchor` is set — text elements may appear slightly repositioned

---

## v8.10.2 (2025-06-24)
### Bug Fixes
- Fixed filter offset
- Fixed TypeScript type error on `DOMContainer` in strict mode

---

## v8.10.1 (2025-06-05)
### Bug Fixes
- Fixed `earcut` export

---

## v8.10.0 (2025-06-03)
### New Features
- **Trimmed text support** — `trim: true` in `TextStyle` removes extra whitespace from text textures:
  ```js
  const text = new Text({ text: 'TRIM', style: { trim: true } });
  ```

### Bug Fixes
- Fixed `ParticleContainer.removeParticles(startIndex, endIndex)` — `endIndex` now correctly defaults to `particleChildren.length`

### Behavior Changes
- `ParticleContainer.removeParticles()` now matches `container.removeChildren()` behavior

---

## v8.9.2 (2025-04-29)
### Bug Fixes
- Patch release — see GitHub for details

---

## v8.9.1 (2025-03-27)
### Bug Fixes
- Patch release — see GitHub for details

---

## v8.9.0 (2025-03-20)
### New Features
- See GitHub release for details

---
