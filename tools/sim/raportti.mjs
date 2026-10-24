// Simulaattorin raportti: kerätyistä tilastoista tiivistelmä (JSON) ja sen tekstimuoto.

import { WIN_POINTS, KILL_POINTS } from '../../src/constants.js';
import { WEAPONS, PERKS, POWERUPS, MONEY_CAP } from '../../src/weapons.js';
import { BOSS_CHANCE, BOSS_MIN_ROUND, BOSS_KILL_POINTS } from '../../src/boss.js';
import { MAPS } from '../../src/maps.js';

const round1 = (x) => Math.round(x * 10) / 10;
const share = (a, b) => (b > 0 ? round1((100 * a) / b) : null);

function describe(values) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const at = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return {
    mean: round1(s.reduce((sum, v) => sum + v, 0) / s.length),
    median: round1(at(0.5)),
    p10: round1(at(0.1)),
    p90: round1(at(0.9)),
    min: round1(s[0]),
    max: round1(s[s.length - 1]),
  };
}

const NOTES = [
  'Tappojen ase päätellään tappajan viimeksi ampuman laukauksen aseesta, koska kill- ja zkill-tapahtumissa ei ole asetta. Botit eivät vaihda asetta, joten virhe syntyy vain, jos ase vaihtuu ostoksella ammuksen ollessa ilmassa.',
  'Ydinpommin tuhoamista zombeista ei tule zkill-tapahtumaa, joten ne puuttuvat zombitapoista.',
  'Katon yli menevää rahaa ei voi mitata ilman pelikoodin muutosta (addMoney ei kerro hävikistä). Raha luetaan maailman tilasta erän lopussa.',
  'Botit (bot.js) ostavat vain seinäaseita ja vain, kun toinen asepaikka on tyhjä. Arpalaatikkoa ja juomia ne eivät tavoittele, joten niiden luvut ovat vain vahinkopainalluksia eivätkä kerro tasapainosta.',
  'Ajat ovat pelin sisäistä aikaa. Ottelun kesto sisältää lähtölaskennat ja erien tulosnäytöt, ei lopputulosnäyttöä.',
];

