// protocol.js: snapshotin koodaus ja purku sekä vieraalta koneelta tulevan datan tarkistus.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { TICK } from '../src/constants.js';
import { step } from '../src/game.js';
import { createBoss } from '../src/boss.js';
import { botInput } from '../src/bot.js';
import { PERK_IDS } from '../src/weapons.js';
import {
  encodeSnapshot, decodeSnapshot, sanitizeInput, sanitizeName, randomRoomCode, MAX_PLAYERS, PEER_PREFIX,
} from '../src/protocol.js';
import { sanitizeChat, CHAT_MAX_LENGTH } from '../src/chat.js';
import { sanitizeLook, HATS } from '../src/appearance.js';
import { seedRandom, playingMatch } from './apu.js';

beforeEach(() => seedRandom(4242));

// Verkon yli kulkeva viesti: JSON-muunnos varmistaa, ettei snapshotissa ole sarjallistumattomia arvoja.
const overNetwork = (msg) => JSON.parse(JSON.stringify(msg));
const near = (a, b, tol, label) => assert.ok(Math.abs(a - b) <= tol, `${label}: ${a} vs ${b}`);

// Maailma, jossa on mahdollisimman paljon tilaa: aseita, juomia, zombeja, ammuksia, bossi, tehosteita.
function richWorld() {
  const world = playingMatch(['host', 'p1', 'bot1']);
  // Muutama sekunti oikeaa peliä boteilla, jotta zombeja syntyy.
  world.zombieTimer = 0;
  for (let i = 0; i < 300; i++) {
    const inputs = { bot1: botInput(world, 'bot1', TICK), p1: botInput(world, 'p1', TICK) };
    step(world, inputs, TICK);
    world.players.host.hp = 100; // host pysyy hengissä
  }
  // Hostin tila asetetaan vasta lopuksi, ettei simulaatio muuta sitä (esim. lataus valmistuu).
  const { host, p1 } = world.players;
  host.money = 1500;
  host.perks = { [PERK_IDS[0]]: true, [PERK_IDS[2]]: true };
  host.slots[1] = { id: 'shotgun', mag: 3, reserve: 17 };
  host.cur = 1;
  host.reloadTimer = 0.66;
  host.instaKill = 3.33;
  host.doubleMoney = 4.44;
  host.look = { hat: 2, pattern: 1, face: 3 };
  host.dashTicks = 4;
  host.dashCd = 120;
  host.dashHeld = true;
  host.dashX = Math.SQRT1_2;
  host.dashY = -Math.SQRT1_2;
  p1.killedBy = 'host';
  world.boss = createBoss(world, Object.values(world.players).filter((p) => p.alive));
  world.powerups.push({ id: 77, type: 'double', x: 123.45, y: 678.9, life: 9.87 });
  world.box = { state: 'ready', timer: 5.55, owner: 'host', weapon: 'sniper' };
  world.bullets.push({ id: world.nextBulletId++, owner: 'host', x: 50.04, y: 60.06, vx: 1, vy: 0, life: 1, damage: 1, splash: 60 });
  return world;
}

