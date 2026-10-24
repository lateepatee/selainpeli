// Ostopaikat esineinä: aseteline seinällä (hinta näkyy), arpalaatikko ja juoma-automaatit.
// Staattiset osat yhdistetään yhdeksi mesiksi vertex-väreillä, vain liikkuvat osat ovat omia mesejään.

import * as THREE from '../../vendor/three-0.170.0/three.module.min.js';
import * as M from '../map.js';
import { PERKS, WEAPONS } from '../weapons.js';
import { psx } from './post.js';
import { S, merge, pieceBatch, floorGlow, wallGlow } from './geo.js';

const BOX_COLOR = 0x78b4ff;
const WOOD = 0x6b4a22;
const WOOD_DARK = 0x3d2a14;
const IRON = 0x2a2c30;
const METAL = 0x555a60;
const STEEL = 0x8a929a;

const BOX_LEN = 2.0;
const BOX_DEPTH = 0.94;
const BOX_BODY_H = 0.62;
const LID_OPEN = -1.25;

function hash(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

// Ase sivusta katsottuna: +x on piippu, +y ylös. Palat ovat [w, h, d, x, y, z, väri, kierto].
function gunSpecs(id) {
  const L = 0.45 + (WEAPONS[id]?.length ?? 10) * 0.06;
  const dark = IRON;
  const wood = 0x5a3b1e;
  const specs = [
    [L * 0.5, 0.06, 0.07, L * 0.25, 0.02, 0, dark],
    [L * 0.38, 0.13, 0.1, -L * 0.08, 0, 0, dark],
    [0.07, 0.18, 0.08, -L * 0.2, -0.13, 0, wood, { z: 0.25 }],
  ];
  if (id !== 'pistol') specs.push([L * 0.3, 0.11, 0.08, -L * 0.4, -0.02, 0, wood]);
  if (id === 'smg' || id === 'rifle' || id === 'lmg') specs.push([0.07, 0.18, 0.07, L * 0.02, -0.13, 0, dark, { z: -0.15 }]);
  if (id === 'lmg') specs.push([0.2, 0.2, 0.2, L * 0.02, -0.14, 0, 0x3a4a2a]);
  if (id === 'shotgun') specs.push([L * 0.3, 0.08, 0.1, L * 0.12, -0.06, 0, wood]);
  if (id === 'sniper') specs.push([L * 0.32, 0.07, 0.07, -L * 0.02, 0.12, 0, 0x151618]);
  if (id === 'wonder') {
    specs.push([0.14, 0.14, 0.14, L * 0.48, 0.02, 0, 0x76ff03], [0.1, 0.22, 0.1, -L * 0.05, 0.14, 0, 0x76ff03]);
  }
  return specs;
}

function priceTexture(price) {
  const c = document.createElement('canvas');
  c.width = 48;
  c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = '#1b160e';
  g.fillRect(0, 0, 48, 16);
  g.fillStyle = '#d8c690';
  g.fillRect(0, 0, 48, 1);
  g.fillRect(0, 15, 48, 1);
  g.font = 'bold 11px monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffe9a0';
  g.fillText(`${price} $`, 24, 9);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Lähin este (kenttäesine tai ulkoseinä) ja suunta, johon teline katsoo.
function faceAway(x, y) {
  let best = null;
  const consider = (cx, cy) => {
    const d = Math.hypot(x - cx, y - cy);
    if (!best || d < best.d) best = { d, cx, cy };
  };
  for (const o of M.OBSTACLES) {
    if (o.kind === 'box' || o.kind === 'machine') continue;
    consider(Math.max(o.x, Math.min(x, o.x + o.w)), Math.max(o.y, Math.min(y, o.y + o.h)));
  }
  consider(0, y); consider(M.ARENA_W, y); consider(x, 0); consider(x, M.ARENA_H);
  if (best.d > 70) return { dx: 0, dy: 1, wall: null };
  // Suunta on seinän normaali akselille napsautettuna: teline on suorassa seinää vasten
  let dx = x - best.cx;
  let dy = y - best.cy;
  if (Math.abs(dx) > Math.abs(dy)) { dy = 0; dx = Math.sign(dx) || 1; } else { dx = 0; dy = Math.sign(dy) || 1; }
  return { dx, dy, wall: best };
}

export function buildProps(group, tex) {
  void tex;
  const th = { anim: [] };
  const statics = [];
  const priceTex = new Map();

  // --- Aseteline: lauta seinällä, ase koukuissa, hintakilpi alla ---
  for (const b of M.WALL_BUYS) {
    const f = faceAway(b.x, b.y);
    const yaw = Math.atan2(f.dx, f.dy);
    // Lauta kiinni seinässä, vapaana seisova teline jaloillaan
    const ox = f.wall ? f.wall.cx * S + f.dx * 0.1 : b.x * S;
    const oz = f.wall ? f.wall.cy * S + f.dy * 0.1 : b.y * S;
    const batch = pieceBatch(ox, oz, yaw);
    const L = 0.45 + (WEAPONS[b.weapon].length ?? 10) * 0.06;
    const bw = Math.max(1.5, L + 0.4);
    batch.add(bw, 0.78, 0.08, 0, 1.25, 0, WOOD_DARK);
    batch.add(bw + 0.1, 0.05, 0.12, 0, 1.66, 0.01, WOOD);
    batch.add(bw + 0.1, 0.05, 0.12, 0, 0.86, 0.01, WOOD);
    batch.add(0.05, 0.1, 0.1, -L * 0.25, 1.15, 0.08, STEEL);
    batch.add(0.05, 0.1, 0.1, L * 0.25, 1.15, 0.08, STEEL);
    if (!f.wall) {
      batch.add(0.1, 0.9, 0.1, -bw / 2 + 0.05, 0.45, -0.03, WOOD);
      batch.add(0.1, 0.9, 0.1, bw / 2 - 0.05, 0.45, -0.03, WOOD);
    }
    for (const [w, h, d, x, y, z, color, rot] of gunSpecs(b.weapon)) {
      batch.add(w, h, d, x, y + 1.3, z + 0.1, color, rot);
    }
    statics.push(...batch.geos);

    // Hintakilpi kiillottaa pimeässäkin: oma valoton kuvansa
    let pt = priceTex.get(b.price);
    if (!pt) priceTex.set(b.price, (pt = priceTexture(b.price)));
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.23),
      new THREE.MeshBasicMaterial({ map: pt, fog: false }),
    );
    plate.position.set(ox + f.dx * 0.1, 0.98, oz + f.dy * 0.1);
    plate.rotation.y = yaw;
    group.add(plate);
    // Liitupiirros lattiassa löytää telineen pimeästä
    const chalk = floorGlow(0xe8e8d8, 1.9, 0.16);
    chalk.position.set(b.x * S, 0.03, b.y * S);
    group.add(chalk);
  }

  // --- Juoma-automaatit ---
  for (const m of M.PERK_MACHINES) {
    const perk = PERKS[m.perk];
    const color = new THREE.Color(perk.color);
    const cx = m.x * S;
    const cz = m.y * S;
    // Automaatti katsoo kentän keskustaa kohti
    const toX = M.ARENA_W / 2 - m.x;
    const toY = M.ARENA_H / 2 - m.y;
    const fx = Math.abs(toX) > Math.abs(toY) ? Math.sign(toX) : 0;
    const fy = fx ? 0 : Math.sign(toY) || 1;
    const yaw = Math.atan2(fx, fy);
    const batch = pieceBatch(cx, cz, yaw);
    batch.add(1.12, 2.0, 0.9, 0, 1.0, 0, METAL);
    batch.add(1.2, 0.12, 0.98, 0, 2.02, 0, IRON);
    batch.add(1.2, 0.1, 0.98, 0, 0.05, 0, IRON);
    // Värillinen reunus sivuilla ja kyltti yläosassa
    batch.add(0.06, 1.8, 0.92, -0.58, 1.0, 0, color.getHex());
    batch.add(0.06, 1.8, 0.92, 0.58, 1.0, 0, color.getHex());
    // Luukku ja lokero
    batch.add(0.7, 0.28, 0.06, 0, 0.42, 0.45, 0x0c0d0f);
    batch.add(0.12, 0.3, 0.06, 0.42, 1.0, 0.46, IRON);
    statics.push(...batch.geos);

    // Valaistu etupaneeli ja kyltti: valoton väri, välkkyy
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.78, 0.9),
      new THREE.MeshBasicMaterial({ color, fog: false }),
    );
    panel.position.set(cx + fx * 0.46, 1.25, cz + fy * 0.46);
    panel.rotation.y = yaw;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 0.26),
      new THREE.MeshBasicMaterial({ color, fog: false }),
    );
    sign.position.set(cx + fx * 0.46, 1.8, cz + fy * 0.46);
    sign.rotation.y = yaw;
    // Pullot paneelin edessä: muoto kertoo juoman (panssari leveä, pikalataus korkea, tuplatuli kaksi)
    const bottles = pieceBatch(cx, cz, yaw);
    const shape = { armor: [[0, 0.34, 0.2]], reload: [[0, 0.46, 0.1]], rapid: [[-0.12, 0.36, 0.1], [0.12, 0.36, 0.1]] }[m.perk];
    for (const [bx, bh, bw] of shape) bottles.add(bw, bh, 0.08, bx, 1.2, 0.5, 0xf4f1e6);
    group.add(panel, sign);
    statics.push(...bottles.geos);
    const glow = floorGlow(color, 3.6, 0.24);
    glow.position.set(cx, 0.03, cz);
    group.add(glow);
    const halo = wallGlow(color, 2.4, 2.6, 0.12);
    halo.position.set(cx + fx * 0.7, 1.3, cz + fy * 0.7);
    halo.rotation.y = yaw;
    group.add(halo);
    th.anim.push({ panel, sign, halo, glow, base: color, i: th.anim.length });
  }

  // --- Arpalaatikko ---
  let boxAnim = null;
  if (M.BOX) {
    const bx = M.BOX.x * S;
    const bz = M.BOX.y * S;
    const batch = pieceBatch(bx, bz, 0);
    batch.add(BOX_LEN, BOX_BODY_H, BOX_DEPTH, 0, BOX_BODY_H / 2, 0, WOOD);
    // Rautavanteet ja nurkat
    for (const x of [-0.7, 0.7]) batch.add(0.1, BOX_BODY_H + 0.02, BOX_DEPTH + 0.03, x, BOX_BODY_H / 2, 0, IRON);
    for (const x of [-BOX_LEN / 2 + 0.05, BOX_LEN / 2 - 0.05]) {
      for (const z of [-BOX_DEPTH / 2 + 0.05, BOX_DEPTH / 2 - 0.05]) batch.add(0.1, 0.1, 0.1, x, 0.05, z, STEEL);
    }
    batch.add(BOX_LEN - 0.1, 0.02, BOX_DEPTH - 0.1, 0, BOX_BODY_H + 0.005, 0, 0x16202c);
    statics.push(...batch.geos);

    // Kansi saranoi takareunasta
    const lidPivot = new THREE.Group();
    lidPivot.position.set(bx, BOX_BODY_H, bz - BOX_DEPTH / 2);
    const lidBatch = pieceBatch(0, 0, 0);
    lidBatch.add(BOX_LEN + 0.02, 0.14, BOX_DEPTH + 0.02, 0, 0.07, BOX_DEPTH / 2, WOOD);
    for (const x of [-0.7, 0.7]) lidBatch.add(0.1, 0.16, BOX_DEPTH + 0.04, x, 0.07, BOX_DEPTH / 2, IRON);
    lidBatch.add(0.22, 0.12, 0.08, 0, 0.1, BOX_DEPTH + 0.02, BOX_COLOR);
    const lid = new THREE.Mesh(
      merge(lidBatch.geos),
      psx(new THREE.MeshLambertMaterial({ vertexColors: true })),
    );
    lid.castShadow = true;
    lidPivot.add(lid);
    group.add(lidPivot);

    // Valopilari ja leijuva ase auki olevasta laatikosta
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.8, 3.4, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: BOX_COLOR, transparent: true, opacity: 0, depthWrite: false, fog: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }),
    );
    beam.position.set(bx, BOX_BODY_H + 1.7, bz);
    beam.visible = false;
    group.add(beam);
    const guns = {};
    const hover = new THREE.Group();
    hover.position.set(bx, BOX_BODY_H + 1.0, bz);
    const gunMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    for (const id of Object.keys(WEAPONS)) {
      if (id === 'pistol') continue;
      const gb = pieceBatch(0, 0, 0);
      for (const [w, h, d, x, y, z, color, rot] of gunSpecs(id)) gb.add(w * 1.6, h * 1.6, d * 1.6, x * 1.6, y * 1.6, z * 1.6, color, rot);
      const mesh = new THREE.Mesh(merge(gb.geos), gunMat);
      mesh.visible = false;
      hover.add(mesh);
      guns[id] = mesh;
    }
    hover.visible = false;
    group.add(hover);
    const glow = floorGlow(BOX_COLOR, 3.6, 0.25);
    glow.position.set(bx, 0.03, bz);
    group.add(glow);
    const halo = wallGlow(BOX_COLOR, 2.6, 1.2, 0.0);
    halo.position.set(bx, BOX_BODY_H + 0.6, bz + 0.2);
    group.add(halo);
    boxAnim = { lidPivot, beam, hover, guns, glow, halo, lid: 0, shown: null };
  }

  if (statics.length) {
    const mesh = new THREE.Mesh(
      merge(statics),
      psx(new THREE.MeshLambertMaterial({ vertexColors: true })),
    );
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Päivittää liikkuvat osat: automaattien välke, laatikon kansi ja valo.
  function update(world, t, dt) {
    for (const a of th.anim) {
      const flick = hash(Math.floor(t * 9) * 3 + a.i * 17) < 0.05 ? 0.35 : 1;
      const k = flick * (0.85 + 0.15 * Math.sin(t * 5 + a.i));
      a.panel.material.color.copy(a.base).multiplyScalar(k);
      a.sign.material.color.copy(a.base).multiplyScalar(k * 1.1);
      a.halo.material.opacity = 0.1 * k;
      a.glow.material.opacity = 0.22 * k;
    }
    if (!boxAnim) return;
    const b = boxAnim;
    const st = world?.box?.state ?? 'idle';
    const open = st !== 'idle';
    b.lid += ((open ? LID_OPEN : 0) - b.lid) * Math.min(1, dt * 7);
    b.lidPivot.rotation.x = b.lid;
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    b.glow.material.opacity = open ? 0.5 : 0.2 + 0.1 * pulse;
    b.halo.material.opacity = open ? 0.35 + 0.2 * pulse : 0.06 + 0.06 * pulse;
    b.beam.visible = b.hover.visible = open;
    if (!open) return;
    b.beam.material.opacity = st === 'ready' ? 0.16 : 0.12 + 0.07 * Math.sin(t * 24);
    // Pyörähdyksen aikana ase vaihtuu nopeasti, valmiina näkyy arvottu ase
    const ids = Object.keys(b.guns);
    const id = st === 'ready' && b.guns[world.box.weapon] ? world.box.weapon : ids[Math.floor(t * 12) % ids.length];
    if (b.shown !== id) {
      if (b.shown) b.guns[b.shown].visible = false;
      b.guns[id].visible = true;
      b.shown = id;
    }
    b.hover.rotation.y = t * 2.2;
    b.hover.position.y = BOX_BODY_H + 1.0 + Math.sin(t * 3) * 0.08;
  }

  return { update };
}
