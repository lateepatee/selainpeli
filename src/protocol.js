// Verkkoviestien muoto. Kaikki mitä vieraalta koneelta tulee, tarkistetaan täällä.
//
// Liittyjä -> host:  { type: 'hello', name, look }
//                    { type: 'look', look }            (hahmon muutos lämmittelyssä)
//                    { type: 'chat', text }
//                    { type: 'input', inputs: [{ seq, up, down, left, right, aim, shoot }, ...] }
//                    { type: 'ping', c }
// Host -> liittyjä:  { type: 'snap', t, p: [...], b: [...], e: [...] }
//                    { type: 'pong', c }
//                    { type: 'reject', reason }
//                    { type: 'chat', name, color, text, system }

import { PERK_IDS } from './weapons.js';

export const PEER_PREFIX = 'areena-peli-v6-';
export const MAX_PLAYERS = 6;
export const SNAPSHOT_EVERY = 2; // tickiä -> 30 snapshotia/s

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

export function encodeSnapshot(world, acks, events) {
  const z = world.zone;
  return {
    type: 'snap',
    t: Math.round(world.time * 1000) / 1000,
    m: world.mapId,
    ph: world.phase,
    pt: r1(world.phaseTimer),
    rd: world.round,
    rw: world.roundWinner,
    mw: world.matchWinner,
    z: z ? [r1(z.x), r1(z.y), r1(z.r), r1(z.elapsed)] : null,
    p: Object.values(world.players).map((p) => [
      p.id, p.name, p.color, r1(p.x), r1(p.y), r2(p.aim), r1(p.hp), p.alive ? 1 : 0,
      r1(p.respawnTimer), p.kills, p.deaths, acks[p.id] || 0, p.score, p.wins, p.killedBy, p.zombieKills,
      ...encodeLoadout(p),
      p.look?.hat ?? 0, p.look?.pattern ?? 0, p.look?.face ?? 0,
    ]),
    b: world.bullets.map((b) => [b.id, r1(b.x), r1(b.y), b.splash ? 1 : 0]),
    bx: [world.box.state, world.box.owner, world.box.weapon, r1(world.box.timer)],
    pu: world.powerups.map((pu) => [pu.id, pu.type, r1(pu.x), r1(pu.y), r1(pu.life)]),
    zb: world.zombies.map((z) => [z.id, r1(z.x), r1(z.y), r2(z.angle), z.emerge > 0 ? 1 : 0]),
    e: events.map((e) => ({ ...e, x: r1(e.x ?? 0), y: r1(e.y ?? 0) })),
  };
}

export function decodeSnapshot(msg) {
  const players = {};
  for (const a of msg.p) {
    players[a[0]] = {
      id: a[0], name: a[1], color: a[2], x: a[3], y: a[4], aim: a[5], hp: a[6],
      alive: a[7] === 1, respawnTimer: a[8], kills: a[9], deaths: a[10], ack: a[11],
      score: a[12], wins: a[13], killedBy: a[14], zombieKills: a[15],
      ...decodeLoadout(a, 16),
      look: { hat: a[31], pattern: a[32], face: a[33] },
    };
  }
  const bullets = new Map();
  for (const b of msg.b) bullets.set(b[0], { id: b[0], x: b[1], y: b[2], splash: b[3] === 1 });
  const zombies = new Map();
  for (const a of Array.isArray(msg.zb) ? msg.zb : []) {
    zombies.set(a[0], { id: a[0], x: a[1], y: a[2], angle: a[3], emerging: a[4] === 1 });
  }
  const z = Array.isArray(msg.z) ? { x: msg.z[0], y: msg.z[1], r: msg.z[2], elapsed: msg.z[3] } : null;
  return {
    t: msg.t, players, bullets, zombies, events: msg.e,
    mapId: typeof msg.m === 'string' ? msg.m : null,
    phase: msg.ph, phaseTimer: msg.pt, round: msg.rd,
    roundWinner: msg.rw, matchWinner: msg.mw, zone: z,
    box: Array.isArray(msg.bx)
      ? { state: msg.bx[0], owner: msg.bx[1], weapon: msg.bx[2], timer: msg.bx[3] }
      : { state: 'idle', owner: null, weapon: null, timer: 0 },
    powerups: (Array.isArray(msg.pu) ? msg.pu : []).map((a) => ({ id: a[0], type: a[1], x: a[2], y: a[3], life: a[4] })),
  };
}

// Raha ja aseet: [raha, ase1, ase2, valittu, lipas, varasto (-1 = rajaton), latausaika,
//   juomat (bitit), kertaisku, tuplarahat, väistö: tickit, latautuminen, nappi pohjassa, suunta x, y]
function encodeLoadout(p) {
  const slot = p.slots[p.cur];
  const perkBits = PERK_IDS.reduce((bits, id, i) => (p.perks?.[id] ? bits | (1 << i) : bits), 0);
  return [
    p.money, p.slots[0]?.id ?? null, p.slots[1]?.id ?? null, p.cur,
    slot ? slot.mag : 0, slot && Number.isFinite(slot.reserve) ? slot.reserve : -1, r1(p.reloadTimer),
    perkBits, r1(p.instaKill), r1(p.doubleMoney),
    p.dashTicks, p.dashCd, p.dashHeld ? 1 : 0, r3(p.dashX), r3(p.dashY),
  ];
}

function decodeLoadout(a, i) {
  const slots = [a[i + 1] ? { id: a[i + 1] } : null, a[i + 2] ? { id: a[i + 2] } : null];
  const perks = {};
  PERK_IDS.forEach((id, k) => {
    if (a[i + 7] & (1 << k)) perks[id] = true;
  });
  return {
    money: a[i], slots, cur: a[i + 3], mag: a[i + 4],
    reserve: a[i + 5] < 0 ? Infinity : a[i + 5], reloadTimer: a[i + 6],
    perks, instaKill: a[i + 8], doubleMoney: a[i + 9],
    dashTicks: a[i + 10], dashCd: a[i + 11], dashHeld: a[i + 12] === 1, dashX: a[i + 13], dashY: a[i + 14],
  };
}

export function sanitizeName(name) {
  const clean = String(name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 16);
  return clean || 'Pelaaja';
}

export function sanitizeInput(i) {
  if (!i || typeof i !== 'object') return null;
  const seq = Number(i.seq);
  if (!Number.isInteger(seq) || seq < 0) return null;
  const aim = Number(i.aim);
  return {
    seq,
    up: !!i.up, down: !!i.down, left: !!i.left, right: !!i.right,
    aim: Number.isFinite(aim) ? aim : 0,
    shoot: !!i.shoot,
    reload: !!i.reload,
    interact: !!i.interact,
    swap: !!i.swap,
    dash: !!i.dash,
  };
}

// Huonekoodi ilman helposti sekoittuvia merkkejä (I, O).
export function randomRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