export function summarize(stats, settings) {
  const matches = stats.matches;
  const done = matches.filter((m) => !m.timeout);
  const rounds = stats.rounds;

  const byMap = {};
  for (const r of rounds) (byMap[r.map] || (byMap[r.map] = [])).push(r.duration);

  const totalDeaths = Object.values(stats.deaths).reduce((a, b) => a + b, 0);
  const eligible = rounds.filter((r) => r.round >= BOSS_MIN_ROUND);
  const spawned = rounds.filter((r) => r.bossSpawned);
  const killed = spawned.filter((r) => r.bossKilled);

  const money = stats.moneyAtRoundEnd;
  const byRound = {};
  for (const m of money) (byRound[m.round] || (byRound[m.round] = [])).push(m.money);

  const wp = stats.winnerPoints;
  const winnerTotal = wp.roundWins * WIN_POINTS + wp.kills * KILL_POINTS + wp.boss * BOSS_KILL_POINTS;

  const weapons = {};
  for (const id of Object.keys(WEAPONS)) {
    const w = stats.weapons[id];
    if (!w) continue;
    weapons[id] = {
      name: WEAPONS[id].name,
      shots: w.shots,
      heldShare: share(w.heldTicks, stats.aliveTicks),
      playerKills: w.playerKills,
      zombieKills: w.zombieKills,
      bossKills: w.bossKills,
    };
  }

  const powerups = {};
  for (const id of Object.keys(POWERUPS)) {
    const p = stats.powerups[id] || { dropped: 0, picked: 0 };
    powerups[id] = { name: POWERUPS[id].name, dropped: p.dropped, picked: p.picked, pickedShare: share(p.picked, p.dropped) };
  }

  return {
    settings,
    matches: {
      count: matches.length,
      timeouts: matches.length - done.length,
      durationSec: describe(done.map((m) => m.duration)),
      playingSec: describe(done.map((m) => m.playing)),
      rounds: describe(done.map((m) => m.rounds)),
    },
    rounds: {
      count: rounds.length,
      ties: rounds.filter((r) => r.winner === null).length,
      durationSec: describe(rounds.map((r) => r.duration)),
      deaths: describe(rounds.map((r) => r.deaths)),
      byMap: Object.fromEntries(Object.keys(MAPS).filter((id) => byMap[id]).map((id) => [id, {
        name: MAPS[id].name, rounds: byMap[id].length, durationSec: describe(byMap[id]),
      }])),
    },
    wins: {
      players: Object.entries(stats.players).map(([id, p]) => ({
        id,
        name: p.name,
        matchWins: p.matchWins,
        matchWinShare: share(p.matchWins, done.length),
        roundWins: p.roundWins,
        roundWinShare: share(p.roundWins, rounds.length),
        meanScore: matches.length ? round1(p.score / matches.length) : null,
        kills: p.kills,
        zombieKills: p.zombieKills,
        bossKills: p.bossKills,
      })),
      winnerScore: describe(done.map((m) => m.winnerScore)),
      runnerUpScore: describe(stats.runnerUpScores),
      // Mistä voittajan pisteet tulevat (osuus kaikista voittajien pisteistä).
      winnerPointsShare: {
        roundWins: share(wp.roundWins * WIN_POINTS, winnerTotal),
        kills: share(wp.kills * KILL_POINTS, winnerTotal),
        boss: share(wp.boss * BOSS_KILL_POINTS, winnerTotal),
      },
    },
    deaths: {
      total: totalDeaths,
      byCause: Object.fromEntries(Object.entries(stats.deaths).map(([k, v]) => [k, { count: v, share: share(v, totalDeaths) }])),
    },
    boss: {
      chance: BOSS_CHANCE,
      minRound: BOSS_MIN_ROUND,
      eligibleRounds: eligible.length,
      planned: rounds.filter((r) => r.bossPlanned).length,
      spawned: spawned.length,
      spawnShareAll: share(spawned.length, rounds.length),
      spawnShareEligible: share(spawned.length, eligible.length),
      killed: killed.length,
      killShare: share(killed.length, spawned.length),
      killTimeSec: describe(killed.map((r) => r.bossKillTime)),
      playerDeaths: stats.deaths.boss || 0,
    },
    money: {
      cap: MONEY_CAP,
      roundEnd: describe(money.map((m) => m.money)),
      atCapShare: share(money.filter((m) => m.money >= MONEY_CAP).length, money.length),
      byRound: Object.keys(byRound).map(Number).sort((a, b) => a - b).map((r) => ({
        round: r,
        samples: byRound[r].length,
        mean: round1(byRound[r].reduce((a, b) => a + b, 0) / byRound[r].length),
        atCapShare: share(byRound[r].filter((m) => m >= MONEY_CAP).length, byRound[r].length),
      })),
    },
    purchases: {
      playerRounds: stats.playerRounds,
      wall: stats.wall,
      wallTotal: Object.values(stats.wall).reduce((a, b) => a + b, 0),
      ammo: stats.ammo,
      box: stats.box,
      perks: Object.fromEntries(Object.keys(PERKS).map((id) => [id, stats.perks[id] || 0])),
      secondWeaponShare: share(stats.secondWeaponRounds, stats.playerRounds),
    },
    weapons,
    powerups,
    notes: NOTES,
  };
}

// --- Tekstimuoto ---

const num = (x) => (x === null || x === undefined ? '–' : String(x).replace('.', ','));
const pct = (x) => (x === null || x === undefined ? '–' : `${num(x)} %`);

