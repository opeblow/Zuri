import 'dotenv/config';
import { textToSpeech } from './src/services/ai.js';
import { buildSalaryLandedMessage } from './src/services/ai.js';

async function run() {
  const msg = buildSalaryLandedMessage({}, 45_000_000, { goals: [], automations: [] });
  console.log(msg.spoken_text);
  const tts = await textToSpeech(msg.spoken_text, 'en');
  console.log("TTS Result:", tts.audioUrl ? "Success (len: " + tts.audioUrl.length + ")" : "Failed: " + JSON.stringify(tts));
}
run();
