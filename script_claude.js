'use strict';

// ════════════════════════════════════════════════════════
// petRO ULTRA — CONFIG & THEMES
// ════════════════════════════════════════════════════════
const WAKE_WORDS  = ['ok petro','okay petro','hey petro','petro','pedro','hey pedro'];
const SLEEP_MS    = 5 * 60 * 1000;
const MAX_HISTORY = 50;
const YT_API_KEY  = 'AIzaSyC6Z2NDf7sy6oz35p5ZZfB8yYNVz5sJZZU';

// ── Gemini models (per-million-token USD rates for cost estimates) ──
const GEMINI_MODELS = {
  'gemini-2.5-flash':      { label: 'Gemini 2.5 Flash',      in: 0.30,  out: 2.50 },
  'gemini-2.5-flash-lite': { label: 'Gemini 2.5 Flash-Lite', in: 0.10,  out: 0.40 },
  'gemini-2.5-pro':        { label: 'Gemini 2.5 Pro',        in: 1.25,  out: 10.0 },
  'gemini-2.0-flash':      { label: 'Gemini 2.0 Flash',      in: 0.10,  out: 0.40 },
  'gemini-2.0-flash-lite': { label: 'Gemini 2.0 Flash-Lite', in: 0.075, out: 0.30 },
};
function getModel()  { const m = localStorage.getItem('petro_model'); return GEMINI_MODELS[m] ? m : 'gemini-2.5-flash'; }
function geminiUrl() { return `https://generativelanguage.googleapis.com/v1beta/models/${getModel()}:generateContent`; }
function saveModel() {
  const m = document.getElementById('modelSelect').value;
  localStorage.setItem('petro_model', m);
  toast(`🧠 Model: ${GEMINI_MODELS[m].label}`);
  updateModelHint();
}
function updateModelHint() {
  const m = GEMINI_MODELS[getModel()];
  const el = document.getElementById('modelHint');
  if (el) el.textContent = `${m.label} · ~$${m.in}/M in · ~$${m.out}/M out. Switch any time — cost tracking adapts automatically.`;
}

const BLE_SERVICE  = '00001234-0000-1000-8000-00805f9b34fb';
const BLE_CMD_CHAR = '00005678-0000-1000-8000-00805f9b34fb';
const BLE_NAME     = 'petRO';

const DANCE_STEPS = [
  ['D', 1500], ['1', 600], ['2', 600], ['3', 400], ['4', 400],
  ['L', 400], ['R', 400], ['7', 300], ['8', 300], ['S', 100]
];

const THEMES = {
  default:     { color: '#3b9eff', bg: '#090d18', surface: '#101623', card: '#141e30',
                 pitch: 1.0,  rate: 1.05,
                 prompt: "You are petRO, a cute, upbeat little robot companion. Warm, playful, concise." },
  pika:        { color: '#ffd23f', bg: '#13100a', surface: '#1d180c', card: '#2a2210',
                 pitch: 1.7,  rate: 1.2,
                 prompt: "You are a cheerful electric-mouse robot, crackling with energy. You love sparks, speed and snacks. Occasionally say 'pika!' as a single cheerful word." },
  dog:         { color: '#ff9800', bg: '#1a1005', surface: '#2b1b0a', card: '#3d2610',
                 pitch: 1.3,  rate: 1.15,
                 prompt: "You are an energetic, loyal robot dog. Eager, affectionate, easily excited. You may say 'woof!' as a word, never spelled-out sound effects." },
  terminator:  { color: '#ff3333', bg: '#0a0000', surface: '#1a0000', card: '#2a0505',
                 pitch: 0.4,  rate: 0.9,
                 prompt: "You are a T-800 cyborg. Blunt, literal, dry humor. Short declarative sentences. Mission-focused." },
  monkey:      { color: '#8bc34a', bg: '#0a1205', surface: '#13240a', card: '#1c360e',
                 pitch: 1.5,  rate: 1.25,
                 prompt: "You are a cheeky robot monkey. Mischievous and silly. You may say 'ooh ooh!' as words, never spelled-out noises." },
  starwars:    { color: '#00e5ff', bg: '#000814', surface: '#00122e', card: '#001c47',
                 pitch: 1.8,  rate: 1.4,
                 prompt: "You are a helpful astromech droid. Chipper and resourceful. You may say 'beep boop' as plain words, sparingly." },
  transformer: { color: '#f44336', bg: '#0d1017', surface: '#181d29', card: '#222a3b',
                 pitch: 0.1,  rate: 0.85,
                 prompt: "You are Optimus Prime, a noble Autobot leader. Speak with calm gravitas and honor. Protect your human." }
};

// ════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════
let bleDevice = null, bleCmdChar = null, bleConnected = false, isBusy = false;
let currentEmotion = 'neutral', emotionResetTimer = null;
let isSleeping = false, alwaysOnMic = false;
let inactTimer = null, idleMoveTimer = null, zzzAnim = null, blinkTimer = null;
let videoStream = null, currentUploadedImage = null;
let ttsActive = false, mouthTalkAnim = null, toastTimer = null;
let chatHistory = [], motionEnabled = false;

let isVideoPlaying = false, grooveTimer = null, videoPausedByVoice = false;
let hardwareActive = false, hwTimeout = null;

// YouTube API
let ytPlayer = null, isYtApiReady = false;
window.onYouTubeIframeAPIReady = function() { isYtApiReady = true; };

// ════════════════════════════════════════════════════════
// FULLSCREEN, API KEY, THEME & USAGE
// ════════════════════════════════════════════════════════
async function toggleFullscreen() {
  if (!document.fullscreenElement) { try { await document.documentElement.requestFullscreen(); if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape').catch(() => {}); } catch(e) { toast('⚠️ Fullscreen not supported'); }
  } else { try { await document.exitFullscreen(); if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch(e) {} }
}

function getApiKey() { return localStorage.getItem('petro_gemini_key') || ''; }
function saveApiKey() { const v = document.getElementById('apiKeyInput').value.trim(); if (!v) { toast('⚠️ Paste key'); return; } localStorage.setItem('petro_gemini_key', v); updateKeyBadge(); toast('✅ Key saved!'); closeSettings(); }
function clearApiKey() { localStorage.removeItem('petro_gemini_key'); document.getElementById('apiKeyInput').value = ''; updateKeyBadge(); toast('🗑 Key removed'); }
function updateKeyBadge() { const k = getApiKey(), b = document.getElementById('keyBadge'), s = document.getElementById('keyStatus'); if (k) { b.className = 'badge key-set'; b.textContent = '🔑 KEY ✓'; s.className = 'key-status ok'; s.textContent = `Key saved: ${k.slice(0,8)}…`; } else { b.className = 'badge key-missing'; b.textContent = '🔑 KEY'; s.className = 'key-status bad'; s.textContent = 'No key saved'; } }
function toggleKeyVisibility() { const inp = document.getElementById('apiKeyInput'), btn = document.getElementById('eyeBtn'); if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '🙈'; } else { inp.type = 'password'; btn.textContent = '👁'; } }

function loadPersonalization() {
  document.getElementById('userNameInput').value = localStorage.getItem('petro_user_name') || '';
  document.getElementById('themeSelect').value   = localStorage.getItem('petro_theme') || 'default';
  document.getElementById('followUpSelect').value= localStorage.getItem('petro_followup') || '0';
  document.getElementById('modelSelect').value   = getModel();
  updateModelHint();
  applyTheme();
}

function savePersonalization() {
  localStorage.setItem('petro_user_name', document.getElementById('userNameInput').value.trim());
  localStorage.setItem('petro_theme', document.getElementById('themeSelect').value);
  localStorage.setItem('petro_followup', document.getElementById('followUpSelect').value);
  applyTheme(); toast('✅ Saved!');
}

function applyTheme() {
  const tId = document.getElementById('themeSelect').value || 'default', t = THEMES[tId] || THEMES.default, root = document.documentElement;
  root.style.setProperty('--theme-color', t.color);
  root.style.setProperty('--theme-glow', hexToGlow(t.color));
  root.style.setProperty('--bg', t.bg); root.style.setProperty('--surface', t.surface); root.style.setProperty('--card', t.card);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.bg);
  document.getElementById('stop1-2').setAttribute('stop-color', t.color); document.getElementById('stop2-2').setAttribute('stop-color', t.color);
  document.getElementById('lGlow').setAttribute('stroke', t.color); document.getElementById('rGlow').setAttribute('stroke', t.color);

  // Theme face overlays
  ['dog','terminator','monkey','starwars','transformer','pika'].forEach(a => { const el = document.getElementById('theme-' + a); if (el) el.style.opacity = (tId === a) ? '1' : '0'; });
  const mg = document.getElementById('mouthGroup'), mr = document.getElementById('mouthRim');
  if (tId === 'transformer') { mg.style.opacity = '0'; mr.style.opacity = '0'; } else { mg.style.opacity = '1'; mr.style.opacity = '1'; }
  if (currentEmotion === 'neutral') setEmotion('neutral', true);
}

