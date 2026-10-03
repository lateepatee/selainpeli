// Yksinkertainen tekoäly testaamiseen. Tuottaa saman syötteen kuin oikea pelaaja.

import { ARENA_W, ARENA_H, OBSTACLES } from './constants.js';
import { lineOfSight, pointInRect } from './game.js';

const SIGHT_RANGE = 550;
const AIM_ERROR = 0.12;       // radiaaneja
const REACTION_TIME = 0.35;   // s ennen kuin botti alkaa ampua uutta kohdetta

const brains = {};

export function botInput(world, id, dt) {
  const me = world.players[id];
  const brain = brains[id] || (brains[id] = newBrain());

  brain.wanderTimer -= dt;
  brain.strafeTimer -= dt;
  const zone = world.zone;
  if (brain.wanderTimer <= 0 || reached(me, brain.waypoint) || !insideZone(brain.waypoint, zone, 0.8)) {
    brain.waypoint = randomWaypoint(zone);
    brain.wanderTimer = 3 + Math.random() * 3;
  }
  if (brain.strafeTimer <= 0) {
    brain.strafe = Math.random() < 0.5 ? -1 : 1;
    brain.strafeTimer = 0.6 + Math.random() * 1.2;
  }

  const target = nearestVisibleEnemy(world, me);
  if (target?.id !== brain.targetId) {
    brain.targetId = target?.id ?? null;
    brain.reaction = REACTION_TIME;
  }
  brain.reaction -= dt;

  let moveX, moveY, aim, shoot;
  if (target) {
    const toX = target.x - me.x;
    const toY = target.y - me.y;
    const dist = Math.hypot(toX, toY);
    aim = Math.atan2(toY, toX) + (Math.random() - 0.5) * 2 * AIM_ERROR;
    shoot = brain.reaction <= 0;
    // Sivuttaisliike + pidä etäisyys n. 250 px.
    const approach = dist > 300 ? 1 : dist < 200 ? -1 : 0;
    moveX = (toX / dist) * approach + (-toY / dist) * brain.strafe;
    moveY = (toY / dist) * approach + (toX / dist) * brain.strafe;
    // Alueen reunalla taistelu saa odottaa: ensin sisään.
    if (zone && !insideZone(me, zone, 0.9)) {
      moveX = zone.x - me.x;
      moveY = zone.y - me.y;
    }
  } else {
    moveX = brain.waypoint.x - me.x;
    moveY = brain.waypoint.y - me.y;
    aim = Math.atan2(moveY, moveX);
    shoot = false;
  }

  const t = 0.3; // kynnys, ettei botti nyi paikallaan
  const len = Math.hypot(moveX, moveY) || 1;
  return {
    up: moveY / len < -t,
    down: moveY / len > t,
    left: moveX / len < -t,
    right: moveX / len > t,
    aim,
    shoot,
  };
}

export function forgetBot(id) {
  delete brains[id];
}

function newBrain() {
  return {
    waypoint: randomWaypoint(null),
    wanderTimer: 0,
    strafe: 1,
    strafeTimer: 0,
    targetId: null,
    reaction: 0,
  };
}

function nearestVisibleEnemy(world, me) {
  let best = null;
  let bestDist = SIGHT_RANGE;
  for (const p of Object.values(world.players)) {
    if (p === me || !p.alive) continue;
    const d = Math.hypot(p.x - me.x, p.y - me.y);
    if (d < bestDist && lineOfSight(me.x, me.y, p.x, p.y)) {
      best = p;
      bestDist = d;
    }
  }
  return best;
}

function randomWaypoint(zone) {
  for (let i = 0; i < 30; i++) {
    const p = { x: 60 + Math.random() * (ARENA_W - 120), y: 60 + Math.random() * (ARENA_H - 120) };
    if (!OBSTACLES.some((r) => pointInRect(p.x, p.y, r, 30)) && insideZone(p, zone, 0.8)) return p;
  }
  return zone ? { x: zone.x, y: zone.y } : { x: ARENA_W / 2, y: 60 };
}

// Onko piste alueen sisällä (margin < 1 = selvästi sisällä). Ilman aluetta aina tosi.
function insideZone(p, zone, margin) {
  return !zone || Math.hypot(p.x - zone.x, p.y - zone.y) < zone.r * margin;
}

function reached(me, wp) {
  return Math.hypot(wp.x - me.x, wp.y - me.y) < 30;
}
