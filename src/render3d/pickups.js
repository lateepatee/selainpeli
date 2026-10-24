// Poimittavat tehosteet: jokaisella oma muoto ja väri, jotta ne erottaa pimeässäkin.
// Pyörivät, kelluvat ja hehkuvat. Materiaalit ovat valottomia (näkyvät pimeässä).

import * as THREE from '../../vendor/three-0.170.0/three.module.min.js';
import { POWERUPS } from '../weapons.js';
import { floorGlow, wallGlow } from './geo.js';

const geos = {};
function geo(key, make) {
  return (geos[key] ||= make());
}

function basic(color) {
  return new THREE.MeshBasicMaterial({ color, fog: false });
}

// Muodot: ammus (kultainen laatikko + luodit), kertaisku (punainen piikkitimantti),
// ydinpommi (valkoinen pallo + rengas), tuplarahat (kaksi kolikkoa).
const SHAPES = {
  ammo(color) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo('ammoBox', () => new THREE.BoxGeometry(0.5, 0.28, 0.36)), basic(color)));
    const bulletGeo = geo('bullet', () => new THREE.CylinderGeometry(0.06, 0.06, 0.34, 5));
    for (const x of [-0.14, 0, 0.14]) {
      const b = new THREE.Mesh(bulletGeo, basic(0xfff0b0));
      b.position.set(x, 0.3, 0);
      g.add(b);
    }
    return g;
  },
  insta(color) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo('octa', () => new THREE.OctahedronGeometry(0.42, 0)), basic(color)));
    const spike = geo('spike', () => new THREE.ConeGeometry(0.1, 0.35, 4));
    for (const [rx, rz] of [[0, 0.8], [0, -0.8], [0.8, 0], [-0.8, 0]]) {
      const s = new THREE.Mesh(spike, basic(0xffb0b0));
      s.rotation.set(rx, 0, rz);
      s.position.set(Math.sin(rz) * -0.5, 0, Math.sin(rx) * 0.5);
      g.add(s);
    }
    return g;
  },
  nuke(color) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo('ico', () => new THREE.IcosahedronGeometry(0.36, 0)), basic(color)));
    const ring = new THREE.Mesh(geo('ring', () => new THREE.TorusGeometry(0.5, 0.05, 4, 10)), basic(0xffd600));
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    return g;
  },
  double(color) {
    const g = new THREE.Group();
    const coin = geo('coin', () => new THREE.CylinderGeometry(0.32, 0.32, 0.07, 8));
    for (const [x, y, z, tilt] of [[-0.2, 0.0, 0, 0.5], [0.2, 0.18, 0, -0.5]]) {
      const c = new THREE.Mesh(coin, basic(color));
      c.rotation.x = Math.PI / 2;
      c.rotation.y = tilt;
      c.position.set(x, y, z);
      g.add(c);
    }
    return g;
  },
};

// Palauttaa ryhmän, jonka body-lapsi pyörii ja kelluu (animatePickup).
export function createPickup(type) {
  const color = new THREE.Color(POWERUPS[type]?.color ?? '#ffffff');
  const root = new THREE.Group();
  const body = (SHAPES[type] || SHAPES.ammo)(color);
  body.position.y = 0.8;
  root.add(body);
  const floor = floorGlow(color, 2.8, 0.5);
  floor.position.y = 0.03;
  const halo = wallGlow(color, 1.7, 1.7, 0.4);
  halo.position.y = 0.8;
  root.add(floor, halo);
  root.userData = { body, halo, floor };
  return root;
}

export function animatePickup(root, id, t, life) {
  const { body, halo, floor } = root.userData;
  body.position.y = 0.8 + Math.sin(t * 3 + id) * 0.14;
  body.rotation.y = t * 2.2 + id;
  const pulse = 0.5 + 0.5 * Math.sin(t * 6 + id);
  halo.position.y = body.position.y;
  halo.material.opacity = 0.28 + 0.22 * pulse;
  floor.material.opacity = 0.4 + 0.2 * pulse;
  void life;
}

export function disposePickup(root) {
  // Jaetut geometriat säilyvät, materiaalit ovat ryhmäkohtaisia.
  root.traverse((o) => {
    if (o.material) o.material.dispose();
    if (o.geometry && !Object.values(geos).includes(o.geometry)) o.geometry.dispose();
  });
}