function clock(sec) {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function line(label, d, fmt = num) {
  if (!d) return `  ${label}: –`;
  return `  ${label}: ka ${fmt(d.mean)}, mediaani ${fmt(d.median)}, p10–p90 ${fmt(d.p10)}–${fmt(d.p90)}, min–max ${fmt(d.min)}–${fmt(d.max)}`;
}

function table(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const fmt = (r) => `  ${r.map((c, i) => (i === 0 ? String(c).padEnd(widths[i]) : String(c).padStart(widths[i]))).join('  ')}`;
  return [fmt(headers), ...rows.map(fmt)].join('\n');
}

export function formatText(r) {
  const s = r.settings;
  const out = [];
  const add = (...lines) => out.push(...lines);
  const sec = (x) => `${num(x)} s`;

  add('Zombiareena: tasapainoraportti',
    `Otteluita ${s.matches}, botteja ${s.bots}, pisteraja ${s.target}, siemen ${s.seed}, `
    + `kenttä ${s.map ? `${MAPS[s.map].name} (pakotettu)` : 'vaihtuu joka erässä'}`,
    '');

  add('Ottelut',
    line('Kesto', r.matches.durationSec, clock),
    line('Pelivaiheen aika', r.matches.playingSec, clock),
    line('Eriä per ottelu', r.matches.rounds),
    `  Aikakatkaisut: ${r.matches.timeouts}`,
    '');

  add('Erät',
    `  Eriä yhteensä ${r.rounds.count}, tasapelejä (kaikki kuolivat samalla tickillä) ${r.rounds.ties}`,
    line('Kesto', r.rounds.durationSec, sec),
    line('Kuolemia per erä', r.rounds.deaths),
    ...Object.values(r.rounds.byMap).map((m) => `  ${m.name}: ${m.rounds} erää, kesto ka ${sec(m.durationSec.mean)}, mediaani ${sec(m.durationSec.median)}`),
    '');

  add('Voitot',
    table(['Pelaaja', 'Ottelut', 'Osuus', 'Erät', 'Osuus', 'Pisteet ka', 'Tapot', 'Zombit', 'Bossit'],
      r.wins.players.map((p) => [p.name, p.matchWins, pct(p.matchWinShare), p.roundWins, pct(p.roundWinShare),
        num(p.meanScore), p.kills, p.zombieKills, p.bossKills])),
    line('Voittajan pisteet', r.wins.winnerScore),
    line('Toiseksi tulleen pisteet', r.wins.runnerUpScore),
    `  Voittajan pisteistä: erävoitot ${pct(r.wins.winnerPointsShare.roundWins)}, tapot ${pct(r.wins.winnerPointsShare.kills)}, `
    + `bossit ${pct(r.wins.winnerPointsShare.boss)}`,
    '');

  const causes = { player: 'Pelaaja', zombie: 'Zombi', fog: 'Sumu', boss: 'Bossi' };
  add('Kuolinsyyt',
    table(['Syy', 'Kuolemia', 'Osuus'], Object.entries(r.deaths.byCause).map(([k, v]) => [causes[k] || k, v.count, pct(v.share)])),
    '');

  const b = r.boss;
  add('Bossi (Lyhtymies)',
    `  Ilmestyi ${b.spawned}/${r.rounds.count} erässä (${pct(b.spawnShareAll)}); erästä ${b.minRound} alkaen `
    + `${b.spawned}/${b.eligibleRounds} (${pct(b.spawnShareEligible)}), todennäköisyys ${pct(b.chance * 100)}`,
    `  Arvottu ${b.planned} erään, ei ehtinyt ilmestyä ${b.planned - b.spawned} erässä`,
    `  Kaadettu ${b.killed}/${b.spawned} (${pct(b.killShare)})`,
    line('Aika ilmestymisestä kaatoon', b.killTimeSec, sec),
    `  Bossin tappamia pelaajia: ${b.playerDeaths}`,
    '');

  const m = r.money;
  add(`Raha erän lopussa (katto ${m.cap} $)`,
    line('Raha', m.roundEnd, (x) => `${num(x)} $`),
    `  Katossa: ${pct(m.atCapShare)}`,
    table(['Erä', 'Näytteitä', 'Raha ka', 'Katossa'], m.byRound.map((x) => [x.round, x.samples, `${num(x.mean)} $`, pct(x.atCapShare)])),
    '');

  const pu = r.purchases;
  add('Ostot',
    `  Seinäaseet: ${pu.wallTotal} (${Object.entries(pu.wall).map(([id, n]) => `${WEAPONS[id].name} ${n}`).join(', ') || 'ei yhtään'})`,
    `  Ammuksia seinästä: ${pu.ammo}`,
    `  Arpalaatikko: avattu ${pu.box.opened}, otettu ${pu.box.taken}`
    + (pu.box.opened ? ` (${Object.entries(pu.box.rolled).map(([id, n]) => `${WEAPONS[id].name} ${n}`).join(', ')})` : ''),
    `  Juomat: ${Object.entries(pu.perks).map(([id, n]) => `${PERKS[id].name} ${n}`).join(', ')}`,
    `  Toinen ase erän lopussa: ${pct(pu.secondWeaponShare)} pelaaja-eristä (${pu.playerRounds})`,
    '');

  add('Aseet',
    table(['Ase', 'Laukaukset', 'Hallussa', 'Pelaajatapot', 'Zombitapot', 'Bossin kaadot'],
      Object.values(r.weapons).map((w) => [w.name, w.shots, pct(w.heldShare), w.playerKills, w.zombieKills, w.bossKills])),
    '  Hallussa = osuus elossaoloajasta erän pelivaiheessa.',
    '');

  add('Tehosteet',
    table(['Tehoste', 'Pudonnut', 'Poimittu', 'Osuus'],
      Object.values(r.powerups).map((p) => [p.name, p.dropped, p.picked, pct(p.pickedShare)])),
    '');

  add('Rajoitukset', ...r.notes.map((n) => `  - ${n}`), '');
  return out.join('\n');
}
