// Host: ajaa simulaatiota, ottaa vastaan liittyjien syötteet ja lähettää tilan kaikille.

import { TICK, PLAYER_COLORS } from './constants.js';
import { createWorld, addPlayer, removePlayer, step, startMatch, EMPTY_INPUT } from './game.js';
import { readInput } from './input.js';
import { botInput, forgetBot } from './bot.js';
import { playEvents, updateAmbient } from './sound.js';
import { render, handleEvents, followCamera, cameraTarget, screenToWorld, camera } from './render.js';
import {
  PEER_PREFIX, MAX_PLAYERS, SNAPSHOT_EVERY,
  encodeSnapshot, sanitizeName, sanitizeInput, randomRoomCode,
} from './protocol.js';

const HOST_ID = 'host';
const CLIENT_TIMEOUT = 5000;  // ms ilman viestejä -> pelaaja poistetaan
const MAX_QUEUED_INPUTS = 8;

export function startHost({ name, bots, onRoom, onStatus }) {
  const world = createWorld();
  const me = addPlayer(world, HOST_ID, sanitizeName(name), PLAYER_COLORS[0]);
  camera.x = me.x;
  camera.y = me.y;

  const botIds = [];
  for (let i = 0; i < bots; i++) addBot();

  const clients = new Map(); // peer id -> { id, conn, queue, lastQueued, lastInput, ack, lastSeen }
  let nextClientNum = 1;
  let peer = null;
  let roomCode = null;
  let destroyed = false;
  let tick = 0;
  let acc = 0;
  let pendingEvents = [];
  let netError = null;

  openPeer();

  function openPeer() {
    const code = randomRoomCode();
    peer = new Peer(PEER_PREFIX + code, { debug: 1 });
    peer.on('open', () => {
      roomCode = code;
      onRoom(code);
    });
    peer.on('connection', handleConnection);
    peer.on('disconnected', () => {
      // Yhteys välityspalvelimeen katkesi. Olemassa olevat pelaajat pysyvät, uudet eivät pääse sisään.
      if (!destroyed) peer.reconnect();
    });
    peer.on('error', (err) => {
      if (destroyed) return;
      if (err.type === 'unavailable-id') {
        peer.destroy();
        openPeer();
      } else if (!roomCode) {
        netError = err.type;
        onStatus?.(`Huoneen luonti epäonnistui (${err.type}).`);
      }
    });
  }

  function handleConnection(conn) {
    conn.on('data', (msg) => {
      try {
        onMessage(conn, msg);
      } catch (e) {
        console.warn('Virheellinen viesti', conn.peer, e);
      }
    });
    conn.on('close', () => dropClient(conn.peer));
    conn.on('error', () => dropClient(conn.peer));
  }

  function onMessage(conn, msg) {
    if (!msg || typeof msg !== 'object') return;
    const client = clients.get(conn.peer);
    if (client) client.lastSeen = performance.now();

    if (msg.type === 'hello' && !client) {
      join(conn, msg.name);
    } else if (msg.type === 'input' && client && Array.isArray(msg.inputs)) {
      const inputs = msg.inputs.slice(0, 10).map(sanitizeInput).filter(Boolean).sort((a, b) => a.seq - b.seq);
      for (const input of inputs) {
        if (input.seq <= client.lastQueued) continue;
        client.queue.push(input);
        client.lastQueued = input.seq;
      }
      while (client.queue.length > MAX_QUEUED_INPUTS) client.queue.shift();
    } else if (msg.type === 'ping' && typeof msg.c === 'number') {
      conn.send({ type: 'pong', c: msg.c });
    }
  }

  function join(conn, rawName) {
    if (Object.keys(world.players).length >= MAX_PLAYERS) {
      if (botIds.length > 0) {
        removeBot();
      } else {
        conn.send({ type: 'reject', reason: 'Huone on täynnä.' });
        setTimeout(() => conn.close(), 500);
        return;
      }
    }
    // Pelaaja-id annetaan täällä, ei oteta liittyjän peer-id:stä (ettei kukaan voi esiintyä hostina).
    const id = `p${nextClientNum++}`;
    addPlayer(world, id, sanitizeName(rawName), freeColor());
    clients.set(conn.peer, {
      id, conn,
      queue: [], lastQueued: 0, lastInput: EMPTY_INPUT, ack: 0,
      lastSeen: performance.now(),
    });
    conn.send({ type: 'welcome', id, code: roomCode });
  }

  function dropClient(peerId) {
    const c = clients.get(peerId);
    if (!c) return;
    clients.delete(peerId);
    removePlayer(world, c.id);
    c.conn.close();
  }

  function addBot() {
    const id = `bot${botIds.length + 1}`;
    addPlayer(world, id, `Botti ${botIds.length + 1}`, freeColor());
    botIds.push(id);
  }

  function removeBot() {
    const id = botIds.pop();
    removePlayer(world, id);
    forgetBot(id);
  }

  function freeColor() {
    const used = new Set(Object.values(world.players).map((p) => p.color));
    return PLAYER_COLORS.find((c) => !used.has(c)) || PLAYER_COLORS[0];
  }

  function tickOnce() {
    const inputs = { [HOST_ID]: readInput(me, screenToWorld) };
    for (const id of botIds) inputs[id] = botInput(world, id, TICK);
    for (const c of clients.values()) {
      // Yksi syöte per tick. Jos jono on tyhjä, toistetaan edellinen.
      if (c.queue.length > 0) {
        c.lastInput = c.queue.shift();
        c.ack = c.lastInput.seq;
      }
      inputs[c.id] = c.lastInput;
    }

    const events = step(world, inputs, TICK);
    handleEvents(events, world, HOST_ID);
    playEvents(events, HOST_ID);
    pendingEvents.push(...events);

    if (++tick % SNAPSHOT_EVERY === 0) broadcast();
    if (tick % 60 === 0) checkTimeouts();
  }

  function broadcast() {
    if (clients.size === 0) {
      pendingEvents = [];
      return;
    }
    const acks = {};
    for (const c of clients.values()) acks[c.id] = c.ack;
    const snap = encodeSnapshot(world, acks, pendingEvents);
    pendingEvents = [];
    for (const c of clients.values()) {
      if (c.conn.open) c.conn.send(snap);
    }
  }

  function checkTimeouts() {
    const now = performance.now();
    for (const [peerId, c] of clients) {
      if (now - c.lastSeen > CLIENT_TIMEOUT) dropClient(peerId);
    }
  }

  return {
    frame(ctx, dt) {
      acc += dt;
      while (acc >= TICK) {
        tickOnce();
        acc -= TICK;
      }
      const target = cameraTarget(world, HOST_ID);
      if (target) followCamera(target, dt);
      render(ctx, world, HOST_ID, acc / TICK, dt);
      updateAmbient(world, dt);
    },
    info() {
      const humans = clients.size + 1;
      const room = roomCode ? `Huone ${roomCode}`
        : netError ? `Ei verkkoyhteyttä (${netError}), vain botit` : 'Luodaan huonetta…';
      const canStart = (world.phase === 'warmup' || world.phase === 'gameOver')
        && Object.keys(world.players).length >= 2;
      return { code: roomCode, text: `${room} · ${humans} pelaaja${humans === 1 ? '' : 'a'}`, canStart };
    },
    startMatch() {
      return startMatch(world);
    },
    debug: () => ({ world, clients }),
    destroy() {
      destroyed = true;
      for (const c of clients.values()) c.conn.close();
      peer?.destroy();
      for (const id of botIds) forgetBot(id);
    },
  };
}
