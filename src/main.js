// Käynnistys, aula ja pelisilmukka. Peli itse pyörii joko host- tai liittyjäistunnossa.

import { initInput, releaseAll, setInputEnabled } from './input.js';
import { HATS, PATTERNS, FACES, loadLook, saveLook } from './appearance.js';
import { PLAYER_COLORS } from './constants.js';
import { setChatOpen, clearChat, CHAT_MAX_LENGTH } from './chat.js';
import {
  initRenderer, resize, drawIdle, initPreview, drawPreview,
  QUALITY_LEVELS, QUALITY_IDS, getQuality, setQuality, onQualityChange,
} from './render3d/index.js';
import { startHost } from './host.js';
import { startClient } from './client.js';
import { sanitizeName } from './protocol.js';
import { readTestConfig } from './testitila.js';
import { initAudio, toggleMute, isMuted } from './sound.js';

// Pelinäkymä piirretään WebGL:llä (#game), HUD ja tekstit 2D-kerrokselle sen päällä (#hud).
const canvas = document.getElementById('game');
const hudCanvas = document.getElementById('hud');
const ctx = hudCanvas.getContext('2d');

const lobby = document.getElementById('lobby');
const nameInput = document.getElementById('name');
const botsSelect = document.getElementById('bots');
const targetSelect = document.getElementById('target');
const codeInput = document.getElementById('code');
const hostBtn = document.getElementById('host');
const joinBtn = document.getElementById('join');
const statusEl = document.getElementById('status');
const roomInfo = document.getElementById('roominfo');
const roomText = document.getElementById('roomtext');
const copyBtn = document.getElementById('copylink');
const leaveBtn = document.getElementById('leave');
const startBtn = document.getElementById('start');
const muteBtn = document.getElementById('mute');
const qualitySelect = document.getElementById('quality');
const qualityBtn = document.getElementById('qualitybtn');
const chatInput = document.getElementById('chatinput');
const charPanel = document.getElementById('charpanel');
const charOpenBtn = document.getElementById('charopen');
const charBtn = document.getElementById('charbtn');
const charDoneBtn = document.getElementById('chardone');
const swatchesEl = document.getElementById('swatches');
const colorNote = document.getElementById('colornote');
chatInput.maxLength = CHAT_MAX_LENGTH;

initRenderer(canvas);
initPreview(document.getElementById('charpreview'));
resize(hudCanvas);
window.addEventListener('resize', () => resize(hudCanvas));
// Canvas ei lataa fonttia itse; ladataan valmiiksi kierroslaskuria varten.
document.fonts?.load('72px Creepster').catch(() => {});
initInput(canvas);

let session = null;

// --- Aula ---

nameInput.value = loadName();
const roomParam = new URLSearchParams(location.search).get('huone');
if (roomParam) {
  codeInput.value = roomParam.toUpperCase().slice(0, 4);
  joinBtn.focus();
}

hostBtn.addEventListener('click', () => {
  initAudio();
  const name = currentName();
  startSession(startHost({
    name,
    look,
    bots: Number(botsSelect.value),
    targetScore: Number(targetSelect.value),
    onRoom: () => updateRoomInfo(),
  }));
  showGame();
});

joinBtn.addEventListener('click', join);
codeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') join();
});

function join() {
  initAudio();
  const code = codeInput.value.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) {
    setStatus('Huonekoodi on neljä kirjainta.');
    return;
  }
  setStatus('Yhdistetään…');
  setButtons(false);
  startSession(startClient({
    name: currentName(),
    code,
    look,
    onReady: () => showGame(),
    onFail: (msg) => leave(msg),
  }));
}

function startSession(s) {
  session?.destroy();
  session = s;
}

function leave(msg = '') {
  closeChat();
  closeCharPanel();
  clearChat();
  session?.destroy();
  session = null;
  roomInfo.hidden = true;
  lobby.hidden = false;
  setButtons(true);
  setStatus(msg);
}

function showGame() {
  document.activeElement?.blur();
  lobby.hidden = true;
  roomInfo.hidden = false;
  setStatus('');
  updateRoomInfo();
}

leaveBtn.addEventListener('click', () => leave());

// --- Chat ---

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !session || !lobby.hidden || !charPanel.hidden || document.activeElement === chatInput) return;
  e.preventDefault();
  releaseAll();
  setChatOpen(true);
  chatInput.hidden = false;
  chatInput.value = '';
  chatInput.focus();
});

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (chatInput.value.trim()) session?.sendChat(chatInput.value);
    closeChat();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeChat();
  }
  e.stopPropagation();
});
chatInput.addEventListener('blur', () => closeChat());

function closeChat() {
  setChatOpen(false);
  chatInput.hidden = true;
  chatInput.value = '';
  if (document.activeElement === chatInput) chatInput.blur();
}

// --- Hahmovalikko (aulassa ja lämmittelyssä) ---

let look = loadLook();
const OPTIONS = { hat: HATS, pattern: PATTERNS, face: FACES };

const swatches = PLAYER_COLORS.map((color, i) => {
  const b = document.createElement('button');
  b.className = 'swatch';
  b.style.background = color;
  b.setAttribute('aria-label', `Väri ${i + 1}`);
  b.addEventListener('click', () => {
    look.color = i;
    lookChanged();
  });
  swatchesEl.append(b);
  return b;
});

