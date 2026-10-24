// game.js: erien, pisteiden, aselevon ja talouden säännöt. Testaa nykyistä toimintaa.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  TICK, PLAYER_HP, RESPAWN_TIME, TARGET_SCORE, TARGET_SCORE_OPTIONS, WIN_POINTS, KILL_POINTS,
  COUNTDOWN_TIME, ROUND_END_TIME, GAME_OVER_TIME,
} from '../src/constants.js';
import {
  createWorld, addPlayer, startMatch, setTargetScore, truceActive, canAct, step, EMPTY_INPUT,
} from '../src/game.js';
import { createBoss, BOSS_KILL_MONEY, BOSS_KILL_POINTS, BOSS_SHARE_MONEY } from '../src/boss.js';
import {
  START_MONEY, MONEY_CAP, MONEY_PLAYER_KILL, MONEY_ZOMBIE_HIT, MONEY_ZOMBIE_KILL, WEAPONS, POWERUPS,
  ARMOR_HP, PERK_IDS,
} from '../src/weapons.js';
import { seedRandom, run, runUntil, playingMatch, bulletAt, shoot, fogKill, openSpot } from './apu.js';

beforeEach(() => seedRandom(12345));

const alive = (world) => Object.values(world.players).filter((p) => p.alive).map((p) => p.id).sort();

// --- Ottelun aloitus ---

test('startMatch vaatii vähintään kaksi pelaajaa', () => {
  const world = createWorld();
  addPlayer(world, 'a', 'A', '#fff');
  assert.equal(startMatch(world), false);
  assert.equal(world.phase, 'warmup');
  addPlayer(world, 'b', 'B', '#fff');
  assert.equal(startMatch(world), true);
  assert.equal(world.phase, 'countdown');
  assert.equal(world.round, 1);
});

test('pisteraja hyväksyy vain sallitut arvot', () => {
  const world = createWorld();
  assert.equal(world.targetScore, TARGET_SCORE);
  for (const v of TARGET_SCORE_OPTIONS) {
    setTargetScore(world, v);
    assert.equal(world.targetScore, v);
  }
  setTargetScore(world, Math.max(...TARGET_SCORE_OPTIONS) + 1);
  assert.equal(world.targetScore, TARGET_SCORE);
  setTargetScore(world, '10');
  assert.equal(world.targetScore, TARGET_SCORE);
});

test('lähtölaskennan aikana ei voi liikkua, sitten erä alkaa', () => {
  const world = createWorld();
  addPlayer(world, 'a', 'A', '#fff');
  addPlayer(world, 'b', 'B', '#fff');
  startMatch(world);
  assert.equal(canAct(world.phase), false);
  const a = world.players.a;
  const start = { x: a.x, y: a.y };
  const events = run(world, COUNTDOWN_TIME - 0.5, { a: { ...EMPTY_INPUT, right: true, down: true } });
  assert.deepEqual({ x: a.x, y: a.y }, start);
  assert.ok(!events.some((e) => e.type === 'roundStart'));
  const later = runUntil(world, (w) => w.phase === 'playing', 1);
  assert.equal(world.phase, 'playing');
  assert.ok(later.some((e) => e.type === 'roundStart' && e.round === 1));
});

// --- Pisteet ---

test('pelaajan tappo antaa KILL_POINTS ja rahaa', () => {
  const world = playingMatch();
  const a = world.players.a;
  const money = a.money;
  const events = shoot(world, 'a', 'b');
  assert.equal(world.players.b.alive, false);
  assert.equal(world.players.b.killedBy, 'a');
  assert.equal(a.score, KILL_POINTS);
  assert.equal(a.kills, 1);
  assert.equal(world.players.b.deaths, 1);
  assert.equal(a.money, Math.min(MONEY_CAP, money + MONEY_PLAYER_KILL));
  assert.ok(events.some((e) => e.type === 'kill' && e.victim === 'b' && e.killer === 'a' && e.cause === 'player'));
});

test('sumuun kuollut ei anna kenellekään pisteitä', () => {
  const world = playingMatch();
  const events = fogKill(world, ['c']);
  assert.equal(world.players.c.alive, false);
  assert.equal(world.players.c.killedBy, null);
  assert.ok(events.some((e) => e.type === 'kill' && e.victim === 'c' && e.cause === 'fog'));
  for (const p of Object.values(world.players)) assert.equal(p.score, 0);
});

