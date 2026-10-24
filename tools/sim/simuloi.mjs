// Tasapainosimulaattori: pelaa otteluita pelkillä boteilla ilman selainta ja tulostaa raportin.
// Käyttö: node tools/sim/simuloi.mjs [--matches N] [--bots N] [--seed N] [--target 10|20|30]
//         [--map <id>] [--json] [--out <polku>]   (ohje: tools/sim/README.md)

import { parseArgs } from 'node:util';
import { writeFileSync } from 'node:fs';

// --- Siemenellinen satunnaisuus ---
// Math.random korvataan ennen pelimoduulien latausta, jotta jokainen satunnaisluku tulee tästä.
// Jokainen ottelu saa oman siemenensä, joten ottelu N on sama riippumatta otteluiden määrästä.

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function matchSeed(seed, index) {
  let h = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

let random = mulberry32(1);
Math.random = () => random();

// --- Valinnat ---

function fail(msg) {
  process.stderr.write(`simuloi: ${msg}\n`);
  process.exit(2);
}

let args;
try {
  ({ values: args } = parseArgs({
    options: {
      matches: { type: 'string', default: '20' },
      bots: { type: 'string', default: '4' },
      seed: { type: 'string' },
      target: { type: 'string' },
      map: { type: 'string' },
      json: { type: 'boolean', default: false },
      out: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  }));
} catch (e) {
  fail(e.message);
}

if (args.help) {
  process.stdout.write('node tools/sim/simuloi.mjs [--matches N] [--bots 2-6] [--seed N] '
    + '[--target 10|20|30] [--map <id>] [--json] [--out <polku>]\nOhje: tools/sim/README.md\n');
  process.exit(0);
}

const src = (name) => new URL(`../../src/${name}`, import.meta.url).href;
const { createWorld, addPlayer, startMatch, step, setTargetScore } = await import(src('game.js'));
const { botInput, forgetBot } = await import(src('bot.js'));
const { TICK, PLAYER_COLORS, TARGET_SCORE, TARGET_SCORE_OPTIONS } = await import(src('constants.js'));
const { setMap } = await import(src('map.js'));
const { MAP_IDS, DEFAULT_MAP } = await import(src('maps.js'));
const { MAX_PLAYERS } = await import(src('protocol.js'));
// Raportti tuo pelin vakioita, joten sekin ladataan vasta Math.randomin korvaamisen jälkeen.
const { summarize, formatText } = await import('./raportti.mjs');

function intArg(name, min, max) {
  const n = Number(args[name]);
  if (!Number.isInteger(n) || n < min || n > max) fail(`--${name} pitää olla kokonaisluku ${min}–${max}`);
  return n;
}

const matches = intArg('matches', 1, 100000);
const bots = intArg('bots', 2, MAX_PLAYERS);
// Ilman --seed siemen arvotaan ja tulostetaan raporttiin, jotta ajon voi toistaa.
const seed = args.seed === undefined ? (Date.now() % 1000000) : intArg('seed', 0, 0xffffffff);
const target = args.target === undefined ? TARGET_SCORE : Number(args.target);
if (!TARGET_SCORE_OPTIONS.includes(target)) fail(`--target pitää olla ${TARGET_SCORE_OPTIONS.join(', ')}`);
const allMaps = [...MAP_IDS];
const forcedMap = args.map ?? null;
if (forcedMap !== null && !allMaps.includes(forcedMap)) fail(`tuntematon kenttä "${forcedMap}" (${allMaps.join(', ')})`);

// Kentän pakotus: game.js arpoo seuraavan kentän MAP_IDS-listasta ilman nykyistä kenttää.
// Kun listassa on vain pakotettu kenttä ja world.mapId tyhjennetään ennen erän alkua,
// arvonta päätyy aina siihen. Pelikoodia ei muuteta, mutta tämä nojaa nextMapin toteutukseen.
if (forcedMap) MAP_IDS.splice(0, MAP_IDS.length, forcedMap);

// Ottelu katkaistaan, jos se venyy järjettömän pitkäksi (pelin sisäistä aikaa).
const MATCH_TIME_LIMIT = 3 * 3600;

// --- Tilastojen keruu ---

const stats = {
  matches: [],      // { duration, playing, rounds, winner, timeout, scores }
  rounds: [],       // { match, round, map, duration, winner, deaths, bossPlanned, bossSpawned, bossKilled, bossKillTime }
  deaths: { player: 0, zombie: 0, fog: 0, boss: 0 },
  moneyAtRoundEnd: [], // { round, money }
  players: {},      // id -> { name, matchWins, roundWins, score, kills, zombieKills, bossKills }
  wall: {},         // ase -> ostot
  ammo: 0,
  box: { opened: 0, taken: 0, rolled: {} },
  perks: {},
  playerRounds: 0,
  secondWeaponRounds: 0,
  weapons: {},      // ase -> { shots, heldTicks, playerKills, zombieKills, bossKills }
  aliveTicks: 0,
  powerups: {},     // tyyppi -> { dropped, picked }
  winnerPoints: { roundWins: 0, kills: 0, boss: 0 },
  runnerUpScores: [],
};

const weaponStat = (id) => stats.weapons[id] || (stats.weapons[id] = {
  shots: 0, heldTicks: 0, playerKills: 0, zombieKills: 0, bossKills: 0,
});
const powerupStat = (id) => stats.powerups[id] || (stats.powerups[id] = { dropped: 0, picked: 0 });
const inc = (obj, key) => { obj[key] = (obj[key] || 0) + 1; };

const botIds = Array.from({ length: bots }, (_, i) => `bot${i + 1}`);
for (const [i, id] of botIds.entries()) {
  stats.players[id] = { name: `Botti ${i + 1}`, matchWins: 0, roundWins: 0, score: 0, kills: 0, zombieKills: 0, bossKills: 0 };
}

function playMatch(index) {
  random = mulberry32(matchSeed(seed, index));
  // Moduulien tila nollataan, jotta ottelu ei riipu edellisistä.
  for (const id of botIds) forgetBot(id);
  setMap(DEFAULT_MAP);

  const world = createWorld();
  setTargetScore(world, target);
  for (const [i, id] of botIds.entries()) addPlayer(world, id, stats.players[id].name, PLAYER_COLORS[i]);
  if (forcedMap) world.mapId = null;
  startMatch(world);

  // Tappojen ase: kill- ja zkill-tapahtumissa ei ole asetta, joten käytetään tappajan
  // viimeksi ampuman laukauksen asetta (botit eivät vaihda asetta, ammus elää alle 1,2 s).
  const lastWeapon = {};
  const bossKills = {};
  let roundStart = 0;
  let round = null;
  let seenPowerup = 0;
  let playing = 0;

  while (world.phase !== 'gameOver' && world.time < MATCH_TIME_LIMIT) {
    if (forcedMap && world.phase === 'roundEnd') world.mapId = null;

    const inputs = {};
    for (const id of botIds) inputs[id] = botInput(world, id, TICK);

    // Ostojen tunnistus vaatii tilan ennen tickiä: buy-tapahtuma ei kerro, mitä ostettiin.
    const before = {};
    for (const id of botIds) before[id] = world.players[id].slots.map((s) => s?.id ?? null).join();
    const boxBefore = { ...world.box };

    const events = step(world, inputs, TICK);
    const t = world.time;

    if (world.phase === 'playing') {
      playing += TICK;
      for (const id of botIds) {
        const p = world.players[id];
        if (!p.alive) continue;
        stats.aliveTicks++;
        weaponStat(p.slots[p.cur].id).heldTicks++;
      }
    }

    for (const pu of world.powerups) {
      if (pu.id <= seenPowerup) continue;
      seenPowerup = pu.id;
      powerupStat(pu.type).dropped++;
    }

    for (const e of events) {
      switch (e.type) {
        case 'roundStart':
          roundStart = t;
          round = {
            match: index + 1, round: e.round, map: world.mapId, duration: 0, winner: null, deaths: 0,
            bossPlanned: world.bossPlanned, bossSpawned: false, bossKilled: false, bossKillTime: null, bossSpawnAt: 0,
          };
          break;
        case 'shot':
          lastWeapon[e.by] = e.w;
          weaponStat(e.w).shots++;
          break;
        case 'kill':
          stats.deaths[e.cause] = (stats.deaths[e.cause] || 0) + 1;
          if (round) round.deaths++;
          if (e.killer) weaponStat(lastWeapon[e.killer] ?? 'pistol').playerKills++;
          break;
        case 'zkill':
          if (e.by && world.players[e.by]) weaponStat(lastWeapon[e.by] ?? 'pistol').zombieKills++;
          break;
        case 'bossSpawn':
          if (round) {
            round.bossSpawned = true;
            round.bossSpawnAt = t;
          }
          break;
        case 'bossKill':
          if (world.players[e.by]) {
            weaponStat(lastWeapon[e.by] ?? 'pistol').bossKills++;
            bossKills[e.by] = (bossKills[e.by] || 0) + 1;
          }
          if (round) {
            round.bossKilled = true;
            round.bossKillTime = t - round.bossSpawnAt;
          }
          break;
        case 'buy': {
          const p = world.players[e.id];
          const after = p.slots.map((s) => s?.id ?? null).join();
          if (boxBefore.state === 'ready' && boxBefore.owner === e.id && world.box.state === 'idle') {
            stats.box.taken++;
          } else if (after !== before[e.id]) {
            inc(stats.wall, p.slots[p.cur].id);
          } else {
            stats.ammo++;
          }
          break;
        }
        case 'boxOpen':
          stats.box.opened++;
          inc(stats.box.rolled, world.box.weapon);
          break;
        case 'perk':
          inc(stats.perks, e.perk);
          break;
        case 'pickup':
          powerupStat(e.kind).picked++;
          break;
        case 'roundEnd':
          if (round) {
            round.duration = t - roundStart;
            round.winner = e.winner;
            delete round.bossSpawnAt;
            stats.rounds.push(round);
          }
          if (e.winner) stats.players[e.winner].roundWins++;
          for (const id of botIds) {
            const p = world.players[id];
            stats.moneyAtRoundEnd.push({ round: world.round, money: p.money });
            stats.playerRounds++;
            if (p.slots[1]) stats.secondWeaponRounds++;
          }
          round = null;
          break;
        default:
      }
    }
  }

  const timeout = world.phase !== 'gameOver';
  const ranked = botIds.map((id) => world.players[id]).sort((a, b) => b.score - a.score);
  for (const p of ranked) {
    const s = stats.players[p.id];
    s.score += p.score;
    s.kills += p.kills;
    s.zombieKills += p.zombieKills;
    s.bossKills += bossKills[p.id] || 0;
  }
  if (!timeout) {
    const w = world.players[world.matchWinner];
    stats.players[w.id].matchWins++;
    stats.winnerPoints.roundWins += w.wins;
    stats.winnerPoints.kills += w.kills;
    stats.winnerPoints.boss += bossKills[w.id] || 0;
    stats.runnerUpScores.push(ranked[1].score);
  }
  stats.matches.push({
    duration: world.time,
    playing,
    rounds: world.round,
    winner: timeout ? null : world.matchWinner,
    winnerScore: timeout ? null : world.players[world.matchWinner].score,
    timeout,
  });
}

const started = process.hrtime.bigint();
const progress = process.stderr.isTTY;
for (let i = 0; i < matches; i++) {
  if (progress) process.stderr.write(`\rOttelu ${i + 1}/${matches}…`);
  playMatch(i);
}
if (progress) process.stderr.write('\r\x1b[K');
const elapsed = Number(process.hrtime.bigint() - started) / 1e9;

const settings = { matches, bots, seed, target, map: forcedMap, maps: forcedMap ? [forcedMap] : allMaps };
const report = summarize(stats, settings);
const output = args.json ? `${JSON.stringify(report, null, 2)}\n` : formatText(report);

if (args.out) {
  writeFileSync(args.out, output);
  process.stderr.write(`Raportti kirjoitettu: ${args.out}\n`);
} else {
  process.stdout.write(output);
}
// Ajoaika vain stderriin, jotta sama siemen antaa merkki merkiltä saman raportin.
process.stderr.write(`Simuloitu ${matches} ottelua ${elapsed.toFixed(1)} sekunnissa.\n`);
