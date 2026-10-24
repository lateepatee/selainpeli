// Kentän (map.js) muuntaminen 3D-laatikoiksi. Yksi pelipikseli on 1/32 yksikköä.

import * as THREE from '../../vendor/three-0.170.0/three.module.min.js';
import * as M from '../map.js';
import { psx } from './post.js';
import { S, box, merge, floorGlow, isSharedMap } from './geo.js';
import { createWindows } from './windows.js';
import { buildProps } from './props.js';

export { S, floorGlow };

const OUTER = 0.8;          // ulkoseinän paksuus
const WINDOW_LEN = 70;      // sama kuin 2D:n ikkuna (px)
const WALL_H = 2.1;
export const LAMP_INTENSITY = 38;

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

  // Ikkunan kehys: kynnys ja yläpalkki. Laudat ovat omia mesejään (windows.js), jotta ne voivat repeytyä.
  // Ikkunan punainen hehku sykkii, kun zombi kiipeää sisään (scene.js).
  const windowGlows = [];
  for (const wn of M.WINDOWS) {
    const horizontal = wn.side === 'top' || wn.side === 'bottom';
    const x = wn.side === 'left' ? -OUTER / 2 : wn.side === 'right' ? W + OUTER / 2 : wn.x * S;
    const z = wn.side === 'top' ? -OUTER / 2 : wn.side === 'bottom' ? D + OUTER / 2 : wn.y * S;
    const len = WINDOW_LEN * S;
    const sillH = 0.55;
    const lintelH = WALL_H - 1.8;
    for (const [h, y] of [[sillH, sillH / 2], [lintelH, WALL_H - lintelH / 2]]) {
      add('wall', horizontal ? box(len, h, OUTER, x, y, z) : box(OUTER, h, len, x, y, z));
    }
    const glow = floorGlow(0xff281e, 4.4, 0);
    glow.position.set(x, 0.04, z);
    glow.visible = false;
    group.add(glow);
    windowGlows.push({ win: wn, mesh: glow });
  }
  group.userData.windowGlows = windowGlows;

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
  group.userData.windows = createWindows(group, M.WINDOWS, mats.window, {
    len: WINDOW_LEN * S, outer: OUTER, w: W, d: D, s: S,
  });
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

  group.userData.props = buildProps(group, tex);

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
    light.intensity = LAMP_INTENSITY;
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
    if (!o.material) return;
    // Jaetut tekstuurit (getTextures, hehku) säilyvät, kenttäkohtaiset vapautetaan.
    const map = o.material.map;
    if (map && !isSharedMap(map) && !Object.values(textures || {}).includes(map)) map.dispose();
    o.material.dispose();
  });
}
