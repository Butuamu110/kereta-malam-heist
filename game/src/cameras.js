// CCTV: kamera pengawas di langit-langit yang menyapu ruangan.
// Sorotannya mengisi meter kamera; penuh -> alarm melonjak & semua
// penjaga curiga ke arah pemain.
import { CAMERA, VISION } from './config.js';
import { losClear } from './level.js';

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createCamera(def) {
  return {
    id: def.id,
    x: def.x,
    z: def.z,
    baseAngle: def.baseAngle,
    angle: def.baseAngle,
    sweepT: def.id * 1.7, // fase berbeda per kamera
    meter: 0,             // 0..1
    cooldown: 0,
    seesPlayer: false,
    justTriggered: false,
  };
}

export function updateCamera(cam, dt, world) {
  cam.sweepT += dt;
  cam.angle = cam.baseAngle + Math.sin(cam.sweepT * CAMERA.sweepSpeed) * CAMERA.sweepArc;
  if (cam.cooldown > 0) cam.cooldown -= dt;

  const player = world.player;
  const tunnel = world.tunnel;
  const range = VISION.cameraRange * (1 - tunnel.darkness * (1 - 0.55));
  const dx = player.x - cam.x;
  const dz = player.z - cam.z;
  const dist = Math.hypot(dx, dz);
  let sees = false;
  if (dist < range && Math.abs(angleDiff(Math.atan2(dz, dx), cam.angle)) < VISION.cameraHalfAngle) {
    if (losClear(cam.x, cam.z, player.x, player.z, world.doorStates)) sees = true;
  }
  cam.seesPlayer = sees;
  if (sees && cam.cooldown <= 0) {
    let rate = CAMERA.fillPerSecond;
    if (player.sneak) rate *= VISION.fillSneakFactor;
    if (tunnel.inTunnel) rate *= VISION.fillTunnelFactor;
    cam.meter = Math.min(1, cam.meter + rate * dt);
    if (cam.meter >= 1) {
      cam.justTriggered = true;
      cam.meter = 0.25;
      cam.cooldown = 3;
    }
  } else {
    cam.meter = Math.max(0, cam.meter - CAMERA.decayPerSecond * dt);
  }
}

export function cameraCone(cam, tunnelDarkness) {
  const range = VISION.cameraRange * (1 - tunnelDarkness * (1 - 0.55));
  return { x: cam.x, z: cam.z, angle: cam.angle, range, half: VISION.cameraHalfAngle };
}
