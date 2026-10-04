// Piirtäminen ja visuaaliset efektit. Ei vaikuta pelin tilaan.

import {
  ARENA_W, ARENA_H, OBSTACLES, WINDOWS, LAMPS, VIEW_W, VIEW_H,
  PLAYER_RADIUS, BULLET_RADIUS, ZOMBIE_RADIUS,
  TARGET_SCORE, WIN_POINTS, ZONE_DELAY, DASH_COOLDOWN_TICKS,
} from './constants.js';
import { lineOfSight } from './geometry.js';
import { onMapChange, MAP_THEME, MAP_NAME } from './map.js';
import { drawChat } from './chat.js';
import { drawCharacter } from './appearance.js';
import { AURA_RADIUS, FLASHLIGHT_RANGE, FLASHLIGHT_HALF_ANGLE, isLitFor } from './vision.js';
import { BOSS_NAME, BOSS_NAME_OBJECT, BOSS_RADIUS } from './boss.js';
import {
  WEAPONS, WALL_BUYS, BOX, findInteractable,
  PERKS, PERK_IDS, PERK_MACHINES, MACHINE_SIZE, RELOAD_PERK_MUL, maxHpOf, POWERUPS,
} from './weapons.js';

const WALL = 22;              // ulkoseinän paksuus (piirretään areenan ulkopuolelle)
const OUT_OF_SIGHT = 'rgb(3, 4, 7)';  // seinien taakse ei näe yhtään
const EYE_RANGE = 650;            // zombien silmät näkyvät pimeässä tähän asti
const FOG_COLOR = '#8bc34a';
const ZOMBIE_COLOR = '#7d9a52';
const BLOOD = '#6b0f12';
const ROUND_RED = '#b3121b';

const MONEY_COLOR = '#ffd54f';
const LANTERN_COLOR = '#ffb74d';
const RAGE_COLOR = '#ff3d2e';
const WONDER_COLOR = '#76ff03';
const particles = [];
const moneyPopups = [];       // { amount, time }
let announcement = null;      // { text, color, time } iso ilmoitus ruudun yläosaan
let flash = 0;                // ydinpommin valkoinen välähdys
let shake = 0;                // ruudun tärähdys (bossin laskeutuminen)
const killFeed = [];
const decals = [];            // verijäljet lattiassa
let hurtFlash = 0;
let floorCanvas = null;
let lightCanvas = null;

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

function worldToScreen(x, y) {
  return {
    x: (x - camera.x) * camera.zoom + window.innerWidth / 2,
    y: (y - camera.y) * camera.zoom + window.innerHeight / 2,
  };
}

// Kamera seuraa kohdetta, mutta ei näytä paljon tyhjää kartan ulkopuolelta.
export function followCamera(target, dt) {
  const k = 1 - Math.exp(-dt * 10);
  const margin = 60;
  const tx = clampRange(target.x, VIEW_W / 2 - margin, ARENA_W - VIEW_W / 2 + margin);
  const ty = clampRange(target.y, VIEW_H / 2 - margin, ARENA_H - VIEW_H / 2 + margin);
  camera.x += (tx - camera.x) * k;
  camera.y += (ty - camera.y) * k;
}

function clampRange(v, min, max) {
  return min > max ? (min + max) / 2 : Math.min(max, Math.max(min, v));
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
export function handleEvents(events, world, localId) {
  for (const e of events) {
    if (e.type === 'zhit' && e.by === localId) addMoneyPopup(10);
    if (e.type === 'zkill' && e.by === localId) addMoneyPopup(60);
    if (e.type === 'kill' && e.killer === localId) addMoneyPopup(200);
    if (e.type === 'hit') {
      burst(e.x, e.y, world.players[e.target]?.color || '#fff', 8, 140);
      if (e.target === localId) hurtFlash = 0.6;
    } else if (e.type === 'wall') {
      burst(e.x, e.y, '#8a93a6', 4, 90);
    } else if (e.type === 'zhit') {
      burst(e.x, e.y, BLOOD, 6, 120);
    } else if (e.type === 'zkill') {
      burst(e.x, e.y, BLOOD, 18, 200);
      burst(e.x, e.y, ZOMBIE_COLOR, 6, 120);
      addDecal(e.x, e.y, 14 + Math.random() * 12);
    } else if (e.type === 'pickup') {
      const def = POWERUPS[e.kind];
      burst(e.x, e.y, def?.color || '#fff', 20, 200);
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
      burst(e.x, e.y, RAGE_COLOR, 40, 300);
    } else if (e.type === 'bosshurt') {
      burst(e.x, e.y, '#3a2f45', 5, 120);
    } else if (e.type === 'deflect') {
      burst(e.x, e.y, '#ffffff', 6, 220);
    } else if (e.type === 'bossLand') {
      burst(e.x, e.y, '#8d6e63', 30, 260);
      if (world.players[localId]?.alive && Math.hypot(world.players[localId].x - e.x, world.players[localId].y - e.y) < 400) shake = 0.5;
    } else if (e.type === 'bossCounter') {
      burst(e.x, e.y, LANTERN_COLOR, 36, 320);
    } else if (e.type === 'bossHit') {
      burst(e.x, e.y, '#c62828', e.heavy ? 18 : 10, e.heavy ? 220 : 160);
      if (e.target === localId) hurtFlash = 1;
    } else if (e.type === 'bossKill') {
      burst(e.x, e.y, LANTERN_COLOR, 60, 380);
      burst(e.x, e.y, '#2b2433', 40, 260);
      const killer = world.players[e.by];
      announce(killer ? `${killer.name} kaatoi ${BOSS_NAME_OBJECT}! Aselepo päättyi` : `${BOSS_NAME} kaatui!`, killer?.color || LANTERN_COLOR);
    } else if (e.type === 'blast') {
      burst(e.x, e.y, WONDER_COLOR, 24, 260);
    } else if (e.type === 'zattack') {
      burst(e.x, e.y, '#c62828', 10, 160);
      if (e.target === localId) hurtFlash = 1;
    } else if (e.type === 'kill') {
      burst(e.x, e.y, world.players[e.victim]?.color || '#fff', 30, 260);
      addDecal(e.x, e.y, 22 + Math.random() * 10);
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

function burst(x, y, color, count, speed) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.3 + Math.random() * 0.7);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.3, color });
  }
}

