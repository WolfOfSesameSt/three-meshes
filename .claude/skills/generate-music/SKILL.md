---
name: generate-music
description: Generate music using the ElevenLabs API. Provide a mood/style prompt, duration, and filename. Use "plan" subcommand first (free) to preview structure.
argument-hint: "prompt" [--duration N] [--name filename]
user-invocable: true
allowed-tools: Bash Read
---

# Generate Music

Generate an AI music track via ElevenLabs and save to `public/audio/music/`.

## Usage

```bash
# Plan first (FREE — no credits)
node src/games/void-raiders/audio/elevenlabs.js plan "your music prompt"

# Generate (costs ~500 credits/minute)
node src/games/void-raiders/audio/elevenlabs.js music "$ARGUMENTS"
```

## Before Generating

1. **Always plan first** — the plan endpoint is free and shows what ElevenLabs will create
2. **Check budget**: `node src/games/void-raiders/audio/elevenlabs.js budget`
3. Music costs ~500 credits/minute (rounded up). A 30s track costs 500 credits. A 60s track costs 500 credits. A 90s track costs 1000 credits.

## Prompt Tips

Describe mood, instruments, tempo, and genre:
- "Dark ambient electronic space theme, slow pulsing synths, mysterious, no drums"
- "Intense orchestral battle music with electronic undertones, driving percussion, escalating tension"
- "Calm ethereal ambient music for a space station, gentle pads, distant echoes, contemplative"

## Game Music Needs

| Track | Mood | Duration | Priority |
|-------|------|----------|----------|
| Station theme | Calm, mysterious, planning | 60-120s | High |
| Mission ambient | Tense, building, watchful | 60-120s | High |
| Combat escalation | Intense, driving, urgent | 60s | Medium |
| Extraction urgency | Frantic, racing, climactic | 30-60s | Medium |
| Victory/extraction complete | Triumphant, relieved | 15-30s | Low |

## Examples

```bash
# Plan first (free)
node src/games/void-raiders/audio/elevenlabs.js plan "dark ambient electronic space pirate theme with slow synths and distant echoes"

# Generate
node src/games/void-raiders/audio/elevenlabs.js music "dark ambient electronic space pirate theme, slow pulsing synthesizers, mysterious undertone, deep bass" --duration 60 --name station-theme
node src/games/void-raiders/audio/elevenlabs.js music "tense sci-fi mission music, building intensity, electronic percussion, synth layers" --duration 60 --name mission-ambient
```
