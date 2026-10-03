// Kenttien määrittelyt. Jokainen kenttä on lista suorakulmioita ja paikkoja.
// Arpalaatikko ja juoma-automaatit lisätään esteiksi automaattisesti (map.js).
//
// Esteen kind kertoo vain miltä se näyttää: wall, crate, furniture, shelf, stone, grave, tree.

const T = 24; // seinän paksuus

// Vaakaseinä x1..x2, keskilinja y. doors = [[keskikohta, leveys], ...]
function hWall(x1, x2, y, doors = [], kind = 'wall', t = T) {
  return segments(x1, x2, doors).map(([a, b]) => ({ x: a, y: y - t / 2, w: b - a, h: t, kind }));
}

// Pystyseinä y1..y2, keskilinja x.
function vWall(y1, y2, x, doors = [], kind = 'wall', t = T) {
  return segments(y1, y2, doors).map(([a, b]) => ({ x: x - t / 2, y: a, w: t, h: b - a, kind }));
}

function segments(start, end, doors) {
  const out = [];
  let cursor = start;
  for (const [c, w] of [...doors].sort((a, b) => a[0] - b[0])) {
    if (c - w / 2 > cursor) out.push([cursor, c - w / 2]);
    cursor = c + w / 2;
  }
  if (end > cursor) out.push([cursor, end]);
  return out;
}

const rect = (x, y, w, h, kind = 'wall') => ({ x, y, w, h, kind });

// Ikkunat ulkoreunoilla (zombien sisääntulot).
function windows(w, h, xs, ys) {
  return [
    ...xs.map((x) => ({ x, y: 0, side: 'top' })),
    ...xs.map((x) => ({ x, y: h, side: 'bottom' })),
    ...ys.map((y) => ({ x: 0, y, side: 'left' })),
    ...ys.map((y) => ({ x: w, y, side: 'right' })),
  ];
}

function machines(w, h) {
  return [
    { perk: 'rapid', x: 60, y: 80 },
    { perk: 'reload', x: w - 60, y: 80 },
    { perk: 'armor', x: 60, y: h - 80 },
  ];
}

// Hautakivirivistöt: sarakkeet x0..x1 välein dx, rivit ys. skip(x) jättää polun auki.
function graves(x0, x1, dx, ys, skip = () => false) {
  const out = [];
  for (let x = x0; x <= x1; x += dx) {
    if (skip(x)) continue;
    for (const y of ys) out.push(rect(x, y, 30, 16, 'grave'));
  }
  return out;
}

// --- Bunkkeri ---

const bunker = {
  id: 'bunker',
  name: 'Bunkkeri',
  w: 2000,
  h: 1300,
  theme: 'bunker',
  obstacles: [
    // Keskushuone, aukko joka sivulla
    ...hWall(700, 1300, 482, [[1000, 120]]),
    ...hWall(700, 1300, 818, [[1000, 120]]),
    ...vWall(470, 830, 712, [[650, 120]]),
    ...vWall(470, 830, 1288, [[650, 120]]),
    // Kulmien L-seinät
    rect(250, 220, 300, T), rect(250, 220, T, 200),
    rect(1450, 220, 300, T), rect(1726, 220, T, 200),
    rect(250, 1056, 300, T), rect(250, 880, T, 200),
    rect(1450, 1056, 300, T), rect(1726, 880, T, 200),
    // Sivu- ja keskiseinät
    rect(440, 560, T, 180), rect(1536, 560, T, 180),
    rect(900, 200, 200, T), rect(900, 1076, 200, T),
    // Laatikot
    rect(540, 620, 60, 60, 'crate'), rect(1400, 620, 60, 60, 'crate'),
    rect(600, 330, 60, 60, 'crate'), rect(1340, 910, 60, 60, 'crate'),
    rect(960, 320, 80, 50, 'crate'), rect(960, 930, 80, 50, 'crate'),
  ],
  windows: windows(2000, 1300, [400, 1000, 1600], [350, 650, 950]),
  lamps: [
    { x: 1000, y: 650, r: 200 },
    { x: 400, y: 420, r: 150 }, { x: 1600, y: 420, r: 150 },
    { x: 400, y: 880, r: 150 }, { x: 1600, y: 880, r: 150 },
    { x: 1000, y: 320, r: 130 }, { x: 1000, y: 980, r: 130 },
  ],
  wallBuys: [
    { weapon: 'smg', price: 750, x: 400, y: 266 },
    { weapon: 'rifle', price: 1000, x: 1600, y: 266 },
    { weapon: 'rifle', price: 1000, x: 400, y: 1034 },
    { weapon: 'smg', price: 750, x: 1600, y: 1034 },
    { weapon: 'shotgun', price: 600, x: 820, y: 448 },
    { weapon: 'shotgun', price: 600, x: 1180, y: 852 },
  ],
  box: { x: 1000, y: 650 },
  machines: machines(2000, 1300),
};