function addDecal(x, y, r) {
  const blobs = [];
  for (let i = 0; i < 5; i++) {
    blobs.push({ dx: (Math.random() - 0.5) * r, dy: (Math.random() - 0.5) * r, r: r * (0.3 + Math.random() * 0.5) });
  }
  decals.push({ x, y, blobs });
  if (decals.length > 120) decals.shift();
}

// alpha = kuinka pitkällä ollaan nykyisen ja seuraavan tickin välissä (sulava liike yli 60 Hz näytöillä).
export function render(ctx, world, localId, alpha, dt) {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const now = performance.now() / 1000;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#050608';
  ctx.fillRect(0, 0, w, h);

  // --- Maailma ---
  ctx.save();
  applyCamera(ctx, w, h);
  drawFloor(ctx);
  drawWalls(ctx);

  for (const b of world.bullets) {
    ctx.fillStyle = b.splash ? WONDER_COLOR : '#ffe9a8';
    ctx.beginPath();
    ctx.arc(lerp(b.px, b.x, alpha), lerp(b.py, b.y, alpha), b.splash ? 6 : BULLET_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const z of world.zombies || []) drawZombie(ctx, z, alpha);
  if (world.boss) drawBoss(ctx, world.boss, alpha, now);
  for (const p of Object.values(world.players)) {
    if (p.alive) drawPlayer(ctx, p, alpha, p.id === localId);
  }
  drawParticles(ctx, dt);
  ctx.restore();

  // --- Valot ja pimeys. Katsoja on oma hahmo tai se, jota kuolleena seurataan. ---
  const target = cameraTarget(world, localId);
  const viewer = target ? { x: lerp(target.px, target.x, alpha), y: lerp(target.py, target.y, alpha) } : null;
  const sight = viewer ? visibilityPolygon(viewer.x, viewer.y) : null;
  drawLighting(ctx, world, alpha, now, w, h, dpr, sight, target, viewer);

  // --- Pimeyden päälle: seinien ääriviivat, sumu, nimet ja zombien silmät ---
  ctx.save();
  applyCamera(ctx, w, h);
  drawWallOutlines(ctx);
  drawWindowsInDark(ctx, world.zombies || [], now);
  drawWallBuys(ctx);
  drawBox(ctx, world.box, now);
  drawMachines(ctx, now);
  drawPowerups(ctx, world.powerups || [], now, viewer);
  if (world.zone) drawFog(ctx, world.zone, now);
  for (const p of Object.values(world.players)) {
    if (!p.alive) continue;
    const x = lerp(p.px, p.x, alpha);
    const y = lerp(p.py, p.y, alpha);
    // Nimi ja HP vain, jos pelaaja on oikeasti valaistu katsojalle (muuten nimi paljastaisi pimeässä).
    const seen = p === target || !viewer
      || (lineOfSight(viewer.x, viewer.y, x, y) && isLitFor(viewer, target.aim, x, y));
    if (seen) drawPlayerLabel(ctx, p, alpha);
  }
  if (viewer) drawZombieEyes(ctx, world.zombies || [], viewer, alpha);
  if (world.boss) drawBossOverlay(ctx, world.boss, viewer, alpha, now);
  ctx.restore();

  // --- HUD ---
  drawHud(ctx, world, localId, w, h, dt);
}

function applyCamera(ctx, w, h) {
  const s = shake * 10;
  ctx.translate(w / 2 + (Math.random() - 0.5) * s, h / 2 + (Math.random() - 0.5) * s);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);
}

// --- Kartta ---

function makeCanvas(w, h) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Pseudosatunnainen, aina sama: lattia näyttää kaikilla samalta.
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Teemat: värit, pimeys ja ikkunatyyppi kentän mukaan.
const THEMES = {
  bunker: {
    outer: '#2b2e34', wall: ['#3a3e45', '#4a4f57', '#26292e'], darkness: 0.95, window: 'boards',
  },
  manor: {
    outer: '#2a1d1a', wall: ['#3d2b27', '#5a3f37', '#22161a'], darkness: 0.95, window: 'boards',
  },
  graveyard: {
    outer: null, wall: ['#4a4a47', '#5e5e59', '#2f2f2c'], darkness: 0.9, window: 'gate',
  },
  warehouse: {
    outer: '#30343a', wall: ['#3d434b', '#4d545d', '#272b30'], darkness: 0.94, window: 'shutter',
  },
};

function theme() {
  return THEMES[MAP_THEME] || THEMES.bunker;
}

