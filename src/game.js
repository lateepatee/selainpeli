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
  PLAYER_RADIUS, PLAYER_SPEED, PLAYER_HP, RESPAWN_TIME, DASH_SPEED, DASH_TICKS, DASH_COOLDOWN_TICKS,
  BULLET_RADIUS,
  TARGET_SCORE, TARGET_SCORE_OPTIONS, WIN_POINTS, KILL_POINTS, COUNTDOWN_TIME, ROUND_END_TIME, GAME_OVER_TIME,
  ZONE_DELAY, ZONE_SHRINK_TIME, ZONE_MIN_R, ZONE_DPS, ZONE_DPS_FINAL, ZOMBIE_RADIUS,
} from './constants.js';
import { clamp, pointInRect, pushCircleOutOfRect } from './geometry.js';
import { stepZombies, BOSS_FIGHT_ZOMBIES } from './zombies.js';
import {
  createBoss, stepBoss, bossVulnerable, BOSS_RADIUS, BOSS_CHANCE, BOSS_MIN_ROUND, BOSS_SPAWN_TIME,
  BOSS_KILL_MONEY, BOSS_SHARE_MONEY, BOSS_KILL_POINTS,
} from './boss.js';
import { setMap, MAP_ID } from './map.js';
import { MAP_IDS } from './maps.js';
import {
  WEAPONS, START_MONEY, MONEY_CAP, MONEY_ZOMBIE_HIT, MONEY_ZOMBIE_KILL, MONEY_PLAYER_KILL, SWAP_TIME,
  BOX_PRICE, BOX_SPIN_TIME, BOX_TAKE_TIME, findInteractable, rollBoxWeapon,
  ARMOR_HP, RELOAD_PERK_MUL, RAPID_PERK_MUL, maxHpOf,
  POWERUPS, POWERUP_IDS, POWERUP_DROP_CHANCE, POWERUP_LIFE, POWERUP_PICKUP_RANGE,
  POWERUP_MAX_ON_FLOOR, POWERUP_WEIGHTS,
} from './weapons.js';

export const EMPTY_INPUT = {
  up: false, down: false, left: false, right: false, aim: 0, shoot: false,
  reload: false, interact: false, swap: false, dash: false,
};

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
    zombies: [],
    nextZombieId: 1,
    zombieTimer: 0,
    flowAt: 0,            // milloin zombien reitit lasketaan seuraavaksi
    box: idleBox(),
    mapId: MAP_ID,
    powerups: [],         // { id, type, x, y, life }
    nextPowerupId: 1,
    boss: null,           // boss.js
    bossPlanned: false,   // tuleeko tässä erässä bossi
    targetScore: TARGET_SCORE,
  };
}

function idleBox() {
  return { state: 'idle', timer: 0, owner: null, weapon: null };
}

// Voiko tässä vaiheessa liikkua ja ampua?
export function canAct(phase) {
  return phase === 'warmup' || phase === 'playing';
}

