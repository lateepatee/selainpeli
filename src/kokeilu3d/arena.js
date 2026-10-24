// Kentän (map.js) muuntaminen 3D-laatikoiksi. Yksi pelipikseli on 1/32 yksikköä.

import * as THREE from '../../vendor/three-0.170.0/three.module.min.js';
import * as M from '../map.js';
import { PERKS, WEAPONS } from '../weapons.js';
import { psx } from './post.js';

export const S = 1 / 32;
const OUTER = 0.8;          // ulkoseinän paksuus
const WINDOW_LEN = 70;      // sama kuin 2D:n ikkuna (px)
const WALL_H = 2.1;

// Teemakohtaiset värit: lattia, seinä, laatikot ja ikkunan laudat.
const THEMES = {
  bunker: { floor: 0x6b7068, wall: 0x7d8580, crate: 0x7a5c33, window: 0x5a5f63 },
  manor: { floor: 0x6a4a3a, wall: 0x8a5a58, crate: 0x4a3322, window: 0x4a3322 },
  graveyard: { floor: 0x3f5136, wall: 0x6a6f66, crate: 0x5a4a35, window: 0x3a3f3a },
  warehouse: { floor: 0x77705f, wall: 0x8a6a4a, crate: 0x8a6a3a, window: 0xc9a227 },
};

const KINDS = {
  wall: { h: WALL_H, mat: 'wall' },
  crate: { h: 1.3, mat: 'crate' },
  furniture: { h: 0.95, mat: 'wood' },
  shelf: { h: 1.9, mat: 'metal' },
  stone: { h: 1.1, mat: 'stone' },
  grave: { h: 0.65, mat: 'stone' },
  tree: { h: 2.4, mat: 'bark' },
};

// --- Tekstuurit: pienet, terävät ja luodaan koodilla (ei tiedostoja) ---

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeTexture(kind, seed) {
  const size = 32;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = rng(seed);
  g.fillStyle = '#bbb';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 260; i++) {
    const v = 150 + Math.floor(r() * 90);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(Math.floor(r() * size), Math.floor(r() * size), 1, 1);
  }
  g.fillStyle = 'rgba(0,0,0,0.35)';
  if (kind === 'wall') {
    for (let y = 0; y < size; y += 8) {
      g.fillRect(0, y, size, 1);
      for (let x = (y / 8) % 2 ? 0 : 8; x < size; x += 16) g.fillRect(x, y, 1, 8);
    }
  } else if (kind === 'wood') {
    for (let y = 0; y < size; y += 8) g.fillRect(0, y, size, 1);
  } else if (kind === 'metal') {
    for (let x = 0; x < size; x += 8) g.fillRect(x, 0, 1, size);
    g.fillRect(0, 0, size, 2);
  } else if (kind === 'floor') {
    g.fillRect(0, 0, size, 1);
    g.fillRect(0, 0, 1, size);
    for (let i = 0; i < 4; i++) g.fillRect(Math.floor(r() * size), Math.floor(r() * size), 3 + Math.floor(r() * 6), 1);
  } else if (kind === 'crate') {
    g.fillRect(0, 0, size, 2);
    g.fillRect(0, size - 2, size, 2);
    g.fillRect(0, 0, 2, size);
    g.fillRect(size - 2, 0, 2, size);
    for (let i = 0; i < size; i++) g.fillRect(i, i, 1, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let textures = null;
function getTextures() {
  textures ||= {
    wall: makeTexture('wall', 1), wood: makeTexture('wood', 2), metal: makeTexture('metal', 3),
    stone: makeTexture('stone', 4), crate: makeTexture('crate', 5), bark: makeTexture('wood', 6),
    floor: makeTexture('floor', 7),
  };
  return textures;
}

// --- Geometrian yhdistäminen: yksi piirtokutsu per materiaali ---

// Laatikko, jonka tekstuuri toistuu 2 yksikön välein oikeassa mittakaavassa.
function box(w, h, d, x, y, z, tile = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // +x -x +y -y +z -z
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * dims[f][0]) / tile, (uv.getY(k) * dims[f][1]) / tile);
    }
  }
  g.translate(x, y, z);
  return g;
}

