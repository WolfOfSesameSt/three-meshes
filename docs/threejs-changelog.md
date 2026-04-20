# Three.js Changelog

Tracks Three.js releases relevant to this project. Auto-updated weekly by scheduled agent.

**Installed version:** r170
**Latest known version:** r184 (as of 2026-04-20)

---

<!-- New entries are prepended below this line by the scheduled agent -->

## r184 (2026-04-16)
### New Features
- HTMLTexture: New texture type for rendering HTML content as textures
- LightProbeGrid: Add position-dependent diffuse Global Illumination
- TSL: Compilation performance improved 3.0x; add hyperbolic math nodes, global/local scope, `OnFrameUpdate` / `OnBeforeFrameUpdate` lifecycle events
- WebGPURenderer: Introduce Dynamic Lights; make `compileAsync()` truly non-blocking; add compute shader bounds check; introduce `ReadbackBuffer`
- WebGLRenderer: Add support for packed normal maps; implement `WEBGL_multi_draw` fallback
- GLTFExporter: Add `EXT_texture_webp` support
- EXRLoader: Support YCbCr and B44/A formats; add multi-part and deep scanline support
- KTX2Loader: Support RGBA 16-bit unsigned normalized formats
- FBXLoader: Multiple skinning fixes (bind matrix, rotation animations, morph deltas, Z-up correction)
- USDLoader: Add geometric primitives (Cube, Sphere, Cylinder, Cone, Capsule); add MaterialX UsdPreviewSurface support
- ColladaLoader: Add `polygons` primitive and `instance_joint` support
- ColorUtils: Add `setKelvin()` function
- MeshPhysicalMaterial: Fix Anisotropic regression
- InstancedMesh / BatchedMesh: Fix `getColorAt()` throwing when colors not set
- Reflector: Support orthographic cameras
- Sky: Make sun disc optional
### Deprecations
- VTKLoader: Deprecated
### Breaking Changes
- BatchedMesh: Removed deprecated instancing render paths
- Texture: Removed default setter parameter
### Migration Notes
- If using deprecated BatchedMesh instancing render paths, update to current API
- Review any `Texture` setter calls that relied on the removed default parameter

## r183 (2026-02-20)
### New Features
- Animation: Add `BezierInterpolant`
- BatchedMesh: Enable per-instance opacity; add wireframe material support
- LightShadow: Introduce `biasNode` for shadow bias control
- MeshLambertMaterial / MeshPhongMaterial: Add support for `scene.environment` IBL
- MeshPhysicalMaterial: Added clearcoat support for rect area lights
- NodeMaterial: Add `maskShadowNode`
- Core: Add `ReversedDepthFuncs` dictionary
- InstanceNode: Support velocity; fix UBO size and attribute update
- Camera: Exclude scale from view matrix
- Cache: Don't cache Blobs
### Deprecations
- Clock module deprecated
### Breaking Changes
- Removed deprecated code (global cleanup)
- BindGroup: Remove `bindingsReference`
- Line2NodeMaterial: Rename `useColor` property to `vertexColors`
### Migration Notes
- If using `Line2NodeMaterial`, rename `useColor` → `vertexColors`
- Camera scale is now excluded from the view matrix — check any code relying on scaled cameras

## r182 (2025-12-10)
### New Features
- BufferGeometry: Add `indirectOffset` parameter for indirect drawing
- ShaderMaterial: Fix `copy()` to include missing properties (important — `clone()`/`copy()` now more reliable)
- PMREMGenerator: Improve GGX VNDF accuracy to match Blender roughness; reduce DFG LUT resolution to 16×16
- MeshStandardMaterial: Fix furnace test energy loss for intermediate metalness; improve physical accuracy
- MeshPhysicalMaterial: Fix iridescence energy conservation; improve Sheen energy conservation
- TSL: Add renderer context node (global), `texture3DLoad()` / `texture3DLevel()`, bitcount functions, float packing/unpacking intrinsics, `mat3`/`mat4` support for `bufferAttribute()`
- NormalMapNode: Add basic support for normal unpacking
### Breaking Changes
- LightProbe: Remove `fromJSON()`
- TSL: Tangent attribute no longer auto-generated — provide it explicitly if needed
### Migration Notes
- If using TSL and relying on auto-generated tangents, add the attribute manually
- PMREMGenerator output may differ slightly due to GGX VNDF accuracy improvements