test('erän viimeinen eloonjäänyt saa WIN_POINTS', () => {
  const world = playingMatch();
  shoot(world, 'a', 'b');
  assert.equal(world.phase, 'playing');
  const events = shoot(world, 'a', 'c');
  assert.equal(world.roundWinner, 'a');
  assert.equal(world.players.a.score, 2 * KILL_POINTS + WIN_POINTS);
  assert.equal(world.players.a.wins, 1);
  assert.equal(world.phase, 'roundEnd');
  assert.ok(Math.abs(world.phaseTimer - ROUND_END_TIME) < 1e-9);
  assert.ok(events.some((e) => e.type === 'roundEnd' && e.winner === 'a'));
});

test('jos kaikki kuolevat yhtä aikaa, erällä ei ole voittajaa', () => {
  const world = playingMatch();
  fogKill(world, ['b']);
  fogKill(world, ['a', 'c']);
  assert.equal(world.phase, 'roundEnd');
  assert.equal(world.roundWinner, null);
  for (const p of Object.values(world.players)) {
    assert.equal(p.score, 0);
    assert.equal(p.wins, 0);
  }
});

test('pisterajan saavuttanut voittaa ottelun', () => {
  const world = playingMatch();
  world.players.a.score = world.targetScore - WIN_POINTS;
  fogKill(world, ['b', 'c']);
  assert.equal(world.phase, 'gameOver');
  assert.equal(world.matchWinner, 'a');
  assert.ok(Math.abs(world.phaseTimer - GAME_OVER_TIME) < 1e-9);

  // Lopputuloksen jälkeen takaisin lämmittelyyn, kaikki henkiin
  run(world, GAME_OVER_TIME + TICK);
  assert.equal(world.phase, 'warmup');
  assert.deepEqual(alive(world), ['a', 'b', 'c']);
});

test('alle pisterajan ottelu jatkuu seuraavaan erään', () => {
  const world = playingMatch();
  world.players.a.score = world.targetScore - WIN_POINTS - 1;
  fogKill(world, ['b', 'c']);
  assert.equal(world.phase, 'roundEnd');
  assert.equal(world.matchWinner, null);
});

test('tasapelissä pisterajan yli jatketaan, kunnes joku on yksin kärjessä', () => {
  const world = playingMatch();
  const { a, b } = world.players;
  a.score = world.targetScore - WIN_POINTS;
  b.score = world.targetScore;
  fogKill(world, ['b', 'c']);
  assert.equal(a.score, b.score);
  assert.equal(world.phase, 'roundEnd');
  assert.equal(world.matchWinner, null);

  // Seuraava erä alkaa tavalliseen tapaan
  run(world, ROUND_END_TIME + TICK);
  assert.equal(world.phase, 'countdown');
  assert.equal(world.round, 2);
  runUntil(world, (w) => w.phase === 'playing', COUNTDOWN_TIME + 1);

  // Kun tasapeli ratkeaa, ottelu päättyy
  fogKill(world, ['a', 'c']);
  assert.equal(world.phase, 'gameOver');
  assert.equal(world.matchWinner, 'b');
});

// --- Uudelleensyntyminen ---

test('erässä ei synnytä uudelleen', () => {
  const world = playingMatch();
  shoot(world, 'a', 'b');
  const events = run(world, RESPAWN_TIME * 2);
  assert.equal(world.phase, 'playing');
  assert.equal(world.players.b.alive, false);
  assert.ok(!events.some((e) => e.type === 'spawn'));
});

test('lämmittelyssä synnytään uudelleen RESPAWN_TIME:n jälkeen eikä tapoista saa pisteitä', () => {
  const world = createWorld();
  addPlayer(world, 'a', 'A', '#fff');
  addPlayer(world, 'b', 'B', '#fff');
  shoot(world, 'a', 'b');
  assert.equal(world.players.b.alive, false);
  assert.equal(world.players.a.score, 0);
  assert.equal(world.players.a.kills, 1);
  run(world, RESPAWN_TIME - 0.1);
  assert.equal(world.players.b.alive, false);
  const events = run(world, 0.2);
  assert.equal(world.players.b.alive, true);
  assert.ok(events.some((e) => e.type === 'spawn' && e.id === 'b'));
});

