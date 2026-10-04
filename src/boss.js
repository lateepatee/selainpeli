// Lyhtymies: satunnaisessa erässä yllättävä bossi. Ajetaan vain hostilla osana simulaatiota.
// Bossin ollessa elossa on aselepo: pelaajat eivät voi vahingoittaa toisiaan (game.js).
//
// Tilat (boss.state):
//   emerge    kiipeää ikkunasta, ei voi vahingoittaa
//   chase     jahtaa lähintä pelaajaa ja lyö lähietäisyydeltä (joka kolmas isku raskas)
//   leapWind  valmistautuu hyppyyn: kohde merkitty maahan punaisella ympyrällä
//   leap      lentää kohteeseen, laskeutuessa isku alueelle
//   counter   torjunta: pyörii, luodit kimpoavat, lopuksi isku ympärille
// Puolessa HP:ssa bossi raivostuu: nopeampi, lyö tiheämmin ja kutsuu zombeja.

import { ARENA_W, ARENA_H, OBSTACLES, WINDOWS, PLAYER_RADIUS } from './constants.js';
import { clamp, pushCircleOutOfRect, lineOfSight } from './geometry.js';
import { flowDirection, spawnZombie, zombieLevel } from './zombies.js';

export const BOSS_NAME = 'Lyhtymies';
export const BOSS_NAME_OBJECT = 'Lyhtymiehen'; // "X kaatoi Lyhtymiehen"
export const BOSS_RADIUS = 26;
export const BOSS_CHANCE = 0.3;         // todennäköisyys per erä ...
export const BOSS_MIN_ROUND = 3;        // ... tästä erästä alkaen
export const BOSS_SPAWN_TIME = 15;      // s erän alusta
export const BOSS_KILL_MONEY = 1000;    // viimeisen iskun tekijälle
export const BOSS_SHARE_MONEY = 800;    // jaetaan muille vahinkoa tehneille osuuksien mukaan
export const BOSS_KILL_POINTS = 2;

// Neljällä pelaajalla 4000 HP: noin puolen minuutin taistelu.
const HP_BASE = 1200;
const HP_PER_PLAYER = 700;
const SPEED = 125;
const RAGE_SPEED = 165;                 // raivossa, edelleen hitaampi kuin pelaaja (220)
const RAGE_MELEE_COOLDOWN = 0.75;
const RAGE_ZOMBIES = 6;                 // raivostuessa kutsutut zombit
const EMERGE_TIME = 1.2;
const MELEE_REACH = 14;                 // lyöntietäisyys kosketuksen lisäksi
const MELEE_DAMAGE = 25;
const MELEE_HEAVY = 40;                 // joka kolmas isku
const MELEE_COOLDOWN = 1.0;
const LEAP_MIN = 150;
const LEAP_MAX = 550;
const LEAP_WIND = 0.7;                  // varoitusaika
const LEAP_TIME = 0.35;                 // lento
const LEAP_RADIUS = 75;
const LEAP_DAMAGE = 35;
const LEAP_COOLDOWN = 4.5;
const COUNTER_TIME = 2;
const COUNTER_RADIUS = 130;
const COUNTER_DAMAGE = 40;
const COUNTER_COOLDOWN = 12;

export function createBoss(world, alivePlayers) {
  // Ikkuna mahdollisimman kaukana pelaajista
  let win = WINDOWS[0];
  let best = -1;
  for (const w of WINDOWS) {
    const d = Math.min(...alivePlayers.map((p) => Math.hypot(p.x - w.x, p.y - w.y)));
    if (d > best) {
      best = d;
      win = w;
    }
  }
  const inset = BOSS_RADIUS + 2;
  const x = win.side === 'left' ? inset : win.side === 'right' ? ARENA_W - inset : win.x;
  const y = win.side === 'top' ? inset : win.side === 'bottom' ? ARENA_H - inset : win.y;
  const maxHp = HP_BASE + HP_PER_PLAYER * alivePlayers.length;
  return {
    x, y, px: x, py: y, angle: 0,
    hp: maxHp, maxHp,
    state: 'emerge', timer: EMERGE_TIME,
    meleeCd: 0, hits: 0,
    leapCd: 3, counterCd: 8,
    fromX: x, fromY: y, tx: x, ty: y,   // hypyn lähtö ja kohde
    damageBy: {},                        // pelaaja-id -> tehty vahinko
    enraged: false,
  };
}

