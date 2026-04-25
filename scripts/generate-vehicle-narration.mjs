/**
 * Generates vehicle showcase narration using Google Cloud TTS (WaveNet).
 * Free tier: 1M WaveNet characters/month — enough for ~1,000 vehicle videos.
 * Output: public/remotion/vehicle-narration.mp3
 *
 * Setup:
 *   1. Enable Cloud Text-to-Speech API in Google Cloud Console
 *   2. Create an API key (APIs & Services → Credentials)
 *   3. Add to .env.local: GOOGLE_TTS_API_KEY=AIza...
 *
 * Usage:
 *   GOOGLE_TTS_API_KEY=AIza... node scripts/generate-vehicle-narration.mjs
 *
 * WaveNet voices to try (pass as VOICE env var):
 *   en-US-Wavenet-D  — deep, authoritative male (default)
 *   en-US-Wavenet-J  — smooth, warm male
 *   en-US-Wavenet-F  — clear, confident female
 *   en-US-Wavenet-H  — natural, expressive female
 *
 * Neural2 voices (higher quality, same free tier):
 *   en-US-Neural2-D  — deep male
 *   en-US-Neural2-F  — natural female
 *   en-US-Neural2-J  — warm male
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const NARRATION = `
Meet the 2024 Honda HR-V Sport from Apollo Auto in El Monte, California.

Under twenty thousand miles, Sport trim, and loaded with tech — Apple CarPlay, Android Auto, remote start, and adaptive cruise control.

Twenty-six city, thirty-two highway. Comfortable inside, sharp outside in Teal with a Charcoal interior.

Comparable HR-Vs in Los Angeles are listed at twenty-three to twenty-five thousand. We have it at seventeen-nine-ninety-five — salvage title, priced accordingly, and a smart buy for the right person.

Call or text Apollo Auto at six two six, two one five, oh four four oh. Or visit ApolloAuto dot US.
`.trim();

const API_KEY = process.env.GOOGLE_TTS_API_KEY;
if (!API_KEY) {
  console.error('Error: GOOGLE_TTS_API_KEY env var is required.');
  console.error('Get one at: console.cloud.google.com → APIs & Services → Credentials');
  process.exit(1);
}

const voice   = process.env.VOICE ?? 'en-US-Neural2-D';
const outDir  = path.resolve(__dirname, '../public/remotion');
const outFile = path.join(outDir, 'vehicle-narration.mp3');

fs.mkdirSync(outDir, { recursive: true });

console.log(`Generating narration with Google Cloud TTS voice "${voice}"...`);
console.log(`Characters: ${NARRATION.length} (free up to 1,000,000/month)`);

const response = await fetch(
  `https://texttospeech.googleapis.com/v1/text:synthesize?key=${API_KEY}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text: NARRATION },
      voice: {
        languageCode: 'en-US',
        name: voice,
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: 0.95,  // slightly slower for clarity
        pitch: -1.0,         // slightly lower for authority
        effectsProfileId: ['headphone-class-device'],
      },
    }),
  }
);

if (!response.ok) {
  const err = await response.json();
  console.error('Google TTS error:', JSON.stringify(err, null, 2));
  process.exit(1);
}

const { audioContent } = await response.json();
const buffer = Buffer.from(audioContent, 'base64');
fs.writeFileSync(outFile, buffer);

console.log(`\nDone. Saved to: ${outFile}`);
console.log(`File size: ${(buffer.length / 1024).toFixed(1)} KB`);
console.log('\nVoices to compare:');
console.log('  VOICE=en-US-Neural2-D node scripts/generate-vehicle-narration.mjs  (deep male)');
console.log('  VOICE=en-US-Neural2-J node scripts/generate-vehicle-narration.mjs  (warm male)');
console.log('  VOICE=en-US-Neural2-F node scripts/generate-vehicle-narration.mjs  (female)');
console.log('\nNext:');
console.log('  npx remotion render remotion/index.tsx VehicleShowcase out/hrv-showcase.mp4');
