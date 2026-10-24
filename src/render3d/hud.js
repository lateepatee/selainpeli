// HUD ja ruututekstit: 2D-canvaskerros 3D-kuvan päällä (pointer-events: none, style.css).
// Teksti piirretään ikkunan tarkkuudella, vaikka 3D-kuva on tarkoituksella matalaresoluutioinen.

import { TARGET_SCORE, WIN_POINTS, ZONE_DELAY, DASH_COOLDOWN_TICKS } from '../constants.js';
import { MAP_NAME } from '../map.js';
import { drawChat } from '../chat.js';
import { BOSS_NAME, BOSS_NAME_OBJECT } from '../boss.js';
import {
  WEAPONS, WALL_BUYS, BOX, findInteractable, MONEY_CAP,
  PERKS, PERK_IDS, PERK_MACHINES, RELOAD_PERK_MUL, maxHpOf, POWERUPS,
} from '../weapons.js';
import { worldToScreen } from './scene.js';

const FOG_COLOR = '#8bc34a';
const ZOMBIE_COLOR = '#7d9a52';
const ROUND_RED = '#b3121b';
const MONEY_COLOR = '#ffd54f';
const LANTERN_COLOR = '#ffb74d';
const RAGE_COLOR = '#ff3d2e';
const BOX_COLOR = '#8fc3ff';
const LABEL_H = 3.2;          // nimen korkeus hahmon yläpuolella (3D-yksikköä)

const moneyPopups = [];       // { amount, time }
let announcement = null;      // { text, color, time } iso ilmoitus ruudun yläosaan
let flash = 0;                // ydinpommin valkoinen välähdys
const killFeed = [];

// Tapahtumista HUDiin: rahat, ilmoitukset, tappoloki ja ydinpommin välähdys.
// Hiukkaset, osumapunerrus ja tärähdys ovat 3D-näkymässä (scene.js).
export function hudEvents(events, world, localId) {
  // Täynnä olevaan kukkaroon ei tule lisää, joten "+10"-ilmoituksiakaan ei näytetä.
  const capped = (world.players[localId]?.money ?? 0) >= MONEY_CAP;
  for (const e of events) {
    if (!capped && e.type === 'zhit' && e.by === localId) addMoneyPopup(10);
    if (!capped && e.type === 'zkill' && e.by === localId) addMoneyPopup(60);
    if (!capped && e.type === 'kill' && e.killer === localId) addMoneyPopup(200);
    if (e.type === 'pickup') {
      const def = POWERUPS[e.kind];
      if (e.by === localId) announce(`${def?.name}!`, def?.color);
      else announce(`${world.players[e.by]?.name || '?'} sai: ${def?.name}`, '#c0c6d4', true);
    } else if (e.type === 'nuke') {
      flash = 1;
    } else if (e.type === 'perk' && e.by === localId) {
      announce(PERKS[e.perk].name, PERKS[e.perk].color);
    } else if (e.type === 'bossSpawn') {
      announce('Jokin heräsi… Aselepo!', LANTERN_COLOR);
    } else if (e.type === 'bossRage') {
      announce('Lyhtymies raivostuu!', RAGE_COLOR);
    } else if (e.type === 'bossKill') {
      const killer = world.players[e.by];
      announce(killer ? `${killer.name} kaatoi ${BOSS_NAME_OBJECT}! Aselepo päättyi` : `${BOSS_NAME} kaatui!`, killer?.color || LANTERN_COLOR);
    } else if (e.type === 'kill') {
      killFeed.push({
        killer: e.killer ? world.players[e.killer] : null,
        cause: e.cause || 'player',
        victim: world.players[e.victim],
        time: performance.now(),
      });
      if (killFeed.length > 5) killFeed.shift();
    }
  }
}

function announce(text, color = '#fff', small = false) {
  announcement = { text, color, small, time: performance.now() };
}

function addMoneyPopup(amount) {
  const last = moneyPopups[moneyPopups.length - 1];
  // Samaan aikaan tulevat summat yhdistetään, ettei haulikko täytä ruutua.
  if (last && performance.now() - last.time < 120) last.amount += amount;
  else moneyPopups.push({ amount, time: performance.now() });
  if (moneyPopups.length > 8) moneyPopups.shift();
}