// look = { hat, pattern, face } (appearance.js). Väri tulee erikseen, koska host jakaa sen.
export function addPlayer(world, id, name, color, look = { hat: 0, pattern: 0, face: 0 }) {
  const p = {
    id, name, color, look,
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
    zombieKills: 0,
    killedBy: null,
    money: START_MONEY,
    slots: [null, null],   // { id, mag, reserve }
    cur: 0,
    reloadTimer: 0,
    prev: { reload: false, interact: false, swap: false }, // napin painallus = reuna
    perks: {},             // juodut juomat: { armor: true, ... }
    instaKill: 0,          // tehosteiden jäljellä oleva aika (s)
    doubleMoney: 0,
    dashTicks: 0,          // väistöä jäljellä (tickejä)
    dashCd: 0,             // väistön latautuminen (tickejä)
    dashHeld: false,
    dashX: 0,
    dashY: 0,
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

// Hostin aulassa valitsema pisteraja; vain sallitut arvot.
export function setTargetScore(world, value) {
  world.targetScore = TARGET_SCORE_OPTIONS.includes(value) ? value : TARGET_SCORE;
}

// Aselepo: Lyhtymiehen ollessa elossa pelaajat eivät voi vahingoittaa toisiaan.
export function truceActive(world) {
  return !!world.boss;
}

// Host kutsuu tätä "Aloita peli" -napista. Palauttaa false, jos pelaajia on liian vähän.
export function startMatch(world) {
  if (Object.keys(world.players).length < 2) return false;
  for (const p of Object.values(world.players)) {
    p.score = 0;
    p.wins = 0;
    p.kills = 0;
    p.deaths = 0;
    p.zombieKills = 0;
  }
  world.round = 0;
  world.matchWinner = null;
  startRound(world);
  return true;
}

// Jokainen erä pelataan eri kentällä kuin edellinen.
function nextMap(world) {
  const options = MAP_IDS.filter((id) => id !== world.mapId);
  const id = options[Math.floor(Math.random() * options.length)];
  setMap(id);
  world.mapId = id;
}

function startRound(world) {
  world.round++;
  nextMap(world);
  world.bullets = [];
  world.zombies = [];
  world.zombieTimer = 2;
  world.box = idleBox();
  world.powerups = [];
  world.boss = null;
  // Bossi yllättää satunnaisessa erässä; pelaajat eivät tiedä etukäteen.
  world.bossPlanned = world.round >= BOSS_MIN_ROUND && Math.random() < BOSS_CHANCE;
  world.roundWinner = null;
  world.zone = createZone();
  world.phase = 'countdown';
  world.phaseTimer = COUNTDOWN_TIME;

  const players = Object.values(world.players);
  for (const p of players) p.alive = false;
  for (const p of players) {
    // Raha ja juomat säilyvät pelin sisällä erästä toiseen, aseet aloitetaan alusta.
    spawn(world, p, world.round > 1);
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
    if (input.skip) continue;
    const pressed = (k) => input[k] && !p.prev[k];
    const swap = pressed('swap');
    const reload = pressed('reload');
    const interactNow = pressed('interact');
    p.prev = { reload: !!input.reload, interact: !!input.interact, swap: !!input.swap };
    if (!acting) continue;

    movePlayer(p, input, dt);
    if (p.dashCd === DASH_COOLDOWN_TICKS) events.push({ type: 'dash', x: p.x, y: p.y, by: p.id });
    p.instaKill = Math.max(0, p.instaKill - dt);
    p.doubleMoney = Math.max(0, p.doubleMoney - dt);
    if (swap) swapWeapon(p);
    if (reload) startReload(p, events);
    if (interactNow) interact(world, p, events);
    updateWeapon(world, p, input, dt, events);
  }

  stepBox(world, dt);
  stepPowerups(world, dt, events);

  stepZombies(world, dt, events, (p, amount, ev) => damagePlayer(world, p, amount, null, 'zombie', ev));
  maybeSpawnBoss(world, events);
  stepBoss(world, dt, events, (p, amount, ev) => damagePlayer(world, p, amount, null, 'boss', ev));
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
  world.zombies = [];
  world.box = idleBox();
  world.powerups = [];
  world.boss = null;
  world.bossPlanned = false;
  for (const p of Object.values(world.players)) {
    if (!p.alive) spawn(world, p);
  }
}

function stepZone(world, dt, events) {
  const z = world.zone;
  // Aselevon aikana sumu ei sulkeudu, jotta bossin ehtii kaataa.
  if (!truceActive(world)) z.elapsed += dt;
  const shrink = Math.min(1, Math.max(0, (z.elapsed - ZONE_DELAY) / ZONE_SHRINK_TIME));
  z.r = z.r0 + (ZONE_MIN_R - z.r0) * shrink;
  const dps = shrink >= 1 ? ZONE_DPS_FINAL : ZONE_DPS;

  for (const p of Object.values(world.players)) {
    if (!p.alive || Math.hypot(p.x - z.x, p.y - z.y) <= z.r) continue;
    damagePlayer(world, p, dps * dt, null, 'fog', events);
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
  if (top && top.score >= world.targetScore && (!ranked[1] || top.score > ranked[1].score)) {
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

  // Väistö: lyhyt syöksy liikesuuntaan (tai tähtäyssuuntaan paikallaan).
  p.dashCd = Math.max(0, (p.dashCd || 0) - 1);
  if (input.dash && !p.dashHeld && p.dashCd === 0) {
    if (dx === 0 && dy === 0) {
      dx = Math.cos(input.aim);
      dy = Math.sin(input.aim);
    }
    p.dashX = dx;
    p.dashY = dy;
    p.dashTicks = DASH_TICKS;
    p.dashCd = DASH_COOLDOWN_TICKS;
  }
  p.dashHeld = !!input.dash;
  let speed = PLAYER_SPEED;
  if (p.dashTicks > 0) {
    dx = p.dashX;
    dy = p.dashY;
    speed = DASH_SPEED;
    p.dashTicks--;
  }

  p.x += dx * speed * dt;
  p.y += dy * speed * dt;

  for (const r of OBSTACLES) pushCircleOutOfRect(p, PLAYER_RADIUS, r);
  p.x = clamp(p.x, PLAYER_RADIUS, ARENA_W - PLAYER_RADIUS);
  p.y = clamp(p.y, PLAYER_RADIUS, ARENA_H - PLAYER_RADIUS);
}

// --- Aseet ---

function giveWeapon(p, id) {
  const w = WEAPONS[id];
  const slot = { id, mag: w.mag, reserve: w.reserve };
  if (!p.slots[1]) {
    p.slots[1] = slot;
    p.cur = 1;
  } else {
    p.slots[p.cur] = slot;
  }
  p.reloadTimer = 0;
  p.cooldown = SWAP_TIME;
}

function swapWeapon(p) {
  if (!p.slots[1]) return;
  p.cur = 1 - p.cur;
  p.reloadTimer = 0;
  p.cooldown = Math.max(p.cooldown, SWAP_TIME);
}

function startReload(p, events) {
  const slot = p.slots[p.cur];
  const w = WEAPONS[slot.id];
  if (p.reloadTimer > 0 || slot.mag >= w.mag || slot.reserve <= 0) return;
  p.reloadTimer = w.reload * (p.perks.reload ? RELOAD_PERK_MUL : 1);
  events.push({ type: 'reload', x: p.x, y: p.y, by: p.id });
}

function updateWeapon(world, p, input, dt, events) {
  p.cooldown -= dt;
  const slot = p.slots[p.cur];
  const w = WEAPONS[slot.id];

  if (p.reloadTimer > 0) {
    p.reloadTimer -= dt;
    if (p.reloadTimer <= 0) {
      const take = Math.min(w.mag - slot.mag, slot.reserve);
      slot.mag += take;
      slot.reserve -= take;
      p.reloadTimer = 0;
    }
    return;
  }
  if (slot.mag <= 0) {
    startReload(p, events);
    return;
  }
  if (input.shoot && p.cooldown <= 0) {
    p.cooldown = w.cooldown * (p.perks.rapid ? RAPID_PERK_MUL : 1);
    slot.mag--;
    fire(world, p, w, slot.id, events);
  }
}

function fire(world, p, w, weaponId, events) {
  const muzzle = PLAYER_RADIUS + 6;
  const x = p.x + Math.cos(p.aim) * muzzle;
  const y = p.y + Math.sin(p.aim) * muzzle;
  events.push({ type: 'shot', x, y, w: weaponId, by: p.id });
  for (let i = 0; i < w.pellets; i++) {
    const a = p.aim + (Math.random() - 0.5) * 2 * w.spread;
    world.bullets.push({
      id: world.nextBulletId++,
      owner: p.id,
      x, y, px: x, py: y,
      vx: Math.cos(a) * w.speed,
      vy: Math.sin(a) * w.speed,
      life: w.life,
      damage: w.damage,
      splash: w.splash || 0,
      splashDamage: w.splashDamage || 0,
    });
  }
}

// --- Ostaminen ja arpalaatikko ---

function interact(world, p, events) {
  const it = findInteractable(world, p);
  if (!it || p.money < it.price) return;

  if (it.kind === 'wall') {
    p.money -= it.price;
    giveWeapon(p, it.buy.weapon);
    events.push({ type: 'buy', id: p.id });
  } else if (it.kind === 'ammo') {
    const slot = p.slots.find((sl) => sl?.id === it.buy.weapon);
    const w = WEAPONS[slot.id];
    if (slot.mag >= w.mag && slot.reserve >= w.reserve) return;
    p.money -= it.price;
    slot.mag = w.mag;
    slot.reserve = w.reserve;
    events.push({ type: 'buy', id: p.id });
  } else if (it.kind === 'perk') {
    p.money -= it.price;
    p.perks[it.perk] = true;
    if (it.perk === 'armor') p.hp += ARMOR_HP - PLAYER_HP;
    events.push({ type: 'perk', by: p.id, perk: it.perk, x: p.x, y: p.y });
  } else if (it.kind === 'box') {
    p.money -= BOX_PRICE;
    world.box = { state: 'spinning', timer: BOX_SPIN_TIME, owner: p.id, weapon: rollBoxWeapon(p) };
    events.push({ type: 'boxOpen', id: p.id });
  } else if (it.kind === 'take') {
    giveWeapon(p, world.box.weapon);
    world.box = idleBox();
    events.push({ type: 'buy', id: p.id });
  }
}

function stepBox(world, dt) {
  const box = world.box;
  if (box.state === 'idle') return;
  box.timer -= dt;
  const owner = world.players[box.owner];
  if (!owner?.alive) {
    world.box = idleBox();
  } else if (box.state === 'spinning' && box.timer <= 0) {
    box.state = 'ready';
    box.timer = BOX_TAKE_TIME;
  } else if (box.state === 'ready' && box.timer <= 0) {
    world.box = idleBox();
  }
}

// --- Ammukset ---

function stepBullets(world, dt, events) {
  const players = Object.values(world.players);
  const hitRadius = PLAYER_RADIUS + BULLET_RADIUS;
  const zombieHitRadius = ZOMBIE_RADIUS + BULLET_RADIUS;

  world.bullets = world.bullets.filter((b) => {
    b.px = b.x;
    b.py = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;

    if (b.life <= 0) return explodeIfSplash(world, b, events);
    if (b.x < 0 || b.y < 0 || b.x > ARENA_W || b.y > ARENA_H) return explodeIfSplash(world, b, events);
    for (const r of OBSTACLES) {
      if (pointInRect(b.x, b.y, r, BULLET_RADIUS)) {
        events.push({ type: 'wall', x: b.x, y: b.y });
        return explodeIfSplash(world, b, events);
      }
    }

    for (const p of players) {
      if (!p.alive || p.id === b.owner || truceActive(world)) continue;
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      if (dx * dx + dy * dy > hitRadius * hitRadius) continue;

      events.push({ type: 'hit', x: b.x, y: b.y, target: p.id, by: b.owner });
      damagePlayer(world, p, b.damage, b.owner, 'player', events);
      return explodeIfSplash(world, b, events);
    }

    const boss = world.boss;
    if (boss && boss.state !== 'leap' && boss.hp > 0
      && Math.hypot(boss.x - b.x, boss.y - b.y) < BOSS_RADIUS + BULLET_RADIUS) {
      if (bossVulnerable(boss)) {
        events.push({ type: 'bosshurt', x: b.x, y: b.y, by: b.owner });
        damageBoss(world, b.damage, b.owner, events);
        return explodeIfSplash(world, b, events);
      }
      // Torjunta: luoti kimpoaa (räjähtävä ammus ei räjähdä)
      events.push({ type: 'deflect', x: b.x, y: b.y });
      return false;
    }

    for (const z of world.zombies) {
      if (z.hp <= 0) continue;
      const dx = z.x - b.x;
      const dy = z.y - b.y;
      if (dx * dx + dy * dy > zombieHitRadius * zombieHitRadius) continue;

      events.push({ type: 'zhit', x: b.x, y: b.y, by: b.owner });
      damageZombie(world, z, b.damage, b.owner, events);
      return explodeIfSplash(world, b, events);
    }
    return true;
  });
  world.zombies = world.zombies.filter((z) => z.hp > 0);
}

// Palauttaa aina false (ammus poistuu). Räjähtävä ammus vahingoittaa ensin ympäristöä.
function explodeIfSplash(world, b, events) {
  if (!b.splash) return false;
  events.push({ type: 'blast', x: b.x, y: b.y, r: b.splash });
  for (const z of world.zombies) {
    if (z.hp > 0 && Math.hypot(z.x - b.x, z.y - b.y) < b.splash + ZOMBIE_RADIUS) {
      damageZombie(world, z, b.splashDamage, b.owner, events);
    }
  }
  for (const p of Object.values(world.players)) {
    if (p.alive && p.id !== b.owner && !truceActive(world) && Math.hypot(p.x - b.x, p.y - b.y) < b.splash + PLAYER_RADIUS) {
      damagePlayer(world, p, b.splashDamage, b.owner, 'player', events);
    }
  }
  const boss = world.boss;
  if (boss && bossVulnerable(boss) && boss.state !== 'leap'
    && Math.hypot(boss.x - b.x, boss.y - b.y) < b.splash + BOSS_RADIUS) {
    damageBoss(world, b.splashDamage, b.owner, events);
  }
  return false;
}

// --- Bossi ---

function maybeSpawnBoss(world, events) {
  if (!world.bossPlanned || world.boss || world.phase !== 'playing') return;
  if (!world.zone || world.zone.elapsed < BOSS_SPAWN_TIME) return;
  const alive = Object.values(world.players).filter((p) => p.alive);
  if (alive.length < 2) return;
  world.bossPlanned = false;
  world.boss = createBoss(world, alive);
  events.push({ type: 'bossSpawn', x: world.boss.x, y: world.boss.y });

  // Bossin ilmestyessä ylimääräiset zombit hajoavat savuksi: lähimmät jäävät, kauimmat lähtevät.
  const nearest = (z) => Math.min(...alive.map((p) => Math.hypot(p.x - z.x, p.y - z.y)));
  world.zombies.sort((a, b) => nearest(a) - nearest(b));
  for (const z of world.zombies.splice(BOSS_FIGHT_ZOMBIES)) events.push({ type: 'zflee', x: z.x, y: z.y });
}

// Kertaisku ei tehoa bossiin. Viimeinen isku palkitaan, muut saavat osuutensa rahasta.
function damageBoss(world, amount, ownerId, events) {
  const boss = world.boss;
  if (!boss || boss.hp <= 0) return;
  const dealt = Math.min(amount, boss.hp);
  boss.hp -= amount;
  if (world.players[ownerId]) boss.damageBy[ownerId] = (boss.damageBy[ownerId] || 0) + dealt;
  if (boss.hp > 0) return;

  const killer = world.players[ownerId];
  if (killer) {
    addMoney(killer, BOSS_KILL_MONEY);
    if (world.phase === 'playing') killer.score += BOSS_KILL_POINTS;
  }
  const others = Object.entries(boss.damageBy).filter(([id]) => id !== ownerId && world.players[id]);
  const total = others.reduce((sum, [, d]) => sum + d, 0);
  for (const [id, d] of others) addMoney(world.players[id], Math.round((BOSS_SHARE_MONEY * d) / total));
  events.push({ type: 'bossKill', x: boss.x, y: boss.y, by: ownerId });
  // Bossista putoaa aina tehoste, vaikka lattialla olisi jo maksimimäärä.
  const type = POWERUP_IDS[Math.floor(Math.random() * POWERUP_IDS.length)];
  world.powerups.push({ id: world.nextPowerupId++, type, x: boss.x, y: boss.y, life: POWERUP_LIFE });
  world.boss = null;
}

function damageZombie(world, z, amount, ownerId, events) {
  const shooter = world.players[ownerId];
  if (shooter?.instaKill > 0) amount = Math.max(amount, z.hp);
  z.hp -= amount;
  if (shooter) addMoney(shooter, MONEY_ZOMBIE_HIT);
  if (z.hp <= 0) {
    if (shooter) {
      shooter.zombieKills++;
      addMoney(shooter, MONEY_ZOMBIE_KILL);
    }
    events.push({ type: 'zkill', x: z.x, y: z.y, by: ownerId });
    if (Math.random() < POWERUP_DROP_CHANCE) dropPowerup(world, z.x, z.y);
  }
}

// Kaikki ansaittu raha kulkee tätä kautta. Katon yli menevä raha häviää.
function addMoney(p, amount) {
  p.money = Math.min(MONEY_CAP, p.money + (p.doubleMoney > 0 ? amount * 2 : amount));
}

// --- Tehosteet ---

function dropPowerup(world, x, y) {
  if (world.powerups.length >= POWERUP_MAX_ON_FLOOR) return;
  const total = POWERUP_IDS.reduce((sum, id) => sum + POWERUP_WEIGHTS[id], 0);
  let r = Math.random() * total;
  const type = POWERUP_IDS.find((id) => (r -= POWERUP_WEIGHTS[id]) <= 0) || POWERUP_IDS[0];
  world.powerups.push({ id: world.nextPowerupId++, type, x, y, life: POWERUP_LIFE });
}

function stepPowerups(world, dt, events) {
  const players = Object.values(world.players).filter((p) => p.alive);
  world.powerups = world.powerups.filter((pu) => {
    pu.life -= dt;
    if (pu.life <= 0) return false;
    const p = players.find((pl) => Math.hypot(pl.x - pu.x, pl.y - pu.y) < POWERUP_PICKUP_RANGE);
    if (!p) return true;
    applyPowerup(world, p, pu.type, events);
    events.push({ type: 'pickup', kind: pu.type, by: p.id, x: pu.x, y: pu.y });
    return false;
  });
}

function applyPowerup(world, p, type, events) {
  const def = POWERUPS[type];
  if (type === 'ammo') {
    for (const slot of p.slots) {
      if (!slot) continue;
      slot.mag = WEAPONS[slot.id].mag;
      slot.reserve = WEAPONS[slot.id].reserve;
    }
  } else if (type === 'insta') {
    p.instaKill = def.duration;
  } else if (type === 'double') {
    p.doubleMoney = def.duration;
  } else if (type === 'nuke') {
    world.zombies = [];
    addMoney(p, def.money);
    events.push({ type: 'nuke', by: p.id });
  }
}

// cause: 'player' | 'zombie' | 'fog'. attackerId on pelaajan id tai null.
function damagePlayer(world, p, amount, attackerId, cause, events) {
  if (!p.alive) return;
  p.hp -= amount;
  if (p.hp <= 0) kill(world, p, attackerId, cause, events);
}

function kill(world, victim, killerId, cause, events) {
  victim.alive = false;
  victim.hp = 0;
  victim.deaths++;
  victim.respawnTimer = RESPAWN_TIME;
  victim.killedBy = killerId;
  const killer = killerId && world.players[killerId];
  if (killer) {
    killer.kills++;
    addMoney(killer, MONEY_PLAYER_KILL);
    if (world.phase === 'playing') killer.score += KILL_POINTS;
  }
  events.push({ type: 'kill', x: victim.x, y: victim.y, victim: victim.id, killer: killerId, cause });
}

// Etsii satunnaisen paikan, joka ei ole esteen sisällä eikä liian lähellä muita.
// keepProgress: erien välillä raha ja juomat säilyvät; uudessa pelissä ja lämmittelyssä nollataan.
function spawn(world, p, keepProgress = false) {
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
  if (!keepProgress) {
    p.money = START_MONEY;
    p.perks = {};
  }
  p.hp = maxHpOf(p);
  p.alive = true;
  p.cooldown = 0;
  p.respawnTimer = 0;
  // Joka syntymässä aloitetaan pistoolilla.
  p.instaKill = 0;
  p.doubleMoney = 0;
  p.dashTicks = 0;
  p.dashCd = 0;
  p.slots = [{ id: 'pistol', mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve }, null];
  p.cur = 0;
  p.reloadTimer = 0;
}
