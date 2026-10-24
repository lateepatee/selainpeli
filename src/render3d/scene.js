// 3D-näkymä: kenttä, hahmot, valot ja tehosteet viistosta kamerasta. Lukee vain pelin tilaa
// (hostilla world, liittyjällä snapshoteista koottu näkymä), ei muuta sitä.
//
// Näkyvyys noudattaa samaa sääntöä kuin botit (vision.js): toinen pelaaja näkyy vain, jos hän on
// katsojan valossa ja näköyhteydessä. Zombien silmät näkyvät pimeässäkin, runko vain valossa.

import * as THREE from '../../vendor/three-0.170.0/three.module.min.js';
import { ZOMBIE_EMERGE_TIME, VIEW_W, VIEW_H } from '../constants.js';
import { MAX_PLAYERS } from '../protocol.js';
import { MAP_ID, LAMPS } from '../map.js';
import { MAPS } from '../maps.js';
import { lineOfSight } from '../geometry.js';
import { isLitFor, AURA_RADIUS, FLASHLIGHT_RANGE, FLASHLIGHT_HALF_ANGLE } from '../vision.js';
import { POWERUPS } from '../weapons.js';
import { createPipeline } from './post.js';
import { buildArena, disposeGroup, createLampLights, floorGlow, S, LAMP_INTENSITY } from './arena.js';
import {
  createPlayerActor, createZombieActor, createBossActor, poseHuman, poseZombie, poseBoss,
} from './actors.js';
import { qualitySettings, onQualityChange } from './quality.js';

const GUN_Y = 1.0;                // tähtäystaso (aseen korkeus)
const EYE_RANGE = 650;            // zombien silmät näkyvät pimeässä tähän asti (px)
const CAM_OFFSET = new THREE.Vector3(0, 12.5, 7);
const FOV = 45;                   // pystysuunta, astetta
const MAX_FOV = 80;
const FOG_COLOR = 0x040508;
const FLASHLIGHT_POWER = 170;
const OTHER_LIGHT_POWER = 90;
const AURA_POWER = 14;
const MAX_BULLETS = 256;
const MAX_PARTICLES = 160;
const BULLET_COLOR = new THREE.Color(0xffe08a);
const SPLASH_COLOR = new THREE.Color(0x76ff03);

let pipeline = null;
let scene = null;
let cam = null;
let flashlight = null;
let aura = null;
let muzzle = null;
let lanternLight = null;
let lampLights = [];
let otherLights = [];
let arena = null;
let arenaId = null;
let zoneWall = null;
let zoneFloor = null;
let actorGroup = null;
let bulletMesh = null;
let particleMesh = null;
const actors = { players: new Map(), zombies: new Map(), boss: null, powerups: new Map() };
const particles = [];
const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

let muzzleFlash = 0;
let hurt = 0;
let shake = 0;
let shadowOwner = undefined;   // kenen hahmo ei heitä varjoa (taskulampun omistaja)