## r181 (2025-11-19)
### New Features
- PMREMGenerator: Implement GGX VNDF importance sampling (major PBR quality improvement)
- Quaternion: Rewrite `slerp()` and `slerpFlat()` for improved accuracy
- MeshMatcapMaterial: Add wireframe support
- TSL: Add `OnBefore*` events, `isolate()`, `overloadingFn` return type fix, improved orthographic `positionViewDirection`
- ShadowNode: Fix shadows in first frame
### Breaking Changes
- WebGLRenderer: Now uses DFG LUT instead of analytical approximation — PBR appearance will change subtly

## r180 (2025-09-03)
### New Features
- AnimationClip: Add `userData`; honored in glTF loader and exporter
- TSL: Add texture offset feature via `offsetNode`; add `SubgroupFunctionNode` with compute reduction; introduce `uniformFlow()`; camera array support with `cameraViewport`
- TSL: `viewportTexture()` performance fix
### Breaking Changes
- Removed deprecated code (global cleanup)

## r179 (2025-08-02)
### New Features
- Loader: Add `abort()` method for cancelling in-flight loads
- Timer: Moved into core (no longer an addon import)
- TSL: Introduce `computeKernel()`, TSL events, `load()` on `texture()`, boolean support in `uniform()`
- SkeletonHelper: Add `setColors()`
- PassNode: Add `compileAsync()`, viewport and scissor API
- WebGLRenderer: Greatly improved reversed depth buffer support
- StorageTexture: Add `.setSize()`
### Breaking Changes
- Line2NodeMaterial: Remove unused `lineWidth` property
- TSL: `label()` renamed to `setName()`
### Migration Notes
- If using `Timer` from addons, update import to core: `import { Timer } from 'three/src/core/Timer.js'`
- Replace `label()` → `setName()` in TSL code

## r178 (2025-06-30)
### New Features
- Initial `Float16Array` support across renderers
- TSL: Introduce `sample()`, `textureBicubicLevel()`, Chromatic Aberration, `tangentViewFrame` / `bitangentViewFrame`, `subBuild()`
- WebGPURenderer: Add `Storage3DTexture` and `StorageArrayTexture`; allow storage buffer on index attribute
- NodeMaterial: Honor `material.premultipliedAlpha` in shader
- GLBufferAttribute: Add `normalized` property
### Breaking Changes
- Removed deprecated code (global cleanup)
- TSL: Remove `transformed*` prefix from variables
- TSL: Rename `premult` → `premultiplyAlpha`
- TSL: Node utilities refactored — `TriplanarTexturesNode`, `EquirectUVNode`, `MatcapUVNode` moved to function form
### Migration Notes
- Replace `transformedNormal` / `transformedPosition` etc. with `normal` / `position` (no `transformed` prefix)
- Replace `premult` → `premultiplyAlpha` in TSL code

## r177 (2025-05-30)
### New Features
- Box3 / Sphere: Add `toJSON()` and `fromJSON()` methods
- Mesh / Sprite: Add `count` property
- Texture: Add `setValues()`, `updateRanges`, and `width`/`height`/`depth` properties
- SpotLight: Add custom attenuation via `attenuationNode`
- SpotLightShadow: Introduce `aspect` property
- NodeMaterial: Introduce `maskNode`; `shapeCircle()` improvement
- TSL: Add `premult()` / `unpremult()`, namespace support, `uniformTexture()` / `uniformCubeTexture()`

## r176 (2025-04-23)
### New Features
- CapsuleGeometry: Add `heightSegments` parameter
- TSL: Introduce `compatibilityMode`, `renderer.highPrecision`, `varying.setInterpolation()`, Multiview support
- ArrowHelper: Replace cylinder with cone geometry (visual change)
- WebGPURenderer: Add caustics example support, WebXR improvements
### Deprecations
- LottieLoader: Deprecated
### Breaking Changes
- Removed Luminance and LuminanceAlpha texture formats
- CapsuleGeometry: `length` parameter renamed to `height`; UVs fixed
### Migration Notes
- Replace `CapsuleGeometry(r, l, ...)` → `CapsuleGeometry(r, height, ...)` — the `length` parameter is now `height`
- If using `THREE.LuminanceFormat` or `THREE.LuminanceAlphaFormat`, migrate to a supported format

## r175 (2025-03-28)
### New Features
- Material: Add `allowOverride` property
- NodeMaterial: Add support for `compute()` integrated directly into the material
- TSL: Add `samplerComparison`, `debug()`, while-loop support in `Loop()`, simplified `Fn()` layout, improved `max()`/`min()` with arbitrary argument count
- ImageUtils: Add optional `type` parameter to `getDataURL()`
- ExtrudeGeometry: Automatically clean shape data; honor `closed` on `CatmullRomCurve3`
- Controls: `connect()` now requires an `element` argument
- WebGLRenderer: Fix `setReversed()` so `reverseDepthBuffer: true` works correctly
### Deprecations
- AnimationClip: Deprecate `parseAnimation()`
- TSL: Deprecated `modInt()`
### Breaking Changes
- Removed deprecated code (global cleanup)
### Migration Notes
- `Controls.connect()` now requires an element — update any call that passes no argument

