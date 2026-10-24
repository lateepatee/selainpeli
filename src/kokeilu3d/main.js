// Zombiareenan 3D-kokeilu: ajaa pelin simulaation paikallisesti (pelaaja + 3 bottia, ei verkkoa)
// ja piirtää sen viistosta kamerasta PS1-tyylillä. Simulaatiota ei muuteta: tämä vain lukee world-tilan.
//
// Osoitteen valinnat (testaukseen): ?auto=1 pelaa myös oman hahmon botilla ja ohittaa aloitusruudun,
// ?nopeus=N ajaa simulaatiota N-kertaisella nopeudella, ?fps=1 näyttää ruudunpäivityksen.

import * as THREE from '../../vendor/three-0.170.0/three.module.min.js';
import { createWorld, addPlayer, startMatch, step, setTargetScore } from '../game.js';
import { botInput } from '../bot.js';
import { TICK, PLAYER_COLORS, ZOMBIE_EMERGE_TIME } from '../constants.js';
import { MAP_ID, MAP_NAME } from '../map.js';
import { MAPS } from '../maps.js';
import { lineOfSight } from '../geometry.js';
import { isLitFor, AURA_RADIUS, FLASHLIGHT_RANGE, FLASHLIGHT_HALF_ANGLE } from '../vision.js';
import { WEAPONS, findInteractable, maxHpOf, POWERUPS } from '../weapons.js';
import { BOSS_NAME } from '../boss.js';
import { initInput, readInput } from '../input.js';
import { initAudio, playEvents, updateAmbient, toggleMute } from '../sound.js';
import { camera as soundCamera } from '../render.js';
import { createPipeline } from './post.js';
import { buildArena, disposeGroup, createLampLights, S } from './arena.js';
import {
  createPlayerActor, createZombieActor, createBossActor, poseHuman, poseZombie, poseBoss,
} from './actors.js';

const params = new URLSearchParams(location.search);
const AUTO = params.get('auto') === '1';
const SPEED = Math.min(16, Math.max(1, Number(params.get('nopeus')) || 1));
const SHOW_FPS = params.get('fps') === '1';
const BENCH = params.get('bench') === '1';   // mittaa yhden ruudun todellisen keston (CPU + GPU)

const GUN_Y = 1.0;                // tähtäystaso (aseen korkeus)
const EYE_RANGE = 650;            // zombien silmät näkyvät pimeässä tähän asti (px, kuten render.js)
const CAM_OFFSET = new THREE.Vector3(0, 12.5, 7);
const FOG_COLOR = 0x040508;

// --- Peli ---

const world = createWorld();
setTargetScore(world, 10);
const BOT_NAMES = ['Botti 1', 'Botti 2', 'Botti 3'];
addPlayer(world, 'me', 'Sinä', PLAYER_COLORS[0]);
BOT_NAMES.forEach((n, i) => addPlayer(world, `bot${i + 1}`, n, PLAYER_COLORS[i + 1]));
startMatch(world);
const botIds = BOT_NAMES.map((_, i) => `bot${i + 1}`);

// --- Piirto ---

const canvas = document.getElementById('game');
const pipeline = createPipeline(canvas);
const scene = new THREE.Scene();
scene.background = new THREE.Color(FOG_COLOR);
scene.fog = new THREE.Fog(FOG_COLOR, 12, 27);