export function initScene(canvas) {
  pipeline = createPipeline(canvas);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.Fog(FOG_COLOR, 12, 27);
  cam = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.5, 80);

  // Taivasvalo kirkastaa seinien yläpinnat, jotta ne eivät ole mustia möykkyjä
  scene.add(new THREE.AmbientLight(0x4a5670, 1.4), new THREE.HemisphereLight(0x7a88a8, 0x101014, 1.6));

  // Katsojan taskulamppu: ainoa valo, joka heittää varjoja. Kulma ja kantama samat kuin vision.js:ssä.
  flashlight = new THREE.SpotLight(0xfff0cc, 0, FLASHLIGHT_RANGE * S + 1.5, FLASHLIGHT_HALF_ANGLE * 1.15, 0.35, 1.3);
  flashlight.shadow.camera.near = 0.4;
  flashlight.shadow.camera.far = FLASHLIGHT_RANGE * S + 2;
  flashlight.shadow.bias = -0.002;
  flashlight.shadow.normalBias = 0.03;
  scene.add(flashlight, flashlight.target);

  // Näkyvien vastustajien taskulamput ilman varjoja. Valot varataan etukäteen ja sammutetaan
  // voimakkuudella, koska valojen määrän muuttuminen kääntäisi shaderit uudelleen kesken pelin.
  for (let i = 0; i < MAX_PLAYERS - 1; i++) {
    const l = new THREE.SpotLight(0xfff0cc, 0, FLASHLIGHT_RANGE * S + 1.5, FLASHLIGHT_HALF_ANGLE * 1.15, 0.35, 1.3);
    scene.add(l, l.target);
    otherLights.push(l);
  }

  // Pelaajan ympärillä kajo (vision.js: AURA_RADIUS), suuliekki ja Lyhtymiehen lyhty
  aura = new THREE.PointLight(0xffe2b0, 0, (AURA_RADIUS + 10) * S + 0.6, 1.5);
  muzzle = new THREE.PointLight(0xffa040, 0, 7, 2);
  lanternLight = new THREE.PointLight(0xffb04a, 0, 150 * S + 2, 1.5);
  scene.add(aura, muzzle, lanternLight);

  const maxLamps = Math.max(...Object.values(MAPS).map((m) => m.lamps.length));
  lampLights = createLampLights(maxLamps);
  scene.add(...lampLights);

  // Myrkkysumu: vihreä seinä ja sumuinen lattia alueen ulkopuolella
  zoneWall = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 3.5, 28, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x6fae2e, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  zoneFloor = new THREE.Mesh(
    new THREE.RingGeometry(1, 80, 28, 1),
    new THREE.MeshBasicMaterial({ color: 0x4f8a22, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
  );
  zoneFloor.rotation.x = -Math.PI / 2;
  zoneWall.visible = zoneFloor.visible = false;
  scene.add(zoneWall, zoneFloor);

  actorGroup = new THREE.Group();
  scene.add(actorGroup);

  bulletMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.7, 0.08, 0.08),
    new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }),
    MAX_BULLETS,
  );
  particleMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.12, 0.12, 0.12),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    MAX_PARTICLES,
  );
  // Instanssivärit luodaan heti, ettei materiaali käänny myöhemmin uudelleen.
  for (let i = 0; i < MAX_BULLETS; i++) bulletMesh.setColorAt(i, BULLET_COLOR);
  for (let i = 0; i < MAX_PARTICLES; i++) particleMesh.setColorAt(i, BULLET_COLOR);
  bulletMesh.count = particleMesh.count = 0;
  bulletMesh.frustumCulled = particleMesh.frustumCulled = false;
  scene.add(bulletMesh, particleMesh);

  applyQuality(qualitySettings());
  onQualityChange(applyQuality);
}

function applyQuality(q) {
  const shadows = q.shadowMap > 0;
  pipeline.renderer.shadowMap.enabled = shadows;
  flashlight.castShadow = shadows;
  if (shadows) {
    flashlight.shadow.mapSize.set(q.shadowMap, q.shadowMap);
    flashlight.shadow.map?.dispose();
    flashlight.shadow.map = null;
  }
  for (const l of otherLights) l.visible = q.otherLights;
  resizeScene();
  // Varjojen ja valojen muutos vaatii shaderien uudelleenkäännöksen (kerran, asetusta vaihdettaessa).
  scene.traverse((o) => {
    if (o.material) o.material.needsUpdate = true;
  });
}

export function resizeScene() {
  if (!pipeline) return;
  const aspect = pipeline.setResolution(qualitySettings().resH);
  cam.aspect = aspect;
  // Kapeassa ikkunassa näkökenttää levennetään, jotta sivuille näkyy yhtä paljon kuin leveässä
  // (kuten 2D:n VIEW_W × VIEW_H: kukaan ei näe vähemmän ikkunansa muodon takia).
  const minAspect = VIEW_W / VIEW_H;
  cam.fov = aspect >= minAspect ? FOV
    : Math.min(MAX_FOV, 2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * minAspect / aspect)));
  cam.updateProjectionMatrix();
}

