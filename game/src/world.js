// Dunia permainan: state, langkah simulasi, alarm, strike, menang/kalah.
// Aturan asli yang dimainkan pemain DAN autopilot — tanpa jalan pintas.
import { PLAYER, RULES, ALARM, TRAIN, GRADES, WORLD } from './config.js';
import { createRandom } from './random.js';
import { LEVEL, solidBoxes, circleHitsBox, compartmentOf, clampToWorld } from './level.js';
import { createDoor, updateDoor, tunnelState } from './train.js';
import { createGuard, updateGuard, GUARD_ALERT } from './guards.js';
import { createCamera, updateCamera } from './cameras.js';

export const EVENT_NONE = 0;
export const EVENT_LOOT = 1;
export const EVENT_CAUGHT = 2;
export const EVENT_WIN = 4;
export const EVENT_LOSE = 8;
export const EVENT_ALARM_FULL = 16;
export const EVENT_DECOY = 32;
export const EVENT_DOOR = 64;
export const EVENT_OVER = EVENT_WIN | EVENT_LOSE;

export function createWorld(random) {
  const rng = random || createRandom(20261122);
  const state = {
    rng,
    time: 0,
    screen: 'title', // title | play | win | lose (dipegang main.js; world hanya tahu over)
    over: false,
    won: false,
    player: {
      x: LEVEL.start.x, z: LEVEL.start.z,
      angle: 0, moving: false, sneak: false,
      invulnerable: 0,
    },
    guards: LEVEL.guardDefs.map(createGuard),
    cameras: LEVEL.cameraDefs.map(createCamera),
    doors: LEVEL.doors.map(createDoor),
    doorStates: {},
    loot: LEVEL.lootSpots.map((s) => ({ ...s, taken: false })),
    lootCount: 0,
    channel: null, // {lootId, t} — membobol peti yang sedang berjalan
    alarm: 0,
    alarmFullTimer: 0,
    strikes: 0,
    decoys: 2,
    decoyActive: null, // {x, z, timer}
    tunnel: { inTunnel: false, darkness: 0, nextIn: 20 },
    playerHidden: false,
    message: '',
    messageTimer: 0,
    stats: { caught: 0, decoysUsed: 0, doorsOpened: 0 },
    grade: null,
    // Jejak untuk screenshot klimaks & laporan autopilot.
    maxAlarmSeen: 0,
    anyAlertSeen: false,
  };
  syncDoorStates(state);
  return { state, reset, step };

  function syncDoorStates(s) {
    s.doorStates = {};
    for (const d of s.doors) s.doorStates[d.id] = { open: d.state === 'open' };
  }

  function reset() {
    const fresh = createWorld(createRandom(20261122));
    Object.keys(state).forEach((k) => { state[k] = fresh.state[k]; });
  }

  function solids() {
    return solidBoxes(state.doorStates);
  }

  function movePlayer(dx, dz, dt) {
    const p = state.player;
    const solidsList = solids();
    // Radius tabrakan 0.01 lebih kecil dari radius visual: menghindari
    // jepitan knife-edge floating point saat bergeser di tepi dinding.
    const r = PLAYER.radius - 0.01;
    const nx = p.x + dx * dt;
    const nz = p.z + dz * dt;
    let blocked = false;
    for (const b of solidsList) {
      if (circleHitsBox(nx, nz, r, b)) { blocked = true; break; }
    }
    if (!blocked) { p.x = nx; p.z = nz; return; }
    let okX = true;
    for (const b of solidsList) {
      if (circleHitsBox(nx, p.z, r, b)) { okX = false; break; }
    }
    if (okX) p.x = nx;
    let okZ = true;
    for (const b of solidsList) {
      if (circleHitsBox(p.x, nz, r, b)) { okZ = false; break; }
    }
    if (okZ) p.z = nz;
    const c = clampToWorld(p.x, p.z);
    p.x = c.x; p.z = c.z;
  }

  function nearestLoot() {
    let best = null;
    let bestD = Infinity;
    for (const l of state.loot) {
      if (l.taken) continue;
      const d = Math.hypot(l.x - state.player.x, l.z - state.player.z);
      if (d < bestD) { bestD = d; best = l; }
    }
    return best ? { loot: best, dist: bestD } : null;
  }

  function nearestClosedDoor() {
    let best = null;
    let bestD = Infinity;
    for (const d of state.doors) {
      if (d.state !== 'closed') continue;
      const dist = Math.hypot(d.x - state.player.x, d.z - state.player.z);
      if (dist < bestD) { bestD = dist; best = d; }
    }
    return best ? { door: best, dist: bestD } : null;
  }

  function tryInteract() {
    // 1) Mulai membobol peti emas terdekat (channel 1,2 detik, diam di tempat).
    const near = nearestLoot();
    if (near && near.dist < RULES.interactRange) {
      if (state.channel && state.channel.lootId === near.loot.id) return EVENT_NONE;
      state.channel = { lootId: near.loot.id, t: 0 };
      setMessage(`Membobol ${near.loot.name}… jangan bergerak!`);
      return EVENT_NONE;
    }
    // 2) Buka pintu geser terdekat.
    const door = nearestClosedDoor();
    if (door && door.dist < RULES.interactRange + 0.4) {
      door.door.state = 'opening';
      door.door.openTimer = 0;
      state.stats.doorsOpened += 1;
      setMessage(`${door.door.label} terbuka — geser!`);
      return EVENT_DOOR;
    }
    return EVENT_NONE;
  }

  function tryDecoy() {
    if (state.decoys <= 0) return EVENT_NONE;
    state.decoys -= 1;
    state.stats.decoysUsed += 1;
    const p = state.player;
    const tx = p.x + Math.cos(p.angle) * 4;
    const tz = p.z + Math.sin(p.angle) * 4;
    state.decoyActive = { x: tx, z: tz, timer: 3 };
    for (const g of state.guards) {
      const d = Math.hypot(g.x - tx, g.z - tz);
      if (d < 8 && g.state !== GUARD_ALERT) {
        g.investigate = { x: tx, z: tz, timer: 4 };
        g.detection = Math.max(0, g.detection - 0.4);
      }
    }
    setMessage('Koin pengalih dilempar — penjaga menyelidiki bunyinya!');
    return EVENT_DECOY;
  }

  function setMessage(text) {
    state.message = text;
    state.messageTimer = 3.5;
  }

  function onCaught() {
    state.strikes += 1;
    state.stats.caught += 1;
    state.alarm = 20;
    // Kembali ke pintu masuk gerbong saat ini.
    const comp = compartmentOf(state.player.x);
    const cp = LEVEL.checkpoints.find((c) => c.compartment === comp) || LEVEL.checkpoints[0];
    state.player.x = cp.x;
    state.player.z = cp.z;
    state.player.invulnerable = RULES.invulnerableSeconds;
    for (const g of state.guards) {
      g.state = 'patrol';
      g.detection = 0;
      g.lastSeen = null;
      g.investigate = null;
      g.loseSightTimer = 0;
    }
    for (const c of state.cameras) c.meter = 0;
    if (state.strikes >= RULES.strikesMax) {
      state.over = true;
      state.won = false;
      state.grade = null;
      setMessage('TERTANGKAP! Tiga kali ketahuan — misi gagal.');
      return EVENT_CAUGHT | EVENT_LOSE;
    }
    setMessage(`KETAHUAN! (${state.strikes}/3) — kau diseret kembali ke ${comp === 'A' ? 'gerbong belakang' : comp === 'B' ? 'gerbong tengah' : 'gerbong depan'}.`);
    return EVENT_CAUGHT;
  }

  function computeGrade() {
    for (const g of GRADES) {
      if (state.time <= g.maxTime && state.strikes <= g.maxStrikes) return g.grade;
    }
    return 'C';
  }

  // Satu langkah 1/60 detik. input: {mx, mz, sneak, interact, decoy} (tepi).
  // attract: bila true, dunia berjalan sebagai latar judul (penjaga patroli saja).
  function step(dt, input, attract) {
    let events = EVENT_NONE;
    state.time += dt;
    state.tunnel = tunnelState(state.time);
    if (state.messageTimer > 0) state.messageTimer -= dt;
    if (state.player.invulnerable > 0) state.player.invulnerable -= dt;

    for (const d of state.doors) updateDoor(d, dt, RULES.doorOpenSeconds);
    syncDoorStates(state);
    const solidsList = solids();

    if (!attract && !state.over) {
      const p = state.player;
      p.sneak = !!input.sneak;
      const speed = p.sneak ? PLAYER.sneakSpeed : PLAYER.speed;
      const mx = input.mx || 0;
      const mz = input.mz || 0;
      p.moving = mx !== 0 || mz !== 0;
      if (p.moving) {
        p.angle = Math.atan2(mz, mx);
        movePlayer(mx * speed, mz * speed, dt);
      }
      if (input.interact) events |= tryInteract();
      if (input.decoy) events |= tryDecoy();
      if (state.decoyActive) {
        state.decoyActive.timer -= dt;
        if (state.decoyActive.timer <= 0) state.decoyActive = null;
      }
      // Channel membobol peti: maju selama pemain diam di dekat peti.
      if (state.channel) {
        const loot = state.loot.find((l) => l.id === state.channel.lootId);
        const d = loot ? Math.hypot(loot.x - state.player.x, loot.z - state.player.z) : Infinity;
        if (!loot || loot.taken || d > RULES.interactRange + 0.2) {
          state.channel = null;
        } else {
          state.channel.t += dt;
          if (state.channel.t >= RULES.lootChannelSeconds) {
            loot.taken = true;
            state.lootCount += 1;
            state.channel = null;
            setMessage(`${loot.name} direbut! (${state.lootCount}/3)`);
            events |= EVENT_LOOT;
          }
        }
      }
    }

    // Penjaga & CCTV selalu berjalan (juga di latar judul).
    const worldView = {
      player: state.player,
      tunnel: state.tunnel,
      doorStates: state.doorStates,
      solids: solidsList,
      playerHidden: state.playerHidden,
    };
    for (const g of state.guards) {
      g.justAlerted = false;
      g.justSuspicious = false;
      updateGuard(g, dt, worldView);
      if (g.state === GUARD_ALERT) state.anyAlertSeen = true;
    }
    for (const c of state.cameras) {
      c.justTriggered = false;
      updateCamera(c, dt, worldView);
      if (c.justTriggered) {
        state.alarm = Math.min(ALARM.fullAt, state.alarm + 30);
        for (const g of state.guards) {
          if (g.state === 'patrol') {
            g.state = 'suspicious';
            g.lastSeen = { x: state.player.x, z: state.player.z };
            g.suspiciousTimer = 0;
          }
        }
        setMessage('CCTV menangkapmu! Alarm melonjak — penjaga curiga!');
      }
    }

    if (!attract && !state.over) {
      // Meter alarm: naik saat terlihat, surut saat sembunyi.
      const anyGuardSees = state.guards.some((g) => g.seesPlayer);
      const anyCamSees = state.cameras.some((c) => c.seesPlayer);
      if (anyGuardSees || anyCamSees) {
        let rate = 0;
        if (anyGuardSees) rate += ALARM.riseGuardPerSecond;
        if (anyCamSees) rate += ALARM.riseCameraPerSecond;
        state.alarm = Math.min(ALARM.fullAt, state.alarm + rate * dt);
      } else {
        let decay = ALARM.decayPerSecond;
        if (state.tunnel.inTunnel) decay *= ALARM.decayTunnelFactor;
        state.alarm = Math.max(0, state.alarm - decay * dt);
      }
      state.maxAlarmSeen = Math.max(state.maxAlarmSeen, state.alarm);

      // Alarm penuh: semua penjaga menyerbu ke posisi pemain.
      if (state.alarm >= ALARM.fullAt && state.alarmFullTimer <= 0) {
        state.alarmFullTimer = ALARM.fullHoldSeconds;
        for (const g of state.guards) {
          g.state = GUARD_ALERT;
          g.lastSeen = { x: state.player.x, z: state.player.z };
          g.loseSightTimer = 0;
        }
        setMessage('ALARM BERBUNYI — semua penjaga mengejarmu!');
        events |= EVENT_ALARM_FULL;
      }
      if (state.alarmFullTimer > 0) {
        state.alarmFullTimer -= dt;
        if (state.alarmFullTimer <= 0) state.alarm = ALARM.afterFull;
      }

      // Ketahuan: penjaga alert menyentuh pemain.
      if (state.player.invulnerable <= 0) {
        for (const g of state.guards) {
          if (g.state === GUARD_ALERT) {
            const d = Math.hypot(g.x - state.player.x, g.z - state.player.z);
            if (d < RULES.catchRange + g.radius) {
              events |= onCaught();
              break;
            }
          }
        }
      }

      // Menang: 3/3 peti + mencapai EXIT (pintu lokomotif).
      if (!state.over && state.lootCount >= RULES.lootTotal) {
        const d = Math.hypot(LEVEL.exit.x - state.player.x, LEVEL.exit.z - state.player.z);
        if (d < 1.6) {
          state.over = true;
          state.won = true;
          state.grade = computeGrade();
          setMessage(`KABUR! Grade ${state.grade} — tiga peti emas dibawa pulang.`);
          events |= EVENT_WIN;
        }
      }
    }
    return events;
  }
}
