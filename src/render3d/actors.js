// Pelaajien, zombien ja bossin low-poly-hahmot. Vain piirtoa: tila tulee simulaatiosta.
// Zombien liike on tahallaan nykivää (askelletut kulmat ja satunnaiset nytkähdykset).

import * as THREE from '../../vendor/three-0.170.0/three.module.min.js';
import { psx } from './post.js';
import { HATS, PATTERNS, FACES } from '../appearance.js';

const SKIN = 0xa88462;
const ZOMBIE_SKIN = 0x6f8a5a;
const ZOMBIE_CLOTH = 0x3a3830;

const matCache = new Map();
function lambert(color) {
  let m = matCache.get(color);
  if (!m) {
    m = psx(new THREE.MeshLambertMaterial({ color }));
    matCache.set(color, m);
  }
  return m;
}
const redEye = new THREE.MeshBasicMaterial({ color: 0xff2a1f, fog: false });
const lampGlow = new THREE.MeshBasicMaterial({ color: 0xffb04a, fog: false });
const flashlightMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });

// Samankokoiset palat jakavat geometrian: zombeja syntyy ja kuolee jatkuvasti, eikä mitään tarvitse vapauttaa.
const geoCache = new Map();
function boxGeo(w, h, d, pivotTop) {
  const key = `${w},${h},${d},${pivotTop}`;
  let geo = geoCache.get(key);
  if (!geo) {
    geo = new THREE.BoxGeometry(w, h, d);
    if (pivotTop) geo.translate(0, -h / 2, 0); // kääntyy yläpäästä (raaja)
    geoCache.set(key, geo);
  }
  return geo;
}

function part(w, h, d, color, x, y, z, pivotTop = false) {
  const geo = boxGeo(w, h, d, pivotTop);
  const mesh = new THREE.Mesh(geo, color instanceof THREE.Material ? color : lambert(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

// Hahmo katsoo paikallisen x-akselin suuntaan. Raajat ovat omissa nivelissään.
function humanoid({ skin, cloth, legs, scale = 1, lantern = false }) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.position.y = 0.75;

  const legL = part(0.24, 0.75, 0.24, legs, 0, 0, -0.16, true);
  const legR = part(0.24, 0.75, 0.24, legs, 0, 0, 0.16, true);
  legL.position.y = 0;
  legR.position.y = 0;
  const hip = new THREE.Group();
  hip.add(legL, legR);
  root.add(hip);
  hip.position.y = 0.75;

  const torso = part(0.34, 0.62, 0.56, cloth, 0, 0.31, 0);
  body.add(torso);
  const head = new THREE.Group();
  head.position.set(0, 0.74, 0);
  head.add(part(0.34, 0.34, 0.32, skin, 0, 0.12, 0));
  body.add(head);

  const armL = part(0.2, 0.55, 0.2, skin, 0, 0, -0.38, true);
  const armR = part(0.2, 0.55, 0.2, skin, 0, 0, 0.38, true);
  armL.position.y = 0.58;
  armR.position.y = 0.58;
  body.add(armL, armR);

  root.scale.setScalar(scale);
  const parts = { body, hip, legL, legR, torso, head, armL, armR };
  if (lantern) {
    const glow = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), lampGlow);
    glow.position.set(0.3, 0.15, 0.3);
    head.add(glow);
    parts.lantern = glow;
  }
  return { root, parts };
}

// Pelaaja: väri tulee pelin pelaajaväristä, päähine, kuvio ja kasvot hahmovalikosta (appearance.js).
// Taskulamppu käsi suorana eteenpäin.
export function createPlayerActor(color, look) {
  const cloth = new THREE.Color(color).getHex();
  const { root, parts } = humanoid({ skin: SKIN, cloth, legs: 0x2d3340 });
  const lamp = part(0.28, 0.16, 0.16, flashlightMat, 0.3, -0.5, 0);
  parts.armR.add(lamp);
  addPattern(parts.torso, PATTERNS[look?.pattern]?.id);
  addHat(parts.head, HATS[look?.hat]?.id, cloth);
  addFace(parts.head, FACES[look?.face]?.id ?? 'eyes');
  root.scale.setScalar(1.2);
  return { root, parts, walk: 0, kind: 'player' };
}