const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.5, 80);
function onResize() {
  camera.aspect = pipeline.resize();
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
onResize();

// Taivasvalo kirkastaa seinien yläpinnat, jotta ne eivät ole mustia möykkyjä
scene.add(new THREE.AmbientLight(0x4a5670, 1.4), new THREE.HemisphereLight(0x7a88a8, 0x101014, 1.6));

// Taskulamppu: oikea kartiovalo varjoineen. Kulma ja kantama samat kuin vision.js:ssä.
const flashlight = new THREE.SpotLight(0xfff0cc, 170, FLASHLIGHT_RANGE * S + 1.5, FLASHLIGHT_HALF_ANGLE * 1.15, 0.35, 1.3);
flashlight.castShadow = true;
flashlight.shadow.mapSize.set(1024, 1024);
flashlight.shadow.camera.near = 0.4;
flashlight.shadow.camera.far = FLASHLIGHT_RANGE * S + 2;
flashlight.shadow.bias = -0.002;
flashlight.shadow.normalBias = 0.03;
scene.add(flashlight, flashlight.target);

// Pelaajan ympärillä kajo (vision.js: AURA_RADIUS) ja suuliekki
const aura = new THREE.PointLight(0xffe2b0, 14, (AURA_RADIUS + 10) * S + 0.6, 1.5);
const muzzle = new THREE.PointLight(0xffa040, 0, 7, 2);
scene.add(aura, muzzle);

const maxLamps = Math.max(...Object.values(MAPS).map((m) => m.lamps.length));
const lampLights = createLampLights(maxLamps);
scene.add(...lampLights);

let arena = null;
let arenaId = null;
function syncArena() {
  if (arenaId === MAP_ID) return;
  if (arena) {
    scene.remove(arena);
    disposeGroup(arena);
  }
  arena = buildArena(lampLights);
  scene.add(arena);
  arenaId = MAP_ID;
}

// Myrkkysumu: vihreä seinä ja sumuinen lattia alueen ulkopuolella
const zoneWall = new THREE.Mesh(
  new THREE.CylinderGeometry(1, 1, 3.5, 28, 1, true),
  new THREE.MeshBasicMaterial({ color: 0x6fae2e, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
);
const zoneFloor = new THREE.Mesh(
  new THREE.RingGeometry(1, 80, 28, 1),
  new THREE.MeshBasicMaterial({ color: 0x4f8a22, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
);
zoneFloor.rotation.x = -Math.PI / 2;
zoneWall.visible = zoneFloor.visible = false;
scene.add(zoneWall, zoneFloor);

// --- Hahmot ---

const actors = { players: new Map(), zombies: new Map(), boss: null, powerups: new Map() };
const actorGroup = new THREE.Group();
scene.add(actorGroup);

function trackBodyMeshes(actor, keepAlways) {
  actor.bodyMeshes = [];
  actor.root.traverse((o) => {
    if (o.isMesh && !keepAlways.includes(o) && !(o.parent === actor.parts.eyes)) actor.bodyMeshes.push(o);
  });
}

function playerActor(p) {
  let a = actors.players.get(p.id);
  if (!a) {
    a = createPlayerActor(p.color);
    trackBodyMeshes(a, []);
    if (p.id === 'me') a.root.traverse((o) => { if (o.isMesh) o.castShadow = false; }); // oman valon varjo ei saa peittää kaikkea
    a.last = { x: p.x, y: p.y };
    actorGroup.add(a.root);
    actors.players.set(p.id, a);
  }
  return a;
}

function zombieActor(z) {
  let a = actors.zombies.get(z.id);
  if (!a) {
    a = createZombieActor(z.id);
    trackBodyMeshes(a, []);
    a.last = { x: z.x, y: z.y };
    actorGroup.add(a.root);
    actors.zombies.set(z.id, a);
  }
  return a;
}

// --- Ammukset ja hiukkaset ---

const MAX_BULLETS = 256;
const bulletMesh = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.7, 0.08, 0.08),
  new THREE.MeshBasicMaterial({ color: 0xffe08a, fog: false }),
  MAX_BULLETS,
);
bulletMesh.frustumCulled = false;
scene.add(bulletMesh);
const bulletDummy = new THREE.Object3D();

const MAX_PARTICLES = 90;
const particles = [];
const particleGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
for (let i = 0; i < MAX_PARTICLES; i++) {
  const m = new THREE.Mesh(particleGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  m.visible = false;
  scene.add(m);
  particles.push({ mesh: m, vx: 0, vy: 0, vz: 0, life: 0 });
}
let nextParticle = 0;

function burst(x, y, color, count, speed, up = 3) {
  for (let i = 0; i < count; i++) {
    const p = particles[nextParticle];
    nextParticle = (nextParticle + 1) % MAX_PARTICLES;
    p.mesh.position.set(x * S, 1.0, y * S);
    p.mesh.material.color.setHex(color);
    p.mesh.visible = true;
    const a = Math.random() * Math.PI * 2;
    const s = Math.random() * speed;
    p.vx = Math.cos(a) * s;
    p.vz = Math.sin(a) * s;
    p.vy = Math.random() * up;
    p.life = 0.35 + Math.random() * 0.4;
  }
}

function stepParticles(dt) {
  for (const p of particles) {
    if (p.life <= 0) continue;
    p.life -= dt;
    p.vy -= 12 * dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y = Math.max(0.05, p.mesh.position.y + p.vy * dt);
    p.mesh.position.z += p.vz * dt;
    if (p.life <= 0) p.mesh.visible = false;
  }
}

let muzzleFlash = 0;
let hurt = 0;
function reactToEvents(events) {
  for (const e of events) {
    switch (e.type) {
      case 'shot':
        if (e.by === 'me') muzzleFlash = 1;
        break;
      case 'wall': burst(e.x, e.y, 0xffd070, 4, 4); break;
      case 'zhit': burst(e.x, e.y, 0x7a1010, 5, 3.5); break;
      case 'hit': burst(e.x, e.y, 0xb01818, 7, 4); break;
      case 'zkill': burst(e.x, e.y, 0x5c7a3a, 12, 5, 4); break;
      case 'blast': burst(e.x, e.y, 0xff9a30, 20, 8, 5); break;
      case 'zattack':
        if (e.target === 'me') hurt = Math.max(hurt, 0.7);
        break;
    }
  }
}

// --- Syöte ja kamera ---

const raycaster = new THREE.Raycaster();
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GUN_Y);
const ndc = new THREE.Vector2();
const hitPoint = new THREE.Vector3();

// Hiiren kohta maan tasossa -> pelin koordinaatit. Ruutu venytetään koko ikkunaan, joten ndc on suoraan ikkunasta.
function screenToWorld(sx, sy) {
  ndc.set((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  if (raycaster.ray.intersectPlane(aimPlane, hitPoint)) return { x: hitPoint.x / S, y: hitPoint.z / S };
  return { x: 0, y: 0 };
}

initInput(canvas);

const focus = new THREE.Vector3();
let focusReady = false;

// --- HUD ---

const hud = {
  hp: document.getElementById('hud-hp'),
  ammo: document.getElementById('hud-ammo'),
  round: document.getElementById('hud-round'),
  msg: document.getElementById('hud-msg'),
  hint: document.getElementById('hud-hint'),
  boss: document.getElementById('hud-boss'),
  fps: document.getElementById('hud-fps'),
};
const hudCache = new Map();
function setText(el, text) {
  if (hudCache.get(el) === text) return;
  hudCache.set(el, text);
  el.textContent = text;
}

function updateHud(me) {
  const w = world;
  const alive = Object.values(w.players).filter((p) => p.alive).length;
  const total = Object.keys(w.players).length;
  setText(hud.round, `ERÄ ${w.round} · ${MAP_NAME.toUpperCase()} · ELOSSA ${alive}/${total} · PISTEET ${me.score}/${w.targetScore}`);
  setText(hud.hp, me.alive ? `HP ${Math.ceil(me.hp)}` : 'HP 0');
  hud.hp.classList.toggle('low', me.alive && me.hp < maxHpOf(me) * 0.35);

  const slot = me.slots[me.cur];
  const wp = WEAPONS[slot.id];
  const reserve = Number.isFinite(slot.reserve) ? slot.reserve : '∞';
  const reloading = me.reloadTimer > 0 ? ' · LADATAAN' : '';
  setText(hud.ammo, `${wp.name.toUpperCase()} ${slot.mag}/${reserve} · $${me.money}${reloading}`);

  let msg = '';
  if (w.phase === 'countdown') msg = String(Math.max(1, Math.ceil(w.phaseTimer)));
  else if (w.phase === 'roundEnd') {
    const win = w.players[w.roundWinner];
    msg = win ? `ERÄ PÄÄTTYI: ${win.name.toUpperCase()} VOITTI` : 'ERÄ PÄÄTTYI: TASAPELI';
  } else if (w.phase === 'gameOver') {
    const win = w.players[w.matchWinner];
    msg = `PELI OHI: ${win ? win.name.toUpperCase() : '?'} VOITTI`;
  } else if (w.phase === 'playing' && !me.alive) msg = 'KAATUIT';
  else if (w.phase === 'playing' && w.zone && w.zone.elapsed < 2.5) msg = `ERÄ ${w.round}`;
  setText(hud.msg, msg);

  const it = findInteractable(w, me);
  setText(hud.hint, it ? `[E] ${it.label}` : '');

  setText(hud.boss, w.boss ? `${BOSS_NAME.toUpperCase()} ${Math.max(0, Math.ceil(w.boss.hp))}/${w.boss.maxHp}` : '');
}

// --- Päivitys ja piirto ---

let acc = 0;
let lastNow = performance.now();
let simTime = 0;
let fpsFrames = 0;
let fpsStart = lastNow;
const fpsLog = { last: 0, min: Infinity, samples: [], frameMs: [] };
let wasDead = false;

function pickFocus(me) {
  if (me.alive) return me;
  return Object.values(world.players).find((p) => p.alive) || me;
}

function frame(now) {
  requestAnimationFrame(frame);
  const t0 = performance.now();
  const dt = Math.min(0.25, (now - lastNow) / 1000);
  lastNow = now;

  // FPS: keskiarvo sekunnin ikkunassa
  fpsFrames++;
  if (now - fpsStart >= 1000) {
    const fps = (fpsFrames * 1000) / (now - fpsStart);
    fpsLog.last = fps;
    fpsLog.min = Math.min(fpsLog.min, fps);
    fpsLog.samples.push(fps);
    if (fpsLog.samples.length > 600) fpsLog.samples.shift();
    if (SHOW_FPS) setText(hud.fps, `${fps.toFixed(0)} fps`);
    fpsFrames = 0;
    fpsStart = now;
  }

  const me = world.players.me;
  const events = [];
  acc += dt * SPEED;
  const localInput = AUTO ? null : readInput(me, screenToWorld);
  while (acc >= TICK) {
    acc -= TICK;
    const inputs = {};
    for (const id of botIds) inputs[id] = botInput(world, id, TICK);
    inputs.me = AUTO ? botInput(world, 'me', TICK) : localInput;
    // Mykistys ja valikot hoidetaan alempana; tässä vain simulaatio.
    events.push(...step(world, inputs, TICK));
    if (world.phase === 'warmup') startMatch(world);   // uusi ottelu heti, lämmittelyä ei tarvita
    simTime += TICK;
  }
  const alpha = acc / TICK;

  syncArena();
  reactToEvents(events);
  const view = pickFocus(me);
  soundCamera.x = view.x;
  soundCamera.y = view.y;
  playEvents(events, 'me');
  updateAmbient(world, dt);

  // Pelaajat
  const t = simTime;
  for (const p of Object.values(world.players)) {
    const a = playerActor(p);
    if (!p.alive) {
      a.root.visible = false;
      continue;
    }
    const x = (p.px + (p.x - p.px) * alpha);
    const y = (p.py + (p.y - p.py) * alpha);
    a.root.position.set(x * S, 0, y * S);
    a.root.rotation.y = -p.aim;
    const moved = Math.hypot(x - a.last.x, y - a.last.y) * S;
    a.last.x = x;
    a.last.y = y;
    poseHuman(a, moved, p.dashTicks > 0, t);
    // Muut pelaajat näkyvät vain, jos heihin osuu valo ja heihin on näköyhteys (sama sääntö kuin 2D:ssä)
    const seen = p === view || (lineOfSight(view.x, view.y, p.x, p.y) && isLitFor(view, view.aim, p.x, p.y));
    a.root.visible = seen;
  }
  for (const [id, a] of actors.players) {
    if (!world.players[id]) {
      actorGroup.remove(a.root);
      actors.players.delete(id);
    }
  }

  // Zombit: runko vain valossa, silmät pimeässäkin
  const seenZ = new Set();
  for (const z of world.zombies) {
    const a = zombieActor(z);
    seenZ.add(z.id);
    const x = z.px + (z.x - z.px) * alpha;
    const y = z.py + (z.y - z.py) * alpha;
    const emerging = z.emerge > 0;
    const frac = emerging ? z.emerge / ZOMBIE_EMERGE_TIME : 0;
    // Ikkunasta kiipeävä tulee ulkopuolelta sisään ja nousee kynnyksen yli
    a.root.position.set(
      (x - Math.cos(z.angle) * 60 * frac) * S,
      frac * 0.35,
      (y - Math.sin(z.angle) * 60 * frac) * S,
    );
    a.root.rotation.y = -z.angle;
    const moved = Math.hypot(x - a.last.x, y - a.last.y) * S;
    a.last.x = x;
    a.last.y = y;
    poseZombie(a, moved, t, emerging);

    const los = Math.hypot(z.x - view.x, z.y - view.y) < EYE_RANGE && lineOfSight(view.x, view.y, z.x, z.y);
    const lit = los && isLitFor(view, view.aim, z.x, z.y);
    a.root.visible = los;
    for (const m of a.bodyMeshes) m.visible = lit;
  }
  for (const [id, a] of actors.zombies) {
    if (!seenZ.has(id)) {
      actorGroup.remove(a.root);
      actors.zombies.delete(id);
    }
  }

  // Bossi
  const b = world.boss;
  if (b && !actors.boss) {
    actors.boss = createBossActor();
    trackBodyMeshes(actors.boss, [actors.boss.parts.lantern]);
    actors.boss.last = { x: b.x, y: b.y };
    actors.boss.warn = new THREE.Mesh(
      new THREE.RingGeometry(70 * S, 75 * S, 20),
      new THREE.MeshBasicMaterial({ color: 0xff3d2e, transparent: true, opacity: 0.8, depthWrite: false, fog: false }),
    );
    actors.boss.warn.rotation.x = -Math.PI / 2;
    actorGroup.add(actors.boss.root, actors.boss.warn);
  } else if (!b && actors.boss) {
    actorGroup.remove(actors.boss.root, actors.boss.warn);
    actors.boss = null;
  }
  if (b && actors.boss) {
    const a = actors.boss;
    const x = b.px + (b.x - b.px) * alpha;
    const y = b.py + (b.y - b.py) * alpha;
    const lift = b.state === 'leap' ? Math.sin(Math.PI * (1 - Math.max(0, b.timer) / 0.35)) * 2.5 : 0;
    const sink = b.state === 'emerge' ? 0.6 : 0;
    a.root.position.set(x * S, lift + sink, y * S);
    a.root.rotation.y = -b.angle;
    poseBoss(a, b, Math.hypot(x - a.last.x, y - a.last.y) * S, t);
    a.last.x = x;
    a.last.y = y;
    const los = lineOfSight(view.x, view.y, b.x, b.y);
    const lit = los && isLitFor(view, view.aim, b.x, b.y);
    a.root.visible = los;
    for (const m of a.bodyMeshes) m.visible = lit;
    // Hypyn osumakohta näkyy aina, jotta ehtii väistää
    const winding = b.state === 'leapWind' || b.state === 'leap';
    a.warn.visible = winding;
    a.warn.position.set(b.tx * S, 0.06, b.ty * S);
    a.warn.scale.setScalar(1 + Math.sin(t * 18) * 0.06);
  }

  // Tehosteet lattialla
  const seenPu = new Set();
  for (const pu of world.powerups) {
    seenPu.add(pu.id);
    let m = actors.powerups.get(pu.id);
    if (!m) {
      m = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.5, 0.5),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(POWERUPS[pu.type].color), fog: false }),
      );
      scene.add(m);
      actors.powerups.set(pu.id, m);
    }
    m.position.set(pu.x * S, 0.7 + Math.sin(t * 3 + pu.id) * 0.15, pu.y * S);
    m.rotation.y = t * 2;
    m.visible = lineOfSight(view.x, view.y, pu.x, pu.y);
  }
  for (const [id, m] of actors.powerups) {
    if (!seenPu.has(id)) {
      scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
      actors.powerups.delete(id);
    }
  }

  // Ammukset
  let n = 0;
  for (const bl of world.bullets) {
    if (n >= MAX_BULLETS) break;
    const x = bl.px + (bl.x - bl.px) * alpha;
    const y = bl.py + (bl.y - bl.py) * alpha;
    bulletDummy.position.set(x * S, GUN_Y, y * S);
    bulletDummy.rotation.set(0, -Math.atan2(bl.vy, bl.vx), 0);
    bulletDummy.updateMatrix();
    bulletMesh.setMatrixAt(n++, bulletDummy.matrix);
  }
  bulletMesh.count = n;
  bulletMesh.instanceMatrix.needsUpdate = true;
  stepParticles(dt);

  // Sumu
  const zone = world.zone;
  zoneWall.visible = zoneFloor.visible = !!zone;
  if (zone) {
    zoneWall.position.set(zone.x * S, 1.7, zone.y * S);
    zoneWall.scale.set(zone.r * S, 1, zone.r * S);
    zoneFloor.position.set(zone.x * S, 0.05, zone.y * S);
    zoneFloor.scale.set(zone.r * S, zone.r * S, 1);
  }

  // Valot
  const vx = view.px + (view.x - view.px) * alpha;
  const vy = view.py + (view.y - view.py) * alpha;
  const cos = Math.cos(view.aim);
  const sin = Math.sin(view.aim);
  flashlight.visible = view.alive;
  flashlight.position.set((vx + cos * 18) * S, 1.3, (vy + sin * 18) * S);
  // Keila osoitetaan lähelle maahan, jotta valo alkaa pelaajan edestä eikä vasta kolmen metrin päästä
  flashlight.target.position.set((vx + cos * 150) * S, 0, (vy + sin * 150) * S);
  flashlight.target.updateMatrixWorld();
  aura.position.set(vx * S, 1.6, vy * S);
  muzzleFlash = Math.max(0, muzzleFlash - dt * 14);
  muzzle.intensity = muzzleFlash * 70;
  muzzle.position.set((vx + cos * 30) * S, 1.1, (vy + sin * 30) * S);

  // Kamera seuraa pehmeästi
  const target = new THREE.Vector3(vx * S, 0, vy * S);
  if (!focusReady) {
    focus.copy(target);
    focusReady = true;
  } else {
    focus.lerp(target, 1 - Math.exp(-10 * dt));
  }
  camera.position.copy(focus).add(CAM_OFFSET);
  camera.lookAt(focus.x, 0.4, focus.z);
  camera.updateMatrixWorld();

  // Osuma punertaa ruudun
  if (me.alive && wasDead === false && me.hp < (me._lastHp ?? me.hp)) hurt = Math.max(hurt, 0.6);
  me._lastHp = me.hp;
  wasDead = !me.alive;
  hurt = Math.max(0, hurt - dt * 2.2);

  updateHud(me);
  pipeline.render(scene, camera, now / 1000, hurt);
  if (BENCH) {
    pipeline.renderer.getContext().finish();
    fpsLog.frameMs.push(performance.now() - t0);
    if (fpsLog.frameMs.length > 600) fpsLog.frameMs.shift();
  }
}

// --- Käynnistys ---

const start = document.getElementById('start');
function begin() {
  start.hidden = true;
  initAudio();
}
if (AUTO) begin();
else {
  start.addEventListener('click', begin);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM') toggleMute();
  });
}

// Testausta varten: lukemista varten ulos
window.__z3d = {
  world,
  fps: () => fpsLog,
};

requestAnimationFrame(frame);
