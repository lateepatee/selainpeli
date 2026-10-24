// Testitila: vie hostin suoraan myöhäiseen peliin. Aktivoituu vain localhostissa osoitteella ?testi=1,
// joten julkinen Pages-peli ei koskaan lue näitä parametreja. Vain host kutsuu tätä (liittyjä ei).
// Simulaatiomoduuleihin ei koske: tila asetetaan world-olioon startMatchin jälkeen.

import { MAP_IDS } from './maps.js';
import { MONEY_CAP } from './weapons.js';
import { BOSS_SPAWN_TIME } from './boss.js';
import { MAX_PLAYERS } from './protocol.js';

const LOCAL_HOSTS = ['localhost', '127.0.0.1'];
const MAX_ROUND = 99;
const MAX_SPEED = 8;

function intParam(params, key, min, max) {
  const raw = params.get(key);
  if (raw === null || !/^\d+$/.test(raw)) return null;
  return Math.min(max, Math.max(min, Number(raw)));
}

// Palauttaa asetukset tai null, kun testitila ei ole päällä.
export function readTestConfig(loc = globalThis.location) {
  if (!loc || !LOCAL_HOSTS.includes(loc.hostname)) return null;
  const params = new URLSearchParams(loc.search);
  if (params.get('testi') !== '1') return null;

  const raha = params.get('raha');
  const kentta = params.get('kentta');
  const cfg = {
    era: intParam(params, 'era', 1, MAX_ROUND),
    raha: raha === 'max' ? MONEY_CAP : intParam(params, 'raha', 0, MONEY_CAP),
    bossi: params.get('bossi') === '1',
    kentta: MAP_IDS.includes(kentta) ? kentta : null,
    nopeus: intParam(params, 'nopeus', 1, MAX_SPEED),
    botit: intParam(params, 'botit', 0, MAX_PLAYERS - 1),
    katsele: params.get('katsele') === '1',
  };
  cfg.label = ['testi=1', ...Object.entries(cfg)
    .filter(([k, v]) => v && v !== null)
    .map(([k, v]) => (v === true ? `${k}=1` : `${k}=${v}`))].join(' ');
  return cfg;
}

// Kutsutaan heti startMatchin jälkeen (erä 1, lähtölaskenta).
export function applyTestState(world, cfg) {
  if (cfg.era) world.round = cfg.era;
  if (cfg.raha !== null) for (const p of Object.values(world.players)) p.money = cfg.raha;
  if (cfg.bossi) {
    world.bossPlanned = true;
    // Bossi syntyy, kun sumun kello on kulunut BOSS_SPAWN_TIME: hypätään siihen, jolloin se tulee heti.
    if (world.zone) world.zone.elapsed = BOSS_SPAWN_TIME;
  }
}

// Kenttä valitaan startRoundissa Math.randomilla; ohjataan vain sen ensimmäinen arvonta.
// Muuten kenttä pitäisi vaihtaa kesken erän, jolloin pelaajat voisivat jäädä esteisiin.
export function startMatchOnMap(startMatch, world, mapId) {
  if (!mapId) return startMatch(world);
  const real = Math.random;
  world.mapId = null; // ettei mikään kenttä ole poissuljettu
  Math.random = () => {
    Math.random = real;
    return (MAP_IDS.indexOf(mapId) + 0.5) / MAP_IDS.length;
  };
  try {
    return startMatch(world);
  } finally {
    Math.random = real;
  }
}

// Pieni merkki kulmaan, ettei testitilaa sekoita oikeaan peliin.
export function showBadge(cfg) {
  const el = document.createElement('div');
  el.id = 'testitila';
  el.textContent = `TESTITILA ${cfg.label}`;
  Object.assign(el.style, {
    position: 'fixed', right: '6px', bottom: '6px', zIndex: '50', pointerEvents: 'none',
    font: '11px monospace', color: '#ffd24a', background: 'rgba(0,0,0,0.6)', padding: '2px 6px',
  });
  document.body.append(el);
  return () => el.remove();
}