// damagePlayer(p, amount, events) tulee game.js:stä.
export function stepBoss(world, dt, events, damagePlayer) {
  const b = world.boss;
  if (!b) return;
  b.px = b.x;
  b.py = b.y;
  if (world.phase !== 'playing') return;

  const alive = Object.values(world.players).filter((p) => p.alive);
  if (alive.length === 0) return;
  b.timer -= dt;
  b.meleeCd -= dt;

  // Raivo puolessa HP:ssa: kutsuu zombeja ikkunoista.
  if (!b.enraged && b.hp <= b.maxHp / 2) {
    b.enraged = true;
    events.push({ type: 'bossRage', x: b.x, y: b.y });
    const level = zombieLevel(world);
    for (let i = 0; i < RAGE_ZOMBIES; i++) {
      spawnZombie(world, alive, level);
      const z = world.zombies[world.zombies.length - 1];
      events.push({ type: 'zemerge', x: z.x, y: z.y });
    }
  }
  const speed = b.enraged ? RAGE_SPEED : SPEED;
  b.leapCd -= dt;
  b.counterCd -= dt;

  let target = alive[0];
  let targetDist = Infinity;
  for (const p of alive) {
    const d = Math.hypot(p.x - b.x, p.y - b.y);
    if (d < targetDist) {
      target = p;
      targetDist = d;
    }
  }

  switch (b.state) {
    case 'emerge':
      if (b.timer <= 0) b.state = 'chase';
      return;

    case 'leapWind':
      b.angle = Math.atan2(b.ty - b.y, b.tx - b.x);
      if (b.timer <= 0) {
        b.state = 'leap';
        b.timer = LEAP_TIME;
        b.fromX = b.x;
        b.fromY = b.y;
      }
      return;

    case 'leap': {
      const t = 1 - Math.max(0, b.timer) / LEAP_TIME;
      b.x = b.fromX + (b.tx - b.fromX) * t;
      b.y = b.fromY + (b.ty - b.fromY) * t;
      if (b.timer <= 0) {
        b.x = b.tx;
        b.y = b.ty;
        collide(b);
        events.push({ type: 'bossLand', x: b.x, y: b.y, r: LEAP_RADIUS });
        for (const p of alive) {
          if (Math.hypot(p.x - b.x, p.y - b.y) < LEAP_RADIUS + PLAYER_RADIUS) damagePlayer(p, LEAP_DAMAGE, events);
        }
        b.state = 'chase';
        b.leapCd = LEAP_COOLDOWN;
        b.meleeCd = 0.6;
      }
      return;
    }

    case 'counter':
      b.angle += dt * 14;
      moveToward(b, target, speed * 0.5, dt);
      pushOutOfPlayers(b, alive);
      if (b.timer <= 0) {
        events.push({ type: 'bossCounter', x: b.x, y: b.y, r: COUNTER_RADIUS });
        for (const p of alive) {
          if (Math.hypot(p.x - b.x, p.y - b.y) < COUNTER_RADIUS + PLAYER_RADIUS) damagePlayer(p, COUNTER_DAMAGE, events);
        }
        b.state = 'chase';
        b.counterCd = COUNTER_COOLDOWN;
      }
      return;
  }

  // chase: valitaan kyky tai jahdataan
  const seesTarget = lineOfSight(b.x, b.y, target.x, target.y);
  if (b.counterCd <= 0 && targetDist < 260 && seesTarget) {
    b.state = 'counter';
    b.timer = COUNTER_TIME;
    events.push({ type: 'bossCounterStart', x: b.x, y: b.y });
    return;
  }
  if (b.leapCd <= 0 && seesTarget && targetDist > LEAP_MIN && targetDist < LEAP_MAX) {
    b.state = 'leapWind';
    b.timer = LEAP_WIND;
    b.tx = clamp(target.x, BOSS_RADIUS, ARENA_W - BOSS_RADIUS);
    b.ty = clamp(target.y, BOSS_RADIUS, ARENA_H - BOSS_RADIUS);
    events.push({ type: 'bossLeapWind', x: b.tx, y: b.ty, r: LEAP_RADIUS });
    return;
  }

  const touch = BOSS_RADIUS + PLAYER_RADIUS;
  if (targetDist > touch + 2) moveToward(b, target, speed, dt);
  else b.angle = Math.atan2(target.y - b.y, target.x - b.x);

  pushOutOfPlayers(b, alive);

  if (b.meleeCd <= 0 && targetDist < touch + MELEE_REACH) {
    b.hits++;
    const heavy = b.hits % 3 === 0;
    b.meleeCd = b.enraged ? RAGE_MELEE_COOLDOWN : MELEE_COOLDOWN;
    events.push({ type: 'bossHit', x: target.x, y: target.y, target: target.id, heavy });
    damagePlayer(target, heavy ? MELEE_HEAVY : MELEE_DAMAGE, events);
  }
}

// Ottaako bossi vahinkoa? Torjunnan ja ikkunasta kiipeämisen aikana ei.
export function bossVulnerable(b) {
  return b.state !== 'counter' && b.state !== 'emerge';
}

function moveToward(b, target, speed, dt) {
  const near = Math.hypot(target.x - b.x, target.y - b.y) < 180 && lineOfSight(b.x, b.y, target.x, target.y);
  const dir = near ? { x: target.x - b.x, y: target.y - b.y } : flowDirection(b) || { x: target.x - b.x, y: target.y - b.y };
  const len = Math.hypot(dir.x, dir.y);
  if (len < 0.001) return;
  b.x += (dir.x / len) * speed * dt;
  b.y += (dir.y / len) * speed * dt;
  if (b.state !== 'counter') b.angle = Math.atan2(dir.y, dir.x);
  collide(b);
}

// Bossi väistää pelaajia eikä toisin päin, jotta liittyjän liikkeen ennuste pysyy oikeana.
function pushOutOfPlayers(b, alive) {
  const touch = BOSS_RADIUS + PLAYER_RADIUS;
  for (const p of alive) {
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < touch && d > 0.001) {
      b.x = p.x + (dx / d) * touch;
      b.y = p.y + (dy / d) * touch;
    }
  }
}

function collide(b) {
  for (const o of OBSTACLES) pushCircleOutOfRect(b, BOSS_RADIUS, o);
  b.x = clamp(b.x, BOSS_RADIUS, ARENA_W - BOSS_RADIUS);
  b.y = clamp(b.y, BOSS_RADIUS, ARENA_H - BOSS_RADIUS);
}