// --- Kartano: 3 × 3 huonetta ovineen ---

const manor = {
  id: 'manor',
  name: 'Kartano',
  w: 1800,
  h: 1300,
  theme: 'manor',
  obstacles: [
    ...vWall(0, 1300, 600, [[215, 110], [650, 110], [1085, 110]]),
    ...vWall(0, 1300, 1200, [[215, 110], [650, 110], [1085, 110]]),
    ...hWall(0, 1800, 430, [[300, 110], [900, 110], [1500, 110]]),
    ...hWall(0, 1800, 870, [[300, 110], [900, 110], [1500, 110]]),
    // Huonekalut
    rect(200, 150, 120, 60, 'furniture'), rect(400, 300, 100, 40, 'furniture'),
    rect(800, 180, 200, 50, 'furniture'),
    rect(1350, 140, 60, 100, 'furniture'), rect(1550, 300, 100, 40, 'furniture'),
    rect(150, 560, 60, 160, 'furniture'), rect(400, 700, 80, 50, 'furniture'),
    rect(1600, 560, 60, 160, 'furniture'), rect(1320, 600, 80, 50, 'furniture'),
    rect(200, 1000, 120, 60, 'furniture'), rect(420, 1150, 80, 40, 'furniture'),
    rect(800, 1050, 200, 50, 'furniture'),
    rect(1400, 1000, 60, 100, 'furniture'), rect(1580, 1150, 100, 40, 'furniture'),
  ],
  windows: windows(1800, 1300, [300, 900, 1500], [215, 1085]),
  lamps: [
    { x: 900, y: 650, r: 180 },
    { x: 300, y: 215, r: 130 }, { x: 900, y: 215, r: 130 }, { x: 1500, y: 215, r: 130 },
    { x: 300, y: 650, r: 130 }, { x: 1500, y: 650, r: 130 },
    { x: 300, y: 1085, r: 130 }, { x: 900, y: 1085, r: 130 }, { x: 1500, y: 1085, r: 130 },
  ],
  wallBuys: [
    { weapon: 'smg', price: 750, x: 150, y: 396 },
    { weapon: 'rifle', price: 1000, x: 1650, y: 396 },
    { weapon: 'rifle', price: 1000, x: 150, y: 904 },
    { weapon: 'smg', price: 750, x: 1650, y: 904 },
    { weapon: 'shotgun', price: 600, x: 566, y: 780 },
    { weapon: 'shotgun', price: 600, x: 1234, y: 520 },
  ],
  box: { x: 900, y: 650 },
  machines: machines(1800, 1300),
};

// --- Hautausmaa: iso ulkoalue, kappeli ja hautakivet ---

