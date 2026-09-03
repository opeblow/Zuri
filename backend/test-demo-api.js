async function run() {
  const loginRes = await fetch('http://localhost:5001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '08012345678', pin: '1234' })
  });
  const { token } = await loginRes.json();
  
  console.log("Got token, hitting salary-landed...");
  const res = await fetch('http://localhost:5001/api/demo/salary-landed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  console.log("Result:", data.proactive ? (data.proactive.audio_url ? "Has audio_url (len " + data.proactive.audio_url.length + ")" : "NO AUDIO URL") : "NO PROACTIVE");
}
run();