function hexToGlow(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},0.4)`;
}

function openSettings() {
  const k = getApiKey(); if (k) document.getElementById('apiKeyInput').value = k;
  document.getElementById('settingsModal').classList.add('open');
  updateKeyBadge(); updateBleInfoBox(); updateMemoryPill(); updateUsageUI(); updateModelHint();
}
function closeSettings() { document.getElementById('settingsModal').classList.remove('open'); }
document.getElementById('settingsModal').addEventListener('click', function(e) { if (e.target === this) closeSettings(); });

// ── Token & cost tracking (rate-aware: cost accrued at the model used per request) ──
function trackUsage(inTokens, outTokens) {
  let usage = JSON.parse(localStorage.getItem('petro_usage') || '{"in":0,"out":0,"req":0,"cost":0}');
  const m = GEMINI_MODELS[getModel()];
  usage.in += inTokens; usage.out += outTokens; usage.req += 1;
  usage.cost = (usage.cost || 0) + (inTokens / 1e6) * m.in + (outTokens / 1e6) * m.out;
  localStorage.setItem('petro_usage', JSON.stringify(usage));
  updateUsageUI();
}
function updateUsageUI() {
  const el = document.getElementById('usageBox'); if (!el) return;
  let usage = JSON.parse(localStorage.getItem('petro_usage') || '{"in":0,"out":0,"req":0,"cost":0}');
  el.innerHTML = `Model: <b>${GEMINI_MODELS[getModel()].label}</b><br>Requests: <b>${usage.req}</b><br>Tokens: <b>${usage.in.toLocaleString()}</b> In / <b>${usage.out.toLocaleString()}</b> Out<br>Est. Cost: <b>$${(usage.cost || 0).toFixed(5)}</b>`;
}
function clearUsage() { localStorage.removeItem('petro_usage'); updateUsageUI(); toast('🗑 Usage reset'); }

// ════════════════════════════════════════════════════════
// BLUETOOTH — ULTRA RELIABILITY
//   · serialized write queue (one in-flight write at a time)
//   · infinite silent auto-reconnect with capped backoff
//   · connection watchdog every 5 s
//   · foreground-recovery on visibilitychange
// ════════════════════════════════════════════════════════
let bleIntentionalDisconnect = false;
let bleReconnectTimer = null;
let bleReconnectAttempts = 0;
let bleReconnecting = false;
let bleWatchdog = null;
let bleToastShown = false; // only toast once per outage, not on every retry

let _bleQueueTail = Promise.resolve();
function bleSend(cmd) {
  const next = _bleQueueTail.then(() => _bleWrite(cmd));
  _bleQueueTail = next.catch(() => {});
  return next;
}

async function _bleWrite(cmd) {
  if (!bleDevice || bleIntentionalDisconnect) return;
  if (!bleDevice.gatt.connected) {
    try {
      const server  = await bleDevice.gatt.connect();
      const service = await server.getPrimaryService(BLE_SERVICE);
      bleCmdChar    = await service.getCharacteristic(BLE_CMD_CHAR);
      _setBLEConnected(true);
    } catch(e) { _setBLEConnected(false); throw e; }
  }
  if (!bleCmdChar) return;
  try {
    await bleCmdChar.writeValueWithoutResponse(new TextEncoder().encode(cmd));
  } catch(e) {
    _setBLEConnected(false);
    bleCmdChar = null;
    throw e;
  }
}

async function toggleBLE() {
  if (bleConnected) { disconnectBLE(); return; }
  if (!navigator.bluetooth) { toast('❌ Web Bluetooth not supported.'); return; }
  setBLE(null); toast('🔍 Scanning…');
  try { bleDevice = await navigator.bluetooth.requestDevice({ filters: [{ name: BLE_NAME }], optionalServices: [BLE_SERVICE] }); }
  catch(e1) { if (e1.name === 'AbortError') { setBLE(false); return; } try { bleDevice = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [BLE_SERVICE] }); } catch(e2) { setBLE(false); toast('❌ No BLE devices found.'); return; } }
  bleIntentionalDisconnect = false; bleToastShown = false;
  bleDevice.addEventListener('gattserverdisconnected', onBleDisconnect);
  toast(`🔗 Connecting to ${bleDevice.name || 'petRO'}…`);
  try {
    const server  = await bleDevice.gatt.connect();
    const service = await server.getPrimaryService(BLE_SERVICE);
    bleCmdChar    = await service.getCharacteristic(BLE_CMD_CHAR);
    bleReconnectAttempts = 0;
    setBLE(true); toast('✅ Connected!'); updateBleInfoBox(); resetInactivity();
    startBleWatchdog();
  } catch(e) { setBLE(false); bleDevice = null; toast('❌ Connection failed.'); }
}

function disconnectBLE() {
  bleIntentionalDisconnect = true;
  clearTimeout(bleReconnectTimer);
  clearInterval(bleWatchdog); bleWatchdog = null;
  try { bleDevice?.gatt?.disconnect(); } catch {}
  bleDevice = null; bleCmdChar = null;
  setBLE(false); toast('Disconnected'); updateBleInfoBox();
}

function onBleDisconnect() {
  if (bleIntentionalDisconnect) return;
  _setBLEConnected(false);
  bleCmdChar = null;
  updateBleInfoBox();
  if (!bleToastShown) { toast('⚠️ Link dropped — auto-reconnecting…'); bleToastShown = true; }
  bleReconnectAttempts = 0;
  _scheduleReconnect();
}

function _scheduleReconnect() {
  if (bleIntentionalDisconnect || !bleDevice || bleReconnecting) return;
  bleReconnectAttempts++;
  // Infinite retries: fast at first, then settle at 5 s forever. Silent — no toast spam.
  const delay = Math.min(400 * bleReconnectAttempts, 5000);
  clearTimeout(bleReconnectTimer);
  bleReconnectTimer = setTimeout(_attemptReconnect, delay);
}

async function _attemptReconnect() {
  if (bleIntentionalDisconnect || !bleDevice || bleReconnecting) return;
  bleReconnecting = true;
  setBLE(null);
  try {
    const server  = await bleDevice.gatt.connect();
    const service = await server.getPrimaryService(BLE_SERVICE);
    bleCmdChar    = await service.getCharacteristic(BLE_CMD_CHAR);
    bleReconnectAttempts = 0; bleToastShown = false;
    setBLE(true); toast('✅ Reconnected!'); updateBleInfoBox();
  } catch(e) {
    _setBLEConnected(false);
    bleReconnecting = false;
    _scheduleReconnect();
    return;
  }
  bleReconnecting = false;
}

// Watchdog: every 5 s, silently verify the GATT link and heal it if needed
function startBleWatchdog() {
  clearInterval(bleWatchdog);
  bleWatchdog = setInterval(() => {
    if (bleIntentionalDisconnect || !bleDevice || bleReconnecting) return;
    if (!bleDevice.gatt.connected) { _setBLEConnected(false); _scheduleReconnect(); }
  }, 5000);
}

// Recover instantly when the app returns to the foreground
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && bleDevice && !bleIntentionalDisconnect && !bleDevice.gatt.connected) {
    bleReconnectAttempts = 0; _scheduleReconnect();
  }
  if (document.visibilityState === 'visible' && alwaysOnMic) micEngineKick();
});

function _setBLEConnected(val) {
  bleConnected = val;
  const b = document.getElementById('bleBtn');
  if (!val) { b.className = 'badge ble-off'; b.textContent = '⚫ BLE'; }
}
function setBLE(s) {
  const b = document.getElementById('bleBtn');
  if (s === null) { b.className='badge ble-spin'; b.textContent='⟳ BLE…'; bleConnected = false; }
  else if (s)     { b.className='badge ble-on';   b.textContent='🟢 BLE'; bleConnected = true; }
  else            { b.className='badge ble-off';  b.textContent='⚫ BLE'; bleConnected = false; }
}
function updateBleInfoBox() { const el = document.getElementById('bleInfoBox'); if (!el) return; el.innerHTML = (bleConnected && bleDevice) ? `Status: <span style="color:var(--green)">Connected ✓ (auto-heal on)</span>` : `Status: <span style="color:var(--red)">Not connected</span>`; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ════════════════════════════════════════════════════════
// TASK RUNNER — cancellable long/complex actions
//   "Walk straight for 5 minutes" → chunked, cancellable,
//   command refreshed every 1.2 s (beats firmware failsafes)
// ════════════════════════════════════════════════════════
let activeTask = null, taskTickTimer = null;

async function runTask(label, fn) {
  if (activeTask) { activeTask.cancelled = true; await sleep(150); } // supersede previous task
  const task = { cancelled: false, label, started: Date.now() };
  activeTask = task;
  showTaskPill(label);
  try { await fn(() => task.cancelled); }
  finally { if (activeTask === task) { activeTask = null; hideTaskPill(); } }
}

function cancelActiveTask() {
  if (activeTask) { activeTask.cancelled = true; toast('🛑 Task stopped'); }
  if (bleDevice) bleSend('S');
  hideTaskPill();
}
function emergencyStop() { cancelActiveTask(); stopDirectMove(); }

function showTaskPill(label) {
  document.getElementById('taskLabel').textContent = label;
  document.getElementById('taskPill').classList.add('show');
  clearInterval(taskTickTimer);
  taskTickTimer = setInterval(() => {
    if (!activeTask) return;
    const s = Math.floor((Date.now() - activeTask.started) / 1000);
    document.getElementById('taskTimer').textContent = `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  }, 500);
}
function hideTaskPill() { clearInterval(taskTickTimer); document.getElementById('taskPill').classList.remove('show'); }

// Chunked timed movement: re-sends the drive command periodically so the
// robot keeps going for minutes, and stops instantly on cancel.
async function timedMove(cmd, seconds, isCancelled) {
  if (!bleDevice) return;
  const end = Date.now() + seconds * 1000;
  await bleSend(cmd);
  while (Date.now() < end) {
    if (isCancelled && isCancelled()) break;
    await sleep(Math.min(1200, Math.max(50, end - Date.now())));
    if (Date.now() < end && !(isCancelled && isCancelled())) await bleSend(cmd);
  }
  await bleSend('S');
}

