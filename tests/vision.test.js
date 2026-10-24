// vision.js: mikä on valaistu kenellekin (piirto ja botit käyttävät samaa sääntöä).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { isLitFor, AURA_RADIUS, FLASHLIGHT_RANGE, FLASHLIGHT_HALF_ANGLE } from '../src/vision.js';
import { setMap, LAMPS } from '../src/map.js';
import { MAP_IDS } from '../src/maps.js';
import { openSpot } from './apu.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const underLamp = (x, y) => LAMPS.some((l) => Math.hypot(x - l.x, y - l.y) < l.r * 0.6);

// Katsoja ja suunta, jossa testipisteet (valopiirin ulkopuolella) eivät osu kattolamppujen alle.
function darkSetup() {
  for (const id of MAP_IDS) {
    setMap(id);
    const obs = openSpot(20);
    for (let k = 0; k < 16; k++) {
      const aim = (k / 16) * Math.PI * 2;
      const d = (AURA_RADIUS + FLASHLIGHT_RANGE) / 2 + 20;
      const ahead = { x: obs.x + Math.cos(aim) * d, y: obs.y + Math.sin(aim) * d };
      const behind = { x: obs.x - Math.cos(aim) * d, y: obs.y - Math.sin(aim) * d };
      const side = { x: obs.x + Math.cos(aim + Math.PI / 2) * d, y: obs.y + Math.sin(aim + Math.PI / 2) * d };
      if (![ahead, behind, side].some((p) => underLamp(p.x, p.y))) return { obs, aim, d, ahead, behind, side };
    }
  }
  throw new Error('ei sopivaa pimeää kohtaa');
}

test('oma valopiiri näkyy joka suuntaan', () => {
  const { obs, aim } = darkSetup();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    assert.ok(isLitFor(obs, aim, obs.x + Math.cos(a) * AURA_RADIUS, obs.y + Math.sin(a) * AURA_RADIUS));
  }
});

test('taskulamppu valaisee eteen, ei taakse eikä sivulle', () => {
  const { obs, aim, ahead, behind, side } = darkSetup();
  assert.equal(isLitFor(obs, aim, ahead.x, ahead.y), true);
  assert.equal(isLitFor(obs, aim, behind.x, behind.y), false);
  assert.equal(isLitFor(obs, aim, side.x, side.y), false);
  // Keilan ulkopuolella (kantaman takana) pimeää, ellei lamppu valaise
  const far = { x: obs.x + Math.cos(aim) * (FLASHLIGHT_RANGE + 50), y: obs.y + Math.sin(aim) * (FLASHLIGHT_RANGE + 50) };
  assert.equal(isLitFor(obs, aim, far.x, far.y), underLamp(far.x, far.y));
});

test('tähtäyskulma käsitellään täysinä kierroksina', () => {
  const { obs, aim, ahead, behind } = darkSetup();
  for (const turns of [-3, -1, 1, 5]) {
    const a = aim + turns * Math.PI * 2;
    assert.equal(isLitFor(obs, a, ahead.x, ahead.y), true);
    assert.equal(isLitFor(obs, a, behind.x, behind.y), false);
  }
  // Keilan reuna: hieman leveämpi kuin FLASHLIGHT_HALF_ANGLE (nykyinen toiminta, kerroin 1,15)
  const { d } = darkSetup();
  const edge = (k) => ({ x: obs.x + Math.cos(aim + FLASHLIGHT_HALF_ANGLE * k) * d, y: obs.y + Math.sin(aim + FLASHLIGHT_HALF_ANGLE * k) * d });
  const inside = edge(1.1);
  const outside = edge(1.2);
  if (!underLamp(inside.x, inside.y)) assert.equal(isLitFor(obs, aim, inside.x, inside.y), true);
  if (!underLamp(outside.x, outside.y)) assert.equal(isLitFor(obs, aim, outside.x, outside.y), false);
});

test('kattolampun alla on valoisaa kaukanakin', () => {
  setMap(MAP_IDS.find((id) => (setMap(id), LAMPS.length > 0)));
  const lamp = LAMPS[0];
  const obs = { x: lamp.x + FLASHLIGHT_RANGE + 200, y: lamp.y };
  assert.equal(isLitFor(obs, 0, lamp.x, lamp.y), true);
});

// BUGI: sanitizeInput hyväksyy minkä tahansa äärellisen tähtäyskulman (esim. 1e300), ja isLitFor
// normalisoi kulman while-silmukalla, joka ei etene niin suurella luvulla (1e300 - 2π === 1e300).
// render.js kutsuu isLitForia seurattavan pelaajan aimilla, joten kuollut host tai liittyjä, joka
// katsoo pahantahtoisen pelaajan peliä, jäätyy. Ajetaan erillisessä prosessissa aikarajalla,
// ettei testisarja jää jumiin.
test('isLitFor päättyy millä tahansa sanitizeInputin hyväksymällä kulmalla', {
  todo: 'isLitFor jää ikuiseen silmukkaan, kun vieras lähettää aim: 1e300 (sanitizeInput ei rajaa kulmaa)',
}, () => {
  const code = [
    "import { sanitizeInput } from './src/protocol.js';",
    "import { isLitFor } from './src/vision.js';",
    'const aim = sanitizeInput({ seq: 0, aim: 1e300 }).aim;',
    'isLitFor({ x: 0, y: 0 }, aim, 300, 0);',
    "console.log('ok');",
  ].join('\n');
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: ROOT, encoding: 'utf8', timeout: 2000 });
  assert.equal(r.stdout.trim(), 'ok', 'isLitFor ei palannut kahdessa sekunnissa');
});
