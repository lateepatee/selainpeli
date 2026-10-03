// Näppäimistö ja hiiri -> pelaajan syöte.

const keys = new Set();
const mouse = { x: 0, y: 0, down: false, right: false };
let wheelSwap = false; // hiiren rulla vaihtaa asetta (yksi pulssi)

export function initInput(canvas) {
  window.addEventListener('keydown', (e) => {
    // Aulan tekstikentät saavat näppäimet itselleen.
    if (e.target instanceof HTMLInputElement) return;
    keys.add(e.code);
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => {
    keys.clear();
    mouse.down = false;
    mouse.right = false;
  });

  canvas.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) mouse.down = true;
    if (e.button === 2) mouse.right = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.down = false;
    if (e.button === 2) mouse.right = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    if (e.deltaY !== 0) wheelSwap = true;
    e.preventDefault();
  }, { passive: false });
}

// Chatin auetessa: ettei hahmo jää kävelemään pohjassa olleen napin mukaan.
export function releaseAll() {
  keys.clear();
  mouse.down = false;
  mouse.right = false;
}

// screenToWorld muuntaa hiiren ruutukoordinaatit areenan koordinaateiksi.
export function readInput(player, screenToWorld) {
  const m = screenToWorld(mouse.x, mouse.y);
  const swap = keys.has('KeyQ') || wheelSwap;
  wheelSwap = false;
  return {
    up: keys.has('KeyW') || keys.has('ArrowUp'),
    down: keys.has('KeyS') || keys.has('ArrowDown'),
    left: keys.has('KeyA') || keys.has('ArrowLeft'),
    right: keys.has('KeyD') || keys.has('ArrowRight'),
    aim: Math.atan2(m.y - player.y, m.x - player.x),
    shoot: mouse.down || keys.has('Space'),
    reload: keys.has('KeyR'),
    interact: keys.has('KeyE') || keys.has('KeyF'),
    swap,
    dash: keys.has('ShiftLeft') || keys.has('ShiftRight') || mouse.right,
  };
}
