// Pelin simulaatio. Ei piirtämistä, ei DOMia: tila sisään, syötteet sisään, uusi tila ulos.
// Moninpelissä host ajaa tätä ja lähettää tilan muille.
//
// Vaiheet (world.phase):
//   warmup    lämmittely: kuoleman jälkeen syntyy uudelleen, pisteitä ei lasketa
//   countdown erän alku: kaikki paikoillaan, ei voi liikkua eikä ampua
//   playing   erä käynnissä: ei uudelleensyntymistä, alue kutistuu
//   roundEnd  erän tulos näkyy hetken
//   gameOver  pelin voittaja näkyy hetken, sitten takaisin lämmittelyyn

import {
  ARENA_W, ARENA_H, OBSTACLES,
  PLAYER_RADIUS, PLAYER_SPEED, PLAYER_HP, RESPAWN_TIME,
  BULLET_SPEED, BULLET_RADIUS, BULLET_DAMAGE, BULLET_LIFE, FIRE_COOLDOWN,
  TARGET_SCORE, WIN_POINTS, KILL_POINTS, COUNTDOWN_TIME, ROUND_END_TIME, GAME_OVER_TIME,
  ZONE_DELAY, ZONE_SHRINK_TIME, ZONE_MIN_R, ZONE_DPS, ZONE_DPS_FINAL,
} from './constants.js';

export const EMPTY_INPUT = { up: false, down: false, left: false, right: false, aim: 0, shoot: false };

export function createWorld() {
  return {
    time: 0,
    players: {},   // id -> pelaaja
    bullets: [],
    nextBulletId: 1,
    phase: 'warmup',
    phaseTimer: 0,
    round: 0,
    zone: null,           // { x, y, r, r0, elapsed }
    roundWinner: null,    // id tai null (tasapeli)
    matchWinner: null,
  };
}

// Voiko tässä vaiheessa liikkua ja ampua?
export function canAct(phase) {
  return phase === 'warmup' || phase === 'playing';
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
    score: 0,
    wins: 0,
    killedBy: null,
  };
  world.players[id] = p;
  spawn(world, p);
  // Kesken pelin liittyvä katsoo seuraavaan erään asti.
  if (world.phase !== 'warmup') p.alive = false;
  return p;
}

export function removePlayer(world, id) {
  delete world.players[id];
}

// Host kutsuu tätä "Aloita peli" -napista. Palauttaa false, jos pelaajia on liian vähän.
export function startMatch(world) {
  if (Object.keys(world.players).length < 2) return false;
  for (const p of Object.values(world.players)) {
    p.score = 0;
    p.wins = 0;
    p.kills = 0;
    p.deaths = 0;
  }
  world.round = 0;
  world.matchWinner = null;
  startRound(world);
  return true;
}

function startRound(world) {
  world.round++;
  world.bullets = [];
  world.roundWinner = null;
  world.zone = createZone();
  world.phase = 'countdown';
  world.phaseTimer = COUNTDOWN_TIME;

  const players = Object.values(world.players);
  for (const p of players) p.alive = false;
  for (const p of players) {
    spawn(world, p);
    p.killedBy = null;
  }
}

function createZone() {
  // Keskipiste sellainen, että pienin ympyrä mahtuu areenalle.
  const m = ZONE_MIN_R + 40;
  const x = m + Math.random() * (ARENA_W - 2 * m);
  const y = m + Math.random() * (ARENA_H - 2 * m);
  // Aloitussäde kattaa koko areenan.
  const r0 = Math.max(Math.hypot(x, y), Math.hypot(ARENA_W - x, y), Math.hypot(x, ARENA_H - y), Math.hypot(ARENA_W - x, ARENA_H - y));
  return { x, y, r: r0, r0, elapsed: 0 };
}

// Etenee simulaatiota yhden tickin. inputs: id -> syöte. Palauttaa tapahtumat (osumat, tapot)
// efektejä ja tapposyötettä varten.
export function step(world, inputs, dt) {
  const events = [];
  world.time += dt;
  world.phaseTimer -= dt;
  const acting = canAct(world.phase);

  for (const p of Object.values(world.players)) {
    p.px = p.x;
    p.py = p.y;

    if (!p.alive) {
      if (world.phase === 'warmup') {
        p.respawnTimer -= dt;
        if (p.respawnTimer <= 0) {
          spawn(world, p);
          events.push({ type: 'spawn', id: p.id });
        }
      }
      continue;
    }

    const input = inputs[p.id] || EMPTY_INPUT;
    p.aim = input.aim;
    if (!acting) continue;

    movePlayer(p, input, dt);
    p.cooldown -= dt;
    if (input.shoot && p.cooldown <= 0) {
      p.cooldown = FIRE_COOLDOWN;
      fire(world, p);
    }
  }

  stepBullets(world, dt, events);

  if (world.phase === 'playing') {
    stepZone(world, dt, events);
    checkRoundEnd(world, events);
  }
  advancePhase(world, events);
  return events;
}

function advancePhase(world, events) {
  if (world.phaseTimer > 0) return;
  if (world.phase === 'countdown') {
    world.phase = 'playing';
    events.push({ type: 'roundStart', round: world.round });
  } else if (world.phase === 'roundEnd') {
    if (Object.keys(world.players).length >= 2) startRound(world);
    else toWarmup(world);
  } else if (world.phase === 'gameOver') {
    toWarmup(world);
  }
}

function toWarmup(world) {
  world.phase = 'warmup';
  world.zone = null;
  world.bullets = [];
  for (const p of Object.values(world.players)) {
    if (!p.alive) spawn(world, p);
  }
}

function stepZone(world, dt, events) {
  const z = world.zone;
  z.elapsed += dt;
  const shrink = Math.min(1, Math.max(0, (z.elapsed - ZONE_DELAY) / ZONE_SHRINK_TIME));
  z.r = z.r0 + (ZONE_MIN_R - z.r0) * shrink;
  const dps = shrink >= 1 ? ZONE_DPS_FINAL : ZONE_DPS;

  for (const p of Object.values(world.players)) {
    if (!p.alive || Math.hypot(p.x - z.x, p.y - z.y) <= z.r) continue;
    p.hp -= dps * dt;
    if (p.hp <= 0) kill(world, p, null, events);
  }
}

function checkRoundEnd(world, events) {
  const alive = Object.values(world.players).filter((p) => p.alive);
  if (alive.length > 1) return;

  const winner = alive[0] || null;
  world.roundWinner = winner ? winner.id : null;
  if (winner) {
    winner.score += WIN_POINTS;
    winner.wins++;
  }
  world.bullets = [];
  events.push({ type: 'roundEnd', winner: world.roundWinner });

  const ranked = Object.values(world.players).sort((a, b) => b.score - a.score);
  const top = ranked[0];
  if (top && top.score >= TARGET_SCORE && (!ranked[1] || top.score > ranked[1].score)) {
    world.phase = 'gameOver';
    world.phaseTimer = GAME_OVER_TIME;
    world.matchWinner = top.id;
    events.push({ type: 'gameOver', winner: top.id });
  } else {
    world.phase = 'roundEnd';
    world.phaseTimer = ROUND_END_TIME;
  }
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

// killerId null = alue tappoi.
function kill(world, victim, killerId, events) {
  victim.alive = false;
  victim.hp = 0;
  victim.deaths++;
  victim.respawnTimer = RESPAWN_TIME;
  victim.killedBy = killerId;
  const killer = killerId && world.players[killerId];
  if (killer) {
    killer.kills++;
    if (world.phase === 'playing') killer.score += KILL_POINTS;
  }
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
