// Aseet, raha ja ostopaikat. Sama logiikka hostin simulaatiolle ja ruudun ostovihjeille.

export const START_MONEY = 500;
export const MONEY_ZOMBIE_HIT = 10;
export const MONEY_ZOMBIE_KILL = 60;
export const MONEY_PLAYER_KILL = 200;
export const INTERACT_RANGE = 60;
export const SWAP_TIME = 0.35;        // s aseen vaihtoon

// damage = per ammus, pellets = montako ammusta per laukaus, spread = hajonta (rad),
// life = ammuksen elinaika (s) eli käytännössä kantama. splash = räjähdyssäde.
export const WEAPONS = {
  pistol: {
    name: 'Pistooli', damage: 20, pellets: 1, spread: 0.03, cooldown: 0.28,
    mag: 8, reserve: Infinity, reload: 1.2, speed: 700, life: 1.0, length: 8,
  },
  shotgun: {
    name: 'Haulikko', damage: 14, pellets: 6, spread: 0.26, cooldown: 0.8,
    mag: 6, reserve: 30, reload: 2.2, speed: 650, life: 0.45, length: 14,
  },
  smg: {
    name: 'Konepistooli', damage: 14, pellets: 1, spread: 0.08, cooldown: 0.08,
    mag: 30, reserve: 150, reload: 1.8, speed: 720, life: 0.9, length: 11,
  },
  rifle: {
    name: 'Rynnäkkökivääri', damage: 24, pellets: 1, spread: 0.04, cooldown: 0.12,
    mag: 30, reserve: 120, reload: 2.2, speed: 820, life: 1.1, length: 16,
  },
  sniper: {
    name: 'Tarkkuuskivääri', damage: 90, pellets: 1, spread: 0, cooldown: 1.1,
    mag: 5, reserve: 25, reload: 2.5, speed: 1400, life: 1.0, length: 20,
  },
  lmg: {
    name: 'Konekivääri', damage: 22, pellets: 1, spread: 0.07, cooldown: 0.09,
    mag: 75, reserve: 225, reload: 3.5, speed: 780, life: 1.1, length: 18,
  },
  wonder: {
    name: 'Säteilijä', damage: 100, pellets: 1, spread: 0, cooldown: 0.35,
    mag: 20, reserve: 140, reload: 2.8, speed: 900, life: 1.2, length: 12,
    splash: 60, splashDamage: 60,
  },
};

// Seinäaseet, arpalaatikko ja automaatit tulevat nykyisestä kentästä (maps.js).
import { WALL_BUYS, BOX, PERK_MACHINES, MACHINE_SIZE } from './map.js';
export { WALL_BUYS, BOX, PERK_MACHINES, MACHINE_SIZE };

export const BOX_PRICE = 950;
export const BOX_SPIN_TIME = 3;
export const BOX_TAKE_TIME = 8;
// Arvontapainot: erikoisase on harvinainen.
const BOX_POOL = [
  ['shotgun', 16], ['smg', 16], ['rifle', 16], ['sniper', 18], ['lmg', 18], ['wonder', 6],
];

export function ammoPrice(buy) {
  return Math.round(buy.price / 2);
}

export function hasWeapon(p, id) {
  return (p.slots || []).some((s) => s?.id === id);
}

// Arpoo aseen, jota pelaajalla ei vielä ole.
export function rollBoxWeapon(p) {
  const pool = BOX_POOL.filter(([id]) => !hasWeapon(p, id));
  const total = pool.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [id, w] of pool) {
    r -= w;
    if (r <= 0) return id;
  }
  return pool[pool.length - 1][0];
}

// Mitä pelaaja voi tässä kohdassa tehdä E:llä? null jos ei mitään.
// Palauttaa { kind: 'wall' | 'ammo' | 'box' | 'take' | 'perk' | 'wait', price, label, buy, perk }.
export function findInteractable(world, p) {
  if (!p?.alive) return null;

  const box = world.box;
  if (box && Math.hypot(p.x - BOX.x, p.y - BOX.y) < INTERACT_RANGE + 10) {
    if (box.state === 'idle') return { kind: 'box', price: BOX_PRICE, label: `Arpalaatikko (${BOX_PRICE} $)` };
    if (box.state === 'ready' && box.owner === p.id) {
      return { kind: 'take', price: 0, label: `Ota ${WEAPONS[box.weapon].name}` };
    }
    return { kind: 'wait', price: 0, label: box.state === 'spinning' ? 'Arpalaatikko pyörii…' : 'Laatikko on varattu' };
  }

  for (const m of PERK_MACHINES) {
    if (Math.hypot(p.x - m.x, p.y - m.y) > INTERACT_RANGE) continue;
    const perk = PERKS[m.perk];
    if (p.perks?.[m.perk]) return { kind: 'wait', price: 0, label: `${perk.name} on jo juotu` };
    return { kind: 'perk', price: perk.price, label: `Juo ${perk.name} (${perk.price} $)`, perk: m.perk };
  }

  let best = null;
  let bestDist = INTERACT_RANGE;
  for (const buy of WALL_BUYS) {
    const d = Math.hypot(p.x - buy.x, p.y - buy.y);
    if (d < bestDist) {
      best = buy;
      bestDist = d;
    }
  }
  if (!best) return null;
  const w = WEAPONS[best.weapon];
  if (hasWeapon(p, best.weapon)) {
    return { kind: 'ammo', price: ammoPrice(best), label: `Ammuksia: ${w.name} (${ammoPrice(best)} $)`, buy: best };
  }
  return { kind: 'wall', price: best.price, label: `Osta ${w.name} (${best.price} $)`, buy: best };
}

// --- Juoma-automaatit (voimassa koko pelin, nollautuvat uudessa pelissä) ---

export const PERKS = {
  armor: { name: 'Panssarijuoma', short: 'P', price: 1000, color: '#e53935' },
  reload: { name: 'Pikalataus', short: 'L', price: 800, color: '#43a047' },
  rapid: { name: 'Tuplatuli', short: 'T', price: 900, color: '#fb8c00' },
};
export const PERK_IDS = Object.keys(PERKS);
export const ARMOR_HP = 175;          // Panssarijuoman maksimi-HP
export const RELOAD_PERK_MUL = 0.5;   // latausaika kerrotaan tällä
export const RAPID_PERK_MUL = 0.75;   // ampumisväli kerrotaan tällä


export function maxHpOf(p) {
  return p.perks?.armor ? ARMOR_HP : 100;
}

// --- Tehosteet: putoavat zombeista, ensimmäinen poimija hyötyy ---

export const POWERUPS = {
  ammo: { name: 'Täydet ammukset', short: 'A', color: '#ffd54f' },
  insta: { name: 'Kertaisku', short: 'K', color: '#ff5252', duration: 15 },
  nuke: { name: 'Ydinpommi', short: 'Y', color: '#ffffff', money: 400 },
  double: { name: 'Tuplarahat', short: '2x', color: '#69f0ae', duration: 20 },
};
export const POWERUP_IDS = Object.keys(POWERUPS);
export const POWERUP_DROP_CHANCE = 0.12;
export const POWERUP_MAX_ON_FLOOR = 2;
// Arvontapainot: vahvin (ydinpommi) harvinaisin.
export const POWERUP_WEIGHTS = { ammo: 35, insta: 25, double: 25, nuke: 15 };
export const POWERUP_LIFE = 15;       // s lattialla
export const POWERUP_PICKUP_RANGE = 26;
