// Geometrian apufunktiot: laatikot, yhdistäminen yhdeksi piirtokutsuksi ja hehkukuvat.

import * as THREE from '../../vendor/three-0.170.0/three.module.min.js';

// Yksi pelipikseli on 1/32 yksikköä.
export const S = 1 / 32;

// Laatikko, jonka tekstuuri toistuu 2 yksikön välein oikeassa mittakaavassa.
export function box(w, h, d, x, y, z, tile = 2) {
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

// Yhdistää geometriat. Jos jokaisella on color-attribuutti (vertex-värit), se kopioidaan mukaan.
export function merge(geos) {
  let vertexCount = 0;
  let indexCount = 0;
  const colored = geos.every((g) => g.attributes.color);
  for (const g of geos) {
    vertexCount += g.attributes.position.count;
    indexCount += g.index.count;
  }
  const pos = new Float32Array(vertexCount * 3);
  const nor = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const col = colored ? new Float32Array(vertexCount * 3) : null;
  const idx = new Uint32Array(indexCount);
  let v = 0;
  let i = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, v * 3);
    nor.set(g.attributes.normal.array, v * 3);
    uvs.set(g.attributes.uv.array, v * 2);
    if (colored) col.set(g.attributes.color.array, v * 3);
    for (let k = 0; k < g.index.count; k++) idx[i + k] = g.index.array[k] + v;
    v += g.attributes.position.count;
    i += g.index.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  if (colored) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

const tmpObj = new THREE.Object3D();
const tmpColor = new THREE.Color();

// Värillinen pala ryhmän paikallisessa koordinaatistossa (ryhmä: paikka ja kierto y-akselin ympäri).
// Palat kerätään listaan ja yhdistetään lopuksi yhdeksi mesiksi vertex-väreillä.
export function pieceBatch(originX, originZ, yaw) {
  const geos = [];
  return {
    add(w, h, d, x, y, z, color, rot = null) {
      const g = new THREE.BoxGeometry(w, h, d);
      tmpObj.position.set(x, y, z);
      tmpObj.rotation.set(rot?.x ?? 0, rot?.y ?? 0, rot?.z ?? 0);
      tmpObj.updateMatrix();
      g.applyMatrix4(tmpObj.matrix);
      tmpObj.position.set(originX, 0, originZ);
      tmpObj.rotation.set(0, yaw, 0);
      tmpObj.updateMatrix();
      g.applyMatrix4(tmpObj.matrix);
      tmpColor.setHex(color);
      const n = g.attributes.position.count;
      const c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        c[i * 3] = tmpColor.r;
        c[i * 3 + 1] = tmpColor.g;
        c[i * 3 + 2] = tmpColor.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      geos.push(g);
    },
    geos,
  };
}

// Pehmeä pyöreä hehku (ikkunat, arpalaatikko, automaatit, tehosteet). Ei valo vaan kuva,
// joten hehkuja voi olla paljon ilman, että valojen määrä kasvaa.
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

export function isSharedMap(map) {
  return map === glowTex;
}

function glowMaterial(color, opacity) {
  return new THREE.MeshBasicMaterial({
    map: glowTexture(), color, transparent: true, opacity, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending,
  });
}

export function floorGlow(color, size, opacity) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), glowMaterial(color, opacity));
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 1;
  return mesh;
}

// Pystyhehku: kamera katsoo aina samasta suunnasta, joten +z-suuntainen taso riittää.
export function wallGlow(color, w, h, opacity) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glowMaterial(color, opacity));
  mesh.renderOrder = 1;
  return mesh;
}
