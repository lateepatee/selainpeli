// Pelin piirto: 3D-näkymä (scene.js) ja sen päällä 2D-HUD (hud.js). Ei vaikuta pelin tilaan.
// Rajapinta on sama kuin vanhalla 2D-piirrolla, joten host.js ja client.js eivät tiedä 3D:stä mitään.
//
// Osoitteen ?fps=1 näyttää ruudunpäivityksen ja yhden ruudun todellisen keston (CPU + GPU).

import { ARENA_W, ARENA_H } from '../constants.js';
import { initScene, resizeScene, renderScene, sceneEvents, clearScene, finishGpu, screenToWorld } from './scene.js';
import { hudEvents, drawHud } from './hud.js';

export { screenToWorld };
export { QUALITY_LEVELS, QUALITY_IDS, getQuality, setQuality, onQualityChange } from './quality.js';
export { initPreview, drawPreview } from './preview.js';

// Kameran kohta pelin koordinaateissa. Äänet sijoitetaan tämän suhteen (sound.js).
export const camera = { x: ARENA_W / 2, y: ARENA_H / 2 };

const SHOW_FPS = new URLSearchParams(location.search).get('fps') === '1';
const stats = { fps: 0, frameMs: 0, frames: 0, start: 0, ms: 0 };
let idle = false;

// gameCanvas saa WebGL-kontekstin, HUD piirretään erilliselle 2D-canvasille sen päällä.
export function initRenderer(gameCanvas) {
  initScene(gameCanvas);
}

export function resize(canvas) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  resizeScene();
  idle = false;
}

// Kamera seuraa kohdetta pehmeästi.
export function followCamera(target, dt) {
  const k = 1 - Math.exp(-dt * 10);
  camera.x += (target.x - camera.x) * k;
  camera.y += (target.y - camera.y) * k;
}

// Kenen perässä kamera kulkee: oma hahmo, tai kuolleena tappaja tai joku elossa oleva.
export function cameraTarget(world, localId) {
  const me = world.players[localId];
  if (me?.alive) return me;
  if (world.phase === 'warmup') return null;
  const killer = me?.killedBy && world.players[me.killedBy];
  if (killer?.alive) return killer;
  return Object.values(world.players).find((p) => p.alive) || null;
}

// Muuttaa simulaation tapahtumat efekteiksi: hiukkaset ja valot 3D:hen, ilmoitukset HUDiin.
export function handleEvents(events, world, localId) {
  sceneEvents(events, localId, cameraTarget(world, localId)?.id);
  hudEvents(events, world, localId);
}

// alpha = kuinka pitkällä ollaan nykyisen ja seuraavan tickin välissä (sulava liike yli 60 Hz näytöillä).
export function render(ctx, world, localId, alpha, dt) {
  const t0 = performance.now();
  idle = false;
  const viewer = cameraTarget(world, localId);
  const seen = renderScene(world, viewer, alpha, dt, camera, t0 / 1000);

  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  drawHud(ctx, world, localId, w, h, dt, seen);
  if (SHOW_FPS) measure(ctx, t0, w);
}

// Aulassa ja yhteyttä odottaessa: tyhjä ruutu (kerran, ei joka ruudulla).
export function drawIdle(ctx) {
  if (idle) return;
  idle = true;
  clearScene();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

// Mittaustiedot (vain ?fps=1): ruutua sekunnissa ja yhden ruudun keskimääräinen kesto.
export function renderStats() {
  return { fps: stats.fps, frameMs: stats.frameMs };
}

function measure(ctx, t0, w) {
  finishGpu();
  const now = performance.now();
  stats.ms += now - t0;
  stats.frames++;
  if (now - stats.start >= 1000) {
    stats.fps = (stats.frames * 1000) / (now - stats.start);
    stats.frameMs = stats.ms / stats.frames;
    stats.frames = 0;
    stats.ms = 0;
    stats.start = now;
  }
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#7bd88f';
  ctx.fillText(`${stats.fps.toFixed(0)} fps · ${stats.frameMs.toFixed(1)} ms`, w - 12, 40);
}