for (const row of charPanel.querySelectorAll('.optrow')) {
  const opt = row.dataset.opt;
  for (const btn of row.querySelectorAll('.step')) {
    btn.addEventListener('click', () => {
      const n = OPTIONS[opt].length;
      look[opt] = (look[opt] + Number(btn.dataset.dir) + n) % n;
      lookChanged();
    });
  }
}

function lookChanged() {
  saveLook(look);
  session?.setLook?.(look);
  updateCharPanel();
}

function updateCharPanel() {
  const taken = new Set(session?.info().takenColors ?? []);
  swatches.forEach((b, i) => {
    b.classList.toggle('selected', i === look.color);
    b.classList.toggle('taken', taken.has(PLAYER_COLORS[i]));
  });
  colorNote.textContent = taken.has(PLAYER_COLORS[look.color])
    ? 'Väri on jo toisella pelaajalla: saat lähimmän vapaan.'
    : '';
  for (const row of charPanel.querySelectorAll('.optrow')) {
    row.querySelector('.optvalue').textContent = OPTIONS[row.dataset.opt][look[row.dataset.opt]].name;
  }
}

function openCharPanel() {
  setInputEnabled(false);
  charPanel.hidden = false;
  updateCharPanel();
  charDoneBtn.focus();
}

function closeCharPanel() {
  charPanel.hidden = true;
  setInputEnabled(true);
  document.activeElement?.blur();
}

charOpenBtn.addEventListener('click', openCharPanel);
charBtn.addEventListener('click', openCharPanel);
charDoneBtn.addEventListener('click', closeCharPanel);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !charPanel.hidden) closeCharPanel();
});

updateMuteButton();
muteBtn.addEventListener('click', () => {
  toggleMute();
  updateMuteButton();
  muteBtn.blur();
});
function updateMuteButton() {
  muteBtn.textContent = isMuted() ? 'Äänet: pois' : 'Äänet: päällä';
}

// --- Grafiikan laatu: aulan valinta ja pelin aikana napista kierrättäen ---

for (const id of QUALITY_IDS) qualitySelect.append(new Option(QUALITY_LEVELS[id].name, id));
qualitySelect.addEventListener('change', () => setQuality(qualitySelect.value));
qualityBtn.addEventListener('click', () => {
  const i = QUALITY_IDS.indexOf(getQuality());
  setQuality(QUALITY_IDS[(i + 1) % QUALITY_IDS.length]);
  qualityBtn.blur();
});
onQualityChange(updateQualityControls);
updateQualityControls();
function updateQualityControls() {
  qualitySelect.value = getQuality();
  qualityBtn.textContent = `Grafiikka: ${QUALITY_LEVELS[getQuality()].name.toLowerCase()}`;
}

startBtn.addEventListener('click', () => {
  session?.startMatch?.();
  startBtn.blur();
  updateRoomInfo();
});

copyBtn.addEventListener('click', async () => {
  const code = session?.info().code;
  if (!code) return;
  const link = `${location.origin}${location.pathname}?huone=${code}`;
  try {
    await navigator.clipboard.writeText(link);
    copyBtn.textContent = 'Kopioitu!';
  } catch {
    window.prompt('Kopioi linkki:', link);
  }
  copyBtn.blur();
  setTimeout(() => (copyBtn.textContent = 'Kopioi linkki'), 1500);
});

setInterval(updateRoomInfo, 500);
function updateRoomInfo() {
  if (!session || roomInfo.hidden) return;
  const info = session.info();
  roomText.textContent = info.text;
  startBtn.hidden = !info.canStart;
  charBtn.hidden = !info.canCustomize;
  // Erä alkoi kesken muokkauksen: valikko kiinni.
  if (!info.canCustomize && !charPanel.hidden && lobby.hidden) closeCharPanel();
  if (!charPanel.hidden) updateCharPanel();
}

function setStatus(msg) {
  statusEl.textContent = msg;
}

function setButtons(enabled) {
  hostBtn.disabled = !enabled;
  joinBtn.disabled = !enabled;
}

function currentName() {
  const name = sanitizeName(nameInput.value);
  try {
    localStorage.setItem('areena-nimi', name);
  } catch {}
  return name;
}

function loadName() {
  try {
    return localStorage.getItem('areena-nimi') || '';
  } catch {
    return '';
  }
}

// --- Pelisilmukka ---
//
// Näkyvissä peli etenee ruudunpäivitysten tahdissa. Selain pysäyttää ne, kun välilehti on piilossa
// (ikkuna pienennetty tai peitetty), joten silloin taustasäie (Worker) pitää pelilogiikan ja verkon
// käynnissä. Muuten hostin vaihtaessa esim. Discordiin peli jäätyisi kaikilta.

let last = performance.now();
function advance(now, visible) {
  const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
  last = now;
  session?.update(dt, visible);
  return dt;
}

const ticker = new Worker(URL.createObjectURL(
  new Blob(['setInterval(() => postMessage(0), 20);'], { type: 'text/javascript' }),
));
ticker.onmessage = () => {
  if (document.hidden) advance(performance.now(), false);
};

function frame(now) {
  const dt = advance(now, true);
  if (!charPanel.hidden) drawPreview(look, now);
  if (session) session.draw(ctx, dt);
  else drawIdle(ctx);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Testitila (viimeisenä, jotta kaikki moduulin tila on alustettu): botit-parametri käynnistää hostauksen ja pelin ilman aulaa.
if (readTestConfig()?.botit) hostBtn.click();