// Lattia piirretään kerran valmiiksi joka kentälle.
function buildFloor() {
  const c = makeCanvas(ARENA_W, ARENA_H);
  if (!c) return null;
  const g = c.getContext('2d');
  const rand = seeded(1234);
  const stain = (x, y, r, color) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  const cracks = (count, color) => {
    g.strokeStyle = color;
    g.lineWidth = 1;
    for (let i = 0; i < count; i++) {
      let x = rand() * ARENA_W;
      let y = rand() * ARENA_H;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += (rand() - 0.5) * 50;
        y += (rand() - 0.5) * 50;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  };
  const area = (ARENA_W * ARENA_H) / 1e6;

  if (MAP_THEME === 'manor') {
    // Puulankut
    for (let y = 0; y < ARENA_H; y += 20) {
      let x = -rand() * 200;
      while (x < ARENA_W) {
        const len = 120 + rand() * 160;
        const s = Math.round(38 + rand() * 12);
        g.fillStyle = `rgb(${s + 12}, ${s}, ${s - 14})`;
        g.fillRect(x, y, len - 2, 19);
        x += len;
      }
    }
    // Matot huoneiden keskellä
    for (const l of LAMPS) {
      g.fillStyle = 'rgba(90, 20, 26, 0.55)';
      g.fillRect(l.x - 110, l.y - 70, 220, 140);
      g.strokeStyle = 'rgba(160, 120, 60, 0.35)';
      g.lineWidth = 4;
      g.strokeRect(l.x - 100, l.y - 60, 200, 120);
    }
    for (let i = 0; i < 20 * area; i++) stain(rand() * ARENA_W, rand() * ARENA_H, 25 + rand() * 60, 'rgba(0,0,0,0.3)');
  } else if (MAP_THEME === 'graveyard') {
    g.fillStyle = '#131b11';
    g.fillRect(0, 0, ARENA_W, ARENA_H);
    // Polut porteilta keskelle
    g.strokeStyle = 'rgba(52, 42, 30, 0.75)';
    g.lineCap = 'round';
    g.lineWidth = 70;
    for (const w of WINDOWS) {
      g.beginPath();
      g.moveTo(w.x, w.y);
      g.lineTo(ARENA_W / 2, ARENA_H / 2);
      g.stroke();
    }
    // Ruohotupsut
    for (let i = 0; i < 9000 * area; i++) {
      const s = Math.round(22 + rand() * 22);
      g.fillStyle = `rgba(${s - 6}, ${s + 10}, ${s - 10}, 0.7)`;
      g.fillRect(rand() * ARENA_W, rand() * ARENA_H, 2, 3 + rand() * 3);
    }
    for (let i = 0; i < 30 * area; i++) stain(rand() * ARENA_W, rand() * ARENA_H, 40 + rand() * 90, 'rgba(0,0,0,0.35)');
  } else if (MAP_THEME === 'warehouse') {
    for (let y = 0; y < ARENA_H; y += 200) {
      for (let x = 0; x < ARENA_W; x += 200) {
        const s = Math.round(34 + rand() * 8);
        g.fillStyle = `rgb(${s}, ${s + 1}, ${s + 2})`;
        g.fillRect(x + 1, y + 1, 198, 198);
      }
    }
    // Keltaiset turvaviivat hyllyjen ympärillä
    g.strokeStyle = 'rgba(200, 160, 30, 0.45)';
    g.lineWidth = 4;
    g.setLineDash([24, 14]);
    for (const r of OBSTACLES) {
      if (r.kind === 'shelf') g.strokeRect(r.x - 12, r.y - 12, r.w + 24, r.h + 24);
    }
    g.setLineDash([]);
    for (let i = 0; i < 25 * area; i++) stain(rand() * ARENA_W, rand() * ARENA_H, 20 + rand() * 60, 'rgba(0,0,0,0.4)');
    cracks(15 * area, 'rgba(0,0,0,0.45)');
  } else {
    g.fillStyle = '#121416';
    g.fillRect(0, 0, ARENA_W, ARENA_H);
    for (let y = 0; y < ARENA_H; y += 100) {
      for (let x = 0; x < ARENA_W; x += 100) {
        const s = Math.round(26 + rand() * 9);
        g.fillStyle = `rgb(${s}, ${s + 1}, ${s + 3})`;
        g.fillRect(x + 1, y + 1, 98, 98);
      }
    }
    for (let i = 0; i < 28 * area; i++) stain(rand() * ARENA_W, rand() * ARENA_H, 25 + rand() * 80, 'rgba(0,0,0,0.35)');
    cracks(20 * area, 'rgba(0,0,0,0.55)');
  }
  // Vanhoja veritahroja joka kentällä
  for (let i = 0; i < 8 * area; i++) stain(rand() * ARENA_W, rand() * ARENA_H, 15 + rand() * 30, 'rgba(80,8,10,0.35)');
  return c;
}

function drawFloor(ctx) {
  if (!floorCanvas) floorCanvas = buildFloor();
  if (floorCanvas) {
    ctx.drawImage(floorCanvas, 0, 0);
  } else {
    ctx.fillStyle = '#1c1e21';
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);
  }

  ctx.fillStyle = 'rgba(95, 10, 14, 0.75)';
  for (const d of decals) {
    for (const b of d.blobs) {
      ctx.beginPath();
      ctx.arc(d.x + b.dx, d.y + b.dy, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawWalls(ctx) {
  const th = theme();
  if (th.outer) {
    ctx.fillStyle = th.outer;
    ctx.fillRect(-WALL, -WALL, ARENA_W + 2 * WALL, WALL);
    ctx.fillRect(-WALL, ARENA_H, ARENA_W + 2 * WALL, WALL);
    ctx.fillRect(-WALL, 0, WALL, ARENA_H);
    ctx.fillRect(ARENA_W, 0, WALL, ARENA_H);
  } else {
    drawFence(ctx);
  }
  for (const win of WINDOWS) drawWindow(ctx, win);

  drawObstacleShapes(ctx, false);
}

// Piirtää esteet (paitsi arpalaatikon ja automaatit). skipLow jättää matalat hautakivet pois.
function drawObstacleShapes(ctx, skipLow) {
  const th = theme();
  for (const r of OBSTACLES) {
    if (skipLow && r.kind === 'grave') continue;
    switch (r.kind) {
      case 'box':
      case 'machine':
        break;
      case 'crate': drawCrate(ctx, r); break;
      case 'furniture': drawFurniture(ctx, r); break;
      case 'shelf': drawShelf(ctx, r); break;
      case 'grave': drawGrave(ctx, r); break;
      case 'tree': drawTree(ctx, r); break;
      case 'stone': drawBlock(ctx, r, THEMES.graveyard.wall, true); break;
      default: drawBlock(ctx, r, th.wall, false);
    }
  }
}

function drawBlock(ctx, r, [base, top, bottom], bricks) {
  ctx.fillStyle = base;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  if (bricks) {
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = r.y + 10; y < r.y + r.h; y += 10) {
      ctx.moveTo(r.x, y);
      ctx.lineTo(r.x + r.w, y);
    }
    ctx.stroke();
  }
  ctx.fillStyle = top;
  ctx.fillRect(r.x, r.y, r.w, 4);
  ctx.fillStyle = bottom;
  ctx.fillRect(r.x, r.y + r.h - 3, r.w, 3);
}

function drawCrate(ctx, r) {
  ctx.fillStyle = '#5a4026';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = '#3a2916';
  ctx.lineWidth = 3;
  ctx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
  ctx.beginPath();
  ctx.moveTo(r.x + 4, r.y + 4);
  ctx.lineTo(r.x + r.w - 4, r.y + r.h - 4);
  ctx.moveTo(r.x + r.w - 4, r.y + 4);
  ctx.lineTo(r.x + 4, r.y + r.h - 4);
  ctx.stroke();
}

function drawFurniture(ctx, r) {
  ctx.fillStyle = '#3e2a1c';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = '#5a3d27';
  ctx.fillRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 8, r.y + 8, r.w - 16, r.h - 16);
}

// Metallihylly täynnä laatikoita
function drawShelf(ctx, r) {
  ctx.fillStyle = '#2b2f35';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  const rand = seeded(Math.round(r.x * 7 + r.y));
  for (let x = r.x + 4; x < r.x + r.w - 20; x += 26) {
    const s = Math.round(70 + rand() * 40);
    ctx.fillStyle = `rgb(${s + 20}, ${s}, ${s - 30})`;
    ctx.fillRect(x, r.y + 5, 22, r.h - 10);
  }
  ctx.strokeStyle = '#596069';
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
}

function drawGrave(ctx, r) {
  ctx.fillStyle = '#5f6366';
  ctx.beginPath();
  ctx.moveTo(r.x, r.y + r.h);
  ctx.lineTo(r.x, r.y + r.h / 2);
  ctx.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, Math.PI, 0);
  ctx.lineTo(r.x + r.w, r.y + r.h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#3c3f42';
  ctx.fillRect(r.x, r.y + r.h - 3, r.w, 3);
}

function drawTree(ctx, r) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  ctx.fillStyle = '#0f1f10';
  ctx.beginPath();
  ctx.arc(cx, cy, r.w * 0.85, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#18301a';
  ctx.beginPath();
  ctx.arc(cx - 4, cy - 4, r.w * 0.55, 0, Math.PI * 2);
  ctx.fill();
}

// Rautainen aita hautausmaan reunoilla
function drawFence(ctx) {
  ctx.fillStyle = '#0a0d09';
  ctx.fillRect(-WALL, -WALL, ARENA_W + 2 * WALL, WALL);
  ctx.fillRect(-WALL, ARENA_H, ARENA_W + 2 * WALL, WALL);
  ctx.fillRect(-WALL, 0, WALL, ARENA_H);
  ctx.fillRect(ARENA_W, 0, WALL, ARENA_H);
  ctx.strokeStyle = '#3a3d40';
  ctx.lineWidth = 3;
  ctx.strokeRect(-WALL / 2, -WALL / 2, ARENA_W + WALL, ARENA_H + WALL);
  ctx.fillStyle = '#4a4e52';
  for (let x = 0; x <= ARENA_W; x += 40) {
    ctx.fillRect(x - 2, -WALL / 2 - 2, 4, 4);
    ctx.fillRect(x - 2, ARENA_H + WALL / 2 - 2, 4, 4);
  }
  for (let y = 0; y <= ARENA_H; y += 40) {
    ctx.fillRect(-WALL / 2 - 2, y - 2, 4, 4);
    ctx.fillRect(ARENA_W + WALL / 2 - 2, y - 2, 4, 4);
  }
}

// Zombien sisääntulo ulkoreunalla: laudoitettu ikkuna, rautaportti tai lastausovi.
function drawWindow(ctx, win) {
  const len = 70;
  const vertical = win.side === 'left' || win.side === 'right';
  const cx = win.side === 'left' ? -WALL / 2 : win.side === 'right' ? ARENA_W + WALL / 2 : win.x;
  const cy = win.side === 'top' ? -WALL / 2 : win.side === 'bottom' ? ARENA_H + WALL / 2 : win.y;
  const type = theme().window;

  ctx.save();
  ctx.translate(cx, cy);
  if (vertical) ctx.rotate(Math.PI / 2);
  ctx.fillStyle = '#050607';
  ctx.fillRect(-len / 2, -WALL / 2, len, WALL);

  if (type === 'gate') {
    ctx.strokeStyle = '#5a5f63';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = -len / 2 + 6; x < len / 2; x += 9) {
      ctx.moveTo(x, -WALL / 2);
      ctx.lineTo(x, WALL / 2);
    }
    ctx.moveTo(-len / 2, 0);
    ctx.lineTo(len / 2, 0);
    ctx.stroke();
    ctx.fillStyle = '#6b7075';
    ctx.fillRect(-len / 2 - 5, -WALL / 2 - 2, 6, WALL + 4);
    ctx.fillRect(len / 2 - 1, -WALL / 2 - 2, 6, WALL + 4);
  } else if (type === 'shutter') {
    for (let x = -len / 2; x < len / 2; x += 10) {
      ctx.fillStyle = Math.round(x / 10) % 2 === 0 ? '#c9a227' : '#1a1a1a';
      ctx.fillRect(x, -WALL / 2, 10, 4);
      ctx.fillRect(x, WALL / 2 - 4, 10, 4);
    }
    ctx.fillStyle = '#3a3f45';
    for (let y = -WALL / 2 + 6; y < WALL / 2 - 5; y += 4) ctx.fillRect(-len / 2 + 2, y, len - 4, 2);
  } else {
    const tilt = [-0.12, 0.08, -0.04];
    tilt.forEach((a, i) => {
      ctx.save();
      ctx.translate(0, (i - 1) * 6);
      ctx.rotate(a);
      ctx.fillStyle = i === 1 ? '#7a5634' : '#6a4a2c';
      ctx.fillRect(-len / 2 - 4, -2.5, len + 8, 5);
      ctx.restore();
    });
  }
  ctx.restore();
}

// --- Hahmot ---

function drawZombie(ctx, z, alpha) {
  const x = lerp(z.px ?? z.x, z.x, alpha);
  const y = lerp(z.py ?? z.y, z.y, alpha);
  const emerging = z.emerging ?? z.emerge > 0;
  const a = z.angle;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  if (emerging) {
    ctx.globalAlpha = 0.55;
    ctx.scale(0.8, 0.8);
  }

  // Kädet ojossa eteenpäin
  ctx.strokeStyle = '#56693a';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(4, -9);
  ctx.lineTo(ZOMBIE_RADIUS + 10, -8);
  ctx.moveTo(4, 9);
  ctx.lineTo(ZOMBIE_RADIUS + 10, 8);
  ctx.stroke();

  ctx.fillStyle = '#5d6b48';
  ctx.beginPath();
  ctx.arc(0, 0, ZOMBIE_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2b331f';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Repaleiset vaatteet
  ctx.fillStyle = '#3c3a33';
  ctx.beginPath();
  ctx.arc(-3, 0, ZOMBIE_RADIUS - 4, Math.PI * 0.6, Math.PI * 1.4);
  ctx.fill();

  // Silmät
  ctx.fillStyle = '#ff3b30';
  ctx.beginPath();
  ctx.arc(7, -4, 2.2, 0, Math.PI * 2);
  ctx.arc(7, 4, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// --- Lyhtymies ---

function bossPos(b, alpha) {
  return { x: lerp(b.px ?? b.x, b.x, alpha), y: lerp(b.py ?? b.y, b.y, alpha) };
}

// Lyhty sauvan päässä, katseen suunnasta hieman oikealle.
function lanternPos(b, alpha) {
  const p = bossPos(b, alpha);
  const a = b.angle + 0.55;
  return { x: p.x + Math.cos(a) * (BOSS_RADIUS + 16), y: p.y + Math.sin(a) * (BOSS_RADIUS + 16) };
}

// Hypyn aikana hahmo "nousee": varjo jää maahan ja hahmo suurenee lennon puolivälissä.
function leapLift(b) {
  if (b.state !== 'leap') return 0;
  const t = 1 - Math.max(0, b.timer) / 0.35;
  return Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
}

function drawBoss(ctx, b, alpha, t) {
  const { x, y } = bossPos(b, alpha);
  const lift = leapLift(b);
  const r = BOSS_RADIUS;

  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(x, y + 4, r * (1 - lift * 0.3), r * 0.8 * (1 - lift * 0.3), 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y - lift * 18);
  ctx.scale(1 + lift * 0.35, 1 + lift * 0.35);
  ctx.rotate(b.angle);
  if (b.state === 'emerge') ctx.globalAlpha = 0.6;

  // Sauva
  ctx.strokeStyle = '#5d4a3a';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-r * 0.6, r * 0.2);
  ctx.lineTo(Math.cos(0.55) * (r + 16), Math.sin(0.55) * (r + 16));
  ctx.stroke();

  // Kaapu ja hartiat
  ctx.fillStyle = '#2b2433';
  ctx.beginPath();
  ctx.ellipse(-2, 0, r * 0.95, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#120f16';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Huppu
  ctx.fillStyle = '#1a1520';
  ctx.beginPath();
  ctx.arc(2, 0, r * 0.6, 0, Math.PI * 2);
  ctx.fill();
  // Lyhty (punainen raivossa)
  ctx.fillStyle = b.enraged ? RAGE_COLOR : LANTERN_COLOR;
  ctx.beginPath();
  ctx.arc(Math.cos(0.55) * (r + 16), Math.sin(0.55) * (r + 16), 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Varoitukset ja hehkut pimeyden päälle.
function drawBossOverlay(ctx, b, viewer, alpha, t) {
  // Hypyn kohde näkyy aina, jotta ehtii väistää.
  if (b.state === 'leapWind' || b.state === 'leap') {
    const pulse = 0.5 + 0.3 * Math.sin(t * 18);
    ctx.fillStyle = `rgba(255, 40, 30, ${0.18 + pulse * 0.15})`;
    ctx.beginPath();
    ctx.arc(b.tx, b.ty, 75, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(255, 60, 40, ${pulse + 0.2})`;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  const { x, y } = bossPos(b, alpha);
  const visible = !viewer || lineOfSight(viewer.x, viewer.y, x, y);
  if (!visible) return;

  if (b.state === 'counter') {
    const pulse = 0.5 + 0.4 * Math.sin(t * 20);
    ctx.strokeStyle = `rgba(255, 183, 77, ${pulse})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, 130, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, BOSS_RADIUS + 6, t * 12, t * 12 + Math.PI * 1.2);
    ctx.stroke();
  }

  // Silmät ja lyhty hehkuvat pimeässä
  const lift = leapLift(b);
  ctx.save();
  const glow = b.enraged ? RAGE_COLOR : LANTERN_COLOR;
  ctx.shadowColor = glow;
  ctx.shadowBlur = b.enraged ? 18 : 12;
  ctx.fillStyle = glow;
  const c = Math.cos(b.angle);
  const s = Math.sin(b.angle);
  for (const side of [-5, 5]) {
    ctx.beginPath();
    ctx.arc(x + c * 10 - s * side, y - lift * 18 + s * 10 + c * side, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  const l = lanternPos(b, alpha);
  ctx.beginPath();
  ctx.arc(l.x, l.y - lift * 18, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
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

function drawPlayer(ctx, p, alpha, isLocal) {
  const x = lerp(p.px, p.x, alpha);
  const y = lerp(p.py, p.y, alpha);
  const gun = PLAYER_RADIUS + (WEAPONS[p.slots?.[p.cur]?.id]?.length ?? 8);
  drawCharacter(ctx, x, y, p.aim, PLAYER_RADIUS, p.color, p.look, gun, isLocal);
}

function drawPlayerLabel(ctx, p, alpha) {
  const x = lerp(p.px, p.x, alpha);
  const y = lerp(p.py, p.y, alpha);
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e6e9ef';
  ctx.fillText(p.name, x, y - PLAYER_RADIUS - 14);

  const bw = 36;
  const bx = x - bw / 2;
  const by = y - PLAYER_RADIUS - 9;
  ctx.fillStyle = '#00000088';
  ctx.fillRect(bx, by, bw, 4);
  const frac = Math.max(0, Math.min(1, p.hp / maxHpOf(p)));
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

// --- Valaistus ---

// Pimeä kerros, johon valonlähteet "pyyhkivät" reikiä.
// Valoa antavat vain katsojan oma valopiiri ja taskulamppu, kattolamput ja luodit.
// Muiden pelaajien valot eivät näy: vastustaja pimeässä on näkymätön.
function drawLighting(ctx, world, alpha, now, w, h, dpr, sight, target, viewer) {
  if (!lightCanvas) lightCanvas = makeCanvas(1, 1);
  if (!lightCanvas) return;
  if (lightCanvas.width !== ctx.canvas.width || lightCanvas.height !== ctx.canvas.height) {
    lightCanvas.width = ctx.canvas.width;
    lightCanvas.height = ctx.canvas.height;
  }
  const g = lightCanvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, w, h);
  g.fillStyle = `rgba(3, 4, 7, ${theme().darkness})`;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-out';

  const light = (x, y, radius, strength) => {
    const s = worldToScreen(x, y);
    const r = radius * camera.zoom;
    if (s.x < -r || s.y < -r || s.x > w + r || s.y > h + r) return;
    const grad = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
    grad.addColorStop(0, `rgba(0,0,0,${strength})`);
    grad.addColorStop(0.55, `rgba(0,0,0,${strength * 0.6})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(s.x - r, s.y - r, r * 2, r * 2);
  };

  // Taskulampun keila: pehmeä reuna + kirkkaampi ydin.
  const cone = (x, y, aim, range, half, strength) => {
    const s = worldToScreen(x, y);
    const r = range * camera.zoom;
    const grad = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
    grad.addColorStop(0, `rgba(0,0,0,${strength})`);
    grad.addColorStop(0.7, `rgba(0,0,0,${strength * 0.75})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    for (const [spread, k] of [[half * 1.3, 0.35], [half, 1]]) {
      g.globalAlpha = k;
      g.beginPath();
      g.moveTo(s.x, s.y);
      g.arc(s.x, s.y, r, aim - spread, aim + spread);
      g.closePath();
      g.fill();
    }
    g.globalAlpha = 1;
  };

  LAMPS.forEach((l, i) => light(l.x, l.y, l.r, lampLevel(i, now)));
  if (target?.alive && viewer) {
    light(viewer.x, viewer.y, AURA_RADIUS, 0.9);
    cone(viewer.x, viewer.y, target.aim, FLASHLIGHT_RANGE, FLASHLIGHT_HALF_ANGLE, 0.95);
  }
  for (const b of world.bullets) light(lerp(b.px, b.x, alpha), lerp(b.py, b.y, alpha), 45, 0.7);
  // Bossin lyhty valaisee ympäristöä: bossin näkee tulevan, jos siihen on näköyhteys.
  if (world.boss) {
    const l = lanternPos(world.boss, alpha);
    light(l.x, l.y, 150, 0.85 + 0.1 * Math.sin(now * 7));
  }

  // Kaikki näköyhteyden ulkopuolella pimennetään uudelleen, valoista riippumatta.
  if (sight) {
    g.globalCompositeOperation = 'source-over';
    g.beginPath();
    g.rect(0, 0, w, h);
    sight.forEach((pt, i) => {
      const s = worldToScreen(pt.x, pt.y);
      if (i === 0) g.moveTo(s.x, s.y);
      else g.lineTo(s.x, s.y);
    });
    g.closePath();
    g.fillStyle = OUT_OF_SIGHT;
    g.fill('evenodd');
  }

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(lightCanvas, 0, 0);
  ctx.restore();
}

// --- Näköyhteys: säteet jokaiseen seinän kulmaan, osumista monikulmio ---

let SEGMENTS = [];
let CORNERS = [];
function buildSegments() {
  SEGMENTS = [];
  CORNERS = [];
  // Hautakivet ovat matalia: niiden yli näkee, vaikka niiden läpi ei pääse.
  for (const r of [...OBSTACLES.filter((o) => o.kind !== 'grave'), { x: 0, y: 0, w: ARENA_W, h: ARENA_H }]) {
    const pts = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
    for (let i = 0; i < 4; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % 4];
      SEGMENTS.push({ x1, y1, x2, y2 });
      CORNERS.push(pts[i]);
    }
  }
}
buildSegments();
onMapChange(() => {
  buildSegments();
  floorCanvas = null;
  decals.length = 0;
});

function raycast(ox, oy, dx, dy) {
  let best = 5000;
  for (const s of SEGMENTS) {
    const sx = s.x2 - s.x1;
    const sy = s.y2 - s.y1;
    const den = dx * sy - dy * sx;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((s.x1 - ox) * sy - (s.y1 - oy) * sx) / den;
    const u = ((s.x1 - ox) * dy - (s.y1 - oy) * dx) / den;
    if (t > 0 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return best;
}

function visibilityPolygon(ox, oy) {
  const points = [];
  for (const [cx, cy] of CORNERS) {
    const base = Math.atan2(cy - oy, cx - ox);
    // Kulman ohi hieman molemmin puolin, jotta säde jatkuu seinän taakse.
    for (const a of [base - 0.0005, base, base + 0.0005]) {
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const t = raycast(ox, oy, dx, dy);
      points.push({ a, x: ox + dx * t, y: oy + dy * t });
    }
  }
  points.sort((p, q) => p.a - q.a);
  return points;
}

// Esteiden yläpinnat näkyvät himmeinä myös pimeässä: ne peittävät näkyvyyden, joten niiden
// näkeminen ei paljasta mitään, mutta kentän muoto hahmottuu.
function drawWallOutlines(ctx) {
  ctx.save();
  ctx.globalAlpha = 0.4;
  drawObstacleShapes(ctx, true);
  ctx.restore();
  ctx.strokeStyle = 'rgba(90, 96, 108, 0.35)';
  ctx.lineWidth = 1.5;
  for (const r of OBSTACLES) {
    // Hautakivet ja puut ovat matalia ja pieniä: ääriviivat vain sotkisivat pimeyttä.
    if (r.kind !== 'grave' && r.kind !== 'tree') ctx.strokeRect(r.x, r.y, r.w, r.h);
  }
  ctx.strokeRect(0, 0, ARENA_W, ARENA_H);
}

// Ikkunat erottuvat pimeässäkin. Kun zombi kiipeää sisään, ikkuna sykkii punaisena.
function drawWindowsInDark(ctx, zombies, t) {
  ctx.save();
  ctx.globalAlpha = 0.6;
  for (const win of WINDOWS) drawWindow(ctx, win);
  ctx.restore();

  for (const win of WINDOWS) {
    const climbing = zombies.some((z) => (z.emerging ?? z.emerge > 0) && Math.hypot(z.x - win.x, z.y - win.y) < 50);
    if (!climbing) continue;
    const pulse = 0.45 + 0.35 * Math.sin(t * 14);
    const glow = ctx.createRadialGradient(win.x, win.y, 0, win.x, win.y, 70);
    glow.addColorStop(0, `rgba(255, 40, 30, ${pulse})`);
    glow.addColorStop(1, 'rgba(255, 40, 30, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(win.x - 70, win.y - 70, 140, 140);
  }
}

// Punaiset silmät hehkuvat pimeässä, jos zombiin on näköyhteys.
function drawZombieEyes(ctx, zombies, viewer, alpha) {
  ctx.fillStyle = '#ff2a1f';
  ctx.shadowColor = '#ff2a1f';
  ctx.shadowBlur = 8;
  for (const z of zombies) {
    const x = lerp(z.px ?? z.x, z.x, alpha);
    const y = lerp(z.py ?? z.y, z.y, alpha);
    if (Math.hypot(x - viewer.x, y - viewer.y) > EYE_RANGE) continue;
    if (!lineOfSight(viewer.x, viewer.y, x, y)) continue;
    const c = Math.cos(z.angle);
    const s = Math.sin(z.angle);
    ctx.globalAlpha = (z.emerging ?? z.emerge > 0) ? 0.5 : 1;
    for (const side of [-4, 4]) {
      ctx.beginPath();
      ctx.arc(x + c * 7 - s * side, y + s * 7 + c * side, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

// --- Ostopaikat ---

// Liidulla piirretty ase lattiaan seinän viereen. Näkyy himmeänä myös pimeässä.
function drawWallBuys(ctx) {
  ctx.save();
  ctx.strokeStyle = 'rgba(235, 235, 220, 0.55)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const b of WALL_BUYS) {
    const len = 20 + (WEAPONS[b.weapon].length ?? 10) * 1.6;
    ctx.beginPath();
    // Yksinkertainen aseen siluetti: piippu, runko, kahva, perä
    ctx.moveTo(b.x - len / 2, b.y - 3);
    ctx.lineTo(b.x + len / 2, b.y - 3);
    ctx.lineTo(b.x + len / 2, b.y + 1);
    ctx.lineTo(b.x - len / 6, b.y + 1);
    ctx.lineTo(b.x - len / 6 - 4, b.y + 10);
    ctx.lineTo(b.x - len / 6 - 10, b.y + 10);
    ctx.lineTo(b.x - len / 6 - 7, b.y + 1);
    ctx.lineTo(b.x - len / 2, b.y + 1);
    ctx.lineTo(b.x - len / 2 - 6, b.y + 6);
    ctx.lineTo(b.x - len / 2 - 6, b.y - 5);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.font = '600 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(235, 235, 220, 0.45)';
  for (const b of WALL_BUYS) ctx.fillText(`${WEAPONS[b.weapon].name} ${b.price} $`, b.x, b.y + 24);
  ctx.restore();
}

function drawBox(ctx, box, t) {
  const x = BOX.x - BOX.w / 2;
  const y = BOX.y - BOX.h / 2;
  // Hehku, jotta laatikon löytää pimeässä
  const glow = ctx.createRadialGradient(BOX.x, BOX.y, 0, BOX.x, BOX.y, 70);
  glow.addColorStop(0, 'rgba(120, 180, 255, 0.28)');
  glow.addColorStop(1, 'rgba(120, 180, 255, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(BOX.x - 70, BOX.y - 70, 140, 140);

  ctx.fillStyle = '#4a3320';
  ctx.fillRect(x, y, BOX.w, BOX.h);
  ctx.strokeStyle = '#8fc3ff';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, BOX.w - 2, BOX.h - 2);
  ctx.fillStyle = '#8fc3ff';
  ctx.font = '700 16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('?', BOX.x, BOX.y + 6);

  if (!box || box.state === 'idle') return;
  let label;
  if (box.state === 'spinning') {
    const ids = Object.keys(WEAPONS).filter((id) => id !== 'pistol');
    label = WEAPONS[ids[Math.floor(t * 12) % ids.length]].name;
  } else {
    label = WEAPONS[box.weapon]?.name ?? '?';
  }
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.fillStyle = box.state === 'ready' ? '#ffffff' : '#8fc3ff';
  ctx.fillText(label, BOX.x, y - 14);
  if (box.state === 'ready') {
    const frac = Math.max(0, Math.min(1, box.timer / 8));
    ctx.fillStyle = '#00000088';
    ctx.fillRect(BOX.x - 30, y - 8, 60, 4);
    ctx.fillStyle = '#8fc3ff';
    ctx.fillRect(BOX.x - 30, y - 8, 60 * frac, 4);
  }
}

// Juoma-automaatit hehkuvat omalla värillään, jotta ne löytää pimeässä.
function drawMachines(ctx, t) {
  for (const m of PERK_MACHINES) {
    const perk = PERKS[m.perk];
    const half = MACHINE_SIZE / 2;
    const glow = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 75);
    glow.addColorStop(0, hexAlpha(perk.color, 0.3 + 0.05 * Math.sin(t * 2 + m.x)));
    glow.addColorStop(1, hexAlpha(perk.color, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(m.x - 75, m.y - 75, 150, 150);

    ctx.fillStyle = '#1b1d22';
    ctx.fillRect(m.x - half, m.y - half, MACHINE_SIZE, MACHINE_SIZE);
    ctx.strokeStyle = perk.color;
    ctx.lineWidth = 3;
    ctx.strokeRect(m.x - half + 2, m.y - half + 2, MACHINE_SIZE - 4, MACHINE_SIZE - 4);
    ctx.fillStyle = perk.color;
    ctx.font = '800 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(perk.short, m.x, m.y + 6);
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.fillStyle = hexAlpha(perk.color, 0.8);
    ctx.fillText(`${perk.name} ${perk.price} $`, m.x + (m.x < 800 ? 40 : -40), m.y + half + 16);
  }
}

// Tehosteet sykkivät lattialla ja vilkkuvat ennen katoamista.
function drawPowerups(ctx, powerups, t, viewer) {
  for (const pu of powerups) {
    // Tehoste hehkuu, mutta seinien läpi sitä ei näe.
    if (viewer && !lineOfSight(viewer.x, viewer.y, pu.x, pu.y)) continue;
    if (pu.life < 4 && Math.floor(t * 6) % 2 === 0) continue;
    const def = POWERUPS[pu.type];
    if (!def) continue;
    const r = 14 + 2 * Math.sin(t * 5 + pu.id);
    const glow = ctx.createRadialGradient(pu.x, pu.y, 0, pu.x, pu.y, 45);
    glow.addColorStop(0, hexAlpha(def.color, 0.5));
    glow.addColorStop(1, hexAlpha(def.color, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(pu.x - 45, pu.y - 45, 90, 90);
    ctx.beginPath();
    ctx.arc(pu.x, pu.y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#111';
    ctx.fill();
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = def.color;
    ctx.font = '800 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(def.short, pu.x, pu.y + 5);
  }
}

function hexAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// Lamput värisevät ja sammuvat välillä hetkeksi.
function lampLevel(i, t) {
  const blink = hash(Math.floor(t * 10) * 7 + i * 131);
  if (blink < 0.04) return 0.2;
  return 0.6 + 0.15 * Math.sin(t * 3 + i * 1.7);
}

function hash(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

function drawFog(ctx, z, t) {
  const pad = 2000;
  ctx.beginPath();
  ctx.rect(-pad, -pad, ARENA_W + 2 * pad, ARENA_H + 2 * pad);
  ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2, true);
  ctx.fillStyle = 'rgba(70, 110, 40, 0.35)';
  ctx.fill('evenodd');

  // Pehmeä reuna
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.r + 6 + i * 12, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(120, 170, 70, ${0.22 - i * 0.05})`;
    ctx.lineWidth = 12;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(170, 220, 90, 0.8)';
  ctx.lineWidth = 2;
  ctx.setLineDash([14, 10]);
  ctx.lineDashOffset = -t * 20;
  ctx.stroke();
  ctx.setLineDash([]);
}

// --- HUD ---

function drawHud(ctx, world, localId, w, h, dt) {
  const me = world.players[localId];
  const inMatch = world.phase !== 'warmup';
  ctx.textBaseline = 'alphabetic';

  if (me?.alive && world.zone && outsideZone(me, world.zone)) drawFogWarning(ctx, w, h);
  if (hurtFlash > 0) {
    drawVignette(ctx, w, h, `rgba(200, 20, 20, ${hurtFlash * 0.45})`);
    hurtFlash = Math.max(0, hurtFlash - dt * 2.5);
  }
  if (shake > 0) shake = Math.max(0, shake - dt * 2);
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
  ctx.fillText(`${me.money} $`, right, h - 100);

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

function lerp(a, b, t) {
  return a + (b - a) * t;
}
