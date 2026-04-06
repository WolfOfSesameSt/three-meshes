import 'dotenv/config';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

async function streamToBuffer(stream) {
  const reader = stream.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Generate a sound effect from a text description.
 */
export async function generateSoundEffect(text, options = {}) {
  const { durationSeconds, promptInfluence = 0.3, outputFormat = 'mp3_44100_128' } = options;

  const audioStream = await elevenlabs.textToSoundEffects.convert({
    text,
    durationSeconds,
    promptInfluence,
    outputFormat,
  });

  return streamToBuffer(audioStream);
}

/**
 * Generate music from a text description.
 */
export async function generateMusic(text, options = {}) {
  // ElevenLabs sound effects API handles music generation too —
  // use longer durations and music-oriented prompts
  const { durationSeconds = 30, promptInfluence = 0.5, outputFormat = 'mp3_44100_128' } = options;

  const audioStream = await elevenlabs.textToSoundEffects.convert({
    text,
    durationSeconds,
    promptInfluence,
    outputFormat,
  });

  return streamToBuffer(audioStream);
}

// --- CLI ---
const [,, command, ...args] = process.argv;

const USAGE = `
Usage:
  node src/elevenlabs.js sfx   "<description>" [duration] [output]
  node src/elevenlabs.js music  "<description>" [duration] [output]

Examples:
  node src/elevenlabs.js sfx "wooden door creaking open" 3 public/audio/door.mp3
  node src/elevenlabs.js music "upbeat chiptune adventure theme" 30 public/audio/theme.mp3
`;

async function main() {
  if (!command || command === '--help' || command === '-h') {
    console.log(USAGE);
    process.exit(0);
  }

  if (!process.env.ELEVENLABS_API_KEY) {
    console.error('Error: ELEVENLABS_API_KEY not set in .env');
    process.exit(1);
  }

  const description = args[0];
  if (!description) {
    console.error('Error: description is required');
    console.log(USAGE);
    process.exit(1);
  }

  const duration = args[1] ? parseFloat(args[1]) : undefined;
  const output = args[2] || `public/audio/${command}_${Date.now()}.mp3`;

  console.log(`Generating ${command}: "${description}"${duration ? ` (${duration}s)` : ''}...`);

  let buffer;
  if (command === 'sfx') {
    buffer = await generateSoundEffect(description, { durationSeconds: duration });
  } else if (command === 'music') {
    buffer = await generateMusic(description, { durationSeconds: duration || 30 });
  } else {
    console.error(`Unknown command: ${command}`);
    console.log(USAGE);
    process.exit(1);
  }

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, buffer);
  console.log(`Saved to ${output} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