// Pää: kuutio 0,34 × 0,34 × 0,32 kohdassa y = 0,12, katse +x-suuntaan. Yläpinta on y = 0,29.
function addHat(head, hat, cloth) {
  const add = (...args) => head.add(part(...args));
  if (hat === 'cap') {
    add(0.36, 0.08, 0.35, 0xc62828, 0, 0.32, 0);
    add(0.18, 0.03, 0.3, 0xc62828, 0.24, 0.29, 0);
  } else if (hat === 'helmet') {
    add(0.42, 0.14, 0.4, 0x4b5a3a, -0.01, 0.31, 0);
  } else if (hat === 'beanie') {
    add(0.37, 0.12, 0.35, 0x1e88e5, -0.01, 0.33, 0);
    add(0.09, 0.09, 0.09, 0xffffff, -0.02, 0.43, 0);
  } else if (hat === 'headband') {
    add(0.37, 0.06, 0.35, 0xe53935, 0, 0.21, 0);
    add(0.12, 0.04, 0.04, 0xe53935, -0.22, 0.19, 0.06);
  } else if (hat === 'horns') {
    for (const z of [-0.13, 0.13]) {
      const horn = part(0.07, 0.24, 0.07, 0xefe6d2, 0.04, 0.38, z);
      horn.rotation.x = z > 0 ? 0.5 : -0.5;
      head.add(horn);
    }
  } else if (hat === 'crown') {
    add(0.3, 0.08, 0.3, 0xffca28, 0, 0.33, 0);
    for (const [x, z] of [[0.12, 0.12], [0.12, -0.12], [-0.12, 0.12], [-0.12, -0.12]]) add(0.06, 0.1, 0.06, 0xffca28, x, 0.41, z);
    add(0.06, 0.06, 0.06, cloth, 0.15, 0.33, 0);
  } else if (hat === 'tophat') {
    add(0.46, 0.03, 0.44, 0x1a1a1a, 0, 0.3, 0);
    add(0.28, 0.3, 0.28, 0x2b2b2b, 0, 0.46, 0);
    add(0.29, 0.05, 0.29, 0x8e1b1b, 0, 0.34, 0);
  }
}

function addFace(head, face) {
  const add = (...args) => head.add(part(...args));
  if (face === 'eyes' || face === 'angry') {
    for (const z of [-0.08, 0.08]) {
      add(0.02, 0.06, 0.06, 0xffffff, 0.175, 0.15, z);
      add(0.02, 0.03, 0.03, 0x111111, 0.18, 0.15, z);
    }
    if (face === 'angry') {
      for (const z of [-0.08, 0.08]) {
        const brow = part(0.02, 0.025, 0.09, 0x111111, 0.18, 0.21, z);
        brow.rotation.x = z > 0 ? 0.4 : -0.4;
        head.add(brow);
      }
    }
  } else if (face === 'visor') {
    add(0.03, 0.09, 0.3, 0x1b2733, 0.175, 0.15, 0);
    add(0.03, 0.02, 0.18, 0x78c8ff, 0.18, 0.17, -0.04);
  } else if (face === 'mask') {
    add(0.03, 0.14, 0.33, 0x7a1f1f, 0.175, 0.03, 0);
    for (const z of [-0.08, 0.08]) add(0.02, 0.05, 0.05, 0xffffff, 0.175, 0.17, z);
  }
}

// Torso: 0,34 × 0,62 × 0,56 (syvyys x, korkeus y, leveys z), keskikohta y = 0,31.
function addPattern(torso, pattern) {
  const dark = 0x000000;
  if (pattern === 'stripes') {
    for (const z of [-0.2, 0, 0.2]) torso.add(part(0.36, 0.62, 0.06, dark, 0, 0, z));
  } else if (pattern === 'dots') {
    for (const [y, z] of [[0.18, -0.15], [0.05, 0.12], [-0.12, -0.05], [-0.2, 0.18], [0.2, 0.2]]) {
      torso.add(part(0.36, 0.07, 0.07, dark, 0, y, z));
    }
  } else if (pattern === 'camo') {
    for (const [y, z, w] of [[0.15, -0.12, 0.2], [-0.05, 0.14, 0.16], [-0.2, -0.08, 0.14]]) {
      torso.add(part(0.36, w * 0.7, w, 0x26331a, 0, y, z));
    }
  }
  for (const c of torso.children) c.material = patternMat(c.material.color.getHex());
}

// Kuvio on puoliksi läpinäkyvä tumma kerros, jotta se näkyy kaikilla paidan väreillä.
const patternMats = new Map();
function patternMat(color) {
  let m = patternMats.get(color);
  if (!m) {
    m = psx(new THREE.MeshLambertMaterial({ color, transparent: true, opacity: color === 0 ? 0.3 : 0.5 }));
    patternMats.set(color, m);
  }
  return m;
}