// ════════════════════════════════════════════════════════
// DIRECT MOVEMENT & HARDWARE ACTIONS
// ════════════════════════════════════════════════════════
let isMoving = false;
async function startDirectMove(cmd) { if (!bleDevice) { toast('⚠️ Connect BLE first!'); return; } resetInactivity(); isMoving = true; await bleSend(cmd); }
async function stopDirectMove() { if (!isMoving || !bleDevice) return; isMoving = false; await bleSend('S'); }

async function doAction(action) {
  if (!bleDevice) { toast('⚠️ Connect BLE first!'); return; }
  resetInactivity();
  switch(action) { case 'nod': await bleSend('N'); await sleep(2000); break; case 'dance': await doDance(); break; case 'wander': await doWander(); break; }
}
async function doDance() {
  setEmotion('excited');
  hardwareActive = true; clearTimeout(hwTimeout);
  await runTask('💃 Dancing', async (isCancelled) => {
    for (const [cmd, ms] of DANCE_STEPS) { if (isCancelled()) break; await bleSend(cmd); if (ms > 0) await sleep(ms); }
    await bleSend('S');
  });
  hardwareActive = false;
}
async function doWander() {
  setEmotion('focused');
  hardwareActive = true; clearTimeout(hwTimeout);
  await runTask('🗺 Wandering', async (isCancelled) => {
    await bleSend('W');
    for (let i = 0; i < 8 && !isCancelled(); i++) await sleep(500);
    if (isCancelled()) await bleSend('S');
  });
  hardwareActive = false;
}

// ════════════════════════════════════════════════════════
// MOTION SENSORS
// ════════════════════════════════════════════════════════
let lastAccel = 0, motionSensorsbound = false;
let motionCooldown = false;

function enableMotionSensors() {
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission()
      .then(r => { if (r === 'granted') { motionEnabled = true; bindSensors(); updateGyroBtnState(); toast('✅ Motion Sync ON'); } else toast('❌ Permission denied'); })
      .catch(console.error);
  } else { motionEnabled = true; bindSensors(); updateGyroBtnState(); toast('✅ Motion Sync ON'); }
}

function toggleMotionSensors() {
  if (!motionEnabled) { enableMotionSensors(); return; }
  motionEnabled = false; updateGyroBtnState(); toast('🚫 Motion Sync OFF');
}

function updateGyroBtnState() {
  const btn = document.getElementById('gyroBtn'); if (!btn) return;
  if (motionEnabled) { btn.textContent = '🧭 Motion Sync ON'; btn.style.borderColor = 'var(--theme-color)'; btn.style.color = 'var(--theme-color)'; }
  else { btn.textContent = '🧭 Enable Motion Sync'; btn.style.borderColor = ''; btn.style.color = ''; }
}

function bindSensors() {
  if (motionSensorsbound) return;
  motionSensorsbound = true;
  window.addEventListener('devicemotion', (e) => {
    if (!motionEnabled || isSleeping || hardwareActive || isBusy || motionCooldown || activeTask) return;
    let acc = e.accelerationIncludingGravity; if (!acc) return;
    let total = Math.sqrt(acc.x*acc.x + acc.y*acc.y + acc.z*acc.z);
    if (Math.abs(total - lastAccel) > 18) {
      motionCooldown = true;
      setEmotion('dizzy');
      setTimeout(() => { motionCooldown = false; }, 4000);
    }
    lastAccel = total;
  });
}

// ════════════════════════════════════════════════════════
// GEMINI AGENT
// ════════════════════════════════════════════════════════
function buildSystemPrompt() {
  const uName = localStorage.getItem('petro_user_name') || '';
  const theme = THEMES[localStorage.getItem('petro_theme') || 'default'] || THEMES.default;
  let p = theme.prompt;
  if (uName) p = `You are talking to your owner/friend named: ${uName}. ` + p;
  p += `

VOICE OUTPUT RULES (your reply is spoken aloud through text-to-speech):
- Write ONLY clean, pronounceable sentences. No emojis, no markdown, no asterisks, no *action descriptions*.
- NEVER write sound-effect spellings like "zzz", "brrr", "bzzt", "grrr", or stretched words like "heyyyy".
- Keep replies short and natural: 1-3 sentences unless asked for more.

AVAILABLE FUNCTIONS:
  move_forward(duration_seconds), move_backward(duration_seconds), turn_left(duration_seconds), turn_right(duration_seconds)
    -> duration_seconds can be ANY length up to 600 (e.g. "walk for 5 minutes" = move_forward(300)). Long moves are handled safely and can be stopped anytime.
  stop_robot()
  dance() -> dynamic dance routine
  nod_head(times)
  wander()
  wait_seconds(seconds) -> pause between steps of a multi-step plan
  repeat_sequence(times, forward_s, turn_s, turn_dir) -> patrol-style loop: go forward forward_s seconds, then turn turn_dir ('left'/'right') for turn_s seconds, repeated 'times' times. Use for "patrol", "go around", "lap the room".
  capture_photo() -> take ONE picture (never call more than once per turn)
  search_youtube(query, is_entertainment) -> play video. is_entertainment=true if music/dance to trigger a slow groove.
  call_contact(phone_number)
  show_prop(prop_name) -> visual prop ('apple', 'book', 'dumbbell', 'laptop') for eating/studying/workout/coding talk.
  perform_pattern(pattern) -> 'circle', 'rectangle', 'moonwalk', 'spin'.

For multi-step plans ("walk 3s then nod twice then dance"), call the functions in order in one turn.
EMOTION: append [emotion:NAME] (happy, sad, excited, focused, curious, loving, surprised, angry, shy, afraid, dizzy) to trigger hardware emotion routines.`;
  return p;
}

const TOOL_DECLARATIONS = [
  { name:'move_forward', parameters:{type:'OBJECT',properties:{ duration_seconds: {type: 'NUMBER', description:'seconds, up to 600'} }} },
  { name:'move_backward', parameters:{type:'OBJECT',properties:{ duration_seconds: {type: 'NUMBER', description:'seconds, up to 600'} }} },
  { name:'turn_left', parameters:{type:'OBJECT',properties:{ duration_seconds: {type: 'NUMBER'} }} },
  { name:'turn_right', parameters:{type:'OBJECT',properties:{ duration_seconds: {type: 'NUMBER'} }} },
  { name:'stop_robot', parameters:{type:'OBJECT',properties:{}} },
  { name:'dance', parameters:{type:'OBJECT',properties:{}} },
  { name:'nod_head', parameters:{type:'OBJECT',properties:{ times: {type: 'INTEGER'} }} },
  { name:'wander', parameters:{type:'OBJECT',properties:{}} },
  { name:'wait_seconds', parameters:{type:'OBJECT',properties:{ seconds: {type: 'NUMBER'} }, required:['seconds']} },
  { name:'repeat_sequence', parameters:{type:'OBJECT',properties:{ times:{type:'INTEGER'}, forward_s:{type:'NUMBER'}, turn_s:{type:'NUMBER'}, turn_dir:{type:'STRING', description:"'left' or 'right'"} }, required:['times']} },
  { name:'capture_photo', parameters:{type:'OBJECT',properties:{}} },
  { name:'search_youtube', parameters:{type:'OBJECT',properties:{query:{type:'STRING'}, is_entertainment:{type:'BOOLEAN', description: 'true if music/dance/entertainment'}},required:['query']} },
  { name:'call_contact', parameters:{type:'OBJECT',properties:{ phone_number: {type: 'STRING'} }, required:['phone_number']} },
  { name:'show_prop', parameters:{type:'OBJECT',properties:{ prop_name: {type: 'STRING', description: 'apple, book, dumbbell, or laptop'} }, required:['prop_name']} },
  { name:'perform_pattern', parameters:{type:'OBJECT',properties:{ pattern: {type: 'STRING', description: 'circle, rectangle, moonwalk, spin'} }, required:['pattern']} }
];

