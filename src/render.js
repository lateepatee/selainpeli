// Piirtäminen ja visuaaliset efektit. Ei vaikuta pelin tilaan.

import {
  ARENA_W, ARENA_H, OBSTACLES, VIEW_W, VIEW_H,
  PLAYER_RADIUS, PLAYER_HP, BULLET_RADIUS,
  TARGET_SCORE, WIN_POINTS, ZONE_DELAY,
} from './constants.js';

const particles = [];
const killFeed = [];
const ZONE_COLOR = '#ff5252';

export const camera = { x: ARENA_W / 2, y: ARENA_H / 2, zoom: 1 };

export function resize(canvas) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  camera.zoom = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
}

export function screenToWorld(sx, sy) {
  return {
    x: (sx - window.innerWidth / 2) / camera.zoom + camera.x,
    y: (sy - window.innerHeight / 2) / camera.zoom + camera.y,
  };
}

export function followCamera(target, dt) {
  const k = 1 - Math.exp(-dt * 10);
  camera.x += (target.x - camera.x) * k;
  camera.y += (target.y - camera.y) * k;
}

// Kenen perässä kamera kulkee: oma hahmo, tai kuolleena tappaja tai joku elossa oleva.
export function cameraTarget(world, localId) {
  const me = world.players[localId];
  if (me?.alive) return me;
  if (world.phase === 'warmup') return null;
  const killer = me?.killedBy && world.players[me.killedBy];
  if (killer?.alive) return killer;
  return Object.values(world.players).find((p) => p.alive) || null;
}

// Muuttaa simulaation tapahtumat efekteiksi.
export function handleEvents(events, world) {
  for (const e of events) {
    if (e.type === 'hit') {
      burst(e.x, e.y, world.players[e.target]?.color || '#fff', 8, 140);
    } else if (e.type === 'wall') {
      burst(e.x, e.y, '#8a93a6', 4, 90);
    } else if (e.type === 'kill') {
      burst(e.x, e.y, world.players[e.victim]?.color || '#fff', 30, 260);
      killFeed.push({
        killer: e.killer ? world.players[e.killer] : null,
        victim: world.players[e.victim],
        time: performance.now(),
      });
      if (killFeed.length > 5) killFeed.shift();
    }
  }
}

function burst(x, y, color, count, speed) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.3 + Math.random() * 0.7);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.3, color });
  }
}

// alpha = kuinka pitkällä ollaan nykyisen ja seuraavan tickin välissä (sulava liike yli 60 Hz näytöillä).
export function render(ctx, world, localId, alpha, dt) {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0d0f14';
  ctx.fillRect(0, 0, w, h);

  // --- Maailma ---
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  drawFloor(ctx);

  ctx.fillStyle = '#ffe9a8';
  for (const b of world.bullets) {
    const x = lerp(b.px, b.x, alpha);
    const y = lerp(b.py, b.y, alpha);
    ctx.beginPath();
    ctx.arc(x, y, BULLET_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const p of Object.values(world.players)) {
    if (p.alive) drawPlayer(ctx, p, alpha, p.id === localId);
  }

  drawParticles(ctx, dt);
  if (world.zone) drawZone(ctx, world.zone);
  ctx.restore();

  // --- HUD ---
  drawHud(ctx, world, localId, w, h);
}

function drawFloor(ctx) {
  ctx.fillStyle = '#161a22';
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);

  ctx.strokeStyle = '#1e2330';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= ARENA_W; x += 50) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, ARENA_H);
  }
  for (let y = 0; y <= ARENA_H; y += 50) {
    ctx.moveTo(0, y);
    ctx.lineTo(ARENA_W, y);
  }
  ctx.stroke();

  ctx.strokeStyle = '#3a4252';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, ARENA_W, ARENA_H);

  for (const r of OBSTACLES) {
    ctx.fillStyle = '#2b3140';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = '#353c4e';
    ctx.fillRect(r.x, r.y, r.w, 6);
  }
}

// Alueen ulkopuoli tummennetaan punertavaksi, reunalle viiva.
function drawZone(ctx, z) {
  const pad = 2000;
  ctx.beginPath();
  ctx.rect(-pad, -pad, ARENA_W + 2 * pad, ARENA_H + 2 * pad);
  ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2, true);
  ctx.fillStyle = '#ff525226';
  ctx.fill('evenodd');

  ctx.beginPath();
  ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
  ctx.strokeStyle = ZONE_COLOR;
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawPlayer(ctx, p, alpha, isLocal) {
  const x = lerp(p.px, p.x, alpha);
  const y = lerp(p.py, p.y, alpha);

  // Ase
  ctx.strokeStyle = '#cfd6e4';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(p.aim) * (PLAYER_RADIUS + 8), y + Math.sin(p.aim) * (PLAYER_RADIUS + 8));
  ctx.stroke();

  // Runko
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(x, y, PLAYER_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  if (isLocal) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Nimi ja HP-palkki
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e6e9ef';
  ctx.fillText(p.name, x, y - PLAYER_RADIUS - 14);

  const bw = 36;
  const bx = x - bw / 2;
  const by = y - PLAYER_RADIUS - 9;
  ctx.fillStyle = '#00000088';
  ctx.fillRect(bx, by, bw, 4);
  const frac = Math.max(0, p.hp / PLAYER_HP);
  ctx.fillStyle = frac > 0.5 ? '#7bd88f' : frac > 0.25 ? '#ffd54f' : '#ff5252';
  ctx.fillRect(bx, by, bw * frac, 4);
}

