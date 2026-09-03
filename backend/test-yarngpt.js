import 'dotenv/config';
import fs from 'fs';

async function run() {
  const apiKey = process.env.YARNGPT_API_KEY;
  console.log("YARNGPT_API_KEY Configured:", apiKey ? `Yes (starts with ${apiKey.substring(0, 5)})` : 'NO - IT IS MISSING');
  
  if (!apiKey) {
    console.log("Cannot test without an API key.");
    return;
  }

  const text = "Testing Yarn GPT audio generation.";
  console.log(`Sending text: "${text}"`);
  
  try {
    const res = await fetch(`https://yarngpt.ai/api/v1/tts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          voice: process.env.YARNGPT_VOICE || 'Idera',
          response_format: 'mp3',
        }),
    });
    
    if (!res.ok) {
        const errText = await res.text();
        console.error("API Call FAILED!");
        console.error("Status:", res.status);
        console.error("Response:", errText);
    } else {
        console.log("API Call SUCCESS!");
        const buf = Buffer.from(await res.arrayBuffer());
        console.log("Received buffer size:", buf.length, "bytes");
    }
  } catch (err) {
    console.error("Network or execution error:", err.message);
  }
}

run();
