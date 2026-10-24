// Ikkunoiden laudat: kiipeävä zombi repii ne irti, ne lentävät lattialle ja korjautuvat takaisin,
// kun ikkunasta ei ole hetkeen kiivetty. Vain piirtoa: simulaatio ei tiedä lautoista.

import * as THREE from '../../vendor/three-0.170.0/three.module.min.js';
import { psx } from './post.js';

const PLANKS = [
  { y: 1.45, tear: 0.1 },
  { y: 1.08, tear: 0.22 },
  { y: 0.72, tear: 0.34 },
];
const GRAVITY = 14;
const FLOOR_Y = 0.09;
const REPAIR_IDLE = 7;      // s ilman kiipeäjää ennen kuin korjaus alkaa
const REPAIR_STEP = 2.2;    // s lautojen välillä
const PLANK_H = 0.16;
const PLANK_D = 0.18;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// windows = map.js:n WINDOWS, spec kertoo ikkunan mitat ja mihin kohtaan ulkoseinä jää (arena.js).
export function createWindows(group, windows, material, spec) {
  const geo = new THREE.BoxGeometry(spec.len, PLANK_H, PLANK_D);
  const mat = psx(material);
  const list = windows.map((win, wi) => {
    const horizontal = win.side === 'top' || win.side === 'bottom';
    const cx = win.side === 'left' ? -spec.outer / 2 : win.side === 'right' ? spec.w + spec.outer / 2 : win.x * spec.s;
    const cz = win.side === 'top' ? -spec.outer / 2 : win.side === 'bottom' ? spec.d + spec.outer / 2 : win.y * spec.s;
    // Sisäänpäin = pelialueelle päin
    const inward = { x: win.side === 'left' ? 1 : win.side === 'right' ? -1 : 0, z: win.side === 'top' ? 1 : win.side === 'bottom' ? -1 : 0 };
    const r = rng(wi * 977 + 13);
    const planks = PLANKS.map((def) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.order = 'YXZ';
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
      const rest = {
        x: cx + (horizontal ? (r() - 0.5) * 0.1 : 0),
        z: cz + (horizontal ? 0 : (r() - 0.5) * 0.1),
        y: def.y + (r() - 0.5) * 0.05,
        tilt: (r() - 0.5) * 0.08,
        sx: 0.9 + r() * 0.12,
      };
      const p = { mesh, def, rest, state: 'on', vx: 0, vy: 0, vz: 0, spinX: 0, spinZ: 0, timer: 0 };
      place(p, horizontal);
      return p;
    });
    return { win, horizontal, inward, planks, idle: REPAIR_IDLE, repair: 0, cx, cz };
  });

  function place(p, horizontal) {
    const m = p.mesh;
    m.position.set(p.rest.x, p.rest.y, p.rest.z);
    m.rotation.set(0, horizontal ? 0 : Math.PI / 2, p.rest.tilt);
    m.scale.set(p.rest.sx, 1, 1);
  }

  // climbers = [{ x, y, p }] pelikoordinaateissa, p = kiipeämisen eteneminen 0..1
  // emit(x, y, color, count, speed) tekee tikkuja ja pölyä.
  function update(climbers, dt, emit) {
    for (const w of list) {
      let best = -1;
      for (const c of climbers) {
        if (Math.hypot(c.x - w.win.x, c.y - w.win.y) < 50) best = Math.max(best, c.p);
      }
      if (best >= 0) {
        w.idle = 0;
        w.repair = 0;
      } else {
        w.idle += dt;
      }
      for (const p of w.planks) {
        if (p.state === 'on' && best >= p.def.tear) tear(w, p, emit);
        else if (p.state === 'fall') fall(w, p, dt);
      }
      if (w.idle > REPAIR_IDLE) {
        w.repair -= dt;
        if (w.repair <= 0) {
          // Alin lauta ensin ylöspäin, ettei korjaus näytä ylhäältä alas putoamiselta
          const next = [...w.planks].reverse().find((p) => p.state === 'lie');
          if (next) {
            next.state = 'on';
            place(next, w.horizontal);
            emit(w.win.x, w.win.y, 0x8a6a40, 3, 2);
            w.repair = REPAIR_STEP;
          }
        }
      }
    }
  }

  function tear(w, p, emit) {
    p.state = 'fall';
    const k = Math.random();
    const along = (Math.random() - 0.5) * 2.2;
    p.vx = w.inward.x * (1.2 + k * 2) + (w.horizontal ? along : 0);
    p.vz = w.inward.z * (1.2 + k * 2) + (w.horizontal ? 0 : along);
    p.vy = 1.5 + Math.random() * 2;
    p.spinX = (Math.random() - 0.5) * 12;
    p.spinZ = (Math.random() - 0.5) * 9;
    emit(w.win.x, w.win.y, 0xb08a58, 7, 4.5);
  }

  function fall(w, p, dt) {
    const m = p.mesh;
    p.vy -= GRAVITY * dt;
    m.position.x += p.vx * dt;
    m.position.y += p.vy * dt;
    m.position.z += p.vz * dt;
    m.rotation.x += p.spinX * dt;
    m.rotation.z += p.spinZ * dt;
    if (m.position.y <= FLOOR_Y) {
      // Makaa litteänä satunnaiseen suuntaan
      m.position.y = FLOOR_Y;
      m.rotation.set(Math.PI / 2, m.rotation.y + (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 0.3);
      p.state = 'lie';
    }
  }

  return { update };
}
