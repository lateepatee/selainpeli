// Pelaajahahmon ulkonäkö: väri, päähine, kuvio ja kasvot. Pelkkää ulkonäköä, osuma-alue on aina sama.
// Hahmo piirretään 3D:nä (render3d/actors.js).
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
