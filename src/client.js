// Liittyjä: lähettää syötteet hostille ja piirtää hostin lähettämää tilaa.
// Oma liike ennustetaan heti (ei viivettä), muut pelaajat piirretään hieman menneisyydestä
// kahden snapshotin välistä, jotta liike näyttää sulavalta.

import { TICK } from './constants.js';
import { movePlayer } from './game.js';
import { readInput } from './input.js';
import { render, handleEvents, followCamera, screenToWorld, camera } from './render.js';
import { PEER_PREFIX, decodeSnapshot } from './protocol.js';

const INTERP_DELAY = 0.1;     // s
const CONNECT_TIMEOUT = 10000; // ms
const HOST_TIMEOUT = 5000;     // ms ilman snapshotia -> yhteys katki

export function startClient({ name, code, onReady, onFail }) {
  let conn = null;
  let localId = null;
  let failed = false;
  let snaps = [];             // decoded snapshotit aikajärjestyksessä
  let offset = null;          // paikallinen aika - hostin aika (s)
  let lastSnapAt = performance.now();
  let rtt = null;
  let seq = 0;
  let pending = [];           // lähetetyt syötteet, joita host ei ole vielä kuitannut
  let predicted = null;       // oma ennustettu sijainti { x, y, px, py }
  let lastAim = 0;
  let cameraPlaced = false;
  let maxCorrection = 0;
  let acc = 0;
  const eventQueue = [];

  const peer = new Peer({ debug: 1 });

  const connectTimer = setTimeout(() => {
    if (!localId) fail('Yhteyden muodostus aikakatkaistiin. Tarkista huonekoodi.');
  }, CONNECT_TIMEOUT);

  const pingTimer = setInterval(() => {
    if (conn?.open) conn.send({ type: 'ping', c: performance.now() });
  }, 1000);

  peer.on('open', () => {
    conn = peer.connect(PEER_PREFIX + code, { serialization: 'json', reliable: false });
    conn.on('open', () => conn.send({ type: 'hello', name }));
    conn.on('data', (msg) => {
      try {
        onMessage(msg);
      } catch (e) {
        console.warn('Virheellinen viesti hostilta', e);
      }
    });
    conn.on('close', () => fail('Yhteys hostiin katkesi.'));
    conn.on('error', () => fail('Yhteysvirhe.'));
  });
  peer.on('error', (err) => {
    if (err.type === 'peer-unavailable') fail(`Huonetta ${code} ei löytynyt.`);
    else if (!localId) fail(`Verkkovirhe (${err.type}).`);
  });

  function fail(msg) {
    if (failed) return;
    failed = true;
    onFail(msg);
  }

  function onMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'welcome' && typeof msg.id === 'string') {
      localId = msg.id;
      clearTimeout(connectTimer);
      onReady();
    } else if (msg.type === 'reject') {
      fail(String(msg.reason || 'Host hylkäsi liittymisen.').slice(0, 100));
    } else if (msg.type === 'pong' && typeof msg.c === 'number') {
      rtt = performance.now() - msg.c;
    } else if (msg.type === 'snap' && typeof msg.t === 'number'
      && Array.isArray(msg.p) && Array.isArray(msg.b) && Array.isArray(msg.e)) {
      onSnapshot(decodeSnapshot(msg));
    }
  }

  function onSnapshot(s) {
    // Viestit voivat tulla väärässä järjestyksessä; vanhat hylätään.
    if (snaps.length > 0 && s.t <= snaps[snaps.length - 1].t) return;
    const now = performance.now();
    lastSnapAt = now;
    snaps.push(s);
    while (snaps.length > 2 && snaps[1].t < s.t - 1) snaps.shift();

    // Arvio hostin kellosta. Nopein saapuminen kertoo parhaiten, hitaasti ylöspäin jos yhteys hidastuu.
    const sample = now / 1000 - s.t;
    if (offset === null || sample < offset) offset = sample;
    else offset += (sample - offset) * 0.02;

    for (const e of s.events) eventQueue.push({ t: s.t, e });
    if (!cameraPlaced && localId && s.players[localId]) {
      cameraPlaced = true;
      camera.x = s.players[localId].x;
      camera.y = s.players[localId].y;
    }
    reconcile(s);
  }

  // Palautetaan oma sijainti hostin tilaan ja ajetaan kuittaamattomat syötteet uudelleen.
  function reconcile(s) {
    const self = localId && s.players[localId];
    if (!self) return;
    pending = pending.filter((i) => i.seq > self.ack);
    if (!self.alive) {
      predicted = null;
      pending = [];
      return;
    }
    const prev = predicted;
    predicted = { x: self.x, y: self.y, px: 0, py: 0 };
    for (const input of pending) movePlayer(predicted, input, TICK);
    if (prev) maxCorrection = Math.max(maxCorrection, Math.hypot(prev.x - predicted.x, prev.y - predicted.y));
    // Säilytetään edellinen piirtosijainti, ettei korjaus nyi interpoloinnissa.
    predicted.px = prev ? prev.px : predicted.x;
    predicted.py = prev ? prev.py : predicted.y;
  }

  function tickOnce() {
    if (!conn?.open || !localId) return;
    const base = predicted || latestSelf() || { x: camera.x, y: camera.y };
    const input = { seq: ++seq, ...readInput(base, screenToWorld) };
    lastAim = input.aim;
    if (predicted) {
      predicted.px = predicted.x;
      predicted.py = predicted.y;
      movePlayer(predicted, input, TICK);
      pending.push(input);
    }
    conn.send({ type: 'input', inputs: [input] });
  }

  function latestSelf() {
    return snaps.length > 0 && localId ? snaps[snaps.length - 1].players[localId] : null;
  }

  // Rakentaa piirrettävän maailman snapshotien välistä.
  function buildView(alpha) {
    const latest = snaps[snaps.length - 1];
    const renderT = performance.now() / 1000 - offset - INTERP_DELAY;

    let a = latest;
    let b = latest;
    for (let i = snaps.length - 1; i > 0; i--) {
      if (snaps[i - 1].t <= renderT) {
        a = snaps[i - 1];
        b = snaps[i];
        break;
      }
    }
    const t = b.t > a.t ? Math.min(1, Math.max(0, (renderT - a.t) / (b.t - a.t))) : 1;

    const players = {};
    for (const pb of Object.values(latest.players)) {
      const from = a.players[pb.id];
      const to = b.players[pb.id] || pb;
      const p = { ...pb, x: to.x, y: to.y, aim: to.aim };
      if (from && from.alive && to.alive && Math.hypot(to.x - from.x, to.y - from.y) < 150) {
        p.x = from.x + (to.x - from.x) * t;
        p.y = from.y + (to.y - from.y) * t;
        p.aim = lerpAngle(from.aim, to.aim, t);
      }
      if (!to.alive) p.alive = false;
      p.px = p.x;
      p.py = p.y;
      players[p.id] = p;
    }

    const self = players[localId];
    if (self && predicted && self.alive) {
      self.x = predicted.px + (predicted.x - predicted.px) * alpha;
      self.y = predicted.py + (predicted.y - predicted.py) * alpha;
      self.px = self.x;
      self.py = self.y;
      self.aim = lastAim;
    }

    const bullets = [];
    for (const [id, bb] of b.bullets) {
      const ba = a.bullets.get(id);
      if (!ba) continue;
      const x = ba.x + (bb.x - ba.x) * t;
      const y = ba.y + (bb.y - ba.y) * t;
      bullets.push({ x, y, px: x, py: y });
    }

    // Efektit laukaistaan vasta kun piirtoaika saavuttaa ne.
    const due = [];
    while (eventQueue.length > 0 && eventQueue[0].t <= renderT) due.push(eventQueue.shift().e);

    return { view: { players, bullets }, due };
  }

  return {
    frame(ctx, dt) {
      if (!failed && localId && performance.now() - lastSnapAt > HOST_TIMEOUT) {
        fail('Host ei vastaa.');
      }
      acc += dt;
      while (acc >= TICK) {
        tickOnce();
        acc -= TICK;
      }

      if (snaps.length === 0 || offset === null) {
        drawWaiting(ctx);
        return;
      }
      const { view, due } = buildView(acc / TICK);
      handleEvents(due, view);
      const self = view.players[localId];
      if (self?.alive) followCamera(self, dt);
      render(ctx, view, localId, 1, dt);
    },
    info() {
      const ping = rtt === null ? '–' : `${Math.round(rtt)} ms`;
      return { code, text: `Huone ${code} · ping ${ping}` };
    },
    debug: () => ({ localId, predicted, pending: pending.length, maxCorrection, snaps: snaps.length }),
    destroy() {
      failed = true;
      clearTimeout(connectTimer);
      clearInterval(pingTimer);
      conn?.close();
      peer.destroy();
    },
  };
}

function drawWaiting(ctx) {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0d0f14';
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