// --- Syöte ja HUD: ruudun ja pelin koordinaatit ---

const raycaster = new THREE.Raycaster();
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GUN_Y);
const ndc = new THREE.Vector2();
const hitPoint = new THREE.Vector3();
const projected = new THREE.Vector3();

// Hiiren kohta aseen korkeudella -> pelin koordinaatit. Piirtopinta venytetään koko ikkunaan.
export function screenToWorld(sx, sy) {
  if (!cam) return { x: 0, y: 0 };
  ndc.set((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, cam);
  if (raycaster.ray.intersectPlane(aimPlane, hitPoint)) return { x: hitPoint.x / S, y: hitPoint.z / S };
  return { x: 0, y: 0 };
}

// Pelin kohta (x, y) korkeudella h -> ruudun kohta CSS-pikseleinä, tai null jos kameran takana.
export function worldToScreen(x, y, h = 0) {
  projected.set(x * S, h, y * S).project(cam);
  if (projected.z > 1) return null;
  return { x: (projected.x + 1) / 2 * window.innerWidth, y: (1 - projected.y) / 2 * window.innerHeight };
}

// --- Tapahtumat: hiukkaset, suuliekki, osuma ---

export function sceneEvents(events, localId, viewerId) {
  for (const e of events) {
    switch (e.type) {
      case 'shot':
        if (e.by === viewerId) muzzleFlash = 1;
        break;
      case 'wall': burst(e.x, e.y, 0xffd070, 4, 4); break;
      case 'zhit': burst(e.x, e.y, 0x7a1010, 5, 3.5); break;
      case 'hit':
        burst(e.x, e.y, 0xb01818, 7, 4);
        if (e.target === localId) hurt = Math.max(hurt, 0.6);
        break;
      case 'zkill': burst(e.x, e.y, 0x5c7a3a, 12, 5, 4); break;
      case 'blast': burst(e.x, e.y, 0x76ff03, 20, 8, 5); break;
      case 'kill': burst(e.x, e.y, 0xb01818, 24, 6, 5); break;
      case 'pickup': burst(e.x, e.y, colorHex(POWERUPS[e.kind]?.color), 18, 5, 5); break;
      case 'zflee': burst(e.x, e.y, 0x3b3f36, 12, 3); break;
      case 'bosshurt': burst(e.x, e.y, 0x3a2f45, 5, 3.5); break;
      case 'deflect': burst(e.x, e.y, 0xffffff, 6, 6); break;
      case 'bossRage': burst(e.x, e.y, 0xff3d2e, 40, 8, 6); break;
      case 'bossCounter': burst(e.x, e.y, 0xffb74d, 36, 9, 5); break;
      case 'bossKill': burst(e.x, e.y, 0xffb74d, 60, 10, 7); break;
      case 'bossLand':
        burst(e.x, e.y, 0x8d6e63, 30, 7, 4);
        shake = Math.max(shake, 0.5);
        break;
      case 'bossHit':
        burst(e.x, e.y, 0xc62828, e.heavy ? 18 : 10, 5);
        if (e.target === localId) hurt = 1;
        break;
      case 'zattack':
        burst(e.x, e.y, 0xc62828, 10, 4);
        if (e.target === localId) hurt = Math.max(hurt, 0.8);
        break;
    }
  }
}

function colorHex(css) {
  return css ? parseInt(css.slice(1), 16) : 0xffffff;
}

let nextParticle = 0;
function burst(x, y, color, count, speed, up = 3) {
  for (let i = 0; i < count; i++) {
    let p = particles[nextParticle];
    if (!p) p = particles[nextParticle] = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, color: 0 };
    nextParticle = (nextParticle + 1) % MAX_PARTICLES;
    const a = Math.random() * Math.PI * 2;
    const s = Math.random() * speed;
    p.x = x * S;
    p.y = 1.0;
    p.z = y * S;
    p.vx = Math.cos(a) * s;
    p.vz = Math.sin(a) * s;
    p.vy = Math.random() * up;
    p.life = 0.35 + Math.random() * 0.4;
    p.color = color;
  }
}