// Zombit saavat satunnaisen yksilöllisen ulkonäön id:n perusteella.
export function createZombieActor(id) {
  const cloths = [ZOMBIE_CLOTH, 0x4a3030, 0x30403a, 0x3a3a48];
  const { root, parts } = humanoid({
    skin: ZOMBIE_SKIN, cloth: cloths[id % cloths.length], legs: 0x25262a, scale: 1.1 + (id % 4) * 0.05,
  });
  const eyes = new THREE.Group();
  for (const z of [-0.08, 0.08]) {
    const eye = new THREE.Mesh(boxGeo(0.05, 0.05, 0.05, false), redEye);
    eye.position.set(0.18, 0.18, z);
    eyes.add(eye);
  }
  parts.head.add(eyes);
  parts.eyes = eyes;
  return { root, parts, walk: 0, kind: 'zombie', id, seed: id * 7.31 };
}

export function createBossActor() {
  const { root, parts } = humanoid({ skin: 0x8a8a80, cloth: 0x1c1c22, legs: 0x141418, scale: 2.3, lantern: true });
  return { root, parts, walk: 0, kind: 'boss', seed: 3.3 };
}

function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// Pelaajan pose: kädet eteen tähtäämään, askellus liikkeestä.
export function poseHuman(a, moved, dashing, t) {
  const p = a.parts;
  a.walk += moved * 2.4;
  const sw = Math.sin(a.walk) * Math.min(1, moved * 14) * 0.9;
  p.legL.rotation.z = sw;
  p.legR.rotation.z = -sw;
  p.armR.rotation.z = Math.PI / 2 + 0.05;  // ojennettu eteen
  p.armL.rotation.z = Math.PI / 2 + 0.15;
  p.body.position.y = 0.75 + Math.abs(Math.sin(a.walk)) * 0.04 * Math.min(1, moved * 14);
  p.body.rotation.z = dashing ? -0.5 : 0;
  void t;
}

const STEP_HZ = 6;  // nykivän animaation ruudunpäivitys

// Zombi: askelletut raajat, päänyökkäykset ja toispuolinen ontuminen.
export function poseZombie(a, moved, t, emerging) {
  const p = a.parts;
  const k = Math.floor(t * STEP_HZ + a.seed);
  const h1 = hash(k * 1.7 + a.seed);
  const h2 = hash(k * 3.1 + a.seed * 2.0);
  const h3 = hash(k * 5.3 + a.seed * 3.0);

  a.walk += moved * 1.6;
  const stepped = Math.floor(a.walk * 1.5) / 1.5;
  const lurch = Math.sin(stepped * 2.0);

  p.legL.rotation.z = lurch * 0.8;
  p.legR.rotation.z = -lurch * 0.35 + 0.25;           // toinen jalka laahaa
  p.body.rotation.z = -0.35 + h1 * 0.25;              // kumara, lysähtelevä
  p.body.rotation.x = (h2 - 0.5) * 0.3;
  p.body.position.y = 0.7 + (h3 > 0.8 ? -0.1 : 0);

  // Kädet ojossa mutta vääriin kulmiin
  p.armL.rotation.z = Math.PI / 2 + 0.2 + (h1 - 0.5) * 0.9;
  p.armR.rotation.z = Math.PI / 2 - 0.3 + (h2 - 0.5) * 1.1;
  p.armL.rotation.x = (h3 - 0.5) * 0.8;
  p.armR.rotation.x = (h1 - 0.5) * 0.8;

  // Pää nytkähtää: välillä kääntyy väärään suuntaan
  const snap = h2 > 0.82;
  p.head.rotation.y = snap ? (h1 - 0.5) * 3.0 : (h3 - 0.5) * 0.5;
  p.head.rotation.z = snap ? 0.9 * (h3 - 0.5) : 0.3 * (h2 - 0.5);
  p.head.rotation.x = 0;

  void emerging;
}

export function poseBoss(a, boss, moved, t) {
  const p = a.parts;
  a.walk += moved * 1.2;
  const sw = Math.sin(a.walk) * Math.min(1, moved * 10) * 0.7;
  p.legL.rotation.z = sw;
  p.legR.rotation.z = -sw;
  const wind = boss.state === 'leapWind';
  const counter = boss.state === 'counter';
  p.body.rotation.z = wind ? 0.5 : -0.1;
  p.armL.rotation.z = counter ? -Math.PI + 0.3 : -0.6 + Math.sin(a.walk) * 0.3;
  p.armR.rotation.z = counter ? -Math.PI + 0.3 : -0.6 - Math.sin(a.walk) * 0.3;
  p.lantern.scale.setScalar(1 + Math.sin(t * 9) * 0.12 + (boss.enraged ? 0.3 : 0));
  p.lantern.material.color.setHex(boss.enraged ? 0xff3d2e : 0xffb04a);
}
