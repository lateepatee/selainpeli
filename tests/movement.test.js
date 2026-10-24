// movePlayer: host ja liittyjä laskevat liikkeen samalla funktiolla, joten saman syötteen pitää
// antaa täsmälleen sama tulos (liittyjän ennuste).

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  TICK, PLAYER_RADIUS, PLAYER_SPEED, DASH_SPEED, DASH_TICKS, DASH_COOLDOWN_TICKS,
} from '../src/constants.js';
import { movePlayer, EMPTY_INPUT } from '../src/game.js';
import { setMap, OBSTACLES, ARENA_W, ARENA_H } from '../src/map.js';
import { MAP_IDS } from '../src/maps.js';
import { pointInRect } from '../src/geometry.js';
import { encodeSnapshot, decodeSnapshot } from '../src/protocol.js';
import { seededRandom, seedRandom, playingMatch, openSpot } from './apu.js';

beforeEach(() => seedRandom(99));

// Satunnainen mutta toistuva syötesarja: suuntanäppäimet vaihtuvat välillä, väistöä painellaan.
function inputSequence(seed, n) {
  const rnd = seededRandom(seed);
  const list = [];
  let cur = { ...EMPTY_INPUT };
  for (let i = 0; i < n; i++) {
    if (rnd() < 0.08) {
      cur = { ...EMPTY_INPUT, up: rnd() < 0.4, down: rnd() < 0.4, left: rnd() < 0.4, right: rnd() < 0.4, aim: rnd() * 7 - 3.5 };
    }
    list.push({ ...cur, dash: rnd() < 0.05 });
  }
  return list;
}

const MOVE_FIELDS = ['x', 'y', 'dashTicks', 'dashCd', 'dashHeld', 'dashX', 'dashY'];
const pick = (p) => Object.fromEntries(MOVE_FIELDS.map((k) => [k, p[k]]));
const fresh = (pos) => ({ ...pos, px: 0, py: 0, dashTicks: 0, dashCd: 0, dashHeld: false, dashX: 0, dashY: 0 });

for (const id of MAP_IDS) {
  test(`sama syöte antaa saman tuloksen (${id})`, () => {
    setMap(id);
    const start = openSpot(20);
    const a = fresh(start);
    const b = fresh(start);
    const inputs = inputSequence(id.length, 1200);
    // Liike ei saa käyttää satunnaisuutta, muuten ennuste ei voi osua.
    const realRandom = Math.random;
    Math.random = () => { throw new Error('movePlayer käytti Math.randomia'); };
    try {
      for (const input of inputs) {
        movePlayer(a, input, TICK);
        movePlayer(b, { ...input }, TICK);
        assert.deepEqual(pick(a), pick(b));
      }
    } finally {
      Math.random = realRandom;
    }
    assert.ok(a.x !== start.x || a.y !== start.y, 'pelaaja liikkui');
  });
}

test('liike pysyy kentällä eikä mene esteiden sisään', () => {
  for (const id of MAP_IDS) {
    setMap(id);
    const p = fresh(openSpot(20));
    for (const input of inputSequence(7 + id.length, 3000)) {
      movePlayer(p, input, TICK);
      assert.ok(p.x >= PLAYER_RADIUS && p.x <= ARENA_W - PLAYER_RADIUS, `${id} x=${p.x}`);
      assert.ok(p.y >= PLAYER_RADIUS && p.y <= ARENA_H - PLAYER_RADIUS, `${id} y=${p.y}`);
      assert.ok(!OBSTACLES.some((r) => pointInRect(p.x, p.y, r)), `${id}: keskipiste esteen sisällä (${p.x}, ${p.y})`);
    }
  }
});