const graveyard = {
  id: 'graveyard',
  name: 'Hautausmaa',
  w: 2400,
  h: 1500,
  theme: 'graveyard',
  obstacles: [
    // Kappeli
    rect(1000, 250, 400, T, 'stone'),
    ...vWall(250, 510, 1012, [[385, 110]], 'stone'),
    ...vWall(250, 510, 1388, [[385, 110]], 'stone'),
    ...hWall(1000, 1400, 498, [[1200, 110]], 'stone'),
    // Hautakammiot
    rect(380, 280, 140, 100, 'stone'), rect(1880, 280, 140, 100, 'stone'),
    rect(380, 1120, 140, 100, 'stone'), rect(1880, 1120, 140, 100, 'stone'),
    rect(1140, 1020, 120, 150, 'stone'),
    // Puut
    rect(760, 200, 44, 44, 'tree'), rect(1640, 200, 44, 44, 'tree'),
    rect(950, 800, 44, 44, 'tree'), rect(1410, 800, 44, 44, 'tree'),
    rect(2250, 760, 44, 44, 'tree'), rect(110, 760, 44, 44, 'tree'),
    // Hautakivet
    ...graves(260, 760, 95, [600, 680, 760, 840]),
    ...graves(1600, 2100, 95, [600, 680, 760, 840]),
    ...graves(700, 1700, 95, [1300, 1380], (x) => x > 1100 && x < 1280),
  ],
  windows: windows(2400, 1500, [400, 1200, 2000], [450, 1050]),
  lamps: [
    { x: 1200, y: 380, r: 170 }, { x: 1200, y: 800, r: 150 },
    { x: 700, y: 500, r: 150 }, { x: 1700, y: 500, r: 150 },
    { x: 700, y: 1000, r: 150 }, { x: 1700, y: 1000, r: 150 },
    { x: 300, y: 200, r: 110 }, { x: 2100, y: 200, r: 110 },
    { x: 300, y: 1300, r: 110 }, { x: 2100, y: 1300, r: 110 },
  ],
  wallBuys: [
    { weapon: 'smg', price: 750, x: 450, y: 404 },
    { weapon: 'rifle', price: 1000, x: 1950, y: 404 },
    { weapon: 'rifle', price: 1000, x: 450, y: 1096 },
    { weapon: 'smg', price: 750, x: 1950, y: 1096 },
    { weapon: 'shotgun', price: 600, x: 978, y: 300 },
    { weapon: 'shotgun', price: 600, x: 1422, y: 470 },
    { weapon: 'sniper', price: 1400, x: 1200, y: 996 },
  ],
  box: { x: 1200, y: 360 },
  machines: machines(2400, 1500),
};

// --- Varasto: pitkät hyllyrivit ---

const shelfRow = (y) => [
  rect(250, y, 450, 40, 'shelf'),
  rect(820, y, 560, 40, 'shelf'),
  rect(1500, y, 450, 40, 'shelf'),
];

const warehouse = {
  id: 'warehouse',
  name: 'Varasto',
  w: 2200,
  h: 1400,
  theme: 'warehouse',
  obstacles: [
    ...shelfRow(250), ...shelfRow(450), ...shelfRow(910), ...shelfRow(1110),
    rect(560, 620, 80, 80, 'crate'), rect(1560, 620, 80, 80, 'crate'),
    rect(850, 560, 60, 60, 'crate'), rect(1290, 760, 60, 60, 'crate'),
  ],
  windows: windows(2200, 1400, [500, 1100, 1700], [370, 680, 1030]),
  lamps: [
    { x: 550, y: 680, r: 180 }, { x: 1100, y: 680, r: 200 }, { x: 1650, y: 680, r: 180 },
    { x: 760, y: 370, r: 120 }, { x: 1440, y: 370, r: 120 },
    { x: 760, y: 1030, r: 120 }, { x: 1440, y: 1030, r: 120 },
    { x: 1100, y: 120, r: 130 }, { x: 1100, y: 1280, r: 130 },
  ],
  wallBuys: [
    { weapon: 'smg', price: 750, x: 475, y: 226 },
    { weapon: 'rifle', price: 1000, x: 1725, y: 226 },
    { weapon: 'rifle', price: 1000, x: 475, y: 1174 },
    { weapon: 'smg', price: 750, x: 1725, y: 1174 },
    { weapon: 'shotgun', price: 600, x: 1100, y: 514 },
    { weapon: 'shotgun', price: 600, x: 1100, y: 886 },
    { weapon: 'sniper', price: 1400, x: 220, y: 680 },
  ],
  box: { x: 1100, y: 680 },
  machines: machines(2200, 1400),
};

export const MAPS = { bunker, manor, graveyard, warehouse };
export const MAP_IDS = Object.keys(MAPS);
export const DEFAULT_MAP = 'bunker';
