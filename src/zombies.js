// Zombit: syntyminen ikkunoista, reitinhaku ja hyökkäys. Ajetaan vain hostilla osana simulaatiota.

import {
  ARENA_W, ARENA_H, OBSTACLES, WINDOWS, PLAYER_RADIUS,
  ZOMBIE_RADIUS, ZOMBIE_HP, ZOMBIE_HP_PER_LEVEL, ZOMBIE_SPEED, ZOMBIE_SPEED_PER_LEVEL,
  ZOMBIE_SPEED_MAX, ZOMBIE_SPRINTER_LEVEL, ZOMBIE_DAMAGE, ZOMBIE_ATTACK_COOLDOWN,
  ZOMBIE_EMERGE_TIME, ZOMBIE_LEVEL_TIME, ZOMBIE_MAX, WARMUP_ZOMBIES,
} from './constants.js';
import { clamp, pointInRect, pushCircleOutOfRect, lineOfSight } from './geometry.js';
import { onMapChange } from './map.js';

// --- Reitinhaku: ruudukko, jossa jokaisella ruudulla etäisyys lähimpään pelaajaan ---

const CELL = 20;
const FLOW_INTERVAL = 0.2; // s
let COLS = 0;
let ROWS = 0;
let blocked = null;
let dist = null;
let queue = null;

// Ruudukko rakennetaan uudelleen joka kentälle.
function buildGrid() {
  COLS = Math.ceil(ARENA_W / CELL);
  ROWS = Math.ceil(ARENA_H / CELL);
  blocked = new Uint8Array(COLS * ROWS);
  dist = new Float32Array(COLS * ROWS);
  queue = new Int32Array(COLS * ROWS);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = (c + 0.5) * CELL;
      const y = (r + 0.5) * CELL;
      if (OBSTACLES.some((o) => pointInRect(x, y, o, ZOMBIE_RADIUS))) blocked[r * COLS + c] = 1;
    }
  }
}
buildGrid();
onMapChange(buildGrid);

function cellOf(x, y) {
  const c = clamp(Math.floor(x / CELL), 0, COLS - 1);
  const r = clamp(Math.floor(y / CELL), 0, ROWS - 1);
  return r * COLS + c;
}

// Leveyshaku kaikista elossa olevista pelaajista yhtä aikaa.
function computeFlow(players) {
  dist.fill(Infinity);
  let head = 0;
  let tail = 0;
  for (const p of players) {
    const i = cellOf(p.x, p.y);
    if (dist[i] === 0) continue;
    dist[i] = 0;
    queue[tail++] = i;
  }
  while (head < tail) {
    const i = queue[head++];
    const c = i % COLS;
    const d = dist[i] + 1;
    const neighbors = [c > 0 ? i - 1 : -1, c < COLS - 1 ? i + 1 : -1, i - COLS, i + COLS];
    for (const n of neighbors) {
      if (n < 0 || n >= dist.length || blocked[n] || dist[n] <= d) continue;
      dist[n] = d;
      queue[tail++] = n;
    }
  }
}

// Suunta naapuriruutuun, joka on lähimpänä pelaajaa. null jos ei reittiä. (Myös bossi käyttää.)
export function flowDirection(z) {
  const i = cellOf(z.x, z.y);
  const c = i % COLS;
  const r = (i - c) / COLS;
  let best = dist[i];
  let bx = 0;
  let by = 0;
  let found = false;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nc = c + dx;
      const nr = r + dy;
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
      const n = nr * COLS + nc;
      if (blocked[n]) continue;
      // Viistoon vain, jos kulmaa ei leikata seinän läpi.
      if (dx !== 0 && dy !== 0 && (blocked[r * COLS + nc] || blocked[nr * COLS + c])) continue;
      if (dist[n] < best) {
        best = dist[n];
        bx = (nc + 0.5) * CELL - z.x;
        by = (nr + 0.5) * CELL - z.y;
        found = true;
      }
    }
  }
  return found ? { x: bx, y: by } : null;
}

// --- Vaikeustaso ja syntyminen ---

// Taso nousee erän edetessä ja hieman joka toisella erällä.
export function zombieLevel(world) {
  if (world.phase === 'warmup') return 0;
  const elapsed = world.zone ? world.zone.elapsed : 0;
  return Math.floor(elapsed / ZOMBIE_LEVEL_TIME) + Math.floor((world.round - 1) / 2);
}

