// Verkkoviestien muoto. Kaikki mitä vieraalta koneelta tulee, tarkistetaan täällä.
//
// Liittyjä -> host:  { type: 'hello', name }
//                    { type: 'input', inputs: [{ seq, up, down, left, right, aim, shoot }, ...] }
//                    { type: 'ping', c }
// Host -> liittyjä:  { type: 'snap', t, p: [...], b: [...], e: [...] }
//                    { type: 'pong', c }
//                    { type: 'reject', reason }

export const PEER_PREFIX = 'areena-peli-v1-';
export const MAX_PLAYERS = 6;
export const SNAPSHOT_EVERY = 2; // tickiä -> 30 snapshotia/s

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

export function encodeSnapshot(world, acks, events) {
  return {
    type: 'snap',
    t: Math.round(world.time * 1000) / 1000,
    p: Object.values(world.players).map((p) => [
      p.id, p.name, p.color, r1(p.x), r1(p.y), r2(p.aim), p.hp, p.alive ? 1 : 0,
      r1(p.respawnTimer), p.kills, p.deaths, acks[p.id] || 0,
    ]),
    b: world.bullets.map((b) => [b.id, r1(b.x), r1(b.y)]),
    e: events.map((e) => ({ ...e, x: r1(e.x ?? 0), y: r1(e.y ?? 0) })),
  };
}

export function decodeSnapshot(msg) {
  const players = {};
  for (const a of msg.p) {
    players[a[0]] = {
      id: a[0], name: a[1], color: a[2], x: a[3], y: a[4], aim: a[5], hp: a[6],
      alive: a[7] === 1, respawnTimer: a[8], kills: a[9], deaths: a[10], ack: a[11],
    };
  }
  const bullets = new Map();
  for (const b of msg.b) bullets.set(b[0], { id: b[0], x: b[1], y: b[2] });
  return { t: msg.t, players, bullets, events: msg.e };
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
  };
}

// Huonekoodi ilman helposti sekoittuvia merkkejä (I, O).
export function randomRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
