// Host: ajaa simulaatiota, ottaa vastaan liittyjien syötteet ja lähettää tilan kaikille.

import { TICK, PLAYER_COLORS } from './constants.js';
import { createWorld, addPlayer, removePlayer, step, startMatch, EMPTY_INPUT } from './game.js';
import { readInput } from './input.js';
import { botInput, forgetBot } from './bot.js';
import { playEvents, updateAmbient, playChatBlip } from './sound.js';
import { addChat, sanitizeChat } from './chat.js';
import { render, handleEvents, followCamera, cameraTarget, screenToWorld, camera } from './render.js';
import {
  PEER_PREFIX, MAX_PLAYERS, SNAPSHOT_EVERY,
  encodeSnapshot, sanitizeName, sanitizeInput, randomRoomCode,
} from './protocol.js';

const HOST_ID = 'host';
const CLIENT_TIMEOUT = 5000;  // ms ilman viestejä -> pelaaja poistetaan
const MAX_QUEUED_INPUTS = 8;
const MAX_WAIT_TICKS = 4;     // kuinka kauan odotetaan väärässä järjestyksessä myöhästyvää syötettä
const HELLO_TIMEOUT = 5000;   // ms: esittäytymätön yhteys suljetaan
const CHAT_LIMIT = 3;         // viestiä ...
const CHAT_WINDOW = 5000;     // ... näin monessa millisekunnissa

export function startHost({ name, bots, onRoom, onStatus }) {
  const world = createWorld();
  const me = addPlayer(world, HOST_ID, sanitizeName(name), PLAYER_COLORS[0]);
  camera.x = me.x;
  camera.y = me.y;

  const botIds = [];
  for (let i = 0; i < bots; i++) addBot();

  const clients = new Map(); // peer id -> { id, conn, queue, lastInput, ack, waitTicks, lastSeen }
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
    // Yhteys, joka ei esittäydy, ei jää roikkumaan.
    setTimeout(() => {
      if (!clients.has(conn.peer)) conn.close();
    }, HELLO_TIMEOUT);
  }

  function onMessage(conn, msg) {
    if (!msg || typeof msg !== 'object') return;
    const client = clients.get(conn.peer);
    if (client) client.lastSeen = performance.now();

    if (msg.type === 'hello' && !client) {
      join(conn, msg.name);
    } else if (msg.type === 'input' && client && Array.isArray(msg.inputs)) {
      const inputs = msg.inputs.slice(0, 10).map(sanitizeInput).filter(Boolean).sort((a, b) => a.seq - b.seq);
      // Viestit voivat saapua väärässä järjestyksessä: jono pidetään numerojärjestyksessä.
      for (const input of inputs) {
        if (input.seq <= client.ack || client.queue.some((q) => q.seq === input.seq)) continue;
        const at = client.queue.findIndex((q) => q.seq > input.seq);
        if (at < 0) client.queue.push(input);
        else client.queue.splice(at, 0, input);
      }
      while (client.queue.length > MAX_QUEUED_INPUTS) client.queue.shift();
    } else if (msg.type === 'chat' && client) {
      const now = performance.now();
      client.chatTimes = client.chatTimes.filter((t) => now - t < CHAT_WINDOW);
      if (client.chatTimes.length >= CHAT_LIMIT) return;
      const text = sanitizeChat(msg.text);
      if (!text) return;
      client.chatTimes.push(now);
      const p = world.players[client.id];
      broadcastChat({ name: p?.name ?? '?', color: p?.color ?? '#e6e9ef', text });
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
    addPlayer(world, id, uniqueName(sanitizeName(rawName)), freeColor());
    clients.set(conn.peer, {
      id, conn,
      queue: [], lastInput: EMPTY_INPUT, ack: 0, waitTicks: 0, chatTimes: [],
      lastSeen: performance.now(),
    });
    conn.send({ type: 'welcome', id, code: roomCode });
    broadcastChat({ text: `${world.players[id].name} liittyi peliin`, system: true });
  }

  function dropClient(peerId) {
    const c = clients.get(peerId);
    if (!c) return;
    clients.delete(peerId);
    const name = world.players[c.id]?.name;
    removePlayer(world, c.id);
    if (name && !destroyed) broadcastChat({ text: `${name} poistui pelistä`, system: true });
    c.conn.close();
  }

  // Näytetään itselle ja lähetetään kaikille liittyjille.
  function broadcastChat(msg) {
    addChat(msg);
    playChatBlip();
    const packet = { type: 'chat', name: msg.name ?? '', color: msg.color ?? '', text: msg.text, system: !!msg.system };
    for (const c of clients.values()) {
      if (c.conn.open) c.conn.send(packet);
    }
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

  // Samannimiset pelaajat erotetaan numerolla: "Pelaaja", "Pelaaja 2".
  function uniqueName(name) {
    const taken = new Set(Object.values(world.players).map((p) => p.name));
    if (!taken.has(name)) return name;
    for (let i = 2; ; i++) {
      const candidate = `${name.slice(0, 13)} ${i}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  function freeColor() {
    const used = new Set(Object.values(world.players).map((p) => p.color));
    return PLAYER_COLORS.find((c) => !used.has(c)) || PLAYER_COLORS[0];
  }

  // visible = välilehti näkyvissä. Piilossa efektejä ja ääniä ei kerätä.
  function tickOnce(visible) {
    const inputs = { [HOST_ID]: readInput(me, screenToWorld) };
    for (const id of botIds) inputs[id] = botInput(world, id, TICK);
    for (const c of clients.values()) {
      // Yksi syöte per tick. Jos seuraava syöte ei ole vielä perillä, pelaaja odottaa tämän
      // tickin (skip) eikä hostin tarvitse arvata: liittyjän ennuste pysyy silloin täsmälleen oikeana.
      // Jos välistä puuttuu syöte, odotetaan sitä hetki ennen kuin jatketaan ilman.
      const gap = c.queue.length > 0 && c.ack > 0 && c.queue[0].seq !== c.ack + 1;
      if (c.queue.length > 0 && (!gap || c.waitTicks >= MAX_WAIT_TICKS)) {
        c.lastInput = c.queue.shift();
        c.ack = c.lastInput.seq;
        c.waitTicks = 0;
        inputs[c.id] = c.lastInput;
      } else {
        if (gap) c.waitTicks++;
        inputs[c.id] = { ...c.lastInput, skip: true };
      }
    }

    const events = step(world, inputs, TICK);
    if (visible) {
      handleEvents(events, world, HOST_ID);
      playEvents(events, HOST_ID);
    }
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
    // Pelilogiikka ja verkko: ajetaan myös välilehden ollessa piilossa (main.js).
    update(dt, visible) {
      acc += dt;
      while (acc >= TICK) {
        tickOnce(visible);
        acc -= TICK;
      }
    },
    draw(ctx, dt) {
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
    sendChat(text) {
      const clean = sanitizeChat(text);
      if (clean) broadcastChat({ name: me.name, color: me.color, text: clean });
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
