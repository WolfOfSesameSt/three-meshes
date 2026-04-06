---
name: generate-sfx
description: Generate a sound effect using the ElevenLabs API. Provide a descriptive prompt, optional duration, and filename.
argument-hint: "prompt" [--duration N] [--name filename]
user-invocable: true
allowed-tools: Bash Read
---

# Generate Sound Effect

Generate an AI sound effect via ElevenLabs and save to `public/audio/sfx/`.

## Usage

```bash
node src/games/void-raiders/audio/elevenlabs.js sfx "$ARGUMENTS"
```

## Before Generating

1. **Check budget first**: `node src/games/void-raiders/audio/elevenlabs.js budget`
2. Estimate cost: custom duration = 40 credits/second, auto = 200 credits flat
3. If budget is tight, use shorter durations (0.5-2s for most SFX)

## Prompt Tips

Be specific and descriptive:
- Weapon: "sharp sci-fi laser blast, short pulse, energy weapon" --duration 1
- Impact: "metallic shield impact with energy ripple, sci-fi" --duration 1
- Explosion: "deep space explosion, hull breach, debris scatter" --duration 3
- UI: "soft holographic interface click, futuristic" --duration 0.3
- Ambient: "low engine hum, spacecraft interior, steady" --duration 15 --loop

## Examples

```bash
# Weapon sounds
node src/games/void-raiders/audio/elevenlabs.js sfx "sharp sci-fi pulse laser shot" --duration 1 --name weapon-pulse
node src/games/void-raiders/audio/elevenlabs.js sfx "alien plasma bolt launch with crackling energy" --duration 1.5 --name weapon-plasma

# Impact sounds
node src/games/void-raiders/audio/elevenlabs.js sfx "energy shield absorbing impact, electrical ripple" --duration 1 --name shield-hit
node src/games/void-raiders/audio/elevenlabs.js sfx "heavy metallic hull impact, space debris" --duration 1.5 --name hull-hit

# Mining
node src/games/void-raiders/audio/elevenlabs.js sfx "continuous mining laser beam humming on rock" --duration 3 --name mining-beam --loop
```