test('kesken erän liittynyt katsoo seuraavaan erään asti', () => {
  const world = playingMatch();
  const d = addPlayer(world, 'd', 'D', '#fff');
  assert.equal(d.alive, false);
  run(world, RESPAWN_TIME * 2);
  assert.equal(d.alive, false);
  fogKill(world, ['b', 'c']);
  run(world, ROUND_END_TIME + TICK);
  assert.equal(world.phase, 'countdown');
  assert.equal(d.alive, true);
});

// --- Aselepo ---

test('aselevossa (bossi elossa) pelaajat eivät vahingoita toisiaan', () => {
  const world = playingMatch();
  const { a, b } = world.players;
  world.boss = createBoss(world, [a, b, world.players.c]);
  assert.equal(truceActive(world), true);

  bulletAt(world, 'a', b, { damage: PLAYER_HP * 10 });
  run(world, TICK);
  assert.equal(b.alive, true);
  assert.equal(b.hp, PLAYER_HP - 0, 'luoti menee läpi');

  // Räjähdys ei myöskään vahingoita
  const wonder = WEAPONS.wonder;
  bulletAt(world, 'a', b, { damage: 0, life: TICK / 2, splash: wonder.splash, splashDamage: PLAYER_HP * 10 });
  run(world, TICK);
  assert.equal(b.alive, true);
  assert.equal(b.hp, PLAYER_HP);
  assert.equal(a.score, 0);
});

test('aselevon jälkeen pelaajat vahingoittavat taas toisiaan', () => {
  const world = playingMatch();
  world.boss = null;
  assert.equal(truceActive(world), false);
  const b = world.players.b;
  bulletAt(world, 'a', b, { damage: 1 });
  run(world, TICK);
  assert.equal(b.hp, PLAYER_HP - 1);

  const wonder = WEAPONS.wonder;
  bulletAt(world, 'a', b, { damage: 0, life: TICK / 2, splash: wonder.splash, splashDamage: 1 });
  run(world, TICK);
  assert.equal(b.hp, PLAYER_HP - 2);
});

test('aselevon aikana sumu ei sulkeudu', () => {
  const world = playingMatch();
  world.boss = createBoss(world, Object.values(world.players));
  const elapsed = world.zone.elapsed;
  run(world, 1);
  assert.equal(world.zone.elapsed, elapsed);
});

test('bossin kaataja saa BOSS_KILL_POINTS ja rahaa, muut osuutensa', () => {
  const world = playingMatch();
  const { a, b } = world.players;
  a.money = 0;
  b.money = 0;
  const boss = createBoss(world, Object.values(world.players));
  boss.state = 'chase';
  boss.hp = 1;
  boss.damageBy = { b: 500 };
  world.boss = boss;
  bulletAt(world, 'a', boss, { damage: 5 });
  const events = run(world, TICK);
  assert.equal(world.boss, null);
  assert.ok(events.some((e) => e.type === 'bossKill' && e.by === 'a'));
  assert.equal(a.score, BOSS_KILL_POINTS);
  assert.equal(a.money, Math.min(MONEY_CAP, BOSS_KILL_MONEY));
  assert.equal(b.money, Math.min(MONEY_CAP, BOSS_SHARE_MONEY));
  assert.equal(truceActive(world), false);
});

// --- Raha ---

test('raha ei ylitä MONEY_CAP:ia pelaajan tapossa', () => {
  const world = playingMatch();
  const a = world.players.a;
  a.money = MONEY_CAP - 1;
  shoot(world, 'a', 'b');
  assert.equal(a.money, MONEY_CAP);
});

test('raha ei ylitä MONEY_CAP:ia tuplarahoilla, zombeista, bossista eikä ydinpommista', () => {
  const world = playingMatch();
  const a = world.players.a;

  // Zombi: osuma + tappo tuplarahoilla
  a.money = MONEY_CAP - MONEY_ZOMBIE_HIT;
  a.doubleMoney = 10;
  const z = { id: 999, ...openSpot(20), px: 0, py: 0, angle: 0, hp: 1, speed: 0, emerge: 1, cooldown: 1 };
  world.zombies.push(z);
  bulletAt(world, 'a', z, { damage: 5 });
  run(world, TICK);
  assert.equal(world.zombies.includes(z), false);
  assert.equal(a.money, MONEY_CAP);
  a.doubleMoney = 0;

  // Ydinpommi
  a.money = MONEY_CAP - 1;
  world.powerups.push({ id: 1, type: 'nuke', x: a.x, y: a.y, life: 5 });
  run(world, TICK);
  assert.equal(a.money, MONEY_CAP);
  assert.ok(POWERUPS.nuke.money > 1);

  // Bossi
  a.money = MONEY_CAP - 1;
  const boss = createBoss(world, Object.values(world.players));
  boss.state = 'chase';
  boss.hp = 1;
  world.boss = boss;
  bulletAt(world, 'a', boss, { damage: 5 });
  run(world, TICK);
  assert.equal(world.boss, null);
  assert.equal(a.money, MONEY_CAP);
});

