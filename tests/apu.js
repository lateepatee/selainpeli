// Testien yhteiset apufunktiot. Ei testitiedosto (nimi ei pääty .test.js), joten node --test ei aja tätä.

import { TICK, PLAYER_RADIUS, ARENA_W, ARENA_H, OBSTACLES } from '../src/constants.js';
import { createWorld, addPlayer, startMatch, step } from '../src/game.js';
import { pointInRect } from '../src/geometry.js';

// Siemenellinen satunnaislukugeneraattori (mulberry32). Peli lukee satunnaisuuden suoraan
// Math.randomista, joten testit korvaavat sen tällä, jotta tulos toistuu.
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedRandom(seed) {
  Math.random = seededRandom(seed);
}

// Askeleet sekunneista, jotta testit eivät riipu tickinopeudesta.
export function ticks(seconds) {
  return Math.ceil(seconds / TICK);
}

// Ajaa simulaatiota tyhjillä syötteillä. Zombit pidetään poissa, jotta sääntötestit eivät riipu niistä.
export function run(world, seconds, inputs = {}) {
  const events = [];
  for (let i = 0; i < ticks(seconds); i++) {
    world.zombieTimer = Infinity;
    events.push(...step(world, inputs, TICK));
  }
  return events;
}

// Ajaa kunnes ehto täyttyy (tai aikaraja tulee vastaan). Palauttaa kertyneet tapahtumat.
export function runUntil(world, cond, maxSeconds = 60, inputs = {}) {
  const events = [];
  for (let i = 0; i < ticks(maxSeconds) && !cond(world); i++) {
    world.zombieTimer = Infinity;
    events.push(...step(world, inputs, TICK));
  }
  return events;
}

// Uusi ottelu annetuilla pelaajilla, lähtölaskenta ohitettu: erä on käynnissä.
export function playingMatch(ids = ['a', 'b', 'c']) {
  const world = createWorld();
  for (const id of ids) addPlayer(world, id, id.toUpperCase(), '#ffffff');
  if (!startMatch(world)) throw new Error('ottelu ei alkanut');
  runUntil(world, (w) => w.phase === 'playing', 10);
  if (world.phase !== 'playing') throw new Error(`vaihe ${world.phase}, odotettiin playing`);
  return world;
}

// Ammus suoraan uhrin kohdalle: kulkee pelin oman osumakäsittelyn kautta (stepBullets).
export function bulletAt(world, ownerId, target, extra = {}) {
  world.bullets.push({
    id: world.nextBulletId++,
    owner: ownerId,
    x: target.x, y: target.y, px: target.x, py: target.y,
    vx: 0, vy: 0,
    life: 1,
    damage: target.hp,
    splash: 0,
    splashDamage: 0,
    ...extra,
  });
}

// Tappaa pelaajan toisen pelaajan ammuksella yhden tickin aikana.
export function shoot(world, killerId, victimId) {
  bulletAt(world, killerId, world.players[victimId]);
  return run(world, TICK);
}

// Tappaa annetut pelaajat sumulla (ei tappajaa). Muut menettävät vain yhden tickin sumuvahingon.
export function fogKill(world, ids) {
  const zone = world.zone;
  const saved = { r0: zone.r0, elapsed: zone.elapsed };
  zone.r0 = 0;
  zone.elapsed = 0;
  for (const id of ids) world.players[id].hp = 1e-9;
  const events = run(world, TICK);
  zone.r0 = saved.r0;
  zone.elapsed = saved.elapsed;
  return events;
}

// Etsii nykyiseltä kentältä kohdan, jonka ympärillä on vähintään `clear` pikseliä tyhjää.
export function openSpot(clear) {
  for (let y = clear + PLAYER_RADIUS; y < ARENA_H - clear - PLAYER_RADIUS; y += 10) {
    for (let x = clear + PLAYER_RADIUS; x < ARENA_W - clear - PLAYER_RADIUS; x += 10) {
      if (!OBSTACLES.some((r) => pointInRect(x, y, r, clear + PLAYER_RADIUS))) return { x, y };
    }
  }
  throw new Error(`kentällä ei ole ${clear} px:n aukeaa`);
}