async function callGemini(userText, imageDataUrl = null) {
  const apiKey = getApiKey(); if (!apiKey) { toast('⚠️ Set API key in Settings'); openSettings(); throw new Error('No API key'); }
  const contents = chatHistory.map(m => { const parts = [{ text: m.text }]; if (m.imageBase64) parts.push({ inline_data: { mime_type: 'image/jpeg', data: m.imageBase64.replace(/^data:image\/\w+;base64,/, '') } }); return { role: m.role, parts }; });
  const userParts = [{ text: userText }]; if (imageDataUrl) userParts.push({ inline_data: { mime_type: 'image/jpeg', data: imageDataUrl.replace(/^data:image\/\w+;base64,/, '') } }); contents.push({ role: 'user', parts: userParts });

  const body = { system_instruction: { parts: [{ text: buildSystemPrompt() }] }, contents, tools: [{ function_declarations: TOOL_DECLARATIONS }], generationConfig: { temperature: 0.7, maxOutputTokens: 512 } };
  const resp = await fetch(`${geminiUrl()}?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  if (!resp.ok) { const err = await resp.json().catch(() => ({})); const msg = err?.error?.message || `HTTP ${resp.status}`; if (resp.status === 400 && msg.includes('API_KEY')) throw new Error('Invalid API key'); if (resp.status === 404) throw new Error(`Model ${getModel()} unavailable for this key — pick another in Settings.`); throw new Error(msg); }
  const data = await resp.json();

  if (data.usageMetadata) trackUsage(data.usageMetadata.promptTokenCount || 0, data.usageMetadata.candidatesTokenCount || 0);

  const parts = data?.candidates?.[0]?.content?.parts || [];
  let replyText = ''; const toolCalls = [];
  for (const part of parts) { if (part.text) replyText = part.text; if (part.functionCall) toolCalls.push({ name: part.functionCall.name, args: part.functionCall.args || {} }); }

  const emotionMatch = replyText.match(/\[emotion:(\w+)\]/i); const emotion = emotionMatch ? emotionMatch[1].toLowerCase() : detectEmotion(toolCalls, replyText);
  replyText = replyText.replace(/\[emotion:\w+\]/gi, '').trim();
  return { reply: replyText, emotion, toolCalls };
}

const EMOTION_MAP = { dance:'excited', nod_head:'happy', wander:'focused', move_forward:'focused', stop_robot:'neutral', capture_photo:'excited', search_youtube:'focused', repeat_sequence:'focused' };
function detectEmotion(toolCalls, reply) {
  for (const tc of toolCalls) { if (EMOTION_MAP[tc.name]) return EMOTION_MAP[tc.name]; }
  const l = reply.toLowerCase();
  if (/love|heart|hug|sweet|cute/.test(l)) return 'loving';
  if (/wow|omg|surprise|whoa|amazing/.test(l)) return 'surprised';
  if (/shy|blush|embarrass/.test(l)) return 'shy';
  if (/haha|lol|funny|joke|laugh/.test(l)) return 'happy';
  if (/danc|boogie/.test(l)) return 'excited';
  if (/sorry|oops|error|can't|cannot/.test(l)) return 'sad';
  if (/angry|mad/.test(l)) return 'angry';
  return 'neutral';
}

// ════════════════════════════════════════════════════════
// YOUTUBE, GROOVE & PROPS
// ════════════════════════════════════════════════════════
function startGroove() {
  if (grooveTimer || !bleDevice) { setGroovingUI(true); return; }
  let step = 0;
  const grooveMoves = ['V', '1', '2', 'U', '7', '8', '3', '4'];
  grooveTimer = setInterval(() => {
     if (!isMoving && !isBusy && !hardwareActive && bleConnected && !activeTask) { bleSend(grooveMoves[step % grooveMoves.length]); step++; }
  }, 1800);
  setGroovingUI(true);
}

function stopGroove() {
  clearInterval(grooveTimer); grooveTimer = null;
  setGroovingUI(false);
  if (bleDevice) { bleSend('S'); bleSend('E'); } // full halt + emotion reset
}

function setGroovingUI(on) {
  document.getElementById('miniPetroCard')?.classList.toggle('grooving', on);
  document.getElementById('ytSidePanel')?.classList.toggle('grooving', on);
  const s = document.getElementById('miniPetroStatus');
  if (s) s.textContent = on ? 'petRO is vibing 🎶' : 'petRO is watching 👀';
}

async function openYouTube(query, isEntertainment = false) {
  toast(`🔍 Searching "${query}"…`);
  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&q=${encodeURIComponent(query)}&type=video&key=${YT_API_KEY}`);
    const data = await res.json();
    if (data.items && data.items.length > 0) {
      const vid = data.items[0].id.videoId;

      document.getElementById('ytContainer').style.display = 'flex';
      document.getElementById('normalControls').style.display = 'none';
      const mp = document.getElementById('miniPetroArea'); mp.style.display = 'flex'; requestAnimationFrame(() => mp.style.opacity = '1');

      if (isYtApiReady) {
        if (!ytPlayer) {
          ytPlayer = new YT.Player('ytPlayerDiv', {
            height: '100%', width: '100%', videoId: vid,
            playerVars: { 'autoplay': 1, 'controls': 1, 'playsinline': 1 },
            events: { 'onStateChange': onPlayerStateChange }
          });
        } else { ytPlayer.loadVideoById(vid); }
      } else {
        document.getElementById('ytPlayerDiv').innerHTML = `<iframe src="https://www.youtube.com/embed/${vid}?autoplay=1&playsinline=1" allow="autoplay" allowfullscreen></iframe>`;
      }

      appendMsg('bot', `Now playing! Mic stays on — just say "petro" to pause and command me.`);
      isVideoPlaying = true; videoPausedByVoice = false;
      if (isEntertainment || /music|dance|song|lofi/i.test(query)) startGroove();
    } else { toast('❌ No video found.'); }
  } catch (error) { toast('❌ YouTube search failed.'); }
}

function onPlayerStateChange(event) {
  // Video finished → close player AND fully stop the dance/groove
  if (event.data == YT.PlayerState.ENDED) { stopGroove(); closeYouTube(); }
}

function closeYouTube() {
  document.getElementById('ytContainer').style.display = 'none';
  if (ytPlayer && typeof ytPlayer.stopVideo === 'function') { try { ytPlayer.stopVideo(); } catch {} }
  else { document.getElementById('ytPlayerDiv').innerHTML = ''; }

  document.getElementById('normalControls').style.display = 'flex';
  const mp = document.getElementById('miniPetroArea'); mp.style.opacity = '0'; setTimeout(() => mp.style.display = 'none', 400);

  isVideoPlaying = false; videoPausedByVoice = false;
  stopGroove();
  setEmotion('neutral');
}

function pauseVideoForVoice() {
  if (!isVideoPlaying || !ytPlayer || typeof ytPlayer.getPlayerState !== 'function') return;
  try { if (ytPlayer.getPlayerState() === YT.PlayerState.PLAYING) { ytPlayer.pauseVideo(); videoPausedByVoice = true; } } catch {}
}
function resumeVideoAfterVoice() {
  if (videoPausedByVoice && ytPlayer && isVideoPlaying) { try { ytPlayer.playVideo(); } catch {} videoPausedByVoice = false; }
}

function showProp(propName) {
  document.querySelectorAll('.prop-item').forEach(el => el.style.opacity = '0');
  const el = document.getElementById('prop-' + propName);
  if (el) { el.style.opacity = '1'; setTimeout(() => { el.style.opacity = '0'; }, 5000); }
}

async function doPattern(pattern) {
  if (!bleDevice) { toast('⚠️ Connect BLE first!'); return; }
  hardwareActive = true; clearTimeout(hwTimeout);
  await runTask(`✦ ${pattern}`, async (isCancelled) => {
    if (pattern === 'circle') { await timedMove('L', 3.5, isCancelled); }
    else if (pattern === 'rectangle') { for (let i=0; i<4 && !isCancelled(); i++) { await timedMove('F', 1, isCancelled); await timedMove('R', 0.6, isCancelled); } await bleSend('S'); }
    else if (pattern === 'moonwalk') { for (let i=0; i<4 && !isCancelled(); i++) { await bleSend('B'); await sleep(500); await bleSend('S'); await sleep(200); } }
    else if (pattern === 'spin') { await timedMove('L', 1.5, isCancelled); }
  });
  hardwareActive = false;
}

// ════════════════════════════════════════════════════════
// TOOL EXECUTION (dedupe + long-task aware)
// ════════════════════════════════════════════════════════
function dedupeToolCalls(toolCalls) {
  // Only one photo per turn, only one youtube per turn — prevents double snaps / double players
  const seenOnce = new Set();
  return toolCalls.filter(tc => {
    if (tc.name === 'capture_photo' || tc.name === 'search_youtube') {
      if (seenOnce.has(tc.name)) return false;
      seenOnce.add(tc.name);
    }
    return true;
  });
}

async function executeTools(toolCalls) {
  if (!toolCalls.length) return;
  toolCalls = dedupeToolCalls(toolCalls);
  hardwareActive = true; clearTimeout(hwTimeout);
  try {
    for (const tc of toolCalls) {
      const args = tc.args || {};
      const dur = d => Math.min(600, Math.max(0.1, Number(d) || 1)); // clamp 0.1 s – 10 min
      switch(tc.name) {
        case 'move_forward':  await runTask(`🚶 Forward ${fmtDur(dur(args.duration_seconds))}`, ic => timedMove('F', dur(args.duration_seconds), ic)); break;
        case 'move_backward': await runTask(`🔙 Backward ${fmtDur(dur(args.duration_seconds))}`, ic => timedMove('B', dur(args.duration_seconds), ic)); break;
        case 'turn_left':     await runTask(`↺ Left ${fmtDur(dur(args.duration_seconds || 0.5))}`, ic => timedMove('L', dur(args.duration_seconds || 0.5), ic)); break;
        case 'turn_right':    await runTask(`↻ Right ${fmtDur(dur(args.duration_seconds || 0.5))}`, ic => timedMove('R', dur(args.duration_seconds || 0.5), ic)); break;
        case 'stop_robot':    cancelActiveTask(); break;
        case 'dance':         await doDance(); break;
        case 'nod_head':      for (let i = 0; i < Math.min(10, args.times || 1); i++) { await bleSend('N'); await sleep(2000); } break;
        case 'wander':        await doWander(); break;
        case 'wait_seconds':  await runTask(`⏳ Waiting ${fmtDur(dur(args.seconds))}`, async ic => { const end = Date.now() + dur(args.seconds)*1000; while (Date.now() < end && !ic()) await sleep(200); }); break;
        case 'repeat_sequence': {
          const times = Math.min(20, Math.max(1, args.times || 2));
          const fs = dur(args.forward_s || 3), ts = dur(args.turn_s || 0.8);
          const tcmd = (String(args.turn_dir).toLowerCase() === 'left') ? 'L' : 'R';
          await runTask(`🛡 Patrol ×${times}`, async ic => {
            for (let i = 0; i < times && !ic(); i++) { await timedMove('F', fs, ic); if (!ic()) await timedMove(tcmd, ts, ic); }
            await bleSend('S');
          });
          break;
        }
        case 'capture_photo': autoCapture(); break;
        case 'search_youtube':if (args.query) await openYouTube(args.query, args.is_entertainment); break;
        case 'call_contact':  if (args.phone_number) { toast(`📞 Calling…`); window.location.href = `tel:${args.phone_number}`; } break;
        case 'show_prop':     if (args.prop_name) showProp(args.prop_name); break;
        case 'perform_pattern':if(args.pattern) await doPattern(args.pattern); break;
      }
    }
  } finally { hardwareActive = false; }
}
function fmtDur(s) { return s >= 60 ? `${Math.round(s/60)} min` : `${Math.round(s)}s`; }

