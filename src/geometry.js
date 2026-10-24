// Yhteiset geometriafunktiot (pelaajat, zombit, botit).

import { OBSTACLES } from './constants.js';

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

// Kulma välille [-π, π] ilman silmukkaa, jotta valtavakaan arvo (esim. 1e300) ei jumita.
// Välillä jo oleva kulma palautuu sellaisenaan, joten tavallinen peli laskee täsmälleen kuten ennen.
export function wrapAngle(a) {
  if (a >= -Math.PI && a <= Math.PI) return a;
  if (!Number.isFinite(a)) return 0;
  a %= Math.PI * 2;
  if (a > Math.PI) a -= Math.PI * 2;
  else if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function pointInRect(x, y, r, pad = 0) {
  return x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;
}

export function pushCircleOutOfRect(c, radius, r) {
  const nx = clamp(c.x, r.x, r.x + r.w);
  const ny = clamp(c.y, r.y, r.y + r.h);
  const dx = c.x - nx;
  const dy = c.y - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= radius * radius) return;

  if (d2 > 0) {
    const d = Math.sqrt(d2);
    c.x = nx + (dx / d) * radius;
    c.y = ny + (dy / d) * radius;
    return;
  }
  // Keskipiste esteen sisällä: työnnetään lähimmän reunan yli.
  const left = c.x - r.x;
  const right = r.x + r.w - c.x;
  const top = c.y - r.y;
  const bottom = r.y + r.h - c.y;
  const m = Math.min(left, right, top, bottom);
  if (m === left) c.x = r.x - radius;
  else if (m === right) c.x = r.x + r.w + radius;
  else if (m === top) c.y = r.y - radius;
  else c.y = r.y + r.h + radius;
}

// Onko kahden pisteen välillä esteetöntä? Matalien hautakivien yli näkee.
export function lineOfSight(x1, y1, x2, y2) {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.ceil(dist / 8);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    if (OBSTACLES.some((r) => r.kind !== 'grave' && pointInRect(x, y, r))) return false;
  }
  return true;
}
