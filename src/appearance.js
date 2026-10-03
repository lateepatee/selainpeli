// Pelaajahahmon ulkonäkö: väri, päähine, kuvio ja kasvot. Pelkkää ulkonäköä, osuma-alue on aina sama.
// Verkossa ulkonäkö kulkee indekseinä näihin listoihin, ja host hyväksyy vain sallitut arvot.

import { PLAYER_COLORS } from './constants.js';

export const HATS = [
  { id: 'none', name: 'Ei mitään' },
  { id: 'cap', name: 'Lippis' },
  { id: 'helmet', name: 'Kypärä' },
  { id: 'beanie', name: 'Pipo' },
  { id: 'headband', name: 'Otsapanta' },
  { id: 'horns', name: 'Sarvet' },
  { id: 'crown', name: 'Kruunu' },
  { id: 'tophat', name: 'Silinteri' },
];

export const PATTERNS = [
  { id: 'solid', name: 'Yksivärinen' },
  { id: 'stripes', name: 'Raidat' },
  { id: 'dots', name: 'Pilkut' },
  { id: 'camo', name: 'Maastokuvio' },
];

export const FACES = [
  { id: 'eyes', name: 'Silmät' },
  { id: 'visor', name: 'Visiiri' },
  { id: 'mask', name: 'Huivi' },
  { id: 'angry', name: 'Vihainen' },
  { id: 'none', name: 'Ei mitään' },
];

export const DEFAULT_LOOK = { color: 0, hat: 0, pattern: 0, face: 0 };

// Hyväksyy vain sallitut indeksit; kaikki muu korvataan oletuksella.
export function sanitizeLook(look) {
  const pick = (v, list) => (Number.isInteger(v) && v >= 0 && v < list.length ? v : 0);
  const l = look && typeof look === 'object' ? look : {};
  return {
    color: pick(l.color, PLAYER_COLORS),
    hat: pick(l.hat, HATS),
    pattern: pick(l.pattern, PATTERNS),
    face: pick(l.face, FACES),
  };
}

export function loadLook() {
  try {
    return sanitizeLook(JSON.parse(localStorage.getItem('areena-hahmo') || 'null'));
  } catch {
    return { ...DEFAULT_LOOK };
  }
}

export function saveLook(look) {
  try {
    localStorage.setItem('areena-hahmo', JSON.stringify(look));
  } catch {}
}

// Piirtää hahmon kohtaan x, y katse suuntaan aim. look = { hat, pattern, face } (indeksit), color = hex.
export function drawCharacter(ctx, x, y, aim, radius, color, look, gunLength, isLocal) {
  const hat = HATS[look?.hat]?.id ?? 'none';
  const pattern = PATTERNS[look?.pattern]?.id ?? 'solid';
  const face = FACES[look?.face]?.id ?? 'eyes';

  // Ase
  ctx.strokeStyle = '#cfd6e4';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(aim) * gunLength, y + Math.sin(aim) * gunLength);
  ctx.stroke();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(aim);

  // Runko ja kuvio (kuvio rajataan rungon sisään)
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.save();
  ctx.clip();
  drawPattern(ctx, pattern, radius);
  ctx.restore();

  // Päähine ensin, kasvot päälle: katseen suunta näkyy aina.
  drawHat(ctx, hat, radius, color);
  drawFace(ctx, face, radius);

  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.strokeStyle = isLocal ? '#ffffff' : 'rgba(0,0,0,0.35)';
  ctx.lineWidth = isLocal ? 2 : 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawPattern(ctx, pattern, r) {
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  if (pattern === 'stripes') {
    for (let x = -r; x < r; x += 7) ctx.fillRect(x, -r, 3.5, r * 2);
  } else if (pattern === 'dots') {
    for (const [dx, dy] of [[-8, -6], [0, 2], [7, -7], [-6, 8], [8, 7], [-11, 1], [2, -11], [1, 11]]) {
      ctx.beginPath();
      ctx.arc(dx, dy, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (pattern === 'camo') {
    ctx.fillStyle = 'rgba(30, 40, 20, 0.45)';
    for (const [dx, dy, s] of [[-7, -5, 6], [6, 6, 5], [5, -8, 4], [-6, 8, 4], [10, -1, 3]]) {
      ctx.beginPath();
      ctx.ellipse(dx, dy, s, s * 0.7, dx * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Kasvot katsovat aina eteenpäin (positiivinen x = katseen suunta).
function drawFace(ctx, face, r) {
  if (face === 'eyes' || face === 'angry') {
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(r * 0.45, side * r * 0.35, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(r * 0.45 + 1.2, side * r * 0.35, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    if (face === 'angry') {
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(r * 0.2, -r * 0.6);
      ctx.lineTo(r * 0.65, -r * 0.2);
      ctx.moveTo(r * 0.2, r * 0.6);
      ctx.lineTo(r * 0.65, r * 0.2);
      ctx.stroke();
    }
  } else if (face === 'visor') {
    ctx.strokeStyle = '#1b2733';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.62, -0.75, 0.75);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120, 200, 255, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.62, -0.5, 0.1);
    ctx.stroke();
  } else if (face === 'mask') {
    ctx.fillStyle = '#7a1f1f';
    ctx.beginPath();
    ctx.moveTo(r * 0.15, -r * 0.8);
    ctx.lineTo(r * 1.0, 0);
    ctx.lineTo(r * 0.15, r * 0.8);
    ctx.closePath();
    ctx.fill();
  }
}

// Päähineet nähdään ylhäältä: piirretään rungon päälle keskelle.
function drawHat(ctx, hat, r, color) {
  if (hat === 'cap') {
    ctx.fillStyle = '#c62828';
    ctx.beginPath();
    ctx.arc(-2, 0, r * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath(); // lippa eteenpäin
    ctx.ellipse(r * 0.55, 0, r * 0.38, r * 0.5, 0, -Math.PI / 2, Math.PI / 2);
    ctx.fill();
  } else if (hat === 'helmet') {
    ctx.fillStyle = '#4b5a3a';
    ctx.beginPath();
    ctx.arc(-1, 0, r * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2e3824';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else if (hat === 'beanie') {
    ctx.fillStyle = '#1e88e5';
    ctx.beginPath();
    ctx.arc(-2, 0, r * 0.65, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); // tupsu
    ctx.arc(-2, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (hat === 'headband') {
    ctx.strokeStyle = '#e53935';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath(); // solmun liepeet taakse
    ctx.moveTo(-r * 0.7, 0);
    ctx.lineTo(-r * 1.25, -4);
    ctx.moveTo(-r * 0.7, 0);
    ctx.lineTo(-r * 1.2, 5);
    ctx.stroke();
  } else if (hat === 'horns') {
    ctx.fillStyle = '#efe6d2';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, side * r * 0.45);
      ctx.quadraticCurveTo(r * 0.5, side * r * 1.3, r * 0.95, side * r * 1.05);
      ctx.lineTo(r * 0.25, side * r * 0.35);
      ctx.closePath();
      ctx.fill();
    }
  } else if (hat === 'crown') {
    ctx.fillStyle = '#ffca28';
    ctx.beginPath();
    const points = 5;
    for (let i = 0; i <= points * 2; i++) {
      const a = (i / (points * 2)) * Math.PI * 2;
      const rr = i % 2 === 0 ? r * 0.72 : r * 0.45;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2);
    ctx.fill();
  } else if (hat === 'tophat') {
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); // lieri
    ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2b2b';
    ctx.beginPath(); // kupu
    ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8e1b1b';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
