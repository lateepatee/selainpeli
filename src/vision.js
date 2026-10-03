// Näkyvyyden säännöt: mikä on valaistu kenellekin. Sama sääntö piirrolle (nimet ja HP-palkit)
// ja boteille, jotta botit eivät näe pimeässä paremmin kuin ihmiset.

import { LAMPS } from './map.js';

export const AURA_RADIUS = 110;            // valopiiri pelaajan ympärillä
export const FLASHLIGHT_RANGE = 440;       // taskulampun keilan pituus
export const FLASHLIGHT_HALF_ANGLE = 0.42; // keilan puolikas leveys (rad)

// Onko piste (x, y) valaistu katsojalle, joka seisoo kohdassa obs ja katsoo suuntaan aim?
// Muiden pelaajien valot eivät auta: näet vain oman valosi ja kattolamppujen alueen.
// Näköyhteys tarkistetaan erikseen (geometry.lineOfSight).
export function isLitFor(obs, aim, x, y) {
  const dx = x - obs.x;
  const dy = y - obs.y;
  const d = Math.hypot(dx, dy);
  if (d < AURA_RADIUS + 10) return true;
  if (d < FLASHLIGHT_RANGE) {
    let a = Math.atan2(dy, dx) - aim;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    if (Math.abs(a) < FLASHLIGHT_HALF_ANGLE * 1.15) return true;
  }
  return LAMPS.some((l) => Math.hypot(x - l.x, y - l.y) < l.r * 0.6);
}
