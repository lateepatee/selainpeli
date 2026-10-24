// Savutesti: botit pelaavat kokonaisen ottelun siemenellisellä satunnaisuudella. Tarkistaa, ettei
// simulaatio kaadu, tila pysyy järkevänä ja ottelu päättyy gameOver-vaiheeseen.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TICK, PLAYER_RADIUS, TARGET_SCORE, TARGET_SCORE_OPTIONS, GAME_OVER_TIME } from '../src/constants.js';
import { createWorld, addPlayer, startMatch, setTargetScore, step } from '../src/game.js';
import { botInput, forgetBot } from '../src/bot.js';
import { setMap, ARENA_W, ARENA_H } from '../src/map.js';
import { DEFAULT_MAP } from '../src/maps.js';
import { MONEY_CAP } from '../src/weapons.js';
import { seedRandom } from './apu.js';

const MAX_MATCH_SECONDS = 60 * 60; // varmuusraja, ettei jumiutunut ottelu jää pyörimään

function playMatch(seed, botCount, targetScore) {
  // Kenttä ja bottien muisti ovat moduulin tilaa: nollataan, jotta sama siemen antaa saman ottelun.
  seedRandom(seed);
  setMap(DEFAULT_MAP);
  const ids = Array.from({ length: botCount }, (_, i) => `bot${i + 1}`);
  for (const id of ids) forgetBot(id);

  const world = createWorld();
  setTargetScore(world, targetScore);
  for (const id of ids) addPlayer(world, id, id, '#ffffff');
  assert.equal(startMatch(world), true);

  const deadThisRound = new Set();
  const lastScore = {};
  const counts = {};
  const deathCauses = {};
  let ticks = 0;
  while (world.phase !== 'gameOver') {
    assert.ok(ticks++ < MAX_MATCH_SECONDS / TICK, `ottelu ei päättynyt ${MAX_MATCH_SECONDS} sekunnissa`);
    const inputs = {};
    for (const id of ids) if (world.players[id].alive) inputs[id] = botInput(world, id, TICK);
    const phaseBefore = world.phase;
    const events = step(world, inputs, TICK);

    for (const e of events) {
      assert.equal(typeof e.type, 'string');
      counts[e.type] = (counts[e.type] || 0) + 1;
      if (e.type === 'kill') deathCauses[e.cause] = (deathCauses[e.cause] || 0) + 1;
    }
    if (world.phase === 'countdown' && phaseBefore !== 'countdown') deadThisRound.clear();

    for (const p of Object.values(world.players)) {
      for (const k of ['x', 'y', 'hp', 'money', 'score']) assert.ok(Number.isFinite(p[k]), `${p.id}.${k} = ${p[k]}`);
      assert.ok(p.money >= 0 && p.money <= MONEY_CAP, `${p.id}.money = ${p.money}`);
      assert.ok(p.score >= (lastScore[p.id] || 0), 'pisteet eivät vähene ottelun aikana');
      lastScore[p.id] = p.score;
      if (p.alive) {
        assert.ok(p.hp > 0, `${p.id} elossa ilman HP:ta`);
        assert.ok(p.x >= PLAYER_RADIUS - 1e-6 && p.x <= ARENA_W - PLAYER_RADIUS + 1e-6, `${p.id}.x = ${p.x}`);
        assert.ok(p.y >= PLAYER_RADIUS - 1e-6 && p.y <= ARENA_H - PLAYER_RADIUS + 1e-6, `${p.id}.y = ${p.y}`);
      }
      if (world.phase === 'playing' || world.phase === 'roundEnd' || world.phase === 'gameOver') {
        if (!p.alive) deadThisRound.add(p.id);
        else assert.ok(!deadThisRound.has(p.id), `${p.id} syntyi uudelleen kesken erän`);
      }
    }
    for (const z of world.zombies) assert.ok(Number.isFinite(z.x) && Number.isFinite(z.y), 'zombin sijainti');
    for (const b of world.bullets) assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y), 'ammuksen sijainti');
  }

  const ranked = Object.values(world.players).sort((a, b) => b.score - a.score);
  return {
    world,
    summary: {
      winner: world.matchWinner,
      rounds: world.round,
      time: world.time,
      scores: Object.fromEntries(ranked.map((p) => [p.id, p.score])),
      counts,
      deathCauses,
    },
  };
}

const CASES = [
  { seed: 1, bots: 4, target: TARGET_SCORE },
  { seed: 2, bots: 2, target: Math.min(...TARGET_SCORE_OPTIONS) },
  { seed: 3, bots: 6, target: Math.min(...TARGET_SCORE_OPTIONS) },
];

for (const { seed, bots, target } of CASES) {
  test(`${bots} bottia pelaa ottelun loppuun (siemen ${seed}, pisteraja ${target})`, () => {
    const { world, summary } = playMatch(seed, bots, target);
    assert.equal(world.phase, 'gameOver');
    const [first, second] = Object.values(summary.scores);
    assert.equal(summary.scores[summary.winner], first, 'voittajalla on eniten pisteitä');
    assert.ok(first >= target, 'voittaja saavutti pisterajan');
    assert.ok(second === undefined || first > second, 'voittaja on yksin kärjessä');
    assert.ok(summary.rounds >= 1);
    assert.ok(summary.counts.roundEnd === summary.rounds, 'jokainen erä päättyi');
    assert.ok(summary.counts.shot > 0 && summary.counts.kill > 0, 'botit ampuivat ja kuolivat');

    // Lopputuloksen jälkeen takaisin lämmittelyyn
    for (let i = 0; i < Math.ceil(GAME_OVER_TIME / TICK) + 1; i++) step(world, {}, TICK);
    assert.equal(world.phase, 'warmup');
  });
}

test('sama siemen antaa saman ottelun', () => {
  const a = playMatch(11, 4, Math.min(...TARGET_SCORE_OPTIONS)).summary;
  const b = playMatch(11, 4, Math.min(...TARGET_SCORE_OPTIONS)).summary;
  assert.deepEqual(a, b);
});
