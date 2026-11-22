// Input keyboard + mouse: arah gerak, aksi tepi (E/Q/R/M/Enter/Pause).
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_DECOY = 8;
export const ACTION_MUTE = 16;
export const ACTION_RESTART = 32;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;

  function keyName(event) {
    const k = event.key.toLowerCase();
    if (k === ' ') return 'space';
    return k;
  }

  function onDown(event) {
    const k = keyName(event);
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) event.preventDefault();
    if (event.repeat) return;
    keys.add(k);
    if (k === 'enter' || k === 'space') actions |= ACTION_CONFIRM;
    if (k === 'p' || k === 'escape') actions |= ACTION_PAUSE;
    if (k === 'e') actions |= ACTION_INTERACT;
    if (k === 'q') actions |= ACTION_DECOY;
    if (k === 'm') actions |= ACTION_MUTE;
    if (k === 'r') actions |= ACTION_RESTART;
  }

  function onUp(event) {
    keys.delete(keyName(event));
  }

  function onClick() {
    actions |= ACTION_CONFIRM;
  }

  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  canvas.addEventListener('pointerdown', onClick);

  return {
    // Arah gerak ternormalisasi {x, z} dalam ruang dunia.
    direction() {
      let x = 0;
      let z = 0;
      if (keys.has('a') || keys.has('arrowleft')) x -= 1;
      if (keys.has('d') || keys.has('arrowright')) x += 1;
      if (keys.has('w') || keys.has('arrowup')) z -= 1;
      if (keys.has('s') || keys.has('arrowdown')) z += 1;
      const len = Math.hypot(x, z);
      if (len > 0) { x /= len; z /= len; }
      return { x, z };
    },
    get sneak() {
      return keys.has('shift');
    },
    // Ambil & kosongkan aksi-aksi tepi sejak panggilan terakhir.
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    // Apakah tombol aksi sedang ditekan (untuk autopilot manual tidak dipakai).
    get interactHeld() {
      return keys.has('e');
    },
  };
}