function merge(geos) {
  let vertexCount = 0;
  let indexCount = 0;
  for (const g of geos) {
    vertexCount += g.attributes.position.count;
    indexCount += g.index.count;
  }
  const pos = new Float32Array(vertexCount * 3);
  const nor = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const idx = new Uint32Array(indexCount);
  let v = 0;
  let i = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, v * 3);
    nor.set(g.attributes.normal.array, v * 3);
    uvs.set(g.attributes.uv.array, v * 2);
    for (let k = 0; k < g.index.count; k++) idx[i + k] = g.index.array[k] + v;
    v += g.attributes.position.count;
    i += g.index.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// Lamppujen valot varataan etukäteen: valojen määrän muuttuminen kääntäisi shaderit uudelleen kesken pelin.
export function createLampLights(count) {
  const lights = [];
  for (let i = 0; i < count; i++) {
    const l = new THREE.PointLight(0xffc27a, 0, 4, 2);
    l.position.set(0, -50, 0);
    lights.push(l);
  }
  return lights;
}

function wallBuyDecal(weaponId) {
  const c = document.createElement('canvas');
  c.width = 48;
  c.height = 24;
  const g = c.getContext('2d');
  g.fillStyle = '#e8e8d8';
  const len = 24 + (WEAPONS[weaponId].length ?? 10);
  const x = (48 - len) / 2;
  g.fillRect(x, 9, len, 3);
  g.fillRect(x + len * 0.2, 12, 4, 7);
  g.fillRect(x - 3, 9, 6, 6);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Palauttaa ryhmän, joka poistetaan kentän vaihtuessa. Jaetut tekstuurit säilyvät.
export function buildArena(lampLights) {
  const th = THEMES[M.MAP_THEME] || THEMES.bunker;
  const tex = getTextures();
  const group = new THREE.Group();
  const W = M.ARENA_W * S;
  const D = M.ARENA_H * S;
  const buckets = {};
  const add = (key, geo) => (buckets[key] ||= []).push(geo);

  for (const o of M.OBSTACLES) {
    // Arpalaatikko ja automaatit piirretään omina, hehkuvina esineinään
    if (o.kind === 'box' || o.kind === 'machine') continue;
    const k = KINDS[o.kind] || KINDS.wall;
    const w = o.w * S;
    const d = o.h * S;
    const cx = (o.x + o.w / 2) * S;
    const cz = (o.y + o.h / 2) * S;
    if (o.kind === 'tree') {
      const t = Math.min(w, d) * 0.45;
      add('bark', box(t, k.h, t, cx, k.h / 2, cz));
      const cone = new THREE.ConeGeometry(Math.max(w, d) * 0.75, 2.2, 5);
      cone.translate(cx, k.h + 0.6, cz);
      add('leaf', cone);
    } else {
      add(k.mat, box(w, k.h, d, cx, k.h / 2, cz));
    }
  }

  // Ulkoseinät, ikkunoiden kohdalla aukko
  for (const side of ['top', 'bottom', 'left', 'right']) {
    const horizontal = side === 'top' || side === 'bottom';
    const len = horizontal ? W : D;
    const holes = M.WINDOWS.filter((wn) => wn.side === side)
      .map((wn) => (horizontal ? wn.x : wn.y) * S)
      .sort((a, b) => a - b);
    let cursor = -OUTER;
    const pieces = [];
    for (const c of holes) {
      pieces.push([cursor, c - (WINDOW_LEN * S) / 2]);
      cursor = c + (WINDOW_LEN * S) / 2;
    }
    pieces.push([cursor, len + OUTER]);
    for (const [a, b] of pieces) {
      if (b - a <= 0.01) continue;
      const mid = (a + b) / 2;
      const span = b - a;
      if (horizontal) add('wall', box(span, WALL_H, OUTER, mid, WALL_H / 2, side === 'top' ? -OUTER / 2 : D + OUTER / 2));
      else add('wall', box(OUTER, WALL_H, span, side === 'left' ? -OUTER / 2 : W + OUTER / 2, WALL_H / 2, mid));
    }
  }

  // Ikkunoiden laudat: kaksi vaakalautaa aukossa
  for (const wn of M.WINDOWS) {
    const horizontal = wn.side === 'top' || wn.side === 'bottom';
    const x = wn.side === 'left' ? -OUTER / 2 : wn.side === 'right' ? W + OUTER / 2 : wn.x * S;
    const z = wn.side === 'top' ? -OUTER / 2 : wn.side === 'bottom' ? D + OUTER / 2 : wn.y * S;
    const len = WINDOW_LEN * S;
    for (const y of [0.55, 1.2]) {
      add('window', horizontal ? box(len, 0.16, 0.18, x, y, z) : box(0.18, 0.16, len, x, y, z));
    }
  }

  const mats = {
    wall: new THREE.MeshLambertMaterial({ map: tex.wall, color: th.wall }),
    crate: new THREE.MeshLambertMaterial({ map: tex.crate, color: th.crate }),
    wood: new THREE.MeshLambertMaterial({ map: tex.wood, color: 0x6a4a30 }),
    metal: new THREE.MeshLambertMaterial({ map: tex.metal, color: 0x6a7480 }),
    stone: new THREE.MeshLambertMaterial({ map: tex.stone, color: 0x8a8d88 }),
    bark: new THREE.MeshLambertMaterial({ map: tex.bark, color: 0x4a3626 }),
    leaf: new THREE.MeshLambertMaterial({ color: 0x1f3a22, flatShading: true }),
    window: new THREE.MeshLambertMaterial({ map: tex.wood, color: th.window }),
  };
  for (const [key, geos] of Object.entries(buckets)) {
    const mesh = new THREE.Mesh(merge(geos), psx(mats[key]));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Lattia (tekstuuri toistuu 2 yksikön välein)
  const floorTex = tex.floor.clone();
  floorTex.needsUpdate = true;
  floorTex.repeat.set(W / 2, D / 2);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    psx(new THREE.MeshLambertMaterial({ map: floorTex, color: th.floor })),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W / 2, 0, D / 2);
  floor.receiveShadow = true;
  group.add(floor);

  if (M.BOX) {
    const chest = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.9, 0.95),
      psx(new THREE.MeshLambertMaterial({ map: tex.crate, color: 0x6b4a22 })),
    );
    chest.position.set(M.BOX.x * S, 0.45, M.BOX.y * S);
    chest.castShadow = chest.receiveShadow = true;
    group.add(chest);
  }

  // Juoma-automaattien värillinen hehku erottaa ne pimeässä
  for (const m of M.PERK_MACHINES) {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.25, 2.0, 1.25),
      psx(new THREE.MeshLambertMaterial({
        map: tex.metal, color: 0x555a60, emissive: new THREE.Color(PERKS[m.perk].color), emissiveIntensity: 0.35,
      })),
    );
    body.position.set(m.x * S, 1.0, m.y * S);
    body.castShadow = body.receiveShadow = true;
    group.add(body);
  }

  // Seinäaseet: liitupiirros lattiassa
  for (const b of M.WALL_BUYS) {
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 0.9),
      new THREE.MeshBasicMaterial({ map: wallBuyDecal(b.weapon), transparent: true, opacity: 0.5, depthWrite: false, fog: false }),
    );
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(b.x * S, 0.03, b.y * S);
    group.add(decal);
  }

  // Lamput: hehkuva pallo ja varattu pistevalo. Valon kantama vastaa vision.js:n 0,6 × r -sääntöä.
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd99a });
  M.LAMPS.forEach((l, i) => {
    const bulb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 0), psx(bulbMat));
    bulb.position.set(l.x * S, 3.3, l.y * S);
    group.add(bulb);
    const light = lampLights[i];
    if (!light) return;
    light.position.set(l.x * S, 3.1, l.y * S);
    light.distance = l.r * 0.85 * S + 3.0;
    light.intensity = 38;
  });
  for (let i = M.LAMPS.length; i < lampLights.length; i++) {
    lampLights[i].intensity = 0;
    lampLights[i].position.set(0, -50, 0);
  }

  return group;
}

export function disposeGroup(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    // Jaetut tekstuurit (getTextures) säilyvät, vain materiaalit vapautetaan.
    if (o.material) o.material.dispose();
  });
}
