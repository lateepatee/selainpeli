// Nykyinen kenttä. Muut moduulit tuovat nämä arvot, ja ES-moduulien "live binding" päivittää ne
// kaikkialle, kun setMap vaihtaa kentän. Välimuistit (zombien reitit, näkyvyyden seinät, lattia)
// rakennetaan uudelleen onMapChange-kuuntelijoissa.

import { MAPS, DEFAULT_MAP } from './maps.js';

export const BOX_W = 64;
export const BOX_H = 30;
export const MACHINE_SIZE = 40;

export let MAP_ID = null;
export let MAP_NAME = '';
export let MAP_THEME = '';
export let ARENA_W = 0;
export let ARENA_H = 0;
export let OBSTACLES = [];
export let WINDOWS = [];
export let LAMPS = [];
export let WALL_BUYS = [];
export let BOX = null;            // { x, y, w, h }
export let PERK_MACHINES = [];

const listeners = [];

export function onMapChange(fn) {
  listeners.push(fn);
}

export function setMap(id) {
  const m = MAPS[id] || MAPS[DEFAULT_MAP];
  if (m.id === MAP_ID) return;
  MAP_ID = m.id;
  MAP_NAME = m.name;
  MAP_THEME = m.theme;
  ARENA_W = m.w;
  ARENA_H = m.h;
  WINDOWS = m.windows;
  LAMPS = m.lamps;
  WALL_BUYS = m.wallBuys;
  BOX = { x: m.box.x, y: m.box.y, w: BOX_W, h: BOX_H };
  PERK_MACHINES = m.machines;
  OBSTACLES = [
    ...m.obstacles,
    { x: m.box.x - BOX_W / 2, y: m.box.y - BOX_H / 2, w: BOX_W, h: BOX_H, kind: 'box' },
    ...m.machines.map((mc) => ({
      x: mc.x - MACHINE_SIZE / 2, y: mc.y - MACHINE_SIZE / 2, w: MACHINE_SIZE, h: MACHINE_SIZE, kind: 'machine',
    })),
  ];
  for (const fn of listeners) fn();
}

setMap(DEFAULT_MAP);
