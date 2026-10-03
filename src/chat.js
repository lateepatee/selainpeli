// Pelin sisäinen chat: viestiloki ja sen piirtäminen. Viestit kulkevat hostin kautta (host.js / client.js).
// Kaikki teksti piirretään canvasille, ei koskaan HTML:nä.

export const CHAT_MAX_LENGTH = 120;
const SHOW_TIME = 10;       // s, kauanko viesti näkyy kun chat on kiinni
const MAX_LOG = 50;
const VISIBLE_CLOSED = 6;
const VISIBLE_OPEN = 12;
const WIDTH = 420;

const log = [];             // { name, color, text, system, time }
let open = false;

export function setChatOpen(value) {
  open = value;
}

export function isChatOpen() {
  return open;
}

// Siistii viestin: ei ohjausmerkkejä, rajattu pituus. Sama tarkistus hostilla ja liittyjällä.
export function sanitizeChat(text) {
  return String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, CHAT_MAX_LENGTH);
}

export function addChat({ name = '', color = '#e6e9ef', text, system = false }) {
  const clean = sanitizeChat(text);
  if (!clean) return;
  log.push({
    name: String(name).slice(0, 16),
    color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#e6e9ef',
    text: clean,
    system: !!system,
    time: performance.now(),
  });
  if (log.length > MAX_LOG) log.shift();
}

export function clearChat() {
  log.length = 0;
}

// Piirretään vasempaan alakulmaan kierroslaskurin yläpuolelle.
export function drawChat(ctx, h) {
  const now = performance.now();
  const shown = open
    ? log.slice(-VISIBLE_OPEN)
    : log.slice(-VISIBLE_CLOSED).filter((m) => (now - m.time) / 1000 < SHOW_TIME);
  if (shown.length === 0 && !open) return;

  ctx.font = '600 14px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // Rivitetään viestit ja piirretään alhaalta ylöspäin.
  const lines = [];
  for (const m of shown) {
    const prefix = m.system ? '' : `${m.name}: `;
    const prefixW = ctx.measureText(prefix).width;
    const wrapped = wrap(ctx, m.text, WIDTH - prefixW);
    wrapped.forEach((text, i) => lines.push({ m, prefix: i === 0 ? prefix : '', indent: i === 0 ? 0 : prefixW, text }));
  }
  const lineH = 19;
  const bottom = h - 156;
  const top = bottom - lines.length * lineH;

  if (open) {
    ctx.fillStyle = '#00000099';
    ctx.fillRect(14, top - 8, WIDTH + 16, bottom - top + 14);
  }

  lines.forEach((line, i) => {
    const y = top + (i + 1) * lineH - 4;
    const age = (now - line.m.time) / 1000;
    ctx.globalAlpha = open ? 1 : Math.min(1, SHOW_TIME - age);
    // Tumma varjo, jotta teksti erottuu pelin päältä
    ctx.fillStyle = '#000000cc';
    ctx.fillText(line.prefix + line.text, 23 + line.indent, y + 1);
    if (line.m.system) {
      ctx.fillStyle = '#9aa3b5';
      ctx.fillText(line.text, 22 + line.indent, y);
    } else {
      ctx.fillStyle = line.m.color;
      ctx.fillText(line.prefix, 22, y);
      ctx.fillStyle = '#e6e9ef';
      ctx.fillText(line.text, 22 + ctx.measureText(line.prefix).width + line.indent, y);
    }
  });
  ctx.globalAlpha = 1;
}

function wrap(ctx, text, maxW) {
  const words = text.replace(/(\S{30})/g, '$1 ').split(' ');
  const out = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(next).width <= maxW || !cur) {
      cur = next;
    } else {
      out.push(cur);
      cur = word;
    }
  }
  if (cur) out.push(cur);
  return out;
}