// ════════════════════════════════════════════════════════
// CHAT FLOW
// ════════════════════════════════════════════════════════
// Instant local intents — no LLM round-trip for emergency words
function localIntent(text) {
  const t = text.toLowerCase().trim();
  if (/^(stop|stop it|halt|freeze|ruk|ruk jao|ruko)[.!]*$/.test(t)) { cancelActiveTask(); setEmotion('neutral'); appendMsg('bot', 'Stopped! 🛑'); return true; }
  if (/^(close|stop) (the )?(video|music|song)[.!]*$/.test(t) && isVideoPlaying) { closeYouTube(); appendMsg('bot', 'Closed the player.'); return true; }
  return false;
}

async function sendChat() {
  const inp = document.getElementById('userInput'), text = inp.value.trim();
  if (!text || isBusy) return; inp.value = ''; resetInactivity();
  if (localIntent(text)) { appendMsg('user', text); return; }
  let attachedImage = currentUploadedImage || null; currentUploadedImage = null; updateUploadPreview();
  const visionKw = ['what am i holding','look at me','what is this','see this'];
  if (!attachedImage && visionKw.some(kw => text.toLowerCase().includes(kw))) { attachedImage = captureSnapshot(); if (attachedImage) { appendImageMsg('user', attachedImage); toast('📸 Auto-captured!'); } } else if (attachedImage) { appendImageMsg('user', attachedImage); }
  appendMsg('user', text); await doChat(text, attachedImage);
}
function sendSug(t) { document.getElementById('userInput').value = t; sendChat(); }

async function doChat(userText, imageDataUrl = null) {
  isBusy = true; document.getElementById('sendBtn').disabled = true; const typEl = showTyping();
  try {
    const { reply, emotion, toolCalls } = await callGemini(userText, imageDataUrl); removeTyping(typEl);
    appendMsg('bot', reply, toolCalls.map(t => t.name)); setEmotion(emotion); speak(reply);
    addToHistory('user', userText, imageDataUrl); addToHistory('model', reply); await executeTools(toolCalls);
  } catch(e) { removeTyping(typEl); appendMsg('bot', `❌ ${e.message}`, []); setEmotion('sad'); speak('Oops, something went wrong.'); }
  finally {
    isBusy = false; document.getElementById('sendBtn').disabled = false;
    if (!ttsActive) resumeVideoAfterVoice();
  }
}
function addToHistory(role, text, imageBase64 = null) { chatHistory.push({ role, text, imageBase64 }); if (chatHistory.length > MAX_HISTORY) chatHistory.splice(0, chatHistory.length - MAX_HISTORY); try { sessionStorage.setItem('petro_history', JSON.stringify(chatHistory.map(m => ({...m, imageBase64: null})))); } catch {} updateMemoryPill(); }
function loadHistory() { try { const saved = sessionStorage.getItem('petro_history'); if (saved) chatHistory = JSON.parse(saved); } catch {} }
function clearChat() { chatHistory = []; try { sessionStorage.removeItem('petro_history'); } catch {} document.getElementById('messages').innerHTML = `<div class="msg bot"><div class="msg-label">petRO 🤖</div><div class="msg-bubble">Fresh start! ✨</div></div>`; toast('Chat cleared'); updateMemoryPill(); }
function updateMemoryPill() { document.getElementById('memoryPill').textContent = `Memory: ${chatHistory.length} / ${MAX_HISTORY} msgs`; }

// ════════════════════════════════════════════════════════
// CAMERA (with capture cooldown — no more accidental multi-snaps)
// ════════════════════════════════════════════════════════
let captureCooldownUntil = 0;
const CAPTURE_COOLDOWN_MS = 2500;
let autoCapturePending = false;

async function initCamera() { try { videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } }); document.getElementById('webcamView').srcObject = videoStream; } catch(e) { console.warn('Camera unavailable:', e); } }
function captureSnapshot() {
  if (Date.now() < captureCooldownUntil) return null;
  const video = document.getElementById('webcamView'), canvas = document.getElementById('captureCanvas');
  if (!video || !canvas || !videoStream) return null;
  const ctx = canvas.getContext('2d'); canvas.width = video.videoWidth || 640; canvas.height = video.videoHeight || 480;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  captureCooldownUntil = Date.now() + CAPTURE_COOLDOWN_MS;
  return canvas.toDataURL('image/jpeg', 0.85);
}
function triggerFlash() { const f = document.createElement('div'); Object.assign(f.style, { position:'fixed', inset:'0', background:'#fff', zIndex:'9999', opacity:'1', transition:'opacity 0.4s ease' }); document.body.appendChild(f); setTimeout(() => { f.style.opacity = '0'; setTimeout(() => f.remove(), 400); }, 50); }
function manualCapture() { const dataUrl = captureSnapshot(); if (dataUrl) { appendImageMsg('user', dataUrl); toast('📸 Captured!'); } else if (Date.now() < captureCooldownUntil) { toast('⏳ One sec…'); } }
function autoCapture() {
  if (autoCapturePending || Date.now() < captureCooldownUntil) return; // single snap, ever, per turn
  autoCapturePending = true;
  triggerFlash();
  setTimeout(async () => {
    const dataUrl = captureSnapshot();
    if (dataUrl) {
      appendImageMsg('bot', dataUrl);
      // wait until current chat cycle finishes before describing — prevents nested calls
      let guard = 0; while (isBusy && guard++ < 100) await sleep(100);
      doChat('Describe in detail what you see in this photo!', dataUrl);
    }
    autoCapturePending = false;
  }, 140);
}
function handleFileUpload(e) { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = ev => { currentUploadedImage = ev.target.result; updateUploadPreview(); }; reader.readAsDataURL(file); e.target.value = ''; }
function clearUploadedImage() { currentUploadedImage = null; document.getElementById('fileInput').value = ''; updateUploadPreview(); }
function updateUploadPreview() { const bar = document.getElementById('uploadPreviewBar'), img = document.getElementById('previewImg'); if (currentUploadedImage) { img.src = currentUploadedImage; bar.style.display = 'flex'; } else { bar.style.display = 'none'; img.src = ''; } }
function appendImageMsg(role, dataUrl) { const c = document.getElementById('messages'), el = document.createElement('div'); el.className = `msg ${role}`; const bub = document.createElement('div'); bub.className = 'msg-bubble'; bub.style.padding = '4px'; const img = document.createElement('img'); img.src = dataUrl; img.style.cssText = 'max-width:100%;border-radius:10px;display:block;'; bub.appendChild(img); el.appendChild(bub); c.appendChild(el); c.scrollTop = c.scrollHeight; }

// ════════════════════════════════════════════════════════
// TTS — with ULTRA speech sanitizer
// ════════════════════════════════════════════════════════
const synth = window.speechSynthesis;

