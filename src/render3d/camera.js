// Viistokameran elävöitys: lähestyy vaarassa, ennakoi tähtäyssuuntaa ja tärähtää osumista.
// Kaikki muutokset ovat pieniä ja pehmeitä. Kameran paikka vaikuttaa tähtäykseen vain
// screenToWorld:n kautta, joka lukee aina saman kameran, joten tähtäys pysyy tarkkana.

import * as THREE from '../../vendor/three-0.170.0/three.module.min.js';
import { S } from './geo.js';
import { maxHpOf } from '../weapons.js';

const BASE_OFFSET = new THREE.Vector3(0, 12.5, 7);
const NEAR_OFFSET = new THREE.Vector3(0, 11.2, 6.1);   // vaarassa: hieman matalammalle ja lähemmäs
const LOOK_Y = 0.4;
const ZOMBIE_DANGER = 150;     // px: zombi tätä lähempänä nostaa vaaraa
const ZONE_DANGER = 140;       // px: sumun reunasta
const LOW_HP = 0.4;
const LEAD = 34;               // px: kamera ennakoi tähtäyssuuntaan tämän verran
const MAX_TRAUMA = 1;

const state = { danger: 0, lead: { x: 0, y: 0 }, trauma: 0, shakeT: 0 };
const offset = new THREE.Vector3();

// Tärähdys: 0..1, kasvaa lisäämällä. Kutsutaan tapahtumista.
export function kickCamera(amount) {
  state.trauma = Math.min(MAX_TRAUMA, state.trauma + amount);
}

export function cameraState() {
  return { danger: state.danger, trauma: state.trauma };
}

function dangerOf(world, viewer, vx, vy) {
  if (!viewer?.alive) return 0;
  let d = 0;
  let nearest = Infinity;
  for (const z of world.zombies || []) {
    if (z.emerging ?? z.emerge > 0) continue;
    nearest = Math.min(nearest, Math.hypot(z.x - vx, z.y - vy));
  }
  if (world.boss) nearest = Math.min(nearest, Math.hypot(world.boss.x - vx, world.boss.y - vy) - 60);
  if (nearest < ZOMBIE_DANGER) d = Math.max(d, 1 - nearest / ZOMBIE_DANGER);
  const maxHp = maxHpOf(viewer);
  if (viewer.hp !== undefined && viewer.hp / maxHp < LOW_HP) d = Math.max(d, 1 - viewer.hp / maxHp / LOW_HP);
  if (world.zone) {
    const edge = world.zone.r - Math.hypot(viewer.x - world.zone.x, viewer.y - world.zone.y);
    if (edge < ZONE_DANGER) d = Math.max(d, Math.min(1, 1 - edge / ZONE_DANGER));
  }
  return Math.min(1, d);
}

// Asettaa kameran. focus = pehmeästi seurattu kohta, viewer = katsoja (voi puuttua).
export function updateCamera(cam, world, viewer, focus, vx, vy, dt) {
  const target = dangerOf(world, viewer, vx, vy);
  // Vaara nousee nopeasti ja laskee hitaasti, ettei kamera hengitä ruudusta toiseen
  const rate = target > state.danger ? 2.5 : 0.8;
  state.danger += (target - state.danger) * (1 - Math.exp(-dt * rate));

  // Ennakointi: katsoo hieman tähtäyssuuntaan, vain kun elossa
  const aim = viewer?.alive ? viewer.aim : null;
  const lx = aim === null ? 0 : Math.cos(aim) * LEAD;
  const ly = aim === null ? 0 : Math.sin(aim) * LEAD;
  const lk = 1 - Math.exp(-dt * 3);
  state.lead.x += (lx - state.lead.x) * lk;
  state.lead.y += (ly - state.lead.y) * lk;

  // Tärinä: trauma^2 antaa pienet tärähdykset pehmeinä ja isot reippaina
  state.trauma = Math.max(0, state.trauma - dt * 1.8);
  state.shakeT += dt * 38;
  const s = state.trauma * state.trauma;
  const jx = Math.sin(state.shakeT * 1.3) * s * 0.55;
  const jz = Math.sin(state.shakeT * 1.9 + 2) * s * 0.55;

  const k = state.danger * state.danger * (3 - 2 * state.danger);   // smoothstep
  offset.lerpVectors(BASE_OFFSET, NEAR_OFFSET, k);
  const fx = (focus.x + state.lead.x) * S + jx;
  const fz = (focus.y + state.lead.y) * S + jz;
  cam.position.set(fx, 0, fz).add(offset);
  cam.lookAt(fx, LOOK_Y, fz);
  cam.updateMatrixWorld();
}
