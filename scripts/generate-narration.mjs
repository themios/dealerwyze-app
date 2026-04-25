/**
 * Generates narration MP3 for the DealerWyzePitch Remotion composition.
 * Output: apollo-crm/public/remotion/narration.mp3
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... node scripts/generate-narration.mjs
 *
 * Voices to try: alloy | echo | fable | onyx | nova | shimmer
 *   onyx  — deep, authoritative male
 *   nova  — warm, confident female
 *   echo  — clear, neutral male
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const NARRATION = `
A buyer asks about a car on your lot at nine-oh-two in the morning.
The lead lands in Gmail. Maybe a text. Maybe on CarGurus.
You're with another customer. You mean to reply.
You reply at eleven-thirty.

By then, two other dealers already answered.
The buyer is already in conversation. The deal is gone.

You didn't lose it because your car was worse.
You lost it because you replied late.

DealerWyze fixes that.
One place for every lead, every car, and every next step.
Gmail, CarGurus, AutoTrader, texts — all in a single Today view, ranked by who needs a reply right now.

Smart templates fill in the customer's name, the exact car, and the listing link.
You pick the right message and hit send.
Personal reply in under sixty seconds.

Every call creates a follow-up task.
Response time is tracked.
Nothing falls through the cracks.

Too small for a CRM? DealerWyze is built for small lots.
No time to learn something new? First reply is pick a template and send. That's it.

The question isn't whether you can afford a CRM.
It's whether you can afford to keep losing deals to the dealer who replied at nine-oh-five.

Try DealerWyze.
One place for every lead, every car, every next step.
dealerwyze dot com.
`.trim();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY env var is required.');
  process.exit(1);
}

const voice = process.env.VOICE ?? 'onyx'; // override with VOICE=nova node ...
const outDir = path.resolve(__dirname, '../public/remotion');
const outFile = path.join(outDir, 'narration.mp3');

fs.mkdirSync(outDir, { recursive: true });

console.log(`Generating narration with voice "${voice}"...`);

const response = await fetch('https://api.openai.com/v1/audio/speech', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'tts-1-hd',
    input: NARRATION,
    voice,
    response_format: 'mp3',
    speed: 0.95, // slightly slower for clarity
  }),
});

if (!response.ok) {
  const err = await response.text();
  console.error('OpenAI TTS error:', err);
  process.exit(1);
}

const buffer = Buffer.from(await response.arrayBuffer());
fs.writeFileSync(outFile, buffer);

console.log(`Done. Audio saved to: ${outFile}`);
console.log(`File size: ${(buffer.length / 1024).toFixed(1)} KB`);
console.log('');
console.log('Next: run "npx remotion studio remotion/index.tsx" and check timing.');
console.log('Adjust PITCH_DURATION in DealerWyzePitch/index.tsx if needed.');
