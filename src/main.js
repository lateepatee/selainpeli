// Käynnistys, aula ja pelisilmukka. Peli itse pyörii joko host- tai liittyjäistunnossa.

import { initInput } from './input.js';
import { resize } from './render.js';
import { startHost } from './host.js';
import { startClient } from './client.js';
import { sanitizeName } from './protocol.js';
import { initAudio, toggleMute, isMuted } from './sound.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const lobby = document.getElementById('lobby');
const nameInput = document.getElementById('name');
const botsSelect = document.getElementById('bots');
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

resize(canvas);
window.addEventListener('resize', () => resize(canvas));
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
    bots: Number(botsSelect.value),
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
    onReady: () => showGame(),
    onFail: (msg) => leave(msg),
  }));
}

function startSession(s) {
  session?.destroy();
  session = s;
}

function leave(msg = '') {
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

updateMuteButton();
muteBtn.addEventListener('click', () => {
  toggleMute();
  updateMuteButton();
  muteBtn.blur();
});
function updateMuteButton() {
  muteBtn.textContent = isMuted() ? 'Äänet: pois' : 'Äänet: päällä';
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

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (session) {
    session.frame(ctx, dt);
  } else {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0d0f14';
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
