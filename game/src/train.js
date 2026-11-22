// Mekanik khas kereta: goyangan, terowongan berkala, pintu geser.
// Terowongan = gelap total berkala: penglihatan penjaga menyusut,
// alarm lebih cepat reda — jendela kabur yang harus dibaca pemain.
import { TRAIN } from './config.js';

// Siklus terowongan dari waktu permainan (detik).
export function tunnelState(time) {
  const t = time % TRAIN.tunnelPeriod;
  const inTunnel = t >= TRAIN.tunnelStart && t < TRAIN.tunnelStart + TRAIN.tunnelLength;
  // Transisi halus 0.8 detik di awal/akhir terowongan.
  let darkness = 0;
  if (inTunnel) {
    const sinceStart = t - TRAIN.tunnelStart;
    const tillEnd = TRAIN.tunnelStart + TRAIN.tunnelLength - t;
    darkness = Math.min(1, sinceStart / 0.8, tillEnd / 0.8);
  }
  const nextIn = inTunnel ? 0 : (TRAIN.tunnelStart - t + TRAIN.tunnelPeriod) % TRAIN.tunnelPeriod;
  return { inTunnel, darkness, nextIn };
}

// Goyangan kereta: offset kamera & adegan mengikuti sinus lambat.
export function swayOffset(time) {
  return {
    x: Math.sin(time * TRAIN.swaySpeedX) * TRAIN.swayAmpX,
    z: Math.cos(time * TRAIN.swaySpeedZ) * TRAIN.swayAmpZ,
    roll: Math.sin(time * 0.35) * 0.012,
  };
}

// Pintu geser antar-gerbong: closed -> opening -> open.
export function createDoor(def) {
  return {
    id: def.id,
    x: def.x,
    z: def.z,
    box: def.box,
    label: def.label,
    state: 'closed',   // closed | opening | open
    openT: 0,           // 0..1 progres geser
    openTimer: 0,
  };
}

export function updateDoor(door, dt, openSeconds) {
  if (door.state === 'opening') {
    door.openTimer += dt;
    door.openT = Math.min(1, door.openTimer / openSeconds);
    if (door.openT >= 1) door.state = 'open';
  }
}

export function doorBlocks(door) {
  return door.state !== 'open';
}
