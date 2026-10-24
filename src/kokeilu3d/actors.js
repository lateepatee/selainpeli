// Pelaajien, zombien ja bossin low-poly-hahmot. Vain piirtoa: tila tulee simulaatiosta.
// Zombien liike on tahallaan nykivää (askelletut kulmat ja satunnaiset nytkähdykset).

import * as THREE from '../../vendor/three-0.170.0/three.module.min.js';
import { psx } from './post.js';
import { S } from './arena.js';

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

function part(w, h, d, color, x, y, z, pivotTop = false) {
  const geo = new THREE.BoxGeometry(w, h, d);
  if (pivotTop) geo.translate(0, -h / 2, 0); // kääntyy yläpäästä (raaja)
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

// Pelaaja: väri tulee pelin pelaajaväristä. Taskulamppu käsi suorana eteenpäin.
export function createPlayerActor(color) {
  const { root, parts } = humanoid({ skin: SKIN, cloth: new THREE.Color(color).getHex(), legs: 0x2d3340 });
  const lamp = part(0.28, 0.16, 0.16, flashlightMat, 0.3, -0.5, 0);
  parts.armR.add(lamp);
  root.scale.setScalar(1.2);
  return { root, parts, walk: 0, kind: 'player' };
}

// Zombit saavat satunnaisen yksilöllisen ulkonäön id:n perusteella.
export function createZombieActor(id) {
  const cloths = [ZOMBIE_CLOTH, 0x4a3030, 0x30403a, 0x3a3a48];
  const { root, parts } = humanoid({
    skin: ZOMBIE_SKIN, cloth: cloths[id % cloths.length], legs: 0x25262a, scale: 1.1 + (id % 4) * 0.05,
  });
  const eyes = new THREE.Group();
  for (const z of [-0.08, 0.08]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), redEye);
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

export { S };