function drawParticles(ctx, dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const q = particles[i];
    q.life -= dt;
    if (q.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    q.vx *= 0.9;
    q.vy *= 0.9;
    ctx.globalAlpha = Math.min(1, q.life * 2.5);
    ctx.fillStyle = q.color;
    ctx.fillRect(q.x - 2, q.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;
}

// --- HUD ---

function drawHud(ctx, world, localId, w, h) {
  const me = world.players[localId];
  const inMatch = world.phase !== 'warmup';
  ctx.textBaseline = 'alphabetic';

  if (me?.alive && world.zone && outsideZone(me, world.zone)) drawZoneWarning(ctx, w, h);

  // Oma HP vasemmassa alakulmassa
  if (me) {
    ctx.font = '700 28px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = me.alive ? '#e6e9ef' : '#ff5252';
    ctx.fillText(`${Math.max(0, Math.ceil(me.hp))} HP`, 20, h - 24);
  }

  drawScoreboard(ctx, world, localId, w, inMatch);
  drawKillFeed(ctx);
  drawPhaseBanner(ctx, world, me, w, h);

  // Ohje alhaalla
  ctx.font = '500 13px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#5c6476';
  ctx.fillText('WASD liiku · hiiri tähtää · klikkaus ampuu', w - 20, h - 20);
}

function drawScoreboard(ctx, world, localId, w, inMatch) {
  const rows = Object.values(world.players).sort(inMatch
    ? (a, b) => b.score - a.score || b.kills - a.kills
    : (a, b) => b.kills - a.kills || a.deaths - b.deaths);
  const x0 = w - 220;
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.fillStyle = '#00000066';
  ctx.fillRect(x0, 52, 208, 28 + rows.length * 22);
  ctx.fillStyle = '#8a93a6';
  ctx.textAlign = 'left';
  ctx.fillText(inMatch ? `Pisteet (${TARGET_SCORE})` : 'Lämmittely', x0 + 12, 72);
  ctx.textAlign = 'right';
  ctx.fillText(inMatch ? 'Pist.  Tap.' : 'K / D', w - 24, 72);
  rows.forEach((p, i) => {
    const y = 96 + i * 22;
    ctx.globalAlpha = inMatch && !p.alive ? 0.45 : 1;
    ctx.fillStyle = p.color;
    ctx.textAlign = 'left';
    ctx.fillText((p.id === localId ? '▸ ' : '') + p.name, x0 + 12, y);
    ctx.fillStyle = '#e6e9ef';
    ctx.textAlign = 'right';
    ctx.fillText(inMatch ? `${p.score}     ${p.kills}` : `${p.kills} / ${p.deaths}`, w - 24, y);
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
    const killerName = k.killer ? k.killer.name : 'Alue';
    ctx.fillStyle = k.killer ? k.killer.color : ZONE_COLOR;
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
      ctx.fillStyle = '#fff';
      ctx.font = '800 96px system-ui, sans-serif';
      ctx.fillText(String(Math.max(1, Math.ceil(world.phaseTimer))), w / 2, h / 2 - 40);
      ctx.font = '600 22px system-ui, sans-serif';
      ctx.fillStyle = '#c0c6d4';
      ctx.fillText(me?.alive ? `Erä ${world.round}` : `Erä ${world.round} · liityt seuraavaan erään`, w / 2, h / 2 + 4);
      break;

    case 'playing': {
      const all = Object.values(world.players);
      const alive = all.filter((p) => p.alive).length;
      const z = world.zone;
      const zoneText = !z ? '' : z.elapsed < ZONE_DELAY
        ? ` · alue kutistuu ${Math.ceil(ZONE_DELAY - z.elapsed)} s` : ' · alue kutistuu!';
      smallBanner(ctx, w, `Erä ${world.round}`, `Elossa ${alive}/${all.length}${zoneText}`);
      if (me && !me.alive) {
        ctx.font = '600 16px system-ui, sans-serif';
        ctx.fillStyle = '#c0c6d4';
        ctx.fillText('Kuolit – katsot muiden peliä seuraavaan erään asti', w / 2, h - 60);
      }
      break;
    }

    case 'roundEnd':
      if (world.roundWinner) {
        centerBox(ctx, w, h, `${name(world.roundWinner)} voitti erän!`, `+${WIN_POINTS} pistettä`, color(world.roundWinner));
      } else {
        centerBox(ctx, w, h, 'Tasapeli', 'Kukaan ei selvinnyt');
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
  ctx.fillStyle = '#00000099';
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
  const boxH = 130 + rows.length * 28;
  const top = h / 2 - boxH / 2;

  ctx.fillStyle = '#000000b3';
  ctx.fillRect(0, top, w, boxH);
  ctx.textAlign = 'center';
  ctx.font = '800 40px system-ui, sans-serif';
  ctx.fillStyle = winner?.color || '#fff';
  ctx.fillText(`${winner?.name || '?'} voitti pelin!`, w / 2, top + 54);

  ctx.font = '600 18px system-ui, sans-serif';
  rows.forEach((p, i) => {
    const y = top + 100 + i * 28;
    ctx.textAlign = 'left';
    ctx.fillStyle = p.color;
    ctx.fillText(`${i + 1}. ${p.name}`, w / 2 - 150, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e6e9ef';
    ctx.fillText(`${p.score} p · ${p.wins} erää · ${p.kills} tappoa`, w / 2 + 170, y);
  });
}

function drawZoneWarning(ctx, w, h) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.7);
  g.addColorStop(0, '#ff525200');
  g.addColorStop(1, '#ff525266');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.font = '700 20px system-ui, sans-serif';
  ctx.fillStyle = ZONE_COLOR;
  ctx.fillText('Palaa alueelle!', w / 2, h - 90);
}

function outsideZone(p, z) {
  return Math.hypot(p.x - z.x, p.y - z.y) > z.r;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
