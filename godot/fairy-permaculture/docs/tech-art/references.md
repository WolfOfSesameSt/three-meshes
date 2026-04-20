# References — Annotated

Organized by topic. Each entry: one-sentence summary + when to consult.

## Godot 4 rendering — authoritative

- [Godot docs — Spatial shader reference](https://docs.godotengine.org/en/stable/tutorials/shaders/shader_reference/spatial_shader.html) — canonical list of built-ins, render_mode flags, `light()` signature. **Consult first** for any shader edit.
- [Godot docs — Fog shaders](https://docs.godotengine.org/en/stable/tutorials/shaders/shader_reference/fog_shader.html) — custom `FogVolume` shaders (Forward+ only).
- [Godot docs — FastNoiseLite](https://docs.godotengine.org/en/stable/classes/class_fastnoiselite.html) — noise types, fractal settings, domain warp built-in.
- [Godot docs — GPUParticles3D](https://docs.godotengine.org/en/stable/classes/class_gpuparticles3d.html) / [creating a 3D particle system](https://docs.godotengine.org/en/stable/tutorials/3d/particles/creating_a_3d_particle_system.html) — emission shapes, process material, draw passes.
- [Godot docs — Environment](https://docs.godotengine.org/en/stable/classes/class_environment.html) — every property. Note: `adjustment_*` is Forward+/Mobile only.
- [Godot docs — HeightMapShape3D](https://docs.godotengine.org/en/stable/classes/class_heightmapshape3d.html) — single-collider terrain.

## GL Compatibility renderer — issues & tracking

- [Issue #66458 — 4.x OpenGL Compatibility renderer tracker](https://github.com/godotengine/godot/issues/66458) — master issue. **Check before blaming your shader.**
- [Issue #92144 — ALPHA=1.0 still marks material transparent](https://github.com/godotengine/godot/issues/92144) — cost us a day.
- [Issue #101605 — source_color uniform default wrong](https://github.com/godotengine/godot/issues/101605) — our gotcha #1.
- [Issue #94183 — FOG writing fails on Compat without WorldEnvironment fog](https://github.com/godotengine/godot/issues/94183).
- [Issue #103675 — NORMAL no longer normalized](https://github.com/godotengine/godot/issues/103675) — always call `normalize(NORMAL)`.
- [Proposal #12119 — shader precompilation for Compat](https://github.com/godotengine/godot-proposals/issues/12119) — until merged, warm up shaders at boot.
- [Godot Rendering Priorities Sep 2024](https://godotengine.org/article/rendering-priorities-september-2024/) — where Compat is on the roadmap.

## Toon / cel shading

- [Roystan — Unity Toon Shader](https://roystan.net/articles/toon-shader/) — the canonical beginner article. Math translates 1:1 to Godot. **Read for rim & ramp formulas.**
- [Complete Cel Shader for Godot 4 — eldskald](https://github.com/eldskald/godot4-cel-shader) ([Godot Shaders page](https://godotshaders.com/shader/complete-cel-shader-for-godot-4/)) — production-grade modular cel with multiple lights, anisotropy, specular. Reference when we need more than 2 bands.
- [gameidea — toon/cel shader](https://gameidea.org/2024/02/15/toon-cel-shader/) — `light()`-based implementation our current shader is adapted from.
- [Baldur Games — stylized toon shaders in Godot, Pt 1](https://baldurgames.com/posts/stylized-shaders-godot) + [Pt 2 shadows](https://baldurgames.com/posts/stylized-shadows-in-godot-toon-shaders-part-two) — Godot 4 specific walkthrough.
- [Binbun3D — Godot toon shading](https://bun3d.com/tutorials/shading/godot-toon-shading/) — `StandardMaterial3D` quick path, good for prototyping.
- [Daniel Ilett — BOTW cel shading breakdown](https://danielilett.com/2020-03-21-tut5-1-urp-cel-shading/) + [GitHub project](https://github.com/daniel-ilett/shaders-botw-cel-shading) — deep dive into Breath of the Wild's technique.
- [GDC 2015 — Guilty Gear Xrd art style](https://www.gdcvault.com/play/1022031/GuiltyGearXrd-s-Art-Style-The) — vertex-normal manipulation for "2D inside 3D". Aspirational but informative.
- [Several Graphic Discoveries in BOTW](https://guardhei.github.io/2019/10/breath-of-the-wild-graphics-discoveries/) — rim light, SSS fake, optimization notes.

## Water

- [Stylized Water for Godot 4.x](https://godotshaders.com/shader/stylized-water-for-godot-4-x/) — community reference; our pond is cribbed from here.
- [Stylized Water with DepthFade](https://godotshaders.com/shader/stylized-water-with-depthfade/) — depth-read foam approach.
- [Absorption-Based Stylized Water](https://godotshaders.com/shader/absorption-based-stylized-water/) — Beer's law tint with depth.
- [Roystan — Unity Toon Water](https://roystan.net/articles/toon-water/) — depth-fade + noise foam, the blueprint. Translates directly.
- [gameidea — stylized 3D water shader](https://gameidea.org/2026/02/01/creating-a-stylized-3d-water-shader/) — vertex-displaced + Gerstner.
- [StayAtHomeDev — single-plane water](https://stayathomedev.com/tutorials/single-plane-water-shader/) — minimal starting point.
- [Chrisknyfe — boujie_water_shader](https://github.com/Chrisknyfe/boujie_water_shader) — full-featured port of an old Godot 3 shader.

## Procedural terrain

- [Inigo Quilez — domain warping](https://iquilezles.org/articles/warp/) — the warp trick that makes noise look geological. **Essential**.
- [Inigo Quilez — painting a picture with math / terrain](https://iquilezles.org/articles/morenoise/) — fBM over terrain, derivative noise.
- [Book of Shaders — fBM](https://thebookofshaders.com/13/) / [more noise](https://thebookofshaders.com/12/) — clear pedagogical walkthrough.
- [alpapaydin — Godot4 procedural world generation](https://github.com/alpapaydin/Godot4-3D-Procedural-World-Generation) — 75-line minimal chunk system.
- [alpapaydin — Smooth destructible terrain](https://github.com/alpapaydin/Godot4-3D-Smooth-Destructible-Terrain) — 100-line smooth terrain with dig.
- [Glusoft — FastNoiseLite terrain](https://glusoft.com/godot-tutorials/make-procedural-terrain-FastNoiseLite/) — Godot 4 procedural terrain walkthrough.
- [Sebastian Lague — erosion](https://www.youtube.com/watch?v=eaXk97ujbPQ) — Unity but algorithm ports cleanly; hydraulic erosion basics.

## Lighting & atmosphere

- [Godot forum — realistic lighting in Godot 4](https://forum.godotengine.org/t/tutorial-realistic-lighting-in-godot-4/87219) — phase-by-phase Environment numbers we cribbed.
- [TokisanGames — Sky3D plugin](https://github.com/TokisanGames/Sky3D) — atmospheric day/night with sun/moon math.
- [eisclimber — DynamicDayNightCycles plugin](https://github.com/eisclimber/DynamicDayNightCycles) — alternative plugin, lighter weight.
- [christinec-dev — shader-based Day/Night](https://github.com/christinec-dev/DayNightCycleGodot) — pure-shader approach (no plugin deps).
- [Distance Gradient Fog 4.3+](https://godotshaders.com/shader/distance-gradient-fog-4-3/) — post-process atmospheric perspective via gradient texture.
- [Moving gradient noise fog/mist](https://godotshaders.com/shader/moving-gradient-noise-fog-mist-for-godot-4/) — ground fog billboard reference.

## Ghibli-lite art direction

- [80.lv — Ghibli environment in UE](https://80.lv/articles/working-on-an-environment-in-ghibli-style) — lighting breakdown, warm-key cool-fill.
- [80.lv — cozy Ghibli scene in UE5](https://80.lv/articles/creating-a-cozy-ghibli-inspired-scene-in-unreal-engine-5) — palette + LUT workflow.
- [Kids With Sticks — Ghibli in UE4](https://kidswithsticks.com/creating-stylized-art-inspired-by-ghibli-using-unreal-engine-4/) — soft shadow + indirect lighting recipe.
- [ustwo — Alba environment art](https://medium.com/@ustwogames/the-environment-art-of-alba-a-wildlife-adventure-6bddd8b56955) — Sorolla palette reference, gradient-UV trick, mobile-optimized stylization.
- [PlayStation Blog — A Short Hike postmortem](https://blog.playstation.com/2021/08/05/crafting-a-tiny-open-world-a-look-behind-the-scenes-at-the-creation-of-a-short-hike/) — intentional low-res pixelation aesthetic.
- [GameDeveloper — Sable art style interview](https://www.gamedeveloper.com/design/for-i-sable-i-developing-an-evocative-art-style-comes-first) — evocative-direction-first process.

## Math, curves, math viz

- [Freya Holmér — YouTube channel](https://www.youtube.com/channel/UC7M-Wz4zK8oikt6ATcoTwBA) — the best tech-art math teacher alive. Watch "The Simple Yet Powerful Math We Don't Talk About" first.
- [Freya Holmér — Bézier curves](https://acegikmo.medium.com/the-ever-so-lovely-b%C3%A9zier-curve-eb27514da3bf) — Bézier fundamentals via lerp.
- [Freya Holmér — Inverse Lerp](https://www.gamedev.net/tutorials/programming/general-and-gameplay-programming/inverse-lerp-a-super-useful-yet-often-overlooked-function-r5230/) — `inverse_lerp` + `remap` for shader authoring.
- [FreyaHolmer — GitHub gists](https://gist.github.com/FreyaHolmer) — reference implementations.

## Tutorial sites (general)

- [Ronja's Shader Tutorials](https://www.ronja-tutorials.com/) — Unity-biased HLSL, but math transfers. Good for "I need a specific effect, now".
- [Catlike Coding](https://catlikecoding.com/unity/tutorials/) — Unity-only, text-based, deep. Cite for math and theory only.
- [Godot Shaders (community)](https://godotshaders.com/) — the drop-in shader library. Always read the comments before shipping something from here.
- [GDQuest demos — godot-shaders](https://github.com/gdquest-demos/godot-shaders) — MIT-licensed, vetted references.

## Tools / assets

- [Godot GFX Library — haowg](https://github.com/haowg/GODOT-VFX-LIBRARY) — pre-built action-game particles; firefly/pollen examples adaptable.
- [Mesh2Motion](https://mesh2motion.org/) — auto-rig + auto-animate for fairy/creature meshes (referenced in MEMORY.md).

## "No authoritative source found" notes

- **GDC 2024 Guilty Gear Strive talk** — user mentioned; didn't find one. The 2015 Xrd talk is the canonical Arc System Works rendering reference. Strive builds on the same pipeline with some tweaks documented only in forum posts.
- **Martin Palko / Andri Ávila on Godot stylized shaders** — no direct authoritative source. Best-effort alternative: eldskald's cel shader + Baldur Games' tutorial series.