function stepParticles(dt) {
  let n = 0;
  for (const p of particles) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) continue;
    p.vy -= 12 * dt;
    p.x += p.vx * dt;
    p.y = Math.max(0.05, p.y + p.vy * dt);
    p.z += p.vz * dt;
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    particleMesh.setMatrixAt(n, dummy.matrix);
    particleMesh.setColorAt(n, tmpColor.setHex(p.color));
    n++;
  }
  particleMesh.count = n;
  particleMesh.instanceMatrix.needsUpdate = true;
  if (particleMesh.instanceColor) particleMesh.instanceColor.needsUpdate = true;
}

// --- Kenttä ---

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

// Kattolamppujen alue vision.js:n säännöllä (katsojaa tarvitaan vain oman valon laskuun).
function lampLit(x, y) {
  return LAMPS.some((l) => Math.hypot(x - l.x, y - l.y) < l.r * 0.6);
}

// Lamput värisevät ja sammuvat välillä hetkeksi.
function lampLevel(i, t) {
  const blink = hash(Math.floor(t * 10) * 7 + i * 131);
  if (blink < 0.04) return 0.25;
  return 1 + 0.25 * Math.sin(t * 3 + i * 1.7);
}

function hash(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

// --- Hahmot ---

function lookKey(p) {
  return `${p.color}|${p.look?.hat ?? 0}|${p.look?.pattern ?? 0}|${p.look?.face ?? 0}`;
}

function trackBodyMeshes(actor, keepAlways) {
  actor.bodyMeshes = [];
  actor.root.traverse((o) => {
    if (o.isMesh && !keepAlways.includes(o) && o.parent !== actor.parts.eyes) actor.bodyMeshes.push(o);
  });
}

function setCastShadow(actor, value) {
  actor.root.traverse((o) => {
    if (o.isMesh) o.castShadow = value;
  });
}

// Hahmo rakennetaan uudelleen, jos väri tai ulkonäkö vaihtuu (lämmittelyssä hahmovalikosta).
function playerActor(p) {
  let a = actors.players.get(p.id);
  const key = lookKey(p);
  if (a && a.key !== key) {
    actorGroup.remove(a.root);
    a = null;
  }
  if (!a) {
    a = createPlayerActor(p.color, p.look);
    a.key = key;
    a.last = { x: p.x, y: p.y };
    a.castsShadow = true;
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

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Piirtää ruudun. viewer = kenen silmin katsotaan (cameraTarget), focus = kameran kohta.
// Palauttaa HUDille tiedon siitä, mitkä pelaajat ja tehosteet näkyvät.
export function renderScene(world, viewer, alpha, dt, focus, time) {
  syncArena();
  const t = time;
  const vx = viewer ? lerp(viewer.px ?? viewer.x, viewer.x, alpha) : null;
  const vy = viewer ? lerp(viewer.py ?? viewer.y, viewer.y, alpha) : null;
  const eye = viewer ? { x: vx, y: vy } : null;
  const aim = viewer?.aim ?? 0;
  const seenPlayers = [];
  const seenPowerups = [];

  // Taskulampun omistajan oma keho ei saa heittää varjoa: se peittäisi koko keilan.
  if (shadowOwner !== viewer?.id) {
    for (const [id, a] of actors.players) {
      const v = id !== viewer?.id;
      if (a.castsShadow !== v) setCastShadow(a, (a.castsShadow = v));
    }
    shadowOwner = viewer?.id;
  }

  // Pelaajat ja näkyvien vastustajien lamput
  let light = 0;
  const others = qualitySettings().otherLights;
  for (const p of Object.values(world.players)) {
    const a = playerActor(p);
    if (a.castsShadow !== (p.id !== viewer?.id)) setCastShadow(a, (a.castsShadow = p.id !== viewer?.id));
    if (!p.alive) {
      a.root.visible = false;
      continue;
    }
    const x = lerp(p.px ?? p.x, p.x, alpha);
    const y = lerp(p.py ?? p.y, p.y, alpha);
    a.root.position.set(x * S, 0, y * S);
    a.root.rotation.y = -p.aim;
    const moved = Math.hypot(x - a.last.x, y - a.last.y) * S;
    a.last.x = x;
    a.last.y = y;
    poseHuman(a, moved, p.dashTicks > 0, t);
    // Sama sääntö kuin boteilla: valaisematon tai seinän takana oleva vastustaja on piilossa.
    const seen = p === viewer
      || (eye ? lineOfSight(eye.x, eye.y, x, y) && isLitFor(eye, aim, x, y) : lampLit(x, y));
    a.root.visible = seen;
    if (!seen) continue;
    seenPlayers.push({ p, x, y });
    if (p !== viewer && others && light < otherLights.length) {
      aimSpot(otherLights[light++], x, y, p.aim, OTHER_LIGHT_POWER);
    }
  }
  for (let i = light; i < otherLights.length; i++) otherLights[i].intensity = 0;
  for (const [id, a] of actors.players) {
    if (!world.players[id]) {
      actorGroup.remove(a.root);
      actors.players.delete(id);
    }
  }

  // Zombit: runko vain valossa, silmät pimeässäkin. Ikkunasta kiipeävä tulee ulkopuolelta sisään.
  const seenZ = new Set();
  const climbing = [];
  for (const z of world.zombies || []) {
    const a = zombieActor(z);
    seenZ.add(z.id);
    const x = lerp(z.px ?? z.x, z.x, alpha);
    const y = lerp(z.py ?? z.y, z.y, alpha);
    const emerging = z.emerging ?? z.emerge > 0;
    let frac = 0;
    if (emerging) {
      // Liittyjä saa vain tiedon kiipeämisestä, ei ajastinta: kesto lasketaan omasta kellosta.
      if (z.emerge !== undefined) frac = z.emerge / ZOMBIE_EMERGE_TIME;
      else {
        a.emergeAt ??= t;
        frac = Math.max(0, 1 - (t - a.emergeAt) / ZOMBIE_EMERGE_TIME);
      }
      climbing.push(z);
    } else {
      a.emergeAt = undefined;
    }
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

    const los = eye
      ? Math.hypot(x - eye.x, y - eye.y) < EYE_RANGE && lineOfSight(eye.x, eye.y, x, y)
      : lampLit(x, y);
    const lit = los && (!eye || isLitFor(eye, aim, x, y));
    a.root.visible = los;
    for (const m of a.bodyMeshes) m.visible = lit;
  }
  for (const [id, a] of actors.zombies) {
    if (!seenZ.has(id)) {
      actorGroup.remove(a.root);
      actors.zombies.delete(id);
    }
  }

  // Ikkuna sykkii punaisena, kun siitä kiipeää zombi (näkyy pimeässäkin, kuten ennen)
  const pulse = 0.45 + 0.35 * Math.sin(t * 14);
  for (const g of arena.userData.windowGlows) {
    const on = climbing.some((z) => Math.hypot(z.x - g.win.x, z.y - g.win.y) < 50);
    g.mesh.visible = on;
    if (on) g.mesh.material.opacity = pulse;
  }

  updateBoss(world.boss, eye, aim, alpha, t);

  // Tehosteet lattialla: vilkkuvat ennen katoamista, seinien läpi ei näe
  const seenPu = new Set();
  for (const pu of world.powerups || []) {
    seenPu.add(pu.id);
    let m = actors.powerups.get(pu.id);
    if (!m) {
      const color = new THREE.Color(POWERUPS[pu.type]?.color ?? '#ffffff');
      m = new THREE.Group();
      m.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshBasicMaterial({ color, fog: false })));
      const glow = floorGlow(color, 2.8, 0.5);
      glow.position.y = 0.03;
      m.add(glow);
      scene.add(m);
      actors.powerups.set(pu.id, m);
    }
    const cube = m.children[0];
    m.position.set(pu.x * S, 0, pu.y * S);
    cube.position.y = 0.7 + Math.sin(t * 3 + pu.id) * 0.15;
    cube.rotation.y = t * 2;
    const blink = pu.life < 4 && Math.floor(t * 6) % 2 === 0;
    m.visible = !blink && (!eye || lineOfSight(eye.x, eye.y, pu.x, pu.y));
    if (m.visible) seenPowerups.push(pu);
  }
  for (const [id, m] of actors.powerups) {
    if (!seenPu.has(id)) {
      scene.remove(m);
      m.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          o.material.dispose();
        }
      });
      actors.powerups.delete(id);
    }
  }

  // Ammukset: luodin valo näkyy pimeässäkin, mutta ei seinien läpi
  let n = 0;
  for (const bl of world.bullets) {
    if (n >= MAX_BULLETS) break;
    const x = lerp(bl.px ?? bl.x, bl.x, alpha);
    const y = lerp(bl.py ?? bl.y, bl.y, alpha);
    if (eye && !lineOfSight(eye.x, eye.y, x, y)) continue;
    dummy.position.set(x * S, GUN_Y, y * S);
    dummy.rotation.set(0, -Math.atan2(bl.vy ?? 0, bl.vx ?? 1), 0);
    dummy.scale.setScalar(bl.splash ? 2.2 : 1);
    dummy.updateMatrix();
    bulletMesh.setMatrixAt(n, dummy.matrix);
    bulletMesh.setColorAt(n, bl.splash ? SPLASH_COLOR : BULLET_COLOR);
    n++;
  }
  dummy.scale.setScalar(1);
  bulletMesh.count = n;
  bulletMesh.instanceMatrix.needsUpdate = true;
  if (bulletMesh.instanceColor) bulletMesh.instanceColor.needsUpdate = true;
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
  LAMPS.forEach((_, i) => {
    if (lampLights[i]) lampLights[i].intensity = LAMP_INTENSITY * lampLevel(i, t);
  });
  const lit = viewer?.alive;
  if (lit) {
    aimSpot(flashlight, vx, vy, aim, FLASHLIGHT_POWER);
    aura.position.set(vx * S, 1.6, vy * S);
    muzzle.position.set((vx + Math.cos(aim) * 30) * S, 1.1, (vy + Math.sin(aim) * 30) * S);
  } else {
    flashlight.intensity = 0;
  }
  aura.intensity = lit ? AURA_POWER : 0;
  muzzleFlash = Math.max(0, muzzleFlash - dt * 14);
  muzzle.intensity = lit ? muzzleFlash * 70 : 0;

  // Kamera seuraa kohtaa focus (followCamera). Bossin laskeutuminen tärisyttää.
  shake = Math.max(0, shake - dt * 2);
  const jx = (Math.random() - 0.5) * shake * 0.6;
  const jz = (Math.random() - 0.5) * shake * 0.6;
  cam.position.set(focus.x * S + jx, 0, focus.y * S + jz).add(CAM_OFFSET);
  cam.lookAt(focus.x * S + jx, 0.4, focus.y * S + jz);
  cam.updateMatrixWorld();

  hurt = Math.max(0, hurt - dt * 2.2);
  pipeline.render(scene, cam, t, hurt);
  return { seenPlayers, seenPowerups };
}