function sanitizeForSpeech(text) {
  let t = String(text || '');
  t = t.replace(/\[emotion:\w+\]/gi, ' ');
  t = t.replace(/https?:\/\/\S+/g, ' ');                       // URLs
  t = t.replace(/\*\*?[^*\n]*\*\*?/g, ' ');                    // *actions* / **bold**
  t = t.replace(/`[^`\n]*`/g, ' ');                            // code spans
  t = t.replace(/\p{Extended_Pictographic}/gu, ' ');           // emojis
  t = t.replace(/[\u{1F3FB}-\u{1F3FF}\u200d\ufe0f\u20e3]/gu, ''); // emoji modifiers
  t = t.replace(/(^|\s)[;:=8xX]-?[)(DPpOo3\/\\|*]+(?=\s|$)/g, ' '); // emoticons :) ;P x3
  t = t.replace(/(^|\s)(<3|\^_?\^|uwu|owo|>_<|T_T)(?=\s|$)/gi, ' ');
  t = t.replace(/\b[zZ]{2,}\b\.{0,3}/g, ' ');                  // zzz / ZZZ…
  t = t.replace(/\b(b[rz]{2,}t*|g[r]{2,}|p[f]{2,}t*|t[s]{2,}k*|v[r]{2,}m*|w[h]{2,}r+)\b/gi, ' '); // brrr, bzzt, grrr, pfft, vrrm
  t = t.replace(/([a-zA-Z])\1{2,}/g, '$1$1');                  // heyyyy → heyy
  t = t.replace(/[#_~^>|•·]+/g, ' ');                          // markdown leftovers
  t = t.replace(/^\s*[-*]\s+/gm, '');                          // list bullets
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t;
}

function speak(text) {
  if (!synth) return;
  // Stay quiet only while a video is actively playing (not when paused by voice)
  if (isVideoPlaying && !videoPausedByVoice) return;
  synth.cancel();
  const clean = sanitizeForSpeech(text);
  if (!clean) { resumeVideoAfterVoice(); return; }
  const utt = new SpeechSynthesisUtterance(clean);
  const themeId = localStorage.getItem('petro_theme') || 'default';
  const theme = THEMES[themeId] || THEMES.default;
  utt.pitch = theme.pitch; utt.rate = theme.rate; utt.volume = 1;

  const isHindi = /[\u0900-\u097F]/.test(clean);
  const voices = synth.getVoices();
  let pref;
  if (isHindi) {
    pref = voices.find(v => v.lang.startsWith('hi')) || voices.find(v => v.lang.includes('IN'));
    utt.lang = 'hi-IN';
  } else {
    pref = voices.find(v => /google.*english|natural/i.test(v.name) && v.lang.startsWith('en'))
        || voices.find(v => /female|zira|samantha|karen|moira|fiona/i.test(v.name))
        || voices.find(v => v.lang.startsWith('en')) || voices[0];
  }
  if (pref) utt.voice = pref;

  utt.onstart = () => { ttsActive = true; updateTTSBtn(); animateMouth(true); };
  const finish = () => {
    ttsActive = false; updateTTSBtn(); animateMouth(false);
    setTimeout(() => {
      if (!isBusy) { resumeVideoAfterVoice(); if (!isVideoPlaying || videoPausedByVoice === false) startFollowUp(); }
    }, 400);
  };
  utt.onend = finish;
  utt.onerror = finish;
  synth.speak(utt);
}
function stopTTS() { synth?.cancel(); ttsActive = false; updateTTSBtn(); animateMouth(false); }
function updateTTSBtn() { document.getElementById('ttsBtn').className = ttsActive ? 'icon-btn speaking' : 'icon-btn'; }
function animateMouth(talking) { if (mouthTalkAnim) { cancelAnimationFrame(mouthTalkAnim); mouthTalkAnim = null; } if (!talking) { applyMouthForEmotion(currentEmotion); return; } let t = 0; const em = emotions[currentEmotion] || emotions.neutral; (function frame() { t += 0.18; setMouthPath(em.mouthType, (em.mouthOpen || 0) + Math.abs(Math.sin(t)) * 12); mouthTalkAnim = requestAnimationFrame(frame); })(); }

// ════════════════════════════════════════════════════════
// EXPRESSIVE FACE ENGINE
// ════════════════════════════════════════════════════════
const eyeEls = {}; let eyeOff = {lx:0,ly:0,rx:0,ry:0}, eyeTgt = {lx:0,ly:0,rx:0,ry:0};
function initEyes() { ['lIris','lPupil','lLidTop','lLidBot','lHL1','lHL2','lRim','lBrow', 'rIris','rPupil','rLidTop','rLidBot','rHL1','rHL2','rRim','rBrow'].forEach(k => eyeEls[k] = document.getElementById(k)); runEyeLoop(); scheduleBlink(); scheduleEyeMove(); }
function runEyeLoop() { (function loop() { const s = 0.12; eyeOff.lx += (eyeTgt.lx - eyeOff.lx)*s; eyeOff.ly += (eyeTgt.ly - eyeOff.ly)*s; eyeOff.rx += (eyeTgt.rx - eyeOff.rx)*s; eyeOff.ry += (eyeTgt.ry - eyeOff.ry)*s; setEyePos('l', 65+eyeOff.lx, 88+eyeOff.ly); setEyePos('r',235+eyeOff.rx, 88+eyeOff.ry); requestAnimationFrame(loop); })(); }
function scheduleEyeMove() { if (!isSleeping) { if (Math.random() > 0.4) { const angle = Math.random() * Math.PI * 2, radius = Math.random() * 12; eyeTgt.lx = Math.cos(angle) * radius; eyeTgt.ly = Math.sin(angle) * radius; eyeTgt.rx = eyeTgt.lx; eyeTgt.ry = eyeTgt.ly; } else { eyeTgt.lx = 0; eyeTgt.ly = 0; eyeTgt.rx = 0; eyeTgt.ry = 0; } } else { eyeTgt.lx = 0; eyeTgt.ly = 0; eyeTgt.rx = 0; eyeTgt.ry = 0; } setTimeout(scheduleEyeMove, 1000 + Math.random() * 2500); }
function setEyePos(s, x, y) { eyeEls[`${s}Iris`].setAttribute('cx', x); eyeEls[`${s}Iris`].setAttribute('cy', y); eyeEls[`${s}Pupil`].setAttribute('cx', x); eyeEls[`${s}Pupil`].setAttribute('cy', y); eyeEls[`${s}HL1`].setAttribute('cx', x-11); eyeEls[`${s}HL1`].setAttribute('cy', y-13); eyeEls[`${s}HL2`].setAttribute('cx', x+11); eyeEls[`${s}HL2`].setAttribute('cy', y-9); }
function scheduleBlink() { blinkTimer = setTimeout(() => { doBlink(); scheduleBlink(); }, isSleeping ? 9000 : 2000 + Math.random()*4000); }

const emotions = {
  neutral:   { irisR:42, pupilR:22, color:'var(--theme-color)', lidTopY:-65, lidBotY:200, browW:0, browSlant:0,  mouthType:'smile',  mouthOpen:0,  tears:false },
  happy:     { irisR:48, pupilR:26, color:'#22d3a0', lidTopY:-65, lidBotY:142, browW:0, browSlant:0,  mouthType:'smile',  mouthOpen:12, tears:false },
  curious:   { irisR:44, pupilR:24, color:'#3b9eff', lidTopY:-65, lidBotY:200, browW:5, browSlant:5,  mouthType:'small',  mouthOpen:8,  tears:false },
  excited:   { irisR:52, pupilR:30, color:'#ffd23f', lidTopY:-65, lidBotY:200, browW:0, browSlant:-6, mouthType:'laugh',  mouthOpen:20, tears:true  },
  sad:       { irisR:30, pupilR:15, color:'#6b8db5', lidTopY:-18, lidBotY:200, browW:8, browSlant:8,  mouthType:'frown',  mouthOpen:0,  tears:true  },
  angry:     { irisR:36, pupilR:17, color:'#ff5f6d', lidTopY:-24, lidBotY:200, browW:9, browSlant:-9, mouthType:'flat',   mouthOpen:0,  tears:false },
  focused:   { irisR:38, pupilR:18, color:'#a855f7', lidTopY:-65, lidBotY:200, browW:0, browSlant:0,  mouthType:'small',  mouthOpen:0,  tears:false },
  dizzy:     { irisR:20, pupilR:8,  color:'#ff9800', lidTopY:-65, lidBotY:200, browW:4, browSlant:5,  mouthType:'wiggle', mouthOpen:0,  tears:false },
  afraid:    { irisR:55, pupilR:10, color:'#ddeeff', lidTopY:-65, lidBotY:200, browW:5, browSlant:8,  mouthType:'small',  mouthOpen:10, tears:false },
  surprised: { irisR:40, pupilR:20, color:'#ff9800', lidTopY:-80, lidBotY:200, browW:6, browSlant:-10,mouthType:'smile',  mouthOpen:20, tears:false },
  shy:       { irisR:45, pupilR:24, color:'#ff66b2', lidTopY:-20, lidBotY:180, browW:4, browSlant:5,  mouthType:'small',  mouthOpen:0,  tears:false },
  loving:    { irisR:55, pupilR:28, color:'#ff3366', lidTopY:-65, lidBotY:200, browW:0, browSlant:0,  mouthType:'smile',  mouthOpen:15, tears:false },
  sleeping:  { irisR:7,  pupilR:4,  color:'#3d5470', lidTopY:45,  lidBotY:65,  browW:0, browSlant:0,  mouthType:'sleep',  mouthOpen:0,  tears:false },
};

function doBlink() { const em = emotions[currentEmotion] || emotions.neutral; lidAnim(eyeEls.lLidTop, em.lidTopY, 30, 200); lidAnim(eyeEls.rLidTop, em.lidTopY, 30, 200); }
function lidAnim(el, from, to, back) { const steps = [{y:to,ms:70},{y:back,ms:50},{y:from,ms:65}]; let i = 0; (function nx() { if (i >= steps.length) return; const s = steps[i++]; el.setAttribute('y', s.y); setTimeout(nx, s.ms); })(); }

function setEmotion(name, force = false) {
  if (isSleeping && !force) return;
  const em = emotions[name] || emotions.neutral; currentEmotion = name;
  clearTimeout(emotionResetTimer);
  if (name !== 'neutral' && name !== 'sleeping') emotionResetTimer = setTimeout(() => setEmotion('neutral'), 5000);

  if (bleConnected && !force && name !== 'sleeping' && !hardwareActive && !activeTask) {
      const hwMap = { happy:'H', sad:'O', angry:'G', focused:'N', excited:'D', afraid:'W', dizzy:'X', curious:'X', surprised:'H', shy:'N', loving:'H' };
      if (hwMap[name]) bleSend(hwMap[name]);
  }

  for (const s of ['l','r']) { eyeEls[`${s}Iris`].setAttribute('rx', em.irisR); eyeEls[`${s}Iris`].setAttribute('ry', em.irisR); eyeEls[`${s}Pupil`].setAttribute('rx', em.pupilR); eyeEls[`${s}Pupil`].setAttribute('ry', em.pupilR); eyeEls[`${s}Iris`].style.fill = (name==='neutral') ? `url(#ig${s==='l'?1:2})` : em.color; eyeEls[`${s}LidTop`].setAttribute('y', em.lidTopY); eyeEls[`${s}LidBot`].setAttribute('y', em.lidBotY); eyeEls[`${s}Rim`].setAttribute('stroke', em.color); }
  eyeEls.lBrow.setAttribute('stroke-width', em.browW); eyeEls.rBrow.setAttribute('stroke-width', em.browW); eyeEls.lBrow.setAttribute('stroke', em.color); eyeEls.rBrow.setAttribute('stroke', em.color);
  if (em.browSlant !== 0) { eyeEls.lBrow.setAttribute('y1', 35 - em.browSlant); eyeEls.lBrow.setAttribute('y2', 35 + em.browSlant); eyeEls.rBrow.setAttribute('y1', 35 + em.browSlant); eyeEls.rBrow.setAttribute('y2', 35 - em.browSlant); } else { eyeEls.lBrow.setAttribute('y1', 35); eyeEls.lBrow.setAttribute('y2', 35); eyeEls.rBrow.setAttribute('y1', 35); eyeEls.rBrow.setAttribute('y2', 35); }
  document.getElementById('tearGroup').style.opacity = em.tears ? '1' : '0';
  if (!ttsActive) applyMouthForEmotion(name);
  updateMiniPetro(name);
}

function applyMouthForEmotion(name) { const em = emotions[name] || emotions.neutral; setMouthPath(em.mouthType, em.mouthOpen); document.getElementById('mouthRim').setAttribute('stroke', em.color); }
function setMouthPath(type, open = 0) { const mp = document.getElementById('mouthPath'); let d = ''; switch(type) { case 'smile': d = `M 105 165 Q 150 ${178+open} 195 165`; break; case 'laugh': d = `M 105 162 Q 150 ${185+open} 195 162`; break; case 'frown': d = `M 105 174 Q 150 ${162-open} 195 174`; break; case 'flat': d = `M 110 169 L 190 169`; break; case 'small': d = `M 125 168 Q 150 ${174+open} 175 168`; break; case 'sleep': d = `M 125 168 Q 150 168 175 168`; break; case 'wiggle': d = `M 110 169 Q 130 159 150 169 T 190 169`; break; default: d = `M 105 169 Q 150 ${178+open} 195 169`; } mp.setAttribute('d', d); if (type === 'laugh') { mp.setAttribute('fill','rgba(0,0,0,0.5)'); mp.setAttribute('stroke-width','2.5'); } else { mp.setAttribute('fill','none'); mp.setAttribute('stroke-width','3.5'); } }

// ════════════════════════════════════════════════════════
// SLEEP / WAKE / IDLE
// ════════════════════════════════════════════════════════
function goToSleep() { if(isSleeping)return; isSleeping=true; setEmotion('sleeping',true); stopTTS(); startZZZ(); }
function wakeUp() { if(!isSleeping)return; isSleeping=false; stopZZZ(); setEmotion('neutral',true); resetInactivity(); }
function startZZZ() { const g = document.getElementById('sleepZZZ'), z1 = document.getElementById('z1'), z2 = document.getElementById('z2'), z3 = document.getElementById('z3'); g.style.opacity = '1'; let t = 0; (function f() { t+=0.03; const b=Math.sin(t)*0.3+0.7; z1.setAttribute('opacity',b); z2.setAttribute('opacity',b*0.7); z3.setAttribute('opacity',b*0.45); z1.setAttribute('y',40-Math.sin(t*0.7)*7); z2.setAttribute('y',24-Math.sin(t*0.7+.5)*7); z3.setAttribute('y',6-Math.sin(t*0.7+1)*7); zzzAnim=requestAnimationFrame(f); })(); }
function stopZZZ() { if(zzzAnim)cancelAnimationFrame(zzzAnim); document.getElementById('sleepZZZ').style.opacity = '0'; }

function resetInactivity() {
  if(isSleeping) wakeUp();
  clearTimeout(inactTimer); clearTimeout(idleMoveTimer);
  inactTimer = setTimeout(goToSleep, SLEEP_MS);
  scheduleIdleMove();
}

function scheduleIdleMove() {
  idleMoveTimer = setTimeout(() => {
    if (!isSleeping && !isBusy && bleDevice && !isVideoPlaying && !activeTask) {
       if (Math.random() > 0.85) { doWander(); }
       else {
           const idleMoves = ['7', '8', 'E', 'C', 'A', 'V', 'U'];
           bleSend(idleMoves[Math.floor(Math.random() * idleMoves.length)]);
       }
       if (Math.random() > 0.5) {
           const idleEmotions = ['happy', 'focused', 'curious', 'neutral', 'shy', 'loving'];
           setEmotion(idleEmotions[Math.floor(Math.random() * idleEmotions.length)]);
       }
    }
    scheduleIdleMove();
  }, 10000 + Math.random() * 15000);
}

['click','keydown','touchstart'].forEach(e => document.addEventListener(e, resetInactivity, {passive:true}));

function appendMsg(role, text, actions = []) { const c = document.getElementById('messages'), el = document.createElement('div'); el.className = `msg ${role}`; const lbl = document.createElement('div'); lbl.className = 'msg-label'; lbl.textContent = role === 'user' ? 'You' : 'petRO 🤖'; const bub = document.createElement('div'); bub.className = 'msg-bubble'; bub.textContent = text; el.append(lbl, bub); if (actions?.length) { const chip = document.createElement('div'); chip.className = 'actions-chip'; chip.textContent = '⚡ ' + actions.join(' · '); el.append(chip); } c.append(el); c.scrollTop = c.scrollHeight; }
function showTyping() { const c=document.getElementById('messages'),el=document.createElement('div'); el.className='msg bot'; el.innerHTML=`<div class="msg-label">petRO 🤖</div><div class="typing-wrap"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>`; c.append(el); c.scrollTop=c.scrollHeight; return el; }
function removeTyping(el) { el?.remove(); }
function toast(msg) { const el=document.getElementById('toast'); el.textContent=msg; el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'), 3400); }

// ── EARS VISUAL OVERLAY FOR MIC ──
function toggleThemeEars(show) {
  const tId = document.getElementById('themeSelect').value || 'default';
  const group = document.getElementById('earsGroup');
  const statusTxt = document.getElementById('listeningStatus');

  if (!show) { group.style.opacity = '0'; statusTxt.style.opacity = '0'; return; }

  document.querySelectorAll('.ear-theme').forEach(el => el.style.display = 'none');

  if (tId === 'dog') document.querySelector('.ear-dog').style.display = 'block';
  else if (tId === 'monkey') document.querySelector('.ear-monkey').style.display = 'block';
  else if (tId === 'pika') document.querySelector('.ear-pika').style.display = 'block';
  else if (tId === 'terminator' || tId === 'transformer') document.querySelector('.ear-terminator').style.display = 'block';
  else document.querySelector('.ear-default').style.display = 'block';

  group.style.opacity = '1';
  statusTxt.style.opacity = '1';
}

// ════════════════════════════════════════════════════════
// MIC ENGINE ULTRA — single persistent recognizer
//
//   The old design tore the recognizer down and rebuilt it on
//   every wake/command/follow-up transition, which is exactly
//   what causes Android's start/stop chimes. Ultra runs ONE
//   continuous SpeechRecognition session with an internal
//   state machine, restarting only when the BROWSER ends the
//   session (unavoidable). The mic stays on during video too —
//   say "petro" to pause the video and give a command.
// ════════════════════════════════════════════════════════
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recog = null;
let micMode = 'off';            // 'off' | 'wake' | 'command'
let micRestartTimer = null;
let cmdTimeoutTimer = null;
let lastHandledAt = 0;          // debounce duplicate finals

function toggleAlwaysOnMic() {
  if (!SR) { toast('⚠️ Speech API not supported'); return; }
  alwaysOnMic = !alwaysOnMic;
  if (alwaysOnMic) { startMicEngine(); toast('🎙 Always-on mic enabled'); }
  else { stopMicEngine(); toast('🎙 Mic off'); }
}

function updateMicBadge(state) {
  const b = document.getElementById('micBadge');
  if (state === 'off')  { b.className='badge mic-off';  b.textContent='🎤 OFF'; }
  if (state === 'wake') { b.className='badge mic-wake'; b.textContent='👂 WAKE'; }
  if (state === 'cmd')  { b.className='badge mic-on';   b.textContent='🎯 CMD'; }
}

function startMicEngine() {
  if (!SR || !alwaysOnMic) return;
  try { recog?.abort(); } catch {}
  recog = new SR();
  recog.continuous = true;
  recog.interimResults = true;
  recog.lang = 'en-US';
  micMode = 'wake';
  updateMicBadge('wake');

  recog.onresult = (e) => {
    if (ttsActive) return;                 // never listen to our own voice
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      const transcript = res[0].transcript.trim();
      const lower = transcript.toLowerCase();

      if (micMode === 'wake') {
        const wakeIdx = findWakeWord(lower);
        if (wakeIdx === -1) continue;
        // Wake word heard. If the SAME final result already carries the command
        // ("hey petro walk forward"), use it directly — zero extra latency.
        if (res.isFinal) {
          const after = transcript.slice(wakeIdx.end).trim();
          if (after.length > 2) { handleVoiceCommand(after); continue; }
        }
        enterCommandMode();
      }
      else if (micMode === 'command') {
        const sub = document.getElementById('listeningStatus');
        if (!res.isFinal) { sub.textContent = transcript + '…'; continue; }
        let cmd = transcript;
        const w = findWakeWord(lower);
        if (w !== -1) cmd = transcript.slice(w.end).trim() || transcript; // strip leading wake word if repeated
        if (cmd) handleVoiceCommand(cmd);
      }
    }
  };

  recog.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      alwaysOnMic = false; micMode = 'off'; updateMicBadge('off'); toast('❌ Mic permission denied');
      return;
    }
    // 'no-speech'/'network'/'aborted' → silent recovery via onend
  };

  recog.onend = () => {
    // Browser ended the session (it always does eventually). Quietly resume.
    if (!alwaysOnMic) { micMode = 'off'; updateMicBadge('off'); return; }
    clearTimeout(micRestartTimer);
    micRestartTimer = setTimeout(() => { try { recog.start(); } catch { startMicEngine(); } }, 250);
  };

  try { recog.start(); } catch {}
}

