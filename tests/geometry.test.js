// geometry.js: törmäykset ja näköyhteys.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { clamp, wrapAngle, pointInRect, pushCircleOutOfRect, lineOfSight } from '../src/geometry.js';
import { setMap, OBSTACLES, ARENA_W, ARENA_H } from '../src/map.js';
import { MAP_IDS } from '../src/maps.js';
import { seededRandom } from './apu.js';

const RECT = { x: 100, y: 100, w: 80, h: 40 };
const RADIUS = 16;

// Etäisyys ympyrän keskipisteestä suorakulmioon (0, jos sisällä).
function distToRect(c, r) {
  const dx = Math.max(r.x - c.x, 0, c.x - (r.x + r.w));
  const dy = Math.max(r.y - c.y, 0, c.y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

test('clamp rajaa arvon välille', () => {
  assert.equal(clamp(-5, 0, 10), 0);
  assert.equal(clamp(15, 0, 10), 10);
  assert.equal(clamp(7, 0, 10), 7);
});

test('wrapAngle palauttaa kulman välillä [-π, π] samaan suuntaan', () => {
  // Välillä olevat kulmat palautuvat täsmälleen sellaisinaan.
  for (const a of [0, 1, -1, Math.PI, -Math.PI, 3.14, -3.14]) assert.equal(wrapAngle(a), a);
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} vs ${b}`);
  near(wrapAngle(Math.PI + 0.5), -Math.PI + 0.5);
  near(wrapAngle(-Math.PI - 0.5), Math.PI - 0.5);
  near(wrapAngle(4 * Math.PI + 1), 1);
  near(wrapAngle(-6 * Math.PI - 1), -1);
  // Kohtuulliset arvot säilyttävät suuntansa.
  for (const a of [7, -7, 100, -1000]) {
    const w = wrapAngle(a);
    assert.ok(Math.abs(Math.cos(w) - Math.cos(a)) < 1e-9 && Math.abs(Math.sin(w) - Math.sin(a)) < 1e-9, `${a} → ${w}`);
  }
  // Valtavat arvot eivät jumita, ja tulos on välillä. Suunta ei säily, koska liukulukujen 2π ei ole
  // tarkka 2π, mutta niin suurella kulmalla ei ole suuntaakaan.
  for (const a of [1e300, -1e300, 1e20, -1e20, Number.MAX_VALUE, -Number.MAX_VALUE]) {
    const w = wrapAngle(a);
    assert.ok(w >= -Math.PI && w <= Math.PI, `${a} → ${w}`);
  }
  for (const a of [Infinity, -Infinity, NaN]) assert.equal(wrapAngle(a), 0, String(a));
});

test('wrapAngle laskee samoin kuin vanha silmukka tavallisilla erotuksilla', () => {
  const loop = (a) => {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  };
  const rand = seededRandom(7);
  for (let i = 0; i < 10000; i++) {
    const a = (rand() - 0.5) * 6 * Math.PI;
    assert.equal(wrapAngle(a), loop(a), String(a));
  }
});

test('pointInRect: reunat eivät kuulu sisään, pad laajentaa', () => {
  assert.ok(pointInRect(140, 120, RECT));
  assert.ok(!pointInRect(RECT.x, 120, RECT), 'vasen reuna ei ole sisällä');
  assert.ok(!pointInRect(RECT.x + RECT.w, 120, RECT), 'oikea reuna ei ole sisällä');
  assert.ok(!pointInRect(95, 120, RECT));
  assert.ok(pointInRect(95, 120, RECT, 6));
  assert.ok(!pointInRect(95, 120, RECT, 5));
});

test('pushCircleOutOfRect ei liikuta kaukana olevaa ympyrää', () => {
  const c = { x: RECT.x - RADIUS - 1, y: 120 };
  pushCircleOutOfRect(c, RADIUS, RECT);
  assert.deepEqual(c, { x: RECT.x - RADIUS - 1, y: 120 });
});

test('pushCircleOutOfRect työntää reunaa koskettavan ympyrän säteen päähän', () => {
  const c = { x: RECT.x - 5, y: 120 };
  pushCircleOutOfRect(c, RADIUS, RECT);
  assert.ok(Math.abs(c.x - (RECT.x - RADIUS)) < 1e-9);
  assert.equal(c.y, 120);

  // Kulma: työntö kulman suuntaan
  const k = { x: RECT.x - 5, y: RECT.y - 5 };
  pushCircleOutOfRect(k, RADIUS, RECT);
  assert.ok(Math.abs(distToRect(k, RECT) - RADIUS) < 1e-9);
  assert.ok(k.x < RECT.x && k.y < RECT.y);
});

test('pushCircleOutOfRect: keskipiste esteen sisällä työnnetään lähimmän reunan yli', () => {
  const cases = [
    [{ x: RECT.x + 3, y: 120 }, (c) => c.x === RECT.x - RADIUS],
    [{ x: RECT.x + RECT.w - 3, y: 120 }, (c) => c.x === RECT.x + RECT.w + RADIUS],
    [{ x: 140, y: RECT.y + 2 }, (c) => c.y === RECT.y - RADIUS],
    [{ x: 140, y: RECT.y + RECT.h - 2 }, (c) => c.y === RECT.y + RECT.h + RADIUS],
  ];
  for (const [c, ok] of cases) {
    pushCircleOutOfRect(c, RADIUS, RECT);
    assert.ok(ok(c), JSON.stringify(c));
    assert.ok(distToRect(c, RECT) >= RADIUS - 1e-9);
  }
});

test('pushCircleOutOfRect: satunnaiset ympyrät eivät jää esteen sisään', () => {
  const rnd = seededRandom(7);
  for (let i = 0; i < 2000; i++) {
    const c = { x: RECT.x - 30 + rnd() * (RECT.w + 60), y: RECT.y - 30 + rnd() * (RECT.h + 60) };
    pushCircleOutOfRect(c, RADIUS, RECT);
    assert.ok(distToRect(c, RECT) >= RADIUS - 1e-6, JSON.stringify(c));
  }
});

// Janan ja suorakulmion leikkauksen pituus (Liang–Barsky).
function chordLength(x1, y1, x2, y2, r) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [[-dx, x1 - r.x], [dx, r.x + r.w - x1], [-dy, y1 - r.y], [dy, r.y + r.h - y1]]) {
    if (p === 0) {
      if (q <= 0) return 0;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
  }
  return t1 > t0 ? (t1 - t0) * Math.hypot(dx, dy) : 0;
}

for (const id of MAP_IDS) {
  test(`lineOfSight vastaa tarkkaa geometriaa (${id})`, () => {
    setMap(id);
    const blocking = OBSTACLES.filter((r) => r.kind !== 'grave');
    const rnd = seededRandom(id.length * 101);
    const outside = () => {
      for (;;) {
        const x = rnd() * ARENA_W;
        const y = rnd() * ARENA_H;
        if (!OBSTACLES.some((r) => pointInRect(x, y, r))) return { x, y };
      }
    };
    let clear = 0;
    let blocked = 0;
    for (let i = 0; i < 1500; i++) {
      const a = outside();
      const b = outside();
      const chord = Math.max(0, ...blocking.map((r) => chordLength(a.x, a.y, b.x, b.y, r)));
      const los = lineOfSight(a.x, a.y, b.x, b.y);
      // Näytteet ovat enintään 8 px:n välein, joten sitä lyhyempi leikkaus voi jäädä huomaamatta.
      if (chord === 0) {
        assert.equal(los, true, `esteetön jana ${JSON.stringify([a, b])}`);
        clear++;
      } else if (chord > 8.01) {
        assert.equal(los, false, `este välissä ${JSON.stringify([a, b])}`);
        blocked++;
      }
    }
    assert.ok(clear > 0 && blocked > 0, `molempia tapauksia testattiin (${clear}/${blocked})`);
  });
}

test('lineOfSight: matalan hautakiven yli näkee, muun esteen läpi ei', () => {
  setMap('graveyard');
  const grave = OBSTACLES.find((r) => r.kind === 'grave');
  assert.ok(grave, 'hautausmaalla on hautakiviä');
  const cy = grave.y + grave.h / 2;
  // Jana kiven läpi ilman muita esteitä välissä
  const a = { x: grave.x - 4, y: cy };
  const b = { x: grave.x + grave.w + 4, y: cy };
  const others = OBSTACLES.filter((r) => r !== grave && r.kind !== 'grave');
  assert.ok(others.every((r) => chordLength(a.x, a.y, b.x, b.y, r) === 0));
  assert.equal(lineOfSight(a.x, a.y, b.x, b.y), true);

  const wall = OBSTACLES.find((r) => r.kind !== 'grave' && r.w > 20 && r.h > 20);
  const wy = wall.y + wall.h / 2;
  assert.equal(lineOfSight(wall.x - 4, wy, wall.x + wall.w + 4, wy), false);
});

test('lineOfSight: sama piste ja lyhyt jana ovat aina näkyvissä', () => {
  setMap('bunker');
  const r = OBSTACLES.find((o) => o.w > 20 && o.h > 20);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  assert.equal(lineOfSight(10, 10, 10, 10), true);
  // Alle 8 px:n jana ei tarkista yhtään välipistettä (nykyinen toiminta), vaikka se olisi esteen sisällä.
  assert.equal(lineOfSight(cx, cy, cx + 7, cy), true);
});
