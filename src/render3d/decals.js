// Veriläiskät lattialla. Määrä on rajattu: rengaspuskuri, vanhin korvataan ja kutistuu pois.
// Piirto on yksi InstancedMesh, ja läiskät ovat valaistuja, joten pimeässä ne eivät näy.

import * as THREE from '../../vendor/three-0.170.0/three.module.min.js';
import { psx } from './post.js';
import { S } from './geo.js';

const MAX_DECALS = 96;
const LIFE = 50;          // s
const FADE = 8;           // s, kutistuminen lopussa

function splatTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  let a = 7;
  const r = () => ((a = (a * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(16, 16, 7, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 9; i++) {
    const ang = r() * Math.PI * 2;
    const d = 5 + r() * 8;
    g.beginPath();
    g.arc(16 + Math.cos(ang) * d, 16 + Math.sin(ang) * d, 1.5 + r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  return tex;
}

export function createDecals(scene) {
  const tex = splatTexture();
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = psx(new THREE.MeshLambertMaterial({
    color: 0xffffff, alphaMap: tex, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  const mesh = new THREE.InstancedMesh(geo, mat, MAX_DECALS);
  mesh.frustumCulled = false;
  mesh.renderOrder = 0;
  mesh.count = 0;
  const col = new THREE.Color(0x600000);
  for (let i = 0; i < MAX_DECALS; i++) mesh.setColorAt(i, col);
  scene.add(mesh);

  const list = Array.from({ length: MAX_DECALS }, () => ({ age: LIFE, x: 0, z: 0, size: 0, rot: 0, y: 0 }));
  let next = 0;
  const dummy = new THREE.Object3D();

  // x, y pelikoordinaateissa; size yksiköissä (1 = metri)
  function add(x, y, color, size, spread = 0.5) {
    const d = list[next];
    next = (next + 1) % MAX_DECALS;
    const a = Math.random() * Math.PI * 2;
    const off = Math.random() * spread;
    d.x = x * S + Math.cos(a) * off;
    d.z = y * S + Math.sin(a) * off;
    d.size = size * (0.7 + Math.random() * 0.6);
    d.rot = Math.random() * Math.PI * 2;
    d.age = 0;
    // Päällekkäiset läiskät eivät saa taistella syvyydestä: pieni korkeusero
    d.y = 0.025 + (next % 4) * 0.002;
    d.color = color;
  }

  function clear() {
    for (const d of list) d.age = LIFE;
  }

  function update(dt) {
    let n = 0;
    for (let i = 0; i < MAX_DECALS; i++) {
      const d = list[i];
      if (d.age >= LIFE) continue;
      d.age += dt;
      const left = LIFE - d.age;
      const grow = Math.min(1, d.age * 8);
      const k = d.size * grow * (left < FADE ? Math.max(0, left / FADE) : 1);
      if (k <= 0.01) continue;
      dummy.position.set(d.x, d.y, d.z);
      dummy.rotation.set(0, d.rot, 0);
      dummy.scale.set(k, 1, k);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      col.setHex(d.color);
      mesh.setColorAt(n, col);
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  return { add, clear, update };
}