test('snapshot säilyttää olennaiset kentät verkon yli', () => {
  const world = richWorld();
  const events = [{ type: 'kill', x: 10.04, y: 20.06, victim: 'p1', killer: 'host', cause: 'player' }, { type: 'roundStart', round: 1 }];
  const acks = { host: 0, p1: 42 };
  const msg = overNetwork(encodeSnapshot(world, acks, events));
  assert.equal(msg.type, 'snap');
  const s = decodeSnapshot(msg);

  near(s.t, world.time, 0.0005, 't');
  assert.equal(s.mapId, world.mapId);
  assert.equal(s.phase, world.phase);
  near(s.phaseTimer, world.phaseTimer, 0.05, 'phaseTimer');
  assert.equal(s.round, world.round);
  assert.equal(s.targetScore, world.targetScore);
  assert.equal(s.roundWinner, world.roundWinner);
  assert.equal(s.matchWinner, world.matchWinner);
  for (const k of ['x', 'y', 'r', 'elapsed']) near(s.zone[k], world.zone[k], 0.05, `zone.${k}`);

  assert.deepEqual(Object.keys(s.players).sort(), Object.keys(world.players).sort());
  for (const p of Object.values(world.players)) {
    const d = s.players[p.id];
    for (const k of ['id', 'name', 'color', 'alive', 'kills', 'deaths', 'score', 'wins', 'killedBy', 'zombieKills', 'money', 'cur', 'dashTicks', 'dashCd', 'dashHeld']) {
      assert.deepEqual(d[k], p[k], `${p.id}.${k}`);
    }
    near(d.x, p.x, 0.05, `${p.id}.x`);
    near(d.y, p.y, 0.05, `${p.id}.y`);
    near(d.aim, p.aim, 0.005, `${p.id}.aim`);
    near(d.hp, p.hp, 0.05, `${p.id}.hp`);
    near(d.respawnTimer, p.respawnTimer, 0.05, `${p.id}.respawnTimer`);
    near(d.reloadTimer, p.reloadTimer, 0.05, `${p.id}.reloadTimer`);
    near(d.instaKill, p.instaKill, 0.05, `${p.id}.instaKill`);
    near(d.doubleMoney, p.doubleMoney, 0.05, `${p.id}.doubleMoney`);
    near(d.dashX, p.dashX, 0.0005, `${p.id}.dashX`);
    near(d.dashY, p.dashY, 0.0005, `${p.id}.dashY`);
    assert.equal(d.ack, acks[p.id] || 0);
    assert.deepEqual(d.slots.map((sl) => sl?.id ?? null), p.slots.map((sl) => sl?.id ?? null));
    const slot = p.slots[p.cur];
    assert.equal(d.mag, slot.mag);
    assert.equal(d.reserve, slot.reserve);
    assert.deepEqual(Object.keys(d.perks).sort(), Object.keys(p.perks).filter((k) => p.perks[k]).sort());
    assert.deepEqual(d.look, { hat: p.look.hat, pattern: p.look.pattern, face: p.look.face });
  }
  assert.equal(s.players.host.reserve, 17);
  assert.equal(s.players.p1.reserve, Infinity, 'pistoolin rajaton varasto säilyy');

  assert.ok(world.bullets.length > 0 && world.zombies.length > 0, 'testimaailmassa on ammuksia ja zombeja');
  assert.equal(s.bullets.size, world.bullets.length);
  for (const b of world.bullets) {
    const d = s.bullets.get(b.id);
    near(d.x, b.x, 0.05, 'bullet.x');
    near(d.y, b.y, 0.05, 'bullet.y');
    assert.equal(d.splash, !!b.splash);
  }
  assert.equal(s.zombies.size, world.zombies.length);
  for (const z of world.zombies) {
    const d = s.zombies.get(z.id);
    near(d.x, z.x, 0.05, 'zombie.x');
    near(d.y, z.y, 0.05, 'zombie.y');
    assert.equal(d.emerging, z.emerge > 0);
  }

  const b = world.boss;
  for (const k of ['x', 'y', 'tx', 'ty']) near(s.boss[k], b[k], 0.05, `boss.${k}`);
  assert.equal(s.boss.hp, Math.ceil(b.hp));
  assert.equal(s.boss.maxHp, b.maxHp);
  assert.equal(s.boss.state, b.state);
  assert.equal(s.boss.enraged, b.enraged);

  assert.deepEqual(s.box, { state: 'ready', owner: 'host', weapon: 'sniper', timer: 5.6 });
  assert.deepEqual(s.powerups, [{ id: 77, type: 'double', x: 123.5, y: 678.9, life: 9.9 }]);

  // Tapahtumiin lisätään aina pyöristetty sijainti
  assert.deepEqual(s.events, [
    { type: 'kill', x: 10, y: 20.1, victim: 'p1', killer: 'host', cause: 'player' },
    { type: 'roundStart', round: 1, x: 0, y: 0 },
  ]);
});

test('lämmittelyn snapshot ilman sumua ja bossia', () => {
  const world = playingMatch(['a', 'b']);
  world.zone = null;
  world.boss = null;
  const s = decodeSnapshot(overNetwork(encodeSnapshot(world, {}, [])));
  assert.equal(s.zone, null);
  assert.equal(s.boss, null);
  assert.equal(s.players.a.ack, 0);
});

