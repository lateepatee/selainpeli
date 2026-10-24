// Grafiikan laatutaso. Vain piirtoa: ei vaikuta peliin eikä verkkoon, joten jokainen valitsee omansa.
// Matala on tarkoitettu integroiduille näytönohjaimille: ei varjoja eikä muiden pelaajien valoja.

export const QUALITY_LEVELS = {
  low: { name: 'Matala', resH: 180, shadowMap: 0, otherLights: false },
  medium: { name: 'Keski', resH: 225, shadowMap: 512, otherLights: true },
  high: { name: 'Korkea', resH: 270, shadowMap: 1024, otherLights: true },
};
export const QUALITY_IDS = Object.keys(QUALITY_LEVELS);
const DEFAULT_QUALITY = 'medium';
const STORAGE_KEY = 'areena-laatu';

let current = load();
const listeners = [];

export function getQuality() {
  return current;
}

export function qualitySettings() {
  return QUALITY_LEVELS[current];
}

export function setQuality(id) {
  if (!QUALITY_LEVELS[id] || id === current) return;
  current = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {}
  for (const fn of listeners) fn(QUALITY_LEVELS[id]);
}

export function onQualityChange(fn) {
  listeners.push(fn);
}

function load() {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    return QUALITY_LEVELS[id] ? id : DEFAULT_QUALITY;
  } catch {
    return DEFAULT_QUALITY;
  }
}
