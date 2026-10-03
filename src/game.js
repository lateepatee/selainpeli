// Pelin simulaatio. Ei piirtämistä, ei DOMia: tila sisään, syötteet sisään, uusi tila ulos.
// Moninpelissä host ajaa tätä ja lähettää tilan muille.

import {
  ARENA_W, ARENA_H, OBSTACLES,
  PLAYER_RADIUS, PLAYER_SPEED, PLAYER_HP, RESPAWN_TIME,
  BULLET_SPEED, BULLET_RADIUS, BULLET_DAMAGE, BULLET_LIFE, FIRE_COOLDOWN,
} from './constants.js';

export const EMPTY_INPUT = { up: false, down: false, left: false, right: false, aim: 0, shoot: false };

export function createWorld() {
  return {
    time: 0,
    players: {},   // id -> pelaaja
    bullets: [],
    nextBulletId: 1,
  };
}

export function addPlayer(world, id, name, color) {
  const p = {
    id, name, color,
    x: 0, y: 0, px: 0, py: 0,   // px/py = edellisen tickin sijainti piirron interpolointiin
    aim: 0,
    hp: PLAYER_HP,
    alive: true,
    cooldown: 0,
    respawnTimer: 0,
    kills: 0,
    deaths: 0,
  };
  world.players[id] = p;
  spawn(world, p);
  return p;
}

export function removePlayer(world, id) {
  delete world.players[id];
}

// Etenee simulaatiota yhden tickin. inputs: id -> syöte. Palauttaa tapahtumat (osumat, tapot)
// efektejä ja tapposyötettä varten.
export function step(world, inputs, dt) {
  const events = [];
  world.time += dt;

  for (const p of Object.values(world.players)) {
    p.px = p.x;
    p.py = p.y;

    if (!p.alive) {
      p.respawnTimer -= dt;
      if (p.respawnTimer <= 0) {
        spawn(world, p);
        events.push({ type: 'spawn', id: p.id });
      }
      continue;
    }

    const input = inputs[p.id] || EMPTY_INPUT;
    movePlayer(p, input, dt);

    p.aim = input.aim;
    p.cooldown -= dt;
    if (input.shoot && p.cooldown <= 0) {
      p.cooldown = FIRE_COOLDOWN;
      fire(world, p);
    }
  }

  stepBullets(world, dt, events);
  return events;
}

// Exportattu, koska liittyjä ennustaa oman liikkeensä samalla koodilla.
export function movePlayer(p, input, dt) {
  let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (dx !== 0 && dy !== 0) {
    dx *= Math.SQRT1_2;
    dy *= Math.SQRT1_2;
  }
  p.x += dx * PLAYER_SPEED * dt;
  p.y += dy * PLAYER_SPEED * dt;

  for (const r of OBSTACLES) pushCircleOutOfRect(p, PLAYER_RADIUS, r);
  p.x = clamp(p.x, PLAYER_RADIUS, ARENA_W - PLAYER_RADIUS);
  p.y = clamp(p.y, PLAYER_RADIUS, ARENA_H - PLAYER_RADIUS);
}

function fire(world, p) {
  const dirX = Math.cos(p.aim);
  const dirY = Math.sin(p.aim);
  const muzzle = PLAYER_RADIUS + 6;
  const x = p.x + dirX * muzzle;
  const y = p.y + dirY * muzzle;
  world.bullets.push({
    id: world.nextBulletId++,
    owner: p.id,
    x, y, px: x, py: y,
    vx: dirX * BULLET_SPEED,
    vy: dirY * BULLET_SPEED,
    life: BULLET_LIFE,
  });
}

function stepBullets(world, dt, events) {
  const players = Object.values(world.players);
  const hitRadius = PLAYER_RADIUS + BULLET_RADIUS;

  world.bullets = world.bullets.filter((b) => {
    b.px = b.x;
    b.py = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;

    if (b.life <= 0) return false;
    if (b.x < 0 || b.y < 0 || b.x > ARENA_W || b.y > ARENA_H) return false;
    for (const r of OBSTACLES) {
      if (pointInRect(b.x, b.y, r, BULLET_RADIUS)) {
        events.push({ type: 'wall', x: b.x, y: b.y });
        return false;
      }
    }

    for (const p of players) {
      if (!p.alive || p.id === b.owner) continue;
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      if (dx * dx + dy * dy > hitRadius * hitRadius) continue;

      p.hp -= BULLET_DAMAGE;
      events.push({ type: 'hit', x: b.x, y: b.y, target: p.id, by: b.owner });
      if (p.hp <= 0) kill(world, p, b.owner, events);
      return false;
    }
    return true;
  });
}

function kill(world, victim, killerId, events) {
  victim.alive = false;
  victim.hp = 0;
  victim.deaths++;
  victim.respawnTimer = RESPAWN_TIME;
  const killer = world.players[killerId];
  if (killer) killer.kills++;
  events.push({ type: 'kill', x: victim.x, y: victim.y, victim: victim.id, killer: killerId });
}

// Etsii satunnaisen paikan, joka ei ole esteen sisällä eikä liian lähellä muita.
function spawn(world, p) {
  const others = Object.values(world.players).filter((o) => o !== p && o.alive);
  let best = null;
  let bestDist = -1;
  for (let i = 0; i < 40; i++) {
    const x = PLAYER_RADIUS + Math.random() * (ARENA_W - 2 * PLAYER_RADIUS);
    const y = PLAYER_RADIUS + Math.random() * (ARENA_H - 2 * PLAYER_RADIUS);
    if (OBSTACLES.some((r) => pointInRect(x, y, r, PLAYER_RADIUS + 4))) continue;
    let nearest = Infinity;
    for (const o of others) nearest = Math.min(nearest, Math.hypot(o.x - x, o.y - y));
    if (nearest > bestDist) {
      bestDist = nearest;
      best = { x, y };
    }
  }
  best = best || { x: ARENA_W / 2, y: 60 };

  p.x = p.px = best.x;
  p.y = p.py = best.y;
  p.hp = PLAYER_HP;
  p.alive = true;
  p.cooldown = 0;
  p.respawnTimer = 0;
}

// --- Geometria ---

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function pointInRect(x, y, r, pad = 0) {
  return x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;
}

function pushCircleOutOfRect(c, radius, r) {
  const nx = clamp(c.x, r.x, r.x + r.w);
  const ny = clamp(c.y, r.y, r.y + r.h);
  const dx = c.x - nx;
  const dy = c.y - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= radius * radius) return;

  if (d2 > 0) {
    const d = Math.sqrt(d2);
    c.x = nx + (dx / d) * radius;
    c.y = ny + (dy / d) * radius;
    return;
  }
  // Keskipiste esteen sisällä: työnnetään lähimmän reunan yli.
  const left = c.x - r.x;
  const right = r.x + r.w - c.x;
  const top = c.y - r.y;
  const bottom = r.y + r.h - c.y;
  const m = Math.min(left, right, top, bottom);
  if (m === left) c.x = r.x - radius;
  else if (m === right) c.x = r.x + r.w + radius;
  else if (m === top) c.y = r.y - radius;
  else c.y = r.y + r.h + radius;
}

// Onko kahden pisteen välillä esteetöntä? (botit käyttävät)
export function lineOfSight(x1, y1, x2, y2) {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.ceil(dist / 8);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    if (OBSTACLES.some((r) => pointInRect(x, y, r))) return false;
  }
  return true;
}