test('decodeSnapshot sietää puuttuvat valinnaiset kentät', () => {
  const s = decodeSnapshot({ type: 'snap', t: 1, p: [], b: [], e: [] });
  assert.deepEqual(s.players, {});
  assert.equal(s.zombies.size, 0);
  assert.equal(s.zone, null);
  assert.equal(s.mapId, null);
  assert.deepEqual(s.box, { state: 'idle', owner: null, weapon: null, timer: 0 });
  assert.deepEqual(s.powerups, []);
  assert.equal(s.boss, null);

  // Väärän tyyppiset valinnaiset kentät ohitetaan
  const t = decodeSnapshot({ type: 'snap', t: 1, p: [], b: [], e: [], m: 5, z: 'x', zb: {}, pu: 'x', bs: 1, bx: 2 });
  assert.equal(t.mapId, null);
  assert.equal(t.zone, null);
  assert.equal(t.zombies.size, 0);
  assert.deepEqual(t.powerups, []);
  assert.equal(t.boss, null);
  assert.equal(t.box.state, 'idle');
});

test('sanitizeInput hylkää epäkelvot syötteet', () => {
  for (const bad of [null, undefined, 0, 'input', true, {}, { seq: -1 }, { seq: 1.5 }, { seq: 'abc' }, { seq: NaN }, { seq: Infinity }]) {
    assert.equal(sanitizeInput(bad), null, JSON.stringify(bad));
  }
});

test('sanitizeInput siistii kelvollisen syötteen', () => {
  const clean = sanitizeInput({
    seq: 7, up: 1, down: 0, left: 'x', right: '', aim: 'nope', shoot: true,
    reload: {}, interact: null, swap: [], dash: 1, skip: true, hp: 9999, __proto__: { admin: true },
  });
  assert.deepEqual(clean, {
    seq: 7, up: true, down: false, left: true, right: false, aim: 0, shoot: true,
    reload: true, interact: false, swap: true, dash: true,
  });
  // skip on hostin sisäinen lippu: vieras ei saa jäädyttää pelaajaansa sillä
  assert.equal('skip' in clean, false);
  assert.equal(sanitizeInput({ seq: 0, aim: Infinity }).aim, 0);
  assert.equal(sanitizeInput({ seq: 0, aim: -1.25 }).aim, -1.25);
  assert.equal(sanitizeInput({ seq: '12' }).seq, 12, 'numeromerkkijono kelpaa (nykyinen toiminta)');
});

test('sanitizeName poistaa ohjausmerkit ja rajaa pituuden', () => {
  assert.equal(sanitizeName('  Matti\u0000\n '), 'Matti');
  assert.equal(sanitizeName('x'.repeat(40)).length, 16);
  assert.equal(sanitizeName(''), 'Pelaaja');
  assert.equal(sanitizeName('\u0007\u007f'), 'Pelaaja');
  assert.equal(sanitizeName(null), 'Pelaaja');
  assert.equal(sanitizeName(undefined), 'Pelaaja');
  assert.equal(sanitizeName(12345), '12345');
  assert.equal(sanitizeName({ toString: () => 'Olio' }), 'Olio');
});

test('sanitizeChat poistaa ohjausmerkit ja rajaa pituuden', () => {
  assert.equal(sanitizeChat(' moi\r\n'), 'moi');
  assert.equal(sanitizeChat('a'.repeat(CHAT_MAX_LENGTH * 2)).length, CHAT_MAX_LENGTH);
  assert.equal(sanitizeChat(null), '');
  assert.equal(sanitizeChat('<b>x</b>'), '<b>x</b>', 'teksti piirretään canvasille, joten HTML ei haittaa');
});

test('sanitizeLook hyväksyy vain sallitut indeksit', () => {
  assert.deepEqual(sanitizeLook(null), { color: 0, hat: 0, pattern: 0, face: 0 });
  assert.deepEqual(sanitizeLook('x'), { color: 0, hat: 0, pattern: 0, face: 0 });
  assert.deepEqual(sanitizeLook({ color: -1, hat: HATS.length, pattern: 1.5, face: '1' }), { color: 0, hat: 0, pattern: 0, face: 0 });
  assert.deepEqual(sanitizeLook({ color: 1, hat: HATS.length - 1, pattern: 1, face: 1 }), { color: 1, hat: HATS.length - 1, pattern: 1, face: 1 });
});

test('huonekoodi on neljä kirjainta ilman I:tä ja O:ta', () => {
  for (let i = 0; i < 200; i++) assert.match(randomRoomCode(), /^[A-HJ-NP-Z]{4}$/);
  assert.ok(PEER_PREFIX.length > 0);
  assert.ok(MAX_PLAYERS >= 2);
});