// seen = mitkä pelaajat ja tehosteet näkyvät katsojalle (scene.js).
export function drawHud(ctx, world, localId, w, h, dt, seen) {
  const me = world.players[localId];
  const inMatch = world.phase !== 'warmup';
  ctx.textBaseline = 'alphabetic';

  drawWorldLabels(ctx, world, seen, performance.now() / 1000);
  if (me?.alive && world.zone && outsideZone(me, world.zone)) drawFogWarning(ctx, w, h);
  if (flash > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${flash * 0.8})`;
    ctx.fillRect(0, 0, w, h);
    flash = Math.max(0, flash - dt * 1.2);
  }

  // Kierroslaskuri ja oma HP vasemmassa alakulmassa
  if (inMatch && world.round > 0) {
    ctx.font = '72px Creepster, Impact, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#00000088';
    ctx.fillText(String(world.round), 23, h - 63);
    ctx.fillStyle = ROUND_RED;
    ctx.fillText(String(world.round), 20, h - 66);
  }
  if (me) {
    ctx.font = '700 24px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = me.alive ? '#e6e9ef' : '#ff5252';
    ctx.fillText(`${Math.max(0, Math.ceil(me.hp))} HP`, 22, h - 24);
  }

  drawScoreboard(ctx, world, localId, w, inMatch);
  drawKillFeed(ctx);
  drawPhaseBanner(ctx, world, me, w, h);
  if (me?.alive) {
    drawLoadout(ctx, me, w, h);
    drawPrompt(ctx, world, me, w, h);
    drawPerksAndDash(ctx, me, h);
    drawActiveEffects(ctx, me, w, world.boss ? 84 : 0);
  }
  if (world.boss) drawBossBar(ctx, world.boss, w);
  drawAnnouncement(ctx, w, h);
  drawChat(ctx, h);

  // Ohje alhaalla keskellä
  ctx.font = '500 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#4a5162';
  ctx.fillText('WASD liiku · hiiri ampuu · Shift / oikea nappi väistää · R lataa · Q / rulla vaihtaa · E osta · Enter chat', w / 2, h - 12);
}

// Juodut juomat HP:n vieressä ja väistön latautuminen sen alla.
function drawPerksAndDash(ctx, me, h) {
  let x = 140;
  for (const id of PERK_IDS) {
    if (!me.perks?.[id]) continue;
    const perk = PERKS[id];
    ctx.beginPath();
    ctx.arc(x, h - 32, 11, 0, Math.PI * 2);
    ctx.fillStyle = '#111';
    ctx.fill();
    ctx.strokeStyle = perk.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = perk.color;
    ctx.font = '800 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(perk.short, x, h - 28);
    x += 28;
  }

  const ready = (me.dashCd ?? 0) <= 0;
  const frac = ready ? 1 : 1 - me.dashCd / DASH_COOLDOWN_TICKS;
  ctx.fillStyle = '#00000088';
  ctx.fillRect(22, h - 14, 90, 4);
  ctx.fillStyle = ready ? '#e6e9ef' : '#5c6476';
  ctx.fillRect(22, h - 14, 90 * frac, 4);
}

function drawActiveEffects(ctx, me, w, offset) {
  const parts = [];
  if (me.instaKill > 0) parts.push([`${POWERUPS.insta.name} ${Math.ceil(me.instaKill)} s`, POWERUPS.insta.color]);
  if (me.doubleMoney > 0) parts.push([`${POWERUPS.double.name} ${Math.ceil(me.doubleMoney)} s`, POWERUPS.double.color]);
  ctx.font = '700 16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  parts.forEach(([text, color], i) => {
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, 122 + offset + i * 22);
  });
}

function drawAnnouncement(ctx, w, h) {
  if (!announcement) return;
  const age = (performance.now() - announcement.time) / 1000;
  if (age > 2) {
    announcement = null;
    return;
  }
  ctx.globalAlpha = Math.min(1, 2 - age);
  ctx.textAlign = 'center';
  ctx.font = announcement.small ? '600 18px system-ui, sans-serif' : '44px Creepster, Impact, sans-serif';
  ctx.fillStyle = announcement.color;
  ctx.fillText(announcement.text, w / 2, h * 0.3);
  ctx.globalAlpha = 1;
}

// Oikea alakulma: raha, ase ja ammukset.
function drawLoadout(ctx, me, w, h) {
  const slot = me.slots?.[me.cur];
  const weapon = WEAPONS[slot?.id];
  if (!weapon) return;
  const mag = slot.mag ?? me.mag;
  const reserve = slot.reserve ?? me.reserve;
  const right = w - 24;

  ctx.textAlign = 'right';
  ctx.font = '700 26px system-ui, sans-serif';
  ctx.fillStyle = MONEY_COLOR;
  ctx.fillText(me.money >= MONEY_CAP ? `${me.money} $ (max)` : `${me.money} $`, right, h - 100);

  // Ansaitut rahat nousevat summan yläpuolelle ja haalistuvat.
  const now = performance.now();
  ctx.font = '700 16px system-ui, sans-serif';
  for (const m of moneyPopups) {
    const age = (now - m.time) / 1000;
    if (age > 1) continue;
    ctx.globalAlpha = 1 - age;
    ctx.fillText(`+${m.amount}`, right - 10, h - 130 - age * 30);
  }
  ctx.globalAlpha = 1;

  ctx.font = '600 15px system-ui, sans-serif';
  ctx.fillStyle = '#c0c6d4';
  const other = me.slots[1 - me.cur];
  ctx.fillText(other ? `${weapon.name}  ·  ${WEAPONS[other.id].name}` : weapon.name, right, h - 70);

  ctx.font = '700 30px system-ui, sans-serif';
  ctx.fillStyle = mag === 0 ? '#ff5252' : '#e6e9ef';
  const reserveText = Number.isFinite(reserve) ? reserve : '∞';
  ctx.fillText(`${mag} / ${reserveText}`, right, h - 34);

  if (me.reloadTimer > 0) {
    const frac = 1 - me.reloadTimer / (weapon.reload * (me.perks?.reload ? RELOAD_PERK_MUL : 1));
    ctx.fillStyle = '#00000088';
    ctx.fillRect(right - 140, h - 26, 140, 5);
    ctx.fillStyle = '#e6e9ef';
    ctx.fillRect(right - 140, h - 26, 140 * frac, 5);
  }
}

// Ruudun alalaidassa: mitä E tekee tässä kohdassa.
function drawPrompt(ctx, world, me, w, h) {
  const it = findInteractable(world, me);
  if (!it) return;
  const afford = me.money >= it.price;
  const text = it.kind === 'wait' ? it.label : afford ? `E – ${it.label}` : `${it.label} – rahaa ei riitä`;
  ctx.font = '600 18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = '#000000aa';
  ctx.fillRect(w / 2 - tw / 2 - 14, h - 150, tw + 28, 34);
  ctx.fillStyle = afford ? '#ffffff' : '#ff8a80';
  ctx.fillText(text, w / 2, h - 127);
}

function drawScoreboard(ctx, world, localId, w, inMatch) {
  const rows = Object.values(world.players).sort(inMatch
    ? (a, b) => b.score - a.score || b.kills - a.kills
    : (a, b) => b.kills - a.kills || a.deaths - b.deaths);
  const x0 = w - 250;
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.fillStyle = '#00000088';
  ctx.fillRect(x0, 52, 238, 28 + rows.length * 22);
  ctx.fillStyle = '#8a93a6';
  ctx.textAlign = 'left';
  ctx.fillText(inMatch ? `Pisteet (${world.targetScore ?? TARGET_SCORE})` : 'Lämmittely', x0 + 12, 72);
  ctx.textAlign = 'right';
  ctx.fillText(inMatch ? 'Pist.  Tap.  Zomb.' : 'K / D   Zomb.', w - 24, 72);
  rows.forEach((p, i) => {
    const y = 96 + i * 22;
    ctx.globalAlpha = inMatch && !p.alive ? 0.45 : 1;
    ctx.fillStyle = p.color;
    ctx.textAlign = 'left';
    ctx.fillText((p.id === localId ? '▸ ' : '') + p.name, x0 + 12, y);
    ctx.fillStyle = '#e6e9ef';
    ctx.textAlign = 'right';
    const z = String(p.zombieKills ?? 0).padStart(3, ' ');
    ctx.fillText(inMatch ? `${p.score}      ${p.kills}       ${z}` : `${p.kills} / ${p.deaths}      ${z}`, w - 24, y);
  });
  ctx.globalAlpha = 1;
}

function drawKillFeed(ctx) {
  const now = performance.now();
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.textAlign = 'left';
  let y = 72;
  for (const k of killFeed) {
    const age = (now - k.time) / 1000;
    if (age > 5) continue;
    ctx.globalAlpha = Math.min(1, 5 - age);
    let killerName = k.killer?.name || '?';
    let killerColor = k.killer?.color || '#fff';
    if (k.cause === 'zombie') {
      killerName = 'Zombi';
      killerColor = ZOMBIE_COLOR;
    } else if (k.cause === 'boss') {
      killerName = BOSS_NAME;
      killerColor = LANTERN_COLOR;
    } else if (k.cause === 'fog') {
      killerName = 'Myrkkysumu';
      killerColor = FOG_COLOR;
    }
    ctx.fillStyle = killerColor;
    ctx.fillText(killerName, 20, y);
    const kw = ctx.measureText(killerName + '  ').width;
    ctx.fillStyle = '#8a93a6';
    ctx.fillText('➜', 20 + kw, y);
    ctx.fillStyle = k.victim?.color || '#fff';
    ctx.fillText(k.victim?.name || '?', 20 + kw + ctx.measureText('➜  ').width, y);
    y += 22;
  }
  ctx.globalAlpha = 1;
}

function drawPhaseBanner(ctx, world, me, w, h) {
  const name = (id) => world.players[id]?.name || '?';
  const color = (id) => world.players[id]?.color || '#fff';
  ctx.textAlign = 'center';

  switch (world.phase) {
    case 'warmup':
      smallBanner(ctx, w, 'Lämmittely', 'Host aloittaa pelin, kun kaikki ovat paikalla');
      if (me && !me.alive) {
        centerBox(ctx, w, h, 'Kuolit', `Takaisin peliin ${Math.ceil(me.respawnTimer)} s`);
      }
      break;

    case 'countdown':
      // Yläosaan, ettei peitä omaa hahmoa ruudun keskellä.
      ctx.font = '120px Creepster, Impact, sans-serif';
      ctx.fillStyle = ROUND_RED;
      ctx.fillText(String(Math.max(1, Math.ceil(world.phaseTimer))), w / 2, 200);
      ctx.font = '600 22px system-ui, sans-serif';
      ctx.fillStyle = '#c0c6d4';
      ctx.fillText(me?.alive ? `Erä ${world.round} · ${MAP_NAME}` : `Erä ${world.round} · ${MAP_NAME} · liityt seuraavaan erään`, w / 2, 236);
      break;

    case 'playing': {
      const all = Object.values(world.players);
      const alive = all.filter((p) => p.alive).length;
      const z = world.zone;
      const fogText = !z ? '' : z.elapsed < ZONE_DELAY
        ? ` · sumu sulkeutuu ${Math.ceil(ZONE_DELAY - z.elapsed)} s` : ' · sumu sulkeutuu!';
      smallBanner(ctx, w, `Erä ${world.round} · ${MAP_NAME}`, `Elossa ${alive}/${all.length}${fogText}`);
      if (me && !me.alive) {
        ctx.font = '600 16px system-ui, sans-serif';
        ctx.fillStyle = '#c0c6d4';
        ctx.fillText('Kuolit – katsot muiden peliä seuraavaan erään asti', w / 2, h - 60);
      }
      break;
    }

    case 'roundEnd':
      if (world.roundWinner) {
        centerBox(ctx, w, h, `${name(world.roundWinner)} selvisi!`, `+${WIN_POINTS} pistettä`, color(world.roundWinner));
      } else {
        centerBox(ctx, w, h, 'Kukaan ei selvinnyt', 'Ei pisteitä tästä erästä');
      }
      break;

    case 'gameOver':
      drawGameOver(ctx, world, w, h);
      break;
  }
}

function smallBanner(ctx, w, title, sub) {
  ctx.textAlign = 'center';
  ctx.font = '700 18px system-ui, sans-serif';
  ctx.fillStyle = '#e6e9ef';
  ctx.fillText(title, w / 2, 72);
  ctx.font = '500 14px system-ui, sans-serif';
  ctx.fillStyle = '#8a93a6';
  ctx.fillText(sub, w / 2, 92);
}

function centerBox(ctx, w, h, title, sub, titleColor = '#fff') {
  ctx.fillStyle = '#000000aa';
  ctx.fillRect(0, h / 2 - 54, w, 108);
  ctx.textAlign = 'center';
  ctx.fillStyle = titleColor;
  ctx.font = '800 34px system-ui, sans-serif';
  ctx.fillText(title, w / 2, h / 2 - 6);
  ctx.font = '500 18px system-ui, sans-serif';
  ctx.fillStyle = '#c0c6d4';
  ctx.fillText(sub, w / 2, h / 2 + 28);
}

function drawGameOver(ctx, world, w, h) {
  const winner = world.players[world.matchWinner];
  const rows = Object.values(world.players).sort((a, b) => b.score - a.score);
  const boxH = 140 + rows.length * 28;
  const top = h / 2 - boxH / 2;

  ctx.fillStyle = '#000000c0';
  ctx.fillRect(0, top, w, boxH);
  ctx.textAlign = 'center';
  ctx.font = '52px Creepster, Impact, sans-serif';
  ctx.fillStyle = winner?.color || '#fff';
  ctx.fillText(`${winner?.name || '?'} voitti pelin!`, w / 2, top + 62);

  ctx.font = '600 18px system-ui, sans-serif';
  rows.forEach((p, i) => {
    const y = top + 110 + i * 28;
    ctx.textAlign = 'left';
    ctx.fillStyle = p.color;
    ctx.fillText(`${i + 1}. ${p.name}`, w / 2 - 190, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e6e9ef';
    ctx.fillText(`${p.score} p · ${p.wins} erää · ${p.kills} tappoa · ${p.zombieKills ?? 0} zombia`, w / 2 + 210, y);
  });
}

function drawVignette(ctx, w, h, color) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.7);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawFogWarning(ctx, w, h) {
  drawVignette(ctx, w, h, 'rgba(110, 170, 50, 0.45)');
  ctx.textAlign = 'center';
  ctx.font = '700 20px system-ui, sans-serif';
  ctx.fillStyle = FOG_COLOR;
  ctx.fillText('Myrkkysumu! Palaa sisään', w / 2, h - 90);
}

function outsideZone(p, z) {
  return Math.hypot(p.x - z.x, p.y - z.y) > z.r;
}

function drawBossBar(ctx, b, w) {
  const bw = Math.min(360, w - 80);
  const x = w / 2 - bw / 2;
  const y = 132;
  ctx.textAlign = 'center';
  ctx.font = '26px Creepster, Impact, sans-serif';
  ctx.fillStyle = b.enraged ? RAGE_COLOR : LANTERN_COLOR;
  ctx.fillText(b.enraged ? `${BOSS_NAME} – raivo` : BOSS_NAME, w / 2, y);
  ctx.fillStyle = '#000000aa';
  ctx.fillRect(x, y + 8, bw, 10);
  ctx.fillStyle = b.state === 'counter' ? '#ffffff' : '#c62828';
  ctx.fillRect(x, y + 8, bw * Math.max(0, b.hp / b.maxHp), 10);
  ctx.strokeStyle = '#ffb74d88';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y + 8, bw, 10);
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillStyle = '#e6e9ef';
  ctx.fillText('Aselepo: pelaajat eivät voi vahingoittaa toisiaan', w / 2, y + 36);
}

function drawPlayerLabel(ctx, p, x, y) {
  const s = worldToScreen(x, y, LABEL_H);
  if (!s) return;
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#000000aa';
  ctx.fillText(p.name, s.x + 1, s.y - 7);
  ctx.fillStyle = '#e6e9ef';
  ctx.fillText(p.name, s.x, s.y - 8);

  const bw = 36;
  const bx = s.x - bw / 2;
  const by = s.y - 3;
  ctx.fillStyle = '#00000088';
  ctx.fillRect(bx, by, bw, 4);
  const frac = Math.max(0, Math.min(1, p.hp / maxHpOf(p)));
  ctx.fillStyle = frac > 0.5 ? '#7bd88f' : frac > 0.25 ? '#ffd54f' : '#ff5252';
  ctx.fillRect(bx, by, bw * frac, 4);
}

function hexAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// --- Maailmaan kiinnitetyt tekstit ---

// Ostopaikat näkyvät himmeinä myös pimeässä, kuten ennenkin. Pelaajat ja tehosteet vain näkyessään.
function drawWorldLabels(ctx, world, seen, t) {
  ctx.textAlign = 'center';
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(235, 235, 220, 0.6)';
  for (const b of WALL_BUYS) {
    const s = worldToScreen(b.x, b.y, 0);
    if (s) ctx.fillText(`${WEAPONS[b.weapon].name} ${b.price} $`, s.x, s.y + 22);
  }
  for (const m of PERK_MACHINES) drawMachineLabel(ctx, m);
  if (BOX) drawBoxLabel(ctx, world.box, t);
  for (const pu of seen?.seenPowerups ?? []) {
    const def = POWERUPS[pu.type];
    const s = def && worldToScreen(pu.x, pu.y, 1.4);
    if (!s) continue;
    ctx.font = '800 13px system-ui, sans-serif';
    ctx.fillStyle = def.color;
    ctx.fillText(def.short, s.x, s.y);
  }
  for (const { p, x, y } of seen?.seenPlayers ?? []) drawPlayerLabel(ctx, p, x, y);
}

function drawMachineLabel(ctx, m) {
  const perk = PERKS[m.perk];
  const top = worldToScreen(m.x, m.y, 2.4);
  const foot = worldToScreen(m.x, m.y, 0);
  if (!top || !foot) return;
  ctx.textAlign = 'center';
  ctx.fillStyle = perk.color;
  ctx.font = '800 18px system-ui, sans-serif';
  ctx.fillText(perk.short, top.x, top.y);
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillStyle = hexAlpha(perk.color, 0.85);
  ctx.fillText(`${perk.name} ${perk.price} $`, foot.x, foot.y + 30);
}

function drawBoxLabel(ctx, box, t) {
  const s = worldToScreen(BOX.x, BOX.y, 1.3);
  if (!s) return;
  ctx.textAlign = 'center';
  ctx.fillStyle = BOX_COLOR;
  ctx.font = '700 16px system-ui, sans-serif';
  ctx.fillText('?', s.x, s.y);
  if (!box || box.state === 'idle') return;
  let label;
  if (box.state === 'spinning') {
    const ids = Object.keys(WEAPONS).filter((id) => id !== 'pistol');
    label = WEAPONS[ids[Math.floor(t * 12) % ids.length]].name;
  } else {
    label = WEAPONS[box.weapon]?.name ?? '?';
  }
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.fillStyle = box.state === 'ready' ? '#ffffff' : BOX_COLOR;
  ctx.fillText(label, s.x, s.y - 22);
  if (box.state === 'ready') {
    const frac = Math.max(0, Math.min(1, box.timer / 8));
    ctx.fillStyle = '#00000088';
    ctx.fillRect(s.x - 30, s.y - 16, 60, 4);
    ctx.fillStyle = BOX_COLOR;
    ctx.fillRect(s.x - 30, s.y - 16, 60 * frac, 4);
  }
}
