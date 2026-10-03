// Kaikki pelin säädettävät arvot yhdessä paikassa.

export const TICK_RATE = 60;
export const TICK = 1 / TICK_RATE;

// Kuinka paljon areenaa näkyy ruudulla. Sama kaikille ikkunan koosta riippumatta,
// jotta isolla näytöllä ei näe kauemmas kuin muut.
export const VIEW_W = 1200;
export const VIEW_H = 750;

// Kentän koko, esteet, ikkunat ja lamput tulevat nykyisestä kentästä (map.js, maps.js).
export { ARENA_W, ARENA_H, OBSTACLES, WINDOWS, LAMPS } from './map.js';

export const PLAYER_RADIUS = 16;
export const PLAYER_SPEED = 220;     // px/s
export const PLAYER_HP = 100;
export const RESPAWN_TIME = 3;       // s

// Väistö. Tickeinä (ei sekunteina), jotta liittyjän ennuste laskee täsmälleen samoin kuin host.
export const DASH_SPEED = 760;       // px/s väistön aikana
export const DASH_TICKS = 10;        // kesto
export const DASH_COOLDOWN_TICKS = 180; // 3 s

// Ammusten nopeus, vahinko ja tulinopeus ovat asekohtaisia: weapons.js.
export const BULLET_RADIUS = 4;

// Erät ja pisteet
export const TARGET_SCORE = 15;      // ensimmäinen tähän voittaa pelin
export const WIN_POINTS = 3;         // erän viimeinen eloonjäänyt
export const KILL_POINTS = 1;
export const COUNTDOWN_TIME = 3;     // s ennen erän alkua
export const ROUND_END_TIME = 4;     // s erän tuloksen näyttö
export const GAME_OVER_TIME = 10;    // s lopputuloksen näyttö, sitten lämmittelyyn

// Myrkkysumu (kutistuva alue)
export const ZONE_DELAY = 10;        // s ennen kuin sumu alkaa sulkeutua
export const ZONE_SHRINK_TIME = 60;  // s täydestä pienimpään
export const ZONE_MIN_R = 110;
export const ZONE_DPS = 8;           // vahinko/s sumussa
export const ZONE_DPS_FINAL = 20;    // kun sumu on sulkeutunut kokonaan

// Zombit
export const ZOMBIE_RADIUS = 14;
export const ZOMBIE_HP = 50;               // +ZOMBIE_HP_PER_LEVEL joka tasolla
export const ZOMBIE_HP_PER_LEVEL = 15;
export const ZOMBIE_SPEED = 65;            // px/s, +ZOMBIE_SPEED_PER_LEVEL joka tasolla
export const ZOMBIE_SPEED_PER_LEVEL = 10;
export const ZOMBIE_SPEED_MAX = 150;
export const ZOMBIE_SPRINTER_LEVEL = 3;    // tästä tasosta alkaen osa juoksee
export const ZOMBIE_DAMAGE = 20;
export const ZOMBIE_ATTACK_COOLDOWN = 1;   // s
export const ZOMBIE_EMERGE_TIME = 0.8;     // s ikkunasta kiipeäminen
export const ZOMBIE_LEVEL_TIME = 12;       // s erän kestoa per vaikeustaso
export const ZOMBIE_MAX = 50;
export const WARMUP_ZOMBIES = 8;

export const PLAYER_COLORS = [
  '#4fc3f7', // sininen
  '#ff7043', // oranssi
  '#9ccc65', // vihreä
  '#ba68c8', // violetti
  '#ffd54f', // keltainen
  '#f06292', // pinkki
];