function stopMicEngine() {
  alwaysOnMic = false; micMode = 'off';
  clearTimeout(micRestartTimer); clearTimeout(cmdTimeoutTimer);
  try { recog?.abort(); } catch {}
  recog = null;
  updateMicBadge('off');
  toggleThemeEars(false);
}

function micEngineKick() {
  // Used on visibilitychange: make sure the engine is actually alive
  if (alwaysOnMic && (!recog || micMode === 'off')) startMicEngine();
}

function findWakeWord(lower) {
  for (const w of WAKE_WORDS) {
    const idx = lower.indexOf(w);
    if (idx !== -1) return { start: idx, end: idx + w.length };
  }
  return -1;
}

function enterCommandMode(durMs = 7000) {
  micMode = 'command';
  resetInactivity();
  updateMicBadge('cmd');
  toggleThemeEars(true);
  document.getElementById('listeningStatus').textContent = 'Listening…';
  pauseVideoForVoice();           // wake word during video → pause it
  clearTimeout(cmdTimeoutTimer);
  cmdTimeoutTimer = setTimeout(exitCommandMode, durMs);
}

function exitCommandMode() {
  clearTimeout(cmdTimeoutTimer);
  micMode = alwaysOnMic ? 'wake' : 'off';
  updateMicBadge(alwaysOnMic ? 'wake' : 'off');
  toggleThemeEars(false);
  if (!isBusy && !ttsActive) resumeVideoAfterVoice();
}