test('zombin tappo antaa rahaa (MONEY_ZOMBIE_HIT + MONEY_ZOMBIE_KILL)', () => {
  const world = playingMatch();
  const a = world.players.a;
  a.money = 0;
  const z = { id: 999, ...openSpot(20), px: 0, py: 0, angle: 0, hp: 1, speed: 0, emerge: 1, cooldown: 1 };
  world.zombies.push(z);
  bulletAt(world, 'a', z, { damage: 5 });
  const events = run(world, TICK);
  assert.ok(events.some((e) => e.type === 'zkill' && e.by === 'a'));
  assert.equal(a.money, MONEY_ZOMBIE_HIT + MONEY_ZOMBIE_KILL);
  assert.equal(a.zombieKills, 1);
});

// --- Mikä säilyy erästä toiseen ---

// Pisteet nollataan, ettei ottelu pääty kesken testin.
function nextRound(world) {
  for (const p of Object.values(world.players)) p.score = 0;
  const [winner, ...rest] = alive(world);
  fogKill(world, rest);
  assert.equal(world.phase, 'roundEnd', `voittaja ${winner}`);
  run(world, ROUND_END_TIME + TICK);
  assert.equal(world.phase, 'countdown');
}

test('raha ja juomat säilyvät erästä toiseen, aseet nollautuvat', () => {
  const world = playingMatch();
  const { a, b } = world.players;
  a.money = 1234;
  a.perks = { armor: true, reload: true };
  a.slots = [{ id: 'pistol', mag: 1, reserve: Infinity }, { id: 'shotgun', mag: 2, reserve: 3 }];
  a.cur = 1;
  a.instaKill = 5;
  a.doubleMoney = 5;
  b.money = 777;
  b.perks = { rapid: true };

  nextRound(world);
  assert.equal(world.round, 2);
  assert.equal(a.money, 1234);
  assert.deepEqual(a.perks, { armor: true, reload: true });
  assert.equal(a.hp, ARMOR_HP, 'panssarijuoma näkyy uuden erän HP:ssa');
  assert.deepEqual(a.slots, [{ id: 'pistol', mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve }, null]);
  assert.equal(a.cur, 0);
  assert.equal(a.instaKill, 0);
  assert.equal(a.doubleMoney, 0);
  assert.equal(b.money, 777);
  assert.deepEqual(b.perks, { rapid: true });
  assert.equal(b.hp, PLAYER_HP);
});

test('juomat säilyvät usean erän yli ja nollautuvat vasta uudessa ottelussa', () => {
  const world = playingMatch();
  const a = world.players.a;
  a.perks = Object.fromEntries(PERK_IDS.map((id) => [id, true]));
  a.money = 2000;
  for (let i = 0; i < 3; i++) {
    nextRound(world);
    runUntil(world, (w) => w.phase === 'playing', COUNTDOWN_TIME + 1);
  }
  assert.equal(world.round, 4);
  assert.equal(PERK_IDS.every((id) => a.perks[id]), true);
  assert.equal(a.money, 2000);

  // Uusi ottelu: raha ja juomat alusta, pisteet nollaan
  a.score = 5;
  startMatch(world);
  assert.equal(world.round, 1);
  assert.equal(a.money, START_MONEY);
  assert.deepEqual(a.perks, {});
  assert.equal(a.score, 0);
  assert.equal(a.hp, PLAYER_HP);
});

test('jokainen erä pelataan eri kentällä kuin edellinen', () => {
  const world = playingMatch();
  for (let i = 0; i < 8; i++) {
    const prev = world.mapId;
    nextRound(world);
    assert.notEqual(world.mapId, prev);
    runUntil(world, (w) => w.phase === 'playing', COUNTDOWN_TIME + 1);
  }
});
