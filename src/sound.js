// Äänet syntetisoidaan Web Audiolla: ei äänitiedostoja eikä lisenssejä.
// Äänet tulevat simulaation tapahtumista, ja ne sijoitetaan kameran suhteen (vasen/oikea, etäisyys).

import { camera } from './render.js';

let ctx = null;
let master = null;
let noise = null;
let muted = loadMuted();
let lastPhase = null;
let lastCountdown = null;
let moanTimer = 2;

const HEAR_RANGE = 950;

// Selaimet sallivat äänen vasta käyttäjän painalluksen jälkeen: kutsutaan nappien kautta.
export function initAudio() {
  if (ctx) {
    ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.connect(ctx.destination);
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.5;
  master.connect(comp);

  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  try {
    localStorage.setItem('areena-mykistetty', muted ? '1' : '0');
  } catch {}
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}

function loadMuted() {
  try {
    return localStorage.getItem('areena-mykistetty') === '1';
  } catch {
    return false;
  }
}

// --- Rakennuspalikat ---

// Palauttaa [gain, panner] tai null jos liian kaukana kuulua.
function spatial(x, y, volume) {
  let vol = volume;
  let pan = 0;
  if (x !== undefined) {
    const dx = x - camera.x;
    const d = Math.hypot(dx, y - camera.y);
    if (d > HEAR_RANGE) return null;
    vol *= 1 - d / HEAR_RANGE;
    pan = Math.max(-1, Math.min(1, dx / 600));
  }
  const g = ctx.createGain();
  g.gain.value = vol;
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  g.connect(p);
  p.connect(master);
  return g;
}

function noiseBurst(out, { dur, filter = 'lowpass', freq = 1000, freqEnd, q = 1, vol = 1, delay = 0 }) {
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, t);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

function tone(out, { freq, freqEnd, dur, wave = 'sine', vol = 1, delay = 0, attack = 0.005, lowpass }) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = wave;
  o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  let node = o;
  if (lowpass) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    o.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

// --- Äänet ---

const SHOTS = {
  pistol: (o) => {
    noiseBurst(o, { dur: 0.09, filter: 'bandpass', freq: 1800, q: 0.8, vol: 0.8 });
    tone(o, { freq: 180, freqEnd: 60, dur: 0.07, wave: 'square', vol: 0.25 });
  },
  shotgun: (o) => {
    noiseBurst(o, { dur: 0.3, filter: 'lowpass', freq: 1400, freqEnd: 300, vol: 1 });
    tone(o, { freq: 90, freqEnd: 35, dur: 0.25, wave: 'sine', vol: 0.7 });
  },
  smg: (o) => noiseBurst(o, { dur: 0.06, filter: 'bandpass', freq: 2300, q: 0.9, vol: 0.55 }),
  rifle: (o) => {
    noiseBurst(o, { dur: 0.08, filter: 'bandpass', freq: 1500, q: 0.7, vol: 0.75 });
    tone(o, { freq: 140, freqEnd: 50, dur: 0.06, wave: 'square', vol: 0.15 });
  },
  lmg: (o) => noiseBurst(o, { dur: 0.08, filter: 'bandpass', freq: 1200, q: 0.7, vol: 0.7 }),
  sniper: (o) => {
    noiseBurst(o, { dur: 0.05, filter: 'highpass', freq: 3000, vol: 0.8 });
    noiseBurst(o, { dur: 0.45, filter: 'lowpass', freq: 1800, freqEnd: 200, vol: 0.9 });
    tone(o, { freq: 110, freqEnd: 30, dur: 0.35, vol: 0.6 });
  },
  wonder: (o) => {
    tone(o, { freq: 1200, freqEnd: 180, dur: 0.28, wave: 'sawtooth', vol: 0.25, lowpass: 3000 });
    tone(o, { freq: 600, freqEnd: 90, dur: 0.3, wave: 'square', vol: 0.15 });
  },
};

function play(e, localId) {
  const own = e.by === localId;
  switch (e.type) {
    case 'shot': {
      const o = spatial(own ? undefined : e.x, e.y, own ? 0.55 : 0.45);
      if (o) (SHOTS[e.w] || SHOTS.pistol)(o);
      break;
    }
    case 'reload': {
      if (!own) break;
      const o = spatial(undefined, 0, 0.35);
      noiseBurst(o, { dur: 0.03, filter: 'highpass', freq: 2500, vol: 0.8 });
      noiseBurst(o, { dur: 0.04, filter: 'highpass', freq: 1800, vol: 0.8, delay: 0.18 });
      break;
    }
    case 'hit': {
      const o = spatial(e.x, e.y, 0.6);
      if (o) tone(o, { freq: 170, freqEnd: 80, dur: 0.12, vol: 0.6 });
      break;
    }
    case 'zhit': {
      const o = spatial(e.x, e.y, 0.3);
      if (o) noiseBurst(o, { dur: 0.06, filter: 'lowpass', freq: 700, vol: 0.7 });
      break;
    }
    case 'zkill': {
      const o = spatial(e.x, e.y, 0.45);
      if (!o) break;
      tone(o, { freq: 150 + Math.random() * 40, freqEnd: 55, dur: 0.5, wave: 'sawtooth', vol: 0.35, lowpass: 600 });
      noiseBurst(o, { dur: 0.15, filter: 'lowpass', freq: 500, vol: 0.6 });
      break;
    }
    case 'zattack': {
      const o = spatial(e.x, e.y, 0.6);
      if (!o) break;
      noiseBurst(o, { dur: 0.14, filter: 'highpass', freq: 2200, vol: 0.6 });
      tone(o, { freq: 240, freqEnd: 90, dur: 0.18, wave: 'square', vol: 0.2, lowpass: 900 });
      break;
    }
    case 'zemerge': {
      // Lautojen ratina ikkunassa
      const o = spatial(e.x, e.y, 0.5);
      if (!o) break;
      noiseBurst(o, { dur: 0.12, filter: 'bandpass', freq: 900, q: 6, vol: 0.9 });
      noiseBurst(o, { dur: 0.08, filter: 'bandpass', freq: 600, q: 6, vol: 0.8, delay: 0.15 });
      break;
    }
    case 'kill': {
      const o = spatial(e.x, e.y, 0.6);
      if (o) tone(o, { freq: 320, freqEnd: 70, dur: 0.6, wave: 'sawtooth', vol: 0.3, lowpass: 1200 });
      break;
    }
    case 'blast': {
      const o = spatial(e.x, e.y, 0.6);
      if (o) noiseBurst(o, { dur: 0.35, filter: 'lowpass', freq: 1500, freqEnd: 150, vol: 0.9 });
      break;
    }
    case 'dash': {
      const o = spatial(own ? undefined : e.x, e.y, 0.35);
      if (o) noiseBurst(o, { dur: 0.18, filter: 'bandpass', freq: 500, freqEnd: 2200, q: 1.5, vol: 0.8 });
      break;
    }
    case 'buy':
    case 'perk': {
      if (!own) break;
      const o = spatial(undefined, 0, 0.35);
      tone(o, { freq: 1320, dur: 0.12, vol: 0.5 });
      tone(o, { freq: 1760, dur: 0.25, vol: 0.5, delay: 0.09 });
      break;
    }
    case 'boxOpen': {
      // Soittorasia
      const o = spatial(own ? undefined : 800, 500, 0.3);
      if (!o) break;
      const notes = [523, 659, 784, 1047, 784, 659, 523, 659, 784, 1047, 1319, 1047];
      notes.forEach((f, i) => tone(o, { freq: f, dur: 0.35, wave: 'triangle', vol: 0.4, delay: i * 0.24 }));
      break;
    }
    case 'pickup': {
      const o = spatial(own ? undefined : e.x, e.y, 0.45);
      if (!o) break;
      [660, 880, 1320].forEach((f, i) => tone(o, { freq: f, dur: 0.25, wave: 'triangle', vol: 0.5, delay: i * 0.07 }));
      break;
    }
    case 'nuke': {
      const o = spatial(undefined, 0, 0.8);
      noiseBurst(o, { dur: 1.6, filter: 'lowpass', freq: 2500, freqEnd: 80, vol: 1 });
      tone(o, { freq: 70, freqEnd: 20, dur: 1.4, vol: 0.9 });
      break;
    }
  }
}

export function playChatBlip() {
  if (!ctx || muted) return;
  tone(spatial(undefined, 0, 0.25), { freq: 1050, dur: 0.08, wave: 'triangle', vol: 0.5 });
}

export function playEvents(events, localId) {
  if (!ctx || muted) return;
  for (const e of events) play(e, localId);
}

// Kutsutaan joka ruudunpäivitys: lähtölaskenta, erän alku/loppu ja zombien valitus pimeässä.
export function updateAmbient(world, dt) {
  if (!ctx || muted) {
    lastPhase = world.phase;
    return;
  }
  const out = () => spatial(undefined, 0, 0.4);

  if (world.phase === 'countdown') {
    const n = Math.ceil(world.phaseTimer);
    if (n !== lastCountdown && n > 0) tone(out(), { freq: 660, dur: 0.15, vol: 0.5 });
    lastCountdown = n;
  } else {
    lastCountdown = null;
  }

  if (lastPhase && world.phase !== lastPhase) {
    if (world.phase === 'playing') tone(out(), { freq: 990, dur: 0.4, vol: 0.5 });
    if (world.phase === 'roundEnd' || world.phase === 'gameOver') {
      // Matala kello
      tone(out(), { freq: 196, dur: 2, vol: 0.5, wave: 'sine' });
      tone(out(), { freq: 294, dur: 1.6, vol: 0.3, wave: 'sine' });
      tone(out(), { freq: 392, dur: 1.2, vol: 0.15, wave: 'triangle' });
    }
  }
  lastPhase = world.phase;

  moanTimer -= dt;
  const zombies = world.zombies || [];
  if (moanTimer <= 0 && zombies.length > 0) {
    moanTimer = 1.5 + Math.random() * 2.5;
    const z = zombies[Math.floor(Math.random() * zombies.length)];
    const o = spatial(z.x, z.y, 0.35);
    if (o) {
      const f = 90 + Math.random() * 50;
      tone(o, { freq: f, freqEnd: f * 0.7, dur: 1.2, wave: 'sawtooth', vol: 0.4, attack: 0.3, lowpass: 450 });
    }
  }
}