test('nopeus on sama suoraan ja vinottain', () => {
  setMap('bunker');
  const start = openSpot(PLAYER_SPEED * TICK * 4);
  for (const dir of [{ right: true }, { up: true }, { down: true, left: true }, { up: true, right: true }]) {
    const p = fresh(start);
    movePlayer(p, { ...EMPTY_INPUT, ...dir }, TICK);
    const d = Math.hypot(p.x - start.x, p.y - start.y);
    assert.ok(Math.abs(d - PLAYER_SPEED * TICK) < 1e-9, `${JSON.stringify(dir)}: ${d}`);
  }
  // Vastakkaiset näppäimet kumoavat toisensa
  const p = fresh(start);
  movePlayer(p, { ...EMPTY_INPUT, left: true, right: true }, TICK);
  assert.deepEqual({ x: p.x, y: p.y }, start);
});

test('väistö: DASH_TICKS tickiä DASH_SPEED-nopeudella, sitten DASH_COOLDOWN_TICKS latautumista', () => {
  setMap('bunker');
  const start = openSpot(DASH_SPEED * TICK * DASH_TICKS + 10);
  const p = fresh(start);
  movePlayer(p, { ...EMPTY_INPUT, right: true, dash: true }, TICK);
  assert.equal(p.dashCd, DASH_COOLDOWN_TICKS);
  for (let i = 1; i < DASH_TICKS; i++) movePlayer(p, { ...EMPTY_INPUT, right: true, dash: true }, TICK);
  assert.ok(Math.abs(p.x - (start.x + DASH_SPEED * TICK * DASH_TICKS)) < 1e-6);
  assert.equal(p.dashTicks, 0);

  // Pohjassa pidetty nappi ei laukaise uutta väistöä, eikä väistö toimi latautumisen aikana
  const x = p.x;
  movePlayer(p, { ...EMPTY_INPUT, left: true, dash: true }, TICK);
  assert.ok(Math.abs(p.x - (x - PLAYER_SPEED * TICK)) < 1e-6);
  movePlayer(p, { ...EMPTY_INPUT, left: true }, TICK);
  movePlayer(p, { ...EMPTY_INPUT, left: true, dash: true }, TICK);
  assert.equal(p.dashTicks, 0, 'latautumassa');
  // Latautuminen alkoi ensimmäisellä tickillä ja on vähentynyt jokaisella sen jälkeisellä (DASH_TICKS + 3 tickiä)
  assert.equal(p.dashCd, DASH_COOLDOWN_TICKS - (DASH_TICKS + 3 - 1));

  // Paikallaan väistö menee tähtäyssuuntaan
  const q = fresh(start);
  movePlayer(q, { ...EMPTY_INPUT, aim: Math.PI / 2, dash: true }, TICK);
  assert.ok(Math.abs(q.x - start.x) < 1e-9);
  assert.ok(Math.abs(q.y - (start.y + DASH_SPEED * TICK)) < 1e-9);
});

test('liittyjän ennuste snapshotista osuu hostin laskemaan sijaintiin', () => {
  const world = playingMatch(['host', 'p1']);
  const host = world.players.p1; // hostin kopio liittyjän pelaajasta
  const inputs = inputSequence(5, 600);
  let maxError = 0;
  // Joka 30. tick: liittyjä saa snapshotin, palauttaa tilansa siitä (kuten client.js:n reconcile)
  // ja ajaa seuraavat syötteet itse. Host ajaa samat syötteet omaan tilaansa.
  for (let start = 0; start < inputs.length; start += 30) {
    const self = decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(world, {}, [])))).players.p1;
    const predicted = {
      x: self.x, y: self.y, px: 0, py: 0,
      dashTicks: self.dashTicks, dashCd: self.dashCd, dashHeld: self.dashHeld, dashX: self.dashX, dashY: self.dashY,
    };
    for (const input of inputs.slice(start, start + 30)) {
      movePlayer(host, input, TICK);
      movePlayer(predicted, input, TICK);
    }
    assert.equal(predicted.dashTicks, host.dashTicks);
    assert.equal(predicted.dashCd, host.dashCd);
    assert.equal(predicted.dashHeld, host.dashHeld);
    maxError = Math.max(maxError, Math.hypot(predicted.x - host.x, predicted.y - host.y));
  }
  // Ero syntyy vain snapshotin pyöristyksestä (0,1 px), ei laskennasta.
  assert.ok(maxError < 0.5, `suurin ennustevirhe ${maxError} px`);
});
