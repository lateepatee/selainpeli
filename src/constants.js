// Kaikki pelin säädettävät arvot yhdessä paikassa.

export const TICK_RATE = 60;
export const TICK = 1 / TICK_RATE;

// Kuinka paljon areenaa näkyy ruudulla. Sama kaikille ikkunan koosta riippumatta,
// jotta isolla näytöllä ei näe kauemmas kuin muut.
export const VIEW_W = 1200;
export const VIEW_H = 750;

export const ARENA_W = 1600;
export const ARENA_H = 1000;

export const PLAYER_RADIUS = 16;
export const PLAYER_SPEED = 220;     // px/s
export const PLAYER_HP = 100;
export const RESPAWN_TIME = 3;       // s

export const BULLET_SPEED = 700;     // px/s
export const BULLET_RADIUS = 4;
export const BULLET_DAMAGE = 20;
export const BULLET_LIFE = 1.2;      // s
export const FIRE_COOLDOWN = 0.25;   // s

// Erät ja pisteet
export const TARGET_SCORE = 15;      // ensimmäinen tähän voittaa pelin
export const WIN_POINTS = 3;         // erän viimeinen eloonjäänyt
export const KILL_POINTS = 1;
export const COUNTDOWN_TIME = 3;     // s ennen erän alkua
export const ROUND_END_TIME = 4;     // s erän tuloksen näyttö
export const GAME_OVER_TIME = 10;    // s lopputuloksen näyttö, sitten lämmittelyyn

// Kutistuva alue
export const ZONE_DELAY = 10;        // s ennen kuin alue alkaa kutistua
export const ZONE_SHRINK_TIME = 60;  // s täydestä pienimpään
export const ZONE_MIN_R = 110;
export const ZONE_DPS = 8;           // vahinko/s alueen ulkopuolella
export const ZONE_DPS_FINAL = 20;    // kun alue on täysin kutistunut

export const PLAYER_COLORS = [
  '#4fc3f7', // sininen
  '#ff7043', // oranssi
  '#9ccc65', // vihreä
  '#ba68c8', // violetti
  '#ffd54f', // keltainen
  '#f06292', // pinkki
];

// Esteet: suorakulmiot areenan koordinaateissa. Symmetrinen asettelu.
export const OBSTACLES = [
  { x: 350, y: 200, w: 200, h: 40 },
  { x: 1050, y: 200, w: 200, h: 40 },
  { x: 350, y: 760, w: 200, h: 40 },
  { x: 1050, y: 760, w: 200, h: 40 },
  { x: 760, y: 420, w: 80, h: 160 },
  { x: 200, y: 430, w: 40, h: 140 },
  { x: 1360, y: 430, w: 40, h: 140 },
  { x: 580, y: 470, w: 90, h: 60 },
  { x: 930, y: 470, w: 90, h: 60 },
  { x: 740, y: 100, w: 120, h: 40 },
  { x: 740, y: 860, w: 120, h: 40 },
];
