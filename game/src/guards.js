// Penjaga: kondektur, masinis, dan anjing K-9.
// Siklus: patrol -> suspicious (?) -> alert/chase (!) -> search -> patrol.
// Penjaga TIDAK menembus dinding: gerak memakai tabrakan lingkaran-vs-AABB,
// waypoint hanya di ruang terbuka.
import { VISION, RULES } from './config.js';
import { circleHitsBox, losClear } from './level.js';

export const GUARD_PATROL = 'patrol';
export const GUARD_SUSPICIOUS = 'suspicious';
export const GUARD_ALERT = 'alert';
export const GUARD_SEARCH = 'search';

function visionParams(guard) {
  if (guard.kind === 'dog') return { range: VISION.dogRange, half: VISION.dogHalfAngle, chase: VISION.dogChaseSpeed, patrol: VISION.dogPatrolSpeed };
  if (guard.kind === 'engineer') return { range: VISION.engineerRange, half: VISION.engineerHalfAngle, chase: VISION.chaseSpeed, patrol: VISION.patrolSpeed * 0.8 };
  return { range: VISION.guardRange, half: VISION.guardHalfAngle, chase: VISION.chaseSpeed, patrol: VISION.patrolSpeed };
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createGuard(def) {
  const start = def.waypoints[0];
  return {
    id: def.id,
    name: def.name,
    kind: def.kind,
    waypoints: def.waypoints,
    wpIndex: 1,
    x: start[0],
    z: start[1],
    angle: 0,
    state: GUARD_PATROL,
    detection: 0,        // 0..1 meter curiga terhadap pemain
    waitTimer: 0,         // jeda di waypoint
    suspiciousTimer: 0,
    searchTimer: 0,
    loseSightTimer: 0,
    lastSeen: null,       // {x, z} titik terakhir pemain terlihat
    investigate: null,    // {x, z, timer} target penyelidikan (koin pengalih)
    radius: def.kind === 'dog' ? 0.35 : 0.5,
    seesPlayer: false,
    justAlerted: false,   // naik sekali saat masuk alert (untuk sting suara)
    justSuspicious: false,
  };
}

// Apakah penjaga melihat pemain sekarang (jarak + sudut + garis pandang)?
export function guardSeesPlayer(guard, player, doorStates, tunnelDarkness) {
  const vp = visionParams(guard);
  const range = vp.range * (1 - tunnelDarkness * (1 - 0.55));
  const dx = player.x - guard.x;
  const dz = player.z - guard.z;
  const dist = Math.hypot(dx, dz);
  if (dist > range) return { sees: false, dist };
  const targetAngle = Math.atan2(dz, dx);
  if (Math.abs(angleDiff(targetAngle, guard.angle)) > vp.half) return { sees: false, dist };
  if (!losClear(guard.x, guard.z, player.x, player.z, doorStates)) return { sees: false, dist };
  return { sees: true, dist };
}

// Gerak dengan tabrakan: coba penuh, lalu geser per sumbu.
// Radius tabrakan 0.01 lebih kecil dari visual (anti-jepit floating point).
function moveGuard(guard, dx, dz, dt, solids) {
  const r = guard.radius - 0.01;
  const nx = guard.x + dx * dt;
  const nz = guard.z + dz * dt;
  let blocked = false;
  for (const b of solids) {
    if (circleHitsBox(nx, nz, r, b)) { blocked = true; break; }
  }
  if (!blocked) { guard.x = nx; guard.z = nz; return; }
  // Geser sumbu x saja.
  let okX = true;
  for (const b of solids) {
    if (circleHitsBox(nx, guard.z, r, b)) { okX = false; break; }
  }
  if (okX) guard.x = nx;
  let okZ = true;
  for (const b of solids) {
    if (circleHitsBox(guard.x, nz, r, b)) { okZ = false; break; }
  }
  if (okZ) guard.z = nz;
}

export function updateGuard(guard, dt, world) {
  const vp = visionParams(guard);
  const player = world.player;
  const tunnel = world.tunnel;
  const seen = guardSeesPlayer(guard, player, world.doorStates, tunnel.darkness);
  guard.seesPlayer = seen.sees;

  // Meter curiga naik saat terlihat, surut saat tidak.
  if (seen.sees && !world.playerHidden) {
    let rate = VISION.fillPerSecond;
    if (seen.dist < 2.5) rate *= VISION.fillCloseBoost;
    else rate *= 1 - 0.45 * (seen.dist / vp.range); // makin jauh makin lambat terisi
    if (player.sneak) rate *= VISION.fillSneakFactor;
    if (tunnel.inTunnel) rate *= VISION.fillTunnelFactor;
    guard.detection = Math.min(1, guard.detection + rate * dt);
    guard.lastSeen = { x: player.x, z: player.z };
    guard.loseSightTimer = 0;
  } else {
    guard.detection = Math.max(0, guard.detection - VISION.decayPerSecond * dt);
    guard.loseSightTimer += dt;
  }

  const wasState = guard.state;
  // Transisi curiga -> waspada.
  if (guard.detection >= VISION.alertAt && guard.state !== GUARD_ALERT) {
    guard.state = GUARD_ALERT;
    guard.justAlerted = true;
  } else if (guard.detection >= VISION.suspiciousAt && guard.state === GUARD_PATROL) {
    guard.state = GUARD_SUSPICIOUS;
    guard.suspiciousTimer = 0;
    guard.justSuspicious = true;
  } else if (guard.state === GUARD_SUSPICIOUS && guard.detection < 0.15) {
    guard.state = GUARD_PATROL;
  }

  // Koin pengalih: penyelidikan mengalahkan patroli (bukan alert).
  if (guard.investigate && guard.state !== GUARD_ALERT) {
    guard.investigate.timer -= dt;
    const dx = guard.investigate.x - guard.x;
    const dz = guard.investigate.z - guard.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.4) {
      guard.angle = Math.atan2(dz, dx);
      moveGuard(guard, (dx / dist) * vp.patrol * 1.4, (dz / dist) * vp.patrol * 1.4, dt, world.solids);
    } else {
      guard.angle += dt * 1.5; // menengok sekeliling
    }
    if (guard.investigate.timer <= 0) guard.investigate = null;
    return;
  }

  if (guard.state === GUARD_PATROL) {
    const target = guard.waypoints[guard.wpIndex];
    const dx = target[0] - guard.x;
    const dz = target[1] - guard.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.3) {
      guard.waitTimer += dt;
      if (guard.waitTimer > 0.9) {
        guard.waitTimer = 0;
        guard.wpIndex = (guard.wpIndex + 1) % guard.waypoints.length;
      }
      // Menengok perlahan saat menunggu.
      guard.angle += dt * 0.6;
    } else {
      guard.angle = Math.atan2(dz, dx);
      moveGuard(guard, (dx / dist) * vp.patrol, (dz / dist) * vp.patrol, dt, world.solids);
    }
  } else if (guard.state === GUARD_SUSPICIOUS) {
    // Berhenti, menatap arah pemain.
    if (guard.lastSeen) {
      const want = Math.atan2(guard.lastSeen.z - guard.z, guard.lastSeen.x - guard.x);
      const diff = angleDiff(want, guard.angle);
      guard.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
    }
    guard.suspiciousTimer += dt;
    if (guard.suspiciousTimer > 2.5 && guard.detection < VISION.alertAt) {
      // Kehilangan jejak: kembali patroli.
      guard.state = GUARD_PATROL;
      guard.suspiciousTimer = 0;
    }
  } else if (guard.state === GUARD_ALERT) {
    // Mengejar titik terakhir terlihat.
    const target = guard.lastSeen || { x: player.x, z: player.z };
    const dx = target.x - guard.x;
    const dz = target.z - guard.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.3) {
      guard.angle = Math.atan2(dz, dx);
      moveGuard(guard, (dx / dist) * vp.chase, (dz / dist) * vp.chase, dt, world.solids);
    }
    // Kehilangan pemain 2 detik -> menggeledah.
    if (guard.loseSightTimer > 2.0) {
      guard.state = GUARD_SEARCH;
      guard.searchTimer = 0;
    }
  } else if (guard.state === GUARD_SEARCH) {
    guard.searchTimer += dt;
    guard.angle += dt * 1.8; // menengok mencari
    if (guard.lastSeen) {
      const dx = guard.lastSeen.x - guard.x;
      const dz = guard.lastSeen.z - guard.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.6 && guard.searchTimer < VISION.searchSeconds * 0.6) {
        guard.angle = Math.atan2(dz, dx);
        moveGuard(guard, (dx / dist) * vp.patrol * 1.3, (dz / dist) * vp.patrol * 1.3, dt, world.solids);
      }
    }
    if (guard.searchTimer > VISION.searchSeconds) {
      guard.state = GUARD_PATROL;
      guard.searchTimer = 0;
      guard.lastSeen = null;
    }
  }
  if (wasState !== guard.state) guard.stateChanged = true;
}

// Arah & jangkauan kerucut untuk render (dan autopilot).
export function guardCone(guard, tunnelDarkness) {
  const vp = visionParams(guard);
  const range = vp.range * (1 - tunnelDarkness * (1 - 0.55));
  return { x: guard.x, z: guard.z, angle: guard.angle, range, half: vp.half, state: guard.state };
}