// Taskulamppu: lähtee hieman pelaajan edestä ja osoittaa lähelle maahan, jotta keila alkaa heti
// pelaajan edestä eikä vasta kolmen metrin päästä.
function aimSpot(l, x, y, aim, power) {
  const c = Math.cos(aim);
  const s = Math.sin(aim);
  l.intensity = power;
  l.position.set((x + c * 18) * S, 1.3, (y + s * 18) * S);
  l.target.position.set((x + c * 150) * S, 0, (y + s * 150) * S);
  l.target.updateMatrixWorld();
}

function updateBoss(b, eye, aim, alpha, t) {
  if (b && !actors.boss) {
    const a = createBossActor();
    trackBodyMeshes(a, [a.parts.lantern]);
    a.last = { x: b.x, y: b.y };
    a.warn = new THREE.Mesh(
      new THREE.RingGeometry(70 * S, 75 * S, 20),
      new THREE.MeshBasicMaterial({ color: 0xff3d2e, transparent: true, opacity: 0.8, depthWrite: false, fog: false }),
    );
    a.warn.rotation.x = -Math.PI / 2;
    // Vastaiskun säde: lähelle ei kannata jäädä
    a.counter = new THREE.Mesh(
      new THREE.RingGeometry(126 * S, 130 * S, 32),
      new THREE.MeshBasicMaterial({ color: 0xffb74d, transparent: true, opacity: 0.8, depthWrite: false, fog: false }),
    );
    a.counter.rotation.x = -Math.PI / 2;
    actorGroup.add(a.root, a.warn, a.counter);
    actors.boss = a;
  } else if (!b && actors.boss) {
    const a = actors.boss;
    actorGroup.remove(a.root, a.warn, a.counter);
    for (const m of [a.warn, a.counter]) {
      m.geometry.dispose();
      m.material.dispose();
    }
    actors.boss = null;
  }
  if (!b) {
    lanternLight.intensity = 0;
    return;
  }
  const a = actors.boss;
  const x = lerp(b.px ?? b.x, b.x, alpha);
  const y = lerp(b.py ?? b.y, b.y, alpha);
  const lift = b.state === 'leap' ? Math.sin(Math.PI * (1 - Math.max(0, b.timer) / 0.35)) * 2.5 : 0;
  const sink = b.state === 'emerge' ? 0.6 : 0;
  a.root.position.set(x * S, lift + sink, y * S);
  a.root.rotation.y = -b.angle;
  poseBoss(a, b, Math.hypot(x - a.last.x, y - a.last.y) * S, t);
  a.last.x = x;
  a.last.y = y;
  const los = !eye || lineOfSight(eye.x, eye.y, x, y);
  const lit = los && (!eye || isLitFor(eye, aim, x, y));
  a.root.visible = los;
  for (const m of a.bodyMeshes) m.visible = lit;
  // Hypyn osumakohta näkyy aina, jotta ehtii väistää
  a.warn.visible = b.state === 'leapWind' || b.state === 'leap';
  a.warn.position.set(b.tx * S, 0.06, b.ty * S);
  a.warn.scale.setScalar(1 + Math.sin(t * 18) * 0.06);
  a.counter.visible = los && b.state === 'counter';
  a.counter.position.set(x * S, 0.06, y * S);
  a.counter.material.opacity = 0.5 + 0.4 * Math.sin(t * 20);
  // Lyhty valaisee ympäristöään: bossin näkee tulevan
  const la = b.angle + 0.55;
  lanternLight.position.set((x + Math.cos(la) * 30) * S, 1.8 + lift, (y + Math.sin(la) * 30) * S);
  lanternLight.intensity = (b.enraged ? 30 : 22) * (1 + 0.1 * Math.sin(t * 7));
  lanternLight.color.setHex(b.enraged ? 0xff3d2e : 0xffb04a);
}

// Aulassa tai yhteyttä odottaessa: tyhjä ruutu.
export function clearScene() {
  if (!pipeline) return;
  const r = pipeline.renderer;
  r.setRenderTarget(null);
  r.setClearColor(0x0d0f14, 1);
  r.clear();
}

// Mittausta varten (?fps=1): odottaa näytönohjaimen valmistumista, jotta ruudun kesto on todellinen.
export function finishGpu() {
  pipeline?.renderer.getContext().finish();
}