// Myös Lyhtymies kutsuu zombeja (boss.js).
export function spawnZombie(world, alive, level) {
  // Ei ikkunasta, jonka vieressä joku seisoo: ei epäreiluja selkään syntymisiä.
  const far = WINDOWS.filter((w) => alive.every((p) => Math.hypot(p.x - w.x, p.y - w.y) > 220));
  const list = far.length > 0 ? far : WINDOWS;
  const win = list[Math.floor(Math.random() * list.length)];

  const inset = ZOMBIE_RADIUS + 2;
  let x = win.x;
  let y = win.y;
  let angle = 0;
  if (win.side === 'top') { y = inset; angle = Math.PI / 2; }
  else if (win.side === 'bottom') { y = ARENA_H - inset; angle = -Math.PI / 2; }
  else if (win.side === 'left') { x = inset; angle = 0; }
  else { x = ARENA_W - inset; angle = Math.PI; }

  let speed = Math.min(ZOMBIE_SPEED_MAX, ZOMBIE_SPEED + level * ZOMBIE_SPEED_PER_LEVEL) * (0.9 + Math.random() * 0.2);
  if (level >= ZOMBIE_SPRINTER_LEVEL && Math.random() < 0.25) speed = Math.min(ZOMBIE_SPEED_MAX * 1.3, speed * 1.5);

  world.zombies.push({
    id: world.nextZombieId++,
    x, y, px: x, py: y, angle,
    hp: ZOMBIE_HP + level * ZOMBIE_HP_PER_LEVEL,
    speed,
    emerge: ZOMBIE_EMERGE_TIME,
    cooldown: 0,
  });
}

// --- Päivitys ---

// damagePlayer(p, amount, events) tulee game.js:stä (hoitaa kuoleman ja pisteet).
export function stepZombies(world, dt, events, damagePlayer) {
  for (const z of world.zombies) {
    z.px = z.x;
    z.py = z.y;
  }
  // Lähtölaskennan ja erän tuloksen aikana zombit seisovat paikallaan.
  if (world.phase !== 'warmup' && world.phase !== 'playing') return;

  const alive = Object.values(world.players).filter((p) => p.alive);
  if (alive.length === 0) return;

  const level = zombieLevel(world);
  const warmup = world.phase === 'warmup';
  const maxZombies = warmup ? WARMUP_ZOMBIES : Math.min(ZOMBIE_MAX, 8 + 3 * alive.length + 4 * level);
  world.zombieTimer -= dt;
  if (world.zombieTimer <= 0 && world.zombies.length < maxZombies) {
    spawnZombie(world, alive, level);
    const z = world.zombies[world.zombies.length - 1];
    events.push({ type: 'zemerge', x: z.x, y: z.y });
    world.zombieTimer = warmup ? 1.5 : Math.max(0.25, 1.2 - 0.2 * level);
  }

  if (world.time >= world.flowAt) {
    computeFlow(alive);
    world.flowAt = world.time + FLOW_INTERVAL;
  }

  for (const z of world.zombies) {
    if (z.emerge > 0) {
      z.emerge -= dt;
      continue;
    }
    z.cooldown -= dt;

    let target = null;
    let targetDist = Infinity;
    for (const p of alive) {
      const d = Math.hypot(p.x - z.x, p.y - z.y);
      if (d < targetDist) {
        target = p;
        targetDist = d;
      }
    }

    let dir = null;
    if (targetDist < 140 && lineOfSight(z.x, z.y, target.x, target.y)) {
      dir = { x: target.x - z.x, y: target.y - z.y };
    } else {
      dir = flowDirection(z) || { x: target.x - z.x, y: target.y - z.y };
    }
    const len = Math.hypot(dir.x, dir.y);
    if (len > 0.001) {
      z.x += (dir.x / len) * z.speed * dt;
      z.y += (dir.y / len) * z.speed * dt;
      z.angle = Math.atan2(dir.y, dir.x);
    }
  }

  separate(world.zombies);

  const touch = PLAYER_RADIUS + ZOMBIE_RADIUS;
  for (const z of world.zombies) {
    for (const o of OBSTACLES) pushCircleOutOfRect(z, ZOMBIE_RADIUS, o);
    z.x = clamp(z.x, ZOMBIE_RADIUS, ARENA_W - ZOMBIE_RADIUS);
    z.y = clamp(z.y, ZOMBIE_RADIUS, ARENA_H - ZOMBIE_RADIUS);

    // Zombi väistää pelaajaa eikä toisin päin, jotta liittyjän liikkeen ennustus pysyy oikeana.
    for (const p of alive) {
      const dx = z.x - p.x;
      const dy = z.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < touch && d > 0.001) {
        z.x = p.x + (dx / d) * touch;
        z.y = p.y + (dy / d) * touch;
      }
    }

    if (z.emerge > 0 || z.cooldown > 0) continue;
    for (const p of alive) {
      if (!p.alive || Math.hypot(p.x - z.x, p.y - z.y) > touch + 8) continue;
      z.cooldown = ZOMBIE_ATTACK_COOLDOWN;
      events.push({ type: 'zattack', x: p.x, y: p.y, target: p.id });
      damagePlayer(p, ZOMBIE_DAMAGE, events);
      break;
    }
  }
}

// Zombit eivät mene päällekkäin.
function separate(zombies) {
  const min = ZOMBIE_RADIUS * 2;
  for (let i = 0; i < zombies.length; i++) {
    const a = zombies[i];
    for (let j = i + 1; j < zombies.length; j++) {
      const b = zombies[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      a.x -= (dx / d) * push;
      a.y -= (dy / d) * push;
      b.x += (dx / d) * push;
      b.y += (dy / d) * push;
    }
  }
}