## r174 (2025-02-27)
### New Features
- PMREMGenerator: Add `size` and `position` options to `fromScene()`
- Renderer: Introduce `colorBufferType`; `init()` now returns `self`
- WebGPURenderer: Add `setOutputRenderTarget()`, volumetric lighting, environment map rotation support
- WebGPUBackend: Add `setStencilReference()` support
- TSL: Introduce `RaymarchingBox` and `raymarchingTexture3D`
- WebGLRenderer: Configure scissor/viewport before clear; fix depth regression
### Deprecations
- BatchedMesh: Deprecate old instancing render paths
### Breaking Changes
- Animation: `frame` parameter renamed to `xrFrame`
- SpriteNodeMaterial: `transparent` now defaults to `true`
### Migration Notes
- Update any XR animation code referencing `frame` → `xrFrame`

## r173 (2025-01-31)
### New Features
- VideoFrameTexture: New class for WebCodecs API video playback
- TSL: Add `mat2` support, `array()`, `struct()`, `atomicLoad`, matrix operations for floats, `.toConst()` / `Const()` / `Var()`
- WebGPURenderer: Introduce `RenderTarget3D` and `RenderTargetArray`; `TimestampQueryPool`; `ArrayCamera` performance improvements
- XRManager: Full XR manager for WebGPURenderer with layers and MSAA support
- Renderer: Introduce `colorBufferType`; fix `ArrayCamera` viewport configuration
### Deprecations
- MeshGouraudMaterial: Deprecated
### Breaking Changes
- TSL: `varying()` renamed to `toVarying()`; `vertexStage()` renamed to `toVertexStage()`
- NodeBuilder: `.monitor` renamed to `.observer`
- PointsNodeMaterial: Replaces `InstancedPointsNodeMaterial`
### Migration Notes
- Replace `varying()` → `toVarying()` and `vertexStage()` → `toVertexStage()` in TSL shader code
- Replace `InstancedPointsNodeMaterial` with `PointsNodeMaterial`

## r172 (2024-12-31)
### New Features
- WebGLRenderer: Add transmission render target scale; allow binding/rendering into a 2D render target mipmap
- WebGPURenderer: `onBeforeShadow()` / `onAfterShadow()` callbacks; `RenderTarget3D` / `RenderTargetArray`
- TSL: Add `vertexStage()`, fog improvements, GLSL alias functions; `UniformArrayNode` support for `mat2`/`mat3`/`mat4`
- OrbitControls: Add `keyRotateSpeed`
- DDSLoader: Add 24-bit uncompressed RGB support
### Breaking Changes
- TSL: `PostProcessingUtils` renamed to `RendererUtils`
- TextureNode: `uv()` renamed to `sample()`
- TSL: Renamed `shadowPositionWorld`, `materialAO` for consistency
- Removed deprecated code (global cleanup)
### Migration Notes
- Replace `PostProcessingUtils` import → `RendererUtils`
- Replace `textureNode.uv(...)` → `textureNode.sample(...)`

## r171 (2024-11-29)
### New Features
- Global: WebGL and WebGPU entrypoints are now code-split; `three.tsl.js` introduced as dedicated TSL entry
- PMREMGenerator: Add `fromSceneAsync()` and optional `renderTarget` in `fromScene()`
- NodeMaterial: Add `.castShadowNode` and `.receivedShadowNode`
- Renderer: Add `hasInitialized()` and `initTexture()`
- WebGLRenderer: Add support for copying mipmap data between textures
- WebGPURenderer: `ClippingGroup` object, hardware clipping support, `PointShadowNode`, logarithmic depth buffer rename/revision, `SpotLight.map` support
- TSL: Introduce `shadows`, `instance()`, `attributeArray()`, `instancedArray()`
- BufferGeometry: Fix `setFromPoints()` when updating with smaller point sets
### Deprecations
- TSL: `storageObject()` deprecated — use `attributeArray()` / `instancedArray()` instead
### Breaking Changes
- BlendModes: All blend mode helpers now require `blend*` prefix (e.g. `blendAdd`, `blendMultiply`)
### Migration Notes
- Update imports if mixing WebGL/WebGPU — the split entrypoints change how you import
- Replace `storageObject()` with `attributeArray()` or `instancedArray()`
- BlendModes API: prefix all blend function calls with `blend` (e.g. `add` → `blendAdd`)