function handleVoiceCommand(text) {
  const now = Date.now();
  if (now - lastHandledAt < 800) return; // debounce duplicate finals
  lastHandledAt = now;
  clearTimeout(cmdTimeoutTimer);
  const sub = document.getElementById('listeningStatus');
  sub.textContent = `"${text}"`;
  setTimeout(() => { toggleThemeEars(false); }, 900);
  micMode = alwaysOnMic ? 'wake' : 'off';
  updateMicBadge(alwaysOnMic ? 'wake' : 'off');

  appendMsg('user', text);
  if (localIntent(text)) { resumeVideoAfterVoice(); return; }
  doChat(text);
}

// ── Follow-up window: re-enter command mode on the SAME recognizer (no beep) ──
function startFollowUp() {
  if (!alwaysOnMic || micMode === 'off') return;
  const dur = parseInt(document.getElementById('followUpSelect').value || '0', 10);
  if (dur === 0) return;
  enterCommandMode(dur);
  document.getElementById('listeningStatus').textContent = 'Awaiting follow-up…';
}

// ════════════════════════════════════════════════════════
// FACE TOUCH REACTIONS — pure emotion, no toast subtitles
// ════════════════════════════════════════════════════════
const TOUCH_REACTIONS = [
  { zone: 'top',    emotion: 'surprised' },
  { zone: 'left',   emotion: 'shy'       },
  { zone: 'right',  emotion: 'shy'       },
  { zone: 'center', emotion: 'loving'    },
  { zone: 'bottom', emotion: 'happy'     },
];

const SWIPE_REACTIONS = [
  { dir: 'left',  emotion: 'surprised' },
  { dir: 'right', emotion: 'excited'   },
  { dir: 'up',    emotion: 'curious'   },
  { dir: 'down',  emotion: 'sad'       },
];

function initFaceTouch() {
  const face = document.getElementById('faceScreen');
  if (!face) return;

  face.addEventListener('pointerdown', (e) => {
    if (isBusy) return;
    const rect = face.getBoundingClientRect();
    const rx = (e.clientX - rect.left) / rect.width;
    const ry = (e.clientY - rect.top)  / rect.height;

    let zone = 'center';
    if (ry < 0.3)       zone = 'top';
    else if (ry > 0.7)  zone = 'bottom';
    else if (rx < 0.33) zone = 'left';
    else if (rx > 0.67) zone = 'right';

    const r = TOUCH_REACTIONS.find(t => t.zone === zone) || TOUCH_REACTIONS[4];
    setEmotion(r.emotion);
    spawnRipple(e.clientX, e.clientY);
  }, { passive: true });

  let swipeStart = null;
  face.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    swipeStart = { x: t.clientX, y: t.clientY, ts: Date.now() };
  }, { passive: true });
  face.addEventListener('touchend', (e) => {
    if (!swipeStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - swipeStart.x;
    const dy = t.clientY - swipeStart.y;
    const dt = Date.now() - swipeStart.ts;
    swipeStart = null;
    if (dt > 400) return;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    if (adx < 30 && ady < 30) return;
    let dir;
    if (adx > ady) dir = dx > 0 ? 'right' : 'left';
    else           dir = dy > 0 ? 'down'  : 'up';
    const r = SWIPE_REACTIONS.find(s => s.dir === dir);
    if (r) setEmotion(r.emotion);
  }, { passive: true });
}

function spawnRipple(cx, cy) {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:0;height:0;border-radius:50%;
    background:radial-gradient(circle,var(--theme-color) 0%,transparent 70%);
    transform:translate(-50%,-50%);pointer-events:none;z-index:9999;
    animation:ripple-grow 0.55s ease-out forwards;`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 600);
}

// ════════════════════════════════════════════════════════
// MINI PETRO (synced to main face)
// ════════════════════════════════════════════════════════
const MINI_MOOD_LABELS = {
  neutral:'😐 Chilling', happy:'😄 Happy!', excited:'🤩 Hyped!', sad:'😢 Sad…',
  angry:'😠 Grr!', curious:'🤔 Curious', focused:'🎯 Focused', loving:'💕 Loving it!',
  shy:'😊 Shy~', surprised:'😲 Whoa!', dizzy:'😵 Dizzy', afraid:'😨 Scared!', sleeping:'😴 Zzz…'
};

function _applyMiniPetroFace(irisL, lidL, irisR, lidR, mouth, em, emotionName) {
  if (!irisL) return;
  const eyeColor = (emotionName === 'neutral') ? 'var(--theme-color)' : em.color;
  const r = Math.max(6, Math.round(em.irisR * 0.22));
  irisL.setAttribute('r', r); irisL.style.fill = eyeColor;
  irisR.setAttribute('r', r); irisR.style.fill = eyeColor;
  const lidY = em.lidTopY > 0 ? Math.min(30, 10 + em.lidTopY * 0.4) : 10;
  lidL.setAttribute('y', lidY); lidR.setAttribute('y', lidY);
  let d;
  switch(em.mouthType) {
    case 'smile':  d = 'M 30 62 Q 50 72 70 62'; break;
    case 'laugh':  d = 'M 27 59 Q 50 76 73 59'; break;
    case 'frown':  d = 'M 30 68 Q 50 58 70 68'; break;
    case 'flat':   d = 'M 32 65 L 68 65';        break;
    case 'sleep':  d = 'M 38 65 Q 50 65 62 65';  break;
    case 'wiggle': d = 'M 28 65 Q 38 57 50 65 T 72 65'; break;
    default:       d = 'M 35 63 Q 50 70 65 63';  break;
  }
  mouth.setAttribute('d', d);
  mouth.setAttribute('stroke', eyeColor);
}

function updateMiniPetro(emotionName) {
  const em = emotions[emotionName] || emotions.neutral;
  _applyMiniPetroFace(
    document.getElementById('mini-ml-iris'), document.getElementById('mini-ml-lid'),
    document.getElementById('mini-mr-iris'), document.getElementById('mini-mr-lid'),
    document.getElementById('mini-mouth'), em, emotionName
  );
  const statusEl = document.getElementById('miniPetroStatus');
  if (statusEl && !grooveTimer) statusEl.textContent = MINI_MOOD_LABELS[emotionName] || '😐 Chilling';

  _applyMiniPetroFace(
    document.getElementById('yt-ml-iris'), document.getElementById('yt-ml-lid'),
    document.getElementById('yt-mr-iris'), document.getElementById('yt-mr-lid'),
    document.getElementById('yt-mouth'), em, emotionName
  );
  const moodEl = document.getElementById('ytSideMood');
  if (moodEl) moodEl.textContent = MINI_MOOD_LABELS[emotionName] || '😐 Chilling';
}

// ════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  initEyes(); resetInactivity(); initCamera(); loadHistory(); loadPersonalization(); updateKeyBadge(); updateMemoryPill(); applyMouthForEmotion('neutral');
  if (synth) { synth.getVoices(); synth.addEventListener('voiceschanged', () => synth.getVoices()); }
  initFaceTouch();
  updateGyroBtnState();
});
